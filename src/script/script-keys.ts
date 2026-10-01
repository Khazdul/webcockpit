// Keys bound by Lua scripts (ADR 0051), for the profile editor's macro
// warning: a profile macro on a key a script also binds wins over the
// script's key (engine order: user, scripts, system).
//
// Two sources, both canonical key names (keys.ts):
// - live: keys the script host has bound with `tempKey` (running scripts);
// - declared: the `@key` header lines of enabled scripts (the library),
//   so the warning shows before any script has run (the start page).

const live = new Map<string, string>();
let declared: ReadonlyMap<string, string> = new Map();

/** The script that binds `canonical`, or null. */
export function scriptKeyOwner(canonical: string): string | null {
  return live.get(canonical) ?? declared.get(canonical) ?? null;
}

/** The script host bound (`name`) or released (null) a key. */
export function setLiveScriptKey(canonical: string, name: string | null): void {
  if (name === null) live.delete(canonical);
  else live.set(canonical, name);
}

/** The library's `@key` declarations of enabled scripts, replacing the last set. */
export function setDeclaredScriptKeys(keys: ReadonlyMap<string, string>): void {
  declared = keys;
}

/** Tests: forget everything. */
export function resetScriptKeys(): void {
  live.clear();
  declared = new Map();
}
