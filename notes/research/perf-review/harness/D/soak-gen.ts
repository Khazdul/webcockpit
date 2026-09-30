// Soak data generator (perf review D, long sessions).
//
//   node perf/soak-gen.ts [outDir=dist/__soak]
//
// Turns the owner's biggest Cockpit raw logs (no GMCP) into "live-like"
// sessions: GMCP is synthesized and interleaved at the rates MUME sends it
// (Char.Vitals after prompts, fight fields on fight prompts, Group.* around
// fights, Event.Moved + Room.Info after move commands, Comm.Channel.Text on
// comm lines, the odd Event.Sun / Event.Achieved). Each log becomes one
// "loop": telnet frames at log time (speed 1, gaps capped at 2 s, lines
// < 1 ms apart in one frame, like one server write) plus the recorded
// commands as separate `sent` entries, written as
//
//   <outDir>/loop<k>.bin    all frame bytes, concatenated
//   <outDir>/loop<k>.json   { at: ms[], len: bytes[], sent: [index, text][],
//                             lines, gmcp: {pkg: count}, logMs, file }
//   <outDir>/probe.json     fixed probe payloads (base64): std frames, a
//                           24-bit colour block, a 2000-line burst
//
// Only the first loop carries the login preamble (Comm.Channel.List,
// Char.Name, …): the soak is one continuous connection.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

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

const { logToFrames, isPromptLike } = await import('../src/net/replay-socket');

const ROOT = '/home/ole/MUME/data/runs/Rasta/';
export const LOGS = ['2026-09-18T18-11-42.log', '2026-09-26T21-00-45.log', '2026-09-25T22-03-02.log'];
const outDir = process.argv[2] ?? new URL('../dist/__soak/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

// Deterministic PRNG (mulberry32).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Rooms (Room.Info payloads as MUME sends them) from the map demo fixture.
const mapDemo = readFileSync(new URL('../tests/fixtures/map-demo.log', import.meta.url), 'utf8');
const ROOMS: string[] = mapDemo
  .split('\n')
  .filter((l) => l.includes('\x1bGMCP Room.Info '))
  .map((l) => l.slice(l.indexOf('Room.Info ') + 'Room.Info '.length));
const ROOM_IDS: number[] = ROOMS.map((j) => (JSON.parse(j) as { id?: number }).id ?? 0);

const DIRS: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west', u: 'up', d: 'down',
  north: 'north', south: 'south', east: 'east', west: 'west', up: 'up', down: 'down',
};
const BANDS = ['Healthy', 'Fine', 'Hurt', 'Wounded', 'Bad', 'Awful', 'Dying'];
const CHANNEL_LIST = JSON.stringify([
  { name: 'tales', caption: 'Narrates', command: 'narrate' },
  { name: 'tells', caption: 'Tells', command: 'tell' },
  { name: 'says', caption: 'Says', command: 'say' },
  { name: 'yells', caption: 'Yells', command: 'yell' },
  { name: 'prayers', caption: 'Prayers', command: 'pray' },
  { name: 'emotes', caption: 'Emotes', command: 'emote' },
  { name: 'whispers', caption: 'Whispers', command: 'whisper' },
  { name: 'songs', caption: 'Songs', command: 'sing' },
  { name: 'socials', caption: 'Socials', command: 'social' },
  { name: 'questions', caption: 'Questions', command: 'question' },
]);
const COMM_RE = /^(.+?) (narrates|tells you|says|yells|prays|sings|whispers to you)\b.*'/;
const OWN_COMM_RE = /^You (narrate|tell \S+|say|yell|pray|sing|whisper to \S+)\b.*'/;
const CHAN: Record<string, string> = {
  narrates: 'tales', 'tells you': 'tells', says: 'says', yells: 'yells', prays: 'prayers', sings: 'songs', 'whispers to you': 'whispers',
  narrate: 'tales', tell: 'tells', say: 'says', yell: 'yells', pray: 'prayers', sing: 'songs', whisper: 'whispers',
};
const ANSI = /\x1b\[[0-9;]*m/g;

interface Built {
  text: string;
  lines: number;
  gmcp: Record<string, number>;
}

/** The log with synthesized GMCP records interleaved (capture format). */
function synthesize(logText: string, seed: number, preamble: boolean): Built {
  const r = rng(seed);
  const out: string[] = [];
  const gmcpCount: Record<string, number> = {};
  const rec = (ts: string, pkg: string, data: unknown): void => {
    gmcpCount[pkg] = (gmcpCount[pkg] ?? 0) + 1;
    out.push(`${ts} \x1bGMCP ${pkg}${data === undefined ? '' : ' ' + JSON.stringify(data)}`);
  };
  let hp = 172, mana = 90, mp = 131, xp = 5_770_000, tp = 41_500;
  let fighting = false;
  let npcId = 100;
  let fightNpc = 0;
  let room = 0;
  let pendingMove: string | null = null;
  let promptN = 0;
  let lines = 0;
  let first = true;
  for (const raw of logText.split('\n')) {
    const sp = raw.indexOf(' ');
    if (sp !== 16) continue;
    const ts = raw.slice(0, 16);
    const body = raw.slice(17);
    if (first && preamble) {
      first = false;
      rec(ts, 'Comm.Channel.List', JSON.parse(CHANNEL_LIST));
      rec(ts, 'Char.Name', { name: 'Rasta', fullname: 'Rasta Fari the Wanderer' });
      rec(ts, 'Char.StatusVars', { name: 'Rasta', fullname: 'Rasta Fari the Wanderer', race: 'Man', subrace: 'Dunadan', subclass: 'warrior', level: 25, 'next-level-xp': 20000, 'next-level-tp': 500 });
      rec(ts, 'Char.Vitals', { hp, 'hp-string': 'Healthy', maxhp: 172, mana, 'mana-string': 'Full', maxmana: 90, mp, 'mp-string': 'Rested', maxmp: 131, xp, tp, position: 'standing' });
      rec(ts, 'Group.Set', [
        { id: 1, type: 'you', name: 'Rasta', label: 0, mapid: ROOM_IDS[0], hp, 'hp-string': 'Healthy', maxhp: 172, mana, 'mana-string': 'Full', maxmana: 90, mp, 'mp-string': 'Rested', maxmp: 131 },
        { id: 2, type: 'ally', name: 'Gibur', label: 0, mapid: ROOM_IDS[1], hp: 140, 'hp-string': 'Healthy', maxhp: 140, mana: 90, 'mana-string': 'Full', maxmana: 90, mp: 110, 'mp-string': 'Rested', maxmp: 110 },
        { id: 3, type: 'npc', name: 'a citizen mercenary', label: 'MERC', mapid: ROOM_IDS[2], hp: 140, 'hp-string': 'Healthy', maxhp: 140, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 110, 'mp-string': 'Rested', maxmp: 110 },
      ]);
      out.push(`${ts} \x1bGMCP Room.Info ${ROOMS[0]}`);
      gmcpCount['Room.Info'] = (gmcpCount['Room.Info'] ?? 0) + 1;
    }
    first = false;
    // Outbound command.
    if (body.startsWith('> ') || body === '>') {
      out.push(raw);
      const cmd = body.slice(2).trim().toLowerCase();
      if (DIRS[cmd]) pendingMove = DIRS[cmd]!;
      continue;
    }
    // Inbound line. A pending move: the server sends Event.Moved + Room.Info
    // right before the room text.
    if (pendingMove !== null) {
      room = (room + 1) % ROOMS.length;
      rec(ts, 'Event.Moved', { dir: pendingMove });
      out.push(`${ts} \x1bGMCP Room.Info ${ROOMS[room]}`);
      gmcpCount['Room.Info'] = (gmcpCount['Room.Info'] ?? 0) + 1;
      if (r() < 0.3) rec(ts, 'Group.Update', { id: 2, mapid: ROOM_IDS[(room + 1) % ROOM_IDS.length], room: 'Somewhere' });
      pendingMove = null;
    }
    out.push(raw);
    lines++;
    const clean = body.replace(ANSI, '');
    // Comm.
    const cm = COMM_RE.exec(clean);
    if (cm) {
      rec(ts, 'Comm.Channel.Text', { channel: CHAN[cm[2]!] ?? 'tales', talker: cm[1], 'talker-type': 'player', text: body });
    } else {
      const om = OWN_COMM_RE.exec(clean);
      if (om) {
        const verb = om[1]!.split(' ')[0]!;
        rec(ts, 'Comm.Channel.Text', { channel: CHAN[verb] ?? 'tales', talker: 'you', text: clean.slice(clean.indexOf("'") + 1, -1) });
      }
    }
    // Kills: XP arrives with the next Vitals.
    if (clean.endsWith(' is dead! R.I.P.') || clean.endsWith(' last breath! R.I.P.')) {
      xp += 1000 + Math.floor(r() * 40000);
      if (r() < 0.5) tp += 1 + Math.floor(r() * 20);
    }
    if (clean.endsWith('You gain a level!')) rec(ts, 'Char.StatusVars', { level: 26 });
    if (isPromptLike(body)) {
      promptN++;
      const fields = clean.replace(/(HP|Mana|Move):[A-Za-z]+/g, '');
      const fight = [...fields.matchAll(/([^:>]+?):([A-Z][a-z]+)/g)].map((m) => ({ who: m[1]!.trim(), band: m[2]! }));
      const v: Record<string, unknown> = {};
      // Regen / spend a little.
      const dh = Math.floor(r() * 7) - 3;
      hp = Math.max(1, Math.min(172, hp + dh));
      v.hp = hp;
      if (r() < 0.5) {
        mana = Math.max(0, Math.min(90, mana + Math.floor(r() * 11) - 5));
        v.mana = mana;
      }
      if (r() < 0.3) {
        mp = Math.max(0, Math.min(131, mp + Math.floor(r() * 9) - 4));
        v.mp = mp;
      }
      v.xp = xp;
      v.tp = tp;
      if (fight.length > 0) {
        const opp = fight[fight.length - 1]!;
        const buf = fight.length > 1 ? fight[0]! : null;
        if (!fighting) {
          fighting = true;
          v.position = 'fighting';
          v.opponent = opp.who;
          v.buffer = buf ? buf.who : 'Rasta';
          fightNpc = ++npcId;
          rec(ts, 'Group.Add', { id: fightNpc, type: 'npc', name: opp.who, label: r() < 0.3 ? 'MOB' : 0, mapid: ROOM_IDS[room], hp: 100, 'hp-string': opp.band, maxhp: 100, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 100, 'mp-string': 'Rested', maxmp: 100 });
        }
        v['opponent-hits'] = opp.band.toLowerCase();
        if (buf) v['buffer-hits'] = buf.band.toLowerCase();
        rec(ts, 'Group.Update', { id: fightNpc, 'hp-string': opp.band });
      } else if (fighting) {
        fighting = false;
        Object.assign(v, { position: 'standing', opponent: null, buffer: null, 'opponent-hits': null, 'buffer-hits': null });
        rec(ts, 'Group.Remove', fightNpc);
      }
      rec(ts, 'Char.Vitals', v);
      if (promptN % 7 === 0) rec(ts, 'Group.Update', { id: 2, hp: 100 + Math.floor(r() * 40), 'hp-string': BANDS[Math.floor(r() * 3)] });
      if (promptN % 900 === 0) rec(ts, 'Event.Sun', { what: r() < 0.5 ? 'rise' : 'set' });
      if (promptN % 4000 === 0) rec(ts, 'Event.Achieved', { what: `Soak achievement ${promptN}` });
    }
  }
  return { text: out.join('\n') + '\n', lines, gmcp: gmcpCount };
}

function writeLoop(k: number, file: string): void {
  const logText = readFileSync(ROOT + file, 'utf8');
  const b = synthesize(logText, 1000 + k, k === 0);
  // The synthesized capture text (the log player test plays it as a run).
  writeFileSync(`${outDir}/loop${k}.log`, b.text);
  const at: number[] = [];
  const len: number[] = [];
  const sent: Array<[number, string]> = [];
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const f of logToFrames(b.text, { speed: 1, sends: true })) {
    if (f.sent !== undefined) sent.push([at.length, f.sent]);
    at.push(Math.round(f.atMs * 10) / 10);
    len.push(f.bytes.length);
    parts.push(f.bytes);
    total += f.bytes.length;
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  writeFileSync(`${outDir}/loop${k}.bin`, buf);
  writeFileSync(`${outDir}/loop${k}.json`, JSON.stringify({ file, at, len, sent, lines: b.lines, gmcp: b.gmcp, logMs: at[at.length - 1] }));
  console.log(
    `loop${k}: ${file} lines ${b.lines}, frames ${at.length} (${sent.length} sent), bytes ${total}, playback ${(at[at.length - 1]! / 60000).toFixed(1)} min at speed 1; gmcp ${JSON.stringify(b.gmcp)}`,
  );
}

LOGS.forEach((f, k) => writeLoop(k, f));

// ------------------------------------------------------------ probe data

const enc = new TextEncoder();
const b64 = (u: Uint8Array): string => Buffer.from(u).toString('base64');
// Standard frames: 120 byte frames of loop 0 from a fight-rich stretch.
const l0 = JSON.parse(readFileSync(`${outDir}/loop0.json`, 'utf8')) as { len: number[] };
const bin0 = new Uint8Array(readFileSync(`${outDir}/loop0.bin`));
const offs: number[] = [];
{
  let o = 0;
  for (const n of l0.len) {
    offs.push(o);
    o += n;
  }
}
const std: string[] = [];
for (let i = 30000; std.length < 120 && i < l0.len.length; i++) {
  if (l0.len[i]! === 0) continue;
  std.push(b64(bin0.subarray(offs[i]!, offs[i]! + l0.len[i]!)));
}
// A `help 24-bit colours`-like block: 45 lines × 64 truecolour cells, then a prompt.
let rgbText = 'Examples of 24-bit colours:\r\n';
for (let y = 0; y < 45; y++) {
  let row = '  ';
  for (let x = 0; x < 64; x++) {
    const rr = Math.round((x / 63) * 255);
    const gg = Math.round((y / 44) * 255);
    const bb = 255 - rr;
    row += y % 2 === 0 ? `\x1b[38;2;${rr};${gg};${bb}m█` : `\x1b[48;2;${rr};${gg};${bb}m `;
  }
  rgbText += row + '\x1b[0m\r\n';
}
rgbText += 'oO Mana:Hot>';
const rgb = new Uint8Array([...enc.encode(rgbText), 255, 249]);
// A 2000-line burst (who/inventory-like, some colour).
let burst = '';
for (let i = 0; i < 2000; i++) {
  burst += i % 9 === 0 ? `\x1b[32m[ 42 Dwa War] Someone${i} the Dwarf is here (fighting)\x1b[0m\r\n` : `A plain line of burst output number ${i}, roughly seventy characters long.\r\n`;
}
const burstBytes = enc.encode(burst);
const burstFrames: string[] = [];
for (let o = 0; o < burstBytes.length; o += 16384) burstFrames.push(b64(burstBytes.subarray(o, o + 16384)));
writeFileSync(`${outDir}/probe.json`, JSON.stringify({ std, rgb: b64(rgb), burst: burstFrames }));
console.log(`probe: ${std.length} std frames, rgb ${rgb.length} bytes, burst ${burstFrames.length} frames`);
