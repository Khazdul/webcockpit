import { describe, expect, it } from 'vitest';
import { colorName } from '../../src/chrome/pane-options-model';
import { AWAY_MODE_CHOICES, VITAL_COLOR_ROWS, setVitalColor } from '../../src/chrome/pane-options-model';
import { PICKER_COLORS } from '../../src/panes/palette';
import { SettingsStore } from '../../src/settings';

describe('Group options model (ADR 0122)', () => {
  it('away choices and vital rows', () => {
    expect(AWAY_MODE_CHOICES).toEqual([
      { value: 'room', label: 'Room name' },
      { value: 'dim', label: 'Dim only' },
    ]);
    expect(VITAL_COLOR_ROWS.map((r) => r.label)).toEqual(['HP', 'Mana', 'Moves']);
  });

  it('a vital colour is written to the settings', () => {
    const s = new SettingsStore({ factory: null, storage: null, win: null });
    setVitalColor(s, 'mana', '#4f72d9');
    expect(s.get().group.colors).toEqual({ hp: 'auto', mana: '#4f72d9', mp: 'auto' });
    setVitalColor(s, 'mana', 'auto');
    expect(s.get().group.colors.mana).toBe('auto');
  });

  it('a colour setting is named: Auto, a picker colour, or its hex', () => {
    expect(colorName('auto')).toBe('Auto');
    expect(colorName(PICKER_COLORS[0]!.hex.toUpperCase())).toBe(PICKER_COLORS[0]!.label);
    expect(colorName('#ABCDEF')).toBe('#abcdef');
  });
});
