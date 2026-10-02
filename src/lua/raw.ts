// The raw Lua 5.4 C API as wasmoon's emscripten module exports it
// (ADR 0051 "Host bridge on the raw C API"). Only the functions the
// bridge uses are typed. Pointers and `size_t` are 32-bit numbers;
// `lua_Integer` is a 64-bit integer, so it crosses as a bigint.
//
// Each call passes exactly the C arity (the upstream build has
// ASSERTIONS on).

/** A `lua_State*`. */
export type LuaState = number;
/** A pointer into the wasm heap. */
export type Ptr = number;

/** The emscripten module: heap views, function table and malloc. */
export interface LuaModule {
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  addFunction(fn: (...args: number[]) => number | void, sig: string): Ptr;
  removeFunction(fn: Ptr): void;
  _malloc(size: number): Ptr;
  _free(p: Ptr): void;
}

/**
 * The C API functions. They are the wasm instance's own exports when
 * load.ts could capture them, otherwise the module's `_name` wrappers
 * (which add an assertion and an `apply` to every call, about 30 ns).
 */
export interface LuaApi {
  lua_gettop(L: LuaState): number;
  lua_settop(L: LuaState, idx: number): void;
  lua_absindex(L: LuaState, idx: number): number;
  lua_pushvalue(L: LuaState, idx: number): void;
  lua_checkstack(L: LuaState, n: number): number;
  lua_type(L: LuaState, idx: number): number;
  lua_tonumberx(L: LuaState, idx: number, isnum: Ptr): number;
  lua_toboolean(L: LuaState, idx: number): number;
  lua_tolstring(L: LuaState, idx: number, len: Ptr): Ptr;
  lua_pushnil(L: LuaState): void;
  lua_pushnumber(L: LuaState, n: number): void;
  lua_pushinteger(L: LuaState, n: bigint): void;
  lua_pushlstring(L: LuaState, s: Ptr, len: number): Ptr;
  lua_pushboolean(L: LuaState, b: number): void;
  lua_pushcclosure(L: LuaState, fn: Ptr, n: number): void;
  lua_createtable(L: LuaState, narr: number, nrec: number): void;
  lua_rawget(L: LuaState, idx: number): number;
  lua_rawgeti(L: LuaState, idx: number, n: bigint): number;
  lua_rawset(L: LuaState, idx: number): void;
  lua_rawseti(L: LuaState, idx: number, n: bigint): void;
  lua_setmetatable(L: LuaState, idx: number): number;
  lua_next(L: LuaState, idx: number): number;
  lua_concat(L: LuaState, n: number): void;
  lua_pcallk(L: LuaState, nargs: number, nresults: number, errfunc: number, ctx: number, k: Ptr): number;
  lua_error(L: LuaState): number;
  lua_sethook(L: LuaState, fn: Ptr, mask: number, count: number): void;
  lua_setupvalue(L: LuaState, funcindex: number, n: number): Ptr;
  luaL_ref(L: LuaState, t: number): number;
  luaL_unref(L: LuaState, t: number, ref: number): void;
  luaL_loadbufferx(L: LuaState, buf: Ptr, size: number, name: Ptr, mode: Ptr): number;
  luaL_where(L: LuaState, level: number): void;
  lua_newuserdatauv(L: LuaState, size: number, nuvalue: number): Ptr;
  lua_touserdata(L: LuaState, idx: number): Ptr;
  lua_getmetatable(L: LuaState, idx: number): number;
  lua_rawequal(L: LuaState, a: number, b: number): number;
  lua_copy(L: LuaState, from: number, to: number): void;
}

/** The names in `LuaApi`. */
export const API_NAMES = [
  'lua_gettop',
  'lua_settop',
  'lua_absindex',
  'lua_pushvalue',
  'lua_checkstack',
  'lua_type',
  'lua_tonumberx',
  'lua_toboolean',
  'lua_tolstring',
  'lua_pushnil',
  'lua_pushnumber',
  'lua_pushinteger',
  'lua_pushlstring',
  'lua_pushboolean',
  'lua_pushcclosure',
  'lua_createtable',
  'lua_rawget',
  'lua_rawgeti',
  'lua_rawset',
  'lua_rawseti',
  'lua_setmetatable',
  'lua_next',
  'lua_concat',
  'lua_pcallk',
  'lua_error',
  'lua_sethook',
  'lua_setupvalue',
  'luaL_ref',
  'luaL_unref',
  'luaL_loadbufferx',
  'luaL_where',
  'lua_newuserdatauv',
  'lua_touserdata',
  'lua_getmetatable',
  'lua_rawequal',
  'lua_copy',
] as const satisfies readonly (keyof LuaApi)[];

/** `LuaApi` through the module's exported wrappers. */
export function apiFromModule(m: LuaModule): LuaApi {
  const mod = m as unknown as Record<string, unknown>;
  const api: Record<string, unknown> = {};
  for (const name of API_NAMES) api[name] = mod['_' + name];
  return api as unknown as LuaApi;
}

/** `LUA_REGISTRYINDEX` (-LUAI_MAXSTACK - 1000). */
export const REGISTRY = -1001000;
/** `LUA_MASKCOUNT`. */
export const MASK_COUNT = 8;
/** `LUA_MINSTACK`: free slots a C function may use without lua_checkstack. */
export const MIN_STACK = 20;

/** `lua_pcall` status codes. */
export const LUA_OK = 0;
export const LUA_ERRSYNTAX = 3;
export const LUA_ERRMEM = 4;

/** `lua_type` codes. */
export const T_NIL = 0;
export const T_BOOLEAN = 1;
export const T_NUMBER = 3;
export const T_STRING = 4;
export const T_TABLE = 5;
export const T_FUNCTION = 6;
export const T_USERDATA = 7;

const TYPE_NAMES = ['nil', 'boolean', 'userdata', 'number', 'string', 'table', 'function', 'userdata', 'thread'];

/** Lua's name of a `lua_type` code (`no value` for LUA_TNONE). */
export function typeName(t: number): string {
  return TYPE_NAMES[t] ?? 'no value';
}
