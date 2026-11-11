// Stage 51g: an exported replay does not carry the phone's own settings
// (ADR 0136 §8, §13: the hot keys are the phone's, not for export).
import { describe, expect, it } from 'vitest';
import { migrateSettings } from '../../src/settings/migrate';
import { defaultPhoneSettings, defaultSettings } from '../../src/settings/types';
import { replaySettings } from '../../src/share/payload';

describe('replaySettings and the phone section', () => {
  it('leaves the phone section out, whatever it held', () => {
    const s = defaultSettings();
    s.phone.hotkeys[0] = { label: 'pw', command: 'say my secret plan', special: null, shown: true };
    s.phone.autoReconnect = true;
    const out = replaySettings(s);
    expect('phone' in out).toBe(false);
    expect(JSON.stringify(out)).not.toContain('my secret plan');
    expect(JSON.stringify(out)).not.toContain('hotkeys');
    // The exporter's own settings are untouched.
    expect(s.phone.hotkeys[0]!.command).toBe('say my secret plan');
  });

  it('everything else is as before the section existed', () => {
    const s = defaultSettings();
    const out = replaySettings(s) as unknown as Record<string, unknown>;
    const before = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    delete before.phone;
    expect(Object.keys(out).sort()).toEqual(Object.keys(before).sort());
    for (const k of Object.keys(before)) if (k !== 'mapper') expect(out[k]).toEqual(before[k]);
  });

  it('the replay reads it back with the defaults', () => {
    const s = defaultSettings();
    s.phone.compassSize = 'l';
    const back = migrateSettings(JSON.parse(JSON.stringify(replaySettings(s))));
    expect(back.phone).toEqual(defaultPhoneSettings());
  });
});
