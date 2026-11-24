// The hidden info poll: when it is sent (stage 77 part C, ADR 0166 points
// 3, 6, 19, 22–25, 34, 35). Pure TS: the clock, the timers, the send and the state
// are injected. What hides the answer is info-filter.ts.
//
// Why a poll is sent:
// - Login: once per connection and character, for the wimpy.
// - `open()`, the card shows Status, Stats or Lore: at once when the data
//   is older than 30 s or no poll has answered yet, then every `everyMs()`
//   (a setting, 10 s by default; ADR 0166 addenda 18 and 20) while one
//   is open. The data's time counts: a read of the player's own `stat` or
//   `info` (info-typed.ts) is a poll.
// - An event while a view is open (point 99), each a switch (`events()`):
//   the mood or the position changed (GMCP `Char.Vitals`; sitting and
//   sleeping change the bonuses, addendum 20), MUME's line for wearing,
//   wielding or removing something (`isEquipmentLine`), an affect on you
//   starting or ending or a herblore started (`effect`, from the Timers
//   hub). Events within `COALESCE_MS` of the first are one poll (point
//   100); data newer than the event serves it.
//
// When: never more often than 2 s, one outstanding (2 min at most), none
// while idle (no key or pointer press in 5 min; entering the game counts),
// not fighting, not while a cast is pending (`castPendingUntil`), after
// the character's Char.Vitals, two failures stop it for the connection,
// and only when the gate is open:
//
// - the last thing MUME printed is an XML game prompt ending in `>`, with
//   nothing after it (not the pager, the line editor or a question);
// - no command was sent since that prompt. A command sent while a frame is
//   read (an action) is later than all of that frame: MUME printed the
//   frame before it could see the command;
// - no command was sent in the last 1 s. MUME answers queued commands one
//   pulse at a time, so the first one's prompt does not say that the last
//   one (`write`, say) has been read, and a prompt can have been on its way
//   when the command went. The repeat and the events wait for 1 s of quiet,
//   10 s after a burst (a command less than 2 s after the one before it
//   with no game prompt between them; points 98 and 118), as a command can
//   be held behind a cast, a stun or a door. The login poll and
//   an opened view keep the 1 s: there the player waits for the value.
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
// and a poll only when its answer fits (`answerFits`), as MUME's pager
// follows the window's height.
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
import type { EffectEvent } from '../timers/tracker';
import type { PollAnswer } from './info-answer';
import { InfoFilter, MAX_KNOWN, infoCommand, isGamePrompt, sexProbeCommand } from './info-filter';
import type { Sex } from './sex';

/** Opening a view polls when the data is older. */
export const FRESH_MS = 30_000;
/** Between the polls while a view is open, unless `everyMs` says otherwise. */
export const DEFAULT_EVERY_MS = 10_000;
/** Never more often. */
export const MIN_GAP_MS = 2000;
/** Events this close to the first of them are one poll. */
export const COALESCE_MS = 500;
/** No poll without a press in this long. */
export const IDLE_MS = 5 * 60_000;
/** An unanswered poll blocks the next for this long. */
export const UNANSWERED_MS = 2 * 60_000;
/** After the last command sent. */
export const SETTLE_MS = 1000;
/** The same for the repeat and the events, which are in no hurry. */
export const REPEAT_SETTLE_MS = 1000;
/** A command this soon after the one before it is a burst... */
export const BURST_MS = 2000;
/** ...and the repeat and the events then wait this long after it. */
export const BURST_SETTLE_MS = 10_000;

/** The events that poll, each a switch. */
export interface InfoPollEvents {
  mood: boolean;
  position: boolean;
  equipment: boolean;
  affects: boolean;
  herblore: boolean;
}

const ALL_EVENTS: InfoPollEvents = { mood: true, position: true, equipment: true, affects: true, herblore: true };

/**
 * MUME's line for putting on, wielding or taking off a thing (point 99):
 * one anchored test by the line's second word. Not `You light …`, not
 * `You put … in …`. `text` begins `You `.
 */
export function isEquipmentLine(text: string): boolean {
  const sp = text.indexOf(' ', 4);
  const re = EQUIPMENT.get(sp < 0 ? text.slice(4) : text.slice(4, sp));
  return re !== undefined && re.test(text);
}

const EQUIPMENT: ReadonlyMap<string, RegExp> = new Map([
  ['stop', /^You stop using .+\.$/],
  ['wield', /^You wield .+\.$/],
  ['awkwardly', /^You awkwardly wield .+\.$/],
  ['wear', /^You wear .+\.$/],
  ['put', /^You put (?!.* in(?:to)? ).+ (?:on|over|around) .+\.$/],
  ['fasten', /^You fasten .+ on .+\.$/],
  ['cover', /^You cover .+\.$/],
  ['hold', /^You hold .+\.$/],
]);
/** Failures that stop the polls for the connection. */
export const MAX_FAILURES = 2;
/**
 * MUME pages long output at the height the client reports (NAWS), and its
 * pager takes the next command as its input and stays open (a phone in
 * landscape, stage 77 E2, the owner's test). A phone and a tablet now
 * report at least 40 rows (`PHONE_MIN_NAWS_ROWS`), but a small desktop
 * window may be short:
 *
 * - the probe only in a window this tall (a plain `info` is about 20
 *   lines); an unknown size: no probe;
 * - a poll only when its answer, about `ANSWER_CHARS` wrapped at the
 *   width, fits with room to spare; an unknown size: allowed.
 */
export const PROBE_MIN_ROWS = 30;
/**
 * More than the fields' length: the sample is about 420 characters, the
 * vitals add about 40 (stage 77 H9).
 */
export const ANSWER_CHARS = 600;
/** Rows beside the answer: the blank lines and the prompt, and a margin. */
export const ANSWER_SPARE_ROWS = 4;
/**
 * The affects (`%f`) take a row each whatever the width, and two more
 * (`Affected by:` and the end sentinel's): rows kept for this many more
 * affects than are known to be on.
 */
export const ANSWER_AFFECT_MARGIN = 3;

/**
 * The answer of a poll fits a window of this size without MUME's pager,
 * with `affects` affects known to be on (stage 77 H9: each a row of its own).
 */
export function answerFits(size: { cols: number; rows: number } | null, affects = 0): boolean {
  if (size === null) return true;
  const list = affects + ANSWER_AFFECT_MARGIN + 2;
  return Math.ceil(ANSWER_CHARS / Math.max(1, size.cols)) + list + ANSWER_SPARE_ROWS <= size.rows;
}

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
  /** A poll has answered (a partial read alone is not enough for an opened view). None: any data is. */
  complete?(): boolean;
  /** The repeat, ms. None: `DEFAULT_EVERY_MS`. */
  everyMs?(): number;
  /** The events that poll. None: all. */
  events?(): InfoPollEvents;
  /** Until when a cast sent is pending, or null. None: never. */
  castPendingUntil?(): number | null;
  /**
   * The answer, with what `mark` gave when the poll was sent (null: no
   * `mark`): a `Char.Vitals` after it wins over the polled vitals.
   */
  apply(answer: PollAnswer, mark: number | null): void;
  /** Taken when a poll is sent and handed to `apply` with its answer. None: null. */
  mark?(): number;
  /** The affects known to be on (the last answer's, or the trackers'): rows the answer takes. None: 0. */
  affectCount?(): number;
  /** The character is named and its sex is not known: the login poll brings the probe. None: never. */
  needSex?(): boolean;
  /** The probe's answer. */
  applySex?(sex: Sex): void;
  /** The probe failed: not to be sent again for this character. */
  sexFailed?(): void;
  /** The window size MUME is told (NAWS), or null before any. None: unknown. */
  windowSize?(): { cols: number; rows: number } | null;
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
  /** Open views (Status, Stats or Lore). */
  private views = 0;
  /** The first event not yet served by a poll or newer data. */
  private eventAt: number | null = null;
  /** The mood and the position last seen in Char.Vitals. */
  private mood: string | null = null;
  private position: string | null = null;
  /** A view was opened on old data. */
  private openDue = false;
  private sentPollAt: number | null = null;
  /** The poll that waits for its answer. */
  private outstanding: string | null = null;
  /** The polls of this character: only their answers are applied. */
  private own = new Set<string>();
  /** Each poll's `mark` when it was sent. */
  private marks = new Map<string, number>();
  private failureCount = 0;
  /** The characters probed for their sex on this connection. */
  private probed = new Set<string>();
  /** The probes sent and not answered. */
  private probes = new Set<string>();
  private pressedAt = Number.NEGATIVE_INFINITY;

  /** A socket frame is being read. */
  private inFrame = false;
  /** The last completed line when the last command was sent. */
  private lineAtSend: Line | null = null;
  private sentInFrame = false;
  private commandAt = Number.NEGATIVE_INFINITY;
  /**
   * The last command was a burst: sent less than `BURST_MS` after the one
   * before it, with no game prompt between them (MUME had not answered the
   * first: it may hold it behind a delay). Addendum 21.
   */
  private burst = false;
  /** A game prompt came after the last command (not in the frame it was sent in). */
  private promptSinceCommand = true;

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
        const now = o.now();
        this.burst = now - this.commandAt < BURST_MS && !this.promptSinceCommand;
        this.promptSinceCommand = false;
        this.commandAt = now;
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
      bus.on('gmcp', (m) => {
        const key = gmcpKey(m);
        if (key === 'char.vitals') {
          this.vitals = true;
          const data = m.data as { mood?: unknown; position?: unknown } | null | undefined;
          const mood = data?.mood;
          if (typeof mood === 'string') {
            const was = this.mood;
            this.mood = mood;
            if (was !== null && was !== mood && this.events().mood) this.event();
          }
          const position = data?.position;
          if (typeof position === 'string') {
            const was = this.position;
            this.position = position;
            if (was !== null && was !== position && this.events().position) this.event();
          }
        } else if (key === 'char.name') this.named((m.data as { name?: unknown } | null | undefined)?.name);
      }),
      bus.on('text.line', (l) => {
        if (l.text.startsWith('You ') && isEquipmentLine(l.text) && this.events().equipment) this.event();
      }),
    );
  }

  /** The assembler's lines. */
  readonly line = (l: Line): void => {
    // MUME answered what was sent before this frame (a command sent while
    // the frame is read is later than all of it).
    if (!this.sentInFrame && isGamePrompt(l)) this.promptSinceCommand = true;
    this.filter.line(l);
  };
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

  /** An affect on you started or ended, or a herblore was started (the Timers hub). */
  effect(e: EffectEvent): void {
    const on = this.events();
    if (e === 'affect-up' || e === 'affect-down' ? on.affects : e === 'herb-up' && on.herblore) this.event();
  }

  /** A view (Status, Stats or Lore) is open. Call the returned function when it closes. */
  open(): () => void {
    this.views++;
    const at = this.o.dataAt();
    if (at === null || this.o.now() - at > FRESH_MS || this.o.complete?.() === false) this.openDue = true;
    this.check();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.views === 0) {
        this.openDue = false;
        this.eventAt = null;
      }
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
    if (this.o.now() < this.commandAt + SETTLE_MS) return 'a command was sent less than 1 s ago';
    return null;
  }

  /** A poll asked for now, whatever is due. Returns why none was sent, or null. */
  request(): string | null {
    const now = this.o.now();
    if (!this.o.live()) return 'not in the game';
    if (!this.o.enabled()) return 'the setting is off';
    if (this.failureCount >= MAX_FAILURES) return 'two answers failed on this connection';
    if (!this.vitals) return 'no Char.Vitals yet';
    if (this.sentPollAt !== null && now < this.sentPollAt + MIN_GAP_MS) return 'the last poll was less than 2 s ago';
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
    this.sentPollAt = this.outstanding = this.lineAtSend = this.eventAt = this.mood = this.position = null;
    this.own.clear();
    this.marks.clear();
    this.probed.clear();
    this.probes.clear();
    this.failureCount = 0;
    this.commandAt = Number.NEGATIVE_INFINITY;
    this.burst = false;
    this.promptSinceCommand = true;
  }

  private events(): InfoPollEvents {
    return this.o.events?.() ?? ALL_EVENTS;
  }

  /** An event: a poll once the cluster is over (point 100). */
  private event(): void {
    if (!this.o.live()) return;
    if (this.eventAt === null) this.eventAt = this.o.now();
    this.check();
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
      this.outstanding = this.eventAt = this.mood = this.position = null;
      this.own.clear();
      if (this.o.live()) this.enterGame();
    }
    this.character = n;
  }

  private found(nonce: string, answer: PollAnswer): void {
    if (this.outstanding === nonce) this.outstanding = null;
    const mark = this.marks.get(nonce) ?? null;
    this.marks.delete(nonce);
    if (!this.own.delete(nonce)) return;
    this.loginDue = this.openDue = false;
    this.o.apply(answer, mark);
  }

  private failed(nonce: string): void {
    if (this.outstanding === nonce) this.outstanding = null;
    this.marks.delete(nonce);
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
    const data = this.o.dataAt();
    // Newer data (an answer, or a read of what the player saw) serves an event.
    if (this.eventAt !== null && data !== null && data > this.eventAt) this.eventAt = null;
    let at = now;
    const repeat = !this.loginDue && !this.openDue;
    if (repeat) {
      const base = data === null ? sent : sent === null ? data : Math.max(data, sent);
      if (base !== null) at = base + (this.o.everyMs?.() ?? DEFAULT_EVERY_MS);
      if (this.eventAt !== null) at = Math.min(at, this.eventAt + COALESCE_MS);
    }
    if (sent !== null) at = Math.max(at, sent + (this.outstanding === null ? MIN_GAP_MS : UNANSWERED_MS));
    const cast = this.o.castPendingUntil?.() ?? null;
    if (cast !== null) at = Math.max(at, cast);
    return Math.max(at, this.commandAt + (repeat ? this.quiet() : SETTLE_MS));
  }

  /** The repeat's and the events' quiet after the last command (point 98). */
  private quiet(): number {
    return this.burst ? BURST_SETTLE_MS : REPEAT_SETTLE_MS;
  }

  /** What time does not decide. */
  private blocked(): string | null {
    if (this.o.passwordMode()) return 'password mode';
    if (this.o.fighting()) return 'fighting';
    if (!answerFits(this.o.windowSize?.() ?? null, this.o.affectCount?.() ?? 0)) return "the answer would not fit the window: MUME's pager";
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
    const rows = this.o.windowSize?.()?.rows ?? null;
    const tall = rows !== null && rows >= PROBE_MIN_ROWS;
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
    const mark = this.o.mark?.();
    if (mark !== undefined) {
      this.marks.set(nonce, mark);
      // As many as the filter still knows (`MAX_KNOWN`): the oldest go.
      if (this.marks.size > MAX_KNOWN) this.marks.delete(this.marks.keys().next().value!);
    }
    this.outstanding = nonce;
    this.sentPollAt = now;
    this.loginDue = this.openDue = false;
    // What happened before it is in its answer: MUME answers in order.
    this.eventAt = null;
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
