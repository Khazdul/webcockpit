// @vitest-environment happy-dom
// ADR 0105: the profile editor applies in place through App.commitProfile:
// quietly, on the write-back queue, keeping typed settings, queued variable
// values and the session's variables.
import { describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { ProfileStore } from '../../src/profiles';
import { FakeScheduler } from '../../src/script/engine';
import { SettingsStore } from '../../src/settings';
import { FakeSocket } from './net-helpers';

async function setup(profileText: string) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sockets: FakeSocket[] = [];
  const profiles = new ProfileStore({ factory: null });
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  await profiles.create('pvp', profileText);
  settings.update({ profile: 'pvp' });
  const app = new App({
    root,
    settings,
    profiles,
    scheduler: new FakeScheduler(),
    writeBackDelayMs: 60_000,
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    recorder: { openStore: () => Promise.reject(new Error('no store')), win: null },
    requestFrame: () => {},
  });
  const ui: string[] = [];
  app.bus.on('ui.message', (m) => ui.push(m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('')));
  const settle = () => new Promise((r) => setTimeout(r, 0));
  await settle();
  app.connectLive();
  sockets.at(-1)!.open();
  await settle();
  const enter = (text: string) => {
    app.input.input.value = text;
    app.input.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  };
  const stored = async () => (await profiles.get('pvp'))?.text;
  return { app, profiles, ui, settle, enter, stored };
}

const live = { live: true, quiet: true };

describe('App.commitProfile', () => {
  it('builds on the latest stored text, applies quietly and saves', async () => {
    const t = await setup('#alias {a} {one}\n');
    t.ui.length = 0;
    const seen: string[] = [];
    const r = await t.app.commitProfile('pvp', (s) => (seen.push(s), s + '#alias {b} {two}\n'), live);
    expect(r).toEqual({ ok: true, changed: true, warnings: [], added: [] });
    expect(seen).toEqual(['#alias {a} {one}\n']);
    expect(await t.stored()).toBe('#alias {a} {one}\n#alias {b} {two}\n');
    expect(t.app.script.user.plainAlias('b')?.body).toBe('two');
    expect(t.ui).toEqual([]);
  });

  it('reads after a typed setting, and a setting typed after the apply lands on top of the save', async () => {
    const t = await setup('#alias {a} {one}\n');
    t.enter('#alias {zz} {say hi}');
    const p = t.app.commitProfile('pvp', (s) => s.replace('{one}', '{uno}'), live);
    t.enter('#alias {yy} {say yo}');
    await p;
    await t.app.flushWriteBack();
    expect(await t.stored()).toBe('#alias {a} {uno}\n#alias {zz} {say hi}\n#alias {yy} {say yo}\n');
    expect(t.app.script.user.plainAlias('zz')?.body).toBe('say hi');
    expect(t.app.script.user.plainAlias('yy')?.body).toBe('say yo');
  });

  it('writes queued variable values first, so the apply does not lose them', async () => {
    const t = await setup('#variable {hp} {10}\n#alias {set} {#variable {hp} {%1}}\n#alias {a} {one}\n');
    t.enter('set 3');
    const r = await t.app.commitProfile('pvp', (s) => s.replace('{one}', '{uno}'), live);
    expect(r.ok).toBe(true);
    expect(await t.stored()).toBe('#variable {hp} {3}\n#alias {set} {#variable {hp} {%1}}\n#alias {a} {uno}\n');
    expect(t.app.script.getVariable('hp')).toBe('3');
  });

  it("keeps the session's variables the text does not set", async () => {
    const t = await setup('#alias {t} {#variable {target} {%1}}\n');
    t.enter('t orc');
    expect(t.app.script.getVariable('target')).toBe('orc');
    await t.app.commitProfile('pvp', (s) => s + '#alias {b} {two}\n', live);
    expect(t.app.script.getVariable('target')).toBe('orc');
  });

  it('a text that does not load is neither applied nor saved', async () => {
    const t = await setup('#alias {a} {one}\n');
    t.ui.length = 0;
    const r = await t.app.commitProfile('pvp', () => '#alias {a} {one\n', live);
    expect(r).toEqual({ ok: false, reason: 'Unbalanced braces: the { on line 1 is never closed.', stage: 'apply' });
    expect(await t.stored()).toBe('#alias {a} {one}\n');
    expect(t.app.script.user.plainAlias('a')?.body).toBe('one');
    expect(t.ui).toEqual([]);
  });

  it('reports only warnings the running profile did not have', async () => {
    const t = await setup('stray text\n');
    // The same warning on another line is not new.
    const r1 = await t.app.commitProfile('pvp', (s) => '#alias {a} {b}\n' + s, live);
    expect(r1.ok && r1.warnings.length).toBe(1);
    expect(r1.ok && r1.added).toEqual([]);
    const r2 = await t.app.commitProfile('pvp', (s) => s + 'more text\n', live);
    expect(r2.ok && r2.added).toEqual(['line 3: text outside a command is ignored: more text']);
  });

  it('nothing to do when build gives the stored text back; not live = save only', async () => {
    const t = await setup('#alias {a} {one}\n');
    expect(await t.app.commitProfile('pvp', (s) => s, live)).toEqual({ ok: true, changed: false, warnings: [], added: [] });
    await t.app.commitProfile('pvp', (s) => s + '#alias {b} {two}\n', { live: false, quiet: true });
    expect(await t.stored()).toBe('#alias {a} {one}\n#alias {b} {two}\n');
    expect(t.app.script.user.plainAlias('b')).toBeUndefined();
  });

  it('the modal apply (not quiet) still reports to the UI pane', async () => {
    const t = await setup('#alias {a} {one}\n');
    t.ui.length = 0;
    await t.app.commitProfile('pvp', (s) => s + '#alias {b} {two}\n', { live: true, quiet: false });
    expect(t.ui).toEqual(['Profile pvp applied.']);
  });
});
