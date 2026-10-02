// The bundled key manager (src/scripts/bundled/keymanager.lua, stage 12),
// run in the real script host with MUME game text and GMCP, a fake pane
// surface and fake time.
//
// Game text: the locate block (the "You start to concentrate..." line, the
// blank lines, the row with two spaces between the columns) is from a real
// log (/home/ole/MUME/data/runs/Gittan/2026-09-19T21-35-58.log); the
// failure lines are the Mudlet script's.

import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents, Line, UiMessage } from '../../src/core/types';
import { GameState } from '../../src/gmcp/state';
import { loadLuaRuntime } from '../../src/lua';
import type { PaneContent } from '../../src/panes/script-content';
import type { ScriptPaneEvents, ScriptPaneSpec, ScriptPaneSurface, ScriptPaneView } from '../../src/panes/script-surface';
import { FakeScheduler, ScriptEngine } from '../../src/script/engine';
import { resetScriptKeys } from '../../src/script/script-keys';
import { ScriptLibrary } from '../../src/scripts';
import { BUNDLED_SCRIPTS } from '../../src/scripts/bundled';
import { ScriptHost } from '../../src/scripts/host';

const EPOCH0 = 1_790_000_000;
const HOUR = 3_600_000;

const CONCENTRATE = 'You start to concentrate...';
const row = (mob: string, room: string, dist: string, key: string) => `${mob} - ${room}  ${dist}  key: '${key}'`;
const GITTAN = row('Gittan', 'On a hill', 'Very near', 'uxevjobve');
const TROLL = row('A troll', 'Inside', 'Far away', 'abcdefghi');
const WARG = row('A hungry warg', 'In a forest', 'Near', 'qwertyuio');
const PROMPT = '!( Mana:Burning>';

const hosts: ScriptHost[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.dispose();
  resetScriptKeys();
});

class FakeView implements ScriptPaneView {
  on = true;
  closed = false;
  cols = 0;
  rows = 0;
  changed(): void {}
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
}
class FakeSurface implements ScriptPaneSurface {
  readonly opened: Array<{ spec: ScriptPaneSpec; content: PaneContent; events: ScriptPaneEvents; view: FakeView }> = [];
  open(spec: ScriptPaneSpec, content: PaneContent, events: ScriptPaneEvents): ScriptPaneView {
    const view = new FakeView();
    this.opened.push({ spec, content, events, view });
    return view;
  }
  byId(id: string) {
    return this.opened.find((o) => o.spec.id === id && !o.view.closed) ?? null;
  }
  get keys() {
    return this.byId('keymanager/keys')!;
  }
  get pick() {
    return this.byId('keymanager/~pick');
  }
}

function line(text: string): Line {
  return { text, runs: [], tags: [], prompt: false, raw: text, ts: 0 };
}

function text(c: PaneContent, r: number): string {
  const l = c.lines[r];
  if (!l) return '';
  return 'spans' in l ? l.spans.map((s) => s.text).join('') : '';
}

async function setup(opts: { login?: string | null; before?: (lib: ScriptLibrary) => Promise<void> } = {}) {
  const bus = new Bus();
  const clock = new FakeScheduler();
  const sent: string[] = [];
  const ui: UiMessage[] = [];
  const shown: BusEvents['text.display'][] = [];
  const printed: string[] = [];
  let host: ScriptHost | null = null;
  const engine = new ScriptEngine({
    send: (t) => sent.push(t),
    message: () => {},
    scheduler: clock,
    scriptCommand: (n, a) => host!.command(n, a),
  });
  engine.attach(bus);
  const game = new GameState();
  game.attach(bus);
  bus.on('text.display', (d) => shown.push(d));
  bus.on('ui.message', (m) => ui.push(m));
  const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
  await lib.init();
  await opts.before?.(lib);
  await lib.setEnabled('keymanager', true);
  const panes = new FakeSurface();
  const gmcp = (pkg: string, data: unknown) => {
    bus.emit('gmcp.raw', { pkg, json: JSON.stringify(data) });
    bus.emit('gmcp', { pkg, key: pkg.toLowerCase(), data });
  };
  const login = opts.login === undefined ? 'Gittan' : opts.login;
  host = new ScriptHost({
    engine,
    bus,
    library: lib,
    game,
    send: (t) => sent.push(t),
    print: (rows) => printed.push(...rows.map((r) => r.segs.map((g) => g.text).join(''))),
    message: () => {},
    loadRuntime: () => loadLuaRuntime(),
    epoch: () => EPOCH0 + clock.now() / 1000,
    panes,
  });
  hosts.push(host);
  await host.start();
  const t = {
    bus,
    engine,
    clock,
    sent,
    ui,
    lib,
    host,
    panes,
    gmcp,
    printed,
    recv: (...texts: string[]) => {
      for (const x of texts) bus.emit('text.line', line(x));
    },
    input: (cmd: string) => engine.input(cmd),
    /** Texts shown in the game pane (game lines and echoes). */
    texts: () => shown.map((d) => d.line.text),
    lastText: () => shown.at(-1)?.line.text ?? '',
    uiText: () => ui.map((m) => `${m.kind === 'event' ? m.name : ''}: ${m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')}`),
    rows: () => t.panes.keys.content.lines.map((_, i) => text(t.panes.keys.content, i).trimEnd()),
    pickRows: () => {
      const p = t.panes.pick;
      return p ? p.content.lines.map((_, i) => text(p.content, i).trimEnd()) : null;
    },
    resize: (cols: number, rows = 10) => t.panes.keys.events.onResize(cols, rows),
    /** Clicks the key pane link on `r` (0-based) at the last ` ch` (or at `col`). */
    click: (r: number, ch: string) => {
      const c = t.panes.keys.content;
      const s = text(c, r);
      const col = ch.length === 1 ? s.lastIndexOf(` ${ch}`) + 1 : s.indexOf(ch);
      const link = c.linkAt(r, col);
      if (!link) throw new Error(`no link at ${r}:${col} in "${s}"`);
      t.panes.keys.events.onLink(link.id);
      return link;
    },
    linkAt: (r: number, ch: string) => {
      const c = t.panes.keys.content;
      const s = text(c, r);
      return c.linkAt(r, s.lastIndexOf(` ${ch}`) + 1);
    },
    clickPick: (r: number) => {
      const p = t.panes.pick!;
      const link = p.content.linkAt(r, 5);
      if (!link) throw new Error(`no pick link at row ${r}`);
      p.events.onLink(link.id);
      return link;
    },
    key: (name: string) => engine.runMacro(name),
    settle: async () => {
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      await host!.sync();
    },
    store: () => lib.storeGet('keymanager', 'char.gittan') as { safe: string | null; keys: Array<Record<string, unknown>> } | undefined,
  };
  t.resize(44);
  if (login) {
    gmcp('Char.Name', { name: login, fullname: `${login} the Tester` });
    clock.advance(1);
  }
  return t;
}

type T = Awaited<ReturnType<typeof setup>>;

/** A locate block as MUME sends it. */
function locateBlock(t: T, ...rows: string[]) {
  t.recv(CONCENTRATE, '', ...rows, '', PROMPT);
}

/** locatel <args>, then the block. */
function locatel(t: T, args: string, ...rows: string[]) {
  t.input(`locatel ${args}`);
  locateBlock(t, ...rows);
}

describe('bundled keymanager', () => {
  it('is listed with its header, settings and help', async () => {
    const lib = new ScriptLibrary({ factory: null, bundled: BUNDLED_SCRIPTS });
    await lib.init();
    const s = lib.get('keymanager')!;
    expect(s).toMatchObject({ bundled: true, readonly: true, problems: [], loadProblem: null, enabled: false });
    expect(s.header.api).toBe(1);
    expect(s.header.aliases.map((a) => a.name)).toEqual(['keys', 'locatel', 'kpick', 'nkey', 'rkey', 'dkey', 'skey', 'teleport', 'tsafe']);
    expect(s.header.keys.map((k) => k.key)).toEqual(['Ctrl+S', 'Alt+S']);
    expect(s.settings).toEqual({ hours: 12 });
    expect(s.header.help.join('\n')).toMatch(/safe key/);
  });

  it('shows Not logged in until the character is known, and refuses to store', async () => {
    const t = await setup({ login: null });
    expect(t.panes.keys.spec).toEqual({ id: 'keymanager/keys', place: { dock: 'right', rows: 8, cols: 44 } });
    expect(t.panes.keys.content.title).toBe('Keys');
    expect(t.rows()).toEqual([' Not logged in', '', ' Keys are kept per character.', ' Log in to see yours.']);
    t.input('locatel home');
    expect(t.sent).toEqual([]);
    expect(t.lastText()).toBe('KEYS Not logged in: keys are kept per character. Log in first.');
    t.input('cast $home');
    expect(t.sent).toEqual(['cast $home']);
    t.gmcp('Char.Name', { name: 'Gittan', fullname: 'Gittan the Tester' });
    t.clock.advance(1);
    expect(t.rows()).toEqual([' Gittan                           0 keys  ?', '', ' No keys yet.', " locatel <name> stores your room's key."]);
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('locatel <name>: one hit is stored, its rows gagged, one feedback line', async () => {
    const t = await setup();
    t.input('locatel home');
    expect(t.sent).toEqual(["cast n 'locate life'"]);
    expect(t.lastText()).toBe('KEYS Locating your room for $home.');
    const before = t.texts().length;
    locateBlock(t, GITTAN);
    const shown = t.texts().slice(before);
    expect(shown).toEqual([CONCENTRATE, '', '', 'KEYS Stored $home (On a hill, Very near): uxevjobve It is your safe key (Ctrl+S).', PROMPT]);
    expect(t.store()).toMatchObject({ safe: 'home', keys: [{ name: 'home', key: 'uxevjobve', room: 'On a hill', dist: 'Very near' }] });
    const r = t.rows();
    expect(r[0]).toBe(' Gittan                            1 key  ?');
    expect(r[1]).toBe(' ★ $home On a hill uxevjobve  12h t p s w x');
    expect(r[1]).toHaveLength(43);
    // Highlighted for a few seconds.
    const nameSpan = () => {
      const l = t.panes.keys.content.lines[1]!;
      return 'spans' in l ? l.spans.find((s) => s.text === '$home')! : null;
    };
    expect(nameSpan()!.bg).toBeDefined();
    t.clock.advance(5000);
    expect(nameSpan()!.bg).toBeUndefined();
    // A second locatel of the same name replaces it.
    t.clock.advance(HOUR);
    t.input('locatel home');
    expect(t.lastText()).toBe('KEYS Locating your room for $home (replaces the old one).');
    locateBlock(t, row('Gittan', 'Inside', 'Here', 'zzzzzzzz'));
    expect(t.texts()).toContain('KEYS Replaced $home (Inside, Here): zzzzzzzz');
    expect(t.store()!.keys).toHaveLength(1);
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('locatel <target> <name>: several hits open the pick list; click, or Alt keys, store and close', async () => {
    const t = await setup();
    locatel(t, 'troll cave', TROLL, WARG);
    expect(t.sent).toEqual(["cast n 'locate life' troll"]);
    // The rows are gagged.
    expect(t.texts().some((x) => x.includes("key: '"))).toBe(false);
    expect(t.texts()).toContain('KEYS 2 creatures found for $cave: pick a key in the list.');
    const p = t.panes.pick!;
    expect(p.spec.temporary).toBeDefined();
    expect(p.content.title).toBe('Pick key for $cave');
    expect(t.pickRows()).toEqual([
      '   #  Mob            Room type    Distance  Key',
      ' ▶ 1  A troll        Inside       Far away  abcdefghi',
      '   2  A hungry warg  In a forest  Near      qwertyuio',
      '',
      ' Click or Alt+Enter: store · Alt+↑↓ select · Alt+Q close',
    ]);
    // Alt+Down moves the selection, Alt+Enter stores it and closes the list.
    expect(t.key('Alt+ArrowDown')).toBe(true);
    expect(t.pickRows()![2]).toMatch(/^ ▶ 2 /);
    expect(t.key('Alt+ArrowDown')).toBe(true);
    expect(t.pickRows()![2]).toMatch(/^ ▶ 2 /);
    expect(t.key('Alt+ArrowLeft')).toBe(true);
    expect(t.pickRows()![1]).toMatch(/^ ▶ 1 /);
    t.key('Alt+ArrowRight');
    t.key('Alt+Enter');
    expect(t.panes.pick).toBeNull();
    expect(t.texts()).toContain('KEYS Stored $cave (In a forest, Near): qwertyuio It is your safe key (Ctrl+S).');
    // The keys are gone with the list.
    expect(t.key('Alt+ArrowDown')).toBe(false);
    expect(t.key('Alt+Enter')).toBe(false);

    // kpick reopens it; the stored hit is marked; a click stores the other.
    t.input('kpick');
    expect(t.pickRows()![2]).toBe('   2  A hungry warg  In a forest  Near      qwertyuio  = $cave');
    const link = t.clickPick(1);
    expect(link.hint).toBe('Store as $cave:\nA troll - Inside, Far away\nkey abcdefghi');
    expect(t.panes.pick).toBeNull();
    expect(t.texts()).toContain('KEYS Replaced $cave (Inside, Far away): abcdefghi');
    // Alt+Q closes without storing.
    t.input('kpick');
    expect(t.panes.pick).not.toBeNull();
    t.key('Alt+Q');
    expect(t.panes.pick).toBeNull();
    // The close cross closes it too (onClose kills the keys).
    t.input('kpick');
    t.panes.pick!.events.onClose!();
    expect(t.key('Alt+Q')).toBe(false);
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('no hit and failures cancel an armed locate; a timeout too', async () => {
    const t = await setup();
    t.input('locatel ghost spook');
    t.recv(CONCENTRATE, '', 'Your mind fails to locate any such creature.', PROMPT);
    expect(t.texts()).toContain('KEYS Locate found nothing: no key stored for $spook.');
    t.input('locatel home');
    t.recv('Your spell backfired!');
    expect(t.lastText()).toBe('KEYS The locate failed: no key stored for $home.');
    // Not armed: the same lines say nothing.
    const n = t.texts().length;
    t.recv('Your spell backfired!', 'Alas, not enough mana flows through you...');
    expect(t.texts().slice(n)).toEqual(['Your spell backfired!', 'Alas, not enough mana flows through you...']);
    t.input('locatel home');
    t.clock.advance(16_000);
    expect(t.lastText()).toBe('KEYS No locate result within 15 s: no key stored for $home.');
    expect(t.store()?.keys ?? []).toEqual([]);
  });

  it('a locate cast any other way is caught too: own room stored at once, a target picked, names made up', async () => {
    const t = await setup();
    // Own room (one row, your own character), cast by hand: stored at once.
    t.input("cast n 'locate life'");
    t.recv(CONCENTRATE, '', GITTAN, '', PROMPT);
    expect(t.texts()).toEqual([
      CONCENTRATE,
      '',
      '',
      'KEYS Stored $hill (On a hill, Very near): uxevjobve It is your safe key (Ctrl+S). Rename: rkey hill <new>',
      PROMPT,
    ]);
    // The same room again: the key is renewed under its name.
    t.clock.advance(HOUR);
    t.recv(CONCENTRATE, '', GITTAN, '', PROMPT);
    expect(t.texts()).toContain('KEYS Renewed $hill (On a hill, Very near): uxevjobve');
    expect(t.store()!.keys).toHaveLength(1);
    // Another own room with the same room type: hill2.
    t.recv(CONCENTRATE, '', row('Gittan', 'On a hill', 'Here', 'kkkkkkk'), '', PROMPT);
    expect(t.texts()).toContain('KEYS Stored $hill2 (On a hill, Here): kkkkkkk Rename: rkey hill2 <new>');

    // A target, one hit: the pick list (a creature is not your room).
    t.input("cast n 'locate life' troll");
    t.recv(CONCENTRATE, '', TROLL, '', PROMPT);
    expect(t.texts().some((x) => x.includes("key: '"))).toBe(false);
    expect(t.texts()).toContain('KEYS 1 creature found: pick a key in the list.');
    expect(t.panes.pick!.content.title).toBe('Pick a key');
    expect(t.panes.pick!.content.linkAt(1, 5)!.hint).toBe('Store as $troll:\nA troll - Inside, Far away\nkey abcdefghi');
    t.clickPick(1);
    expect(t.lastText()).toBe('KEYS Stored $troll (Inside, Far away): abcdefghi Rename: rkey troll <new>');
    expect(t.panes.pick).toBeNull();

    // Several hits: the list; Alt+Enter stores the selected one; a stored
    // key is marked and keeps its name.
    t.recv(CONCENTRATE, '', TROLL, WARG, '', PROMPT);
    expect(t.pickRows()![1]).toMatch(/= \$troll$/);
    t.key('Alt+ArrowDown');
    t.key('Alt+Enter');
    expect(t.lastText()).toBe('KEYS Stored $warg (In a forest, Near): qwertyuio Rename: rkey warg <new>');
    t.input('kpick');
    t.clickPick(1);
    expect(t.lastText()).toBe('KEYS Renewed $troll (Inside, Far away): abcdefghi');
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('a block without a blank line ends 2 s after its last row', async () => {
    const t = await setup();
    t.input('locatel home');
    t.recv(GITTAN);
    expect(t.store()?.keys ?? []).toEqual([]);
    t.clock.advance(2100);
    expect(t.store()!.keys).toHaveLength(1);
  });

  it('nkey, rkey/krename, dkey, skey; the safe key moves and is re-elected', async () => {
    const t = await setup();
    t.input('nkey home aaaaaaa');
    t.clock.advance(60_000);
    t.input('nkey cave bbbbbbb');
    t.clock.advance(60_000);
    t.input('nkey lair ccccccc');
    expect(t.store()!.safe).toBe('home');
    t.input('nkey toolongname1 x');
    expect(t.lastText()).toBe('KEYS A key name is 1 to 10 letters, digits or _.');
    t.input('skey');
    expect(t.lastText()).toMatch(/^KEYS The safe key is \$home \(aaaaaaa, 11h 5\dm left\)\.$/);
    t.input('skey cave');
    expect(t.lastText()).toBe('KEYS Safe key: $cave (Ctrl+S teleports, Alt+S quickly).');
    expect(t.rows()[1]).toMatch(/^ ★ \$cave /);
    expect(t.rows()[2]).toMatch(/^ ☆ \$home /);
    // Clicking a star makes that key safe.
    t.click(2, '☆');
    expect(t.store()!.safe).toBe('home');
    t.input('rkey home base');
    expect(t.lastText()).toBe('KEYS Renamed $home to $base.');
    expect(t.store()!.safe).toBe('base');
    t.input('krename base cave');
    expect(t.lastText()).toBe('KEYS There is a key $cave already; dkey cave first.');
    t.input('rkey nope x');
    expect(t.lastText()).toBe('KEYS No key $nope. Type keys to see your keys.');
    // Deleting the safe key re-elects the freshest live key.
    t.input('dkey base');
    expect(t.lastText()).toBe('KEYS Deleted $base. The safe key is now $lair.');
    t.input('dkey cave');
    t.input('dkey lair');
    expect(t.lastText()).toBe('KEYS Deleted $lair. No keys left: no safe key.');
    t.input('tsafe');
    expect(t.lastText()).toBe('KEYS No keys, so no safe key. locatel <name> stores one.');
    expect(t.sent).toEqual([]);
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('casts: teleport/portal/scry/watchr, the safe casts and Ctrl+S / Alt+S', async () => {
    const t = await setup();
    t.input('nkey home uxevjobve');
    t.input('nkey cave abcdefghi');
    t.input('teleport home');
    t.input('portal $cave');
    t.input('scry Home');
    t.input('watchr cave');
    t.input('tsafe');
    t.input('qtsafe');
    t.input('psafe');
    expect(t.key('Ctrl+S')).toBe(true);
    expect(t.key('Alt+S')).toBe(true);
    expect(t.sent).toEqual([
      "cast n 'teleport' uxevjobve",
      "cast n 'portal' abcdefghi",
      "cast n 'scry' uxevjobve",
      "cast n 'watch room' abcdefghi cave",
      "cast n 'teleport' uxevjobve",
      "cast q 'teleport' uxevjobve",
      "cast n 'portal' uxevjobve",
      "cast n 'teleport' uxevjobve",
      "cast q 'teleport' uxevjobve",
    ]);
    expect(t.texts()).toContain('KEYS Teleporting to $home (uxevjobve)');
    expect(t.texts()).toContain('KEYS Teleporting quickly to the safe key $home (uxevjobve)');
    // An unknown name never casts.
    t.input('teleport nowhere');
    expect(t.sent).toHaveLength(9);
    expect(t.lastText()).toBe('KEYS No key $nowhere. Type keys to see your keys.');
  });

  it('pane letters cast, x deletes on a second click, hints name the command', async () => {
    const t = await setup();
    t.input('nkey home uxevjobve');
    const r = t.rows()[1]!;
    expect(r).toBe(' ★ $home uxevjobve            12h t p s w x');
    expect(t.linkAt(1, 't')!.hint).toBe("Teleport to $home:\ncast n 'teleport' uxevjobve");
    expect(t.linkAt(1, 'w')!.hint).toBe("Watch room $home:\ncast n 'watch room' uxevjobve home");
    t.click(1, 'p');
    expect(t.sent).toEqual(["cast n 'portal' uxevjobve"]);
    t.click(1, 'x');
    expect(t.rows()[1]).toBe(' ★ $home uxevjobve            12h delete? x');
    t.clock.advance(5000);
    expect(t.rows()[1]).toBe(r);
    t.click(1, 'x');
    t.click(1, 'x');
    expect(t.lastText()).toBe('KEYS Deleted $home. No keys left: no safe key.');
    expect(t.rows()[2]).toBe(' No keys yet.');
  });

  it('columns drop on a narrow pane', async () => {
    const t = await setup();
    t.input('locatel home');
    locateBlock(t, GITTAN);
    t.resize(60);
    expect(t.rows()[1]).toBe(' ★ $home On a hill uxevjobve                  12h t p s w x');
    t.resize(31);
    expect(t.rows()[1]).toBe(' ★ $home On a h… 12h t p s w x');
    t.resize(24);
    expect(t.rows()[1]).toBe(' ★ $home  12h t p s w x');
    t.resize(16);
    expect(t.rows()[1]).toBe(' ★ $home  12h t');
    expect(t.rows()[0]).toBe(' Gittan ?');
  });

  it('keys expire: pruned each minute, announced once, the safe key re-elected; time left turns orange', async () => {
    const t = await setup();
    t.input('nkey home aaaaaaa');
    t.clock.advance(2 * HOUR);
    t.input('nkey cave bbbbbbb');
    t.clock.advance(HOUR);
    t.input('nkey lair ccccccc');
    expect(t.rows()[2]).toMatch(/^ ★ \$home .* 9h t p s w x$/);
    t.clock.advance(8 * HOUR + 30 * 60_000);
    expect(t.rows()[2]).toMatch(/ 30m t p s w x$/);
    const span = t.panes.keys.content.lines[2]!;
    expect('spans' in span && span.spans.find((s) => s.text === '30m')!.fg).toBeDefined();
    t.clock.advance(31 * 60_000);
    expect(t.uiText().filter((x) => x.startsWith('KEYS:'))).toEqual(['KEYS: Key $home expired. The safe key is now $lair.']);
    expect(t.store()!.safe).toBe('lair');
    t.clock.advance(5 * 60_000);
    expect(t.uiText().filter((x) => x.startsWith('KEYS:'))).toHaveLength(1);
    // On use: cave has expired by now (11 h + …).
    t.clock.advance(2 * HOUR);
    expect(t.uiText().at(-1)).toBe('KEYS: Key $cave expired.');
    t.clock.advance(HOUR);
    expect(t.uiText().at(-1)).toBe('KEYS: Key $lair expired. No keys left: no safe key.');
  });

  it('an expired key is refused on use, never a substitute', async () => {
    const t = await setup();
    t.input('nkey home aaaaaaa');
    t.clock.advance(HOUR);
    t.input('nkey cave bbbbbbb');
    // The minute timer has not run yet when the key is used.
    t.clock.advance(12 * HOUR + 30_000 - t.clock.now());
    t.input('teleport home');
    expect(t.sent).toEqual([]);
    expect(t.lastText()).toBe('KEYS Key $home has expired. locatel home stores a new one.');
    t.input('tsafe');
    expect(t.sent).toEqual(["cast n 'teleport' bbbbbbb"]);
  });

  it('keys are per character, kept over a reload, pruned on load', async () => {
    const t = await setup();
    t.input('nkey home aaaaaaa');
    t.gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Orc' });
    t.clock.advance(1);
    expect(t.rows()[0]).toMatch(/^ Rasta +0 keys  \?$/);
    t.input('teleport home');
    expect(t.sent).toEqual([]);
    t.input('nkey home zzzzzzz');
    t.input('teleport home');
    expect(t.sent).toEqual(["cast n 'teleport' zzzzzzz"]);
    t.gmcp('Char.Name', { name: 'gittan', fullname: 'Gittan the Tester' });
    t.clock.advance(1);
    expect(t.rows()[0]).toMatch(/^ Gittan +1 key  \?$/);
    t.input('teleport home');
    expect(t.sent.at(-1)).toBe("cast n 'teleport' aaaaaaa");
    // A reload keeps them.
    await t.host.reload('keymanager');
    t.resize(44);
    t.clock.advance(1);
    expect(t.rows()[1]).toMatch(/^ ★ \$home /);
    // Expired while away: pruned on load.
    t.clock.advance(13 * HOUR);
    await t.host.reload('keymanager');
    t.clock.advance(1);
    expect(t.uiText().at(-1)).toBe('KEYS: Key $home expired. No keys left: no safe key.');
    expect(t.store()!.safe).toBeUndefined();
    expect(Object.keys(t.store()!.keys)).toEqual([]);
  });

  it('$name in a typed command becomes the key; anything else passes through untouched', async () => {
    const t = await setup();
    t.input('nkey home uxevjobve');
    t.input("cast n 'teleport' $home");
    t.input('say I paid $5 for $Home and $nothing');
    t.input('say no keys here');
    t.input('say $nothing');
    expect(t.sent).toEqual([
      "cast n 'teleport' uxevjobve",
      'say I paid $5 for uxevjobve and $nothing',
      'say no keys here',
      'say $nothing',
    ]);
    // A profile alias still applies after the substitution, and a profile
    // variable wins over a key of the same name (it is substituted first).
    t.engine.loadProfile('#alias {tp} {cast n \'teleport\' %1}\n#variable {home} {fromprofile}');
    t.sent.length = 0;
    t.input('tp $cave');
    t.input('nkey cave abcdefghi');
    t.input('tp $cave');
    t.input('say $home');
    expect(t.sent).toEqual(["cast n 'teleport' $cave", "cast n 'teleport' abcdefghi", 'say fromprofile']);
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('keys toggles the pane; keys help prints the help; keys list', async () => {
    const t = await setup();
    t.input('keys');
    expect(t.panes.keys.view.on).toBe(false);
    t.input('keys');
    expect(t.panes.keys.view.on).toBe(true);
    t.input('nkey home uxevjobve');
    t.input('keys list');
    expect(t.texts().slice(-2)).toEqual(["KEYS Gittan's keys:", '  ★ $home                          uxevjobve     12h 0m left']);
    t.input('keys help');
    await t.settle();
    expect(t.printed.join('\n')).toMatch(/keymanager/);
    expect(t.printed.join('\n')).toMatch(/safe key/);
    // The ? in the header too.
    t.printed.length = 0;
    t.click(0, '?');
    await t.settle();
    expect(t.printed.join('\n')).toMatch(/safe key/);
  });
});
