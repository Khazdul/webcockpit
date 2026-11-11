// Stage 51f (ADR 0136 §7, §10, §13): the compass key sizes and what follows
// from them, the wake lock, and the settings keys. Stage 52: the vibration
// is gone (the setting is dropped by the migration), the group is "Quick
// buttons" with the number of K keys, and the second column's sums.
import { describe, expect, it, vi } from 'vitest';
import { KEY_PX_LANDSCAPE, KEY_PX_PORTRAIT, PAD_MARGIN, compassHeight, compassPx, hotBottom, hotStep, hotTop, hotWidth, keyRowRight, leftOfHot, sideClear, topLimit } from '../../src/phone/compass-size';
import { COMPASS_GROUP, CONNECTION_GROUP, SETTINGS_GROUPS, rowsShown } from '../../src/phone/settings-page';
import { WakeLock, type WakeSentinel, canWakeLock, wakeWanted } from '../../src/phone/wake-lock';
import { migratePhone, migrateSettings } from '../../src/settings/migrate';
import { SETTINGS_VERSION, defaultPhoneSettings, defaultSettings } from '../../src/settings/types';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('compass size', () => {
  it('the keys are 36 px in portrait and 44 px in landscape (stage 52: not a setting)', () => {
    expect(compassPx(false)).toBe(36);
    expect(compassPx(true)).toBe(44);
    expect([KEY_PX_PORTRAIT, KEY_PX_LANDSCAPE]).toEqual([36, 44]);
  });

  it('landscape: the lens and its key row stand left of the hot key columns there are', () => {
    // The margin, one 44 px column (or two and their gap), and the air.
    expect(leftOfHot(44, 1, 12)).toBe(8 + 44 + 12);
    expect(leftOfHot(44, 2, 12)).toBe(8 + 91 + 12);
    expect(leftOfHot(44, 2, 8)).toBe(8 + 91 + 8);
  });

  it('landscape: the left column stays clear of the columns and the wider of the least lens and the key row', () => {
    // Two columns, a 106 px lens with its key, a 132 px row, 12 px of air on both sides.
    expect(sideClear(44, 2, 106, 132, 12)).toBe(8 + 91 + 12 + 132 + 12);
    expect(sideClear(44, 1, 140, 132, 12)).toBe(8 + 44 + 12 + 140 + 12);
    // Never less than the compass and the air.
    expect(sideClear(44, 1, 10, 10, 4)).toBe(3 * 44 + 6 + 8 + 4);
  });

  it('at M the sums are the mockup\'s: 134 px of compass, the column from 142 px, 43 px a key', () => {
    expect(compassHeight(40)).toBe(134);
    expect(hotBottom(40)).toBe(142);
    expect(hotStep(40)).toBe(43);
    expect(hotTop(40, 3)).toBe(142 + 126);
    expect(hotTop(40, 1)).toBe(182);
    // The strip, the fight card and Comm stay above the place of three keys, whatever is shown (stage 52).
    expect(topLimit(40)).toBe(268);
    expect(topLimit(44)).toBe(hotTop(44, 3));
  });

  it('the column and the lens\'s room follow the size', () => {
    expect(compassHeight(36)).toBe(122);
    expect(hotBottom(36)).toBe(130);
    expect(hotTop(36, 3)).toBe(130 + 3 * 36 + 6);
    expect(compassHeight(44)).toBe(146);
    expect(hotBottom(44)).toBe(154);
    expect(hotTop(44, 3)).toBe(154 + 3 * 44 + 6);
  });
});

describe('two hot key columns (stage 52)', () => {
  it('the columns take one key, or two and their gap, from the right margin', () => {
    expect(hotWidth(40, 1)).toBe(40);
    expect(hotWidth(40, 2)).toBe(83);
    expect(hotWidth(44, 2)).toBe(91);
  });

  it('the lens\'s key row stands left of the leftmost column it would reach into', () => {
    // 844 px high, M keys: a column of three tops out at 844 − 268 = 576.
    const h = 844;
    // The row ends above both: at the edge's margin.
    expect(keyRowRight(56, h, 40, [3, 3], 8)).toBe(PAD_MARGIN);
    // No column at all.
    expect(keyRowRight(700, h, 40, [0, 0], 8)).toBe(PAD_MARGIN);
    // Into the first column only (the second is lower, or not there): left of the first.
    expect(keyRowRight(600, h, 40, [3, 0], 8)).toBe(PAD_MARGIN + 40 + 8);
    expect(keyRowRight(600, h, 40, [3, 1], 8)).toBe(PAD_MARGIN + 40 + 8);
    // Into the second too: left of both.
    expect(keyRowRight(600, h, 40, [3, 3], 8)).toBe(PAD_MARGIN + 83 + 8);
    // Into the second only (the first has fewer keys): still left of both, the row is wider than a column.
    expect(keyRowRight(600, h, 40, [1, 3], 8)).toBe(PAD_MARGIN + 83 + 8);
    // Exactly at a column's top is not into it.
    expect(keyRowRight(h - hotTop(40, 3), h, 40, [3, 3], 8)).toBe(PAD_MARGIN);
  });
});

describe('wake lock', () => {
  type Request = (type: 'screen') => Promise<WakeSentinel>;
  function fake(): { nav: { wakeLock: { request: ReturnType<typeof vi.fn<Request>> } }; locks: Array<WakeSentinel & { released: boolean; fire(): void }> } {
    const locks: Array<WakeSentinel & { released: boolean; fire(): void }> = [];
    const request = vi.fn<Request>(async () => {
      let onRelease: (() => void) | null = null;
      const s = {
        released: false,
        release: async () => {
          s.released = true;
        },
        addEventListener: (_t: 'release', fn: () => void) => {
          onRelease = fn;
        },
        fire: () => onRelease?.(),
      };
      locks.push(s);
      return s;
    });
    return { nav: { wakeLock: { request } }, locks };
  }

  it('wanted only with the setting on, connected and visible', () => {
    expect(wakeWanted({ setting: true, connected: true, visible: true })).toBe(true);
    expect(wakeWanted({ setting: false, connected: true, visible: true })).toBe(false);
    expect(wakeWanted({ setting: true, connected: false, visible: true })).toBe(false);
    expect(wakeWanted({ setting: true, connected: true, visible: false })).toBe(false);
  });

  it('asked for when wanted, once; released when not; asked for again after the browser took it back', async () => {
    const f = fake();
    let want = false;
    const w = new WakeLock(f.nav, () => want);
    w.sync();
    expect(f.nav.wakeLock.request).not.toHaveBeenCalled();
    want = true;
    w.sync();
    w.sync();
    await tick();
    expect(f.nav.wakeLock.request).toHaveBeenCalledTimes(1);
    expect(f.nav.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(w.held).toBe(true);
    w.sync();
    expect(f.nav.wakeLock.request).toHaveBeenCalledTimes(1);
    // A disconnect: released.
    want = false;
    w.sync();
    expect(w.held).toBe(false);
    expect(f.locks[0]!.released).toBe(true);
    // Connected again, then hidden (the browser releases it itself), then visible.
    want = true;
    w.sync();
    await tick();
    expect(f.nav.wakeLock.request).toHaveBeenCalledTimes(2);
    f.locks[1]!.fire();
    expect(w.held).toBe(false);
    w.sync();
    await tick();
    expect(f.nav.wakeLock.request).toHaveBeenCalledTimes(3);
    expect(w.held).toBe(true);
    w.dispose();
    expect(f.locks[2]!.released).toBe(true);
    expect(w.held).toBe(false);
  });

  it('a lock that arrives after it stopped being wanted is let go at once', async () => {
    const f = fake();
    let want = true;
    const w = new WakeLock(f.nav, () => want);
    w.sync();
    want = false;
    w.sync();
    await tick();
    expect(w.held).toBe(false);
    expect(f.locks[0]!.released).toBe(true);
  });

  it('a refused request and a browser without the API do nothing and throw nothing', async () => {
    const refused = { wakeLock: { request: vi.fn(async () => Promise.reject(new Error('NotAllowedError'))) } };
    const w = new WakeLock(refused, () => true);
    w.sync();
    await tick();
    expect(w.held).toBe(false);
    // The next change of the conditions asks again.
    w.sync();
    await tick();
    expect(refused.wakeLock.request).toHaveBeenCalledTimes(2);
    expect(canWakeLock({})).toBe(false);
    expect(canWakeLock(undefined)).toBe(false);
    const none = new WakeLock({}, () => true);
    expect(() => none.sync()).not.toThrow();
    expect(none.held).toBe(false);
  });
});

describe('phone settings of stage 51f', () => {
  it('defaults: the screen kept on, no automatic reconnect; no vibration or key size setting any more', () => {
    const d = defaultPhoneSettings();
    expect('compassSize' in d).toBe(false);
    expect(d.sideCols).toBeNull();
    expect('vibrate' in d).toBe(false);
    expect(d.wakeLock).toBe(true);
    expect(d.autoReconnect).toBe(false);
  });

  it('settings stored before 51f get the defaults; no version bump', () => {
    const old = JSON.parse(JSON.stringify(defaultSettings())) as { phone: Record<string, unknown> };
    for (const k of ['sideCols', 'wakeLock', 'autoReconnect']) delete old.phone[k];
    const s = migrateSettings(old);
    expect(s.version).toBe(SETTINGS_VERSION);
    expect(s).toEqual(defaultSettings());
  });

  it('stored values are kept; malformed ones fall back', () => {
    const p = migratePhone({ sideCols: 31, wakeLock: false, autoReconnect: true });
    expect([p.sideCols, p.wakeLock, p.autoReconnect]).toEqual([31, false, true]);
    const bad = migratePhone({ sideCols: '31', wakeLock: 1, autoReconnect: 'true' });
    expect([bad.sideCols, bad.wakeLock, bad.autoReconnect]).toEqual([null, true, false]);
    // The landscape column's width: whole columns within the stored limits (the allocator fits it to the screen).
    expect([migratePhone({ sideCols: 30.7 }).sideCols, migratePhone({ sideCols: 0 }).sideCols, migratePhone({ sideCols: 9999 }).sideCols, migratePhone({ sideCols: NaN }).sideCols]).toEqual([
      migratePhone({ commRows: 30.7 }).commRows,
      1,
      200,
      null,
    ]);
  });

  it('a stored key size (0.5.0\'s S/M/L) is tolerated and dropped', () => {
    for (const compassSize of ['s', 'l', 44]) {
      const p = migratePhone({ compassSize, wakeLock: false });
      expect('compassSize' in p).toBe(false);
      expect(p.wakeLock).toBe(false);
    }
    const stored = JSON.parse(JSON.stringify(defaultSettings())) as { phone: Record<string, unknown> };
    stored.phone.compassSize = 'l';
    expect(migrateSettings(stored)).toEqual(defaultSettings());
  });

  it('a stored vibrate (0.5.0) is tolerated and dropped', () => {
    for (const vibrate of [true, false, 'yes']) {
      const p = migratePhone({ autoReconnect: true, vibrate });
      expect('vibrate' in p).toBe(false);
      expect(p.autoReconnect).toBe(true);
    }
    const stored = JSON.parse(JSON.stringify(defaultSettings())) as { phone: Record<string, unknown> };
    stored.phone.vibrate = true;
    expect(migrateSettings(stored)).toEqual(defaultSettings());
  });
});

describe('the settings page\'s Quick buttons and Connection groups', () => {
  it('the groups in the ADR\'s order', () => {
    expect(SETTINGS_GROUPS.map((g) => g.id)).toEqual(['text', 'compass', 'lens', 'panes', 'comm', 'connection']);
  });

  it('rows whose browser API is missing are absent, not dimmed', () => {
    const nav = globalThis.navigator as unknown as Record<string, unknown>;
    const had = { wakeLock: Object.getOwnPropertyDescriptor(nav, 'wakeLock') };
    try {
      Object.defineProperty(nav, 'wakeLock', { value: undefined, configurable: true });
      expect(rowsShown(COMPASS_GROUP).map((r) => r.id)).toEqual(['hotkey-count']);
      expect(rowsShown(CONNECTION_GROUP).map((r) => r.id)).toEqual(['auto-reconnect', 'weather']);
      Object.defineProperty(nav, 'wakeLock', { value: { request: async () => ({ release: async () => {} }) }, configurable: true });
      expect(rowsShown(COMPASS_GROUP).map((r) => r.id)).toEqual(['hotkey-count']);
      expect(rowsShown(CONNECTION_GROUP).map((r) => r.id)).toEqual(['wake-lock', 'auto-reconnect', 'weather']);
    } finally {
      for (const k of ['wakeLock'] as const) {
        if (had[k]) Object.defineProperty(nav, k, had[k]!);
        else delete nav[k];
      }
    }
  });

  it('the rows write their keys and nothing else', () => {
    const s = defaultSettings();
    const row = (g: typeof COMPASS_GROUP, id: string) => g.rows.find((r) => r.id === id)!;
    // The key size is not a setting any more (stage 52): no such row.
    expect(COMPASS_GROUP.rows.some((r) => r.id === 'compass-size')).toBe(false);
    expect(COMPASS_GROUP.title).toBe('Quick buttons');
    const count = row(COMPASS_GROUP, 'hotkey-count');
    expect(count.kind === 'stepper' && [count.get(s), count.step(3, 1), count.step(6, 1), count.step(1, -1)]).toEqual([3, 4, 6, 1]);
    expect(count.kind === 'stepper' && count.set(5, s)).toEqual({ phone: { hotkeyCount: 5 } });
    const wake = row(CONNECTION_GROUP, 'wake-lock');
    expect(wake.kind === 'toggle' && wake.set(false, s)).toEqual({ phone: { wakeLock: false } });
    const auto = row(CONNECTION_GROUP, 'auto-reconnect');
    expect(auto.kind === 'toggle' && auto.set(true, s)).toEqual({ phone: { autoReconnect: true } });
    const weather = row(CONNECTION_GROUP, 'weather');
    expect(weather.kind === 'toggle' && weather.set(true, s)).toEqual({ weather: { enabled: true } });
    expect(weather.kind === 'toggle' && weather.get(s)).toBe(s.weather.enabled);
  });
});
