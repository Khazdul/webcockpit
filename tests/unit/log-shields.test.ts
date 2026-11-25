// @vitest-environment happy-dom
// Shields in a log (ADR 0166 addendum 41): the live App writes the four
// shields into the run log as a private `WebCockpit.Shields` GMCP record
// when they change; every player applies it to `game.info`, so the Status
// tab's shields show in a log; it is never text, never in an export's
// text, and no script sees it.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/app';
import { Bus } from '../../src/core/bus';
import { formatGmcpRecord } from '../../src/capture/format';
import { SETTLE_MS } from '../../src/gmcp/info-poll';
import { SHIELDS_GMCP, parseShields } from '../../src/gmcp/info-model';
import { GameState } from '../../src/gmcp/state';
import { PlayerHost } from '../../src/app/player-host';
import { RunStore } from '../../src/runs/store';
import { Recorder } from '../../src/capture/recorder';
import { FakeScheduler } from '../../src/script/engine/timers';
import { GmcpCache } from '../../src/scripts/gmcp-cache';
import { SettingsStore, defaultSettings } from '../../src/settings';
import { defaultExportDoc } from '../../src/share/edits';
import { buildReplayPayload } from '../../src/share/payload';
import { buildTextExport } from '../../src/share/text';
import { ANSWER_FIELDS, GA, XML_PROMPT, answerPulse, pollNonce, wire } from '../fixtures/info-poll-answer';
import { FakeSocket, sb, utf8 } from './net-helpers';
import { BASE_US, FakeWall, makeLog, meta } from './player-helpers';

const PROMPT = XML_PROMPT + GA;
const gmcp = (pkg: string, data: unknown): number[] => sb(201, utf8(`${pkg} ${JSON.stringify(data)}`));
const SHIELDS = { ob: 81, db: 13, pb: 85, abs: 70 };
const SHIELDS_LINE = `\x1bGMCP ${SHIELDS_GMCP} ${JSON.stringify(SHIELDS)}`;

const apps: App[] = [];
const hosts: PlayerHost[] = [];
afterEach(() => {
  for (const a of apps.splice(0)) a.dispose();
  for (const h of hosts.splice(0)) h.close();
  document.body.innerHTML = '';
});

function live() {
  const root = document.createElement('div');
  document.body.append(root);
  const sched = new FakeScheduler();
  const sock = new FakeSocket();
  const factory = new IDBFactory();
  const app = new App({
    root,
    socketFactory: () => sock,
    scheduler: sched,
    now: () => 1_790_000_000_000 + sched.now(),
    recorder: {
      openStore: () => RunStore.open(factory),
      locks: { request: (_n, _o, cb) => Promise.resolve(cb({})) },
      win: null,
      flushMs: 60_000,
    },
    requestFrame: () => {},
    paneRequestFrame: () => {},
    paneDb: null,
    clockStorage: null,
  });
  apps.push(app);
  const heard: string[] = [];
  app.bus.on('text.line', (l) => heard.push(l.text));
  app.bus.on('text.display', (d) => heard.push(d.line.text));
  app.bus.on('sys.message', (m) => heard.push(m.text));
  const frame = (...parts: (string | number[])[]): void => sock.data(parts.flatMap((p) => (typeof p === 'string' ? wire(p) : p)));
  const sent = (): string => new TextDecoder('latin1').decode(Uint8Array.from(sock.sentBytes()));
  const login = (): void => {
    app.connectLive();
    sock.open();
    frame([255, 251, 201]);
    frame(gmcp('Char.Name', { name: 'Rasta' }));
    frame(gmcp('Char.Vitals', { hp: 100, maxhp: 200 }), PROMPT);
    sched.advance(SETTLE_MS);
  };
  /** Answers the latest poll, then asks for the next one. */
  const answer = (fields: readonly string[] = ANSWER_FIELDS): void => {
    frame(answerPulse(pollNonce(sent())!, { queued: true, fields }));
    app.infoPoll!.open();
    sched.advance(60_000);
  };
  const log = async (): Promise<string> => {
    await app.recorder.idle();
    await app.recorder.flush();
    const store = (await app.recorder.getStore())!;
    return (await store.getChunks(app.recorder.runId!)).map((c) => c.text).join('');
  };
  return { app, sched, sock, heard, frame, sent, login, answer, log };
}

const shieldLines = (log: string): string[] => log.split('\n').filter((l) => l.includes(SHIELDS_GMCP));

describe('recording the shields', () => {
  it('one record per change, the four values only; nothing on the bus or the screen', async () => {
    const t = live();
    t.login();
    t.answer();
    t.answer();
    t.answer();
    expect(shieldLines(await t.log())).toEqual([expect.stringMatching(/^\d{16} /)]);
    expect(shieldLines(await t.log())[0]!.slice(17)).toBe(SHIELDS_LINE);
    // OB changes: a second record; then the same again: none.
    const fields = [...ANSWER_FIELDS];
    fields[1] = '90';
    t.answer(fields);
    t.answer(fields);
    const lines = shieldLines(await t.log());
    expect(lines.map((l) => l.slice(17))).toEqual([SHIELDS_LINE, `\x1bGMCP ${SHIELDS_GMCP} ${JSON.stringify({ ...SHIELDS, ob: 90 })}`]);
    for (const l of lines) for (const trace of ['GoblinTown', 'warlord', 'str', 'wimpy']) expect(l).not.toContain(trace);
    expect(t.heard.join('\n')).not.toContain(SHIELDS_GMCP);
    expect(t.app.output.el.textContent).not.toContain(SHIELDS_GMCP);
  });

  it('the recorder: a write per change in each run, the first of a new run again', async () => {
    const bus = new Bus();
    let clock = BASE_US;
    const rec = new Recorder(bus, {
      openStore: () => RunStore.open(new IDBFactory()),
      locks: { request: (_n, _o, cb) => Promise.resolve(cb({})) },
      win: null,
      flushMs: 60_000,
      now: () => (clock += 1000),
    });
    const play = (): void => {
      bus.emit('conn.state', { state: 'connecting', prev: 'idle' });
      bus.emit('conn.state', { state: 'login', prev: 'connecting' });
      bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Rasta' } });
      bus.emit('conn.state', { state: 'playing', prev: 'login' });
    };
    const runLog = async (): Promise<string> => {
      await rec.flush();
      const store = (await rec.getStore())!;
      return (await store.getChunks(rec.runId!)).map((c) => c.text).join('');
    };
    play();
    await rec.idle();
    bus.emit('info.shields', SHIELDS);
    bus.emit('info.shields', { ...SHIELDS });
    bus.emit('info.shields', { ...SHIELDS, abs: null });
    bus.emit('info.shields', { ...SHIELDS, abs: null });
    expect(shieldLines(await runLog()).map((l) => l.slice(17))).toEqual([
      SHIELDS_LINE,
      `\x1bGMCP ${SHIELDS_GMCP} ${JSON.stringify({ ...SHIELDS, abs: null })}`,
    ]);
    const first = rec.runId;
    bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
    await rec.idle();
    play();
    await rec.idle();
    expect(rec.runId).not.toBe(first);
    bus.emit('info.shields', SHIELDS);
    expect(shieldLines(await runLog()).map((l) => l.slice(17))).toEqual([SHIELDS_LINE]);
    rec.dispose();
  });

  it('a live connection ignores a WebCockpit.Shields GMCP from the server', () => {
    const t = live();
    t.login();
    t.frame(gmcp(SHIELDS_GMCP, SHIELDS));
    expect(t.app.game.info.answer).toBeNull();
  });
});

/** A short run: login, vitals, a line, the shields at 5 s, a line at 6 s. */
function shieldsRun(): string {
  return (
    makeLog(BASE_US, [
      { at: 0, gmcp: 'Char.Name', json: { name: 'Rasta' } },
      { at: 0.1, gmcp: 'Char.Vitals', json: { hp: 100, maxhp: 200 } },
      { at: 1, in: 'A room.' },
    ]) +
    formatGmcpRecord(BASE_US + 5e6, SHIELDS_GMCP, JSON.stringify(SHIELDS)) +
    makeLog(BASE_US, [{ at: 6, in: 'Later.' }])
  );
}

describe('playing the shields', () => {
  it('the log player: game.info has the shields from the record on; Stats stay without a poll', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    void settings.load();
    const wall = new FakeWall();
    const host = new PlayerHost({ root, settings, wall, onClose: () => {} });
    hosts.push(host);
    host.openChain([{ meta: meta('Rasta/a', BASE_US), text: shieldsRun() }], [], { character: 'Rasta', level: 41 }, { autoplay: false });
    const eng = host.engine!;
    eng.seek(2000);
    wall.flush();
    expect(host.app!.game.info.answer).toBeNull();
    eng.seek(5500);
    wall.flush();
    const info = host.app!.game.info;
    expect(info.answer).toMatchObject(SHIELDS);
    expect(info.answer!.level).toBeNull();
    expect(info.at).toBeNull();
    expect(info.complete).toBe(false);
    host.app!.output.flush();
    const out = host.app!.output.el.textContent ?? '';
    expect(out).toContain('Later.');
    expect(out).not.toContain(SHIELDS_GMCP);
    expect(out).not.toContain('"ob"');
    // A backward seek rebuilds: before the record, none again.
    eng.seek(1000);
    wall.flush();
    expect(host.app!.game.info.answer).toBeNull();
  });

  it('a replay in the live App applies it; a script sees MUME\'s GMCP and not the record', async () => {
    const t = live();
    expect(t.app.applyProfile('#event {IAC SB GMCP} {#showme gmcp-event %0}\n').ok).toBe(true);
    t.app.startReplay(shieldsRun(), 'test.log', 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(t.app.game.info.answer).toMatchObject(SHIELDS);
    const out = t.heard.join('\n');
    expect(out).toContain('Later.');
    expect(out).toContain('gmcp-event Char.Vitals');
    expect(out).not.toContain(SHIELDS_GMCP);
  });

  it("the scripts' gmcp table: the record goes to the game state, not into the cache", () => {
    const bus = new Bus();
    const game = new GameState().attach(bus);
    const cache = new GmcpCache();
    const before: string[] = [];
    cache.attach(bus, (m) => {
      before.push(m.pkg);
      game.take(m);
    });
    bus.emit('conn.state', { state: 'connecting', prev: 'idle', replay: true });
    bus.emit('gmcp', { pkg: 'Char.Vitals', key: 'char.vitals', data: { hp: 1 } });
    bus.emit('gmcp', { pkg: SHIELDS_GMCP, key: SHIELDS_GMCP.toLowerCase(), data: SHIELDS });
    expect(before).toEqual(['Char.Vitals', SHIELDS_GMCP]);
    expect(cache.get('char.vitals')).toBeDefined();
    expect(cache.get(SHIELDS_GMCP.toLowerCase())).toBeUndefined();
    expect([...cache.entries()].map((e) => e.pkg)).toEqual(['Char.Vitals']);
    expect(game.info.answer).toMatchObject(SHIELDS);
  });

  it('a bad record is ignored, a partial one takes what it has', () => {
    expect(parseShields(null)).toBeNull();
    expect(parseShields([1, 2])).toBeNull();
    expect(parseShields({ ob: 'x', db: 1.5, pb: 1e9 })).toBeNull();
    expect(parseShields({ ob: -5, abs: 3, level: 99 })).toEqual({ ob: -5, db: null, pb: null, abs: 3 });
  });
});

describe('exports', () => {
  const chain = () => [{ meta: meta('Rasta/a', BASE_US, { summary: { startUs: BASE_US, lastEventUs: BASE_US + 6e6, level: 41, kills: 0, pkills: 0, deaths: 0 } }), text: shieldsRun() }];

  it('the text export has no trace of it', () => {
    const text = buildTextExport(chain(), defaultExportDoc('Rasta/a'));
    expect(text).toContain('Later.');
    expect(text).not.toContain(SHIELDS_GMCP);
    expect(text).not.toContain('"ob"');
  });

  it('the replay payload (HTML export, share link) keeps it, also inside an excluded range', () => {
    const p = buildReplayPayload(chain(), [], defaultExportDoc('Rasta/a'), defaultSettings());
    expect(p.runs[0]!.text).toContain(SHIELDS_LINE);
    const cut = buildReplayPayload(chain(), [], { ...defaultExportDoc('Rasta/a'), excludes: [[BASE_US + 2e6, BASE_US + 5.5e6]] }, defaultSettings());
    expect(cut.runs[0]!.text).toContain(SHIELDS_LINE);
  });
});
