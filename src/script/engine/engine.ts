// The tt++ script engine (spec §1.2 layers 5–6, §3; ADR 0015 "Engine
// contract", "Display pipeline and bus").
//
//   input(text)        a typed line: `;` split, `#` commands, aliases, send
//   runMacro(key)      a bound key
//   processLine(line)  actions on the original line, then the display copy
//                      (substitutes, gags, highlights) → `text.display`
//   processPartial     substitutes and highlights only → `text.displayPartial`
//   loadProfile(text)  atomic: builds a new user store, swaps when done
//
// Two stores: `system` (built-in code; never serialised) and the user
// store (the profile). Actions of both stores fan out in priority order;
// the first matching alias wins. Everything runs synchronously: key →
// send has no await.
//
// Guards: alias nesting depth (ALIAS_DEPTH), an alias never re-enters
// itself (its own name in its body is sent to the game), #showme → action
// nesting (SHOW_DEPTH), and a per-entry command budget (BUDGET) against
// runaway #N repeats.

import type { Bus } from '../../core/bus';
import { type BusEvents, type Line, type StyleRun, nowUs } from '../../core/types';
import { type CommandEntry, resolveCommand } from '../commands';
import { checkBraces, parseProfile } from '../doc';
import { parseColored } from './color';
import { ExprError, evalCondition, evalMath } from './expr';
import { formatString } from './format';
import { type CompiledPattern, argsFrom, compilePattern, globalRe, matchPattern } from './pattern';
import { overlay, splice, styleAt } from './runs';
import {
  DefineError,
  type ListKind,
  type MatchContext,
  type Rule,
  RuleStore,
  type Timer,
  type TimerKind,
  ruleOrder,
} from './store';
import { type Scheduler, realScheduler } from './timers';
import { ArgReader, expandArgs, expandVars, finishText, splitCommands, splitWords } from './text';

/** Maximum alias nesting. */
export const ALIAS_DEPTH = 32;
/** Maximum #showme → action → #showme nesting. */
export const SHOW_DEPTH = 8;
/** Commands one entry (typed line, game line, key, timer) may run. */
export const BUDGET = 10000;
/** Maximum count for `#N command`. */
export const REPEAT_MAX = 100;

/**
 * The curated #event list (spec §3 "Should"). Arguments:
 * - `SESSION CONNECTED`: %0 = `mume`
 * - `SESSION DISCONNECTED`: %0 = `mume`, %1 = the reason
 * - `IAC SB GMCP <Package>`: %0 = the package as sent, %1 = the JSON text;
 *   matched case-insensitively
 * - `IAC SB GMCP`: every GMCP message, same arguments
 */
export const EVENT_NAMES: readonly string[] = ['SESSION CONNECTED', 'SESSION DISCONNECTED', 'IAC SB GMCP <Package>', 'IAC SB GMCP'];

export type LoadResult = { ok: true; warnings: string[] } | { ok: false; reason: string };

export interface EngineOptions {
  /** Sends one command to the game (echo is the sender's business). */
  send: (text: string) => void;
  /** A `[SYSTEM]` message. */
  message: (text: string) => void;
  /** Client commands (`#connect`, `#help` …): name without `#`, argument text. */
  client?: (name: string, args: string) => void;
  /**
   * A variable of the user store was set by a script or command at run
   * time (not while loading). For the profile write-back.
   */
  onVariable?: (name: string, value: string) => void;
  scheduler?: Scheduler;
  /** Wall clock in ms (for #format %t/%T/%U). */
  now?: () => number;
}

interface Ctx {
  /** Where definitions and variables go. */
  store: RuleStore;
  depth: number;
  /** A command typed by the user (not from a rule). */
  direct: boolean;
}

interface ParsedHash {
  entry: CommandEntry | null | 'ambiguous';
  word: string;
  rest: string;
  repeat: number;
}

const IF_NONE = 0;
const IF_TAKEN = 1;
const IF_OPEN = 2;

const LIST_KIND_BY_RULE: Partial<Record<string, ListKind>> = {
  action: 'action',
  alias: 'alias',
  highlight: 'highlight',
  substitute: 'substitute',
  gag: 'gag',
  macro: 'macro',
  event: 'event',
};

export class ScriptEngine {
  /** Built-in rules (trackers, stage 5). Never written to a profile. */
  readonly system: RuleStore;
  private userStore: RuleStore;
  private readonly opts: EngineOptions;
  private readonly scheduler: Scheduler;
  private readonly now: () => number;
  private bus: Bus | null = null;
  private readonly unsubs: Array<() => void> = [];

  private readonly splitCache = new Map<string, string[]>();
  private readonly hashCache = new Map<string, ParsedHash>();
  private readonly anchoredCache = new WeakMap<CompiledPattern, RegExp>();
  private readonly globalCache = new WeakMap<CompiledPattern, RegExp>();
  private readonly mergedCache = new Map<ListKind, { sv: number; uv: number; u: RuleStore; list: readonly Rule[] }>();

  /** Set while loadProfile runs. */
  private loading: { warnings: string[]; line: number } | null = null;
  private budget = 0;
  private entryDepth = 0;
  private showDepth = 0;
  private showWarned = false;
  private readonly activeAliases = new Set<Rule>();
  /** Inert command hints already given since the last load. */
  private readonly hinted = new Set<string>();

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.scheduler = opts.scheduler ?? realScheduler;
    this.now = opts.now ?? Date.now;
    this.system = new RuleStore('system', this.scheduler, this.onTimer);
    this.userStore = new RuleStore('user', this.scheduler, this.onTimer);
  }

  /** The profile's store (replaced by loadProfile). */
  get user(): RuleStore {
    return this.userStore;
  }

  // ------------------------------------------------------------------- bus

  /**
   * Subscribes to the bus: game lines and partials go through the display
   * pipeline (`text.display`, `text.displayPartial`), GMCP and connection
   * changes fire #event rules.
   */
  attach(bus: Bus): void {
    this.bus = bus;
    this.unsubs.push(
      bus.on('text.line', (l) => this.processLine(l)),
      bus.on('text.partial', (l) => this.processPartial(l)),
      bus.on('gmcp.raw', (m) => this.onGmcp(m)),
      bus.on('conn.state', (s) => this.onConn(s)),
    );
  }

  dispose(): void {
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.userStore.dispose();
    this.system.dispose();
  }

  private onGmcp(m: BusEvents['gmcp.raw']): void {
    if (!this.system.hasEvents && !this.userStore.hasEvents) return;
    const args = [m.pkg, m.json];
    this.fireEvent('IAC SB GMCP ' + m.pkg, args);
    this.fireEvent('IAC SB GMCP', args);
  }

  private onConn(s: BusEvents['conn.state']): void {
    if (!this.system.hasEvents && !this.userStore.hasEvents) return;
    if (s.state === 'login' && s.prev === 'connecting') this.fireEvent('SESSION CONNECTED', ['mume']);
    else if (s.state === 'disconnected' && s.prev !== 'disconnected' && s.prev !== 'idle') {
      this.fireEvent('SESSION DISCONNECTED', ['mume', s.reason ?? '']);
    }
  }

  /** Fires the #event rules for `name` (case-insensitive) with `args` as %0, %1 …. */
  fireEvent(name: string, args: readonly string[]): void {
    const key = name.trim().toUpperCase().replace(/\s+/g, ' ');
    for (const store of [this.system, this.userStore]) {
      const r = store.event(key);
      if (!r) continue;
      this.entry(() => this.fire(r, [...args], null));
    }
  }

  // ------------------------------------------------------------------ load

  /**
   * Loads a profile: executes its top-level commands in order into a new
   * user store and swaps it in when done (the old store's timers stop).
   * Commands that would send to the game or run client commands are not
   * run while loading. Unbalanced braces refuse the whole text.
   */
  loadProfile(text: string): LoadResult {
    const braces = checkBraces(text);
    if (!braces.ok) {
      const line = text.slice(0, braces.index).split('\n').length;
      return {
        ok: false,
        reason:
          braces.kind === 'unclosed'
            ? `Unbalanced braces: the { on line ${line} is never closed.`
            : `Unbalanced braces: the } on line ${line} has no {.`,
      };
    }
    const fresh = new RuleStore('user', this.scheduler, this.onTimer);
    const old = this.userStore;
    const state = { warnings: [] as string[], line: 1 };
    this.userStore = fresh;
    this.loading = state;
    this.hinted.clear();
    try {
      const doc = parseProfile(text);
      const ctx: Ctx = { store: fresh, depth: 0, direct: false };
      for (const node of doc.nodes) {
        const lines = countLines(node.text);
        if (node.type !== 'blank') {
          if (node.type === 'passthrough' && node.reason === 'text') {
            if (node.text.trim() !== '') this.warn(`text outside a command is ignored: ${clip(node.text.trim())}`);
          } else {
            this.budget = 0;
            this.execList(node.text, ctx);
          }
        }
        state.line += lines;
      }
    } catch (err) {
      this.userStore = old;
      this.loading = null;
      fresh.dispose();
      return { ok: false, reason: `Profile failed to load: ${err instanceof Error ? err.message : String(err)}` };
    }
    this.loading = null;
    this.hinted.clear();
    old.dispose();
    return { ok: true, warnings: state.warnings };
  }

  // ----------------------------------------------------------------- input

  /** A typed line (Enter). An empty line sends a bare newline. */
  input(text: string): void {
    if (text === '') {
      this.opts.send('');
      return;
    }
    this.entry(() => this.execList(text, { store: this.userStore, depth: 0, direct: true }));
  }

  /** Runs the macro bound to a canonical key name. False when none is bound. */
  runMacro(key: string): boolean {
    const r = this.userStore.macro(key) ?? this.system.macro(key);
    if (!r) return false;
    this.entry(() => this.fire(r, null, null));
    return true;
  }

  hasMacro(key: string): boolean {
    return this.userStore.macro(key) !== undefined || this.system.macro(key) !== undefined;
  }

  /** Runs `text` as a command list in the user store context (like a rule body). */
  run(text: string): void {
    this.entry(() => this.execList(text, { store: this.userStore, depth: 0, direct: false }));
  }

  /** Shows `text` (colour codes allowed) through the display pipeline, as #showme does. */
  showme(text: string): void {
    this.entry(() => this.show(text));
  }

  getVariable(name: string): string | undefined {
    return this.userStore.getVar(name) ?? this.system.getVar(name);
  }

  /** Sets a user variable (as `#variable` typed by the user would). */
  setVariable(name: string, value: string): void {
    this.setVar({ store: this.userStore, depth: 0, direct: true }, name, value);
  }

  private entry(fn: () => void): void {
    if (this.entryDepth === 0) this.budget = 0;
    this.entryDepth++;
    try {
      fn();
    } catch (err) {
      this.opts.message(`Script error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.entryDepth--;
    }
  }

  // ------------------------------------------------------------- execution

  private split(text: string): string[] {
    let parts = this.splitCache.get(text);
    if (!parts) {
      parts = splitCommands(text);
      if (this.splitCache.size > 1000) this.splitCache.clear();
      this.splitCache.set(text, parts);
    }
    return parts;
  }

  /** Runs a command list; returns the #if chain state at its end. */
  private execList(text: string, ctx: Ctx, ifStart = IF_NONE): number {
    const cmds = this.split(text);
    let ifState = ifStart;
    for (let i = 0; i < cmds.length; i++) {
      if (++this.budget > BUDGET) {
        if (this.budget === BUDGET + 1) this.warn(`Too many commands in one go (${BUDGET}); stopped.`);
        return IF_NONE;
      }
      const cmd = cmds[i]!;
      if (cmd.charCodeAt(0) === 0x23 /* # */) ifState = this.execHash(cmd, ctx, ifState);
      else this.execText(cmd, ctx);
    }
    return ifState;
  }

  private lookup(ctx: Ctx): (name: string) => string | undefined {
    const first = ctx.store;
    const second = first === this.system ? this.userStore : this.system;
    return (name) => first.getVar(name) ?? second.getVar(name);
  }

  private vars(text: string, ctx: Ctx): string {
    if (text.indexOf('$') < 0 && text.indexOf('&') < 0) return text;
    return expandVars(text, this.lookup(ctx));
  }

  /** A command for the game (or an alias). */
  private execText(cmd: string, ctx: Ctx): void {
    const line = this.vars(cmd, ctx);
    let sp = 0;
    while (sp < line.length && !isSpace(line.charCodeAt(sp))) sp++;
    const word = line.slice(0, sp);
    // Deprecated (ADR 0036): every command is echoed, so `_send x` is just
    // `x` without alias lookup. Kept because stored profiles still use it.
    if (word === '_send') {
      this.send(finishText(line.slice(sp).trim()));
      return;
    }
    const hit = this.findAlias(line, word);
    if (!hit) {
      // Trimmed like `_send`: a variable that expands to nothing at the end
      // (`close $door`) must not leave a trailing space.
      this.send(finishText(line.trim()));
      return;
    }
    const { rule, args, plainRest } = hit;
    if (ctx.depth >= ALIAS_DEPTH) {
      this.warn(`Alias nesting deeper than ${ALIAS_DEPTH} at {${clip(line)}}; stopped.`);
      return;
    }
    if (rule.fn) {
      rule.fn({ args, line: null });
      return;
    }
    let body = expandArgs(rule.body, args);
    if (plainRest !== null && body === rule.body && plainRest !== '') body = body.trimEnd() + ' ' + plainRest;
    this.activeAliases.add(rule);
    try {
      this.execList(body, { store: rule.store, depth: ctx.depth + 1, direct: false });
    } finally {
      this.activeAliases.delete(rule);
    }
  }

  private send(text: string): void {
    if (this.loading) {
      this.warn(`not sent while loading: ${clip(text)}`);
      return;
    }
    this.opts.send(text);
  }

  /** The alias for a command line, with its arguments. */
  private findAlias(line: string, word: string): { rule: Rule; args: string[]; plainRest: string | null } | null {
    let best: Rule | null = null;
    let bestArgs: string[] | null = null;
    let plainRest: string | null = null;
    for (const store of [this.system, this.userStore]) {
      const p = store.plainAlias(word);
      if (p && !this.activeAliases.has(p) && (!best || ruleOrder(p, best) < 0)) {
        best = p;
        bestArgs = null;
      }
    }
    if (best) {
      plainRest = line.slice(word.length).trim();
      bestArgs = [plainRest, ...splitWords(plainRest)];
    }
    for (const store of [this.system, this.userStore]) {
      const list = store.patternAliases();
      for (let i = 0; i < list.length; i++) {
        const r = list[i]!;
        if (best && ruleOrder(r, best) >= 0) break;
        if (this.activeAliases.has(r)) continue;
        const m = this.matchAlias(r, line);
        if (!m) continue;
        best = r;
        bestArgs = m.args;
        plainRest = m.plainRest;
        break;
      }
    }
    return best ? { rule: best, args: bestArgs!, plainRest } : null;
  }

  private matchAlias(r: Rule, line: string): { args: string[]; plainRest: string | null } | null {
    const c = this.compiledFor(r, r.store);
    if (!c) return null;
    if (c.plain) {
      // A plain name with spaces: the name, then a space or the end.
      const name = r.pattern;
      if (!line.startsWith(name)) return null;
      if (line.length > name.length && !isSpace(line.charCodeAt(name.length))) return null;
      const rest = line.slice(name.length).trim();
      return { args: [rest, ...splitWords(rest)], plainRest: rest };
    }
    let re = this.anchoredCache.get(c);
    if (!re) {
      re = c.anchored ? c.re : new RegExp('^(?:' + c.re.source + ')', c.re.flags);
      this.anchoredCache.set(c, re);
    }
    const m = re.exec(line);
    if (!m) return null;
    return { args: argsFrom(c, m), plainRest: null };
  }

  /** The compiled pattern of a rule (compiling `$var` patterns now). */
  private compiledFor(r: Rule, store: RuleStore): CompiledPattern | null {
    if (r.compiled) return r.compiled;
    if (!r.dynamic) return null;
    const ctx: Ctx = { store, depth: 0, direct: false };
    try {
      return compilePattern(this.vars(r.pattern, ctx));
    } catch {
      return null;
    }
  }

  /** Runs a rule's body (or native handler) with arguments. */
  private fire(r: Rule, args: string[] | null, line: Line | null): void {
    if (r.fn) {
      const ctx: MatchContext = { args: args ?? [], line };
      r.fn(ctx);
      return;
    }
    const body = args ? expandArgs(r.body, args) : r.body;
    this.execList(body, { store: r.store, depth: 0, direct: false });
  }

  // ------------------------------------------------------------ # commands

  private parseHash(cmd: string): ParsedHash {
    let p = this.hashCache.get(cmd);
    if (p) return p;
    let i = 1;
    while (i < cmd.length && !isSpace(cmd.charCodeAt(i)) && cmd.charCodeAt(i) !== 0x7b) i++;
    const word = cmd.slice(1, i);
    const rest = cmd.slice(i);
    if (/^\d+$/.test(word)) p = { entry: null, word, rest, repeat: Number(word) };
    else p = { entry: resolveCommand(word), word, rest, repeat: 0 };
    if (this.hashCache.size > 2000) this.hashCache.clear();
    this.hashCache.set(cmd, p);
    return p;
  }

  private execHash(cmd: string, ctx: Ctx, ifState: number): number {
    const p = this.parseHash(cmd);
    if (p.repeat > 0 || p.word === '0') {
      const n = Math.min(p.repeat, REPEAT_MAX);
      const body = new ArgReader(p.rest).next('all');
      for (let k = 0; k < n; k++) this.execList(body, ctx);
      return IF_NONE;
    }
    const e = p.entry;
    if (e === null) {
      this.warn(`Unknown command: #${p.word}`);
      return IF_NONE;
    }
    if (e === 'ambiguous') {
      this.warn(`Ambiguous command: #${p.word}`);
      return IF_NONE;
    }
    if (e.inert) {
      this.hint(e, ctx);
      return ifState;
    }
    const r = new ArgReader(p.rest);
    switch (e.kind) {
      case 'define':
        this.define(e, r, ctx);
        return ifState;
      case 'undefine':
        this.undefine(e, r, ctx);
        return ifState;
      case 'control':
        return this.control(e.name, r, ctx, ifState);
      case 'client':
        if (this.loading) {
          this.warn(`#${e.name} is not run while loading`);
          return ifState;
        }
        this.opts.client?.(e.name, this.vars(p.rest.trim(), ctx));
        return ifState;
      default:
        this.command(e.name, r, ctx);
        return ifState;
    }
  }

  private hint(e: CommandEntry, ctx: Ctx): void {
    if (!ctx.direct && this.hinted.has(e.name)) return;
    this.hinted.add(e.name);
    this.warn(`#${e.name}: ${e.hint ?? 'does nothing in WebCockpit.'}`);
  }

  private warn(text: string): void {
    if (this.loading) this.loading.warnings.push(`line ${this.loading.line}: ${text}`);
    else this.opts.message(text);
  }

  private priority(arg: string, ctx: Ctx): number | undefined {
    const t = this.vars(arg, ctx).trim();
    if (t === '') return undefined;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
    this.warn(`Bad priority {${t}}; using 5.`);
    return undefined;
  }

  private define(e: CommandEntry, r: ArgReader, ctx: Ctx): void {
    const rule = e.rule!;
    const store = ctx.store;
    try {
      switch (rule) {
        case 'variable': {
          const name = this.vars(r.next('one'), ctx);
          if (name === '') {
            this.listVars(store);
            return;
          }
          if (r.done) {
            const v = this.lookup(ctx)(name);
            this.opts.message(v === undefined ? `#variable {${name}} is not defined.` : `#VARIABLE {${name}} {${v}}`);
            return;
          }
          this.setVar(ctx, name, this.vars(r.next('all'), ctx));
          return;
        }
        case 'ticker': {
          const name = r.next('one');
          const body = r.next('all');
          const secs = this.seconds(r.next('one'), ctx);
          if (name === '' || secs === null) {
            if (name === '') this.listTimers(store, 'ticker');
            else this.warn(`#ticker {${name}} needs a time in seconds.`);
            return;
          }
          store.addTimer('ticker', name, body, secs);
          return;
        }
        case 'delay': {
          const a = r.next('one');
          const b = r.next('all');
          const c = r.next('one');
          if (a === '') {
            this.listTimers(store, 'delay');
            return;
          }
          const named = c !== '';
          const secs = this.seconds(named ? c : a, ctx);
          if (secs === null) {
            this.warn(`#delay needs a time in seconds.`);
            return;
          }
          store.addTimer('delay', named ? a : null, b, secs);
          return;
        }
        default: {
          const kind = LIST_KIND_BY_RULE[rule]!;
          const pattern = r.next('one');
          if (pattern === '' || (kind !== 'gag' && r.done)) {
            this.listRules(store, kind, pattern);
            return;
          }
          const body = kind === 'gag' ? '' : r.next('all');
          const pri = kind === 'macro' || kind === 'event' || kind === 'gag' ? undefined : this.priority(r.next('one'), ctx);
          store.define(kind, pattern, body, pri === undefined ? {} : { priority: pri });
        }
      }
    } catch (err) {
      if (err instanceof DefineError) this.warn(`#${e.name}: ${err.message}`);
      else throw err;
    }
  }

  private seconds(arg: string, ctx: Ctx): number | null {
    const t = this.vars(arg, ctx).trim();
    if (t === '') return null;
    let n = Number(t);
    if (!Number.isFinite(n)) {
      try {
        n = Number(evalMath(t));
      } catch {
        return null;
      }
    }
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  private undefine(e: CommandEntry, r: ArgReader, ctx: Ctx): void {
    const rule = e.rule!;
    const store = ctx.store;
    const arg = r.next('one');
    if (arg === '') {
      this.warn(`#${e.name} needs an argument.`);
      return;
    }
    if (rule === 'variable') store.deleteVar(this.vars(arg, ctx));
    else if (rule === 'ticker' || rule === 'delay') store.removeTimer(rule as TimerKind, arg);
    else store.remove(LIST_KIND_BY_RULE[rule]!, arg);
  }

  private setVar(ctx: Ctx, name: string, value: string): void {
    ctx.store.setVar(name, value);
    if (ctx.store === this.userStore && !this.loading) this.opts.onVariable?.(name, value);
  }

  /**
   * #if / #elseif / #else. The chain state lives in the command list, so
   * `#if {…} {…};#else {…}` works. Text after the branches that is not a
   * braced else-argument (`#if {…} {…} #else {…}` without `;`, as tt++
   * accepts) continues the chain.
   */
  private control(name: string, r: ArgReader, ctx: Ctx, ifState: number): number {
    if (name === 'else') {
      if (ifState === IF_OPEN) this.execList(r.next('all'), ctx);
      return IF_NONE;
    }
    const cond = r.next('one');
    const then = r.next('one');
    let other: string | null = null;
    let rest = '';
    if (!r.done) {
      if (name === 'if' && r.nextIsBraced) other = r.next('one');
      rest = r.rest();
    }
    let state: number;
    if (name === 'elseif' && ifState !== IF_OPEN) {
      state = ifState === IF_TAKEN ? IF_TAKEN : IF_NONE;
    } else {
      let ok: boolean;
      try {
        ok = evalCondition(this.vars(cond, ctx));
      } catch (err) {
        this.warn(`#${name} {${clip(cond)}}: ${err instanceof ExprError ? err.message : String(err)}`);
        return IF_NONE;
      }
      if (ok) {
        this.execList(then, ctx);
        state = IF_TAKEN;
      } else if (other !== null) {
        this.execList(other, ctx);
        state = IF_TAKEN;
      } else state = IF_OPEN;
    }
    return rest ? this.execList(rest, ctx, state) : state;
  }

  private command(name: string, r: ArgReader, ctx: Ctx): void {
    switch (name) {
      case 'nop':
        return;
      case 'showme':
        this.show(r.next('all'), ctx);
        return;
      case 'math': {
        const v = this.vars(r.next('one'), ctx);
        const expr = this.vars(r.next('all'), ctx);
        if (v === '') {
          this.warn('#math needs {variable} {expression}.');
          return;
        }
        try {
          this.setVar(ctx, v, evalMath(expr));
        } catch (err) {
          this.warn(`#math {${v}}: ${err instanceof Error ? err.message : String(err)}`);
        }
        return;
      }
      case 'format': {
        const v = this.vars(r.next('one'), ctx);
        const fmt = this.vars(r.next('one'), ctx);
        const args: string[] = [];
        while (!r.done) args.push(this.vars(r.next('one'), ctx));
        if (v === '') {
          this.warn('#format needs {variable} {format} {arguments}.');
          return;
        }
        this.setVar(ctx, v, formatString(fmt, args, this.now()));
        return;
      }
      case 'class': {
        const cls = r.next('one');
        const op = r.next('one').toLowerCase();
        if (cls === '') {
          this.warn('#class needs {name} {open|close|kill}.');
          return;
        }
        if (op === 'open') ctx.store.openClass = cls;
        else if (op === 'close') {
          if (ctx.store.openClass === cls) ctx.store.openClass = null;
        } else if (op === 'kill' || op === 'clear') ctx.store.killClass(cls);
        else this.warn(`#class {${cls}} {${op}}: only open, close and kill are supported.`);
        return;
      }
      default:
        this.warn(`#${name} is not supported.`);
    }
  }

  // --------------------------------------------------------------- listing

  private listRules(store: RuleStore, kind: ListKind, filter: string): void {
    const re = filter ? globOrExact(filter) : null;
    const rows = store.rules(kind).filter((r) => !re || re(r.pattern));
    if (rows.length === 0) {
      this.opts.message(filter ? `No ${kind} matches {${filter}}.` : `No ${kind}s defined.`);
      return;
    }
    for (const r of rows) {
      const pri = r.priority !== 5 && kind !== 'macro' && kind !== 'event' && kind !== 'gag' ? ` {${r.priority}}` : '';
      this.opts.message(kind === 'gag' ? `#GAG {${r.pattern}}` : `#${kind.toUpperCase()} {${r.pattern}} {${clip(r.body.trim(), 60)}}${pri}`);
    }
  }

  private listVars(store: RuleStore): void {
    if (store.vars.size === 0) {
      this.opts.message('No variables defined.');
      return;
    }
    for (const [k, v] of store.vars) this.opts.message(`#VARIABLE {${k}} {${v}}`);
  }

  private listTimers(store: RuleStore, kind: TimerKind): void {
    const list = store.timerList(kind);
    if (list.length === 0) {
      this.opts.message(`No ${kind}s running.`);
      return;
    }
    for (const t of list) this.opts.message(`#${kind.toUpperCase()} {${t.name}} {${clip(t.body.trim(), 60)}} {${t.seconds}}`);
  }

  // ---------------------------------------------------------------- timers

  private readonly onTimer = (t: Timer, store: RuleStore): void => {
    if (store !== this.userStore && store !== this.system) return;
    this.entry(() => {
      if (t.fn) t.fn();
      else this.execList(t.body, { store, depth: 0, direct: false });
    });
  };

  // --------------------------------------------------------------- display

  /** Sorted rules of a kind from both stores (cached until either changes). */
  private merged(kind: ListKind): readonly Rule[] {
    const sys = this.system;
    const usr = this.userStore;
    const sl = sys.rules(kind);
    if (sl.length === 0) return usr.rules(kind);
    const ul = usr.rules(kind);
    if (ul.length === 0) return sl;
    const c = this.mergedCache.get(kind);
    if (c && c.sv === sys.version && c.uv === usr.version && c.u === usr) return c.list;
    const list = [...sl, ...ul].sort(ruleOrder);
    this.mergedCache.set(kind, { sv: sys.version, uv: usr.version, u: usr, list });
    return list;
  }

  private matchRule(r: Rule, text: string): { args: string[]; index: number; end: number } | null {
    const c = r.compiled ?? this.compiledFor(r, r.store);
    return c ? matchPattern(c, text) : null;
  }

  /** Runs the actions for a received line, then emits its display copy. */
  processLine(line: Line): void {
    const actions = this.merged('action');
    if (actions.length > 0) this.entry(() => this.runActions(actions, line));
    const shown = this.displayCopy(line, false);
    if (shown) this.bus?.emit('text.display', { line: shown, source: line });
    // A gagged line still supersedes the partial it completes.
    else this.bus?.emit('text.displayPartial', { line: EMPTY_LINE, source: line });
  }

  /** The partial line with substitutes and highlights (no actions, no gags). */
  processPartial(line: Line): void {
    const shown = line.text === '' ? line : (this.displayCopy(line, true) ?? line);
    this.bus?.emit('text.displayPartial', { line: shown, source: line });
  }

  private runActions(actions: readonly Rule[], line: Line): void {
    const text = line.text;
    for (let i = 0; i < actions.length; i++) {
      const r = actions[i]!;
      const m = this.matchRule(r, text);
      if (!m) continue;
      this.fire(r, m.args, line);
    }
  }

  /** #showme: parse colour codes, run actions (guarded), display. */
  private show(raw: string, ctx?: Ctx): void {
    const text = finishText(ctx ? this.vars(raw, ctx) : raw);
    const c = parseColored(text);
    const line: Line = { text: c.text, runs: c.runs, tags: [], prompt: false, raw: c.text, ts: nowUs() };
    const actions = this.merged('action');
    if (actions.length > 0) {
      if (this.showDepth < SHOW_DEPTH) {
        this.showDepth++;
        try {
          this.runActions(actions, line);
        } finally {
          this.showDepth--;
        }
      } else if (!this.showWarned) {
        this.showWarned = true;
        this.opts.message(`#showme → action loop deeper than ${SHOW_DEPTH}; actions skipped.`);
      }
    }
    if (this.showDepth === 0) this.showWarned = false;
    const shown = this.displayCopy(line, false);
    if (shown) this.bus?.emit('text.display', { line: shown, source: line, local: true });
  }

  /**
   * The display copy of a line: substitutes, then gags (unless `partial`),
   * then highlights, on the substituted text. Returns `line` itself when
   * nothing applies and null when the line is gagged.
   */
  displayCopy(line: Line, partial: boolean): Line | null {
    const subs = this.merged('substitute');
    const gags = partial ? EMPTY : this.merged('gag');
    const his = this.merged('highlight');
    if (subs.length === 0 && gags.length === 0 && his.length === 0) return line;
    let text = line.text;
    let runs: StyleRun[] = line.runs;
    let changed = false;
    let substituted = false;
    for (let i = 0; i < subs.length; i++) {
      const r = subs[i]!;
      const c = r.compiled ?? this.compiledFor(r, r.store);
      if (!c || (c.literal && text.indexOf(c.literal) < 0)) continue;
      const re = this.globalFor(c);
      re.lastIndex = 0;
      let guard = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null && guard++ < 100) {
        const args = argsFrom(c, m);
        const ctx: Ctx = { store: r.store, depth: 0, direct: false };
        const rep = finishText(this.vars(expandArgs(r.body, args), ctx));
        const col = parseColored(rep, styleAt(runs, m.index));
        const start = m.index;
        const out = splice(text, runs, start, start + m[0].length, col.text, col.runs);
        text = out.text;
        runs = out.runs;
        changed = substituted = true;
        if (c.anchored) break;
        re.lastIndex = start + col.text.length + (m[0].length === 0 ? 1 : 0);
        if (re.lastIndex > text.length) break;
      }
    }
    for (let i = 0; i < gags.length; i++) {
      const c = gags[i]!.compiled ?? this.compiledFor(gags[i]!, gags[i]!.store);
      if (c && matchPattern(c, text)) return null;
    }
    for (let i = 0; i < his.length; i++) {
      const r = his[i]!;
      const c = r.compiled ?? this.compiledFor(r, r.store);
      if (!c || (c.literal && text.indexOf(c.literal) < 0)) continue;
      const re = this.globalFor(c);
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(text)) !== null && guard++ < 100) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        runs = overlay(runs, text.length, m.index, m.index + m[0].length, r.style!);
        changed = true;
        if (c.anchored) break;
      }
    }
    if (!changed) return line;
    return { ...line, text, runs, tags: substituted ? [] : line.tags };
  }

  private globalFor(c: CompiledPattern): RegExp {
    let re = this.globalCache.get(c);
    if (!re) {
      re = globalRe(c);
      this.globalCache.set(c, re);
    }
    return re;
  }
}

const EMPTY: readonly Rule[] = [];
const EMPTY_LINE: Line = Object.freeze({ text: '', runs: [], tags: [], prompt: false, raw: '', ts: 0 }) as Line;

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

function countLines(s: string): number {
  let n = 0;
  for (let i = s.indexOf('\n'); i >= 0; i = s.indexOf('\n', i + 1)) n++;
  return n;
}

function clip(s: string, n = 40): string {
  const one = s.replace(/\s+/g, ' ');
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

function globOrExact(filter: string): (s: string) => boolean {
  if (!filter.includes('*')) return (s) => s === filter;
  const re = new RegExp('^' + filter.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  return (s) => re.test(s);
}
