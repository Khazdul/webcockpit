import { describe, expect, it } from 'vitest';
import { ICONS, TIMER_GROUP_ICON, STATUS_ICON, positionIcon } from '../../src/panes/icons';
import { DARK_COLORS, LIGHT_COLORS, PICKER_COLORS, autoColor, resolveColor, signalColors } from '../../src/panes/palette';
import { STATUS_FLAGS } from '../../src/gmcp/group';
import { TIMER_GROUPS } from '../../src/timers/entry';

describe('panes palette (ADR 0122)', () => {
  it('Auto follows the side; a hex is used as is', () => {
    expect(resolveColor('auto', 'debuff', false)).toBe('#c8504f');
    expect(resolveColor('auto', 'debuff', true)).toBe('#98332f');
    expect(resolveColor('#123456', 'sanct', true)).toBe('#123456');
    expect(autoColor('hp', false)).toBe(DARK_COLORS.hp);
    expect(signalColors(true).ending).toBe('#d0101a');
    for (const g of TIMER_GROUPS) {
      expect(DARK_COLORS[g]).toMatch(/^#[0-9a-f]{6}$/);
      expect(LIGHT_COLORS[g]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(PICKER_COLORS).toHaveLength(12);
    expect(new Set(PICKER_COLORS.map((c) => c.hex)).size).toBe(12);
  });
});

describe('panes icons (ADR 0122)', () => {
  it('every icon is one path; every flag and group has one', () => {
    for (const d of Object.values(ICONS)) expect(d).toMatch(/^M[\d.\s\-a-zA-Z,]+$/);
    for (const f of STATUS_FLAGS) expect(ICONS[STATUS_ICON[f]]).toBeTruthy();
    for (const g of TIMER_GROUPS) expect(ICONS[TIMER_GROUP_ICON[g]]).toBeTruthy();
    // The opponent is the claw slashes, not the fighting position's crossed swords.
    expect(ICONS.foe).not.toBe(ICONS.fighting);
    expect('axe' in ICONS).toBe(false);
  });

  it('maps positions; riding shows only when standing', () => {
    expect(positionIcon('fighting', true)).toBe('fighting');
    expect(positionIcon('standing', true)).toBe('riding');
    expect(positionIcon(null, false)).toBe('standing');
    expect(positionIcon('sitting', false)).toBe('resting');
    expect(positionIcon('sleeping', false)).toBe('sleeping');
  });
});
