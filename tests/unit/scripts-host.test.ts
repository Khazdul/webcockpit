// The script host (src/scripts/host.ts, ADR 0051 P1): lifecycle, the API
// version 1, errors and the hang guard, with the real Lua runtime and
// script engine.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line, StyleRun, UiMessage } from '../../src/core/types';
import { TRUECOLOR, shadeColor } from '../../src/core/types';
import { entryWarning } from '../../src/editor/logic';
import { GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys, scriptKeyOwner } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { HANG_KEY } from '../../src/scripts/guard';
import { GmcpCache } from '../../src/scripts/gmcp-cache';
import { parseCecho } from '../../src/scripts/colors';
import { MapMarkHub, type ScriptMapSurface } from '../../src/map/marks';
import { PANES_EVENT_MAX, ScriptHost, deriveShort } from '../../src/scripts/host';
import { type DockId, PANE_IDS } from '../../src/layout/types';
import type { StyledRow } from '../../src/ui/output-pane';
import { PaneContent } from '../../src/panes/script-content';

const PaneContentFrom = PaneContent.fromSnapshot;
import type { PaneState, ScriptPaneEvents, ScriptPaneSpec, ScriptPaneSurface, ScriptPaneView } from '../../src/panes/script-surface';

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
  map?: ScriptMapSurface;
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
  /** `wheel(on)` calls (ADR 0072). */
  wheels: boolean[] = [];
  wheel(on: boolean): void {
    this.wheels.push(on);
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
    ...(opts.map ? { map: opts.map } : {}),
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

  it('copy2cecho gives the trigger line with its colours as cecho tags; nil outside a trigger', async () => {
    const t = await setup({
      s: src(`
        tempTrigger("orc", function() send(copy2cecho()) end)
        send(tostring(copy2cecho()))`),
    });
    t.recv('An orc is here.', [
      { start: 0, end: 2, fg: 9 },
      { start: 3, end: 6, fg: TRUECOLOR | 0x10a0ff, bg: 4, bold: true },
    ]);
    t.recv('plain orc');
    expect(t.sent).toEqual(['nil', '<ansi_9>An<reset> <#10a0ff:ansi_4><b>orc<reset> is here.', 'plain orc']);
    // It reads back as the same colours.
    const c = parseCecho(t.sent[1]!);
    expect(c.text).toBe('An orc is here.');
    expect(c.runs).toEqual([
      { start: 0, end: 2, fg: 9 },
      { start: 3, end: 6, fg: TRUECOLOR | 0x10a0ff, bg: 4, bold: true },
    ]);
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

describe('map marks (ADR 0057)', () => {
  function mapRig() {
    const hub = new MapMarkHub();
    const sent: Array<{ op: string; id: number; arg?: unknown }> = [];
    let shown = true;
    hub.attach({
      find: (req, query) => void sent.push({ op: 'find', id: req, arg: query }),
      mark: (id, target, style, ms, focus) => void sent.push({ op: 'mark', id, arg: { target, style, ms, focus } }),
      unmark: (id) => void sent.push({ op: 'unmark', id }),
      ask: (req, q) => void sent.push({ op: 'ask', id: req, arg: q }),
      shown: () => shown,
    });
    return { hub, sent, setShown: (v: boolean) => (shown = v) };
  }

  it('mapMark sends a query with its style; fn gets (count, total, ids) later; nil "map off" without a map', async () => {
    const m = mapRig();
    const t = await setup(
      {
        mm: src(`
          export("mark", function(name)
            local h, why = mapMark({name = name, lines = {"a line"}, exits = "Exits: north.", max = 5},
              {color = "orange", duration = 15, fade = 5, focus = true, label = "$home", linger = 180},
              function(count, total, ids) send("marked " .. count .. "/" .. total .. " " .. table.concat(ids, ",")) end)
            send(tostring(h) .. " " .. tostring(why))
          end)
          export("ids", function() send(tostring((mapMark({4, 5}, nil)))) end)
          export("unmark", function(h) send(tostring(mapUnmark(tonumber(h)))) end)
          export("find", function() send(tostring((mapFind({name = "x"}, function(ids, total) send("found " .. total .. " " .. #ids) end)))) end)
          export("bad", function()
            send(select(2, pcall(mapMark, {name = ""})))
            send(select(2, pcall(mapMark, {1}, {color = "ansi_red"})))
          end)
        `),
      },
      { map: m.hub },
    );
    t.engine.input('#lua mm mark A Tunnel');
    const mk = m.sent[0]!;
    expect(mk).toMatchObject({
      op: 'mark',
      arg: {
        target: { query: { name: 'A Tunnel', lines: ['a line'], exits: 'Exits: north.', max: 5 } },
        style: { color: 0xffa500, blink: true, fade: 5, arrows: true, label: '$home', linger: 180 },
        ms: 15000,
        focus: true,
      },
    });
    expect(t.sent).toEqual([`${mk.id} nil`]);
    m.hub.marked(mk.id, [3, 1], 7);
    expect(t.sent.at(-1)).toBe('marked 2/7 3,1');
    t.engine.input(`#lua mm unmark ${mk.id}`);
    expect(m.sent.at(-1)).toEqual({ op: 'unmark', id: mk.id });
    m.hub.ended(mk.id);
    t.engine.input('#lua mm ids');
    expect(m.sent.at(-1)).toMatchObject({ op: 'mark', arg: { target: { rooms: [4, 5] }, style: { color: 0xff40ff }, ms: 30000, focus: false } });
    t.engine.input('#lua mm find');
    m.hub.found(m.sent.at(-1)!.id, [9], 1);
    expect(t.sent.slice(-2)).toEqual(['true', 'found 1 1']);
    t.engine.input('#lua mm bad');
    expect(t.sent.slice(-2)).toEqual([expect.stringMatching(/name must be a string/), expect.stringMatching(/color must be a colour name/)]);
    // Off: nil, "map off" at once.
    m.setShown(false);
    t.engine.input('#lua mm mark A Tunnel');
    expect(t.sent.at(-1)).toBe('nil map off');
    expect(t.lib.get('mm')!.lastError).toBeNull();
  });

  it('caps marks per script; a script\'s marks go when it stops; no surface: map off', async () => {
    const m = mapRig();
    const t = await setup(
      { cap: src(`export("go", function() for i = 1, 9 do local h, why = mapMark({i}); send(tostring(h ~= nil) .. " " .. tostring(why)) end end)`) },
      { map: m.hub },
    );
    t.engine.input('#lua cap go');
    expect(t.sent.filter((x) => x === 'true nil')).toHaveLength(8);
    expect(t.sent.at(-1)).toBe('false at most 8 marks at a time');
    await t.host.reload('cap');
    expect(m.sent.filter((x) => x.op === 'unmark')).toHaveLength(8);
    const t2 = await setup({ off: src(`send(tostring(select(2, mapMark({1}))))`) });
    expect(t2.sent).toEqual(['map off']);
  });
});

describe('map search (ADR 0077 §B)', () => {
  function mapRig() {
    const hub = new MapMarkHub();
    const sent: Array<{ op: string; id: number; arg?: unknown }> = [];
    let shown = true;
    const detach = hub.attach({
      find: () => {},
      mark: (id, target, style, ms, focus) => void sent.push({ op: 'mark', id, arg: { target, style, ms, focus } }),
      unmark: (id) => void sent.push({ op: 'unmark', id }),
      ask: (req, q) => void sent.push({ op: 'ask', id: req, arg: q }),
      shown: () => shown,
    });
    return { hub, sent, detach, setShown: (v: boolean) => (shown = v) };
  }

  it('mapSearch sends the query and calls fn(results, total, here); bad queries are errors, a bad regex nil and why', async () => {
    const m = mapRig();
    const t = await setup(
      {
        ms: src(`
          export("go", function(text)
            send(tostring(mapSearch({text = text, field = "note", case = true, regex = false, max = 900}, function(results, total, here)
              local r = results[1]
              send(#results .. "/" .. total .. " here " .. tostring(here) .. " " .. r.name .. " " .. tostring(r.steps) .. " [" .. tostring(r.dirs) .. "] " .. tostring(results[2].steps))
            end)))
          end)
          export("re", function() send(table.concat({tostring(mapSearch({text = "(", regex = true}, function() end))}, " ")) send(select(2, mapSearch({text = "(", regex = true}, function() end))) end)
          export("bad", function()
            send(select(2, pcall(mapSearch, {text = "  "}, function() end)))
            send(select(2, pcall(mapSearch, {text = "x", field = "nope"}, function() end)))
            send(select(2, pcall(mapSearch, {text = "x", case = "yes"}, function() end)))
            send(select(2, pcall(mapSearch, {text = "x"})))
          end)
          export("path", function(id) send(tostring(mapPath(tonumber(id), function(dirs, steps) send("path " .. tostring(dirs) .. " " .. tostring(steps)) end))) end)
          export("room", function(id) mapRoom(tonumber(id), function(r)
            if not r then send("no room") return end
            send(r.name .. " " .. r.terrain .. " " .. r.exits[1].dir .. " " .. tostring(r.exits[1].door) .. " " .. table.concat(r.flags, ","))
          end) end)
        `),
      },
      { map: m.hub },
    );
    t.engine.input('#lua ms go Herb');
    const ask = m.sent.at(-1)!;
    expect(ask).toMatchObject({ op: 'ask', arg: { k: 'search', query: { text: 'Herb', field: 'note', case: true, regex: false, max: 500 } } });
    expect(t.sent.at(-1)).toBe('true');
    m.hub.answered(ask.id, {
      k: 'search',
      results: [
        { id: 4, name: 'A Glade', area: '', note: 'Herb: x', steps: 3, dirs: '2e n' },
        { id: 9, name: 'Far', area: '', note: 'Herb: y', steps: null, dirs: null },
      ],
      total: 7,
      here: 1,
    });
    expect(t.sent.at(-1)).toBe('2/7 here 1 A Glade 3 [2e n] nil');
    t.engine.input('#lua ms re');
    expect(t.sent.slice(-2)).toEqual(['nil', expect.stringMatching(/^bad regex: /)]);
    t.engine.input('#lua ms bad');
    expect(t.sent.slice(-4)).toEqual([
      expect.stringMatching(/text is empty/),
      expect.stringMatching(/field must be one of "name", "desc"/),
      expect.stringMatching(/case must be true or false/),
      expect.stringMatching(/bad argument #2 to 'mapSearch'/),
    ]);
    t.engine.input('#lua ms path 12');
    const pa = m.sent.at(-1)!;
    expect(pa.arg).toEqual({ k: 'path', room: 12 });
    m.hub.answered(pa.id, { k: 'path', dirs: '3e n 2u', steps: 6 });
    expect(t.sent.slice(-2)).toEqual(['true', 'path 3e n 2u 6']);
    t.engine.input('#lua ms path 13');
    m.hub.answered(m.sent.at(-1)!.id, { k: 'path', dirs: null, steps: null });
    expect(t.sent.at(-1)).toBe('path nil nil');
    t.engine.input('#lua ms room 5');
    m.hub.answered(m.sent.at(-1)!.id, {
      k: 'room',
      room: {
        id: 5, name: 'Gate', area: 'Bree', desc: 'd', contents: '', note: '', terrain: 'city', x: 1, y: 2, z: 0,
        exits: [{ dir: 'north', to: 6, door: 'gate', flags: ['needkey'] }],
        flags: ['aggressive mob', 'herb'],
      },
    });
    expect(t.sent.at(-1)).toBe('Gate city north gate aggressive mob,herb');
    // The map goes away before the answer: fn(nil).
    t.engine.input('#lua ms room 5');
    m.detach();
    expect(t.sent.at(-1)).toBe('no room');
    // Off: nil, "map off" at once.
    t.engine.input('#lua ms path 1');
    expect(t.sent.at(-1)).toBe('nil');
    expect(t.lib.get('ms')!.lastError).toBeNull();
  });

  it('mapMark: duration 0 lasts until unmarked (no fade); focus "move"; up to 200 ids; a bad focus is an error', async () => {
    const m = mapRig();
    const t = await setup(
      {
        mk: src(`
          export("go", function()
            local ids = {}
            for i = 1, 300 do ids[i] = i end
            send(tostring(mapMark(ids, {duration = 0, fade = 5, focus = "move"})))
            send(select(2, pcall(mapMark, {1}, {focus = "yes"})))
          end)
        `),
      },
      { map: m.hub },
    );
    t.engine.input('#lua mk go');
    const mk = m.sent.at(-1)!;
    const arg = mk.arg as { target: { rooms: number[] }; style: { fade: number }; ms: number; focus: unknown };
    expect(arg.target.rooms).toHaveLength(200);
    expect(arg.ms).toBe(Infinity);
    expect(arg.style.fade).toBe(0);
    expect(arg.focus).toBe('move');
    expect(t.sent.at(-1)).toMatch(/focus must be true, false or "move"/);
  });
});

describe('pane checkboxes and radio buttons (ADR 0077 §B)', () => {
  it('draw as text under a link, toggle on click, keep radio groups exclusive, set and remove; setLine drops them', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        w: src(`
          local pane = createPane{id = "p"}
          pane:setLine(1, "Search:")
          local cs = pane:setCheckbox(2, 2, {label = "Case sensitive", onChange = function(on) send("case " .. tostring(on)) end})
          local n = pane:setRadio(3, 1, {group = "f", value = "name", label = "Name", checked = true, onChange = function(v) send("field " .. v) end})
          local d = pane:setRadio(3, 10, {group = "f", value = "desc", label = "<red>Desc", onChange = function(v) send("field " .. v) end})
          export("state", function() send(tostring(cs:checked()) .. " " .. tostring(n:checked()) .. " " .. tostring(d:checked())) end)
          export("set", function() d:set(true) cs:set(true) end)
          export("rm", function() cs:remove() send(tostring(cs:checked())) end)
          export("line", function() pane:setLine(3, "gone") send(tostring(n:checked())) end)
          export("bad", function()
            send(select(2, pcall(pane.setRadio, pane, 4, 1, {label = "x"})))
            send(select(2, pcall(pane.setCheckbox, pane, 4, 0, {})))
          end)
        `),
      },
      { panes },
    );
    const p = panes.get('w/p')!;
    expect(paneText(p.content)).toEqual(['Search:', ' [ ] Case sensitive', '(\u2022) Name ( ) Desc']);
    expect(p.content.links.map((l) => [l.row, l.col, l.len])).toEqual([
      [1, 1, 18],
      [2, 0, 8],
      [2, 9, 8],
    ]);
    p.events.onLink(p.content.linkAt(1, 5)!.id);
    expect(paneText(p.content)[1]).toBe(' [x] Case sensitive');
    p.events.onLink(p.content.linkAt(2, 12)!.id);
    expect(paneText(p.content)[2]).toBe('( ) Name (\u2022) Desc');
    // A click on the chosen radio does nothing.
    p.events.onLink(p.content.linkAt(2, 12)!.id);
    expect(t.sent).toEqual(['case true', 'field desc']);
    t.engine.input('#lua w state');
    expect(t.sent.at(-1)).toBe('true false true');
    p.events.onLink(p.content.linkAt(2, 1)!.id);
    t.engine.input('#lua w state');
    expect(t.sent.slice(-2)).toEqual(['field name', 'true true false']);
    // set() redraws without onChange.
    t.engine.input('#lua w set');
    expect(paneText(p.content)[2]).toBe('( ) Name (\u2022) Desc');
    t.engine.input('#lua w state');
    expect(t.sent.slice(-2)).toEqual(['true true false', 'true false true']);
    // remove(): blank cells, no link, checked() nil.
    t.engine.input('#lua w rm');
    expect(paneText(p.content)[1]).toBe(' '.repeat(19));
    expect(p.content.linkAt(1, 5)).toBeNull();
    expect(t.sent.at(-1)).toBe('nil');
    t.engine.input('#lua w line');
    expect(t.sent.at(-1)).toBe('nil');
    expect(p.content.links).toHaveLength(0);
    t.engine.input('#lua w bad');
    expect(t.sent.slice(-2)).toEqual([expect.stringMatching(/group must be a string/), expect.stringMatching(/column must be a whole number/)]);
    // Runs see plain text and links.
    expect(p.content.snapshot().lines[0]).toEqual({ spans: [{ text: 'Search:' }] });
  });
});

describe('pane partial updates (ADR 0056)', () => {
  it('setText keeps the row and its links; setLink with nil is a tooltip only; isPrompt', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        p: src(`
          local pane = createPane{id = "p"}
          pane:setLine(1, " HP:     [rest]")
          pane:setLink(1, 10, 6, function() send("rest") end, "Rest")
          pane:setText(1, 6, "<green>120")
          pane:setLink(1, 6, 3, nil, "Hit points")
          send(select(2, pcall(pane.setText, pane, 0, 1, "x")))
          tempRegexTrigger(">$", function() send(tostring(isPrompt())) end)
          send(tostring(isPrompt()))
        `),
      },
      { panes },
    );
    const p = panes.get('p/p')!;
    expect(paneText(p.content)).toEqual([' HP: 120 [rest]']);
    expect(p.content.links.map((l) => [l.col, l.len, l.hint, !!l.tip])).toEqual([
      [9, 6, 'Rest', false],
      [5, 3, 'Hit points', true],
    ]);
    p.events.onLink(p.content.links[1]!.id);
    p.events.onLink(p.content.links[0]!.id);
    expect(t.sent.slice(0, 3)).toEqual([expect.stringMatching(/bad argument #2 to 'pane:setText'/), 'false', 'rest']);
    t.bus.emit('text.line', { ...line('Mana:Hot>'), prompt: true });
    t.recv('not a prompt>');
    expect(t.sent.slice(3)).toEqual(['true', 'false']);
  });
});

describe('pane:setGrip (ADR 0065 round 1)', () => {
  it('sets one grip range, survives setLine and clear, nil removes it, bad arguments are errors', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        g: src(`
          local pane = createPane{id = "p"}
          pane:setGrip(2, 3, 4)
          pane:setLine(2, "text")
          pane:clear()
          send("a")
          pane:setGrip(1, 1)
          send("b")
          send(select(2, pcall(pane.setGrip, pane, 1, 0, 1)))
          send(select(2, pcall(pane.setGrip, pane, 1, 1, 0)))
          send(select(2, pcall(pane.setGrip, pane, 0, 1, 1)))
          tempAlias("^nogrip$", function() pane:setGrip(nil) end)
        `),
      },
      { panes },
    );
    const p = panes.get('g/p')!;
    expect(t.sent.slice(0, 2)).toEqual(['a', 'b']);
    expect(p.content.grip).toEqual({ row: 0, col: 0, len: 1 });
    expect(p.content.gripAt(0, 0)).toBe(true);
    expect(p.content.gripAt(0, 1)).toBe(false);
    expect(t.sent[2]).toMatch(/bad argument #3 to 'pane:setGrip'/);
    expect(t.sent[3]).toMatch(/bad argument #4 to 'pane:setGrip'/);
    expect(t.sent[4]).toMatch(/bad argument #2 to 'pane:setGrip'/);
    // Not in a snapshot: a grip in the log player would do nothing.
    expect(p.content.snapshot()).not.toHaveProperty('grip');
    t.engine.input('nogrip');
    expect(p.content.grip).toBeNull();
  });

  it('keeps a grip through setLine and clear', async () => {
    const panes = new FakeSurface();
    await setup({ g: src(`local pane = createPane{id = "p"}\npane:setGrip(2, 3, 4)\npane:setLine(2, "text")\npane:clear()`) }, { panes });
    expect(panes.get('g/p')!.content.grip).toEqual({ row: 1, col: 2, len: 4 });
  });
});

describe('pane:onWheel (ADR 0072)', () => {
  it('turns the surface wheel on and off, calls fn(dx, dy), true consumes, a replaced handler is released', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        w: src(`
          pane = createPane{id = "p"}
          pane:onWheel(function(dx, dy)
            send(dx .. "," .. dy)
            return dx > 0
          end)
          tempAlias("^other$", function() pane:onWheel(function() return "yes" end) end)
          tempAlias("^off$", function() pane:onWheel(nil) end)
          tempAlias("^bad$", function() send(select(2, pcall(pane.onWheel, pane, 3))) end)
        `),
      },
      { panes },
    );
    const p = panes.get('w/p')!;
    expect(p.view.wheels).toEqual([true]);
    expect(p.events.onWheel!(2, 0)).toBe(true);
    expect(p.events.onWheel!(-1, 3)).toBe(false);
    expect(t.sent).toEqual(['2,0', '-1,3']);
    const script = (t.host as unknown as { owners: Map<string, { script: { refs: Set<number> } }> }).owners.get('w')!.script;
    const refs = script.refs.size;
    t.engine.run('other');
    // The old handler is released; only a true return consumes.
    expect(script.refs.size).toBe(refs);
    expect(p.events.onWheel!(1, 0)).toBe(false);
    t.engine.run('off');
    expect(script.refs.size).toBe(refs - 1);
    expect(p.view.wheels).toEqual([true, true, false]);
    expect(p.events.onWheel!(1, 0)).toBe(false);
    t.engine.run('bad');
    expect(t.sent.at(-1)).toMatch(/bad argument #2 to 'pane:onWheel'/);
  });

  it('a handler error follows the error policy and does not consume; close and disable release it', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        e: src(`
          pane = createPane{id = "p"}
          pane:onWheel(function() error("boom") end)
          tempAlias("^close$", function() pane:close() end)
        `),
      },
      { panes },
    );
    const p = panes.get('e/p')!;
    expect(p.events.onWheel!(0, 1)).toBe(false);
    expect(t.uiText().some((m) => m.includes('boom'))).toBe(true);
    const script = (t.host as unknown as { owners: Map<string, { script: { refs: Set<number> } }> }).owners.get('e')!.script;
    const refs = script.refs.size;
    t.engine.run('close');
    expect(script.refs.size).toBe(refs - 1);
    expect(p.events.onWheel!(0, 1)).toBe(false);
    expect(t.uiText().filter((m) => m.includes('boom')).length).toBe(1);
  });
});

describe('link hover styles (ADR 0065 round 2)', () => {
  it('pane:setHover sets the pane default, setLink and cechoLink take {hover = …}, bad styles are errors', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        h: src(`
          local pane = createPane{id = "p"}
          pane:setLine(1, "[a] [b] [c]")
          pane:setLink(1, 1, 3, function() end, "a")
          pane:setLink(1, 5, 3, function() end, "b", {hover = "none"})
          pane:setLink(1, 9, 3, nil, "c", {})
          pane:cechoLink("[d]", function() end, "d", {hover = "band"})
          pane:setHover("lighten")
          send(select(2, pcall(pane.setHover, pane, "glow")))
          send(select(2, pcall(pane.setLink, pane, 2, 1, 1, function() end, "x", {hover = "bright"})))
          send(select(2, pcall(pane.cechoLink, pane, "x", function() end, "x", {hover = 1})))
          send(select(2, pcall(pane.setLink, pane, 2, 1, 1, function() end, "x", {1})))
          tempAlias("^band$", function() pane:setHover(nil) end)
        `),
      },
      { panes },
    );
    const c = panes.get('h/p')!.content;
    expect(c.hover).toBe('lighten');
    expect(c.links.map((l) => c.hoverOf(l))).toEqual(['lighten', 'none', 'lighten', 'band']);
    expect(t.sent[0]).toMatch(/bad argument #2 to 'pane:setHover' \(hover must be one of "band", "lighten", "none"\)/);
    expect(t.sent[1]).toMatch(/bad argument #7 to 'pane:setLink' \(hover must be one of/);
    expect(t.sent[2]).toMatch(/bad argument #5 to 'pane:cechoLink' \(hover must be one of/);
    expect(t.sent[3]).toMatch(/bad argument #7 to 'pane:setLink' \(a table of options expected\)/);
    // The failed calls added no link.
    expect(c.links).toHaveLength(4);
    t.engine.input('band');
    expect(c.hover).toBe('band');
  });
});

describe('pane anchor (ADR 0053 addendum)', () => {
  it('createPane takes anchor top or bottom (default) and at for a temporary pane, and refuses others', async () => {
    const panes = new FakeSurface();
    const t = await setup(
      {
        a: src(`
          createPane{id = "list", anchor = "top"}
          createPane{id = "con"}
          send(select(2, pcall(createPane, {id = "x", anchor = "middle"})))
          createPane{id = "t", temporary = true, at = "top-right"}
          createPane{id = "u", temporary = true, at = "bottom-left"}
          createPane{id = "g1", temporary = true, group = "tv", grid = {cols = 3}}
          send(select(2, pcall(createPane, {id = "g2", group = "tv"})))
          send(select(2, pcall(createPane, {id = "g3", temporary = true, group = "a b"})))
          send(select(2, pcall(createPane, {id = "y", temporary = true, at = "nowhere"})))
        `),
      },
      { panes },
    );
    expect(panes.get('a/list')!.content.anchor).toBe('top');
    expect(panes.get('a/con')!.content.anchor).toBe('bottom');
    expect(t.sent[0]).toMatch(/anchor must be "top" or "bottom"/);
    expect(panes.get('a/~t')!.spec.temporary).toEqual({ rows: 8, cols: 30, at: 'top-right' });
    expect(panes.get('a/~u')!.spec.temporary).toEqual({ rows: 8, cols: 30, at: 'bottom-left' });
    expect(panes.get('a/~g1')!.spec.temporary).toEqual({ rows: 8, cols: 30, group: { key: 'a/tv', cols: 3 } });
    expect(t.sent[1]).toMatch(/group is for temporary panes/);
    expect(t.sent[2]).toMatch(/group must be 1 to 32/);
    expect(t.sent[3]).toMatch(/at must be one of "center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"/);
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
      onBlur = function(text) send("blur " .. text) end,
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
    p.events.onField!(id, { type: 'blur', text: 'xy' });
    expect(t.sent).toEqual(['change hom', 'key ArrowDown', 'submit a very l a very l', 'cancel', 'blur xy']);
    expect(p.content.fields[0]!.value).toBe('xy');
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

/** A surface with the pane list (ADR 0065): built-ins first, then the open ordinary panes. */
class ListSurface extends FakeSurface {
  readonly builtinOn = new Map<string, boolean>();
  readonly docks = new Map<string, DockId | 'float'>();
  readonly shown = new Set<string>();
  readonly wants: Array<[string, number, number | undefined]> = [];
  private readonly fns = new Set<() => void>();
  override open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView {
    const v = super.open(spec, content, events) as FakeView & ScriptPaneView;
    v.dock = () => (spec.temporary ? 'float' : (this.docks.get(spec.id) ?? spec.place.dock));
    v.want = (rows, cols) => {
      this.wants.push([spec.id, rows, cols]);
      return v.dock!() !== 'float';
    };
    this.notify();
    return v;
  }
  states(): PaneState[] {
    const open = this.opened.filter((o) => !o.view.closed && !o.spec.temporary);
    return [
      ...PANE_IDS.map((id) => ({ id, on: this.builtinOn.get(id) ?? true, shown: this.shown.has(id), dock: (this.docks.get(id) ?? 'right') as DockId | 'float' })),
      ...open.map((o) => ({ id: o.spec.id, on: o.view.on, shown: this.shown.has(o.spec.id), dock: (o.view as ScriptPaneView).dock!() })),
    ];
  }
  setOn(id: string, on: boolean): boolean {
    if (!this.states().some((s) => s.id === id)) return false;
    if (PANE_IDS.includes(id as never)) this.builtinOn.set(id, on);
    else this.opened.find((o) => o.spec.id === id && !o.view.closed)!.view.on = on;
    this.notify();
    return true;
  }
  onStates(fn: () => void): () => void {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  notify(): void {
    for (const f of [...this.fns]) f();
  }
}

describe('pane list (ADR 0065)', () => {
  const DUMP = `
    tempAlias("^dump$", function()
      for _, e in ipairs(getPanes()) do
        send(table.concat({e.id, e.short, tostring(e.on), tostring(e.shown), e.dock, e.script or "-", tostring(e.own), e.title}, "|"))
      end
    end)`;
  const flushMicro = () => new Promise((r) => setTimeout(r, 0));

  it('getPanes lists built-ins, then script panes in surface order; temporary panes never; own marks the caller', async () => {
    const panes = new ListSurface();
    const t = await setup(
      {
        a: src(`
          createPane{id = "main", title = "Mercenaries", dock = "left"}
          createPane{id = "pick", temporary = true}
          createPane{id = "k", title = "Port keys", short = " KEYS ", dock = "top"}
          createPane{id = "z9", title = "!!"}
          ${DUMP}`),
        b: src(`createPane{id = "bar", title = "Pane bar", dock = "bottom", lane = "own", border = false}`),
      },
      { panes },
    );
    panes.shown.add('comm');
    panes.builtinOn.set('map', false);
    t.engine.input('dump');
    expect(t.sent).toEqual([
      'character|CHAR|true|false|right|-|false|Character',
      'timers|TIME|true|false|right|-|false|Timers',
      'group|GRP|true|false|right|-|false|Group',
      'comm|COMM|true|true|right|-|false|Comm',
      'ui|UI|true|false|right|-|false|UI',
      'map|MAP|false|false|right|-|false|Map',
      'a/main|MERC|true|false|left|a|true|Mercenaries',
      'a/k|KEYS|true|false|top|a|true|Port keys',
      'a/z9|Z9|true|false|right|a|true|!!',
      'b/bar|PANE|true|false|bottom|b|false|Pane bar',
    ]);
    expect(panes.get('b/bar')!.spec.place).toEqual({ dock: 'bottom', rows: 8, cols: 30, border: false, lane: 'own' });
    expect(deriveShort('Port keys')).toBe('PORT');
  });

  it('createPane checks short, border and lane; a repeated createPane takes a new short name', async () => {
    const panes = new ListSurface();
    const t = await setup(
      {
        s: src(`
          local function try(t) local ok, e = pcall(createPane, t); send(ok and "ok" or e) end
          try{id = "a", short = ""}
          try{id = "a", short = "123456789"}
          try{id = "a", border = "no"}
          try{id = "a", lane = "inner"}
          try{id = "a", lane = "own", dock = "float"}
          try{id = "a", lane = "own", temporary = true}
          createPane{id = "a", title = "Alpha"}
          createPane{id = "a", short = "AL"}
          ${DUMP}`),
      },
      { panes },
    );
    expect(t.sent.slice(0, 6).map((m) => m.replace(/^.*\(/, '').replace(/\)$/, ''))).toEqual([
      'short must be 1 to 8 characters',
      'short must be 1 to 8 characters',
      'border must be true or false',
      'lane must be "own"',
      'lane is for a pane in a dock',
      'lane is for a pane in a dock',
    ]);
    t.sent.length = 0;
    t.engine.input('dump');
    expect(t.sent.at(-1)).toBe('s/a|AL|true|false|right|s|true|Alpha');
  });

  it('setPaneOn switches any pane; false for unknown, temporary and stopped scripts; type errors', async () => {
    const panes = new ListSurface();
    const t = await setup(
      {
        s: src(`
          createPane{id = "pick", temporary = true}
          tempAlias("^on ([^ ]+) ([^ ]+)$", function()
            send(tostring(setPaneOn(matches[2], matches[3] == "true")))
          end)
          tempAlias("^bad$", function()
            local ok, e = pcall(setPaneOn, "comm", "yes")
            send(e)
          end)`),
        o: src(`createPane{id = "main"}`),
      },
      { panes },
    );
    t.engine.input('on comm false');
    t.engine.input('on o/main false');
    t.engine.input('on nope/x true');
    t.engine.input('on s/~pick false');
    t.engine.input('on zz true');
    t.engine.input('bad');
    expect(t.sent.slice(0, 5)).toEqual(['true', 'true', 'false', 'false', 'false']);
    expect(t.sent[5]).toMatch(/bad argument #2 to 'setPaneOn' \(boolean expected, got string\)/);
    expect(panes.builtinOn.get('comm')).toBe(false);
    expect(panes.get('o/main')!.view.on).toBe(false);
    await t.lib.setEnabled('o', false);
    await t.settle();
    t.sent.length = 0;
    t.engine.input('on o/main true');
    expect(t.sent).toEqual(['false']);
  });

  it('sysPanesChanged: one per microtask, only when the list changed, never in a loop from wantSize', async () => {
    const panes = new ListSurface();
    const t = await setup(
      {
        w: src(`
          local pane = createPane{id = "bar", title = "Bar", dock = "bottom"}
          n = 0
          registerAnonymousEventHandler("sysPanesChanged", function(ev)
            n = n + 1
            pane:wantSize(1)
            send(ev .. " " .. n)
          end)`),
      },
      { panes },
    );
    await flushMicro();
    expect(t.sent).toEqual([]);
    // Two changes in one task: one event.
    panes.setOn('group', false);
    await flushMicro();
    expect(t.sent).toEqual(['sysPanesChanged 1']);
    panes.setOn('comm', false);
    panes.setOn('ui', false);
    await flushMicro();
    expect(t.sent).toEqual(['sysPanesChanged 1', 'sysPanesChanged 2']);
    // A layout that changes nothing in the list: no event.
    panes.notify();
    panes.notify();
    await flushMicro();
    expect(t.sent).toHaveLength(2);
    // A dock change is a change.
    panes.docks.set('comm', 'left');
    panes.notify();
    await flushMicro();
    expect(t.sent.at(-1)).toBe('sysPanesChanged 3');
    expect(panes.wants.every(([id, r]) => id === 'w/bar' && r === 1)).toBe(true);
  });

  it('a handler that changes the list every time is capped with one warning', async () => {
    const panes = new ListSurface();
    const t = await setup(
      {
        loop: src(`
          n = 0
          registerAnonymousEventHandler("sysPanesChanged", function()
            n = n + 1
            local on = true
            for _, e in ipairs(getPanes()) do if e.id == "comm" then on = e.on end end
            setPaneOn("comm", not on)
            send("ev")
          end)`),
      },
      { panes },
    );
    panes.setOn('ui', false);
    for (let i = 0; i < 40; i++) await flushMicro();
    expect(t.sent.length).toBe(PANES_EVENT_MAX);
    expect(t.uiText().filter((m) => m.includes('sysPanesChanged fired more than'))).toHaveLength(1);
  });

  it('pane:dock and pane:wantSize: where it is, the request goes to the surface; floats and temporary panes say false', async () => {
    const panes = new ListSurface();
    const t = await setup(
      {
        s: src(`
          local p = createPane{id = "p", dock = "left"}
          local f = createPane{id = "f", dock = "float"}
          local tp = createPane{id = "t", temporary = true}
          send(p:dock() .. " " .. f:dock() .. " " .. tp:dock())
          send(tostring(p:wantSize(3)) .. " " .. tostring(p:wantSize(2, 40)) .. " " .. tostring(f:wantSize(3)) .. " " .. tostring(tp:wantSize(3)))
          local ok, e = pcall(p.wantSize, p, 0)
          send(e)
          p:close()
          send(tostring(p:dock()))`),
      },
      { panes },
    );
    expect(t.sent[0]).toBe('left float float');
    expect(t.sent[1]).toBe('true true false false');
    expect(t.sent[2]).toMatch(/a size from 1 expected/);
    expect(t.sent[3]).toBe('nil');
    expect(panes.wants).toEqual([
      ['s/p', 3, undefined],
      ['s/p', 2, 40],
      ['s/f', 3, undefined],
    ]);
  });

  it('shade tags work in pane text only', async () => {
    const panes = new FakeSurface();
    await setup({ s: src(`local p = createPane{id = "p"}\np:setLine(1, "<@text:@dim>on<reset> <@foo>x")\ncecho("<@dim>plain")`) }, { panes });
    const l = panes.get('s/p')!.content.lines[0]!;
    expect('spans' in l && l.spans.map((s) => [s.text, s.fg, s.bg])).toEqual([
      ['on', shadeColor('vtext'), shadeColor('dim')],
      [' <@foo>x', undefined, undefined],
    ]);
  });
});

