// Lazy loader of the Lua runtime (ADR 0051 "Lazy"). wasmoon and its
// `glue.wasm` are fetched on the first call only, so neither is part of
// the cold start; import this module dynamically too.
//
// The wasm file is always the self-hosted asset (wasm-url.ts), never
// wasmoon's default (unpkg, which spec §1.5 forbids). Under Node (Vitest,
// the benches) it is read from node_modules instead.

import type { LuaEngine, LuaFactory } from 'wasmoon';
import { LuaRuntime, type LuaRuntimeOptions } from './runtime';

let factory: Promise<LuaFactory> | null = null;

/**
 * A new runtime with its own engine. The wasm module is loaded once and
 * shared; the app creates one runtime for all scripts.
 */
export async function loadLuaRuntime(options?: LuaRuntimeOptions): Promise<LuaRuntime> {
  const p = (factory ??= createFactory());
  let f: LuaFactory;
  try {
    f = await p;
  } catch (e) {
    if (factory === p) factory = null; // let a later call retry
    throw e;
  }
  const engine: LuaEngine = await f.createEngine({
    openStandardLibs: true,
    injectObjects: false,
    enableProxy: false,
    traceAllocations: true,
  });
  return new LuaRuntime(engine, options);
}

async function createFactory(): Promise<LuaFactory> {
  const [mod, wasm] = await Promise.all([import('wasmoon'), wasmLocation()]);
  // wasmoon is a UMD bundle: named exports in Vite, maybe only `default` in Node.
  const W = (mod.LuaFactory ? mod : (mod as unknown as { default: typeof mod }).default) as typeof mod;
  const f = new W.LuaFactory(wasm);
  await f.getLuaModule(); // surface a failed wasm load here
  return f;
}

async function wasmLocation(): Promise<string> {
  const node = typeof process !== 'undefined' && typeof process.getBuiltinModule === 'function';
  if (node) {
    const { createRequire } = process.getBuiltinModule('node:module');
    return createRequire(import.meta.url).resolve('wasmoon/dist/glue.wasm');
  }
  return (await import('./wasm-url')).default;
}
