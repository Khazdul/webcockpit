// Stage 51c (ADR 0136 §13): the `phone` settings section: additive, no
// version bump, defaults for anything missing or broken, and untouched by
// (and without effect on) the rest of the settings.
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/settings';
import { migratePhone, migrateSettings } from '../../src/settings/migrate';
import { SETTINGS_VERSION, defaultPhoneSettings, defaultSettings, phoneDefaultSettings } from '../../src/settings/types';

describe('phone settings', () => {
  it('defaults: the lens shown, medium, opening at the middle zoom, on a computer and on a phone', () => {
    expect(defaultPhoneSettings().lens).toEqual({ show: true, size: 'm', opensAt: 'middle' });
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
    expect(migratePhone({ lens }).lens).toEqual(lens);
    expect(migrateSettings({ ...defaultSettings(), phone: { lens } }).phone.lens).toEqual(lens);
  });

  it('broken values fall back one by one', () => {
    expect(migratePhone(null)).toEqual(defaultPhoneSettings());
    expect(migratePhone('x')).toEqual(defaultPhoneSettings());
    expect(migratePhone({ lens: 7 })).toEqual(defaultPhoneSettings());
    expect(migratePhone({ lens: { show: 'no', size: 'xl', opensAt: 'near' } }).lens).toEqual({ show: true, size: 'm', opensAt: 'near' });
    expect(migratePhone({ lens: { show: false, size: 's', opensAt: 3 } }).lens).toEqual({ show: false, size: 's', opensAt: 'middle' });
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

describe('phone settings of stage 51d: the strip, Comm, unread', () => {
  it('defaults: the four panes in order, all on; Comm at its default height; private unread', () => {
    const d = defaultPhoneSettings();
    expect(d.strip.panes).toEqual([
      { id: 'timers', on: true },
      { id: 'group', on: true },
      { id: 'character', on: true },
      { id: 'statistics', on: true },
    ]);
    expect(d.commRows).toBeNull();
    expect(d.unread).toBe('private');
  });

  it('settings stored in stage 51c (the lens only) get the new defaults and keep the lens', () => {
    const p = migratePhone({ lens: { show: false, size: 's', opensAt: 'near' } });
    expect(p.lens).toEqual({ show: false, size: 's', opensAt: 'near' });
    expect({ ...p, lens: null }).toEqual({ ...defaultPhoneSettings(), lens: null });
  });

  it('the strip keeps a stored order and on/off; every pane is there exactly once', () => {
    const panes = [
      { id: 'statistics', on: false },
      { id: 'timers', on: true },
    ];
    expect(migratePhone({ strip: { panes } }).strip.panes).toEqual([
      { id: 'statistics', on: false },
      { id: 'timers', on: true },
      { id: 'group', on: true },
      { id: 'character', on: true },
    ]);
    // Repeats, unknown ids and junk are dropped.
    const junk = [{ id: 'group', on: false }, { id: 'group', on: true }, { id: 'map', on: true }, 7, null, { on: true }, { id: 'character', on: 'yes' }];
    expect(migratePhone({ strip: { panes: junk } }).strip.panes).toEqual([
      { id: 'group', on: false },
      { id: 'character', on: true },
      { id: 'timers', on: true },
      { id: 'statistics', on: true },
    ]);
    expect(migratePhone({ strip: 'x' }).strip).toEqual(defaultPhoneSettings().strip);
    expect(migratePhone({ strip: { panes: 'x' } }).strip).toEqual(defaultPhoneSettings().strip);
  });

  it('commRows: a whole number of rows, or null', () => {
    expect(migratePhone({ commRows: 14 }).commRows).toBe(14);
    expect(migratePhone({ commRows: 14.7 }).commRows).toBe(15);
    expect(migratePhone({ commRows: 0 }).commRows).toBe(1);
    expect(migratePhone({ commRows: 9999 }).commRows).toBe(200);
    expect(migratePhone({ commRows: '14' }).commRows).toBeNull();
    expect(migratePhone({ commRows: Number.NaN }).commRows).toBeNull();
    expect(migratePhone({ commRows: null }).commRows).toBeNull();
  });

  it('unread: private or all', () => {
    expect(migratePhone({ unread: 'all' }).unread).toBe('all');
    expect(migratePhone({ unread: 'everything' }).unread).toBe('private');
  });

  it('none of it touches comm.folded or comm.listWidth', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const comm = store.get().comm;
    store.update({ phone: { commRows: 12, unread: 'all', strip: { panes: [{ id: 'group', on: false }] } } });
    expect(store.get().comm).toEqual(comm);
    expect(store.get().phone.commRows).toBe(12);
    expect(store.get().phone.strip.panes[0]).toEqual({ id: 'group', on: false });
    expect(store.get().phone.strip.panes).toHaveLength(4);
  });
});
