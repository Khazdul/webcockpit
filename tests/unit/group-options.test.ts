import { describe, expect, it } from 'vitest';
import { colorCycle, colorName } from '../../src/chrome/frames/options-group';
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

  it('the TUI colour cycle: Auto, the picker colours, a free colour kept after Auto', () => {
    expect(colorCycle('auto')).toEqual(['auto', ...PICKER_COLORS.map((c) => c.hex)]);
    expect(colorCycle('#123456').slice(0, 2)).toEqual(['auto', '#123456']);
    expect(colorCycle(PICKER_COLORS[3]!.hex)).toHaveLength(13);
    expect(colorName('auto')).toBe('Auto');
    expect(colorName(PICKER_COLORS[0]!.hex.toUpperCase())).toBe(PICKER_COLORS[0]!.label);
    expect(colorName('#ABCDEF')).toBe('#abcdef');
  });
});
