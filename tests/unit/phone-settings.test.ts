// Stage 51c (ADR 0136 §13): the `phone` settings section: additive, no
// version bump, defaults for anything missing or broken, and untouched by
// (and without effect on) the rest of the settings.
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/settings';
import { migratePhone, migrateSettings } from '../../src/settings/migrate';
import { SETTINGS_VERSION, defaultPhoneSettings, defaultSettings, phoneDefaultSettings } from '../../src/settings/types';

describe('phone settings', () => {
  it('defaults: the lens shown, medium, opening at the middle zoom, on a computer and on a phone', () => {
    expect(defaultPhoneSettings()).toEqual({ lens: { show: true, size: 'm', opensAt: 'middle' } });
    expect(defaultSettings().phone).toEqual(defaultPhoneSettings());
    expect(phoneDefaultSettings().phone).toEqual(defaultPhoneSettings());
  });

  it('settings stored before stage 51 get the defaults, with no version bump', () => {
    const old = JSON.parse(JSON.stringify(defaultSettings())) as Record<string, unknown>;
    delete old.phone;
    const s = migrateSettings(old);
    expect(s.phone).toEqual(defaultPhoneSettings());
    expect(s.version).toBe(old.version);
    expect(SETTINGS_VERSION).toBe(old.version);
    // Nothing else moved.
    expect({ ...s, phone: null }).toEqual({ ...defaultSettings(), phone: null });
  });

  it('stored values are kept', () => {
    const lens = { show: false, size: 'l', opensAt: 'far' };
    expect(migratePhone({ lens })).toEqual({ lens });
    expect(migrateSettings({ ...defaultSettings(), phone: { lens } }).phone.lens).toEqual(lens);
  });

  it('broken values fall back one by one', () => {
    expect(migratePhone(null)).toEqual(defaultPhoneSettings());
    expect(migratePhone('x')).toEqual(defaultPhoneSettings());
    expect(migratePhone({ lens: 7 })).toEqual(defaultPhoneSettings());
    expect(migratePhone({ lens: { show: 'no', size: 'xl', opensAt: 'near' } })).toEqual({ lens: { show: true, size: 'm', opensAt: 'near' } });
    expect(migratePhone({ lens: { show: false, size: 's', opensAt: 3 } })).toEqual({ lens: { show: false, size: 's', opensAt: 'middle' } });
  });

  it('unknown keys of the section are dropped', () => {
    expect(migratePhone({ lens: { show: true, size: 'm', opensAt: 'middle', tint: 'red' }, extra: 1 })).toEqual(defaultPhoneSettings());
  });

  it('a patch of the lens changes nothing else, least of all the desktop\'s Mapper settings', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const before = store.get();
    store.update({ phone: { lens: { size: 's' } } });
    const after = store.get();
    expect(after.phone.lens).toEqual({ show: true, size: 's', opensAt: 'middle' });
    expect(after.mapper).toEqual(before.mapper);
    expect(after.panes).toEqual(before.panes);
    expect({ ...after, phone: null }).toEqual({ ...before, phone: null });
  });
});
