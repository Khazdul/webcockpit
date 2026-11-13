// @vitest-environment happy-dom
// Round 54c (ADR 0141): automatic login for the session. The controller on
// a real Session, telnet parser and line assembler over a fake socket: what
// reaches the wire, and that the password reaches nothing else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents } from '../../src/core/types';
import { REASON_USER_DISCONNECT, Session } from '../../src/net/session';
import { OPT_ECHO, OPT_GMCP, WILL, WONT } from '../../src/net/telnet';
import { AutoLogin } from '../../src/phone/auto-login';
import { placeAsk } from '../../src/phone/login-ask';
import { ASK_MS, ATTEMPT_MS } from '../../src/phone/login-rule';
import { LineAssembler } from '../../src/text/assembler';
import { watchResume } from '../../src/app/resume-watch';
import { FakeSocket, IAC, ascii, sb, utf8 } from './net-helpers';

const PASSWORD = 'correct-horse-9';
const GA = 249;
const NAME_PROMPT = [...ascii('By what name do you wish to be known? '), IAC, GA];
const PASSWORD_PROMPT = [IAC, WILL, OPT_ECHO, ...ascii('Password: '), IAC, GA];
const gmcp = (payload: string): number[] => sb(OPT_GMCP, utf8(payload));
const tick = (): Promise<void> => new Promise<void>((r) => queueMicrotask(r));

function make() {
  const bus = new Bus();
  const sockets: FakeSocket[] = [];
  const cmds: BusEvents['cmd.sent'][] = [];
  const notices: string[] = [];
  bus.on('cmd.sent', (c) => cmds.push(c));
  const session = new Session({
    bus,
    sink: new LineAssembler(bus),
    socketFactory: () => {
      const f = new FakeSocket();
      sockets.push(f);
      return f;
    },
  });
  const el = document.createElement('div');
  document.body.append(el);
  const auto = new AutoLogin({ session, bus, userDisconnect: REASON_USER_DISCONNECT }, { el, notice: (t) => notices.push(t), placed: () => {}, win: window });
  const sock = () => sockets.at(-1)!;
  /** The lines sent on the newest socket (telnet negotiation and GMCP left out). */
  const lines = (): string[] => {
    const out: string[] = [];
    for (const b of sock().sent) {
      if (b[0] === IAC) continue;
      out.push(new TextDecoder().decode(b).replace(/\r\n$/, ''));
    }
    return out;
  };
  const up = (): void => {
    session.connect();
    sock().open();
    sock().data([IAC, WILL, OPT_GMCP]);
    sock().data(NAME_PROMPT);
  };
  /** MUME lets the character in. */
  const letIn = (name = 'Rasta'): void => sock().data([IAC, WONT, OPT_ECHO, ...ascii('\r\nReconnecting.\r\n'), ...gmcp(`Char.Name {"name":"${name}","fullname":"${name} the Test"}`)]);
  /** A login typed by hand, as the command line sends it (a secret at the password prompt). */
  const byHand = (name = 'rasta', password = PASSWORD, charName = 'Rasta'): void => {
    up();
    session.sendCommand(name);
    sock().data(PASSWORD_PROMPT);
    session.sendCommand(password, { secret: true });
    letIn(charName);
  };
  const tap = (act: 'yes' | 'no'): void => el.querySelector<HTMLButtonElement>(`.wc-ph-ask [data-act="${act}"]`)!.click();
  const asked = (): boolean => !el.querySelector<HTMLElement>('.wc-ph-ask')!.hidden;
  return { bus, session, auto, el, sock, sockets, cmds, notices, lines, up, letIn, byHand, tap, asked };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('the question', () => {
  it('comes up when a login typed by hand reaches play, not before, with the name as text', () => {
    const m = make();
    m.up();
    m.session.sendCommand('rasta');
    m.sock().data(PASSWORD_PROMPT);
    m.session.sendCommand(PASSWORD, { secret: true });
    expect(m.asked()).toBe(false);
    m.letIn();
    expect(m.session.state).toBe('playing');
    expect(m.asked()).toBe(true);
    expect(m.el.querySelector('.wc-ph-ask-q')!.textContent).toBe('Log in automatically as Rasta for the rest of this session?');
    expect(m.auto.armed).toBe(false);
  });

  it('takes no focus and no key, and the password is nowhere in the page', () => {
    const m = make();
    m.byHand();
    const card = m.el.querySelector('.wc-ph-ask')!;
    expect(card.getAttribute('role')).toBe('group');
    expect(card.getAttribute('aria-modal')).toBeNull();
    for (const b of card.querySelectorAll('button')) expect(b.tabIndex).toBe(-1);
    m.tap('yes');
    expect(document.documentElement.outerHTML).not.toContain(PASSWORD);
  });

  it('a name that is markup is shown as text', () => {
    const m = make();
    m.byHand('<img src=x>', PASSWORD, '<img src=x>');
    expect(m.el.querySelector('.wc-ph-ask img')).toBeNull();
    expect(m.el.querySelector('.wc-ph-ask-q b')!.textContent).toBe('<img src=x>');
  });

  it('Yes arms; No does not, and does not ask again; unanswered it goes away', () => {
    const yes = make();
    yes.byHand();
    yes.tap('yes');
    expect(yes.asked()).toBe(false);
    expect(yes.auto.armed).toBe(true);

    const no = make();
    no.byHand();
    no.tap('no');
    expect(no.asked()).toBe(false);
    expect(no.auto.armed).toBe(false);
    no.sock().drop();
    no.byHand();
    expect(no.asked()).toBe(false);

    const late = make();
    late.byHand();
    vi.advanceTimersByTime(ASK_MS);
    expect(late.asked()).toBe(false);
    expect(late.auto.armed).toBe(false);
  });

  it('a new character is never asked about', () => {
    const m = make();
    m.up();
    for (const t of ['Newbie', 'y']) m.session.sendCommand(t);
    m.sock().data(PASSWORD_PROMPT);
    m.session.sendCommand(PASSWORD, { secret: true });
    m.session.sendCommand(PASSWORD, { secret: true });
    m.letIn('Newbie');
    expect(m.session.state).toBe('playing');
    expect(m.asked()).toBe(false);
  });
});

describe('the automatic login', () => {
  it('a dropped link, a new connection: the name, then the password at the password prompt only, once each', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop();
    m.cmds.length = 0;
    m.up();
    await tick();
    expect(m.lines()).toEqual(['Rasta']);
    // Text alone is not a password prompt: nothing is sent until the server turns ECHO off.
    m.sock().data(ascii('\r\nPassword: '));
    await tick();
    expect(m.lines()).toEqual(['Rasta']);
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    expect(m.lines()).toEqual(['Rasta', PASSWORD]);
    m.letIn();
    expect(m.session.state).toBe('playing');
    expect(m.lines().filter((l) => l === PASSWORD)).toHaveLength(1);
    expect(m.notices).toContain('Logging in as Rasta…');
    expect(m.notices).toContain('Logged in as Rasta.');
    expect(m.asked()).toBe(false);
    expect(m.auto.armed).toBe(true);
    // As a password typed by hand: `cmd.sent` carries no text, so the echo, the run log and the trackers get none.
    const secret = m.cmds.filter((c) => c.secret);
    expect(secret).toHaveLength(1);
    expect(secret[0]!.text).toBe('');
    expect(JSON.stringify(m.cmds)).not.toContain(PASSWORD);
    expect(m.notices.join('\n')).not.toContain(PASSWORD);
  });

  it('nothing on the bus but the raw bytes out ever carries the password', async () => {
    const m = make();
    const seen: string[] = [];
    for (const type of ['cmd.sent', 'sys.message', 'ui.message', 'text.line', 'text.partial', 'text.display', 'conn.state', 'gmcp', 'gmcp.raw', 'telnet.echo'] as const) {
      m.bus.on(type, (p: unknown) => seen.push(JSON.stringify(p)));
    }
    m.byHand();
    m.tap('yes');
    m.sock().drop();
    m.up();
    await tick();
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    m.letIn();
    expect(m.lines()).toContain(PASSWORD);
    expect(seen.join('\n')).not.toContain(PASSWORD);
  });

  it('MUME does not take the password (it asks again): nothing more is sent and the login is forgotten', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop();
    m.up();
    await tick();
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    m.sock().data([IAC, WONT, OPT_ECHO, ...ascii('\r\nWrong password.\r\n'), ...PASSWORD_PROMPT]);
    await tick();
    expect(m.lines()).toEqual(['Rasta', PASSWORD]);
    expect(m.auto.armed).toBe(false);
    expect(m.notices.at(-1)).toBe('Automatic login stopped: MUME asked for the password again. The saved login is forgotten.');
    // The next connection is MUME's own prompt.
    m.sock().drop();
    m.up();
    await tick();
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    expect(m.lines()).toEqual([]);
  });

  it('the server turns ECHO back on in the same frame: the password is not sent', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop();
    m.up();
    await tick();
    m.sock().data([IAC, WILL, OPT_ECHO, IAC, WONT, OPT_ECHO]);
    await tick();
    expect(m.lines()).toEqual(['Rasta']);
    expect(m.auto.armed).toBe(false);
  });

  it('no name prompt, or no password prompt, in time: stopped and forgotten', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop();
    m.session.connect();
    m.sock().open();
    m.sock().data(ascii('Something else entirely: '));
    await tick();
    vi.advanceTimersByTime(ATTEMPT_MS);
    expect(m.lines()).toEqual([]);
    expect(m.auto.armed).toBe(false);

    const n = make();
    n.byHand();
    n.tap('yes');
    n.sock().drop();
    n.up();
    await tick();
    n.sock().data(ascii('\r\nDid I get that right, Rasta (y/n)? '));
    vi.advanceTimersByTime(ATTEMPT_MS);
    n.sock().data(PASSWORD_PROMPT);
    await tick();
    expect(n.lines()).toEqual(['Rasta']);
    expect(n.auto.armed).toBe(false);
  });

  it('the connection ends during the login, or the player types into it: stopped and forgotten', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop();
    m.up();
    await tick();
    m.sock().drop();
    expect(m.auto.armed).toBe(false);

    const n = make();
    n.byHand();
    n.tap('yes');
    n.sock().drop();
    n.up();
    await tick();
    n.session.sendCommand('look');
    n.sock().data(PASSWORD_PROMPT);
    await tick();
    expect(n.lines()).toEqual(['Rasta', 'look']);
    expect(n.auto.armed).toBe(false);
  });

  it("the player's own Disconnect forgets it; the user's Reconnect uses it", async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.session.disconnect();
    expect(m.auto.armed).toBe(false);
    m.up();
    await tick();
    expect(m.lines()).toEqual([]);

    const r = make();
    r.byHand();
    r.tap('yes');
    r.session.reconnect();
    r.sock().open();
    r.sock().data(NAME_PROMPT);
    await tick();
    r.sock().data(PASSWORD_PROMPT);
    await tick();
    expect(r.lines()).toEqual(['Rasta', PASSWORD]);
  });

  it('a page restored from the back/forward cache forgets it; dispose lets go of the session', () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.auto.forget();
    expect(m.auto.armed).toBe(false);
    expect(m.session.loginTap).not.toBeNull();
    m.auto.dispose();
    expect(m.session.loginTap).toBeNull();
    expect(m.el.querySelector('.wc-ph-ask')).toBeNull();
  });
});

describe('the session tap', () => {
  it('is called at the login prompts of a real connection only, and never when nobody listens', () => {
    const m = make();
    m.auto.dispose();
    const seen: [string, boolean][] = [];
    m.session.loginTap = (t, s) => seen.push([t, s]);
    m.session.sendCommand('early');
    m.up();
    m.session.sendCommand('rasta');
    m.sock().data(PASSWORD_PROMPT);
    m.session.sendCommand('pw');
    m.letIn();
    m.session.sendCommand('look');
    // (`pw` is secret whatever the caller says while the server has ECHO off; the width commands of play are not tapped.)
    expect(seen).toEqual([
      ['rasta', false],
      ['pw', true],
    ]);
  });
});

describe('watchResume', () => {
  it('says when the page came back from the back/forward cache', () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const win = new EventTarget();
    const got: boolean[] = [];
    watchResume(doc as never, win as never, (restored) => got.push(restored));
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(got).toEqual([false, true]);
  });
});

describe('placeAsk', () => {
  const room = { left: 0, top: 50, right: 390, bottom: 700 };
  it('stands at the top of the text with no lens, never wider than 420 px', () => {
    expect(placeAsk(room, null, 150)).toEqual({ left: 8, top: 58, width: 374 });
    expect(placeAsk({ ...room, right: 820 }, null, 150)).toEqual({ left: 200, top: 58, width: 420 });
  });
  it('goes under a lens in the top corner of a narrow screen, beside it on a wide one', () => {
    const lens = { left: 210, top: 50, right: 380, bottom: 230 };
    expect(placeAsk(room, lens, 150)).toEqual({ left: 8, top: 238, width: 374 });
    expect(placeAsk({ ...room, right: 820 }, { left: 640, top: 50, right: 810, bottom: 230 }, 150)).toEqual({ left: 8, top: 58, width: 420 });
  });
  it('goes over a lens that stands low, and to the top where nothing is free', () => {
    expect(placeAsk(room, { left: 100, top: 400, right: 300, bottom: 600 }, 150).top).toBe(58);
    expect(placeAsk({ ...room, bottom: 300 }, { left: 100, top: 60, right: 300, bottom: 260 }, 150)).toEqual({ left: 8, top: 58, width: 374 });
  });
});
