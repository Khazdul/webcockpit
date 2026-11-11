// The Comm key's unread badge (ADR 0136 §6). Pure: no DOM.
//
// Unread shows only as a count on the lens's Comm key (no message cards):
// private chats by default, or every unread message of private chats,
// Group and Public, each counted once (`phone.unread`). The counts come from the Comm model's own change
// notification (`CommChats.onUnread`); nothing here runs per line.

/** Unread by kind of view, as the Comm model counts them. */
export interface Unread {
  private: number;
  group: number;
  public: number;
  /** Distinct unread messages over all views (a tell that is also in Public is one). */
  all: number;
}

/** What the badge counts: private chats, or everything. */
export type UnreadMode = 'private' | 'all';

/** The badge's number under `mode`. */
export function unreadCount(u: Unread, mode: UnreadMode): number {
  // "All" is every unread message once, not the three views' counts added up.
  const n = mode === 'all' ? u.all : u.private;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The badge's text: the count, `99+` beyond two digits, '' for none (no badge). */
export function badgeText(n: number): string {
  if (!(n > 0)) return '';
  return n > 99 ? '99+' : String(Math.floor(n));
}

/** The Comm key's name for a screen reader. */
export function commKeyLabel(open: boolean, n: number): string {
  if (open) return 'Close Comm';
  return n > 0 ? `Open Comm, ${n} unread` : 'Open Comm';
}
