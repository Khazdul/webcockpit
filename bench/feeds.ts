// Load feeds for the owner-geometry benchmarks (Node side). Load this
// module after bench/browser-bench.ts has registered its resolve hook
// (the app's sources import without extensions).
//
// - `loginFrames`: a GMCP login (Comm.Channel.List, Char.Name,
//   Char.StatusVars, Char.Vitals, Group.Set), so the session reaches
//   `playing`, the side panes are active and the recorder runs.
// - `playLog`: a "play" log built from one of the owner's Cockpit logs
//   (which carry no GMCP) with synthesized GMCP at MUME's rates
//   (notes/research/perf-review/harness/E/gen-play.ts): a Char.Vitals on
//   every prompt (fight fields on fight prompts), a Group.Update for a
//   random member on most fight prompts, a Comm.Channel.Text before every
//   comm line, Room.Info + Event.Moved (the map-demo walk, real arda.mm2
//   rooms) after every move command.
// - `busyWindow`: the 90th-percentile busiest window of a log.
// - `colourPages`: MUME's colour help pages (tests/fixtures/colour-chart.ts)
//   as the server sends them, one screen plus the pager line per page.
// - `framesOf`: telnet frames (as ReplaySocket would at `speed`).

import { readFileSync } from 'node:fs';
import { logToFrames } from '../src/net/replay-socket';
import { chartScreens, pagerLine } from '../tests/fixtures/colour-chart';

const fixture = (name: string) => readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), 'utf8');
const GMCP_RE = /^\d{16} \x1bGMCP /;
const body = (l: string) => l.slice(l.indexOf(' ') + 1);

export interface Frame {
  atMs: number;
  /** Base64 bytes (empty for a command). */
  b64: string;
  /** A recorded command, to be typed (with `sends`). */
  sent?: string;
}

/** Telnet frames of a log at `speed` (0: 16 KB frames); with `sends`, the recorded commands as their own entries. */
export function framesOf(logText: string, speed = 0, sends = false): Frame[] {
  const out: Frame[] = [];
  for (const f of logToFrames(logText, { speed, sends })) {
    if (f.sent !== undefined) out.push({ atMs: f.atMs, b64: '', sent: f.sent });
    else if (f.bytes.length) out.push({ atMs: f.atMs, b64: Buffer.from(f.bytes).toString('base64') });
  }
  return out;
}

export const b64Bytes = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

/** The GMCP login records of tests/fixtures/gmcp-demo.log as a log at `ts` (µs). */
export function loginLog(ts = 1_790_449_200_000_000): string {
  const demo = fixture('gmcp-demo.log').split('\n').filter((l) => GMCP_RE.test(l));
  const out: string[] = [];
  for (const w of ['Comm.Channel.List', 'Char.Name', 'Char.StatusVars', 'Char.Vitals', 'Group.Set']) {
    const l = demo.find((x) => x.includes(`GMCP ${w} `));
    if (l) out.push(`${ts} ${body(l)}`);
  }
  return out.join('\n') + '\n';
}

/** The login as base64 frames. */
export const loginFrames = (): string[] => framesOf(loginLog()).map((f) => f.b64);

/** The first line of the busiest window of `windowS` s (90th percentile by lines), 1-based. */
export function busyWindow(logText: string, windowS: number): number {
  const lines = logText.split('\n');
  const idx: number[] = [];
  const ts: number[] = [];
  lines.forEach((l, i) => {
    if (/^\d{16} /.test(l)) {
      idx.push(i);
      ts.push(Number(l.slice(0, 16)));
    }
  });
  const W = windowS * 1e6;
  const counts: { i: number; n: number }[] = [];
  let j = 0;
  for (let i = 0; i < ts.length; i += 50) {
    while (j < ts.length && ts[j]! < ts[i]! + W) j++;
    counts.push({ i, n: j - i });
  }
  if (counts.length === 0) return 1;
  const pick = [...counts].sort((a, b) => a.n - b.n)[Math.floor(counts.length * 0.9)]!;
  return idx[pick.i]! + 1;
}

/** xorshift32, seeded. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const MOVE = /^(n|s|e|w|u|d|north|south|east|west|up|down)$/i;
const COMM_RE = /^\*?(.+?) (narrates|tells you|says|yells|prays) '(.*)'(?: in [A-Z]\w+)?\.?\*?$/;
const COMM_CH: Record<string, string> = { narrates: 'tales', 'tells you': 'tells', says: 'says', yells: 'yells', prays: 'prayers' };
const isPrompt = (l: string): boolean => {
  const t = l.replace(ANSI, '').trim();
  return t.length > 0 && t.length < 80 && t.endsWith('>') && !t.startsWith('> ');
};
const hpWord = (p: number): string =>
  p >= 1 ? 'Healthy' : p > 0.8 ? 'Fine' : p > 0.6 ? 'Hurt' : p > 0.4 ? 'Wounded' : p > 0.2 ? 'Bad' : 'Awful';

export interface PlayLog {
  text: string;
  /** Log time covered (ms, gaps capped at 2 s). */
  logMs: number;
  counts: { lines: number; prompts: number; vitals: number; groupUpdates: number; comm: number; moves: number; commands: number };
}

export interface PlayLogOptions {
  /** First line (1-based); default 1. */
  fromLine?: number;
  /** Stop after this much log time (ms; gaps capped at 2 s); default all. */
  maxMs?: number;
  seed?: number;
  /** Prepend the login (Comm.Channel.List, Char.Name, …). Default true. */
  login?: boolean;
}

/** A Cockpit log with synthesized GMCP (see the header). */
export function playLog(src: string, o: PlayLogOptions = {}): PlayLog {
  const lines = src.split('\n');
  const rnd = rng(o.seed ?? 1);
  const maxMs = o.maxMs ?? Infinity;
  const walk: Array<{ info: string; moved: string | null }> = [];
  {
    const recs = fixture('map-demo.log')
      .split('\n')
      .map(body)
      .filter((l) => l.startsWith('\x1bGMCP Room.Info ') || l.startsWith('\x1bGMCP Event.Moved '));
    for (let i = 0; i < recs.length; i++) {
      if (!recs[i]!.startsWith('\x1bGMCP Room.Info ')) continue;
      const next = recs[i + 1];
      walk.push({ info: recs[i]!.slice(6), moved: next?.startsWith('\x1bGMCP Event.Moved ') ? next.slice(6) : null });
    }
  }
  const members = [
    { id: 2, type: 'ally', name: 'Gibur', max: 140 },
    { id: 3, type: 'ally', name: 'Dori', max: 120 },
    { id: 4, type: 'npc', name: 'a citizen mercenary', label: 'MERC', max: 200 },
    { id: 5, type: 'ally', name: 'Borghozor', max: 180 },
    { id: 6, type: 'npc', name: 'a large dog', label: 'DOG', max: 60 },
  ];
  const out: string[] = [];
  const G = (ts: string, payload: string): void => {
    out.push(`${ts} \x1bGMCP ${payload}`);
  };
  let hp = 254;
  let mana = 80;
  let mp = 112;
  const maxhp = 254;
  const maxmana = 115;
  const maxmp = 112;
  const mhp = new Map(members.map((m) => [m.id, m.max]));
  let i = Math.max(0, (o.fromLine ?? 1) - 1);
  while (i < lines.length && !/^\d{16} /.test(lines[i]!)) i++;
  const counts = { lines: 0, prompts: 0, vitals: 0, groupUpdates: 0, comm: 0, moves: 0, commands: 0 };
  if (i >= lines.length) return { text: '', logMs: 0, counts };
  const ts0 = lines[i]!.slice(0, 16);
  if (o.login !== false) {
    for (const l of loginLog(Number(ts0)).split('\n')) if (l) out.push(l);
    G(
      ts0,
      'Group.Set ' +
        JSON.stringify([
          { id: 1, type: 'you', name: 'Rasta', label: 0, hp: maxhp, maxhp },
          ...members.map((m) => ({ id: m.id, type: m.type, name: m.name, label: m.label ?? 0, hp: m.max, 'hp-string': 'Healthy', maxhp: m.max, mana: 90, 'mana-string': 'Full', maxmana: 90, mp: 110, 'mp-string': 'Rested', maxmp: 110 })),
        ]),
    );
  }
  let clockMs = 0;
  let lastTs = Number(ts0);
  let pendingMove = false;
  let walkI = 0;
  for (; i < lines.length; i++) {
    const raw = lines[i]!;
    if (!/^\d{16} /.test(raw)) continue;
    const tsS = raw.slice(0, 16);
    const ts = Number(tsS);
    clockMs += Math.min(Math.max(0, ts - lastTs) / 1000, 2000);
    lastTs = ts;
    if (clockMs > maxMs) break;
    const text = raw.slice(17);
    if (text.startsWith('> ') || text === '>') {
      counts.commands++;
      if (MOVE.test(text.slice(2).trim())) pendingMove = true;
      out.push(raw);
      continue;
    }
    counts.lines++;
    const plain = text.replace(ANSI, '');
    if (pendingMove && plain.trim() !== '' && walk.length) {
      pendingMove = false;
      const w = walk[walkI++ % walk.length]!;
      G(tsS, w.info);
      if (w.moved) G(tsS, w.moved);
      mp = Math.max(0, mp - 1 - Math.floor(rnd() * 3));
      counts.moves++;
    }
    const cm = COMM_RE.exec(plain.trim());
    if (cm) {
      const npc = /^(A|An|The) /.test(cm[1]!) || cm[1]!.includes('(');
      G(tsS, 'Comm.Channel.Text ' + JSON.stringify({ channel: COMM_CH[cm[2]!], talker: cm[1], 'talker-type': npc ? 'npc' : 'player', text: plain.trim() }));
      counts.comm++;
    }
    if (isPrompt(text)) {
      counts.prompts++;
      const fight = / R /.test(plain) || (/\b[A-Z][a-z]+:[A-Z]/.test(plain) && /[a-z]+[-:][A-Z]?[a-z]*>\s*$/.test(plain.trim()));
      hp = Math.max(20, Math.min(maxhp, hp + Math.round((rnd() - (fight ? 0.6 : 0.3)) * 20)));
      mana = Math.max(0, Math.min(maxmana, mana + Math.round((rnd() - 0.4) * 6)));
      mp = Math.max(0, Math.min(maxmp, mp + (rnd() < 0.3 ? 2 : 0)));
      const v: Record<string, unknown> = { hp, 'hp-string': hpWord(hp / maxhp), mana, mp };
      if (fight) {
        v.position = 'fighting';
        v['opponent-hits'] = hpWord(rnd());
        if (rnd() < 0.3) {
          v.buffer = 'Gibur';
          v['buffer-hits'] = hpWord(0.3 + rnd() * 0.7);
        }
      }
      G(tsS, 'Char.Vitals ' + JSON.stringify(v));
      counts.vitals++;
      // Most fight prompts and some others update a group member.
      if (rnd() < (fight ? 0.8 : 0.1)) {
        const m = members[Math.floor(rnd() * members.length)]!;
        const cur = Math.max(1, Math.min(m.max, (mhp.get(m.id) ?? m.max) + Math.round((rnd() - 0.55) * 30)));
        mhp.set(m.id, cur);
        G(tsS, 'Group.Update ' + JSON.stringify({ id: m.id, hp: cur, 'hp-string': hpWord(cur / m.max) }));
        counts.groupUpdates++;
      }
    }
    out.push(raw);
  }
  return { text: out.join('\n') + '\n', logMs: clockMs, counts };
}

/** MUME's colour help pages as sent: each screen and its pager line, CR LF. */
export function colourPages(kind: '24-bit' | '256'): string[] {
  const screens = chartScreens(kind);
  return screens.map((s, i) => [...s, i < screens.length - 1 ? pagerLine(50, i === 0) : 'oO Mana:Burning>'].join('\r\n') + '\r\n');
}

/** A small combat-like frame (4 rows, some coloured), numbered. */
export function combatFrame(n: number): string {
  return (
    `\x1b[33mYou hit the orc warrior hard. (${n})\x1b[0m\r\n` +
    `The orc warrior slashes you.\r\n` +
    `\x1b[31mGibur massacres the orc warrior with his slash.\x1b[0m\r\n` +
    `oO Mana:Burning Mov:Tired R orc:Wounded>\r\n`
  );
}

/** `lines` synthetic lines (some coloured), as the stage-1 scrollback bench. */
export function synthBatch(lines: number, seed: number): string {
  let s = '';
  for (let i = 0; i < lines; i++) {
    const k = seed * lines + i;
    if (i % 10 === 0) s += `\x1b[32mA Room Called Number ${k}\x1b[0m\r\n`;
    else if (i % 7 === 0) s += `\x1b[33mSomeone narrates 'message ${k} with a bit of text to wrap the line'\x1b[0m\r\n`;
    else s += `A line of plain description text, number ${k}, about seventy characters.\r\n`;
  }
  return s;
}

/** The bundled khazdul profile plus a printable-key macro (ADR 0026), as in the input review. */
export function keyProfile(): string {
  return readFileSync(new URL('../src/profiles/khazdul.tin', import.meta.url), 'utf8') + '\n#macro {Backquote} {sc}\n';
}
