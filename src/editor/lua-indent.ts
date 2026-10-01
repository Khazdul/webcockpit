// Lua auto-indent for the script editor: one level per line that opens a
// block, whatever the line opens with. The legacy Lua mode counts every
// `(` and `function` on a line, so the common
// `tempTrigger("x", function()` indented its body by two levels. Pure;
// unit tested.

const OPENERS = new Set(['function', 'do', 'then', 'repeat', 'else']);
const CLOSERS = new Set(['end', 'until', 'elseif']);
/** Words and brackets that, at the start of a line, close the block above it. */
const LEADING_CLOSER = /^\s*(?:end\b|until\b|else\b|elseif\b|[)}\]])/;

/** `line` without strings and the comment, as code tokens: words and brackets. */
export function luaTokens(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const c = line[i]!;
    if (c === '-' && line[i + 1] === '-') break;
    if (c === '"' || c === "'") {
      i++;
      while (i < line.length && line[i] !== c) i += line[i] === '\\' ? 2 : 1;
      i++;
      continue;
    }
    if (c === '[' && /^\[=*\[/.test(line.slice(i))) {
      const eq = /^\[(=*)\[/.exec(line.slice(i))![1]!;
      const close = line.indexOf(`]${eq}]`, i + 2 + eq.length);
      if (close < 0) break;
      i = close + 2 + eq.length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_]\w*/.exec(line.slice(i))!;
      out.push(m[0]);
      i += m[0].length;
      continue;
    }
    if ('(){}[]'.includes(c)) out.push(c);
    i++;
  }
  return out;
}

/** True when `text` starts with something that closes a block (`end`, `else`, `}` …). */
export function startsWithCloser(text: string): boolean {
  return LEADING_CLOSER.test(text);
}

/** True when the line after `line` goes one level deeper. */
export function opensBlock(line: string): boolean {
  let net = startsWithCloser(line) ? 1 : 0;
  for (const t of luaTokens(line)) {
    if (OPENERS.has(t) || t === '(' || t === '{' || t === '[') net++;
    else if (CLOSERS.has(t) || t === ')' || t === '}' || t === ']') net--;
  }
  return net > 0;
}

/**
 * The indentation (columns) of a line: the previous non-blank line's
 * indentation, one `unit` deeper when that line opens a block, one
 * shallower when this line starts with a closer.
 */
export function luaIndent(prev: { text: string; indent: number } | null, textAfter: string, unit: number): number {
  let n = prev ? prev.indent + (opensBlock(prev.text) ? unit : 0) : 0;
  if (startsWithCloser(textAfter)) n -= unit;
  return Math.max(0, n);
}
