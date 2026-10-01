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
//   4. `data`: a hidden table the host writes game data into (`gmcp`,
//      `state`; LuaRuntime.setData). Scripts never reach it directly.
//   5. `view(name)`: a deep read-only view of `data[name]`, for the base
//      (LuaRuntime.defineView). Nested tables are wrapped on access, so a
//      script can read `gmcp.Char.Vitals.hp` but change nothing another
//      script sees.
//   6. `freeze(t)`: a deep read-only view of the table `t` (per-script
//      `settings`, the host's API tables).
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
// Pattern guard (ADR 0051 "Package notes — P1"): one Lua pattern search
// is a single C call, so the instruction budget cannot stop it, and
// `("a"):rep(3000):find(".-.-.-b")` backtracks for about a minute.
// `string.find`, `match`, `gmatch` and `gsub` refuse a search whose
// pattern has k items of `.` with `*`, `+` or `-` when
// n^k / k! > PATTERN_COST for a subject of n bytes. Other classes and
// patterns with fewer than two such items are never refused; plain
// `find` is never refused. A heuristic, not a bound: the host's slow-call
// check and hang marker cover the rest.
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

local sbyte, sgsub, sfind, smatch, sgmatch, sformat =
  G.string.byte, G.string.gsub, G.string.find, G.string.match, G.string.gmatch, G.string.format
local PATTERN_COST = 1e8
local qcache, qcount = {}, 0

local function skipset(p, i)
  local j = i + 1
  if sbyte(p, j) == 94 then j = j + 1 end
  if sbyte(p, j) == 93 then j = j + 1 end
  local n = #p
  while j <= n do
    local c = sbyte(p, j)
    if c == 37 then j = j + 2
    elseif c == 93 then return j + 1
    else j = j + 1 end
  end
  return j
end

-- The number of \`.\` items with \`*\`, \`+\` or \`-\` in pattern \`p\`.
local function dots(p)
  local k = qcache[p]
  if k then return k end
  k = 0
  local i, n = 1, #p
  while i <= n do
    local c = sbyte(p, i)
    local item = true
    local dot = c == 46
    if c == 37 then
      local d = sbyte(p, i + 1)
      if d == 98 then i = i + 4; item = false
      elseif d == 102 then
        i = i + 2
        if sbyte(p, i) == 91 then i = skipset(p, i) end
        item = false
      else i = i + 2 end
    elseif c == 91 then i = skipset(p, i)
    elseif c == 40 or c == 41 or (c == 94 and i == 1) then i = i + 1; item = false
    else i = i + 1 end
    if item then
      local q = sbyte(p, i)
      if q == 42 or q == 43 or q == 45 then
        if dot then k = k + 1 end
        i = i + 1
      elseif q == 63 then i = i + 1 end
    end
  end
  if qcount > 256 then qcache, qcount = {}, 0 end
  qcache[p] = k
  qcount = qcount + 1
  return k
end

local function guard(fname, s, p)
  if type(s) ~= "string" or type(p) ~= "string" then return end
  local n = #s
  if n < 64 then return end
  local k = dots(p)
  if k < 2 then return end
  local cost = 1
  for i = 1, k do cost = cost * (n - i + 1) / i end
  if cost > PATTERN_COST then
    error(sformat("pattern too complex for a %d-byte subject (string.%s)", n, fname), 3)
  end
end

G.string.find = function(s, p, init, plain)
  if not plain then guard("find", s, p) end
  return sfind(s, p, init, plain)
end
G.string.match = function(s, p, init)
  guard("match", s, p)
  return smatch(s, p, init)
end
G.string.gmatch = function(s, p, init)
  guard("gmatch", s, p)
  return sgmatch(s, p, init)
end
G.string.gsub = function(s, p, repl, n)
  guard("gsub", s, p)
  return sgsub(s, p, repl, n)
end

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

local function roerror()
  error("attempt to modify a read-only table", 2)
end

-- Deep read-only views: one proxy per real table (weak cache), nested
-- tables wrapped when read.
local wrapped = setmetatable({}, { __mode = "kv" })
local wrap
local function iterate(t)
  local k
  return function()
    local v
    k, v = next(t, k)
    if type(v) == "table" then v = wrap(v) end
    return k, v
  end
end
wrap = function(t)
  local p = wrapped[t]
  if p then return p end
  p = setmetatable({}, {
    __index = function(_, k)
      local v = t[k]
      if type(v) == "table" then return wrap(v) end
      return v
    end,
    __newindex = roerror,
    __len = function() return #t end,
    __pairs = function() return iterate(t) end,
    __metatable = false,
  })
  readonly[p] = true
  wrapped[t] = p
  return p
end

local data = {}
local EMPTY = {}
local function view(name)
  local p = setmetatable({}, {
    __index = function(_, k)
      local t = data[name]
      if type(t) ~= "table" then return nil end
      local v = t[k]
      if type(v) == "table" then return wrap(v) end
      return v
    end,
    __newindex = roerror,
    __len = function()
      local t = data[name]
      return type(t) == "table" and #t or 0
    end,
    __pairs = function()
      local t = data[name]
      return iterate(type(t) == "table" and t or EMPTY)
    end,
    __metatable = false,
  })
  readonly[p] = true
  return p
end

local function freeze(t)
  if type(t) ~= "table" then return t end
  return wrap(t)
end

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

return base, { __index = base, __metatable = false }, collectgarbage, data, view, freeze
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
