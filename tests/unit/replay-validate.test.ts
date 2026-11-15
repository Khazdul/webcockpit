// validatePayload (ADR 0154 "Hardening the replay runtime"): bounds and
// whitelists, unknown keys dropped, prototype keys inert, a bad payload
// refused whole; every payload the exporter makes (and made) passes.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PAYLOAD_LIMITS, PayloadError, validMapFile, validatePayload } from '../../src/replay/validate';
import { defaultSettings } from '../../src/settings';
import { migrateSettings } from '../../src/settings/migrate';
import { REPLAY_SETTINGS_KEYS, type ReplayPayload, buildReplayPayload, replaySettings } from '../../src/share/payload';
import { defaultExportDoc } from '../../src/share/edits';
import { LOG_FIXTURES, demoPayloads, logPayload, oldShape } from './replay-payloads';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const base = (): ReplayPayload => logPayload('gmcp-demo.log');
/** `p` with `edit` applied to its JSON form. */
function mutate(edit: (o: Record<string, any>) => void, p: ReplayPayload = base()): unknown {
  const o = clone(p) as Record<string, any>;
  edit(o);
  return o;
}
const refused = (raw: unknown): void => {
  expect(() => validatePayload(raw)).toThrow(PayloadError);
};

/** What the replay reads of a payload: what `validatePayload` keeps must equal the export's, settings migrated. */
function normal(p: ReplayPayload): unknown {
  return { ...clone(p), settings: clone(validatePayload(p).settings) };
}

describe('validatePayload: what the exporter makes', () => {
  it('passes every .log fixture unchanged', () => {
    for (const name of LOG_FIXTURES) {
      const p = logPayload(name);
      expect(validatePayload(clone(p))).toEqual(normal(p));
    }
  });

  it('passes every session of the runs demo backup, whole and cut with a comment', async () => {
    const all = await demoPayloads();
    expect(all.length).toBeGreaterThanOrEqual(4);
    for (const p of all) expect(validatePayload(clone(p))).toEqual(normal(p));
    expect(all.some((p) => p.markers.length > 0 && p.cuts.length > 0 && p.comments.length > 0)).toBe(true);
  });

  it('passes the first schema-1 files’ shape (whole RunMeta, no tips, all settings) and keeps only what the player reads', () => {
    const p = base();
    const v = validatePayload(oldShape(p));
    expect(v.runs.map((r) => Object.keys(r.meta).sort())).toEqual(p.runs.map(() => ['startedUs', 'summary']));
    expect(v.runs.map((r) => r.text)).toEqual(p.runs.map((r) => r.text));
    expect(Object.keys(v.settings).sort()).toEqual([...REPLAY_SETTINGS_KEYS].sort());
  });

  it('passes a payload with an embedded map in the exporter’s form (tiles png, map fonts .fnt as text/plain)', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const p = {
      ...base(),
      map: {
        name: 'arda.mm2',
        rooms: 10,
        visited: 2,
        mm2: 'AAAA',
        files: { 'pixmaps/room-dark.png': png, 'fonts/Cantarell18.fnt': 'data:text/plain;base64,aW5mbw==', 'fonts/Cantarell18_0.png': png },
        streamsAsIs: true,
        tints: { dark: '#112233', noSundeath: '#445566' },
      },
    };
    expect(validatePayload(clone(p)).map).toEqual(p.map);
  });

  // The owner's real exported files (ADR 0019 files since 2026-09-28):
  // `$WEBCOCKPIT_REPLAYS` (default ~/Downloads), skipped when there are none.
  const dir = process.env.WEBCOCKPIT_REPLAYS ?? join(process.env.HOME ?? '', 'Downloads');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')) : [];
  const payloads = files
    .map((f) => /<script type="application\/json" id="wc-replay-payload">([^<]*)<\/script>/.exec(readFileSync(join(dir, f), 'utf8'))?.[1])
    .filter((b): b is string => !!b);
  it.skipIf(payloads.length === 0)(`passes every real exported file (${payloads.length} found)`, () => {
    for (const b64 of payloads) {
      const raw = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')) as ReplayPayload;
      const v = validatePayload(raw);
      expect(v.runs.map((r) => r.text)).toEqual(raw.runs.map((r) => r.text));
      expect(v.comments).toEqual(raw.comments);
      if (raw.map) expect(v.map?.files).toEqual(raw.map.files);
    }
  });
});

describe('validatePayload: refusals', () => {
  it('refuses what is not a schema-1 payload', () => {
    for (const raw of [null, undefined, 1, 'x', [], {}, { schema: 2 }, { schema: '1' }]) refused(raw);
  });

  it('refuses flipped types and missing fields', () => {
    refused(mutate((o) => (o.runs = {})));
    refused(mutate((o) => (o.runs[0].text = 42)));
    refused(mutate((o) => (o.runs[0].meta = null)));
    refused(mutate((o) => (o.runs[0].meta.startedUs = '1')));
    refused(mutate((o) => (o.runs[0].meta.summary = 'x')));
    refused(mutate((o) => (o.title = null)));
    refused(mutate((o) => delete o.character));
    refused(mutate((o) => (o.comments = 'x')));
    refused(mutate((o) => (o.comments = [{ beforeUs: 'x', text: 'a', holdMs: 1000 }])));
    refused(mutate((o) => (o.markers = [{ us: 1, kind: 'X' }])));
    refused(mutate((o) => (o.markers = [{ us: 1, kind: 'A', tip: 5 }])));
    refused(mutate((o) => (o.map = 'x')));
  });

  it('refuses non-finite and out-of-range numbers', () => {
    // JSON has no NaN or Infinity, but a payload object may (Download as HTML validates objects too).
    for (const bad of [NaN, Infinity, -Infinity, 1e300]) {
      refused({ ...base(), startUs: bad });
      refused({ ...base(), level: bad });
      refused({ ...base(), cuts: [[0, bad]] });
      refused({ ...base(), markers: [{ us: bad, kind: 'A' }] });
    }
    refused({ ...base(), level: -1 });
    refused({ ...base(), comments: [{ beforeUs: null, text: 'a', holdMs: 1e9 }] });
  });

  it('refuses cuts that are not ordered pairs', () => {
    refused({ ...base(), cuts: [[5, 1]] });
    refused({ ...base(), cuts: [[1, 2, 3]] });
    refused({ ...base(), cuts: [[null, 2]] });
    expect(validatePayload({ ...base(), cuts: [[1, 2], [3, null]] }).cuts).toEqual([[1, 2], [3, null]]);
  });

  it('refuses hiddenSys outside the runs', () => {
    refused({ ...base(), hiddenSys: [1] });
    refused({ ...base(), hiddenSys: [-1] });
    refused({ ...base(), hiddenSys: [0.5] });
    expect(validatePayload({ ...base(), hiddenSys: [0] }).hiddenSys).toEqual([0]);
  });

  it('refuses past the bounds', () => {
    const p = base();
    const run = p.runs[0]!;
    refused({ ...p, runs: Array.from({ length: PAYLOAD_LIMITS.runs + 1 }, () => ({ ...run, text: '' })) });
    expect(validatePayload({ ...p, runs: Array.from({ length: PAYLOAD_LIMITS.runs }, () => ({ ...run, text: '' })) }).runs).toHaveLength(200);
    const third = 'x'.repeat(PAYLOAD_LIMITS.textChars / 2);
    refused({ ...p, runs: [{ ...run, text: third }, { ...run, text: third }, { ...run, text: 'x' }] });
    refused({ ...p, comments: Array.from({ length: PAYLOAD_LIMITS.comments + 1 }, () => ({ beforeUs: null, text: 'a', holdMs: 2500 })) });
    refused({ ...p, comments: [{ beforeUs: null, text: 'a'.repeat(PAYLOAD_LIMITS.commentChars + 1), holdMs: 2500 }] });
    refused({ ...p, markers: Array.from({ length: PAYLOAD_LIMITS.markers + 1 }, () => ({ us: 1, kind: 'A' })) });
    refused({ ...p, title: 't'.repeat(PAYLOAD_LIMITS.titleChars + 1) });
  });

  it('refuses map files outside the whitelist', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const withFiles = (files: Record<string, string>) => ({ ...base(), map: { name: 'm', rooms: 1, visited: 1, mm2: 'AAAA', files } });
    for (const files of [
      { 'pixmaps/../x.png': png },
      { 'pixmaps/./x.png': png },
      { 'pixmaps//x.png': png },
      { 'other/x.png': png },
      { 'pixmaps/x y.png': png },
      { ['pixmaps/' + 'a'.repeat(129)]: png },
      { 'pixmaps/x.svg': 'data:image/svg+xml;base64,PHN2Zz4=' },
      { 'pixmaps/x.png': 'https://evil.example/x.png' },
      { 'pixmaps/x.png': 'data:image/png,<svg>' },
      { 'pixmaps/x.png': 'data:text/html;base64,PGI+' },
      { 'pixmaps/x.woff2': 'data:font/woff2;base64,AAAA' },
      { 'pixmaps/x.fnt': 'data:text/plain;base64,AAAA' },
      { 'pixmaps/x.png': 'blob:https://x/y' },
      { 'pixmaps/x.png': `${png}")` },
    ]) refused(withFiles(files));
    refused({ ...base(), map: { name: 'm', rooms: 1, visited: 1, mm2: 'not base64!', files: {} } });
    refused({ ...base(), map: { name: 'm', rooms: 1, visited: 1, mm2: 'A'.repeat(PAYLOAD_LIMITS.mm2Chars + 1), files: {} } });
    refused({ ...base(), map: { name: 'm', rooms: 1, visited: 1, mm2: '', files: {}, tints: { dark: 'red', noSundeath: '#000000' } } });
    refused({ ...base(), map: { name: 'm', rooms: 1, visited: 1, mm2: '', files: {}, streamsAsIs: 'yes' } });
    const many: Record<string, string> = {};
    for (let i = 0; i <= PAYLOAD_LIMITS.mapFiles; i++) many[`pixmaps/t${i}.png`] = png;
    refused(withFiles(many));
    expect(validMapFile('fonts/x.woff2', 'data:font/woff2;base64,AAAA')).toBe(true);
    expect(validMapFile('pixmaps/x.webp', 'data:image/webp;base64,AAAA')).toBe(true);
  });
});

describe('validatePayload: unknown and prototype keys', () => {
  it('drops unknown keys at every level', () => {
    const v = validatePayload(
      mutate((o) => {
        o.extra = 'x';
        o.runs[0].extra = 1;
        o.runs[0].meta.runId = 'secret/run';
        o.runs[0].meta.summary = { startUs: 1, level: 3, xp: 99, kills: 4 };
        o.markers = [{ us: 1, kind: 'A', tip: 't', evil: true }];
        o.comments = [{ beforeUs: null, text: 'c', holdMs: 2500, html: '<b>' }];
      }),
    );
    expect(JSON.stringify(v)).not.toMatch(/extra|secret\/run|"xp"|kills|evil|html/);
    expect(v.runs[0]!.meta.summary).toEqual({ startUs: 1, level: 3 });
  });

  it('copies no prototype key and pollutes nothing', () => {
    const raw = JSON.parse(
      JSON.stringify(base()).replace(
        /^\{/,
        '{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":2}},',
      ),
    ) as Record<string, any>;
    raw.runs[0] = JSON.parse(`{"__proto__":{"text":"from proto"},"meta":${JSON.stringify(raw.runs[0].meta)},"text":"t"}`);
    raw.settings = JSON.parse('{"__proto__":{"polluted":3},"appearance":{"__proto__":{"font":"lucida"},"fg":"#ffffff"}}');
    raw.map = JSON.parse('{"name":"m","rooms":1,"visited":1,"mm2":"","files":{"__proto__":"data:image/png;base64,AA=="}}');
    // A prototype key in `files` is not a valid asset key: refused whole.
    refused(raw);
    delete raw.map;
    const v = validatePayload(raw);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect(Object.hasOwn(v, '__proto__')).toBe(false);
    expect(v.runs[0]!.text).toBe('t');
    expect(v.settings.appearance.fg).toBe('#ffffff');
    expect(Object.getPrototypeOf(v.settings.appearance)).toBe(Object.prototype);
  });

  it('does not read inherited fields as the payload’s', () => {
    const proto = { schema: 1, title: 'x', character: 'c', startUs: 0, runs: [], comments: [], cuts: [], markers: [] };
    refused(Object.create(proto));
  });
});

describe('the settings whitelist (ADR 0154 "What is uploaded")', () => {
  it('a payload’s settings hold only the sections the replay reads', () => {
    const p = base();
    expect(Object.keys(p.settings).sort()).toEqual([...REPLAY_SETTINGS_KEYS].sort());
    expect(Object.keys(validatePayload(oldShape(p)).settings).sort()).toEqual([...REPLAY_SETTINGS_KEYS].sort());
  });

  it('no stored login, credential, Comm history or other private field reaches a payload', () => {
    const s = defaultSettings() as unknown as Record<string, any>;
    // Fields a future version (or a damaged store) might hold: none is a section the replay reads.
    s.profile = 'MyPrivateProfile';
    s.login = { name: 'Rasta', password: 'hunter2' };
    s.cloud = { sessionKey: 'k3y', dataKey: 'dk' };
    s.commHistory = [{ text: 'secret tell' }];
    s.spotlights.characters = ['MyAlt'];
    s.phone.hotkeys[0] = { label: 'pw', command: 'say my secret plan', special: null, shown: true };
    s.input.autosuggest = true;
    s.windows.profile = { x: 1, y: 2, w: 3, h: 4 };
    // And inside sections the replay does read.
    s.appearance.password = 'hunter2';
    s.comm.history = ['secret tell'];
    s.mapper.token = 'k3y';
    const chainText = logPayload('gmcp-demo.log').runs[0]!.text;
    const p = buildReplayPayload(
      [{ meta: { runId: 'Rasta/a', character: 'Rasta', startedUs: 1, endedUs: null, sealed: true, bytes: 1, lines: 1 }, text: chainText }],
      [],
      defaultExportDoc('Rasta/a'),
      s as never,
    );
    const json = JSON.stringify(p.settings);
    for (const secret of ['MyPrivateProfile', 'hunter2', 'k3y', '"dk"', 'secret tell', 'MyAlt', 'secret plan']) expect(json).not.toContain(secret);
    for (const key of ['password', 'history', 'token', 'login', 'cloud', 'windows', 'spotlights', 'phone', 'input', 'profile']) {
      expect(json).not.toContain(`"${key}":`);
    }
    // The run's own text is what the cut keeps (ADR 0019); no payload field outside the schema.
    expect(Object.keys(p).sort()).toEqual(['character', 'comments', 'cuts', 'markers', 'runs', 'schema', 'settings', 'startUs', 'title']);
  });

  it('the replay reads the whitelisted sections back as the exporter had them', () => {
    const s = defaultSettings();
    s.appearance.fg = '#123456';
    s.comm.npcs = true;
    const back = migrateSettings(clone(replaySettings(s)), { recorded: true });
    expect(back.appearance.fg).toBe('#123456');
    expect(back.comm.npcs).toBe(true);
  });
});
