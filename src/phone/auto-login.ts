// Automatic login for the session (ADR 0141): the controller.
//
// Feeds the rule (login-rule.ts) what happens on the session and carries
// out its answers. The password is in the vault (login-vault.ts); this file
// touches it in exactly two places:
//
// - `onTap`: the session hands over each line sent at the login prompts of
//   a real connection (`Session.loginTap`). A secret one is passed to the
//   vault when the rule says to keep it, and to nothing else.
// - `sendPassword`: the vault hands the stored password to one call of
//   `Session.sendCommand(…, { secret: true })`.
//
// Both sends go straight to `Session.sendCommand`: the same call a
// hand-typed password ends in (InputPane.submit), below the command line's
// history, the alias expansion and the script engine, none of which sees
// them. The session marks the password secret, so `cmd.sent` carries no
// text and the run log, the echo and the scripts get nothing.
//
// The password is sent only when, at the moment of sending, all of these
// hold: the rule is waiting for exactly this (it has sent the name and seen
// the server turn ECHO off since), the connection is the one the attempt
// began on, it is real (not a replay), the session is at the login prompts,
// and the session's own password mode is on. The check runs after the
// frame that brought the prompt has been read to its end (a microtask), so
// a server that turns ECHO back on in the same frame gets nothing.

import type { Bus } from '../core/bus';
import type { ConnState } from '../core/types';
import { LoginAsk, type AskRect } from './login-ask';
import { EXPIRE_MS, LOGIN_RULE_IDLE, type LoginAction, type LoginEvent, loginStep } from './login-rule';
import { LoginVault } from './login-vault';

/** MUME's name prompt (to be confirmed against the live game, ADR 0141). */
export const NAME_PROMPT = /By what name do you wish to be known\?/i;

/**
 * How long the name waits after MUME's name prompt, ms. Answered at once,
 * the live game shows the name prompt a second time (seen 2026-11-13; the
 * likely cause is input arriving before MUME is done with the connection's
 * telnet negotiation). A login by hand never shows it.
 */
export const NAME_WAIT_MS = 1000;

/** What the controller uses of the session (src/net/session.ts). */
export interface LoginSession {
  readonly state: ConnState;
  readonly isReplay: boolean;
  readonly passwordMode: boolean;
  sendCommand(text: string, opts?: { secret?: boolean; echo?: boolean }): void;
  loginTap: ((text: string, secret: boolean) => void) | null;
}

export interface AutoLoginDeps {
  session: LoginSession;
  bus: Bus;
  /** The reason of the player's own Reconnect (`REASON_USER_RECONNECT`). */
  userReconnect: string;
  /** Whether a connection's end is a lost link, not a session ended on purpose (`isLinkLoss`, session.ts). */
  linkLost(reason: string): boolean;
}

export interface AutoLoginHost {
  /** Where the question's card is put (the phone layer). */
  el: HTMLElement;
  /** A client notice in the game text. */
  notice(text: string): void;
  /** The card was shown: place it. */
  placed(): void;
  win: Pick<Window, 'setTimeout' | 'clearTimeout'>;
  /** The wall clock, ms (`Date.now`): a suspended page's timers stand still, the clock does not. */
  now?: () => number;
}

export class AutoLogin {
  readonly ask: LoginAsk;
  private state = LOGIN_RULE_IDLE;
  private readonly vault = new LoginVault();
  /** The connection now is a replay: nothing of it reaches the rule. */
  private replay = false;
  /** Counts the connections: a send planned on one is never made on the next. */
  private gen = 0;
  /** The controller's own send is passing the tap. */
  private own = false;
  /** The name prompt was acted on as an unfinished line: its finished line is the same prompt. */
  private promptOpen = false;
  private readonly timers: { attempt: number | null; ask: number | null } = { attempt: null, ask: null };
  /** Since when there is no connection (wall clock, ms), or null while one is up. */
  private downSince: number | null = null;
  private expireTimer: number | null = null;
  private readonly now: () => number;
  private readonly unsubs: (() => void)[] = [];

  constructor(
    private readonly deps: AutoLoginDeps,
    private readonly host: AutoLoginHost,
  ) {
    // The card first: should making it throw, nothing is attached to the session or the bus yet.
    this.now = host.now ?? (() => Date.now());
    this.ask = new LoginAsk(host.el.ownerDocument);
    host.el.append(this.ask.el);
    const { bus, session } = deps;
    session.loginTap = this.onTap;
    this.unsubs.push(
      () => {
        if (session.loginTap === this.onTap) session.loginTap = null;
      },
      bus.on('conn.state', (e) => {
        if (e.state === 'connecting') {
          // Before anything of the new connection: a stored login that ran out is not used.
          this.expire();
          this.replay = e.replay === true;
          this.gen++;
          this.promptOpen = false;
          this.feed({ type: 'connecting', replay: this.replay });
        } else if (this.replay) return;
        else if (e.state === 'login') {
          this.clock(false);
          this.feed({ type: 'login' });
        } else if (e.state === 'playing') this.feed({ type: 'playing' });
        else if (e.state === 'disconnected') {
          this.feed({ type: 'down', why: this.why(e.reason ?? '') });
          this.clock(true);
        }
      }),
      bus.on('gmcp', (m) => {
        if (this.replay || (m.key ?? m.pkg.toLowerCase()) !== 'char.name') return;
        const name = (m.data as { name?: unknown } | null | undefined)?.name;
        if (typeof name === 'string') this.feed({ type: 'charName', name });
      }),
      bus.on('telnet.echo', (e) => {
        if (!this.replay && e.serverEchoes) this.feed({ type: 'passwordPrompt' });
      }),
      // The name prompt, as an unfinished line (no GA yet) or a finished one; each prompt counts once.
      bus.on('text.partial', (l) => {
        if (this.replay || this.state.auto === null || this.promptOpen || !NAME_PROMPT.test(l.text)) return;
        this.promptOpen = true;
        this.feed({ type: 'namePrompt' });
      }),
      bus.on('text.line', (l) => {
        const open = this.promptOpen;
        this.promptOpen = false;
        if (this.replay || this.state.auto === null || open || !NAME_PROMPT.test(l.text)) return;
        this.feed({ type: 'namePrompt' });
      }),
    );
    // Mounted while a connection is already at the login prompts (the chunk came late): followed from here.
    if (session.state === 'login' && !session.isReplay) {
      this.feed({ type: 'connecting', replay: false });
      this.feed({ type: 'login' });
    } else this.replay = session.isReplay;
  }

  /** The session is armed (the shell: a dead link found on resume then reconnects, whatever the setting). */
  get armed(): boolean {
    this.expire();
    return this.state.armed !== null;
  }

  /**
   * Whether the session is still armed once the connection that ends with
   * `reason` is gone (the shell asks while the end is being told, before or
   * after this controller heard of it): armed, not in the middle of an
   * attempt, and the end is one that keeps it.
   */
  armedAfter(reason: string): boolean {
    return this.armed && this.state.auto === null && this.why(reason) !== 'ended';
  }

  /**
   * The time without a connection: started when a connection that was up
   * ends (a connection that never came up does not start it again), stopped
   * when one is up. The timer wipes while the page runs; `expire` is also
   * asked wherever the stored login would be used, since a suspended page's
   * timer does not run.
   */
  private clock(down: boolean): void {
    if (this.expireTimer !== null) this.host.win.clearTimeout(this.expireTimer);
    this.expireTimer = null;
    if (!down) {
      this.downSince = null;
      return;
    }
    if (this.downSince === null) this.downSince = this.now();
    if (this.state.armed === null) return;
    this.expireTimer = this.host.win.setTimeout(() => {
      this.expireTimer = null;
      this.expire();
    }, Math.max(0, this.downSince + EXPIRE_MS - this.now()));
  }

  /** Wipes the stored login if there has been no connection for `EXPIRE_MS`. */
  private expire(): void {
    if (this.downSince === null || this.state.armed === null || this.now() - this.downSince < EXPIRE_MS) return;
    this.feed({ type: 'expired' });
  }

  /** Nothing is held: no stored and no pending password (tests; never the password). */
  get vaultEmpty(): boolean {
    return this.vault.empty;
  }

  /** How a connection ended, for the rule. */
  private why(reason: string): 'lost' | 'reconnect' | 'ended' {
    if (reason === this.deps.userReconnect) return 'reconnect';
    return this.deps.linkLost(reason) ? 'lost' : 'ended';
  }

  /**
   * The stored login is wiped (the shell). `answers`: the answers given
   * this page load are forgotten too (a page restored from the
   * back/forward cache); without, they stay (Exit session).
   */
  forget(answers: boolean): void {
    this.feed({ type: answers ? 'restored' : 'exit' });
  }

  /** Places the question's card on the layer (the layer's own layout). */
  place(room: AskRect, lens: AskRect | null): void {
    this.ask.place(room, lens);
  }

  dispose(): void {
    this.gen++;
    for (const u of this.unsubs.splice(0)) u();
    for (const which of ['attempt', 'ask'] as const) this.timer(which, null);
    this.clock(false);
    this.vault.wipe();
    this.state = LOGIN_RULE_IDLE;
    this.ask.el.remove();
  }

  /** Each line sent at the login prompts of a real connection (`Session.loginTap`). `text` may be a password. */
  private readonly onTap = (text: string, secret: boolean): void => {
    if (this.own || this.replay) return;
    this.feed(secret ? { type: 'sent', secret: true, empty: text === '' } : { type: 'sent', text, secret: false }, secret ? text : null);
  };

  /** One event through the rule. `secret`: the secret line the event is about, for `keepPending` only. */
  private feed(ev: LoginEvent, secret: string | null = null): void {
    const step = loginStep(this.state, ev);
    this.state = step.state;
    for (const a of step.actions) this.run(a, secret);
  }

  private run(a: LoginAction, secret: string | null): void {
    switch (a.do) {
      case 'keepPending':
        if (secret !== null) this.vault.keepPending(secret);
        break;
      case 'dropPending':
        this.vault.dropPending();
        break;
      case 'arm':
        this.vault.arm();
        break;
      case 'wipe':
        this.vault.wipe();
        break;
      case 'ask':
        this.ask.show(a.name, (yes) => this.feed({ type: 'answer', yes }));
        this.host.placed();
        break;
      case 'closeAsk':
        this.ask.hide();
        break;
      case 'sendName':
        this.later(() => {
          const s = this.deps.session;
          if (this.state.auto !== 'password' || s.state !== 'login' || s.isReplay || s.passwordMode) return false;
          this.sendOwn(() => s.sendCommand(a.name));
          return true;
        }, NAME_WAIT_MS);
        break;
      case 'sendPassword':
        this.later(() => {
          const s = this.deps.session;
          if (this.state.auto !== 'play' || s.state !== 'login' || s.isReplay || !s.passwordMode) return false;
          return this.vault.use((password) => this.sendOwn(() => s.sendCommand(password, { secret: true })));
        });
        break;
      case 'notice':
        this.host.notice(a.text);
        break;
      case 'timer':
        this.timer(a.which, a.ms);
        break;
    }
  }

  /** Runs `send` after the frame being read, on the same connection only; a send that could not be made stops the attempt. */
  private later(send: () => boolean, ms = 0): void {
    const gen = this.gen;
    const run = (): void => {
      if (gen !== this.gen || this.state.auto === null) return;
      if (!send()) this.feed({ type: 'sendFailed' });
    };
    if (ms > 0) this.host.win.setTimeout(run, ms);
    else queueMicrotask(run);
  }

  private sendOwn(send: () => void): void {
    this.own = true;
    try {
      send();
    } finally {
      this.own = false;
    }
  }

  private timer(which: 'attempt' | 'ask', ms: number | null): void {
    const t = this.timers[which];
    if (t !== null) this.host.win.clearTimeout(t);
    this.timers[which] = ms === null ? null : this.host.win.setTimeout(() => {
      this.timers[which] = null;
      this.feed({ type: which === 'attempt' ? 'timeout' : 'askTimeout' });
    }, ms);
  }
}
