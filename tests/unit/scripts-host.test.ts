// The script host (src/scripts/host.ts, ADR 0051 P1): lifecycle, the API
// version 1, errors and the hang guard, with the real Lua runtime and
// script engine.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line, StyleRun, UiMessage } from '../../src/core/types';
import { TRUECOLOR } from '../../src/core/types';
import { entryWarning } from '../../src/editor/logic';
import { GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys, scriptKeyOwner } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { HANG_KEY } from '../../src/scripts/guard';
import { GmcpCache } from '../../src/scripts/gmcp-cache';
import { ScriptHost } from '../../src/scripts/host';
import type { StyledRow } from '../../src/ui/output-pane';
import { PaneContent } from '../../src/panes/script-content';

const PaneContentFrom = PaneContent.fromSnapshot;
import type { ScriptPaneEvents, ScriptPaneSpec, ScriptPaneSurface, ScriptPaneView } from '../../src/panes/script-surface';

class MemStorage {
  readonly map = new Map<string, string>();
  writes = 0;
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.writes++;
    this.map.set(k, v);
  }
}

function line(text: string, runs: StyleRun[] = []): Line {
  return { text, runs, tags: [], prompt: false, raw: text, ts: 0 };
}

/** A script source with the required header (the library adds `-- @name` above it: code starts on line 3). */
const src = (body: string, header = ''): string => `-- @api 1\n${header}${body}`;

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
  resetScriptKeys();
});

interface SetupOptions {
  storage?: MemStorage;
  disabled?: boolean;
  profile?: string;
  /** Runs on the bus before the host exists (a GmcpCache is attached first). */
  before?: (bus: Bus) => void;
  panes?: ScriptPaneSurface;
}

/** A fake pane surface: records what the host opens and lets a test click and resize. */
class FakeSurface implements ScriptPaneSurface {
  readonly opened: Array<{ spec: ScriptPaneSpec; content: PaneContent; events: ScriptPaneEvents; view: FakeView }> = [];
  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView {
    const view = new FakeView();
    this.opened.push({ spec, content, events, view });
    return view;
  }
  /** The open pane `id`, or undefined. */
  get(id: string) {
    return this.opened.find((o) => o.spec.id === id && !o.view.closed);
  }
}
class FakeView implements ScriptPaneView {
  changes = 0;
  on = true;
  closed = false;
  cols = 0;
  rows = 0;
  changed(): void {
    this.changes++;
  }
  setOn(on: boolean): void {
    this.on = on;
  }
  isOn(): boolean {
    return this.on;
  }
  size() {
    return { cols: this.cols, rows: this.rows };
  }
  close(): void {
    this.closed = true;
  }
  focused: Array<[number, boolean]> = [];
  focusField(id: number, select: boolean): void {
    this.focused.push([id, select]);
  }
}

/** The text of a pane's lines (gauges as `[label value/max]`). */
const paneText = (c: PaneContent): string[] =>
  c.lines.map((l) => ('spans' in l ? l.spans.map((s) => s.text).join('') : `[${l.gauge.label} ${l.gauge.value}/${l.gauge.max}]`));

async function setup(scripts: Record<string, string> = {}, opts: SetupOptions = {}) {
  const bus = new Bus();
  const clock = new FakeScheduler();
  const sent: string[] = [];
  const msgs: string[] = [];
  const vars: Array<[string, string]> = [];
  const ui: UiMessage[] = [];
  const printed: StyledRow[][] = [];
  const shown: BusEvents['text.display'][] = [];
  const now = { t: 1000 };
  let host: ScriptHost | null = null;
  const engine = new ScriptEngine({
    send: (t) => sent.push(t),
    message: (m) => msgs.push(m),
    onVariable: (n, v) => vars.push([n, v]),
    scheduler: clock,
    scriptCommand: (n, a) => host!.command(n, a),
  });
  engine.attach(bus);
  if (opts.profile) engine.loadProfile(opts.profile);
  const game = new GameState();
  game.attach(bus);
  bus.on('ui.message', (m) => ui.push(m));
  bus.on('text.display', (d) => shown.push(d));
  const lib = new ScriptLibrary({ factory: null, bundled: [] });
  for (const [name, source] of Object.entries(scripts)) {
    await lib.create(name, source);
    if (!opts.disabled) await lib.setEnabled(name, true);
  }
  const storage = opts.storage ?? new MemStorage();
  let cache: GmcpCache | undefined;
  if (opts.before) {
    cache = new GmcpCache();
    cache.attach(bus);
    opts.before(bus);
  }
  host = new ScriptHost({
    ...(cache ? { gmcp: cache } : {}),
    engine,
    bus,
    library: lib,
    game,
    send: (t) => sent.push(t),
    print: (rows) => printed.push(rows),
    message: (m) => msgs.push(m),
    loadRuntime: () => loadLuaRuntime(),
    storage: storage as unknown as Storage,
    clock: () => now.t,
    ...(opts.panes ? { panes: opts.panes } : {}),
  });
  hosts.push(host);
  await host.start();
  const recv = (text: string, runs: StyleRun[] = []) => bus.emit('text.line', line(text, runs));
  const texts = () => shown.map((d) => d.line.text);
  const uiText = () => ui.map((m) => m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join(''));
  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    await host!.sync();
  };
  const gmcp = (pkg: string, data: unknown) => {
    bus.emit('gmcp.raw', { pkg, json: JSON.stringify(data) });
    bus.emit('gmcp', { pkg, key: pkg.toLowerCase(), data });
  };
  return { bus, engine, clock, sent, msgs, vars, ui, uiText, printed, shown, texts, lib, host, recv, now, storage, settle, game, gmcp };
}

describe('triggers', () => {
  it('a substring trigger runs with matches and line; Lua runs only on a match', async () => {
    const t = await setup({
      s: src(`
        n = 0
        tempTrigger("orc", function()
          n = n + 1
          send("kill " .. matches[1] .. " " .. line .. " " .. n)
        end)`),
    });
    t.recv('An elf is here.');
    t.recv('An orc is here.');
    expect(t.sent).toEqual(['kill orc An orc is here. 1']);
    expect(t.texts()).toEqual(['An elf is here.', 'An orc is here.']);
  });

  it('a regex trigger fills matches with the captures; killTrigger removes it', async () => {
    const t = await setup({
      s: src(`
        id = tempRegexTrigger("^(\\\\w+) tells you '(.*)'$", function()
          send("reply " .. matches[2] .. ":" .. matches[3])
        end)
        tempTrigger("stop", function() send(tostring(killTrigger(id))) end)`),
    });
    t.recv("Gandalf tells you 'hello there'");
    t.recv('stop');
    t.recv("Gandalf tells you 'again'");
    t.recv('stop');
    expect(t.sent).toEqual(['reply Gandalf:hello there', 'true', 'false']);
  });

  it('script triggers fan out with profile actions by priority and definition order', async () => {
    const t = await setup({ s: src(`tempTrigger("ping", function() send("lua") end)`) }, { profile: '#action {pi} {first} {1}\n#action {ng} {last} {9}\n#action {ing} {tie}' });
    t.recv('ping');
    // Same priority: script rules after profile rules.
    expect(t.sent).toEqual(['first', 'tie', 'lua', 'last']);
  });

  it('bad patterns raise at the caller', async () => {
    const t = await setup({ s: src(`ok = pcall(tempRegexTrigger, "(", function() end); send(tostring(ok)); local a, b = pcall(tempTrigger, "", function() end); send(b)`) });
    expect(t.sent[0]).toBe('false');
    expect(t.sent[1]).toMatch(/substring is empty/);
  });
});

describe('display edits', () => {
  it('deleteLine gags, replaceLine substitutes with colours, highlight colours', async () => {
    const t = await setup({
      s: src(`
        tempTrigger("spam", function() deleteLine() end)
        tempTrigger("ancient", function() replaceLine("<red>new<reset> text") end)
        tempTrigger("gold", function() highlight("yellow", "gold") end)
        tempTrigger("whole", function() highlight("light red") end)`),
    });
    t.recv('some spam here');
    t.recv('the ancient line');
    t.recv('3 gold coins');
    t.recv('whole line');
    expect(t.texts()).toEqual(['new text', '3 gold coins', 'whole line']);
    expect(t.shown[0]!.line.runs).toEqual([{ start: 0, end: 3, fg: TRUECOLOR | 0xff0000 }]);
    expect(t.shown[0]!.source.text).toBe('the ancient line');
    expect(t.shown[1]!.line.runs).toEqual([{ start: 2, end: 6, fg: 3 }]);
    expect(t.shown[2]!.line.runs).toEqual([{ start: 0, end: 10, fg: 9 }]);
  });

  it("the profile's substitutes work on the replaced text", async () => {
    const t = await setup({ s: src(`tempTrigger("orc", function() replaceLine("a troll") end)`) }, { profile: '#substitute {troll} {TROLL}' });
    t.recv('an orc');
    expect(t.texts()).toEqual(['a TROLL']);
  });

  it('echo during a line shows after it; echo elsewhere at once; cecho and print', async () => {
    const t = await setup({
      s: src(`
        tempTrigger("hi", function() echo("after") end)
        echo("loaded\\nsecond")
        cecho("<green>green<r> plain")
        print("p", 1, true, nil, {})`),
    });
    t.recv('hi there');
    expect(t.texts()).toEqual(['loaded', 'second', 'green plain', 'p\t1\ttrue\tnil\ttable', 'hi there', 'after']);
    expect(t.shown[2]!.line.runs).toEqual([{ start: 0, end: 5, fg: TRUECOLOR | 0x00ff00 }]);
    expect(t.shown.every((d) => d.local || d.line.text === 'hi there')).toBe(true);
  });

  it('highlight takes #rrggbb and cecho tags; cecho <b>', async () => {
    const t = await setup({
      s: src(`
        tempTrigger("hex", function() highlight("#ff8800", "hex") end)
        tempTrigger("tag", function() highlight("<b><white:red>") end)
        cecho("<b>bold</b> <i>it</i>")`),
    });
    t.recv('a hex b');
    t.recv('tag');
    expect(t.texts()).toEqual(['bold it', 'a hex b', 'tag']);
    expect(t.shown[0]!.line.runs).toEqual([
      { start: 0, end: 4, bold: true },
      { start: 5, end: 7, italic: true },
    ]);
    expect(t.shown[1]!.line.runs).toEqual([{ start: 2, end: 5, fg: TRUECOLOR | 0xff8800 }]);
    expect(t.shown[2]!.line.runs).toEqual([{ start: 0, end: 3, fg: TRUECOLOR | 0xffffff, bg: TRUECOLOR | 0xff0000, bold: true }]);
  });

  it('highlight with an unknown colour is an error', async () => {
    const t = await setup({ s: src(`tempTrigger("x", function() highlight("nocolour") end)`) });
    t.recv('x');
    expect(t.uiText().some((m) => /^s:3: bad argument #1 to 'highlight' \(unknown colour 'nocolour'\)/.test(m))).toBe(true);
  });
});

describe('aliases', () => {
  it('consumes the input unless the handler returns false', async () => {
    const t = await setup({
      s: src(`
        tempAlias("^cl$", function() send("loot all") end)
        tempAlias("^k (\\\\w+)$", function() send("kill " .. matches[2] .. " (" .. command .. ")") end)
        tempAlias("^look", function() send("seen") return false end)`),
    });
    t.engine.input('cl');
    t.engine.input('k orc');
    t.engine.input('look north');
    t.engine.input('clx');
    expect(t.sent).toEqual(['loot all', 'kill orc (k orc)', 'seen', 'look north', 'clx']);
  });

  it('a false alias passes to the next alias (the profile); a profile alias of the same priority wins', async () => {
    const t = await setup(
      { s: src(`tempAlias("^gg$", function() send("lua saw it") return false end); tempAlias("^hh$", function() send("lua hh") end)`) },
      { profile: '#alias {gg} {say profile} {6}\n#alias {hh} {say hh}' },
    );
    t.engine.input('gg');
    t.engine.input('hh');
    expect(t.sent).toEqual(['lua saw it', 'say profile', 'say hh']);
  });

  it('send skips aliases, expandAlias goes through profile and script aliases', async () => {
    const t = await setup(
      {
        s: src(`
          tempAlias("^x$", function() send("x-script") end)
          tempTrigger("go", function() send("p"); expandAlias("p;x;#showme shown") end)`),
      },
      { profile: '#alias {p} {say profile}' },
    );
    t.recv('go');
    expect(t.sent).toEqual(['p', 'say profile', 'x-script']);
    expect(t.texts()).toContain('shown');
  });

  it('an alias calling expandAlias on itself does not loop', async () => {
    const t = await setup({ s: src(`tempAlias("^me$", function() expandAlias("me") end)`) });
    t.engine.input('me');
    expect(t.sent).toEqual(['me']);
  });
});

describe('keys', () => {
  it('tempKey binds, a profile macro wins, the editor warns, killKey releases', async () => {
    const t = await setup({
      s: src(`
        k = tempKey("F5", function() send("from lua") end)
        tempKey("ctrl+shift+f1", function() send("combo") end)
        export("unbind", function() send(tostring(killKey(k))) end)`),
    });
    expect(t.engine.runMacro('F5')).toBe(true);
    expect(t.engine.runMacro('Ctrl+Shift+F1')).toBe(true);
    expect(t.sent).toEqual(['from lua', 'combo']);
    expect(scriptKeyOwner('F5')).toBe('s');
    expect(entryWarning({ kind: 'macro', pattern: 'F5' })).toBe('F5 is also bound by script s; this macro wins.');
    t.engine.input('#macro {F5} {profile}');
    t.engine.runMacro('F5');
    expect(t.sent.at(-1)).toBe('profile');
    t.engine.input('#unmacro {F5}');
    t.engine.input('#lua s unbind');
    expect(t.sent.at(-1)).toBe('true');
    expect(t.engine.runMacro('F5')).toBe(false);
    expect(scriptKeyOwner('F5')).toBe(null);
  });

  it('refuses unknown and unbindable keys', async () => {
    const t = await setup({ s: src(`send(select(2, pcall(tempKey, "Hyper+Q", function() end))); send(select(2, pcall(tempKey, "a", function() end)))`) });
    expect(t.sent[0]).toMatch(/unknown key 'Hyper\+Q'/);
    expect(t.sent[1]).toMatch(/a cannot be bound: it types text/);
  });
});

describe('timers', () => {
  it('tempTimer fires once, repeats when asked, and killTimer stops it', async () => {
    const t = await setup({
      s: src(`
        tempTimer(1.5, function() send("once") end)
        n = 0
        rep = tempTimer(1, function() n = n + 1; send("tick " .. n); if n == 3 then killTimer(rep) end end, true)`),
    });
    t.clock.advance(1000);
    expect(t.sent).toEqual(['tick 1']);
    t.clock.advance(1000);
    t.clock.advance(5000);
    expect(t.sent).toEqual(['tick 1', 'once', 'tick 2', 'tick 3']);
    expect(t.clock.pending).toBe(0);
  });
});

describe('events, gmcp and state', () => {
  it('gmcp handlers see the merged, read-only gmcp table', async () => {
    const t = await setup({
      s: src(`
        registerAnonymousEventHandler("gmcp.Char.Vitals", function(ev, arg)
          send(ev .. " " .. arg .. " hp=" .. gmcp.Char.Vitals.hp .. " mana=" .. tostring(gmcp.Char.Vitals.mana))
          local ok, err = pcall(function() gmcp.Char.Vitals.hp = 1 end)
          send(tostring(ok))
        end)`),
      other: src(`registerAnonymousEventHandler("gmcp.Char.Vitals", function() send("other hp=" .. gmcp.Char.Vitals.hp) end)`),
    });
    t.gmcp('Char.Vitals', { hp: 50, mana: 10 });
    t.gmcp('Char.Vitals', { hp: 40 });
    expect(t.sent).toEqual([
      'other hp=50',
      'gmcp.Char.Vitals gmcp.Char.Vitals hp=50 mana=10',
      'false',
      'other hp=40',
      'gmcp.Char.Vitals gmcp.Char.Vitals hp=40 mana=10',
      'false',
    ]);
  });

  it('a GMCP message raises every parent level first, each with the full name', async () => {
    const t = await setup({
      s: src(`
        registerAnonymousEventHandler("gmcp.Char", function(ev, full) send(ev .. " " .. full) end)
        registerAnonymousEventHandler("gmcp.Comm.Channel", function(ev, full) send(ev .. " " .. full .. " " .. gmcp.Comm.Channel.Text.text) end)
        registerAnonymousEventHandler("gmcp.Comm.Channel.Text", function(ev, full) send(ev .. " " .. full) end)
        registerAnonymousEventHandler("gmcp", function(ev) send("bare " .. ev) end)`),
    });
    t.gmcp('Char.Vitals', { hp: 50 });
    t.gmcp('Char.Name', { name: 'x' });
    t.gmcp('Comm.Channel.Text', { channel: 'tells', text: 'hi' });
    t.gmcp('Core.Ping', undefined);
    expect(t.sent).toEqual([
      'gmcp.Char gmcp.Char.Vitals',
      'gmcp.Char gmcp.Char.Name',
      'gmcp.Comm.Channel gmcp.Comm.Channel.Text hi',
      'gmcp.Comm.Channel.Text gmcp.Comm.Channel.Text',
    ]);
  });

  it('Char.Vitals and Char.StatusVars merge; other messages replace the last value', async () => {
    const t = await setup({
      s: src(`
        export("show", function()
          local u = gmcp.Group.Update
          local r = gmcp.Room.Info
          send(gmcp.Char.Vitals.hp .. "/" .. gmcp.Char.Vitals.maxhp .. " " .. tostring(gmcp.Char.Vitals.climb)
            .. " " .. gmcp.Char.StatusVars.level .. gmcp.Char.StatusVars.race
            .. " " .. u.id .. ":" .. tostring(u.hp) .. ":" .. tostring(u.mana)
            .. " " .. tostring(r.id) .. ":" .. r.name .. ":" .. tostring(state.room.id)
            .. " " .. tostring(gmcp.Char.Name.fullname))
        end)`),
    });
    t.gmcp('Char.Vitals', { hp: 50, maxhp: 100, climb: 'c' });
    t.gmcp('Char.Vitals', { hp: 40, climb: null });
    t.gmcp('Char.StatusVars', { race: 'Elf', level: 3 });
    t.gmcp('Char.StatusVars', { level: 4 });
    t.gmcp('Char.Name', { name: 'x', fullname: 'X the Brave' });
    t.gmcp('Char.Name', { name: 'y' });
    t.gmcp('Group.Update', { id: 1, hp: 10 });
    t.gmcp('Group.Update', { id: 2, mana: 5 });
    t.gmcp('Room.Info', { id: 7, name: 'Bree' });
    t.gmcp('Room.Info', { name: 'Dark room' });
    t.engine.input('#lua s show');
    expect(t.sent).toEqual(['40/100 nil 4Elf 2:nil:5 nil:Dark room:nil nil']);
  });

  it('GMCP that arrived before the host started is in gmcp (App cache)', async () => {
    const t = await setup(
      { s: src(`send(gmcp.Char.Vitals.hp .. " " .. gmcp.Room.Info.name .. " " .. state.room.name)`) },
      {
        before: (bus) => {
          bus.emit('gmcp', { pkg: 'Char.Vitals', data: { hp: 9, maxhp: 20 } });
          bus.emit('gmcp', { pkg: 'Char.Vitals', data: { hp: 8 } });
          bus.emit('gmcp', { pkg: 'Room.Info', data: { name: 'Bree' } });
        },
      },
    );
    expect(t.sent).toEqual(['8 Bree Bree']);
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected' });
    await t.lib.create('late', src(`send(tostring(gmcp.Char))`));
    await t.lib.setEnabled('late', true);
    await t.settle();
    expect(t.sent).toEqual(['8 Bree Bree', 'nil']);
  });

  it('gmcp received before a script loads is there when it loads', async () => {
    const t = await setup({}, {});
    t.gmcp('Room.Info', { name: 'Bree', num: 7 });
    await t.lib.create('late', src(`send(gmcp.Room.Info.name .. " " .. state.room.num)`));
    await t.lib.setEnabled('late', true);
    await t.settle();
    expect(t.sent).toEqual(['Bree 7']);
  });

  it('state shows character and group data from the trackers', async () => {
    const t = await setup({ s: src(`export("show", function() send(state.char.name .. " " .. state.char.vitals.hp .. " " .. #state.group .. " " .. state.group[1].name) end)`) });
    t.gmcp('Char.Name', { name: 'rasta', fullname: 'Rasta the Brave' });
    t.gmcp('Char.Vitals', { hp: 77 });
    t.gmcp('Group.Set', [{ id: 1, type: 'ally', name: 'Gimli', hp: 10, maxhp: 20 }]);
    t.engine.input('#lua s show');
    expect(t.sent).toEqual(['rasta 77 1 Gimli']);
    expect(t.texts()).toEqual([]);
  });

  it('connection events, #event names and sysLoadEvent', async () => {
    const t = await setup({
      s: src(`
        registerAnonymousEventHandler("sysLoadEvent", function(ev) send(ev) end)
        registerAnonymousEventHandler("sysConnectionEvent", function(ev) send(ev) end)
        registerAnonymousEventHandler("sysDisconnectionEvent", function(ev, reason) send(ev .. ":" .. reason) end)
        registerAnonymousEventHandler("SESSION CONNECTED", function(ev, a) send(ev .. ":" .. a) end)
        h = registerAnonymousEventHandler("IAC SB GMCP Char.Name", function(ev, pkg, json) send(pkg .. " " .. json); killAnonymousEventHandler(h) end)`),
    });
    t.bus.emit('conn.state', { state: 'connecting', prev: 'idle' });
    t.bus.emit('conn.state', { state: 'login', prev: 'connecting' });
    t.gmcp('Char.Name', { name: 'x' });
    t.gmcp('Char.Name', { name: 'y' });
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'login', reason: 'bye' });
    // The engine's #event names come first: it is on the bus before the host.
    expect(t.sent).toEqual(['sysLoadEvent', 'SESSION CONNECTED:mume', 'sysConnectionEvent', 'Char.Name {"name":"x"}', 'sysDisconnectionEvent:bye']);
  });
});

describe('profile bridge, settings and store', () => {
  it('getVariable and setVariable use the profile variables and its write-back', async () => {
    const t = await setup({ s: src(`export("go", function(arg) setVariable("target", arg); setVariable("n", 3); send(getVariable("target") .. tostring(getVariable("none"))) end)`) });
    t.engine.input('#var target nobody');
    t.engine.input('#lua {s} {go} {big orc}');
    expect(t.sent).toEqual(['big orcnil']);
    expect(t.engine.getVariable('target')).toBe('big orc');
    expect(t.vars.slice(1)).toEqual([
      ['target', 'big orc'],
      ['n', '3'],
    ]);
  });

  it('#lua forms: unknown script or function, and the inert form', async () => {
    const t = await setup({ s: src(`export("f", function() send("f") end)`) });
    t.engine.input('#lua nope f');
    t.engine.input('#lua s g');
    t.engine.input('#lua {print("x")}');
    expect(t.msgs).toEqual(['#lua: no script nope.', '#lua: s exports no function g.', '#lua: Only #lua {script} {function} {args} runs (a function a script exported); other forms do nothing.']);
  });

  it('settings are read-only and follow #script set', async () => {
    const header = '-- @setting delay number 0.5 "Seconds"\n-- @setting mode string fast\n-- @setting on boolean true\n';
    const t = await setup({ s: src(`export("show", function() send(settings.delay .. settings.mode .. tostring(settings.on)); send(tostring(pcall(function() settings.delay = 9 end))) end)`, header) });
    t.engine.input('#lua s show');
    t.engine.input('#script set s delay 2');
    t.engine.input('#script set s on off');
    t.engine.input('#script set s delay soon');
    t.engine.input('#script set s nope 1');
    await t.settle();
    t.engine.input('#lua s show');
    expect(t.sent).toEqual(['0.5fasttrue', 'false', '2fastfalse', 'false']);
    expect(t.msgs).toEqual(['s: delay = 2', 's: on = false', '#script set: delay must be a number.', '#script set: s has no setting nope (settings: delay, mode, on).']);
  });

  it('sysSettingChanged tells only that script which setting changed, with settings already new', async () => {
    const header = '-- @setting delay number 0.5 "Seconds"\n-- @setting on boolean true\n';
    const body = `registerAnonymousEventHandler("sysSettingChanged", function(ev, name, value) send(scriptName .. " " .. ev .. " " .. name .. "=" .. tostring(value) .. " " .. tostring(settings[name])) end)`;
    const t = await setup({ s: src(body, header), o: src(body, header) });
    t.engine.input('#script set s delay 2');
    await t.settle();
    t.engine.input('#script set s delay 2');
    t.engine.input('#script set s on off');
    await t.settle();
    expect(t.sent).toEqual(['s sysSettingChanged delay=2 2', 's sysSettingChanged on=false false']);
  });

  it('setSetting saves an own setting; scriptName is the script\'s name', async () => {
    const header = '-- @setting delay number 0.5 "Seconds"\n-- @setting on boolean true\n';
    const t = await setup({ s: src(`export("set", function() setSetting("delay", 2); setSetting("on", false) end)
export("show", function() send(scriptName .. settings.delay .. tostring(settings.on)) end)
export("bad", function() send(tostring(pcall(setSetting, "nope", 1)) .. tostring(pcall(setSetting, "delay", {}))) end)`, header) });
    t.engine.input('#lua s set');
    await t.settle();
    t.engine.input('#lua s show');
    t.engine.input('#lua s bad');
    expect(t.sent).toEqual(['s2false', 'falsefalse']);
    expect(t.lib.settingsOf('s')).toMatchObject({ delay: 2, on: false });
  });

  it('store keeps values per script and survives a reload', async () => {
    const t = await setup({
      s: src(`
        export("put", function() store.set("n", 5); store.set("t", { a = 1, list = { "x", "y" } }); store.set("gone", true); store.set("gone", nil) end)
        export("get", function() local t = store.get("t"); send(store.get("n") .. t.a .. t.list[2] .. tostring(store.get("gone"))) end)
        export("bad", function() store.set("f", print) end)
        export("evil", function() store.get = nil end)`),
      other: src(`export("get", function() send(tostring(store.get("n"))) end)`),
    });
    t.engine.input('#lua s put');
    await t.host.reload('s');
    t.engine.input('#lua s get');
    t.engine.input('#lua other get');
    t.engine.input('#lua s bad');
    t.engine.input('#lua s evil');
    expect(t.sent).toEqual(['51ynil', 'nil']);
    expect(t.lib.storeGet('s', 'n')).toBe(5);
    expect(t.uiText().filter((m) => m.startsWith('s:'))).toHaveLength(2);
  });

  it('uiMessage writes an event line', async () => {
    const t = await setup({ s: src(`uiMessage("looter", "Got {5} coins.")`) });
    expect(t.ui.at(-1)).toEqual({ kind: 'event', name: 'LOOTER', parts: ['Got {5} coins.'] });
  });
});

describe('lifecycle', () => {
  it('disable releases everything the script registered; enable loads it again', async () => {
    const t = await setup({
      s: src(`
        tempTrigger("a", function() end)
        tempAlias("^b$", function() end)
        tempKey("F6", function() end)
        tempTimer(5, function() end, true)
        registerAnonymousEventHandler("SESSION CONNECTED", function() end)
        export("f", function() end)`),
    });
    expect(t.engine.scripts.count('action')).toBe(1);
    expect(t.engine.scripts.count('alias')).toBe(1);
    expect(t.engine.scripts.count('macro')).toBe(1);
    expect(t.clock.pending).toBe(1);
    t.engine.input('#script disable s');
    await t.settle();
    expect(t.host.isRunning('s')).toBe(false);
    expect(t.engine.scripts.count('action') + t.engine.scripts.count('alias') + t.engine.scripts.count('macro')).toBe(0);
    expect(t.clock.pending).toBe(0);
    expect(scriptKeyOwner('F6')).toBe(null);
    t.engine.input('#lua s f');
    expect(t.msgs).toEqual(['Script s turned off.', '#lua: script s is not running.']);
    t.engine.input('#script enable s');
    await t.settle();
    expect(t.host.isRunning('s')).toBe(true);
    expect(t.engine.scripts.count('action')).toBe(1);
    expect(t.msgs.at(-1)).toBe('Script s turned on.');
  });

  it('saving an enabled script reloads it; #script reload loads it again', async () => {
    const t = await setup({ s: src(`send("v1"); tempTrigger("x", function() send("x1") end)`) });
    await t.lib.save('s', src(`send("v2"); tempTrigger("x", function() send("x2") end)`));
    await t.settle();
    t.recv('x');
    t.engine.input('#script reload s');
    await t.settle();
    expect(t.sent).toEqual(['v1', 'v2', 'x2', 'v2']);
    expect(t.engine.scripts.count('action')).toBe(1);
  });

  it('a script without @api 1 is refused with a clear message', async () => {
    const t = await setup({ old: '-- @name old\nsend("ran")', next: '-- @api 2\nsend("ran")' });
    expect(t.sent).toEqual([]);
    expect(t.lib.get('old')!.lastError).toBe('old: not loaded: the header needs "-- @api 1".');
    expect(t.lib.get('next')!.lastError).toBe('next: not loaded: it was written for @api 2; this WebCockpit runs @api 1.');
    expect(t.host.isRunning('old')).toBe(false);
  });

  it('a syntax error keeps the script enabled with its error until the source changes', async () => {
    const t = await setup({ s: src(`tempTrigger("a", function() end)\nthis is not lua`) });
    const err = t.lib.get('s')!.lastError!;
    expect(err).toMatch(/^s:4: syntax error near 'is'/);
    expect(t.uiText()).toContain(err);
    expect(t.lib.get('s')!.enabled).toBe(true);
    expect(t.engine.scripts.count('action')).toBe(0);
    await t.lib.save('s', src(`send("fixed")`));
    await t.settle();
    expect(t.sent).toEqual(['fixed']);
    expect(t.lib.get('s')!.lastError).toBe(null);
  });
});

describe('errors', () => {
  it('a runtime error goes to the UI messages and is the last error', async () => {
    const t = await setup({ s: src(`tempTrigger("boom", function()\n  local x = nil\n  return x.y\nend)`) });
    t.recv('boom');
    expect(t.uiText()).toContain("s:5: attempt to index a nil value (local 'x')");
    expect(t.lib.get('s')!.lastError).toBe("s:5: attempt to index a nil value (local 'x')");
    expect(t.texts()).toEqual(['boom']);
  });

  it('5 errors within 10 seconds disable the script', async () => {
    const t = await setup({ s: src(`tempTrigger("boom", function() error("bad") end)`) });
    for (let i = 0; i < 4; i++) {
      t.recv('boom');
      t.now.t += 3000;
    }
    expect(t.host.isRunning('s')).toBe(true);
    t.recv('boom');
    t.now.t += 1000;
    t.recv('boom');
    t.recv('boom');
    await t.settle();
    expect(t.host.isRunning('s')).toBe(false);
    expect(t.lib.get('s')!.enabled).toBe(false);
    expect(t.uiText()).toContain('Script s was turned off: 5 errors within 10 seconds.');
  });

  it('a runaway call is aborted and the script disabled; the others keep running', async () => {
    const t = await setup({ s: src(`tempTrigger("loop", function() while true do end end)`), ok: src(`tempTrigger("loop", function() send("ok") end)`) });
    t.recv('loop');
    await t.settle();
    expect(t.lib.get('s')!.enabled).toBe(false);
    expect(t.uiText()).toContain('Script s was turned off: it ran too long (instruction budget).');
    t.recv('loop');
    expect(t.sent).toEqual(['ok', 'ok']);
    expect(t.texts()).toEqual(['loop', 'loop']);
  });

  it('a slow call disables the script', async () => {
    const t = await setup({ s: src(`tempTrigger("slow", function() send("x") end)`) });
    const realSend = t.sent.push.bind(t.sent);
    t.sent.push = (...a: string[]) => {
      t.now.t += 1500;
      return realSend(...a);
    };
    t.recv('slow');
    await t.settle();
    expect(t.lib.get('s')!.enabled).toBe(false);
    expect(t.uiText()).toContain('Script s was turned off: a call took 1.5 s.');
  });

  it('a pathological pattern is refused, not run', async () => {
    const t = await setup({ s: src(`tempTrigger("x", function() local s = ("a"):rep(5000); local r = s:find(".-.-.-b"); send("no") end)`) });
    const t0 = performance.now();
    t.recv('x');
    expect(performance.now() - t0).toBeLessThan(500);
    expect(t.sent).toEqual([]);
    expect(t.uiText().some((m) => m.includes('pattern too complex'))).toBe(true);
  });
});

describe('#script', () => {
  it('list and help print rows; unknown forms stay inert', async () => {
    const header = '-- @summary Loots coins\n-- @alias cl toggle\n-- @key F5 loot now\n-- @setting delay number 0.5 "Seconds before looting"\n-- @help Kill something.\n';
    const t = await setup({ looter: src('', header) });
    t.engine.input('#script list');
    t.engine.input('#script help looter');
    t.engine.input('#script {var} {ls -l}');
    t.engine.input('#script help');
    t.engine.input('#script help nope');
    await t.settle();
    const rows = t.printed.map((r) => r.map((x) => x.segs.map((s) => s.text).join('')));
    expect(rows[0]).toEqual(['Scripts', '  on     looter  Loots coins', expect.stringMatching(/^Type #script help/)]);
    expect(rows[1]).toEqual([
      'looter — Loots coins',
      '  on, your script',
      'Aliases',
      '  cl  toggle',
      'Keys',
      '  F5  loot now',
      'Help',
      '  Kill something.',
      'Settings',
      '  delay = 0.5  Seconds before looting',
      '    #script set looter delay <number>',
    ]);
    expect(t.msgs).toEqual(['#script: Only #script list, help, set, enable, disable and reload run; other forms do nothing.', 'Usage: #script help <name>', 'No script nope. Type #script list for the list.']);
  });
});

describe('hang guard', () => {
  it('marks a running call and clears the mark after the task', async () => {
    const storage = new MemStorage();
    const t = await setup({ s: src(`tempTrigger("x", function() send("now") end)`) }, { storage });
    await Promise.resolve();
    let seen: string | null = 'unset';
    t.sent.push = (...a: string[]) => {
      seen = storage.getItem(HANG_KEY);
      return a.length;
    };
    const writes = storage.writes;
    t.recv('x');
    t.recv('x');
    expect(seen).toBe('s');
    // One write for the task, however many calls it makes.
    expect(storage.writes).toBe(writes + 1);
    await Promise.resolve();
    expect(storage.getItem(HANG_KEY)).toBe(null);
  });

  it('a script left running by a closed page is turned off at the next start', async () => {
    const storage = new MemStorage();
    storage.setItem(HANG_KEY, 's');
    const t = await setup({ s: src(`send("ran")`), ok: src(`send("ok")`) }, { storage });
    expect(t.sent).toEqual(['ok']);
    expect(t.lib.get('s')!.enabled).toBe(false);
    expect(t.uiText()[0]).toMatch(/^Script s was turned off: the page closed while it was running/);
    expect(storage.getItem(HANG_KEY)).toBe(null);
  });
});

describe('pane text fields (ADR 0055)', () => {
  const FIELDS = src(`
    pane = createPane{id = "p", title = "P", rows = 3, cols = 30}
    pane:setLine(1, "Name: ")
    field = pane:setInput(1, 7, 10, {
      value = "home", placeholder = "a name", maxLength = 8,
      onSubmit = function(text) send("submit " .. text .. " " .. field:value()) end,
      onCancel = function() send("cancel") end,
      onChange = function(text) send("change " .. text) end,
      onKey = function(key) send("key " .. key) end,
    })
    tempAlias("^f (\\\\w+) ?(.*)$", function()
      local what, arg = matches[2], matches[3]
      if what == "focus" then field:focus()
      elseif what == "select" then field:select()
      elseif what == "set" then field:setValue(arg)
      elseif what == "value" then send(tostring(field:value()))
      elseif what == "remove" then field:remove()
      elseif what == "line" then pane:setLine(1, "gone")
      end
    end)
  `);

  it('setInput adds a field to the content; events call its functions; methods work', async () => {
    const panes = new FakeSurface();
    const t = await setup({ f: FIELDS }, { panes });
    const p = panes.get('f/p')!;
    expect(p.content.fields).toEqual([
      { row: 0, col: 6, len: 10, id: expect.any(Number), value: 'home', placeholder: 'a name', maxLength: 8 },
    ]);
    const id = p.content.fields[0]!.id;
    t.engine.input('f focus');
    t.engine.input('f select');
    expect(p.view.focused).toEqual([
      [id, false],
      [id, true],
    ]);
    p.events.onField!(id, { type: 'change', text: 'hom' });
    expect(p.content.fields[0]!.value).toBe('hom');
    p.events.onField!(id, { type: 'key', key: 'ArrowDown' });
    p.events.onField!(id, { type: 'submit', text: 'a very long name' });
    p.events.onField!(id, { type: 'cancel' });
    expect(t.sent).toEqual(['change hom', 'key ArrowDown', 'submit a very l a very l', 'cancel']);
    t.sent.length = 0;
    t.engine.input('f set new');
    t.engine.input('f value');
    expect(t.sent).toEqual(['new']);
    // The snapshot (runs, the player) has the value as text.
    expect(paneText(PaneContentFrom(p.content.snapshot()))).toEqual(['Name: new       ']);
    // setLine on its row removes it; then its methods do nothing.
    t.engine.input('f line');
    expect(p.content.fields).toEqual([]);
    t.engine.input('f value');
    t.engine.input('f focus');
    p.events.onField!(id, { type: 'submit', text: 'x' });
    expect(t.sent).toEqual(['new', 'nil']);
    expect(p.view.focused).toHaveLength(2);
    expect(t.lib.get('f')!.lastError).toBeNull();
  });

  it('remove and close drop the field; setInput validates', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        v: src(`
          local pane = createPane{id = "v"}
          local f = pane:setInput(2, 1, 5)
          send(tostring(f:value()))
          f:remove()
          send(tostring(f:value()))
          for _, bad in ipairs({ {0, 1, 1}, {1, 0, 1}, {1, 1, 0}, {1, 1, 1, {maxLength = 0}}, {1, 1, 1, {onSubmit = 3}}, {1, 1, 1, {value = {}}} }) do
            local ok, err = pcall(pane.setInput, pane, table.unpack(bad))
            send(err)
          end
          local g = pane:setInput(1, 1, 3, {value = "x"})
          pane:close()
          send(tostring(g:value()))
        `),
      },
      { panes },
    );
    expect(t.sent[0]).toBe('');
    expect(t.sent[1]).toBe('nil');
    expect(t.sent.slice(2, 8).every((m) => m.includes("bad argument") && m.includes("pane:setInput"))).toBe(true);
    expect(t.sent[6]).toMatch(/onSubmit must be a function/);
    expect(t.sent[8]).toBe('nil');
    expect(t.lib.get('v')!.lastError).toBeNull();
  });
});

describe('panes', () => {
  const PANE = src(`
    pane = createPane{id = "main", title = "Mercs", dock = "left", rows = 5, cols = 20}
    pane:echo("a")
    pane:echo("b\\n")
    pane:cecho("<red>red<reset> text\\n")
    pane:setLine(4, "<b>four")
    pane:gauge(5, {value = 30, max = 60, color = "orange", label = "half"})
  `);

  it('createPane opens a pane per script and id; the methods edit its content', async () => {
    const panes = new FakeSurface();
    const t = await setup({ m: PANE }, { panes });
    const p = panes.get('m/main')!;
    expect(p.spec).toEqual({ id: 'm/main', place: { dock: 'left', rows: 5, cols: 20 } });
    expect(p.content.title).toBe('Mercs');
    expect(paneText(p.content)).toEqual(['ab', 'red text', '', 'four', '[half 30/60]']);
    const red = p.content.lines[1]!;
    expect('spans' in red && red.spans[0]).toEqual({ text: 'red', fg: TRUECOLOR | 0xff0000 });
    const four = p.content.lines[3]!;
    expect('spans' in four && four.spans[0]!.bold).toBe(true);
    const g = p.content.lines[4]!;
    expect('gauge' in g && g.gauge.color).toBe(TRUECOLOR | 0xffa500);
    expect(p.view.changes).toBe(5);
    expect(t.host.isRunning('m')).toBe(true);
  });

  it('the stage 11 test guide example runs: a vitals gauge and two links', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        hp: src(`
          local pane = createPane{id = "hp", title = "HP", dock = "float", rows = 3, cols = 24}
          registerAnonymousEventHandler("gmcp.Char.Vitals", function()
            local v = gmcp.Char.Vitals
            pane:gauge(1, {value = v.hp or 0, max = v.maxhp or 1, label = "HP"})
            pane:setLine(2, "<yellow>[rest]<reset>  <cyan>[look]<reset>")
            pane:setLink(2, 1, 6, function() send("rest") end, "Sit down and rest")
            pane:setLink(2, 9, 6, function() send("look") end, "Look around")
          end)
          tempAlias("^hpp$", function() if pane:visible() then pane:hide() else pane:show() end end)
        `),
      },
      { panes },
    );
    t.gmcp('Char.Vitals', { hp: 40, maxhp: 80 });
    await t.settle();
    const p = panes.get('hp/hp')!;
    expect(paneText(p.content)).toEqual(['[HP 40/80]', '[rest]  [look]']);
    p.events.onLink(p.content.linkAt(1, 9)!.id);
    p.events.onLink(p.content.linkAt(1, 0)!.id);
    expect(t.sent).toEqual(['look', 'rest']);
    t.engine.input('hpp');
    expect(p.view.on).toBe(false);
  });

  it('createPane validates its table; the same id returns the same pane', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        v: src(`
          local a = createPane{id = "x"}
          local b = createPane{id = "x", title = "New"}
          send(tostring(a == b))
          for _, bad in ipairs({ {}, {id = "a/b"}, {id = "x y"}, {id = "ok", dock = "middle"}, {id = "ok", rows = "many"} }) do
            local ok, err = pcall(createPane, bad)
            send(err)
          end
          local ok, err = pcall(function() a.echo("x") end)
          send(err)
        `),
      },
      { panes },
    );
    expect(t.sent[0]).toBe('true');
    expect(t.sent.slice(1, 6).every((m) => m.includes("bad argument #1 to 'createPane'"))).toBe(true);
    expect(t.sent[6]).toContain("bad argument #1 to 'pane:echo' (pane expected, got string; call it as pane:echo(…))");
    expect(panes.opened.length).toBe(1);
    expect(panes.get('v/x')!.content.title).toBe('New');
    expect(panes.get('v/x')!.spec.place).toEqual({ dock: 'right', rows: 8, cols: 30 });
  });

  it('links call their function; replaced and cleared links are released', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        l: src(`
          pane = createPane{id = "p"}
          pane:setLine(1, "[a] [b]")
          pane:setLink(1, 1, 3, function() send("a") end, "Order A")
          pane:setLink(1, 5, 3, function() send("b") end)
          pane:cechoLink("<u>go</u>", function() send("go") end, "Go now")
          tempAlias("^redraw$", function() pane:setLine(1, "gone") end)
          tempAlias("^clear$", function() pane:clear() end)
        `),
      },
      { panes },
    );
    const p = panes.get('l/p')!;
    const at = (row: number, col: number) => p.content.linkAt(row, col);
    expect(at(0, 0)!.hint).toBe('Order A');
    expect(at(0, 4)!.hint).toBe('');
    expect(at(0, 3)).toBeNull();
    expect(paneText(p.content)).toEqual(['[a] [b]go']);
    expect(at(0, 7)!.hint).toBe('Go now');
    p.events.onLink(at(0, 5)!.id);
    p.events.onLink(at(0, 8)!.id);
    expect(t.sent).toEqual(['b', 'go']);
    const script = (t.host as unknown as { owners: Map<string, { script: { refs: Set<number> } }> }).owners.get('l')!.script;
    const refs = script.refs.size;
    t.engine.run('redraw');
    expect(p.content.links.length).toBe(0);
    expect(script.refs.size).toBe(refs - 3);
    t.engine.run('clear');
    expect(p.content.lines).toEqual([]);
  });

  it('a link error follows the error policy; a click after the script stopped does nothing', async () => {
    const panes = new FakeSurface();
    const t = await setup({ e: src(`p = createPane{id = "p"}; p:cechoLink("x", function() error("boom") end)`) }, { panes });
    const v = panes.get('e/p')!;
    const id = v.content.links[0]!.id;
    v.events.onLink(id);
    expect(t.uiText().some((m) => m.includes('boom'))).toBe(true);
    await t.lib.setEnabled('e', false);
    await t.settle();
    expect(v.view.closed).toBe(true);
    v.events.onLink(id);
    expect(t.uiText().filter((m) => m.includes('boom')).length).toBe(1);
  });

  it('size, onResize, show, hide, visible and setTitle', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        r: src(`
          p = createPane{id = "p"}
          p:onResize(function(rows, cols) send("resize " .. rows .. "x" .. cols) end)
          tempAlias("^size$", function() local r, c = p:size(); send(r .. "," .. c) end)
          tempAlias("^hide$", function() p:hide(); send(tostring(p:visible())) end)
          tempAlias("^show$", function() p:show(); send(tostring(p:visible())) end)
          tempAlias("^title$", function() p:setTitle("T") end)
        `),
      },
      { panes },
    );
    const v = panes.get('r/p')!;
    t.engine.run('size');
    v.view.cols = 30;
    v.view.rows = 7;
    v.events.onResize(30, 7);
    v.events.onResize(30, 7);
    v.events.onResize(0, 0);
    t.engine.run('size');
    t.engine.run('hide');
    t.engine.run('show');
    t.engine.run('title');
    expect(t.sent).toEqual(['0,0', 'resize 7x30', '7,30', 'false', 'true']);
    expect(v.content.title).toBe('T');
  });

  it('disable and reload close the panes; the new load opens them again', async () => {
    const panes = new FakeSurface();
    const t = await setup({ m: PANE }, { panes });
    const first = panes.get('m/main')!;
    await t.host.reload('m');
    expect(first.view.closed).toBe(true);
    const second = panes.get('m/main')!;
    expect(second).not.toBe(first);
    expect(paneText(second.content)).toEqual(['ab', 'red text', '', 'four', '[half 30/60]']);
    await t.lib.setEnabled('m', false);
    await t.settle();
    expect(second.view.closed).toBe(true);
    expect(panes.get('m/main')).toBeUndefined();
  });

  it('temporary = true opens a temporary pane (<script>/~<id>); the cross closes it and calls onClose', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        c: src(`
          local ok, err = pcall(createPane, {id = "bad", temporary = "yes"})
          send(err)
          pick = createPane{id = "pick", title = "Pick one", temporary = true, rows = 3, cols = 24, dock = "left"}
          pick:setLine(1, "[a] [b]")
          pick:setLink(1, 1, 3, function() send("a") end, "A")
          pick:onClose(function() send("closed " .. tostring(pick:visible())) end)
          tempAlias("^again$", function()
            local p2 = createPane{id = "pick", temporary = true}
            send(tostring(p2 == pick))
            p2:echo("new")
          end)
          tempAlias("^hide$", function() pick:hide(); send(tostring(pick:visible())) end)
          tempAlias("^use$", function()
            pick:echo("x"); pick:setLine(2, "y"); pick:setTitle("T"); pick:show(); pick:clear()
            pick:onResize(function() end); pick:onClose(function() end)
            local r, c = pick:size()
            send(r .. "," .. c .. "," .. tostring(pick:visible()))
            pick:close()
          end)
        `),
      },
      { panes },
    );
    expect(t.sent[0]).toContain("bad argument #1 to 'createPane' (temporary must be true or false)");
    const p = panes.get('c/~pick')!;
    expect(p.spec).toEqual({ id: 'c/~pick', place: { dock: 'left', rows: 3, cols: 24 }, temporary: { rows: 3, cols: 24 } });
    t.engine.run('hide');
    expect(p.view.on).toBe(false);
    expect(t.sent.at(-1)).toBe('false');
    const script = (t.host as unknown as { owners: Map<string, { script: { refs: Set<number> } }> }).owners.get('c')!.script;
    const refs = script.refs.size;
    // The user closes it: closed first, then the handler (its methods are no-ops now).
    p.events.onClose!();
    expect(p.view.closed).toBe(true);
    expect(t.sent.at(-1)).toBe('closed false');
    // The link and the handler are released.
    expect(script.refs.size).toBe(refs - 2);
    p.events.onLink(p.content.links[0]!.id);
    expect(t.sent.at(-1)).toBe('closed false');
    p.events.onClose!();
    expect(t.sent.filter((m) => m.startsWith('closed'))).toHaveLength(1);
    // Calls on the closed object do nothing.
    t.engine.run('use');
    expect(t.sent.at(-1)).toBe('0,0,false');
    expect(t.lib.get('c')!.lastError).toBeNull();
    // createPane with the same id makes a new one.
    t.engine.run('again');
    expect(t.sent.at(-1)).toBe('false');
    const p2 = panes.get('c/~pick')!;
    expect(p2).not.toBe(p);
    expect(paneText(p2.content)).toEqual(['new']);
  });

  it('pane:close() takes any pane away without onClose; createPane opens it again', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        k: src(`
          p = createPane{id = "p"}
          p:onClose(function() send("onClose") end)
          t = createPane{id = "t", temporary = true}
          t:onClose(function() send("onClose") end)
          tempAlias("^close$", function() p:close(); t:close(); p:close(); send("ok") end)
          tempAlias("^open$", function() p = createPane{id = "p"}; p:echo("back") end)
        `),
      },
      { panes },
    );
    const a = panes.get('k/p')!;
    const b = panes.get('k/~t')!;
    t.engine.run('close');
    expect(t.sent).toEqual(['ok']);
    expect(a.view.closed).toBe(true);
    expect(b.view.closed).toBe(true);
    // The ordinary pane's on/off is not touched by close.
    expect(a.view.on).toBe(true);
    t.engine.run('open');
    expect(paneText(panes.get('k/p')!.content)).toEqual(['back']);
  });

  it('temporary panes are released on disable like other panes', async () => {
    const panes = new FakeSurface();
    const t = await setup({ d: src(`t = createPane{id = "t", temporary = true}; t:onClose(function() send("x") end)`) }, { panes });
    const v = panes.get('d/~t')!;
    await t.lib.setEnabled('d', false);
    await t.settle();
    expect(v.view.closed).toBe(true);
    v.events.onClose!();
    expect(t.sent).toEqual([]);
  });

  it('a pane without a surface keeps its content and reports 0 x 0', async () => {
    const t = await setup({ h: src(`p = createPane{id = "p"}; p:echo("x"); local r, c = p:size(); send(r .. "," .. c .. "," .. tostring(p:visible()))`) });
    expect(t.sent).toEqual(['0,0,true']);
  });
});
