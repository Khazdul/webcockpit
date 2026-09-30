// @vitest-environment happy-dom
// The script engine wired into the App: typed lines, macro keys, #showme in
// the output pane, the profile at start-up and session start, Apply, and
// the runtime variable write-back.
import { describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { ProfileStore } from '../../src/profiles';
import { FakeScheduler } from '../../src/script/engine';
import { SettingsStore } from '../../src/settings';
import { FakeSocket, concat, utf8 } from './net-helpers';

const WILL = 251;
const ECHO = 1;
const IAC = 255;
const SB = 250;
const SE = 240;

async function setup(profileText?: string, profileName = 'pvp') {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sockets: FakeSocket[] = [];
  const frames: Array<() => void> = [];
  const profiles = new ProfileStore({ factory: null });
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  if (profileText !== undefined) {
    await profiles.create(profileName, profileText);
    settings.update({ profile: profileName });
  }
  const clock = new FakeScheduler();
  const app = new App({
    root,
    settings,
    profiles,
    scheduler: clock,
    writeBackDelayMs: 50,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    recorder: { openStore: () => Promise.reject(new Error('no store')), win: null },
    requestFrame: (cb) => frames.push(cb),
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  await settle();
  const outputText = () => {
    while (frames.length) frames.shift()!();
    return Array.from(app.output.el.querySelectorAll('.wc-rows .wc-row')).map((r) => r.textContent ?? '');
  };
  const connect = async () => {
    app.connectLive();
    const sock = sockets.at(-1)!;
    sock.open();
    await settle();
    return sock;
  };
  /** Command lines sent, telnet negotiation removed. */
  const sentLines = (s: FakeSocket) => {
    const bytes = s.sentBytes();
    const text: number[] = [];
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] !== IAC) {
        text.push(bytes[i]!);
        continue;
      }
      if (bytes[i + 1] === SB) {
        while (i < bytes.length && !(bytes[i] === IAC && bytes[i + 1] === SE)) i++;
        i++;
      } else i += 2;
    }
    return new TextDecoder().decode(Uint8Array.from(text)).split('\r\n').filter((l) => l !== '');
  };
  return { app, root, sockets, profiles, settings, clock, settle, outputText, connect, sentLines };
}

function enter(app: App, text: string) {
  app.input.input.value = text;
  app.input.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
}

function key(app: App, init: KeyboardEventInit): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  // happy-dom reports AltGraph whenever Alt is down; a browser does not.
  Object.defineProperty(ev, 'getModifierState', { value: (k: string) => k === 'Alt' && !!init.altKey });
  app.input.input.dispatchEvent(ev);
  return ev;
}

describe('App + script engine', () => {
  it('runs typed lines through aliases and sends each command', async () => {
    const t = await setup('#alias {bb} {_send bash $target}\n#variable {target} {orc}\n');
    const sock = await t.connect();
    enter(t.app, 'bb;look');
    expect(t.sentLines(sock).slice(-2)).toEqual(['bash orc', 'look']);
    // Sent commands are echoed; the typed alias is in the history.
    const out = t.outputText();
    expect(out).toContain('bash orc');
    expect(t.app.input.getHistory()).toEqual(['bb;look']);
  });

  it('an empty Enter sends a bare newline and emits cmd.sent with empty text (timers input tap)', async () => {
    const t = await setup();
    const sock = await t.connect();
    const sent: Array<{ text: string; replay?: true }> = [];
    t.app.bus.on('cmd.sent', (c) => sent.push(c));
    const before = sock.sentBytes().length;
    enter(t.app, '');
    expect(sent).toEqual([expect.objectContaining({ text: '' })]);
    expect(sent[0]!.replay).toBeUndefined();
    expect(Array.from(sock.sentBytes().slice(before))).toEqual([13, 10]);
  });

  it('runs macros from keydown, and a bound macro wins over input keys', async () => {
    const t = await setup('#macro {Numpad8} {north}\n#macro {Alt+B} {_send bash}\n');
    const sock = await t.connect();
    const ev = key(t.app, { key: '8', code: 'Numpad8' });
    expect(ev.defaultPrevented).toBe(true);
    t.app.input.input.value = 'abc def';
    t.app.input.input.setSelectionRange(7, 7);
    key(t.app, { key: 'b', code: 'KeyB', altKey: true });
    expect(t.app.input.input.selectionStart).toBe(7);
    expect(t.sentLines(sock).slice(-2)).toEqual(['north', 'bash']);
    // Unbound keys keep their normal meaning.
    const free = key(t.app, { key: 'F9', code: 'F9' });
    expect(free.defaultPrevented).toBe(false);
  });

  it('skips macros in password mode and with AltGr', async () => {
    const t = await setup('#macro {Ctrl+Alt+Q} {_send altgr}\n#macro {F5} {_send f5}\n');
    const sock = await t.connect();
    const altgr = new KeyboardEvent('keydown', { key: '@', code: 'KeyQ', ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(altgr, 'getModifierState', { value: (k: string) => k === 'AltGraph' });
    t.app.input.input.dispatchEvent(altgr);
    sock.data([IAC, WILL, ECHO]);
    key(t.app, { key: 'F5', code: 'F5' });
    expect(t.sentLines(sock).filter((l) => l === 'altgr' || l === 'f5')).toEqual([]);
    // Password mode sends the text as is, past the engine.
    enter(t.app, 'bb;x');
    expect(t.sentLines(sock).at(-1)).toBe('bb;x');
  });

  it('shows #showme lines in order with game lines, and gags', async () => {
    const t = await setup('#action {^You are hit} {#showme {<Fff0000>OUCH}}\n#gag {^spam}\n');
    const sock = await t.connect();
    sock.data(concat(utf8('before\r\nspam spam\r\nYou are hit.\r\nafter\r\n')));
    const out = t.outputText();
    const i = out.indexOf('before');
    expect(out.slice(i)).toEqual(['before', 'OUCH', 'You are hit.', 'after']);
  });

  it('loads the selected profile at start-up and reloads it at each session start', async () => {
    const t = await setup('#alias {x} {one}');
    expect(t.app.script.user.plainAlias('x')?.body).toBe('one');
    await t.profiles.save('pvp', '#alias {x} {two}');
    const sock = await t.connect();
    expect(t.outputText()).toContain('[SYSTEM] Profile pvp loaded.');
    enter(t.app, 'x');
    expect(t.sentLines(sock).at(-1)).toBe('two');
  });

  it('applyProfile swaps atomically and keeps the old profile on failure', async () => {
    const t = await setup('#alias {x} {old}');
    const sock = await t.connect();
    expect(t.app.applyProfile('#alias {x} {new')).toEqual({ ok: false, reason: 'Unbalanced braces: the { on line 1 is never closed.' });
    enter(t.app, 'x');
    expect(t.app.applyProfile('#alias {x} {new}\n#lua {x}')).toEqual({
      ok: true,
      warnings: ['line 2: #lua: Shell and Lua commands do nothing in the browser.'],
    });
    enter(t.app, 'x');
    expect(t.sentLines(sock).slice(-2)).toEqual(['old', 'new']);
  });

  it('reports profile load and apply to the UI pane', async () => {
    const t = await setup('#alias {x} {old}');
    const ui: string[] = [];
    t.app.bus.on('ui.message', (m) => ui.push(m.kind + ': ' + m.parts.map((p) => (typeof p === 'string' ? p : `<${p.value}>`)).join('')));
    await t.connect();
    t.app.applyProfile('#alias {x} {new');
    t.app.applyProfile('#alias {x} {new}');
    t.app.applyProfile('#alias {x} {new}\n#lua {x}');
    expect(ui).toEqual([
      'system: Connecting to MUME...',
      'system: Profile <pvp> loaded.',
      'error: Profile <pvp> not applied.',
      'system: Profile <pvp> applied.',
      'warn: Profile <pvp> applied with <1> warning.',
    ]);
  });

  it('writes runtime variables back to the stored profile (top-level ones only)', async () => {
    const text = '#nop keep me\n#VARIABLE {target} {*elf*}\n\n#ALIAS {z} {#variable {target} {%1};#variable {other} {x}}\n';
    const t = await setup(text);
    await t.connect();
    enter(t.app, 'z *orc*');
    // Meanwhile the editor saved another change: the write-back keeps it.
    const edited = (await t.profiles.get('pvp'))!.text + '#alias {new} {y}\n';
    await t.profiles.save('pvp', edited);
    await t.app.flushWriteBack();
    const stored = (await t.profiles.get('pvp'))!.text;
    expect(stored).toBe(edited.replace('{*elf*}', '{*orc*}'));
  });

  it('does not write back before a profile has loaded', async () => {
    const t = await setup();
    await t.profiles.create('solo', '#variable {a} {1}');
    t.app.script.setVariable('a', '2');
    await t.app.flushWriteBack();
    expect((await t.profiles.get('solo'))!.text).toBe('#variable {a} {1}');
  });

  it('while disconnected a typed command reconnects once; rules do not', async () => {
    const t = await setup('#alias {two} {n;e}\n#ticker {t} {_send tick} {1}');
    await t.connect();
    t.sockets[0]!.drop('closed by server');
    t.clock.advance(3000);
    expect(t.sockets).toHaveLength(1);
    enter(t.app, 'two');
    expect(t.sockets).toHaveLength(2);
    expect(t.app.session.state).toBe('connecting');
  });

  it('warns in the UI pane when run capture is off', async () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App({ root, offline: true, recorder: { openStore: () => Promise.reject(new Error('no store')), win: null } });
    const ui: string[] = [];
    app.bus.on('ui.message', (m) => ui.push(`${m.kind}: ${m.parts.join('')}`));
    await new Promise((r) => setTimeout(r, 0));
    expect(ui).toEqual(['warn: Run capture is off: no IndexedDB.']);
  });

  it('says how to connect in offline mode, once per line', async () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const frames: Array<() => void> = [];
    const app = new App({ root, offline: true, recorder: { openStore: () => Promise.reject(new Error('no store')), win: null }, requestFrame: (cb) => frames.push(cb) });
    enter(app, 'n;e;#showme hi');
    while (frames.length) frames.shift()!();
    const out = Array.from(app.output.el.querySelectorAll('.wc-rows .wc-row')).map((r) => r.textContent);
    expect(out).toEqual(['[SYSTEM] Not connected.', 'hi']);
  });
});
