// The stones' own icons (stage 77 H8, ADR 0166 addendum 34): every stone of
// the tables maps to its pick, the rest (and the affects not recognised
// yet) to the generic icon of the group; the card and the Spells pane show
// the same icon for the same cell.
import { describe, expect, it } from 'vitest';
import { STATUS_FLAGS, type MemberFlags } from '../../src/gmcp/group';
import { SANCT_FLAG_ID, STONE_FLAGS, stoneView } from '../../src/panes/character-stones';
import { ICONS } from '../../src/panes/icons';
import {
  AFFECT_STONE,
  FLAG_STONE,
  GENERIC_STONE,
  HERB_STONE,
  STONE_ICONS,
  affectStoneIcon,
  flagStoneIcon,
  herbStoneIcon,
  unconfirmedAffects,
} from '../../src/panes/stone-icons';
import { timersModel } from '../../src/panes/timers-model';
import { defaultSettings } from '../../src/settings';
import { AFFECTS } from '../../src/timers/data/affects';
import { HERBLORES } from '../../src/timers/data/herblores';
import { type TimerCell, emptyView } from '../../src/timers/entry';

const NOW = 1_790_000_000_000;
const ALL = defaultSettings().character.stones;
const noFlags = (): MemberFlags => Object.fromEntries(STATUS_FLAGS.map((f) => [f, false])) as MemberFlags;
const cell = (p: Partial<TimerCell> & Pick<TimerCell, 'id' | 'name' | 'group'>): TimerCell => ({
  startedAt: NOW - 1000,
  expiresAt: NOW + 60_000,
  expected: 120_000,
  tracked: true,
  ...p,
});

/** The seven affects whose picks wait for the owner (picks.md, "Not recognised yet"; unable to quit confirmed in H9's test). */
const UNCONFIRMED = ['bloodlust', 'some pipe-weed', 'potion', 'panic', 'sunlight', 'unable to void', 'unable to sneak'];

describe('stone icons: the tables (H8)', () => {
  it('every picked path is one stroke path in the 24-unit box, and an icon', () => {
    for (const [name, d] of Object.entries(STONE_ICONS)) {
      expect(d).toMatch(/^M[\d.\s\-a-zA-Z,]+$/);
      expect(ICONS[name as keyof typeof ICONS]).toBe(d);
    }
    for (const p of [...Object.values(AFFECT_STONE), ...Object.values(HERB_STONE), ...Object.values(FLAG_STONE)]) expect(ICONS[p.icon]).toBeTruthy();
    for (const g of Object.values(GENERIC_STONE)) expect(ICONS[g]).toBeTruthy();
  });

  it('every buff and debuff of the affect table has a pick; spells none', () => {
    for (const [name, def] of Object.entries(AFFECTS)) {
      const p = AFFECT_STONE[name.toLowerCase()];
      if (def.type === 'spell') expect(p, name).toBeUndefined();
      else expect(p, name).toBeDefined();
    }
    // And no pick names an affect the table does not have.
    const known = new Set(Object.keys(AFFECTS).map((n) => n.toLowerCase()));
    for (const n of Object.keys(AFFECT_STONE)) expect(known.has(n), n).toBe(true);
  });

  it('a recognised affect gets its pick, case as the game or the table writes it', () => {
    for (const [name, def] of Object.entries(AFFECTS)) {
      if (def.type === 'spell' || UNCONFIRMED.includes(name)) continue;
      expect(affectStoneIcon(name, def.type), name).toBe(AFFECT_STONE[name.toLowerCase()]!.icon);
      expect(affectStoneIcon(name.toUpperCase(), def.type), name).toBe(AFFECT_STONE[name.toLowerCase()]!.icon);
    }
    expect(affectStoneIcon('second wind', 'buff')).toBe('st-second-wind');
    expect(affectStoneIcon('Orkish draught', 'buff')).toBe('st-orkish-draught');
    expect(affectStoneIcon('antidote', 'buff')).toBe('st-antidote');
    expect(affectStoneIcon('haste (recovery)', 'debuff')).toBe('st-haste-recovery');
    // The flags' twins are one stone with the flag: its pick.
    expect(affectStoneIcon('blindness', 'debuff')).toBe('blind');
    expect(affectStoneIcon('hunger', 'debuff')).toBe('hungry');
    expect(affectStoneIcon('thirst', 'debuff')).toBe('thirsty');
  });

  it('unable to quit has its pick (confirmed live); the seven not recognised yet keep the generic icon, their picks kept', () => {
    expect(affectStoneIcon('unable to quit', 'debuff')).toBe('st-unable-to-quit');
    expect(AFFECT_STONE['unable to quit']!.confirmed).toBeUndefined();
    expect(unconfirmedAffects().sort()).toEqual([...UNCONFIRMED].sort());
    for (const n of UNCONFIRMED) {
      const def = AFFECTS[n]!;
      expect(def.type === 'buff' || def.type === 'debuff').toBe(true);
      expect(affectStoneIcon(n, def.type as 'buff' | 'debuff'), n).toBe(GENERIC_STONE[def.type as 'buff' | 'debuff']);
      // The pick is ready: turning it on is deleting `confirmed: false`.
      expect(AFFECT_STONE[n]!.icon.startsWith('st-'), n).toBe(true);
    }
  });

  it('an unknown affect: the generic icon of its group', () => {
    expect(affectStoneIcon('a strange glow', 'buff')).toBe('buff');
    expect(affectStoneIcon('a strange glow', 'debuff')).toBe('debuff');
  });

  it('every herblore of the catalogue has its pick, the same in every phase; an unknown one the generic herblore', () => {
    expect(Object.keys(HERB_STONE).sort()).toEqual(HERBLORES.map((h) => h.key).sort());
    const expected: Record<string, string> = {
      Healing: 'st-healing',
      Travelling: 'st-travelling',
      Clearthought: 'st-clearthought',
      Walking: 'st-walking',
      Haste: 'st-haste-recovery',
      DarkAura: 'st-dark-aura-herb',
      Seeing: 'st-seeing',
      Shadows: 'st-shadows',
      SkillfulOil: 'st-skillful-oil',
      SoothingDraught: 'st-soothing-draught',
      Strength: 'st-strength',
      OrcBalm: 'st-orc-balm',
    };
    for (const h of HERBLORES) expect(herbStoneIcon(h.key), h.key).toBe(expected[h.key]);
    // The picks are all different, but Haste's is haste (recovery)'s on purpose.
    const icons = Object.values(HERB_STONE).map((p) => p.icon);
    expect(new Set(icons).size).toBe(icons.length);
    expect(herbStoneIcon('Mystery')).toBe('st-generic-herb');
    expect(herbStoneIcon(undefined)).toBe('st-generic-herb');
  });

  it('every flag stone has its pick; sanctuary keeps its figure', () => {
    expect(Object.keys(FLAG_STONE).sort()).toEqual([...STONE_FLAGS].sort());
    expect(STONE_FLAGS.map(flagStoneIcon)).toEqual(['poison', 'blind', 'st-snared', 'st-wound', 'hungry', 'thirsty']);
    expect(flagStoneIcon('slept')).toBe('st-generic-flag');
  });
});

describe('stone icons on the card and in Spells (H8)', () => {
  const view = () => {
    const v = emptyView();
    v.cells.buff.push(cell({ id: 'affect:comfortable', name: 'comfortable', group: 'buff' }));
    v.cells.buff.push(cell({ id: 'affect:bloodlust', name: 'bloodlust', group: 'buff', tracked: false, startedAt: null, expiresAt: null }));
    v.cells.debuff.push(cell({ id: 'affect:unable to quit', name: 'unable to quit', group: 'debuff', tracked: false, startedAt: null, expiresAt: null }));
    v.cells.debuff.push(cell({ id: 'affect:odd', name: 'an odd feeling', group: 'debuff', tracked: false, startedAt: null, expiresAt: null }));
    v.cells.herb.push(cell({ id: 'herb:Shadows', name: 'Shadows (neg)', group: 'herb', herbKey: 'Shadows', phase: 'debuff' }));
    return v;
  };

  it('the card: each stone its pick, chosen when the list is built; the flags and the sanctuary flag too', () => {
    const flags = { ...noFlags(), snared: true, wound: true, sanctuary: true };
    const v = stoneView({ view: view(), flags, show: ALL, player: false });
    expect(v.stones.map((s) => [s.id, s.icon, s.tone])).toEqual([
      ['herb:Shadows', 'st-shadows', 'debuff'],
      ['affect:comfortable', 'st-comfortable', 'buff'],
      ['affect:bloodlust', 'buff', 'buff'],
      ['affect:odd', 'debuff', 'debuff'],
      ['affect:unable to quit', 'st-unable-to-quit', 'debuff'],
      [SANCT_FLAG_ID, 'sanct', 'sanct'],
      ['flag:snared', 'st-snared', 'debuff'],
      ['flag:wound', 'st-wound', 'debuff'],
    ]);
  });

  it('Spells: the same icon for the same cell', () => {
    const s = defaultSettings().timers;
    for (const g of ['buff', 'debuff', 'herb'] as const) s.groups[g].enabled = true;
    const groups = timersModel({ view: view(), settings: s, now: NOW, width: 400, charW: 8, light: false });
    const card = new Map(stoneView({ view: view(), flags: noFlags(), show: ALL, player: false }).stones.map((x) => [x.id, x.icon]));
    const items = groups.flatMap((g) => g.items);
    expect(items.length).toBe(5);
    for (const t of items) expect(t.icon, t.id).toBe(card.get(t.id));
  });
});
