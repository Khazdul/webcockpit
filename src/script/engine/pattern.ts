// tt++ pattern → JavaScript RegExp (spec §3, Inv §6.3).
//
// Supported:
//   ^ at the start, $ at the end     anchors (elsewhere literal)
//   %0–%99                           any text, stored in that argument
//   %*  %+  %?  %.                   0+ / 1+ / 0–1 / exactly 1 characters
//   %d %D %w %W %s %S %a %u %U       digits, non-digits, word chars, non-word,
//                                    spaces, non-spaces, anything incl.
//                                    newline, any (u/U as *)
//   %+min..maxX, %+min..X, %+nX      ranges on X (one of d D w W s S a u U .),
//                                    e.g. %+1..d is one or more digits;
//                                    without `..` the count is exact
//   %!X, %!{…}                       as above, not stored
//   %i / %I                          case-insensitive / sensitive (whole pattern)
//   {regex}                          embedded JavaScript regex, stored
//   \x                               literal x
//   everything else                  literal
//
// Wildcards other than %N store their text in the next argument after the
// highest one used so far, as tt++ does. A %N or %* that ends the pattern
// (optionally before $) is greedy, any other is lazy. Word characters
// include non-ASCII letters (U+00C0 and up), so `é` is a word.

export interface CompiledPattern {
  /** Source pattern. */
  readonly source: string;
  readonly re: RegExp;
  /** For each regex group (index), the argument number it fills, or 0 (not stored). */
  readonly groupArg: readonly number[];
  /** Highest argument number. */
  readonly maxArg: number;
  /** Anchored at the start (`^`). */
  readonly anchored: boolean;
  /**
   * A literal that every match contains (for a cheap `indexOf` pre-check),
   * or '' when there is none or the pattern is case-insensitive.
   */
  readonly literal: string;
  /**
   * With `^`: the literal text the pattern starts with (a `startsWith`
   * pre-check), else ''. Case-sensitive patterns only.
   */
  readonly lead: string;
  /** With `$`: the literal text the pattern ends with (`endsWith`), else ''. */
  readonly tail: string;
  /** The pattern is plain text (no wildcards, anchors or regex). */
  readonly plain: boolean;
  /**
   * The pattern is one unanchored wildcard (`%*`, `%0`–`%99`): it matches
   * every line whole, so `matchPattern` skips the regex (catch-all system
   * actions run on every line of a burst).
   */
  readonly whole: boolean;
}

export class PatternError extends Error {
  override name = 'PatternError';
}

const WORD = '[\\w\\u00C0-\\uFFFF]';
const NONWORD = '[^\\w\\u00C0-\\uFFFF]';

const CLASS: Record<string, string> = {
  d: '[0-9]',
  D: '[^0-9]',
  w: WORD,
  W: NONWORD,
  s: '\\s',
  S: '\\S',
  a: '[\\s\\S]',
  u: '.',
  U: '.',
  '.': '.',
};

const RE_SPECIAL = /[.*+?^${}()|[\]\\/]/g;

function escapeRe(s: string): string {
  return s.replace(RE_SPECIAL, '\\$&');
}

/** Number of capturing groups in a regex source (approximate: ignores classes). */
function countGroups(src: string): number {
  let n = 0;
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      continue;
    }
    if (c === '[') inClass = true;
    else if (c === '(') {
      if (src[i + 1] !== '?') n++;
      else if (src[i + 2] === '<' && src[i + 3] !== '=' && src[i + 3] !== '!') n++;
    }
  }
  return n;
}

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}

const cache = new Map<string, CompiledPattern>();
const CACHE_MAX = 2000;

/** Compiles (cached) a tt++ pattern. Throws PatternError on a bad embedded regex. */
export function compilePattern(pattern: string): CompiledPattern {
  const hit = cache.get(pattern);
  if (hit) return hit;
  const c = compileUncached(pattern);
  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(pattern, c);
  return c;
}

function compileUncached(pattern: string): CompiledPattern {
  let p = pattern;
  let anchored = false;
  let endAnchor = false;
  if (p.startsWith('^')) {
    anchored = true;
    p = p.slice(1);
  }
  if (p.endsWith('$') && !p.endsWith('\\$')) {
    endAnchor = true;
    p = p.slice(0, -1);
  }
  let src = '';
  let groups = 0;
  const groupArg: number[] = [0];
  let maxArg = 0;
  let icase = false;
  let plain = true;
  let lit = '';
  let bestLit = '';
  let firstLit: string | null = null;
  const endLit = (): void => {
    if (firstLit === null) firstLit = lit;
    if (lit.length > bestLit.length) bestLit = lit;
    lit = '';
  };
  const addGroup = (arg: number, inner: string, store: boolean): void => {
    endLit();
    plain = false;
    if (!store) {
      src += '(?:' + inner + ')';
      return;
    }
    src += '(' + inner + ')';
    groups++;
    groupArg[groups] = arg;
    if (arg > maxArg) maxArg = arg;
  };
  const atEnd = (i: number): boolean => i >= p.length;

  let i = 0;
  while (i < p.length) {
    const ch = p[i]!;
    if (ch === '\\' && i + 1 < p.length) {
      src += escapeRe(p[i + 1]!);
      lit += p[i + 1];
      i += 2;
      continue;
    }
    if (ch === '{') {
      const end = findClose(p, i);
      if (end < 0) {
        src += escapeRe(ch);
        lit += ch;
        i++;
        continue;
      }
      const inner = p.slice(i + 1, end);
      validate(inner, pattern);
      addGroup(maxArg + 1, inner, true);
      const innerGroups = countGroups(inner);
      for (let g = 0; g < innerGroups; g++) groupArg[++groups] = 0;
      i = end + 1;
      continue;
    }
    if (ch !== '%' || i + 1 >= p.length) {
      src += escapeRe(ch);
      lit += ch;
      i++;
      continue;
    }
    // A wildcard.
    let j = i + 1;
    let store = true;
    if (p[j] === '!') {
      store = false;
      j++;
    }
    const w = p[j];
    if (isDigit(w)) {
      let k = j + 1;
      if (isDigit(p[k])) k++;
      const n = Number(p.slice(j, k));
      addGroup(n, atEnd(k) ? '.*' : '.*?', store);
      i = k;
      continue;
    }
    if (w === 'i' || w === 'I') {
      if (w === 'i') icase = true;
      i = j + 1;
      continue;
    }
    if (w === '*') {
      addGroup(maxArg + 1, atEnd(j + 1) ? '.*' : '.*?', store);
      i = j + 1;
      continue;
    }
    if (w === '?') {
      addGroup(maxArg + 1, '.?', store);
      i = j + 1;
      continue;
    }
    if (w === '.') {
      addGroup(maxArg + 1, '.', store);
      i = j + 1;
      continue;
    }
    if (w === '+') {
      let k = j + 1;
      let min = '';
      let max = '';
      let range = false;
      while (isDigit(p[k])) min += p[k++];
      if (p[k] === '.' && p[k + 1] === '.') {
        range = true;
        k += 2;
        while (isDigit(p[k])) max += p[k++];
      }
      if (min === '' && !range) {
        addGroup(maxArg + 1, atEnd(k) ? '.+' : '.+?', store);
        i = k;
        continue;
      }
      let cls = '.';
      const t = p[k];
      if (t !== undefined && t in CLASS) {
        cls = CLASS[t]!;
        k++;
      }
      const lo = min === '' ? '0' : min;
      const q = range ? `{${lo},${max}}` : `{${lo}}`;
      addGroup(maxArg + 1, cls + q, store);
      i = k;
      continue;
    }
    if (w !== undefined && w in CLASS && w !== '.') {
      addGroup(maxArg + 1, CLASS[w]! + '*', store);
      i = j + 1;
      continue;
    }
    if (w === '{' && !store) {
      const end = findClose(p, j);
      if (end > 0) {
        const inner = p.slice(j + 1, end);
        validate(inner, pattern);
        addGroup(0, inner, false);
        const innerGroups = countGroups(inner);
        for (let g = 0; g < innerGroups; g++) groupArg[++groups] = 0;
        i = end + 1;
        continue;
      }
    }
    // Not a wildcard: a literal %.
    src += '%';
    lit += '%';
    i++;
  }
  const lastLit = lit;
  endLit();
  if (anchored || endAnchor) plain = false;
  const full = (anchored ? '^' : '') + src + (endAnchor ? '$' : '');
  let re: RegExp;
  try {
    re = new RegExp(full, icase ? 'i' : '');
  } catch (err) {
    throw new PatternError(`Bad pattern {${pattern}}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {
    source: pattern,
    re,
    groupArg,
    maxArg,
    anchored,
    literal: icase ? '' : bestLit,
    plain: plain && !icase,
    lead: anchored && !icase ? firstLit! : '',
    tail: endAnchor && !icase ? lastLit : '',
    whole: full === '(.*)' && !icase,
  };
}

function findClose(p: string, open: number): number {
  let depth = 0;
  for (let i = open; i < p.length; i++) {
    const c = p[i];
    if (c === '\\') i++;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

function validate(inner: string, pattern: string): void {
  try {
    new RegExp(inner);
  } catch (err) {
    throw new PatternError(`Bad regex {${inner}} in {${pattern}}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** What `.` does not match (the `whole` fast path falls back to the regex). */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** True when `text` has no line terminator, so a `whole` pattern matches all of it. */
export function isOneLine(text: string): boolean {
  return !LINE_BREAK.test(text);
}

/**
 * The arguments of a `whole` pattern (`(.*)`) matching a one-line `text`:
 * the whole text, also in group 1's argument.
 */
export function wholeArgs(c: CompiledPattern, text: string): string[] {
  const a = c.groupArg[1] ?? 0;
  if (c.maxArg === 0) return [text];
  if (c.maxArg === 1 && a === 1) return [text, text];
  const args = new Array<string>(c.maxArg + 1).fill('');
  args[0] = text;
  if (a) args[a] = text;
  return args;
}

/**
 * Matches `text` against a compiled pattern. Returns the arguments
 * (`args[0]` = the whole match) or null. `from`: search start (for
 * repeated matches); `sticky` requires the match to start at `from`.
 */
export function matchPattern(c: CompiledPattern, text: string): { args: string[]; index: number; end: number } | null {
  if (c.whole && isOneLine(text)) return { args: wholeArgs(c, text), index: 0, end: text.length };
  // Necessary conditions first: most rules fail on most lines.
  if (c.lead && !text.startsWith(c.lead)) return null;
  if (c.tail && !text.endsWith(c.tail)) return null;
  if (c.literal && c.literal !== c.lead && c.literal !== c.tail && text.indexOf(c.literal) < 0) return null;
  const m = c.re.exec(text);
  if (!m) return null;
  return { args: argsFrom(c, m), index: m.index, end: m.index + m[0].length };
}

/** The argument array for a RegExp match. */
export function argsFrom(c: CompiledPattern, m: RegExpExecArray): string[] {
  const args: string[] = new Array(c.maxArg + 1).fill('');
  args[0] = m[0];
  for (let g = 1; g < m.length; g++) {
    const a = c.groupArg[g];
    if (a) args[a] = m[g] ?? '';
  }
  return args;
}

/** A global copy of the pattern's regex, for replacing or highlighting every match. */
export function globalRe(c: CompiledPattern): RegExp {
  return new RegExp(c.re.source, c.re.flags.includes('g') ? c.re.flags : c.re.flags + 'g');
}
