// The HTML replay's map (ADR 0020 "Replays", P3): the export embeds the
// subset around the visited rooms with its tiles; the page hands it to
// the Map pane; the map pane's layout replays like any other pane.
import { readFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_PNG } from '../../src/map/assets';
import { readMm2 } from '../../src/map/mm2';
import { overlayFor } from '../../src/map/tilesets';
import { type MapToolRequest, runMapToolRequest } from '../../src/map/tools';
import { overlayView, parseView } from '../../src/player/fit';
import { decodePayload } from '../../src/replay/codec';
import { buildReplayHtml } from '../../src/replay/export';
import { replayMapHost } from '../../src/replay/map-host';
import { defaultSettings, migrateSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { buildReplayPayload } from '../../src/share/payload';
import { gridMap } from './map-grid';
import { BASE_US, makeLog, meta } from './player-helpers';

const inflate = async (z: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateSync(z));
const deflate = async (b: Uint8Array): Promise<Uint8Array> => new Uint8Array(deflateSync(b));

const PUBLIC = new URL('../../public/', import.meta.url);

/** Serves the bundle stub, the fonts stub and public/map/ from disk. */
function fetcher(urls: string[]) {
  return async (url: string): Promise<Response> => {
    urls.push(url);
    if (url.endsWith('.js')) return new Response('/* bundle */');
    const m = /\/map\/(.+)$/.exec(url);
    if (m) return new Response(readFileSync(new URL(`map/${m[1]}`, PUBLIC)));
    return new Response(new Uint8Array([1]));
  };
}

function chain(withRooms: boolean) {
  const text = makeLog(BASE_US, [
    { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
    ...(withRooms
      ? [
          { at: 1, gmcp: 'Room.Info', json: { id: 1000 + 5 * 40 + 5, name: 'Room 205', desc: 'x' } },
          { at: 2, gmcp: 'Room.Info', json: { name: 'Room 206', desc: 'The plain room number 206.' } },
          { at: 3, gmcp: 'Group.Update', json: { id: 7, name: 'Mate', mapid: 1000 + 5 * 40 + 9 } },
        ]
      : []),
    { at: 4, in: 'A room.' },
  ]);
  return buildReplayPayload([{ meta: meta('Rasta/a', BASE_US), text }], [], defaultExportDoc('Rasta/a'), defaultSettings());
}

const runTool = (req: MapToolRequest) => runMapToolRequest(req, { fetch, inflate, deflate });

describe('HTML replay map export', () => {
  it('embeds the subset around the visited rooms and only the tiles it uses', async () => {
    const map = gridMap(40, 40, { noServerId: (i) => i === 206 });
    const urls: string[] = [];
    const tool = vi.fn(runTool);
    const blob = await buildReplayHtml(chain(true), {
      fetch: fetcher(urls),
      base: 'https://example.org/app/',
      map: { kind: 'data', map, name: 'grid.mm2' },
      runMapTool: tool,
    });
    expect(tool).toHaveBeenCalledTimes(1);
    expect(tool.mock.calls[0]![0]).toMatchObject({ t: 'subset', visits: { rooms: [{ id: 1205 }, { name: 'Room 206' }], mapIds: [1209] } });
    const html = await blob.text();
    const p = await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(html)![1]!);
    const m = p.map!;
    expect(m.name).toBe('grid.mm2');
    expect(m.visited).toBe(3);
    const sub = await readMm2(Uint8Array.from(atob(m.mm2), (c) => c.charCodeAt(0)), inflate);
    expect(sub.roomCount).toBe(m.rooms);
    expect(sub.roomCount).toBeGreaterThan(3);
    expect(sub.roomCount).toBeLessThan(1600);
    expect(sub.byServerId.has(1205) && sub.byServerId.has(1209)).toBe(true);
    // Tiles from the app's map/ folder, as data URIs; nothing else.
    expect(m.files['pixmaps/terrain-field.png']).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(m.files['fonts/Cantarell18.fnt']).toMatch(/^data:text\/plain;base64,/);
    expect(m.files['pixmaps/terrain-city.png']).toBeUndefined();
    expect(m.files['pixmaps/mellon.png']).toBeUndefined();
    expect(urls.filter((u) => u.includes('/map/')).every((u) => u.startsWith('https://example.org/app/map/'))).toBe(true);
  });

  it("embeds the client's tileset, with the default pixmaps for files the set lacks (ADR 0082)", async () => {
    const map = gridMap(40, 40, { noServerId: (i) => i === 206 });
    const urls: string[] = [];
    const blob = await buildReplayHtml(chain(true), {
      fetch: fetcher(urls),
      base: 'https://example.org/app/',
      map: { kind: 'data', map, name: 'grid.mm2' },
      runMapTool: runTool,
      tileset: overlayFor('shimrod-winter', 0),
    });
    const p = await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(await blob.text())![1]!);
    const files = p.map!.files;
    const b64 = (rel: string): string => `data:image/png;base64,${readFileSync(new URL(`map/${rel}`, PUBLIC)).toString('base64')}`;
    // Same keys as without a set (the page needs no tileset logic), the set's bytes.
    expect(files['pixmaps/terrain-field.png']).toBe(b64('tilesets/shimrod-winter/terrain-field.png'));
    expect(files['pixmaps/char-room-sel.png']).toBe(b64('pixmaps/char-room-sel.png'));
    expect(Object.keys(files).some((k) => k.startsWith('tilesets/'))).toBe(false);
    expect(urls).toContain('https://example.org/app/map/tilesets/shimrod-winter/terrain-field.png');
    expect(urls).toContain('https://example.org/app/map/pixmaps/char-room-sel.png');
    expect(urls).not.toContain('https://example.org/app/map/pixmaps/terrain-field.png');
  });

  it("embeds an aliased file under the path it stands in for, and the set's untinted flow marks (ADR 0088)", async () => {
    // Rapids (terrain 9) around the visited rooms.
    const map = gridMap(40, 40, { noServerId: (i) => i === 206, terrain: (i) => (i % 2 ? 9 : 3) });
    const urls: string[] = [];
    const blob = await buildReplayHtml(chain(true), {
      fetch: fetcher(urls),
      base: 'https://example.org/app/',
      map: { kind: 'data', map, name: 'grid.mm2' },
      runMapTool: runTool,
      tileset: overlayFor('grays-map', 0),
    });
    const p = await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(await blob.text())![1]!);
    const m = p.map!;
    const b64 = (rel: string): string => `data:image/png;base64,${readFileSync(new URL(`map/${rel}`, PUBLIC)).toString('base64')}`;
    // Rapids draw Gray's water; the set has no rapids file, so none is fetched.
    expect(m.files['pixmaps/terrain-rapids.png']).toBe(b64('tilesets/grays-map/terrain-water.png'));
    expect(urls).toContain('https://example.org/app/map/tilesets/grays-map/terrain-water.png');
    expect(urls.some((u) => u.endsWith('terrain-rapids.png'))).toBe(false);
    expect(m.streamsAsIs).toBe(true);
    expect(m.tints).toEqual({ dark: '#e3dcdc', noSundeath: '#f1eded' });
    expect(replayMapHost(m).assets).toMatchObject({ kind: 'inline', streamsAsIs: true, tints: { dark: '#e3dcdc', noSundeath: '#f1eded' } });
    // Malformed tints in a payload are ignored.
    expect('tints' in replayMapHost({ ...m, tints: { dark: 'red', noSundeath: '#ffffff' } }).assets).toBe(false);
    // A set without the flag embeds none.
    const plain = await buildReplayHtml(chain(true), {
      fetch: fetcher([]),
      base: 'https://example.org/app/',
      map: { kind: 'data', map, name: 'grid.mm2' },
      runMapTool: runTool,
      tileset: overlayFor('desert', 0),
    });
    const q = await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(await plain.text())![1]!);
    expect(q.map!.streamsAsIs).toBeUndefined();
    expect(q.map!.tints).toBeUndefined();
    expect('streamsAsIs' in replayMapHost(q.map).assets).toBe(false);
  });

  it('embeds nothing for a chain without Room.Info, or when the map cannot be read', async () => {
    const tool = vi.fn(runTool);
    const map = { kind: 'data' as const, map: gridMap(4, 4), name: 'g' };
    const plain = await buildReplayHtml(chain(false), { fetch: fetcher([]), base: 'http://x/', map, runMapTool: tool });
    expect(tool).not.toHaveBeenCalled();
    expect((await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(await plain.text())![1]!)).map).toBeUndefined();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = await buildReplayHtml(chain(true), {
      fetch: fetcher([]),
      base: 'http://x/',
      map: { kind: 'bytes', bytes: new Uint8Array([1, 2]).buffer, name: 'bad.mm2' },
      runMapTool: runTool,
    });
    expect((await decodePayload(/id="wc-replay-payload">([^<]+)</.exec(await bad.text())![1]!)).map).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/map was left out/));
    warn.mockRestore();
  });
});

describe('replay map host', () => {
  it('gives fresh bytes per load and the embedded files with an empty-tile fallback', () => {
    const h = replayMapHost({ name: 'g', rooms: 1, visited: 1, mm2: btoa('abc'), files: { 'pixmaps/a.png': 'data:x' } });
    const a = h.source() as { kind: 'bytes'; bytes: ArrayBuffer };
    const b = h.source() as { kind: 'bytes'; bytes: ArrayBuffer };
    expect(a.kind).toBe('bytes');
    expect(a.bytes).not.toBe(b.bytes);
    expect(new TextDecoder().decode(a.bytes)).toBe('abc');
    expect(h.assets).toEqual({ kind: 'inline', files: { 'pixmaps/a.png': 'data:x' }, fallback: EMPTY_PNG });
    expect(replayMapHost(undefined).source()).toBeNull();
  });
});

describe('map pane layout in replays', () => {
  it('replays the map pane on/off, its auto float and a moved float rect from VIEW records', () => {
    const d = defaultSettings();
    d.panes.map.on = true;
    const auto = parseView(JSON.stringify({ panes: d.panes, layout: d.layout }))!;
    const s1 = migrateSettings(defaultSettings());
    overlayView(s1, auto);
    const m1 = migrateSettings(s1);
    expect(m1.panes.map.on).toBe(true);
    expect(m1.layout.floating.find((f) => f.id === 'map')).toMatchObject({ auto: true });

    const moved = JSON.parse(JSON.stringify(d.layout)) as typeof d.layout;
    const f = moved.floating.find((x) => x.id === 'map')!;
    Object.assign(f, { x: 3, y: 4, w: 40, h: 12 });
    delete f.auto;
    const s2 = migrateSettings(defaultSettings());
    overlayView(s2, parseView(JSON.stringify({ panes: d.panes, layout: moved }))!);
    const m2 = migrateSettings(s2);
    expect(m2.layout.floating.find((x) => x.id === 'map')).toEqual({ id: 'map', x: 3, y: 4, w: 40, h: 12 });

    // A VIEW from before the map existed: the map is off and floats at its default spot.
    const old = { panes: { character: d.panes.character }, layout: { docks: d.layout.docks, floating: [] } };
    const s3 = migrateSettings(defaultSettings());
    overlayView(s3, parseView(JSON.stringify(old))!);
    const m3 = migrateSettings(s3);
    expect(m3.panes.map.on).toBe(false);
    expect(m3.layout.floating.find((x) => x.id === 'map')).toMatchObject({ auto: true });
  });
});
