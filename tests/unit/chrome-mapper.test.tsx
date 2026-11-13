// The Mapper settings' shared logic (src/chrome/mapper-model.ts; its controls are the Settings popup's
// Mapper tab, chrome-popups.test.tsx): the map's formats, and importing a map file and going back to
// the bundled one against a real store.
import { IDBFactory } from 'fake-indexeddb';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { currentMap, fmtBytes, fmtCount, fmtDate, importMapFile, useBundledMap } from '../../src/chrome/mapper-model';
import { writeMm2 } from '../../src/map/mm2-write';
import { MapStore } from '../../src/map/store';
import { runMapToolRequest } from '../../src/map/tools';
import { lazyDb } from '../../src/panes/context';
import { gridMap } from './map-grid';

const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));

describe('Mapper helpers', () => {
  it('formats the current map', () => {
    expect(fmtBytes(5_814_236)).toBe('5.8 MB');
    expect(fmtBytes(81_200)).toBe('81 kB');
    expect(fmtBytes(12)).toBe('12 B');
    expect(fmtCount(30074)).toBe('30 074');
    expect(fmtCount(1234)).toBe('1 234');
    expect(fmtDate(0)).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
  });
});

describe('Mapper model: the map file', () => {
  it('a bad file is refused and nothing is stored; a good one is imported; the bundled map comes back', async () => {
    const maps = new MapStore({
      openDb: lazyDb(new IDBFactory()),
      validate: async (bytes) => {
        const r = await runMapToolRequest({ t: 'validate', bytes }, { fetch, inflate });
        if (!r.ok) throw new Error(r.message);
        if (r.t !== 'validate') throw new Error('bad');
        return r.info;
      },
    });
    const said: Array<[string, string | undefined]> = [];
    const flash = (text: string, kind?: 'ok' | 'fail'): void => void said.push([text, kind]);
    const file = (name: string, bytes: Uint8Array): File => new File([bytes as BlobPart], name);

    // Without a store.
    await importMapFile(undefined, file('x.mm2', new Uint8Array([1])), flash);
    expect(said.pop()).toEqual(['Import failed: no map storage here.', 'fail']);

    // A bad file: the reason, nothing stored.
    await importMapFile(maps, file('junk.mm2', new Uint8Array([1, 2, 3])), flash);
    expect(said[0]).toEqual(['Checking junk.mm2…', undefined]);
    expect(said.at(-1)![0]).toMatch(/^Import failed: Not an MMapper map/);
    expect(said.at(-1)![1]).toBe('fail');
    expect(await currentMap(maps)).toEqual({ kind: 'bundled', name: 'arda.mm2' });
    // The bundled map is current: nothing to go back to.
    said.length = 0;
    await useBundledMap(maps, await currentMap(maps), flash);
    expect(said).toEqual([]);

    // A good file.
    const bytes = await writeMm2(gridMap(7, 3), async (b) => new Uint8Array(deflateSync(b)));
    await importMapFile(maps, file('mine.mm2', bytes), flash);
    expect(said.at(-1)).toEqual(['Imported mine.mm2 (21 rooms).', undefined]);
    const cur = await currentMap(maps);
    expect(cur).toMatchObject({ kind: 'imported', name: 'mine.mm2', rooms: 21, size: bytes.byteLength });

    // Use bundled map.
    await useBundledMap(maps, cur, flash);
    expect(said.at(-1)).toEqual(['Using the bundled map.', undefined]);
    expect((await maps.current()).kind).toBe('bundled');
  });
});
