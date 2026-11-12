// Stage 51c (ADR 0136 §13): the `phone` settings section: additive, no
// version bump, defaults for anything missing or broken, and untouched by
// (and without effect on) the rest of the settings.
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/settings';
import { migrateLensLevel, migrateLensWant, migratePhone, migrateSettings } from '../../src/settings/migrate';
import { PHONE_DEFAULTS_MARK, PHONE_LENS_LEVELS, PHONE_LENS_SIZE_MAX, PHONE_LENS_SIZE_MIN, SETTINGS_VERSION, defaultPhoneSettings, defaultSettings, phoneDefaultSettings } from '../../src/settings/types';
import { DEFAULTS_MARK, phoneDefaultsAtStart, phoneDefaultsPatch } from '../../src/phone/phone-defaults';
import { LENS_GROUP, PANES_GROUP } from '../../src/phone/settings-page';

/** What 0.6.1 stored under `phone` (its keys, no later ones). */
function stored061(): Record<string, unknown> {
  const p = JSON.parse(JSON.stringify(defaultPhoneSettings())) as Record<string, unknown>;
  delete p.fightCard;
  p.lens = { show: true, opensAt: 'middle' };
  return p;
}

describe('phone settings of round 53k: the fight card\'s switch', () => {
  it('on by default, on a computer and on a new phone', () => {
    expect(defaultPhoneSettings().fightCard).toBe(true);
    expect(phoneDefaultSettings().phone.fightCard).toBe(true);
  });

  it('additive: an object stored by 0.6.1 reads as on, with no version bump', () => {
    const old: Record<string, unknown> = { ...(JSON.parse(JSON.stringify(defaultSettings())) as Record<string, unknown>), phone: stored061() };
    const s = migrateSettings(old);
    expect(s.phone.fightCard).toBe(true);
    expect(s.version).toBe(SETTINGS_VERSION);
    expect(SETTINGS_VERSION).toBe(old.version);
  });

  it('a stored value is kept; junk is the default', () => {
    expect(migratePhone({ fightCard: false }).fightCard).toBe(false);
    expect(migratePhone({ fightCard: 'no' }).fightCard).toBe(true);
  });

  it('the switch is a row of Panes and its patch changes nothing else', () => {
    const row = PANES_GROUP.rows.find((r) => r.id === 'fight-card')!;
    expect(row.kind).toBe('toggle');
    if (row.kind !== 'toggle') return;
    expect(row.get(defaultSettings())).toBe(true);
    expect(row.set(false, defaultSettings())).toEqual({ phone: { fightCard: false } });
  });
});

describe('phone settings', () => {
  it('defaults: the lens shown, opening at its nearest zoom (0.6.1\'s middle), on a computer and on a phone', () => {
    expect(defaultPhoneSettings().lens).toMatchObject({ show: true, opensAt: 'z1' });
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
    const lens = { show: false, opensAt: 'z3' };
    expect(migratePhone({ lens }).lens).toMatchObject(lens);
    expect(migrateSettings({ ...defaultSettings(), phone: { lens } }).phone.lens).toMatchObject(lens);
  });

  it('broken values fall back one by one', () => {
    expect(migratePhone(null)).toEqual(defaultPhoneSettings());
    expect(migratePhone('x')).toEqual(defaultPhoneSettings());
    expect(migratePhone({ lens: 7 })).toEqual(defaultPhoneSettings());
    expect(migratePhone({ lens: { show: 'no', opensAt: 'z4' } }).lens).toMatchObject({ show: true, opensAt: 'z4' });
    expect(migratePhone({ lens: { show: false, opensAt: 3 } }).lens).toMatchObject({ show: false, opensAt: 'z1' });
  });

  it('a stored lens size (0.5.0) is dropped: the size follows the screen (stage 52)', () => {
    expect(migratePhone({ lens: { show: false, size: 's', opensAt: 'far' } }).lens).toMatchObject({ show: false, opensAt: 'z2' });
    expect('size' in migratePhone({ lens: { size: 'l' } }).lens).toBe(false);
  });

  it('the strip\'s height: null by default, a stored number kept within limits, junk is null (stage 52)', () => {
    expect(defaultPhoneSettings().stripRows).toBeNull();
    expect(migratePhone({ stripRows: 12 }).stripRows).toBe(12);
    expect(migratePhone({ stripRows: 12.7 }).stripRows).toBe(13);
    expect(migratePhone({ stripRows: -3 }).stripRows).toBe(1);
    expect(migratePhone({ stripRows: 9999 }).stripRows).toBe(200);
    expect(migratePhone({ stripRows: 'tall' }).stripRows).toBeNull();
    expect(migratePhone({ stripRows: Number.NaN }).stripRows).toBeNull();
  });

  it('unknown keys of the section are dropped', () => {
    expect(migratePhone({ lens: { show: true, size: 'm', opensAt: 'middle', tint: 'red' }, extra: 1 })).toEqual(defaultPhoneSettings());
  });

  it('a patch of the lens changes nothing else, least of all the desktop\'s Mapper settings', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const before = store.get();
    store.update({ phone: { lens: { opensAt: 'z2' } } });
    const after = store.get();
    expect(after.phone.lens).toMatchObject({ show: true, opensAt: 'z2' });
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
    expect(p.lens).toMatchObject({ show: false, opensAt: 'z1' });
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
    (s.timers as unknown as { timeText: boolean; signal: string }).timeText = true;
    (s.timers as unknown as { timeText: boolean; signal: string }).signal = 'text';
    return s;
  };

  it('the mark is the settings\' (the phone chunk cannot import it as a value)', () => {
    expect(DEFAULTS_MARK).toBe(PHONE_DEFAULTS_MARK);
  });

  it('safe mode (`?safe`): nothing is applied at the start, so nothing is written; a normal start applies it', () => {
    const s = defaultSettings();
    expect(s.phone.defaults).toBe(0);
    expect(phoneDefaultsAtStart(s, true)).toBeNull();
    expect(phoneDefaultsAtStart(s, false)).toEqual(phoneDefaultsPatch(s));
    expect(phoneDefaultsAtStart(s, false)).not.toBeNull();
  });

  it('a new phone starts with them and is marked: Herblores off, the time text off, Character out of the strip; nothing to apply', () => {
    const s = phoneDefaultSettings();
    expect(s.timers.groups.herb.enabled).toBe(false);
    expect(s.timers.timeText).toBe(false);
    // Without the text the "Time text" signal would show nothing: Pulse.
    expect(s.timers.signal).toBe('pulse');
    // Nothing else of the Timers settings differs from a computer's.
    expect({ ...s.timers, groups: null, timeText: null, signal: null }).toEqual({ ...defaultSettings().timers, groups: null, timeText: null, signal: null });
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
    expect(d.timers.timeText).toBe(true);
    expect(d.timers.signal).toBe('text');
    expect(d.phone.defaults).toBe(0);
  });

  it('settings stored by 0.5.0 have no mark: migrated they read 0, with what was stored untouched', () => {
    for (const phone of [true, false]) {
      const s = migrateSettings(stored050(), { phone });
      expect(s.phone.defaults).toBe(0);
      expect(s.timers.groups.herb.enabled).toBe(true);
      expect(s.timers.timeText).toBe(true);
      expect(s.phone.strip.panes.every((e) => e.on)).toBe(true);
    }
    expect([migratePhone({ defaults: 1 }).defaults, migratePhone({ defaults: 7 }).defaults, migratePhone({ defaults: -1 }).defaults, migratePhone({ defaults: 'x' }).defaults]).toEqual([1, 1, 0, 0]);
  });

  it('applied once: Herblores off, the time text off, Character off in the strip, the mark; the order and the other panes are kept', () => {
    const raw = stored050();
    (raw.phone as { strip: unknown }).strip = { panes: [{ id: 'statistics', on: false }, { id: 'character', on: true }, { id: 'timers', on: true }, { id: 'group', on: true }] };
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    store.update(() => migrateSettings(raw, { phone: true }));
    const before = store.get();
    const patch = phoneDefaultsPatch(before);
    expect(patch).toEqual({
      timers: { groups: { herb: { enabled: false } }, timeText: false, signal: 'pulse' },
      phone: {
        strip: { panes: [{ id: 'statistics', on: false }, { id: 'character', on: false }, { id: 'timers', on: true }, { id: 'group', on: true }] },
        defaults: 1,
      },
    });
    store.update(patch!);
    const after = store.get();
    expect(after.timers.groups.herb.enabled).toBe(false);
    expect(after.timers.timeText).toBe(false);
    expect(after.timers.signal).toBe('pulse');
    expect(after.phone.defaults).toBe(1);
    // Nothing else moved.
    expect({ ...after, timers: null, phone: null }).toEqual({ ...before, timers: null, phone: null });
    expect({ ...after.timers, timeText: null, signal: null, groups: { ...after.timers.groups, herb: null } }).toEqual({ ...before.timers, timeText: null, signal: null, groups: { ...before.timers.groups, herb: null } });
    expect({ ...after.phone, strip: null, defaults: null }).toEqual({ ...before.phone, strip: null, defaults: null });
    // Marked: never again, so the player's own choice wins from here on.
    expect(phoneDefaultsPatch(after)).toBeNull();
    store.update({ timers: { groups: { herb: { enabled: true } }, timeText: true }, phone: { strip: { panes: after.phone.strip.panes.map((e) => ({ ...e, on: true })) } } });
    expect(phoneDefaultsPatch(store.get())).toBeNull();
    expect(store.get().timers.groups.herb.enabled).toBe(true);
    expect(store.get().timers.timeText).toBe(true);
    // And it survives a round through storage.
    expect(phoneDefaultsPatch(migrateSettings(JSON.parse(JSON.stringify(store.get())), { phone: true }))).toBeNull();
  });

  it('the signal becomes Pulse only where it still is "Time text": a chosen signal is kept', () => {
    for (const [stored, want] of [['text', 'pulse'], ['pulse', undefined], ['none', undefined]] as const) {
      const s = migrateSettings(stored050(), { phone: true });
      s.timers.signal = stored;
      const patch = phoneDefaultsPatch(s)!;
      expect((patch.timers as { signal?: string }).signal, stored).toBe(want);
      expect((patch.timers as { timeText?: boolean }).timeText).toBe(false);
      const store = new SettingsStore({ factory: null, storage: null, win: null });
      store.update(() => s);
      store.update(patch);
      expect(store.get().timers.signal).toBe(want ?? stored);
    }
  });
});

describe('phone settings of stage 53: the own keyboard (ADR 0138)', () => {
  it('the digit row is folded away by default, on a computer and on a new phone', () => {
    expect(defaultPhoneSettings().keyboard).toEqual({ digits: false, layout: 'auto' });
    expect(phoneDefaultSettings().phone.keyboard).toEqual({ digits: false, layout: 'auto' });
  });

  it('additive: settings stored before it read as the default, with no version bump', () => {
    const old = JSON.parse(JSON.stringify(defaultSettings())) as { phone: Record<string, unknown>; version: number };
    delete old.phone.keyboard;
    const s = migrateSettings(old);
    expect(s.phone.keyboard).toEqual({ digits: false, layout: 'auto' });
    expect(s.version).toBe(SETTINGS_VERSION);
    // The layout's key came a round after the digit row's (53d): a stored file with the one and not the other.
    const mid = JSON.parse(JSON.stringify(defaultSettings())) as { phone: { keyboard: Record<string, unknown> } };
    mid.phone.keyboard = { digits: true };
    expect(migrateSettings(mid).phone.keyboard).toEqual({ digits: true, layout: 'auto' });
    mid.phone.keyboard = { digits: true, layout: 'sv' };
    expect(migrateSettings(mid).phone.keyboard).toEqual({ digits: true, layout: 'sv' });
  });

  it('a stored value is kept; anything broken is the default; unknown keys are dropped', () => {
    expect(migratePhone({ keyboard: { digits: true } }).keyboard).toEqual({ digits: true, layout: 'auto' });
    expect(migratePhone({ keyboard: { digits: true, layout: 'sv', extra: 1 } }).keyboard).toEqual({ digits: true, layout: 'sv' });
    expect(migratePhone({ keyboard: { layout: 'en' } }).keyboard).toEqual({ digits: false, layout: 'en' });
    for (const bad of [null, 1, 'yes', [], { digits: 'yes' }, { digits: 1 }, { layout: 'de' }, { layout: 1 }, { layout: null }])
      expect(migratePhone({ keyboard: bad }).keyboard).toEqual({ digits: false, layout: 'auto' });
  });

  it('the toggle\'s patch changes nothing else', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const before = store.get();
    store.update({ phone: { keyboard: { digits: true } } });
    const after = store.get();
    expect(after.phone.keyboard).toEqual({ digits: true, layout: 'auto' });
    store.update({ phone: { keyboard: { layout: 'sv' } } });
    expect(store.get().phone.keyboard).toEqual({ digits: true, layout: 'sv' });
    expect({ ...after.phone, keyboard: null }).toEqual({ ...before.phone, keyboard: null });
    expect({ ...after, phone: null }).toEqual({ ...before, phone: null });
  });
});

describe('phone settings of round 53k: the lens\'s four zoom levels', () => {
  it('a level stored by 0.6.1 maps to the same scale or the nearest there is: near and middle are z1, far is z2', () => {
    expect(migrateLensLevel('near', 'z1')).toBe('z1');
    expect(migrateLensLevel('middle', 'z3')).toBe('z1');
    expect(migrateLensLevel('far', 'z1')).toBe('z2');
    for (const [old, now] of [['near', 'z1'], ['middle', 'z1'], ['far', 'z2']] as const) {
      const phone = { ...stored061(), lens: { show: true, opensAt: old } };
      const s = migrateSettings({ ...(JSON.parse(JSON.stringify(defaultSettings())) as Record<string, unknown>), phone });
      expect(s.phone.lens.opensAt).toBe(now);
      expect(s.version).toBe(SETTINGS_VERSION);
    }
  });

  it('the new levels are kept, and migrating twice changes nothing', () => {
    for (const level of PHONE_LENS_LEVELS) {
      const once = migratePhone({ lens: { opensAt: level } });
      expect(once.lens.opensAt).toBe(level);
      expect(migratePhone(once).lens.opensAt).toBe(level);
    }
    expect([...PHONE_LENS_LEVELS]).toEqual(['z1', 'z2', 'z3', 'z4']);
  });

  it('junk is the default (the nearest)', () => {
    expect(migrateLensLevel(2, 'z1')).toBe('z1');
    expect(migrateLensLevel('z9', 'z1')).toBe('z1');
    expect(migrateLensLevel(undefined, 'z1')).toBe('z1');
  });
});

describe('phone settings of round 53k: the lens\'s wanted place and size', () => {
  const unset = { x: null, y: null, size: null };

  it('not set by default, in either orientation', () => {
    expect(defaultPhoneSettings().lens.portrait).toEqual(unset);
    expect(defaultPhoneSettings().lens.landscape).toEqual(unset);
  });

  it('additive: an object stored by 0.6.1 reads as never moved, with no version bump', () => {
    const s = migrateSettings({ ...(JSON.parse(JSON.stringify(defaultSettings())) as Record<string, unknown>), phone: stored061() });
    expect(s.phone.lens).toMatchObject({ show: true, opensAt: 'z1', portrait: unset, landscape: unset });
    expect(s.version).toBe(SETTINGS_VERSION);
  });

  it('stored values are kept, each orientation its own', () => {
    const lens = { portrait: { x: 0.25, y: 0.6, size: 220 }, landscape: { x: null, y: null, size: 130 } };
    const m = migratePhone({ lens }).lens;
    expect(m.portrait).toEqual(lens.portrait);
    expect(m.landscape).toEqual(lens.landscape);
  });

  it('junk is unset: the place needs both shares, within 0 to 1; the size is whole px within its limits', () => {
    expect(migrateLensWant(null)).toEqual(unset);
    expect(migrateLensWant({ x: 0.5 })).toEqual(unset);
    expect(migrateLensWant({ x: 'left', y: 0.5, size: 'big' })).toEqual(unset);
    expect(migrateLensWant({ x: -3, y: 7, size: 150.6 })).toEqual({ x: 0, y: 1, size: 151 });
    expect(migrateLensWant({ size: 5 }).size).toBe(PHONE_LENS_SIZE_MIN);
    expect(migrateLensWant({ size: 1e9 }).size).toBe(PHONE_LENS_SIZE_MAX);
    expect(migrateLensWant({ x: Number.NaN, y: 0.5, size: Number.POSITIVE_INFINITY })).toEqual(unset);
  });

  it('a drop writes one orientation and one of place and size; the reset row clears both orientations', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    store.update({ phone: { lens: { portrait: { x: 0.3, y: 0.4 } } } });
    store.update({ phone: { lens: { portrait: { size: 200 } } } });
    store.update({ phone: { lens: { landscape: { size: 120 } } } });
    expect(store.get().phone.lens).toMatchObject({ show: true, opensAt: 'z1', portrait: { x: 0.3, y: 0.4, size: 200 }, landscape: { x: null, y: null, size: 120 } });
    const row = LENS_GROUP.rows.find((r) => r.id === 'lens-reset')!;
    if (row.kind !== 'action') throw new Error('the reset is an action row');
    expect(row.enabled(store.get())).toBe(true);
    expect(row.value(store.get())).toBe('Moved');
    store.update(row.run(store.get()));
    expect(store.get().phone.lens).toEqual(defaultPhoneSettings().lens);
    expect(row.enabled(store.get())).toBe(false);
    expect(row.value(store.get())).toBe('Default');
  });
});
