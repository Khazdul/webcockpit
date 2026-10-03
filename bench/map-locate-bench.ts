// Map locator benchmark (ADR 0071).
//
//   node bench/map-locate-bench.ts [arrivals]
//
// A seeded random walk over the bundled arda.mm2 (default 20 000
// arrivals) turned into `Event.Moved` + `Room.Info` events as MUME sends
// them, fed to a fresh Tracker (the worker's locator path) and, separately,
// straight to locate(). Room.Info carries the room's map text and visible
// exits; its id is the map's server id, else an invented one (17 000 000 +
// room) for half of the rooms, else none. Exit ids are given the same way.
// About 2 % of the arrivals carry a changed description (an outdated map).
// Prints µs per Room.Info (median of 7 rounds).

import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { inflateSync } from 'node:zlib';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        return next(specifier + '.ts', context);
      }
      throw err;
    }
  },
});

const { readMm2 } = await import('../src/map/mm2');
const { DIR_COUNT, EXIT_FLAG, exitTargets } = await import('../src/map/model');
const { Tracker } = await import('../src/map/tracking');
const { locate, parseRoomInfo, visibleExits } = await import('../src/map/locate');
type Ev = { k: 'gmcp'; pkg: 'Event.Moved' | 'Room.Info'; data: unknown };

const N = Number(process.argv[2] ?? 20_000);
const bytes = new Uint8Array(readFileSync(new URL('../public/map/arda.mm2', import.meta.url)));
const map = await readMm2(bytes, async (z) => new Uint8Array(inflateSync(z)));

let seed = 0x2f6e2b1;
const rand = (): number => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x1_0000_0000;
};
const DIRS = ['north', 'south', 'east', 'west', 'up', 'down'];
const KEYS = ['n', 's', 'e', 'w', 'u', 'd'];
const mumeId = (r: number): number | undefined =>
  map.serverId[r] ? map.serverId[r] : ((r * 2654435761) >>> 0) % 2 === 0 ? 17_000_000 + r : undefined;
const roomInfo = (r: number): unknown => {
  const ex = visibleExits(map, r);
  const exits: Record<string, { id?: number }> = {};
  for (let d = 0; d < 6; d++) {
    if ((ex & (1 << d)) === 0) continue;
    const t = exitTargets(map, r, d as 0);
    exits[KEYS[d]!] = t.length === 1 ? { id: mumeId(t[0]!) } : {};
  }
  const desc = rand() < 0.02 ? 'A changed description.' : map.descs[r];
  return { id: mumeId(r), name: map.names[r], desc, exits };
};

// The walk: a random single-target exit, else a jump (LOOK) to a random room.
const events: Ev[] = [];
const truth: number[] = [];
let room = 26435;
for (let i = 0; i < N; i++) {
  const ok: number[] = [];
  for (let d = 0; d < 6; d++) {
    if ((map.exitFlags[room * DIR_COUNT + d]! & EXIT_FLAG.EXIT) === 0) continue;
    if (exitTargets(map, room, d as 0).length === 1) ok.push(d);
  }
  if (ok.length === 0 || rand() < 0.002) {
    room = Math.floor(rand() * map.roomCount);
  } else {
    const d = ok[Math.floor(rand() * ok.length)]!;
    room = exitTargets(map, room, d as 0)[0]!;
    events.push({ k: 'gmcp', pkg: 'Event.Moved', data: { dir: DIRS[d] } });
  }
  events.push({ k: 'gmcp', pkg: 'Room.Info', data: roomInfo(room) });
  truth.push(room);
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

// Tracker: one apply per event, as the worker gets them (fresh tracker per round).
const trackerUs: number[] = [];
let lastStats = '';
let wrong = 0;
for (let round = 0; round < 8; round++) {
  const tr = new Tracker();
  tr.setMap(map, 'bench');
  const seen: (number | null)[] = [];
  const t0 = performance.now();
  for (const ev of events) {
    tr.apply([ev]);
    if (ev.pkg === 'Room.Info') seen.push(tr.status.located ? tr.status.room : null);
  }
  const us = ((performance.now() - t0) * 1000) / N;
  if (round > 0) trackerUs.push(us); // round 0 warms up
  lastStats = JSON.stringify(tr.stats.byHow);
  wrong = seen.filter((r, i) => r !== null && r !== truth[i]).length;
}

// locate() alone, from the true previous room, no learned ids.
const infos = events.filter((e) => e.pkg === 'Room.Info').map((e) => parseRoomInfo(e.data)!);
const moves: number[] = [];
{
  let pend = 7; // LOOK
  for (const e of events) {
    if (e.pkg === 'Event.Moved') pend = DIRS.indexOf((e.data as { dir: string }).dir);
    else {
      moves.push(pend);
      pend = 7;
    }
  }
}
const locateUs: number[] = [];
for (let round = 0; round < 8; round++) {
  const learned = new Map<number, number>();
  const t0 = performance.now();
  for (let i = 0; i < N; i++) locate(map, learned, infos[i]!, i > 0 ? truth[i - 1]! : null, moves[i] as 0);
  const us = ((performance.now() - t0) * 1000) / N;
  if (round > 0) locateUs.push(us);
}

console.log(`map locator bench: ${N} arrivals on arda.mm2 (${map.roomCount} rooms)`);
console.log(`  Tracker.apply  ${median(trackerUs).toFixed(2)} µs per Room.Info (rounds: ${trackerUs.map((u) => u.toFixed(2)).join(' ')})`);
console.log(`  locate()       ${median(locateUs).toFixed(2)} µs per Room.Info (rounds: ${locateUs.map((u) => u.toFixed(2)).join(' ')})`);
console.log(`  tracker byHow ${lastStats}; located but wrong: ${wrong}`);
