// Stage 62 C2: the Log out dialog's line of kinds (round 10, pick 1a),
// src/cloud/space/unsynced-words.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unsyncedKindsWords } from '../../src/cloud/space/unsynced-words';
import type { Unsynced } from '../../src/cloud/sync/types';

const u = (kind: Unsynced['kind'], key: string, change: Unsynced['change'] = 'edit', name: string | null = null): Unsynced => ({ kind, key, name, change });

describe('unsyncedKindsWords', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T22:30:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it("the mockup's line", () => {
    expect(unsyncedKindsWords([u('profile', 'p1', 'new', 'warrior'), u('profile', 'p2', 'delete'), u('settings', 'desktop'), u('comm', '2026-11-15')])).toBe(
      '2 profiles · settings · Comm history, today',
    );
  });

  it('counts profiles and scripts, one and many', () => {
    expect(unsyncedKindsWords([u('profile', 'p1')])).toBe('1 profile');
    expect(unsyncedKindsWords([u('script', 's1')])).toBe('1 script');
    expect(unsyncedKindsWords([u('script', 's1'), u('script', 's2'), u('profile', 'p1')])).toBe('1 profile · 2 scripts');
  });

  it('names each small kind once, in order', () => {
    expect(
      unsyncedKindsWords([
        u('timers', 'Gandalf'),
        u('timers', 'Frodo'),
        u('scriptData', 'autoloot'),
        u('scriptData', 'hunt'),
        u('settings', 'desktop'),
        u('settings', 'device:phone'),
        u('comm', '2026-11-15'),
        u('script', 's1'),
        u('profile', 'p1'),
      ]),
    ).toBe('1 profile · 1 script · settings · script data · Comm history, today · timers');
  });

  it('Comm history: today, or the number of days (a split piece is its day)', () => {
    expect(unsyncedKindsWords([u('comm', '2026-11-15'), u('comm', '2026-11-15.2')])).toBe('Comm history, today');
    expect(unsyncedKindsWords([u('comm', '2026-11-14')])).toBe('Comm history, 1 day');
    expect(unsyncedKindsWords([u('comm', '2026-11-14'), u('comm', '2026-11-15')])).toBe('Comm history, 2 days');
    expect(unsyncedKindsWords([u('comm', '2026-11-13'), u('comm', '2026-11-13.2'), u('comm', '2026-11-15')])).toBe('Comm history, 2 days');
  });

  it("today is the UTC day, not the local one", () => {
    vi.setSystemTime(new Date('2026-11-16T00:10:00Z'));
    expect(unsyncedKindsWords([u('comm', '2026-11-16')])).toBe('Comm history, today');
    expect(unsyncedKindsWords([u('comm', '2026-11-15')])).toBe('Comm history, 1 day');
  });

  it('nothing for nothing', () => {
    expect(unsyncedKindsWords([])).toBe('');
  });
});
