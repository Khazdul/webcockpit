// The raw Lua 5.4 C API as wasmoon's emscripten module exports it
// (ADR 0051 "Host bridge on the raw C API"). Only the functions the
// bridge uses are typed. Pointers and `size_t` are 32-bit numbers;
// `lua_Integer` is a 64-bit integer, so it crosses as a bigint.
//
// The upstream build has ASSERTIONS on: every export checks its
// argument count, so each call passes exactly the C arity.

/** A `lua_State*`. */
export type LuaState = number;
/** A pointer into the wasm heap. */
export type Ptr = number;

export interface LuaModule {
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
  addFunction(fn: (...args: number[]) => number | void, sig: string): Ptr;
  removeFunction(fn: Ptr): void;
  _malloc(size: number): Ptr;
  _free(p: Ptr): void;

  _lua_gettop(L: LuaState): number;
  _lua_settop(L: LuaState, idx: number): void;
  _lua_absindex(L: LuaState, idx: number): number;
  _lua_pushvalue(L: LuaState, idx: number): void;
  _lua_checkstack(L: LuaState, n: number): number;
  _lua_type(L: LuaState, idx: number): number;
  _lua_tonumberx(L: LuaState, idx: number, isnum: Ptr): number;
  _lua_toboolean(L: LuaState, idx: number): number;
  _lua_tolstring(L: LuaState, idx: number, len: Ptr): Ptr;
  _lua_pushnil(L: LuaState): void;
  _lua_pushnumber(L: LuaState, n: number): void;
  _lua_pushinteger(L: LuaState, n: bigint): void;
  _lua_pushlstring(L: LuaState, s: Ptr, len: number): Ptr;
  _lua_pushboolean(L: LuaState, b: number): void;
  _lua_pushcclosure(L: LuaState, fn: Ptr, n: number): void;
  _lua_createtable(L: LuaState, narr: number, nrec: number): void;
  _lua_rawget(L: LuaState, idx: number): number;
  _lua_rawgeti(L: LuaState, idx: number, n: bigint): number;
  _lua_rawset(L: LuaState, idx: number): void;
  _lua_rawseti(L: LuaState, idx: number, n: bigint): void;
  _lua_setmetatable(L: LuaState, idx: number): number;
  _lua_next(L: LuaState, idx: number): number;
  _lua_concat(L: LuaState, n: number): void;
  _lua_pcallk(L: LuaState, nargs: number, nresults: number, errfunc: number, ctx: number, k: Ptr): number;
  _lua_error(L: LuaState): number;
  _lua_sethook(L: LuaState, fn: Ptr, mask: number, count: number): void;
  _lua_setupvalue(L: LuaState, funcindex: number, n: number): Ptr;
  _luaL_ref(L: LuaState, t: number): number;
  _luaL_unref(L: LuaState, t: number, ref: number): void;
  _luaL_loadbufferx(L: LuaState, buf: Ptr, size: number, name: Ptr, mode: Ptr): number;
  _luaL_where(L: LuaState, level: number): void;
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

const TYPE_NAMES = ['nil', 'boolean', 'userdata', 'number', 'string', 'table', 'function', 'userdata', 'thread'];

/** Lua's name of a `lua_type` code (`no value` for LUA_TNONE). */
export function typeName(t: number): string {
  return TYPE_NAMES[t] ?? 'no value';
}
