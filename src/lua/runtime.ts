// The Lua runtime for user scripts (ADR 0051): one wasmoon engine, one
// environment per script, and a thin bridge on the raw C API.
//
// Every host→Lua call goes through `protectedCall`: `lua_pcallk` with a
// count hook armed. The hook fires every `HOOK_STEP` instructions and
// counts; past the budget it raises and "poisons" the state (count 1 on
// the running thread and the main thread), so every further instruction
// raises again and neither `pcall` nor a coroutine can swallow the abort.
// The hook is cleared after the call. Nested calls (a host function that
// calls back into Lua) share the outermost call's budget.
//
// Memory: the engine's allocator refuses to grow past `memoryMax` while
// Lua runs. Between calls the host pushes arguments outside any
// protected call, where a Lua memory error would panic, so the limit is
// raised by `MEMORY_HEADROOM` there. After an out-of-memory abort the
// host runs a full collection.
//
// Host functions are C closures (`addFunction`). A JS exception in one
// becomes a Lua error at the caller's line. The emscripten build
// implements longjmp (Lua errors) as `throw Infinity`, which must pass
// through JS frames untouched, so the closures rethrow it.
//
// Nothing here uses wasmoon's wrapper calls (they bypass the hook and
// cost 5–20 µs) or doStringSync (it leaves values on the stack).

import type { LuaEngine } from 'wasmoon';
import {
  LUA_ERRMEM,
  LUA_OK,
  MASK_COUNT,
  MIN_STACK,
  REGISTRY,
  T_BOOLEAN,
  T_FUNCTION,
  T_NIL,
  T_NUMBER,
  T_STRING,
  T_TABLE,
  T_USERDATA,
  typeName,
  apiFromModule,
  type LuaApi,
  type LuaModule,
  type LuaState,
  type Ptr,
} from './raw';
import { SANDBOX_SOURCE, findCloseAttrib } from './sandbox';

/** Instructions per host→Lua call (ADR 0051). */
export const DEFAULT_INSTRUCTION_BUDGET = 1_000_000;
/** Lua heap limit for all scripts together (ADR 0051). */
export const DEFAULT_MEMORY_MAX = 32 * 1024 * 1024;
/** Extra heap allowed while the host pushes values outside a protected call. */
export const MEMORY_HEADROOM = 4 * 1024 * 1024;
const BUDGET_MESSAGE = 'instruction budget exceeded';
/** Instructions between two runs of the count hook. */
const HOOK_STEP = 10_000;
/** Nesting limit when converting tables either way. */
const MAX_DEPTH = 32;
/** Initial size of the shared UTF-8 buffer; it grows on demand. */
const BUF_INITIAL = 4096;

/**
 * A Lua value as JS sees it. nil is `undefined`. A table whose keys are
 * exactly 1..n is an array, any other table an object (number keys
 * become strings). Functions, threads and userdata read as `undefined`.
 */
export type LuaValue = undefined | boolean | number | string | LuaValue[] | { [key: string]: LuaValue };

/**
 * A registry reference to a Lua function, owned by one script and
 * released when the script unloads.
 */
export type LuaRef = number & { readonly __luaRef: unique symbol };

/** Why a call failed. */
export type FailKind = 'error' | 'budget' | 'memory';

/**
 * The outcome of a host→Lua call. `message` carries `<script>:<line>:`
 * when Lua knows the line. After `budget` or `memory` the caller is
 * expected to disable the script (ADR 0051).
 */
export type CallResult = { ok: true; value: LuaValue } | { ok: false; kind: FailKind; message: string };

/** The outcome of `check`: compiled (and thrown away) or why not. */
export type CheckResult = { ok: true } | { ok: false; kind: 'syntax' | 'memory'; message: string };

/** The outcome of `loadScript`. `syntax` is a compile error. */
export type LoadResult = { ok: true; script: LuaScript } | { ok: false; kind: FailKind | 'syntax'; message: string };

/**
 * A class of host objects (`defineClass`): userdata whose methods are host
 * functions, called with `:` (`pane:echo("x")`).
 */
export interface LuaClass {
  readonly name: string;
  /** @internal The metatable's registry reference. */
  readonly metaRef: number;
}

/**
 * Returned by a host function (or passed as a call argument): the object
 * of `cls` with handle `id`. The same `id` gives the same Lua value while
 * a script holds it.
 */
export class LuaObject {
  readonly cls: LuaClass;
  readonly id: number;
  constructor(cls: LuaClass, id: number) {
    this.cls = cls;
    this.id = id;
  }
}

/** Returned by a host function: several results (`return a, b` in Lua). */
export class LuaMulti {
  readonly values: readonly unknown[];
  constructor(...values: unknown[]) {
    this.values = values;
  }
}

/**
 * A host function exposed to Lua. It reads its arguments from `args` and
 * returns at most one value (`undefined` returns nothing). A thrown
 * error becomes a Lua error at the calling line.
 */
export type HostFunction = (args: LuaArgs) => unknown;

export interface LuaRuntimeOptions {
  /** Default `DEFAULT_MEMORY_MAX`. */
  memoryMax?: number;
  /** Default `DEFAULT_INSTRUCTION_BUDGET`. */
  instructionBudget?: number;
}

/** Counters for tests and diagnostics. */
export interface LuaStats {
  /** Lua stack top of the main thread; constant between calls. */
  top: number;
  /** Bytes the Lua heap uses. */
  memoryUsed: number;
  /** Scripts loaded. */
  scripts: number;
  /** True when the bridge calls the wasm exports directly (load.ts). */
  direct: boolean;
}

/**
 * One loaded script: its environment and every registry reference made
 * while its code ran. `unload` releases all of them.
 */
export class LuaScript {
  readonly name: string;
  /** @internal */ envRef: number;
  /** @internal */ readonly refs = new Set<number>();
  private readonly rt: LuaRuntime;

  /** @internal */
  constructor(rt: LuaRuntime, name: string, envRef: number) {
    this.rt = rt;
    this.name = name;
    this.envRef = envRef;
  }

  get loaded(): boolean {
    return this.envRef >= 0;
  }

  /**
   * Calls the function `fn` (a reference this script owns) with `args`:
   * strings, numbers, booleans, null/undefined (nil), and plain objects
   * and arrays (pushed as new tables). Returns the first result.
   */
  call(fn: LuaRef, ...args: unknown[]): CallResult {
    return this.rt.callRef(this, fn, args);
  }

  /** Releases one reference (a killed trigger, say). */
  release(fn: LuaRef): void {
    if (this.refs.delete(fn)) this.rt.unref(fn);
  }

  /**
   * Sets `name` in this script's own environment (a global only this
   * script sees). `readonly` wraps a table in a deep read-only view
   * (`settings`). Converted like a call argument.
   */
  setEnv(name: string, value: unknown, readonly = false): void {
    this.rt.setEnvValue(this, name, value, readonly);
  }

  /** Releases the environment and every reference. Idempotent. */
  unload(): void {
    this.rt.unloadScript(this);
  }
}

/**
 * Argument reader handed to a host function. Indexes are Lua's, from 1.
 * The checked readers throw `bad argument #i to '<name>' (...)`, which
 * reaches Lua as an error.
 */
export class LuaArgs {
  /** The function's name, for error messages. */
  readonly name: string;
  /** @internal */ L: LuaState = 0;
  private readonly rt: LuaRuntime;

  /** @internal */
  constructor(rt: LuaRuntime, name: string) {
    this.rt = rt;
    this.name = name;
  }

  /** Number of arguments passed. */
  get count(): number {
    return this.rt.c.lua_gettop(this.L);
  }

  /** Lua type name of argument `i` (`no value` past the end). */
  type(i: number): string {
    return typeName(this.rt.c.lua_type(this.L, i));
  }

  /** A string (numbers are converted, as in Lua). */
  string(i: number): string {
    const t = this.rt.c.lua_type(this.L, i);
    if (t !== T_STRING && t !== T_NUMBER) throw this.bad(i, 'string', t);
    return this.rt.readString(this.L, i);
  }

  optString(i: number, def: string): string {
    return this.rt.c.lua_type(this.L, i) <= T_NIL ? def : this.string(i);
  }

  number(i: number): number {
    const t = this.rt.c.lua_type(this.L, i);
    if (t === T_NUMBER) return this.rt.c.lua_tonumberx(this.L, i, 0);
    if (t === T_STRING) {
      const n = Number(this.rt.readString(this.L, i));
      if (!Number.isNaN(n)) return n;
    }
    throw this.bad(i, 'number', t);
  }

  optNumber(i: number, def: number): number {
    return this.rt.c.lua_type(this.L, i) <= T_NIL ? def : this.number(i);
  }

  /** Lua truthiness: false only for nil, false and a missing argument. */
  boolean(i: number): boolean {
    return this.rt.c.lua_toboolean(this.L, i) !== 0;
  }

  /** A function, as a new reference owned by the running script. */
  function(i: number): LuaRef {
    const t = this.rt.c.lua_type(this.L, i);
    if (t !== T_FUNCTION) throw this.bad(i, 'function', t);
    return this.rt.newRef(this.L, i);
  }

  optFunction(i: number): LuaRef | null {
    return this.rt.c.lua_type(this.L, i) <= T_NIL ? null : this.function(i);
  }

  /**
   * The handle of an object of `cls` (`LuaObject.id`); throws `bad
   * argument` for anything else, with a hint to call methods with `:`.
   */
  object(i: number, cls: LuaClass): number {
    const c = this.rt.c;
    const L = this.L;
    const t = c.lua_type(L, i);
    if (t === T_USERDATA && c.lua_getmetatable(L, i) !== 0) {
      c.lua_rawgeti(L, REGISTRY, BigInt(cls.metaRef));
      const same = c.lua_rawequal(L, -1, -2) !== 0;
      c.lua_settop(L, -3);
      if (same) return this.rt.m.HEAPU32[c.lua_touserdata(L, i) >> 2]!;
    }
    const hint = i === 1 ? `; call it as ${cls.name.toLowerCase()}:${this.name.split(':')[1] ?? this.name}(…)` : '';
    throw new Error(`bad argument #${i} to '${this.name}' (${cls.name.toLowerCase()} expected, got ${typeName(t)}${hint})`);
  }

  /** A table, converted to JS (see `LuaValue`). */
  table(i: number): LuaValue[] | { [key: string]: LuaValue } {
    const t = this.rt.c.lua_type(this.L, i);
    if (t !== T_TABLE) throw this.bad(i, 'table', t);
    return this.rt.toJs(this.L, i, 0) as LuaValue[] | { [key: string]: LuaValue };
  }

  /** Any argument, converted to JS. */
  value(i: number): LuaValue {
    return this.rt.toJs(this.L, i, 0);
  }

  private bad(i: number, expected: string, got: number): Error {
    return new Error(`bad argument #${i} to '${this.name}' (${expected} expected, got ${typeName(got)})`);
  }
}

/**
 * The runtime. Create it with `loadLuaRuntime()` (src/lua/load.ts), once
 * per app; every script shares it.
 */
export class LuaRuntime {
  /** @internal */ readonly m: LuaModule;
  /** @internal */ readonly c: LuaApi;
  private readonly engine: LuaEngine;
  private readonly L: LuaState;
  private readonly direct: boolean;
  private readonly memoryMax: number;
  private readonly budgetFires: number;
  private readonly enc = new TextEncoder();
  private readonly dec = new TextDecoder();
  private readonly scripts = new Set<LuaScript>();
  private readonly functions: Ptr[] = [];
  private readonly hook: Ptr;
  private readonly lenPtr: Ptr;
  private readonly modePtr: Ptr;
  private buf: Ptr;
  private bufCap: number;
  private bufView: Uint8Array;
  private baseRef: number;
  private envMetaRef: number;
  private collectRef: number;
  private dataRef: number;
  private viewRef: number;
  private freezeRef: number;
  /** Weak-valued table: object id → its userdata (LuaObject identity). */
  private objectsRef: number;
  /** The thread whose stack the host uses now (a coroutine inside a host function). */
  private activeL: LuaState;
  private depth = 0;
  private fires = 0;
  private poisoned = false;
  private owner: LuaScript | null = null;
  private closed = false;

  /** @internal Use `loadLuaRuntime()`. */
  constructor(engine: LuaEngine, options: LuaRuntimeOptions = {}, api?: LuaApi) {
    this.engine = engine;
    this.m = engine.global.lua.module as unknown as LuaModule;
    this.c = api ?? apiFromModule(this.m);
    this.direct = api !== undefined;
    this.L = this.activeL = engine.global.address;
    this.memoryMax = options.memoryMax ?? DEFAULT_MEMORY_MAX;
    this.budgetFires = Math.max(1, Math.ceil((options.instructionBudget ?? DEFAULT_INSTRUCTION_BUDGET) / HOOK_STEP));
    this.engine.global.setMemoryMax(this.memoryMax + MEMORY_HEADROOM);
    const m = this.m;
    const c = this.c;
    this.lenPtr = m._malloc(4);
    this.modePtr = this.cString('t');
    this.bufCap = BUF_INITIAL;
    this.buf = m._malloc(this.bufCap);
    this.bufView = m.HEAPU8.subarray(this.buf, this.buf + this.bufCap);
    this.hook = m.addFunction((Lp: number) => this.onHook(Lp), 'vii');

    // Sandbox: run the setup chunk unguarded (it is ours) and keep its
    // six results.
    const L = this.L;
    const top = c.lua_gettop(L);
    const name = this.cString('=sandbox');
    const len = this.encode(SANDBOX_SOURCE);
    let st = c.luaL_loadbufferx(L, this.buf, len, name, this.modePtr);
    m._free(name);
    if (st === LUA_OK) st = c.lua_pcallk(L, 0, 6, 0, 0, 0);
    if (st !== LUA_OK) {
      const msg = this.errorMessage(L);
      c.lua_settop(L, top);
      throw new Error(`lua sandbox setup failed: ${msg}`);
    }
    this.freezeRef = c.luaL_ref(L, REGISTRY);
    this.viewRef = c.luaL_ref(L, REGISTRY);
    this.dataRef = c.luaL_ref(L, REGISTRY);
    this.collectRef = c.luaL_ref(L, REGISTRY);
    this.envMetaRef = c.luaL_ref(L, REGISTRY);
    this.baseRef = c.luaL_ref(L, REGISTRY);
    c.lua_createtable(L, 0, 0);
    c.lua_createtable(L, 0, 1);
    this.pushString(L, '__mode');
    this.pushString(L, 'v');
    c.lua_rawset(L, -3);
    c.lua_setmetatable(L, -2);
    this.objectsRef = c.luaL_ref(L, REGISTRY);
    c.lua_settop(L, top);
  }

  /** The script whose code is running, or null between calls. */
  get current(): LuaScript | null {
    return this.owner;
  }

  /**
   * Compiles `source` as `loadScript` would and throws the chunk away:
   * nothing runs, nothing is registered. For live error checks (the
   * script editor, the Scripts page). Failures are `syntax` (with the
   * `<close>` refusal) or `memory`.
   */
  check(name: string, source: string): CheckResult {
    this.assertOpen();
    const closeLine = findCloseAttrib(source);
    if (closeLine > 0) {
      return { ok: false, kind: 'syntax', message: `${name}:${closeLine}: <close> variables are not allowed in scripts` };
    }
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    const chunkName = this.cString('@' + name);
    const len = this.encode(source);
    const st = c.luaL_loadbufferx(L, this.buf, len, chunkName, this.modePtr);
    this.m._free(chunkName);
    const message = st === LUA_OK ? '' : this.errorMessage(L);
    c.lua_settop(L, top);
    if (st === LUA_OK) return { ok: true };
    return { ok: false, kind: st === LUA_ERRMEM ? 'memory' : 'syntax', message };
  }

  /**
   * Compiles `source` as chunk `@<name>` (so errors read `name:line:`)
   * in a new environment and runs it under the budget. On failure
   * everything the chunk registered is released.
   */
  loadScript(name: string, source: string, opts: { readonly?: Record<string, unknown> } = {}): LoadResult {
    this.assertOpen();
    const closeLine = findCloseAttrib(source);
    if (closeLine > 0) {
      return { ok: false, kind: 'syntax', message: `${name}:${closeLine}: <close> variables are not allowed in scripts` };
    }
    const m = this.m;
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    c.lua_createtable(L, 0, 4);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.envMetaRef));
    c.lua_setmetatable(L, -2);
    this.pushString(L, '_G');
    c.lua_pushvalue(L, -2);
    c.lua_rawset(L, -3);
    if (opts.readonly) {
      for (const [k, v] of Object.entries(opts.readonly)) {
        this.pushString(L, k);
        this.pushFrozen(L, v);
        c.lua_rawset(L, -3);
      }
    }
    const envRef = c.luaL_ref(L, REGISTRY);

    const chunkName = this.cString('@' + name);
    const len = this.encode(source);
    const st = c.luaL_loadbufferx(L, this.buf, len, chunkName, this.modePtr);
    m._free(chunkName);
    if (st !== LUA_OK) {
      const message = this.errorMessage(L);
      c.lua_settop(L, top);
      c.luaL_unref(L, REGISTRY, envRef);
      return { ok: false, kind: st === LUA_ERRMEM ? 'memory' : 'syntax', message };
    }
    // The main chunk's only upvalue is _ENV.
    c.lua_rawgeti(L, REGISTRY, BigInt(envRef));
    c.lua_setupvalue(L, -2, 1);

    const script = new LuaScript(this, name, envRef);
    this.scripts.add(script);
    const r = this.protectedCall(script, L, top, 0);
    if (r.ok) return { ok: true, script };
    this.unloadScript(script);
    return r;
  }

  /**
   * Adds a host function to the shared base under `name`; every script
   * sees it unless it shadows the name. Redefining a name replaces it
   * for new lookups (closures already fetched keep the old one).
   */
  defineFunction(name: string, impl: HostFunction): void {
    this.assertOpen();
    const fp = this.closure(name, impl);
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.baseRef));
    this.pushString(L, name);
    c.lua_pushcclosure(L, fp, 0);
    c.lua_rawset(L, -3);
    c.lua_settop(L, top);
  }

  /**
   * Adds a read-only table of host functions to the base under `name`
   * (`store.get`, `store.set`): no script can replace a function in it
   * for the others. Define each table once.
   */
  defineTable(name: string, fns: Record<string, HostFunction>): void {
    this.assertOpen();
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    const ptrs = Object.entries(fns).map(([k, impl]) => [k, this.closure(`${name}.${k}`, impl)] as const);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.baseRef));
    this.pushString(L, name);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.freezeRef));
    c.lua_createtable(L, 0, ptrs.length);
    for (const [k, fp] of ptrs) {
      this.pushString(L, k);
      c.lua_pushcclosure(L, fp, 0);
      c.lua_rawset(L, -3);
    }
    const st = c.lua_pcallk(L, 1, 1, 0, 0, 0);
    if (st !== LUA_OK) {
      c.lua_settop(L, top);
      throw new Error(`defineTable ${name} failed`);
    }
    c.lua_rawset(L, -3);
    c.lua_settop(L, top);
  }

  /**
   * A class of host objects (`LuaObject`): userdata with the metatable
   * `{ __index = methods, __name = name, __metatable = false }`, where
   * `methods` is a read-only table of host functions that read the object
   * with `args.object(1, cls)`. Nothing is put in the base; a host
   * function hands out objects by returning `new LuaObject(cls, id)`.
   * Define each class once.
   */
  defineClass(name: string, methods: Record<string, HostFunction>): LuaClass {
    this.assertOpen();
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    const low = name.toLowerCase();
    const ptrs = Object.entries(methods).map(([k, impl]) => [k, this.closure(`${low}:${k}`, impl)] as const);
    c.lua_createtable(L, 0, 3);
    this.pushString(L, '__index');
    c.lua_rawgeti(L, REGISTRY, BigInt(this.freezeRef));
    c.lua_createtable(L, 0, ptrs.length);
    for (const [k, fp] of ptrs) {
      this.pushString(L, k);
      c.lua_pushcclosure(L, fp, 0);
      c.lua_rawset(L, -3);
    }
    if (c.lua_pcallk(L, 1, 1, 0, 0, 0) !== LUA_OK) {
      c.lua_settop(L, top);
      throw new Error(`defineClass ${name} failed`);
    }
    c.lua_rawset(L, -3);
    this.pushString(L, '__name');
    this.pushString(L, name);
    c.lua_rawset(L, -3);
    this.pushString(L, '__metatable');
    c.lua_pushboolean(L, 0);
    c.lua_rawset(L, -3);
    const metaRef = c.luaL_ref(L, REGISTRY);
    c.lua_settop(L, top);
    return { name, metaRef };
  }

  /** The object of `cls` with handle `id`, to return from a host function. */
  object(cls: LuaClass, id: number): LuaObject {
    return new LuaObject(cls, id);
  }

  /** Several results, to return from a host function. */
  multi(...values: unknown[]): LuaMulti {
    return new LuaMulti(...values);
  }

  /** Pushes the userdata of `o` (the cached one while Lua still holds it). */
  private pushObject(L: LuaState, o: LuaObject): void {
    const c = this.c;
    c.lua_checkstack(L, 4);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.objectsRef));
    if (c.lua_rawgeti(L, -1, BigInt(o.id)) !== T_USERDATA) {
      c.lua_settop(L, -2);
      const p = c.lua_newuserdatauv(L, 4, 0);
      this.m.HEAPU32[p >> 2] = o.id >>> 0;
      c.lua_rawgeti(L, REGISTRY, BigInt(o.cls.metaRef));
      c.lua_setmetatable(L, -2);
      c.lua_pushvalue(L, -1);
      c.lua_rawseti(L, -3, BigInt(o.id));
    }
    c.lua_copy(L, -1, -2);
    c.lua_settop(L, -2);
  }

  /**
   * Puts a deep read-only view of the hidden data table `name` in the
   * base (`gmcp`, `state`). The host fills it with `setData`; scripts can
   * read but never change it, so no script alters another's view.
   */
  defineView(name: string): void {
    this.assertOpen();
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.baseRef));
    this.pushString(L, name);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.viewRef));
    this.pushString(L, name);
    const st = c.lua_pcallk(L, 1, 1, 0, 0, 0);
    if (st !== LUA_OK) {
      c.lua_settop(L, top);
      throw new Error(`defineView ${name} failed`);
    }
    c.lua_rawset(L, -3);
    c.lua_settop(L, top);
  }

  /**
   * Sets a value in the hidden data table (see `defineView`): a path whose
   * missing tables are created (`['gmcp', 'Char', 'Vitals']`). Tables are
   * new on every set.
   */
  setData(path: readonly string[], value: unknown): void {
    this.assertOpen();
    this.setPath(this.dataRef, path, value);
  }

  /** A C closure for a host function (kept until `close`). */
  private closure(name: string, impl: HostFunction): Ptr {
    const m = this.m;
    const c = this.c;
    const args = new LuaArgs(this, name);
    const fp = m.addFunction((Lp: number): number => {
      const prevL = this.activeL;
      const prevArgsL = args.L;
      this.activeL = Lp;
      args.L = Lp;
      let message: string;
      try {
        const r = impl(args);
        if (r === undefined) return 0;
        if (r instanceof LuaMulti) {
          c.lua_checkstack(Lp, r.values.length + 1);
          for (const v of r.values) this.push(Lp, v, 0);
          return r.values.length;
        }
        this.push(Lp, r, 0);
        return 1;
      } catch (e) {
        if (e === Infinity) throw e; // a Lua error unwinding (emscripten longjmp)
        message = e instanceof Error ? e.message : String(e);
      } finally {
        this.activeL = prevL;
        args.L = prevArgsL;
      }
      c.luaL_where(Lp, 1);
      this.pushString(Lp, message);
      c.lua_concat(Lp, 2);
      return c.lua_error(Lp);
    }, 'ii');
    this.functions.push(fp);
    return fp;
  }

  /**
   * Sets a value in the shared base: `name`, or a path whose missing
   * tables are created (`['gmcp', 'Char', 'Vitals']`). The value is
   * converted like a call argument; tables are new on every set.
   */
  setGlobal(path: string | readonly string[], value: unknown): void {
    this.assertOpen();
    this.setPath(this.baseRef, typeof path === 'string' ? [path] : path, value);
  }

  private setPath(rootRef: number, keys: readonly string[], value: unknown): void {
    if (keys.length === 0) throw new Error('setGlobal: empty path');
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    try {
      c.lua_checkstack(L, keys.length + MIN_STACK);
      c.lua_rawgeti(L, REGISTRY, BigInt(rootRef));
      for (let i = 0; i < keys.length - 1; i++) {
        this.pushString(L, keys[i]!);
        if (c.lua_rawget(L, -2) !== T_TABLE) {
          c.lua_settop(L, -2);
          c.lua_createtable(L, 0, 0);
          this.pushString(L, keys[i]!);
          c.lua_pushvalue(L, -2);
          c.lua_rawset(L, -4);
        }
      }
      this.pushString(L, keys[keys.length - 1]!);
      this.push(L, value, 0);
      c.lua_rawset(L, -3);
    } finally {
      c.lua_settop(L, top);
    }
  }

  stats(): LuaStats {
    return {
      top: this.closed ? 0 : this.c.lua_gettop(this.L),
      memoryUsed: this.closed ? 0 : this.engine.global.getMemoryUsed(),
      scripts: this.scripts.size,
      direct: this.direct,
    };
  }

  /** Unloads every script and frees the engine. */
  close(): void {
    if (this.closed) return;
    for (const s of [...this.scripts]) this.unloadScript(s);
    this.closed = true;
    const m = this.m;
    this.engine.global.close();
    m.removeFunction(this.hook);
    for (const fp of this.functions) m.removeFunction(fp);
    m._free(this.buf);
    m._free(this.lenPtr);
    m._free(this.modePtr);
  }

  // ------------------------------------------------------------ internal

  /** @internal */
  callRef(script: LuaScript, fn: LuaRef, args: readonly unknown[]): CallResult {
    if (this.closed || !script.loaded) return { ok: false, kind: 'error', message: `${script.name}: script is not loaded` };
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    try {
      if (args.length + 1 > MIN_STACK) c.lua_checkstack(L, args.length + 1);
      c.lua_rawgeti(L, REGISTRY, BigInt(fn));
      for (let i = 0; i < args.length; i++) this.push(L, args[i], 0);
    } catch (e) {
      c.lua_settop(L, top);
      if (e === Infinity) throw e;
      return { ok: false, kind: 'error', message: `${script.name}: ${e instanceof Error ? e.message : String(e)}` };
    }
    return this.protectedCall(script, L, top, args.length);
  }

  /** @internal */
  setEnvValue(script: LuaScript, name: string, value: unknown, readonly: boolean): void {
    if (this.closed || !script.loaded) return;
    const c = this.c;
    const L = this.activeL;
    const top = c.lua_gettop(L);
    try {
      c.lua_checkstack(L, 4 + MIN_STACK);
      c.lua_rawgeti(L, REGISTRY, BigInt(script.envRef));
      this.pushString(L, name);
      if (readonly) this.pushFrozen(L, value);
      else this.push(L, value, 0);
      c.lua_rawset(L, -3);
    } finally {
      c.lua_settop(L, top);
    }
  }

  /** Pushes `v`; a table as a deep read-only view (the sandbox's `freeze`). */
  private pushFrozen(L: LuaState, v: unknown): void {
    const c = this.c;
    if (typeof v !== 'object' || v === null) {
      this.push(L, v, 0);
      return;
    }
    c.lua_rawgeti(L, REGISTRY, BigInt(this.freezeRef));
    this.push(L, v, 0);
    if (c.lua_pcallk(L, 1, 1, 0, 0, 0) !== LUA_OK) {
      c.lua_settop(L, -2);
      throw new Error('could not freeze a table');
    }
  }

  /** @internal */
  unloadScript(script: LuaScript): void {
    if (!script.loaded) return;
    const c = this.c;
    for (const ref of script.refs) c.luaL_unref(this.L, REGISTRY, ref);
    script.refs.clear();
    c.luaL_unref(this.L, REGISTRY, script.envRef);
    script.envRef = -1;
    this.scripts.delete(script);
  }

  /** @internal */
  unref(ref: number): void {
    if (!this.closed) this.c.luaL_unref(this.L, REGISTRY, ref);
  }

  /** @internal A reference to the value at `idx`, owned by the running script. */
  newRef(L: LuaState, idx: number): LuaRef {
    const owner = this.owner;
    if (owner === null) throw new Error('no script is running');
    this.c.lua_pushvalue(L, idx);
    const ref = this.c.luaL_ref(L, REGISTRY);
    owner.refs.add(ref);
    return ref as LuaRef;
  }

  /**
   * Calls the function below `nargs` arguments on `L`'s stack (above
   * `base`), under the budget, as `script`. Leaves the stack at `base`.
   */
  private protectedCall(script: LuaScript, L: LuaState, base: number, nargs: number): CallResult {
    const c = this.c;
    const outer = this.depth === 0;
    const prevOwner = this.owner;
    this.owner = script;
    if (outer) {
      this.fires = 0;
      this.poisoned = false;
      this.engine.global.setMemoryMax(this.memoryMax);
      c.lua_sethook(this.L, this.hook, MASK_COUNT, HOOK_STEP);
    }
    this.depth++;
    let st: number;
    try {
      st = c.lua_pcallk(L, nargs, 1, 0, 0, 0);
    } finally {
      this.depth--;
      this.owner = prevOwner;
      if (outer) {
        c.lua_sethook(this.L, 0, 0, 0);
        this.engine.global.setMemoryMax(this.memoryMax + MEMORY_HEADROOM);
      }
    }
    let result: CallResult;
    if (this.poisoned) {
      // Also when the call returned normally: a host function may have
      // swallowed a nested abort, or Lua returned without another
      // instruction (a tail call).
      const msg = st === LUA_OK ? '' : this.errorMessage(L);
      result = { ok: false, kind: 'budget', message: msg.endsWith(BUDGET_MESSAGE) ? msg : `${script.name}: ${BUDGET_MESSAGE}` };
    } else if (st === LUA_OK) {
      try {
        result = { ok: true, value: this.toJs(L, -1, 0) };
      } catch (e) {
        if (e === Infinity) throw e;
        result = { ok: false, kind: 'error', message: `${script.name}: ${e instanceof Error ? e.message : String(e)}` };
      }
    } else if (st === LUA_ERRMEM) {
      result = { ok: false, kind: 'memory', message: `${script.name}: not enough memory` };
    } else {
      result = { ok: false, kind: 'error', message: this.errorMessage(L) };
    }
    c.lua_settop(L, base);
    if (outer && !result.ok && result.kind === 'memory') this.collect();
    return result;
  }

  /** The count hook: count, then abort and poison past the budget. */
  private onHook(Lp: LuaState): void {
    const c = this.c;
    if (!this.poisoned) {
      if (++this.fires < this.budgetFires) {
        // A coroutine poisoned in an earlier call may still carry count 1.
        c.lua_sethook(Lp, this.hook, MASK_COUNT, HOOK_STEP);
        return;
      }
      this.poisoned = true;
      c.lua_sethook(this.L, this.hook, MASK_COUNT, 1);
    }
    c.lua_sethook(Lp, this.hook, MASK_COUNT, 1);
    c.luaL_where(Lp, 0);
    this.pushString(Lp, BUDGET_MESSAGE);
    c.lua_concat(Lp, 2);
    c.lua_error(Lp);
  }

  /** A full garbage collection (after an out-of-memory abort). */
  private collect(): void {
    const c = this.c;
    const L = this.L;
    const top = c.lua_gettop(L);
    c.lua_rawgeti(L, REGISTRY, BigInt(this.collectRef));
    this.pushString(L, 'collect');
    c.lua_pcallk(L, 1, 0, 0, 0, 0);
    c.lua_settop(L, top);
  }

  /** The error object on top of `L` as text. */
  private errorMessage(L: LuaState): string {
    const t = this.c.lua_type(L, -1);
    if (t === T_STRING || t === T_NUMBER) return this.readString(L, -1);
    return `(error object is a ${typeName(t)} value)`;
  }

  /** @internal Pushes a JS value (see `LuaScript.call`). */
  push(L: LuaState, v: unknown, depth: number): void {
    const c = this.c;
    switch (typeof v) {
      case 'string':
        this.pushString(L, v);
        return;
      case 'number':
        if (Number.isSafeInteger(v)) c.lua_pushinteger(L, BigInt(v));
        else c.lua_pushnumber(L, v);
        return;
      case 'boolean':
        c.lua_pushboolean(L, v ? 1 : 0);
        return;
      case 'object':
        if (v instanceof LuaObject) {
          this.pushObject(L, v);
          return;
        }
        if (v !== null) {
          this.pushTable(L, v, depth);
          return;
        }
        break;
    }
    c.lua_pushnil(L);
  }

  private pushTable(L: LuaState, v: object, depth: number): void {
    if (depth >= MAX_DEPTH) throw new Error('table nesting too deep');
    const c = this.c;
    c.lua_checkstack(L, 3);
    if (Array.isArray(v)) {
      c.lua_createtable(L, v.length, 0);
      for (let i = 0; i < v.length; i++) {
        this.push(L, v[i], depth + 1);
        c.lua_rawseti(L, -2, BigInt(i + 1));
      }
      return;
    }
    const keys = Object.keys(v);
    c.lua_createtable(L, 0, keys.length);
    const o = v as Record<string, unknown>;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      const x = o[k];
      if (x === undefined || x === null) continue;
      this.pushString(L, k);
      this.push(L, x, depth + 1);
      c.lua_rawset(L, -3);
    }
  }

  /** @internal Converts the value at `idx` (see `LuaValue`). */
  toJs(L: LuaState, idx: number, depth: number): LuaValue {
    const c = this.c;
    switch (c.lua_type(L, idx)) {
      case T_BOOLEAN:
        return c.lua_toboolean(L, idx) !== 0;
      case T_NUMBER:
        return c.lua_tonumberx(L, idx, 0);
      case T_STRING:
        return this.readString(L, idx);
      case T_TABLE:
        return this.readTable(L, c.lua_absindex(L, idx), depth);
      default:
        return undefined;
    }
  }

  private readTable(L: LuaState, idx: number, depth: number): LuaValue {
    if (depth >= MAX_DEPTH) throw new Error('table nesting too deep');
    const c = this.c;
    c.lua_checkstack(L, 3);
    const keys: (string | number)[] = [];
    const vals: LuaValue[] = [];
    let seq = true;
    c.lua_pushnil(L);
    while (c.lua_next(L, idx) !== 0) {
      const kt = c.lua_type(L, -2);
      let k: string | number | null = null;
      if (kt === T_NUMBER) {
        k = c.lua_tonumberx(L, -2, 0);
        if (!Number.isInteger(k) || k < 1) seq = false;
      } else if (kt === T_STRING) {
        k = this.readString(L, -2);
        seq = false;
      }
      if (k !== null) {
        keys.push(k);
        vals.push(this.toJs(L, -1, depth + 1));
      }
      c.lua_settop(L, -2);
    }
    if (seq && keys.length > 0) {
      const arr: LuaValue[] = new Array(keys.length);
      let ok = true;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i] as number;
        if (k > keys.length) {
          ok = false;
          break;
        }
        arr[k - 1] = vals[i];
      }
      if (ok) return arr;
    }
    const obj: { [key: string]: LuaValue } = {};
    for (let i = 0; i < keys.length; i++) obj[String(keys[i])] = vals[i];
    return obj;
  }

  /** @internal Reads the string (or number) at `idx`. */
  readString(L: LuaState, idx: number): string {
    const m = this.m;
    const c = this.c;
    const p = c.lua_tolstring(L, idx, this.lenPtr);
    const n = m.HEAPU32[this.lenPtr >> 2]!;
    const heap = m.HEAPU8;
    if (n <= 64) {
      let s = '';
      for (let i = 0; i < n; i++) {
        const c = heap[p + i]!;
        if (c >= 0x80) return this.dec.decode(heap.subarray(p, p + n));
        s += String.fromCharCode(c);
      }
      return s;
    }
    return this.dec.decode(heap.subarray(p, p + n));
  }

  /** Pushes `s` as a Lua string through the shared UTF-8 buffer. */
  private pushString(L: LuaState, s: string): void {
    const n = this.encode(s);
    this.c.lua_pushlstring(L, this.buf, n);
  }

  /** Encodes `s` into the shared buffer; returns its byte length. */
  private encode(s: string): number {
    if (s.length * 3 > this.bufCap) this.growBuffer(s.length * 3);
    let view = this.bufView;
    if (view.buffer !== this.m.HEAPU8.buffer) {
      // The wasm memory grew, which replaces its ArrayBuffer.
      view = this.bufView = this.m.HEAPU8.subarray(this.buf, this.buf + this.bufCap);
    }
    // Short ASCII (keys, most captures) is copied by hand: cheaper than
    // the encodeInto call and its result object.
    const n = s.length;
    if (n <= 32) {
      let i = 0;
      for (; i < n; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0x80) break;
        view[i] = c;
      }
      if (i === n) return n;
    }
    return this.enc.encodeInto(s, view).written;
  }

  private growBuffer(min: number): void {
    let cap = this.bufCap;
    while (cap < min) cap *= 2;
    this.m._free(this.buf);
    this.buf = this.m._malloc(cap);
    if (this.buf === 0) throw new Error('lua: out of host memory');
    this.bufCap = cap;
    this.bufView = this.m.HEAPU8.subarray(this.buf, this.buf + cap);
  }

  /** A NUL-terminated copy of `s` on the heap; the caller frees it. */
  private cString(s: string): Ptr {
    const bytes = this.enc.encode(s + '\0');
    const p = this.m._malloc(bytes.length);
    this.m.HEAPU8.set(bytes, p);
    return p;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('lua runtime is closed');
  }
}
