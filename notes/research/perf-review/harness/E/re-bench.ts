// Cost of the map forwarder's move-failure regex per text line (Node/V8).
import { readFileSync } from 'node:fs';
// Copied from src/map/client.ts (MOVE_FAILURE_RE) for a Node run.
const MOVE_FAILURE_RE = /^(?:(You are dead!)|You failed to climb|You need to swim to go there\.|You cannot ride there\.|You are too exhausted\.|You are too exhausted to ride\.|Your mount refuses to follow your orders!|You failed swimming there\.|You can't go into deep water!|You cannot ride into deep water!|You unsuccessfully try to break through the ice\.|Your boat cannot enter this place\.|Alas, you cannot go that way\.\.\.|No way! You are fighting for your life!|Nah\.\.\. You feel too relaxed to do that\.|Maybe you should get on your feet first\?|In your dreams, or what\?|If you still want to try, you must|ZBLAM! .+ doesn't want you riding (?:him|her|it) anymore\.$|.*(?:seems? to be closed|is too steep, you need to climb to go there|is too exhausted)\.$)/;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const lines = readFileSync('/home/ole/MUME/data/runs/Rasta/2026-09-18T18-11-42.log', 'utf8')
  .split('\n')
  .map((l) => l.slice(17).replace(ANSI, ''))
  .filter((l) => !l.startsWith('> '));
let hits = 0;
for (let r = 0; r < 3; r++) for (const l of lines) if (MOVE_FAILURE_RE.exec(l)) hits++;
const t0 = performance.now();
const R = 10;
for (let r = 0; r < R; r++) for (const l of lines) if (MOVE_FAILURE_RE.exec(l)) hits++;
const ms = performance.now() - t0;
console.log(`${lines.length} lines × ${R}: ${((ms / (lines.length * R)) * 1e6).toFixed(0)} ns/line (hits ${hits})`);
