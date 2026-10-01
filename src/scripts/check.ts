// Compile-only checks of script sources (stage 10 feedback round 1): the
// script editor checks the buffer while you type, the Scripts page checks
// the scripts the host has not loaded (a script that is off gets no other
// syntax check). Nothing runs: `LuaRuntime.check` compiles and throws the
// chunk away.
//
// One small runtime of its own, created on the first check; `src/lua`
// (wasmoon and glue.wasm) is a dynamic import, so this module costs the
// chunk that imports it about a kilobyte.

import type { CheckResult, LuaRuntime } from '../lua';

let runtime: Promise<LuaRuntime> | null = null;

/** Compile errors stop long before this; a source this big is refused anyway. */
const CHECK_MEMORY = 8 * 1024 * 1024;
const CACHE_MAX = 200;

function checker(): Promise<LuaRuntime> {
  const p = (runtime ??= import('../lua').then((m) => m.loadLuaRuntime({ memoryMax: CHECK_MEMORY })));
  p.catch(() => {
    if (runtime === p) runtime = null; // let a later check retry
  });
  return p;
}

/** Compiles `source` as script `name`: `{ ok: true }` or the error (`name:line: message`). */
export async function checkScript(name: string, source: string): Promise<CheckResult> {
  const rt = await checker();
  return rt.check(name, source);
}

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
const key = (name: string, source: string): string => name + '\0' + source;

/**
 * The compile error of `source` when it is known: a message, null (it
 * compiles) or undefined (not checked yet; call `syntaxProblem`).
 */
export function knownSyntaxProblem(name: string, source: string): string | null | undefined {
  return cache.get(key(name, source));
}

/**
 * The compile error of `source`, or null when it compiles or the runtime
 * cannot load (then nothing is said). Remembered per name and source.
 */
export function syntaxProblem(name: string, source: string): Promise<string | null> {
  const k = key(name, source);
  if (cache.has(k)) return Promise.resolve(cache.get(k)!);
  let p = pending.get(k);
  if (!p) {
    p = checkScript(name, source).then(
      (r) => (r.ok ? null : r.message),
      () => null,
    );
    pending.set(k, p);
    void p.then((msg) => {
      pending.delete(k);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(k, msg);
    });
  }
  return p;
}
