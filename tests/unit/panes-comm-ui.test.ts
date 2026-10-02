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

/**
 * A layout model for happy-dom: items stack at the bottom of the list, each
 * `height(el)` px; the list is `client(list)` px high and keeps a clamped
 * scrollTop.
 */
function model(height: (el: HTMLElement) => number, client: (list: HTMLElement) => number): ListMetrics {
  const tops = new WeakMap<HTMLElement, number>();
  const content = (list: HTMLElement): number => {
    let t = 0;
    for (const el of list.querySelector('.wc-alist-stack')!.children) t += height(el as HTMLElement);
    return t;
  };
  const scrollHeight = (list: HTMLElement): number => Math.max(client(list), content(list));
  return {
    scrollTop: (l) => Math.min(tops.get(l) ?? 0, scrollHeight(l) - client(l)),
    setScrollTop: (l, px) => void tops.set(l, Math.max(0, Math.min(scrollHeight(l) - client(l), px))),
    clientHeight: client,
    scrollHeight,
    itemTop: (el) => {
      const list = el.closest<HTMLElement>('.wc-alist')!;
      let t = Math.max(0, client(list) - content(list));
      for (let e = el.previousElementSibling; e; e = e.previousElementSibling) t += height(e as HTMLElement);
      return t;
    },
    itemHeight: height,
  };
}

/** Scrolls the list by `px` as the browser would, then fires `scroll`. */
function scrollBy(list: HTMLElement, m: ListMetrics, px: number): void {
  m.setScrollTop(list, m.scrollTop(list) + px);
  list.dispatchEvent(new Event('scroll'));
}

/** Monospace metrics: each item wraps at `cols()` characters, one row = 16 px. */
function metrics(cols: () => number, paneRows: () => number): ListMetrics {
  return model(
    (el) => Math.max(1, Math.ceil((el.textContent ?? '').length / cols())) * CELL_H,
    (list) => {
      const pane = list.parentElement!;
      let rows = paneRows();
      const header = pane.querySelector<HTMLElement>('.wc-comm-header');
      if (header && !header.hidden) rows--;
      if (!pane.querySelector<HTMLElement>('.wc-alist-more')!.hidden) rows--;
      return rows * CELL_H;
    },
  );
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
    const m = model(
      (el) => heights.get(el)! * CELL_H,
      (l) => (rows - (l.parentElement!.querySelector<HTMLElement>('.wc-alist-more')!.hidden ? 0 : 1)) * CELL_H,
    );
    const al = new AnchoredList<number>(doc, () => changes++, { metrics: m, settleMs: 0 });
    const box = doc.createElement('div');
    box.append(al.el, al.more);
    let items = Array.from({ length: count }, (_, i) => i);
    let built = 0;
    let key = 'k';
    const render = () =>
      al.render(
        items,
        (i) => {
          built++;
          const el = doc.createElement('div');
          el.textContent = `m${i}`;
          heights.set(el, height(i));
          return el;
        },
        key,
        (k) => `↓ ${k}`,
      );
    render();
    /** The items wholly or partly in view. */
    const inView = () => {
      const top = m.scrollTop(al.el);
      const bottom = top + m.clientHeight(al.el);
      return al.elements
        .filter((e) => m.itemTop(e) + m.itemHeight(e) > top && m.itemTop(e) < bottom)
        .map((e) => e.textContent);
    };
    return {
      al,
      m,
      render,
      inView,
      top: () => m.scrollTop(al.el),
      scroll: (px: number) => scrollBy(al.el, m, px),
      add: (k: number) => {
        const n = items.length ? items[items.length - 1]! + 1 : 0;
        items = items.concat(Array.from({ length: k }, (_, i) => n + i));
      },
      trim: (k: number) => void (items = items.slice(k)),
      setKey: (k: string) => void (key = k),
      built: () => built,
      changes: () => changes,
    };
  }

  it('shows the newest items at live; a short list cannot scroll', () => {
    const l = list(3, 5);
    expect(l.inView()).toEqual(['m0', 'm1', 'm2']);
    expect(l.al.live).toBe(true);
    l.scroll(-10);
    expect(l.al.live).toBe(true);
    expect(l.al.more.hidden).toBe(true);
  });

  it('scrolls by pixels: a few pixels up leaves live and counts the items below', () => {
    const l = list(10, 5);
    expect(l.top()).toBe(5 * CELL_H);
    expect(l.inView()).toEqual(['m5', 'm6', 'm7', 'm8', 'm9']);
    l.scroll(-5);
    expect(l.top()).toBe(5 * CELL_H - 5);
    expect(l.al.live).toBe(false);
    expect(l.changes()).toBe(1);
    // The indicator takes a row: m8 is now partly hidden too.
    expect(l.al.more.hidden).toBe(false);
    expect(l.al.more.textContent).toBe('↓ 2');
    // Up to the top: the oldest item at the top edge.
    l.scroll(-1000);
    expect(l.top()).toBe(0);
    expect(l.inView()).toEqual(['m0', 'm1', 'm2', 'm3']);
    expect(l.al.more.textContent).toBe('↓ 6');
    // Back down to the bottom: live again.
    l.scroll(1000);
    expect(l.al.live).toBe(true);
    expect(l.al.more.hidden).toBe(true);
  });

  it('live: new items follow the bottom and only the new ones are built', () => {
    const l = list(10, 5);
    const b = l.built();
    l.add(3);
    l.render();
    expect(l.built() - b).toBe(3);
    expect(l.inView().at(-1)).toBe('m12');
    expect(l.al.live).toBe(true);
    // A render with nothing new builds nothing.
    l.render();
    expect(l.built() - b).toBe(3);
  });

  it('scrolled back: new items keep the view, trimmed items are made up for', () => {
    const l = list(10, 5);
    l.scroll(-3 * CELL_H);
    const view = l.inView();
    l.add(2);
    l.render();
    expect(l.inView()).toEqual(view);
    expect(l.al.more.textContent).toBe('↓ 6');
    // The ring drops the two oldest: the view stays on the same items.
    l.trim(2);
    l.render();
    expect(l.inView()).toEqual(view);
    // The indicator returns to live.
    l.al.more.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    expect(l.al.live).toBe(true);
    expect(l.inView().at(-1)).toBe('m11');
    expect(l.al.more.hidden).toBe(true);
  });

  it('rebuilds on a new key or other items; the browser clamps the position', () => {
    const l = list(10, 5);
    const b = l.built();
    l.setKey('other');
    l.render();
    expect(l.built() - b).toBe(10);
    l.scroll(-1000);
    // Fewer items (a filter): rebuilt, still scrolled back, clamped.
    l.trim(8);
    l.render();
    expect(l.al.elements.map((e) => e.textContent)).toEqual(['m8', 'm9']);
    expect(l.top()).toBe(0);
  });

  it('resting follows live once the scrolling is quiet; only then the owner hears', async () => {
    let changes = 0;
    const heights = new Map<HTMLElement, number>();
    const m = model((el) => heights.get(el) ?? CELL_H, () => 5 * CELL_H);
    const al = new AnchoredList<number>(document, () => changes++, { metrics: m, settleMs: 20 });
    document.createElement('div').append(al.el, al.more);
    al.render(Array.from({ length: 20 }, (_, i) => i), () => document.createElement('div'), 'k', (n) => `↓ ${n}`);
    scrollBy(al.el, m, -40);
    expect(al.live).toBe(false);
    expect(al.resting).toBe(true);
    expect(changes).toBe(0);
    scrollBy(al.el, m, -10);
    await new Promise((r) => setTimeout(r, 60));
    expect(al.resting).toBe(false);
    expect(changes).toBe(1);
    al.toLive();
    expect(al.resting).toBe(true);
    expect(changes).toBe(2);
    al.dispose();
  });

  it('keepView holds the top item while heights change', () => {
    const tall = new Set<number>();
    const l = list(10, 5, (i) => (tall.has(i) ? 2 : 1));
    l.scroll(-3 * CELL_H - 4);
    const first = l.inView()[0];
    const at = () => {
      const el = l.al.elements.find((e) => e.textContent === first)!;
      return l.m.itemTop(el) - l.top();
    };
    const before = at();
    // Items 0..3 get taller (their heights come from the map at measuring time).
    l.al.keepView(() => {
      for (const i of [0, 1, 2, 3]) tall.add(i);
      for (const e of l.al.elements) {
        const n = Number(e.textContent!.slice(1));
        if (tall.has(n)) e.dataset.tall = '1';
      }
    });
    expect(at()).toBe(before);
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

  it('timestamps only while scrolled back; the top row keeps its place', () => {
    const t0 = new Date(2026, 8, 27, 14, 5).getTime();
    const env = setup({ cols: 40, rows: 4, now: () => t0 });
    const m = metrics(() => env.size.cols, () => env.size.rows);
    const pane = new CommPane(env.ctx, { metrics: m, settleMs: 0 });
    document.body.append(pane.el);
    place(pane, env.size.cols, env.size.rows);
    env.flush();
    const rows = () => [...pane.content.querySelectorAll<HTMLElement>('.wc-comm-msg')].map((e) => e.textContent);
    const list = pane.content.querySelector<HTMLElement>('.wc-alist')!;
    const more = pane.content.querySelector<HTMLElement>('.wc-alist-more')!;
    for (let i = 0; i < 10; i++) env.bus.emit('gmcp', text('says', 'Dori', `Dori says 'm${i}'`));
    env.flush();
    expect(rows().slice(-1)).toEqual(["Dori says 'm9'"]);
    // Three rows (header on): a pixel up leaves live; timestamps come in.
    scrollBy(list, m, -CELL_H);
    env.flush();
    expect(rows().slice(-1)).toEqual(["14:05 Dori says 'm9'"]);
    expect(more.hidden).toBe(false);
    expect(more.textContent).toBe('↓ 2 newer messages');
    // New messages land below and count in the indicator.
    env.bus.emit('gmcp', text('says', 'Dori', "Dori says 'm10'"));
    env.flush();
    expect(rows().slice(-1)).toEqual(["14:05 Dori says 'm10'"]);
    expect(more.textContent).toBe('↓ 3 newer messages');
    // A message on a filtered channel is not shown (the filter change rebuilds).
    env.settings.update((d) => void (d.comm.filters.tells = false));
    env.bus.emit('gmcp', text('tells', 'Gibur', "Gibur tells you 'x'"));
    env.flush();
    expect(more.textContent).toBe('↓ 3 newer messages');
    more.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
    env.flush();
    expect(rows().slice(-1)).toEqual(["Dori says 'm10'"]);
    expect(pane.content.querySelectorAll('.wc-comm-time')).toHaveLength(0);
    expect(more.hidden).toBe(true);
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
