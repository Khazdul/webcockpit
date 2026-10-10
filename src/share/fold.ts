// Excluded state folding (ADR 0019 addendum "Excluded state folding"): the
// records an excluded range keeps (src/share/payload.ts `editRunText`) are
// cut down to the few that leave the player in the same state at the
// range's end. Pure; runs on the edited run texts of the payload, before
// the timers records are added.
//
// Inside a range every entry is one of:
//
//   kept as is   a guard (closer than GUARD_US to the kept entry before or
//                after the range: RoomNotes pairs an exits line with a
//                Room.Info within PAIR_MS, the kill fold reads the vitals
//                KILL_FOLD_MS after a kept death line), a VIEW or SPANE,
//                GMCP with bad JSON (it prints a line), Char.Name,
//                Char.StatusVars, Core.*, Event.Sun / Moon / Achieved,
//                WebCockpit.*, an unknown package, a Room.Info or
//                Event.Moved while the map's prespam queue may hold a
//                kept command, and the first Room.Info of the payload (the
//                embedded map opens on the first visited room). These are
//                barriers: the folding below never moves state across one.
//   folded       Char.Vitals, Group.*, Room.Info, Event.Moved and
//                Comm.Channel.List between two barriers (a segment) become
//                one block at the time of the segment's last entry.
//   dropped      SIZE (the player does not use it), Room.* other than
//                Room.Info, Client.*, Event.Darkness, External.Discord.*,
//                MUME.Client.* (nothing in a player App reads them) and
//                unknown record types (the timeline skips them).
//
// The block, in order:
//
//   Char.Vitals {xp, tp}   the first numbers seen, when they differ from
//                          the last (CharModel takes its session anchors
//                          from the first xp / tp after a reset)
//   Char.Vitals {xp}       the lowest xp, when it is below both (the run
//                          events' kill fold anchor is a running minimum)
//   Char.Vitals {…}        every key seen, with its last value
//   Group.*                the skeleton: every Set, Add and Remove, and each
//                          Update that adds an entry (an id the map's table
//                          does not know) or carries a type, cut to
//                          `{id, type}`, in order, so GroupModel and the
//                          map's GroupTable (insertion order, hue
//                          generator) see the same structure; then one
//                          Group.Update per table entry with its final
//                          name, label and mapid, and for a GroupModel
//                          member its type and vitals (`{id, label: 0}`
//                          after it when the model has no label but the
//                          table keeps a string one)
//   Event.Moved            the one just before the last Room.Info
//   Room.Info              the last one
//   Event.Moved            those after it
//   Comm.Channel.List      the last one the Comm pane takes
//
// The block is checked: CharModel, GroupModel (members, unlabeled NPCs,
// fight identities) and GroupTable (entries, hue generator) fed the
// segment and fed the block from the same state must end equal, and the
// run events' xp (last and lowest) must agree. When they do not, the
// segment's records are kept as they are.
//
// Pacing: the replay clock (src/player/clock.ts) fires timers at their
// own times through steps of up to CATCH_UP_US, and catches up over a
// longer one. An entry the folding removes is replaced by a no-op SIZE
// record (`PACE_JSON`, which `parseSize` rejects) where the clock would
// otherwise take a different path: at both ends of a gap longer than
// CATCH_UP_US, where leaving it out would make a step longer than that,
// at a run's first entry and at a segment's last entry. Timer fire times
// (the timers tick, the kill fold) stay as they were, and so do the
// timeline's log times inside a cut's stretch.
//
// What stays different (accepted, ADR 0019 addendum): the map's position
// after a folded Room.Info that its server id does not locate (it is
// located from the room before the segment, and the server ids the
// segment's Room.Infos taught are not learned); intermediate frames while
// a long range plays in are not drawn.

import { RECORD, formatRecord, formatTs } from '../capture/format';
import { CharModel } from '../gmcp/char';
import { parseChannelList } from '../gmcp/comm';
import { GroupModel, normLabel } from '../gmcp/group';
import { GroupTable } from '../map/group';
import { PAIR_MS } from '../map/notes';
import { parseMoveCommand } from '../map/path';
import { parseGmcp } from '../net/gmcp';
import { CATCH_UP_US } from '../player/clock';
import { KILL_FOLD_MS } from '../runs/events';
import { type CaptureEntry, captureEntries } from './capture';
import type { ExcludeRange } from './edits';

/** In-range entries this close to a kept entry are kept as they are, µs. */
export const GUARD_US = Math.max(PAIR_MS, KILL_FOLD_MS) * 1000;
/** The pacing record's payload: a SIZE the player ignores. */
export const PACE_JSON = '{"pace":1}';

/** Counters of a fold (tests, the real-log check). */
export interface FoldStats {
  segments: number;
  /** Segments kept as they are because the check failed. */
  fallbacks: number;
  paces: number;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const intId = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

type Fold = 'vitals' | 'group' | 'room' | 'moved' | 'ccl' | 'drop';

interface SegEntry {
  e: CaptureEntry;
  fold: Fold;
  pkg: string;
  data: unknown;
  /** Group.*: the skeleton body, or null when the record goes. */
  skeleton?: string | null;
}

/** True for GMCP no player App reads (key in lower case). */
function unread(key: string): boolean {
  return (
    (key.startsWith('room.') && key !== 'room.info') ||
    key.startsWith('client.') ||
    key === 'event.darkness' ||
    key.startsWith('external.discord') ||
    key.startsWith('mume.client')
  );
}

/** True when `t` lies in one of `cuts` (sorted, non-overlapping). */
function inCuts(cuts: readonly ExcludeRange[], t: number): boolean {
  let lo = 0;
  let hi = cuts.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cuts[mid]![0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t < (cuts[lo - 1]![1] ?? Infinity);
}

/** Index of the first element of sorted `a` that is ≥ `x`. */
function lowerBound(a: readonly number[], x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid]! < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A deep copy that keeps class prototypes (the models hold Maps, arrays and plain objects). */
function cloneDeep<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, cloneDeep(x)])) as T;
  if (Array.isArray(v)) return v.map((x) => cloneDeep(x)) as T;
  const o = Object.create(Object.getPrototypeOf(v) as object) as Record<string, unknown>;
  for (const k of Object.keys(v)) o[k] = cloneDeep((v as Record<string, unknown>)[k]);
  return o as T;
}

/** The game models the player feeds from GMCP (the parts folding touches). */
class Models {
  char = new CharModel();
  group = new GroupModel();
  table = new GroupTable();

  apply(pkg: string, key: string, data: unknown): void {
    if (key.startsWith('char.')) {
      this.char.apply(pkg, data);
      if (key === 'char.vitals') this.group.apply(pkg, data);
    } else if (key === 'group.set' || key === 'group.add' || key === 'group.update' || key === 'group.remove') {
      this.group.apply(pkg, data);
      this.table.apply(pkg, data);
    }
  }

  clone(): Models {
    const m = new Models();
    m.char = cloneDeep(this.char);
    m.group = cloneDeep(this.group);
    m.table = cloneDeep(this.table);
    return m;
  }

  /** The state the panes and the map draw from, as a string. */
  key(): string {
    const c = this.char;
    const sorted = (m: Map<string, unknown>): Array<[string, unknown]> => [...m].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const g = this.group as unknown as { buffer: string | null; opponent: string | null };
    return JSON.stringify([
      c.name,
      c.fullname,
      sorted(c.statusVars),
      sorted(c.vitals),
      c.anchorXp,
      c.anchorTp,
      this.group.list(),
      this.group.unlabeled(),
      g.buffer,
      g.opponent,
      this.table.entries(),
      this.table.colorState(),
    ]);
  }
}

/** The xp the run events see: the lowest and the last number of a vitals sequence. */
function xpTrace(seq: readonly unknown[]): string {
  let min: number | null = null;
  let last: number | null = null;
  for (const d of seq) {
    if (!isObj(d)) continue;
    const xp = num(d.xp);
    if (xp === null) continue;
    last = xp;
    if (min === null || xp < min) min = xp;
  }
  return `${min}|${last}`;
}

/** `{id, type}` of a Group.* member object (type only when it is a string). */
function reduceMember(o: Obj): Obj {
  return typeof o.type === 'string' ? { id: o.id, type: o.type } : { id: o.id };
}

/**
 * The payload's run texts (after `editRunText`, oldest first) with the
 * state inside the excluded ranges folded (see the file header). `cuts`
 * are the payload's sorted, non-overlapping ranges.
 */
export function foldExcludedState(texts: readonly string[], cuts: readonly ExcludeRange[], stats?: FoldStats): string[] {
  if (cuts.length === 0) return [...texts];
  // Kept entries of the whole chain (the guards look across runs).
  const kept: number[] = [];
  for (const t of texts) for (const e of captureEntries(t)) if (!inCuts(cuts, e.ts)) kept.push(e.ts);
  kept.sort((a, b) => a - b);
  const models = new Models();
  let firstRoom = true;
  return texts.map((t) => {
    const r = foldRun(t, cuts, kept, models, firstRoom, stats);
    firstRoom = r.firstRoom;
    return r.text;
  });
}

function foldRun(
  text: string,
  cuts: readonly ExcludeRange[],
  kept: readonly number[],
  models: Models,
  firstRoomIn: boolean,
  stats: FoldStats | undefined,
): { text: string; firstRoom: boolean } {
  // A new connection: the panes' models start empty, the map's table is
  // cleared (its hue generator goes on), the prespam queue is empty.
  models.char = new CharModel();
  models.group = new GroupModel();
  models.table.clear();
  let firstRoom = firstRoomIn;
  /** Upper bound of the map's prespam queue length, and its pending Event.Moved. */
  let queue = 0;
  let pending = false;
  let out = '';
  let lastWritten: number | null = null;
  let seenEntry = false;

  let seg: SegEntry[] = [];
  let segStart: Models | null = null;
  let segRunStart = false;

  const paceLine = (ts: number): string => {
    if (stats) stats.paces++;
    return paceRecord(ts);
  };

  /** Tracks what the map's prespam queue and pending move do with `e` (every entry, kept or not). */
  const track = (e: CaptureEntry, key: string): void => {
    if (e.kind === 'out') {
      if (parseMoveCommand(e.body) !== null) queue++;
    } else if (key === 'room.info') {
      if (queue > 0) queue--;
      pending = false;
    } else if (key === 'event.moved') {
      if (pending && queue > 0) queue--;
      pending = true;
    }
  };

  const write = (e: CaptureEntry, pkg: string, key: string, data: unknown): void => {
    flush();
    out += e.line;
    lastWritten = e.ts;
    models.apply(pkg, key, data);
    track(e, key);
  };

  const flush = (): void => {
    const m = seg.length;
    if (m === 0) return;
    if (stats) stats.segments++;
    const T = seg[m - 1]!.e.ts;
    const block = buildBlock(seg, models, segStart!);
    if (block === null && stats) stats.fallbacks++;
    // Which of the segment's entries get a line at their time.
    const written: boolean[] = seg.map((s) => block === null && s.fold !== 'drop');
    written[m - 1] = true;
    if (segRunStart) written[0] = true;
    pace(
      lastWritten,
      seg.map((s) => s.e.ts),
      null,
      written,
    );
    for (let i = 0; i < m; i++) {
      const s = seg[i]!;
      if (block === null && s.fold !== 'drop') out += s.e.line;
      else if (i === m - 1 && block !== null) {
        if (block.length === 0) out += paceLine(T);
        else for (const body of block) out += formatTs(T) + ' \x1b' + RECORD.gmcp + ' ' + body + '\n';
      } else if (written[i]) out += paceLine(s.e.ts);
    }
    lastWritten = T;
    seg = [];
    segStart = null;
  };

  for (const e of captureEntries(text)) {
    const isEntry = e.kind !== 'record';
    const runStart = isEntry && !seenEntry;
    if (isEntry) seenEntry = true;
    let key = '';
    let data: unknown;
    let bad = false;
    let pkg = '';
    if (e.kind === 'gmcp') {
      const g = parseGmcp(e.body);
      pkg = g.pkg;
      key = g.pkg.toLowerCase();
      data = g.data;
      bad = g.error !== undefined;
    }
    if (!inCuts(cuts, e.ts)) {
      if (key === 'room.info') firstRoom = false;
      write(e, pkg, key, data);
      continue;
    }
    // The timeline skips unknown record types: so can the file.
    if (!isEntry) continue;
    let fold: Fold | null = null;
    const k = lowerBound(kept, e.ts);
    const before = k > 0 ? kept[k - 1]! : null;
    const after = k < kept.length ? kept[k]! : null;
    const guard = (before !== null && e.ts < before + GUARD_US) || (after !== null && e.ts > after - GUARD_US);
    if (guard) fold = null;
    else if (e.kind === 'size') fold = 'drop';
    else if (e.kind === 'gmcp' && !bad) {
      if (key === 'char.vitals') fold = isObj(data) ? 'vitals' : null;
      else if (key === 'group.set' || key === 'group.add' || key === 'group.update' || key === 'group.remove') fold = 'group';
      else if (key === 'room.info') fold = queue > 0 || firstRoom ? null : 'room';
      else if (key === 'event.moved') fold = queue > 0 ? null : 'moved';
      else if (key === 'comm.channel.list') fold = 'ccl';
      else if (unread(key)) fold = 'drop';
    }
    if (key === 'room.info') firstRoom = false;
    if (fold === null) {
      write(e, pkg, key, data);
      continue;
    }
    if (seg.length === 0) {
      segStart = models.clone();
      segRunStart = runStart;
    }
    const s: SegEntry = { e, fold, pkg, data };
    if (fold === 'group') s.skeleton = skeleton(key, pkg, data, e.body, models);
    seg.push(s);
    models.apply(pkg, key, data);
    track(e, key);
  }
  flush();
  return { text: out, firstRoom };
}

/** A pacing record at `ts`: a SIZE the player ignores. */
export function paceRecord(ts: number): string {
  return formatRecord(ts, RECORD.size, PACE_JSON);
}

/**
 * Marks in `written` the `points` (log µs of entries a fold leaves out, in
 * order; `written` already marks those that keep a line) that need a
 * pacing record so the replay clock takes the path it took through all of
 * them: both ends of a step longer than CATCH_UP_US, and enough points that
 * no step between lines grows past it. `prev` / `next` are the lines
 * before and after (null: none).
 */
export function pace(prev: number | null, points: readonly number[], next: number | null, written: boolean[]): void {
  const m = points.length;
  for (let i = 0; i <= m; i++) {
    const a = i === 0 ? prev : points[i - 1]!;
    const b = i === m ? next : points[i]!;
    if (a === null || b === null || b - a <= CATCH_UP_US) continue;
    if (i > 0) written[i - 1] = true;
    if (i < m) written[i] = true;
  }
  let w = prev;
  for (let i = 0; i < m; i++) {
    const b = i + 1 < m ? points[i + 1]! : next;
    if (!written[i] && w !== null && b !== null && b - w > CATCH_UP_US) written[i] = true;
    if (written[i]) w = points[i]!;
  }
}

/** The skeleton body of a Group.* record (see the file header), before `models` apply it; null: it goes. */
function skeleton(key: string, pkg: string, data: unknown, body: string, models: Models): string | null {
  switch (key) {
    case 'group.set':
      if (!Array.isArray(data)) return body;
      return `${pkg} ${JSON.stringify(data.map((o) => (isObj(o) ? reduceMember(o) : o)))}`;
    case 'group.add':
      return isObj(data) ? `${pkg} ${JSON.stringify(reduceMember(data))}` : null;
    case 'group.update': {
      if (!isObj(data)) return null;
      const id = intId(data.id);
      const tableKnows = id !== null && models.table.has(id);
      if (typeof data.type !== 'string' && tableKnows) return null;
      return `${pkg} ${JSON.stringify(reduceMember(data))}`;
    }
    default:
      return body;
  }
}

/**
 * The block of GMCP bodies for a segment (`models` hold the state after
 * it, `start` the state before it), or null when the check fails.
 */
function buildBlock(seg: readonly SegEntry[], models: Models, start: Models): string[] | null {
  const out: string[] = [];
  // Char.Vitals.
  const vitals = seg.filter((s) => s.fold === 'vitals');
  const fight = vitals.some((s) => {
    const d = s.data as Obj;
    return 'buffer' in d || 'opponent' in d || 'buffer-hits' in d || 'opponent-hits' in d;
  });
  if (vitals.length > 0) {
    const pkg = vitals[vitals.length - 1]!.pkg;
    const merged: Obj = {};
    let firstXp: number | null = null;
    let firstTp: number | null = null;
    let minXp: number | null = null;
    for (const s of vitals) {
      const d = s.data as Obj;
      for (const k of Object.keys(d)) merged[k] = d[k];
      const xp = num(d.xp);
      const tp = num(d.tp);
      if (xp !== null) {
        if (firstXp === null) firstXp = xp;
        if (minXp === null || xp < minXp) minXp = xp;
      }
      if (tp !== null && firstTp === null) firstTp = tp;
    }
    const lastXp = num(merged.xp);
    const lastTp = num(merged.tp);
    const anchors: Obj = {};
    if (firstXp !== null && firstXp !== lastXp) anchors.xp = firstXp;
    if (firstTp !== null && firstTp !== lastTp) anchors.tp = firstTp;
    if (Object.keys(anchors).length > 0) {
      // Both, so CharModel anchors each on its first number.
      if (firstXp !== null) anchors.xp = firstXp;
      if (firstTp !== null) anchors.tp = firstTp;
      out.push(`${pkg} ${JSON.stringify(anchors)}`);
    }
    const low = Math.min(num(anchors.xp) ?? Infinity, lastXp ?? Infinity);
    if (minXp !== null && minXp < low) out.push(`${pkg} ${JSON.stringify({ xp: minXp })}`);
    out.push(`${pkg} ${JSON.stringify(merged)}`);
  }
  // Group.*: the skeleton, then the final state.
  const group = seg.filter((s) => s.fold === 'group');
  if (group.length > 0 || fight) {
    for (const s of group) if (s.skeleton) out.push(s.skeleton);
    for (const e of models.table.entries()) {
      const m = models.group.get(e.id);
      const u: Obj = { id: e.id, name: e.name, label: e.label, mapid: e.mapid };
      if (m) {
        u.type = e.type;
        for (const k of ['hp', 'mana', 'mp'] as const) {
          u[k] = m[k].value;
          u[`${k}-string`] = m[k].word;
          u[`max${k}`] = m[k].max;
        }
      }
      out.push(`Group.Update ${JSON.stringify(u)}`);
      if (m && m.label === null && normLabel(e.label) !== null) out.push(`Group.Update ${JSON.stringify({ id: e.id, label: 0 })}`);
    }
  }
  // Room.Info and Event.Moved.
  const room = seg.filter((s) => s.fold === 'room' || s.fold === 'moved');
  let li = -1;
  for (let i = room.length - 1; i >= 0; i--) {
    if (room[i]!.fold === 'room') {
      li = i;
      break;
    }
  }
  for (let i = 0; i < room.length; i++) {
    if (li < 0 || i >= li || (i === li - 1 && room[i]!.fold === 'moved')) out.push(room[i]!.e.body);
  }
  // Comm.Channel.List: the last one the Comm pane takes.
  for (let i = seg.length - 1; i >= 0; i--) {
    const s = seg[i]!;
    if (s.fold === 'ccl' && parseChannelList(s.data) !== null) {
      out.push(s.e.body);
      break;
    }
  }

  // The check: the models fed the block end where the segment left them.
  const sim = start.clone();
  const blockVitals: unknown[] = [];
  for (const body of out) {
    const g = parseGmcp(body);
    const key = g.pkg.toLowerCase();
    if (key === 'char.vitals') blockVitals.push(g.data);
    sim.apply(g.pkg, key, g.data);
  }
  if (sim.key() !== models.key()) return null;
  if (xpTrace(blockVitals) !== xpTrace(vitals.map((s) => s.data))) return null;
  return out;
}
