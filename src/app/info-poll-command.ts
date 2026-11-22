// `#infopoll`: the dev server's hook for stage 77 part C's live checks.
// Asks for a poll now and prints the info model. Part D deletes this file
// and its few lines in app.ts (`onCommand`, under `import.meta.env.DEV`).

import { ABILITIES } from '../gmcp/age';
import type { InfoPoll } from '../gmcp/info-poll';
import type { GameState } from '../gmcp/state';

export const INFO_POLL_COMMAND = '#infopoll';

/** Asks, and returns the system lines. The answer comes later: type it again to see it. */
export function infoPollReport(poll: InfoPoll, game: GameState, now: number): string[] {
  const gate = poll.gate();
  const refused = poll.request();
  const { answer: a, at } = game.info;
  const rows = [
    refused === null ? 'infopoll: sent. Type #infopoll again for the answer.' : `infopoll: not sent: ${refused}.`,
    `  gate: ${gate === null ? 'open' : `closed (${gate})`} · failures: ${poll.failures} · wimpy shown: ${game.char.view().wimpy ?? '—'}`,
  ];
  if (!a || at === null) return [...rows, '  no data'];
  rows.push(`  data ${Math.round((now - at) / 1000)} s old`);
  const { abilities, ...fields } = a;
  for (const [key, v] of Object.entries(fields)) rows.push(`  ${key}: ${v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : v}`);
  for (const k of ABILITIES) {
    const { current, unaffected, delta } = abilities[k];
    rows.push(`  ${k}: current ${current ?? '—'}, unaffected ${unaffected ?? '—'}, delta ${delta ?? '—'}`);
  }
  return rows;
}
