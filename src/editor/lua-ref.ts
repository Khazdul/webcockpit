// The plain Lua a script can use (stage 10 feedback round 3): one doc per
// base function and library member the sandbox keeps (src/lua/sandbox.ts:
// BASE and LIBS, without string.dump), the keywords with their snippets,
// the operators worth a hover, and the names the sandbox removes. Same
// shape as the script API (lua-api.ts), so completion, hover, signature
// help and the manual read both tables the same way. Pure data; a unit
// test checks it against a live sandbox in both directions.
//
// Written for players, not for Lua experts: plain English, short MUME
// examples that compile.

import type { ApiDoc, ApiParam } from './lua-api';

type Extra = Pick<ApiDoc, 'params' | 'returns' | 'more' | 'example'>;

const p = (name: string, type: string, doc: string): ApiParam => ({ name, type, doc });
const fn = (name: string, sig: string, doc: string, x: Extra = {}): ApiDoc => ({ name, kind: 'function', lua: true, sig, doc, ...x });
const val = (name: string, sig: string, doc: string, x: Extra = {}): ApiDoc => ({ name, kind: 'variable', lua: true, sig, doc, ...x });
const lib = (name: string, doc: string, example?: string): ApiDoc => ({
  name,
  kind: 'table',
  lua: true,
  sig: name,
  doc,
  ...(example ? { example } : {}),
});

// -------------------------------------------------------------- shared

const S = p('s', 'string', 'The text to work on. As a method, s is what comes before the colon: line:upper() is string.upper(line).');
const PATTERN = p(
  'pattern',
  'string',
  'A Lua pattern, not a regular expression: %a letter, %d digit, %s space, %w letter or digit, . any character, * + - ? repeat, ^ and $ anchor, ( ) capture, %. a literal dot. See Lua patterns in the manual.',
);
const INIT = p('init', 'number?', 'Where to start looking (1 = the first character; negative counts from the end).');
const GUARD =
  'A pattern with two or more .- .* or .+ may be refused on a long line as too complex (see Sandbox and limits); anchor it and use narrower classes such as %S+ or [^,]+.';
const X = p('x', 'number', 'A number.');
const T = p('t', 'table', 'A table used as a list (keys 1, 2, 3 …).');
const CO = p('co', 'thread', 'A coroutine, from coroutine.create.');

// ------------------------------------------------------------ base

const BASE: readonly ApiDoc[] = [
  fn('assert', 'assert(v, message) → v, …', 'Stops with an error when v is false or nil; otherwise returns all its arguments.', {
    params: [p('v', 'any', 'The value to test.'), p('message', 'string?', 'The error message (default: "assertion failed!").')],
    returns: 'All its arguments, when v is neither false nor nil.',
    example: 'local hp = assert(tonumber("42"), "not a number")',
  }),
  fn('error', 'error(message, level)', 'Stops the running function with an error. The script reports it, or a surrounding pcall catches it.', {
    params: [
      p('message', 'any', 'The error, usually a string.'),
      p('level', 'number?', '1 (default) adds the line of the error call, 2 the line of its caller, 0 no line.'),
    ],
    example: 'local function heal(who)\n  if not who then error("heal: no target", 2) end\n  send("cast \'cure light\' " .. who)\nend',
  }),
  fn('getmetatable', 'getmetatable(v) → table', "The metatable of v, or nil. In scripts a string's metatable is hidden: getmetatable(\"\") gives false.", {
    params: [p('v', 'any', 'Any value.')],
    returns: 'The metatable (or its __metatable field), or nil.',
    example: 'local mt = getmetatable(obj)',
  }),
  fn('ipairs', 'ipairs(t) → iterator', 'Walks a list in order: t[1], t[2], … until the first nil. Use it in a for loop.', {
    params: [T],
    returns: 'An iterator for a generic for: each step gives the index and the value.',
    example: 'local mobs = { "orc", "troll", "wolf" }\nfor i, mob in ipairs(mobs) do\n  echo(i .. ". " .. mob)\nend',
  }),
  fn('next', 'next(t, key) → key, value', 'The key after key in t, and its value (the first ones when key is nil); nil at the end.', {
    params: [p('t', 'table', 'Any table.'), p('key', 'any?', 'The key to continue from; nil for the first.')],
    returns: 'The next key and its value, or nil when there is none.',
    more: ['next(t) == nil is the way to test whether a table is empty (#t only counts a list).'],
    example: 'if next(targets) == nil then echo("No targets.") end',
  }),
  fn('pairs', 'pairs(t) → iterator', 'Walks every key and value of a table, in no particular order. Use it in a for loop.', {
    params: [p('t', 'table', 'Any table, also gmcp, state and settings.')],
    returns: 'An iterator for a generic for: each step gives a key and its value.',
    more: ['Changing or clearing a value during the walk is fine; adding new keys is not.'],
    example: 'for key, value in pairs(gmcp.Char.Vitals) do\n  print(key, value)\nend',
  }),
  fn('pcall', 'pcall(f, ...) → ok, …', 'Calls f with the other arguments and catches any error, so your script goes on.', {
    params: [p('f', 'function', 'The function to call.'), p('...', 'any', 'Arguments for f.')],
    returns: "true and f's results, or false and the error message.",
    example: 'local ok, err = pcall(function()\n  send("say " .. gmcp.Char.Name.name)\nend)\nif not ok then echo("No name yet: " .. tostring(err)) end',
  }),
  fn('rawequal', 'rawequal(a, b) → boolean', 'Whether a and b are the same value, ignoring a __eq metamethod.', {
    params: [p('a', 'any', 'A value.'), p('b', 'any', 'Another value.')],
    returns: 'true or false.',
    example: 'local same = rawequal(a, b)',
  }),
  fn('rawget', 'rawget(t, key) → value', 't[key] without the __index metamethod: only what the table itself holds.', {
    params: [p('t', 'table', 'A table.'), p('key', 'any', 'The key.')],
    returns: 'The value, or nil.',
    example: 'local own = rawget(opts, "food")',
  }),
  fn('rawlen', 'rawlen(v) → number', 'The length of a table or string, ignoring a __len metamethod.', {
    params: [p('v', 'table|string', 'A table or a string.')],
    returns: 'The length.',
    example: 'local n = rawlen(list)',
  }),
  fn('rawset', 'rawset(t, key, value) → t', 'Sets t[key] = value without the __newindex metamethod.', {
    params: [p('t', 'table', 'A table of your own.'), p('key', 'any', 'The key (not nil).'), p('value', 'any', 'The value.')],
    returns: 'The table t.',
    more: ['Refused on the read-only tables: gmcp, state, settings and the libraries.'],
    example: 'rawset(cache, "hp", 100)',
  }),
  fn('select', 'select(n, ...) → …', 'With a number n, the arguments from the n-th on; with "#", how many arguments there are.', {
    params: [p('n', 'number|string', 'A position (negative counts from the end), or "#".'), p('...', 'any', 'The arguments.')],
    returns: 'The arguments from position n, or their count.',
    example: 'local function count(...)\n  return select("#", ...)\nend\necho(count("a", nil, "c")) -- 3',
  }),
  fn('setmetatable', 'setmetatable(t, mt) → t', 'Gives table t the metatable mt (nil removes it). A metatable adds behaviour, such as default values through __index.', {
    params: [p('t', 'table', 'The table.'), p('mt', 'table?', 'The metatable, or nil.')],
    returns: 'The table t.',
    more: [
      'Useful fields: __index (defaults or methods), __newindex, __tostring, __eq, __lt, __le, __len, __call, __concat and the arithmetic ones (__add …).',
      'In scripts a metatable with __gc is refused.',
    ],
    example: 'local defaults = { food = "bread" }\nlocal opts = setmetatable({}, { __index = defaults })\necho(opts.food) -- bread',
  }),
  fn('tonumber', 'tonumber(v, base) → number', 'Turns text such as "42", "3.5" or "0x1F" into a number; nil when it is not one.', {
    params: [p('v', 'any', 'Usually a string, such as a match from a trigger.'), p('base', 'number?', 'The base (2 to 36) for whole numbers, such as 16 for hex.')],
    returns: 'The number, or nil.',
    example: 'local gold = tonumber(matches[2]) or 0',
  }),
  fn('tostring', 'tostring(v) → string', 'Any value as text: numbers, true/false, nil, and tables or functions by their address (or their __tostring).', {
    params: [p('v', 'any', 'Any value.')],
    returns: 'The text.',
    example: 'echo("Ready: " .. tostring(ready))',
  }),
  fn('type', 'type(v) → string', 'The type of v as a word: "nil", "boolean", "number", "string", "table", "function" or "thread".', {
    params: [p('v', 'any', 'Any value.')],
    returns: 'The type name.',
    example: 'if type(gmcp.Char) == "table" then echo("GMCP is here.") end',
  }),
  fn('xpcall', 'xpcall(f, handler, ...) → ok, …', 'Like pcall, but on an error calls handler(message) and returns false and what the handler returns.', {
    params: [p('f', 'function', 'The function to call.'), p('handler', 'function', 'Called with the error message.'), p('...', 'any', 'Arguments for f.')],
    returns: "true and f's results, or false and the handler's result.",
    more: ['In scripts the handler runs after the error has unwound, not at the point of the error.'],
    example: 'local ok, msg = xpcall(risky, function(err)\n  return "risky failed: " .. tostring(err)\nend)',
  }),
  val('_VERSION', '_VERSION', 'The Lua version as text: "Lua 5.4".', { example: 'echo(_VERSION)' }),
];

// ---------------------------------------------------------- string

const STRING: readonly ApiDoc[] = [
  lib(
    'string',
    'Text functions. Each also works as a method on a string: line:upper(), name:sub(1, 3), line:match("%d+"). Lua patterns (match, find, gmatch, gsub) are not regular expressions; see Lua patterns in the manual.',
    'local loud = string.upper("hello")\nlocal same = ("hello"):upper()',
  ),
  fn('string.byte', 'string.byte(s, i, j) → codes…', 'The byte codes of the characters from i to j (i defaults to 1, j to i).', {
    params: [S, p('i', 'number?', 'The first position (default 1).'), p('j', 'number?', 'The last position (default i).')],
    returns: 'One number per byte.',
    example: 'local code = ("A"):byte() -- 65',
  }),
  fn('string.char', 'string.char(...) → string', 'A string made from byte codes: string.char(72, 105) is "Hi".', {
    params: [p('...', 'number', 'Byte codes, 0 to 255.')],
    returns: 'The string.',
    example: 'local bell = string.char(7)',
  }),
  fn('string.find', 'string.find(s, pattern, init, plain) → start, end, …', 'Looks for pattern in s. Gives where the first match starts and ends (and its captures), or nil.', {
    params: [S, PATTERN, INIT, p('plain', 'boolean?', 'true: pattern is plain text, no special characters (fast, never refused).')],
    returns: 'The start and end positions and any captures, or nil when there is no match.',
    more: [GUARD],
    example: 'if line:find("orc", 1, true) then\n  send("kill orc")\nend',
  }),
  fn('string.format', 'string.format(fmt, ...) → string', 'Builds a string from a template: each % item takes the next argument.', {
    params: [
      p('fmt', 'string', 'The template: %d whole number, %s any value as text, %.1f number with one decimal, %5d or %-10s padded, %x hex, %q quoted, %% a percent sign.'),
      p('...', 'any', 'One value per % item, in order.'),
    ],
    returns: 'The finished string.',
    example: 'echo(string.format("HP %d/%d (%.0f%%)", 80, 120, 80 * 100 / 120))',
  }),
  fn('string.gmatch', 'string.gmatch(s, pattern, init) → iterator', 'Walks every match of pattern in s. Each step gives the captures, or the whole match when there are none.', {
    params: [S, PATTERN, INIT],
    returns: 'An iterator for a generic for.',
    more: [GUARD],
    example: 'for n in line:gmatch("%d+") do\n  print(tonumber(n))\nend',
  }),
  fn('string.gsub', 'string.gsub(s, pattern, repl, n) → string, count', 'Replaces the matches of pattern in s. repl is a string (%1 is the first capture), a table (looked up with the match) or a function (called with the captures).', {
    params: [
      S,
      PATTERN,
      p('repl', 'string|table|function', 'What to put instead: text with %0 (whole match) and %1 … (captures), a table, or a function whose result replaces the match (false or nil keeps it).'),
      p('n', 'number?', 'Replace at most this many matches.'),
    ],
    returns: 'The new string, and how many matches were replaced.',
    more: [GUARD, 'Put the call in parentheses to keep only the string: echo((s:gsub("x", "y"))).'],
    example: 'local short = line:gsub("%s+", " ")\nlocal masked = ("pw 1234"):gsub("%d", "*")',
  }),
  fn('string.len', 'string.len(s) → number', 'The length of s in bytes, the same as #s. Letters such as å take two bytes; utf8.len counts characters.', {
    params: [S],
    returns: 'The number of bytes.',
    example: 'if line:len() > 80 then echo("A long line.") end',
  }),
  fn('string.lower', 'string.lower(s) → string', 's in lower case (ASCII letters).', {
    params: [S],
    returns: 'The new string.',
    example: 'if command:lower() == "flee" then echo("Run!") end',
  }),
  fn('string.match', 'string.match(s, pattern, init) → captures…', 'The captures of the first match of pattern in s (or the whole match when there are none), or nil.', {
    params: [S, PATTERN, INIT],
    returns: 'One string per capture, the whole match, or nil when there is no match.',
    more: [GUARD],
    example: 'local who, msg = line:match("^(%a+) tells you \'(.*)\'$")\nif who then uiMessage("tell", who .. ": " .. msg) end',
  }),
  fn('string.pack', 'string.pack(fmt, ...) → string', 'Packs values into a binary string by a format (see string.unpack). Rarely needed in scripts.', {
    params: [p('fmt', 'string', 'The format, such as "i4" for a 4-byte integer.'), p('...', 'any', 'The values.')],
    returns: 'The binary string.',
    example: 'local bin = string.pack("i2", 1000)',
  }),
  fn('string.packsize', 'string.packsize(fmt) → number', 'The size in bytes of a string.pack format.', {
    params: [p('fmt', 'string', 'A pack format with fixed sizes only.')],
    returns: 'The size in bytes.',
    example: 'local size = string.packsize("i4i4")',
  }),
  fn('string.rep', 'string.rep(s, n, sep) → string', 's repeated n times, with sep between the copies.', {
    params: [S, p('n', 'number', 'How many copies.'), p('sep', 'string?', 'Text between the copies (default none).')],
    returns: 'The new string.',
    example: 'echo(string.rep("-", 30))',
  }),
  fn('string.reverse', 'string.reverse(s) → string', 's backwards (byte by byte).', {
    params: [S],
    returns: 'The new string.',
    example: 'local back = ("north"):reverse()',
  }),
  fn('string.sub', 'string.sub(s, i, j) → string', 'The part of s from position i to j, both included. Negative positions count from the end: -1 is the last character.', {
    params: [S, p('i', 'number', 'The first position (1 = the first character).'), p('j', 'number?', 'The last position (default -1, the end).')],
    returns: 'The part, or "" when it is empty.',
    example: 'local first = name:sub(1, 1)\nlocal last3 = name:sub(-3)',
  }),
  fn('string.unpack', 'string.unpack(fmt, s, pos) → values…, next', 'Reads values from a binary string made by string.pack. Rarely needed in scripts.', {
    params: [p('fmt', 'string', 'The format.'), p('s', 'string', 'The binary string.'), p('pos', 'number?', 'Where to start (default 1).')],
    returns: 'The values, then the position after them.',
    example: 'local n = string.unpack("i2", bin)',
  }),
  fn('string.upper', 'string.upper(s) → string', 's in upper case (ASCII letters).', {
    params: [S],
    returns: 'The new string.',
    example: 'cecho("<red>" .. matches[2]:upper() .. "<reset>")',
  }),
];

// ----------------------------------------------------------- table

const TABLE: readonly ApiDoc[] = [
  lib('table', 'Functions for lists: tables with keys 1, 2, 3 …', 'local mobs = {}\ntable.insert(mobs, "orc")\necho(table.concat(mobs, ", "))'),
  fn('table.concat', 'table.concat(t, sep, i, j) → string', 'Joins the strings and numbers of a list into one string, with sep between them.', {
    params: [T, p('sep', 'string?', 'Text between the items (default none).'), p('i', 'number?', 'The first index (default 1).'), p('j', 'number?', 'The last index (default #t).')],
    returns: 'The joined string.',
    example: 'local group = { "Gandalf", "Frodo", "Sam" }\necho("Group: " .. table.concat(group, ", "))',
  }),
  fn('table.insert', 'table.insert(t, [pos,] value)', 'Adds value at the end of a list, or at position pos, moving the later items up.', {
    params: [T, p('pos', 'number?', 'Where to insert. With only two arguments the second is the value and goes at the end.'), p('value', 'any', 'The item to add.')],
    example: 'local seen = {}\ntable.insert(seen, "orc")       -- at the end\ntable.insert(seen, 1, "troll")  -- first',
  }),
  fn('table.move', 'table.move(a1, f, e, t, a2) → a2', 'Copies a1[f] … a1[e] into a2 starting at index t (a2 defaults to a1).', {
    params: [
      p('a1', 'table', 'The list to copy from.'),
      p('f', 'number', 'The first index to copy.'),
      p('e', 'number', 'The last index to copy.'),
      p('t', 'number', 'Where the copy starts in a2.'),
      p('a2', 'table?', 'The list to copy into (default a1).'),
    ],
    returns: 'The table a2.',
    example: 'local copy = table.move(list, 1, #list, 1, {})',
  }),
  fn('table.pack', 'table.pack(...) → table', 'A new list of all its arguments, with the field n set to how many there were (nils included).', {
    params: [p('...', 'any', 'The values.')],
    returns: 'The table.',
    example: 'local args = table.pack(1, nil, 3)\necho(args.n) -- 3',
  }),
  fn('table.remove', 'table.remove(t, pos) → value', 'Removes the item at pos (default: the last) from a list and returns it; later items move down.', {
    params: [T, p('pos', 'number?', 'The index to remove (default #t).')],
    returns: 'The removed item.',
    example: 'local queue = { "n", "e", "s" }\nlocal step = table.remove(queue, 1) -- "n"\nsend(step)',
  }),
  fn('table.sort', 'table.sort(t, comp)', 'Sorts a list in place, smallest first, or by comp(a, b), which returns true when a goes before b.', {
    params: [T, p('comp', 'function?', 'Compares two items; true when the first goes before the second.')],
    example: 'local group = { { name = "Sam", hp = 40 }, { name = "Frodo", hp = 75 } }\ntable.sort(group, function(a, b) return a.hp < b.hp end)\necho(group[1].name .. " is hurt the most")',
  }),
  fn('table.unpack', 'table.unpack(t, i, j) → values…', 'The items of a list as separate values: t[1], t[2], …. In Lua 5.4 there is no plain unpack; use table.unpack.', {
    params: [T, p('i', 'number?', 'The first index (default 1).'), p('j', 'number?', 'The last index (default #t).')],
    returns: 'The items, one value each.',
    example: 'local dirs = { "north", "east" }\nprint(table.unpack(dirs))',
  }),
];

// ------------------------------------------------------------ math

const XS = p('x', 'number', 'An angle in radians.');

const MATH: readonly ApiDoc[] = [
  lib('math', 'Numbers: rounding, limits, random numbers and the usual functions.', 'local pct = math.floor(hp * 100 / maxhp)'),
  fn('math.abs', 'math.abs(x) → number', 'x without its sign: math.abs(-5) is 5.', { params: [X], returns: 'The absolute value.', example: 'local diff = math.abs(hp - lastHp)' }),
  fn('math.acos', 'math.acos(x) → number', 'The arc cosine of x, in radians.', { params: [X], returns: 'An angle in radians.', example: 'local a = math.acos(0.5)' }),
  fn('math.asin', 'math.asin(x) → number', 'The arc sine of x, in radians.', { params: [X], returns: 'An angle in radians.', example: 'local a = math.asin(0.5)' }),
  fn('math.atan', 'math.atan(y, x) → number', 'The arc tangent of y/x, in radians, using both signs to find the quadrant.', {
    params: [p('y', 'number', 'The y value.'), p('x', 'number?', 'The x value (default 1).')],
    returns: 'An angle in radians.',
    example: 'local angle = math.atan(dy, dx)',
  }),
  fn('math.ceil', 'math.ceil(x) → integer', 'x rounded up to a whole number: math.ceil(2.1) is 3.', { params: [X], returns: 'The whole number.', example: 'local rounds = math.ceil(hp / 25)' }),
  fn('math.cos', 'math.cos(x) → number', 'The cosine of an angle in radians.', { params: [XS], returns: 'The cosine.', example: 'local c = math.cos(math.pi)' }),
  fn('math.deg', 'math.deg(x) → number', 'Radians to degrees.', { params: [p('x', 'number', 'An angle in radians.')], returns: 'The angle in degrees.', example: 'local d = math.deg(math.pi) -- 180.0' }),
  fn('math.exp', 'math.exp(x) → number', 'e to the power x.', { params: [X], returns: 'The result.', example: 'local e = math.exp(1)' }),
  fn('math.floor', 'math.floor(x) → integer', 'x rounded down to a whole number: math.floor(2.9) is 2. math.floor(x + 0.5) rounds to the nearest.', {
    params: [X],
    returns: 'The whole number.',
    example: 'local pct = math.floor(hp * 100 / maxhp)',
  }),
  fn('math.fmod', 'math.fmod(x, y) → number', 'The remainder of x / y, with the sign of x (the % operator takes the sign of y).', {
    params: [p('x', 'number', 'The dividend.'), p('y', 'number', 'The divisor.')],
    returns: 'The remainder.',
    example: 'local r = math.fmod(-7, 3) -- -1',
  }),
  val('math.huge', 'math.huge', 'A number larger than any other (infinity). Handy as a start value when you look for a minimum.', {
    example: 'local lowest = math.huge\nfor _, hp in ipairs({ 40, 75 }) do lowest = math.min(lowest, hp) end',
  }),
  fn('math.log', 'math.log(x, base) → number', 'The logarithm of x (natural, or in the given base).', {
    params: [X, p('base', 'number?', 'The base, such as 10 or 2 (default e).')],
    returns: 'The logarithm.',
    example: 'local digits = math.floor(math.log(12345, 10)) + 1',
  }),
  fn('math.max', 'math.max(x, ...) → number', 'The largest of its arguments.', {
    params: [X, p('...', 'number', 'More numbers.')],
    returns: 'The largest.',
    example: 'local best = math.max(10, 42, 7) -- 42',
  }),
  val('math.maxinteger', 'math.maxinteger', 'The largest whole number Lua can hold.', { example: 'local big = math.maxinteger' }),
  fn('math.min', 'math.min(x, ...) → number', 'The smallest of its arguments.', {
    params: [X, p('...', 'number', 'More numbers.')],
    returns: 'The smallest.',
    example: 'local wait = math.min(delay, 5)',
  }),
  val('math.mininteger', 'math.mininteger', 'The smallest (most negative) whole number Lua can hold.', { example: 'local small = math.mininteger' }),
  fn('math.modf', 'math.modf(x) → integer part, fraction', 'Splits x into its whole part and its fraction: math.modf(3.7) gives 3.0 and 0.7.', {
    params: [X],
    returns: 'The whole part (a float) and the fraction.',
    example: 'local whole, frac = math.modf(3.7)',
  }),
  val('math.pi', 'math.pi', 'The number π (3.14159…).', { example: 'local circle = 2 * math.pi * r' }),
  fn('math.rad', 'math.rad(x) → number', 'Degrees to radians.', { params: [p('x', 'number', 'An angle in degrees.')], returns: 'The angle in radians.', example: 'local r = math.rad(90)' }),
  fn('math.random', 'math.random(m, n) → number', 'A random number: math.random() a fraction from 0 up to 1, math.random(n) a whole number 1 … n, math.random(m, n) a whole number m … n.', {
    params: [p('m', 'number?', 'The lowest whole number, or the highest when it is the only argument.'), p('n', 'number?', 'The highest whole number.')],
    returns: 'The random number.',
    example: 'local socials = { "smile", "nod", "wave" }\nsend(socials[math.random(#socials)])',
  }),
  fn('math.randomseed', 'math.randomseed(x, y)', 'Starts the random numbers from a seed, so a sequence can be repeated. Without arguments it picks a random seed (already done at start).', {
    params: [p('x', 'number?', 'The seed.'), p('y', 'number?', 'A second part of the seed.')],
    example: 'math.randomseed(42)',
  }),
  fn('math.sin', 'math.sin(x) → number', 'The sine of an angle in radians.', { params: [XS], returns: 'The sine.', example: 'local s = math.sin(math.pi / 2)' }),
  fn('math.sqrt', 'math.sqrt(x) → number', 'The square root of x.', { params: [X], returns: 'The square root.', example: 'local dist = math.sqrt(dx * dx + dy * dy)' }),
  fn('math.tan', 'math.tan(x) → number', 'The tangent of an angle in radians.', { params: [XS], returns: 'The tangent.', example: 'local t = math.tan(math.pi / 4)' }),
  fn('math.tointeger', 'math.tointeger(x) → integer', 'x as a whole number when it is one (3.0 → 3); nil otherwise.', {
    params: [p('x', 'any', 'A number, or a string that holds one.')],
    returns: 'The integer, or nil.',
    example: 'local n = math.tointeger(3.0) -- 3',
  }),
  fn('math.type', 'math.type(x) → string', '"integer" for a whole number, "float" for a number with a fraction, nil for anything else.', {
    params: [p('x', 'any', 'Any value.')],
    returns: '"integer", "float" or nil.',
    example: 'if math.type(n) == "integer" then echo("whole") end',
  }),
  fn('math.ult', 'math.ult(m, n) → boolean', 'Whether m < n when both are read as unsigned integers. Rarely needed.', {
    params: [p('m', 'number', 'An integer.'), p('n', 'number', 'An integer.')],
    returns: 'true or false.',
    example: 'local less = math.ult(1, -1) -- true',
  }),
];

// ------------------------------------------------------------ utf8

const UTF8_S = p('s', 'string', 'Text in UTF-8, as the game sends it.');

const UTF8: readonly ApiDoc[] = [
  lib('utf8', 'Characters rather than bytes: å or ö take two bytes in a string, but one character.', 'echo(utf8.len("Ålfheim")) -- 7'),
  fn('utf8.char', 'utf8.char(...) → string', 'A string from character codes (code points).', {
    params: [p('...', 'number', 'Code points, such as 229 for å.')],
    returns: 'The UTF-8 string.',
    example: 'local heart = utf8.char(9829) -- ♥',
  }),
  val('utf8.charpattern', 'utf8.charpattern', 'A pattern that matches one UTF-8 character; use it with gmatch to walk the characters of a string.', {
    example: 'for ch in ("Hjälp"):gmatch(utf8.charpattern) do\n  print(ch)\nend',
  }),
  fn('utf8.codepoint', 'utf8.codepoint(s, i, j) → codes…', 'The code points of the characters that start between byte positions i and j.', {
    params: [UTF8_S, p('i', 'number?', 'The first byte position (default 1).'), p('j', 'number?', 'The last byte position (default i).')],
    returns: 'One number per character.',
    example: 'local code = utf8.codepoint("å") -- 229',
  }),
  fn('utf8.codes', 'utf8.codes(s) → iterator', 'Walks the characters of s: each step gives the byte position and the code point.', {
    params: [UTF8_S],
    returns: 'An iterator for a generic for.',
    example: 'for pos, code in utf8.codes("Hjälp") do\n  print(pos, utf8.char(code))\nend',
  }),
  fn('utf8.len', 'utf8.len(s, i, j) → number', 'The number of characters in s (from byte i to j); nil and a position when s is not valid UTF-8.', {
    params: [UTF8_S, p('i', 'number?', 'The first byte position (default 1).'), p('j', 'number?', 'The last byte position (default -1).')],
    returns: 'The number of characters, or nil and the position of the first bad byte.',
    example: 'local width = utf8.len(name) or #name',
  }),
  fn('utf8.offset', 'utf8.offset(s, n, i) → number', 'The byte position where the n-th character starts (counting from byte i).', {
    params: [UTF8_S, p('n', 'number', 'Which character (negative counts from the end).'), p('i', 'number?', 'Where to count from.')],
    returns: 'The byte position, or nil.',
    example: 'local cut = utf8.offset(name, 4)\nlocal first3 = cut and name:sub(1, cut - 1) or name',
  }),
];

// ------------------------------------------------------- coroutine

const COROUTINE: readonly ApiDoc[] = [
  lib('coroutine', 'Functions that pause and resume. Rarely needed in scripts: timers and triggers usually do the job.', 'local co = coroutine.create(function() coroutine.yield(1) end)'),
  fn('coroutine.close', 'coroutine.close(co) → ok, err', 'Ends a suspended or dead coroutine.', {
    params: [CO],
    returns: 'true, or false and the error the coroutine died with.',
    example: 'coroutine.close(co)',
  }),
  fn('coroutine.create', 'coroutine.create(f) → co', 'Makes a coroutine from a function; it starts when you first resume it.', {
    params: [p('f', 'function', 'The body of the coroutine.')],
    returns: 'The coroutine.',
    example: 'local co = coroutine.create(function(a)\n  local b = coroutine.yield(a + 1)\n  return b * 2\nend)',
  }),
  fn('coroutine.isyieldable', 'coroutine.isyieldable() → boolean', 'Whether the running code may call coroutine.yield.', {
    params: [],
    returns: 'true inside a coroutine.',
    example: 'if coroutine.isyieldable() then coroutine.yield() end',
  }),
  fn('coroutine.resume', 'coroutine.resume(co, ...) → ok, …', 'Starts or continues a coroutine; the arguments go to its function or come back from its yield.', {
    params: [CO, p('...', 'any', 'Values passed in.')],
    returns: 'true and the values it yielded or returned, or false and an error.',
    example: 'local ok, v = coroutine.resume(co, 1)',
  }),
  fn('coroutine.running', 'coroutine.running() → co, ismain', 'The running coroutine, and true when it is the main one.', {
    params: [],
    returns: 'The coroutine and a boolean.',
    example: 'local co, main = coroutine.running()',
  }),
  fn('coroutine.status', 'coroutine.status(co) → string', 'The state of a coroutine: "running", "suspended", "normal" or "dead".', {
    params: [CO],
    returns: 'The state.',
    example: 'if coroutine.status(co) == "dead" then co = nil end',
  }),
  fn('coroutine.wrap', 'coroutine.wrap(f) → function', 'Makes a coroutine and returns a function that resumes it; errors pass through.', {
    params: [p('f', 'function', 'The body of the coroutine.')],
    returns: 'A function that resumes it.',
    example: 'local nextDir = coroutine.wrap(function()\n  for _, d in ipairs({ "n", "e", "s", "w" }) do coroutine.yield(d) end\nend)\nsend(nextDir())',
  }),
  fn('coroutine.yield', 'coroutine.yield(...) → …', 'Pauses the running coroutine; its values go to the resume that started it.', {
    params: [p('...', 'any', 'Values passed out.')],
    returns: 'The values passed to the next resume.',
    example: 'coroutine.yield(step)',
  }),
];

/**
 * The Lua names a script can use, by library: the base functions, then
 * string, table, math, utf8, coroutine (each library table first, then
 * its members A–Z). `print` is in SCRIPT_API (ours).
 */
export const LUA_REF: readonly ApiDoc[] = [...BASE, ...STRING, ...TABLE, ...MATH, ...UTF8, ...COROUTINE];

/** The library tables, in the order of LUA_REF. */
export const LUA_LIBS: readonly string[] = ['string', 'table', 'math', 'utf8', 'coroutine'];

/** string functions that make no sense as methods (`s:char()`). */
export const NOT_METHODS: ReadonlySet<string> = new Set(['string.char', 'string.pack', 'string.packsize', 'string.unpack']);

// ------------------------------------------------- keywords, syntax

export interface Snippet {
  /** Shown beside the keyword in the list: `for i = 1, 10 do … end`. */
  detail: string;
  /** CodeMirror snippet template: `${1:name}` fields, `${0}` the last stop, `\t` one indent. */
  template: string;
}

const kw = (name: string, sig: string, doc: string, x: Extra & { snippets?: readonly Snippet[] } = {}): ApiDoc => ({
  name,
  kind: 'keyword',
  lua: true,
  sig,
  doc,
  ...x,
});

const IF_EXAMPLE = 'local hp = 40\nif hp < 30 then\n  send("flee")\nelseif hp < 60 then\n  echo("Careful.")\nelse\n  echo("Fine.")\nend';
const FOR_EXAMPLE = 'for i = 1, 3 do\n  send("kick")\nend\nfor key, value in pairs(gmcp.Char.Vitals) do\n  print(key, value)\nend';
const FN_EXAMPLE = 'local function percent(part, whole)\n  return math.floor(part * 100 / whole)\nend\necho(percent(30, 120) .. "%")';

/** The keywords, with snippets where a block is worth expanding. */
export const LUA_KEYWORDS: readonly ApiDoc[] = [
  kw('if', 'if cond then … elseif cond then … else … end', 'Runs a block only when cond is true. Only false and nil count as false: 0 and "" are true.', {
    example: IF_EXAMPLE,
    snippets: [
      { detail: 'if … then … end', template: 'if ${1:cond} then\n\t${0}\nend' },
      { detail: 'if … then … else … end', template: 'if ${1:cond} then\n\t${2}\nelse\n\t${0}\nend' },
    ],
  }),
  kw('then', 'if cond then … end', 'Ends the condition of an if or elseif; the block to run follows.', { example: IF_EXAMPLE }),
  kw('elseif', 'elseif cond then …', 'Another condition, tried when the ones before it were false.', { example: IF_EXAMPLE }),
  kw('else', 'else …', 'The block of an if that runs when no condition was true.', { example: IF_EXAMPLE }),
  kw('end', '… end', 'Closes a block: if, for, while, do and function each need their own end.', { example: IF_EXAMPLE }),
  kw('for', 'for i = first, last, step do … end\nfor k, v in pairs(t) do … end', 'Repeats a block. The numeric form counts i from first to last (step 1 unless given); the generic form walks a table with pairs or ipairs.', {
    more: ['The loop variables are local to the loop. Change the table you walk only by setting existing keys.'],
    example: FOR_EXAMPLE,
    snippets: [
      { detail: 'for i = 1, n do … end', template: 'for ${1:i} = ${2:1}, ${3:10} do\n\t${0}\nend' },
      { detail: 'for i, v in ipairs(list) do … end', template: 'for ${1:i}, ${2:v} in ipairs(${3:list}) do\n\t${0}\nend' },
      { detail: 'for k, v in pairs(t) do … end', template: 'for ${1:k}, ${2:v} in pairs(${3:t}) do\n\t${0}\nend' },
    ],
  }),
  kw('in', 'for k, v in pairs(t) do … end', 'Separates the variables of a generic for from what it walks (pairs, ipairs, gmatch …).', { example: FOR_EXAMPLE }),
  kw('do', 'while cond do … end\ndo … end', 'Starts the body of a for or while loop, or a block of its own (do … end) that limits where its locals live.', { example: FOR_EXAMPLE }),
  kw('while', 'while cond do … end', 'Repeats a block as long as cond is true; it may run zero times.', {
    example: 'local n = 3\nwhile n > 0 do\n  send("kick")\n  n = n - 1\nend',
    snippets: [{ detail: 'while … do … end', template: 'while ${1:cond} do\n\t${0}\nend' }],
  }),
  kw('repeat', 'repeat … until cond', 'Repeats a block until cond is true; it always runs at least once.', {
    example: 'local n = 0\nrepeat\n  n = n + 1\nuntil n >= 3',
    snippets: [{ detail: 'repeat … until …', template: 'repeat\n\t${0}\nuntil ${1:cond}' }],
  }),
  kw('until', 'repeat … until cond', 'Ends a repeat loop: it stops once cond is true.', { example: 'local n = 0\nrepeat\n  n = n + 1\nuntil n >= 3' }),
  kw('function', 'function name(a, b) … end\nfunction(a, b) … end', 'Makes a function. Named, it is a variable you call later; without a name it is a value you pass, as to tempTrigger.', {
    more: ['Write local function name … so the name stays in your script.'],
    example: FN_EXAMPLE,
    snippets: [
      { detail: 'function(…) … end', template: 'function(${1})\n\t${0}\nend' },
      { detail: 'function name(…) … end', template: 'function ${1:name}(${2})\n\t${0}\nend' },
    ],
  }),
  kw('local', 'local name = value\nlocal function name(…) … end', 'Makes a variable that lives until the end of its block (the function, loop or file). Use it for nearly every variable.', {
    more: ['Without local a name is global to your script; other scripts never see it.'],
    example: 'local hits = 0\nlocal function hit()\n  hits = hits + 1\nend',
    snippets: [{ detail: 'local function name(…) … end', template: 'local function ${1:name}(${2})\n\t${0}\nend' }],
  }),
  kw('return', 'return value, …', 'Ends the function and gives values back to the caller. A function can return several values.', { example: FN_EXAMPLE }),
  kw('break', 'break', 'Leaves the innermost for, while or repeat loop at once.', {
    example: 'for _, mob in ipairs({ "orc", "troll" }) do\n  if mob == "troll" then break end\n  send("kill " .. mob)\nend',
  }),
  kw('goto', 'goto name … ::name::', 'Jumps to a label ::name:: in the same function. Rarely needed: a continue in a loop is the usual use.', {
    example: 'for i = 1, 3 do\n  if i == 2 then goto continue end\n  print(i)\n  ::continue::\nend',
  }),
  kw('and', 'a and b', 'True when both are true. It gives a when a is false or nil, else b: x and x.hp reads hp only when x exists.', {
    example: 'local v = gmcp.Char and gmcp.Char.Vitals',
  }),
  kw('or', 'a or b', 'True when either is true. It gives a when a is true, else b: the usual way to set a default.', {
    example: 'local food = settings.food or "bread"',
  }),
  kw('not', 'not a', 'true when a is false or nil, else false.', { example: 'if not target then echo("No target.") end' }),
  kw('nil', 'nil', 'No value. A variable or table field that was never set is nil; setting a field to nil removes it.', {
    example: 'if gmcp.Room == nil then echo("No room yet.") end',
  }),
  kw('true', 'true', 'The boolean true.', { example: 'local ready = true' }),
  kw('false', 'false', 'The boolean false. Only false and nil count as false in a condition.', { example: 'local ready = false' }),
];

/** Operators and syntax shown on hover. */
export const LUA_SYNTAX: readonly ApiDoc[] = [
  kw('..', 'a .. b', 'Joins two strings (numbers are turned into text). + only adds numbers: "HP: " + 5 is an error.', {
    example: 'echo("HP: " .. hp .. "/" .. maxhp)',
  }),
  kw('...', 'function(...) … end', 'The extra arguments of a function: pass them on, count them with select("#", ...) or collect them with { ... }.', {
    example: 'local function say(...)\n  send("say " .. table.concat({ ... }, " "))\nend',
  }),
  kw('#', '#t  #s', 'The length: of a list (its last index) or of a string (in bytes).', {
    example: 'echo("Group of " .. #members)',
  }),
  kw('~=', 'a ~= b', 'Not equal (Lua writes ~=, not !=). == tests equal.', { example: 'if who ~= "Gandalf" then send("ignore " .. who) end' }),
  kw('--', '-- comment', 'A comment: Lua ignores the rest of the line.', { example: 'send("eat bread") -- before the fight' }),
  kw('--[[', '--[[ … ]]', 'A comment over several lines, up to ]].', { example: '--[[\n  Not used for now:\n  send("hide")\n]]' }),
  kw('[[', '[[ … ]]', 'A long string: it keeps backslashes and line breaks as written. Handy for regular expressions: [[^(\\w+) tells you]].', {
    example: 'tempRegexTrigger([[^You receive (\\d+) coins\\.$]], function()\n  echo("Coins: " .. matches[2])\nend)',
  }),
];

/** Globals and members the sandbox removes: hover says so. */
export const LUA_REMOVED: readonly string[] = [
  'io',
  'os',
  'package',
  'require',
  'debug',
  'load',
  'loadstring',
  'dofile',
  'loadfile',
  'collectgarbage',
  'warn',
  'unpack',
  'string.dump',
];
