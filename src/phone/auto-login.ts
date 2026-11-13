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
import { LOGIN_RULE_IDLE, type LoginAction, type LoginEvent, loginStep } from './login-rule';
import { LoginVault } from './login-vault';

/** MUME's name prompt (to be confirmed against the live game, ADR 0141). */
export const NAME_PROMPT = /By what name do you wish to be known\?/i;

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
  /** The reason of the player's own Disconnect and Exit session (`REASON_USER_DISCONNECT`). */
  userDisconnect: string;
}

export interface AutoLoginHost {
  /** Where the question's card is put (the phone layer). */
  el: HTMLElement;
  /** A client notice in the game text. */
  notice(text: string): void;
  /** The card was shown: place it. */
  placed(): void;
  win: Pick<Window, 'setTimeout' | 'clearTimeout'>;
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
  private readonly unsubs: (() => void)[] = [];

  constructor(
    private readonly deps: AutoLoginDeps,
    private readonly host: AutoLoginHost,
  ) {
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
          this.replay = e.replay === true;
          this.gen++;
          this.promptOpen = false;
          this.feed({ type: 'connecting', replay: this.replay });
        } else if (this.replay) return;
        else if (e.state === 'login') this.feed({ type: 'login' });
        else if (e.state === 'playing') this.feed({ type: 'playing' });
        else if (e.state === 'disconnected') this.feed({ type: 'down', byUser: e.reason === deps.userDisconnect });
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
  }

  /** The session is armed (the shell: a dead link found on resume then reconnects, whatever the setting). */
  get armed(): boolean {
    return this.state.armed !== null;
  }

  /** The page came back from the back/forward cache: everything is forgotten (the shell's resume watch). */
  forget(): void {
    this.feed({ type: 'restored' });
  }

  /** Places the question's card on the layer (the layer's own layout). */
  place(room: AskRect, lens: AskRect | null): void {
    this.ask.place(room, lens);
  }

  dispose(): void {
    for (const u of this.unsubs.splice(0)) u();
    for (const which of ['attempt', 'ask'] as const) this.timer(which, null);
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
        });
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
  private later(send: () => boolean): void {
    const gen = this.gen;
    queueMicrotask(() => {
      if (gen !== this.gen || this.state.auto === null) return;
      if (!send()) this.feed({ type: 'sendFailed' });
    });
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
