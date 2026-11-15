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
    case 'rate_limited':
      return 'Too many tries from this network. Wait a minute, then try again.';
    case 'unavailable':
      return 'The service is down just now. Try again later.';
    default:
      return 'The server’s answer was not understood. Reload the page and try again.';
  }
}
