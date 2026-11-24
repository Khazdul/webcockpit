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

  it('held through a fight (the poll itself waits for its end), the tab comes back', () => {
    const t = setup();
    t.tab('stats');
    t.gmcp('Char.Vitals', { opponent: 'a troll' });
    expect(t.info.open).toBe(1);
    expect(t.selected()).toBe('status');
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

  it('tooltips only where part D lists them', () => {
    const t = setup();
    t.answer();
    t.tab('stats');
    t.tab('lore');
    t.tab('status');
    const tipped = [...t.pane.content.querySelectorAll<HTMLElement>('[data-tip]')].map((e) => e.dataset.tipKey).sort();
    expect(tipped).toEqual(
      ['ring', 'sneak', 'ride', 'climb', 'swim', 'position', 'mood', 'casts', 'alertness', 'weight', 'hp', 'str', 'int', 'wis', 'dex', 'con', 'wil', 'per']
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
    expect([...t.pane.content.querySelectorAll('.wc-cc-sv')].map((e) => e.textContent)).toEqual(['81', '13', '85', '70']);
    t.tab('lore');
    expect(t.q('[data-key="race"] .wc-cc-bv').textContent).toBe('Tarkhnarb orc');
    expect(t.q('[data-key="citizen"] .wc-cc-bv').textContent).toBe('GoblinTown');
  });

  it('off says so', () => {
    const t = setup();
    t.settings.update({ character: { fetchInfo: false } });
    t.flush();
    t.tab('stats');
    expect(t.q('.wc-cc-quiet').textContent).toContain('off');
  });

  it('the fight: Status, the bars’ mode, the swords, and a tab that still works', () => {
    const t = setup();
    t.answer();
    t.tab('lore');
    t.gmcp('Char.Vitals', { opponent: 'a troll' });
    expect(t.q('.wc-cc').hasAttribute('data-fight')).toBe(true);
    expect(t.q('[data-click="position"]').getAttribute('aria-label')).toBe('Fighting');
    expect(t.selected()).toBe('status');
    t.tab('stats');
    expect(t.selected()).toBe('stats');
    expect(t.info.open).toBe(1);
    t.gmcp('Char.Vitals', { opponent: null });
    expect(t.selected()).toBe('lore');
    expect(t.q('.wc-cc').hasAttribute('data-fight')).toBe(false);
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

describe('the stones (stage 77 F2a)', () => {
  it('rebuilt after a Timers, a group or a switch change; nothing drawn yet', () => {
    const t = setup();
    const empty = t.pane.stones;
    expect(empty.stones).toEqual([]);
    expect(empty.canStartHerb).toBe(true);
    expect(t.pane.stones).toBe(empty);
    const html = t.pane.content.innerHTML;
    t.gmcp('Group.Set', [{ id: 1, type: 'you', name: 'Rasta', poison: true }]);
    expect(t.pane.stones.stones.map((s) => s.id)).toEqual(['flag:poison']);
    t.game.timers.addHerb('Healing');
    t.flush();
    const v = t.pane.stones;
    expect(v.stones.map((s) => s.kind)).toEqual(['herb', 'flag']);
    expect(v.stones[0]!.herbKey).toBe('Healing');
    expect(t.pane.stones).toBe(v);
    t.settings.update({ character: { stones: { flags: false } } });
    t.flush();
    expect(t.pane.stones.stones.map((s) => s.kind)).toEqual(['herb']);
    // F2a draws nothing: the card is as it was.
    expect(t.pane.content.innerHTML).toBe(html);
  });

  it('read-only in a log player', () => {
    const t = setup({ player: true });
    expect(t.pane.stones.canStartHerb).toBe(false);
  });
});
