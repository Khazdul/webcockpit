// The sandbox setup chunk (ADR 0051 "Sandbox"). It runs once per engine,
// right after the standard libraries open, with the real globals, and
// returns:
//
//   1. `base`: what every script's `_ENV` falls back to (`__index`). It
//      holds the whitelisted base functions and read-only proxies of the
//      whitelisted libraries. Host functions are added to it later.
//   2. the metatable of script environments: `__index = base`, with
//      `__metatable = false` so `getmetatable(_ENV)` cannot reach `base`.
//   3. `collectgarbage`, kept by the host (it is not on the whitelist).
//
// Then every global off the whitelist is deleted. `load` is not kept:
// the host compiles scripts with `luaL_loadbufferx` from the C API.
//
// Read-only proxies are shared by all scripts, and nothing can change
// them: `__newindex` raises, `__metatable = false` hides and locks their
// metatables, and `rawset` refuses them. `pairs` works through `__pairs`
// with an iterator that never hands out the real table.
//
// `setmetatable` refuses metatables with `__gc`: a finalizer would run
// during garbage collection, outside a host call and so without the
// instruction budget.
//
// Code that runs while an error raised by the count hook unwinds would
// run with hooks off (Lua clears `allowhook` inside a hook and restores
// it only where a pcall recovers). Two such paths exist and are closed:
//
// - an `xpcall` message handler runs before the unwind. `xpcall` is
//   rebuilt on `pcall`, so its handler runs after it, under the hook
//   (without debug.traceback the difference is not observable);
// - `__close` of a to-be-closed variable in a coroutine killed by the
//   abort (`coroutine.close`, `coroutine.wrap`). `<close>` variables are
//   refused at load time (`findCloseAttrib`), since `__close` is looked
//   up when it runs and cannot be refused in `setmetatable`.
//
// The string metatable is hidden (`getmetatable("")` is false): its
// `__index` is the real `string` table, which must stay unreachable.

export const SANDBOX_SOURCE = `
local G, pairs, next, type, error, rawget, rawset, setmetatable, getmetatable =
  _G, pairs, next, type, error, rawget, rawset, setmetatable, getmetatable
local collectgarbage = collectgarbage

local BASE = {
  assert = true, error = true, getmetatable = true, ipairs = true, next = true,
  pairs = true, pcall = true, print = true, rawequal = true, rawget = true,
  rawlen = true, rawset = true, select = true, setmetatable = true,
  tonumber = true, tostring = true, type = true, xpcall = true, _VERSION = true,
}
local LIBS = { string = true, table = true, math = true, utf8 = true, coroutine = true }

G.string.dump = nil
getmetatable("").__metatable = false

local readonly = setmetatable({}, { __mode = "k" })

local function proxy(name, t)
  local p = {}
  readonly[p] = true
  return setmetatable(p, {
    __index = t,
    __newindex = function()
      error("attempt to modify read-only table '" .. name .. "'", 2)
    end,
    __pairs = function()
      local k
      return function()
        local v
        k, v = next(t, k)
        return k, v
      end
    end,
    __metatable = false,
  })
end

local base = {}
for k in pairs(BASE) do base[k] = G[k] end
for k in pairs(LIBS) do base[k] = proxy(k, G[k]) end

base.rawset = function(t, k, v)
  if readonly[t] then error("attempt to modify read-only table", 2) end
  return rawset(t, k, v)
end

base.setmetatable = function(t, mt)
  if type(mt) == "table" and rawget(mt, "__gc") ~= nil then
    error("__gc metamethods are not allowed in scripts", 2)
  end
  return setmetatable(t, mt)
end

local pcall = pcall
local function xfinish(msgh, ok, ...)
  if ok then return true, ... end
  local _, r = pcall(msgh, (...))
  return false, r
end
base.xpcall = function(f, msgh, ...)
  return xfinish(msgh, pcall(f, ...))
end

for k in pairs(G) do
  if not BASE[k] and not LIBS[k] then G[k] = nil end
end

return base, { __index = base, __metatable = false }, collectgarbage
`;

/**
 * The line of the first `<close>` attribute in `source`, or 0. A light
 * tokenizer that skips comments and strings looks for `local <name>
 * <close>` (or `, <name> <close>` in a local list).
 */
export function findCloseAttrib(source: string): number {
  const n = source.length;
  let line = 1;
  let i = 0;
  // The last four significant tokens.
  let t1 = '';
  let t2 = '';
  let t3 = '';
  let t4 = '';
  const tok = (t: string): boolean => {
    t4 = t3;
    t3 = t2;
    t2 = t1;
    t1 = t;
    return t1 === '>' && t2 === 'close' && t3 === '<' && /^[A-Za-z_]/.test(t4);
  };
  let prev = ''; // the token before t4, checked on a match
  /** Skips a long bracket `[=*[ ... ]=*]` at `i` if there is one; returns false otherwise. */
  const longBracket = (): boolean => {
    let j = i + 1;
    while (source[j] === '=') j++;
    if (source[j] !== '[') return false;
    const close = ']' + '='.repeat(j - i - 1) + ']';
    const end = source.indexOf(close, j + 1);
    const stop = end < 0 ? n : end + close.length;
    for (let k = i; k < stop; k++) if (source.charCodeAt(k) === 10) line++;
    i = stop;
    return true;
  };
  while (i < n) {
    const c = source[i]!;
    if (c === '\n') {
      line++;
      i++;
    } else if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
    } else if (c === '-' && source[i + 1] === '-') {
      i += 2;
      if (source[i] === '[' && longBracket()) continue;
      while (i < n && source[i] !== '\n') i++;
    } else if (c === '[' && (source[i + 1] === '[' || source[i + 1] === '=')) {
      if (!longBracket()) i++;
      prev = t4;
      tok('"');
    } else if (c === '"' || c === "'") {
      i++;
      while (i < n && source[i] !== c && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
      i++;
      prev = t4;
      tok('"');
    } else if (/[A-Za-z0-9_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_.]/.test(source[j]!)) j++;
      const word = source.slice(i, j);
      i = j;
      prev = t4;
      if (tok(word) && (prev === 'local' || prev === ',')) return line;
    } else {
      // `<=`, `<<`, `>=`, `>>` are other operators.
      const two = source.slice(i, i + 2);
      const op = two === '<=' || two === '<<' || two === '>=' || two === '>>' ? two : c;
      i += op.length;
      prev = t4;
      if (tok(op) && (prev === 'local' || prev === ',')) return line;
    }
  }
  return 0;
}
