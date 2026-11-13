// @vitest-environment happy-dom
// Round 54c (ADR 0141): automatic login for the session. The controller on
// a real Session, telnet parser and line assembler over a fake socket: what
// reaches the wire, and that the password reaches nothing else.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { BusEvents } from '../../src/core/types';
import { REASON_BACKGROUND_LOST, REASON_USER_RECONNECT, Session, isLinkLoss } from '../../src/net/session';
import { OPT_ECHO, OPT_GMCP, WILL, WONT } from '../../src/net/telnet';
import { AutoLogin, NAME_WAIT_MS } from '../../src/phone/auto-login';
import { EXPIRE_MS } from '../../src/phone/login-rule';
import { LoginAsk, placeAsk } from '../../src/phone/login-ask';
import { ASK_MS, ATTEMPT_MS } from '../../src/phone/login-rule';
import { LineAssembler } from '../../src/text/assembler';
import { watchResume } from '../../src/app/resume-watch';
import { FakeSocket, IAC, ascii, sb, utf8 } from './net-helpers';

const PASSWORD = 'correct-horse-9';
const GA = 249;
const NAME_PROMPT = [...ascii('By what name do you wish to be known? '), IAC, GA];
const PASSWORD_PROMPT = [IAC, WILL, OPT_ECHO, ...ascii('Password: '), IAC, GA];
const gmcp = (payload: string): number[] => sb(OPT_GMCP, utf8(payload));
/** Past the name's wait after the prompt (`NAME_WAIT_MS`) and the frame's microtasks. */
const tick = (): Promise<void> => {
  vi.advanceTimersByTime(NAME_WAIT_MS);
  return new Promise<void>((r) => queueMicrotask(r));
};
/** The reason of a socket that went away with no close from the server (a lost link). */
const LOST = 'closed by server (code 1006)';
/** The reason of a close the server made itself (quit, rent, an idle kick). */
const CLEAN = 'closed by server (code 1000)';

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
  const auto = new AutoLogin({ session, bus, userReconnect: REASON_USER_RECONNECT, linkLost: isLinkLoss }, { el, notice: (t) => notices.push(t), placed: () => {}, win: window });
  const sock = () => sockets.at(-1)!;
  /** The lines sent on the newest socket (telnet negotiation and GMCP left out). */
  const lines = (): string[] => {
    const out: string[] = [];
    for (const b of sock().sent) {
      if (b[0] === IAC) continue;
      const line = new TextDecoder().decode(b).replace(/\r\n$/, '');
      // (The width commands the session sends by itself on entering play.)
      if (!line.startsWith('change width')) out.push(line);
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
  /** A new connection shows both prompts and is sent nothing: the proof on the wire that nothing is kept. */
  const nothingSentNext = async (): Promise<void> => {
    if (session.state !== 'disconnected' && session.state !== 'idle') sock().drop(LOST);
    up();
    await tick();
    sock().data(PASSWORD_PROMPT);
    await tick();
    expect(lines()).toEqual([]);
    expect(auto.vaultEmpty).toBe(true);
  };
  const tap = (act: 'yes' | 'no'): void => el.querySelector<HTMLButtonElement>(`.wc-ph-ask [data-act="${act}"]`)!.click();
  const asked = (): boolean => !el.querySelector<HTMLElement>('.wc-ph-ask')!.hidden;
  return { bus, session, auto, el, sock, sockets, cmds, notices, lines, up, letIn, byHand, tap, asked, nothingSentNext };
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
    const card = new LoginAsk(document);
    card.show('<img src=x>', () => {});
    expect(card.el.querySelector('img')).toBeNull();
    expect(card.el.querySelector('.wc-ph-ask-q b')!.textContent).toBe('<img src=x>');
    expect(card.el.querySelector('.wc-ph-ask-n')!.textContent).toContain('account password');
  });

  it('Yes arms; No does not, and the next login by hand asks again; unanswered it goes away', () => {
    const yes = make();
    yes.byHand();
    yes.tap('yes');
    expect(yes.asked()).toBe(false);
    expect(yes.auto.armed).toBe(true);
    expect(yes.auto.vaultEmpty).toBe(false);

    const no = make();
    no.byHand();
    no.tap('no');
    expect(no.asked()).toBe(false);
    expect(no.auto.armed).toBe(false);
    expect(no.auto.vaultEmpty).toBe(true);
    no.sock().drop(LOST);
    no.byHand();
    expect(no.asked()).toBe(true);
    expect(no.auto.armed).toBe(false);

    const late = make();
    late.byHand();
    vi.advanceTimersByTime(ASK_MS);
    expect(late.asked()).toBe(false);
    expect(late.auto.armed).toBe(false);
    expect(late.auto.vaultEmpty).toBe(true);
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
    expect(m.auto.vaultEmpty).toBe(true);
  });

  it('a failed login by hand: the pending password is gone when the connection ends', () => {
    const m = make();
    m.up();
    m.session.sendCommand('rasta');
    m.sock().data(PASSWORD_PROMPT);
    m.session.sendCommand('not-it', { secret: true });
    expect(m.auto.vaultEmpty).toBe(false);
    m.sock().drop(CLEAN);
    expect(m.auto.vaultEmpty).toBe(true);
  });

  it('a password typed before the server turned ECHO off is a plain line: it is not kept as the password, and no question follows', () => {
    const m = make();
    m.up();
    m.session.sendCommand('rasta');
    // Typed ahead, before WILL ECHO: sent plain (the client shows it as any command, as before this round).
    m.session.sendCommand(PASSWORD);
    expect(m.auto.vaultEmpty).toBe(true);
    m.sock().data(PASSWORD_PROMPT);
    m.letIn();
    expect(m.session.state).toBe('playing');
    expect(m.asked()).toBe(false);
    expect(m.auto.vaultEmpty).toBe(true);
  });
});

describe('the automatic login', () => {
  it('a dropped link, a new connection: the name, then the password at the password prompt only, once each', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    m.cmds.length = 0;
    m.up();
    // The name waits after the prompt (answered at once, the live game shows the prompt again).
    vi.advanceTimersByTime(NAME_WAIT_MS - 1);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(m.lines()).toEqual([]);
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
    m.sock().drop(LOST);
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
    m.sock().drop(LOST);
    m.up();
    await tick();
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    m.sock().data([IAC, WONT, OPT_ECHO, ...ascii('\r\nWrong password.\r\n'), ...PASSWORD_PROMPT]);
    await tick();
    expect(m.lines()).toEqual(['Rasta', PASSWORD]);
    expect(m.auto.armed).toBe(false);
    expect(m.notices.at(-1)).toBe('Automatic login stopped: MUME asked for the password again. The saved login is forgotten.');
    await m.nothingSentNext();
  });

  it('the server turns ECHO back on in the same frame: the password is not sent', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    m.up();
    await tick();
    m.sock().data([IAC, WILL, OPT_ECHO, IAC, WONT, OPT_ECHO]);
    await tick();
    expect(m.lines()).toEqual(['Rasta']);
    expect(m.auto.armed).toBe(false);
    await m.nothingSentNext();
  });

  it('no name prompt, or no password prompt, in time: stopped and forgotten', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    m.session.connect();
    m.sock().open();
    m.sock().data(ascii('Something else entirely: '));
    await tick();
    vi.advanceTimersByTime(ATTEMPT_MS);
    expect(m.lines()).toEqual([]);
    expect(m.auto.armed).toBe(false);
    await m.nothingSentNext();

    const n = make();
    n.byHand();
    n.tap('yes');
    n.sock().drop(LOST);
    n.up();
    await tick();
    n.sock().data(ascii('\r\nDid I get that right, Rasta (y/n)? '));
    vi.advanceTimersByTime(ATTEMPT_MS);
    n.sock().data(PASSWORD_PROMPT);
    await tick();
    expect(n.lines()).toEqual(['Rasta']);
    expect(n.auto.armed).toBe(false);
    await n.nothingSentNext();
  });

  it('the connection ends during the login, or the player types into it before the password: stopped and forgotten', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    m.up();
    await tick();
    m.sock().drop(LOST);
    expect(m.auto.armed).toBe(false);
    await m.nothingSentNext();

    const n = make();
    n.byHand();
    n.tap('yes');
    n.sock().drop(LOST);
    n.up();
    await tick();
    n.session.sendCommand('look');
    n.sock().data(PASSWORD_PROMPT);
    await tick();
    expect(n.lines()).toEqual(['Rasta', 'look']);
    expect(n.auto.armed).toBe(false);
    await n.nothingSentNext();
  });

  it('an empty Enter during the login stops nothing', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    m.up();
    await tick();
    m.session.sendCommand('');
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    m.session.sendCommand('', { secret: true });
    m.letIn();
    expect(m.lines()).toEqual(['Rasta', '', PASSWORD, '']);
    expect(m.auto.armed).toBe(true);
    expect(m.notices).toContain('Logged in as Rasta.');
  });

  it("after the password was sent, the player's own lines answer MUME and stop nothing", async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    m.up();
    await tick();
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    m.sock().data([IAC, WONT, OPT_ECHO, ...ascii('\r\nPress return to go on: ')]);
    m.session.sendCommand('ok');
    m.letIn();
    expect(m.lines()).toEqual(['Rasta', PASSWORD, 'ok']);
    expect(m.session.state).toBe('playing');
    expect(m.auto.armed).toBe(true);
    expect(m.auto.vaultEmpty).toBe(false);
  });

  it('the character quits (the server closes by itself, or says goodbye): forgotten, and nothing logs in at the next connection', async () => {
    for (const end of ['close', 'goodbye'] as const) {
      const m = make();
      m.byHand();
      m.tap('yes');
      if (end === 'close') m.sock().drop(CLEAN);
      else m.sock().data(gmcp('Core.Goodbye "Goodbye."'));
      expect(m.session.state).toBe('disconnected');
      expect(m.auto.armed).toBe(false);
      expect(m.auto.vaultEmpty).toBe(true);
      expect(m.notices.at(-1)).toBe('Automatic login is off: the session ended. The saved login is forgotten.');
      await m.nothingSentNext();
    }
  });

  it('what keeps it: a socket lost with no close from the server, and the resume check; what the shell is told at the drop', () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    expect(m.auto.armedAfter(LOST)).toBe(true);
    expect(m.auto.armedAfter(REASON_BACKGROUND_LOST)).toBe(true);
    expect(m.auto.armedAfter(REASON_USER_RECONNECT)).toBe(true);
    for (const r of [CLEAN, 'closed by server (code 1001)', 'closed by server (code 1005)', 'closed by server', 'Core.Goodbye', 'disconnected by user', 'replay started', '']) {
      expect(m.auto.armedAfter(r), r).toBe(false);
    }
    m.session.disconnect(REASON_BACKGROUND_LOST);
    expect(m.auto.armed).toBe(true);
    expect(m.auto.vaultEmpty).toBe(false);
    // A connection that never comes up (no network yet) ends nothing.
    m.session.connect();
    m.sock().drop('connection failed (code 1006)');
    m.session.connect();
    m.sock().drop('connection failed (code 1000)');
    expect(m.auto.armed).toBe(true);
    // In the middle of an attempt nothing is promised to the shell.
    m.up();
    expect(m.auto.armedAfter(LOST)).toBe(false);
  });

  it("another character's Char.Name in play forgets it", async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().data(gmcp('Char.Name {"name":"Gibur","fullname":"Gibur the Other"}'));
    expect(m.auto.armed).toBe(false);
    expect(m.auto.vaultEmpty).toBe(true);
    await m.nothingSentNext();
  });

  it("the player's own Disconnect forgets it; the user's Reconnect uses it", async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.session.disconnect();
    expect(m.auto.armed).toBe(false);
    await m.nothingSentNext();

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

  describe('three hours without a connection', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    });

    it('the stored login is wiped while the page runs, and the next connection is the player\'s own', async () => {
      const m = make();
      m.byHand();
      m.tap('yes');
      m.sock().drop(LOST);
      vi.advanceTimersByTime(EXPIRE_MS - 1000);
      expect(m.auto.vaultEmpty).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(m.auto.vaultEmpty).toBe(true);
      expect(m.notices).toContain('Automatic login is off: not connected for three hours. The saved login is forgotten.');
      await m.nothingSentNext();
    });

    it('a page that was suspended (its timer never ran): wiped when asked, and when the player reconnects', async () => {
      for (const how of ['asked', 'reconnect'] as const) {
        const m = make();
        m.byHand();
        m.tap('yes');
        m.sock().drop(LOST);
        // The clock moves, the timers do not.
        vi.setSystemTime(Date.now() + EXPIRE_MS + 1);
        if (how === 'asked') expect(m.auto.armed).toBe(false);
        await m.nothingSentNext();
        expect(m.auto.armed).toBe(false);
        document.body.replaceChildren();
      }
    });

    it('a shorter time away keeps it: the reconnect logs in; failed connects in between do not start the time again', async () => {
      const m = make();
      m.byHand();
      m.tap('yes');
      m.sock().drop(LOST);
      vi.advanceTimersByTime(EXPIRE_MS - 60_000);
      m.session.connect();
      m.sock().drop(LOST); // never came up
      expect(m.auto.armed).toBe(true);
      vi.advanceTimersByTime(60_000);
      expect(m.auto.armed).toBe(false);

      const k = make();
      k.byHand();
      k.tap('yes');
      k.sock().drop(LOST);
      vi.advanceTimersByTime(EXPIRE_MS - 60_000);
      k.up();
      await tick();
      k.sock().data(PASSWORD_PROMPT);
      await tick();
      expect(k.lines()).toEqual(['Rasta', PASSWORD]);
      k.letIn();
      // Up again: the time is not counted any more.
      vi.advanceTimersByTime(EXPIRE_MS * 2);
      expect(k.auto.armed).toBe(true);
    });
  });

  it('a page restored from the back/forward cache forgets it', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.auto.forget(true);
    expect(m.auto.armed).toBe(false);
    await m.nothingSentNext();
  });

  it('dispose lets go of the session and the bus, empties the vault, and no timer or planned send acts afterwards', async () => {
    // Disposed under an open question: its timer does nothing.
    const q = make();
    q.byHand();
    expect(q.auto.vaultEmpty).toBe(false);
    q.auto.dispose();
    expect(q.auto.vaultEmpty).toBe(true);
    expect(q.session.loginTap).toBeNull();
    expect(q.el.querySelector('.wc-ph-ask')).toBeNull();
    vi.advanceTimersByTime(ASK_MS * 2);
    expect(q.notices.filter((n) => n.startsWith('Automatic login stopped'))).toEqual([]);

    // Disposed in the middle of an attempt, with a send planned: nothing is sent, no timeout notice.
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    m.up();
    m.auto.dispose();
    await tick();
    m.sock().data(PASSWORD_PROMPT);
    await tick();
    vi.advanceTimersByTime(ATTEMPT_MS * 2);
    expect(m.lines()).toEqual([]);
    expect(m.auto.vaultEmpty).toBe(true);
    expect(m.notices.filter((n) => n.startsWith('Automatic login stopped'))).toEqual([]);
    expect(m.bus.count('conn.state')).toBe(0);
    expect(m.bus.count('telnet.echo')).toBe(0);
    expect(m.bus.count('text.partial')).toBe(0);
    expect(m.bus.count('gmcp')).toBe(0);
  });

  it('a card that cannot be made leaves nothing attached to the session or the bus', () => {
    const bus = new Bus();
    const session = new Session({ bus, sink: new LineAssembler(bus), socketFactory: () => new FakeSocket() });
    const before = bus.total();
    const el = document.createElement('div');
    el.append = () => {
      throw new Error('no room');
    };
    expect(() => new AutoLogin({ session, bus, userReconnect: REASON_USER_RECONNECT, linkLost: isLinkLoss }, { el, notice: () => {}, placed: () => {}, win: window })).toThrow('no room');
    expect(session.loginTap).toBeNull();
    expect(bus.total()).toBe(before);
  });
});

describe('late and at exit', () => {
  it('Exit session with the link already down forgets the login; the answers stay', async () => {
    const m = make();
    m.byHand();
    m.tap('yes');
    m.sock().drop(LOST);
    expect(m.auto.armed).toBe(true);
    m.auto.forget(false);
    expect(m.auto.armed).toBe(false);
    await m.nothingSentNext();
  });

  it('made while a connection is already at the login prompts: that login is followed', () => {
    const bus = new Bus();
    const sock = new FakeSocket();
    const session = new Session({ bus, sink: new LineAssembler(bus), socketFactory: () => sock });
    session.connect();
    sock.open();
    sock.data([IAC, WILL, OPT_GMCP]);
    sock.data(NAME_PROMPT);
    const el = document.createElement('div');
    const auto = new AutoLogin({ session, bus, userReconnect: REASON_USER_RECONNECT, linkLost: isLinkLoss }, { el, notice: () => {}, placed: () => {}, win: window });
    session.sendCommand('rasta');
    sock.data(PASSWORD_PROMPT);
    session.sendCommand(PASSWORD, { secret: true });
    sock.data([IAC, WONT, OPT_ECHO, ...gmcp('Char.Name {"name":"Rasta"}')]);
    expect(el.querySelector<HTMLElement>('.wc-ph-ask')!.hidden).toBe(false);
    auto.dispose();
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
