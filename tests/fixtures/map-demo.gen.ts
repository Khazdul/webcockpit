// Generates tests/fixtures/map-demo.log, the map tracking demo (ADR 0020),
// and tests/fixtures/map-tokens.log, the map bench's token scene (stage 80,
// at the end of this file):
//
//   node tests/fixtures/map-demo.gen.ts
//
// A walk through Bree on the bundled public/map/arda.mm2 in the raw capture
// format (src/capture/format.ts), with Room.Info / Event.Moved / Group.*
// GMCP in MUME's shapes (MMapper parser/mumexmlparser-gmcp.cpp): the Old
// East Road north to the Prancing Pony, Cobble Street and Mill Road (rooms
// without server ids in the map), a prespammed `n;n;n`, a failed move, a
// `look`, back through Bree, west to the Sorcerer's Stone Tower (up and
// down) and north up Hill Road. Two group mates (an ally and a labeled
// mercenary) move around other rooms with `mapid`.
//
// Room names, descriptions and exits come from arda.mm2, which is bundled
// already. Rooms that have no server id in the map get an invented MUME id
// (17 000 000 + room index), except two that get none (MUME: "not all
// rooms have numbers"); one room's description differs from the map so
// only direction + name finds it. Room texts in the output are kept short.
// `ROUTE` below is the expected room sequence (tests/unit/map-tracking.test.ts).

import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { inflateSync } from 'node:zlib';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});

const { readMm2 } = await import('../../src/map/mm2');
const { DIR, DIR_COUNT, EXIT_FLAG, DOOR_FLAG, TERRAIN, exitTargets } = await import('../../src/map/model');
const { formatGmcpRecord, formatInbound, formatOutbound } = await import('../../src/capture/format');

const bytes = new Uint8Array(readFileSync(new URL('../../public/map/arda.mm2', import.meta.url)));
const map = await readMm2(bytes, async (z: Uint8Array) => new Uint8Array(inflateSync(z)));

// ---------------------------------------------------------------- output

const T0 = 1790535600000000; // µs
const ESC = '\x1b';
const out: string[] = [];
let t = 0;
const us = (): number => Math.round(T0 + t * 1e6);
const wait = (s: number): void => void (t += s);
const line = (text: string): void => void out.push(formatInbound(us(), text));
const cmd = (text: string): void => void out.push(formatOutbound(us(), text));
const gmcp = (pkg: string, data: unknown): void => void out.push(formatGmcpRecord(us(), pkg, JSON.stringify(data)));
const PROMPT = '*=>';
const prompt = (): void => line(PROMPT);
const green = (s: string): string => `${ESC}[32m${s}${ESC}[0m`;

// ----------------------------------------------------------------- rooms

/** Rooms that get no id at all in Room.Info. */
const NO_ID = new Set([26438, 26441]);
/** Room whose Room.Info description differs from the map (found by direction + name). */
const ODD_DESC = 26440;

const serverId = (r: number): number | null => (NO_ID.has(r) ? null : map.serverId[r]! || 17_000_000 + r);

const DIRS = ['north', 'south', 'east', 'west', 'up', 'down'] as const;
const KEYS = ['n', 's', 'e', 'w', 'u', 'd'] as const;
const ENV: Record<string, string> = { indoors: 'building', shallow: 'shallows' };

function roomInfo(r: number): Record<string, unknown> {
  const exits: Record<string, unknown> = {};
  for (let d = 0; d < 6; d++) {
    const s = r * DIR_COUNT + d;
    if ((map.exitFlags[s]! & EXIT_FLAG.EXIT) === 0) continue;
    if ((map.exitFlags[s]! & EXIT_FLAG.DOOR) !== 0 && (map.doorFlags[s]! & DOOR_FLAG.HIDDEN) !== 0) continue;
    const e: Record<string, unknown> = {};
    const to = exitTargets(map, r, d as 0);
    const id = to.length === 1 ? serverId(to[0]!) : null;
    if (id !== null) e.id = id;
    const flags: string[] = [];
    if (map.exitFlags[s]! & EXIT_FLAG.ROAD) flags.push('road');
    if (map.exitFlags[s]! & EXIT_FLAG.CLIMB) flags.push(d === DIR.U ? 'climb-up' : 'climb-down');
    if (flags.length) e.flags = flags;
    const door = map.doorNames.get(s);
    if (door) e.name = door;
    exits[KEYS[d]!] = e;
  }
  const terrain = TERRAIN[map.terrain[r]!]!;
  const info: Record<string, unknown> = {};
  const id = serverId(r);
  if (id !== null) info.id = id;
  info.area = map.areas[r] || 'Bree';
  info.name = map.names[r]!;
  info.desc = r === ODD_DESC ? `${map.descs[r]!}A cart rattles past you.\n` : map.descs[r]!;
  info.environment = ENV[terrain] ?? terrain;
  info.exits = exits;
  return info;
}

function exitsLine(r: number): string {
  const names: string[] = [];
  for (let d = 0; d < 6; d++) if (map.exitFlags[r * DIR_COUNT + d]! & EXIT_FLAG.EXIT) names.push(DIRS[d]!);
  return `Exits: ${names.join(', ')}.`;
}

/** The room text (short: name and exits) and prompt. */
function show(r: number): void {
  line(green(map.names[r]!));
  line(exitsLine(r));
  line('');
  prompt();
}

/** Arrival in room `r` by `dir` (null: no Event.Moved, e.g. look / login). */
function arrive(r: number, dir: string | null): void {
  if (dir !== null) gmcp('Event.Moved', { dir });
  gmcp('Room.Info', roomInfo(r));
  show(r);
}

let here = -1;
const route: number[] = [];

function target(from: number, dir: string): number {
  const d = DIRS.indexOf(dir as (typeof DIRS)[number]);
  const to = exitTargets(map, from, d as 0);
  if (to.length !== 1) throw new Error(`room ${from} has no single exit ${dir}`);
  return to[0]!;
}

/** Types `dir` and walks there. */
function go(dir: string): void {
  cmd(dir[0]!);
  wait(0.15);
  here = target(here, dir);
  route.push(here);
  arrive(here, dir);
  wait(0.6);
}

/** Types several moves at once (prespam), then the rooms arrive one by one. */
function spam(dirs: string[]): void {
  for (const d of dirs) cmd(d[0]!);
  for (const d of dirs) {
    wait(0.3);
    here = target(here, d);
    route.push(here);
    arrive(here, d);
  }
  wait(0.6);
}

// ---------------------------------------------------------------- group

const GIBUR = { id: 2, type: 'ally', name: 'Gibur', label: 0 };
const MERC = { id: 3, type: 'npc', name: 'a citizen mercenary', label: 'MERC' };
const vit = { hp: 140, 'hp-string': 'Healthy', maxhp: 140, mana: 90, 'mana-string': 'Full', maxmana: 90, mp: 110, 'mp-string': 'Rested', maxmp: 110 };
/** Moves a mate to room `r` (Group.Update with `mapid` and the room name). */
function mate(m: typeof GIBUR | typeof MERC, r: number): void {
  const id = serverId(r);
  if (id === null) throw new Error(`mate room ${r} has no id`);
  gmcp('Group.Update', { id: m.id, mapid: id, room: map.names[r] });
}

// ---------------------------------------------------------------- script

gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta Fari the Wanderer' });
line('Reconnecting.');
line('');
gmcp('Char.StatusVars', { name: 'Rasta', fullname: 'Rasta Fari the Wanderer', race: 'Man', subrace: 'Dunadan', subclass: 'warrior', level: 25 });
here = 26432; // Old East Road, south of the Prancing Pony
route.push(here);
gmcp('Group.Set', [
  { id: 1, type: 'you', name: 'Rasta', label: 0, mapid: serverId(here), room: map.names[here], ...vit },
  { ...GIBUR, mapid: serverId(26963), room: map.names[26963], ...vit },
  { ...MERC, mapid: serverId(26964), room: map.names[26964], ...vit },
]);
arrive(here, null);
wait(1);

go('north'); // 26433 Old East Road (server id)
go('north'); // 26434
mate(GIBUR, 26434); // Gibur steps out of the Bazaar onto the road behind
go('north'); // 26435 Sign of the Prancing Pony Inn
go('east'); // 26438 Cobble Street (no id at all)
go('east'); // 26439 Cobble Street (invented id)
mate(MERC, 26433);
spam(['north', 'north', 'north']); // 26440 (odd desc) → 26441 (no id) → 26442
go('west'); // 26921 Mill Road
go('west'); // 26923 Stone Road

// A failed move pops the prespam queue.
cmd('w');
wait(0.2);
line('Alas, you cannot go that way...');
line('');
prompt();
wait(0.5);

// A look: Room.Info without Event.Moved.
cmd('look');
wait(0.2);
gmcp('Room.Info', roomInfo(here));
show(here);
route.push(here);
wait(0.5);

go('east'); // 26921 (learned id now)
mate(GIBUR, 26962); // Spice Shop
go('south'); // 26920 Animal Market
go('south'); // 26919 Towering Stable
go('south'); // 26438 Cobble Street (no id; direction + name)
go('west'); // 26435
mate(MERC, 26439); // the mercenary waits on Cobble Street (an invented id)
go('west'); // 26445 Old East Road
go('west'); // 26446
go('west'); // 26447
go('north'); // 26969 Hill Road
go('west'); // 26974 Tranquil Garden
go('west'); // 27000 Sorcerer's Stone Tower
go('up'); // 27001 Shielded Balcony
go('down'); // 27000
mate(GIBUR, 26447);
go('east'); // 26974
go('east'); // 26969
spam(['north', 'north']); // 26970 → 26971 Hill Road

writeFileSync(new URL('./map-demo.log', import.meta.url), out.join(''));
console.log(`map-demo.log: ${out.length} lines, ${t.toFixed(1)} s, ${route.length} arrivals, final room ${here}`);
console.log(`ROUTE = [${route.join(', ')}]`);

// ------------------------------------------------------ the token scene
// tests/fixtures/map-tokens.log (stage 80 part B, ADR 0171: the map bench's
// token scene): you and eight members. Four walk with you all the way (five
// in one room: the fan and its +1), three wait in rooms around the road, one
// is far away. The party walks the Old East Road north and back, eight
// times, and HP goes down and up on the way.

out.length = 0;
t = 0;
const PARTY = [
  { id: 2, type: 'ally', name: 'Thorin', label: 0 },
  { id: 3, type: 'ally', name: 'Eowyn', label: 0 },
  { id: 4, type: 'ally', name: 'Glorfindel', label: 0 },
  { id: 5, type: 'npc', name: 'a trained horse', label: 'HORSE' },
  { id: 6, type: 'ally', name: 'Bilbo', label: 0 },
  { id: 7, type: 'ally', name: 'Strider', label: 0 },
  { id: 8, type: 'ally', name: 'Faramir', label: 0 },
  { id: 9, type: 'ally', name: 'Gimli', label: 0 },
];
const WAIT: Record<number, number> = { 6: 26963, 7: 26434, 8: 26964, 9: 27001 };
const hpOf = (hp: number) => ({ hp, maxhp: 140, 'hp-string': 'Healthy', mana: 90, maxmana: 90, 'mana-string': 'Full', mp: 110, maxmp: 110, 'mp-string': 'Rested' });
gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta Fari the Wanderer' });
line('Reconnecting.');
gmcp('Char.StatusVars', { name: 'Rasta', fullname: 'Rasta Fari the Wanderer', race: 'Man', subrace: 'Dunadan', subclass: 'warrior', level: 25 });
gmcp('Char.Vitals', { hp: 140, maxhp: 140 });
here = 26432;
gmcp('Group.Set', [
  { id: 1, type: 'you', name: 'Rasta', label: 0, mapid: serverId(here), room: map.names[here], ...hpOf(140) },
  ...PARTY.map((m) => {
    const r = WAIT[m.id] ?? here;
    return { ...m, mapid: serverId(r), room: map.names[r], ...hpOf(140) };
  }),
]);
arrive(here, null);
wait(1);
let step = 0;
for (let lap = 0; lap < 8; lap++) {
  for (const dir of ['north', 'north', 'north', 'south', 'south', 'south']) {
    go(dir);
    step++;
    for (const m of PARTY) if (WAIT[m.id] === undefined) gmcp('Group.Update', { id: m.id, mapid: serverId(here), room: map.names[here] });
    // Someone is hurt and heals: Eowyn and Bilbo by turns, you every third step.
    gmcp('Group.Update', { id: step % 2 ? 3 : 6, hp: 20 + ((step * 37) % 120) });
    if (step % 3 === 0) gmcp('Char.Vitals', { hp: 40 + ((step * 23) % 100), maxhp: 140 });
  }
}
writeFileSync(new URL('./map-tokens.log', import.meta.url), out.join(''));
console.log(`map-tokens.log: ${out.length} lines, ${t.toFixed(1)} s, final room ${here}`);
