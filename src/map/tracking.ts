// Tracking (ADR 0020): turns the forwarded game events into the Scene the
// renderer draws: the player's room (locate.ts), the prespam path
// (path.ts) and the group mates (group.ts). Pure (no worker globals); the
// worker core (src/map/worker/core.ts) owns one Tracker.
//
// Event order (MMapper parser/mumexmlparser-gmcp.cpp): MUME sends
// `Event.Moved {dir}` and then `Room.Info` for the room arrived in. The
// move is kept until the next Room.Info, which is located with it and
// dequeues one prespam entry. A Room.Info without an Event.Moved before it
// counts as LOOK. A second Event.Moved before any Room.Info (MMapper fires
// the pending event there) steps blindly: the last room's exit is followed
// when it has exactly one target.
//
// Lost (ADR 0071): when a Room.Info after a real move is not located, the
// position still advances along the last room's exit when it has exactly
// one target (a tentative origin, drawn as not located), so the next
// Room.Info is located from where the player is rather than from a stale
// room. A match from a tentative origin by direction or text teaches no
// server ids.
//
// Troll exit mapping (Char.StatusVars race) only changes which sunlight
// flags MMapper records while mapping; a read-only map has no use for it,
// so Char.StatusVars is read for the player's name only.

import { EMPTY_SCENE, type Scene } from './scene';
import { GroupTable, PLAYER_COLOR } from './group';
import { type LearnedIds, type LocateHow, learnIds, locate, parseRoomInfo } from './locate';
import { DIR_COUNT, type Dir, EXIT_FLAG, type MapData, exitTargets } from './model';
import { LOOK, type Move, PrespamQueue, isDirection, parseMoveCommand, parseMovedDir, walkPath } from './path';
import type { MapEvent } from './protocol';

/** What one batch of events changed. */
export interface TrackResult {
  /** The scene differs from the one before the batch. */
  changed: boolean;
  /** A Room.Info (or blind step) was located: the view re-centres on the player. */
  moved: boolean;
  /** Server ids learned in this batch: [serverId, room]. */
  learned: [number, number][];
}

/** Locator statistics (tests, debugging). */
export interface TrackStats {
  roomInfos: number;
  byHow: Record<LocateHow, number>;
}

export class Tracker {
  private map: MapData | null = null;
  /** Map hash the learned ids belong to ('' = unknown). */
  private hash = '';
  readonly learned: LearnedIds = new Map();
  private room: number | null = null;
  private located = false;
  private how: LocateHow = 'none';
  /** The Event.Moved waiting for its Room.Info, or null. */
  private pending: Move | null = null;
  private readonly queue = new PrespamQueue();
  private readonly group = new GroupTable(PLAYER_COLOR);
  private selfName = '';
  private scene: Scene = EMPTY_SCENE;
  readonly stats: TrackStats = { roomInfos: 0, byHow: { id: 0, learned: 0, dir: 0, text: 0, none: 0 } };

  /** A new map: position and learned ids are dropped (the group table stays). */
  setMap(map: MapData | null, hash: string): void {
    this.map = map;
    if (hash !== this.hash) this.learned.clear();
    this.hash = hash;
    this.room = null;
    this.located = false;
    this.how = 'none';
    this.pending = null;
    this.queue.clear();
    this.scene = EMPTY_SCENE;
  }

  get mapHash(): string {
    return this.hash;
  }

  /** Adds stored ids for map `hash` (ignored for another map). Returns true when the scene changed. */
  addLearned(hash: string, ids: readonly (readonly [number, number])[]): boolean {
    if (hash !== this.hash || !this.map) return false;
    for (const [sid, room] of ids) {
      if (room >= 0 && room < this.map.roomCount && !this.learned.has(sid)) this.learned.set(sid, room);
    }
    return this.rebuild();
  }

  /** The current scene (a new object after every change). */
  get current(): Scene {
    return this.scene;
  }

  get status(): { located: boolean; room: number | null; how: LocateHow } {
    return { located: this.located, room: this.room, how: this.how };
  }

  /** Applies a batch in order. */
  apply(events: readonly MapEvent[]): TrackResult {
    const res: TrackResult = { changed: false, moved: false, learned: [] };
    for (const ev of events) this.one(ev, res);
    res.changed = this.rebuild();
    return res;
  }

  private one(ev: MapEvent, res: TrackResult): void {
    switch (ev.k) {
      case 'cmd': {
        const c = parseMoveCommand(ev.text);
        if (c !== null) this.queue.push(c);
        return;
      }
      case 'fail':
        if (ev.kind === 'dead') this.queue.clear();
        else this.queue.fail();
        return;
      case 'conn':
        if (ev.state === 'disconnected' || ev.state === 'connecting') {
          this.queue.clear();
          this.pending = null;
          // A live disconnect or a new connection forgets the group; a
          // finished replay keeps its last picture (as the panes do).
          if (!(ev.state === 'disconnected' && ev.replay)) this.group.clear();
        }
        return;
      case 'resync':
        this.queue.clear();
        this.pending = null;
        return;
      case 'gmcp':
        this.gmcp(ev.pkg, ev.data, res);
        return;
      default:
        return;
    }
  }

  private gmcp(pkg: string, data: unknown, res: TrackResult): void {
    switch (pkg.toLowerCase()) {
      case 'event.moved': {
        if (this.pending !== null) this.blindStep(this.pending, res);
        this.pending = parseMovedDir(data);
        return;
      }
      case 'room.info': {
        const move: Move = this.pending ?? LOOK;
        this.pending = null;
        this.queue.arrive(move);
        const map = this.map;
        const info = parseRoomInfo(data);
        if (!map || !info) return;
        const wasLocated = this.located;
        const tentative = !wasLocated && this.room !== null;
        const r = locate(map, this.learned, info, this.room, move, wasLocated);
        this.stats.roomInfos++;
        this.stats.byHow[r.how]++;
        this.how = r.how;
        if (r.room === null) {
          this.located = false;
          // Follow the move tentatively so the next Room.Info starts from the right room.
          if (this.room !== null && isDirection(move)) {
            const t = singleExit(map, this.room, move);
            if (t !== null) {
              this.room = t;
              res.moved = true;
            }
          }
          return;
        }
        this.room = r.room;
        this.located = true;
        res.moved = true;
        // A direction or text match from a tentative origin may be a lookalike: learn nothing from it.
        if (tentative && (r.how === 'dir' || r.how === 'text')) return;
        for (const p of learnIds(map, this.learned, info, r.room, r.how)) res.learned.push(p);
        return;
      }
      case 'char.statusvars': {
        const n = typeof data === 'object' && data !== null ? (data as { name?: unknown }).name : undefined;
        if (typeof n === 'string') this.selfName = n;
        return;
      }
      default:
        this.group.apply(pkg, data);
        return;
    }
  }

  /** An Event.Moved whose Room.Info never came: follow the exit if it is unambiguous. */
  private blindStep(move: Move, res: TrackResult): void {
    this.queue.arrive(move);
    const map = this.map;
    if (!map || this.room === null || !isDirection(move)) return;
    if ((map.exitFlags[this.room * DIR_COUNT + move]! & EXIT_FLAG.EXIT) === 0) return;
    const t = singleExit(map, this.room, move);
    if (t === null) {
      this.located = false;
      return;
    }
    this.room = t;
    res.moved = true;
  }

  /** Recomputes the scene; true when it differs from the previous one. */
  private rebuild(): boolean {
    const map = this.map;
    const path = map ? walkPath(map, this.located ? this.room : null, this.queue.items) : [];
    const members = map ? this.group.members((sid) => this.resolve(sid)) : [];
    const self = this.selfName.toLowerCase();
    const shown = self === '' ? members : members.filter((m) => m.npc || m.text.toLowerCase() !== self);
    const next: Scene = { room: this.room, located: this.located, color: PLAYER_COLOR, path, members: shown };
    if (sameScene(this.scene, next)) return false;
    this.scene = next;
    return true;
  }

  private resolve(serverId: number): number | null {
    const map = this.map;
    if (!map) return null;
    return map.byServerId.get(serverId) ?? this.learned.get(serverId) ?? null;
  }
}

/** The one target of `room`'s exit `dir` (EXIT flag set), else null. */
function singleExit(map: MapData, room: number, dir: Dir): number | null {
  if ((map.exitFlags[room * DIR_COUNT + dir]! & EXIT_FLAG.EXIT) === 0) return null;
  const t = exitTargets(map, room, dir);
  return t.length === 1 ? t[0]! : null;
}

function sameScene(a: Scene, b: Scene): boolean {
  if (a.room !== b.room || a.located !== b.located || a.color !== b.color) return false;
  if (a.path.length !== b.path.length || a.members.length !== b.members.length) return false;
  for (let i = 0; i < a.path.length; i++) if (a.path[i] !== b.path[i]) return false;
  for (let i = 0; i < a.members.length; i++) {
    const x = a.members[i]!;
    const y = b.members[i]!;
    if (x.id !== y.id || x.room !== y.room || x.text !== y.text || x.color !== y.color || x.npc !== y.npc) return false;
  }
  return true;
}
