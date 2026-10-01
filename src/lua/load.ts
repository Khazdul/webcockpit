// Lazy loader of the Lua runtime (ADR 0051 "Lazy"). wasmoon and its
// `glue.wasm` are fetched on the first call only, so neither is part of
// the cold start; import this module dynamically too.
//
// The wasm file is always the self-hosted asset (wasm-url.ts), never
// wasmoon's default (unpkg, which spec §1.5 forbids). Under Node (Vitest,
// the benches) it is read from node_modules instead.
//
// The bridge calls the wasm instance's exports directly. emscripten
// keeps them private and hands out wrappers that cost about 30 ns per
// call (an assertion and an `apply`), several times the call itself, so
// the instance is captured while the module instantiates: the two
// `WebAssembly` instantiate functions are wrapped for that moment only.
// If the capture fails, the runtime falls back to the wrappers.

import type { LuaEngine, LuaFactory } from 'wasmoon';
import { API_NAMES, type LuaApi } from './raw';
import { LuaRuntime, type LuaRuntimeOptions } from './runtime';

interface Loaded {
  factory: LuaFactory;
  /** The wasm instance's exports, or null (use the module's wrappers). */
  api: LuaApi | null;
}

let factory: Promise<Loaded> | null = null;

/**
 * A new runtime with its own engine. The wasm module is loaded once and
 * shared; the app creates one runtime for all scripts.
 */
export async function loadLuaRuntime(options?: LuaRuntimeOptions): Promise<LuaRuntime> {
  const p = (factory ??= createFactory());
  let f: Loaded;
  try {
    f = await p;
  } catch (e) {
    if (factory === p) factory = null; // let a later call retry
    throw e;
  }
  const engine: LuaEngine = await f.factory.createEngine({
    openStandardLibs: true,
    injectObjects: false,
    enableProxy: false,
    traceAllocations: true,
  });
  return new LuaRuntime(engine, options, f.api ?? undefined);
}

async function createFactory(): Promise<Loaded> {
  const [mod, wasm] = await Promise.all([import('wasmoon'), wasmLocation()]);
  // wasmoon is a UMD bundle: named exports in Vite, maybe only `default` in Node.
  const W = (mod.LuaFactory ? mod : (mod as unknown as { default: typeof mod }).default) as typeof mod;
  let api: LuaApi | null = null;
  const WA = WebAssembly;
  const { instantiate, instantiateStreaming } = WA;
  const capture = <T>(r: T): T => {
    const inst = (r as { instance?: WebAssembly.Instance }).instance;
    const ex = inst?.exports as Record<string, unknown> | undefined;
    if (ex && API_NAMES.every((n) => typeof ex[n] === 'function')) api = ex as unknown as LuaApi;
    return r;
  };
  WA.instantiate = ((...a: unknown[]) => Reflect.apply(instantiate, WA, a).then(capture)) as typeof instantiate;
  if (instantiateStreaming) {
    WA.instantiateStreaming = ((...a: unknown[]) =>
      Reflect.apply(instantiateStreaming, WA, a).then(capture)) as typeof instantiateStreaming;
  }
  try {
    const f = new W.LuaFactory(wasm);
    await f.getLuaModule(); // surface a failed wasm load here
    return { factory: f, api };
  } finally {
    WA.instantiate = instantiate;
    if (instantiateStreaming) WA.instantiateStreaming = instantiateStreaming;
  }
}

async function wasmLocation(): Promise<string> {
  const node = typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function';
  if (node) {
    const { createRequire } = process.getBuiltinModule('node:module');
    return createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm');
  }
  return (await import('./wasm-url')).default;
}
