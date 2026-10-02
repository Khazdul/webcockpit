// Lua tokens over a whole script, and the block auto-close on Enter
// (stage 10 feedback round 4). Pure; unit tested. lua-cm.ts binds
// `autoCloseAt` to Enter; lua-case.ts uses the tokens.
//
// `luaLex` knows strings (escapes; an unfinished one ends at the line
// end), long brackets `[==[ … ]==]` and comments (`--`, `--[[ … ]]`)
// across lines, so a keyword inside them is not code.
//
// Auto-close: Enter at the end of a line whose last code token completes
// a block header (`then` of an `if`, `do`, `repeat`, the `)` of a
// `function (…)`) that the line opens and that is not closed already
// inserts a body line and the closer (`end`, `until `) below, at the
// opener line's indentation. "Closed already" is decided on the block
// stack of the whole buffer: the block is closed when a later `end` /
// `until` pops it and stands at the opener's indentation or deeper; a
// block that nothing pops, or that a shallower closer pops (the closer of
// an outer block, as in `function a()` / `  if x then` / `end`), is not.

export type TokenType = 'name' | 'keyword' | 'string' | 'comment' | 'number' | 'op';

export interface Token {
  type: TokenType;
  text: string;
  from: number;
  to: number;
}

export const LUA_KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
]);

/** The end of a long bracket `[=*[ … ]=*]` at `i` (the text's end when unclosed), or -1 when `i` starts none. */
function longEnd(text: string, i: number): number {
  let j = i + 1;
  while (text[j] === '=') j++;
  if (text[j] !== '[') return -1;
  const close = ']' + '='.repeat(j - i - 1) + ']';
  const e = text.indexOf(close, j + 1);
  return e < 0 ? text.length : e + close.length;
}

const isWordStart = (c: string): boolean => /[A-Za-z_]/.test(c);
const isWord = (c: string): boolean => /\w/.test(c);

/** The tokens of `text`; whitespace is dropped. */
export function luaLex(text: string): Token[] {
  const out: Token[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    const from = i;
    if (c === '-' && text[i + 1] === '-') {
      const e = text[i + 2] === '[' ? longEnd(text, i + 2) : -1;
      if (e >= 0) i = e;
      else {
        const nl = text.indexOf('\n', i);
        i = nl < 0 ? n : nl;
      }
      out.push({ type: 'comment', text: text.slice(from, i), from, to: i });
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
      if (text[i] === c) i++;
      i = Math.min(i, n);
      out.push({ type: 'string', text: text.slice(from, i), from, to: i });
      continue;
    }
    if (c === '[') {
      const e = longEnd(text, i);
      if (e >= 0) {
        i = e;
        out.push({ type: 'string', text: text.slice(from, i), from, to: i });
        continue;
      }
    }
    if (isWordStart(c)) {
      while (i < n && isWord(text[i]!)) i++;
      const w = text.slice(from, i);
      out.push({ type: LUA_KEYWORDS.has(w) ? 'keyword' : 'name', text: w, from, to: i });
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(text[i + 1] ?? ''))) {
      while (i < n && (/[\w.]/.test(text[i]!) || (/[eEpP]/.test(text[i - 1]!) && /[+-]/.test(text[i]!)))) i++;
      out.push({ type: 'number', text: text.slice(from, i), from, to: i });
      continue;
    }
    const op = ['...', '..', '==', '~=', '<=', '>=', '//', '::', '<<', '>>'].find((o) => text.startsWith(o, i)) ?? c;
    i += op.length;
    out.push({ type: 'op', text: op, from, to: i });
  }
  return out;
}

/** Code tokens only (no comments). */
export const codeTokens = (text: string): Token[] => luaLex(text).filter((t) => t.type !== 'comment');

// ------------------------------------------------------------ blocks

export type BlockKind = 'function' | 'if' | 'do' | 'repeat';

interface Block {
  kind: BlockKind;
  /** Offset of the opening keyword. */
  at: number;
}

/** Applies one token to the block stack; returns the popped block, if any. */
function step(stack: Block[], t: Token): Block | null {
  if (t.type !== 'keyword') return null;
  switch (t.text) {
    case 'function':
    case 'if':
    case 'do':
    case 'repeat':
      stack.push({ kind: t.text, at: t.from });
      return null;
    case 'end':
    case 'until':
      return stack.pop() ?? null;
    default:
      return null;
  }
}

const lineStart = (text: string, pos: number): number => text.lastIndexOf('\n', pos - 1) + 1;
const indentOf = (text: string, pos: number): string => {
  const s = lineStart(text, pos);
  return /^[ \t]*/.exec(text.slice(s))![0];
};
/** Columns of an indentation (a tab counts as `unit` columns). */
const width = (ws: string, unit: number): number => [...ws].reduce((n, c) => n + (c === '\t' ? unit : 1), 0);

export interface AutoClose {
  /** Replace `from`–`to` (the cursor to the line end) with `insert`. */
  from: number;
  to: number;
  insert: string;
  /** The cursor after the insert. */
  cursor: number;
  /** The closer inserted: `end`, `end)`, `until ` … */
  closer: string;
}

/**
 * Enter at `pos` in `text`: the auto-close insert, or null for a plain
 * Enter (not at the line end, no block header completed on this line,
 * or the block is closed already).
 */
export function autoCloseAt(text: string, pos: number, unit = '  '): AutoClose | null {
  const ls = lineStart(text, pos);
  let le = text.indexOf('\n', pos);
  if (le < 0) le = text.length;
  const after = text.slice(pos, le);
  // Only closing brackets (closeBrackets' `)`) may follow the cursor; they move below.
  if (!/^[\s)\]}]*$/.test(after)) return null;
  const all = luaLex(text);
  // The cursor inside a token: a string, a long comment.
  if (all.some((t) => t.from < pos && t.to > pos)) return null;
  const tokens = all.filter((t) => t.type !== 'comment');
  const stack: Block[] = [];
  const parens: Token[] = [];
  let k = 0;
  let last: Token | null = null;
  for (; k < tokens.length && tokens[k]!.from < pos; k++) {
    const t = tokens[k]!;
    step(stack, t);
    if (t.type === 'op' && '({['.includes(t.text)) parens.push(t);
    else if (t.type === 'op' && ')}]'.includes(t.text)) parens.pop();
    last = t;
  }
  const top = stack.at(-1);
  if (!top || top.at < ls || !last || last.from < ls) return null;
  // The header is complete: `if … then`, `… do`, `repeat`, `function …(…)`.
  const done =
    (top.kind === 'if' && last.text === 'then' && last.type === 'keyword') ||
    (top.kind === 'do' && last.text === 'do') ||
    (top.kind === 'repeat' && last.text === 'repeat') ||
    (top.kind === 'function' && last.text === ')' && !parens.some((p) => p.from > top.at));
  if (!done) return null;

  // Closed already? Scan on until something pops this block.
  const depth = stack.length;
  const indent = indentOf(text, ls);
  const u = unit === '\t' ? 2 : unit.length;
  for (; k < tokens.length; k++) {
    const t = tokens[k]!;
    const popped = step(stack, t);
    if (stack.length < depth && popped) {
      const fits = top.kind === 'repeat' ? t.text === 'until' : t.text === 'end';
      if (fits && width(indentOf(text, t.from), u) >= width(indent, u)) return null;
      break;
    }
  }

  // The brackets of this line opened before the `function` and still open: `tempTrigger("x", function()`.
  const brackets = top.kind === 'function' ? parens.filter((p) => p.from >= ls && p.from < top.at) : [];
  const moved = after.trim();
  const tail =
    moved !== ''
      ? moved
      : brackets
          .reverse()
          .map((p) => ({ '(': ')', '{': '}', '[': ']' })[p.text as '(' | '{' | '[']!)
          .join('');
  const closer = (top.kind === 'repeat' ? 'until ' : 'end') + tail;
  const bodyIndent = indent + unit;
  const insert = `\n${bodyIndent}\n${indent}${closer}`;
  return { from: pos, to: le, insert, cursor: pos + 1 + bodyIndent.length, closer };
}
