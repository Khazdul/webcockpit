// Helpers for the excluded-state fold tests (ADR 0019 addendum "Excluded
// state folding"): play a replay payload in a real PlayerHost and read
// what the viewer sees, and follow it with a headless map Tracker.
import { PlayerHost } from '../../src/app/player-host';
import { MapEventForwarder } from '../../src/map/client';
import type { MapData } from '../../src/map/model';
import type { MapEvent } from '../../src/map/protocol';
import { Tracker } from '../../src/map/tracking';
import { SettingsStore } from '../../src/settings';
import { captureEntries, isVisible } from '../../src/share/capture';
import { type ReplayPayload, payloadEdits } from '../../src/share/payload';
import { type Timeline, buildTimeline } from '../../src/player/timeline';
import { FakeWall } from './player-helpers';

/** What a viewer sees of a player App, as JSON per part. */
export type Digest = Record<string, string>;

/** Opens `p` in a PlayerHost (paused) on a fake wall. */
export function openPayload(p: ReplayPayload): { host: PlayerHost; wall: FakeWall; tl: Timeline } {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  void settings.load();
  settings.update(() => JSON.parse(JSON.stringify(p.settings)) as never);
  const wall = new FakeWall();
  const host = new PlayerHost({ root, settings, wall, onClose: () => {} });
  host.openChain(p.runs, [], { character: p.character, level: p.level }, {
    edits: payloadEdits(p),
    ...(p.hiddenSys?.length ? { hiddenSys: p.hiddenSys } : {}),
    autoplay: false,
  });
  return { host, wall, tl: buildTimeline(p.runs, payloadEdits(p)) };
}

/** Seeks to `ms` and reads the App. */
export function digestAt(host: PlayerHost, wall: FakeWall, ms: number): Digest {
  const eng = host.engine!;
  eng.seek(ms);
  wall.flush();
  return digest(host);
}

/** The App's state as the panes draw it. */
export function digest(host: PlayerHost): Digest {
  const app = host.app!;
  const g = app.game;
  const now = host.engine!.clock.now();
  const comm = app.cockpit.pane('comm') as unknown as { channels?: unknown; history?: unknown; character?: unknown };
  const ui = app.cockpit.pane('ui') as unknown as { messages?: unknown };
  app.output.flush();
  const spanes = app.cockpit.scriptPanes().map((s) => ({ id: s.id, title: s.title }));
  return {
    char: JSON.stringify(g.char.view()),
    charAnchors: JSON.stringify([g.char.anchorXp, g.char.anchorTp, [...g.char.vitals].sort(), [...g.char.statusVars].sort()]),
    group: JSON.stringify([g.group.list(), g.group.unlabeled()]),
    clock: JSON.stringify(g.clock.state),
    timers: JSON.stringify(g.timers.view(now)),
    settings: JSON.stringify((app as unknown as { settings: SettingsStore }).settings.get()),
    ui: JSON.stringify(ui.messages ?? null),
    comm: JSON.stringify([comm.channels ?? null, comm.history ?? null, comm.character ?? null]),
    output: app.output.el.textContent ?? '',
    spanes: JSON.stringify(spanes),
    clockUs: String(host.engine!.clock.nowUs()),
  };
}

/** Log µs to compare at: each cut's first kept entry after it (several share a playback time). */
export function checkpoints(p: ReplayPayload): number[] {
  const out: number[] = [];
  for (const [, to] of p.cuts) {
    if (to === null) continue;
    let best = Infinity;
    for (const r of p.runs) {
      for (const e of captureEntries(r.text)) {
        if (e.ts >= to) {
          best = Math.min(best, e.ts);
          break;
        }
      }
    }
    if (best !== Infinity) out.push(best);
  }
  return out;
}

/** `p` up to log µs `us` (inclusive): played to its end, it shows the state there. */
export function prefixPayload(p: ReplayPayload, us: number): ReplayPayload {
  const runs: ReplayPayload['runs'] = [];
  for (const r of p.runs) {
    let text = '';
    for (const e of captureEntries(r.text)) if (e.ts <= us) text += e.line;
    if (text) runs.push({ meta: r.meta, text });
  }
  const hidden = (p.hiddenSys ?? []).filter((i) => i < runs.length);
  return { ...p, runs, comments: [], ...(hidden.length ? { hiddenSys: hidden } : { hiddenSys: undefined }) } as ReplayPayload;
}

/** The digest after playing `p` to its end. */
export function digestEnd(p: ReplayPayload): Digest {
  const o = openPayload(p);
  const d = digestAt(o.host, o.wall, o.tl.durationMs);
  o.host.dispose();
  return d;
}

/** The kept entries' (log µs, playback ms) pairs of a timeline. */
export function keptPlays(p: ReplayPayload, tl: Timeline): string {
  const inCut = (t: number) => p.cuts.some(([a, b]) => t >= a && t < (b ?? Infinity));
  const out: string[] = [];
  for (let i = 0; i < tl.n; i++) if (!inCut(tl.ts[i]!)) out.push(`${tl.ts[i]}@${tl.play[i]}`);
  return out.join(',');
}

/** One map state the replay reaches: after each kept Room.Info. */
export interface TrackPoint {
  ts: number;
  room: string;
  located: boolean;
  path: string;
  members: string;
}

/**
 * Follows a payload with a headless Tracker on `map` (forwarding always
 * on) and returns the state after each Room.Info outside every cut; rooms
 * are named by their coordinates and name, so two map subsets compare.
 */
export function trackPayload(p: ReplayPayload, map: MapData): TrackPoint[] {
  const t = new Tracker();
  t.setMap(map, 'x');
  const inCut = (ts: number) => p.cuts.some(([a, b]) => ts >= a && ts < (b ?? Infinity));
  const name = (r: number | null): string => (r === null ? '-' : `${map.x[r]},${map.y[r]},${map.z[r]} ${map.names[r]}`);
  const out: TrackPoint[] = [];
  let buf: MapEvent[] = [];
  const fwd = new MapEventForwarder((evs) => void buf.push(...evs), (cb) => cb());
  const SGR = /\x1b\[[0-9;]*m/g;
  for (const run of p.runs) {
    buf = [];
    fwd.onConn({ state: 'connecting', prev: 'disconnected', replay: true } as never);
    t.apply(buf);
    for (const e of captureEntries(run.text)) {
      buf = [];
      let room = false;
      if (e.kind === 'out') fwd.onCmd({ text: e.body, ts: 0 } as never);
      else if (e.kind === 'in') fwd.onLine({ text: e.body.replace(SGR, ''), raw: e.body, runs: [], tags: [], prompt: false, ts: 0 } as never);
      else if (e.kind === 'gmcp') {
        const sp = e.body.indexOf(' ');
        let data: unknown;
        try {
          data = sp < 0 ? undefined : JSON.parse(e.body.slice(sp + 1));
        } catch {
          data = undefined;
        }
        fwd.onGmcp({ pkg: e.pkg!, data } as never);
        room = e.pkg!.toLowerCase() === 'room.info';
      }
      if (buf.length) t.apply(buf);
      if (room && !inCut(e.ts)) {
        const s = t.current;
        out.push({
          ts: e.ts,
          room: name(s.room),
          located: s.located,
          path: s.path.map(name).join(';'),
          members: s.members.map((m) => `${m.id}:${m.text}@${name(m.room)}#${m.color}`).join(';'),
        });
      }
    }
    buf = [];
    fwd.onConn({ state: 'disconnected', prev: 'playing', replay: true } as never);
    t.apply(buf);
  }
  return out;
}

/** Text bytes of a payload's runs by entry kind (GMCP by package). */
export function sizesByKind(p: ReplayPayload): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of p.runs) {
    for (const e of captureEntries(r.text)) {
      const k = e.kind === 'gmcp' ? `GMCP ${e.pkg}` : isVisible(e) ? 'text' : e.kind.toUpperCase();
      out[k] = (out[k] ?? 0) + e.line.length;
    }
  }
  return out;
}
