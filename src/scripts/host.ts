// The script host (spec §2.10, ADR 0051): owns the Lua runtime, loads the
// enabled scripts from the library, defines the API (version 1) and
// connects scripts to the engine, the bus and the trackers.
//
// - Lazy: the runtime (src/lua, wasm) is imported only once a script is
//   enabled. App imports this module only then too.
// - The host follows the library: every change re-syncs, so enabling,
//   disabling, saving (reload when the source changed) and `#script set`
//   take effect at once. Loads are serial and each yields a task first
//   (HangGuard.pin).
// - Ownership: each loaded script has an Owner holding everything it
//   registered (triggers, aliases, keys, timers, event handlers, exports,
//   function references). Unloading an owner releases all of it, so
//   scripts never clean up after themselves.
// - Errors: every failed call goes to the UI messages as
//   `<script>:<line>: <message>` and is the script's last error. A budget
//   or memory abort, a call slower than SLOW_CALL_MS, or ERROR_LIMIT
//   errors within ERROR_WINDOW_MS disable the script (UI message). A
//   script that fails to load stays enabled with its error and is tried
//   again when its source changes or on `#script reload`.
// - Hang guard: see guard.ts. A script that was running when the page
//   went away is turned off at the next start.
//
// API names are spec §2.10's. Decisions (ADR 0051 "Package notes — P1"):
// `print` echoes its arguments tab-separated; event handlers get the event
// name, then its arguments. GMCP (Mudlet): a message `Char.Vitals` raises
// `gmcp.Char` and then `gmcp.Char.Vitals`, each handler getting its own
// event name and the full one. The `gmcp` values come from a GmcpCache
// (gmcp-cache.ts: which messages merge and which replace).
//
// Panes (ADR 0053): `createPane` returns a `Pane` object (userdata, methods
// with `:`). The host edits the pane's PaneContent and the surface draws it
// (src/panes/script-surface.ts); method calls never touch the DOM. Each
// owner keeps its panes; unloading closes them (their place stays in the
// settings) and the link and resize functions go with the script.

import type { Bus } from '../core/bus';
import { type Color, type StyleRun, TRUECOLOR, gmcpKey } from '../core/types';
import type { CallResult, LuaArgs, LuaClass, LuaRef, LuaRuntime, LuaScript } from '../lua';
import { DOCK_IDS, type DockId, SCRIPT_PANE_NAME, type ScriptPaneId, scriptPaneId, tempPaneId } from '../layout/types';
import { MAX_LINES, PaneContent, plain } from '../panes/script-content';
import { TEMP_PANE_AT, type TempPaneAt } from '../layout/temp-places';
import type { FieldEvent } from '../panes/script-pane';
import type { ScriptPaneSurface, ScriptPaneView } from '../panes/script-surface';
import type { GameState } from '../gmcp/state';
import type { ScriptEngine, MatchContext } from '../script/engine';
import { keyBindability, normalizeKey, shadowedInputKey } from '../script/keys';
import { setLiveScriptKey } from '../script/script-keys';
import type { StyledRow } from '../ui/output-pane';
import { helpRows, listRows, settingText } from './command-rows';
import { parseCecho, parseScriptColor } from './colors';
import { type GmcpEntry, GmcpCache } from './gmcp-cache';
import { HangGuard } from './guard';
import { apiProblem } from './header';
import type { ScriptInfo, ScriptLibrary, StoreValue } from './library';
import { regexPattern, substringPattern } from './patterns';

/** A call that takes longer than this disables its script. */
export const SLOW_CALL_MS = 1000;
/** This many errors … */
export const ERROR_LIMIT = 5;
/** … within this window disable a script. */
export const ERROR_WINDOW_MS = 10_000;

/** What the host uses of the library (tests and the bench may fake it). */
export type ScriptLibraryView = Pick<
  ScriptLibrary,
  'init' | 'list' | 'get' | 'settingsOf' | 'subscribe' | 'setEnabled' | 'setError' | 'setSetting' | 'storeGet' | 'storeSet'
>;

export interface ScriptHostOptions {
  engine: ScriptEngine;
  bus: Bus;
  library: ScriptLibraryView;
  /** Character and group trackers for `state` (absent: empty). */
  game?: GameState | null;
  /** Sends one command to the game, no alias expansion (App's script sender). */
  send: (text: string) => void;
  /** Rows for the game output (`#script list`, `#script help`). */
  print: (rows: StyledRow[]) => void;
  /** A `[SYSTEM]` line in the game output. */
  message: (text: string) => void;
  /** The game pane's width in cells (for `#script` rows). */
  cols?: () => number;
  /** The runtime loader (default: `import('../lua')`). */
  loadRuntime?: () => Promise<LuaRuntime>;
  /** Where the hang marker lives (default `localStorage`; null: no guard). */
  storage?: Storage | null;
  /** Monotonic ms (default `performance.now`). */
  clock?: () => number;
  /** Wall-clock seconds since 1970 for `getEpoch` (default `Date.now() / 1000`). */
  epoch?: () => number;
  /**
   * The GMCP cache App keeps from its start (default: the host attaches its
   * own to the bus, so it sees only what arrives after `start`).
   */
  gmcp?: GmcpCache;
  /** Where script panes appear (App: the cockpit). Absent: panes keep content but are not shown. */
  panes?: ScriptPaneSurface;
}

/** Default and largest wanted pane size in cells (createPane rows/cols). */
export const PANE_DEFAULT_ROWS = 8;
export const PANE_DEFAULT_COLS = 30;
export const PANE_MAX_ROWS = 200;
export const PANE_MAX_COLS = 300;

/** One pane a script created. */
interface PaneReg {
  owner: Owner;
  /** The Lua object's handle. */
  handle: number;
  /** The script's own id for it (`createPane{id=…}`). */
  name: string;
  id: ScriptPaneId;
  /** `createPane{temporary = true}`: never in the settings. */
  temporary: boolean;
  /** `pane:onClose(fn)`: called when the user closes a temporary pane. */
  onClose: LuaRef | null;
  content: PaneContent;
  view: ScriptPaneView;
  /** Link id → the link's function. */
  links: Map<number, LuaRef>;
  resize: LuaRef | null;
  /** The last size reported to the resize handler (`colsxrows`). */
  lastSize: string;
  /** Text fields (`pane:setInput`) by their id, which is also their Lua handle. */
  fields: Map<number, FieldReg>;
}

/** One text field of a pane (ADR 0055). */
interface FieldReg {
  pane: PaneReg;
  id: number;
  submit: LuaRef | null;
  cancel: LuaRef | null;
  change: LuaRef | null;
  key: LuaRef | null;
  blur: LuaRef | null;
}

interface RuleReg {
  kind: 'action' | 'alias';
  key: string;
  ref: LuaRef;
}
interface TimerReg {
  kind: 'ticker' | 'delay';
  tname: string;
  ref: LuaRef;
}
interface Binding {
  owner: Owner;
  id: number;
  ref: LuaRef;
}

/** Everything one loaded script registered. */
class Owner {
  readonly name: string;
  readonly source: string;
  script: LuaScript | null = null;
  settingsJson = '';
  dead = false;
  readonly rules = new Map<number, RuleReg>();
  readonly keys = new Map<number, string>();
  readonly timers = new Map<number, TimerReg>();
  readonly handlers = new Map<number, string>();
  readonly exports = new Map<string, LuaRef>();
  /** Panes by their own id (`createPane{id=…}`). */
  readonly panes = new Map<string, PaneReg>();
  errors: number[] = [];

  constructor(name: string, source: string) {
    this.name = name;
    this.source = source;
  }
}

/** Normal form of an event name for lookups. */
function eventKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** #event names (engine.ts EVENT_NAMES) start with these. */
const ENGINE_EVENT = /^(session (dis)?connected|iac sb gmcp)/;

export class ScriptHost {
  private readonly o: ScriptHostOptions;
  private readonly engine: ScriptEngine;
  private readonly lib: ScriptLibraryView;
  private readonly guard: HangGuard;
  private readonly clock: () => number;
  private rt: LuaRuntime | null = null;
  private rtP: Promise<LuaRuntime> | null = null;
  /** The runtime failed to load (reported once). */
  private rtFailed = false;
  private readonly owners = new Map<string, Owner>();
  /** Scripts that failed to load, with the source that failed (not retried until it changes). */
  private readonly failed = new Map<string, string>();
  private readonly handlers = new Map<string, Binding[]>();
  private readonly keyBindings = new Map<string, Binding[]>();
  /** Every open pane by its Lua handle. */
  private readonly paneHandles = new Map<number, PaneReg>();
  /** Every text field by its id (= its Lua handle). */
  private readonly fieldHandles = new Map<number, FieldReg>();
  private seq = 0;
  private syncP: Promise<void> = Promise.resolve();
  private syncQueued = false;
  private started: Promise<void> | null = null;
  private disposed = false;
  private readonly unsubs: Array<() => void> = [];
  /** The last GMCP values (shared with App, or the host's own). */
  private readonly gmcp: GmcpCache;
  private readonly ownGmcp: boolean;

  constructor(opts: ScriptHostOptions) {
    this.o = opts;
    this.engine = opts.engine;
    this.lib = opts.library;
    this.guard = new HangGuard(opts.storage === undefined ? defaultStorage() : opts.storage);
    this.clock = opts.clock ?? (() => performance.now());
    this.ownGmcp = !opts.gmcp;
    this.gmcp = opts.gmcp ?? new GmcpCache();
  }

  /**
   * Starts following the library: turns off a script left running by a
   * hung page, then loads the enabled scripts. Resolves when they are
   * loaded. Idempotent.
   */
  start(): Promise<void> {
    this.started ??= this.begin();
    return this.started;
  }

  private async begin(): Promise<void> {
    await this.lib.init();
    if (this.disposed) return;
    const hung = this.guard.takeLeftover();
    if (hung !== null && this.lib.get(hung)?.enabled) {
      await this.lib.setEnabled(hung, false).catch(() => {});
      this.ui(
        'warn',
        `Script {${hung}} was turned off: the page closed while it was running, so it may hang. Check it before you turn it on again.`,
      );
    }
    const bus = this.o.bus;
    if (this.ownGmcp) this.unsubs.push(this.gmcp.attach(bus));
    this.unsubs.push(
      this.lib.subscribe(() => this.sync()),
      this.gmcp.subscribe((key, e) => this.onGmcp(key, e)),
      bus.on('conn.state', (s) => this.onConn(s.state, s.prev, s.reason ?? '')),
    );
    if (this.o.game) this.unsubs.push(this.o.game.subscribe((part) => this.onGame(part)));
    await this.sync();
  }

  /** Stops every script and frees the runtime. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    for (const o of [...this.owners.values()]) this.unload(o);
    this.engine.setEventTap(null);
    this.rt?.close();
    this.rt = null;
  }

  /** True when `name` is loaded and running. */
  isRunning(name: string): boolean {
    return this.owners.has(name);
  }

  /** Names of the running scripts. */
  running(): string[] {
    return [...this.owners.keys()];
  }

  /** Resolves when every pending library change has been applied. */
  sync(): Promise<void> {
    if (this.syncQueued) return this.syncP;
    this.syncQueued = true;
    this.syncP = this.syncP.then(() => {
      this.syncQueued = false;
      return this.doSync();
    });
    return this.syncP;
  }

  // ---------------------------------------------------------------- loading

  private async doSync(): Promise<void> {
    if (this.disposed) return;
    const want = new Map<string, ScriptInfo>();
    for (const s of this.lib.list()) if (s.enabled) want.set(s.name, s);
    for (const o of [...this.owners.values()]) {
      const s = want.get(o.name);
      if (!s || s.source !== o.source) this.unload(o);
      else this.pushSettings(o);
    }
    for (const name of [...this.failed.keys()]) {
      const s = want.get(name);
      if (!s || s.source !== this.failed.get(name)) this.failed.delete(name);
    }
    const todo = [...want.values()].filter((s) => !this.owners.has(s.name) && !this.failed.has(s.name));
    if (todo.length === 0) return;
    let rt: LuaRuntime;
    try {
      rt = await this.runtime();
    } catch (err) {
      if (!this.rtFailed) this.ui('error', `Scripts could not start: ${err instanceof Error ? err.message : String(err)}`);
      this.rtFailed = true;
      return;
    }
    for (const s of todo) {
      if (this.disposed) return;
      const cur = this.lib.get(s.name);
      if (!cur?.enabled || this.owners.has(s.name)) continue;
      await this.guard.pin(cur.name);
      try {
        if (!this.disposed) this.load(rt, cur);
      } finally {
        this.guard.unpin();
      }
    }
  }

  private runtime(): Promise<LuaRuntime> {
    this.rtP ??= (this.o.loadRuntime ?? defaultLoadRuntime)().then((rt) => {
      if (this.disposed) {
        rt.close();
        throw new Error('disposed');
      }
      this.defineApi(rt);
      this.rt = rt;
      this.fillData(rt);
      return rt;
    });
    this.rtP.catch(() => (this.rtP = null));
    return this.rtP;
  }

  private load(rt: LuaRuntime, s: ScriptInfo): void {
    const problem = apiProblem(s.header);
    if (problem) {
      this.loadFailed(s, `${s.name}: not loaded: ${problem}`);
      return;
    }
    const o = new Owner(s.name, s.source);
    const settings = this.lib.settingsOf(s.name);
    o.settingsJson = JSON.stringify(settings);
    this.owners.set(s.name, o);
    const t0 = this.clock();
    const r = rt.loadScript(s.name, s.source, { readonly: { settings, scriptName: s.name } });
    const dt = this.clock() - t0;
    if (!r.ok) {
      this.release(o);
      const msg = withName(s.name, r.message);
      if (r.kind === 'budget' || r.kind === 'memory') {
        this.lib.setError(s.name, msg);
        this.ui('error', msg);
        this.turnOff(s.name, r.kind === 'budget' ? 'it ran too long while loading' : 'it used too much memory while loading');
      } else this.loadFailed(s, msg);
      return;
    }
    o.script = r.script;
    this.lib.setError(s.name, null);
    if (dt > SLOW_CALL_MS) {
      this.disable(o, `loading took ${(dt / 1000).toFixed(1)} s`);
      return;
    }
    this.fire(o, 'sysloadevent', ['sysLoadEvent']);
  }

  private loadFailed(s: ScriptInfo, msg: string): void {
    this.failed.set(s.name, s.source);
    this.lib.setError(s.name, msg);
    this.ui('error', msg);
  }

  /** Unloads and loads `name` again (also after a failed load). */
  async reload(name: string): Promise<void> {
    const o = this.owners.get(name);
    if (o) this.unload(o);
    this.failed.delete(name);
    await this.sync();
  }

  /** Releases everything the owner registered and unloads its Lua code. */
  private unload(o: Owner): void {
    this.release(o);
    o.script?.unload();
    o.script = null;
  }

  private release(o: Owner): void {
    o.dead = true;
    if (this.owners.get(o.name) === o) this.owners.delete(o.name);
    const store = this.engine.scripts;
    for (const r of o.rules.values()) store.remove(r.kind, r.key);
    o.rules.clear();
    for (const t of o.timers.values()) store.removeTimer(t.kind, t.tname);
    o.timers.clear();
    for (const [id, key] of o.keys) this.unbindKey(key, o, id);
    o.keys.clear();
    for (const [id, ev] of o.handlers) this.dropHandler(ev, o, id);
    o.handlers.clear();
    o.exports.clear();
    for (const p of o.panes.values()) {
      this.paneHandles.delete(p.handle);
      for (const id of p.fields.keys()) this.fieldHandles.delete(id);
      p.fields.clear();
      p.links.clear();
      p.view.close();
    }
    o.panes.clear();
    // Function references go with the script (LuaScript.unload).
  }

  /**
   * Gives the script its new settings, then raises `sysSettingChanged`
   * (name, value) for each changed one, for this script only (ADR 0054
   * feedback round 1), so a script can redraw at once.
   */
  private pushSettings(o: Owner): void {
    const settings = this.lib.settingsOf(o.name);
    const json = JSON.stringify(settings);
    if (json === o.settingsJson) return;
    const old = JSON.parse(o.settingsJson || '{}') as Record<string, unknown>;
    o.settingsJson = json;
    o.script?.setEnv('settings', settings, true);
    for (const [k, v] of Object.entries(settings)) {
      if (o.dead) return;
      if (old[k] !== v) this.fire(o, 'syssettingchanged', ['sysSettingChanged', k, v]);
    }
  }

  // ------------------------------------------------------------------ calls

  /** Calls `ref` as `o` under the guards; failures are reported. */
  private call(o: Owner, ref: LuaRef, ...args: unknown[]): CallResult | null {
    const s = o.script;
    if (!s || o.dead) return null;
    const prev = this.guard.enter(o.name);
    const t0 = this.clock();
    let r: CallResult;
    try {
      r = s.call(ref, ...args);
    } finally {
      this.guard.exit(prev);
    }
    const dt = this.clock() - t0;
    if (!r.ok) this.failCall(o, r.kind, r.message);
    else if (dt > SLOW_CALL_MS) this.disable(o, `a call took ${(dt / 1000).toFixed(1)} s`);
    return r;
  }

  private failCall(o: Owner, kind: string, message: string): void {
    const msg = withName(o.name, message);
    this.lib.setError(o.name, msg);
    this.ui('error', msg);
    if (o.dead) return;
    if (kind === 'budget') return this.disable(o, 'it ran too long (instruction budget)');
    if (kind === 'memory') return this.disable(o, 'it used too much memory');
    const now = this.clock();
    o.errors = o.errors.filter((t) => now - t < ERROR_WINDOW_MS);
    o.errors.push(now);
    if (o.errors.length >= ERROR_LIMIT) this.disable(o, `${ERROR_LIMIT} errors within ${ERROR_WINDOW_MS / 1000} seconds`);
  }

  /** Stops `o` now and turns it off in the library. */
  private disable(o: Owner, reason: string): void {
    this.unload(o);
    this.turnOff(o.name, reason);
  }

  private turnOff(name: string, reason: string): void {
    this.ui('warn', `Script {${name}} was turned off: ${reason}.`);
    void this.lib.setEnabled(name, false).catch(() => {});
  }

  private ui(kind: 'system' | 'warn' | 'error', template: string): void {
    // Script text (error messages) is plain; names in braces are values.
    const parts: Array<string | { value: string }> = [];
    if (kind === 'error') parts.push(template);
    else {
      const re = /\{([^}]*)\}/g;
      let last = 0;
      for (let m = re.exec(template); m; m = re.exec(template)) {
        if (m.index > last) parts.push(template.slice(last, m.index));
        parts.push({ value: m[1]! });
        last = m.index + m[0].length;
      }
      if (last < template.length) parts.push(template.slice(last));
    }
    this.o.bus.emit('ui.message', { kind, parts });
  }

  // ----------------------------------------------------------------- events

  /** Calls the handlers `o` (or, without `o`, every script) registered for `key`. */
  private fire(o: Owner | null, key: string, args: readonly unknown[]): void {
    const list = this.handlers.get(key);
    if (!list) return;
    for (const b of list.slice()) {
      if (o && b.owner !== o) continue;
      if (!b.owner.dead && b.owner.handlers.has(b.id)) this.call(b.owner, b.ref, ...args);
    }
  }

  private onGmcp(key: string, { pkg, value }: GmcpEntry): void {
    const rt = this.rt;
    // Before the runtime is up the values wait in the cache (fillData).
    if (!rt) return;
    this.setGmcp(rt, pkg, value);
    if (key === 'room.info') this.setState(rt, 'room', isObject(value) ? value : null);
    if (this.handlers.size === 0) return;
    // Mudlet: `gmcp.Char`, then `gmcp.Char.Vitals`; each gets (its name, the full name).
    const full = 'gmcp.' + pkg;
    let at = pkg.indexOf('.');
    while (at >= 0) {
      const k = 'gmcp.' + pkg.slice(0, at).toLowerCase();
      if (this.handlers.has(k)) this.fire(null, k, ['gmcp.' + pkg.slice(0, at), full]);
      at = pkg.indexOf('.', at + 1);
    }
    this.fire(null, 'gmcp.' + key, [full, full]);
  }

  private onConn(state: string, prev: string, reason: string): void {
    if (state === 'connecting') {
      // The cache clears itself (GmcpCache.attach).
      if (this.rt) {
        this.rt.setData(['gmcp'], {});
        this.setState(this.rt, 'room', null);
      }
    }
    if (this.handlers.size === 0) return;
    if (state === 'login' && prev === 'connecting') this.fire(null, 'sysconnectionevent', ['sysConnectionEvent']);
    else if (state === 'disconnected' && prev !== 'disconnected' && prev !== 'idle') {
      this.fire(null, 'sysdisconnectionevent', ['sysDisconnectionEvent', reason]);
    }
  }

  /** The engine's #event names (`SESSION CONNECTED`, `IAC SB GMCP …`). */
  private readonly onEngineEvent = (name: string, args: readonly string[]): void => {
    this.fire(null, eventKey(name), [name, ...args]);
  };

  private updateEventTap(): void {
    let need = false;
    for (const k of this.handlers.keys()) if (ENGINE_EVENT.test(k)) need = true;
    this.engine.setEventTap(need ? this.onEngineEvent : null);
  }

  private dropHandler(key: string, o: Owner, id: number): void {
    const list = this.handlers.get(key);
    if (!list) return;
    const next = list.filter((b) => !(b.owner === o && b.id === id));
    if (next.length > 0) this.handlers.set(key, next);
    else this.handlers.delete(key);
    if (ENGINE_EVENT.test(key)) this.updateEventTap();
  }

  // ------------------------------------------------------------ game state

  private setGmcp(rt: LuaRuntime, pkg: string, value: unknown): void {
    try {
      rt.setData(['gmcp', ...pkg.split('.')], value);
    } catch {
      /* too deep: the table stays as it was */
    }
  }

  private fillData(rt: LuaRuntime): void {
    for (const { pkg, value } of this.gmcp.entries()) this.setGmcp(rt, pkg, value);
    const room = this.gmcp.get('room.info')?.value;
    this.setState(rt, 'char', this.charState());
    this.setState(rt, 'group', this.groupState());
    this.setState(rt, 'room', isObject(room) ? room : null);
  }

  private onGame(part: string): void {
    const rt = this.rt;
    if (!rt) return;
    if (part === 'char') this.setState(rt, 'char', this.charState());
    else if (part === 'group') this.setState(rt, 'group', this.groupState());
  }

  private setState(rt: LuaRuntime, name: string, value: unknown): void {
    try {
      rt.setData(['state', name], value);
    } catch {
      /* too deep */
    }
  }

  private charState(): Record<string, unknown> {
    const c = this.o.game?.char;
    if (!c) return {};
    return {
      name: c.name ?? undefined,
      fullname: c.fullname ?? undefined,
      vitals: Object.fromEntries([...c.vitals].filter(([, v]) => v !== null)),
      status: Object.fromEntries([...c.statusVars].filter(([, v]) => v !== null)),
    };
  }

  private groupState(): unknown[] {
    const g = this.o.game?.group;
    if (!g) return [];
    return g.list().map((m) => ({
      id: m.id,
      type: m.type,
      name: m.name,
      label: m.label ?? undefined,
      hp: vital(m.hp),
      mana: vital(m.mana),
      mp: vital(m.mp),
    }));
  }

  // ---------------------------------------------------------- #script / #lua

  /** `#script <sub> …` and `#lua {script} {function} {args}` (commands.ts forms). */
  command(name: 'script' | 'lua', args: string[]): void {
    if (name === 'lua') {
      this.luaCommand(args);
      return;
    }
    void this.scriptCommand(args);
  }

  private luaCommand(args: string[]): void {
    const [script, fn, ...rest] = args;
    const o = this.owners.get(script!);
    if (!o) {
      this.o.message(this.lib.get(script!) ? `#lua: script ${script} is not running.` : `#lua: no script ${script}.`);
      return;
    }
    const ref = o.exports.get(fn!);
    if (ref === undefined) {
      this.o.message(`#lua: ${script} exports no function ${fn}.`);
      return;
    }
    if (rest.length > 0) this.call(o, ref, rest.join(' '));
    else this.call(o, ref);
  }

  private async scriptCommand(args: string[]): Promise<void> {
    await this.lib.init();
    const [sub, name, ...rest] = args;
    const width = Math.max(40, Math.min(100, (this.o.cols?.() ?? 80) - 1));
    if (sub === 'list') {
      this.o.print(listRows(this.lib.list(), (n) => this.owners.has(n), width));
      return;
    }
    if (!name) {
      this.o.message(sub === 'set' ? 'Usage: #script set <name> <setting> <value>' : `Usage: #script ${sub} <name>`);
      return;
    }
    const s = this.lib.get(name);
    if (!s) {
      this.o.message(`No script ${name}. Type #script list for the list.`);
      return;
    }
    switch (sub) {
      case 'help':
        this.o.print(helpRows(s, this.owners.has(name), width));
        return;
      case 'set': {
        const [setting, ...value] = rest;
        if (!setting || value.length === 0) {
          this.o.message('Usage: #script set <name> <setting> <value>');
          return;
        }
        const r = await this.lib.setSetting(name, setting, value.join(' '));
        this.o.message(r.ok ? `${name}: ${setting} = ${settingText(r.value)}` : `#script set: ${r.reason}`);
        return;
      }
      case 'enable':
      case 'disable': {
        const on = sub === 'enable';
        if (s.enabled === on) {
          this.o.message(`Script ${name} is already ${on ? 'on' : 'off'}.`);
          return;
        }
        await this.lib.setEnabled(name, on);
        await this.sync();
        if (!on) this.o.message(`Script ${name} turned off.`);
        else if (this.owners.has(name)) this.o.message(`Script ${name} turned on.`);
        else this.o.message(`Script ${name} is on but did not load: ${this.lib.get(name)?.lastError ?? 'see the UI messages'}`);
        return;
      }
      case 'reload':
        if (!s.enabled) {
          this.o.message(`Script ${name} is off; #script enable ${name} turns it on.`);
          return;
        }
        await this.reload(name);
        this.o.message(this.owners.has(name) ? `Script ${name} reloaded.` : `Script ${name} did not load: ${this.lib.get(name)?.lastError ?? ''}`);
        return;
    }
  }

  // -------------------------------------------------------------------- API

  /** The running script's owner (inside an API function). */
  private cur(rt: LuaRuntime): Owner {
    const name = rt.current?.name;
    const o = name === undefined ? undefined : this.owners.get(name);
    if (!o || o.dead) throw new Error('no script is running');
    return o;
  }

  private defineApi(rt: LuaRuntime): void {
    const engine = this.engine;
    const store = engine.scripts;
    const id = (): number => ++this.seq;

    const addRule = (a: LuaArgs, kind: 'action' | 'alias', make: (s: string) => ReturnType<typeof substringPattern>): number => {
      const o = this.cur(rt);
      const text = a.string(1);
      let compiled: ReturnType<typeof substringPattern>;
      try {
        compiled = make(text);
      } catch (err) {
        throw new Error(`bad argument #1 to '${a.name}' (${err instanceof Error ? err.message : String(err)})`);
      }
      const ref = a.function(2);
      const n = id();
      const key = `${o.name}#${n}`;
      const fn =
        kind === 'action'
          ? (ctx: MatchContext): void => this.onTrigger(o, ref, ctx)
          : (ctx: MatchContext): boolean => this.onAlias(o, ref, ctx);
      store.defineCompiled(kind, key, compiled, { fn });
      o.rules.set(n, { kind, key, ref });
      return n;
    };
    const killRule = (a: LuaArgs, kind: 'action' | 'alias'): boolean => {
      const o = this.cur(rt);
      const n = a.number(1);
      const r = o.rules.get(n);
      if (!r || r.kind !== kind) return false;
      store.remove(kind, r.key);
      o.rules.delete(n);
      o.script?.release(r.ref);
      return true;
    };

    rt.defineFunction('tempTrigger', (a) => addRule(a, 'action', substringPattern));
    rt.defineFunction('tempRegexTrigger', (a) => addRule(a, 'action', (s) => regexPattern(s)));
    rt.defineFunction('tempAlias', (a) => addRule(a, 'alias', (s) => regexPattern(s, true)));
    rt.defineFunction('killTrigger', (a) => killRule(a, 'action'));
    rt.defineFunction('killAlias', (a) => killRule(a, 'alias'));

    rt.defineFunction('deleteLine', () => {
      const e = engine.lineEdit();
      if (e) e.gag = true;
    });
    rt.defineFunction('replaceLine', (a) => {
      const text = a.string(1);
      const e = engine.lineEdit();
      if (e) e.replace = parseCecho(text.replace(/\r?\n/g, ' '));
    });
    rt.defineFunction('highlight', (a) => {
      const color = a.string(1);
      const style = parseScriptColor(color);
      if (!style) throw new Error(`bad argument #1 to 'highlight' (unknown colour '${color}')`);
      const text = a.count >= 2 && a.type(2) !== 'nil' ? a.string(2) : null;
      const e = engine.lineEdit();
      if (e) (e.highlights ??= []).push({ style, text });
    });

    rt.defineFunction('tempKey', (a) => {
      const o = this.cur(rt);
      const name = a.string(1);
      const key = normalizeKey(name);
      if (!key) throw new Error(`bad argument #1 to 'tempKey' (unknown key '${name}')`);
      const b = keyBindability(key);
      if (!b.ok) throw new Error(`bad argument #1 to 'tempKey' (${name} cannot be bound: ${b.reason})`);
      // A script never takes a key that types text (profile macros may, ADR 0026).
      if (shadowedInputKey(key) === 'types text') throw new Error(`bad argument #1 to 'tempKey' (${name} cannot be bound: it types text)`);
      const ref = a.function(2);
      const n = id();
      const list = this.keyBindings.get(key) ?? [];
      list.push({ owner: o, id: n, ref });
      this.keyBindings.set(key, list);
      if (list.length === 1) store.define('macro', key, '', { fn: () => this.onKey(key) });
      setLiveScriptKey(key, o.name);
      o.keys.set(n, key);
      return n;
    });
    rt.defineFunction('killKey', (a) => {
      const o = this.cur(rt);
      const n = a.number(1);
      const key = o.keys.get(n);
      if (key === undefined) return false;
      const b = this.keyBindings.get(key)?.find((x) => x.owner === o && x.id === n);
      this.unbindKey(key, o, n);
      o.keys.delete(n);
      if (b) o.script?.release(b.ref);
      return true;
    });

    rt.defineFunction('tempTimer', (a) => {
      const o = this.cur(rt);
      const secs = a.number(1);
      if (!Number.isFinite(secs) || secs < 0) throw new Error(`bad argument #1 to 'tempTimer' (seconds must be 0 or more)`);
      const ref = a.function(2);
      const repeat = a.boolean(3);
      const n = id();
      const tname = `${o.name}#${n}`;
      const kind = repeat ? 'ticker' : 'delay';
      o.timers.set(n, { kind, tname, ref });
      store.addTimer(kind, tname, '', secs, () => this.onTimer(o, n));
      return n;
    });
    rt.defineFunction('killTimer', (a) => {
      const o = this.cur(rt);
      const n = a.number(1);
      const t = o.timers.get(n);
      if (!t) return false;
      store.removeTimer(t.kind, t.tname);
      o.timers.delete(n);
      o.script?.release(t.ref);
      return true;
    });

    rt.defineFunction('registerAnonymousEventHandler', (a) => {
      const o = this.cur(rt);
      const event = a.string(1);
      const key = eventKey(event);
      if (key === '') throw new Error(`bad argument #1 to 'registerAnonymousEventHandler' (empty event name)`);
      const ref = a.function(2);
      const n = id();
      const list = this.handlers.get(key) ?? [];
      list.push({ owner: o, id: n, ref });
      this.handlers.set(key, list);
      o.handlers.set(n, key);
      if (ENGINE_EVENT.test(key)) this.updateEventTap();
      return n;
    });
    rt.defineFunction('killAnonymousEventHandler', (a) => {
      const o = this.cur(rt);
      const n = a.number(1);
      const key = o.handlers.get(n);
      if (key === undefined) return false;
      const b = this.handlers.get(key)?.find((x) => x.owner === o && x.id === n);
      o.handlers.delete(n);
      this.dropHandler(key, o, n);
      if (b) o.script?.release(b.ref);
      return true;
    });

    rt.defineFunction('send', (a) => {
      this.cur(rt);
      this.o.send(a.string(1));
    });
    rt.defineFunction('expandAlias', (a) => {
      this.cur(rt);
      engine.run(a.string(1));
    });
    const echoLines = (text: string, colored: boolean): void => {
      const lines = text.replace(/\r/g, '').split('\n');
      if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
      for (const l of lines) {
        if (colored) {
          const c = parseCecho(l);
          engine.echo(c.text, c.runs);
        } else engine.echo(l);
      }
    };
    rt.defineFunction('echo', (a) => echoLines(a.string(1), false));
    rt.defineFunction('cecho', (a) => echoLines(a.string(1), true));
    rt.defineFunction('print', (a) => {
      const parts: string[] = [];
      for (let i = 1; i <= a.count; i++) {
        const t = a.type(i);
        parts.push(t === 'string' || t === 'number' ? a.string(i) : t === 'boolean' ? String(a.boolean(i)) : t);
      }
      echoLines(parts.join('\t'), false);
    });
    // The trigger's line with its colours, as cecho text (Mudlet's
    // copy2decho, in cecho tags; ADR 0054 round 4).
    rt.defineFunction('copy2cecho', () => {
      this.cur(rt);
      const l = this.triggerLine;
      return l ? toCecho(l.text, l.runs) : null;
    });
    // Mudlet's isPrompt(): the trigger's line is a prompt (GA/EOR or
    // MUME's <prompt> element, as the line layer marks it).
    rt.defineFunction('isPrompt', () => {
      this.cur(rt);
      return this.triggerLine?.prompt === true;
    });
    rt.defineFunction('uiMessage', (a) => {
      this.cur(rt);
      const source = a.string(1).trim().toUpperCase().slice(0, 20) || 'SCRIPT';
      this.o.bus.emit('ui.message', { kind: 'event', name: source, parts: [a.string(2)] });
    });

    // Wall-clock time (Mudlet's getEpoch): the sandbox has no `os`, and a
    // script that keeps times across reloads (the store) needs real time.
    rt.defineFunction('getEpoch', () => this.o.epoch?.() ?? Date.now() / 1000);

    rt.defineFunction('getVariable', (a) => engine.getVariable(a.string(1)) ?? null);
    rt.defineFunction('setVariable', (a) => {
      this.cur(rt);
      const name = a.string(1);
      if (name.trim() === '') throw new Error(`bad argument #1 to 'setVariable' (empty name)`);
      const t = a.type(2);
      const value = t === 'boolean' ? String(a.boolean(2)) : a.string(2);
      engine.setVariable(name, value, false);
    });

    rt.defineFunction('export', (a) => {
      const o = this.cur(rt);
      const name = a.string(1);
      if (!/^\S+$/.test(name)) throw new Error(`bad argument #1 to 'export' (a name without spaces expected)`);
      const ref = a.function(2);
      const old = o.exports.get(name);
      if (old !== undefined) o.script?.release(old);
      o.exports.set(name, ref);
    });

    rt.defineFunction('setSetting', (a) => {
      const o = this.cur(rt);
      const setting = a.string(1);
      const t = a.type(2);
      if (t !== 'string' && t !== 'number' && t !== 'boolean') {
        throw new Error(`bad argument #2 to 'setSetting' (string, number or boolean expected, got ${t})`);
      }
      const decl = this.lib.get(o.name)?.header.settings.find((d) => d.name === setting);
      if (!decl) throw new Error(`bad argument #1 to 'setSetting' (no @setting '${setting}')`);
      const text = t === 'boolean' ? String(a.boolean(2)) : a.string(2);
      // Saved like `#script set`; `settings` updates once it is stored.
      void this.lib.setSetting(o.name, setting, text).then((r) => {
        if (!r.ok) this.ui('error', `${o.name}: setSetting ${setting}: ${r.reason}`);
      });
    });

    rt.defineTable('store', {
      get: (a) => {
        const o = this.cur(rt);
        return this.lib.storeGet(o.name, a.string(1)) ?? null;
      },
      set: (a) => {
        const o = this.cur(rt);
        const key = a.string(1);
        const t = a.type(2);
        if (t === 'nil' || t === 'no value') {
          this.lib.storeSet(o.name, key, undefined);
          return;
        }
        if (t !== 'string' && t !== 'number' && t !== 'boolean' && t !== 'table') {
          throw new Error(`bad argument #2 to 'store.set' (string, number, boolean or table expected, got ${t})`);
        }
        this.lib.storeSet(o.name, key, a.value(2) as StoreValue);
      },
    });

    rt.defineView('gmcp');
    rt.defineView('state');
    this.definePanes(rt);
  }

  // ------------------------------------------------------------------ panes

  /** `createPane` and the `Pane` methods (spec §2.10 "Panes", ADR 0053). */
  private definePanes(rt: LuaRuntime): void {
    const id = (): number => ++this.seq;
    /**
     * The pane `self` (argument 1) of the running script, or null when it
     * was closed (`pane:close()`, the user's close cross): method calls on
     * a closed pane do nothing.
     */
    const self = (a: LuaArgs): PaneReg | null => {
      const o = this.cur(rt);
      const p = this.paneHandles.get(a.object(1, cls));
      if (!p) return null;
      if (p.owner !== o) throw new Error(`${a.name}: the pane belongs to another script`);
      return p;
    };
    const row = (a: LuaArgs, i: number): number => {
      const n = a.number(i);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LINES) {
        throw new Error(`bad argument #${i} to '${a.name}' (row must be a whole number from 1 to ${MAX_LINES})`);
      }
      return n - 1;
    };
    const color = (a: LuaArgs, name: string): number | undefined => {
      const style = parseScriptColor(name);
      const c = style?.fg ?? style?.bg;
      if (c === undefined) throw new Error(`bad argument #3 to '${a.name}' (unknown colour '${name}')`);
      return c;
    };
    const done = (p: PaneReg): void => p.view.changed();

    /** The field `self` (argument 1) of the running script, or null once it is gone. */
    const fieldSelf = (a: LuaArgs): FieldReg | null => {
      const o = this.cur(rt);
      const f = this.fieldHandles.get(a.object(1, fieldCls));
      if (!f) return null;
      if (f.pane.owner !== o) throw new Error(`${a.name}: the field belongs to another script`);
      return f;
    };
    const fieldCls: LuaClass = rt.defineClass('PaneField', {
      focus: (a) => {
        const f = fieldSelf(a);
        if (f) f.pane.view.focusField?.(f.id, false);
      },
      select: (a) => {
        const f = fieldSelf(a);
        if (f) f.pane.view.focusField?.(f.id, true);
      },
      value: (a) => {
        const f = fieldSelf(a);
        return f ? (f.pane.content.field(f.id)?.value ?? null) : null;
      },
      setValue: (a) => {
        const f = fieldSelf(a);
        if (!f) return;
        if (f.pane.content.setFieldValue(f.id, a.string(2))) done(f.pane);
      },
      remove: (a) => {
        const f = fieldSelf(a);
        if (!f) return;
        f.pane.content.removeField(f.id);
        done(f.pane);
      },
    });

    const cls: LuaClass = rt.defineClass('Pane', {
      clear: (a) => {
        const p = self(a);
        if (!p) return;
        p.content.clear();
        done(p);
      },
      echo: (a) => {
        const p = self(a);
        if (!p) return;
        p.content.append(plain(a.string(2)));
        done(p);
      },
      cecho: (a) => {
        const p = self(a);
        if (!p) return;
        p.content.append(parseCecho(a.string(2)));
        done(p);
      },
      setLine: (a) => {
        const p = self(a);
        if (!p) return;
        p.content.setLine(row(a, 2), parseCecho(a.optString(3, '')));
        done(p);
      },
      gauge: (a) => {
        const p = self(a);
        if (!p) return;
        const r = row(a, 2);
        const t = a.table(3);
        if (Array.isArray(t)) throw new Error(`bad argument #3 to '${a.name}' (a table with value and max expected)`);
        const num = (k: string, def: number): number => {
          const v = t[k];
          if (v === undefined) return def;
          if (typeof v !== 'number') throw new Error(`bad argument #3 to '${a.name}' (${k} must be a number)`);
          return v;
        };
        const label = t.label;
        const c = t.color;
        p.content.setGauge(r, {
          value: num('value', 0),
          max: num('max', 100),
          label: typeof label === 'string' || typeof label === 'number' ? String(label) : '',
          ...(typeof c === 'string' ? { color: color(a, c) } : {}),
        });
        done(p);
      },
      cechoLink: (a) => {
        const p = self(a);
        if (!p) return;
        const text = parseCecho(a.string(2));
        const ref = a.function(3);
        const hint = a.optString(4, '');
        const n = id();
        p.links.set(n, ref);
        p.content.appendLink(text, n, hint);
        done(p);
      },
      setLink: (a) => {
        const p = self(a);
        if (!p) return;
        const r = row(a, 2);
        const col = a.number(3);
        const len = a.number(4);
        if (!Number.isInteger(col) || col < 1) throw new Error(`bad argument #3 to '${a.name}' (column must be a whole number from 1)`);
        if (!Number.isInteger(len) || len < 1) throw new Error(`bad argument #4 to '${a.name}' (length must be a whole number from 1)`);
        // No function: a tooltip only (ADR 0056).
        const ref = a.optFunction(5);
        const hint = a.optString(6, '');
        const n = id();
        if (ref !== null) p.links.set(n, ref);
        try {
          p.content.addLink(r, col - 1, len, n, hint, ref === null);
        } catch (err) {
          p.links.delete(n);
          if (ref !== null) p.owner.script?.release(ref);
          throw new Error(`bad argument #3 to '${a.name}' (${err instanceof Error ? err.message : String(err)})`);
        }
        done(p);
      },
      setText: (a) => {
        const p = self(a);
        if (!p) return;
        const r = row(a, 2);
        const col = a.number(3);
        if (!Number.isInteger(col) || col < 1) throw new Error(`bad argument #3 to '${a.name}' (column must be a whole number from 1)`);
        try {
          p.content.setText(r, col - 1, parseCecho(a.string(4)));
        } catch (err) {
          throw new Error(`bad argument #2 to '${a.name}' (${err instanceof Error ? err.message : String(err)})`);
        }
        done(p);
      },
      setInput: (a) => {
        const p = self(a);
        if (!p) return null;
        const r = row(a, 2);
        const col = a.number(3);
        const len = a.number(4);
        if (!Number.isInteger(col) || col < 1) throw new Error(`bad argument #3 to '${a.name}' (column must be a whole number from 1)`);
        if (!Number.isInteger(len) || len < 1) throw new Error(`bad argument #4 to '${a.name}' (length must be a whole number from 1)`);
        const opts: { value?: string; placeholder?: string; maxLength?: number } = {};
        const has = a.count >= 5 && a.type(5) !== 'nil';
        if (has) {
          const t = a.table(5);
          if (Array.isArray(t) && t.length > 0) throw new Error(`bad argument #5 to '${a.name}' (a table of options expected)`);
          const o = Array.isArray(t) ? {} : t;
          const text = (k: 'value' | 'placeholder'): void => {
            const v = o[k];
            if (v === undefined) return;
            if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`bad argument #5 to '${a.name}' (${k} must be a string)`);
            opts[k] = String(v);
          };
          text('value');
          text('placeholder');
          if (o.maxLength !== undefined) {
            if (typeof o.maxLength !== 'number' || !Number.isFinite(o.maxLength) || o.maxLength < 1) {
              throw new Error(`bad argument #5 to '${a.name}' (maxLength must be a number from 1)`);
            }
            opts.maxLength = o.maxLength;
          }
        }
        const n = id();
        const f: FieldReg = { pane: p, id: n, submit: null, cancel: null, change: null, key: null, blur: null };
        try {
          if (has) {
            f.submit = a.fieldFunction(5, 'onSubmit');
            f.cancel = a.fieldFunction(5, 'onCancel');
            f.change = a.fieldFunction(5, 'onChange');
            f.key = a.fieldFunction(5, 'onKey');
            f.blur = a.fieldFunction(5, 'onBlur');
          }
          p.content.addField(r, col - 1, len, n, opts);
        } catch (err) {
          this.releaseField(f);
          throw err instanceof RangeError ? new Error(`bad argument #3 to '${a.name}' (${err.message})`) : err;
        }
        p.fields.set(n, f);
        this.fieldHandles.set(n, f);
        done(p);
        return rt.object(fieldCls, n);
      },
      size: (a) => {
        const { cols, rows } = self(a)?.view.size() ?? { cols: 0, rows: 0 };
        return rt.multi(rows, cols);
      },
      onResize: (a) => {
        const p = self(a);
        const ref = a.optFunction(2);
        if (!p) {
          if (ref !== null) this.cur(rt).script?.release(ref);
          return;
        }
        if (p.resize !== null) p.owner.script?.release(p.resize);
        p.resize = ref;
      },
      onClose: (a) => {
        const p = self(a);
        const ref = a.optFunction(2);
        if (!p) {
          if (ref !== null) this.cur(rt).script?.release(ref);
          return;
        }
        if (p.onClose !== null) p.owner.script?.release(p.onClose);
        p.onClose = ref;
      },
      show: (a) => self(a)?.view.setOn(true),
      hide: (a) => self(a)?.view.setOn(false),
      visible: (a) => self(a)?.view.isOn() ?? false,
      setTitle: (a) => {
        const p = self(a);
        if (!p) return;
        p.content.setTitle(a.string(2));
        done(p);
      },
      close: (a) => {
        const p = self(a);
        if (p) this.closePane(p);
      },
    });

    rt.defineFunction('createPane', (a) => {
      const o = this.cur(rt);
      const t = a.table(1);
      if (Array.isArray(t)) throw new Error(`bad argument #1 to 'createPane' (a table with id expected)`);
      const name = t.id;
      if (typeof name !== 'string' || !SCRIPT_PANE_NAME.test(name)) {
        throw new Error(`bad argument #1 to 'createPane' (id must be 1 to 32 letters, digits, _ or -)`);
      }
      const title = t.title === undefined ? undefined : String(t.title);
      const temporary = t.temporary;
      if (temporary !== undefined && typeof temporary !== 'boolean') {
        throw new Error(`bad argument #1 to 'createPane' (temporary must be true or false)`);
      }
      const at = (t.at ?? 'center') as TempPaneAt;
      if (!TEMP_PANE_AT.includes(at)) {
        throw new Error(`bad argument #1 to 'createPane' (at must be one of ${TEMP_PANE_AT.map((x) => `"${x}"`).join(', ')})`);
      }
      const anchor = t.anchor ?? 'bottom';
      if (anchor !== 'top' && anchor !== 'bottom') {
        throw new Error(`bad argument #1 to 'createPane' (anchor must be "top" or "bottom")`);
      }
      const old = o.panes.get(name);
      if (old) {
        // Reload-safe: the same pane again (a new title applies).
        if (title !== undefined) {
          old.content.setTitle(title);
          done(old);
        }
        return rt.object(cls, old.handle);
      }
      const dock = t.dock ?? 'right';
      if (dock !== 'float' && !DOCK_IDS.includes(dock as DockId)) {
        throw new Error(`bad argument #1 to 'createPane' (dock must be right, left, top, bottom or float)`);
      }
      const size = (k: 'rows' | 'cols', def: number, max: number): number => {
        const v = t[k];
        if (v === undefined) return def;
        if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`bad argument #1 to 'createPane' (${k} must be a number)`);
        return Math.max(1, Math.min(max, Math.round(v)));
      };
      const rows = size('rows', PANE_DEFAULT_ROWS, PANE_MAX_ROWS);
      const cols = size('cols', PANE_DEFAULT_COLS, PANE_MAX_COLS);
      const temp = temporary === true;
      const pid = temp ? tempPaneId(o.name, name) : scriptPaneId(o.name, name);
      const handle = id();
      const reg = {
        owner: o,
        handle,
        name,
        id: pid,
        temporary: temp,
        onClose: null,
        links: new Map(),
        resize: null,
        lastSize: '',
        fields: new Map(),
      } as unknown as PaneReg;
      reg.content = new PaneContent(title ?? name, {
        anchor,
        onDrop: (n) => {
          const ref = reg.links.get(n);
          if (ref === undefined) return;
          reg.links.delete(n);
          o.script?.release(ref);
        },
        onDropField: (n) => {
          const f = reg.fields.get(n);
          if (f) this.releaseField(f);
        },
      });
      const events = {
        onLink: (n: number) => this.onPaneLink(reg, n),
        onResize: (c: number, r: number) => this.onPaneResize(reg, c, r),
        onClose: () => this.onPaneClosed(reg),
        onField: (n: number, e: FieldEvent) => this.onPaneField(reg, n, e),
      };
      const place = { dock: dock as DockId | 'float', rows, cols };
      const spec = temp ? { id: pid, place, temporary: at === 'center' ? { rows, cols } : { rows, cols, at } } : { id: pid, place };
      reg.view = this.o.panes?.open(spec, reg.content, events) ?? headlessView();
      o.panes.set(name, reg);
      this.paneHandles.set(handle, reg);
      return rt.object(cls, handle);
    });
  }

  /**
   * Closes pane `p` (`pane:close()`, or the user closed a temporary pane):
   * it leaves the screen, its functions are released and its methods do
   * nothing from now on; `createPane` with its id makes a new one. An
   * ordinary pane's place and toggles stay in the settings.
   */
  private closePane(p: PaneReg): void {
    if (this.paneHandles.get(p.handle) !== p) return;
    this.paneHandles.delete(p.handle);
    if (p.owner.panes.get(p.name) === p) p.owner.panes.delete(p.name);
    const s = p.owner.script;
    for (const ref of p.links.values()) s?.release(ref);
    p.links.clear();
    if (p.resize !== null) s?.release(p.resize);
    p.resize = null;
    if (p.onClose !== null) s?.release(p.onClose);
    p.onClose = null;
    for (const f of [...p.fields.values()]) this.releaseField(f);
    p.view.close();
  }

  /** Forgets field `f` and releases its functions. */
  private releaseField(f: FieldReg): void {
    if (f.pane.fields.get(f.id) === f) f.pane.fields.delete(f.id);
    if (this.fieldHandles.get(f.id) === f) this.fieldHandles.delete(f.id);
    const s = f.pane.owner.script;
    for (const ref of [f.submit, f.cancel, f.change, f.key, f.blur]) if (ref !== null) s?.release(ref);
    f.submit = f.cancel = f.change = f.key = f.blur = null;
  }

  /** A text field changed, was submitted or cancelled, or got a key (ADR 0055). */
  private onPaneField(p: PaneReg, n: number, e: FieldEvent): void {
    const f = p.fields.get(n);
    if (!f || p.owner.dead || this.paneHandles.get(p.handle) !== p) return;
    if (e.type === 'change' || e.type === 'submit' || e.type === 'blur') {
      if (p.content.setFieldValue(n, e.text)) p.view.changed();
    }
    const ref =
      e.type === 'change' ? f.change : e.type === 'submit' ? f.submit : e.type === 'cancel' ? f.cancel : e.type === 'blur' ? f.blur : f.key;
    if (ref === null) return;
    if (e.type === 'key') this.call(p.owner, ref, e.key);
    else if (e.type === 'cancel') this.call(p.owner, ref);
    else this.call(p.owner, ref, p.content.field(n)?.value ?? e.text);
  }

  /** The user closed a temporary pane with its cross: close it, then call its `onClose` handler. */
  private onPaneClosed(p: PaneReg): void {
    if (p.owner.dead || this.paneHandles.get(p.handle) !== p) return;
    const ref = p.onClose;
    p.onClose = null;
    this.closePane(p);
    if (ref !== null) {
      this.call(p.owner, ref);
      if (!p.owner.dead) p.owner.script?.release(ref);
    }
  }

  private onPaneLink(p: PaneReg, n: number): void {
    const ref = p.links.get(n);
    if (ref === undefined || p.owner.dead || this.paneHandles.get(p.handle) !== p) return;
    this.call(p.owner, ref);
  }

  private onPaneResize(p: PaneReg, cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0 || p.owner.dead) return;
    const key = `${cols}x${rows}`;
    if (key === p.lastSize) return;
    p.lastSize = key;
    if (p.resize !== null) this.call(p.owner, p.resize, rows, cols);
  }

  private onTrigger(o: Owner, ref: LuaRef, ctx: MatchContext): void {
    const s = o.script;
    if (!s || o.dead) return;
    s.setEnv('matches', ctx.args);
    s.setEnv('line', ctx.line?.text ?? ctx.args[0] ?? '');
    const prev = this.triggerLine;
    this.triggerLine = ctx.line ?? null;
    try {
      this.call(o, ref);
    } finally {
      this.triggerLine = prev;
    }
  }

  /** The game line the running trigger matched (`copy2cecho`). */
  private triggerLine: { text: string; runs: readonly StyleRun[]; prompt?: boolean } | null = null;

  /** False (the alias did not take the command) only when the handler returned false. */
  private onAlias(o: Owner, ref: LuaRef, ctx: MatchContext): boolean {
    const s = o.script;
    if (!s || o.dead) return false;
    const input = ctx.input ?? ctx.args[0] ?? '';
    s.setEnv('matches', ctx.args);
    s.setEnv('line', input);
    s.setEnv('command', input);
    const r = this.call(o, ref);
    return !(r?.ok && r.value === false);
  }

  private onTimer(o: Owner, n: number): void {
    const t = o.timers.get(n);
    if (!t || o.dead) return;
    if (t.kind === 'delay') o.timers.delete(n);
    this.call(o, t.ref);
    if (t.kind === 'delay' && !o.dead) o.script?.release(t.ref);
  }

  private onKey(key: string): void {
    const list = this.keyBindings.get(key);
    const b = list?.[list.length - 1];
    if (b) this.call(b.owner, b.ref);
  }

  private unbindKey(key: string, o: Owner, id: number): void {
    const list = (this.keyBindings.get(key) ?? []).filter((b) => !(b.owner === o && b.id === id));
    if (list.length > 0) {
      this.keyBindings.set(key, list);
      setLiveScriptKey(key, list[list.length - 1]!.owner.name);
      return;
    }
    this.keyBindings.delete(key);
    this.engine.scripts.remove('macro', key);
    setLiveScriptKey(key, null);
  }
}

/** `message` with `name: ` in front unless it already names the script. */
function withName(name: string, message: string): string {
  return message.startsWith(name + ':') ? message : `${name}: ${message}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function vital(v: { value: number | null; max: number | null; word: string | null }): Record<string, unknown> {
  return { value: v.value ?? undefined, max: v.max ?? undefined, word: v.word ?? undefined };
}

/** A pane without a surface (tests, the bench): content only, never shown. */
function headlessView(): ScriptPaneView {
  let on = true;
  return {
    changed: () => {},
    setOn: (v) => (on = v),
    isOn: () => on,
    size: () => ({ cols: 0, rows: 0 }),
    close: () => {},
  };
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function defaultLoadRuntime(): Promise<LuaRuntime> {
  const { loadLuaRuntime } = await import('../lua');
  return loadLuaRuntime();
}

/** A line-model colour as a cecho colour name: `ansi_N` for the palette, `#rrggbb` else. */
function cechoColor(c: Color): string {
  if (c < TRUECOLOR) return `ansi_${c}`;
  return '#' + (c & 0xffffff).toString(16).padStart(6, '0');
}

/**
 * `text` with its style runs as cecho text (`copy2cecho`): colours as
 * `<ansi_N>` / `<#rrggbb>` (background after a colon), `<b>`, `<i>`, `<u>`,
 * `<reset>` between runs. A literal `<…>` in the text that is also a tag
 * would be read as one; game text has none in practice.
 */
export function toCecho(text: string, runs: readonly StyleRun[]): string {
  if (runs.length === 0) return text;
  let out = '';
  let pos = 0;
  for (const r of runs) {
    if (r.start > pos) out += text.slice(pos, r.start);
    const s = Math.max(pos, r.start);
    if (r.end <= s) continue;
    let tag = '';
    if (r.fg !== undefined || r.bg !== undefined) {
      tag += `<${r.fg !== undefined ? cechoColor(r.fg) : ''}${r.bg !== undefined ? ':' + cechoColor(r.bg) : ''}>`;
    }
    if (r.bold) tag += '<b>';
    if (r.italic) tag += '<i>';
    if (r.underline) tag += '<u>';
    out += tag + text.slice(s, r.end) + (tag ? '<reset>' : '');
    pos = r.end;
  }
  return out + text.slice(pos);
}
