// Area E harness: builds a "play" log with synthesized GMCP from one of the
// owner's Cockpit raw logs (which carry no GMCP).
//
//   node perf/gen-play.ts <cockpit.log> <fromLine> <minutes> <out.log> [seed]
//
// - Preamble (at the first line's timestamp): Comm.Channel.List, Char.Name,
//   Char.StatusVars, a full Char.Vitals, Group.Set (3 allies, a labelled
//   merc, a dog), and two clock lines so the input-line clock strip counts.
// - Every prompt: a partial Char.Vitals (hp/mana/mp random walk, as MUME
//   sends only changed keys); in a fight prompt also opponent/buffer hits;
//   and a Group.Update for a random member (80 % of fight prompts, 10 %
//   otherwise).
// - Every comm line (narrate, tell, say, yell, pray): a Comm.Channel.Text
//   right before it.
// - The first inbound line after a move command: Room.Info + Event.Moved
//   from the tests/fixtures/map-demo.log walk (real arda.mm2 rooms, so the
//   map locates, re-centres and redraws), looping.
// - Stops after `minutes` of replay time (gaps capped at 2 s, as
//   logToFrames does at speed 1).
//
// Output keeps the Cockpit log format; GMCP records are
// `<µs> \x1bGMCP <Package> <json>` (src/net/replay-socket.ts).

import { readFileSync, writeFileSync } from 'node:fs';

const [, , logPath, fromArg, minArg, outPath, seedArg] = process.argv;
if (!logPath || !fromArg || !minArg || !outPath) {
  console.error('usage: node perf/gen-play.ts <cockpit.log> <fromLine> <minutes> <out.log> [seed]');
  process.exit(2);
}
const fromLine = Number(fromArg);
const maxMs = Number(minArg) * 60_000;
let seed = Number(seedArg ?? 1) >>> 0 || 1;
const rnd = (): number => {
  // xorshift32
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed / 0x1_0000_0000;
};

const src = readFileSync(logPath, 'utf8').split('\n');
const walkRoot = new URL('../tests/fixtures/map-demo.log', import.meta.url);
const walk: Array<{ info: string; moved: string | null }> = [];
{
  const recs = readFileSync(walkRoot, 'utf8')
    .split('\n')
    .map((l) => l.slice(l.indexOf(' ') + 1))
    .filter((l) => l.startsWith('\x1bGMCP Room.Info ') || l.startsWith('\x1bGMCP Event.Moved '));
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i]!;
    if (!r.startsWith('\x1bGMCP Room.Info ')) continue;
    const next = recs[i + 1];
    walk.push({ info: r.slice(6), moved: next?.startsWith('\x1bGMCP Event.Moved ') ? next.slice(6) : null });
  }
}

const out: string[] = [];
const G = (ts: string, payload: string): void => {
  out.push(`${ts} \x1bGMCP ${payload}`);
};

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const isPrompt = (l: string): boolean => {
  const t = l.replace(ANSI, '').trim();
  return t.length > 0 && t.length < 80 && t.endsWith('>') && !t.startsWith('> ');
};
const MOVE = /^(n|s|e|w|u|d|north|south|east|west|up|down)$/i;
// `<talker> <verb> '<text>'[ in <Language>].` (players and NPCs; narrates
// may be wrapped in `*…*`).
const COMM_RE = /^\*?(.+?) (narrates|tells you|says|yells|prays) '(.*)'(?: in [A-Z]\w+)?\.?\*?$/;
const COMM_CH: Record<string, string> = { narrates: 'tales', 'tells you': 'tells', says: 'says', yells: 'yells', prays: 'prayers' };

const members = [
  { id: 2, type: 'ally', name: 'Gibur', max: 140 },
  { id: 3, type: 'ally', name: 'Dori', max: 120 },
  { id: 4, type: 'npc', name: 'a citizen mercenary', label: 'MERC', max: 200 },
  { id: 5, type: 'ally', name: 'Borghozor', max: 180 },
  { id: 6, type: 'npc', name: 'a large dog', label: 'DOG', max: 60 },
];
const hpWord = (p: number): string =>
  p >= 1 ? 'Healthy' : p > 0.8 ? 'Fine' : p > 0.6 ? 'Hurt' : p > 0.4 ? 'Wounded' : p > 0.2 ? 'Bad' : 'Awful';

let hp = 254;
let mana = 80;
let mp = 112;
const vit = { maxhp: 254, maxmana: 115, maxmp: 112 };
const mhp = new Map(members.map((m) => [m.id, m.max]));

let i = fromLine - 1;
while (i < src.length && !/^\d{16} /.test(src[i]!)) i++;
const ts0 = src[i]!.slice(0, 16);
// Preamble.
G(ts0, 'Comm.Channel.List [{"name":"tales","caption":"Narrates","command":"narrate"},{"name":"tells","caption":"Tells","command":"tell"},{"name":"says","caption":"Says","command":"say"},{"name":"yells","caption":"Yells","command":"yell"},{"name":"prayers","caption":"Prayers","command":"pray"},{"name":"emotes","caption":"Emotes","command":"emote"},{"name":"whispers","caption":"Whispers","command":"whisper"},{"name":"questions","caption":"Questions","command":"question"},{"name":"songs","caption":"Songs","command":"sing"},{"name":"socials","caption":"Socials","command":"social"}]');
G(ts0, 'Char.Name {"name":"Rasta","fullname":"Rasta the Rasta"}');
G(ts0, 'Char.StatusVars {"name":"Rasta","fullname":"Rasta the Rasta","race":"Man","subrace":"Dunadan","subclass":"warrior","level":25,"next-level-xp":20000,"next-level-tp":500}');
G(ts0, `Char.Vitals {"hp":${hp},"hp-string":"Healthy","maxhp":254,"mana":${mana},"mana-string":"Hot","maxmana":115,"mp":${mp},"mp-string":"Rested","maxmp":112,"xp":5770000,"tp":41500,"carrying":"light","ride":null,"ridden":null,"climb":null,"sneak":null,"hidden":false,"swim":false,"light":"*","fog":null,"weather":" ","alertness":"normal","mood":"brave","spell-effort":"normal","position":"standing","mount-moves":null,"wimpy":30,"opponent":null,"buffer":null,"opponent-hits":null,"buffer-hits":null}`);
G(
  ts0,
  'Group.Set ' +
    JSON.stringify([
      { id: 1, type: 'you', name: 'Rasta', label: 0, hp: 254, maxhp: 254 },
      ...members.map((m) => ({
        id: m.id,
        type: m.type,
        name: m.name,
        label: m.label ?? 0,
        hp: m.max,
        'hp-string': 'Healthy',
        maxhp: m.max,
        mana: 90,
        'mana-string': 'Full',
        maxmana: 90,
        mp: 110,
        'mp-string': 'Rested',
        maxmp: 110,
      })),
    ]),
);
out.push(`${ts0} 1 pm on Sunday, the 20th of Forelithe, year 2854 of the Third Age.`);
out.push(`${ts0} The current time is 1:23 pm.`);

let clockMs = 0;
let lastTs = Number(ts0);
let pendingMove = false;
let walkI = 0;
const counts = { lines: 0, prompts: 0, vitals: 0, groupUpd: 0, comm: 0, moves: 0, cmds: 0, fightPrompts: 0 };

for (; i < src.length; i++) {
  const raw = src[i]!;
  if (!/^\d{16} /.test(raw)) continue;
  const tsS = raw.slice(0, 16);
  const ts = Number(tsS);
  clockMs += Math.min(Math.max(0, ts - lastTs) / 1000, 2000);
  lastTs = ts;
  if (clockMs > maxMs) break;
  const body = raw.slice(17);
  if (body.startsWith('> ') || body === '>') {
    counts.cmds++;
    if (MOVE.test(body.slice(2).trim())) pendingMove = true;
    out.push(raw);
    continue;
  }
  counts.lines++;
  const plain = body.replace(ANSI, '');
  if (pendingMove && plain.trim() !== '') {
    pendingMove = false;
    const w = walk[walkI++ % walk.length]!;
    G(tsS, w.info);
    if (w.moved) G(tsS, w.moved);
    mp = Math.max(0, mp - 1 - Math.floor(rnd() * 3));
    counts.moves++;
  }
  const cm = COMM_RE.exec(plain.trim());
  if (cm) {
    const channel = COMM_CH[cm[2]!]!;
    const npc = /^(A|An|The) /.test(cm[1]!) || cm[1]!.includes('(');
    G(tsS, 'Comm.Channel.Text ' + JSON.stringify({ channel, talker: cm[1], 'talker-type': npc ? 'npc' : 'player', text: plain.trim() }));
    counts.comm++;
  }
  if (isPrompt(body)) {
    counts.prompts++;
    const fight = /\b[A-Z][a-z]+:[A-Z]/.test(plain) && /[a-z]+[-:][A-Z]?[a-z]*>\s*$/.test(plain.trim()) || / R /.test(plain);
    if (fight) counts.fightPrompts++;
    hp = Math.max(20, Math.min(vit.maxhp, hp + Math.round((rnd() - (fight ? 0.6 : 0.3)) * 20)));
    mana = Math.max(0, Math.min(vit.maxmana, mana + Math.round((rnd() - 0.4) * 6)));
    mp = Math.max(0, Math.min(vit.maxmp, mp + (rnd() < 0.3 ? 2 : 0)));
    const v: Record<string, unknown> = { hp, 'hp-string': hpWord(hp / vit.maxhp), mana, mp };
    if (fight) {
      v.position = 'fighting';
      v['opponent-hits'] = hpWord(rnd());
      if (rnd() < 0.3) {
        v.buffer = 'Gibur';
        v['buffer-hits'] = hpWord(0.3 + rnd() * 0.7);
      }
    } else if (rnd() < 0.05) {
      v.position = 'standing';
    }
    G(tsS, 'Char.Vitals ' + JSON.stringify(v));
    counts.vitals++;
    if (rnd() < (fight ? 0.8 : 0.1)) {
      const m = members[Math.floor(rnd() * members.length)]!;
      const cur = Math.max(1, Math.min(m.max, (mhp.get(m.id) ?? m.max) + Math.round((rnd() - 0.55) * 30)));
      mhp.set(m.id, cur);
      G(tsS, 'Group.Update ' + JSON.stringify({ id: m.id, hp: cur, 'hp-string': hpWord(cur / m.max) }));
      counts.groupUpd++;
    }
  }
  out.push(raw);
}
writeFileSync(outPath, out.join('\n') + '\n');
console.log(JSON.stringify({ out: outPath, replayMs: Math.round(clockMs), ...counts }));
