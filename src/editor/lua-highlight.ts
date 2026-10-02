// Lua colours for one line of an example in the script manual and the
// hover docs (stage 10 feedback round 1): the same roles as the editor's
// Lua mode (keywords cmd, strings var, numbers code, API and library
// names delim, comments body). A light scan of one line; a long string or
// comment from an earlier line is not seen. Pure; unit tested.

import type { TokenClass } from './syntax';

export type LuaTokenClass = TokenClass | 'comment';

export interface LuaToken {
  from: number;
  to: number;
  cls: LuaTokenClass;
}

const KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
]);

/** The coloured tokens of `line`; `known(name)` says whether a (dotted) name is an API or library name. */
export function luaHighlightLine(line: string, known: (name: string) => boolean = () => false): LuaToken[] {
  const out: LuaToken[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    const rest = line.slice(i);
    if (c === '-' && line[i + 1] === '-') {
      out.push({ from: i, to: line.length, cls: 'comment' });
      break;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      j = Math.min(line.length, j + 1);
      out.push({ from: i, to: j, cls: 'var' });
      i = j;
      continue;
    }
    const long = /^\[(=*)\[/.exec(rest);
    if (long) {
      const close = line.indexOf(`]${long[1]}]`, i + long[0].length);
      const j = close < 0 ? line.length : close + long[0].length;
      out.push({ from: i, to: j, cls: 'var' });
      i = j;
      continue;
    }
    const num = /^(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+)/.exec(rest);
    if (num && !/[\w.]/.test(line[i - 1] ?? '')) {
      out.push({ from: i, to: i + num[0].length, cls: 'code' });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/.exec(rest);
    if (word) {
      const w = word[0];
      if (KEYWORDS.has(w)) out.push({ from: i, to: i + w.length, cls: 'cmd' });
      else if (line[i - 1] !== '.' && line[i - 1] !== ':') {
        // The longest known dotted prefix: `store.set`, `string.format`, `gmcp`.
        const parts = w.split('.');
        for (let k = parts.length; k > 0; k--) {
          const name = parts.slice(0, k).join('.');
          if (known(name)) {
            out.push({ from: i, to: i + name.length, cls: 'delim' });
            break;
          }
        }
      }
      i += w.length;
      continue;
    }
    i++;
  }
  return out;
}
