// The hidden info poll: when it is sent (stage 77 part C, ADR 0166 points
// 3, 6, 19, 22–25, 34, 35). Pure TS: the clock, the timers, the send and the state
// are injected. What hides the answer is info-filter.ts.
//
// Why a poll is sent:
// - Login: once per connection and character, for the wimpy.
// - `open()`, a Stats or Lore view is open: at once when the data is older
//   than 30 s, then every 5 min while one is.
//
// When: never more often than 10 s, one outstanding (2 min at most), none
// while idle (no key or pointer press in 5 min; entering the game counts),
// not fighting, after the character's Char.Vitals, two failures stop it
// for the connection, and only when the gate is open:
//
// - the last thing MUME printed is an XML game prompt ending in `>`, with
//   nothing after it (not the pager, the line editor or a question);
// - no command was sent since that prompt. A command sent while a frame is
//   read (an action) is later than all of that frame: MUME printed the
//   frame before it could see the command;
// - no command was sent in the last 2 s. MUME answers queued commands one
//   pulse at a time, so the first one's prompt does not say that the last
//   one (`write`, say) has been read, and a prompt can have been on its way
//   when the command went. The 5 min repeat waits for 10 s of quiet, as a
//   command can be held behind a cast.
//
// A command sent into the pager or the line editor is read by them: when in
// doubt, no poll.
//
// The sex probe (stage 77 part E2): when the login poll goes and the
// character's sex is not known (`needSex`), the probe's three `info`s go in
// the same write, so that MUME answers all four in one pulse. At most one
// probe per character and connection, whatever its outcome. A failed probe
// counts toward MAX_FAILURES like a failed poll: it is the same risk, held
// game text put back late. It is also reported (`sexFailed`) and remembered
// for the name, so a character whose `info` MUME pages shows that text once
// and is never probed again. Only in a window of `PROBE_MIN_ROWS` or more,
// as MUME's pager follows the window's height.
//
// Entering the game also arms the filter for the `Ok.` answers to
// Session's width commands (PLAYING_COMMANDS), whether the poll is enabled
// or not; any other `conn.state` disarms it.
//
// One timer at most, and only while time alone can make a poll due. What
// else a poll waits for (a prompt, the fight's end) comes with a frame.

import type { Bus } from '../core/bus';
import { type Line, gmcpKey } from '../core/types';
import { PLAYING_COMMANDS } from '../net/session';
import type { Scheduler } from '../script/engine/timers';
import type { InfoAnswer } from './info-answer';
import { InfoFilter, infoCommand, isGamePrompt, sexProbeCommand } from './info-filter';
import type { Sex } from './sex';

/** Opening a view polls when the data is older. */
export const FRESH_MS = 30_000;
/** Between the polls while a view is open. */
export const EVERY_MS = 5 * 60_000;
/** Never more often. */
export const MIN_GAP_MS = 10_000;
/** No poll without a press in this long. */
export const IDLE_MS = 5 * 60_000;
/** An unanswered poll blocks the next for this long. */
export const UNANSWERED_MS = 2 * 60_000;
/** After the last command sent. */
export const SETTLE_MS = 2000;
/** The same for the repeated poll, which is in no hurry. */
export const REPEAT_SETTLE_MS = 10_000;
/** Failures that stop the polls for the connection. */
export const MAX_FAILURES = 2;
/**
 * The probe only in a window this tall (`view.size`): MUME pages a plain
 * `info` (about 20 lines) at the window's height, and its pager would take
 * the probe's last `info` as input and stay open (a phone in landscape,
 * stage 77 E2, the owner's test). Unknown: no probe.
 */
export const PROBE_MIN_ROWS = 30;

export interface InfoPollOptions {
  /** Subscribe first: what is held must go out before anyone sees a disconnect. */
  bus: Bus;
  /** Wall clock in ms. */
  now(): number;
  scheduler: Scheduler;
  /** Writes the command and emits no `cmd.sent`. False when it cannot. */
  send(text: string): boolean;
  /** In the game on a real connection. */
  live(): boolean;
  passwordMode(): boolean;
  enabled(): boolean;
  fighting(): boolean;
  /** When the model's data was received, or null. */
  dataAt(): number | null;
  apply(answer: InfoAnswer): void;
  /** The character is named and its sex is not known: the login poll brings the probe. None: never. */
  needSex?(): boolean;
  /** The probe's answer. */
  applySex?(sex: Sex): void;
  /** The probe failed: not to be sent again for this character. */
  sexFailed?(): void;
  /** Six random lower-case letters and digits (tests). */
  nonce?(): string;
}

export class InfoPoll {
  private readonly filter: InfoFilter;
  private readonly unsubs: Array<() => void> = [];
  private disposed = false;

  private character: string | null = null;
  private vitals = false;
  private loginDue = false;
  /** Open Stats and Lore views. */
  private views = 0;
  /** A view was opened on old data. */
  private openDue = false;
  private sentPollAt: number | null = null;
  /** The poll that waits for its answer. */
  private outstanding: string | null = null;
  /** The polls of this character: only their answers are applied. */
  private own = new Set<string>();
  private failureCount = 0;
  /** The characters probed for their sex on this connection. */
  private probed = new Set<string>();
  /** The probes sent and not answered. */
  private probes = new Set<string>();
  /** The window's height in rows, from `view.size`. */
  private rows: number | null = null;
  private pressedAt = Number.NEGATIVE_INFINITY;

  /** A socket frame is being read. */
  private inFrame = false;
  /** The last completed line when the last command was sent. */
  private lineAtSend: Line | null = null;
  private sentInFrame = false;
  private commandAt = Number.NEGATIVE_INFINITY;

  private timer: unknown = null;
  private timerAt: number | null = null;

  constructor(private readonly o: InfoPollOptions) {
    const { bus } = o;
    this.filter = new InfoFilter({
      line: (l) => bus.emit('text.line', l),
      partial: (l) => bus.emit('text.partial', l),
      found: (nonce, answer) => this.found(nonce, answer),
      foundSex: (nonce, sex) => {
        this.probes.delete(nonce);
        if (this.own.delete(nonce)) this.o.applySex?.(sex);
      },
      failed: (nonce) => this.failed(nonce),
      scheduler: o.scheduler,
    });
    this.unsubs.push(
      bus.on('net.bytesIn', () => (this.inFrame = true)),
      bus.on('cmd.sent', (c) => {
        if (c.replay) return;
        this.commandAt = o.now();
        this.lineAtSend = this.filter.last;
        if (this.inFrame) this.sentInFrame = true;
      }),
      bus.on('conn.state', (s) => {
        if (s.state === 'playing' && !s.replay) this.filter.expectOk(PLAYING_COMMANDS.length);
        else this.filter.dropOk();
        if (s.state === 'connecting') this.newConnection();
        else if (s.state === 'disconnected') {
          this.filter.reset();
          this.clearTimer();
        } else if (s.state === 'playing' && !s.replay) {
          this.enterGame();
          this.check();
        }
      }),
      bus.on('view.size', (v) => (this.rows = v.rows)),
      bus.on('gmcp', (m) => {
        const key = gmcpKey(m);
        if (key === 'char.vitals') this.vitals = true;
        else if (key === 'char.name') this.named((m.data as { name?: unknown } | null | undefined)?.name);
      }),
    );
  }

  /** The assembler's lines. */
  readonly line = (l: Line): void => this.filter.line(l);
  /** The assembler's partials. */
  readonly partial = (l: Line): void => this.filter.partial(l);

  /** The session has read a frame to its end. */
  frameEnd(): void {
    this.filter.frameEnd();
    this.inFrame = false;
    if (this.sentInFrame) {
      this.sentInFrame = false;
      this.lineAtSend = this.filter.last;
    }
    this.check();
  }

  /** A key or pointer press. Commands from scripts and timers are none. */
  activity(): void {
    const now = this.o.now();
    const wasIdle = now - this.pressedAt > IDLE_MS;
    this.pressedAt = now;
    // Not inside the press: the key's own command goes first (ADR 0044).
    if (wasIdle && (this.loginDue || this.views > 0) && this.o.live()) this.arm(now, now);
  }

  /** The setting or another injected state changed. */
  changed(): void {
    this.check();
  }

  /** A Stats or Lore view is open. Call the returned function when it closes. */
  open(): () => void {
    this.views++;
    const at = this.o.dataAt();
    if (at === null || this.o.now() - at > FRESH_MS) this.openDue = true;
    this.check();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.views === 0) this.openDue = false;
      this.check();
    };
  }

  get failures(): number {
    return this.failureCount;
  }

  /** MUME reads input of its own (point 35): a command not typed would be taken as its text. */
  readsInput(): boolean {
    return this.o.passwordMode() || this.filter.readsInput();
  }

  /** Why the gate is closed, or null when it is open. */
  gate(): string | null {
    const last = this.filter.last;
    if (this.inFrame) return 'output is still arriving';
    if (!last || !isGamePrompt(last)) return 'the last output is not a game prompt';
    if (this.filter.partialOpen) return 'there is text after the last prompt';
    if (last === this.lineAtSend) return 'a command was sent after the last prompt';
    if (this.o.now() < this.commandAt + SETTLE_MS) return 'a command was sent less than 2 s ago';
    return null;
  }

  /** A poll asked for now, whatever is due. Returns why none was sent, or null. */
  request(): string | null {
    const now = this.o.now();
    if (!this.o.live()) return 'not in the game';
    if (!this.o.enabled()) return 'the setting is off';
    if (this.failureCount >= MAX_FAILURES) return 'two answers failed on this connection';
    if (!this.vitals) return 'no Char.Vitals yet';
    if (this.sentPollAt !== null && now < this.sentPollAt + MIN_GAP_MS) return 'the last poll was less than 10 s ago';
    if (this.outstanding !== null && this.sentPollAt !== null && now < this.sentPollAt + UNANSWERED_MS) return 'a poll waits for its answer';
    const why = this.blocked();
    if (why !== null) return why;
    return this.send(now) ? null : 'it could not be sent';
  }

  dispose(): void {
    this.disposed = true;
    for (const u of this.unsubs.splice(0)) u();
    this.clearTimer();
    this.filter.reset();
  }

  private newConnection(): void {
    this.filter.reset();
    this.clearTimer();
    this.character = null;
    this.vitals = this.loginDue = this.openDue = this.sentInFrame = false;
    this.sentPollAt = this.outstanding = this.lineAtSend = null;
    this.own.clear();
    this.probed.clear();
    this.probes.clear();
    this.failureCount = 0;
    this.commandAt = Number.NEGATIVE_INFINITY;
  }

  private enterGame(): void {
    this.loginDue = true;
    this.openDue = this.views > 0;
    this.pressedAt = this.o.now();
  }

  private named(name: unknown): void {
    if (typeof name !== 'string' || !name) return;
    const n = name.toLowerCase();
    if (this.character !== null && this.character !== n) {
      this.vitals = false;
      this.outstanding = null;
      this.own.clear();
      if (this.o.live()) this.enterGame();
    }
    this.character = n;
  }

  private found(nonce: string, answer: InfoAnswer): void {
    if (this.outstanding === nonce) this.outstanding = null;
    if (!this.own.delete(nonce)) return;
    this.loginDue = this.openDue = false;
    this.o.apply(answer);
  }

  private failed(nonce: string): void {
    if (this.outstanding === nonce) this.outstanding = null;
    const own = this.own.delete(nonce);
    if (this.probes.delete(nonce) && own) this.o.sexFailed?.();
    if (++this.failureCount >= MAX_FAILURES) this.clearTimer();
  }

  /** The time from which a poll is due and allowed, as far as time decides it. Null: none. */
  private nextAt(now: number): number | null {
    if (!this.loginDue && this.views === 0) return null;
    if (!this.vitals || this.failureCount >= MAX_FAILURES || now - this.pressedAt > IDLE_MS) return null;
    if (!this.o.live() || !this.o.enabled()) return null;
    const sent = this.sentPollAt;
    let at = now;
    const repeat = !this.loginDue && !this.openDue;
    if (repeat) {
      const data = this.o.dataAt();
      const base = data === null ? sent : sent === null ? data : Math.max(data, sent);
      if (base !== null) at = base + EVERY_MS;
    }
    if (sent !== null) at = Math.max(at, sent + (this.outstanding === null ? MIN_GAP_MS : UNANSWERED_MS));
    return Math.max(at, this.commandAt + (repeat ? REPEAT_SETTLE_MS : SETTLE_MS));
  }

  /** What time does not decide. */
  private blocked(): string | null {
    if (this.o.passwordMode()) return 'password mode';
    if (this.o.fighting()) return 'fighting';
    return this.gate();
  }

  private check(): void {
    if (this.inFrame || this.disposed) return;
    const now = this.o.now();
    const at = this.nextAt(now);
    if (at === null) return this.clearTimer();
    if (at > now) return this.arm(at, now);
    this.clearTimer();
    if (this.blocked() !== null) return;
    // Sent: the next one's time.
    if (this.send(now)) this.check();
  }

  private send(now: number): boolean {
    const nonce = this.o.nonce?.() ?? randomNonce();
    const tall = this.rows !== null && this.rows >= PROBE_MIN_ROWS;
    const probe = tall && this.loginDue && this.character !== null && !this.probed.has(this.character) && this.o.needSex?.() === true;
    const probeNonce = probe ? (this.o.nonce?.() ?? randomNonce()) : null;
    const text = probeNonce === null ? infoCommand(nonce) : `${infoCommand(nonce)}\r\n${sexProbeCommand(probeNonce)}`;
    if (!this.o.send(text)) return false;
    this.filter.expect(nonce);
    if (probeNonce !== null) {
      this.probed.add(this.character!);
      this.filter.expect(probeNonce, 'sex');
      this.own.add(probeNonce);
      this.probes.add(probeNonce);
    }
    this.own.add(nonce);
    this.outstanding = nonce;
    this.sentPollAt = now;
    this.loginDue = this.openDue = false;
    return true;
  }

  private arm(at: number, now: number): void {
    if (this.timerAt === at) return;
    this.clearTimer();
    this.timerAt = at;
    this.timer = this.o.scheduler.set(() => {
      this.timer = this.timerAt = null;
      this.check();
    }, at - now);
  }

  private clearTimer(): void {
    if (this.timerAt === null) return;
    this.o.scheduler.clear(this.timer);
    this.timer = this.timerAt = null;
  }
}

const NONCE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(6)), (n) => NONCE_CHARS[n % NONCE_CHARS.length]).join('');
}
