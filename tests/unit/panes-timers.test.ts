import { describe, expect, it } from 'vitest';
import {
  BAR_INK,
  CHARM_X_FG,
  CHARM_X_HOVER,
  CORNER_FG,
  CORNER_HOVER,
  DEPLETED_FG,
  HERB_ADD,
  HERB_REMOVE,
  STORED_UNTRACKED,
  UNTRACKED_FG,
  type TimersLayoutInput,
  cellWidths,
  charmName,
  clockContent,
  effectiveCols,
  timersIndicator,
  timersLayout,
} from '../../src/panes/timers';
import { INDICATOR_FG } from '../../src/panes/grid';
import { TIMER_COLOR_HEX, defaultTimersSettings } from '../../src/settings/types';
import { type TimerCell, type TimerGroup, emptyView } from '../../src/timers/entry';
import { lightShift } from '../../src/theme/color';

const NOW = 1_000_000_000_000;
const BLUE = TIMER_COLOR_HEX.blue;

function cell(name: string, group: TimerGroup, o: Partial<TimerCell> = {}): TimerCell {
  return { id: `${group}:${name}`, name, group, startedAt: NOW, expiresAt: NOW + 60_000, expected: 60_000, tracked: true, ...o };
}

function input(cells: TimerCell[], o: Partial<TimersLayoutInput> = {}): TimersLayoutInput {
  const view = emptyView();
  for (const c of cells) view.cells[c.group].push(c);
  return {
    view,
    settings: defaultTimersSettings(),
    now: NOW,
    w: 40,
    h: 10,
    mode: 'grid',
    light: false,
    bg: '#000000',
    dim: '#444444',
    hover: null,
    ...o,
  };
}

const texts = (inp: TimersLayoutInput): string[] => timersLayout(inp).lines.map((l) => l.text().trimEnd());

describe('timers grid maths', () => {
  it('caps columns and splits widths with the remainder to the first cells', () => {
    expect(effectiveCols(4, 0)).toBe(1);
    expect(effectiveCols(4, 1)).toBe(1);
    expect(effectiveCols(4, 3)).toBe(3);
    expect(effectiveCols(4, 9)).toBe(4);
    expect(cellWidths(40, 4)).toEqual([10, 10, 10, 10]);
    expect(cellWidths(42, 4)).toEqual([11, 11, 10, 10]);
    expect(cellWidths(7, 3)).toEqual([3, 2, 2]);
  });

  it('runs the countdown ladder A / B / C', () => {
    expect(clockContent('ARMOUR', '12s', 12)).toBe('ARMOUR   12s');
    expect(clockContent('ARMOUR', '12s', 10)).toBe('ARMOUR 12s');
    expect(clockContent('ARMOUR', '12s', 9)).toBe('ARMOUR12s'); // B: no gap
    expect(clockContent('ARMOUR', '12s', 6)).toBe('ARM12s'); // B: 3 name chars
    expect(clockContent('ARMOUR', '12s', 5)).toBe('ARMOU'); // C
    expect(clockContent('AB', '12s', 4)).toBe('AB  '); // C
  });

  it('capitalises only the first letter of charm names', () => {
    expect(charmName('huge stone troll')).toBe('Huge stone troll');
    expect(charmName('a McGuffin')).toBe('A McGuffin');
  });
});

describe('timersLayout', () => {
  it('draws headers, a lone item full width and a 4-up grid', () => {
    const spells = ['sanctuary', 'shield', 'armour', 'bless', 'strength'].map((n) => cell(n, 'spell'));
    const l = timersLayout(input([...spells, cell('2.orc', 'blind')]));
    expect(l.lines.map((x) => x.text().trimEnd())).toEqual([
      'Spells:                                +',
      'SANCTUARY▌SHIELD   ▌ARMOUR   ▌BLESS    ▌',
      'STRENGTH ▌', // a partial row ends after its last cell
      'Blinds:',
      '2.ORC                                  ▌',
    ]);
    expect(l.corner).toBe('+');
    expect(l.timed).toBe(true);
    expect(l.lines[0]!.fg[39]).toBe(CORNER_FG);
    expect(l.zones).toEqual([{ row: 0, x0: 39, x1: 40, hit: { kind: 'corner' } }]);
    // Headers off, compact off: a blank row between groups, none on top.
    const s = defaultTimersSettings();
    s.headers = false;
    s.compact = false;
    expect(texts(input([cell('armour', 'spell'), cell('2.orc', 'blind')], { settings: s }))).toEqual([
      'ARMOUR                                 +',
      '',
      '2.ORC                                  ▌',
    ]);
  });

  it('drains bars (round half up) and draws the separator only when full', () => {
    const s = defaultTimersSettings();
    s.headers = false;
    // 10-cell cells: 45 % → 4.5 → 5 filled; full → separator.
    const half = cell('armour', 'spell', { expiresAt: NOW + 27_000, expected: 60_000 });
    const full = cell('bless', 'spell', { expiresAt: NOW + 60_000, expected: 60_000 });
    const indefinite = cell('sanctuary', 'spell', { expiresAt: null, expected: null });
    const over = cell('shield', 'spell', { expiresAt: NOW - 5_000 });
    const l = timersLayout(input([full, half, indefinite, over], { settings: s, w: 40 }));
    const row = l.lines[0]!;
    // Order is the given order (the hub sorts).
    expect(row.text()).toBe('BLESS    ▌ARMOUR    SANCTUARY▌SHIELD   +');
    expect(row.bg.slice(0, 9).every((b) => b === BLUE)).toBe(true);
    expect(row.fg[9]).toBe(BLUE); // ▌ in the group colour, no background
    expect(row.bg[9]).toBe('');
    expect(row.bg.slice(10, 20)).toEqual([BLUE, BLUE, BLUE, BLUE, BLUE, '', '', '', '', '']);
    expect(row.fg[10]).toBe(BAR_INK);
    expect(row.fg[15]).toBe(DEPLETED_FG);
    expect(row.ch[19]).toBe(' ');
    expect(row.bg.slice(20, 29).every((b) => b === BLUE)).toBe(true);
    expect(row.bg.slice(30, 39)).toEqual(Array(9).fill(''));
    expect(row.fg[30]).toBe(DEPLETED_FG);
  });

  it('draws untracked affects dark and untracked stored spells full grey', () => {
    const s = defaultTimersSettings();
    s.headers = false;
    const l = timersLayout(
      input(
        [
          cell('bless', 'spell', { tracked: false, expiresAt: null, expected: null, startedAt: null }),
          cell('fireball', 'stored', { tracked: false, expiresAt: null, expected: null, startedAt: null }),
        ],
        { settings: s, w: 20 },
      ),
    );
    const [a, b] = l.lines;
    expect(a!.text()).toBe('BLESS              +');
    expect(a!.fg[0]).toBe(UNTRACKED_FG);
    expect(a!.bg[0]).toBe('');
    expect(b!.text()).toBe('FIREBALL           ▌');
    expect(b!.bg.slice(0, 19).every((x) => x === STORED_UNTRACKED)).toBe(true);
    expect(b!.fg[0]).toBe(BAR_INK);
    expect(b!.fg[19]).toBe(STORED_UNTRACKED);
    expect(l.timed).toBe(false);
  });

  it('paints barless groups in the group colour, darkened on a light pane', () => {
    const s = defaultTimersSettings();
    s.headers = false;
    s.groups.spell.bar = false;
    const dark = timersLayout(input([cell('armour', 'spell', { expiresAt: NOW + 60_000 })], { settings: s, w: 12 }));
    expect(dark.lines[0]!.text()).toBe('ARMOUR     +');
    expect(dark.lines[0]!.fg[0]).toBe(BLUE);
    expect(dark.lines[0]!.bg[0]).toBe('');
    const light = timersLayout(
      input([cell('armour', 'spell')], { settings: s, w: 12, light: true, bg: '#f4ecd8', dim: '#8a8070' }),
    );
    expect(light.lines[0]!.fg[0]).toBe(lightShift(BLUE));
    // The bar path is unchanged on a light pane; the drained name is dark ink.
    s.groups.spell.bar = true;
    const bar = timersLayout(
      input([cell('armour', 'spell')], { settings: s, w: 12, light: true, bg: '#f4ecd8', dim: '#8a8070' }),
    );
    expect(bar.lines[0]!.bg[0]).toBe(BLUE);
    expect(bar.lines[0]!.fg[10]).not.toBe(DEPLETED_FG);
  });

  it('overlays countdowns with the edge and corner rules', () => {
    const s = defaultTimersSettings();
    s.headers = false;
    s.groups.spell.clock = true;
    s.groups.spell.cols = 2;
    const cells = [
      cell('armour', 'spell', { expiresAt: NOW + 600_000, expected: 600_000 }), // 10m
      cell('bless', 'spell', { expiresAt: NOW + 45_000, expected: 600_000 }), // 45s
      cell('shield', 'spell', { expiresAt: NOW + 12_000, expected: 600_000 }), // 12s
      cell('sanctuary', 'spell', { expiresAt: null, expected: null }), // no clock
      cell('strength', 'spell', { expiresAt: NOW + 91_000, expected: 600_000 }), // 2m
    ];
    const l = texts(input(cells, { settings: s, w: 24 }));
    expect(l).toEqual([
      'ARMOUR  10m▌BLESS   45s+', // the top rightmost clock cell keeps a blank under +
      'SHIELD  12s SANCTUARY  ▌', // drained: no separator; indefinite: no clock
      'STRENGTH 2m', // 91 s → 2m
    ]);
  });

  it('keeps a rightmost-column clock at the edge below the top row', () => {
    const s = defaultTimersSettings();
    s.headers = false;
    s.groups.spell.clock = true;
    s.groups.spell.cols = 2;
    const cells = [
      cell('a', 'spell', { expiresAt: NOW + 30_000, expected: 30_000 }),
      cell('b', 'spell', { expiresAt: NOW + 30_000, expected: 30_000 }),
      cell('c', 'spell', { expiresAt: NOW + 30_000, expected: 30_000 }),
      cell('d', 'spell', { expiresAt: NOW + 30_000, expected: 30_000 }),
      cell('e', 'spell', { expiresAt: NOW + 30_000, expected: 30_000 }),
    ];
    const l = timersLayout(input(cells, { settings: s, w: 12 }));
    expect(l.lines.map((x) => x.text())).toEqual([
      'A 30s▌B 30s+', // top row: corner reserve, a blank under the +
      'C 30s▌D  30s', // rightmost column: no separator, digits at the edge
      'E 30s▌      ', // a lone last cell keeps its separator
    ]);
    expect(l.lines[1]!.bg.slice(6, 12).every((b) => b === BLUE)).toBe(true);
  });

  it('draws charm rows, counts up, and yields the corner to a top charm row', () => {
    const s = defaultTimersSettings();
    s.headers = false;
    const troll = cell('huge stone troll', 'charm', { id: 'c1', startedAt: NOW - 21 * 60_000 - 5_000, expiresAt: NOW + 3_600_000 });
    const shadow = cell('enslaved shadow', 'charm', { id: 'c2', startedAt: null, expiresAt: null, expected: null });
    const l = timersLayout(input([troll, shadow], { settings: s, w: 24, hover: 'charm:c2' }));
    expect(l.lines.map((x) => x.text())).toEqual(['Huge stone troll   21m ×', 'Enslaved shadow        ×']);
    expect(l.corner).toBe(null);
    expect(l.lines[0]!.fg[0]).toBe(TIMER_COLOR_HEX.violet);
    expect(l.lines[0]!.fg[19]).toBe(DEPLETED_FG);
    expect(l.lines[0]!.fg[23]).toBe(CHARM_X_FG);
    expect(l.lines[1]!.fg[23]).toBe(CHARM_X_HOVER);
    expect(l.zones).toEqual([
      { row: 0, x0: 23, x1: 24, hit: { kind: 'charm', id: 'c1' } },
      { row: 1, x0: 23, x1: 24, hit: { kind: 'charm', id: 'c2' } },
    ]);
    // Narrow: the name truncates from the right; minutes cap at 99.
    const old = cell('pack horse', 'charm', { id: 'c3', startedAt: NOW - 500 * 60_000, expiresAt: NOW + 1 });
    expect(texts(input([old], { settings: s, w: 9 }))).toEqual(['Pac 99m ×']);
    // Two-up at cap 2.
    s.groups.charm.cols = 2;
    expect(texts(input([troll, shadow], { settings: s, w: 24 }))).toEqual(['Huge s 21m ×Enslaved s ×']);
    // With headers the charm header is on top: the corner shows.
    s.headers = true;
    expect(timersLayout(input([troll], { settings: s, w: 24 })).corner).toBe('+');
  });

  it('read-only (a log player): no corner + and no charm ×', () => {
    const s = defaultTimersSettings();
    const spells = ['sanctuary', 'shield', 'armour', 'bless'].map((n) => cell(n, 'spell'));
    const ro = timersLayout(input(spells, { settings: s, readOnly: true }));
    expect(ro.corner).toBe(null);
    expect(ro.zones).toEqual([]);
    expect(ro.lines[1]!.text().trimEnd().endsWith('+')).toBe(false);
    s.headers = false;
    const troll = cell('huge stone troll', 'charm', { id: 'c1', startedAt: NOW - 21 * 60_000 - 5_000, expiresAt: NOW + 3_600_000 });
    const ch = timersLayout(input([troll], { settings: s, w: 24, readOnly: true }));
    expect(ch.lines.map((x) => x.text())).toEqual(['Huge stone troll   21m  ']);
    expect(ch.zones).toEqual([]);
  });

  it('lays out every row; the indicator row follows the scroll position', () => {
    const s = defaultTimersSettings();
    s.groups.spell.cols = 1;
    const cells = Array.from({ length: 8 }, (_, i) => cell(`spell${i}`, 'spell'));
    // 9 rows (header + 8) in 5: all 9 laid out, the scroller takes 4 rows.
    const l = timersLayout(input(cells, { settings: s, w: 20, h: 5 }));
    expect(l.lines.map((x) => x.text().trimEnd())).toEqual([
      'Spells:            +', ...cells.map((_, i) => `SPELL${i}             ▌`),
    ]);
    expect(l.total).toBe(9);
    expect(l.listH).toBe(4);
    expect(l.zones.map((z) => z.hit.kind)).toEqual(['corner']);
    const top = timersIndicator(20, 5, 9, 0)!;
    expect(top.up).toBe(false);
    expect(top.line.text().trimEnd()).toBe('↓ 5 more rows');
    expect(top.line.fg[0]).toBe(INDICATOR_FG);
    expect(top.line.flags[0]! & 2).toBe(2);
    expect(timersIndicator(20, 5, 9, 2)!.line.text().trimEnd()).toBe('↑ 2 rows above');
    expect(timersIndicator(20, 5, 9, 1)!.up).toBe(true);
    expect(timersIndicator(20, 4, 4, 0)).toBe(null);
    expect(timersIndicator(20, 4, 5, 0)!.line.text().trimEnd()).toBe('↓ 2 more rows');
    // Content that fits: no indicator, the scroller takes every row.
    const fit = timersLayout(input(cells.slice(0, 2), { settings: s, w: 20, h: 5 }));
    expect(fit.lines).toHaveLength(3);
    expect(fit.listH).toBe(5);
  });

  it('lays out the herblore add-view with the close ×', () => {
    const view = emptyView();
    view.herbs = [
      { key: 'healing', name: 'Healing', active: false },
      { key: 'travelling', name: 'Travelling', active: true },
    ];
    const l = timersLayout({ ...input([]), view, mode: 'add', w: 20, hover: 'corner' });
    expect(l.lines.map((x) => x.text().trimEnd())).toEqual(['[+] Healing        ×', '[-] Travelling']);
    expect(l.lines[0]!.fg[1]).toBe(HERB_ADD);
    expect(l.lines[1]!.fg[1]).toBe(HERB_REMOVE);
    expect(l.lines[0]!.fg[19]).toBe(CORNER_HOVER);
    expect(l.zones).toEqual([
      { row: 0, x0: 0, x1: 11, hit: { kind: 'herb', key: 'healing', active: false } },
      { row: 1, x0: 0, x1: 14, hit: { kind: 'herb', key: 'travelling', active: true } },
      { row: 0, x0: 19, x1: 20, hit: { kind: 'corner' } },
    ]);
    // An empty catalogue: the × alone on a blank row.
    expect(texts({ ...input([]), mode: 'add', w: 5 })).toEqual(['    ×']);
    // Hidden groups draw nothing, but the corner still shows.
    const s = defaultTimersSettings();
    s.groups.spell.enabled = false;
    expect(texts(input([cell('armour', 'spell')], { settings: s, w: 5 }))).toEqual(['    +']);
  });
});
