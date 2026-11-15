// The watch page's pure parts (stage 64 C2, ADR 0154 "The watch page";
// round 12's pick 3a and 5): the address, the words of every state, the
// band's details, the report's reasons and the text a report may carry.
// No DOM, no requests (src/watch/page.tsx draws, src/watch/api.ts asks).

import { PUB_ID_PATTERN, type PubMeta, REPORT_TEXT_MAX, type ReportReason } from '../../shared/cloud/api.ts';

/** Where reports go without an account (About, /privacy and the guest's Report). */
export const ABUSE_ADDRESS = 'abuse@mumecockpit.com';

/** The address's run: `<base>r/<id>` (a trailing slash allowed); null when the path is not under `<base>r/`. */
export function watchIdOf(path: string, base = '/'): { id: string; valid: boolean } | null {
  const b = base.endsWith('/') ? base : `${base}/`;
  if (!path.startsWith(`${b}r/`)) return null;
  const id = path.slice(b.length + 2).replace(/\/$/, '');
  return { id, valid: PUB_ID_PATTERN.test(id) };
}

/** A state that has no run to show: its two lines (round 12, "The words"). */
export type WatchEnd = 'removed' | 'hidden' | 'unknown' | 'notyet';

export const END_WORDS: Record<WatchEnd, readonly [string, string]> = {
  removed: ['This run was removed by its sender.', 'The link no longer leads anywhere.'],
  hidden: ['This run is hidden.', 'It was hidden after reports and waits for a look.'],
  unknown: ['There is no run at this link.', 'Check the address, or ask whoever sent it.'],
  notyet: ['This link does not work yet.', 'Shared runs open soon. Until then the link leads nowhere.'],
};

/** The run could not be fetched (the network, the service): try again. */
export const FAILED_WORDS: readonly [string, string] = ['The run could not be loaded.', 'Check the connection and try again.'];
/** The page refused the payload (its `PayloadReadError` text is the first line). */
export const REFUSED_NOTE = 'The link works, but this run cannot be played. Tell whoever sent it.';
/** `?admin` without the admin's access. */
export const ADMIN_WORDS: readonly [string, string] = ['This view is for the admin.', 'Open the link without ?admin to watch it as anyone does.'];

/** What an HTTP status of the meta or the payload means for the page; null: not one of the states. */
export function endOf(status: number): WatchEnd | null {
  if (status === 404) return 'unknown';
  if (status === 410) return 'removed';
  if (status === 451) return 'hidden';
  return null;
}

/** The sender's own hidden run: the note in the description's line. */
export const OWNER_NOTE = ['Hidden after reports.', 'Only you can watch it until we have looked; nothing is needed from you.'] as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "1 h 15 min", "42 min", "50 s" (the cut's played length). */
export function lengthText(s: number): string {
  const t = Math.max(0, Math.round(Number.isFinite(s) ? s : 0));
  if (t < 60) return `${t} s`;
  const min = Math.round(t / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "26 September 2026" (local time). */
export function dateText(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "1 view", "37 views". */
export function viewsText(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return v === 1 ? '1 view' : `${v.toLocaleString('en-US')} views`;
}

/** Megabytes with one decimal ("1.2"); at least 0.1 for anything above nothing. */
export function mbText(bytes: number): string {
  const mb = bytes / 1_000_000;
  return (bytes > 0 && mb < 0.1 ? 0.1 : mb).toFixed(1);
}

/** The loading line: "Loading the run… 0.4 of 1.2 MB" (or without the total while it is unknown). */
export function loadingLine(done: number, total: number): string {
  return total > 0 ? `Loading the run… ${mbText(Math.min(done, total))} of ${mbText(total)} MB` : `Loading the run… ${mbText(done)} MB`;
}

/** The band's details: each a piece of text (the page puts the dots between). */
export interface MetaLine {
  character: string | null;
  level: string | null;
  length: string;
  date: string;
  views: string;
  sender: string | null;
}

export function metaLine(m: PubMeta): MetaLine {
  return {
    character: m.character || null,
    level: typeof m.level === 'number' ? `Level ${m.level}` : null,
    length: lengthText(m.lengthS),
    date: dateText(m.created),
    views: viewsText(m.views),
    sender: m.sender || null,
  };
}

/** The download's name: the run's title, file-name safe, `.html`. */
export function downloadName(title: string): string {
  // eslint-disable-next-line no-control-regex
  const t = title.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '-').trim().replace(/^\.+/, '-');
  return `${t || 'mume-run'}.html`;
}

/** The four reasons, in the drawn order and words. */
export const REASONS: readonly { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment' },
  { id: 'real_life', label: 'Real-life information about someone' },
  { id: 'rules', label: 'Breaks MUME’s rules' },
  { id: 'other', label: 'Other' },
];

// C0 but \n, DEL, C1, the bidi embeddings, overrides and isolates (the Worker refuses them, ADR 0154 "As built (B1)").
// eslint-disable-next-line no-control-regex
const NOT_IN_TEXT = /[\x00-\x09\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/g;

/**
 * A report's text as the Worker takes it: NFC, no control characters but
 * `\n` (a `\r\n` becomes `\n`), no bidi controls or lone surrogates,
 * trimmed, at most `REPORT_TEXT_MAX` code points. Empty: no text.
 */
export function reportText(raw: string): string {
  const s = raw
    .replace(/\r\n?/g, '\n')
    .replace(NOT_IN_TEXT, '')
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '')
    .normalize('NFC')
    .trim();
  return [...s].slice(0, REPORT_TEXT_MAX).join('').trim();
}

/** What a failed report says (the server's code, or ours for the network). */
export function reportFailText(status: number, code: string): string {
  if (code === 'too_many' || status === 429) return 'You have sent the most reports a day. Try again tomorrow.';
  if (code === 'suspended') return 'This account is suspended: it cannot report.';
  if (code === 'own') return 'This is your own run.';
  if (status === 404) return 'This run is no longer there.';
  if (status === 0) return 'Offline: the report could not be sent. Try again when you are online.';
  return 'The report could not be sent. Try again later.';
}
