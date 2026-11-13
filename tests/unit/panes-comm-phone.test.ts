// @vitest-environment happy-dom
// Stage 51d (ADR 0136 §6): the Comm pane's phone mode (`setPhoneMode`,
// `setPhoneOpen`): the rail whatever the desktop's column settings say,
// which are never written; nothing is read (and nothing drawn) while the
// phone has Comm closed; the reply line is one line, follows the play
// gate, and keeps its text when the line did not go out.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { setDeviceForTest } from '../../src/core/device';
import type { ConnState } from '../../src/core/types';
import type { ListMetrics } from '../../src/panes/anchored-list';
import { CommPane } from '../../src/panes/comm';
import { createPaneContext, lazyDb } from '../../src/panes/context';
import { SettingsStore } from '../../src/settings';

const CELL = { w: 8, h: 16 };

function setup(o: { phone?: boolean } = {}) {
  setDeviceForTest({ touch: o.phone ?? true, phone: o.phone ?? true });
  const bus = new Bus();
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const frames: (() => void)[] = [];
  const sent: string[] = [];
  let state: ConnState = 'playing';
  // A sender as the session: a line that goes out is announced at once; one that does not is not.
  let linkUp = true;
  const sender = {
    sendCommand: (text: string): void => {
      if (!linkUp) return;
      sent.push(text);
      bus.emit('cmd.sent', { text, ts: 0 });
    },
    sendGmcp: (): void => {},
  };
  const ctx = createPaneContext({
    doc: document,
    bus,
    settings,
    requestFrame: (cb) => frames.push(cb),
    connState: () => state,
    openDb: lazyDb(null),
    sessionStorage: null,
    cells: { get: () => CELL, subscribe: () => () => {} },
    sender: sender as never,
  });
  // A layout for happy-dom: every item is one row, the list ten rows high.
  const tops = new WeakMap<HTMLElement, number>();
  const count = (l: HTMLElement): number => l.querySelector('.wc-alist-stack')?.children.length ?? 0;
  const high = (l: HTMLElement): number => Math.max(10, count(l)) * CELL.h;
  const metrics: ListMetrics = {
    scrollTop: (l) => Math.min(tops.get(l) ?? 0, high(l) - 10 * CELL.h),
    setScrollTop: (l, px) => void tops.set(l, Math.max(0, Math.min(high(l) - 10 * CELL.h, px))),
    clientHeight: () => 10 * CELL.h,
    scrollHeight: high,
    itemTop: (el) => {
      let t = 0;
      for (let e = el.previousElementSibling; e; e = e.previousElementSibling) t += CELL.h;
      return t;
    },
    itemHeight: () => CELL.h,
  };
  const pane = new CommPane(ctx, { metrics, writeClipboard: async () => {} });
  document.body.append(pane.el);
  const flush = (): void => {
    for (let i = 0; i < 5 && frames.length; i++) for (const f of frames.splice(0)) f();
  };
  const show = (): void => pane.place({ rect: { x: 0, y: 0, w: 45, h: 18 }, content: { x: 0, y: 0, w: 45, h: 17 }, framed: false }, CELL);
  const hide = (): void => pane.place(null, CELL);
  const say = (channel: string, talker: string, text: string, extra: Record<string, unknown> = {}): void =>
    bus.emit('gmcp', { pkg: 'Comm.Channel.Text', data: { channel, talker, 'talker-type': 'player', text, ...extra } } as never);
  const tell = (who: string, what: string): void => say('tells', who, `${who} tells you '${what}'`);
  const root = (): HTMLElement => pane.content.querySelector<HTMLElement>('.wc-comm') ?? (pane as unknown as { root: HTMLElement }).root;
  const reply = (): HTMLTextAreaElement | HTMLInputElement => (pane as unknown as { replyInput: HTMLTextAreaElement | HTMLInputElement }).replyInput;
  const open = (name: string): void => {
    flush();
    pane.content.querySelector<HTMLElement>(`.wc-cm-ent[data-key="${name.toLowerCase()}"]`)!.click();
    flush();
  };
  return {
    pane,
    settings,
    bus,
    sent,
    flush,
    show,
    hide,
    say,
    tell,
    root,
    reply,
    open,
    setState: (s: ConnState) => {
      const prev = state;
      state = s;
      bus.emit('conn.state', { state: s, prev });
    },
    setLink: (up: boolean) => (linkUp = up),
  };
}

beforeEach(() => setDeviceForTest({ touch: true, phone: true }));

afterEach(() => {
  setDeviceForTest({ touch: false, phone: false });
  document.body.replaceChildren();
});

describe('CommPane phone mode', () => {
  it('is the rail whatever comm.folded and comm.listWidth say, and never writes them', () => {
    const h = setup();
    h.settings.update({ comm: { folded: false, listWidth: 220 } });
    const before = JSON.stringify(h.settings.get().comm);
    h.pane.setPhoneMode(true);
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    expect(h.root().dataset.mode).toBe('rail');
    expect(h.root().hasAttribute('data-phone')).toBe(true);
    // A folded desktop column does not fold the phone's.
    h.settings.update({ comm: { folded: true } });
    h.flush();
    expect(h.root().dataset.mode).toBe('rail');
    h.settings.update({ comm: { folded: false } });
    // The pane's own ways to change the column do nothing in phone mode.
    h.pane.setFolded(true);
    (h.pane as unknown as { setColumn(l: { mode: string; width: number }): void }).setColumn({ mode: 'list', width: 300 });
    (h.pane as unknown as { setColumn(l: { mode: string; width: number }): void }).setColumn({ mode: 'folded', width: 0 });
    h.flush();
    expect(JSON.stringify(h.settings.get().comm)).toBe(before);
    expect(h.root().dataset.mode).toBe('rail');
    // Out of phone mode the desktop's column is back, and setFolded writes again.
    h.pane.setPhoneMode(false);
    h.flush();
    expect(h.root().hasAttribute('data-phone')).toBe(false);
    expect(h.root().dataset.mode).toBe('list');
    h.pane.setFolded(true);
    expect(h.settings.get().comm.folded).toBe(true);
    h.pane.dispose();
  });

  it('closed, no view is open: every message counts, also in the chat that was open; opening reads it', () => {
    const h = setup();
    h.pane.setPhoneMode(true);
    const seen: number[] = [];
    h.pane.onUnread((u) => seen.push(u.private));
    h.tell('Gibur', 'one');
    h.say('tales', 'Ecthel', "Ecthel narrates 'anyone?'");
    // (A tell is not in Public by default; the narrate is.)
    expect(h.pane.unreadCounts()).toEqual({ private: 1, group: 0, public: 1, all: 2 });
    // Open: Public (the view it starts at) is read; Gibur's chat on a tap.
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    expect(h.pane.unreadCounts()).toEqual({ private: 1, group: 0, public: 0, all: 1 });
    h.open('Gibur');
    expect(h.pane.unreadCounts().private).toBe(0);
    // In the open chat a tell is read at once.
    h.tell('Gibur', 'two');
    expect(h.pane.unreadCounts().private).toBe(0);
    // Closed: the chat that was open counts again; reopening opens it, read.
    h.pane.setPhoneOpen(false);
    h.hide();
    h.tell('Gibur', 'three');
    expect(h.pane.unreadCounts().private).toBe(1);
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    expect(h.pane.unreadCounts().private).toBe(0);
    expect(h.pane.content.textContent).toContain('three');
    expect(seen.at(-1)).toBe(0);
    h.pane.dispose();
  });

  it('a close ends the search; a temporary one (the hot key box took Comm out) keeps it open with its query', () => {
    const h = setup();
    h.pane.setPhoneMode(true);
    h.tell('Gibur', 'at the ford');
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    const search = h.pane.content.querySelector<HTMLInputElement>('.wc-cm-sinput')!;
    const ask = (q: string): void => {
      h.pane.openSearch();
      search.value = q;
      search.dispatchEvent(new Event('input'));
    };
    ask('ford');
    expect(h.root().hasAttribute('data-search')).toBe(true);
    // Taken out for the box's room, and back: the search is as it was, and no view was open meanwhile.
    h.pane.setPhoneOpen(false, { keep: true });
    h.hide();
    expect(search.value).toBe('ford');
    expect(h.root().hasAttribute('data-search')).toBe(true);
    const unread = h.pane.unreadCounts().private;
    h.tell('Gibur', 'still at the ford');
    expect(h.pane.unreadCounts().private).toBe(unread + 1);
    h.pane.setPhoneOpen(true, { keep: false });
    h.show();
    h.flush();
    expect(search.value).toBe('ford');
    expect(h.root().hasAttribute('data-search')).toBe(true);
    // The user's own close ends it, as before.
    h.pane.setPhoneOpen(false);
    expect(search.value).toBe('');
    expect(h.root().hasAttribute('data-search')).toBe(false);
    // Closed for good while it was out for the box (the Comm key): the kept search ends too.
    h.pane.setPhoneOpen(true);
    ask('ford');
    h.pane.setPhoneOpen(false, { keep: true });
    h.pane.setPhoneOpen(false);
    expect(search.value).toBe('');
    expect(h.root().hasAttribute('data-search')).toBe(false);
    h.pane.dispose();
  });

  it('a message in the frame of the close does not mark Public read: nothing is drawn while closed', () => {
    const h = setup();
    h.pane.setPhoneMode(true);
    h.pane.onUnread(() => {});
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    h.open('Public');
    // The close tap: the pane is told at once; the cockpit hides it a frame later.
    h.pane.setPhoneOpen(false);
    h.say('tales', 'Ecthel', "Ecthel narrates 'anyone?'");
    // The frame runs with the pane still placed.
    h.flush();
    expect(h.pane.unreadCounts().public).toBe(1);
    h.hide();
    h.say('tales', 'Ecthel', "Ecthel narrates 'hello?'");
    h.flush();
    expect(h.pane.unreadCounts().public).toBe(2);
    expect(h.pane.unreadCounts().all).toBe(2);
    h.pane.dispose();
  });

  it('the reply line is a one-row textarea in phone mode only: without it an input, also with the phone flag on', () => {
    const phone = setup();
    // Before the phone's game layout turns the mode on, an input here too.
    expect(phone.reply().tagName).toBe('INPUT');
    phone.pane.setPhoneMode(true);
    expect(phone.reply().tagName).toBe('TEXTAREA');
    expect(phone.reply().getAttribute('rows')).toBe('1');
    expect(phone.reply().parentElement!.querySelectorAll('.wc-cm-rinput')).toHaveLength(1);
    phone.pane.dispose();
    // The phone flag is on here too (beforeEach), the mode is not: the player, a pane before the layer.
    const old = setup();
    old.tell('Gibur', 'one');
    old.show();
    old.flush();
    old.open('Gibur');
    old.flush();
    expect(old.reply().tagName).toBe('INPUT');
    expect(old.reply().placeholder).toBe('Reply to Gibur…');
    expect((old.reply() as HTMLInputElement).type).toBe('text');
    expect(old.reply().parentElement!.querySelector('textarea')).toBeNull();
    old.pane.dispose();
  });

  it('phone mode off again: the input is back, with what was typed, and sends as on a computer', () => {
    const h = setup();
    h.pane.setPhoneMode(true);
    h.pane.setPhoneOpen(true);
    h.tell('Gibur', 'one');
    h.show();
    h.flush();
    h.open('Gibur');
    h.flush();
    expect(h.reply().tagName).toBe('TEXTAREA');
    (h.reply() as HTMLTextAreaElement).value = 'half a line';
    h.pane.setPhoneMode(false);
    h.flush();
    const r = h.reply() as HTMLInputElement;
    expect(r.tagName).toBe('INPUT');
    expect(r.value).toBe('half a line');
    expect(r.disabled).toBe(false);
    expect(r.parentElement!.querySelectorAll('.wc-cm-rinput')).toHaveLength(1);
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual(['tell Gibur half a line']);
    h.pane.dispose();
  });

  it('the reply is one line: a pasted line break is a space, in the field and in what is sent', () => {
    const h = setup();
    h.pane.setPhoneMode(true);
    h.tell('Gibur', 'one');
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    h.open('Gibur');
    const r = h.reply() as HTMLTextAreaElement;
    expect(r.placeholder).toBe('Type a message');
    r.value = 'hi\nsay something\r\n\r\nelse';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    expect(r.value).toBe('hi say something else');
    // Even when a break is still in the field at the send.
    r.value = 'hi\nsay something';
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual(['tell Gibur hi say something']);
    expect(r.value).toBe('');
    // A line break or a paragraph from a phone's keyboard sends, once each.
    for (const inputType of ['insertLineBreak', 'insertParagraph']) {
      r.value = 'again';
      const e = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
      r.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(h.sent).toEqual(['tell Gibur hi say something', 'tell Gibur again', 'tell Gibur again']);
    h.pane.dispose();
  });

  it('the reply line follows the play gate: disabled and "Not connected" outside play, and nothing is sent', () => {
    const h = setup();
    let live = true;
    h.pane.setPhoneMode(true, { live: () => live });
    h.tell('Gibur', 'one');
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    h.open('Gibur');
    const r = h.reply() as HTMLTextAreaElement;
    expect(r.disabled).toBe(false);
    // A password prompt (the server echoes): the gate closes, the pane is told by the echo state.
    live = false;
    h.bus.emit('telnet.echo', { serverEchoes: true });
    h.flush();
    expect(r.disabled).toBe(true);
    expect(r.placeholder).toBe('Not connected');
    // Even a line that reaches the send is not sent, and is kept.
    r.value = 'are you there';
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual([]);
    expect(r.value).toBe('are you there');
    // The link drops: the pane goes blank (as on the desktop), the reply line with it; nothing is sent.
    h.setState('disconnected');
    h.flush();
    expect(r.isConnected).toBe(false);
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual([]);
    // Back in play, the prompt over: the field is live again and the kept line goes out.
    live = true;
    h.setState('playing');
    h.bus.emit('telnet.echo', { serverEchoes: false });
    h.flush();
    expect(r.isConnected).toBe(true);
    expect(r.disabled).toBe(false);
    expect(r.placeholder).toBe('Type a message');
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual(['tell Gibur are you there']);
    expect(r.value).toBe('');
    h.pane.dispose();
  });

  it('a line that did not go out is kept in the field', () => {
    const h = setup();
    h.pane.setPhoneMode(true);
    h.tell('Gibur', 'one');
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    h.open('Gibur');
    const r = h.reply() as HTMLTextAreaElement;
    h.setLink(false);
    r.value = 'hold on';
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual([]);
    expect(r.value).toBe('hold on');
    h.setLink(true);
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual(['tell Gibur hold on']);
    expect(r.value).toBe('');
    h.pane.dispose();
  });

  it('without phone mode nothing of it applies: the desktop placeholder, no gate', () => {
    const h = setup({ phone: false });
    h.tell('Gibur', 'one');
    h.show();
    h.flush();
    h.open('Gibur');
    const r = h.reply() as HTMLInputElement;
    expect(r.placeholder).toBe('Reply to Gibur…');
    expect(r.disabled).toBe(false);
    r.value = 'hello';
    r.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(h.sent).toEqual(['tell Gibur hello']);
    // setPhoneOpen without phone mode does nothing.
    h.pane.setPhoneOpen(false);
    h.tell('Gibur', 'two');
    expect(h.pane.unreadCounts().private).toBe(0);
    h.pane.dispose();
  });

  it('read-only (stage 55, a replay): no reply line, no search key, and the search never opens', () => {
    const h = setup();
    h.pane.setPhoneMode(true, { live: () => true, readOnly: true });
    h.tell('Gibur', 'one');
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    h.open('Gibur');
    expect(h.root().hasAttribute('data-readonly')).toBe(true);
    const replyBox = h.pane.content.querySelector<HTMLElement>('.wc-cm-reply')!;
    const key = h.pane.content.querySelector<HTMLElement>('.wc-cm-sbtn')!;
    expect(replyBox.hidden).toBe(true);
    expect(key.hidden).toBe(true);
    // The chat is still shown and read.
    expect(h.pane.content.textContent).toContain('one');
    expect(h.pane.unreadCounts().private).toBe(0);
    // Neither the key's click nor the pane's own call opens the search or takes the focus.
    key.click();
    h.pane.openSearch();
    expect(h.root().hasAttribute('data-search')).toBe(false);
    expect(document.activeElement).not.toBe(h.pane.content.querySelector('.wc-cm-sinput'));
    // A line that got into the hidden field is not sent.
    const r = h.reply();
    r.value = 'hello';
    h.pane.submitReply();
    expect(h.sent).toEqual([]);
    // It stays hidden over redraws and in Group, which has a reply line elsewhere.
    h.say('group', 'Gibur', "Gibur tells the group 'here'");
    h.flush();
    h.open('group');
    expect(replyBox.hidden).toBe(true);
    // Out of the mode both are back.
    h.pane.setPhoneMode(false);
    h.flush();
    expect(h.root().hasAttribute('data-readonly')).toBe(false);
    expect(key.hidden).toBe(false);
    expect(replyBox.hidden).toBe(false);
    h.pane.dispose();
  });

  it('read-only ends an open search when it is turned on; without it the phone mode is as before', () => {
    const h = setup();
    h.pane.setPhoneMode(true);
    h.tell('Gibur', 'one');
    h.pane.setPhoneOpen(true);
    h.show();
    h.flush();
    h.open('Gibur');
    expect(h.root().hasAttribute('data-readonly')).toBe(false);
    expect(h.pane.content.querySelector<HTMLElement>('.wc-cm-reply')!.hidden).toBe(false);
    expect(h.pane.content.querySelector<HTMLElement>('.wc-cm-sbtn')!.hidden).toBe(false);
    h.pane.setPhoneMode(false);
    h.pane.openSearch();
    expect(h.root().hasAttribute('data-search')).toBe(true);
    h.pane.setPhoneMode(true, { readOnly: true });
    expect(h.root().hasAttribute('data-search')).toBe(false);
    h.pane.dispose();
  });
});
