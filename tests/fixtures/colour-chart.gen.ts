// Generates tests/fixtures/colour-chart.log, MUME's colour help pages
// (tests/fixtures/colour-chart.ts) in the raw capture format
// (src/capture/format.ts):
//
//   node tests/fixtures/colour-chart.gen.ts
//
// `help 24-bit colours` and a 256-colour page in the same layout, each paged
// as MUME pages help text (Return between screens). Open it with
// `/?fixture=colour-chart.log` on the dev server.

import { writeFileSync } from 'node:fs';
import { chartScreens, pagerLine } from './colour-chart.ts';

const T0 = 1790719880000000; // µs
const PROMPT = 'oO Mana:Burning>';
const out: string[] = [];
let t = 0; // µs since T0

const ts = (): string => String(T0 + t).padStart(16, '0');
const line = (text: string): void => {
  out.push(`${ts()} ${text}`);
  t += 200; // MUME sends a page in a few ms
};
const cmd = (text: string): void => {
  t += 2_000_000;
  out.push(`${ts()} > ${text}`);
  t += 600_000;
};

line(PROMPT);
for (const [kind, command] of [
  ['24-bit', 'help 24-bit colours'],
  ['256', 'help 256 colours'],
] as const) {
  cmd(command);
  const screens = chartScreens(kind);
  const total = screens.reduce((n, s) => n + s.length, 0);
  let shown = 0;
  screens.forEach((s, i) => {
    for (const l of s) line(l);
    shown += s.length;
    if (i < screens.length - 1) {
      line(pagerLine(Math.round((shown / total) * 100), i === 0));
      cmd('');
    }
  });
  line('');
  line(PROMPT);
}

writeFileSync(new URL('./colour-chart.log', import.meta.url), out.join('\n') + '\n');
