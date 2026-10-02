// The script library (src/scripts/library.ts, ADR 0051 P1): bundled and
// user scripts in IndexedDB, names, enabled state, settings, store data.

import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, openWebcockpitDb } from '../../src/core/db';
import { resetScriptKeys, scriptKeyOwner } from '../../src/script/script-keys';
import { ScriptError, ScriptLibrary, scriptNameError, uniqueScriptName } from '../../src/scripts';
import {
  BadScriptBackupError,
  formatScriptBackup,
  looksLikeScriptBackup,
  parseScriptBackup,
  scriptBackupFileName,
} from '../../src/scripts/backup';

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

describe('backup (ADR 0053 P3)', () => {
  it('writes user scripts and every script\'s data, and reads them back into an empty library', async () => {
    const { lib } = make();
    await lib.create('mine', '-- @api 1\n-- @setting n number 1 "N"\nsend("x")');
    await lib.setEnabled('mine', true);
    await lib.setSetting('mine', 'n', '7');
    await lib.setEnabled('looter', true);
    await lib.setSetting('looter', 'delay', '2');
    lib.storeSet('mine', 'k', { a: [1, 'b', true] });
    const text = formatScriptBackup(lib.backupRecords());
    expect(looksLikeScriptBackup(text)).toBe(true);
    expect(looksLikeScriptBackup('-- @name x\n')).toBe(false);
    const b = parseScriptBackup(text);
    expect(b.scripts).toEqual([expect.objectContaining({ name: 'mine', enabled: true, source: lib.get('mine')!.source })]);
    expect(b.data).toEqual(
      expect.arrayContaining([
        { name: 'mine', settings: { n: 7 }, store: { k: { a: [1, 'b', true] } } },
        { name: 'looter', enabled: true, settings: { delay: 2 }, store: {} },
      ]),
    );
    await lib.close();

    // A fresh browser: everything comes back, turned off, and persists.
    const { lib: fresh, factory } = make();
    const r = await fresh.restore(b);
    expect(r).toEqual({ added: ['mine'], renamed: [], skipped: [], data: 2 });
    expect(fresh.get('mine')).toMatchObject({ enabled: false, settings: { n: 7 } });
    expect(fresh.storeGet('mine', 'k')).toEqual({ a: [1, 'b', true] });
    expect(fresh.get('looter')).toMatchObject({ enabled: false, settings: { delay: 2 } });
    await fresh.close();
    const again = new ScriptLibrary({ factory, bundled: BUNDLED });
    await again.init();
    expect(again.get('mine')).toMatchObject({ enabled: false, settings: { n: 7 } });
    expect(again.get('looter')!.settings).toEqual({ delay: 2 });
    await again.close();
  });

  it('adds only what is missing: identical scripts are skipped, taken names get _2, data follows its script', async () => {
    const { lib } = make();
    await lib.create('same', '-- @api 1\nsend("a")');
    await lib.create('other', '-- @api 1\nsend("mine")');
    await lib.setSetting('looter', 'delay', '3');
    const r = await lib.restore({
      exported: 0,
      scripts: [
        { name: 'same', source: lib.get('same')!.source, enabled: true, created: 1, updated: 1 },
        { name: 'other', source: '-- @name other\n-- @api 1\nsend("theirs")', enabled: true, created: 1, updated: 1 },
        { name: 'looter', source: '-- @api 1\nsend("fake looter")', enabled: false, created: 1, updated: 1 },
      ],
      data: [
        { name: 'looter', enabled: true, settings: { delay: 9 }, store: {} },
        { name: 'other', settings: {}, store: { x: 1 } },
        { name: 'gone', settings: {}, store: { y: 2 } },
      ],
    });
    expect(r).toEqual({
      added: ['other_2', 'looter_2'],
      renamed: [
        ['other', 'other_2'],
        ['looter', 'looter_2'],
      ],
      skipped: ['same'],
      data: 2,
    });
    // `looter` data in a file whose user script is `looter` belongs to that script (now looter_2).
    expect(lib.get('other_2')!.source).toBe('-- @name other_2\n-- @api 1\nsend("theirs")');
    expect(lib.storeGet('other_2', 'x')).toBe(1);
    expect(lib.storeGet('other', 'x')).toBeUndefined();
    expect(lib.get('looter')).toMatchObject({ enabled: false, settings: { delay: 3 } });
    expect(lib.get('same')!.enabled).toBe(false);
    await lib.close();
  });

  it('refuses files that are not a backup, before anything is written', () => {
    const bad = (t: string) => () => parseScriptBackup(t);
    expect(bad('nope')).toThrow(new BadScriptBackupError('The file is not JSON.'));
    expect(bad('{"type":"webcockpit-runs"}')).toThrow('Not a WebCockpit scripts backup.');
    expect(bad('{"type":"webcockpit-scripts","schema":2}')).toThrow('Unknown backup version 2.');
    expect(bad('{"type":"webcockpit-scripts","schema":1,"scripts":[{"name":"a"}],"data":[]}')).toThrow('Script 1: no source.');
    expect(bad('{"type":"webcockpit-scripts","schema":1,"scripts":[],"data":[{"name":"a","store":{"f":null}}]}')).toThrow('Data 1: bad store data.');
    expect(scriptBackupFileName(new Date(2026, 9, 2))).toBe('webcockpit-scripts-2026-10-02.json');
  });
});
