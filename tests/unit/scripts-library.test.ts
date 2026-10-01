// The script library (src/scripts/library.ts, ADR 0051 P1): bundled and
// user scripts in IndexedDB, names, enabled state, settings, store data.

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, openWebcockpitDb } from '../../src/core/db';
import { resetScriptKeys, scriptKeyOwner } from '../../src/script/script-keys';
import { ScriptError, ScriptLibrary, scriptNameError, uniqueScriptName } from '../../src/scripts';

const BUNDLED = [{ name: 'looter', source: '-- @name looter\n-- @api 1\n-- @key F7 loot\n-- @setting delay number 0.5 "Delay"\nsend("loot")\n' }];

function make(factory: IDBFactory | null = new IDBFactory()) {
  let t = 1000;
  return { lib: new ScriptLibrary({ factory, bundled: BUNDLED, now: () => ++t, storeFlushMs: 10 }), factory };
}

describe('names', () => {
  it('follows the rules and finds free names', () => {
    expect(scriptNameError('coin-looter_2')).toBe(null);
    expect(scriptNameError('2x')).toBe('The name must start with a letter.');
    expect(scriptNameError('a b')).toBe('Only letters, digits, _ and - are allowed.');
    expect(scriptNameError('a'.repeat(33))).toBe('At most 32 characters.');
    expect(scriptNameError('x', ['x'])).toBe('"x" already exists.');
    expect(uniqueScriptName('My Script.lua', [])).toBe('My_Script');
    expect(uniqueScriptName('x', ['x', 'x_2'])).toBe('x_3');
    expect(uniqueScriptName('123', [])).toBe('script');
  });
});

describe('library', () => {
  it('lists bundled scripts read-only with their header and settings', async () => {
    const { lib } = make();
    await lib.init();
    const s = lib.get('looter')!;
    expect(s).toMatchObject({ name: 'looter', bundled: true, readonly: true, enabled: false, loadProblem: null, settings: { delay: 0.5 } });
    await expect(lib.save('looter', 'x')).rejects.toThrow(ScriptError);
    await expect(lib.remove('looter')).rejects.toThrow(/bundled script/);
  });

  it('creates, saves, renames and deletes user scripts, persisted', async () => {
    const { lib, factory } = make();
    const a = await lib.create();
    expect(a.name).toBe('script');
    expect(a.source).toMatch(/^-- @name {5}script\n-- @summary/);
    expect(a.loadProblem).toBe(null);
    const b = await lib.create('mine', '-- @api 1\nsend("x")');
    expect(b.source).toBe('-- @name     mine\n-- @api 1\nsend("x")');
    await expect(lib.create('looter')).rejects.toThrow('"looter" already exists.');
    // Saving with another @name renames.
    const r = await lib.save('mine', '-- @name ours\n-- @api 1\nsend("y")');
    expect(r).toEqual({ name: 'ours', warnings: [] });
    const r2 = await lib.save('ours', '-- @name looter\n-- @api 1\nsend("z")');
    expect(r2.name).toBe('ours');
    expect(r2.warnings[0]).toMatch(/^@name looter was not used: "looter" already exists/);
    await lib.rename('ours', 'theirs');
    expect(lib.get('theirs')!.source).toBe('-- @name theirs\n-- @api 1\nsend("z")');
    await lib.remove('script');
    expect(lib.list().map((s) => s.name)).toEqual(['looter', 'theirs']);
    await lib.close();

    const again = new ScriptLibrary({ factory, bundled: BUNDLED });
    await again.init();
    expect(again.list().map((s) => s.name)).toEqual(['looter', 'theirs']);
    expect(again.get('theirs')!.source).toMatch(/send\("z"\)/);
    await again.close();
  });

  it('enables bundled and user scripts globally and remembers it', async () => {
    const { lib, factory } = make();
    await lib.create('u', '-- @api 1');
    let calls = 0;
    lib.subscribe(() => calls++);
    await lib.setEnabled('looter', true);
    await lib.setEnabled('u', true);
    expect(lib.enabledNames()).toEqual(['looter', 'u']);
    expect(calls).toBe(2);
    await lib.close();
    const again = new ScriptLibrary({ factory, bundled: BUNDLED });
    await again.init();
    expect(again.enabledNames()).toEqual(['looter', 'u']);
    await again.close();
  });

  it('duplicates a bundled script as an editable copy with its settings', async () => {
    const { lib } = make();
    await lib.setSetting('looter', 'delay', '2');
    const c = await lib.duplicate('looter');
    expect(c).toMatchObject({ name: 'looter-copy', bundled: false, enabled: false, settings: { delay: 2 } });
    expect(c.source.startsWith('-- @name looter-copy\n')).toBe(true);
    expect((await lib.duplicate('looter')).name).toBe('looter-copy_2');
  });

  it('imports and exports .lua files', async () => {
    const { lib } = make();
    const a = await lib.importFile('Fancy Thing.lua', '-- @api 1\nsend(1)');
    expect(a.name).toBe('Fancy_Thing');
    const b = await lib.importFile('x.lua', '-- @name looter\n-- @api 1');
    expect(b.name).toBe('looter_2');
    expect(b.enabled).toBe(false);
    expect(lib.exportFile('looter_2')).toEqual({ fileName: 'looter_2.lua', text: '-- @name looter_2\n-- @api 1' });
  });

  it('checks setting types', async () => {
    const { lib } = make();
    expect(await lib.setSetting('looter', 'delay', 'soon')).toEqual({ ok: false, reason: 'delay must be a number.' });
    expect(await lib.setSetting('looter', 'speed', '1')).toEqual({ ok: false, reason: 'looter has no setting speed (settings: delay).' });
    expect(await lib.setSetting('nope', 'x', '1')).toEqual({ ok: false, reason: 'No script nope.' });
    expect(await lib.setSetting('looter', 'delay', '1.5')).toEqual({ ok: true, value: 1.5 });
    expect(lib.settingsOf('looter')).toEqual({ delay: 1.5 });
  });

  it('parallel changes do not lose each other', async () => {
    const { lib } = make();
    await lib.create('s', '-- @api 1\n-- @setting a number 1\n-- @setting b number 1');
    await Promise.all([lib.setSetting('s', 'a', '2'), lib.setSetting('s', 'b', '3'), lib.setEnabled('s', true)]);
    expect(lib.get('s')).toMatchObject({ enabled: true, settings: { a: 2, b: 3 } });
  });

  it('store data is written behind and kept per name', async () => {
    const { lib, factory } = make();
    await lib.init();
    lib.storeSet('looter', 'n', 5);
    lib.storeSet('looter', 't', { a: [1, 2] });
    lib.storeSet('looter', 'gone', true);
    lib.storeSet('looter', 'gone', undefined);
    expect(lib.storeGet('looter', 't')).toEqual({ a: [1, 2] });
    await new Promise((r) => setTimeout(r, 30));
    const again = new ScriptLibrary({ factory, bundled: BUNDLED });
    await again.init();
    expect(again.storeGet('looter', 'n')).toBe(5);
    expect(again.storeGet('looter', 'gone')).toBe(undefined);
    await again.close();
    await lib.close();
  });

  it('a user script whose name a new bundled script takes is renamed', async () => {
    const factory = new IDBFactory();
    const old = new ScriptLibrary({ factory, bundled: [] });
    await old.create('looter', '-- @api 1');
    await old.close();
    const lib = new ScriptLibrary({ factory, bundled: BUNDLED });
    await lib.init();
    expect(lib.list().map((s) => [s.name, s.bundled])).toEqual([
      ['looter', true],
      ['looter_2', false],
    ]);
    await lib.close();
  });

  it('keeps last errors in memory and declares @key of enabled scripts', async () => {
    resetScriptKeys();
    const { lib } = make();
    await lib.init();
    lib.setError('looter', 'looter:3: boom');
    expect(lib.get('looter')!.lastError).toBe('looter:3: boom');
    expect(scriptKeyOwner('F7')).toBe(null);
    await lib.setEnabled('looter', true);
    expect(lib.get('looter')!.lastError).toBe(null);
    expect(scriptKeyOwner('F7')).toBe('looter');
    resetScriptKeys();
  });

  it('works in memory without IndexedDB', async () => {
    const lib = new ScriptLibrary({ factory: null, bundled: [] });
    expect(lib.persistent).toBe(false);
    await lib.create('m', '-- @api 1');
    expect(lib.list()).toHaveLength(1);
  });

  it('database version 8 has the scripts and scriptData stores', async () => {
    const db = await openWebcockpitDb(new IDBFactory());
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames]).toEqual(expect.arrayContaining(['scripts', 'scriptData']));
    db.close();
  });
});
