// Line layer (spec §1.2 layer 3): turns decoded telnet text into `Line`s.
//
// Input comes from the telnet layer as arbitrarily chunked text plus GA
// markers. Output goes to the bus as `text.line` (one per completed line or
// prompt) and `text.partial` (the pending unterminated tail).
//
// One pass over each chunk. Plain characters are never copied one by one:
// they are appended as `slice` ranges between special characters (LF, CR,
// ESC, `<`, `&` in XML mode, other C0 controls). Escape sequences, tags and
// entities that are cut by a chunk boundary are carried over and re-parsed
// from their start when the next chunk arrives; each such construct has a
// length cap, so the carry stays small.
//
// XML (ADR 0003, notes/research/mume-xml.md):
// - Before XML mode is known to be on, only a few structural MUME tags are
//   recognised (`<xml>`, `<prompt>`, `<room>`, `<movement>`); everything
//   else starting with `<` is literal text (`<wielded>`, `<E> Name` in
//   `who`, `*<* R>` prompts). Entities are not decoded in this state.
// - Once XML mode is on (first recognised tag), MUME escapes `<`, `>` and
//   `&`, so any syntactically valid tag is a tag and entities are decoded.
// - `</xml>` turns XML mode off again (the user ran `change xml off`).

import type { Bus } from '../../src/core/bus';
import type { Color, Line, StyleRun, XmlSpan } from '../../src/core/types';
import { rgb } from '../../src/core/types';

/** Same shape as `TextSink` in src/net/textsink.ts. */
export interface LineAssemblerInput {
  text(s: string, ts: number): void;
  ga(ts: number): void;
}

const BOLD = 1;
const ITALIC = 2;
const UNDERLINE = 4;
const BLINK = 8;
const INVERSE = 16;

/** Longest tag we accept, from `<` to `>` inclusive. */
const MAX_TAG = 256;
/** Longest CSI / two-char escape sequence before it is treated as garbage. */
const MAX_CSI = 64;
/** Longest OSC / string sequence before it is dropped. */
const MAX_OSC = 512;
/** Longest entity, from `&` to `;` inclusive (`&#x10FFFF;` is 10). */
const MAX_ENTITY = 12;

/** Tags that switch XML mode on when seen before XML mode is known. */
const STRICT_TAGS: ReadonlySet<string> = new Set(['xml', 'prompt', 'room', 'movement']);

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', String.fromCharCode(0xa0)],
]);

const INCOMPLETE = -1;
const LITERAL = -2;

interface OpenElement {
  /** The span for this element on the current line (end = -1 while open). */
  span: XmlSpan;
  /** True when `span` continues the element from an earlier line. */
  cont: boolean;
}

function isNameStart(c: number): boolean {
  return (c >= 97 && c <= 122) || (c >= 65 && c <= 90);
}

function isNameChar(c: number): boolean {
  return (
    (c >= 97 && c <= 122) ||
    (c >= 65 && c <= 90) ||
    (c >= 48 && c <= 57) ||
    c === 95 || // _
    c === 45 || // -
    c === 46 || // .
    c === 58 // :
  );
}

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13 || c === 12;
}

export class LineAssembler implements LineAssemblerInput {
  private readonly bus: Bus;

  // --- current line -------------------------------------------------------
  private lineText = '';
  private lineRaw = '';
  private textLen = 0;
  private runs: StyleRun[] = [];
  private tags: XmlSpan[] = [];
  private linePrompt = false;
  /** Open XML elements, outermost first. */
  private stack: OpenElement[] = [];
  /** Text length last sent as `text.partial` (0 = none shown). */
  private partialLen = 0;
  /** Unfinished construct from the end of the previous chunk. */
  private carry = '';

  // --- SGR state (persists across lines) ----------------------------------
  private fg: Color = -1;
  private bg: Color = -1;
  private flags = 0;
  // Style of the last run in `runs`, for merging.
  private runFg: Color = -1;
  private runBg: Color = -1;
  private runFlags = 0;
  private readonly params: number[] = [];

  // --- XML state ----------------------------------------------------------
  private xmlMode = false;
  private xmlSeen = false;

  // --- scratch outputs of the sub-parsers ---------------------------------
  private escSgr = false;
  private tagName = '';
  private tagClosing = false;
  private tagSelfClosing = false;
  private tagAttrs: Record<string, string> | undefined = undefined;
  private entity = '';

  constructor(bus: Bus) {
    this.bus = bus;
  }

  /** True once a MUME XML tag has been seen and `</xml>` has not followed. */
  get xmlOn(): boolean {
    return this.xmlMode;
  }

  /** Clears all state, e.g. on reconnect. Clears a shown partial. */
  reset(): void {
    const hadPartial = this.partialLen > 0;
    this.lineText = '';
    this.lineRaw = '';
    this.textLen = 0;
    this.runs = [];
    this.tags = [];
    this.linePrompt = false;
    this.stack = [];
    this.partialLen = 0;
    this.carry = '';
    this.fg = -1;
    this.bg = -1;
    this.flags = 0;
    this.xmlMode = false;
    this.xmlSeen = false;
    if (hadPartial) {
      this.bus.emit('text.partial', {
        text: '',
        runs: [],
        tags: [],
        prompt: false,
        raw: '',
        ts: 0,
      });
    }
  }

  text(s: string, ts: number): void {
    if (this.carry) {
      s = this.carry + s;
      this.carry = '';
    }
    this.process(s, ts, false);
    if (this.textLen > 0 && this.textLen !== this.partialLen) {
      this.partialLen = this.textLen;
      this.bus.emit('text.partial', this.snapshot(ts, false));
    }
  }

  ga(ts: number): void {
    if (this.carry) {
      const c = this.carry;
      this.carry = '';
      this.process(c, ts, true);
    }
    if (this.textLen > 0) {
      this.endLine(ts, true);
      return;
    }
    // Nothing to show. Drop closed empty spans so a stray `<prompt></prompt>`
    // does not mark the next line; open elements carry on.
    if (this.tags.length) {
      const keep: XmlSpan[] = [];
      for (const t of this.tags) if (t.end < 0) keep.push(t);
      this.tags = keep;
      this.linePrompt = keep.some((t) => t.tag === 'prompt');
    }
  }

  // -------------------------------------------------------------------------

  // Raw is appended lazily (`rf`: start of the raw not yet appended): the
  // input between dropped constructs goes in as one slice, so a line that
  // sits in one chunk with only SGR codes (MUME's ANSI output) gets its raw
  // as a single slice instead of a concatenation of every piece and code.
  private process(s: string, ts: number, final: boolean): void {
    const n = s.length;
    let i = 0;
    let seg = 0;
    let rf = 0;
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c >= 32) {
        if (c === 60) {
          // '<'
          const end = this.parseTag(s, i, final);
          if (end === LITERAL) {
            i++;
            continue;
          }
          if (i > seg) this.add(s.slice(seg, i));
          if (i > rf) this.lineRaw += s.slice(rf, i);
          if (end === INCOMPLETE) {
            this.carry = s.slice(i);
            return;
          }
          this.handleTag();
          i = seg = rf = end;
          continue;
        }
        if (c === 38 && this.xmlMode) {
          // '&'
          const end = this.parseEntity(s, i, final);
          if (end === LITERAL) {
            i++;
            continue;
          }
          if (i > seg) this.add(s.slice(seg, i));
          if (i > rf) this.lineRaw += s.slice(rf, i);
          if (end === INCOMPLETE) {
            this.carry = s.slice(i);
            return;
          }
          this.add(this.entity);
          this.lineRaw += this.entity;
          i = seg = rf = end;
          continue;
        }
        if (c === 127) {
          if (i > seg) this.add(s.slice(seg, i));
          if (i > rf) this.lineRaw += s.slice(rf, i);
          i = seg = rf = i + 1;
          continue;
        }
        i++;
        continue;
      }
      if (c === 9) {
        i++;
        continue;
      }
      if (i > seg) this.add(s.slice(seg, i));
      if (c === 10) {
        if (i > rf) this.lineRaw += s.slice(rf, i);
        this.endLine(ts, false);
        i = seg = rf = i + 1;
      } else if (c === 27) {
        const end = this.parseEsc(s, i);
        if (end === INCOMPLETE) {
          if (i > rf) this.lineRaw += s.slice(rf, i);
          if (!final) {
            this.carry = s.slice(i);
            return;
          }
          i = seg = rf = n; // drop an unfinished sequence at a prompt boundary
          continue;
        }
        if (this.escSgr) {
          // An SGR stays in raw: `rf` does not move.
          this.applySgr(s, i + 2, end - 1);
        } else {
          if (i > rf) this.lineRaw += s.slice(rf, i);
          rf = end;
        }
        i = seg = end;
      } else {
        // CR and other C0 controls are dropped.
        if (i > rf) this.lineRaw += s.slice(rf, i);
        i = seg = rf = i + 1;
      }
    }
    if (i > seg) this.add(s.slice(seg, i));
    if (i > rf) this.lineRaw += s.slice(rf, i);
  }

  /** Appends plain text in the current style to text (raw is appended by `process`). */
  private add(piece: string): void {
    const len = piece.length;
    if (len === 0) return;
    this.lineText += piece;
    const start = this.textLen;
    const end = start + len;
    this.textLen = end;
    const fg = this.fg;
    const bg = this.bg;
    const flags = this.flags;
    if (fg < 0 && bg < 0 && flags === 0) return;
    const runs = this.runs;
    const last = runs.length ? runs[runs.length - 1]! : undefined;
    if (
      last !== undefined &&
      last.end === start &&
      this.runFg === fg &&
      this.runBg === bg &&
      this.runFlags === flags
    ) {
      last.end = end;
      return;
    }
    const run: StyleRun = { start, end };
    if (fg >= 0) run.fg = fg;
    if (bg >= 0) run.bg = bg;
    if (flags !== 0) {
      if (flags & BOLD) run.bold = true;
      if (flags & ITALIC) run.italic = true;
      if (flags & UNDERLINE) run.underline = true;
      if (flags & INVERSE) run.inverse = true;
      if (flags & BLINK) run.blink = true;
    }
    runs.push(run);
    this.runFg = fg;
    this.runBg = bg;
    this.runFlags = flags;
  }

  private endLine(ts: number, ga: boolean): void {
    const stack = this.stack;
    const textLen = this.textLen;
    for (let k = 0; k < stack.length; k++) stack[k]!.span.end = textLen;
    const line: Line = {
      text: this.lineText,
      runs: this.runs,
      tags: this.tags,
      prompt: ga || this.linePrompt,
      raw: this.lineRaw,
      ts,
    };
    this.lineText = '';
    this.lineRaw = '';
    this.textLen = 0;
    this.runs = [];
    this.partialLen = 0;
    this.linePrompt = false;
    if (stack.length) {
      const tags: XmlSpan[] = [];
      for (let k = 0; k < stack.length; k++) {
        const old = stack[k]!.span;
        const span: XmlSpan = { tag: old.tag, start: 0, end: -1 };
        if (old.attrs) span.attrs = old.attrs;
        if (span.tag === 'prompt') this.linePrompt = true;
        tags.push(span);
        stack[k] = { span, cont: true };
      }
      this.tags = tags;
    } else {
      this.tags = [];
    }
    this.bus.emit('text.line', line);
  }

  /** A copy of the pending tail as a `Line` (for `text.partial`). */
  private snapshot(ts: number, prompt: boolean): Line {
    const textLen = this.textLen;
    const runs: StyleRun[] = [];
    for (const r of this.runs) runs.push({ ...r });
    const tags: XmlSpan[] = [];
    for (const t of this.tags) tags.push({ ...t, end: t.end < 0 ? textLen : t.end });
    return {
      text: this.lineText,
      runs,
      tags,
      prompt: prompt || this.linePrompt,
      raw: this.lineRaw,
      ts,
    };
  }

  // --- ANSI -----------------------------------------------------------------

  /**
   * Parses the escape sequence at `s[i] === ESC`. Returns the index after it
   * or INCOMPLETE. Sets `escSgr` when it is a plain SGR (`ESC [ ... m`).
   * Malformed sequences end at the offending character, which is then
   * handled as ordinary input.
   */
  private parseEsc(s: string, i: number): number {
    const n = s.length;
    this.escSgr = false;
    if (i + 1 >= n) return INCOMPLETE;
    const c1 = s.charCodeAt(i + 1);
    if (c1 === 91) {
      // CSI: params 0x30–0x3F, intermediates 0x20–0x2F, final 0x40–0x7E
      let j = i + 2;
      let plain = true;
      const lim = Math.min(n, i + MAX_CSI);
      while (j < lim) {
        const c = s.charCodeAt(j);
        if (c >= 0x30 && c <= 0x3f) {
          if (c > 0x3b) plain = false; // < = > ?
          j++;
        } else break;
      }
      while (j < lim) {
        const c = s.charCodeAt(j);
        if (c >= 0x20 && c <= 0x2f) {
          plain = false;
          j++;
        } else break;
      }
      if (j >= lim) return j >= n && j - i < MAX_CSI ? INCOMPLETE : j;
      const f = s.charCodeAt(j);
      if (f >= 0x40 && f <= 0x7e) {
        this.escSgr = plain && f === 109; // 'm'
        return j + 1;
      }
      return j; // malformed: strip what we have, keep the odd character
    }
    if (c1 === 93 || c1 === 80 || c1 === 88 || c1 === 94 || c1 === 95) {
      // OSC, DCS, SOS, PM, APC: string ending in BEL or ESC \
      const lim = Math.min(n, i + MAX_OSC);
      for (let j = i + 2; j < lim; j++) {
        const c = s.charCodeAt(j);
        if (c === 7) return j + 1;
        if (c === 27) {
          if (j + 1 >= n) return INCOMPLETE;
          return s.charCodeAt(j + 1) === 92 ? j + 2 : j;
        }
      }
      return lim >= n && lim - i < MAX_OSC ? INCOMPLETE : lim;
    }
    // nF (intermediates then final) or a two-character sequence.
    let j = i + 1;
    while (j < n && j - i < MAX_CSI) {
      const c = s.charCodeAt(j);
      if (c >= 0x20 && c <= 0x2f) j++;
      else break;
    }
    if (j >= n) return j - i < MAX_CSI ? INCOMPLETE : j;
    const f = s.charCodeAt(j);
    return f >= 0x30 && f <= 0x7e ? j + 1 : j;
  }

  /** Applies SGR parameters in `s[a, b)`. */
  private applySgr(s: string, a: number, b: number): void {
    // `params` keeps its capacity: `length = 0` would drop the backing
    // store and every SGR would allocate a new one.
    const p = this.params;
    let n = 0;
    let v = 0;
    for (let j = a; j < b; j++) {
      const c = s.charCodeAt(j);
      if (c >= 48 && c <= 57) v = v * 10 + (c - 48);
      else {
        p[n++] = v;
        v = 0;
      }
    }
    p[n++] = v;
    for (let k = 0; k < n; k++) {
      const x = p[k]!;
      if (x === 0) {
        this.fg = -1;
        this.bg = -1;
        this.flags = 0;
      } else if (x >= 30 && x <= 37) this.fg = x - 30;
      else if (x >= 90 && x <= 97) this.fg = x - 90 + 8;
      else if (x >= 40 && x <= 47) this.bg = x - 40;
      else if (x >= 100 && x <= 107) this.bg = x - 100 + 8;
      else if (x === 39) this.fg = -1;
      else if (x === 49) this.bg = -1;
      else if (x === 38 || x === 48) {
        let col = -1;
        const mode = k + 1 < n ? p[k + 1]! : -1;
        if (mode === 5 && k + 2 < n) {
          col = p[k + 2]! & 0xff;
          k += 2;
        } else if (mode === 2 && k + 4 < n) {
          col = rgb(p[k + 2]!, p[k + 3]!, p[k + 4]!);
          k += 4;
        } else {
          k = n; // malformed: ignore the rest
        }
        if (col >= 0) {
          if (x === 38) this.fg = col;
          else this.bg = col;
        }
      } else if (x === 1) this.flags |= BOLD;
      else if (x === 22) this.flags &= ~BOLD;
      else if (x === 3) this.flags |= ITALIC;
      else if (x === 23) this.flags &= ~ITALIC;
      else if (x === 4) this.flags |= UNDERLINE;
      else if (x === 24) this.flags &= ~UNDERLINE;
      else if (x === 5 || x === 6) this.flags |= BLINK;
      else if (x === 25) this.flags &= ~BLINK;
      else if (x === 7) this.flags |= INVERSE;
      else if (x === 27) this.flags &= ~INVERSE;
    }
  }

  // --- XML ------------------------------------------------------------------

  /**
   * Parses a tag at `s[i] === '<'`. Returns the index after `>`, LITERAL when
   * this `<` is text, or INCOMPLETE when more input is needed. On success
   * fills `tagName`, `tagClosing`, `tagSelfClosing`, `tagAttrs`.
   */
  private parseTag(s: string, i: number, final: boolean): number {
    const n = s.length;
    let j = i + 1;
    if (j >= n) return final ? LITERAL : INCOMPLETE;
    let closing = false;
    if (s.charCodeAt(j) === 47) {
      closing = true;
      j++;
      if (j >= n) return final ? LITERAL : INCOMPLETE;
    }
    if (!isNameStart(s.charCodeAt(j))) return LITERAL;
    const nameStart = j;
    while (j < n && isNameChar(s.charCodeAt(j))) j++;
    if (j >= n) return final || j - i >= MAX_TAG ? LITERAL : INCOMPLETE;
    const after = s.charCodeAt(j);
    if (after !== 62 && after !== 47 && !isSpace(after)) return LITERAL;
    let name = s.slice(nameStart, j);
    if (!this.xmlMode) {
      name = name.toLowerCase();
      if (!STRICT_TAGS.has(name)) return LITERAL;
    }
    const gt = s.indexOf('>', j);
    if (gt < 0 || gt - i >= MAX_TAG) {
      if (gt < 0 && n - i < MAX_TAG && !final) return INCOMPLETE;
      return LITERAL;
    }
    let bodyEnd = gt;
    let selfClosing = false;
    if (s.charCodeAt(gt - 1) === 47 && gt - 1 >= j) {
      selfClosing = true;
      bodyEnd = gt - 1;
    }
    this.tagName = this.xmlMode ? name.toLowerCase() : name;
    this.tagClosing = closing;
    this.tagSelfClosing = selfClosing;
    this.tagAttrs = closing || bodyEnd <= j ? undefined : this.parseAttrs(s, j, bodyEnd);
    return gt + 1;
  }

  /** Parses `key=value` / `key="v"` / `key='v'` / `key` in `s[a, b)`. */
  private parseAttrs(s: string, a: number, b: number): Record<string, string> | undefined {
    let out: Record<string, string> | undefined;
    let j = a;
    while (j < b) {
      while (j < b && isSpace(s.charCodeAt(j))) j++;
      if (j >= b) break;
      const ks = j;
      while (j < b) {
        const c = s.charCodeAt(j);
        if (c === 61 || isSpace(c)) break;
        j++;
      }
      const key = s.slice(ks, j).toLowerCase();
      while (j < b && isSpace(s.charCodeAt(j))) j++;
      let value = '';
      if (j < b && s.charCodeAt(j) === 61) {
        j++;
        while (j < b && isSpace(s.charCodeAt(j))) j++;
        const q = j < b ? s.charCodeAt(j) : 0;
        if (q === 34 || q === 39) {
          const qe = s.indexOf(q === 34 ? '"' : "'", j + 1);
          const ve = qe < 0 || qe > b ? b : qe;
          value = s.slice(j + 1, ve);
          j = ve + 1;
        } else {
          const vs = j;
          while (j < b && !isSpace(s.charCodeAt(j))) j++;
          value = s.slice(vs, j);
        }
        if (value.indexOf('&') >= 0) value = this.decodeEntities(value);
      }
      if (key) (out ??= {})[key] = value;
    }
    return out;
  }

  private handleTag(): void {
    const name = this.tagName;
    if (!this.xmlMode) this.xmlMode = true;
    if (!this.xmlSeen) {
      this.xmlSeen = true;
      this.bus.emit('xml.seen', undefined);
    }
    if (name === 'xml') {
      if (this.tagClosing) {
        this.closeFrom(0);
        this.xmlMode = false;
      }
      return;
    }
    if (this.tagClosing) {
      const stack = this.stack;
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.span.tag === name) {
          this.closeFrom(k);
          return;
        }
      }
      return; // stray end tag
    }
    const span: XmlSpan = { tag: name, start: this.textLen, end: -1 };
    if (this.tagAttrs) span.attrs = this.tagAttrs;
    this.tags.push(span);
    if (name === 'prompt') this.linePrompt = true;
    if (this.tagSelfClosing) span.end = this.textLen;
    else this.stack.push({ span, cont: false });
  }

  /** Closes `stack[k..]` at the current position. */
  private closeFrom(k: number): void {
    const stack = this.stack;
    const pos = this.textLen;
    let removed = false;
    for (let m = stack.length - 1; m >= k; m--) {
      const e = stack[m]!;
      e.span.end = pos;
      if (e.cont && pos === 0) {
        // Closed at the very start of a continuation line: it never touched
        // this line, so it gets no span here.
        const idx = this.tags.lastIndexOf(e.span);
        if (idx >= 0) this.tags.splice(idx, 1);
        removed = true;
      }
    }
    stack.length = k;
    if (removed) this.linePrompt = this.tags.some((t) => t.tag === 'prompt');
  }

  /**
   * Parses an entity at `s[i] === '&'`. Returns the index after `;` with the
   * decoded text in `entity`, LITERAL, or INCOMPLETE.
   */
  private parseEntity(s: string, i: number, final: boolean): number {
    const n = s.length;
    const lim = Math.min(n, i + MAX_ENTITY);
    let j = i + 1;
    while (j < lim) {
      const c = s.charCodeAt(j);
      if (c === 59) break; // ';'
      if (!(isNameChar(c) || c === 35)) return LITERAL; // '#'
      j++;
    }
    if (j >= lim) return lim >= n && !final && n - i < MAX_ENTITY ? INCOMPLETE : LITERAL;
    const body = s.slice(i + 1, j);
    if (body.charCodeAt(0) === 35) {
      const hex = body.charCodeAt(1) === 120 || body.charCodeAt(1) === 88;
      const digits = body.slice(hex ? 2 : 1);
      if (!digits) return LITERAL;
      const cp = parseInt(digits, hex ? 16 : 10);
      if (!(cp >= 0 && cp <= 0x10ffff) || (cp >= 0xd800 && cp <= 0xdfff)) return LITERAL;
      this.entity = String.fromCodePoint(cp);
      return j + 1;
    }
    const v = NAMED_ENTITIES.get(body);
    if (v === undefined) return LITERAL;
    this.entity = v;
    return j + 1;
  }

  private decodeEntities(v: string): string {
    let out = '';
    let seg = 0;
    let i = v.indexOf('&');
    while (i >= 0) {
      const end = this.parseEntity(v, i, true);
      if (end >= 0) {
        out += v.slice(seg, i) + this.entity;
        seg = end;
        i = v.indexOf('&', end);
      } else {
        i = v.indexOf('&', i + 1);
      }
    }
    return out + v.slice(seg);
  }
}
