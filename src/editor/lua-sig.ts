// Signature help for the script editor (stage 10 feedback round 3): which
// call the cursor is in, which argument it is on, and the signature to
// show for it, for the script API and the Lua library alike. Pure; unit
// tested. lua-cm.ts shows the result as a tooltip.
//
// `callContext` scans the code before the cursor with a light Lua lexer
// (strings, long strings, comments) and a stack of open brackets and
// blocks, so commas inside strings, tables or nested calls do not count,
// and the body of `function() … end` passed as an argument is not part
// of the outer call (`tempTrigger("x", function()` then `send(` on the
// next line is a call to send).

import { type ApiDoc, type ApiParam, apiDoc, methodDoc } from './lua-api';

export interface CallContext {
  /** The callee as written: `send`, `string.format`; for a method, its name (`find`). */
  callee: string;
  /** `s:find(…)`: a method call (the string library, without its `s`). */
  method: boolean;
  /** The argument the cursor is on, from 0. */
  index: number;
  /** Offset of the callee's first character. */
  from: number;
  /** Offset of the open parenthesis. */
  open: number;
}

const KEYWORDS = new Set([
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto', 'if', 'in',
  'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while',
]);
/** Keywords that open a block closed by `end` (`for`/`while` open with their `do`) or `until`. */
const OPENERS = new Set(['function', 'if', 'do', 'repeat']);

interface Paren {
  kind: '(';
  call: { callee: string; method: boolean; from: number } | null;
  open: number;
  commas: number;
}
interface Chain {
  text: string;
  method: boolean;
  from: number;
  /** After `function`: a definition, not a call. */
  def: boolean;
}
type Frame = Paren | { kind: '{' | '[' | 'block' };

/** The end of a long bracket `[=*[ … ]=*]` starting at `i`, or -1 when `i` does not start one. */
function longEnd(text: string, i: number): number {
  let j = i + 1;
  while (text[j] === '=') j++;
  if (text[j] !== '[') return -1;
  const close = ']' + '='.repeat(j - i - 1) + ']';
  const e = text.indexOf(close, j + 1);
  return e < 0 ? text.length : e + close.length;
}

/**
 * The innermost call whose argument list holds the end of `text` (the
 * code before the cursor), or null: outside any call, in a function
 * definition's parameters, in a table constructor, in a comment.
 */
export function callContext(text: string): CallContext | null {
  const n = text.length;
  const stack: Frame[] = [];
  // The name chain just read (`string.format`, `line:match`), and what may extend it.
  let chain = null as Chain | null;
  let expect: '.' | ':' | null = null;
  /** The last token, for `function name(` (a definition, not a call). */
  let prev = '';
  let i = 0;
  const popTo = (kind: Frame['kind']): void => {
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k]!.kind === kind) {
        stack.length = k;
        return;
      }
    }
  };
  while (i < n) {
    const c = text[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    const start = i;
    let tok: string;
    if (c === '-' && text[i + 1] === '-') {
      const e = text[i + 2] === '[' ? longEnd(text, i + 2) : -1;
      if (e >= 0) i = e;
      else {
        const nl = text.indexOf('\n', i);
        i = nl < 0 ? n : nl;
      }
      if (i >= n) return null; // the cursor is in the comment
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && text[i] !== c && text[i] !== '\n') i += text[i] === '\\' ? 2 : 1;
      i++;
      tok = '"';
    } else if (c === '[' && (text[i + 1] === '[' || text[i + 1] === '=') && longEnd(text, i) >= 0) {
      i = longEnd(text, i);
      tok = '"';
    } else if (/[A-Za-z_]/.test(c)) {
      while (i < n && /\w/.test(text[i]!)) i++;
      tok = text.slice(start, i);
    } else if (/\d/.test(c) || (c === '.' && /\d/.test(text[i + 1] ?? ''))) {
      while (i < n && /[\w.]/.test(text[i]!)) i++;
      if (/[eEpP]$/.test(text.slice(start, i)) && (text[i] === '+' || text[i] === '-')) {
        i++;
        while (i < n && /\w/.test(text[i]!)) i++;
      }
      tok = '0';
    } else {
      const three = text.slice(i, i + 3);
      const two = text.slice(i, i + 2);
      tok = three === '...' ? three : ['..', '::', '==', '~=', '<=', '>=', '//', '<<', '>>'].includes(two) ? two : c;
      i += tok.length;
    }

    // The name chain.
    const isName = /^[A-Za-z_]/.test(tok) && !KEYWORDS.has(tok);
    if (isName) {
      if (chain && expect) {
        chain = expect === ':' ? { ...chain, text: tok, method: true } : { ...chain, text: `${chain.text}.${tok}` };
      } else {
        chain = { text: tok, method: false, from: start, def: prev === 'function' };
      }
      expect = null;
    } else if (tok === '.' && chain && !chain.method && !expect) {
      expect = '.';
    } else if (tok === ':' && !expect && (chain || prev === ')' || prev === ']' || prev === '"')) {
      // A method on a name, a call result, an index or a string literal.
      chain = { text: '', method: false, from: chain?.from ?? start, def: false };
      expect = ':';
    } else if (tok === '(') {
      const call = chain && !expect && !chain.def && prev !== 'function' ? { callee: chain.text, method: chain.method, from: chain.from } : null;
      stack.push({ kind: '(', call, open: start, commas: 0 });
      chain = null;
      expect = null;
    } else {
      chain = null;
      expect = null;
    }

    if (tok === ')') popTo('(');
    else if (tok === '{' || tok === '[') stack.push({ kind: tok });
    else if (tok === '}') popTo('{');
    else if (tok === ']') popTo('[');
    else if (tok === ',') {
      const top = stack[stack.length - 1];
      if (top?.kind === '(') top.commas++;
    } else if (OPENERS.has(tok)) stack.push({ kind: 'block' });
    else if (tok === 'end' || tok === 'until') popTo('block');
    prev = tok;
  }
  const top = stack[stack.length - 1];
  if (!top || top.kind !== '(' || !top.call) return null;
  return { callee: top.call.callee, method: top.call.method, index: top.commas, from: top.call.from, open: top.open };
}

export interface Signature {
  doc: ApiDoc;
  /** The call as shown: `string.format`, `s:find`. */
  name: string;
  /** The parameters shown (a method's without its `s`). */
  params: readonly ApiParam[];
  /** The parameter the cursor is on, or -1 past the last. */
  active: number;
  /** ` → …` from the doc's signature, or ''. */
  returns: string;
}

/** The signature for a call context: a documented function with parameters, or null. */
export function signatureFor(ctx: CallContext): Signature | null {
  const doc = ctx.method ? methodDoc(ctx.callee) : apiDoc(ctx.callee);
  if (!doc || doc.kind !== 'function' || !doc.params || doc.removed) return null;
  const params = ctx.method ? doc.params.slice(1) : doc.params;
  const last = params.length - 1;
  const active = ctx.index <= last ? ctx.index : params[last]?.name === '...' ? last : -1;
  const arrow = doc.sig.indexOf(' → ');
  return {
    doc,
    name: ctx.method ? `${doc.params[0]?.name ?? 's'}:${ctx.callee}` : doc.name,
    params,
    active,
    returns: arrow >= 0 ? doc.sig.slice(arrow) : '',
  };
}

/** A parameter as shown in the signature: optional ones in brackets. */
export function paramLabel(p: ApiParam): string {
  return p.type.endsWith('?') ? `[${p.name}]` : p.name;
}
