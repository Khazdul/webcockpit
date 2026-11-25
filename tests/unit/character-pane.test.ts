// @vitest-environment happy-dom
// The Character card's pane (stage 77 part D): the poll it holds, the
// clicks, the fight, the timers, and what a render writes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { ConnState } from '../../src/core/types';
import { parseInfoAnswer } from '../../src/gmcp/info-answer';
import { GameState } from '../../src/gmcp/state';
import { CharacterPane } from '../../src/panes/character';
import { createPaneContext } from '../../src/panes/context';
import { SettingsStore } from '../../src/settings';
import { ANSWER_FIELDS } from '../fixtures/info-poll-answer';

const CELL = { w: 9, h: 17 };
const panes: CharacterPane[] = [];
afterEach(() => {
  for (const p of panes.splice(0)) p.dispose();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

interface Opts {
  /** The log player: no poll, no commands. */
  player?: boolean;
  canCommand?: () => boolean;
  state?: ConnState;
  cols?: number;
  rows?: number;
}

function setup(o: Opts = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(1_790_000_000_000);
  const bus = new Bus();
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const game = new GameState().attach(bus);
  const frames: (() => void)[] = [];
  const sent: string[] = [];
  const info = { open: 0, opened: 0, released: 0 };
  const ctx = createPaneContext({
    doc: document,
    bus,
    settings,
    game,
    cells: { get: () => ({ ...CELL, px: 14.95 }), subscribe: () => () => {} },
    requestFrame: (cb) => frames.push(cb),
    connState: () => o.state ?? 'playing',
    sender: { sendCommand: (t) => sent.push(t), sendGmcp: () => {} },
    ...(o.player
      ? { player: true }
      : {
          canCommand: o.canCommand ?? (() => true),
          openInfo: () => {
            info.open++;
            info.opened++;
            let done = false;
            return () => {
              expect(done, 'released twice').toBe(false);
              done = true;
              info.open--;
              info.released++;
            };
          },
        }),
  });
  const pane = new CharacterPane(ctx);
  panes.push(pane);
  document.body.append(pane.el);
  const show = (cols = o.cols ?? 48, rows = o.rows ?? 10): void =>
    pane.place({ rect: { x: 0, y: 0, w: cols, h: rows }, content: { x: 0, y: 0, w: cols, h: rows }, framed: false }, CELL);
  const hide = (): void => pane.place(null, CELL);
  const flush = (): void => {
    while (frames.length) frames.shift()!();
  };
  const gmcp = (pkg: string, data: unknown): void => {
    bus.emit('gmcp', { pkg, data });
    flush();
  };
  const q = <T extends HTMLElement = HTMLElement>(sel: string): T => pane.content.querySelector<T>(sel)!;
  const click = (sel: string): void => {
    q(sel).click();
    flush();
  };
  const tab = (id: string): void => click(`.wc-cc-tab[data-tab="${id}"]`);
  const answer = (): void => {
    game.applyInfo(parseInfoAnswer([ANSWER_FIELDS.join(' | ')])!);
    flush();
  };
  const wait = (ms: number): void => {
    vi.advanceTimersByTime(ms);
    flush();
  };
  const selected = (): string | undefined => q('[aria-selected="true"]').dataset.tab;
  show();
  flush();
  gmcp('Char.Name', { name: 'rasta' });
  gmcp('Char.StatusVars', { race: 'Orc', subrace: 'Tarkhnarb Orc' });
  gmcp('Char.Vitals', { hp: 187, maxhp: 270, mana: 93, maxmana: 111, mp: 98, maxmp: 122, mood: 'brave', alertness: 'normal', 'spell-effort': 'normal', carrying: 'heavy', position: 'standing' });
  // The timers hub has a tick of its own: count the pane's beside it.
  const others = vi.getTimerCount();
  const timers = (): number => vi.getTimerCount() - others;
  return { bus, game, settings, pane, info, sent, timers, show, hide, flush, gmcp, q, click, tab, answer, wait, selected };
}

describe('the poll (ctx.openInfo)', () => {
  it('held while shown, whichever tab (Status too, ADR 0166 addendum 18), once', () => {
    const t = setup();
    expect(t.info).toEqual({ open: 1, opened: 1, released: 0 });
    t.tab('stats');
    t.tab('stats');
    t.tab('lore');
    t.tab('status');
    expect(t.info).toEqual({ open: 1, opened: 1, released: 0 });
  });

  it('released when hidden and held again when shown', () => {
    const t = setup();
    t.tab('lore');
    t.hide();
    expect(t.info.open).toBe(0);
    t.hide();
    expect(t.info.released).toBe(1);
    t.show();
    t.show();
    expect(t.info).toEqual({ open: 1, opened: 2, released: 1 });
  });

  it('held through a fight (the poll itself waits for its end), the tab stays', () => {
    const t = setup();
    t.tab('stats');
    t.gmcp('Char.Vitals', { opponent: 'a troll' });
    expect(t.info.open).toBe(1);
    expect(t.selected()).toBe('stats');
    t.gmcp('Char.Vitals', { opponent: null });
    expect(t.info).toEqual({ open: 1, opened: 1, released: 0 });
    expect(t.selected()).toBe('stats');
  });

  it('a fight that began and ended while hidden changes nothing', () => {
    const t = setup();
    t.tab('lore');
    t.hide();
    t.gmcp('Char.Vitals', { position: 'fighting' });
    t.gmcp('Char.Vitals', { position: 'standing' });
    t.show();
    t.flush();
    expect(t.selected()).toBe('lore');
    expect(t.info.open).toBe(1);
  });

  it('released when inactive', () => {
    const t = setup();
    t.tab('stats');
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.flush();
    expect(t.info.open).toBe(0);
    t.bus.emit('conn.state', { state: 'playing', prev: 'login' });
    t.flush();
    expect(t.info.open).toBe(1);
  });

  it('released on dispose, and not again by a place after it', () => {
    const t = setup();
    t.tab('stats');
    t.pane.dispose();
    t.hide();
    t.show();
    expect(t.info).toEqual({ open: 0, opened: 1, released: 1 });
  });
});

describe('clicks', () => {
  it('sends, waits for GMCP, and takes no second click', () => {
    const t = setup();
    const mood = '.wc-cc-f[data-click="mood"]';
    t.click(mood);
    expect(t.sent).toEqual(['change mood aggressive']);
    expect(t.q(mood).hasAttribute('data-pending')).toBe(true);
    expect(t.q(mood).textContent).toContain('brave');
    t.click(mood);
    expect(t.sent).toHaveLength(1);
    t.gmcp('Char.Vitals', { hp: 180 });
    expect(t.q(mood).hasAttribute('data-pending')).toBe(true);
    t.gmcp('Char.Vitals', { mood: 'aggressive' });
    expect(t.q(mood).hasAttribute('data-pending')).toBe(false);
    expect(t.q(mood).getAttribute('aria-label')).toBe('Mood: aggressive');
  });

  it('the mark ends after 3 s, and a later change still shows', () => {
    const t = setup();
    const alert = '.wc-cc-f[data-click="alertness"]';
    t.click(alert);
    t.wait(2900);
    expect(t.q(alert).hasAttribute('data-pending')).toBe(true);
    t.wait(150);
    expect(t.q(alert).hasAttribute('data-pending')).toBe(false);
    expect(t.timers()).toBe(0);
    t.gmcp('Char.Vitals', { alertness: 'careful' });
    expect(t.q(alert).getAttribute('aria-label')).toBe('Alertness: careful');
  });

  it('every clickable element', () => {
    const t = setup();
    for (const id of ['mood', 'casts', 'alertness', 'sneak', 'ride', 'climb', 'swim', 'position']) t.click(`[data-click="${id}"]`);
    expect(t.sent).toEqual(['change mood aggressive', 'change spellcasting careful', 'change alertness careful', 'sneak', 'ride', 'climb', 'swim', 'rest']);
    t.click('.wc-cc-f[data-key="weight"]');
    expect(t.sent).toHaveLength(8);
  });

  it('nothing while MUME reads input of its own', () => {
    let reads = true;
    const t = setup({ canCommand: () => !reads });
    t.click('[data-click="mood"]');
    expect(t.sent).toEqual([]);
    expect(t.q('[data-click="mood"]').hasAttribute('data-pending')).toBe(false);
    reads = false;
    t.click('[data-click="mood"]');
    expect(t.sent).toEqual(['change mood aggressive']);
  });

  it('nothing in the log player', () => {
    const t = setup({ player: true });
    for (const id of ['mood', 'casts', 'alertness', 'sneak', 'position']) t.click(`[data-click="${id}"]`);
    expect(t.sent).toEqual([]);
    expect(t.q('[data-click="mood"]').getAttribute('aria-disabled')).toBe('true');
    expect(t.q('[data-click="mood"]').dataset.tip).toBeUndefined();
    t.tab('stats');
    expect(t.q('.wc-cc-quiet').textContent).toContain('replay');
  });

  it('nothing in a replay, live again afterwards', () => {
    const t = setup();
    t.bus.emit('conn.state', { state: 'playing', prev: 'login', replay: true });
    t.flush();
    t.click('[data-click="mood"]');
    expect(t.sent).toEqual([]);
    t.tab('stats');
    expect(t.q('.wc-cc-quiet').textContent).toContain('replay');
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected' });
    t.bus.emit('conn.state', { state: 'playing', prev: 'login' });
    t.flush();
    t.gmcp('Char.Vitals', { mood: 'brave' });
    t.click('[data-click="mood"]');
    expect(t.sent).toEqual(['change mood aggressive']);
  });

  it('a press takes no focus: buttons and the rest of the pane', () => {
    const t = setup();
    for (const sel of ['.wc-cc-tab', '.wc-cc-f', '.wc-cc-ib', '.wc-cc-name']) {
      const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      t.q(sel).dispatchEvent(e);
      expect(e.defaultPrevented, sel).toBe(true);
    }
  });

  it('tabs and fields are buttons with names', () => {
    const t = setup();
    const named = [...t.pane.content.querySelectorAll<HTMLButtonElement>('button')];
    expect(named).toHaveLength(11);
    for (const b of named) expect(b.getAttribute('aria-label'), b.className).toBeTruthy();
    for (const b of named) expect(b.type).toBe('button');
  });

  it('the tabs (round 20 G8): words under the hood; low, on the right edge as I, II, III with the word as tooltip', () => {
    const t = setup();
    const tabs = t.q('.wc-cc-tabs');
    const buttons = (): HTMLElement[] => [...tabs.querySelectorAll<HTMLElement>('.wc-cc-tab')];
    const tips = (): (string | undefined)[] => buttons().map((b) => b.dataset.tip);
    expect(tabs.dataset.side).toBe('top');
    expect(tabs.getAttribute('aria-orientation')).toBe('horizontal');
    expect(tabs.dataset.form).toBe('words');
    expect(tips()).toEqual([undefined, undefined, undefined]);
    // The sheet: drawn under the area, the chosen tab cut from it, the area padded on it.
    const folio = t.q('.wc-cc-folio');
    expect(folio.hidden).toBe(false);
    expect(folio.getAttribute('aria-hidden')).toBe('true');
    expect(t.q('.wc-cc-main').hasAttribute('data-sheet')).toBe(true);
    const ground = (): string => t.q('.wc-cc-fg').style.getPropertyValue('clip-path');
    const first = ground();
    expect(first).toMatch(/^path\('M/);
    t.tab('stats');
    expect(ground()).not.toBe(first);
    expect(folio.querySelectorAll('.wc-cc-fb:not([hidden])')).toHaveLength(2);
    t.tab('status');
    expect(ground()).toBe(first);
    t.show(62, 7);
    t.flush();
    expect(tabs.dataset.side).toBe('right');
    expect(tabs.getAttribute('aria-orientation')).toBe('vertical');
    expect(tabs.dataset.form).toBe('numerals');
    expect(tips()).toEqual(['Status', 'Stats', 'Lore']);
    expect(buttons().map((b) => b.getAttribute('aria-label'))).toEqual(['Status', 'Stats', 'Lore']);
    expect(buttons().map((b) => b.querySelector('.wc-cc-tab-n')!.textContent)).toEqual(['I', 'II', 'III']);
    // H3's icons are gone.
    expect(tabs.querySelectorAll('svg')).toHaveLength(0);
    t.show();
    t.flush();
    expect(tips()).toEqual([undefined, undefined, undefined]);
    // Too low for tabs: no sheet.
    t.show(62, 5);
    t.flush();
    expect(tabs.hidden).toBe(true);
    expect(folio.hidden).toBe(true);
    expect(t.q('.wc-cc-main').hasAttribute('data-sheet')).toBe(false);
  });

  it('tooltips only where part D lists them', () => {
    const t = setup();
    t.answer();
    t.tab('stats');
    t.tab('lore');
    t.tab('status');
    const tipped = [...t.pane.content.querySelectorAll<HTMLElement>('[data-tip]')].map((e) => e.dataset.tipKey).sort();
    expect(tipped).toEqual(
      ['ring', 'sneak', 'ride', 'climb', 'swim', 'position', 'mood', 'casts', 'alertness', 'weight', 'ob', 'db', 'pb', 'abs', 'st:add', 'purse', 'hp', 'str', 'int', 'wis', 'dex', 'con', 'wil', 'per']
        .map((k) => `cc:${k}`)
        .sort(),
    );
  });
});

describe('what is shown', () => {
  it('Status from GMCP', () => {
    const t = setup();
    expect(t.q('.wc-cc-name').textContent).toBe('Rasta');
    expect([...t.pane.content.querySelectorAll('.wc-cc-word')].map((e) => e.textContent)).toEqual(['brave', 'normal', 'normal', 'heavy']);
    expect([...t.pane.content.querySelectorAll('.wc-cc-vn')].map((e) => e.textContent)).toEqual(['187', '93', '98']);
  });

  it('a band shows the span and no number, and no band word', () => {
    const t = setup();
    t.gmcp('Char.Vitals', { 'hp-string': 'Hurt' });
    const hp = t.q('.wc-cc-vital[data-kind="hp"]');
    expect(hp.querySelector<HTMLElement>('.wc-cc-span')!.hidden).toBe(false);
    expect(hp.querySelector('.wc-cc-vn')!.textContent).toBe('');
    expect(t.pane.content.textContent!.toLowerCase()).not.toContain('hurt');
    expect(hp.dataset.tip).toContain('46–70 %');
  });

  it('the wimpy arrow', () => {
    const t = setup();
    expect(t.q('.wc-cc-wimpy').hidden).toBe(true);
    t.game.setWimpy(135);
    t.flush();
    expect(t.q('.wc-cc-wimpy').hidden).toBe(false);
    expect(t.q('.wc-cc-wimpy').style.getPropertyValue('--p')).toBe('50');
  });

  it('Stats and Lore from the answer; quiet without one', () => {
    const t = setup();
    t.tab('stats');
    expect(t.q('.wc-cc-quiet').hidden).toBe(false);
    expect(t.q('.wc-cc-quiet').textContent).toContain('No data yet');
    t.answer();
    expect(t.q('.wc-cc-quiet').hidden).toBe(true);
    // The shields left Stats (ADR 0166 point 87).
    expect(t.q('.wc-cc-stats .wc-cc-sv')).toBeNull();
    t.tab('lore');
    expect(t.q('[data-key="race"] .wc-cc-bv').textContent).toBe('Tarkhnarb orc');
    expect(t.q('[data-key="citizen"] .wc-cc-bv').textContent).toBe('GoblinTown');
    // War fame and War points, a box each (point 123).
    expect(t.q('[data-key="warFame"] .wc-cc-bv').textContent).toBe('warlord');
    expect(t.q('[data-key="warPoints"] .wc-cc-bv').textContent).toBe('19');
    expect([...t.pane.content.querySelectorAll('.wc-cc-lore .wc-cc-coin')].map((e) => e.textContent)).toEqual(['380', '5', '49']);
  });

  it('off says so', () => {
    const t = setup();
    t.settings.update({ character: { fetchInfo: false } });
    t.flush();
    t.tab('stats');
    expect(t.q('.wc-cc-quiet').textContent).toContain('off');
  });

  it('the fight: only the swords; the tab stays (round 12 decision 8)', () => {
    const t = setup();
    t.answer();
    t.tab('lore');
    t.gmcp('Char.Vitals', { opponent: 'a troll' });
    expect(t.q('.wc-cc').hasAttribute('data-fight')).toBe(true);
    expect(t.q('[data-click="position"]').getAttribute('aria-label')).toBe('Fighting');
    expect(t.q('[data-click="position"]').hasAttribute('data-fight')).toBe(true);
    expect(t.selected()).toBe('lore');
    t.tab('stats');
    expect(t.selected()).toBe('stats');
    expect(t.info.open).toBe(1);
    t.gmcp('Char.Vitals', { opponent: null });
    expect(t.selected()).toBe('stats');
    expect(t.q('.wc-cc').hasAttribute('data-fight')).toBe(false);
  });

  it('the shields on Status: `⋯` until the poll answers, then the values (point 89)', () => {
    const t = setup();
    const shields = (): string[] => [...t.pane.content.querySelectorAll('.wc-cc-status .wc-cc-sv')].map((e) => e.textContent!);
    expect(shields()).toEqual(['⋯', '⋯', '⋯', '⋯']);
    t.answer();
    expect(shields()).toEqual(['81', '13', '85', '70']);
    expect(t.q('.wc-cc-shield[data-key="ob"]').dataset.tipTitle).toBe('OB 81');
  });

  it('a tab change and a fight move no box', () => {
    const t = setup();
    t.answer();
    const boxes = (): string[] => ['.wc-cc-left', '.wc-cc-main', '.wc-cc-tabs', '.wc-cc-foot'].map((s) => t.q(s).getAttribute('style')!);
    const before = boxes();
    t.tab('stats');
    expect(boxes()).toEqual(before);
    t.gmcp('Char.Vitals', { opponent: 'a troll' });
    expect(boxes()).toEqual(before);
  });

  it('the height lock applies live', () => {
    const t = setup();
    expect(t.q('.wc-cc').dataset.mode).toBe('large');
    t.settings.update({ character: { height: 'medium' } });
    t.flush();
    expect(t.q('.wc-cc').dataset.mode).toBe('medium');
  });
});

describe('cost', () => {
  it('one render a frame for a burst', () => {
    const t = setup();
    const render = vi.spyOn(t.pane as unknown as { render(): void }, 'render');
    for (let i = 0; i < 1000; i++) t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { hp: i % 270 } });
    t.flush();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('a value change builds nothing', () => {
    const t = setup();
    const mo = new MutationObserver(() => {});
    mo.observe(t.pane.content, { subtree: true, childList: true });
    t.gmcp('Char.Vitals', { hp: 120, mana: 40, mp: 7, mood: 'wimpy', position: 'resting', carrying: 'painful', sneak: 's' });
    t.gmcp('Char.Vitals', { 'hp-string': 'Hurt' });
    for (const m of mo.takeRecords()) {
      // A text is set by replacing the element's one text node.
      for (const n of [...m.addedNodes, ...m.removedNodes]) expect(n.nodeType).toBe(Node.TEXT_NODE);
    }
    mo.disconnect();
  });

  it('no timer unless something shown needs one, none while hidden', () => {
    const t = setup();
    expect(t.timers()).toBe(0);
    t.answer();
    expect(t.timers()).toBe(0);
    t.tab('stats');
    expect(t.timers()).toBe(1);
    const age = t.q('.wc-cc-data-age').textContent;
    t.wait(2100);
    expect(t.q('.wc-cc-data-age').textContent).not.toBe(age);
    expect(t.timers()).toBe(1);
    t.hide();
    expect(t.timers()).toBe(0);
    t.show();
    t.flush();
    expect(t.timers()).toBe(1);
    t.tab('status');
    expect(t.timers()).toBe(0);
  });
});

describe('the stones (stage 77 F2a, drawn since F2b)', () => {
  const stones = (t: ReturnType<typeof setup>): HTMLElement[] => [...t.pane.content.querySelectorAll<HTMLElement>('.wc-cc-st')].filter((e) => !e.hidden);
  const kinds = (t: ReturnType<typeof setup>): string[] => stones(t).map((e) => (e.dataset.k === 'stone' ? e.dataset.id! : e.dataset.k!));
  const cell = (id: string, group: string, left: number | null, total: number | null, more: Record<string, unknown> = {}) => {
    const now = Date.now();
    return { id, name: id, group, startedAt: now, expiresAt: left === null ? null : now + left, expected: total, tracked: true, ...more } as never;
  };

  it('rebuilt after a Timers, a group or a switch change, and drawn: the `+` first', () => {
    const t = setup();
    const empty = t.pane.stones;
    expect(empty.stones).toEqual([]);
    expect(empty.canStartHerb).toBe(true);
    expect(t.pane.stones).toBe(empty);
    expect(kinds(t)).toEqual(['add']);
    t.gmcp('Group.Set', [{ id: 1, type: 'you', name: 'Rasta', poison: true }]);
    expect(t.pane.stones.stones.map((s) => s.id)).toEqual(['flag:poison']);
    expect(kinds(t)).toEqual(['add', 'flag:poison']);
    t.game.timers.addHerb('Healing');
    t.flush();
    const v = t.pane.stones;
    expect(v.stones.map((s) => s.kind)).toEqual(['herb', 'flag']);
    expect(v.stones[0]!.herbKey).toBe('Healing');
    expect(t.pane.stones).toBe(v);
    expect(kinds(t)).toEqual(['add', v.stones[0]!.id, 'flag:poison']);
    t.settings.update({ character: { stones: { flags: false } } });
    t.flush();
    expect(t.pane.stones.stones.map((s) => s.kind)).toEqual(['herb']);
    expect(kinds(t)).toEqual(['add', v.stones[0]!.id]);
  });

  it('Stats shows the same rows, Lore none, the purse only on Status', () => {
    const t = setup();
    t.answer();
    t.game.timers.debugAdd(cell('b1', 'buff', 60_000, 120_000));
    t.flush();
    const before = kinds(t);
    expect(before).toEqual(['add', 'b1']);
    expect(t.q('.wc-cc-purse').hidden).toBe(false);
    const height = t.q('.wc-cc').style.getPropertyValue('--stones-h');
    t.tab('stats');
    expect(t.q('.wc-cc-stones').hidden).toBe(false);
    expect(kinds(t)).toEqual(before);
    expect(t.q('.wc-cc').style.getPropertyValue('--stones-h')).toBe(height);
    expect(t.q('.wc-cc-purse').hidden).toBe(true);
    t.tab('lore');
    expect(t.q('.wc-cc-stones').hidden).toBe(true);
  });

  it('the bars drain on the second, writing only the bars and no element', () => {
    const t = setup();
    t.game.timers.debugAdd(cell('b1', 'buff', 60_000, 120_000));
    t.flush();
    const bar = t.q('.wc-cc-st[data-id="b1"] .wc-cc-stf');
    expect(bar.style.getPropertyValue('--f')).toBe('0.500');
    expect(t.timers()).toBe(1);
    const mo = new MutationObserver(() => {});
    mo.observe(t.pane.content, { subtree: true, childList: true });
    t.wait(30_000);
    expect(bar.style.getPropertyValue('--f')).toBe('0.250');
    expect(mo.takeRecords()).toEqual([]);
    mo.disconnect();
    // Ending soon at `timers.warnAt` (20 s).
    t.wait(11_000);
    expect(t.q('.wc-cc-st[data-id="b1"]').hasAttribute('data-end')).toBe(true);
    // None while hidden, none on Lore.
    t.tab('lore');
    expect(t.timers()).toBe(0);
  });

  it('`+n` when they do not fit, and its list; a herblore × stops it', () => {
    const t = setup({ cols: 34, rows: 9 });
    for (let i = 0; i < 40; i++) t.game.timers.debugAdd(cell(`b${String(i).padStart(2, '0')}`, 'buff', null, null));
    t.game.timers.addHerb('Healing');
    t.flush();
    const more = stones(t).at(-1)!;
    expect(more.dataset.k).toBe('more');
    const n = Number(more.textContent!.slice(1));
    expect(n).toBeGreaterThan(0);
    expect(stones(t).filter((e) => e.dataset.k === 'stone').length + n).toBe(41);
    more.click();
    const list = document.querySelector<HTMLElement>('.wc-cc-list')!;
    expect(list.hidden).toBe(false);
    expect(list.querySelectorAll('.wc-cc-lr')).toHaveLength(n);
    // Esc closes it.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.wc-cc-list')).toBeNull();
    // The herblore is kept (a rank above buffs); its × stops it.
    const herb = t.q('.wc-cc-st[data-id^="herb:"] .wc-cc-stx');
    expect(herb.dataset.key).toBe('Healing');
    herb.click();
    t.flush();
    expect(t.game.timers.view(Date.now()).herbs.find((h) => h.key === 'Healing')?.active).toBe(false);
  });

  it('the `+` opens the herblore menu; a pick starts it', () => {
    const t = setup();
    t.q('.wc-cc-st[data-k="add"]').click();
    const menu = document.querySelector<HTMLElement>('.wc-tm-menu[aria-label="Herblores"]')!;
    expect(menu.hidden).toBe(false);
    const first = menu.querySelector<HTMLElement>('.wc-tm-mi')!;
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(document.querySelector('.wc-tm-menu[aria-label="Herblores"]')).toBeNull();
    expect(t.pane.stones.stones.map((s) => s.herbKey)).toEqual([first.dataset.key]);
  });

  it('read-only in a log player: no `+`, no ×', () => {
    const t = setup({ player: true });
    expect(t.pane.stones.canStartHerb).toBe(false);
    t.game.timers.debugAdd(cell('herb:Healing', 'herb', 60_000, 120_000, { herbKey: 'Healing' }));
    t.flush();
    expect(kinds(t)).toEqual(['herb:Healing']);
    expect(t.q('.wc-cc-st .wc-cc-stx').hidden).toBe(true);
  });

  describe('the herblore × on touch (G7b, ADR 0166 point 158)', () => {
    /** A tap or a click: the pointer's events, then the click. */
    const press = (t: ReturnType<typeof setup>, e: HTMLElement, pointerType: 'touch' | 'mouse'): void => {
      for (const type of ['pointerover', 'pointerdown', 'pointerup']) e.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
      e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      t.flush();
    };
    const herbSetup = () => {
      const t = setup();
      t.game.timers.addHerb('Healing');
      t.flush();
      const stone = (): HTMLElement => t.q('.wc-cc-st[data-id^="herb:"]');
      const active = (): boolean | undefined => t.game.timers.view(Date.now()).herbs.find((h) => h.key === 'Healing')?.active;
      expect(active()).toBe(true);
      return { t, stone, active };
    };

    it('the first tap shows the × and stops nothing; a tap on it stops', () => {
      const { t, stone, active } = herbSetup();
      press(t, stone().querySelector<HTMLElement>('.wc-cc-sti')!, 'touch');
      expect(active()).toBe(true);
      expect(stone().hasAttribute('data-armed')).toBe(true);
      expect(t.q('.wc-cc-stones').hasAttribute('data-touch')).toBe(true);
      // Even when the first tap lands on the (hover-shown) × itself.
      press(t, stone().querySelector<HTMLElement>('.wc-cc-stx')!, 'touch');
      expect(active()).toBe(false);
      expect(t.q('.wc-cc-stones [data-armed]')).toBeNull();
    });

    it('a first tap on the × itself arms, it does not stop', () => {
      const { t, stone, active } = herbSetup();
      press(t, stone().querySelector<HTMLElement>('.wc-cc-stx')!, 'touch');
      expect(active()).toBe(true);
      expect(stone().hasAttribute('data-armed')).toBe(true);
    });

    it('the × goes by itself after 3 s, on the card\'s one timer', () => {
      const { t, stone, active } = herbSetup();
      press(t, stone(), 'touch');
      expect(stone().hasAttribute('data-armed')).toBe(true);
      t.wait(2900);
      expect(stone().hasAttribute('data-armed')).toBe(true);
      t.wait(200);
      expect(stone().hasAttribute('data-armed')).toBe(false);
      expect(active()).toBe(true);
      // The herblore counts down: the one timer stays (the next second), no more.
      expect(t.timers()).toBe(1);
      // A tap now arms again, it does not stop.
      press(t, stone().querySelector<HTMLElement>('.wc-cc-stx')!, 'touch');
      expect(active()).toBe(true);
      expect(stone().hasAttribute('data-armed')).toBe(true);
    });

    it('a tap on another stone of the row hides it', () => {
      const { t, stone } = herbSetup();
      t.game.timers.debugAdd(cell('b1', 'buff', 60_000, 120_000));
      t.flush();
      press(t, stone(), 'touch');
      expect(stone().hasAttribute('data-armed')).toBe(true);
      press(t, t.q('.wc-cc-st[data-id="b1"]'), 'touch');
      expect(t.q('.wc-cc-stones [data-armed]')).toBeNull();
    });

    it('the mouse is unchanged: one click on the × stops, no arming', () => {
      const { t, stone, active } = herbSetup();
      press(t, stone().querySelector<HTMLElement>('.wc-cc-stx')!, 'mouse');
      expect(active()).toBe(false);
      expect(t.q('.wc-cc-stones').hasAttribute('data-touch')).toBe(false);
    });

    it('a mouse after a touch: the hover rule is back, a click stops', () => {
      const { t, stone, active } = herbSetup();
      press(t, stone(), 'touch');
      press(t, stone().querySelector<HTMLElement>('.wc-cc-stx')!, 'mouse');
      expect(t.q('.wc-cc-stones').hasAttribute('data-touch')).toBe(false);
      expect(active()).toBe(false);
    });

    it('none in a log player', () => {
      const t = setup({ player: true });
      t.game.timers.debugAdd(cell('herb:Healing', 'herb', 60_000, 120_000, { herbKey: 'Healing' }));
      t.flush();
      press(t, t.q('.wc-cc-st[data-id="herb:Healing"]'), 'touch');
      expect(t.q('.wc-cc-stones [data-armed]')).toBeNull();
    });
  });
});

describe('a troll (stage 77 H9): no mana bar, no Casts cell', () => {
  it('by the race: hidden at once, HP and moves take the width; back for another character', () => {
    const t = setup();
    expect(t.q('.wc-cc-vital[data-kind="mana"]').hidden).toBe(false);
    expect(t.q('.wc-cc-f[data-key="casts"]').hidden).toBe(false);
    t.gmcp('Char.Name', { name: 'Stewash' });
    t.gmcp('Char.StatusVars', { race: 'Troll', subrace: 'Hill Troll' });
    t.gmcp('Char.Vitals', { hp: 121, maxhp: 121, mp: 112, maxmp: 112, mood: 'normal', position: 'standing' });
    expect(t.q('.wc-cc-vital[data-kind="mana"]').hidden).toBe(true);
    expect(t.q('.wc-cc-f[data-key="casts"]').hidden).toBe(true);
    expect(t.q('.wc-cc-foot').dataset.bars).toBe('2');
    expect(t.q('.wc-cc').dataset.mana).toBe('none');
    expect(t.q('.wc-cc').style.getPropertyValue('--st-cols')).toBe('3');
    t.gmcp('Char.Name', { name: 'Rasta' });
    t.gmcp('Char.StatusVars', { race: 'Orc' });
    expect(t.q('.wc-cc-vital[data-kind="mana"]').hidden).toBe(false);
    expect(t.q('.wc-cc-f[data-key="casts"]').hidden).toBe(false);
    expect(t.q('.wc-cc-foot').dataset.bars).toBeUndefined();
  });

  it('by the data: no mana key in GMCP and the poll answers 0 0 for mana', () => {
    const t = setup();
    t.gmcp('Char.Name', { name: 'Stewash' });
    t.gmcp('Char.Vitals', { hp: 121, maxhp: 121, mp: 112, maxmp: 112 });
    expect(t.q('.wc-cc-vital[data-kind="mana"]').hidden).toBe(false);
    const info = parseInfoAnswer([ANSWER_FIELDS.join(' | ')])!;
    t.game.applyPoll({ info, vitals: { hp: 121, maxhp: 121, mana: 0, maxmana: 0, mp: 100, maxmp: 112 }, affects: [] }, t.game.char.vitalsMark());
    t.flush();
    expect(t.q('.wc-cc-vital[data-kind="mana"]').hidden).toBe(true);
    expect(t.q('.wc-cc-f[data-key="casts"]').hidden).toBe(true);
    // The polled moves are drawn.
    expect(t.q('.wc-cc-vital[data-kind="mp"] .wc-cc-vn').textContent).toBe('100');
  });
});
