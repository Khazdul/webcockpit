// Stage 51c (ADR 0136 §13): the `phone` settings section: additive, no
// version bump, defaults for anything missing or broken, and untouched by
// (and without effect on) the rest of the settings.
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/settings';
import { migratePhone, migrateSettings } from '../../src/settings/migrate';
import { PHONE_DEFAULTS_MARK, SETTINGS_VERSION, defaultPhoneSettings, defaultSettings, phoneDefaultSettings } from '../../src/settings/types';
import { DEFAULTS_MARK, phoneDefaultsPatch } from '../../src/phone/phone-defaults';

describe('phone settings', () => {
  it('defaults: the lens shown, medium, opening at the middle zoom, on a computer and on a phone', () => {
    expect(defaultPhoneSettings().lens).toEqual({ show: true, size: 'm', opensAt: 'middle' });
    expect(defaultSettings().phone).toEqual(defaultPhoneSettings());
    // A new phone has had the one-time defaults (the mark); nothing else differs.
    expect(phoneDefaultSettings().phone).toEqual({ ...defaultPhoneSettings(), defaults: PHONE_DEFAULTS_MARK });
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
  it('defaults: the four panes in order, all on but Character (stage 52); Comm at its default height; private unread', () => {
    const d = defaultPhoneSettings();
    expect(d.strip.panes).toEqual([
      { id: 'timers', on: true },
      { id: 'group', on: true },
      { id: 'character', on: false },
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
      // A pane the stored list lacks comes as by default: Character off.
      { id: 'character', on: false },
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

describe('the phone\'s one-time defaults (stage 52)', () => {
  const stored050 = (): Record<string, unknown> => {
    // What 0.5.0 stored on a phone: every strip pane on, Herblores on, three hot keys, vibrate, no mark.
    const s = JSON.parse(JSON.stringify(phoneDefaultSettings())) as { phone: Record<string, unknown>; timers: { groups: { herb: { enabled: boolean } } } };
    delete s.phone.defaults;
    delete s.phone.hotkeyCount;
    s.phone.hotkeys = (s.phone.hotkeys as unknown[]).slice(0, 3);
    s.phone.vibrate = false;
    s.phone.strip = { panes: ['timers', 'group', 'character', 'statistics'].map((id) => ({ id, on: true })) };
    s.timers.groups.herb.enabled = true;
    return s;
  };

  it('the mark is the settings\' (the phone chunk cannot import it as a value)', () => {
    expect(DEFAULTS_MARK).toBe(PHONE_DEFAULTS_MARK);
  });

  it('a new phone starts with them and is marked: Herblores off, Character out of the strip; nothing to apply', () => {
    const s = phoneDefaultSettings();
    expect(s.timers.groups.herb.enabled).toBe(false);
    expect(s.phone.strip.panes.find((e) => e.id === 'character')!.on).toBe(false);
    expect(s.phone.defaults).toBe(PHONE_DEFAULTS_MARK);
    expect(phoneDefaultsPatch(s)).toBeNull();
    // The other timer groups and strip panes are as on a computer.
    expect({ ...s.timers.groups, herb: null }).toEqual({ ...defaultSettings().timers.groups, herb: null });
    expect(s.phone.strip.panes.filter((e) => e.on).map((e) => e.id)).toEqual(['timers', 'group', 'statistics']);
  });

  it('a computer\'s defaults are not changed: Herblores on, and no mark', () => {
    const d = defaultSettings();
    expect(d.timers.groups.herb.enabled).toBe(true);
    expect(d.phone.defaults).toBe(0);
  });

  it('settings stored by 0.5.0 have no mark: migrated they read 0, with what was stored untouched', () => {
    for (const phone of [true, false]) {
      const s = migrateSettings(stored050(), { phone });
      expect(s.phone.defaults).toBe(0);
      expect(s.timers.groups.herb.enabled).toBe(true);
      expect(s.phone.strip.panes.every((e) => e.on)).toBe(true);
    }
    expect([migratePhone({ defaults: 1 }).defaults, migratePhone({ defaults: 7 }).defaults, migratePhone({ defaults: -1 }).defaults, migratePhone({ defaults: 'x' }).defaults]).toEqual([1, 1, 0, 0]);
  });

  it('applied once: Herblores off, Character off in the strip, the mark; the order and the other panes are kept', () => {
    const raw = stored050();
    (raw.phone as { strip: unknown }).strip = { panes: [{ id: 'statistics', on: false }, { id: 'character', on: true }, { id: 'timers', on: true }, { id: 'group', on: true }] };
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    store.update(() => migrateSettings(raw, { phone: true }));
    const before = store.get();
    const patch = phoneDefaultsPatch(before);
    expect(patch).toEqual({
      timers: { groups: { herb: { enabled: false } } },
      phone: {
        strip: { panes: [{ id: 'statistics', on: false }, { id: 'character', on: false }, { id: 'timers', on: true }, { id: 'group', on: true }] },
        defaults: 1,
      },
    });
    store.update(patch!);
    const after = store.get();
    expect(after.timers.groups.herb.enabled).toBe(false);
    expect(after.phone.defaults).toBe(1);
    // Nothing else moved.
    expect({ ...after, timers: null, phone: null }).toEqual({ ...before, timers: null, phone: null });
    expect({ ...after.timers, groups: { ...after.timers.groups, herb: null } }).toEqual({ ...before.timers, groups: { ...before.timers.groups, herb: null } });
    expect({ ...after.phone, strip: null, defaults: null }).toEqual({ ...before.phone, strip: null, defaults: null });
    // Marked: never again, so the player's own choice wins from here on.
    expect(phoneDefaultsPatch(after)).toBeNull();
    store.update({ timers: { groups: { herb: { enabled: true } } }, phone: { strip: { panes: after.phone.strip.panes.map((e) => ({ ...e, on: true })) } } });
    expect(phoneDefaultsPatch(store.get())).toBeNull();
    expect(store.get().timers.groups.herb.enabled).toBe(true);
    // And it survives a round through storage.
    expect(phoneDefaultsPatch(migrateSettings(JSON.parse(JSON.stringify(store.get())), { phone: true }))).toBeNull();
  });
});
