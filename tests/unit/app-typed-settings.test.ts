// @vitest-environment happy-dom
// Typed settings persist (ADR 0038), through the App: the input line, the
// stored profile, reloads, and the guards (offline mode, no profile loaded).
import { describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { ProfileStore } from '../../src/profiles';
import { FakeScheduler } from '../../src/script/engine';
import { SettingsStore } from '../../src/settings';
import { FakeSocket } from './net-helpers';

async function setup(profileText: string | null, extra: { offline?: boolean } = {}) {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const sockets: FakeSocket[] = [];
  const profiles = new ProfileStore({ factory: null });
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  if (profileText !== null) {
    await profiles.create('pvp', profileText);
    settings.update({ profile: 'pvp' });
  } else settings.update({ profile: 'missing' });
  const system: string[] = [];
  const app = new App({
    root,
    settings,
    profiles,
    scheduler: new FakeScheduler(),
    // Long: a typed setting must not wait for the script-variable delay.
    writeBackDelayMs: 60_000,
    ...(extra.offline ? { offline: true } : {}),
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    recorder: { openStore: () => Promise.reject(new Error('no store')), win: null },
    requestFrame: () => {},
  });
  app.bus.on('sys.message', (m) => system.push(m.text));
  const settle = () => new Promise((r) => setTimeout(r, 0));
  await settle();
  const connect = async () => {
    app.connectLive();
    sockets.at(-1)!.open();
    await settle();
  };
  const enter = (text: string) => {
    app.input.input.value = text;
    app.input.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  };
  const stored = async () => (await profiles.get('pvp'))?.text;
  return { app, profiles, settings, system, settle, connect, enter, stored };
}

describe('typed settings in the App', () => {
  it('a typed alias is in the stored profile at once and survives a reconnect', async () => {
    const t = await setup('#nop mine\n#alias {a} {1}\n');
    await t.connect();
    t.enter('#alias {zz} {say hi};#var target orc');
    await t.settle();
    expect(await t.stored()).toBe('#nop mine\n#alias {a} {1}\n#alias {zz} {say hi}\n\n#variable {target} {orc}\n');
    expect(t.system.filter((m) => /saved/i.test(m))).toEqual([]);

    // Typed right before a reload: the load waits for the write.
    t.enter('#alias {late} {x}');
    await t.app.loadSelectedProfile(false);
    expect(t.app.script.user.rules('alias').map((r) => r.pattern).sort()).toEqual(['a', 'late', 'zz']);
    expect(await t.stored()).toContain('#alias {late} {x}\n');

    t.enter('#unalias zz');
    await t.app.flushWriteBack();
    expect(await t.stored()).toBe('#nop mine\n#alias {a} {1}\n#alias {late} {x}\n\n#variable {target} {orc}\n');
  });

  it('flushWriteBack resolves after every typed write (the editor reads after it)', async () => {
    const t = await setup('');
    await t.connect();
    for (let i = 0; i < 5; i++) t.enter(`#alias {a${i}} {x}`);
    await t.app.flushWriteBack();
    expect((await t.stored())!.trim().split('\n')).toHaveLength(5);
  });

  it('Apply drops script values queued by the rules it replaced', async () => {
    const t = await setup('#variable {v} {0}\n#alias {s} {#variable {v} {old}}\n');
    await t.connect();
    t.enter('s');
    const edited = '#variable {v} {edited}\n';
    expect(t.app.applyProfile(edited).ok).toBe(true);
    await t.profiles.save('pvp', edited);
    await t.app.flushWriteBack();
    expect(await t.stored()).toBe(edited);
    expect(t.app.script.getVariable('v')).toBe('edited');
  });

  it('writes nothing in offline replay mode, and says so', async () => {
    const t = await setup('#alias {a} {1}\n', { offline: true });
    t.enter('#alias {zz} {say hi}');
    await t.app.flushWriteBack();
    expect(await t.stored()).toBe('#alias {a} {1}\n');
    expect(t.app.script.user.rules('alias').map((r) => r.pattern)).toContain('zz');
    expect(t.system.at(-1)).toBe('Not saved to the profile: nothing is saved in offline replay mode.');
  });

  it('writes nothing when no profile is loaded, and says so', async () => {
    const t = await setup(null);
    await t.profiles.create('pvp', '#alias {a} {1}\n');
    t.enter('#alias {zz} {say hi}');
    await t.app.flushWriteBack();
    expect(await t.stored()).toBe('#alias {a} {1}\n');
    expect(t.system.at(-1)).toBe('Not saved to the profile: no profile is loaded.');
  });

  it('reports a setting that cannot be written', async () => {
    const t = await setup('');
    await t.connect();
    t.enter('#alias {bad} say }');
    await t.app.flushWriteBack();
    expect(await t.stored()).toBe('');
    expect(t.system.at(-1)).toMatch(/^Not saved to profile pvp: #alias \{bad\}/);
  });
});
