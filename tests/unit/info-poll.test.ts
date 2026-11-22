// When the hidden info poll is sent (stage 77 part C, ADR 0166 points 3,
// 19, 22–25): a real session, line layer and game state, a fake clock.
import { afterEach, describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { InfoPoll, EVERY_MS, IDLE_MS, MAX_FAILURES, MIN_GAP_MS, SETTLE_MS, UNANSWERED_MS } from '../../src/gmcp/info-poll';
import { GameState } from '../../src/gmcp/state';
import { Session } from '../../src/net/session';
import { FakeScheduler } from '../../src/script/engine/timers';
import { LineAssembler } from '../../src/text/assembler';
import { GA, XML_PROMPT, answerPulse, answerText, pollNonce, wire } from '../fixtures/info-poll-answer';
import { FakeSocket, sb, utf8 } from './net-helpers';

const PROMPT = XML_PROMPT + GA;
const T0 = 1_790_000_000_000;
const gmcp = (pkg: string, data: unknown): number[] => sb(201, utf8(`${pkg} ${JSON.stringify(data)}`));

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
});

function setup(o: { enabled?: boolean } = {}) {
  const sched = new FakeScheduler();
  const now = (): number => T0 + sched.now();
  const bus = new Bus();
  const game = new GameState({ now, timers: { scheduler: sched } });
  let enabled = o.enabled ?? true;
  let n = 0;
  let sock = new FakeSocket();
  const poll: InfoPoll = new InfoPoll({
    bus,
    now,
    scheduler: sched,
    send: (text) => session.sendHidden(text),
    live: () => !session.isReplay && session.state === 'playing',
    passwordMode: () => session.passwordMode,
    enabled: () => enabled,
    fighting: () => game.group.fight().opponent !== null || game.char.view().position === 'fighting',
    dataAt: () => game.info.at,
    apply: (a) => game.applyInfo(a),
    nonce: () => `poll${String(n++).padStart(2, '0')}`,
  });
  game.attach(bus);
  const shown: string[] = [];
  bus.on('text.line', (l) => shown.push(l.text));
  const assembler = new LineAssembler({
    emit: (type, payload) => {
      if (type === 'text.line') poll.line(payload as never);
      else if (type === 'text.partial') poll.partial(payload as never);
      else bus.emit(type, payload);
    },
  });
  const session: Session = new Session({
    bus,
    sink: assembler,
    socketFactory: () => sock,
    timers: { setTimeout: () => 0, clearTimeout: () => {}, now: () => 0 },
    onFrameEnd: () => poll.frameEnd(),
  });
  const cmds: string[] = [];
  bus.on('cmd.sent', (c) => cmds.push(c.text));
  cleanup.push(() => {
    poll.dispose();
    session.dispose();
    game.dispose();
  });

  const frame = (...parts: (string | number[])[]): void => sock.data(parts.flatMap((p) => (typeof p === 'string' ? wire(p) : p)));
  const polls = (): string[] =>
    new TextDecoder('latin1')
      .decode(Uint8Array.from(sock.sentBytes()))
      .split('\r\n')
      .filter((l) => pollNonce(l) !== null);
  const nonce = (): string => pollNonce(polls().at(-1)!)!;
  const connect = (): void => {
    sock = new FakeSocket();
    session.connect();
    sock.open();
    frame([255, 251, 201]);
  };
  /** Into the game, the gate open once the width commands have settled. */
  const login = (): void => {
    connect();
    frame(gmcp('Char.Name', { name: 'Rasta' }));
    frame(gmcp('Char.Vitals', { hp: 100, maxhp: 200 }), PROMPT);
  };
  /** The login poll sent and answered. */
  const ready = (): void => {
    login();
    sched.advance(SETTLE_MS);
    frame(answerPulse(nonce()));
  };
  const answer = (): void => frame(answerPulse(nonce()));
  const wait = (ms: number): void => sched.advance(ms);
  /** Time passes with the player at the keys. */
  const active = (ms: number): void => {
    for (let left = ms; left > 0; left -= 60_000) {
      poll.activity();
      wait(Math.min(left, 60_000));
    }
  };
  const turn = (on: boolean): void => {
    enabled = on;
    poll.changed();
  };
  // The hub's one-second tick is not the poll's: count only what `pending` had without it.
  const idleTimers = sched.pending;
  return { bus, game, poll, session, sched, shown, cmds, frame, polls, nonce, connect, login, ready, answer, wait, active, turn, idleTimers, sock: () => sock };
}

describe('InfoPoll: the login poll', () => {
  it('is sent once, at the first game prompt, when the width commands have settled', () => {
    const t = setup();
    t.login();
    t.wait(SETTLE_MS - 1);
    expect(t.polls()).toEqual([]);
    t.wait(1);
    expect(t.polls()).toHaveLength(1);
    t.answer();
    expect(t.game.char.view().wimpy).toBe(120);
    t.active(2 * EVERY_MS);
    t.frame(PROMPT);
    expect(t.polls()).toHaveLength(1);
  });

  it('leaves no cmd.sent and no line', () => {
    const t = setup();
    t.ready();
    expect(t.cmds).toEqual(['change width all 500', 'change width table terminal']);
    expect(t.shown).toEqual(['o>']);
  });

  it('waits for Char.Vitals', () => {
    const t = setup();
    t.connect();
    t.frame(gmcp('Char.Name', { name: 'Rasta' }));
    t.frame(PROMPT);
    t.wait(10_000);
    expect(t.polls()).toEqual([]);
    expect(t.poll.request()).toMatch(/Char\.Vitals/);
    t.frame(gmcp('Char.Vitals', { hp: 1 }));
    expect(t.polls()).toHaveLength(1);
  });

  it("a prompt in Char.Name's own frame does not count: the width commands came after it", () => {
    const t = setup();
    t.connect();
    t.frame(gmcp('Char.Name', { name: 'Rasta' }), gmcp('Char.Vitals', { hp: 1 }), PROMPT);
    t.wait(10_000);
    expect(t.polls()).toEqual([]);
    t.frame(`Ok.\r\n\r\n${PROMPT}`);
    expect(t.polls()).toHaveLength(1);
  });

  it('waits out a fight', () => {
    for (const [on, off] of [
      [{ opponent: 'a troll' }, { opponent: null }],
      [{ position: 'fighting' }, { position: 'standing' }],
    ]) {
      const t = setup();
      t.login();
      t.frame(gmcp('Char.Vitals', on), PROMPT);
      t.wait(60_000);
      t.frame(PROMPT);
      expect(t.polls()).toEqual([]);
      expect(t.poll.request()).toBe('fighting');
      t.frame(gmcp('Char.Vitals', off), PROMPT);
      expect(t.polls()).toHaveLength(1);
    }
  });

  it('is not repeated when it is never answered', () => {
    const t = setup();
    t.login();
    t.active(3 * EVERY_MS);
    expect(t.polls()).toHaveLength(1);
  });

  it('once more for another character, whose answer is the only one applied', () => {
    const t = setup();
    t.login();
    t.wait(SETTLE_MS);
    const old = t.nonce();
    t.frame(gmcp('Char.Name', { name: 'Gibur' }), gmcp('Char.Vitals', { hp: 5 }));
    t.frame(answerPulse(old));
    expect(t.game.info.answer).toBeNull();
    expect(t.shown).toEqual(['o>']);
    t.wait(MIN_GAP_MS);
    expect(t.polls()).toHaveLength(2);
    t.answer();
    expect(t.game.info.answer?.wimpy).toBe(120);
  });

  it('once per connection', () => {
    const t = setup();
    t.ready();
    t.session.disconnect();
    t.login();
    expect(t.game.info.answer).toBeNull();
    t.wait(SETTLE_MS);
    expect(t.polls()).toHaveLength(1); // the new socket's
  });
});

describe('InfoPoll: the gate', () => {
  const closed: Array<[string, string]> = [
    ['text after the prompt', `${PROMPT}A troll arrives.\r\n`],
    ['a blank line after it', `${PROMPT}\r\n`],
    ['a partial after it', `${PROMPT}Enter your tex`],
    ['no XML prompt', `o&gt;${GA}`],
    ['the pager', `<prompt>*** Return: continue, b: back, r: redisplay, q: quit, &gt;: bottom (39%) *** </prompt>${GA}`],
    ['the pager untagged', `*** Return: continue, b: back, r: redisplay, q: quit, &gt;: bottom (39%) *** ${GA}`],
    // Seen live 2026-11-22 (`write test`): the editor reads whatever is sent.
    ['the line editor', `Write your message for the Mages' board\r\nType %e on an empty line to save and exit, %q to abandon and %h for help.\r\n==&gt;\r\n<prompt>: </prompt>${GA}`],
    ['the line editor, marked from its ==>', `Write your message for the Mages' board\r\nType %e on an empty line to save and exit, %q to abandon and %h for help.\r\n<prompt>==&gt;\r\n: </prompt>${GA}`],
    ['the line editor, cut after its ==>', `Write your message for the Mages' board\r\nType %e on an empty line to save and exit, %q to abandon and %h for help.\r\n<prompt>==&gt;\r\n`],
    ['a question', `<prompt>Are you sure? [y/n] </prompt>${GA}`],
    ['a prompt with text after it', `${XML_PROMPT}Text.\r\n`],
  ];
  for (const [name, text] of closed) {
    it(`${name}: no poll, until the next game prompt`, () => {
      const t = setup();
      t.login();
      t.frame(text);
      t.wait(60_000);
      expect(t.polls()).toEqual([]);
      expect(t.poll.gate()).not.toBeNull();
      expect(t.poll.request()).toBe(t.poll.gate());
      t.frame(`\r\n${PROMPT}`);
      expect(t.polls()).toHaveLength(1);
    });
  }

  it('a pending command: closed until a prompt after it', () => {
    const t = setup();
    t.login();
    t.session.sendCommand('write board');
    t.wait(60_000);
    expect(t.polls()).toEqual([]);
    expect(t.poll.gate()).toMatch(/command was sent after/);
    t.frame(`Write your note.\r\n] ${GA}`);
    t.wait(60_000);
    expect(t.polls()).toEqual([]);
    t.frame(`Ok.\r\n\r\n${PROMPT}`);
    expect(t.polls()).toHaveLength(1);
  });

  it('a command that is not echoed, a secret or an empty one closes it too', () => {
    for (const [text, opts] of [['x', { echo: false }], ['pw', { secret: true }], ['', {}]] as const) {
      const t = setup();
      t.login();
      t.wait(SETTLE_MS - 10);
      t.session.sendCommand(text, opts);
      t.wait(60_000);
      expect(t.polls()).toEqual([]);
    }
  });

  it('a command sent while a frame is read is later than all of that frame', () => {
    const t = setup();
    t.login();
    const off = t.bus.on('text.line', (l) => l.text === 'Trigger.' && t.session.sendCommand('write board'));
    t.frame(`Trigger.\r\n${PROMPT}`);
    off();
    t.wait(60_000);
    expect(t.polls()).toEqual([]);
    expect(t.poll.gate()).toMatch(/command was sent after/);
  });

  it('queued commands: the first one’s prompt is not enough', () => {
    const t = setup();
    t.login();
    t.wait(SETTLE_MS - 10);
    for (const c of ['look', 'look', 'write board']) t.session.sendCommand(c);
    t.wait(250);
    t.frame(`A road.\r\n\r\n${PROMPT}`);
    expect(t.polls()).toEqual([]);
    t.wait(250);
    t.frame(`A road.\r\n\r\n${PROMPT}`);
    t.wait(250);
    t.frame(`Write your note.\r\n] ${GA}`);
    t.wait(60_000);
    expect(t.polls()).toEqual([]);
  });

  it('password mode', () => {
    const t = setup();
    t.login();
    t.frame([255, 251, 1]);
    t.wait(60_000);
    expect(t.polls()).toEqual([]);
    expect(t.poll.request()).toBe('password mode');
  });

  it('is open after a hidden answer: what MUME printed last is a prompt', () => {
    const t = setup();
    t.ready();
    expect(t.poll.gate()).toBeNull();
  });

  it('never in the middle of a frame', () => {
    const t = setup();
    t.ready();
    t.wait(MIN_GAP_MS);
    let why: string | null = null;
    t.bus.on('text.line', () => (why = t.poll.request()));
    t.frame(PROMPT);
    expect(why).toMatch(/still arriving/);
    expect(t.polls()).toHaveLength(1);
  });
});

describe('InfoPoll: an open view', () => {
  it('on open when older than 30 s, not when fresh', () => {
    const t = setup();
    t.ready();
    t.wait(30_000);
    const release = t.poll.open();
    expect(t.polls()).toHaveLength(1);
    release();
    t.wait(1);
    t.poll.open();
    expect(t.polls()).toHaveLength(2);
  });

  it('then every 5 min while open', () => {
    const t = setup();
    t.ready();
    const release = t.poll.open();
    t.active(EVERY_MS - 1);
    expect(t.polls()).toHaveLength(1);
    t.wait(1);
    expect(t.polls()).toHaveLength(2);
    t.answer();
    t.active(EVERY_MS);
    expect(t.polls()).toHaveLength(3);
    t.answer();
    release();
    t.active(3 * EVERY_MS);
    expect(t.polls()).toHaveLength(3);
  });

  it('two views are one poll, and a release counts once', () => {
    const t = setup();
    t.ready();
    t.wait(31_000);
    const a = t.poll.open();
    const b = t.poll.open();
    expect(t.polls()).toHaveLength(2);
    t.answer();
    a();
    a();
    t.active(EVERY_MS);
    expect(t.polls()).toHaveLength(3);
    t.answer();
    b();
    t.active(EVERY_MS);
    expect(t.polls()).toHaveLength(3);
  });

  it('open before the game: one poll at login', () => {
    const t = setup();
    t.poll.open();
    t.ready();
    t.wait(60_000);
    expect(t.polls()).toHaveLength(1);
  });

  it('never more often than 10 s', () => {
    const t = setup();
    t.ready();
    t.wait(MIN_GAP_MS - 1);
    expect(t.poll.request()).toMatch(/10 s/);
    t.wait(1);
    expect(t.poll.request()).toBeNull();
    expect(t.polls()).toHaveLength(2);
  });

  it('10 s also after a failed one', () => {
    const t = setup();
    t.login();
    t.poll.open();
    t.wait(SETTLE_MS);
    t.frame(`WC${t.nonce()}[74\r\n${PROMPT}`);
    t.poll.open();
    t.wait(MIN_GAP_MS - 1);
    expect(t.polls()).toHaveLength(1);
    t.wait(1);
    expect(t.polls()).toHaveLength(2);
  });

  it('one outstanding; after 2 min another, and the late answer is still taken', () => {
    const t = setup();
    t.login();
    t.wait(SETTLE_MS);
    const first = t.nonce();
    t.poll.open();
    t.active(UNANSWERED_MS - 1);
    expect(t.polls()).toHaveLength(1);
    expect(t.poll.request()).toMatch(/waits for its answer/);
    t.wait(1);
    expect(t.polls()).toHaveLength(2);
    t.frame(answerPulse(first));
    expect(t.game.info.answer?.wimpy).toBe(120);
    expect(t.shown).toEqual(['o>']);
    expect(t.poll.failures).toBe(0);
  });

  it('idle: none without a press in 5 min, and one after the press', () => {
    const t = setup();
    t.ready();
    t.poll.open();
    t.wait(EVERY_MS);
    // Entering the game was the last press: 5 min and the settle ago.
    expect(t.polls()).toHaveLength(1);
    t.wait(EVERY_MS);
    t.frame(PROMPT);
    expect(t.polls()).toHaveLength(1);
    expect(t.sched.pending).toBe(t.idleTimers);
    t.poll.activity();
    expect(t.polls()).toHaveLength(1); // not inside the press
    t.wait(0);
    expect(t.polls()).toHaveLength(2);
  });

  it('commands from scripts and timers are no activity', () => {
    const t = setup();
    t.ready();
    t.poll.open();
    for (let m = 0; m < 12; m++) {
      t.wait(60_000);
      t.session.sendCommand('score');
      t.frame(`Fine.\r\n\r\n${PROMPT}`);
    }
    expect(t.polls()).toHaveLength(1);
  });

  it('entering the game is activity', () => {
    const t = setup();
    t.wait(3 * IDLE_MS);
    t.login();
    t.wait(SETTLE_MS);
    expect(t.polls()).toHaveLength(1);
  });

  it('a press and its command: the command goes first', () => {
    const t = setup();
    t.ready();
    t.poll.open();
    t.wait(2 * EVERY_MS);
    t.poll.activity();
    t.session.sendCommand('look');
    t.wait(0);
    expect(t.polls()).toHaveLength(1);
    t.frame(`A road.\r\n\r\n${PROMPT}`);
    t.wait(SETTLE_MS);
    expect(t.polls()).toHaveLength(2);
  });
});

describe('InfoPoll: off and stopped', () => {
  it('off: no hidden command at all, the login poll included', () => {
    const t = setup({ enabled: false });
    t.login();
    t.poll.open();
    t.active(2 * EVERY_MS);
    expect(t.polls()).toEqual([]);
    expect(t.poll.request()).toBe('the setting is off');
    t.turn(true);
    expect(t.polls()).toHaveLength(1);
  });

  it('turned off with an answer under way: it is still hidden', () => {
    const t = setup();
    t.login();
    t.wait(SETTLE_MS);
    t.turn(false);
    t.answer();
    expect(t.shown).toEqual(['o>']);
  });

  it(`${MAX_FAILURES} failures stop it until the next connection`, () => {
    const t = setup();
    t.login();
    t.poll.open();
    t.wait(SETTLE_MS);
    t.frame(`WC${t.nonce()}[74\r\n${PROMPT}`);
    expect(t.poll.failures).toBe(1);
    t.active(EVERY_MS);
    expect(t.polls()).toHaveLength(2);
    t.frame(`WC${t.nonce()}[74\r\n${PROMPT}`);
    expect(t.poll.failures).toBe(2);
    t.active(3 * EVERY_MS);
    expect(t.polls()).toHaveLength(2);
    expect(t.poll.request()).toMatch(/failed/);
    expect(t.sched.pending).toBe(t.idleTimers);
    t.session.disconnect();
    t.login();
    t.wait(SETTLE_MS);
    expect(t.polls()).toHaveLength(1);
    expect(t.poll.failures).toBe(0);
  });

  it('never in a replay', () => {
    const t = setup();
    const replay = Object.assign(new FakeSocket(), { replay: true as const });
    t.session.connect(replay);
    replay.open();
    replay.data([255, 251, 201, ...gmcp('Char.Name', { name: 'Rasta' })]);
    replay.data([...gmcp('Char.Vitals', { hp: 1 }), ...wire(PROMPT)]);
    t.poll.open();
    t.active(2 * EVERY_MS);
    expect(t.poll.request()).toBe('not in the game');
    expect(t.session.sendHidden('info')).toBe(false);
    expect(new TextDecoder().decode(Uint8Array.from(replay.sentBytes()))).not.toContain('info WC');
  });

  it('a disconnect puts held lines back before anyone later on the bus sees it', () => {
    const t = setup();
    const order: string[] = [];
    t.login();
    t.wait(SETTLE_MS);
    t.frame(`WC${t.nonce()}[74 |\r\n`);
    t.bus.on('text.line', (l) => order.push(l.text.slice(0, 2)));
    t.bus.on('conn.state', (s) => order.push(s.state));
    t.session.disconnect();
    expect(order).toEqual(['WC', 'disconnected']);
  });

  it('no timers when nothing needs them', () => {
    const t = setup();
    expect(t.sched.pending).toBe(t.idleTimers);
    t.ready();
    expect(t.sched.pending).toBe(t.idleTimers);
    const release = t.poll.open();
    expect(t.sched.pending).toBe(t.idleTimers + 1);
    release();
    expect(t.sched.pending).toBe(t.idleTimers);
    t.poll.open();
    t.session.disconnect();
    expect(t.sched.pending).toBe(t.idleTimers);
    t.login();
    t.poll.dispose();
    expect(t.sched.pending).toBe(t.idleTimers);
  });

  it('a shared answer still counts', () => {
    const t = setup();
    t.login();
    t.wait(SETTLE_MS);
    t.frame(`A troll arrives.\r\n${answerText(t.nonce())}${PROMPT}`);
    expect(t.shown).toEqual(['o>', 'A troll arrives.', 'o>']);
    expect(t.game.info.answer?.wimpy).toBe(120);
  });
});

describe('Session.sendHidden', () => {
  it('writes and emits no cmd.sent; false with no system message when it cannot', () => {
    const t = setup();
    const sys: string[] = [];
    t.bus.on('sys.message', (m) => sys.push(m.text));
    expect(t.session.sendHidden('info')).toBe(false);
    t.connect();
    expect(t.session.sendHidden('info')).toBe(false);
    t.frame(gmcp('Char.Name', { name: 'Rasta' }));
    t.cmds.length = 0;
    expect(t.session.sendHidden('info x')).toBe(true);
    expect(new TextDecoder().decode(Uint8Array.from(t.sock().sentBytes()))).toContain('info x\r\n');
    t.session.disconnect();
    expect(t.session.sendHidden('info')).toBe(false);
    expect(t.cmds).toEqual([]);
    expect(sys).toEqual([]);
  });
});
