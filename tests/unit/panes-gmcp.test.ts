// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import { GameState } from '../../src/gmcp/state';
import { CharacterPane } from '../../src/panes/character';
import { createPaneContext } from '../../src/panes/context';
import { CellLine, centre } from '../../src/panes/grid';
import { GroupPane } from '../../src/panes/group';
import { paneShade } from '../../src/panes/shade';
import { PANE_FACTORIES } from '../../src/panes/factories';
import { TimersPane } from '../../src/panes/timers';
import { SettingsStore } from '../../src/settings';
import { defaultSettings } from '../../src/settings/types';

describe('shade ramp', () => {
  it('is resolved from the pane colour each call, dark or light', () => {
    const s = defaultSettings();
    s.panes.group.color = 'green';
    const a = paneShade(s, 'group');
    expect(a.light).toBe(false);
    expect(a.bg).toBe('#0e1a0e');
    s.panes.group.color = 'purple';
    const b = paneShade(s, 'group');
    expect(b.ramp.track).not.toBe(a.ramp.track);
    s.panes.group.color = 'black';
    s.appearance.bg = '#f4ecd8'; // paper
    const c = paneShade(s, 'group');
    expect(c.light).toBe(true);
    expect(c.ramp.track).not.toBe(b.ramp.track);
  });
});

describe('grid', () => {
  it('centres and merges runs', () => {
    expect(centre('ab', 5)).toBe(' ab  ');
    expect(centre('abcdef', 3)).toBe('abc');
    const l = new CellLine(6).put(1, 'xyz', { fg: '#111111' }).fill(0, 2, { bg: '#222222' });
    expect(l.text()).toBe(' xyz  ');
    const el = l.toElement(document);
    expect(el.className).toBe('wc-prow');
    expect([...el.childNodes].map((n) => n.textContent)).toEqual([' ', 'x', 'yz', '  ']);
  });
});

describe('Character card', () => {
  function drawn(vitals: object, o: { w?: number; h?: number; name?: boolean } = {}) {
    const game = new GameState();
    if (o.name !== false) {
      game.onGmcp('Char.Name', { name: 'khazdul' });
      game.onGmcp('Char.StatusVars', { race: 'Dwarf' });
      game.onGmcp('Char.Vitals', vitals);
    }
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({ doc: document, game, requestFrame: (cb) => frames.push(cb), connState: () => 'playing' });
    const p = new CharacterPane(ctx);
    const w = o.w ?? 31;
    const h = o.h ?? 9;
    p.place({ rect: { x: 0, y: 0, w, h }, content: { x: 0, y: 0, w, h }, framed: false }, { w: 8, h: 16 });
    while (frames.length) frames.shift()!();
    const q = (sel: string): HTMLElement => p.content.querySelector<HTMLElement>(sel)!;
    return { p, q };
  }
  const FULL = { xp: 5_440_000, tp: 40_000, mood: 'brave', alertness: 'normal', position: 'standing', wimpy: 50, maxhp: 200, sneak: 's', swim: false };

  it('draws name, level, toggles, mood, alertness, position and wimpy', () => {
    const { p, q } = drawn(FULL);
    expect(q('.wc-cc-name').textContent).toBe('Khazdul');
    expect(q('.wc-cc-level').textContent).toBe('25');
    expect(q('[data-click="sneak"]').hasAttribute('data-on')).toBe(true);
    expect(q('[data-click="swim"]').hasAttribute('data-on')).toBe(false);
    expect(q('[data-key="mood"] .wc-cc-word').textContent).toBe('brave');
    // At 31 cells `normal` may be its short form.
    expect(['normal', 'norm.']).toContain(q('[data-key="alertness"] .wc-cc-word').textContent);
    expect(q('[data-click="position"]').getAttribute('aria-label')).toBe('Standing');
    // The wimpy arrow at 50/200, the XP ring with nothing gained yet, the TP ring.
    expect(q('.wc-cc-wimpy').style.getPropertyValue('--p')).toBe('25');
    expect(q('.wc-cc-ring-base').hasAttribute('data-none')).toBe(false);
    expect(q('.wc-cc-ring-gain').hasAttribute('data-none')).toBe(true);
    expect(q('.wc-cc-ring-tp').hasAttribute('data-none')).toBe(false);
    p.dispose();
  });

  it('shows — and empty bars and rings when nothing is known', () => {
    const { p, q } = drawn({}, { name: false });
    expect(q('.wc-cc-name').textContent).toBe('—');
    expect(q('.wc-cc-level').textContent).toBe('—');
    for (const f of p.content.querySelectorAll('.wc-cc-word')) expect(f.textContent).toBe('—');
    for (const n of p.content.querySelectorAll('.wc-cc-vn')) expect(n.textContent).toBe('');
    for (const f of p.content.querySelectorAll<HTMLElement>('.wc-cc-fill')) expect(f.style.getPropertyValue('--p')).toBe('0');
    expect(q('.wc-cc-wimpy').hidden).toBe(true);
    expect(q('.wc-cc-ring-base').hasAttribute('data-none')).toBe(true);
    p.dispose();
  });

  it('an unknown position is named and takes no click', () => {
    const { p, q } = drawn({ position: 'flying' });
    expect(q('[data-click="position"]').getAttribute('aria-label')).toBe('Flying');
    expect(q('[data-click="position"]').getAttribute('aria-disabled')).toBe('true');
    p.dispose();
  });

  it('four rows still show Status and the vitals inside the box', () => {
    const { p, q } = drawn(FULL, { h: 4 });
    expect(q('.wc-cc').dataset.mode).toBe('small');
    expect(q('.wc-cc-status').hidden).toBe(false);
    const px = (e: HTMLElement, k: 'top' | 'height'): number => parseFloat(e.style[k]);
    expect(px(q('.wc-cc-foot'), 'top') + px(q('.wc-cc-foot'), 'height')).toBeLessThanOrEqual(64);
    expect(px(q('.wc-cc-main'), 'top') + px(q('.wc-cc-main'), 'height')).toBeLessThanOrEqual(px(q('.wc-cc-foot'), 'top'));
    p.dispose();
  });
});

describe('panes on the context', () => {
  function setup(state: 'playing' | 'idle' = 'playing') {
    const bus = new Bus();
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    // The Spells pane's Herblores, Buffs and Debuffs on, as before they were off by default (ADR 0166 point 172).
    settings.update({ timers: { groups: { herb: { enabled: true }, buff: { enabled: true }, debuff: { enabled: true } } } });
    const game = new GameState().attach(bus);
    const frames: (() => void)[] = [];
    const ctx = createPaneContext({ doc: document, bus, settings, game, requestFrame: (cb) => frames.push(cb), connState: () => state });
    const flush = () => {
      while (frames.length) frames.shift()!();
    };
    return { bus, settings, game, ctx, flush };
  }
  const place = (p: { place: CharacterPane['place'] }, w: number, h: number) =>
    p.place({ rect: { x: 0, y: 0, w, h }, content: { x: 0, y: 0, w, h }, framed: false }, { w: 8, h: 16 });

  it('Character renders from GMCP once per frame, blanks when inactive', () => {
    const t = setup();
    const p = new CharacterPane(t.ctx);
    place(p, 31, 9);
    t.bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'rasta' } });
    t.bus.emit('gmcp', { pkg: 'Char.Vitals', data: { mood: 'brave' } });
    t.flush();
    expect(p.content.querySelectorAll('.wc-cc')).toHaveLength(1);
    expect(p.content.textContent).toContain('Rasta');
    expect(p.content.textContent).toContain('brave');
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.flush();
    expect(p.content.textContent).toBe('');
    p.dispose();
  });

  it('Group applies the display options live', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 31, 6);
    t.bus.emit('gmcp', {
      pkg: 'Group.Set',
      data: [
        { id: 2, type: 'ally', name: 'Gibur' },
        { id: 3, type: 'npc', name: 'a dog', label: 0 },
        { id: 4, type: 'npc', name: 'a merc', label: 'M' },
      ],
    });
    t.flush();
    const names = () => [...p.content.querySelectorAll<HTMLElement>('.wc-gp-row[data-name]')].map((r) => r.dataset.name);
    expect(names()).toEqual(['Gibur', 'a merc (M)']);
    t.settings.update({ group: { npcMode: 'all' } });
    t.flush();
    expect(names()).toEqual(['Gibur', 'a dog', 'a merc (M)']);
    t.settings.update({ group: { showPlayers: false, npcMode: 'off' } });
    t.flush();
    expect(names()).toEqual([]);
    // Canonical set unchanged.
    expect(t.game.group.list().map((m) => m.id)).toEqual([2, 4]);
    p.dispose();
  });

  it('Group: a new vital keeps the row and sets the bar in place; a new status rebuilds it', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 40, 8);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 2, type: 'ally', name: 'Gibur', hp: 100, maxhp: 200 }] });
    t.flush();
    const row = () => p.content.querySelector<HTMLElement>('[data-key="m2"]')!;
    const hp = () => row().querySelector<HTMLElement>('.wc-gp-bar[data-kind="hp"]')!;
    const first = row();
    expect(hp().querySelector<HTMLElement>('.wc-gp-fill')!.style.getPropertyValue('--p')).toBe('50');
    t.bus.emit('gmcp', { pkg: 'Group.Update', data: { id: 2, hp: 150 } });
    t.flush();
    expect(row()).toBe(first);
    expect(hp().querySelector<HTMLElement>('.wc-gp-fill')!.style.getPropertyValue('--p')).toBe('75');
    expect(hp().dataset.tipTitle).toBe('HP 150/200 · 75%');
    t.bus.emit('gmcp', { pkg: 'Group.Update', data: { id: 2, poison: true } });
    t.flush();
    expect(row()).not.toBe(first);
    p.dispose();
  });

  it('Timers: Pulse lands on a long spell under warnAt (the item, so its icon pulses too)', () => {
    const t = setup();
    const p = PANE_FACTORIES.timers(t.ctx) as TimersPane;
    place(p, 40, 8);
    const now = Date.now();
    t.settings.update({ timers: { signal: 'pulse', warnAt: 20 } });
    t.game.timers.debugAdd({ id: 'armour', name: 'armour', group: 'spell', startedAt: now - 585_000, expiresAt: now + 15_000, expected: 600_000, tracked: true });
    t.game.timers.debugAdd({ id: 'shield', name: 'shield', group: 'spell', startedAt: now, expiresAt: now + 300_000, expected: 600_000, tracked: true });
    t.flush();
    const item = (id: string) => p.content.querySelector<HTMLElement>(`.wc-tm-list [data-id="${id}"]:not(button)`)!;
    expect(item('armour').classList.contains('is-pulse')).toBe(true);
    expect(item('armour').querySelector('.wc-tm-ic')).not.toBeNull();
    expect(item('shield').classList.contains('is-pulse')).toBe(false);
    t.settings.update({ timers: { style: 'circles' } });
    t.flush();
    expect(item('armour').classList.contains('is-pulse')).toBe(true);
    expect(item('armour').querySelector('.wc-tm-ii')).not.toBeNull();
    p.dispose();
  });

  it('Timers draws game.timers, follows the options and handles clicks', () => {
    const t = setup();
    const p = PANE_FACTORIES.timers(t.ctx) as TimersPane;
    expect(p).toBeInstanceOf(TimersPane);
    place(p, 40, 8);
    const now = Date.now();
    const cell = (id: string, group: 'spell' | 'blind' | 'charm') =>
      ({ id, name: id, group, startedAt: now, expiresAt: now + 60_000, expected: 60_000, tracked: true }) as const;
    t.game.timers.debugAdd({ ...cell('armour', 'spell') });
    t.game.timers.debugAdd({ ...cell('a dark-skinned orc', 'blind') });
    t.game.timers.debugAdd({ ...cell('troll', 'charm') });
    t.game.timers.debugHerbs([{ key: 'healing', name: 'Healing' }]);
    t.flush();
    const groups = () => [...p.content.querySelectorAll<HTMLElement>('.wc-tm-g')].map((g) => g.dataset.group);
    const names = () => [...p.content.querySelectorAll('.wc-tm-list .wc-tm-n')].map((n) => n.textContent);
    // Herblore is there while enabled, even empty (its header holds the +).
    expect(groups()).toEqual(['herb', 'spell', 'blind', 'charm']);
    expect(names()).toEqual(['Armour', 'dark-skinned orc', 'Troll']);
    // Headers: the group name only (no count); Herblore's has its +.
    const heads = [...p.content.querySelectorAll<HTMLElement>('.wc-tm-h')];
    expect(heads.map((h) => h.textContent)).toEqual(['Herblores+', 'Spells', 'Blinds', 'Charmies']);
    // Bars by default: a pill with a fill; the time text is on.
    const chip = p.content.querySelector<HTMLElement>('.wc-tm-chip[data-id="spell:armour"], .wc-tm-chip[data-id="armour"]')!;
    expect(chip.querySelector<HTMLElement>('.wc-tm-fill')!.style.getPropertyValue('--p')).toMatch(/^(100\.0|9\d\.\d)$/);
    expect(chip.querySelector('.wc-tm-t')!.textContent).toMatch(/^(59|60)s$/);
    expect(chip.dataset.tipTitle).toBe('Armour');
    // Circles: a ring row; headers off hide them; a group off goes.
    t.settings.update({ timers: { style: 'circles', groups: { blind: { enabled: false } }, headers: false } });
    t.flush();
    expect(groups()).toEqual(['herb', 'spell', 'charm']);
    expect(p.content.querySelectorAll('.wc-tm-rc')).toHaveLength(2);
    expect(p.content.querySelectorAll('.wc-tm-chip')).toHaveLength(0);
    // Headers off: all hidden but Herblore's.
    const shown = [...p.content.querySelectorAll<HTMLElement>('.wc-tm-h')].filter((h) => !h.hidden);
    expect(shown.map((h) => h.textContent)).toEqual(['Herblores+']);
    // × forgets the charmie.
    p.content.querySelector('.wc-tm-x')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(groups()).toEqual(['herb', 'spell']);
    // Herblore's + opens the menu; a pick starts the herb and closes it.
    const add = p.content.querySelector<HTMLElement>('.wc-tm-add')!;
    expect(add.hidden).toBe(false);
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(p.herbMenuOpen).toBe(true);
    const row = () => p.herbMenuEl.querySelector<HTMLButtonElement>('.wc-tm-mi')!;
    expect(row().textContent).toBe('+Healing');
    row().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(p.herbMenuOpen).toBe(false);
    // The herblore tracker starts the herb (its first phase's cell).
    expect(names()).toEqual(['Healing', 'Armour']);
    // Running: checked in the menu, not pickable; Esc closes the menu.
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(row().disabled).toBe(true);
    expect(row().textContent).toBe('✓Healing');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(p.herbMenuOpen).toBe(false);
    // An outside press closes it too.
    add.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    expect(p.herbMenuOpen).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(p.herbMenuOpen).toBe(false);
    // The herb's × stops it.
    p.content.querySelector<HTMLElement>('.wc-tm-x.is-herb')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    t.flush();
    expect(names()).toEqual(['Armour']);
    // Herblore off: no group, no +.
    t.settings.update({ timers: { groups: { herb: { enabled: false } } } });
    t.flush();
    expect(groups()).toEqual(['spell']);
    // A disconnect blanks the pane.
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    t.flush();
    expect(p.content.textContent).toBe('');
    p.dispose();
  });

  it('Timers in a log player: no Herblore + and no charm ×', () => {
    const t = setup();
    (t.ctx as { player?: boolean }).player = true;
    const p = new TimersPane(t.ctx);
    place(p, 40, 8);
    const now = Date.now();
    t.game.timers.debugAdd({ id: 'troll', name: 'troll', group: 'charm', startedAt: now, expiresAt: now + 60_000, expected: 60_000, tracked: true });
    t.flush();
    expect(p.content.querySelector<HTMLElement>('.wc-tm-add')!.hidden).toBe(true);
    expect(p.content.querySelector('.wc-tm-x')).toBeNull();
    p.dispose();
  });

  describe('Timers: the herblore and charm × on touch (G7c, ADR 0166 point 163)', () => {
    afterEach(() => {
      vi.useRealTimers();
      document.body.innerHTML = '';
    });
    /** A tap or a mouse press: the pointer's events, then the (emulated) mousedown. */
    const press = (t: ReturnType<typeof setup>, e: Element, pointerType: 'touch' | 'mouse' | 'pen'): void => {
      for (const type of ['pointerover', 'pointerdown', 'pointerup']) e.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType }));
      e.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      t.flush();
    };
    const touchSetup = () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_790_000_000_000);
      const t = setup();
      const p = new TimersPane(t.ctx);
      document.body.append(p.el);
      place(p, 40, 8);
      const now = Date.now();
      t.game.timers.debugAdd({ id: 'troll', name: 'troll', group: 'charm', startedAt: now, expiresAt: now + 600_000, expected: 600_000, tracked: true });
      t.game.timers.debugAdd({ id: 'armour', name: 'armour', group: 'spell', startedAt: now, expiresAt: now + 600_000, expected: 600_000, tracked: true });
      t.game.timers.addHerb('Healing');
      t.flush();
      const row = (sel: string): HTMLElement => p.content.querySelector<HTMLElement>(`.wc-tm-items > ${sel}`)!;
      const herb = (): HTMLElement => row('.has-herbx');
      const charm = (): HTMLElement | null => p.content.querySelector<HTMLElement>('.wc-tm-items > [data-id="troll"]');
      const herbOn = (): boolean | undefined => t.game.timers.view(Date.now()).herbs.find((h) => h.key === 'Healing')?.active;
      const wait = (ms: number): void => {
        vi.advanceTimersByTime(ms);
        t.flush();
      };
      expect(herbOn()).toBe(true);
      expect(charm()).not.toBeNull();
      return { t, p, herb, charm, herbOn, wait };
    };

    it('herblore: the first tap shows the × and stops nothing, even on the ×; a tap on the shown row stops', () => {
      const { t, p, herb, herbOn } = touchSetup();
      press(t, herb().querySelector('.wc-tm-x')!, 'touch');
      expect(herbOn()).toBe(true);
      expect(herb().hasAttribute('data-armed')).toBe(true);
      expect(p.content.querySelector('.wc-tm')!.hasAttribute('data-touch')).toBe(true);
      press(t, herb().querySelector('.wc-tm-x')!, 'touch');
      expect(herbOn()).toBe(false);
      expect(p.armedId).toBeNull();
      p.dispose();
    });

    it('charm: the first tap shows the ×, the second forgets the charmie; a pen counts as touch', () => {
      const { t, p, charm } = touchSetup();
      press(t, charm()!.querySelector('.wc-tm-n')!, 'pen');
      expect(charm()!.hasAttribute('data-armed')).toBe(true);
      expect(t.game.timers.view(Date.now()).cells.charm).toHaveLength(1);
      press(t, charm()!.querySelector('.wc-tm-x')!, 'pen');
      expect(charm()).toBeNull();
      expect(t.game.timers.view(Date.now()).cells.charm).toHaveLength(0);
      p.dispose();
    });

    it('an untapped × goes after 3 s, on the pane\'s own tick; then a tap arms again', () => {
      const { t, p, herb, charm, herbOn, wait } = touchSetup();
      // The tooltip's show delay starts on the pointer's over: counted first.
      charm()!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'touch' }));
      const timers = vi.getTimerCount();
      press(t, charm()!, 'touch');
      expect(p.armedId).toBe('troll');
      // No timer of its own: the pane's one tick is all there is.
      expect(vi.getTimerCount()).toBe(timers);
      wait(2900);
      expect(charm()!.hasAttribute('data-armed')).toBe(true);
      wait(1200);
      expect(charm()!.hasAttribute('data-armed')).toBe(false);
      expect(p.armedId).toBeNull();
      expect(charm()).not.toBeNull();
      press(t, charm()!.querySelector('.wc-tm-x')!, 'touch');
      expect(charm()!.hasAttribute('data-armed')).toBe(true);
      // Another row's tap moves the arming; a tap elsewhere hides it.
      press(t, herb(), 'touch');
      expect(p.armedId).toBe(herb().dataset.id);
      expect(charm()!.hasAttribute('data-armed')).toBe(false);
      press(t, p.content.querySelector('.wc-tm-items > [data-id="armour"]')!, 'touch');
      expect(p.armedId).toBeNull();
      expect(herbOn()).toBe(true);
      expect(charm()).not.toBeNull();
      p.dispose();
    });

    it('the mouse is unchanged: one press on the × removes, no arming', () => {
      const { t, p, herb, charm, herbOn } = touchSetup();
      press(t, charm()!.querySelector('.wc-tm-x')!, 'mouse');
      expect(charm()).toBeNull();
      expect(p.content.querySelector('.wc-tm')!.hasAttribute('data-touch')).toBe(false);
      press(t, herb().querySelector('.wc-tm-x')!, 'mouse');
      expect(herbOn()).toBe(false);
      expect(p.armedId).toBeNull();
      p.dispose();
    });

    it('a mouse after a touch: the mouse\'s press removes at once', () => {
      const { t, p, herb, herbOn } = touchSetup();
      press(t, herb(), 'touch');
      expect(p.armedId).not.toBeNull();
      const x = herb().querySelector('.wc-tm-x')!;
      press(t, x, 'mouse');
      expect(herbOn()).toBe(false);
      p.dispose();
    });

    it('a row that goes takes the arming with it', () => {
      const { t, p, charm } = touchSetup();
      press(t, charm()!, 'touch');
      t.game.timers.dropCharm('troll');
      t.flush();
      expect(p.armedId).toBeNull();
      p.dispose();
    });
  });

  it('keeps the last picture after a replay ends until the next connection', () => {
    const t = setup();
    const p = new GroupPane(t.ctx);
    place(p, 31, 6);
    t.bus.emit('gmcp', { pkg: 'Group.Set', data: [{ id: 2, type: 'ally', name: 'Gibur' }] });
    t.flush();
    t.bus.emit('conn.state', { state: 'disconnected', prev: 'playing', replay: true });
    t.flush();
    expect(p.active).toBe(true);
    expect(p.content.textContent).toContain('Gibur');
    t.bus.emit('conn.state', { state: 'connecting', prev: 'disconnected', replay: true });
    t.flush();
    expect(p.active).toBe(false);
    expect(p.content.textContent).toBe('');
    expect(t.game.group.list()).toEqual([]);
    p.dispose();
  });
});
