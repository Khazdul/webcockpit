// The words of runs in the cloud (stage 63 C2, ADR 0153; round 11's picks,
// notes/research/start-menu-mockups/round11/README.md): History's tags and
// card notes, the storage line, the "does not fit" dialog, Log out's
// runs row, the counts of Spotlights and Diary, the move's line. Pure and
// dependency free (types only), so the unit tests hold every form and the
// locked copy's words (src/cloud/space/flows.ts) share them.
//
// Sizes in the cloud are in MiB written "MB", as the limit is (50 MiB is
// "50 MB"): one decimal under 10, whole above; under 0.1 MB in KB.

import type { SessionMark } from './runs-view';

const MIB = 1024 * 1024;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** A size in the cloud: `2.4 MB`, `14 MB`, `85 KB`. */
export function cloudSize(bytes: number): string {
  const b = Math.max(0, bytes);
  if (b < 0.1 * MIB) return `${Math.max(1, Math.round(b / 1024))} KB`;
  const mb = b / MIB;
  return `${mb < 10 ? mb.toFixed(1) : String(Math.round(mb))} MB`;
}

/** The number alone of `cloudSize` in MB (`48`, `0.3`), for "48 of 50 MB". */
function mbFigure(bytes: number): string {
  const mb = Math.max(0, bytes) / MIB;
  return mb < 10 ? String(Math.round(mb * 10) / 10) : String(Math.round(mb));
}

/** The account's run storage: `48 of 50 MB`. */
export function cloudOf(used: number, limit: number): string {
  return `${mbFigure(used)} of ${mbFigure(limit)} MB`;
}

// ------------------------------------------------------------ History (pick 2b)

/** The tag beside the name: `in the cloud · 2.4 MB`, offline `in the cloud · needs the network` (a phone: `· offline`), or `not in the cloud`. */
export function markTag(m: SessionMark, o: { offline?: boolean; narrow?: boolean } = {}): string {
  if (!m) return '';
  if (m.kind === 'local') return 'not in the cloud';
  if (o.offline) return o.narrow ? 'in the cloud · offline' : 'in the cloud · needs the network';
  return `in the cloud · ${cloudSize(m.bytes)}`;
}

/** Why a saved run is not in the cloud, after "not in the cloud: ". */
export const LOCAL_WHY: Record<'full' | 'tooLarge' | 'waiting', string> = {
  full: 'the cloud is full',
  tooLarge: 'too large for the cloud',
  waiting: 'not uploaded yet',
};

/** The card's note under Kept: `not in the cloud: the cloud is full`. */
export function keptNote(why: 'full' | 'tooLarge' | 'waiting'): string {
  return `not in the cloud: ${LOCAL_WHY[why]}`;
}

/** The card's lines under Log for a session in the cloud. */
export function logNote(bytes: number, offline: boolean): { line: string; sub: string } {
  return { line: `In the cloud · ${cloudSize(bytes)}`, sub: offline ? 'Needs the network to open' : 'Fetched when opened' };
}

/** The bar's line while a session is fetched: `Fetching from the cloud… 1.3 of 2.4 MB`. */
export function fetchLine(done: number, total: number): string {
  return `Fetching from the cloud… ${mbFigure(Math.min(done, total))} of ${mbFigure(total)} MB`;
}

/** History's flash when a session in the cloud cannot be opened for want of a network. */
export const OFFLINE_FLASH = 'Offline: sessions in the cloud cannot be opened.';

/** The storage line: `This device 6.1 MB · Cloud 48 of 50 MB`; without the cloud's figures, null (the caller keeps its own line). */
export function storageLine(device: { usage: number } | null, cloud: { used: number; limit: number } | null, deviceSize: (n: number) => string): string | null {
  if (!cloud) return null;
  const c = `Cloud ${cloudOf(cloud.used, cloud.limit)}`;
  return device ? `This device ${deviceSize(device.usage)} · ${c}` : c;
}

// ------------------------------------------------------------ "does not fit" (pick 1a)

export type NotFitReason = 'quota' | 'too_many_items' | 'storage_full' | 'item_too_large' | 'tooLarge';

/** The dialog's title and first line for a run that did not fit. */
export function notFitWords(e: { reason: NotFitReason; used: number; limit: number; size: number }): { title: string; line: string } {
  switch (e.reason) {
    case 'quota':
      return { title: 'Cloud storage full', line: `Your cloud storage is full (${cloudOf(Math.max(e.used, 0), e.limit)}).` };
    case 'storage_full':
      return { title: 'Cloud storage full', line: 'Your account’s storage is full.' };
    case 'too_many_items':
      return { title: 'Cloud storage full', line: 'Your account holds as many things as it can.' };
    case 'item_too_large':
      return { title: 'Run too large', line: 'This run’s details are too large for the cloud.' };
    case 'tooLarge':
      return { title: 'Run too large', line: `This run is too large for the cloud (${cloudSize(e.size)}; at most ${cloudSize(e.limit)}).` };
  }
}

/** The dialog's second line. */
export const KEPT_HERE = 'The run is saved on this device.';

/** The start menu's line after Create account when some moved runs do not fit. */
export function notInCloudAfterMoveLine(n: number): string {
  return `${plural(n, 'run')} ${n === 1 ? 'is' : 'are'} not in the cloud: it is full.`;
}

// ------------------------------------------------------------ Log out (pick 3a)

/** The runs row's label: `3 saved runs` (bold) and the rest. */
export function savedRunsLabel(n: number): { count: string; rest: string } {
  return { count: plural(n, 'saved run'), rest: 'not in the cloud' };
}

/** The runs row's second line: `2 cloud full · 1 too large for the cloud · 1 not uploaded yet` (the parts there are). */
export function savedRunsWhy(why: { full: number; tooLarge: number; waiting: number }): string {
  const parts: string[] = [];
  if (why.full > 0) parts.push(`${why.full} cloud full`);
  if (why.tooLarge > 0) parts.push(`${why.tooLarge} too large for the cloud`);
  if (why.waiting > 0) parts.push(`${why.waiting} not uploaded yet`);
  return parts.join(' · ');
}

// ------------------------------------------------------------ the counts (pick 5)

/** Spotlights' and Diary's foot: `3 sessions in the cloud are not counted`. */
export function notCountedLine(n: number): string {
  return `${plural(n, 'session')} in the cloud ${n === 1 ? 'is' : 'are'} not counted`;
}

/** The bar's line while Fetch all runs: `Fetching 3 sessions… 2.6 of 6.9 MB`. */
export function fetchAllLine(sessions: number, done: number, total: number): string {
  return `Fetching ${plural(sessions, 'session')}… ${mbFigure(Math.min(done, total))} of ${mbFigure(total)} MB`;
}

/** Why Fetch all stopped short. */
export function fetchAllFailed(why: string | null): string {
  return why === 'offline' ? 'Offline: the sessions in the cloud could not be fetched.' : 'Some sessions could not be fetched from the cloud.';
}
