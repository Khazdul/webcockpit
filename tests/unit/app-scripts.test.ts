// @vitest-environment happy-dom
// Lua scripts wired into the App (ADR 0051 P1): an enabled script loads
// at start, its trigger acts on game text in the output pane, its alias
// takes a typed line, and `#script enable` loads the host on demand.
import { beforeAll, describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { loadLuaRuntime } from '../../src/lua';
import { FakeScheduler } from '../../src/script/engine';
import { ScriptLibrary } from '../../src/scripts';
import { SettingsStore } from '../../src/settings';
import { FakeSocket, utf8 } from './net-helpers';

const SCRIPT = `-- @api 1
tempTrigger("A rat is here.", function()
  replaceLine("<red>A RAT<reset> is here.")
  echo("[rat spotted]")
end)
tempAlias("^rr$", function() send("kill rat") end)
`;

// wasmoon's emscripten code takes the browser path when `document` exists
// and then cannot find its wasm in Node: load the module once with the DOM
// globals hidden; later runtimes reuse it.
beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { document: g.document, location: g.location, window: g.window };
  const set = (k: string, v: unknown) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  try {
    for (const k of Object.keys(saved)) set(k, undefined);
    (await loadLuaRuntime()).close();
  } finally {
    for (const [k, v] of Object.entries(saved)) set(k, v);
  }
});

async function setup(enabled: boolean) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sockets: FakeSocket[] = [];
  const frames: Array<() => void> = [];
  const scripts = new ScriptLibrary({ factory: null, bundled: [] });
  await scripts.create('rat', SCRIPT);
  if (enabled) await scripts.setEnabled('rat', true);
  const app = new App({
    root,
    settings: new SettingsStore({ factory: null, storage: null, win: null }),
    scheduler: new FakeScheduler(),
    scripts,
    scriptStorage: null,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    recorder: { openStore: () => Promise.reject(new Error('no store')), win: null },
    requestFrame: (cb) => frames.push(cb),
  });
  const settle = async () => {
    for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const outputText = () => {
    while (frames.length) frames.shift()!();
    return Array.from(app.output.el.querySelectorAll('.wc-rows .wc-row')).map((r) => r.textContent ?? '');
  };
  return { app, scripts, sockets, settle, outputText };
}

function enter(app: App, text: string) {
  app.input.input.value = text;
  app.input.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
}

describe('App + Lua scripts', () => {
  it('an enabled script runs on game lines and typed input', async () => {
    const t = await setup(true);
    await (await t.app.scriptHost()).sync();
    t.app.connectLive();
    const sock = t.sockets.at(-1)!;
    sock.open();
    await t.settle();
    sock.data(utf8('A rat is here.\r\n'));
    const out = t.outputText();
    expect(out).toContain('A RAT is here.');
    expect(out.indexOf('[rat spotted]')).toBe(out.indexOf('A RAT is here.') + 1);
    enter(t.app, 'rr');
    expect(new TextDecoder().decode(Uint8Array.from(sock.sentBytes()))).toContain('kill rat\r\n');
    t.app.dispose();
  });

  it('#script enable loads the host and the script; #script list prints', async () => {
    const t = await setup(false);
    await t.settle();
    enter(t.app, '#script enable rat');
    await t.settle();
    await (await t.app.scriptHost()).sync();
    await t.settle();
    expect(t.outputText()).toContain('[SYSTEM] Script rat turned on.');
    enter(t.app, '#script list');
    await t.settle();
    expect(t.outputText().some((r) => r.startsWith('  on     rat'))).toBe(true);
    t.app.dispose();
  });

  it('a player App has no scripts', async () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const app = new App({ root, player: true, scripts: new ScriptLibrary({ factory: null, bundled: [] }), requestFrame: () => {} });
    await expect(app.scriptHost()).rejects.toThrow('no script library');
    app.dispose();
  });
});
