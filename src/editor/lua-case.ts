// Case auto-correct of known names (stage 10 feedback round 4): a name
// typed in the wrong case (`temptrigger(`, `String.format`) becomes the
// API's or the Lua library's spelling once the word is finished. Pure;
// unit tested. lua-cm.ts decides when a word is finished and applies the
// correction as its own undo step.
//
// Not corrected: names in strings and comments, a field or method after
// something (`obj.Send`, `s:Upper`) unless the whole dotted name is known
// (`String.format`, `string.Format`), a spelling the script defines
// itself (local, function name, parameter, loop variable, assignment
// target), and a spelling the user refused (undid the correction or
// typed it back).

import { SCRIPT_API } from './lua-api';
import { type Token, luaLex } from './lua-blocks';
import { LUA_REF } from './lua-ref';

/** Lower-case name → its canonical spelling; a lower-case clash between two names drops both. */
const CANONICAL: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string | null>();
  for (const d of [...SCRIPT_API, ...LUA_REF]) {
    if (d.kind === 'tag' || d.kind === 'keyword' || d.removed) continue;
    const k = d.name.toLowerCase();
    const had = m.get(k);
    m.set(k, had === undefined || had === d.name ? d.name : null);
  }
  return new Map([...m].filter((e): e is [string, string] => e[1] !== null));
})();

/** The canonical spelling of a known API or Lua name, any case (`TEMPTRIGGER` → `tempTrigger`), or null. */
export function canonicalName(name: string): string | null {
  return CANONICAL.get(name.toLowerCase()) ?? null;
}

/** The names `tokens` define: locals, function names, parameters, loop variables, assignment targets. */
export function definedNames(tokens: readonly Token[]): Set<string> {
  const out = new Set<string>();
  const at = (i: number): Token | undefined => tokens[i];
  const is = (i: number, text: string): boolean => at(i)?.text === text && at(i)?.type !== 'string';
  /** Names separated by commas from `i` (attributes `<const>` skipped): their count of tokens. */
  const list = (i: number): number => {
    let j = i;
    while (at(j)?.type === 'name') {
      out.add(at(j)!.text);
      j++;
      if (is(j, '<')) j += 3; // <const>, <close>
      if (!is(j, ',')) break;
      j++;
    }
    return j;
  };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.type === 'keyword' && (t.text === 'local' || t.text === 'for')) {
      if (t.text === 'local' && is(i + 1, 'function')) continue; // the function's own name comes next
      list(i + 1);
    } else if (t.type === 'keyword' && t.text === 'function') {
      let j = i + 1;
      if (at(j)?.type === 'name') {
        out.add(at(j)!.text);
        while ((is(j + 1, '.') || is(j + 1, ':')) && at(j + 2)?.type === 'name') j += 2;
        j++;
      }
      if (is(j, '(')) list(j + 1);
    } else if (t.type === 'name' && is(i + 1, '=') && !is(i - 1, '.') && !is(i - 1, ':')) {
      out.add(t.text);
    }
  }
  return out;
}

export interface CaseFix {
  /** The span of the name (offsets in the text). */
  from: number;
  to: number;
  /** The name as typed and its canonical spelling. */
  typed: string;
  canonical: string;
}

/**
 * The correction of the name that ends at `end` in `text` (the word just
 * finished), or null when it is right, unknown, or must not be touched.
 * `refused`: spellings the user turned back in this editor session.
 */
export function caseCorrection(text: string, end: number, refused: ReadonlySet<string> = new Set()): CaseFix | null {
  const m = /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.exec(text.slice(Math.max(0, end - 200), end));
  if (!m || /\w/.test(text[end] ?? '')) return null;
  const typed = m[0];
  const from = end - typed.length;
  // A field or method of something else: `obj.Send`, `s:Upper`, `t[1].Format`.
  if (/[.:]$/.test(text.slice(0, from)) || /[\])]\s*[.:]$/.test(text.slice(0, from))) return null;
  const canonical = canonicalName(typed);
  if (!canonical || canonical === typed || refused.has(typed)) return null;
  const tokens = luaLex(text);
  const tok = tokens.find((t) => t.from <= from && t.to > from);
  // In a string or a comment, or a keyword.
  if (!tok || tok.type !== 'name' || tok.from !== from) return null;
  const head = typed.split('.')[0]!;
  if (definedNames(tokens.filter((t) => t.type !== 'comment')).has(head)) return null;
  return { from, to: end, typed, canonical };
}
