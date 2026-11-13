// Stage 51d (ADR 0136 §5, §6): the pure parts of the pane strip and Comm on
// the phone: the swipe recogniser, the strip's pages, the unread badge, and
// the Comm model's unread notification.
import { describe, expect, it, vi } from 'vitest';
import type { CommMessage } from '../../src/gmcp/comm';
import { CommChats, type UnreadCounts } from '../../src/gmcp/comm-chats';
import { dragRows } from '../../src/phone/comm-chrome';
import { keepPage, moveEntry, setEntry, stepPage, stripLabel, stripPages } from '../../src/phone/strip-model';
import { SWIPE_MAX_MS, SWIPE_MIN_PX, swipeStep } from '../../src/phone/swipe';
import { badgeText, commKeyLabel, unreadCount } from '../../src/phone/unread';

describe('swipeStep', () => {
  it('a sideways drag is a page step: left is the next page, right the one before', () => {
    expect(swipeStep(-80, 5, 200)).toBe(1);
    expect(swipeStep(80, -5, 200)).toBe(-1);
    expect(swipeStep(-SWIPE_MIN_PX, 0, 100)).toBe(1);
  });

  it('a tap, a short drag, a vertical or a diagonal drag are the pane\'s own', () => {
    expect(swipeStep(0, 0, 50)).toBe(0);
    expect(swipeStep(-(SWIPE_MIN_PX - 1), 0, 100)).toBe(0);
    expect(swipeStep(5, -120, 200)).toBe(0);
    expect(swipeStep(-80, 70, 200)).toBe(0);
    // Just sideways enough: 1.5 times the vertical travel.
    expect(swipeStep(-90, 60, 200)).toBe(1);
    expect(swipeStep(-89, 60, 200)).toBe(0);
  });

  it('a slow drag is not a swipe; junk is nothing', () => {
    expect(swipeStep(-120, 0, SWIPE_MAX_MS)).toBe(1);
    expect(swipeStep(-120, 0, SWIPE_MAX_MS + 1)).toBe(0);
    expect(swipeStep(Number.NaN, 0, 100)).toBe(0);
    expect(swipeStep(-120, 0, Number.NaN)).toBe(0);
    expect(swipeStep(-120, 0, -1)).toBe(0);
  });
});

describe('the strip\'s pages', () => {
  const LABELS: Record<string, string> = { timers: 'Timers', group: 'Group', character: 'Character', statistics: 'Statistics' };
  const label = (id: string): string => LABELS[id] ?? id;
  const all = [
    { id: 'timers', on: true },
    { id: 'group', on: true },
    { id: 'character', on: true },
    { id: 'statistics', on: true },
  ];

  it('the setting\'s panes that are on, in its order, then the script panes present', () => {
    expect(stripPages(all, [], label).map((p) => p.id)).toEqual(['timers', 'group', 'character', 'statistics']);
    const some = [
      { id: 'statistics', on: true },
      { id: 'timers', on: false },
      { id: 'group', on: true },
      { id: 'character', on: false },
    ];
    const pages = stripPages(some, [{ id: 'kills/main', label: 'Kills' }], label);
    expect(pages).toEqual([
      { id: 'statistics', label: 'Statistics' },
      { id: 'group', label: 'Group' },
      { id: 'kills/main', label: 'Kills' },
    ]);
    expect(stripPages([], [], label)).toEqual([]);
    // No page twice.
    expect(stripPages([...all, ...all], [{ id: 'timers', label: 'x' }], label)).toHaveLength(4);
  });

  it('omitted panes are never a page (stage 55, a replay), built-in or a script\'s', () => {
    expect(stripPages(all, [], label, ['statistics']).map((p) => p.id)).toEqual(['timers', 'group', 'character']);
    expect(stripPages(all, [{ id: 'kills/main', label: 'Kills' }], label, ['timers', 'kills/main']).map((p) => p.id)).toEqual(['group', 'character', 'statistics']);
    expect(stripPages(all, [], label, [])).toHaveLength(4);
    expect(stripPages(all, [], label, ['timers', 'group', 'character', 'statistics'])).toEqual([]);
  });

  it('a step does not wrap; an unknown page is the first', () => {
    const pages = stripPages(all, [], label);
    expect(stepPage(pages, 'timers', 1)).toBe('group');
    expect(stepPage(pages, 'group', -1)).toBe('timers');
    expect(stepPage(pages, 'timers', -1)).toBe('timers');
    expect(stepPage(pages, 'statistics', 1)).toBe('statistics');
    expect(stepPage(pages, null, 1)).toBe('timers');
    expect(stepPage(pages, 'gone', -1)).toBe('timers');
    expect(stepPage([], 'timers', 1)).toBeNull();
  });

  it('a page that goes away under the open strip: the one that took its place, the last, or none', () => {
    const was = stripPages(all, [], label);
    const without = (id: string) => was.filter((p) => p.id !== id);
    expect(keepPage(was, 'group', was)).toBe('group');
    expect(keepPage(without('group'), 'group', was)).toBe('character');
    expect(keepPage(without('statistics'), 'statistics', was)).toBe('character');
    expect(keepPage([], 'group', was)).toBeNull();
    expect(keepPage(was, null, was)).toBe('timers');
  });

  it('the setting: move a pane up or down, switch it on or off', () => {
    expect(moveEntry(all, 'group', -1).map((e) => e.id)).toEqual(['group', 'timers', 'character', 'statistics']);
    expect(moveEntry(all, 'group', 1).map((e) => e.id)).toEqual(['timers', 'character', 'group', 'statistics']);
    expect(moveEntry(all, 'timers', -1)).toEqual(all);
    expect(moveEntry(all, 'statistics', 1)).toEqual(all);
    expect(moveEntry(all, 'map', 1)).toEqual(all);
    expect(setEntry(all, 'character', false)[2]).toEqual({ id: 'character', on: false });
    expect(setEntry(all, 'character', false).filter((e) => e.on)).toHaveLength(3);
    // The input is never changed.
    expect(all.every((e) => e.on)).toBe(true);
  });

  it('the strip\'s name for a screen reader', () => {
    const pages = stripPages(all, [], label);
    expect(stripLabel(pages, 'timers')).toBe('Panes: Timers, 1 of 4');
    expect(stripLabel(pages, 'statistics')).toBe('Panes: Statistics, 4 of 4');
    expect(stripLabel(pages, null)).toBe('Panes');
  });
});

describe('the unread badge', () => {
  // Two tells (one also heard in Public), three in Group that are in Public too, 40 in Public in all.
  const u = { private: 2, group: 3, public: 40, all: 41 };

  it('counts private chats, or every unread message once', () => {
    expect(unreadCount(u, 'private')).toBe(2);
    expect(unreadCount(u, 'all')).toBe(41);
    expect(unreadCount({ private: 0, group: 3, public: 1, all: 4 }, 'private')).toBe(0);
    expect(unreadCount({ private: Number.NaN, group: 0, public: 0, all: Number.NaN }, 'all')).toBe(0);
  });

  it('shows the count, 99+ beyond two digits, nothing for none', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
    expect(badgeText(-1)).toBe('');
  });

  it('names the key', () => {
    expect(commKeyLabel(false, 0)).toBe('Open Comm');
    expect(commKeyLabel(false, 2)).toBe('Open Comm, 2 unread');
    expect(commKeyLabel(true, 2)).toBe('Close Comm');
  });
});

describe('CommChats unread notification', () => {
  let ts = 1000;
  const msg = (channel: string, talker: string, text: string, extra: Partial<CommMessage> = {}): CommMessage =>
    ({ ts: ts++, channel, talker, talkerType: 'player', text, ...extra }) as CommMessage;

  function chats() {
    const c = new CommChats();
    c.setSelf('Rasta');
    const seen: UnreadCounts[] = [];
    const fn = vi.fn((u: UnreadCounts) => void seen.push({ ...u }));
    c.onUnread(fn);
    return { c, seen, fn };
  }

  it('tells the counts when a message is unread, and only then', () => {
    const { c, seen, fn } = chats();
    // No view is open (the phone with Comm closed): everything counts.
    c.setOpen(null);
    fn.mockClear();
    seen.length = 0;
    c.add(msg('tells', 'Gibur', "Gibur tells you 'hello'"));
    expect(seen.at(-1)).toEqual({ private: 1, group: 0, public: 1, all: 1 });
    c.add(msg('tales', 'Dori', "Dori narrates 'anyone?'"));
    expect(seen.at(-1)).toEqual({ private: 1, group: 0, public: 2, all: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
    // Your own line and an archive (quiet) line change no count: no call.
    c.add(msg('tells', 'Rasta', "You tell Gibur 'hi'", { destination: 'Gibur' }));
    c.add(msg('tells', 'Gibur', "Gibur tells you 'old'"), true);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(c.unreadCounts()).toEqual({ private: 1, group: 0, public: 2, all: 2 });
  });

  it('opening a view clears its count and tells; opening it again tells nothing', () => {
    const { c, seen, fn } = chats();
    c.setOpen(null);
    c.add(msg('tells', 'Gibur', "Gibur tells you 'hello'"));
    c.add(msg('tells', 'Elanor', "Elanor tells you 'hi'"));
    expect(c.unreadCounts().private).toBe(2);
    fn.mockClear();
    c.setOpen('gibur');
    expect(seen.at(-1)!.private).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
    c.setOpen('gibur');
    expect(fn).toHaveBeenCalledTimes(1);
    // A tell in the open chat is read at once.
    c.add(msg('tells', 'Gibur', "Gibur tells you 'again'"));
    expect(c.unreadCounts().private).toBe(1);
    c.setOpen('public');
    expect(c.unreadCounts().public).toBe(0);
  });

  it('a reset tells zero; restoring a snapshot tells the counts back', () => {
    const { c, seen } = chats();
    c.setOpen(null);
    c.add(msg('tells', 'Gibur', "Gibur tells you 'hello'"));
    const snap = c.unreadSnapshot();
    c.reset();
    expect(seen.at(-1)).toEqual({ private: 0, group: 0, public: 0, all: 0 });
    c.add(msg('tells', 'Gibur', "Gibur tells you 'hello'"), true);
    c.restoreUnread(snap);
    expect(seen.at(-1)).toEqual({ private: 1, group: 0, public: 1, all: 1 });
  });

  it('all: each unread message once, whatever the number of views it is in', () => {
    const { c } = chats();
    c.setRoster(['Rasta', 'Gibur', 'Dori'], 1);
    c.setOpen(null);
    // A tell: in Gibur's chat and in Public. A group tell: in Group and in Public. A narrate: Public.
    c.add(msg('tells', 'Gibur', "Gibur tells you 'one'"));
    c.add(msg('tells', 'Dori', "Dori tells the group 'two'"));
    c.add(msg('tales', 'Ecthel', "Ecthel narrates 'three'"));
    const u = c.unreadCounts();
    expect(u.all).toBe(3);
    expect(u.private + u.group + u.public).toBeGreaterThan(3);
    // Reading a view takes its messages out, wherever else they are.
    c.setOpen('gibur');
    expect(c.unreadCounts().all).toBe(2);
    c.setOpen(null);
    c.setOpen('group');
    expect(c.unreadCounts().all).toBe(1);
    c.setOpen(null);
    // Public holds all three: reading it leaves nothing, though the chat and Group still show theirs.
    c.add(msg('tells', 'Gibur', "Gibur tells you 'four'"));
    expect(c.unreadCounts().all).toBe(2);
    c.setOpen('public');
    expect(c.unreadCounts().all).toBe(0);
    expect(c.unreadCounts().private).toBe(1);
  });

  it('all: unread from before the listener (or carried over a rebuild) counts as the largest view\'s, until a view is read', () => {
    const c = new CommChats();
    c.setSelf('Rasta');
    c.setOpen(null);
    c.add(msg('tells', 'Gibur', "Gibur tells you 'one'"));
    c.add(msg('tales', 'Ecthel', "Ecthel narrates 'two'"));
    // Nothing is tracked without a listener.
    expect(c.unreadCounts().all).toBe(0);
    c.onUnread(() => {});
    expect(c.unreadCounts().all).toBe(2);
    c.add(msg('tales', 'Ecthel', "Ecthel narrates 'three'"));
    expect(c.unreadCounts().all).toBe(3);
    const snap = c.unreadSnapshot();
    c.reset();
    expect(c.unreadCounts().all).toBe(0);
    c.restoreUnread(snap);
    expect(c.unreadCounts().all).toBe(3);
    c.setOpen('public');
    expect(c.unreadCounts().all).toBe(0);
  });

  it('without a listener nothing is told (and removing it stops the calls)', () => {
    const { c, fn } = chats();
    c.onUnread(null);
    c.setOpen(null);
    c.add(msg('tells', 'Gibur', "Gibur tells you 'hello'"));
    expect(fn).not.toHaveBeenCalled();
    expect(c.unreadCounts().private).toBe(1);
  });
});

describe('dragRows (Comm\'s resize band)', () => {
  it('whole rows from the finger\'s travel, inside the allowed range', () => {
    expect(dragRows(18, 0, 17, 6, 30)).toBe(18);
    expect(dragRows(18, 8, 17, 6, 30)).toBe(18);
    expect(dragRows(18, 9, 17, 6, 30)).toBe(19);
    expect(dragRows(18, 3 * 17, 17, 6, 30)).toBe(21);
    expect(dragRows(18, -5 * 17, 17, 6, 30)).toBe(13);
    expect(dragRows(18, 5000, 17, 6, 30)).toBe(30);
    expect(dragRows(18, -5000, 17, 6, 30)).toBe(6);
  });

  it('nothing to go by: the rows it has', () => {
    expect(dragRows(18, 100, 0, 6, 30)).toBe(18);
    expect(dragRows(18, Number.NaN, 17, 6, 30)).toBe(18);
  });
});
