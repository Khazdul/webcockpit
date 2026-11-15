// The share links' words (stage 64 C1; round 12's README "The words",
// pick 2a and 4a). Pure: the share dialog (share-dialog.tsx) and Published
// runs (account/published.tsx) say these, the specs look for them.

import type { PubErrorCode } from '../../cloud/pub/api';
import { limitWords } from '../../share/link';

export const ANYONE = 'Anyone with the link can watch this.';
export const TITLE_HINT = 'From the character and date; yours to change.';
export const DESC_PLACEHOLDER = 'Optional: what happens, who is in it';
export const RULES_HEAD = 'The rules, once for your account';
/** The rules (ADR 0148 "Rules and reports"), five short lines. */
export const RULES: readonly string[] = [
  'The log shows other players: no harassment.',
  'Nothing about people’s real lives.',
  'MUME’s own rules apply.',
  'You can take a run down whenever you like.',
  'We remove what breaks this.',
];
export const RULES_TICK = 'I have read this and agree';
export const DONE_NOTE = `${ANYONE} You find it again, and can remove it, on the Account page under Published runs.`;
export const COPIED = 'Copied.';

// --- Hall of Fame (stage 65 C3; round 13's pick 4, the README's words) ---

export const HOF_TITLE = 'Publish to the Hall of Fame';
export const HOF_EVERYONE = 'Everyone can find this in the Community.';
export const HOF_NOTE = 'Listed under New at once. You can unlist it later under Published runs.';
export const HOF_DONE_TITLE = 'Published';
export const HOF_DONE_NOTE = 'It is in the Community now, first under New. Stars and comments show under Published runs on the Account page.';
/** The 10-a-day refusal (429 too_many): Link now, listing later. */
export const hofTooManyWords = (limit: number): string => `You have listed ${limit} runs today, the most a day. Choose Link now, and list it tomorrow under Published runs.`;
/** What a guest is told about Hall of Fame (as Link's pick 1a). */
export const HOF_GUEST = 'Log in to publish';
export const HOF_GUEST_FLASH = 'Log in to publish. Account is on the start page.';
export const COPY_FAILED = 'Could not copy here: select the link and copy it.';

/** "Uploading… 0.7 of 1.2 MB". */
export function uploadingWords(sent: number, total: number): string {
  const MB = 1024 * 1024;
  const t = Math.max(0.1, Math.ceil((total / MB) * 10) / 10);
  const s = Math.min(t, Math.floor((sent / MB) * 10) / 10);
  return `Uploading… ${s.toFixed(1)} of ${t.toFixed(1)} MB`;
}

/** The refusal of a payload over the limit (also known before Create link: the payload is built first). */
export const tooLargeWords = (limit: number): string => `Too large: a link holds at most ${limitWords(limit)}. Exclude more of the log and try again.`;
export const quotaWords = (limit: number): string => `You have ${limit} published runs, the most an account can hold. Remove one on the Account page first.`;
export const OFFLINE = 'Offline: the link could not be made. Try again when you are online.';
export const TIMEOUT = 'No answer from the server: the link may or may not have been made. Look under Published runs on the Account page before you try again.';
export const SUSPENDED = 'This account is suspended: it cannot publish runs.';
export const RULES_NEEDED = 'Tick the rules first: the server has no tick from this account yet.';
export const LOGGED_OUT = 'You were logged out here. Log in again on the start page, then share.';
export const NOT_BUILT = 'This run could not be made into a link: the replay could not be built.';

/** A listed run's title, description or character name the Community cannot show (review fix S3: `400 bad_text`). */
export const BAD_LISTED_TEXT = 'The title, description or character name has characters the Community does not show. Change them, or keep the run link only.';

/** What a failed Create link says (none for a cancel). */
export function createFailureWords(code: PubErrorCode, limit?: number): string {
  switch (code) {
    case 'payload_too_large':
      return tooLargeWords(limit ?? 5 * 1024 * 1024);
    case 'pub_quota':
      return quotaWords(limit ?? 150);
    case 'offline':
      return OFFLINE;
    case 'timeout':
      return TIMEOUT;
    case 'suspended':
      return SUSPENDED;
    case 'rules':
      return RULES_NEEDED;
    case 'unauthorized':
      return LOGGED_OUT;
    case 'disabled':
    case 'not_found':
      return 'Share links are switched off right now. Try again later.';
    case 'rate_limited':
      return 'Too many tries from this network. Wait a minute, then try again.';
    case 'too_many':
      return hofTooManyWords(limit ?? 10);
    case 'bad_text':
      return BAD_LISTED_TEXT;
    case 'unavailable':
      return 'The service is down just now. Try again later.';
    case 'cancelled':
      return '';
    default:
      return 'The link could not be made: the server’s answer was not understood. Reload the page and try again.';
  }
}

// --- Published runs ---

export const PUB_EMPTY = 'No published runs yet. In History, Export a session and choose Link.';

// --- Published runs as a view of its own (stage 65 C3; round 13's pick 6) ---

/** The Account page's one row when nothing is published (the view is not opened). */
export const PUB_NONE = 'None yet. In History, Export a session and choose Link or Hall of Fame.';
export const LISTED = 'Listed';
export const LINK_ONLY = 'Link only';
export const LISTED_SWITCH = 'Listed in the Community';
export const LISTED_NOTE = 'Off: only people with the link can watch it. The stars and comments stay.';

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The Account page's row: "4 runs · 2 listed · 475 views" (the new reactions follow in gold). */
export function pubSummary(o: { runs: number; listed: number; views: number }): string {
  return [plural(o.runs, 'run'), `${o.listed} listed`, plural(o.views, 'view')].join(' · ');
}

/** "2 new", "99+ new" (each run's counts stop at 99). */
export const newWords = (n: number): string => (n >= 99 ? '99+ new' : `${n} new`);

/** A run's new reactions: "1 vote · 1 comment new"; '' for none. */
export function pubNewWords(news: { votes: number; comments: number } | undefined): string {
  if (!news || news.votes + news.comments === 0) return '';
  const parts = [news.votes > 0 ? plural(news.votes, 'vote') : '', news.comments > 0 ? plural(news.comments, 'comment') : ''].filter(Boolean);
  return `${parts.join(' · ')} new`;
}

/** The view's head: "4 of 150 · 6.1 MB, not counted against your 50 MB". */
export function pubViewHead(o: { count: number; limit: number; size: string; runBytes: string }): string {
  return `${o.count} of ${o.limit} · ${o.size}, not counted against your ${o.runBytes}`;
}

/** A run's stars: "4.3" (the mean to a tenth), or null without votes. */
export function meanWords(stars: { sum: number; count: number } | undefined): string | null {
  if (!stars || stars.count <= 0) return null;
  return (Math.round((stars.sum / stars.count) * 10) / 10).toFixed(1);
}
export const PUB_HIDDEN = 'Hidden after reports. Only you can watch it until we have looked.';
export const EDIT_NOTE = 'The run itself stays as it was cut.';
export const REMOVE_NOTE = 'The link stops working; whoever opens it is told that the run was removed by its sender. This cannot be undone.';

/** "37 views · 15 Nov 2026 · 1.2 MB · link only". */
export function pubFigures(o: { views: number; date: string; size: string }): string {
  return [`${o.views} ${o.views === 1 ? 'view' : 'views'}`, o.date, o.size, 'link only'].filter(Boolean).join(' · ');
}

/** "4 of 150 · 6.1 MB · links do not count against your 50 MB." */
export function pubFoot(o: { count: number; limit: number; size: string; runBytes: string }): string {
  return `${o.count} of ${o.limit} · ${o.size} · links do not count against your ${o.runBytes}.`;
}

/** What a failed list, edit or remove says. */
export function pubFailureWords(code: PubErrorCode, what: 'list' | 'edit' | 'remove'): string {
  switch (code) {
    case 'offline':
      return what === 'list' ? 'The published runs could not be fetched: the server was not reached.' : 'The server was not reached. Check the connection, then try again.';
    case 'timeout':
      return what === 'list' ? 'No answer from the server.' : 'No answer from the server. The change may or may not have been made.';
    case 'suspended':
      return 'This account is suspended: it cannot change its published runs.';
    case 'not_found':
      return what === 'list' ? 'Share links are switched off right now.' : 'That run is gone already.';
    case 'bad_request':
      return 'The title cannot be empty, and neither text may hold control characters.';
    case 'too_many':
      return 'You have listed as many runs as you may today. List it tomorrow; turn the switch off to save the rest now.';
    case 'hidden':
      return 'This run is hidden after reports: it cannot be changed until we have looked.';
    case 'bad_text':
      return BAD_LISTED_TEXT;
    case 'rate_limited':
      return 'Too many tries from this network. Wait a minute, then try again.';
    case 'unavailable':
      return 'The service is down just now. Try again later.';
    default:
      return 'The server’s answer was not understood. Reload the page and try again.';
  }
}
