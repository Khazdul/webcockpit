// @vitest-environment happy-dom
import { IDBFactory } from 'fake-indexeddb';
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { ConnState } from '../../src/core/types';
import { openWebcockpitDb } from '../../src/core/db';
import { CommArchive } from '../../src/gmcp/comm-archive';
import { AnchoredList, type ListMetrics } from '../../src/panes/anchored-list';
import { CommPane } from '../../src/panes/comm';
import { createPaneContext, lazyDb } from '../../src/panes/context';
import { UI_STORAGE_KEY, UiPane, uiPlain } from '../../src/panes/ui';
import { SettingsStore } from '../../src/settings';

const CELL_H = 16;

/** Monospace metrics: each item wraps at `cols()` characters, one row = 16 px. */
function metrics(cols: () => number, paneRows: () => number): ListMetrics {
  return {
    itemHeight: (el) => Math.max(1, Math.ceil((el.textContent ?? '').length / cols())) * CELL_H,
    listHeight: (list) => {
      const pane = list.parentElement!;
      let rows = paneRows();
      const header = pane.querySelector<HTMLElement>('.wc-comm-header');
      if (header && !header.hidden) rows--;
      if (!pane.querySelector<HTMLElement>('.wc-alist-more')!.hidden) rows--;
      return rows * CELL_H;
    },
  };
}

function setup(opts: { state?: ConnState; cols?: number; rows?: number; db?: boolean; storage?: Storage | null; now?: () => number } = {}) {
  const bus = new Bus();
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  let state: ConnState = opts.state ?? 'playing';
  const frames: (() => void)[] = [];
  const factory = opts.db ? new IDBFactory() : null;
  const ctx = createPaneContext({
    doc: document,
    bus,
    settings,
    requestFrame: (cb) => frames.push(cb),
    connState: () => state,
    openDb: lazyDb(factory),
    sessionStorage: opts.storage ?? null,
    cells: { get: () => ({ w: 8, h: CELL_H }), subscribe: () => () => {} },
    ...(opts.now ? { now: opts.now } : {}),
  });
  const size = { cols: opts.cols ?? 40, rows: opts.rows ?? 6 };
  const flush = (): void => {
    for (let i = 0; i < 5 && frames.length; i++) for (const f of frames.splice(0)) f();
  };
  const setState = (s: ConnState, replay?: true): void => {
    const prev = state;
    state = s;
    bus.emit('conn.state', { state: s, prev, ...(replay ? { replay } : {}) });
  };
  return { bus, settings, ctx, flush, size, setState, factory, frames };
}

function place(p: { place: CommPane['place'] }, cols: number, rows: number): void {
  p.place({ rect: { x: 0, y: 0, w: cols, h: rows }, content: { x: 0, y: 0, w: cols, h: rows }, framed: false }, { w: 8, h: CELL_H });
}

const text = (channel: string, talker: string, t: string, extra: Record<string, unknown> = {}) => ({
  pkg: 'Comm.Channel.Text',
  data: { channel, talker, text: t, ...extra },
});

const flushAsync = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => {
  document.body.replaceChildren();
});

describe('AnchoredList', () => {
  function list(count: number, rows: number, height: (i: number) => number = () => 1) {
    const heights = new Map<HTMLElement, number>();
    const doc = document;
    let changes = 0;
    const m: ListMetrics = {
      itemHeight: (el) => heights.get(el)! * CELL_H,
      listHeight: (l) => (rows - (l.parentElement!.querySelector<HTMLElement>('.wc-alist-more')!.hidden ? 0 : 1)) * CELL_H,
    };
    const al = new AnchoredList(doc, () => changes++, { metrics: m, cellHeight: () => CELL_H });
    const box = doc.createElement('div');
    box.append(al.el, al.more);
    let n = count;
    const render = () =>
      al.render(n, rows, (i) => {
        const el = doc.createElement('div');
        el.textContent = `m${i}`;
        heights.set(el, height(i));
        return el;
      }, (k) => `↓ ${k}`);
    render();
    return {
      al,
      render,
      shown: () => [...al.el.querySelectorAll('.wc-alist-stack > div')].map((e) => e.textContent),
      add: (k: number) => {
        n += k;
        al.added(k);
      },
      changes: () => changes,
    };
  }

  it('shows the newest items at live and cannot scroll when everything fits', () => {
    const l = list(3, 5);
    expect(l.shown()).toEqual(['m0', 'm1', 'm2']);
    expect(l.al.up()).toBe(false);
    expect(l.al.more.hidden).toBe(true);
  });

  it('scrolls by item and stops with the oldest at the top', () => {
    const l = list(10, 5);
    // 5 rows; scrolled the list has 4 rows. Max offset: items 0..3 fill 4 rows → offset 6.
    let steps = 0;
    while (l.al.up()) {
      l.render();
      steps++;
    }
    expect(steps).toBe(6);
    expect(l.al.offset).toBe(6);
    expect(l.shown().slice(-4)).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(l.al.more.hidden).toBe(false);
    expect(l.al.more.textContent).toBe('↓ 6');
    // New items keep the view.
    l.add(2);
    l.render();
    expect(l.al.offset).toBe(8);
    expect(l.shown().slice(-1)).toEqual(['m3']);
    l.al.toLive();
    l.render();
    expect(l.shown().slice(-1)).toEqual(['m11']);
    expect(l.al.more.hidden).toBe(true);
  });

  it('counts wrapped rows: a tall item fills the view sooner', () => {
    // Item 0 is 4 rows high: items 0 and 1 fill the 4-row scrolled list at offset 8.
    const l = list(10, 5, (i) => (i === 0 ? 4 : 1));
    while (l.al.up()) l.render();
    expect(l.al.offset).toBe(9);
    expect(l.shown()).toEqual(['m0']);
  });

  it('clamps back when the items above no longer fill the view', () => {
    const l = list(10, 5);
    for (let i = 0; i < 6; i++) {
      l.al.up();
      l.render();
    }
    expect(l.al.offset).toBe(6);
    // Force a larger offset (e.g. filters removed items): render steps back.
    (l.al as unknown as { _offset: number })._offset = 9;
    l.render();
    expect(l.al.offset).toBe(6);
  });

  it('wheel: one step per notch, small deltas accumulate, mouse down on the indicator returns', () => {
    const l = list(20, 5);
    l.al.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    expect(l.al.offset).toBe(1);
    l.render();
    for (let i = 0; i < 3; i++) l.al.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -15 }));
    expect(l.al.offset).toBe(2);
    l.render();
    l.al.el.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1 }));
    expect(l.al.offset).toBe(1);
    l.render();
    l.al.more.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    expect(l.al.offset).toBe(0);
  });
});

describe('CommPane', () => {
  function comm(opts: Parameters<typeof setup>[0] = {}) {
    const env = setup(opts);
    const pane = new CommPane(env.ctx, { metrics: metrics(() => env.size.cols, () => env.size.rows) });
    document.body.append(pane.el);
    place(pane, env.size.cols, env.size.rows);
    env.flush();
    const header = () => [...pane.content.querySelectorAll<HTMLElement>('.wc-comm-cell')];
    const rows = () => [...pane.content.querySelectorAll<HTMLElement>('.wc-comm-msg')].map((e) => e.textContent);
    return { ...env, pane, header, rows };
  }

  it('renders the header and formatted messages, and blanks while inactive', () => {
    const c = comm({ cols: 80 });
    expect(c.header().map((e) => e.textContent)).toEqual([
      'Narrates', 'Tells', 'Says', 'Yells', 'Prayers', 'Emotes', 'Whispers', 'Questions', 'Songs', 'Socials',
    ]);
    c.bus.emit('gmcp', text('tells', 'Gibur', "Gibur tells you 'np :)'"));
    c.bus.emit('gmcp', text('whispers', 'you', 'hej', { destination: 'Dori' }));
    c.bus.emit('gmcp', text('socials', 'Vit the innkeeper', 'Vit the innkeeper bows before you.'));
    c.flush();
    expect(c.rows()).toEqual(["Gibur tells you 'np :)'", "You whisper to Dori 'hej'", 'Vit bows before you.']);
    const tell = c.pane.content.querySelector('.wc-comm-msg')!.children;
    expect((tell[0] as HTMLElement).style.color).toBe('#c2a878');
    expect((tell[1] as HTMLElement).style.color).toBe('#008000');
    expect((tell[2] as HTMLElement).style.color).toBe('#afd2d2');
    expect((tell[3] as HTMLElement).style.color).toBe('#91bec1');
    c.setState('disconnected');
    c.flush();
    expect(c.pane.content.textContent).toBe('');
    // History survives the disconnect.
    c.setState('playing');
    c.flush();
    expect(c.rows()).toHaveLength(3);
  });

  it('follows Comm.Channel.List and keeps ANSI in the message', () => {
    const c = comm({ cols: 80 });
    c.bus.emit('gmcp', {
      pkg: 'Comm.Channel.List',
      data: [
        { name: 'tells', caption: 'Tells', command: 'tell' },
        { name: 'tales', caption: 'Tales', command: 'narrate' },
        { name: 'auction', caption: '', command: 'auction' },
      ],
    });
    c.bus.emit('gmcp', text('tells', 'Takhr the warden', "Takhr the warden tells you 'costs \x1b[32m21\x1b[0m gold'"));
    c.flush();
    expect(c.header().map((e) => e.textContent)).toEqual(['Narrates', 'Tells', 'Auction']);
    expect(c.header()[2]!.style.color).toBe('#78909c');
    expect(c.rows()).toEqual(["Takhr tells you 'costs 21 gold'"]);
    expect(c.pane.content.querySelector('.wc-f2')!.textContent).toBe('21');
  });

  it('left mouse down toggles, right solos and restores; nothing goes to the game', () => {
    const c = comm({ cols: 80 });
    const sent: string[] = [];
    c.bus.on('cmd.sent', (x) => sent.push(x.text));
    c.bus.emit('gmcp', text('tells', 'Gibur', "Gibur tells you 'a'"));
    c.bus.emit('gmcp', text('says', 'Dori', "Dori says 'b'"));
    c.flush();
    const down = (name: string, button: number) =>
      c.header().find((e) => e.dataset.channel === name)!.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true }));
    down('tells', 0);
    expect(c.settings.get().comm.filters).toEqual({ tells: false });
    c.flush();
    expect(c.rows()).toEqual(["Dori says 'b'"]);
    expect(c.header().find((e) => e.dataset.channel === 'tells')!.style.color).toBe('#3a3a3a');
    down('tells', 0);
    expect(c.settings.get().comm.filters).toEqual({});
    down('says', 2);
    expect(c.pane.soloed).toBe('says');
    expect(Object.keys(c.settings.get().comm.filters).sort()).toEqual(
      ['emotes', 'prayers', 'questions', 'socials', 'songs', 'tales', 'tells', 'whispers', 'yells'],
    );
    c.flush();
    expect(c.rows()).toEqual(["Dori says 'b'"]);
    down('says', 2);
    expect(c.pane.soloed).toBeNull();
    expect(c.settings.get().comm.filters).toEqual({});
    expect(sent).toEqual([]);
  });

  it('an external filter change cancels solo', () => {
    const c = comm({ cols: 80 });
    c.pane.soloToggle('tells');
    expect(c.pane.soloed).toBe('tells');
    // A change elsewhere in the settings keeps it.
    c.settings.update({ group: { showPlayers: false } });
    expect(c.pane.soloed).toBe('tells');
    c.settings.update((d) => void (d.comm.filters.tells = false));
    expect(c.pane.soloed).toBeNull();
  });

  it('hides the header with showHeader off', () => {
    const c = comm();
    c.settings.update({ comm: { showHeader: false } });
    c.flush();
    expect(c.pane.content.querySelector<HTMLElement>('.wc-comm-header')!.hidden).toBe(true);
  });

  it('timestamps only while scrolled back', () => {
    const t0 = new Date(2026, 8, 27, 14, 5).getTime();
    const c = comm({ cols: 40, rows: 4, now: () => t0 });
    for (let i = 0; i < 10; i++) c.bus.emit('gmcp', text('says', 'Dori', `Dori says 'm${i}'`));
    c.flush();
    expect(c.rows().slice(-1)).toEqual(["Dori says 'm9'"]);
    c.pane.content.querySelector('.wc-alist')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
    c.flush();
    expect(c.rows().slice(-1)).toEqual(["14:05 Dori says 'm8'"]);
    expect(c.pane.content.querySelector<HTMLElement>('.wc-alist-more')!.textContent).toBe('↓ 1 newer message');
    // New messages keep the view and count in the indicator.
    c.bus.emit('gmcp', text('says', 'Dori', "Dori says 'm10'"));
    c.flush();
    expect(c.rows().slice(-1)).toEqual(["14:05 Dori says 'm8'"]);
    expect(c.pane.content.querySelector<HTMLElement>('.wc-alist-more')!.textContent).toBe('↓ 2 newer messages');
    // A message on a filtered channel does not move the view.
    c.settings.update((d) => void (d.comm.filters.tells = false));
    c.bus.emit('gmcp', text('tells', 'Gibur', "Gibur tells you 'x'"));
    c.flush();
    expect(c.pane.content.querySelector<HTMLElement>('.wc-alist-more')!.textContent).toBe('↓ 2 newer messages');
    c.pane.content.querySelector('.wc-alist-more')!.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    c.flush();
    expect(c.rows().slice(-1)).toEqual(["Dori says 'm10'"]);
  });

  it('recolours content for a light pane', () => {
    const c = comm({ cols: 80 });
    c.settings.update({ appearance: { bg: '#f4ecd8' }, panes: { comm: { color: 'black' } } });
    c.pane.applyTheme(c.settings.get());
    c.bus.emit('gmcp', text('tells', 'Gibur', "Gibur tells you 'a'"));
    c.flush();
    const talker = c.pane.content.querySelector('.wc-comm-msg')!.children[0] as HTMLElement;
    expect(talker.style.color).not.toBe('#c2a878');
    // The off label does not shift.
    c.pane.toggle('says');
    c.flush();
    expect(c.header().find((e) => e.dataset.channel === 'says')!.style.color).toBe('#3a3a3a');
  });

  it('seeds from the archive on a live Char.Name and appends live messages', async () => {
    const NOW = Date.now();
    const c = comm({ db: true, state: 'login', now: () => NOW });
    const db = await openWebcockpitDb(c.factory!);
    const arch = new CommArchive(db);
    await arch.append({ character: 'Rasta', ts: NOW - 60_000, channel: 'tells', talker: 'Gibur', talkerType: 'player', destination: null, text: "Gibur tells you 'old'" });
    await arch.append({ character: 'Other', ts: NOW - 60_000, channel: 'says', talker: 'X', talkerType: null, destination: null, text: "X says 'no'" });
    c.setState('connecting');
    c.setState('login');
    await c.pane.whenReady();
    c.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    c.setState('playing');
    // Arrives before the load finished: kept and written after it.
    c.bus.emit('gmcp', text('says', 'you', 'new'));
    await flushAsync();
    c.flush();
    expect(c.rows()).toEqual(["Gibur tells you 'old'", "You say 'new'"]);
    await flushAsync();
    const stored = await arch.loadRecent('Rasta');
    expect(stored.map((r) => r.text)).toEqual(["Gibur tells you 'old'", 'new']);
    expect(stored[1]).toMatchObject({ character: 'Rasta', talker: 'you', channel: 'says', destination: null, talkerType: null });
    // Not cleared on disconnect.
    c.setState('disconnected');
    expect(c.pane.messages).toHaveLength(2);
    db.close();
  });

  it('a replay starts empty and never writes to the archive', async () => {
    const NOW = Date.now();
    const c = comm({ db: true, state: 'idle', now: () => NOW });
    const db = await openWebcockpitDb(c.factory!);
    const arch = new CommArchive(db);
    await arch.append({ character: 'Rasta', ts: NOW - 1000, channel: 'tells', talker: 'Gibur', talkerType: null, destination: null, text: "Gibur tells you 'live'" });
    await c.pane.whenReady();
    c.setState('connecting', true);
    c.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    c.setState('playing', true);
    c.bus.emit('gmcp', text('says', 'Dori', "Dori says 'replayed'"));
    await flushAsync();
    c.flush();
    expect(c.rows()).toEqual(["Dori says 'replayed'"]);
    expect((await arch.loadRecent('Rasta')).map((r) => r.text)).toEqual(["Gibur tells you 'live'"]);
    db.close();
  });

  it('prunes the archive on each live Char.Name, not in a replay', async () => {
    const DAY = 24 * 60 * 60 * 1000;
    let now = Date.now();
    const c = comm({ db: true, state: 'idle', now: () => now });
    const db = await openWebcockpitDb(c.factory!);
    const arch = new CommArchive(db);
    const count = async (): Promise<number> => {
      const tx = db.transaction('comm', 'readonly');
      const req = tx.objectStore('comm').count();
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    };
    const old = (ts: number) =>
      arch.append({ character: 'Rasta', ts, channel: 'says', talker: 'D', talkerType: null, destination: null, text: "D says 'x'" });
    await c.pane.whenReady();
    // Days later in the same tab: a message from then is now past the 7 days.
    await old(now);
    now += 8 * DAY;
    await old(now - 1000);
    c.setState('connecting', true);
    c.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    await flushAsync();
    expect(await count()).toBe(2); // a replay leaves the archive alone
    c.setState('connecting');
    c.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    await flushAsync();
    expect(await count()).toBe(1);
    db.close();
  });

  it('keeps at most 1000 messages', () => {
    const c = comm();
    for (let i = 0; i < 1005; i++) c.bus.emit('gmcp', text('says', 'D', `D says '${i}'`));
    expect(c.pane.messages).toHaveLength(1000);
    expect(c.pane.messages[0]!.text).toBe("D says '5'");
  });
});

describe('UiPane', () => {
  function ui(opts: Parameters<typeof setup>[0] = {}) {
    const env = setup({ state: 'idle', ...opts });
    const pane = new UiPane(env.ctx, { metrics: metrics(() => env.size.cols, () => env.size.rows) });
    document.body.append(pane.el);
    place(pane, env.size.cols, env.size.rows);
    env.flush();
    const rows = () => [...pane.content.querySelectorAll<HTMLElement>('.wc-ui-row')];
    return { ...env, pane, rows };
  }

  it('renders prefixes, colours and values, and is never blanked', () => {
    const u = ui();
    u.bus.emit('ui.message', { kind: 'system', parts: [{ value: 'Rasta' }, ' logged in.'] });
    u.bus.emit('ui.message', { kind: 'event', name: 'ACHIEVEMENT', parts: ['Unlocked.'] });
    u.bus.emit('ui.message', { kind: 'state', tag: 'BLIND', parts: [{ value: 'Orc' }, ' blinded.'] });
    u.bus.emit('ui.message', { kind: 'state', tag: 'WHATEVER', parts: ['x.'] });
    u.bus.emit('ui.message', { kind: 'warn', parts: ['Capture is off.'] });
    u.bus.emit('ui.message', { kind: 'error', parts: ['Bad.'] });
    u.flush();
    expect(u.rows().map((r) => r.textContent)).toEqual([
      '● SYSTEM: Rasta logged in.',
      '▶ ACHIEVEMENT: Unlocked.',
      '◆ BLIND: Orc blinded.',
      '◆ WHATEVER: x.',
      '⚠ WARN: Capture is off.',
      '✖ ERROR: Bad.',
    ]);
    const prefix = (i: number) => (u.rows()[i]!.querySelector('.wc-ui-prefix') as HTMLElement).style.color;
    expect([0, 1, 2, 3, 4, 5].map(prefix)).toEqual(['#42a5f5', '#26c6da', '#00cccc', '#26c6da', '#ffb300', '#e53935']);
    expect(u.rows()[0]!.style.color).toBe('#ffffff');
    expect((u.rows()[0]!.querySelector('.wc-ui-value') as HTMLElement).style.color).toBe('#ffee58');
    expect(u.pane.el.hasAttribute('data-active')).toBe(false);
    expect(u.rows()).toHaveLength(6);
  });

  it('keeps the ring in sessionStorage across a reload', () => {
    const store = window.sessionStorage;
    store.clear();
    const u = ui({ storage: store });
    for (let i = 0; i < 1003; i++) u.bus.emit('ui.message', { kind: 'system', parts: [`Line ${i}.`] });
    u.pane.flushStorage();
    expect(JSON.parse(store.getItem(UI_STORAGE_KEY)!)).toHaveLength(1000);
    u.pane.dispose();
    const again = ui({ storage: store });
    expect(again.pane.messages).toHaveLength(1000);
    expect(uiPlain(again.pane.messages[0]!)).toBe('● SYSTEM: Line 3.');
    // Junk in storage is ignored.
    store.setItem(UI_STORAGE_KEY, '{bad');
    expect(ui({ storage: store }).pane.messages).toEqual([]);
    store.clear();
  });

  it('uses dark ink on a light pane', () => {
    const u = ui();
    u.settings.update({ appearance: { bg: '#f4ecd8' } });
    u.pane.applyTheme(u.settings.get());
    u.bus.emit('ui.message', { kind: 'system', parts: ['Hi.'] });
    u.flush();
    expect(u.rows()[0]!.style.color).not.toBe('#ffffff');
  });
});
