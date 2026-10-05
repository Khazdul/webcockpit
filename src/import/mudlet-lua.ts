// Mudlet item bodies (Lua) → tt++ commands (ADR 0076 "Bodies: the Lua
// subset", research `mudlet.md` §9).
//
// Not a Lua interpreter: a lexer and a parser for the whole Lua syntax,
// then an emitter that accepts a small subset of statements and
// expressions and throws `Unsupported` with a short reason for anything
// else, so the caller keeps the item. Accepted:
// - `send/sendAll/expandAlias` → commands; `x = e` / `local x = e` →
//   `#variable` (arithmetic → `#math`, `x = a or b` → `#if`); `if` →
//   `#if/#elseif/#else` (constant conditions are folded);
//   `echo/cecho/decho/hecho/print` → `#showme` with colours converted;
//   `tempTimer(n, function … end)` → `#delay`; `enable…/disable…("name")`
//   → the caller's gate variable;
// - trigger idioms, at the top level of a trigger body only:
//   `deleteLine()` → gag; `selectString(lit, n)` / `selectCurrentLine()`
//   with `fg/bg/setFgColor/setBgColor/setBold/setUnderline/setItalics` →
//   highlight; with `replace(t)` (or `replaceLine/creplaceLine(t)`) →
//   substitute; `moveCursor/resetFormat/deselect` belong to these idioms;
// - calls to functions defined in the user's own Scripts whose bodies are
//   themselves in the subset are inlined with the arguments substituted
//   (depth ≤ 3, no recursion); a function that is a single `return e` is
//   inlined in expressions too.
// Globals become `$name`, `matches[n]` becomes `%(n-1)`.

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

type TokType = 'name' | 'kw' | 'num' | 'str' | 'op' | 'eof';

interface Tok {
  t: TokType;
  v: string;
  line: number;
}

const KEYWORDS = new Set([
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'goto',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
]);

const OPS3 = ['...'];
const OPS2 = ['..', '==', '~=', '<=', '>=', '//', '::', '<<', '>>'];
const OPS1 = '+-*/%^#&~|<>=(){}[];:,.';

export class LuaSyntaxError extends Error {
  override name = 'LuaSyntaxError';
}

/** Length of a long bracket opener `[==[` at `i` (or -1), and its level. */
function longOpen(src: string, i: number): { len: number; level: number } | null {
  if (src[i] !== '[') return null;
  let j = i + 1;
  while (src[j] === '=') j++;
  if (src[j] !== '[') return null;
  return { len: j - i + 1, level: j - i - 1 };
}

function readLong(src: string, i: number, level: number, line: number): { text: string; end: number } {
  const close = ']' + '='.repeat(level) + ']';
  const end = src.indexOf(close, i);
  if (end < 0) throw new LuaSyntaxError(`line ${line}: unfinished long string or comment`);
  let text = src.slice(i, end);
  // A newline right after the opener is skipped.
  if (text.startsWith('\r\n')) text = text.slice(2);
  else if (text.startsWith('\n')) text = text.slice(1);
  return { text, end: end + close.length };
}

const ESC: Record<string, string> = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '\n': '\n' };

export function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let line = 1;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === '\n') {
      line++;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }
    if (c === '-' && src[i + 1] === '-') {
      const lo = longOpen(src, i + 2);
      if (lo) {
        const r = readLong(src, i + 2 + lo.len, lo.level, line);
        for (let k = i; k < r.end; k++) if (src[k] === '\n') line++;
        i = r.end;
      } else {
        while (i < n && src[i] !== '\n') i++;
      }
      continue;
    }
    const lo = longOpen(src, i);
    if (lo) {
      const r = readLong(src, i + lo.len, lo.level, line);
      out.push({ t: 'str', v: r.text, line });
      for (let k = i; k < r.end; k++) if (src[k] === '\n') line++;
      i = r.end;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /\w/.test(src[j]!)) j++;
      const w = src.slice(i, j);
      out.push({ t: KEYWORDS.has(w) ? 'kw' : 'name', v: w, line });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^0[xX](?:[0-9a-fA-F]*\.?[0-9a-fA-F]*)(?:[pP][+-]?\d+)?|^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      out.push({ t: 'num', v: m![0], line });
      i += m![0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let s = '';
      let j = i + 1;
      for (;;) {
        if (j >= n || src[j] === '\n') throw new LuaSyntaxError(`line ${line}: unfinished string`);
        const d = src[j]!;
        if (d === c) break;
        if (d !== '\\') {
          s += d;
          j++;
          continue;
        }
        const e = src[j + 1] ?? '';
        if (e in ESC) {
          s += ESC[e];
          if (e === '\n') line++;
          j += 2;
        } else if (e === 'x') {
          s += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16));
          j += 4;
        } else if (e === 'z') {
          j += 2;
          while (j < n && /\s/.test(src[j]!)) {
            if (src[j] === '\n') line++;
            j++;
          }
        } else if (e === 'u' && src[j + 2] === '{') {
          const close = src.indexOf('}', j);
          s += String.fromCodePoint(parseInt(src.slice(j + 3, close), 16));
          j = close + 1;
        } else if (/[0-9]/.test(e)) {
          const m = /^\d{1,3}/.exec(src.slice(j + 1))!;
          s += String.fromCharCode(Number(m[0]));
          j += 1 + m[0].length;
        } else {
          throw new LuaSyntaxError(`line ${line}: invalid escape \\${e}`);
        }
      }
      out.push({ t: 'str', v: s, line });
      i = j + 1;
      continue;
    }
    const op = OPS3.find((o) => src.startsWith(o, i)) ?? OPS2.find((o) => src.startsWith(o, i)) ?? (OPS1.includes(c) ? c : null);
    if (!op) throw new LuaSyntaxError(`line ${line}: unexpected character ${c}`);
    out.push({ t: 'op', v: op, line });
    i += op.length;
  }
  out.push({ t: 'eof', v: '', line });
  return out;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

export type Expr =
  | { k: 'nil' | 'true' | 'false' | 'vararg' }
  | { k: 'num'; v: string }
  | { k: 'str'; v: string }
  /** `g`: a global already resolved by `close` (never a parameter of the inlined function). */
  | { k: 'name'; name: string; g?: boolean }
  | { k: 'index'; obj: Expr; key: Expr }
  | { k: 'call'; fn: Expr; args: Expr[]; method?: string }
  | { k: 'func'; params: string[]; vararg: boolean; body: Stmt[] }
  | { k: 'table' }
  | { k: 'bin'; op: string; a: Expr; b: Expr }
  | { k: 'un'; op: string; a: Expr }
  | { k: 'paren'; e: Expr };

export type Stmt =
  | { k: 'local'; names: string[]; values: Expr[]; line: number }
  | { k: 'assign'; targets: Expr[]; values: Expr[]; line: number }
  | { k: 'call'; call: Expr; line: number }
  | { k: 'if'; branches: Array<{ cond: Expr; body: Stmt[] }>; orelse: Stmt[] | null; line: number }
  | { k: 'while' | 'repeat' | 'fornum' | 'forin' | 'do' | 'break' | 'goto' | 'label'; line: number }
  | { k: 'return'; values: Expr[]; line: number }
  | { k: 'function'; name: Expr; params: string[]; vararg: boolean; body: Stmt[]; local: boolean; line: number };

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const BINARY: Record<string, [number, number]> = {
  or: [1, 1],
  and: [2, 2],
  '<': [3, 3],
  '>': [3, 3],
  '<=': [3, 3],
  '>=': [3, 3],
  '~=': [3, 3],
  '==': [3, 3],
  '|': [4, 4],
  '~': [5, 5],
  '&': [6, 6],
  '<<': [7, 7],
  '>>': [7, 7],
  '..': [9, 8],
  '+': [10, 10],
  '-': [10, 10],
  '*': [11, 11],
  '/': [11, 11],
  '//': [11, 11],
  '%': [11, 11],
  '^': [14, 13],
};
const UNARY_PRIORITY = 12;

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  private get tok(): Tok {
    return this.toks[this.i]!;
  }

  private next(): Tok {
    const t = this.toks[this.i]!;
    if (t.t !== 'eof') this.i++;
    return t;
  }

  private is(v: string): boolean {
    const t = this.tok;
    return (t.t === 'op' || t.t === 'kw') && t.v === v;
  }

  private accept(v: string): boolean {
    if (!this.is(v)) return false;
    this.i++;
    return true;
  }

  private expect(v: string): void {
    if (!this.accept(v)) this.fail(`'${v}' expected`);
  }

  private fail(msg: string): never {
    const t = this.tok;
    throw new LuaSyntaxError(`line ${t.line}: ${msg} near ${t.t === 'eof' ? 'the end' : `'${t.v}'`}`);
  }

  private name(): string {
    const t = this.tok;
    if (t.t !== 'name') this.fail('name expected');
    this.i++;
    return t.v;
  }

  chunk(): Stmt[] {
    const b = this.block();
    if (this.tok.t !== 'eof') this.fail(`unexpected '${this.tok.v}'`);
    return b;
  }

  private blockEnd(): boolean {
    const t = this.tok;
    return t.t === 'eof' || (t.t === 'kw' && (t.v === 'end' || t.v === 'else' || t.v === 'elseif' || t.v === 'until'));
  }

  private block(): Stmt[] {
    const out: Stmt[] = [];
    while (!this.blockEnd()) {
      if (this.is('return')) {
        const line = this.next().line;
        const values = this.blockEnd() || this.is(';') ? [] : this.exprList();
        this.accept(';');
        out.push({ k: 'return', values, line });
        break;
      }
      const s = this.statement();
      if (s) out.push(s);
    }
    return out;
  }

  private statement(): Stmt | null {
    const line = this.tok.line;
    if (this.accept(';')) return null;
    if (this.accept('::')) {
      this.name();
      this.expect('::');
      return { k: 'label', line };
    }
    if (this.accept('break')) return { k: 'break', line };
    if (this.accept('goto')) {
      this.name();
      return { k: 'goto', line };
    }
    if (this.accept('do')) {
      this.block();
      this.expect('end');
      return { k: 'do', line };
    }
    if (this.accept('while')) {
      this.expr();
      this.expect('do');
      this.block();
      this.expect('end');
      return { k: 'while', line };
    }
    if (this.accept('repeat')) {
      this.block();
      this.expect('until');
      this.expr();
      return { k: 'repeat', line };
    }
    if (this.accept('if')) {
      const branches: Array<{ cond: Expr; body: Stmt[] }> = [];
      let cond = this.expr();
      this.expect('then');
      branches.push({ cond, body: this.block() });
      let orelse: Stmt[] | null = null;
      for (;;) {
        if (this.accept('elseif')) {
          cond = this.expr();
          this.expect('then');
          branches.push({ cond, body: this.block() });
        } else if (this.accept('else')) {
          orelse = this.block();
          this.expect('end');
          break;
        } else {
          this.expect('end');
          break;
        }
      }
      return { k: 'if', branches, orelse, line };
    }
    if (this.accept('for')) {
      this.name();
      if (this.accept('=')) {
        this.expr();
        this.expect(',');
        this.expr();
        if (this.accept(',')) this.expr();
        this.expect('do');
        this.block();
        this.expect('end');
        return { k: 'fornum', line };
      }
      while (this.accept(',')) this.name();
      this.expect('in');
      this.exprList();
      this.expect('do');
      this.block();
      this.expect('end');
      return { k: 'forin', line };
    }
    if (this.accept('function')) {
      let name: Expr = { k: 'name', name: this.name() };
      while (this.is('.') || this.is(':')) {
        const method = this.next().v === ':';
        name = { k: 'index', obj: name, key: { k: 'str', v: this.name() } };
        if (method) break;
      }
      const f = this.funcBody();
      return { k: 'function', name, params: f.params, vararg: f.vararg, body: f.body, local: false, line };
    }
    if (this.accept('local')) {
      if (this.accept('function')) {
        const name = this.name();
        const f = this.funcBody();
        return { k: 'function', name: { k: 'name', name }, params: f.params, vararg: f.vararg, body: f.body, local: true, line };
      }
      const names: string[] = [];
      do {
        names.push(this.name());
        if (this.accept('<')) {
          this.name();
          this.expect('>');
        }
      } while (this.accept(','));
      const values = this.accept('=') ? this.exprList() : [];
      return { k: 'local', names, values, line };
    }
    const e = this.suffixed();
    if (this.is('=') || this.is(',')) {
      const targets = [e];
      while (this.accept(',')) targets.push(this.suffixed());
      this.expect('=');
      for (const t of targets) if (t.k !== 'name' && t.k !== 'index') this.fail('cannot assign to that');
      return { k: 'assign', targets, values: this.exprList(), line };
    }
    if (e.k !== 'call') this.fail('syntax error');
    return { k: 'call', call: e, line };
  }

  private funcBody(): { params: string[]; vararg: boolean; body: Stmt[] } {
    this.expect('(');
    const params: string[] = [];
    let vararg = false;
    if (!this.is(')')) {
      do {
        if (this.accept('...')) {
          vararg = true;
          break;
        }
        params.push(this.name());
      } while (this.accept(','));
    }
    this.expect(')');
    const body = this.block();
    this.expect('end');
    return { params, vararg, body };
  }

  private exprList(): Expr[] {
    const out = [this.expr()];
    while (this.accept(',')) out.push(this.expr());
    return out;
  }

  expr(limit = 0): Expr {
    let left: Expr;
    const t = this.tok;
    if ((t.t === 'kw' && t.v === 'not') || (t.t === 'op' && (t.v === '-' || t.v === '#' || t.v === '~'))) {
      this.next();
      left = { k: 'un', op: t.v, a: this.expr(UNARY_PRIORITY) };
    } else left = this.simple();
    for (;;) {
      const o = this.tok;
      const p = (o.t === 'op' || o.t === 'kw') && Object.hasOwn(BINARY, o.v) ? BINARY[o.v]! : null;
      if (!p || p[0] <= limit) break;
      this.next();
      left = { k: 'bin', op: o.v, a: left, b: this.expr(p[1]) };
    }
    return left;
  }

  private simple(): Expr {
    const t = this.tok;
    if (t.t === 'num') {
      this.next();
      return { k: 'num', v: t.v };
    }
    if (t.t === 'str') {
      this.next();
      return { k: 'str', v: t.v };
    }
    if (this.accept('nil')) return { k: 'nil' };
    if (this.accept('true')) return { k: 'true' };
    if (this.accept('false')) return { k: 'false' };
    if (this.accept('...')) return { k: 'vararg' };
    if (this.is('{')) return this.table();
    if (this.accept('function')) {
      const f = this.funcBody();
      return { k: 'func', ...f };
    }
    return this.suffixed();
  }

  private table(): Expr {
    this.expect('{');
    while (!this.is('}')) {
      if (this.accept('[')) {
        this.expr();
        this.expect(']');
        this.expect('=');
        this.expr();
      } else if (this.tok.t === 'name' && this.toks[this.i + 1]?.v === '=' && this.toks[this.i + 1]?.t === 'op') {
        this.next();
        this.next();
        this.expr();
      } else this.expr();
      if (!this.accept(',') && !this.accept(';')) break;
    }
    this.expect('}');
    return { k: 'table' };
  }

  private suffixed(): Expr {
    let e: Expr;
    if (this.accept('(')) {
      e = { k: 'paren', e: this.expr() };
      this.expect(')');
    } else if (this.tok.t === 'name') e = { k: 'name', name: this.next().v };
    else this.fail('unexpected symbol');
    for (;;) {
      if (this.accept('.')) e = { k: 'index', obj: e, key: { k: 'str', v: this.name() } };
      else if (this.accept('[')) {
        e = { k: 'index', obj: e, key: this.expr() };
        this.expect(']');
      } else if (this.accept(':')) {
        const method = this.name();
        e = { k: 'call', fn: e, args: this.callArgs(), method };
      } else if (this.is('(') || this.is('{') || this.tok.t === 'str') e = { k: 'call', fn: e, args: this.callArgs() };
      else return e;
    }
  }

  private callArgs(): Expr[] {
    if (this.tok.t === 'str') return [{ k: 'str', v: this.next().v }];
    if (this.is('{')) return [this.table()];
    this.expect('(');
    const args = this.is(')') ? [] : this.exprList();
    this.expect(')');
    return args;
  }
}

/** Parses a Lua chunk. Throws LuaSyntaxError. */
export function parseLua(src: string): Stmt[] {
  return new Parser(lex(src)).chunk();
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

/** Mudlet's `color_table` for the common names (X11 values, as Mudlet has them). */
export const MUDLET_COLOURS: Readonly<Record<string, readonly [number, number, number]>> = {
  alice_blue: [240, 248, 255],
  antique_white: [250, 235, 215],
  aquamarine: [127, 255, 212],
  azure: [240, 255, 255],
  beige: [245, 245, 220],
  bisque: [255, 228, 196],
  black: [0, 0, 0],
  blanched_almond: [255, 235, 205],
  blue: [0, 0, 255],
  blue_violet: [138, 43, 226],
  brown: [165, 42, 42],
  burlywood: [222, 184, 135],
  cadet_blue: [95, 158, 160],
  chartreuse: [127, 255, 0],
  chocolate: [210, 105, 30],
  coral: [255, 127, 80],
  cornflower_blue: [100, 149, 237],
  cornsilk: [255, 248, 220],
  cyan: [0, 255, 255],
  dark_goldenrod: [184, 134, 11],
  dark_green: [0, 100, 0],
  dark_khaki: [189, 183, 107],
  dark_olive_green: [85, 107, 47],
  dark_orange: [255, 140, 0],
  dark_orchid: [153, 50, 204],
  dark_salmon: [233, 150, 122],
  dark_slate_blue: [72, 61, 139],
  dark_slate_gray: [47, 79, 79],
  dark_slate_grey: [47, 79, 79],
  dark_turquoise: [0, 206, 209],
  dark_violet: [148, 0, 211],
  deep_pink: [255, 20, 147],
  deep_sky_blue: [0, 191, 255],
  dim_gray: [105, 105, 105],
  dim_grey: [105, 105, 105],
  dodger_blue: [30, 144, 255],
  firebrick: [178, 34, 34],
  floral_white: [255, 250, 240],
  forest_green: [34, 139, 34],
  gainsboro: [220, 220, 220],
  ghost_white: [248, 248, 255],
  gold: [255, 215, 0],
  goldenrod: [218, 165, 32],
  gray: [190, 190, 190],
  green: [0, 255, 0],
  green_yellow: [173, 255, 47],
  grey: [190, 190, 190],
  honeydew: [240, 255, 240],
  hot_pink: [255, 105, 180],
  indian_red: [205, 92, 92],
  khaki: [240, 230, 140],
  lavender: [230, 230, 250],
  lavender_blush: [255, 240, 245],
  lawn_green: [124, 252, 0],
  lemon_chiffon: [255, 250, 205],
  light_blue: [173, 216, 230],
  light_coral: [240, 128, 128],
  light_cyan: [224, 255, 255],
  light_goldenrod: [238, 221, 130],
  light_goldenrod_yellow: [250, 250, 210],
  light_gray: [211, 211, 211],
  light_grey: [211, 211, 211],
  light_pink: [255, 182, 193],
  light_salmon: [255, 160, 122],
  light_sea_green: [32, 178, 170],
  light_sky_blue: [135, 206, 250],
  light_slate_blue: [132, 112, 255],
  light_slate_gray: [119, 136, 153],
  light_slate_grey: [119, 136, 153],
  light_steel_blue: [176, 196, 222],
  light_yellow: [255, 255, 224],
  lime_green: [50, 205, 50],
  linen: [250, 240, 230],
  magenta: [255, 0, 255],
  maroon: [176, 48, 96],
  medium_aquamarine: [102, 205, 170],
  medium_blue: [0, 0, 205],
  medium_orchid: [186, 85, 211],
  medium_purple: [147, 112, 219],
  medium_sea_green: [60, 179, 113],
  medium_slate_blue: [123, 104, 238],
  medium_spring_green: [0, 250, 154],
  medium_turquoise: [72, 209, 204],
  medium_violet_red: [199, 21, 133],
  midnight_blue: [25, 25, 112],
  mint_cream: [245, 255, 250],
  misty_rose: [255, 228, 225],
  moccasin: [255, 228, 181],
  navajo_white: [255, 222, 173],
  navy: [0, 0, 128],
  navy_blue: [0, 0, 128],
  old_lace: [253, 245, 230],
  olive_drab: [107, 142, 35],
  orange: [255, 165, 0],
  orange_red: [255, 69, 0],
  orchid: [218, 112, 214],
  pale_goldenrod: [238, 232, 170],
  pale_green: [152, 251, 152],
  pale_turquoise: [175, 238, 238],
  pale_violet_red: [219, 112, 147],
  papaya_whip: [255, 239, 213],
  peach_puff: [255, 218, 185],
  peru: [205, 133, 63],
  pink: [255, 192, 203],
  plum: [221, 160, 221],
  powder_blue: [176, 224, 230],
  purple: [160, 32, 240],
  red: [255, 0, 0],
  rosy_brown: [188, 143, 143],
  royal_blue: [65, 105, 225],
  saddle_brown: [139, 69, 19],
  salmon: [250, 128, 114],
  sandy_brown: [244, 164, 96],
  sea_green: [46, 139, 87],
  seashell: [255, 245, 238],
  sienna: [160, 82, 45],
  sky_blue: [135, 206, 235],
  slate_blue: [106, 90, 205],
  slate_gray: [112, 128, 144],
  slate_grey: [112, 128, 144],
  snow: [255, 250, 250],
  spring_green: [0, 255, 127],
  steel_blue: [70, 130, 180],
  tan: [210, 180, 140],
  thistle: [216, 191, 216],
  tomato: [255, 99, 71],
  turquoise: [64, 224, 208],
  violet: [238, 130, 238],
  violet_red: [208, 32, 144],
  wheat: [245, 222, 179],
  white: [255, 255, 255],
  white_smoke: [245, 245, 245],
  yellow: [255, 255, 0],
  yellow_green: [154, 205, 50],
  ansi_black: [0, 0, 0],
  ansi_red: [128, 0, 0],
  ansi_green: [0, 179, 0],
  ansi_yellow: [128, 128, 0],
  ansi_blue: [0, 0, 128],
  ansi_magenta: [128, 0, 128],
  ansi_cyan: [0, 128, 128],
  ansi_white: [192, 192, 192],
  ansi_light_black: [128, 128, 128],
  ansi_light_red: [255, 0, 0],
  ansi_light_green: [0, 255, 0],
  ansi_light_yellow: [255, 255, 0],
  ansi_light_blue: [0, 0, 255],
  ansi_light_magenta: [255, 0, 255],
  ansi_light_cyan: [0, 255, 255],
  ansi_light_white: [255, 255, 255],
};

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** `<Frrggbb>` / `<Brrggbb>` for an RGB triple. */
export function rgbCode(fg: boolean, r: number, g: number, b: number): string {
  return `<${fg ? 'F' : 'B'}${hex2(r)}${hex2(g)}${hex2(b)}>`;
}

/** A Mudlet colour name (or `#rrggbb`) as an RGB triple, or null. */
export function mudletColour(name: string): readonly [number, number, number] | null {
  const n = name.trim().toLowerCase();
  const m = /^#([0-9a-f]{6})$/.exec(n);
  if (m) return [parseInt(m[1]!.slice(0, 2), 16), parseInt(m[1]!.slice(2, 4), 16), parseInt(m[1]!.slice(4, 6), 16)];
  return MUDLET_COLOURS[n] ?? null;
}

const RESET = '<088>';

export type EchoKind = 'echo' | 'cecho' | 'decho' | 'hecho';

/**
 * Converts Mudlet colour tags in echo text to our codes: cecho `<name>`,
 * `<fg:bg>`, `<:bg>`; decho `<r,g,b[:r,g,b]>`; hecho `#rrggbb[,rrggbb]`,
 * `|crrggbb`; `<r>`/`<reset>`/`#r` → `<088>`; style tags are dropped.
 * Unknown colour names are left as text and reported in `unknown`.
 */
export function convertColours(kind: EchoKind, text: string, unknown: Set<string> = new Set()): string {
  if (kind === 'echo') return text;
  let t = text;
  if (kind === 'hecho') {
    t = t.replace(/#\/?[biu]\b/g, '').replace(/#r\b/g, RESET);
    t = t.replace(/(?:#|\|c)([0-9a-fA-F]{6})?(?:,([0-9a-fA-F]{6}))?/g, (m, f?: string, b?: string) => {
      if (!f && !b) return m;
      let s = '';
      if (f) s += `<F${f.toLowerCase()}>`;
      if (b) s += `<B${b.toLowerCase()}>`;
      return s;
    });
    return t;
  }
  t = t.replace(/<\/?[bius]>/g, '').replace(/<(?:r|reset)>/g, RESET);
  if (kind === 'decho') {
    return t.replace(/<(?:(\d{1,3}),(\d{1,3}),(\d{1,3})(?:,\d{1,3})?)?(?::(\d{1,3}),(\d{1,3}),(\d{1,3})(?:,\d{1,3})?)?>/g, (m, ...g: Array<string | undefined>) => {
      let s = '';
      if (g[0] !== undefined) s += rgbCode(true, +g[0], +g[1]!, +g[2]!);
      if (g[3] !== undefined) s += rgbCode(false, +g[3], +g[4]!, +g[5]!);
      return s || m;
    });
  }
  return t.replace(/<([a-zA-Z_]*)(?::([a-zA-Z_]+))?>/g, (m, f: string, b?: string) => {
    if (!f && !b) return m;
    const fc = f ? mudletColour(f) : null;
    const bc = b ? mudletColour(b) : null;
    if ((f && !fc) || (b && !bc)) {
      unknown.add(f && !fc ? f : b!);
      return m;
    }
    return (fc ? rgbCode(true, ...fc) : '') + (bc ? rgbCode(false, ...bc) : '');
  });
}

// ---------------------------------------------------------------------------
// Text parts and escaping
// ---------------------------------------------------------------------------

/** A piece of tt++ text: literal text, a variable, or a pattern argument. */
type Part = { lit: string } | { v: string } | { a: number };

const NAME_CHAR = /[A-Za-z0-9_]/;

/**
 * Renders parts as body text: literals escaped (`\;`, `\{`, `\}`, `\\`, and
 * `$`, `&`, `%` where they would substitute), `$name` (`${name}` before a
 * name character), `%n` (`%0n` before a digit).
 */
function renderText(parts: Part[], quote = false): string {
  let out = '';
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]!;
    const next = parts[k + 1];
    const nextFirst = next === undefined ? '' : 'lit' in next ? next.lit[0] ?? '' : 'v' in next ? '$' : '%';
    if ('lit' in p) {
      const s = p.lit;
      for (let i = 0; i < s.length; i++) {
        const c = s[i]!;
        const after = i + 1 < s.length ? s[i + 1]! : nextFirst;
        if (c === '\\' || c === '{' || c === '}' || (c === ';' && !quote) || (c === '"' && quote)) out += '\\' + c;
        else if ((c === '$' || c === '&') && (after === '' ? false : /[A-Za-z_{$&]/.test(after))) out += '\\' + c;
        else if (c === '%' && /[0-9%]/.test(after)) out += '\\' + c;
        else out += c;
      }
    } else if ('v' in p) {
      out += NAME_CHAR.test(nextFirst) ? `\${${p.v}}` : `$${p.v}`;
    } else {
      out += /[0-9]/.test(nextFirst) && p.a < 10 ? `%0${p.a}` : `%${p.a}`;
    }
  }
  return out;
}

/** Literal text escaped for a tt++ body (`;`, braces, and `$`/`&`/`%` that would substitute). */
export function escapeText(s: string): string {
  return renderText(litParts(s));
}

function litParts(s: string): Part[] {
  return s === '' ? [] : [{ lit: s }];
}

function partsText(parts: Part[]): string | null {
  let s = '';
  for (const p of parts) {
    if (!('lit' in p)) return null;
    s += p.lit;
  }
  return s;
}

/** Literal text escaped for a tt++ pattern (a leading `^` stays literal). */
export function literalPattern(text: string): string {
  const t = text.replace(/[\\%{}]/g, '\\$&').replace(/\$$/, '\\$').replace(/^\^/, '\\^');
  // A `$` or `&` before a name would make the pattern substitute variables.
  return t.replace(/[$&](?=[A-Za-z_{])/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Emitter
// ---------------------------------------------------------------------------

export class Unsupported extends Error {
  override name = 'Unsupported';
  constructor(readonly reason: string) {
    super(reason);
  }
}

/** A function defined in a Script, as the inliner sees it. */
export interface LuaFunction {
  name: string;
  params: string[];
  vararg: boolean;
  body: Stmt[];
}

/** What the caller provides: known functions and the gate variables. */
export interface LuaEnv {
  /** Global functions of the user's own Scripts (inlining candidates). */
  functions: ReadonlyMap<string, LuaFunction>;
  /** Names defined by any Script (own or package): calls to them read "calls X". */
  defined: ReadonlySet<string>;
  /** Commands that switch an item on or off by name (`enableTrigger("x")`). */
  gate(name: string, on: boolean): string[];
}

/** The trigger an item body belongs to (null for aliases, keys, timers). */
export interface TriggerContext {
  /** The tt++ patterns of the trigger. */
  patterns: string[];
}

export interface Highlight {
  pattern: string;
  colour: string;
}

export interface Substitute {
  pattern: string;
  text: string;
}

export interface BodyOk {
  ok: true;
  /** tt++ commands, in order (join with `;`). */
  commands: string[];
  /** `deleteLine()`: the trigger's lines are gagged. */
  gag: boolean;
  highlights: Highlight[];
  substitutes: Substitute[];
  warnings: string[];
  /** Globals the body reads (they need a start value). */
  reads: Set<string>;
  /** Globals the body writes. */
  writes: Set<string>;
  /** Texts passed to `send` (rendered), to check against alias names. */
  sends: string[];
}

export type BodyResult = BodyOk | { ok: false; reason: string };

interface Selection {
  /** Highlight/substitute patterns of the selection. */
  patterns: string[];
  fg?: string;
  bg?: string;
  styles: string[];
}

const IDIOM_CALLS = new Set([
  'deleteLine',
  'moveCursor',
  'selectString',
  'selectCurrentLine',
  'fg',
  'bg',
  'setFgColor',
  'setBgColor',
  'setBold',
  'setUnderline',
  'setItalics',
  'resetFormat',
  'deselect',
  'replace',
  'replaceLine',
  'creplaceLine',
  'dreplaceLine',
  'creplace',
  'dreplace',
]);

/** Lua's and Mudlet's library tables: a call into one "uses" it. */
const LUA_LIBS = new Set(['math', 'string', 'table', 'utf8', 'os', 'io', 'coroutine', 'debug', 'db', 'Geyser', 'mmp', 'yajl', 'rex', 'lfs']);

const MAX_INLINE_DEPTH = 3;
const MAX_SPLITS = 4;

type Const = { c: 'nil' } | { c: 'bool'; v: boolean } | { c: 'str'; v: string } | { c: 'num'; v: string };

/** A Lua number literal as tt++ text. */
function numText(v: string): string {
  if (/^\d+(\.\d+)?$/.test(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : v;
}

/** The pattern widened to match the whole line (for line idioms). */
export function wholeLine(pattern: string): string {
  let p = pattern;
  if (!p.startsWith('^')) p = '^%!*' + p;
  if (!(p.endsWith('$') && !p.endsWith('\\$'))) p += '%!*$';
  return p;
}

function callName(fn: Expr): string | null {
  if (fn.k === 'name') return fn.name;
  if (fn.k === 'index' && fn.key.k === 'str') {
    const o = callName(fn.obj);
    return o === null ? null : `${o}.${fn.key.v}`;
  }
  return null;
}

class Emitter {
  readonly warnings = new Set<string>();
  readonly reads = new Set<string>();
  readonly writes = new Set<string>();
  readonly sends: string[] = [];
  readonly highlights: Highlight[] = [];
  readonly substitutes: Substitute[] = [];
  gag = false;
  /** Parameter bindings of the function being inlined (closed expressions). */
  private frame: Map<string, Expr> = new Map();
  private readonly stack: string[] = [];
  /** `a or b` nodes resolved by a statement split. */
  private readonly replaced = new Map<Expr, Expr>();
  private selection: Selection | null = null;

  constructor(
    private readonly env: LuaEnv,
    private readonly trigger: TriggerContext | null,
  ) {}

  // ---------------------------------------------------------- expressions

  /** The expression with bindings and split choices applied (one level). */
  private resolve(e: Expr): Expr {
    let x = e;
    for (let n = 0; n < 50; n++) {
      const r = this.replaced.get(x);
      if (r) x = r;
      else if (x.k === 'paren') x = x.e;
      else if (x.k === 'name' && !x.g && this.frame.has(x.name)) return this.frame.get(x.name)!;
      else return x;
    }
    return x;
  }

  /**
   * A copy of `e` with the current bindings substituted, for passing as an
   * argument: free names are marked global so the callee's parameters
   * cannot capture them.
   */
  private close(e: Expr): Expr {
    if (e.k === 'name') return !e.g && this.frame.has(e.name) ? this.frame.get(e.name)! : { k: 'name', name: e.name, g: true };
    const rep = this.replaced.get(e);
    if (rep) return this.close(rep);
    switch (e.k) {
      case 'paren':
        return this.close(e.e);
      case 'index':
        return { k: 'index', obj: this.close(e.obj), key: this.close(e.key) };
      case 'call':
        return { ...e, fn: this.close(e.fn), args: e.args.map((a) => this.close(a)) };
      case 'bin':
        return { k: 'bin', op: e.op, a: this.close(e.a), b: this.close(e.b) };
      case 'un':
        return { k: 'un', op: e.op, a: this.close(e.a) };
      default:
        return e;
    }
  }

  private constOf(e: Expr): Const | null {
    const r = this.resolve(e);
    switch (r.k) {
      case 'nil':
        return { c: 'nil' };
      case 'true':
        return { c: 'bool', v: true };
      case 'false':
        return { c: 'bool', v: false };
      case 'str':
        return { c: 'str', v: r.v };
      case 'num':
        return { c: 'num', v: numText(r.v) };
      case 'call': {
        const n = callName(r.fn);
        if ((n === 'tonumber' || n === 'tostring') && r.args.length >= 1) return this.constOf(r.args[0]!);
        return null;
      }
      case 'bin': {
        if (r.op === '..') {
          const a = this.constOf(r.a);
          const b = this.constOf(r.b);
          if (a && b && (a.c === 'str' || a.c === 'num') && (b.c === 'str' || b.c === 'num')) return { c: 'str', v: a.v + b.v };
          return null;
        }
        if (r.op === 'or' || r.op === 'and') {
          const a = this.constOf(r.a);
          if (!a) return null;
          const t = truthyConst(a);
          return r.op === 'or' ? (t ? a : this.constOf(r.b)) : t ? this.constOf(r.b) : a;
        }
        return null;
      }
      case 'un':
        if (r.op === 'not') {
          const a = this.constOf(r.a);
          return a ? { c: 'bool', v: !truthyConst(a) } : null;
        }
        return null;
      default:
        return null;
    }
  }

  /** `matches[n]` → the argument number, or null. */
  private matchArg(e: Expr): number | null {
    const r = this.resolve(e);
    if (r.k !== 'index') return null;
    const o = this.resolve(r.obj);
    if (o.k !== 'name' || o.name !== 'matches') return null;
    const key = this.constOf(r.key);
    if (key?.c !== 'num' || !/^\d+$/.test(key.v) || Number(key.v) < 1) throw new Unsupported('uses matches with a computed index');
    return Number(key.v) - 1;
  }

  private globalName(name: string): string {
    if (name === 'matches' || name === 'multimatches') throw new Unsupported(`uses ${name} as a table`);
    if (name === 'line' && this.trigger) throw new Unsupported('uses line');
    if (name === 'gmcp') throw new Unsupported('uses gmcp');
    this.reads.add(name);
    return name;
  }

  /** An expression as text parts. */
  private text(e: Expr): Part[] {
    const r = this.resolve(e);
    const c = this.constOf(r);
    if (c) return c.c === 'nil' ? [] : c.c === 'bool' ? [{ lit: c.v ? '1' : '0' }] : litParts(c.v);
    switch (r.k) {
      case 'name':
        return [{ v: this.globalName(r.name) }];
      case 'index': {
        const n = this.matchArg(r);
        if (n !== null) return [{ a: n }];
        throw new Unsupported(`uses the table field ${describe(r)}`);
      }
      case 'bin':
        if (r.op === '..') return [...this.text(r.a), ...this.text(r.b)];
        if (r.op === 'or') {
          const b = this.constOf(r.b);
          // `x or ""` / `x or nil`: an unset value is already empty text.
          if (b && (b.c === 'nil' || (b.c === 'str' && b.v === ''))) return this.text(r.a);
          throw new SplitNeeded(r);
        }
        if (r.op === 'and') throw new SplitNeeded(r);
        if (['+', '-', '*', '/', '%', '//', '^'].includes(r.op)) throw new Unsupported('arithmetic inside text');
        throw new Unsupported(`uses ${r.op} as a value`);
      case 'call':
        return this.callValue(r);
      case 'un':
        if (r.op === '#') throw new Unsupported('uses # (length)');
        if (r.op === '-') throw new Unsupported('arithmetic inside text');
        throw new Unsupported(`uses ${r.op} as a value`);
      case 'table':
        throw new Unsupported('uses a table');
      case 'func':
        throw new Unsupported('uses a function value');
      case 'vararg':
        throw new Unsupported('uses ...');
      default:
        return [];
    }
  }

  private callValue(r: Extract<Expr, { k: 'call' }>): Part[] {
    if (r.method) {
      if ((r.method === 'upper' || r.method === 'lower') && r.args.length === 0) {
        this.warnings.add('Upper/lower case conversion dropped.');
        return this.text(r.fn);
      }
      throw new Unsupported(`calls :${r.method}()`);
    }
    const n = callName(r.fn) ?? '';
    if (n === 'tostring' || n === 'tonumber') {
      if (r.args.length < 1) throw new Unsupported(`calls ${n}() without an argument`);
      return this.text(r.args[0]!);
    }
    if (/^(?:string|utf8)\.(?:upper|lower)$/.test(n) && r.args.length === 1) {
      this.warnings.add('Upper/lower case conversion dropped.');
      return this.text(r.args[0]!);
    }
    const f = this.env.functions.get(n);
    if (f) return this.inlineValue(f, r.args);
    throw new Unsupported(this.callReason(n, r.fn));
  }

  /** `calls f` for the user's and packages' functions, `uses f` for Mudlet's and Lua's. */
  private callReason(n: string, fn: Expr): string {
    if (!n) return `calls ${describe(fn)}`;
    const table = n.includes('.') ? n.slice(0, n.indexOf('.')) : null;
    if (table !== null && LUA_LIBS.has(table)) return `uses ${n}`;
    if (table !== null || this.env.defined.has(n)) return `calls ${n}`;
    return `uses ${n}`;
  }

  /** A function that is a single `return e`, inlined as a value. */
  private inlineValue(f: LuaFunction, args: Expr[]): Part[] {
    const body = f.body;
    if (body.length !== 1 || body[0]!.k !== 'return' || body[0]!.values.length !== 1) throw new Unsupported(`uses the value of ${f.name}()`);
    const ret = body[0]!.values[0]!;
    return this.withFrame(f, args, () => this.text(ret));
  }

  private withFrame<T>(f: LuaFunction, args: Expr[], fn: () => T): T {
    if (this.stack.includes(f.name)) throw new Unsupported(`calls ${f.name} recursively`);
    if (this.stack.length >= MAX_INLINE_DEPTH) throw new Unsupported(`calls ${f.name} too deep`);
    if (f.vararg) throw new Unsupported(`calls ${f.name} (uses ...)`);
    const frame = new Map<string, Expr>();
    f.params.forEach((p, i) => frame.set(p, args[i] ? this.close(args[i]) : { k: 'nil' }));
    const saved = this.frame;
    this.frame = frame;
    this.stack.push(f.name);
    try {
      return fn();
    } catch (err) {
      if (err instanceof Unsupported && !err.reason.includes(' (in ')) throw new Unsupported(`${err.reason} (in ${f.name})`);
      throw err;
    } finally {
      this.frame = saved;
      this.stack.pop();
    }
  }

  /** Whether an expression is numeric (math context). */
  private isNumeric(e: Expr): boolean {
    const r = this.resolve(e);
    if (r.k === 'num') return true;
    if (r.k === 'str') return /^-?\d+(\.\d+)?$/.test(r.v);
    if (r.k === 'bin') return ['+', '-', '*', '/', '%', '//', '^'].includes(r.op);
    if (r.k === 'un') return r.op === '-';
    if (r.k === 'call') return callName(r.fn) === 'tonumber';
    return false;
  }

  /** An expression for `#math` / numeric comparisons. */
  private math(e: Expr, top = true): string {
    const r = this.resolve(e);
    const c = this.constOf(r);
    if (c) {
      if (c.c === 'num') return c.v;
      if (c.c === 'str' && /^-?\d+(\.\d+)?$/.test(c.v)) return c.v;
      if (c.c === 'bool') return c.v ? '1' : '0';
      throw new Unsupported('arithmetic on text');
    }
    switch (r.k) {
      case 'name':
        return `$${this.globalName(r.name)}`;
      case 'index': {
        const n = this.matchArg(r);
        if (n !== null) return `%${n}`;
        throw new Unsupported(`uses the table field ${describe(r)}`);
      }
      case 'call': {
        const n = callName(r.fn);
        if ((n === 'tonumber' || n === 'tostring') && r.args.length >= 1) return this.math(r.args[0]!, top);
        throw new Unsupported(this.callReason(n ?? '', r.fn));
      }
      case 'un':
        if (r.op === '-') return `-${this.math(r.a, false)}`;
        throw new Unsupported(`uses ${r.op} in arithmetic`);
      case 'bin': {
        const op = r.op === '^' ? '**' : r.op;
        if (!['+', '-', '*', '/', '%', '**'].includes(op)) throw new Unsupported(`uses ${r.op} in arithmetic`);
        if (r.op === '/') this.warnings.add('Division of whole numbers rounds down in tt++.');
        const s = `${this.math(r.a, false)} ${op} ${this.math(r.b, false)}`;
        return top ? s : `(${s})`;
      }
      default:
        throw new Unsupported('arithmetic on a non-number');
    }
  }

  /** A condition for `#if`. */
  cond(e: Expr): string {
    const r = this.resolve(e);
    const c = this.constOf(r);
    if (c) return truthyConst(c) ? '1' : '0';
    if (r.k === 'bin') {
      if (r.op === 'and' || r.op === 'or') {
        const a = this.cond(r.a);
        const b = this.cond(r.b);
        // Constant sides fold away: `x && 1` is x, `x || 0` is x.
        const unit = r.op === 'and' ? '1' : '0';
        if (a === unit) return b;
        if (b === unit) return a;
        if (a === (r.op === 'and' ? '0' : '1')) return a;
        const wrap = (s: string, x: Expr) => {
          const xr = this.resolve(x);
          return xr.k === 'bin' && (xr.op === 'and' || xr.op === 'or') && xr.op !== r.op ? `(${s})` : s;
        };
        return `${wrap(a, r.a)} ${r.op === 'and' ? '&&' : '||'} ${wrap(b, r.b)}`;
      }
      if (['==', '~=', '<', '>', '<=', '>='].includes(r.op)) return this.compare(r.op, r.a, r.b);
    }
    if (r.k === 'un' && r.op === 'not') {
      const inner = this.resolve(r.a);
      if (inner.k === 'bin' && ['==', '~='].includes(inner.op)) return this.compare(inner.op === '==' ? '~=' : '==', inner.a, inner.b);
      return `!(${this.cond(r.a)})`;
    }
    return this.truthy(r);
  }

  private truthy(e: Expr): string {
    const n = this.matchArg(e);
    if (n !== null) return `"%${n}" != ""`;
    const t = renderText(this.text(e), true);
    return `"${t}" != "" && "${t}" != "0"`;
  }

  private compare(op: string, a: Expr, b: Expr): string {
    const ca = this.constOf(a);
    const cb = this.constOf(b);
    if (op === '==' || op === '~=') {
      const eq = op === '==';
      // Comparisons with nil and booleans are truth tests.
      const sides: Array<[Expr, Const | null]> = [
        [a, cb],
        [b, ca],
      ];
      for (const [x, other] of sides) {
        if (other?.c === 'nil') {
          const m = this.matchArg(x);
          const t = m !== null ? `%${m}` : renderText(this.text(x), true);
          return `"${t}" ${eq ? '==' : '!='} ""`;
        }
        if (other?.c === 'bool') return other.v === eq ? this.truthy(x) : `!(${this.truthy(x)})`;
      }
      if (this.isNumeric(a) || this.isNumeric(b) || ca?.c === 'num' || cb?.c === 'num') {
        return `${this.math(a, false)} ${eq ? '==' : '!='} ${this.math(b, false)}`;
      }
      // The right side of a string == is a glob: keep a literal `*` on the left.
      let left = a;
      let right = b;
      if (cb?.c === 'str' && cb.v.includes('*') && !(ca?.c === 'str')) [left, right] = [b, a];
      const l = renderText(this.text(left), true);
      const rt = renderText(this.text(right), true);
      if (this.constOf(right)?.c === 'str' && rt.includes('*')) this.warnings.add('A * in a compared text works as a wildcard in tt++.');
      return `"${l}" ${eq ? '==' : '!='} "${rt}"`;
    }
    return `${this.math(a, false)} ${op} ${this.math(b, false)}`;
  }

  // ----------------------------------------------------------- statements

  /**
   * A block of statements as commands. `top`: the item body's own level
   * (line idioms allowed). `tail`: nothing runs after this block, so a
   * final `return` can be dropped.
   */
  block(stmts: Stmt[], top: boolean, tail: boolean): string[] {
    const out: string[] = [];
    stmts.forEach((s, i) => {
      const last = i === stmts.length - 1;
      if (s.k === 'return') {
        if (!last || !tail) throw new Unsupported('return before the end');
        // `return f(x)` still runs the call; returned values are dropped.
        for (const v of s.values) {
          const r = this.resolve(v);
          if (r.k === 'call') out.push(...this.stmtSplit({ k: 'call', call: r, line: s.line }, top, true));
        }
        return;
      }
      out.push(...this.stmtSplit(s, top, tail && last));
    });
    return out;
  }

  /** A statement, split into `#if` branches for each `a or b` used as text. */
  private stmtSplit(s: Stmt, top: boolean, tail: boolean, depth = 0): string[] {
    try {
      return this.stmt(s, top, tail);
    } catch (err) {
      if (!(err instanceof SplitNeeded)) throw err;
      if (depth >= MAX_SPLITS) throw new Unsupported('too many or/and values');
      if (top && s.k === 'call' && IDIOM_CALLS.has(callName(s.call.k === 'call' ? s.call.fn : s.call) ?? '')) {
        throw new Unsupported('or/and value in a line edit');
      }
      const node = err.node;
      const cond = this.cond(node.a);
      // `a or b`: a when a is truthy. `c and v`: v when c is truthy, else c (falsy).
      const pick = (e: Expr): string[] => {
        this.replaced.set(node, e);
        try {
          return this.stmtSplit(s, top, tail, depth + 1);
        } finally {
          this.replaced.delete(node);
        }
      };
      let yes: string[];
      let no: string[];
      if (node.op === 'or') {
        const a = this.resolve(node.a);
        yes = pick(a.k === 'bin' && a.op === 'and' ? a.b : node.a);
        no = pick(node.b);
      } else {
        yes = pick(node.b);
        no = pick({ k: 'nil' });
      }
      return [ifChain([[cond, yes]], no)];
    }
  }

  private stmt(s: Stmt, top: boolean, tail: boolean): string[] {
    switch (s.k) {
      case 'call':
        return this.callStmt(s.call as Extract<Expr, { k: 'call' }>, top);
      case 'local':
      case 'assign':
        return this.assign(s);
      case 'if':
        return this.ifStmt(s, tail);
      case 'fornum':
      case 'forin':
        return unsupported('for loop');
      case 'while':
        return unsupported('while loop');
      case 'repeat':
        return unsupported('repeat loop');
      case 'do':
        return unsupported('do block');
      case 'break':
        return unsupported('break');
      case 'goto':
      case 'label':
        return unsupported('goto');
      case 'function':
        return unsupported('defines a function');
      default:
        return unsupported('statement');
    }
  }

  private ifStmt(s: Extract<Stmt, { k: 'if' }>, tail: boolean): string[] {
    const arms: Array<[string, string[]]> = [];
    for (const b of s.branches) {
      const c = this.constOf(b.cond);
      if (c) {
        if (truthyConst(c)) {
          // Always taken: the rest of the chain is dead.
          const body = this.block(b.body, false, tail);
          return arms.length === 0 ? body : [ifChain(arms, body)];
        }
        continue;
      }
      arms.push([this.cond(b.cond), this.block(b.body, false, tail)]);
    }
    const orelse = s.orelse ? this.block(s.orelse, false, tail) : null;
    if (arms.length === 0) return orelse ?? [];
    return [ifChain(arms, orelse)];
  }

  private assign(s: Extract<Stmt, { k: 'local' | 'assign' }>): string[] {
    const targets = s.k === 'local' ? s.names : s.targets.map((t) => this.target(t));
    const out: string[] = [];
    if (s.values.length > targets.length || (s.values.length > 1 && s.values.length !== targets.length)) {
      throw new Unsupported('multiple assignment');
    }
    targets.forEach((name, i) => {
      const v = s.values[i];
      if (this.frame.has(name)) throw new Unsupported(`assigns to the parameter ${name}`);
      this.writes.add(name);
      out.push(...this.assignValue(name, v ?? { k: 'nil' }));
    });
    return out;
  }

  private target(t: Expr): string {
    if (t.k === 'name') {
      if (t.name === 'matches') throw new Unsupported('assigns to matches');
      return t.name;
    }
    throw new Unsupported('assigns to a table field');
  }

  private assignValue(name: string, e: Expr): string[] {
    const r = this.resolve(e);
    const set = (v: Expr) => this.assignValue(name, v);
    const isSelf = (x: Expr) => {
      const xr = this.resolve(x);
      return xr.k === 'name' && xr.name === name && !this.frame.has(name);
    };
    const c = this.constOf(r);
    if (c) return [`#variable {${name}} {${constText(c)}}`];
    if (r.k === 'bin' && r.op === 'or') {
      const ca = this.constOf(r.a);
      if (ca) return truthyConst(ca) ? set(r.a) : set(r.b);
      if (isSelf(r.a)) {
        // `x = x or v`: a default.
        const cb = this.constOf(r.b);
        if (cb && (cb.c === 'nil' || (cb.c === 'str' && cb.v === ''))) return [];
        this.reads.add(name);
        return [ifChain([[`"$${name}" == ""`, set(r.b)]], null)];
      }
      const a = this.resolve(r.a);
      const value = a.k === 'bin' && a.op === 'and' ? a.b : r.a;
      if (isSelf(r.b)) return [ifChain([[this.cond(r.a), set(value)]], null)];
      return [ifChain([[this.cond(r.a), set(value)]], set(r.b))];
    }
    if (r.k === 'bin' && ['==', '~=', '<', '>', '<=', '>=', 'and'].includes(r.op)) {
      return [ifChain([[this.cond(r), [`#variable {${name}} {1}`]]], [`#variable {${name}} {0}`])];
    }
    if (r.k === 'un' && r.op === 'not') {
      return [ifChain([[this.cond(r), [`#variable {${name}} {1}`]]], [`#variable {${name}} {0}`])];
    }
    if (this.isNumeric(r) && !(r.k === 'call')) return [`#math {${name}} {${this.math(r)}}`];
    if (r.k === 'call') {
      const n = callName(r.fn);
      if (n === 'tempTimer' || n === 'tempRegexTrigger' || n === 'tempTrigger' || n === 'tempAlias' || n === 'tempKey') {
        throw new Unsupported(`uses ${n}`);
      }
    }
    return [`#variable {${name}} {${renderText(this.text(r))}}`];
  }

  private callStmt(call: Extract<Expr, { k: 'call' }>, top: boolean): string[] {
    if (call.method) throw new Unsupported(`calls ${describe(call.fn)}:${call.method}()`);
    const n = callName(call.fn);
    if (n === null) throw new Unsupported(`calls ${describe(call.fn)}`);
    const args = call.args;
    const arg = (i: number): Expr => args[i] ?? { k: 'nil' };
    if (IDIOM_CALLS.has(n)) return this.idiom(n, args, top);
    switch (n) {
      case 'send':
      case 'expandAlias':
        return this.command(arg(0), n === 'send');
      case 'sendAll':
        return args.filter((a) => this.constOf(a)?.c !== 'bool').flatMap((a) => this.command(a, true));
      case 'echo':
      case 'cecho':
      case 'decho':
      case 'hecho':
      case 'print':
        return this.echo(n === 'print' ? 'echo' : n, args);
      case 'enableTrigger':
      case 'enableAlias':
      case 'enableKey':
      case 'enableTimer':
      case 'disableTrigger':
      case 'disableAlias':
      case 'disableKey':
      case 'disableTimer': {
        const c = this.constOf(arg(0));
        if (c?.c !== 'str') throw new Unsupported(`${n} with a computed name`);
        return this.env.gate(c.v, n.startsWith('enable'));
      }
      case 'tempTimer':
        return this.tempTimer(args);
    }
    const f = this.env.functions.get(n);
    if (f) return this.withFrame(f, args, () => this.block(f.body, false, true));
    throw new Unsupported(this.callReason(n, call.fn));
  }

  private command(e: Expr, isSend: boolean): string[] {
    const parts = this.text(e);
    const t = renderText(parts);
    if (t.trim() === '') {
      this.warnings.add('An empty send was dropped.');
      return [];
    }
    if (t.trimStart().startsWith('#')) throw new Unsupported('sends text that starts with #');
    if (isSend) this.sends.push(t);
    return [t];
  }

  private echo(kind: EchoKind, args: Expr[]): string[] {
    let a = args;
    if (a.length >= 2) {
      const win = this.constOf(a[0]!);
      if (win?.c === 'str' && win.v === 'main') a = a.slice(1);
      else throw new Unsupported(`${kind} to a window`);
    }
    if (a.length === 0) return [];
    const unknown = new Set<string>();
    const parts = this.text(a[0]!).map((p) => ('lit' in p ? { lit: convertColours(kind, p.lit, unknown) } : p));
    if (unknown.size > 0) this.warnings.add(`Unknown colour ${[...unknown].join(', ')} left as text.`);
    // One #showme per line; a final line break is dropped.
    const lines: Part[][] = [[]];
    for (const p of parts) {
      if (!('lit' in p)) {
        lines[lines.length - 1]!.push(p);
        continue;
      }
      const segs = p.lit.split('\n');
      segs.forEach((seg, i) => {
        if (i > 0) lines.push([]);
        if (seg !== '') lines[lines.length - 1]!.push({ lit: seg });
      });
    }
    if (lines.length > 1 && lines[lines.length - 1]!.length === 0) lines.pop();
    return lines.map((l) => `#showme {${renderText(l)}}`);
  }

  private tempTimer(args: Expr[]): string[] {
    const secs = this.constOf(args[0] ?? { k: 'nil' });
    if (!secs || (secs.c !== 'num' && !(secs.c === 'str' && /^\d+(\.\d+)?$/.test(secs.v)))) throw new Unsupported('tempTimer with a computed time');
    const repeat = args[2] ? this.constOf(args[2]) : null;
    if (args[2] && (!repeat || truthyConst(repeat))) throw new Unsupported('repeating tempTimer');
    const f = this.resolve(args[1] ?? { k: 'nil' });
    let body: Stmt[];
    if (f.k === 'func') {
      if (f.params.length > 0 || f.vararg) throw new Unsupported('tempTimer function with parameters');
      body = f.body;
    } else {
      const code = this.constOf(f);
      if (code?.c !== 'str') throw new Unsupported('tempTimer without a function');
      try {
        body = parseLua(code.v);
      } catch (err) {
        throw new Unsupported(`tempTimer code: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const cmds = this.block(body, false, true);
    if (cmds.length === 0) return [];
    return [`#delay {${secs.v}} {${cmds.join(';')}}`];
  }

  // --------------------------------------------------------------- idioms

  private idiom(n: string, args: Expr[], top: boolean): string[] {
    if (!this.trigger) throw new Unsupported(`uses ${n} outside a trigger`);
    if (!top) throw new Unsupported(`uses ${n} inside a condition or function`);
    const str = (i: number): string => {
      const c = this.constOf(args[i] ?? { k: 'nil' });
      if (c?.c !== 'str') throw new Unsupported(`${n} with a computed argument`);
      return c.v;
    };
    const num = (i: number): number => {
      const c = this.constOf(args[i] ?? { k: 'nil' });
      if (c?.c !== 'num') throw new Unsupported(`${n} with a computed argument`);
      return Number(c.v);
    };
    const sel = (): Selection => {
      if (!this.selection) throw new Unsupported(`${n} without a selection`);
      return this.selection;
    };
    switch (n) {
      case 'moveCursor':
      case 'deselect':
      case 'resetFormat':
        this.flush(n === 'deselect');
        return [];
      case 'deleteLine':
        this.gag = true;
        return [];
      case 'selectString': {
        this.flush(true);
        const t = str(0);
        if (t === '') throw new Unsupported('selectString of empty text');
        this.selection = { patterns: [literalPattern(t)], styles: [] };
        return [];
      }
      case 'selectCurrentLine':
        this.flush(true);
        this.selection = { patterns: this.trigger.patterns.map(wholeLine), styles: [] };
        return [];
      case 'fg':
      case 'bg': {
        const name = str(0);
        const rgb = mudletColour(name);
        if (!rgb) throw new Unsupported(`unknown colour ${name}`);
        sel()[n === 'fg' ? 'fg' : 'bg'] = rgbCode(n === 'fg', ...rgb);
        return [];
      }
      case 'setFgColor':
      case 'setBgColor':
        sel()[n === 'setFgColor' ? 'fg' : 'bg'] = rgbCode(n === 'setFgColor', num(0), num(1), num(2));
        return [];
      case 'setBold':
      case 'setUnderline':
      case 'setItalics': {
        const on = this.constOf(args[0] ?? { k: 'true' });
        if (on && truthyConst(on)) sel().styles.push(n === 'setBold' ? '<188>' : n === 'setUnderline' ? '<488>' : '<388>');
        return [];
      }
      case 'replace':
      case 'creplace':
      case 'dreplace': {
        const s = sel();
        const text = this.replacement(n === 'replace' ? 'echo' : n === 'creplace' ? 'cecho' : 'decho', args[0]);
        if (s.patterns.some((p) => !this.trigger!.patterns.includes(p) && !p.startsWith('^%!*')) && /%\d/.test(text)) {
          throw new Unsupported('replace with pattern arguments after selectString');
        }
        for (const p of s.patterns) this.substitutes.push({ pattern: p, text });
        s.fg = undefined;
        s.bg = undefined;
        s.styles = [];
        return [];
      }
      case 'replaceLine':
      case 'creplaceLine':
      case 'dreplaceLine': {
        this.flush(true);
        const text = this.replacement(n === 'replaceLine' ? 'echo' : n === 'creplaceLine' ? 'cecho' : 'decho', args[0]);
        for (const p of this.trigger.patterns) this.substitutes.push({ pattern: wholeLine(p), text });
        return [];
      }
    }
    return unsupported(`uses ${n}`);
  }

  private replacement(kind: EchoKind, e: Expr | undefined): string {
    const unknown = new Set<string>();
    const parts = this.text(e ?? { k: 'nil' }).map((p) => ('lit' in p ? { lit: convertColours(kind, p.lit.replace(/\n$/, ''), unknown) } : p));
    if (unknown.size > 0) this.warnings.add(`Unknown colour ${[...unknown].join(', ')} left as text.`);
    return renderText(parts);
  }

  /** Writes the pending highlight of the selection; `clear` ends the selection. */
  flush(clear: boolean): void {
    const s = this.selection;
    if (s && (s.fg || s.bg || s.styles.length > 0)) {
      const colour = (s.fg ?? '') + (s.bg ?? '') + [...new Set(s.styles)].join('');
      for (const p of s.patterns) this.highlights.push({ pattern: p, colour });
      s.fg = undefined;
      s.bg = undefined;
      s.styles = [];
    }
    if (clear) this.selection = null;
  }
}

/** Thrown when an `a or b` / `a and b` value needs the statement split into `#if` branches. */
class SplitNeeded extends Error {
  constructor(readonly node: Extract<Expr, { k: 'bin' }>) {
    super('split');
  }
}

function unsupported(reason: string): never {
  throw new Unsupported(reason);
}

function truthyConst(c: Const): boolean {
  return !(c.c === 'nil' || (c.c === 'bool' && !c.v));
}

function constText(c: Const): string {
  if (c.c === 'nil') return '';
  if (c.c === 'bool') return c.v ? '1' : '0';
  return renderText(litParts(c.v));
}

/** `#if {c} {…} #elseif {c} {…} #else {…}`. */
function ifChain(arms: Array<[string, string[]]>, orelse: string[] | null): string {
  let s = arms.map(([c, b], i) => `${i === 0 ? '#if' : '#elseif'} {${c}} {${b.join(';')}}`).join(' ');
  if (orelse && orelse.length > 0) s += ` #else {${orelse.join(';')}}`;
  return s;
}

/** Short source form of an expression, for reasons. */
export function describe(e: Expr): string {
  switch (e.k) {
    case 'name':
      return e.name;
    case 'index':
      return e.key.k === 'str' ? `${describe(e.obj)}.${e.key.v}` : `${describe(e.obj)}[…]`;
    case 'call':
      return `${describe(e.fn)}()`;
    case 'paren':
      return describe(e.e);
    default:
      return e.k;
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Translates an item body (`code`) to tt++. */
export function translateBody(code: string, env: LuaEnv, trigger: TriggerContext | null = null): BodyResult {
  let stmts: Stmt[];
  try {
    stmts = parseLua(code);
  } catch (err) {
    return { ok: false, reason: `Lua syntax error: ${err instanceof Error ? err.message : String(err)}` };
  }
  return translateStmts(stmts, env, trigger);
}

export function translateStmts(stmts: Stmt[], env: LuaEnv, trigger: TriggerContext | null = null): BodyResult {
  const em = new Emitter(env, trigger);
  try {
    const commands = em.block(stmts, true, true);
    em.flush(true);
    return {
      ok: true,
      commands,
      gag: em.gag,
      highlights: em.highlights,
      substitutes: em.substitutes,
      warnings: [...em.warnings],
      reads: em.reads,
      writes: em.writes,
      sends: em.sends,
    };
  } catch (err) {
    if (err instanceof Unsupported) return { ok: false, reason: capitalise(err.reason) };
    if (err instanceof SplitNeeded) return { ok: false, reason: 'Uses or/and as a value' };
    throw err;
  }
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A top-level default in a Script: `x = x or v` (conditional) or `x = v`. */
export interface ScriptDefault {
  name: string;
  /** The value as tt++ text. */
  value: string;
  conditional: boolean;
}

export interface ScriptAnalysis {
  /** Global functions (`function f()`, `f = function()`); dotted names are left out. */
  functions: LuaFunction[];
  defaults: ScriptDefault[];
  /** Top-level statements that are neither (the Script cannot be consumed). */
  other: Stmt[];
  /** Every name the Script defines (functions, tables with methods, globals). */
  defined: string[];
  /** Set on a syntax error. */
  error?: string;
}

/** Splits a Script into functions, defaults and the rest. */
export function analyseScript(code: string): ScriptAnalysis {
  const res: ScriptAnalysis = { functions: [], defaults: [], other: [], defined: [] };
  let stmts: Stmt[];
  try {
    stmts = parseLua(code);
  } catch (err) {
    res.error = `Lua syntax error: ${err instanceof Error ? err.message : String(err)}`;
    return res;
  }
  for (const s of stmts) {
    if (s.k === 'function' && !s.local && s.name.k === 'name') {
      res.functions.push({ name: s.name.name, params: s.params, vararg: s.vararg, body: s.body });
      res.defined.push(s.name.name);
      continue;
    }
    if (s.k === 'function') {
      const n = callName(s.name);
      if (n) res.defined.push(n);
      res.other.push(s);
      continue;
    }
    if (s.k === 'assign' && s.targets.length === 1 && s.values.length === 1 && s.targets[0]!.k === 'name') {
      const name = s.targets[0].name;
      const v = s.values[0]!;
      res.defined.push(name);
      if (v.k === 'func') {
        res.functions.push({ name, params: v.params, vararg: v.vararg, body: v.body });
        continue;
      }
      const lit = scriptConst(v);
      if (lit !== null) {
        res.defaults.push({ name, value: lit, conditional: false });
        continue;
      }
      if (v.k === 'bin' && v.op === 'or' && v.a.k === 'name' && v.a.name === name) {
        const d = scriptConst(v.b);
        if (d !== null) {
          res.defaults.push({ name, value: d, conditional: true });
          continue;
        }
      }
    }
    if (s.k === 'assign') for (const t of s.targets) if (t.k === 'name') res.defined.push(t.name);
    res.other.push(s);
  }
  return res;
}

function scriptConst(e: Expr): string | null {
  switch (e.k) {
    case 'str':
      return renderText(litParts(e.v));
    case 'num':
      return numText(e.v);
    case 'true':
      return '1';
    case 'false':
      return '0';
    case 'nil':
      return '';
    default:
      return null;
  }
}

/** Checks a function on its own (parameters as unknown values): null when it is in the subset, else the reason. */
export function checkFunction(f: LuaFunction, env: LuaEnv): string | null {
  const r = translateStmts([{ k: 'call', call: { k: 'call', fn: { k: 'name', name: f.name }, args: f.params.map((p) => ({ k: 'name', name: p })) }, line: 0 }], env);
  return r.ok ? null : r.reason;
}
