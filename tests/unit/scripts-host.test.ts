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
import { ScriptHost } from '../../src/scripts/host';
import type { StyledRow } from '../../src/ui/output-pane';

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
}

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
  host = new ScriptHost({
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
