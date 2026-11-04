// Stage 39c (ADR 0122): the Timers pane's model — groups, items, kinds,
// time text, ending soon, sorting, layouts, Auto columns and the blind
// name shortening.
import { describe, expect, it } from 'vitest';
import {
  MIN_NAME_CHARS,
  autoCols,
  blindShort,
  itemGap,
  itemOverhead,
  nameRoom,
  soonestFirst,
  stripArticle,
  timersModel,
  timersTimed,
  type TimersModelInput,
} from '../../src/panes/timers-model';
import { ringDash } from '../../src/panes/icons';
import { timersIndicator } from '../../src/panes/timers';
import { DARK_COLORS, LIGHT_COLORS } from '../../src/panes/palette';
import { type TimersSettings, defaultTimersSettings } from '../../src/settings/types';
import { type TimerCell, type TimerGroup, emptyView } from '../../src/timers/entry';

const NOW = 1_000_000_000_000;

function cell(name: string, group: TimerGroup, secsLeft: number | null, o: Partial<TimerCell> = {}): TimerCell {
  const total = 600_000;
  return {
    id: `${group}:${name}`,
    name,
    group,
    startedAt: NOW - 1000,
    expiresAt: secsLeft === null ? null : NOW + secsLeft * 1000,
    expected: secsLeft === null ? null : total,
    tracked: true,
    ...o,
  };
}

/** The model's input. Herblore (always shown while enabled) is off: `herbOn` turns it on. */
function input(cells: TimerCell[], s: Partial<TimersSettings> = {}, o: Partial<TimersModelInput> = {}, herbOn = false): TimersModelInput {
  const view = emptyView();
  for (const c of cells) view.cells[c.group].push(c);
  const settings = { ...defaultTimersSettings(), ...s };
  settings.groups = { ...settings.groups, herb: { ...settings.groups.herb, enabled: herbOn } };
  return { view, settings, now: NOW, light: false, width: 400, charW: 8, ...o };
}

describe('blind names', () => {
  it('drops a leading article', () => {
    expect(stripArticle('a dark-skinned orc')).toBe('dark-skinned orc');
    expect(stripArticle('The captain')).toBe('captain');
    expect(stripArticle('another orc')).toBe('another orc');
  });

  it('shortens only when too long, in the middle, keeping the last word', () => {
    expect(blindShort('a warg', 10)).toBe('warg');
    expect(blindShort('the captain of the guard of Fornost', 40)).toBe('captain of the guard of Fornost');
    expect(blindShort('the captain of the guard of Fornost', 16)).toBe('captain…Fornost');
    expect(blindShort('a huge black-scaled warg', 15)).toBe('huge black…warg');
    // One long word: cut at the end.
    expect(blindShort('Ugluk-the-terrible', 8)).toBe('Ugluk-t…');
  });
});

describe('columns', () => {
  it('Auto picks the most columns (≤ 3) that keep the longest name, else two when that leaves room', () => {
    const over = itemOverhead('circles', true, true, false);
    const gap = itemGap('circles');
    expect(autoCols(12, 5, 50, over, gap)).toBe(3);
    expect(autoCols(12, 16, 50, over, gap)).toBe(2);
    expect(autoCols(2, 5, 50, over, gap)).toBe(2);
    expect(autoCols(1, 5, 50, over, gap)).toBe(1);
    // Too narrow for two columns of MIN_NAME_CHARS.
    expect(nameRoom(20, 2, over, gap)).toBeLessThan(MIN_NAME_CHARS);
    expect(autoCols(12, 16, 20, over, gap)).toBe(1);
  });
});

describe('timersModel', () => {
  it('lists the enabled, non-empty groups in order with their Auto colour per side', () => {
    const cells = [cell('armour', 'spell', 300), cell('sanctuary', 'sanct', 200), cell('2.orc', 'blind', 40)];
    const dark = timersModel(input(cells));
    expect(dark.map((g) => g.group)).toEqual(['sanct', 'spell', 'blind']);
    expect(dark[1]!.color).toBe(DARK_COLORS.spell);
    const light = timersModel(input(cells, {}, { light: true }));
    expect(light[1]!.color).toBe(LIGHT_COLORS.spell);
    const custom = timersModel(input(cells, { groups: { ...defaultTimersSettings().groups, spell: { enabled: true, color: '#123456', layout: 'default' } } }));
    expect(custom[1]!.color).toBe('#123456');
    const off = timersModel(input(cells, { groups: { ...defaultTimersSettings().groups, blind: { enabled: false, color: 'auto', layout: 'default' } } }));
    expect(off.map((g) => g.group)).toEqual(['sanct', 'spell']);
  });

  it('names and times: You for your sanctuary, the target for another, ~ when estimated', () => {
    const cells = [
      cell('sanctuary', 'sanct', 200),
      cell('gibur', 'sanct', 150, { id: 'sanct:7', name: 'Gibur', target: 'Gibur', estimated: true, expected: 270_000 }),
      cell('taube', 'sanct', null, { id: 'sanct:8', name: 'Taube', target: 'Taube', tracked: false }),
    ];
    const [g] = timersModel(input(cells));
    const items = g!.items;
    expect(items.map((t) => t.name)).toEqual(['Gibur', 'You', 'Taube']);
    expect(items.map((t) => t.kind)).toEqual(['timed', 'timed', 'untimed']);
    expect(items.map((t) => t.time)).toEqual(['~3m', '3m', '?']);
    expect(items[0]!.tip).toContain('about 2:30 left');
    expect(items[0]!.tip).toContain('Timed from your cast');
    expect(items[2]!.tip).toContain('Not cast by you');
  });

  it('time text: seconds at 90 s or less, minutes above; off hides it', () => {
    const cells = [cell('bless', 'spell', 85), cell('armour', 'spell', 95), cell('shield', 'spell', 4000)];
    const [g] = timersModel(input(cells));
    expect(g!.items.map((t) => t.time)).toEqual(['85s', '2m', '1h07']);
    const [h] = timersModel(input(cells, { timeText: false }));
    expect(h!.items.every((t) => t.time === null)).toBe(true);
  });

  it('ending soon: the chosen signal at warnAt or less, never a colour change', () => {
    const cells = [cell('bless', 'spell', 15), cell('armour', 'spell', 25)];
    const [g] = timersModel(input(cells, { warnAt: 20, signal: 'text' }));
    expect(g!.items.map((t) => t.ending)).toEqual(['text', null]);
    const [p] = timersModel(input(cells, { warnAt: 30, signal: 'pulse' }));
    expect(p!.items.map((t) => t.ending)).toEqual(['pulse', 'pulse']);
    const [n] = timersModel(input(cells, { warnAt: 60, signal: 'none' }));
    expect(n!.items.map((t) => t.ending)).toEqual([null, null]);
  });

  it('every timed item crosses warnAt the same way (a long spell too); untimed and charmies never', () => {
    const cells = [
      cell('armour', 'spell', 15), // a 10-minute spell with 15 s left: a sliver of fill
      cell('miruvor', 'buff', 15),
      cell('winded', 'debuff', 15),
      cell('fireball', 'stored', 15),
      cell('Haste', 'herb', 15, { herbKey: 'Haste', phase: 'buff' }),
      cell('sanctuary', 'sanct', 15),
      cell('an orc', 'blind', 15),
      cell('hunger', 'debuff', null, { tracked: false }),
      cell('troll', 'charm', 15),
    ];
    const groups = timersModel(input(cells, { warnAt: 20, signal: 'pulse', soonestFirst: false }, {}, true));
    const ending = Object.fromEntries(groups.flatMap((g) => g.items.map((t) => [t.id, t.ending])));
    for (const id of ['spell:armour', 'buff:miruvor', 'debuff:winded', 'stored:fireball', 'herb:Haste', 'sanct:sanctuary', 'blind:an orc']) expect(ending[id]).toBe('pulse');
    expect(ending['debuff:hunger']).toBeNull();
    expect(ending['charm:troll']).toBeNull();
  });

  it('soonest first sorts timed by time left, then still, then untimed; off keeps the hub order', () => {
    const cells = [
      cell('still', 'buff', null),
      cell('late', 'buff', 500),
      cell('hunger', 'buff', null, { tracked: false }),
      cell('soon', 'buff', 20),
    ];
    const [g] = timersModel(input(cells));
    expect(g!.items.map((t) => t.full)).toEqual(['Soon', 'Late', 'Still', 'Hunger']);
    const [h] = timersModel(input(cells, { soonestFirst: false }));
    expect(h!.items.map((t) => t.full)).toEqual(['Still', 'Late', 'Hunger', 'Soon']);
    expect(soonestFirst([])).toEqual([]);
  });

  it('charmies count up, can be forgotten, and keep their order', () => {
    const c = cell('huge stone troll', 'charm', 3000, { startedAt: NOW - 21 * 60_000 });
    const [g] = timersModel(input([c]));
    expect(g!.items[0]).toMatchObject({ kind: 'charm', name: 'Huge stone troll', time: '21m', remove: 'charm' });
  });

  it('layout: the global one or the group override; grid columns Auto or a cap', () => {
    const blinds = Array.from({ length: 12 }, (_, i) => cell(`orc${i}`, 'blind', 30 + i));
    const groups = defaultTimersSettings().groups;
    const [flow] = timersModel(input(blinds));
    expect(flow).toMatchObject({ layout: 'flow', cols: 1 });
    const [grid] = timersModel(input(blinds, { layout: 'grid' }));
    expect(grid!.layout).toBe('grid');
    expect(grid!.cols).toBe(3);
    const [cap] = timersModel(input(blinds, { layout: 'grid', cols: 2 }));
    expect(cap!.cols).toBe(2);
    const [own] = timersModel(input(blinds, { groups: { ...groups, blind: { enabled: true, color: 'auto', layout: 'grid' } } }));
    expect(own!.layout).toBe('grid');
    // A cap never makes more columns than items.
    const [few] = timersModel(input(blinds.slice(0, 2), { layout: 'grid', cols: 6 }));
    expect(few!.cols).toBe(2);
  });

  it('blinds: long names shortened only when needed', () => {
    const blinds = [
      cell('the captain of the guard of Fornost', 'blind', 40),
      cell('a warg', 'blind', 4),
      cell('a huge black-scaled warg', 'blind', 70),
    ];
    const [wide] = timersModel(input(blinds, { layout: 'grid', cols: 1 }, { width: 600 }));
    expect(wide!.items.map((t) => t.name)).toEqual(['warg', 'captain of the guard of Fornost', 'huge black-scaled warg']);
    const [narrow] = timersModel(input(blinds, { layout: 'grid', cols: 2 }, { width: 400 }));
    const names = narrow!.items.map((t) => t.name);
    expect(names[0]).toBe('warg');
    expect(names[1]).toMatch(/^captain.*…Fornost$/);
    expect(narrow!.items[1]!.full).toBe('the captain of the guard of Fornost');
    // With headers on, blinds leave the icon to the header.
    expect(narrow!.items.every((t) => !t.chipIcon)).toBe(true);
  });

  it('other names are never cut by the model', () => {
    const [g] = timersModel(input([cell('breath of briskness and more words', 'spell', 30)], { layout: 'grid', cols: 6 }, { width: 80 }));
    expect(g!.items[0]!.name).toBe('Breath of briskness and more words');
  });

  it('untracked items are untimed; something counting is timed', () => {
    const cells = [cell('Miruvor', 'buff', 100), cell('hunger', 'debuff', null, { tracked: false })];
    const g = timersModel(input(cells));
    expect(g[1]!.items[0]).toMatchObject({ kind: 'untimed', time: '?' });
    expect(timersTimed(g)).toBe(true);
    expect(timersTimed(timersModel(input([cells[1]!])))).toBe(false);
  });

  it('Herblore (owner round 1): shown while enabled, also empty; its header pinned with the +; items carry the × and the phase icon', () => {
    // Empty, headers off: still there, header pinned, the + offered.
    const [empty] = timersModel(input([], { headers: false }, {}, true));
    expect(empty).toMatchObject({ group: 'herb', label: 'Herblores', icon: 'herb', pinnedHeader: true, addHerb: true, items: [] });
    // Off: gone.
    expect(timersModel(input([]))).toEqual([]);
    // Its own Auto colour, unlike Buffs on both sides.
    expect(empty!.color).toBe(DARK_COLORS.herb);
    expect(DARK_COLORS.herb).not.toBe(DARK_COLORS.buff);
    expect(LIGHT_COLORS.herb).not.toBe(LIGHT_COLORS.buff);
    const cells = [
      cell('Healing', 'herb', 100, { id: 'herb:Healing', herbKey: 'Healing', phase: 'buff' }),
      cell('Haste (recovery)', 'herb', 900, { id: 'herb:Haste', herbKey: 'Haste', phase: 'debuff' }),
    ];
    const [g] = timersModel(input(cells, {}, {}, true));
    expect(g!.items.map((t) => [t.name, t.icon, t.remove, t.herbKey])).toEqual([
      ['Healing', 'herb', 'herb', 'Healing'],
      ['Haste (recovery)', 'debuff', 'herb', 'Haste'],
    ]);
    expect(g!.items[1]!.tip).toContain('Herblore, a debuff phase.');
    // Other groups have no pinned header and no +; a charm's × forgets it.
    const [c] = timersModel(input([cell('troll', 'charm', null)]));
    expect(c).toMatchObject({ pinnedHeader: false, addHerb: false });
    expect(c!.items[0]!.remove).toBe('charm');
  });
});

describe('pane helpers', () => {
  it('ring dash and the indicator text', () => {
    expect(ringDash(0)).toBe('0.00 62.83');
    expect(ringDash(1)).toBe('62.83 62.83');
    expect(ringDash(2)).toBe('62.83 62.83');
    expect(timersIndicator(0, 0)).toBeNull();
    expect(timersIndicator(0, 3)).toEqual({ text: '↓ 3 more timers', up: false });
    expect(timersIndicator(1, 3)).toEqual({ text: '↑ 1 timer above', up: true });
  });
});
