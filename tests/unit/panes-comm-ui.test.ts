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
import { contrast, paneEffectiveBg } from '../../src/theme/color';

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
      pre: (k: number) => {
        const f = items[0]!;
        items = Array.from({ length: k }, (_, i) => f - k + i).concat(items);
      },
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

  it('older items put in front build only those and keep the view (a page more, ADR 0134)', () => {
    const t = list(10, 4);
    t.scroll(-3 * CELL_H);
    const seen = t.inView();
    const built = t.built();
    t.pre(5);
    t.add(1);
    t.render();
    expect(t.built() - built).toBe(6);
    expect(t.al.elements[0]!.textContent).toBe('m-5');
    expect(t.inView()).toEqual(seen);
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

describe('CommPane (ADR 0134)', () => {
  function comm(opts: Parameters<typeof setup>[0] & { sent?: string[]; player?: boolean } = {}) {
    const env = setup(opts);
    const sent = opts.sent ?? [];
    const ctx = { ...env.ctx, sender: { sendCommand: (t: string) => void sent.push(t), sendGmcp: () => {} }, ...(opts.player ? { player: true } : {}) };
    env.ctx.game.attach(env.bus);
    const pane = new CommPane(ctx, { metrics: metrics(() => env.size.cols, () => env.size.rows), writeClipboard: async () => {} });
    document.body.append(pane.el);
    place(pane, env.size.cols, env.size.rows);
    env.flush();
    const q = <T extends HTMLElement = HTMLElement>(s: string) => pane.content.querySelector<T>(s);
    const qa = (s: string) => [...pane.content.querySelectorAll<HTMLElement>(s)];
    const rows = () => qa('.wc-comm-msg').map((e) => e.textContent);
    const entries = () => qa('.wc-cm-ent').map((e) => e.dataset.key);
    const open = (key: string) => {
      env.flush();
      q(`.wc-cm-ent[data-key="${key}"]`)!.click();
      env.flush();
    };
    const emit = (channel: string, talker: string, t: string, extra: Record<string, unknown> = {}) =>
      env.bus.emit('gmcp', text(channel, talker, t, { 'talker-type': 'player', ...extra }));
    return { ...env, pane, q, qa, rows, entries, open, emit, sent };
  }

  it('Public shows formatted lines without tells and whispers by default, and blanks while inactive', () => {
    const c = comm({ cols: 80 });
    c.emit('tells', 'Gibur', "Gibur tells you 'np :)'");
    c.emit('whispers', 'you', 'hej', { destination: 'Dori' });
    c.emit('socials', 'Vit the innkeeper', 'Vit the innkeeper bows before you.');
    c.emit('tales', 'Gibur', "Gibur narrates 'orcs!'");
    c.flush();
    expect(c.rows()).toEqual(['Vit bows before you.', "Gibur narrates 'orcs!'"]);
    // The verb in the channel colour, the name in the person's.
    const line = c.q('.wc-comm-msg[data-channel="tales"]')!;
    expect(line.querySelector<HTMLElement>('.wc-cm-vb')!.style.color).toBe('#d2ca5c');
    expect(line.querySelector<HTMLElement>('.wc-cm-nm')!.style.color).toMatch(/^#/);
    c.settings.update((d) => void (d.comm.filters = {}));
    c.flush();
    expect(c.rows()).toEqual(["Gibur tells you 'np :)'", "You whisper to Dori 'hej'", 'Vit bows before you.', "Gibur narrates 'orcs!'"]);
    expect(c.q('.wc-comm-msg[data-channel="whispers"]')!.hasAttribute('data-mine')).toBe(true);
    c.setState('disconnected');
    c.flush();
    expect(c.pane.content.textContent).toBe('');
    c.setState('playing');
    c.flush();
    expect(c.rows()).toHaveLength(4);
  });

  it('a tell opens a chat with an unread count; its bubbles and the overheard lines', () => {
    const c = comm({ cols: 60, rows: 20 });
    c.emit('tales', 'Gibur', "Gibur narrates 'first'");
    expect(c.entries()).toEqual(['public', 'group']);
    c.emit('tells', 'Gibur', "Gibur tells you 'hi'");
    c.emit('tells', 'Gibur', "Gibur tells you 'there'");
    c.flush();
    expect(c.entries()).toEqual(['public', 'group', 'gibur']);
    const row = c.q('.wc-cm-ent[data-key="gibur"]')!;
    expect(row.querySelector('.wc-cm-badge')!.textContent).toBe('2');
    expect(row.querySelector('.wc-cm-sn')!.textContent).toBe('there');
    c.open('gibur');
    expect(row.querySelector<HTMLElement>('.wc-cm-badge')!.hidden).toBe(true);
    expect(row.getAttribute('aria-pressed')).toBe('true');
    c.emit('tells', 'you', 'ok', { destination: 'Gibur' });
    c.flush();
    const bubbles = c.qa('.wc-cm-bb');
    expect(bubbles.map((b) => b.querySelector('.wc-cm-bt')!.textContent)).toEqual(['hi', 'there', 'ok']);
    expect(bubbles.map((b) => b.classList.contains('is-me'))).toEqual([false, false, true]);
    expect(bubbles[1]!.classList.contains('is-cont')).toBe(true);
    expect(bubbles[2]!.querySelector('.wc-cm-bm')!.textContent).toMatch(/^tell · \d\d:\d\d$/);
    // The narrate before the chat opened is in it as an overheard line, no channel icon.
    const oh = c.q('.wc-cm-oh')!;
    expect(oh.querySelector('.wc-cm-chp')!.textContent).toBe('Narrates');
    expect(oh.querySelector('.wc-cm-tx')!.textContent).toBe("'first'");
    expect(c.qa('.wc-cm-thread svg')).toHaveLength(0);
  });

  it('group tells read "tells the group", go to Group and never open a chat', () => {
    const c = comm({ cols: 60, rows: 20 });
    c.emit('tells', 'Lindir', "Lindir tells the group 'wait for me'");
    c.flush();
    expect(c.entries()).toEqual(['public', 'group']);
    c.open('group');
    expect(c.rows()).toEqual(["Lindir tells the group 'wait for me'"]);
  });

  it('Group follows the roster of players: joined and left notes, NPCs left out, dimmed without a group', () => {
    const c = comm({ cols: 60, rows: 20 });
    expect(c.q('.wc-cm-ent[data-key="group"]')!.hasAttribute('data-dim')).toBe(true);
    c.bus.emit('gmcp', {
      pkg: 'Group.Set',
      data: [
        { id: 1, name: 'Rasta', type: 'you' },
        { id: 2, name: 'Lindir', type: 'ally' },
        { id: 3, name: 'a warg', type: 'npc', label: 'W' },
      ],
    });
    c.flush();
    expect(c.q('.wc-cm-ent[data-key="group"]')!.hasAttribute('data-dim')).toBe(false);
    c.bus.emit('gmcp', { pkg: 'Group.Add', data: { id: 4, name: 'Haldis', type: 'ally' } });
    c.emit('says', 'Haldis', "Haldis says 'evening'");
    c.emit('says', 'Bergil', "Bergil says 'not grouped'");
    c.open('group');
    expect(c.qa('.wc-cm-note').map((e) => e.textContent)).toEqual(['Haldis joined the group']);
    expect(c.rows()).toEqual(["Haldis says 'evening'"]);
    c.bus.emit('gmcp', { pkg: 'Group.Remove', data: 4 });
    c.flush();
    expect(c.qa('.wc-cm-note').map((e) => e.textContent)).toEqual(['Haldis joined the group', 'Haldis left the group']);
  });

  it('the column is a rail in a narrow pane and a name list from 380 px; the window hides old chats', () => {
    let now = 1_000_000_000;
    const c = comm({ cols: 40, rows: 20, now: () => now });
    expect(c.q('.wc-comm')!.dataset.mode).toBe('rail');
    c.emit('tells', 'Dori', "Dori tells you 'old'");
    now += 40 * 60_000;
    c.emit('tells', 'Gibur', "Gibur tells you 'new'");
    c.open('public');
    // Dori has unread, so she shows though she is past the 30 min.
    expect(c.entries()).toEqual(['public', 'group', 'dori', 'gibur']);
    c.open('dori');
    c.open('gibur');
    expect(c.entries()).toEqual(['public', 'group', 'gibur']);
    c.settings.update({ comm: { chatWindow: 'all' } });
    c.flush();
    expect(c.entries()).toEqual(['public', 'group', 'dori', 'gibur']);
    // Wider: the name list.
    c.size.cols = 48;
    place(c.pane, 48, 20);
    c.flush();
    expect(c.q('.wc-comm')!.dataset.mode).toBe('list');
  });

  it('folds: the open chat in a chip with unfold beside it; the spine keys step the column', () => {
    const c = comm({ cols: 60, rows: 20 });
    c.emit('tells', 'Gibur', "Gibur tells you 'hi'");
    c.open('gibur');
    c.settings.update({ comm: { folded: true } });
    c.flush();
    expect(c.q('.wc-comm')!.dataset.mode).toBe('folded');
    expect(c.q('.wc-cm-chip')!.hidden).toBe(false);
    expect(c.q('.wc-cm-chip b')!.textContent).toBe('Gibur');
    c.emit('tales', 'Dori', "Dori narrates 'x'");
    c.flush();
    expect(c.q('.wc-cm-unfold')!.hasAttribute('data-unread')).toBe(true);
    c.q('.wc-cm-unfold')!.click();
    c.flush();
    expect(c.settings.get().comm.folded).toBe(false);
    expect(c.q('.wc-comm')!.dataset.mode).toBe('list');
    const handle = c.q('.wc-cm-handle')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    c.flush();
    expect(c.settings.get().comm.listWidth).toBeLessThan(100);
    expect(c.q('.wc-comm')!.dataset.mode).toBe('rail');
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    c.flush();
    expect(c.settings.get().comm.folded).toBe(true);
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    c.flush();
    expect(c.settings.get().comm).toMatchObject({ folded: false, listWidth: null });
  });

  it('the reply line sends a tell, a say or a tell to the group; hidden in a player and a replay', () => {
    const sent: string[] = [];
    const c = comm({ cols: 60, rows: 20, sent });
    c.emit('tells', 'Gibur the Dwarf', "Gibur tells you 'hi'");
    const input = c.q<HTMLInputElement>('.wc-cm-rinput')!;
    const enter = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(input.placeholder).toBe('Say something…');
    input.value = 'hello room';
    enter();
    c.open('gibur');
    expect(input.placeholder).toBe('Reply to Gibur…');
    input.value = ' on my way ';
    enter();
    c.open('group');
    input.value = 'wait';
    enter();
    expect(sent).toEqual(['say hello room', 'tell Gibur on my way', 'tell group wait']);
    expect(input.value).toBe('');
    const p = comm({ player: true });
    expect(p.q('.wc-cm-reply')!.hidden).toBe(true);
    const r = comm();
    r.setState('connecting', true);
    r.setState('playing', true);
    r.flush();
    expect(r.q('.wc-cm-reply')!.hidden).toBe(true);
  });

  it('search finds people (open chat) and messages on every channel', async () => {
    const c = comm({ cols: 60, rows: 20 });
    c.emit('tells', 'Gibur', "Gibur tells you 'trolls at the ford'");
    c.emit('tales', 'Dori', "Dori narrates 'no trolls here'");
    c.emit('says', 'Bergil', "Bergil says 'hello'");
    c.flush();
    c.q('.wc-cm-sbtn')!.click();
    expect(c.q('.wc-comm')!.hasAttribute('data-search')).toBe(true);
    const input = c.q<HTMLInputElement>('.wc-cm-sinput')!;
    input.value = 'troll';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 160));
    expect(c.qa('.wc-cm-rm .wc-cm-rmt').map((e) => e.textContent)).toEqual(["Dori narrates 'no trolls here'", "Gibur tells you 'trolls at the ford'"]);
    expect(c.qa('.wc-cm-rm mark').map((e) => e.textContent)).toEqual(['troll', 'troll']);
    expect(c.qa('.wc-cm-rp')).toHaveLength(0);
    input.value = 'gib';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 160));
    const person = c.q('.wc-cm-rp')!;
    expect(person.dataset.key).toBe('gibur');
    person.click();
    c.flush();
    expect(c.q('.wc-comm')!.hasAttribute('data-search')).toBe(false);
    expect(c.pane.model.open).toBe('gibur');
    expect(c.q('.wc-cm-results')!.hidden).toBe(true);
  });

  it('holds person and channel colours to 4.5:1 on a light pane, plain or tinted (ADR 0123 "Paper")', () => {
    for (const color of ['black', 'red', 'green', 'blue', 'grey', 'orange', 'purple'] as const) {
      const c = comm({ cols: 80, rows: 20 });
      c.settings.update({ appearance: { bg: '#f4ecd8' }, panes: { comm: { color } } });
      c.settings.update((d) => void (d.comm.filters = {}));
      c.pane.applyTheme(c.settings.get());
      for (const ch of ['tales', 'tells', 'says', 'yells', 'prayers', 'questions', 'songs']) c.emit(ch, `P${ch}`, `P${ch} x 'y'`);
      c.flush();
      expect(c.q('.wc-comm')!.hasAttribute('data-light')).toBe(true);
      const bg = paneEffectiveBg(color, '#f4ecd8');
      // 'you' takes the pane's own ink (CSS), the rest are fitted here.
      const inks = c.qa('.wc-cm-vb, .wc-cm-nm').map((e) => e.style.color).filter((ink) => !ink.startsWith('var('));
      expect(inks.length).toBeGreaterThan(10);
      for (const ink of inks) {
        expect(ink).toMatch(/^#[0-9a-f]{6}$/);
        expect(contrast(ink, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('seeds from the archive on a live Char.Name (quietly) and appends live messages', async () => {
    const NOW = Date.now();
    const c = comm({ db: true, state: 'login', now: () => NOW });
    c.settings.update((d) => void (d.comm.filters = {}));
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
    // The archived tell opened Gibur's chat without unread.
    expect(c.entries()).toEqual(['public', 'group', 'gibur']);
    expect(c.q<HTMLElement>('.wc-cm-ent[data-key="gibur"] .wc-cm-badge')!.hidden).toBe(true);
    await flushAsync();
    const stored = await arch.loadRecent('Rasta');
    expect(stored.map((r) => r.text)).toEqual(["Gibur tells you 'old'", 'new']);
    expect(stored[1]).toMatchObject({ character: 'Rasta', talker: 'you', channel: 'says', destination: null, talkerType: null });
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

  it('Group: no roster before a Group.* message; the first is a baseline, a later change notes who joined', () => {
    const c = comm({ cols: 60, rows: 20 });
    c.bus.emit('gmcp', text('says', 'you', 'alone'));
    c.open('group');
    expect(c.rows()).toEqual([]);
    // Char.Name, then the group the character was already in: no "joined" for them.
    c.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    c.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 1, name: 'Rasta', type: 'you' }, { id: 2, name: 'Lindir', type: 'ally' }] });
    c.flush();
    expect(c.qa('.wc-cm-note')).toHaveLength(0);
    c.bus.emit('gmcp', { pkg: 'Group.Add', data: { id: 3, name: 'Haldis', type: 'ally' } });
    c.flush();
    expect(c.qa('.wc-cm-note').map((e) => e.textContent)).toEqual(['Haldis joined the group']);
    // Alone in a group of one (only you): your lines stay out of Group.
    const d = comm({ cols: 60, rows: 20 });
    d.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 1, name: 'Rasta', type: 'you' }] });
    d.bus.emit('gmcp', text('says', 'you', 'solo'));
    d.open('group');
    expect(d.rows()).toEqual([]);
  });

  it('an archive load leaves Group empty, makes no "joined" notes, and keeps unread and colours', async () => {
    const NOW = Date.now();
    const c = comm({ db: true, state: 'login', now: () => NOW, cols: 60, rows: 20 });
    const db = await openWebcockpitDb(c.factory!);
    const arch = new CommArchive(db);
    await arch.append({ character: 'Rasta', ts: NOW - 60_000, channel: 'says', talker: 'Lindir', talkerType: 'player', destination: null, text: "Lindir says 'archived'" });
    await c.pane.whenReady();
    c.setState('connecting');
    c.setState('playing');
    c.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 1, name: 'Rasta', type: 'you' }, { id: 2, name: 'Lindir', type: 'ally' }] });
    c.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    await flushAsync();
    c.emit('tells', 'Gibur', "Gibur tells you 'live'");
    c.flush();
    const ink = c.q('.wc-cm-ent[data-key="gibur"]')!.style.getPropertyValue('--pc');
    await flushAsync();
    // Char.Name again (a re-login): the archive, now with Gibur's tell, is loaded quietly.
    c.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
    await flushAsync();
    c.flush();
    expect(c.pane.messages.map((m) => m.text)).toEqual(["Lindir says 'archived'", "Gibur tells you 'live'"]);
    // The load rebuilt the model: Gibur's unread and colour stay.
    expect(c.q('.wc-cm-ent[data-key="gibur"] .wc-cm-badge')!.textContent).toBe('1');
    expect(c.q('.wc-cm-ent[data-key="gibur"]')!.style.getPropertyValue('--pc')).toBe(ink);
    c.open('group');
    expect(c.rows()).toEqual([]);
    expect(c.qa('.wc-cm-note')).toHaveLength(0);
    db.close();
  });

  it('the reply line is hidden in a chat with a name a tell cannot reach', () => {
    const c = comm({ cols: 60, rows: 20 });
    c.emit('tells', 'a dwarven sergeant', "A dwarven sergeant tells you 'halt'");
    c.open('a dwarven sergeant');
    expect(c.q('.wc-cm-reply')!.hidden).toBe(true);
    c.emit('tells', 'Gibur', "Gibur tells you 'hi'");
    c.open('gibur');
    expect(c.q('.wc-cm-reply')!.hidden).toBe(false);
  });

  it('open search results follow only talk they would show, and keep their place', async () => {
    const c = comm({ cols: 60, rows: 20 });
    c.emit('tales', 'Dori', "Dori narrates 'trolls at the ford'");
    c.flush();
    c.q('.wc-cm-sbtn')!.click();
    const input = c.q<HTMLInputElement>('.wc-cm-sinput')!;
    input.value = 'troll';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 160));
    const first = c.q('.wc-cm-rm')!;
    c.emit('says', 'Bergil', "Bergil says 'hello'");
    c.flush();
    await new Promise((r) => setTimeout(r, 160));
    expect(c.q('.wc-cm-rm')).toBe(first);
    c.emit('says', 'Bergil', "Bergil says 'a troll!'");
    c.flush();
    await new Promise((r) => setTimeout(r, 160));
    expect(c.qa('.wc-cm-rm .wc-cm-rmt').map((e) => e.textContent)).toEqual(["Bergil says 'a troll!'", "Dori narrates 'trolls at the ford'"]);
  });

  it('stops the age tick while hidden', () => {
    const c = comm({ cols: 60, rows: 20 });
    const timer = () => (c.pane as unknown as { ageTimer: unknown }).ageTimer;
    expect(timer()).not.toBeNull();
    c.pane.place(null, { w: 8, h: CELL_H });
    expect(timer()).toBeNull();
  });

  it('keeps at most 1000 messages and builds only a page of the view', () => {
    const c = comm();
    for (let i = 0; i < 1005; i++) c.bus.emit('gmcp', text('says', 'D', `D says '${i}'`));
    c.flush();
    expect(c.pane.messages).toHaveLength(1000);
    expect(c.pane.messages[0]!.text).toBe("D says '5'");
    expect(c.rows()).toHaveLength(200);
    expect(c.rows().at(-1)).toBe("D says '1004'");
    // The first shown row keeps the time before it after the top was trimmed.
    c.bus.emit('gmcp', text('says', 'D', "D says 'one more'"));
    c.flush();
    expect(c.qa('.wc-cm-sep')).toHaveLength(1);
    expect(c.q('.wc-cm-item')!.firstElementChild!.classList.contains('wc-cm-sep')).toBe(true);
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
