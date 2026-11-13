// Round 54c (ADR 0141): automatic login for the session. The rule (pure)
// and the vault. The rule never sees a password: it is told that a secret
// was sent and answers with what to do.
import { describe, expect, it } from 'vitest';
import { ASK_MS, ATTEMPT_MS, LOGIN_RULE_IDLE, type LoginAction, type LoginEvent, type LoginRuleState, loginStep } from '../../src/phone/login-rule';
import { LoginVault } from '../../src/phone/login-vault';

const plain = (text: string): LoginEvent => ({ type: 'sent', text, secret: false });
const secret: LoginEvent = { type: 'sent', secret: true, empty: false };
const connecting: LoginEvent = { type: 'connecting', replay: false };
const login: LoginEvent = { type: 'login' };
const playing: LoginEvent = { type: 'playing' };
const char = (name: string): LoginEvent => ({ type: 'charName', name });
const down = (why: 'lost' | 'reconnect' | 'ended' = 'lost'): LoginEvent => ({ type: 'down', why });

function run(events: LoginEvent[], from: LoginRuleState = LOGIN_RULE_IDLE): { state: LoginRuleState; actions: LoginAction[]; does: string[] } {
  let state = from;
  const actions: LoginAction[] = [];
  for (const ev of events) {
    const step = loginStep(state, ev);
    state = step.state;
    actions.push(...step.actions);
  }
  return { state, actions, does: actions.map((a) => a.do) };
}

/** A login typed by hand that reaches play as `name`. */
const byHand = (name = 'Rasta', typed = name.toLowerCase()): LoginEvent[] => [connecting, login, plain(typed), secret, char(name), playing];
/** An armed session for Rasta, in play. */
const armed = (): LoginRuleState => run([...byHand(), { type: 'answer', yes: true }]).state;
const count = (does: string[], what: string): number => does.filter((d) => d === what).length;
const notices = (actions: LoginAction[]): string[] => actions.flatMap((a) => (a.do === 'notice' ? [a.text] : []));

describe('the capture and the question', () => {
  it('asks when a login typed by hand reaches play as the name that was typed', () => {
    const r = run(byHand());
    expect(r.does).toContain('keepPending');
    expect(r.actions).toContainEqual({ do: 'ask', name: 'Rasta' });
    expect(r.actions).toContainEqual({ do: 'timer', which: 'ask', ms: ASK_MS });
    expect(r.state.asking).toBe('Rasta');
    expect(r.state.armed).toBeNull();
  });

  it('does not ask before play, and never without a password having been sent', () => {
    expect(run([connecting, login, plain('rasta'), secret]).does).not.toContain('ask');
    const r = run([connecting, login, plain('rasta'), char('Rasta'), playing]);
    expect(r.does).not.toContain('ask');
    expect(r.does).not.toContain('keepPending');
  });

  it('a new character (the line before the password is not the name) is never asked about', () => {
    const r = run([connecting, login, plain('Newbie'), plain('y'), secret, secret, plain('m'), char('Newbie'), playing]);
    expect(r.does).not.toContain('ask');
    expect(r.does.at(-1)).toBe('dropPending');
    expect(r.state.asking).toBeNull();
  });

  it('a failed login (play never reached) drops the pending password when the connection ends', () => {
    const r = run([connecting, login, plain('rasta'), secret, down()]);
    expect(r.does).not.toContain('ask');
    expect(r.does).toContain('dropPending');
  });

  it('a wrong password and then the right one: the last secret is the one kept, the name stays', () => {
    const r = run([connecting, login, plain('rasta'), secret, secret, char('Rasta'), playing]);
    expect(count(r.does, 'keepPending')).toBe(2);
    expect(r.state.asking).toBe('Rasta');
  });

  it('a mistyped name and then the right one', () => {
    const r = run([connecting, login, plain('rsta'), plain('n'), plain('rasta'), secret, char('Rasta'), playing]);
    expect(r.state.asking).toBe('Rasta');
  });

  it('an empty secret is not a password, and a secret with no name before it is dropped', () => {
    expect(run([connecting, login, plain('rasta'), { type: 'sent', secret: true, empty: true }, char('Rasta'), playing]).does).not.toContain('ask');
    const r = run([connecting, login, secret, char('Rasta'), playing]);
    expect(r.does).not.toContain('keepPending');
    expect(r.does).not.toContain('ask');
  });

  it('holds nothing of what is typed but one name-shaped line, and nothing once the login prompts are left', () => {
    // Not the shape of a name: never held.
    for (const typed of ['correct-horse-9', 'p4ssword', 'two words', 'x', 'a'.repeat(21), 'né']) {
      expect(run([connecting, login, plain(typed)]).state.lastPlain).toBeNull();
    }
    // A line that is not a name forgets the candidate before it.
    expect(run([connecting, login, plain('rasta'), plain('1')]).state.lastPlain).toBeNull();
    // After a secret was kept, plain lines are not looked at.
    const kept = run([connecting, login, plain('rasta'), secret, plain('hunter')]).state;
    expect(kept.lastPlain).toBeNull();
    expect(kept.capName).toBe('rasta');
    // A password of a name's shape typed before ECHO was off is held as a candidate only until the prompts are left.
    const early = run([connecting, login, plain('rasta'), plain('hunter')]).state;
    expect(early.lastPlain).toBe('hunter');
    for (const leave of [[char('Rasta'), playing], [down('lost')], [down('ended')], [connecting], [{ type: 'exit' }], [{ type: 'restored' }]] as LoginEvent[][]) {
      const st = run(leave, early).state;
      expect(st.lastPlain).toBeNull();
      expect(st.capName).toBeNull();
      expect(JSON.stringify(st)).not.toContain('hunter');
    }
    // And it is never the name asked about or sent: only MUME's own spelling of the character is.
    const r = run([connecting, login, plain('rasta'), plain('hunter'), secret, char('Rasta'), playing]);
    expect(r.does).not.toContain('ask');
    expect(JSON.stringify(r.actions)).not.toContain('hunter');
  });

  it('what is sent outside the login prompts is never looked at', () => {
    const r = run([plain('rasta'), secret, connecting, plain('rasta'), secret]);
    expect(r.does).not.toContain('keepPending');
    const p = run([...byHand(), { type: 'answer', yes: false }, plain('say hi'), secret]);
    expect(count(p.does, 'keepPending')).toBe(1);
  });

  it('Yes arms; No drops the password at once and is not asked again this page load', () => {
    const yes = run([...byHand(), { type: 'answer', yes: true }]);
    expect(yes.actions).toContainEqual({ do: 'arm', name: 'Rasta' });
    expect(yes.does).toContain('closeAsk');
    expect(yes.state.armed).toBe('Rasta');

    const no = run([...byHand(), { type: 'answer', yes: false }]);
    expect(no.does.slice(-1)).toEqual(['dropPending']);
    expect(no.does).not.toContain('arm');
    expect(no.state.armed).toBeNull();
    const again = run([down(), ...byHand()], no.state);
    expect(again.does).not.toContain('ask');
    expect(again.does).not.toContain('arm');
    expect(again.does.at(-1)).toBe('dropPending');
    // Another character is asked about.
    expect(run([down(), ...byHand('Gibur')], no.state).state.asking).toBe('Gibur');
  });

  it('unanswered: the password is dropped and the next login by hand asks again', () => {
    const t = run([...byHand(), { type: 'askTimeout' }]);
    expect(t.does.slice(-2)).toEqual(['closeAsk', 'dropPending']);
    expect(t.state.asking).toBeNull();
    expect(run([down(), ...byHand()], t.state).state.asking).toBe('Rasta');
    // The connection ends under the question: the same.
    const d = run([...byHand(), down('lost')]);
    expect(d.does).toContain('closeAsk');
    expect(d.state.asking).toBeNull();
    expect(d.state.armed).toBeNull();
  });

  it('an answer with no question up does nothing', () => {
    expect(run([{ type: 'answer', yes: true }]).actions).toEqual([]);
    expect(run([...byHand(), { type: 'askTimeout' }, { type: 'answer', yes: true }]).state.armed).toBeNull();
  });

  it('answered Yes before, wiped by Disconnect: the next login by hand arms again without a question', () => {
    const r = run([down('ended'), ...byHand()], armed());
    expect(r.does).toContain('wipe');
    expect(r.does).not.toContain('ask');
    expect(r.actions).toContainEqual({ do: 'arm', name: 'Rasta' });
    expect(r.state.armed).toBe('Rasta');
  });
});

describe('the attempt', () => {
  const attempt: LoginEvent[] = [down(), connecting, login];

  it('name at the name prompt, password at the password prompt, then play: one of each', () => {
    const r = run([...attempt, { type: 'namePrompt' }, { type: 'passwordPrompt' }, char('Rasta'), playing], armed());
    expect(r.actions.filter((a) => a.do === 'sendName')).toEqual([{ do: 'sendName', name: 'Rasta' }]);
    expect(count(r.does, 'sendPassword')).toBe(1);
    expect(r.does).not.toContain('wipe');
    expect(r.does).not.toContain('ask');
    expect(r.actions).toContainEqual({ do: 'timer', which: 'attempt', ms: ATTEMPT_MS });
    expect(notices(r.actions)).toEqual(['Logging in as Rasta…', 'Logged in as Rasta.']);
    expect(r.state.armed).toBe('Rasta');
    expect(r.state.auto).toBeNull();
  });

  it('stays armed over any number of drops and logs in once per connection', () => {
    const once: LoginEvent[] = [...attempt, { type: 'namePrompt' }, { type: 'passwordPrompt' }, char('Rasta'), playing];
    const r = run([...once, ...once, ...once], armed());
    expect(count(r.does, 'sendPassword')).toBe(3);
    expect(r.state.armed).toBe('Rasta');
  });

  it('never sends the password before the name was sent', () => {
    const r = run([...attempt, { type: 'passwordPrompt' }], armed());
    expect(r.does).not.toContain('sendPassword');
    expect(r.does).toContain('wipe');
    expect(r.state.armed).toBeNull();
  });

  it('never sends the password twice: a second password prompt means MUME did not take it', () => {
    const r = run([...attempt, { type: 'namePrompt' }, { type: 'passwordPrompt' }, { type: 'passwordPrompt' }], armed());
    expect(count(r.does, 'sendPassword')).toBe(1);
    expect(r.does).toContain('wipe');
    expect(r.state.armed).toBeNull();
    expect(r.state.auto).toBeNull();
    // And nothing more on this connection, whatever is shown.
    const after = run([{ type: 'namePrompt' }, { type: 'passwordPrompt' }], r.state);
    expect(after.actions).toEqual([]);
  });

  it('never sends the name twice: a second name prompt before the password prompt is not answered, and the login goes on', () => {
    const r = run([...attempt, { type: 'namePrompt' }, { type: 'namePrompt' }, { type: 'namePrompt' }, { type: 'passwordPrompt' }, char('Rasta'), playing], armed());
    expect(count(r.does, 'sendName')).toBe(1);
    expect(count(r.does, 'sendPassword')).toBe(1);
    expect(r.does).not.toContain('wipe');
    expect(r.state.armed).toBe('Rasta');
  });

  it('a name prompt that only repeats runs into the time limit', () => {
    const r = run([...attempt, { type: 'namePrompt' }, { type: 'namePrompt' }, { type: 'timeout' }], armed());
    expect(count(r.does, 'sendName')).toBe(1);
    expect(r.does).not.toContain('sendPassword');
    expect(r.does).toContain('wipe');
  });

  it('the name prompt after the password was sent stops it', () => {
    const r = run([...attempt, { type: 'namePrompt' }, { type: 'passwordPrompt' }, { type: 'namePrompt' }], armed());
    expect(count(r.does, 'sendPassword')).toBe(1);
    expect(r.does).toContain('wipe');
  });

  it('never sends a password outside the login prompts, whatever state the rule is in', () => {
    const a = armed();
    // In play, down, connecting: a password prompt (ECHO off) or a name prompt sends nothing.
    for (const before of [[], [down()], [down(), connecting]] as LoginEvent[][]) {
      const r = run([...before, { type: 'passwordPrompt' }, { type: 'namePrompt' }], a);
      expect(r.does).not.toContain('sendPassword');
      expect(r.does).not.toContain('sendName');
    }
    // Not armed: nothing is ever sent.
    const r = run([connecting, login, { type: 'namePrompt' }, { type: 'passwordPrompt' }]);
    expect(r.does.every((d) => d === 'dropPending')).toBe(true);
  });

  it.each([
    ['the time is out before the name prompt', [{ type: 'timeout' }]],
    ['the time is out waiting for the password prompt', [{ type: 'namePrompt' }, { type: 'timeout' }]],
    ['the time is out waiting for play', [{ type: 'namePrompt' }, { type: 'passwordPrompt' }, { type: 'timeout' }]],
    ['the link is lost during the login', [{ type: 'namePrompt' }, down('lost')]],
    ['the server closes during the login', [{ type: 'namePrompt' }, { type: 'passwordPrompt' }, down('ended')]],
    ['the player reconnects during the login', [{ type: 'namePrompt' }, { type: 'passwordPrompt' }, down('reconnect')]],
    ['a line is sent before the name prompt', [plain('look')]],
    ['a line is sent before the password was sent', [{ type: 'namePrompt' }, plain('look')]],
    ['a secret is typed by hand before the password was sent', [{ type: 'namePrompt' }, secret]],
    ['the send could not be made', [{ type: 'namePrompt' }, { type: 'sendFailed' }]],
    ['another character is in play', [{ type: 'namePrompt' }, { type: 'passwordPrompt' }, char('Gibur'), playing]],
    ['play begins before the password was asked for', [{ type: 'namePrompt' }, char('Rasta'), playing]],
  ] as [string, LoginEvent[]][])('stops and wipes when %s', (_what, events) => {
    const r = run([...attempt, ...events], armed());
    expect(r.does).toContain('wipe');
    expect(r.state.armed).toBeNull();
    expect(r.state.auto).toBeNull();
    expect(r.does).not.toContain('keepPending');
    expect(notices(r.actions).some((n) => n.startsWith('Automatic login stopped: ') && n.endsWith('The saved login is forgotten.'))).toBe(true);
    // No second attempt: the next connection is MUME's own prompt.
    const next = run([down(), connecting, login, { type: 'namePrompt' }, { type: 'passwordPrompt' }], r.state);
    expect(next.does).not.toContain('sendName');
    expect(next.does).not.toContain('sendPassword');
  });

  it('an empty line never stops it, before or after the password', () => {
    const empty: LoginEvent[] = [plain(''), plain('   '), { type: 'sent', secret: true, empty: true }];
    const r = run([...attempt, ...empty, { type: 'namePrompt' }, ...empty, { type: 'passwordPrompt' }, ...empty, char('Rasta'), playing], armed());
    expect(r.does).not.toContain('wipe');
    expect(count(r.does, 'sendPassword')).toBe(1);
    expect(r.state.armed).toBe('Rasta');
    expect(notices(r.actions).at(-1)).toBe('Logged in as Rasta.');
  });

  it("after the password was sent the player's own lines are their answers to MUME: nothing stops, nothing is kept", () => {
    const r = run([...attempt, { type: 'namePrompt' }, { type: 'passwordPrompt' }, plain('y'), plain('look'), secret, char('Rasta'), playing], armed());
    expect(r.does).not.toContain('wipe');
    expect(r.does).not.toContain('keepPending');
    expect(count(r.does, 'sendPassword')).toBe(1);
    expect(r.state.armed).toBe('Rasta');
    expect(r.state.lastPlain).toBeNull();
    expect(r.state.capName).toBeNull();
    // The stops of that phase still stop it.
    const again = run([...attempt, { type: 'namePrompt' }, { type: 'passwordPrompt' }, plain('y'), { type: 'passwordPrompt' }], armed());
    expect(again.does).toContain('wipe');
    const name = run([...attempt, { type: 'namePrompt' }, { type: 'passwordPrompt' }, plain('y'), { type: 'namePrompt' }], armed());
    expect(name.does).toContain('wipe');
  });

  it('a timeout with no attempt on does nothing', () => {
    expect(run([{ type: 'timeout' }, { type: 'sendFailed' }], armed()).actions).toEqual([]);
  });
});

describe('the wipes', () => {
  it('a session that ends on purpose wipes: Disconnect, Core.Goodbye, a close the server made (quit, rent, idle)', () => {
    const r = run([down('ended')], armed());
    expect(r.does).toContain('wipe');
    expect(r.state.armed).toBeNull();
    expect(notices(r.actions)).toEqual(['Automatic login is off: the session ended. The saved login is forgotten.']);
    const next = run([connecting, login, { type: 'namePrompt' }, { type: 'passwordPrompt' }], r.state);
    expect(next.does).not.toContain('sendName');
    expect(next.does).not.toContain('sendPassword');
  });

  it("a lost link and the player's own Reconnect keep the session armed", () => {
    for (const why of ['lost', 'reconnect'] as const) {
      const r = run([down(why)], armed());
      expect(r.does).not.toContain('wipe');
      expect(r.state.armed).toBe('Rasta');
    }
  });

  it('a connection that never came up ends nothing, whatever its reason', () => {
    const r = run([down('lost'), connecting, down('ended'), connecting, down('ended')], armed());
    expect(r.does).not.toContain('wipe');
    expect(r.state.armed).toBe('Rasta');
  });

  it('a replay wipes, and nothing of it is used', () => {
    const r = run([down(), { type: 'connecting', replay: true }], armed());
    expect(r.does).toContain('wipe');
    expect(r.state.armed).toBeNull();
  });

  it('another character named in play wipes, and closes a question about someone else', () => {
    const r = run([char('Gibur')], armed());
    expect(r.does).toContain('wipe');
    expect(r.state.armed).toBeNull();
    const q = run([...byHand(), char('Gibur')]);
    expect(q.does.slice(-3)).toEqual(['closeAsk', 'timer', 'dropPending']);
    expect(q.state.asking).toBeNull();
    // The same character named again changes nothing.
    expect(run([char('rasta')], armed()).state.armed).toBe('Rasta');
  });

  it('Exit session wipes with the link up or down, and keeps the answers', () => {
    for (const before of [[], [down()]] as LoginEvent[][]) {
      const r = run([...before, { type: 'exit' }], armed());
      expect(r.does).toContain('wipe');
      expect(r.state.armed).toBeNull();
      expect(r.state.yes).toEqual(['rasta']);
      expect(run([connecting, login, { type: 'namePrompt' }], r.state).does).not.toContain('sendName');
    }
    const no = run([...byHand(), { type: 'answer', yes: false }, { type: 'exit' }]);
    expect(no.state.no).toEqual(['rasta']);
  });

  it('a page restored from the back/forward cache forgets everything, the answers too', () => {
    const r = run([{ type: 'restored' }], armed());
    expect(r.does).toContain('wipe');
    expect(r.state).toEqual(LOGIN_RULE_IDLE);
    const no = run([...byHand(), { type: 'answer', yes: false }, { type: 'restored' }]);
    expect(no.state).toEqual(LOGIN_RULE_IDLE);
  });
});

describe('the vault', () => {
  it('hands the stored password to one call and nothing else shows it', () => {
    const v = new LoginVault();
    v.keepPending('hunter2');
    expect(v.armed).toBe(false);
    const got: string[] = [];
    expect(v.use((p) => got.push(p))).toBe(false);
    expect(v.arm()).toBe(true);
    expect(v.armed).toBe(true);
    expect(v.use((p) => got.push(p))).toBe(true);
    expect(got).toEqual(['hunter2']);
    expect(JSON.stringify(v)).toBe('{}');
    expect(JSON.stringify({ ...v })).toBe('{}');
    expect(Object.keys(v)).toEqual([]);
    expect(String(v)).not.toContain('hunter2');
  });

  it('wipe forgets both slots; arm with nothing pending stores nothing', () => {
    const v = new LoginVault();
    expect(v.arm()).toBe(false);
    v.keepPending('a');
    v.arm();
    v.keepPending('b');
    v.wipe();
    expect(v.armed).toBe(false);
    expect(v.arm()).toBe(false);
    expect(v.use(() => {})).toBe(false);
  });

  it('dropPending leaves the stored one; an empty password is not kept', () => {
    const v = new LoginVault();
    v.keepPending('a');
    v.arm();
    v.keepPending('b');
    v.dropPending();
    const got: string[] = [];
    v.use((p) => got.push(p));
    expect(got).toEqual(['a']);
    v.keepPending('');
    expect(v.arm()).toBe(false);
  });
});
