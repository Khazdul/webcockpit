// Seeds the run library of a page on the dev server, so History, Spotlights
// and the Diary have something to show: the demo backup of the e2e tests
// (tests/fixtures/runs-demo.jsonl.gz, served at /__fixtures/) and a
// synthetic backup of invented runs (events only, no log text), restored
// through the page's own `__wc.runs().restore()`. Throwaway mockup tooling.
//
// The page's clock is pinned to the day after the demo (as
// tests/e2e/demo-clock.ts does): the 14-day retention would otherwise
// sweep the unsaved runs.

export const NOW = new Date(2026, 8, 28, 12, 0, 0);

/** [character, day of September 2026, hour, minute, minutes long, level, saved rating or 0, deeds] */
const RUNS = [
  ['Gibur', 14, 19, 5, 221, 38, 0, ['L39', 'A:Slew the Great Goblin in his own hall.', 'K:the Great Goblin']],
  ['Gibur', 16, 20, 30, 96, 39, 0, ['K:a cave troll', 'K:a grey wolf']],
  ['Aldereth', 17, 18, 12, 143, 22, 3, ['L23', 'A:Found the hidden stair of Moria.', 'P:Grishnak:the Orc']],
  ['Gibur', 18, 21, 40, 187, 39, 5, ['L40', 'P:Ufthak:the Orc', 'P:Snaga:the Orc', 'A:Defended the Old Forest Road against a warband.']],
  ['Rasta', 19, 17, 55, 64, 27, 0, ['K:a hill-troll', 'D']],
  ['Aldereth', 20, 19, 20, 205, 23, 0, ['L24', 'K:a barrow-wight', 'A:Walked the Barrow-downs by night.']],
  ['Gibur', 21, 20, 2, 132, 40, 0, ['K:a warg', 'K:a warg', 'P:Lugdush:the Orc']],
  ['Gittan', 22, 18, 45, 78, 11, 0, ['L12', 'A:Crossed the Brandywine Bridge for the first time.']],
  ['Rasta', 23, 22, 10, 171, 27, 4, ['L28', 'P:Bolg:the Orc', 'A:Returned from the Trollshaws with a troll hoard.']],
  ['Gibur', 24, 19, 33, 244, 40, 0, ['L41', 'A:Slew the Witch-king’s lieutenant in Carn Dûm.', 'D']],
  ['Aldereth', 24, 23, 50, 52, 24, 0, ['K:a wild boar']],
];

/** The synthetic backup's lines (the format of src/runs/library.ts). */
export function syntheticLines() {
  const lines = [JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: NOW.getTime() * 1000 })];
  for (const [character, day, hh, mm, mins, level, rating, deeds] of RUNS) {
    const d = new Date(2026, 8, day, hh, mm, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const runId = `${character}/2026-09-${pad(day)}T${pad(hh)}-${pad(mm)}-00`;
    const start = d.getTime() * 1000;
    const end = start + mins * 60e6;
    const xp0 = level * level * 9000;
    const events = [{ type: 'run_start', us: start, character, level, xp: xp0, tp: level * 14, schema: 1 }];
    const sum = { startUs: start, lastEventUs: end, level, xp: xp0, tp: level * 14, kills: 0, pkills: 0, deaths: 0 };
    deeds.forEach((deed, k) => {
      const us = start + Math.round(((k + 1) / (deeds.length + 1)) * mins * 60e6);
      if (deed[0] === 'L') {
        sum.level = Number(deed.slice(1));
        events.push({ type: 'level_up', us, level: sum.level });
      } else if (deed[0] === 'A') {
        events.push({ type: 'achievement', us, name: deed.slice(2) });
      } else if (deed[0] === 'K') {
        sum.kills++;
        sum.xp += 4200;
        events.push({ type: 'kill', us, logUs: us, mobName: deed.slice(2), xpDelta: 4200 });
      } else if (deed[0] === 'P') {
        const [, name, race] = deed.split(':');
        sum.pkills++;
        sum.xp += 18000;
        events.push({ type: 'pkill', us, logUs: us, name, race, xpDelta: 18000 });
      } else if (deed[0] === 'D') {
        sum.deaths++;
        events.push({ type: 'char_death', us, logUs: us, level: sum.level });
        events.push({ type: 'xp_loss', us: us + 1e6, xpDelta: -60000 });
      }
    });
    events.push({ type: 'run_end', us: end });
    const run = { runId, character, startedUs: start, endedUs: end, sealed: true, bytes: mins * 61000, lines: mins * 410, summary: sum };
    if (rating) Object.assign(run, { saved: true, rating, savedUs: end + 60e6 });
    lines.push(JSON.stringify({ type: 'run', run }));
    events.forEach((event, seq) => lines.push(JSON.stringify({ type: 'event', runId, seq, event })));
  }
  return lines;
}

/** Restores the demo backup and the synthetic runs into the page's library. */
export async function seed(page) {
  await page.waitForFunction(() => window.__wc !== undefined);
  return page.evaluate(async (lines) => {
    const lib = await window.__wc.runs();
    const a = await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    const gz = await new Response(new Blob([lines.join('\n') + '\n']).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    const b = await lib.restore(gz);
    return { demo: a, synthetic: b };
  }, syntheticLines());
}
