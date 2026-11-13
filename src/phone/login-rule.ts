// Automatic login for the session (ADR 0141): the rule, pure.
//
// The rule never holds the password. It sees that a secret was sent, never
// what it was, and answers with what to do; the password itself lives in
// the vault (login-vault.ts) and the controller (auto-login.ts) carries out
// the answers. Names are not secret and are held here.
//
// Three things are decided here:
//
// 1. CAPTURE. While a real connection is at MUME's login prompts and the
//    player logs in by hand: the name is the last non-empty plain line sent
//    before the (last) secret one, the password the last non-empty secret
//    line. When the connection reaches play, the capture counts only if
//    that name is the character MUME says it is (GMCP `Char.Name`, compared
//    without case). A new character's creation (the line before the
//    password is the "y" to "did I get that right?") and a failed login
//    (play is never reached) therefore never lead to a question.
//
// 2. THE QUESTION. Asked once per character per page load. Yes arms the
//    session, No drops the captured password at once and is remembered. A
//    question left unanswered (`ASK_MS`, or the connection ends) drops the
//    password too and is not an answer: the next login by hand asks again.
//    A character answered Yes before is armed again without a question at
//    its next login by hand (after the player's own Disconnect, or after a
//    failed attempt, both of which wipe).
//
// 3. THE ATTEMPT. With the session armed, every new real connection is
//    logged in once: the name at MUME's name prompt, the password when the
//    server turns ECHO off for it afterwards, then play as that character.
//    Anything else stops the attempt and wipes the stored login: the name
//    prompt twice, a password prompt before the name was sent or a second
//    time (MUME did not take the password), no progress within
//    `ATTEMPT_MS`, the connection ending, anything else being sent to the
//    prompts meanwhile, or another character than the armed one in play.
//    There is no second attempt and no timer that starts one.
//
// Wiped also by: the player's own Disconnect, Exit session (`exit`: also
// with the link already down), a replay starting, another character's
// `Char.Name`, and a page restored from the back/forward cache
// (`restored`, which also forgets the answers).

/** How long one attempt may take from the connection coming up to play, ms. */
export const ATTEMPT_MS = 20_000;
/** How long the question stays up unanswered, ms. */
export const ASK_MS = 60_000;

export interface LoginRuleState {
  /** The real connection: not up, at the login prompts, or in play. */
  conn: 'down' | 'login' | 'playing';
  /** By hand, this connection: the last non-empty plain line sent, while no secret has followed it. */
  lastPlain: string | null;
  /** By hand, this connection: the plain line before the last secret one (a secret was kept). */
  capName: string | null;
  /** The character MUME named on this connection (`Char.Name`). */
  charName: string | null;
  /** The question is up for this character. */
  asking: string | null;
  /** The session is armed for this character (the vault holds its password). */
  armed: string | null;
  /** The attempt on this connection: what it waits for. Null: none. */
  auto: null | 'name' | 'password' | 'play';
  /** Characters answered Yes and No this page load, in lower case. */
  yes: readonly string[];
  no: readonly string[];
}

export const LOGIN_RULE_IDLE: LoginRuleState = {
  conn: 'down',
  lastPlain: null,
  capName: null,
  charName: null,
  asking: null,
  armed: null,
  auto: null,
  yes: [],
  no: [],
};

export type LoginEvent =
  /** A connection is opening. A replay's is the only event of a replay the rule is given. */
  | { type: 'connecting'; replay: boolean }
  /** The real connection is up (MUME's login prompts). */
  | { type: 'login' }
  /** The real connection reached play. */
  | { type: 'playing' }
  /** The real connection ended. `byUser`: the player's own Disconnect or Exit session. */
  | { type: 'down'; byUser: boolean }
  /** A line was sent at the login prompts by anything but the rule's own answers. A secret one has no text here. */
  | { type: 'sent'; text: string; secret: false }
  | { type: 'sent'; secret: true; empty: boolean }
  /** GMCP `Char.Name`. */
  | { type: 'charName'; name: string }
  /** MUME's name prompt was shown. */
  | { type: 'namePrompt' }
  /** The server turned ECHO off for the player's typing (a password prompt). */
  | { type: 'passwordPrompt' }
  /** The player answered the question. */
  | { type: 'answer'; yes: boolean }
  /** The question's time is out. */
  | { type: 'askTimeout' }
  /** The attempt's time is out. */
  | { type: 'timeout' }
  /** The controller could not send what the rule answered (the prompt was no longer there). */
  | { type: 'sendFailed' }
  /** Exit session (the shell), whether or not a connection was open: the stored login goes, the answers stay. */
  | { type: 'exit' }
  /** The page came back from the back/forward cache. */
  | { type: 'restored' };

export type LoginAction =
  /** Keep the secret just sent as the pending password (the controller has it in hand). */
  | { do: 'keepPending' }
  /** Forget the pending password. */
  | { do: 'dropPending' }
  /** The pending password becomes the stored one, for `name`. */
  | { do: 'arm'; name: string }
  /** Forget everything the vault holds. */
  | { do: 'wipe' }
  | { do: 'ask'; name: string }
  | { do: 'closeAsk' }
  /** Send the name, if the session is still at a plain login prompt. */
  | { do: 'sendName'; name: string }
  /** Send the stored password, if the session is still at a password prompt. */
  | { do: 'sendPassword' }
  | { do: 'notice'; text: string }
  /** Start (`ms`) or stop (null) a timer; its end is `timeout` / `askTimeout`. */
  | { do: 'timer'; which: 'attempt' | 'ask'; ms: number | null };

export interface LoginStep {
  state: LoginRuleState;
  actions: LoginAction[];
}

const same = (a: string | null, b: string | null): boolean => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
const stay = (state: LoginRuleState): LoginStep => ({ state, actions: [] });

/** What a connection leaves behind when it opens or ends: nothing of a login by hand, no question, no attempt. */
function cleared(s: LoginRuleState): LoginStep {
  const actions: LoginAction[] = [{ do: 'dropPending' }];
  if (s.asking !== null) actions.push({ do: 'closeAsk' }, { do: 'timer', which: 'ask', ms: null });
  if (s.auto !== null) actions.push({ do: 'timer', which: 'attempt', ms: null });
  return { state: { ...s, conn: 'down', lastPlain: null, capName: null, charName: null, asking: null, auto: null }, actions };
}

/** The stored login goes, with a notice when there was one. */
function wiped(step: LoginStep, notice: string | null): LoginStep {
  const had = step.state.armed !== null;
  const actions: LoginAction[] = [...step.actions, { do: 'wipe' }];
  if (had && notice !== null) actions.push({ do: 'notice', text: notice });
  return { state: { ...step.state, armed: null }, actions };
}

/** The attempt stops: the stored login is wiped and the player is left at MUME's own prompt. */
function aborted(s: LoginRuleState, why: string): LoginStep {
  const actions: LoginAction[] = [
    { do: 'wipe' },
    { do: 'timer', which: 'attempt', ms: null },
    { do: 'notice', text: `Automatic login stopped: ${why}. The saved login is forgotten.` },
  ];
  return { state: { ...s, armed: null, auto: null }, actions };
}

/** The rule's next state and what to do for `ev`. */
export function loginStep(s: LoginRuleState, ev: LoginEvent): LoginStep {
  switch (ev.type) {
    case 'connecting': {
      const c = cleared(s);
      return ev.replay ? wiped(c, null) : c;
    }
    case 'login': {
      const c = cleared(s);
      const state: LoginRuleState = { ...c.state, conn: 'login' };
      if (state.armed === null) return { state, actions: c.actions };
      return {
        state: { ...state, auto: 'name' },
        actions: [...c.actions, { do: 'notice', text: `Logging in as ${state.armed}…` }, { do: 'timer', which: 'attempt', ms: ATTEMPT_MS }],
      };
    }
    case 'playing': {
      if (s.conn !== 'login') return stay(s);
      const state: LoginRuleState = { ...s, conn: 'playing', lastPlain: null, capName: null };
      if (s.auto !== null) {
        if (s.auto !== 'play') return aborted(state, 'the game began before the password was asked for');
        if (!same(s.charName, s.armed)) return aborted(state, 'another character was logged in');
        return {
          state: { ...state, auto: null },
          actions: [
            { do: 'timer', which: 'attempt', ms: null },
            { do: 'notice', text: `Logged in as ${s.armed}.` },
          ],
        };
      }
      // By hand. (Armed and not attempting cannot happen on a connection; wiped if it does.)
      const base: LoginStep = s.armed !== null ? wiped(stay(state), 'Automatic login is off: the saved login is forgotten.') : stay(state);
      const name = s.charName;
      if (name === null || !same(s.capName, name)) return { state: base.state, actions: [...base.actions, { do: 'dropPending' }] };
      const key = name.toLowerCase();
      if (s.no.includes(key)) return { state: base.state, actions: [...base.actions, { do: 'dropPending' }] };
      if (s.yes.includes(key)) {
        return {
          state: { ...base.state, armed: name },
          actions: [...base.actions, { do: 'arm', name }, { do: 'notice', text: `Automatic login is on for ${name}, as chosen before.` }],
        };
      }
      return {
        state: { ...base.state, asking: name },
        actions: [...base.actions, { do: 'ask', name }, { do: 'timer', which: 'ask', ms: ASK_MS }],
      };
    }
    case 'down': {
      const c = cleared(s);
      if (ev.byUser) return wiped(c, 'Automatic login is off: the saved login is forgotten.');
      if (s.auto !== null) {
        const a = aborted(c.state, 'the connection ended during the login');
        return { state: a.state, actions: [...c.actions, ...a.actions] };
      }
      return c;
    }
    case 'sent': {
      if (s.conn !== 'login') return stay(s);
      if (s.auto !== null) return aborted(s, 'something else was sent during the login');
      if (!ev.secret) {
        const text = ev.text.trim();
        return text === '' ? stay(s) : stay({ ...s, lastPlain: text });
      }
      if (ev.empty) return stay(s);
      // A secret with no name before it is nobody's password.
      if (s.lastPlain === null) return { state: { ...s, capName: null }, actions: [{ do: 'dropPending' }] };
      return { state: { ...s, capName: s.lastPlain }, actions: [{ do: 'keepPending' }] };
    }
    case 'charName': {
      if (ev.name === '') return stay(s);
      const state: LoginRuleState = { ...s, charName: ev.name };
      if (s.conn !== 'playing') return stay(state);
      // In play already: MUME names another character than the one asked about or armed.
      let step = stay(state);
      if (s.asking !== null && !same(s.asking, ev.name)) {
        step = { state: { ...state, asking: null }, actions: [{ do: 'closeAsk' }, { do: 'timer', which: 'ask', ms: null }, { do: 'dropPending' }] };
      }
      if (s.armed !== null && !same(s.armed, ev.name)) step = wiped(step, 'Automatic login is off: another character is playing.');
      return step;
    }
    case 'namePrompt': {
      if (s.conn !== 'login' || s.auto === null || s.armed === null) return stay(s);
      if (s.auto !== 'name') return aborted(s, 'MUME asked for the name again');
      return { state: { ...s, auto: 'password' }, actions: [{ do: 'sendName', name: s.armed }] };
    }
    case 'passwordPrompt': {
      if (s.conn !== 'login' || s.auto === null) return stay(s);
      if (s.auto === 'name') return aborted(s, 'a password was asked for before the name');
      if (s.auto === 'play') return aborted(s, 'MUME asked for the password again');
      return { state: { ...s, auto: 'play' }, actions: [{ do: 'sendPassword' }] };
    }
    case 'answer': {
      if (s.asking === null) return stay(s);
      const name = s.asking;
      const key = name.toLowerCase();
      const closed: LoginAction[] = [{ do: 'closeAsk' }, { do: 'timer', which: 'ask', ms: null }];
      if (!ev.yes) return { state: { ...s, asking: null, no: [...s.no, key] }, actions: [...closed, { do: 'dropPending' }] };
      return {
        state: { ...s, asking: null, armed: name, yes: [...s.yes, key] },
        actions: [...closed, { do: 'arm', name }, { do: 'notice', text: `Automatic login is on for ${name} until this page is closed or reloaded. Exit session or #disconnect turns it off.` }],
      };
    }
    case 'askTimeout':
      if (s.asking === null) return stay(s);
      return { state: { ...s, asking: null }, actions: [{ do: 'closeAsk' }, { do: 'dropPending' }] };
    case 'timeout':
      return s.auto === null ? stay(s) : aborted(s, 'MUME did not ask as expected in time');
    case 'sendFailed':
      return s.auto === null ? stay(s) : aborted(s, 'the prompt changed before it was answered');
    case 'exit':
      return wiped(cleared(s), null);
    case 'restored': {
      const c = cleared(s);
      const w = wiped(c, null);
      return { state: { ...w.state, yes: [], no: [] }, actions: w.actions };
    }
  }
}
