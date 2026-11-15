// Stage 63 C2 (ADR 0153): the words of runs in the cloud (round 11's
// picks) and History's tag of a session.
import { describe, expect, it } from 'vitest';
import { QUEUED_QUIET_MS, sessionMark } from '../../src/cloud/runs-view';
import type { RunCloudRow, RunCloudState } from '../../src/cloud/runs/types';
import {
  KEPT_HERE,
  OFFLINE_FLASH,
  cloudOf,
  cloudSize,
  fetchAllFailed,
  fetchAllLine,
  fetchLine,
  keptNote,
  logNote,
  markTag,
  notCountedLine,
  notFitWords,
  notInCloudAfterMoveLine,
  savedRunsLabel,
  savedRunsWhy,
  storageLine,
} from '../../src/cloud/runs-words';
import { notFetchedWords } from '../../src/runs/cloud-hook';
import { deleteWarning } from '../../src/chrome/frames/history-dialogs';
import { notFitRunLine } from '../../src/chrome/frames/runs-cloud';
import { fmtBytes } from '../../src/chrome/frames/history-model';

const MIB = 1024 * 1024;
const NOW = 1_800_000_000_000;

function row(runId: string, state: RunCloudState, over: Partial<RunCloudRow> = {}): RunCloudRow {
  return { runId, state, serverId: `s-${runId}`, size: 0, tries: 0, at: NOW, startedUs: 0, ...over };
}
const rowsOf = (...r: RunCloudRow[]): Map<string, RunCloudRow> => new Map(r.map((x) => [x.runId, x]));
const session = (ids: string[], saved = true) => ({ runs: ids.map((runId) => ({ runId })) as never, saved });

describe('sizes', () => {
  it('in MiB written MB, one decimal under 10, KB under 0.1 MB', () => {
    expect(cloudSize(2.4 * MIB)).toBe('2.4 MB');
    expect(cloudSize(14.4 * MIB)).toBe('14 MB');
    expect(cloudSize(85 * 1024)).toBe('85 KB');
    expect(cloudSize(10)).toBe('1 KB');
    expect(cloudSize(0.1 * MIB)).toBe('0.1 MB');
  });

  it('the account’s storage: "48 of 50 MB"', () => {
    expect(cloudOf(48 * MIB, 50 * MIB)).toBe('48 of 50 MB');
    expect(cloudOf(0.3 * MIB, 50 * MIB)).toBe('0.3 of 50 MB');
    expect(cloudOf(0, 50 * MIB)).toBe('0 of 50 MB');
  });
});

describe('History: the tag of a session (pick 2b)', () => {
  it('none without rows (a guest, the flag off) and for a run in step', () => {
    expect(sessionMark(session(['a']), new Map(), NOW)).toBeNull();
    expect(sessionMark(session(['a']), rowsOf(row('a', 'up', { size: 9 })), NOW)).toBeNull();
  });

  it('in the cloud: the bytes to fetch of its runs only in the cloud', () => {
    const rows = rowsOf(row('a', 'remote', { size: 2 * MIB }), row('b', 'fetching', { size: 0.4 * MIB }), row('c', 'up', { size: 5 * MIB }));
    expect(sessionMark(session(['a', 'b', 'c']), rows, NOW)).toEqual({ kind: 'remote', bytes: 2.4 * MIB });
    expect(markTag(sessionMark(session(['a', 'b']), rows, NOW))).toBe('in the cloud · 2.4 MB');
  });

  it('not in the cloud: full, too large; never for an unsaved session', () => {
    expect(sessionMark(session(['a']), rowsOf(row('a', 'full')), NOW)).toEqual({ kind: 'local', why: 'full' });
    expect(sessionMark(session(['a', 'b']), rowsOf(row('a', 'full'), row('b', 'tooLarge')), NOW)).toEqual({ kind: 'local', why: 'tooLarge' });
    expect(sessionMark(session(['a'], false), rowsOf(row('a', 'full')), NOW)).toBeNull();
    expect(markTag({ kind: 'local', why: 'full' })).toBe('not in the cloud');
  });

  it('queued: quiet just after the save; "not in the cloud" after a failed upload or a long wait', () => {
    expect(sessionMark(session(['a']), rowsOf(row('a', 'queued', { at: NOW - 1000 })), NOW)).toBeNull();
    expect(sessionMark(session(['a']), rowsOf(row('a', 'queued', { at: NOW - 1000, tries: 1 })), NOW)).toEqual({ kind: 'local', why: 'waiting' });
    expect(sessionMark(session(['a']), rowsOf(row('a', 'queued', { at: NOW - QUEUED_QUIET_MS - 1 })), NOW)).toEqual({ kind: 'local', why: 'waiting' });
  });

  it('offline: the network is needed (a phone says it shorter)', () => {
    const m = { kind: 'remote' as const, bytes: MIB };
    expect(markTag(m, { offline: true })).toBe('in the cloud · needs the network');
    expect(markTag(m, { offline: true, narrow: true })).toBe('in the cloud · offline');
    expect(markTag(null)).toBe('');
  });

  it('the card, the bar, the flash, the storage line', () => {
    expect(keptNote('full')).toBe('not in the cloud: the cloud is full');
    expect(keptNote('tooLarge')).toBe('not in the cloud: too large for the cloud');
    expect(keptNote('waiting')).toBe('not in the cloud: not uploaded yet');
    expect(logNote(2.4 * MIB, false)).toEqual({ line: 'In the cloud · 2.4 MB', sub: 'Fetched when opened' });
    expect(logNote(2.4 * MIB, true).sub).toBe('Needs the network to open');
    expect(fetchLine(1.3 * MIB, 2.4 * MIB)).toBe('Fetching from the cloud… 1.3 of 2.4 MB');
    expect(OFFLINE_FLASH).toBe('Offline: sessions in the cloud cannot be opened.');
    expect(storageLine({ usage: 6_100_000 }, { used: 48 * MIB, limit: 50 * MIB }, fmtBytes)).toBe('This device 6.1 MB · Cloud 48 of 50 MB');
    expect(storageLine(null, { used: MIB, limit: 50 * MIB }, fmtBytes)).toBe('Cloud 1 of 50 MB');
    expect(storageLine({ usage: 1 }, null, fmtBytes)).toBeNull();
  });

  it('a session that could not be fetched', () => {
    expect(notFetchedWords('offline')).toBe('This session is in the cloud and needs the network to open.');
    expect(notFetchedWords('missing')).toBe('This session is no longer in the cloud.');
    expect(notFetchedWords('newer')).toMatch(/newer WebCockpit/);
    expect(notFetchedWords('whatever')).toBe('This session is in the cloud and could not be fetched.');
  });
});

describe('"does not fit" (pick 1a)', () => {
  it('a body over the account’s storage: the numbers', () => {
    expect(notFitWords({ reason: 'quota', used: 49 * MIB, limit: 50 * MIB, size: 2 * MIB })).toEqual({
      title: 'Cloud storage full',
      line: 'Your cloud storage is full (49 of 50 MB).',
    });
    expect(KEPT_HERE).toBe('The run is saved on this device.');
  });

  it('its item did not fit, or the body is over 20 MB', () => {
    expect(notFitWords({ reason: 'storage_full', used: 0, limit: 0, size: 0 }).title).toBe('Cloud storage full');
    expect(notFitWords({ reason: 'too_many_items', used: 0, limit: 0, size: 0 }).line).toBe('Your account holds as many things as it can.');
    expect(notFitWords({ reason: 'tooLarge', used: 0, limit: 20 * MIB, size: 23.4 * MIB })).toEqual({
      title: 'Run too large',
      line: 'This run is too large for the cloud (23 MB; at most 20 MB).',
    });
  });

  it('the run’s line, and the move’s line', () => {
    const start = new Date(2026, 10, 14, 19, 33).getTime() * 1000;
    expect(notFitRunLine({ startUs: start, endUs: start + (4 * 60 + 4) * 60e6 }, 2.1 * MIB)).toBe('Saturday, 14 November · 4 h 4 min · 2.1 MB');
    expect(notInCloudAfterMoveLine(3)).toBe('3 runs are not in the cloud: it is full.');
    expect(notInCloudAfterMoveLine(1)).toBe('1 run is not in the cloud: it is full.');
  });
});

describe('Log out (pick 3a) and Delete (pick 4)', () => {
  it('one runs row, the reasons in its second line', () => {
    expect(savedRunsLabel(3)).toEqual({ count: '3 saved runs', rest: 'not in the cloud' });
    expect(savedRunsLabel(1).count).toBe('1 saved run');
    expect(savedRunsWhy({ full: 2, tooLarge: 1, waiting: 0 })).toBe('2 cloud full · 1 too large for the cloud');
    expect(savedRunsWhy({ full: 0, tooLarge: 0, waiting: 1 })).toBe('1 not uploaded yet');
  });

  it('logged in with runs in the cloud, a saved session is deleted everywhere; otherwise today’s words', () => {
    expect(deleteWarning(true, true)).toBe('Delete this session? It is deleted on all your devices and in the cloud.');
    expect(deleteWarning(false, true)).toBe("This will permanently delete the session's logs and run data. This cannot be undone.");
    expect(deleteWarning(true, false)).toBe("This will permanently delete the session's logs and run data. This cannot be undone.");
  });
});

describe('the counts (pick 5)', () => {
  it('the foot’s line and Fetch all’s', () => {
    expect(notCountedLine(3)).toBe('3 sessions in the cloud are not counted');
    expect(notCountedLine(1)).toBe('1 session in the cloud is not counted');
    expect(fetchAllLine(3, 2.6 * MIB, 6.9 * MIB)).toBe('Fetching 3 sessions… 2.6 of 6.9 MB');
    expect(fetchAllFailed('offline')).toMatch(/^Offline/);
  });
});

describe('a saved run sealed is noted (the upload queue takes it at once)', () => {
  it('noteStored("runSealed") for a saved run only, once', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { CaptureStore } = await import('../../src/capture/store');
    const { onStored } = await import('../../src/core/store-events');
    const store = await CaptureStore.open(new IDBFactory());
    const base = { endedUs: null, sealed: false, bytes: 0, lines: 0 };
    await store.putRun({ runId: 'A/1', character: 'A', startedUs: 100, ...base, saved: true });
    await store.putRun({ runId: 'B/1', character: 'B', startedUs: 200, ...base });
    const seen: string[] = [];
    const off = onStored((k) => seen.push(k));
    await store.sealRun('B/1', 300);
    expect(seen).toEqual([]);
    await store.sealRun('A/1', 400);
    await store.sealRun('A/1', 500);
    expect(seen).toEqual(['runSealed']);
    off();
  });
});
