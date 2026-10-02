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
  focused: Array<[number, boolean]> = [];
  focusField(id: number, select: boolean): void {
    this.focused.push([id, select]);
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
    /** The last UI message of the script (`KEYS: …`). */
    lastUi: () => t.uiText().filter((x) => x.startsWith('KEYS:')).at(-1) ?? '',
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
    clickPick: (r: number, col = 5) => {
      const p = t.panes.pick!;
      const link = p.content.linkAt(r, col);
      if (!link) throw new Error(`no pick link at row ${r}`);
      p.events.onLink(link.id);
      return link;
    },
    key: (name: string) => engine.runMacro(name),
    /** The pick window's name field: its id, value and the focus asked for. */
    field: () => t.panes.pick!.content.fields[0]!,
    /** Types `text` into the name field (as the input reports it). */
    typeName: (text: string) => t.panes.pick!.events.onField!(t.field().id, { type: 'change', text }),
    /** Enter in the name field. */
    enter: () => t.panes.pick!.events.onField!(t.field().id, { type: 'submit', text: t.field().value }),
    /** Esc in the name field. */
    esc: () => t.panes.pick!.events.onField!(t.field().id, { type: 'cancel' }),
    /** Up, Down … in the name field. */
    fieldKey: (key: string) => t.panes.pick!.events.onField!(t.field().id, { type: 'key', key }),
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
    expect(s.header.aliases.map((a) => a.name)).toEqual(['keys', 'locatel', 'kpick', 'nkey', 'teleport', 'tsafe']);
    expect(s.header.keys.map((k) => k.key)).toEqual(['Ctrl+S', 'Alt+S']);
    expect(s.settings).toEqual({ hours: 12 });
    expect(s.header.help.join('\n')).toMatch(/safe key/);
  });

  it('shows Not logged in until the character is known, and refuses to store', async () => {
    const t = await setup({ login: null });
    expect(t.panes.keys.spec).toEqual({ id: 'keymanager/keys', place: { dock: 'right', rows: 8, cols: 44 } });
    expect(t.panes.keys.content.title).toBe('Port keys');
    expect(t.panes.keys.content.anchor).toBe('top');
    expect(t.rows()).toEqual([' Not logged in', '', ' Keys are kept per character.', ' Log in to see yours.']);
    t.input('locatel home');
    expect(t.sent).toEqual([]);
    expect(t.lastText()).toBe('KEYS Not logged in: keys are kept per character. Log in first.');
    t.input('cast $home');
    expect(t.sent).toEqual(['cast $home']);
    t.gmcp('Char.Name', { name: 'Gittan', fullname: 'Gittan the Tester' });
    t.clock.advance(1);
    expect(t.rows()).toEqual([' 0 keys                                   ?', '', ' No keys yet.', " locatel <name> stores your room's key."]);
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
    expect(shown).toEqual([CONCENTRATE, '', '', PROMPT]);
    expect(t.lastUi()).toBe('KEYS: Stored $home (On a hill, Very near): uxevjobve. It is your safe key (Ctrl+S).');
    expect(t.store()).toMatchObject({ safe: 'home', keys: [{ name: 'home', key: 'uxevjobve', room: 'On a hill', dist: 'Very near' }] });
    const r = t.rows();
    expect(r[0]).toMatch(/^ 1 key +\?$/);
    expect(r[0]).toHaveLength(43);
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
    expect(t.lastUi()).toBe('KEYS: Replaced $home (Inside, Here): zzzzzzzz.');
    expect(t.store()!.keys).toHaveLength(1);
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('locatel <target> <name>: the pick window, its name field filled in; Up/Down, Enter store and close', async () => {
    const t = await setup();
    locatel(t, 'troll cave', TROLL, WARG);
    expect(t.sent).toEqual(["cast n 'locate life' troll"]);
    // The rows are gagged.
    expect(t.texts().some((x) => x.includes("key: '"))).toBe(false);
    const p = t.panes.pick!;
    expect(p.spec.temporary).toBeDefined();
    expect(p.content.title).toBe('Pick a key');
    expect(p.spec.temporary).toMatchObject({ at: 'top' });
    expect(t.field()).toMatchObject({ row: 0, col: 8, len: 12, value: 'cave', maxLength: 10 });
    // Focused with the name selected, so typing replaces it.
    expect(p.view.focused).toEqual([[t.field().id, true]]);
    expect(t.pickRows()).toEqual([
      ' Name: $',
      ' Enter stores hit 1 as $cave.',
      '   #  Mob            Room type    Distance  Key',
      ' ▶ 1  A troll        Inside       Far away  abcdefghi',
      '   2  A hungry warg  In a forest  Near      qwertyuio',
      '',
      ' ↑↓ select · Enter store · Esc close   [ OK ]',
    ]);
    // The snapshot (runs) shows the name as text.
    const snap = p.content.snapshot().lines[0]!;
    expect('spans' in snap && snap.spans.map((x) => x.text).join('')).toBe(' Name: $cave        ');
    // Down moves the selection; the locatel name stays.
    t.fieldKey('ArrowDown');
    expect(t.pickRows()![4]).toMatch(/^ ▶ 2 /);
    expect(t.field().value).toBe('cave');
    t.fieldKey('ArrowDown');
    expect(t.pickRows()![4]).toMatch(/^ ▶ 2 /);
    t.fieldKey('ArrowUp');
    expect(t.pickRows()![3]).toMatch(/^ ▶ 1 /);
    t.fieldKey('PageDown');
    t.enter();
    expect(t.panes.pick).toBeNull();
    expect(t.lastUi()).toBe('KEYS: Stored $cave (In a forest, Near): qwertyuio. It is your safe key (Ctrl+S).');

    // kpick opens it again; a stored hit is marked; a name that exists says
    // it will be replaced; a bad name is refused inline.
    t.input('kpick');
    expect(t.pickRows()![4]).toBe('   2  A hungry warg  In a forest  Near      qwertyuio  = $cave');
    expect(t.pickRows()![1]).toBe(' Enter replaces $cave (qwertyuio).');
    t.typeName('bad name');
    expect(t.pickRows()![1]).toBe(' A name is 1 to 10 letters, digits or _.');
    const focusedBefore = t.panes.pick!.view.focused.length;
    t.enter();
    expect(t.panes.pick).not.toBeNull();
    expect(t.panes.pick!.view.focused.length).toBe(focusedBefore + 1);
    t.typeName('');
    expect(t.pickRows()![1]).toBe(' Type a name for the key.');
    t.typeName('$lair');
    expect(t.pickRows()![1]).toBe(' Enter stores hit 1 as $lair.');
    // Clicking a row selects it (and gives the field the keyboard back);
    // a second click on it stores.
    const link = t.clickPick(4);
    expect(link.hint).toBe('A hungry warg - In a forest, Near\nkey qwertyuio\n(stored as $cave)\nClick: select · double-click: store');
    expect(t.pickRows()![4]).toMatch(/^ ▶ 2 /);
    expect(t.field().value).toBe('$lair');
    t.clickPick(4);
    expect(t.panes.pick).toBeNull();
    expect(t.lastUi()).toBe('KEYS: Stored $lair (In a forest, Near): qwertyuio. Same key as $cave.');
    // OK stores; Esc closes without storing; so does the close cross.
    t.input('kpick');
    t.typeName('ok1');
    const foot = t.pickRows()![6]!;
    t.clickPick(6, foot.indexOf('[ OK ]') + 1);
    expect(t.lastUi()).toBe('KEYS: Stored $ok1 (Inside, Far away): abcdefghi.');
    t.input('kpick');
    t.esc();
    expect(t.panes.pick).toBeNull();
    t.input('kpick');
    t.panes.pick!.events.onClose!();
    expect(t.panes.pick).toBeNull();
    expect(t.store()!.keys).toHaveLength(3);
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

  it('a locate cast any other way is caught too: the window suggests a name from the room or the creature', async () => {
    const t = await setup();
    // Own room (one row, your own character), cast by hand.
    t.input("cast n 'locate life'");
    t.recv(CONCENTRATE, '', GITTAN, '', PROMPT);
    expect(t.texts()).toEqual([CONCENTRATE, '', '', PROMPT]);
    expect(t.field().value).toBe('hill');
    t.enter();
    expect(t.lastUi()).toBe('KEYS: Stored $hill (On a hill, Very near): uxevjobve. It is your safe key (Ctrl+S).');
    // The same room again: its name in the library; Enter renews it.
    t.clock.advance(HOUR);
    t.recv(CONCENTRATE, '', GITTAN, '', PROMPT);
    expect(t.field().value).toBe('hill');
    expect(t.pickRows()![1]).toBe(' Enter renews $hill.');
    t.enter();
    expect(t.lastUi()).toBe('KEYS: Renewed $hill (On a hill, Very near): uxevjobve.');
    // Another own room of the same type: hill2.
    t.recv(CONCENTRATE, '', row('Gittan', 'On a hill', 'Here', 'kkkkkkk'), '', PROMPT);
    expect(t.field().value).toBe('hill2');
    t.esc();
    // A target: the creature's last word; the suggestion follows the selection until the name is edited.
    t.input("cast n 'locate life' troll");
    t.recv(CONCENTRATE, '', TROLL, WARG, '', PROMPT);
    expect(t.texts().some((x) => x.includes("key: '"))).toBe(false);
    expect(t.field().value).toBe('troll');
    t.fieldKey('ArrowDown');
    expect(t.field().value).toBe('warg');
    t.typeName('den');
    t.fieldKey('ArrowUp');
    expect(t.field().value).toBe('den');
    t.enter();
    expect(t.lastUi()).toBe('KEYS: Stored $den (Inside, Far away): abcdefghi.');
    // A new locate replaces an open window.
    t.recv(CONCENTRATE, '', WARG, '', PROMPT);
    expect(t.panes.opened.filter((o) => o.spec.id === 'keymanager/~pick' && !o.view.closed)).toHaveLength(1);
    expect(t.field().value).toBe('warg');
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

  it('nkey, the star, x; the safe key moves and is re-elected; all in the UI messages', async () => {
    const t = await setup();
    t.input('nkey home aaaaaaa');
    expect(t.lastUi()).toBe('KEYS: Stored $home: aaaaaaa. It is your safe key (Ctrl+S).');
    t.clock.advance(60_000);
    t.input('nkey cave bbbbbbb');
    t.clock.advance(60_000);
    t.input('nkey lair ccccccc');
    expect(t.store()!.safe).toBe('home');
    t.input('nkey toolongname1 x');
    expect(t.lastText()).toBe('KEYS A key name is 1 to 10 letters, digits or _.');
    // The star sets the safe key (skey is gone: it goes to the game).
    t.input('skey cave');
    expect(t.sent).toEqual(['skey cave']);
    t.sent.length = 0;
    t.click(1, '☆');
    expect(t.lastUi()).toBe('KEYS: Safe key: $cave (Ctrl+S teleports, Alt+S quickly).');
    expect(t.rows()[1]).toMatch(/^ ★ \$cave /);
    expect(t.rows()[2]).toMatch(/^ ☆ \$home /);
    // Clicking a star makes that key safe.
    t.click(2, '☆');
    expect(t.store()!.safe).toBe('home');
    expect(t.lastUi()).toBe('KEYS: Safe key: $home (Ctrl+S teleports, Alt+S quickly).');
    // dkey, rkey and krename are gone (the pane does it): they go to the game.
    for (const c of ['dkey home', 'rkey home x', 'krename home x']) t.input(c);
    // keys list shows the safe key.
    t.input('keys list');
    expect(t.texts().filter((x) => x.includes('★'))).toEqual([expect.stringMatching(/★ \$home/)]);
    expect(t.sent).toEqual(['dkey home', 'rkey home x', 'krename home x']);
    t.sent.length = 0;
    // Deleting the safe key (x twice) re-elects the freshest live key.
    t.click(2, 'x');
    t.click(2, 'x');
    expect(t.lastUi()).toBe('KEYS: Deleted $home. The safe key is now $lair.');
    t.click(1, 'x');
    t.click(1, 'x');
    t.click(1, 'x');
    t.click(1, 'x');
    expect(t.lastUi()).toBe('KEYS: Deleted $lair. No keys left: no safe key.');
    t.input('tsafe');
    expect(t.lastText()).toBe('KEYS No keys, so no safe key. locatel <name> stores one.');
    expect(t.sent).toEqual([]);
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('a click on a name renames it inline: Enter checks and renames, the error inline; Esc cancels', async () => {
    const t = await setup();
    t.input('nkey home aaaaaaa');
    t.input('nkey cave bbbbbbb');
    const c = () => t.panes.keys.content;
    const nameLink = t.panes.keys.content.linkAt(2, 4)!;
    expect(nameLink.hint.split('\n')[0]).toBe('Click to rename');
    // home is row 3 (cave, home): click its name.
    t.panes.keys.events.onLink(t.panes.keys.content.linkAt(2, 4)!.id);
    const f = () => c().fields[0]!;
    expect(f()).toMatchObject({ row: 2, col: 4, len: 4, value: 'home', maxLength: 10 });
    expect(t.panes.keys.view.focused.at(-1)).toEqual([f().id, true]);
    expect(t.rows()[0]).toBe(' Enter renames $home, Esc cancels');
    const ev = (e: Parameters<NonNullable<typeof t.panes.keys.events.onField>>[1]) => t.panes.keys.events.onField!(f().id, e);
    // A redraw (the minute tick) keeps the field and what was typed.
    ev({ type: 'change', text: 'ca' });
    const id = f().id;
    t.clock.advance(60_000);
    expect(f().id).toBe(id);
    expect(f().value).toBe('ca');
    // A taken name: the error inline, the field kept and focused.
    ev({ type: 'change', text: 'cave' });
    ev({ type: 'submit', text: 'cave' });
    expect(t.rows()[0]).toBe(' There is a key $cave already.');
    expect(f().id).toBe(id);
    expect(t.panes.keys.view.focused.at(-1)).toEqual([id, false]);
    ev({ type: 'submit', text: 'bad name' });
    expect(t.rows()[0]).toBe(' A name is 1 to 10 letters, digits or _.');
    ev({ type: 'change', text: 'base' });
    expect(t.rows()[0]).toBe(' Enter renames $home, Esc cancels');
    ev({ type: 'submit', text: '$base' });
    expect(c().fields).toEqual([]);
    expect(t.lastUi()).toBe('KEYS: Renamed $home to $base.');
    expect(t.store()!.safe).toBe('base');
    expect(t.rows()[1]).toMatch(/^ ★ \$base /);
    expect(t.rows()[0]).toMatch(/^ 2 keys +\?$/);
    // Esc cancels.
    t.panes.keys.events.onLink(t.panes.keys.content.linkAt(2, 4)!.id);
    ev({ type: 'change', text: 'zzz' });
    ev({ type: 'cancel' });
    expect(c().fields).toEqual([]);
    expect(t.rows()[2]).toMatch(/^ ☆ \$cave /);
    // A click elsewhere (blur) cancels too, and the row is whole again.
    t.panes.keys.events.onLink(t.panes.keys.content.linkAt(2, 4)!.id);
    ev({ type: 'change', text: 'zzz' });
    ev({ type: 'blur', text: 'zzz' });
    expect(c().fields).toEqual([]);
    expect(t.rows()[2]).toMatch(/^ ☆ \$cave .* t p s w x$/);
    expect(t.rows()[0]).toMatch(/^ 2 keys +\?$/);
    // Any other action on the row works while a rename is open: it is cancelled first.
    t.panes.keys.events.onLink(t.panes.keys.content.linkAt(2, 4)!.id);
    expect(c().fields).toHaveLength(1);
    t.click(2, 'x');
    expect(c().fields).toEqual([]);
    expect(t.rows()[2]).toMatch(/delete\? x$/);
    t.click(2, 'x');
    expect(t.lastUi()).toBe('KEYS: Deleted $cave.');
    t.panes.keys.events.onLink(t.panes.keys.content.linkAt(1, 4)!.id);
    t.click(1, 't');
    expect(c().fields).toEqual([]);
    expect(t.sent.at(-1)).toBe("cast n 'teleport' aaaaaaa");
    expect(t.lib.get('keymanager')!.lastError).toBeNull();
  });

  it('a settings change redraws at once (sysSettingChanged)', async () => {
    const t = await setup();
    t.input('nkey home aaaaaaa');
    expect(t.rows()[1]).toMatch(/ 12h t p s w x$/);
    t.input('#script set keymanager hours 10');
    await t.settle();
    expect(t.rows()[1]).toMatch(/ 10h t p s w x$/);
    t.input('#script set keymanager hours 0.5');
    await t.settle();
    expect(t.rows()[1]).toMatch(/ 30m t p s w x$/);
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
    expect(t.linkAt(1, 'x')!.hint).toBe('Delete $home (click twice)');
    t.click(1, 'x');
    t.click(1, 'x');
    expect(t.lastUi()).toBe('KEYS: Deleted $home. No keys left: no safe key.');
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
    expect(t.rows()[0]).toBe(' 1 key        ?');
    // No hint on the time left.
    const l = t.panes.keys.content;
    expect(l.linkAt(1, t.rows()[1]!.indexOf('12h'))).toBeNull();
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
    const n0 = t.uiText().length;
    t.clock.advance(31 * 60_000);
    expect(t.uiText().slice(n0)).toEqual(['KEYS: Key $home expired. The safe key is now $lair.']);
    expect(t.store()!.safe).toBe('lair');
    t.clock.advance(5 * 60_000);
    expect(t.uiText().slice(n0)).toHaveLength(1);
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
    expect(t.rows()[0]).toMatch(/^ 0 keys +\?$/);
    t.input('teleport home');
    expect(t.sent).toEqual([]);
    t.input('nkey home zzzzzzz');
    t.input('teleport home');
    expect(t.sent).toEqual(["cast n 'teleport' zzzzzzz"]);
    t.gmcp('Char.Name', { name: 'gittan', fullname: 'Gittan the Tester' });
    t.clock.advance(1);
    expect(t.rows()[0]).toMatch(/^ 1 key +\?$/);
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
