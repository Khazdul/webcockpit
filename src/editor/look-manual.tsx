// The lantern manual reader (stage 42, ADR 0127): one DOM reader for the
// profile manual (`helpSections()`, the profile editor's Help, 43) and the
// script manual (`scriptManualSections()`, 44). Package 42e owns this file
// (and look-manual.css, look-manual-find.ts). It lives in the lazy editor
// chunk with the manuals' content.
//
// The whole manual is one typeset page (the script manual A "Boken"):
// group dividers, Cinzel headings (code names in the terminal font), the
// syntax lines in a well, paragraphs, lists, Parameters / Returns, example
// notes and the examples in code wells (`.wc-code`, coloured by the host's
// `example` hook, e.g. `codeLine`). Sections are laid out lazily
// (`content-visibility: auto`); the current section follows the scroll
// through an IntersectionObserver over a 1 px band near the top (the spy
// never reads layout per scroll event).
//
// `contents: 'own'` draws the grouped, folding contents list at the left
// (an overlay under 700 px, opened with Contents, Tab or ←); `'none'`
// leaves it to the host (the profile editor's rail uses `ManualContents`).
// `find: 'head'` keeps the find field in the head (the script manual A);
// `'bar'` opens it with Ctrl+F (the profile Help).
//
// Keys (both hosts; the host's frame calls `ctl.key` first): ↑↓ scroll (or
// move through the contents when it has the keys), PgUp / PgDn, Space /
// Enter a page, Home / End, n / p next / previous heading, Tab switches
// contents ↔ text, Ctrl+F find (Enter / F3 / Ctrl+G next, Shift previous,
// Alt+C/W/R toggles), Esc: the contents overlay, then a non-empty find,
// then the host (`key` returns false). Letters fire only outside text
// fields.
//
// Matches are marked with the CSS Custom Highlight API (`::highlight(
// wc-lk-find)` and `wc-lk-find-now`, shared by every reader on the page),
// with `<mark class="wc-lk-mark">` drawn into the blocks where the API is
// missing.
//
// Hooks: `.wc-lk-manual`, `.wc-lk-mtoc li[data-i]` (`.is-on`),
// `.wc-lk-mtext section[data-i]` (blocks `[data-b]`), `.wc-lk-mfind
// input`, `.wc-search-count`, `[data-btn=contents|prev|next|close]`.

import { Component, type ComponentChildren, type RefObject, type VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Field, GlassButton, Seg } from '../chrome/kit/look-controls';
import { Icon } from '../chrome/kit/look-icons';
import type { NavKey } from '../chrome/kit/nav';
import type { HelpSection } from './help';
import { LOOK_CODE_CLASS } from './look-code';
import {
  type FindMemory,
  type ManualBlock,
  type SectionFindResult,
  type SectionMatch,
  findInSections,
  firstInSection,
  manualBlocks,
  matchesByBlock,
  sectionCountText,
} from './look-manual-find';
import { type LuaTokenClass, luaHighlightLine } from './lua-highlight';
import { EMPTY_QUERY, type FindQuery, TOGGLES, type Toggle, stepMatch } from './manual-search';
import { tokenizeLine } from './syntax';
import './look-manual.css';

export interface ManualCtl {
  goto(i: number): void;
  section(): number;
  /** Handles a key (true = consumed). */
  key(e: KeyboardEvent, nk: NavKey | null): boolean;
  /** Opens the find (the bar) and puts the focus in its field. */
  openFind(): void;
  /** True while the find is open: the bar shown (`bar`), or a query typed or the field focused (`head`). */
  findOpen(): boolean;
  /** Closes a non-empty find (true) or does nothing (false). */
  closeFind(): boolean;
}

export interface LookManualProps {
  sections: readonly HelpSection[];
  /** own: the contents list at the left (an overlay under 700 px). */
  contents: 'own' | 'none';
  /** head: always in the head (script manual A); bar: opened by Ctrl+F (profile Help). */
  find: 'head' | 'bar';
  /** Group id → label ("API reference"); default: the manuals' own names. */
  groups?: Readonly<Record<string, string>>;
  initial?: number;
  onSection?(i: number): void;
  ctl?(c: ManualCtl | null): void;
  /**
   * Draws one line of an example (its text unchanged; colours as spans),
   * e.g. `(l, lang) => codeLine(l, lang)`. Read when the sections render.
   */
  example?(line: string, lang: 'tt' | 'lua'): ComponentChildren;
  /**
   * A list item's leading name (`- name: …`) that links to a section (the
   * Lua index): the section, or null. Read when the sections render.
   */
  link?(text: string): number | null;
  /** The find query kept across opens. */
  memory?: FindMemory;
}

export interface ManualContentsProps {
  sections: readonly HelpSection[];
  groups?: Readonly<Record<string, string>>;
  current: number;
  onGo(i: number): void;
  /** Each group's number of sections beside its label. */
  counts?: boolean;
  /** The list has the keyboard: the current entry gets the fine tick. */
  active?: boolean;
}

/** The manuals' group names (help.ts's groups; `intro` has none). */
export const MANUAL_GROUPS: Readonly<Record<string, string>> = {
  basics: 'Basics',
  commands: 'Commands',
  guide: 'Guide',
  reference: 'API reference',
  lua: 'Lua reference',
};

/** Groups with more sections than this start folded (the current one's group is always open). */
const FOLD_OVER = 30;
/** px a ↑ / ↓ scrolls the text. */
const LINE_STEP = 44;
/** The contents list becomes an overlay at or under this width (px). */
const NARROW = 700;
/** Where the spy reads the current section: this many px below the text's top. */
const SPY_AT = 24;

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');
const clamp = (i: number, n: number): number => Math.max(0, Math.min(n - 1, i));
/** A heading that names code (`#action`, `send`, `string.format`) is set in the terminal font. */
const isCode = (heading: string): boolean => /^[#a-z_][\w.:#]*$/.test(heading);

// ------------------------------------------------------------ code lines

const LUA_CLASS: Record<LuaTokenClass, string> = {
  cmd: 'wc-lua-kw',
  var: 'wc-lua-str',
  code: 'wc-lua-num',
  delim: 'wc-lua-std',
  comment: 'wc-lua-comment',
  brace: '',
};

/**
 * One line of code as spans with the `.wc-code` token classes (tt++
 * `wc-syn-*`, Lua `wc-lua-*`), the text unchanged: the `example` hook of
 * the two manuals. `luaKnown` says which (dotted) names are API or
 * library names.
 */
export function codeLine(line: string, lang: 'tt' | 'lua', luaKnown?: (name: string) => boolean): ComponentChildren {
  const out: ComponentChildren[] = [];
  let at = 0;
  if (lang === 'lua') {
    for (const t of luaHighlightLine(line, luaKnown)) {
      if (t.from > at) out.push(line.slice(at, t.from));
      out.push(<span class={LUA_CLASS[t.cls]}>{line.slice(t.from, t.to)}</span>);
      at = t.to;
    }
  } else {
    for (const t of tokenizeLine(line)) {
      if (t.from > at) out.push(line.slice(at, t.from));
      out.push(
        t.hint ? (
          <span class={`wc-syn-${t.cls} wc-syn-inert`} title={`${t.hint} Kept as text.`}>
            {line.slice(t.from, t.to)}
          </span>
        ) : (
          <span class={`wc-syn-${t.cls}`}>{line.slice(t.from, t.to)}</span>
        ),
      );
      at = t.to;
    }
  }
  if (at < line.length) out.push(line.slice(at));
  return out;
}

// ------------------------------------------------------------ contents

interface ContentsGroup {
  id: string;
  label: string | null;
  items: number[];
}

function contentsGroups(sections: readonly HelpSection[], labels: Readonly<Record<string, string>>): ContentsGroup[] {
  const out: ContentsGroup[] = [];
  sections.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && last.id === s.group) last.items.push(i);
    else out.push({ id: s.group, label: labels[s.group] ?? null, items: [i] });
  });
  return out;
}

/** Scrolls `box` so that `el` is inside it (reads layout once). */
function keepInView(box: HTMLElement, el: HTMLElement): void {
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top < b.top) box.scrollTop -= b.top - r.top + 6;
  else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 6;
}

const FOLD = { draw: <path d="M4 6l4 4 4-4" />, box: 16 };

/** The grouped, folding contents list with counts and the current section lit. */
export function ManualContents(p: ManualContentsProps): VNode {
  const labels = p.groups ?? MANUAL_GROUPS;
  const list = useMemo(() => contentsGroups(p.sections, labels), [p.sections, labels]);
  const curGroup = list.findIndex((g) => g.items.includes(p.current));
  const [open, setOpen] = useState<ReadonlySet<number>>(
    () => new Set(list.flatMap((g, k) => (g.items.length <= FOLD_OVER || k === curGroup ? [k] : []))),
  );
  // The current section's group opens when the current section moves into it (the reader may fold it again).
  useLayoutEffect(() => {
    if (curGroup >= 0 && !open.has(curGroup)) setOpen(new Set(open).add(curGroup));
  }, [curGroup]);
  const box = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const li = box.current?.querySelector<HTMLElement>(`li[data-i="${p.current}"]`);
    if (box.current && li) keepInView(box.current, li);
  }, [p.current, open]);
  const toggle = (k: number): void => {
    const next = new Set(open);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setOpen(next);
  };
  return (
    <nav class={cx('wc-lk-mtoc wc-lk-scroll', p.active && 'is-zone')} ref={box} aria-label="Contents">
      {list.map((g, k) => (
        <div class="wc-lk-mtocg" key={`${g.id}-${k}`} data-g={g.id}>
          {g.label && (
            <button
              type="button"
              class="wc-lk-mgrp"
              tabIndex={-1}
              aria-expanded={open.has(k) ? 'true' : 'false'}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                toggle(k);
              }}
            >
              <Icon {...FOLD} />
              <span class="wc-lk-mgrp-t">{g.label}</span>
              {p.counts && <span class="wc-lk-mcount">{g.items.length}</span>}
            </button>
          )}
          {(!g.label || open.has(k)) && (
            <ul>
              {g.items.map((i) => (
                <li
                  key={i}
                  data-i={i}
                  class={cx(i === p.current && 'is-on', isCode(p.sections[i]!.heading) && 'is-code')}
                  aria-current={i === p.current ? 'true' : undefined}
                  onClick={() => p.onGo(i)}
                >
                  {p.sections[i]!.heading}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------ the text

/** Matches drawn as `<mark>`s (only where the Highlight API is missing). */
interface FallbackMarks {
  by: Map<number, Map<number, SectionMatch[]>>;
  now: SectionMatch | null;
}

interface TextProps {
  sections: readonly HelpSection[];
  groups: Readonly<Record<string, string>>;
  marks: FallbackMarks | null;
  textRef: RefObject<HTMLElement>;
  example?: LookManualProps['example'];
  link?: LookManualProps['link'];
  onLink(i: number): void;
}

function markPieces(text: string, ms: readonly SectionMatch[], now: SectionMatch | null): ComponentChildren {
  const out: ComponentChildren[] = [];
  let at = 0;
  for (const m of ms) {
    if (m.from > at) out.push(text.slice(at, m.from));
    out.push(<mark class={cx('wc-lk-mark', m === now && 'is-now')}>{text.slice(m.from, m.to)}</mark>);
    at = m.to;
  }
  if (at < text.length) out.push(text.slice(at));
  return out;
}

const PARAM = /^(\S+) \(([^)]*)\): ([\s\S]*)$/;
const LEAD_NAME = /^([A-Za-z_#][\w.:#]*):/;

/** The manual's sections. Renders only when the sections, the groups or the fallback marks change. */
class ManualText extends Component<TextProps> {
  override shouldComponentUpdate(n: TextProps): boolean {
    const p = this.props;
    return n.sections !== p.sections || n.groups !== p.groups || n.marks !== p.marks;
  }

  private body(s: HelpSection, i: number): VNode[] {
    const p = this.props;
    const blocks = manualBlocks(s);
    const marks = p.marks?.by.get(i);
    const now = p.marks?.now ?? null;
    const content = (k: number, b: ManualBlock): ComponentChildren => {
      const ms = marks?.get(k);
      if (ms) return markPieces(b.text, ms, now);
      if (b.kind === 'code') return p.example && b.text ? p.example(b.text, b.lang ?? 'tt') : b.text;
      if (b.kind === 'param') {
        const m = PARAM.exec(b.text);
        if (!m) return b.text;
        return [<span class="wc-lk-mpn">{m[1]}</span>, <span class="wc-lk-mpt">{` (${m[2]})`}</span>, `: ${m[3]}`];
      }
      if (b.kind === 'item' && p.link) {
        const m = LEAD_NAME.exec(b.text);
        const to = m ? p.link(m[1]!) : null;
        if (m && to !== null && to >= 0) {
          return [
            <a
              class="wc-lk-mlink"
              href={`#${m[1]}`}
              onClick={(e) => {
                e.preventDefault();
                p.onLink(to);
              }}
            >
              {m[1]}
            </a>,
            b.text.slice(m[1]!.length),
          ];
        }
      }
      return b.text;
    };
    const out: VNode[] = [];
    let k = 0;
    while (k < blocks.length) {
      const b = blocks[k]!;
      const run = (same: (x: ManualBlock) => boolean, draw: (x: ManualBlock, k: number) => VNode): VNode[] => {
        const els: VNode[] = [];
        while (k < blocks.length && same(blocks[k]!)) {
          els.push(draw(blocks[k]!, k));
          k++;
        }
        return els;
      };
      switch (b.kind) {
        case 'heading':
          out.push(
            <h3 class={cx('wc-lk-mh', isCode(b.text) && 'is-code')} data-b={k}>
              {content(k, b)}
            </h3>,
          );
          k++;
          break;
        case 'syntax':
          out.push(
            <div class="wc-lk-msyn">
              {run(
                (x) => x.kind === 'syntax',
                (x, j) => (
                  <span class="wc-lk-mline" data-b={j}>
                    {content(j, x)}
                  </span>
                ),
              )}
            </div>,
          );
          break;
        case 'item':
          out.push(
            <ul class="wc-lk-mlist">
              {run(
                (x) => x.kind === 'item',
                (x, j) => <li data-b={j}>{content(j, x)}</li>,
              )}
            </ul>,
          );
          break;
        case 'param':
          out.push(
            <div class="wc-lk-mparams">
              {run(
                (x) => x.kind === 'param',
                (x, j) => (
                  <div class="wc-lk-mparam" data-b={j}>
                    {content(j, x)}
                  </div>
                ),
              )}
            </div>,
          );
          break;
        case 'code': {
          const ex = b.ex;
          out.push(
            <pre class={cx('wc-lk-mcode', LOOK_CODE_CLASS)} data-lang={b.lang}>
              {run(
                (x) => x.kind === 'code' && x.ex === ex,
                (x, j) => (
                  <span class="wc-lk-mline" data-b={j}>
                    {content(j, x)}
                  </span>
                ),
              )}
            </pre>,
          );
          break;
        }
        case 'label':
          out.push(
            <div class="wc-lk-mlabel" data-b={k}>
              {content(k, b)}
            </div>,
          );
          k++;
          break;
        case 'note':
          out.push(
            <p class="wc-lk-mnote" data-b={k}>
              {content(k, b)}
            </p>,
          );
          k++;
          break;
        default:
          out.push(<p data-b={k}>{content(k, b)}</p>);
          k++;
      }
    }
    return out;
  }

  override render(): VNode {
    const p = this.props;
    const out: VNode[] = [];
    let group: string | null = null;
    p.sections.forEach((s, i) => {
      if (s.group !== group) {
        group = s.group;
        const label = p.groups[group];
        if (label) {
          out.push(
            <div class="wc-lk-mgroup" key={`g${i}`} aria-hidden="true">
              {label}
            </div>,
          );
        }
      }
      out.push(
        <section class="wc-lk-msec" key={i} data-i={i} aria-label={s.heading}>
          {this.body(s, i)}
        </section>,
      );
    });
    return (
      <article class="wc-lk-mtext wc-lk-scroll" ref={p.textRef} data-wc-native-mouse="">
        {out}
      </article>
    );
  }
}

// ------------------------------------------------------------ highlights

const HL_ALL = 'wc-lk-find';
const HL_NOW = 'wc-lk-find-now';

/** True when the CSS Custom Highlight API is there (else `<mark>`s are drawn). */
export function highlightApi(): boolean {
  return typeof CSS !== 'undefined' && !!(CSS as { highlights?: unknown }).highlights && typeof Highlight === 'function';
}

/** Every reader's ranges: the page has one highlight of each name for all of them. */
const owners = new Map<object, { all: Range[]; now: Range | null }>();

function paintHighlights(): void {
  if (!highlightApi()) return;
  const all: Range[] = [];
  const now: Range[] = [];
  for (const o of owners.values()) {
    all.push(...o.all);
    if (o.now) now.push(o.now);
  }
  if (all.length) CSS.highlights.set(HL_ALL, new Highlight(...all));
  else CSS.highlights.delete(HL_ALL);
  if (now.length) {
    const h = new Highlight(...now);
    h.priority = 1;
    CSS.highlights.set(HL_NOW, h);
  } else CSS.highlights.delete(HL_NOW);
}

/** The ranges of `spans` (offsets into `el`'s text) over `el`'s text nodes. */
function rangesIn(el: Element, spans: readonly SectionMatch[]): (Range | null)[] {
  const doc = el.ownerDocument;
  const nodes: Text[] = [];
  const starts: number[] = [];
  const walk = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let at = 0;
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    nodes.push(n as Text);
    starts.push(at);
    at += (n as Text).data.length;
  }
  const find = (off: number, end: boolean): [Text, number] | null => {
    for (let k = 0; k < nodes.length; k++) {
      const s = starts[k]!;
      const len = nodes[k]!.data.length;
      if (end ? off <= s + len : off < s + len) return [nodes[k]!, off - s];
    }
    return null;
  };
  const out: (Range | null)[] = [];
  for (const m of spans) {
    const a = find(m.from, false);
    const b = find(m.to, true);
    if (!a || !b) {
      out.push(null);
      continue;
    }
    const r = doc.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1]);
    out.push(r);
  }
  return out;
}

// ------------------------------------------------------------ the reader

interface FindState {
  query: FindQuery;
  result: SectionFindResult;
  /** The current match, -1 for none. */
  hit: number;
}

const NO_RESULT: SectionFindResult = { valid: true, matches: [], capped: false };

const OPTIONS = TOGGLES.map((t) => ({
  value: t.key,
  label: t.label,
  title: t.title,
  id: t.key === 'caseSensitive' ? 'case' : t.key === 'wholeWord' ? 'word' : 'regex',
}));

const inField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  return el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable === true;
};

/** The manual reader. */
export function LookManual(p: LookManualProps): VNode {
  const sections = p.sections;
  const n = sections.length;
  const groups = p.groups ?? MANUAL_GROUPS;
  const root = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const [cur, setCur] = useState(() => clamp(p.initial ?? 0, n));
  const [zone, setZone] = useState<'text' | 'toc'>('text');
  const [tocOpen, setTocOpen] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [find, setFind] = useState<FindState>(() => {
    const query = p.memory?.query ?? EMPTY_QUERY;
    return p.find === 'head' && query.search
      ? { query, result: findInSections(sections, query), hit: -1 }
      : { query, result: NO_RESULT, hit: -1 };
  });
  const shown = p.find === 'head' || barOpen;
  const own = p.contents === 'own';
  /** Set by a step or a new query: the current match is scrolled into view after the render. */
  const reveal = useRef(false);
  const focusField = useRef(false);
  const st = useRef({ cur, zone, tocOpen, barOpen, find, shown, own });
  st.current = { cur, zone, tocOpen, barOpen, find, shown, own };

  const secEl = (i: number): HTMLElement | null => text.current?.querySelector<HTMLElement>(`section[data-i="${i}"]`) ?? null;
  const narrow = (): boolean => (root.current?.clientWidth ?? Infinity) <= NARROW;

  const goto = (i: number): void => {
    const k = clamp(i, n);
    const t = text.current;
    const s = secEl(k);
    if (t && s) t.scrollTop = Math.max(0, s.offsetTop - 8);
    setCur(k);
  };

  const search = (query: FindQuery, from = st.current.cur): void => {
    if (p.memory) p.memory.query = query;
    const result = findInSections(sections, query);
    reveal.current = true;
    setFind({ query, result, hit: firstInSection(result.matches, from) });
  };

  const step = (dir: 1 | -1): void => {
    const f = st.current.find;
    if (!f.result.matches.length) return;
    reveal.current = true;
    setFind({ ...f, hit: stepMatch(f.hit, f.result.matches.length, dir) });
  };

  const toggle = (k: Toggle): void => {
    const q = st.current.find.query;
    search({ ...q, [k]: !q[k] });
  };

  const openFind = (): void => {
    if (p.find === 'bar' && !st.current.barOpen) {
      setBarOpen(true);
      const q = st.current.find.query;
      if (q.search) search(q);
    }
    focusField.current = true;
    if (input.current) {
      input.current.focus({ preventScroll: true });
      input.current.select();
      focusField.current = false;
    }
  };

  const blurField = (): void => {
    const el = input.current;
    if (el && el.ownerDocument.activeElement === el) el.blur();
  };

  /** Clears a typed query (head) or closes the bar; true when there was one. */
  const closeFind = (): boolean => {
    const s = st.current;
    if (p.find === 'bar') {
      if (!s.barOpen) return false;
      blurField();
      setBarOpen(false);
      setFind({ ...s.find, result: NO_RESULT, hit: -1 });
      return true;
    }
    if (!s.find.query.search) return false;
    search({ ...s.find.query, search: '' });
    return true;
  };

  const setZoneTo = (z: 'text' | 'toc'): void => {
    setZone(z);
    setTocOpen(z === 'toc' && narrow());
  };

  const page = (dir: 1 | -1): void => {
    const t = text.current;
    if (t) t.scrollTop += dir * Math.max(LINE_STEP, t.clientHeight - 60);
  };

  /** n / p: the next heading, or the current one's when the text is below it. */
  const heading = (dir: 1 | -1): void => {
    const c = st.current.cur;
    if (dir > 0) return goto(c + 1);
    const t = text.current;
    const s = secEl(c);
    if (t && s && t.scrollTop > s.offsetTop + 4) goto(c);
    else goto(c - 1);
  };

  const fieldKey = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (nk === 'back') {
      // Clear the query (or close the bar), and the text has the keys again.
      closeFind();
      blurField();
      return true;
    }
    if (e.key === 'Enter' && !e.altKey && !mod) {
      step(e.shiftKey ? -1 : 1);
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      blurField();
      setZoneTo('text');
      return true;
    }
    if (mod && !e.altKey && k === 'f') {
      input.current?.select();
      return true;
    }
    return false;
  };

  const key = (e: KeyboardEvent, nk: NavKey | null): boolean => {
    const s = st.current;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (e.isComposing) return false;
    // Find, wherever the focus is.
    if (mod && !e.altKey && !e.shiftKey && k === 'f') {
      openFind();
      return true;
    }
    if (e.key === 'F3' || (mod && !e.altKey && k === 'g')) {
      if (s.shown && s.find.query.search) step(e.shiftKey ? -1 : 1);
      else openFind();
      return true;
    }
    if (e.altKey && !mod && s.shown) {
      const t = TOGGLES.find((x) => x.hotkey === k);
      if (t) {
        toggle(t.key);
        return true;
      }
    }
    if (input.current && e.target === input.current) return fieldKey(e, nk);
    if (inField(e.target)) return false;
    if (nk === 'back') {
      if (s.tocOpen) {
        setZoneTo('text');
        return true;
      }
      return closeFind();
    }
    if (mod || e.altKey) return false;
    if ((nk === 'tab' || nk === 'backtab') && s.own) {
      setZoneTo(s.zone === 'toc' ? 'text' : 'toc');
      return true;
    }
    if (!nk && (e.key === 'n' || e.key === 'p')) {
      heading(e.key === 'n' ? 1 : -1);
      return true;
    }
    const t = text.current;
    if (s.own && s.zone === 'toc') {
      switch (nk) {
        case 'up':
        case 'down':
          goto(s.cur + (nk === 'down' ? 1 : -1));
          return true;
        case 'pgup':
        case 'pgdn':
          goto(s.cur + (nk === 'pgdn' ? 10 : -10));
          return true;
        case 'home':
        case 'end':
          goto(nk === 'home' ? 0 : n - 1);
          return true;
        case 'right':
        case 'activate':
          setZoneTo('text');
          return true;
        case 'left':
          return true;
      }
      return false;
    }
    switch (nk) {
      case 'up':
      case 'down':
        if (t) t.scrollTop += nk === 'down' ? LINE_STEP : -LINE_STEP;
        return true;
      case 'pgup':
      case 'pgdn':
        page(nk === 'pgdn' ? 1 : -1);
        return true;
      case 'activate':
        page(e.shiftKey ? -1 : 1);
        return true;
      case 'home':
        if (t) t.scrollTop = 0;
        setCur(0);
        return true;
      case 'end':
        if (t) t.scrollTop = t.scrollHeight;
        return true;
      case 'left':
        if (!s.own) return false;
        setZoneTo('toc');
        return true;
    }
    return false;
  };

  // The host's handle; its methods read the latest state.
  const impl = useRef({ goto, key, openFind, closeFind });
  impl.current = { goto, key, openFind, closeFind };
  useLayoutEffect(() => {
    p.ctl?.({
      goto: (i) => impl.current.goto(i),
      section: () => st.current.cur,
      key: (e, nk) => impl.current.key(e, nk),
      openFind: () => impl.current.openFind(),
      findOpen: () => {
        const s = st.current;
        return p.find === 'bar' ? s.barOpen : !!s.find.query.search || (!!input.current && input.current.ownerDocument.activeElement === input.current);
      },
      closeFind: () => impl.current.closeFind(),
    });
    return () => p.ctl?.(null);
  }, []);

  // The first section (the host's `initial`).
  useLayoutEffect(() => {
    if (cur > 0) goto(cur);
  }, []);

  // The current section follows the scroll: a 1 px band SPY_AT below the top.
  useEffect(() => {
    const t = text.current;
    if (!t || typeof IntersectionObserver === 'undefined') return;
    let io: IntersectionObserver | null = null;
    let h = -1;
    const make = (): void => {
      const now = t.clientHeight;
      if (now === h) return;
      h = now;
      io?.disconnect();
      io = new IntersectionObserver(
        (entries) => {
          let best = -1;
          for (const en of entries) if (en.isIntersecting) best = Math.max(best, Number((en.target as HTMLElement).dataset.i));
          if (best >= 0) setCur(best);
        },
        { root: t, rootMargin: `-${SPY_AT}px 0px -${Math.max(0, now - SPY_AT - 1)}px 0px`, threshold: 0 },
      );
      for (const s of t.querySelectorAll('section[data-i]')) io.observe(s);
    };
    make();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(make) : null;
    ro?.observe(t);
    return () => {
      ro?.disconnect();
      io?.disconnect();
    };
  }, [sections]);

  // The host hears of every change of the current section.
  const told = useRef(cur);
  useEffect(() => {
    if (told.current === cur) return;
    told.current = cur;
    p.onSection?.(cur);
  }, [cur]);

  // The marks: the Highlight API's ranges (or the fallback's `<mark>`s, drawn by ManualText).
  const api = highlightApi();
  const active = shown ? find.result : NO_RESULT;
  const marks = useMemo<FallbackMarks | null>(
    () => (api || !active.matches.length ? null : { by: matchesByBlock(active.matches), now: active.matches[find.hit] ?? null }),
    [api, active, find.hit],
  );
  const ranges = useRef<{ result: SectionFindResult; all: Range[]; of: Map<SectionMatch, Range> } | null>(null);
  const me = useRef({});
  useLayoutEffect(() => {
    const t = text.current;
    if (!t || !api) return;
    if (ranges.current?.result !== active) {
      const all: Range[] = [];
      const of = new Map<SectionMatch, Range>();
      const blocks = new Map<string, Element>();
      for (const [si, bm] of matchesByBlock(active.matches)) {
        const sec = secEl(si);
        if (!sec) continue;
        blocks.clear();
        for (const b of sec.querySelectorAll('[data-b]')) blocks.set((b as HTMLElement).dataset.b!, b);
        for (const [bi, ms] of bm) {
          const el = blocks.get(String(bi));
          if (!el) continue;
          const rs = rangesIn(el, ms);
          ms.forEach((m, k) => {
            const r = rs[k];
            if (r) {
              all.push(r);
              of.set(m, r);
            }
          });
        }
      }
      ranges.current = { result: active, all, of };
    }
    const m = active.matches[find.hit];
    owners.set(me.current, { all: ranges.current.all, now: (m && ranges.current.of.get(m)) ?? null });
    paintHighlights();
  }, [active, find.hit, api]);
  useEffect(
    () => () => {
      owners.delete(me.current);
      paintHighlights();
    },
    [],
  );

  // A step or a new query: the current match in view, the contents following.
  useLayoutEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    const m = active.matches[find.hit];
    const t = text.current;
    if (!m || !t) return;
    const el = secEl(m.section)?.querySelector<HTMLElement>(`[data-b="${m.block}"]`);
    if (el) {
      const tr = t.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.top < tr.top + SPY_AT || r.bottom > tr.bottom - 8) t.scrollTop += r.top - tr.top - t.clientHeight / 3;
    }
    setCur(m.section);
  }, [find]);

  // Ctrl+F before the bar was drawn: its field gets the focus now.
  useLayoutEffect(() => {
    if (!focusField.current || !input.current) return;
    focusField.current = false;
    input.current.focus({ preventScroll: true });
    input.current.select();
  });

  const count = sectionCountText(find.query, active, find.hit);
  const values = TOGGLES.filter((t) => find.query[t.key]).map((t) => t.key);
  const bar = shown && (
    <div class="wc-lk-mfind" role="search">
      <span class="wc-lk-mfind-f">
        <Icon name="find" class="wc-lk-mfind-ic" />
        <Field
          id="manual-find"
          value={find.query.search}
          placeholder="Find in the manual"
          inputRef={(el) => {
            input.current = el;
            if (el) {
              el.setAttribute('aria-label', 'Find in the manual');
              el.autocomplete = 'off';
            }
          }}
          onInput={(v) => search({ ...st.current.find.query, search: v })}
        />
      </span>
      <span class={cx('wc-search-count', count.cls === 'wc-c-err' && 'is-bad')} aria-live="polite">
        {count.text}
      </span>
      <Seg label="Find options" multi options={OPTIONS} values={values} onChange={(v) => toggle(v as Toggle)} />
      <span class="wc-lk-mfind-btns">
        <GlassButton icon="up" small id="prev" title="Previous (Shift+Enter)" onClick={() => step(-1)} />
        <GlassButton icon="down" small id="next" title="Next (Enter)" onClick={() => step(1)} />
        {p.find === 'bar' && <GlassButton icon="close" small id="close" title="Close (Esc)" onClick={() => closeFind()} />}
      </span>
    </div>
  );

  return (
    <div
      ref={root}
      class={cx('wc-lk-manual', own ? 'has-toc' : 'no-toc', tocOpen && 'is-toc-open', own && zone === 'toc' && 'is-toc-zone')}
      data-zone={own ? zone : 'text'}
    >
      {(own || bar) && (
        <div class={cx('wc-lk-mhead', bar && 'has-find')}>
          {own && (
            <span class="wc-lk-mtocbtn">
              <GlassButton
                label="Contents"
                icon="book"
                small
                id="contents"
                selected={tocOpen}
                onClick={() => {
                  const open = !st.current.tocOpen;
                  setZone(open ? 'toc' : 'text');
                  setTocOpen(open);
                }}
              />
            </span>
          )}
          {bar}
        </div>
      )}
      <div class="wc-lk-mmain">
        {own && (
          <ManualContents
            sections={sections}
            groups={groups}
            current={cur}
            counts
            active={zone === 'toc'}
            onGo={(i) => {
              goto(i);
              if (st.current.tocOpen) setTocOpen(false);
              setZone('text');
            }}
          />
        )}
        <ManualText
          sections={sections}
          groups={groups}
          marks={marks}
          textRef={text}
          example={p.example}
          link={p.link}
          onLink={(i) => impl.current.goto(i)}
        />
      </div>
    </div>
  );
}
