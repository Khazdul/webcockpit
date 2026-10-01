// Patterns of Lua script triggers and aliases (spec §2.10, ADR 0051) as
// the engine's CompiledPattern, so they live in the `scripts` rule store
// and are matched in TypeScript like profile rules:
//
// - `tempTrigger(substring)`: the text anywhere in the line, literally.
// - `tempRegexTrigger(regex)`, `tempAlias(regex)`: a JavaScript RegExp
//   (Mudlet uses PCRE; the common subset is the same). Group n fills
//   `matches[n + 1]`; an unmatched group is ''.
//
// Each pattern keeps a required literal when one is certain, so the
// engine's `indexOf` pre-check and literal gates (gate.ts) skip it on
// most lines: the substring itself, or for a regex the longest run of
// plain characters outside groups, classes and quantifiers, when the
// regex has no `|`.

import type { CompiledPattern } from '../script/engine';

const RE_SPECIAL = /[.*+?^${}()|[\]\\/]/g;

/** A literal substring. Throws on an empty one. */
export function substringPattern(text: string): CompiledPattern {
  if (text === '') throw new Error('the substring is empty');
  return {
    source: text,
    re: new RegExp(text.replace(RE_SPECIAL, '\\$&')),
    groupArg: [0],
    maxArg: 0,
    anchored: false,
    literal: text,
    lead: '',
    tail: '',
    plain: false,
    whole: false,
  };
}

/**
 * A JavaScript regex. `alias`: matched as written (Mudlet aliases are
 * not anchored for you), so it is marked `anchored` to keep the engine
 * from wrapping it in `^(?:…)`. Throws `bad regex …` when it does not
 * compile.
 */
export function regexPattern(source: string, alias = false): CompiledPattern {
  if (source === '') throw new Error('the regex is empty');
  let re: RegExp;
  try {
    re = new RegExp(source);
  } catch (err) {
    throw new Error(`bad regex: ${err instanceof Error ? err.message.replace(/^Invalid regular expression: /, '') : String(err)}`);
  }
  const groups = new RegExp(source + '|').exec('')!.length - 1;
  const groupArg: number[] = [0];
  for (let g = 1; g <= groups; g++) groupArg.push(g);
  return {
    source,
    re,
    groupArg,
    maxArg: groups,
    anchored: alias || source.startsWith('^'),
    literal: regexLiteral(source),
    lead: '',
    tail: '',
    plain: false,
    whole: false,
  };
}

/** Escapes that stand for a class or an assertion, not for the character. */
const CLASS_ESCAPES = new Set('dDwWsSbBnrtfv0123456789kpPuxc'.split(''));

/**
 * The longest run of characters every match of `src` contains, or ''.
 * Conservative: '' for any `|`, and characters made optional or repeated
 * by a quantifier are not part of a run.
 */
export function regexLiteral(src: string): string {
  let best = '';
  let cur = '';
  const end = (): void => {
    if (cur.length > best.length) best = cur;
    cur = '';
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    switch (c) {
      case '\\': {
        const d = src[i + 1];
        i++;
        if (d === undefined || CLASS_ESCAPES.has(d)) end();
        else cur += d;
        break;
      }
      case '|':
        return '';
      case '[': {
        end();
        let j = i + 1;
        if (src[j] === '^') j++;
        if (src[j] === ']') j++;
        while (j < src.length && src[j] !== ']') j += src[j] === '\\' ? 2 : 1;
        i = j;
        break;
      }
      case '*':
      case '+':
      case '?':
      case '{':
        // The previous character is optional or repeated.
        cur = cur.slice(0, -1);
        end();
        if (c === '{') {
          const close = src.indexOf('}', i);
          if (close > 0) i = close;
        }
        break;
      case '(':
        end();
        if (src[i + 1] === '?') {
          // A negative lookaround's text must be absent: no literal at all.
          if (src[i + 2] === '!' || (src[i + 2] === '<' && src[i + 3] === '!')) return '';
          if (src[i + 2] === '<' && src[i + 3] !== '=') i = Math.max(i, src.indexOf('>', i));
          else i += src[i + 2] === '<' ? 3 : 2;
        }
        break;
      case ')':
      case '^':
      case '$':
      case '.':
        end();
        break;
      default:
        cur += c;
    }
  }
  end();
  return best;
}
