// The watch page's pure parts (stage 64 C2, ADR 0154 "The watch page";
// round 12's pick 3a and 5): the address, the words of every state, the
// band's details, the report's reasons and the text a report may carry.
// No DOM, no requests (src/watch/page.tsx draws, src/watch/api.ts asks).

import type { PubMeta, ReportKind, ReportReason, Stars } from '../../shared/cloud/api.ts';
import { cleanPublicText, cleanText, publicTextToSend } from '../../shared/cloud/text.ts';

// The contract's PUB_ID_PATTERN and REPORT_TEXT_MAX (shared/cloud/api.ts), written out so the chrome
// chunk, which holds this page, does not load that module for two values (a unit test holds them together).
/** A publication's id. */
export const WATCH_ID_PATTERN = /^[A-Za-z0-9]{12}$/;
/** A report's text, at most (code points). */
export const REPORT_MAX = 500;

/** Where reports go without an account (About, /privacy and the guest's Report). */
export const ABUSE_ADDRESS = 'abuse@mumecockpit.com';

/** The address's run: `<base>r/<id>` (a trailing slash allowed); null when the path is not under `<base>r/`. */
export function watchIdOf(path: string, base = '/'): { id: string; valid: boolean } | null {
  const b = base.endsWith('/') ? base : `${base}/`;
  if (!path.startsWith(`${b}r/`)) return null;
  const id = path.slice(b.length + 2).replace(/\/$/, '');
  return { id, valid: WATCH_ID_PATTERN.test(id) };
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

/**
 * What the server's config says of `share` for the watch page (review fix
 * CR1): `off` only when a config came and says so (or the page may not call
 * the API at all); `failed` when it could not be had (Try again).
 */
export function shareFlag(allowed: boolean, answer: { flags: { share?: boolean } } | null): 'on' | 'off' | 'failed' {
  if (!allowed) return 'off';
  if (answer === null) return 'failed';
  return answer.flags.share === true ? 'on' : 'off';
}

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

/** "26 September 2026" (local time); `t` in ms, as the Worker sends every time. */
export function dateText(t: number): string {
  const d = new Date(t);
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

/**
 * A report's text as the Worker takes it: NFC, no control characters but
 * `\n` (a `\r\n` becomes `\n`), no bidi controls or lone surrogates,
 * trimmed, at most `REPORT_MAX` code points. Empty: no text.
 */
export function reportText(raw: string): string {
  // The Worker's rules (shared/cloud/text.ts): refused characters taken out, `\n` kept.
  const s = cleanText(raw.replace(/\r\n?/g, '\n'), { newlines: true }).trim();
  return [...s].slice(0, REPORT_MAX).join('').trim();
}

/** What a failed report says (the server's code, or ours for the network); `kind` names the item. */
export function reportFailText(status: number, code: string, kind: ReportKind = 'run'): string {
  const what = kind === 'run' ? 'run' : kind;
  if (code === 'too_many' || status === 429) return 'You have sent the most reports a day. Try again tomorrow.';
  if (code === 'suspended') return 'This account is suspended: it cannot report.';
  if (code === 'own') return `This is your own ${what}.`;
  if (status === 404) return `This ${what} is no longer there.`;
  if (status === 0) return 'Offline: the report could not be sent. Try again when you are online.';
  return 'The report could not be sent. Try again later.';
}

/**
 * The statistics' device id (src/cloud/beat.ts `deviceId`, ADR 0147: the
 * same key and form, a lowercase UUID in `wc.device`), made and kept if
 * there is none. Written out here so the watch chunk does not split the
 * beat's module out of the cloud chunk (a unit test holds the two
 * together). The page's own id when storage fails.
 */
export const WATCH_DEVICE_KEY = 'wc.device';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let pageDevice: string | null = null;

function uuid4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Not a secure context (an address over plain http): the same form from random bytes.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function watchDevice(storage: Pick<Storage, 'getItem' | 'setItem'> | null, uuid: () => string = uuid4): string {
  try {
    const kept = storage?.getItem(WATCH_DEVICE_KEY);
    if (kept && UUID.test(kept)) return kept.toLowerCase();
  } catch {
    // Storage blocked: the page's own id below.
  }
  const id = (pageDevice ??= uuid().toLowerCase());
  try {
    storage?.setItem(WATCH_DEVICE_KEY, id);
  } catch {
    // Not kept.
  }
  return id;
}


// ------------------------------------------------------------ stars and comments (stage 65 C2)
//
// ADR 0155 "Votes", "Comments"; round 13's pick 3a: the stars in the band,
// the comments under the replay, inside the start page's frame. Only when
// the meta carries `stars` (the flag `gallery` on).

// The contract's COMMENT_MAX, COMMENT_NEWLINES_MAX and COMMENTS_PAGE_SIZE
// (shared/cloud/api.ts), written out for the same reason as the two above (a
// unit test holds them together).
/** A comment, at most (code points). */
export const COMMENT_LIMIT = 1000;
/** Line breaks a comment may have. */
export const COMMENT_BREAKS = 20;
/** Comments per page of `GET /api/pub/<id>/comments`. */
export const COMMENTS_PER_PAGE = 50;

/** The comment field's text as the player types: the free-text rules (shared/cloud/text.ts), cut to `COMMENT_LIMIT` code points. Not trimmed. */
export function commentField(raw: string): string {
  const rules = { newlines: COMMENT_BREAKS };
  const s = cleanPublicText(raw, rules);
  const cps = [...s];
  // Cut, then cleaned again: the cut may leave a ZWJ with nothing after it.
  return cps.length > COMMENT_LIMIT ? cleanPublicText(cps.slice(0, COMMENT_LIMIT).join(''), rules) : s;
}

/** What is sent: the field's text cleaned and trimmed (empty: nothing to post, also when nothing visible is left). */
export function commentToSend(raw: string): string {
  return publicTextToSend(commentField(raw), { newlines: COMMENT_BREAKS });
}

/** Code points of a text (the counter's figure). */
export const codePoints = (s: string): number => [...s].length;

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five'];

/** "four" (the vote in words, as the mockup's "Your stars: four"). */
export function starWord(n: number): string {
  return WORDS[Math.max(0, Math.min(5, Math.round(n)))]!;
}

/** The mean with one decimal ("4.3"); null without votes. */
export function meanText(s: Stars): string | null {
  if (!(s.count > 0) || !Number.isFinite(s.sum)) return null;
  return (Math.round((s.sum / s.count) * 10) / 10).toFixed(1);
}

/** "1 vote", "12 votes", "No votes yet". */
export function votesText(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  if (v === 0) return 'No votes yet';
  return v === 1 ? '1 vote' : `${v.toLocaleString('en-US')} votes`;
}

/** Whole stars to light for a mean (0–5): the mean rounded. */
export function meanStars(s: Stars): number {
  return s.count > 0 ? Math.max(0, Math.min(5, Math.round(s.sum / s.count))) : 0;
}

/** A comment's age: "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function ageText(t: number, now: number): string {
  const d = Math.max(0, now - t);
  const min = Math.floor(d / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return dateText(t);
}

/** What a failed vote says. */
export function voteFailText(status: number, code: string): string {
  if (code === 'too_many' || status === 429) return 'You have rated many runs this hour. Try again later.';
  if (code === 'suspended') return 'This account is suspended: it cannot rate.';
  if (code === 'own') return 'This is your own run.';
  if (status === 401) return 'Log in again to rate.';
  if (status === 404) return 'This run can no longer be rated.';
  if (status === 0) return 'Offline: the stars were not saved.';
  return 'The stars could not be saved. Try again later.';
}

/** A hidden comment or note cannot be removed by its writer (review fix S7: `403 hidden`). */
export const HIDDEN_TEXT = 'Hidden after reports; the admin will look at it.';

/** What a failed comment (post or remove) says. */
export function commentFailText(status: number, code: string): string {
  if (code === 'hidden') return HIDDEN_TEXT;
  if (code === 'too_many' || status === 429) return 'You have written many comments this hour. Try again later.';
  if (code === 'suspended') return 'This account is suspended: it cannot comment.';
  if (code === 'full' || status === 409) return 'This run has as many comments as it can hold.';
  if (code === 'bad_text') return 'The comment has characters that cannot be posted.';
  if (status === 401) return 'Log in again to comment.';
  if (status === 404) return 'This comment or run is no longer there.';
  if (status === 0) return 'Offline: try again when you are online.';
  return 'That did not work. Try again later.';
}

/**
 * Where Back goes (stage 65): to the start page's Community when the run
 * was opened from it (`?from=community`, which the Community page's
 * `runHref` puts in the address), else to the start page.
 */
export function backTarget(search: string): 'community' | 'start' {
  return new URLSearchParams(search).get('from') === 'community' ? 'community' : 'start';
}
