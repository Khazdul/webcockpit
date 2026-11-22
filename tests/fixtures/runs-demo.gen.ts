// Generates tests/fixtures/runs-demo.jsonl.gz, a run library backup with
// demo runs (ADR 0018 "Demo data"):
//
//   node tests/fixtures/runs-demo.gen.ts
//
// RESTORE it from History (or `await (await __wc.runs()).restore(blob)` on
// the dev server; the file is served at `/__fixtures/runs-demo.jsonl.gz`)
// to try History, Statistics and the log player without playing:
//
//   Gittan  2026-09-25 20:15  ~35 min: rats, an undead, an achievement
//   Rasta   2026-09-26 21:00  ~42 min ┐ one session (stitched, saved ★★★★):
//   Rasta   2026-09-26 22:02  ~33 min ┘ allies join and leave, a double kill,
//                                       a level-up, an achievement, a pkill,
//                                       a death with its XP loss
//   Gittan  2026-09-27 18:40  ~12 min: a short evening, one kill
//
// Each run is written as raw capture text (src/capture/format.ts) with GMCP,
// VIEW and SIZE records, in MUME's output shape, and then replayed through
// the real RunEventDeriver on the log's own clock: the stored events are
// exactly what the client derives from these logs. Times are local
// (`new Date(2026, 8, 26, 21, 0)`), as run ids are. All names are invented.

import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { gzipSync } from 'node:zlib';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) {
        try {
          return next(specifier + '.ts', context);
        } catch {
          return next(specifier + '/index.ts', context);
        }
      }
      throw err;
    }
  },
});

const { Bus } = await import('../../src/core/bus');
const { RunEventDeriver } = await import('../../src/runs/events');
const { summarizeAll } = await import('../../src/runs/summary');
const { FakeScheduler } = await import('../../src/script/engine/timers');
const { makeRunId, parseRecord } = await import('../../src/capture/format');
const { defaultSettings, viewSnapshot } = await import('../../src/settings/types');
const { xpForLevel } = await import('../../src/gmcp/levels');
type RunEvent = import('../../src/runs/events').RunEvent;
type RunMeta = import('../../src/capture/store').RunMeta;
type RunChunk = import('../../src/capture/store').RunChunk;

const ESC = '\x1b';
const c = (code: number, s: string): string => `${ESC}[${code}m${s}${ESC}[0m`;
const VIEW = JSON.stringify(viewSnapshot(defaultSettings()));
const SIZE = JSON.stringify({ cols: 160, rows: 48 });

// ------------------------------------------------------------ log writer

class Log {
  readonly out: string[] = [];
  /** µs. */
  t: number;
  readonly start: Date;
  constructor(start: Date) {
    this.start = start;
    this.t = start.getTime() * 1000;
  }
  private ts(): string {
    // Lines of one frame are a few µs apart, as a real capture.
    this.t += 37;
    return String(Math.round(this.t)).padStart(16, '0');
  }
  wait(s: number): void {
    this.t += s * 1e6;
  }
  line(text: string): void {
    this.out.push(`${this.ts()} ${text}`);
  }
  cmd(text: string): void {
    this.out.push(`${this.ts()} > ${text}`);
  }
  gmcp(pkg: string, data?: unknown): void {
    this.out.push(`${this.ts()} ${ESC}GMCP ${pkg}${data === undefined ? '' : ' ' + JSON.stringify(data)}`);
  }
  record(type: string, payload: string): void {
    this.out.push(`${this.ts()} ${ESC}${type} ${payload}`);
  }
  prompt(p: string): void {
    this.line(p);
  }
  /** A command and its reply: lines, empty line, prompt. */
  reply(command: string, lines: readonly string[], p: string): void {
    this.cmd(command);
    this.wait(0.2);
    for (const l of lines) this.line(l);
    this.line('');
    this.prompt(p);
  }
  /** Unsolicited output: empty line, lines, empty line, prompt. */
  event(lines: readonly string[], p: string): void {
    this.line('');
    for (const l of lines) this.line(l);
    this.line('');
    this.prompt(p);
  }
}

interface Char {
  name: string;
  fullname: string;
  race: string;
  level: number;
  xp: number;
  tp: number;
  hp: number;
  mana: number;
  mp: number;
}

const CHANNELS = [
  { name: 'tales', caption: 'Narrates', command: 'narrate' },
  { name: 'tells', caption: 'Tells', command: 'tell' },
  { name: 'says', caption: 'Says', command: 'say' },
  { name: 'yells', caption: 'Yells', command: 'yell' },
  { name: 'prayers', caption: 'Prayers', command: 'pray' },
  { name: 'emotes', caption: 'Emotes', command: 'emote' },
  { name: 'whispers', caption: 'Whispers', command: 'whisper' },
  { name: 'questions', caption: 'Questions', command: 'question' },
  { name: 'songs', caption: 'Songs', command: 'sing' },
  { name: 'socials', caption: 'Socials', command: 'social' },
];

const vitals = (ch: Char) => ({
  hp: ch.hp,
  'hp-string': 'Healthy',
  maxhp: ch.hp,
  mana: ch.mana,
  'mana-string': 'Full',
  maxmana: ch.mana,
  mp: ch.mp,
  'mp-string': 'Rested',
  maxmp: ch.mp,
  xp: ch.xp,
  tp: ch.tp,
  carrying: 'peanuts',
  ride: null,
  climb: null,
  sneak: null,
  swim: false,
  alertness: 'normal',
  mood: 'brave',
  position: 'standing',
  wimpy: 40,
  opponent: null,
  buffer: null,
  'opponent-hits': null,
  'buffer-hits': null,
});

/** Login: channel list, Char.Name, the view, the server's greeting, Vitals. */
function login(log: Log, ch: Char, group: unknown[], p: string): void {
  log.gmcp('Comm.Channel.List', CHANNELS);
  log.wait(0.3);
  log.gmcp('Char.Name', { name: ch.name, fullname: ch.fullname });
  log.record('VIEW', VIEW);
  log.record('SIZE', SIZE);
  log.cmd('change width all 500');
  log.cmd('change width table terminal');
  log.line('Reconnecting.');
  log.line('');
  log.gmcp('Char.StatusVars', { name: ch.name, fullname: ch.fullname, race: ch.race, level: ch.level });
  log.gmcp('Group.Set', group);
  log.wait(0.2);
  log.gmcp('Char.Vitals', vitals(ch));
}

/** A fight to the death of `mobs` (all die in the last round, one Vitals before). */
function fight(
  log: Log,
  ch: Char,
  mobs: readonly string[],
  opts: { xp: number; tp?: number; rounds?: number; undead?: boolean; target?: string; p: string },
): void {
  const first = mobs[0]!;
  log.cmd(`kill ${opts.target ?? first.split(' ').at(-1)!.toLowerCase()}`);
  log.wait(0.2);
  log.line(`You attack ${first.charAt(0).toLowerCase() + first.slice(1)}.`);
  log.gmcp('Char.Vitals', { position: 'fighting', opponent: first.toLowerCase(), buffer: ch.name, 'opponent-hits': 'healthy', 'buffer-hits': 'healthy' });
  log.line('');
  log.prompt(opts.p + ' R:Healthy>');
  const words = ['fine', 'hurt', 'wounded', 'bad', 'dying'];
  const rounds = opts.rounds ?? 4;
  for (let i = 0; i < rounds; i++) {
    log.wait(2.5 + (i % 2));
    const w = words[Math.min(words.length - 1, Math.floor(((i + 1) * words.length) / (rounds + 1)))]!;
    log.gmcp('Char.Vitals', { 'opponent-hits': w });
    log.event([c(31, `You ${i % 2 ? 'slash' : 'cleave'} ${first.toLowerCase()} ${i === rounds - 1 ? 'extremely hard' : 'hard'}.`), `${first} hits you.`], `${opts.p} R:${w[0]!.toUpperCase() + w.slice(1)}>`);
  }
  log.wait(2.2);
  ch.xp += opts.xp;
  if (opts.tp) ch.tp += opts.tp;
  log.line('');
  log.gmcp('Char.Vitals', { position: 'standing', opponent: null, buffer: null, 'opponent-hits': null, 'buffer-hits': null, xp: ch.xp, ...(opts.tp ? { tp: ch.tp } : {}) });
  for (const m of mobs) log.line(opts.undead ? `${m} disappears into nothing.` : `${m} is dead! R.I.P.`);
  if (!opts.undead) log.line(`You receive your share of experience.`);
  log.line('');
  log.prompt(opts.p + '>');
}

function walk(log: Log, ch: Char, dir: string, room: string, desc: string, p: string, tp = 0): void {
  log.cmd(dir);
  log.wait(0.25);
  log.gmcp('Event.Moved', { dir });
  if (tp) {
    ch.tp += tp;
    log.gmcp('Char.Vitals', { tp: ch.tp });
  }
  log.line(c(32, room));
  log.line(desc);
  log.line('Exits: north, east, south, west.');
  log.line('');
  log.prompt(p);
}

function tell(log: Log, from: string, text: string, p: string): void {
  log.gmcp('Comm.Channel.Text', { channel: 'tells', talker: from, 'talker-type': 'player', text: `${from} tells you '${text}'` });
  log.event([c(32, `${from} tells you '${text}'`)], p);
}

function narrate(log: Log, from: string, text: string, p: string): void {
  log.gmcp('Comm.Channel.Text', { channel: 'tales', talker: from, 'talker-type': 'player', text: `${from} narrates '${text}'` });
  log.event([c(33, `${from} narrates '${text}'`)], p);
}

function quit(log: Log, p: string): void {
  log.reply('rent', ['The innkeeper stores your stuff in the safe, and shows you to your room.'], p);
  log.wait(0.3);
  log.line('Goodbye, friend. Come back soon!');
}

const member = (id: number, type: string, name: string, hp = 150, label: string | 0 = 0) => ({
  id,
  type,
  name,
  label,
  hp,
  'hp-string': 'Healthy',
  maxhp: hp,
  mana: 80,
  'mana-string': 'Full',
  maxmana: 80,
  mp: 120,
  'mp-string': 'Rested',
  maxmp: 120,
});

// ------------------------------------------------------------------- runs

/** Gittan, 2026-09-25 20:15: rats and an undead in the old barrow. */
function gittan1(): Log {
  const log = new Log(new Date(2026, 8, 25, 20, 15, 4));
  const ch: Char = { name: 'Gittan', fullname: 'Gittan the Wanderer', race: 'Hobbit', level: 14, xp: xpForLevel(14) + 1_500, tp: 3_120, hp: 88, mana: 60, mp: 140 };
  const P = 'o-';
  login(log, ch, [member(1, 'you', 'Gittan', 88)], P);
  log.line(c(32, 'The Prancing Pony'));
  log.line('A warm common room with low beams and a crackling fire.');
  log.line('Exits: north, west.');
  log.line('');
  log.prompt(P + '>');
  log.wait(40);
  walk(log, ch, 'west', 'Bree Road', 'The road runs east and west between hedges.', P + '>');
  log.wait(95);
  walk(log, ch, 'west', 'Barrow-downs', 'Low green hills crowned with ancient stones.', P + '>', 4);
  log.wait(120);
  fight(log, ch, ['A white rat'], { xp: 312, p: P, rounds: 2 });
  log.wait(260);
  fight(log, ch, ['A white rat'], { xp: 298, p: P, rounds: 2 });
  log.wait(180);
  walk(log, ch, 'south', 'Inside a Barrow', 'Cold stone walls press close. Something moves in the dark.', P + '>', 6);
  log.wait(90);
  fight(log, ch, ['A wight-noble'], { xp: 2_410, tp: 2, p: P, rounds: 5, undead: true, target: 'wight' });
  log.wait(0.8);
  log.gmcp('Event.Achieved', { what: 'Put a barrow-wight to rest.' });
  log.event(['Achievement unlocked: Put a barrow-wight to rest.'], P + '>');
  log.wait(300);
  narrate(log, 'Fimbul', 'anyone up for Tharbad later?', P + '>');
  log.wait(410);
  fight(log, ch, ['A black snake'], { xp: 540, p: P, rounds: 3, target: 'snake' });
  log.wait(520);
  walk(log, ch, 'north', 'Barrow-downs', 'Low green hills crowned with ancient stones.', P + '>');
  log.wait(60);
  quit(log, P + '>');
  return log;
}

/** Rasta, 2026-09-26 21:00: bats, rangers and a level-up with friends. */
function rasta1(ch: Char): Log {
  const log = new Log(new Date(2026, 8, 26, 21, 0, 12));
  const P = '*';
  login(log, ch, [member(1, 'you', 'Rasta', 172), member(2, 'ally', 'Norsy', 140), member(3, 'npc', 'a citizen mercenary', 200, 'MERC')], P);
  log.line(c(32, 'Rivendell Stables'));
  log.line('Fresh straw and the smell of horses. A path leads south.');
  log.line('A citizen mercenary (MERC) stands here, guarding you.');
  log.line('Exits: south.');
  log.line('');
  log.prompt(P + '>');
  log.wait(30);
  tell(log, 'Norsy', 'bats first, then the rangers?', P + '>');
  log.wait(8);
  log.cmd('tell norsy sure');
  log.wait(0.2);
  log.line(c(32, "You tell Norsy 'sure'"));
  log.line('');
  log.prompt(P + '>');
  log.wait(80);
  walk(log, ch, 'south', 'Misty Mountains, Cave Mouth', 'A dark opening in the grey rock. Wings flutter inside.', P + '>', 12);
  log.wait(60);
  fight(log, ch, ['A bloodthirsty bat'], { xp: 56, p: P, rounds: 2, target: 'bat' });
  log.wait(140);
  // Two bats die in the same round: one fold, the XP split between them.
  fight(log, ch, ['A bloodthirsty bat', 'A large bat'], { xp: 131, p: P, rounds: 3, target: 'bat' });
  log.wait(200);
  log.gmcp('Group.Add', member(4, 'ally', 'Kuzzim', 160));
  log.event(['Kuzzim arrives from the north.', 'Kuzzim starts following you.'], P + '>');
  log.wait(240);
  walk(log, ch, 'east', 'Ranger Camp', 'Cold ashes and trampled grass. Someone was here recently.', P + '>', 18);
  log.wait(90);
  fight(log, ch, ['The hardened ranger'], { xp: 5_424, tp: 3, p: P, rounds: 6, target: 'ranger' });
  log.wait(300);
  narrate(log, 'Taube', 'orcs at the ford again', P + '>');
  log.wait(260);
  // The level-up: the next kill takes XP over the level-42 threshold.
  const need = xpForLevel(ch.level + 1) - ch.xp + 1_200;
  fight(log, ch, ['An elven acolyte'], { xp: need, p: P, rounds: 5, target: 'acolyte' });
  ch.level++;
  log.line(c(1, 'You rise a level!'));
  log.gmcp('Char.StatusVars', { level: ch.level });
  log.gmcp('Event.Achieved', { what: 'That was a quick trip!' });
  log.event(['Achievement unlocked: That was a quick trip!'], P + '>');
  log.wait(180);
  log.gmcp('Group.Remove', 2);
  log.event(['Norsy leaves north.'], P + '>');
  log.wait(360);
  fight(log, ch, ['A thin highwayman'], { xp: 1_880, p: P, rounds: 4, target: 'highwayman' });
  log.wait(240);
  quit(log, P + '>');
  return log;
}

/** Rasta, 22:02 the same evening: a soldier, a pkill, and a death. */
function rasta2(ch: Char): Log {
  const log = new Log(new Date(2026, 8, 26, 22, 2, 40));
  const P = '*';
  login(log, ch, [member(1, 'you', 'Rasta', 172), member(4, 'ally', 'Kuzzim', 160)], P);
  log.line(c(32, 'Ranger Camp'));
  log.line('Cold ashes and trampled grass. Someone was here recently.');
  log.line('Exits: north, west.');
  log.line('');
  log.prompt(P + '>');
  log.wait(45);
  tell(log, 'Kuzzim', 'back? good, whites spotted by the ford', P + '>');
  log.wait(120);
  walk(log, ch, 'west', 'Ford of Bruinen', 'The river runs shallow and fast over round stones.', P + '>', 9);
  log.wait(100);
  fight(log, ch, ['An elite Dúnadan soldier', 'A pack horse (MIN)'], { xp: 3_900, p: P, rounds: 5, target: 'soldier' });
  log.wait(200);
  log.gmcp('Comm.Channel.Text', { channel: 'yells', talker: '*Ibuki*', 'talker-type': 'enemy', text: `${c(31, '*Ibuki the Half-Elf*')} yells 'for the Valar!'` });
  log.event([`${c(31, '*Ibuki the Half-Elf*')} yells 'for the Valar!'`], P + '>');
  log.wait(30);
  log.cmd('kill *ibuki*');
  log.wait(0.2);
  log.line(`You attack ${c(31, '*Ibuki the Half-Elf*')}.`);
  log.gmcp('Char.Vitals', { position: 'fighting', opponent: '*ibuki*', buffer: 'Rasta', 'opponent-hits': 'healthy', 'buffer-hits': 'healthy' });
  log.line('');
  log.prompt(P + ' R:Healthy>');
  for (const w of ['fine', 'hurt', 'wounded', 'dying']) {
    log.wait(2.8);
    log.gmcp('Char.Vitals', { 'opponent-hits': w });
    log.event([c(31, `You cleave ${c(31, '*Ibuki the Half-Elf*')} hard.`), `${c(31, '*Ibuki the Half-Elf*')} slashes you.`], `${P} R:${w}>`);
  }
  log.wait(2.4);
  ch.xp += 60_000;
  log.line('');
  log.gmcp('Char.Vitals', { position: 'standing', opponent: null, buffer: null, 'opponent-hits': null, 'buffer-hits': null, xp: ch.xp });
  log.line(`${c(31, '*Ibuki the Half-Elf*')} has drawn her last breath! R.I.P.`);
  log.line('');
  log.prompt(P + '>');
  log.wait(15);
  narrate(log, 'Kuzzim', 'nice one Rasta', P + '>');
  log.wait(420);
  // A troll too many: the death and its XP penalty.
  log.cmd('kill troll');
  log.wait(0.2);
  log.line('You attack a stone-troll.');
  log.gmcp('Char.Vitals', { position: 'fighting', opponent: 'a stone-troll', buffer: 'Rasta', 'opponent-hits': 'healthy', 'buffer-hits': 'healthy' });
  log.line('');
  log.prompt(P + ' R:Healthy>');
  for (const hp of [120, 70, 25]) {
    log.wait(2.6);
    log.gmcp('Char.Vitals', { hp, 'hp-string': hp > 100 ? 'Fine' : hp > 50 ? 'Wounded' : 'Awful', 'buffer-hits': hp > 100 ? 'fine' : 'bad' });
    log.event([c(31, 'A stone-troll crushes you very hard.')], `${P} HP:${hp > 50 ? 'Hurt' : 'Awful'} R:Healthy>`);
  }
  log.wait(2.5);
  log.line(c(31, 'A stone-troll crushes you extremely hard.'));
  log.line('You are dead! Sorry...');
  ch.xp -= 48_000;
  ch.tp -= 20;
  log.gmcp('Char.Vitals', { hp: 1, 'hp-string': 'Awful', position: 'standing', opponent: null, buffer: null, 'opponent-hits': null, 'buffer-hits': null, xp: ch.xp, tp: ch.tp });
  log.line('');
  log.line(c(32, 'The Temple of Rivendell'));
  log.line('A quiet hall of white stone. You feel the weight of your loss.');
  log.line('Exits: south.');
  log.line('');
  log.prompt(P + '>');
  log.wait(40);
  tell(log, 'Kuzzim', 'ouch. corpse run?', P + '>');
  log.wait(300);
  log.gmcp('Group.Remove', 4);
  log.event(['Kuzzim leaves south.'], P + '>');
  log.wait(600);
  quit(log, P + '>');
  return log;
}

/** Gittan, 2026-09-27 18:40: a short evening. */
function gittan2(): Log {
  const log = new Log(new Date(2026, 8, 27, 18, 40, 51));
  const ch: Char = { name: 'Gittan', fullname: 'Gittan the Wanderer', race: 'Hobbit', level: 14, xp: xpForLevel(14) + 5_060, tp: 3_140, hp: 88, mana: 60, mp: 140 };
  const P = 'o-';
  login(log, ch, [member(1, 'you', 'Gittan', 88)], P);
  log.line(c(32, 'The Prancing Pony'));
  log.line('A warm common room with low beams and a crackling fire.');
  log.line('Exits: north, west.');
  log.line('');
  log.prompt(P + '>');
  log.wait(60);
  log.reply('who', ['Players', '       Gittan the Wanderer', '       Fimbul the Dwarf', '2 players on.'], P + '>');
  log.wait(200);
  walk(log, ch, 'north', 'Bree Market', 'Stalls and carts crowd the square.', P + '>', 2);
  log.wait(150);
  fight(log, ch, ['A mean brigand'], { xp: 860, p: P, rounds: 3, target: 'brigand' });
  log.wait(280);
  quit(log, P + '>');
  return log;
}

// ------------------------------------------------------------- the pipeline

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');

/** Replays one log through the real deriver; returns its events and meta. */
function derive(log: Log): { events: RunEvent[]; meta: RunMeta; chunks: RunChunk[] } {
  const bus = new Bus();
  const sched = new FakeScheduler();
  let ms = log.start.getTime();
  const deriver = new RunEventDeriver({ now: () => ms, scheduler: sched }).attach(bus);
  const events: RunEvent[] = [];
  deriver.subscribe((e) => events.push(e));
  const to = (us: number): void => {
    const target = us / 1000;
    if (target > ms) {
      sched.advance(target - ms);
      ms = target;
    }
  };
  bus.emit('conn.state', { state: 'connecting', prev: 'idle' });
  bus.emit('conn.state', { state: 'login', prev: 'connecting' });
  let name = '';
  let startedUs = 0;
  for (const l of log.out) {
    const ts = Number(l.slice(0, 16));
    const body = l.slice(17);
    to(ts);
    const rec = parseRecord(body);
    if (rec) {
      if (rec.type !== 'GMCP') continue;
      const sp = rec.payload.indexOf(' ');
      const pkg = sp < 0 ? rec.payload : rec.payload.slice(0, sp);
      const json = sp < 0 ? '' : rec.payload.slice(sp + 1);
      bus.emit('gmcp.raw', { pkg, json, ts });
      const data = json ? JSON.parse(json) : undefined;
      bus.emit('gmcp', { pkg, data });
      if (pkg === 'Char.Name') {
        name = (data as { name: string }).name;
        startedUs = ts;
        bus.emit('conn.state', { state: 'playing', prev: 'login' });
      }
    } else if (!body.startsWith('> ')) {
      deriver.onLine(stripAnsi(body), ts);
    }
  }
  const endedUs = log.t + 400_000;
  to(endedUs);
  bus.emit('conn.state', { state: 'disconnected', prev: 'playing' });
  const runId = makeRunId(name, new Date(startedUs / 1000));

  // Chunks as the recorder writes them: about every 2 s of log time.
  const chunks: RunChunk[] = [];
  let cur: string[] = [];
  let first = 0;
  let last = 0;
  const flush = (): void => {
    if (!cur.length) return;
    chunks.push({ runId, seq: chunks.length, firstUs: first, lastUs: last, text: cur.join('') });
    cur = [];
  };
  for (const l of log.out) {
    const ts = Number(l.slice(0, 16));
    if (cur.length && ts - first >= 2e6) flush();
    if (!cur.length) first = ts;
    last = ts;
    cur.push(l + '\n');
  }
  flush();
  const text = chunks.map((c) => c.text).join('');
  const meta: RunMeta = {
    runId,
    character: name,
    startedUs,
    endedUs,
    sealed: true,
    bytes: Buffer.byteLength(text, 'utf8'),
    lines: log.out.length,
    summary: null,
  };
  return { events, meta, chunks };
}

const rasta: Char = { name: 'Rasta', fullname: 'Rasta Fari the Wanderer', race: 'Man', level: 41, xp: 0, tp: 180_400, hp: 172, mana: 40, mp: 131 };
rasta.xp = xpForLevel(42) - 9_000;
const runs = [derive(gittan1()), derive(rasta1(rasta)), derive(rasta2(rasta)), derive(gittan2())];

// Links as the recorder writes them: the character's latest sealed run.
const latest = new Map<string, string>();
for (const r of runs) {
  const start = r.events[0];
  if (start?.type !== 'run_start') throw new Error(`${r.meta.runId}: no run_start`);
  const prev = latest.get(r.meta.character);
  if (prev) start.previousRunId = prev;
  latest.set(r.meta.character, r.meta.runId);
  r.meta.summary = summarizeAll(r.events);
}
// The Rasta evening is one saved session, rated ★★★★.
for (const r of runs.slice(1, 3)) {
  r.meta.saved = true;
  r.meta.rating = 4;
  r.meta.savedUs = r.meta.endedUs;
}

const EXPORTED_US = new Date(2026, 8, 27, 23, 0, 0).getTime() * 1000;
const lines: string[] = [JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: EXPORTED_US })];
for (const r of runs) {
  lines.push(JSON.stringify({ type: 'run', run: r.meta }));
  r.events.forEach((event, seq) => lines.push(JSON.stringify({ type: 'event', runId: r.meta.runId, seq, event })));
  for (const ch of r.chunks) lines.push(JSON.stringify({ type: 'chunk', ...ch }));
}
const gz = gzipSync(Buffer.from(lines.join('\n') + '\n', 'utf8'), { level: 9 });
writeFileSync(new URL('./runs-demo.jsonl.gz', import.meta.url), gz);
for (const r of runs) {
  const count = (t: string) => r.events.filter((e) => e.type === t).length;
  console.log(
    `${r.meta.runId}: ${r.meta.lines} lines, ${Math.round((r.meta.endedUs! - r.meta.startedUs) / 60e6)} min, ` +
      `${r.events.length} events (kills ${count('kill')}, pkills ${count('pkill')}, deaths ${count('char_death')}, ` +
      `level-ups ${count('level_up')}, achievements ${count('achievement')}, groups ${count('group_changed')})`,
  );
}
console.log(`runs-demo.jsonl.gz: ${gz.byteLength} bytes`);
