// Text primitives of the tt++ interpreter (ADR 0015 "Two parsers, one
// language"; spec §3): command splitting, argument parsing, `%N` argument
// substitution, `$var` / `&var` substitution and escapes.
//
// Rules (see ADR 0015, P2 notes):
// - A command list splits at `;` outside braces. A backslash protects the
//   next character (`\;`, `\{`, `\}`), and the backslash stays in the text
//   until the text is used (sent, shown), so nested levels still see it.
// - Newlines never split: inside a body they are whitespace, and a
//   profile's top-level commands come one per node from the document model.
// - `%0`–`%99` are replaced in a body before it is split, as tt++ does. A
//   run of n > 1 `%` before digits loses one `%` and is not replaced:
//   `%%1` becomes `%1` (one level later), `%%%1` becomes `%%1`. A `%` that
//   is not followed by a digit is left alone (`%d`, `%U`, `%%U`).
// - `$name`, `${name}` are replaced by the variable's value; an unknown
//   variable stays as written. `&name`, `&{name}` become `1` for a defined
//   variable and stay as written otherwise (the #if evaluator reads a
//   leftover `&name` as 0). `$$name` becomes `$name` without substituting.

/** Splits a command list at top-level `;`. Parts are trimmed; empty parts are dropped. */
export function splitCommands(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c /* \ */) {
      i++;
    } else if (c === 0x7b /* { */) {
      depth++;
    } else if (c === 0x7d /* } */) {
      if (depth > 0) depth--;
    } else if (c === 0x3b /* ; */ && depth === 0) {
      const part = text.slice(start, i).trim();
      if (part) out.push(part);
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last) out.push(last);
  return out;
}

function isWs(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

/** Index of the `}` matching the `{` at `open`, or -1. Honours `\` escapes. */
export function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c) i++;
    else if (c === 0x7b) depth++;
    else if (c === 0x7d && --depth === 0) return i;
  }
  return -1;
}

/** A cursor over a command's argument text. */
export class ArgReader {
  pos = 0;
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }

  private skipWs(): void {
    const t = this.text;
    while (this.pos < t.length && isWs(t.charCodeAt(this.pos))) this.pos++;
  }

  /** True when only whitespace is left. */
  get done(): boolean {
    this.skipWs();
    return this.pos >= this.text.length;
  }

  /**
   * The next argument: the contents of `{…}` (outer braces removed), or
   * else one word (`one`) or the rest of the text, trimmed (`all`).
   * Returns '' at the end.
   */
  next(mode: 'one' | 'all' = 'one'): string {
    this.skipWs();
    const t = this.text;
    if (this.pos >= t.length) return '';
    if (t.charCodeAt(this.pos) === 0x7b) {
      const end = matchBrace(t, this.pos);
      if (end < 0) {
        const s = t.slice(this.pos + 1);
        this.pos = t.length;
        return s;
      }
      const s = t.slice(this.pos + 1, end);
      this.pos = end + 1;
      return s;
    }
    if (mode === 'all') {
      const s = t.slice(this.pos).trim();
      this.pos = t.length;
      return s;
    }
    const start = this.pos;
    while (this.pos < t.length) {
      const c = t.charCodeAt(this.pos);
      if (isWs(c)) break;
      if (c === 0x5c) this.pos++;
      this.pos++;
    }
    return t.slice(start, Math.min(this.pos, t.length));
  }

  /** Whether the next argument (if any) is braced. */
  get nextIsBraced(): boolean {
    this.skipWs();
    return this.text.charCodeAt(this.pos) === 0x7b;
  }

  /** The unread rest, trimmed. */
  rest(): string {
    const s = this.text.slice(this.pos).trim();
    this.pos = this.text.length;
    return s;
  }
}

/**
 * Splits alias arguments into words the way tt++ does for `%1`…: words are
 * separated by whitespace, and a `{…}` group is one word without its braces.
 */
export function splitWords(text: string): string[] {
  const r = new ArgReader(text);
  const out: string[] = [];
  while (!r.done) out.push(r.next('one'));
  return out;
}

/**
 * Replaces `%0`–`%99` with `args[n]` (missing → ''). `%%n` loses one `%`.
 * Returns `body` itself when nothing was replaced or unescaped.
 */
export function expandArgs(body: string, args: readonly string[]): string {
  if (body.indexOf('%') < 0) return body;
  let out = '';
  let last = 0;
  const n = body.length;
  for (let i = 0; i < n; i++) {
    const c = body.charCodeAt(i);
    if (c === 0x5c) {
      i++;
      continue;
    }
    if (c !== 0x25 /* % */) continue;
    let j = i;
    while (j < n && body.charCodeAt(j) === 0x25) j++;
    const d0 = body.charCodeAt(j);
    if (!(d0 >= 48 && d0 <= 57)) {
      i = j - 1;
      continue;
    }
    let k = j + 1;
    const d1 = body.charCodeAt(k);
    if (d1 >= 48 && d1 <= 57) k++;
    const pcts = j - i;
    out += body.slice(last, i);
    if (pcts === 1) out += args[Number(body.slice(j, k))] ?? '';
    else out += body.slice(i + 1, k);
    last = k;
    i = k - 1;
  }
  if (last === 0) return body;
  return out + body.slice(last);
}

function isNameChar(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

/** Looks a variable up; undefined when it does not exist. */
export type VarLookup = (name: string) => string | undefined;

/**
 * Replaces `$name`, `${name}`, `&name`, `&{name}` (see the file header).
 * Returns `text` itself when there is nothing to replace.
 */
export function expandVars(text: string, lookup: VarLookup): string {
  if (text.indexOf('$') < 0 && text.indexOf('&') < 0) return text;
  let out = '';
  let last = 0;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c) {
      i++;
      continue;
    }
    if (c !== 0x24 /* $ */ && c !== 0x26 /* & */) continue;
    let j = i;
    while (j < n && text.charCodeAt(j) === c) j++;
    let nameStart: number;
    let nameEnd: number;
    let end: number;
    if (text.charCodeAt(j) === 0x7b) {
      const close = text.indexOf('}', j);
      if (close < 0) {
        i = j - 1;
        continue;
      }
      nameStart = j + 1;
      nameEnd = close;
      end = close + 1;
    } else {
      let k = j;
      while (k < n && isNameChar(text.charCodeAt(k))) k++;
      nameStart = j;
      nameEnd = k;
      end = k;
    }
    if (nameEnd === nameStart) {
      i = j - 1;
      continue;
    }
    const run = j - i;
    if (run > 1) {
      out += text.slice(last, i) + text.slice(i + 1, end);
      last = end;
      i = end - 1;
      continue;
    }
    const v = lookup(text.slice(nameStart, nameEnd));
    if (v === undefined) {
      i = end - 1;
      continue;
    }
    out += text.slice(last, i) + (c === 0x24 ? v : '1');
    last = end;
    i = end - 1;
  }
  if (last === 0) return text;
  return out + text.slice(last);
}

/**
 * The inverse of `expandVars` for text that must survive one expansion
 * unchanged: every run of `$` or `&` in front of a name or `{name}` gets
 * one more character (`$hp` → `$$hp`), which `expandVars` takes off again
 * without substituting. Returns `text` itself when there is nothing to do.
 */
export function escapeVars(text: string): string {
  if (text.indexOf('$') < 0 && text.indexOf('&') < 0) return text;
  let out = '';
  let last = 0;
  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x5c) {
      i++;
      continue;
    }
    if (c !== 0x24 && c !== 0x26) continue;
    let j = i;
    while (j < n && text.charCodeAt(j) === c) j++;
    let named: boolean;
    let end = j;
    if (text.charCodeAt(j) === 0x7b) {
      const close = text.indexOf('}', j);
      named = close > j + 1;
      if (named) end = close + 1;
    } else {
      while (end < n && isNameChar(text.charCodeAt(end))) end++;
      named = end > j;
    }
    if (named) {
      out += text.slice(last, i) + text[i];
      last = i;
    }
    i = end - 1;
  }
  if (last === 0 && out === '') return text;
  return out + text.slice(last);
}

/** Characters a backslash makes literal (the backslash is removed). */
const ESCAPABLE = new Set([0x5c, 0x3b, 0x7b, 0x7d, 0x24, 0x25, 0x26]);

/**
 * Removes escapes when text is used: `\\ \; \{ \} \$ \% \&` become the
 * character. Other backslashes stay. Newlines with the whitespace around
 * them become one space (a body written over several lines).
 */
export function finishText(text: string): string {
  let s = text;
  if (s.indexOf('\n') >= 0 || s.indexOf('\r') >= 0) s = s.replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').trim();
  if (s.indexOf('\\') < 0) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x5c && i + 1 < s.length && ESCAPABLE.has(s.charCodeAt(i + 1))) {
      out += s[i + 1];
      i++;
    } else {
      out += s[i];
    }
  }
  return out;
}

/** Simple glob: `*` matches any run of characters; everything else is literal. Whole-string match. */
export function globToRegExp(glob: string, flags = ''): RegExp {
  const src = glob
    .split('*')
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\S]*');
  return new RegExp('^' + src + '$', flags);
}
