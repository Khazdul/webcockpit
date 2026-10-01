// User-script Lua runtime (ADR 0051, stage 10 P0). Import this module
// dynamically: it is only needed once a script is enabled.
//
//   const rt = await loadLuaRuntime();
//   rt.defineFunction('send', (a) => { send(a.string(1)); });
//   const r = rt.loadScript('looter', source);
//   if (r.ok) r.script.call(ref, line, cap1, cap2);
//
// See "Package notes — P0" in docs/decisions/0051-user-scripts-lua.md.

export { loadLuaRuntime } from './load';
export {
  DEFAULT_INSTRUCTION_BUDGET,
  DEFAULT_MEMORY_MAX,
  LuaArgs,
  LuaRuntime,
  LuaScript,
  type CallResult,
  type FailKind,
  type HostFunction,
  type LoadResult,
  type LuaRef,
  type LuaRuntimeOptions,
  type LuaStats,
  type LuaValue,
} from './runtime';
