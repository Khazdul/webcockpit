// Seeds the run library of a page on the dev server (round 11), so History,
// its Stats, Spotlights, the Diary and the Log out dialog have something to
// show: a synthetic backup of invented runs (events only, no log text),
// dated relative to today, and the e2e demo backup (captured text, for Spotlights), restored through
// the page's own
// `__wc.runs().restore()` (round 8's seed, with dates that the 14-day
// retention keeps without pinning the clock). Throwaway mockup tooling.


/** [character, days ago, hour, minute, minutes long, level, saved rating or 0, deeds] */
const RUNS = [
  ['Gibur', 12, 19, 5, 221, 38, 0, ['L39', 'A:Slew the Great Goblin in his own hall.', 'K:the Great Goblin']],
  ['Aldereth', 11, 18, 12, 143, 22, 3, ['L23', 'A:Found the hidden stair of Moria.', 'P:Grishnak:the Orc']],
  ['Gibur', 10, 21, 40, 187, 39, 5, ['L40', 'P:Ufthak:the Orc', 'P:Snaga:the Orc', 'A:Defended the Old Forest Road against a warband.']],
  ['Rasta', 9, 17, 55, 64, 27, 0, ['K:a hill-troll', 'D']],
  ['Aldereth', 8, 19, 20, 205, 23, 4, ['L24', 'K:a barrow-wight', 'A:Walked the Barrow-downs by night.']],
  ['Gibur', 6, 20, 2, 132, 40, 0, ['K:a warg', 'K:a warg', 'P:Lugdush:the Orc']],
  ['Gittan', 5, 18, 45, 78, 11, 0, ['L12', 'A:Crossed the Brandywine Bridge for the first time.']],
  ['Rasta', 3, 22, 10, 171, 27, 4, ['L28', 'P:Bolg:the Orc', 'A:Returned from the Trollshaws with a troll hoard.']],
  ['Gibur', 1, 19, 33, 244, 40, 5, ['L41', 'A:Slew the Witch-king’s lieutenant in Carn Dûm.', 'K:a stone troll', 'K:a stone troll', 'D']],
];

/** The synthetic backup's lines (the format of src/runs/library.ts). */
export function syntheticLines(nowMs) {
  const lines = [JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: nowMs * 1000 })];
  const today = new Date(nowMs);
  for (const [character, ago, hh, mm, mins, level, rating, deeds] of RUNS) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago, hh, mm, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const runId = `${character}/${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hh)}-${pad(mm)}-00`;
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

/** Restores the synthetic runs into the page's library (the space the page is in). */
export async function seed(page) {
  await page.waitForFunction(() => window.__wc !== undefined);
  const lines = syntheticLines(Date.now());
  return page.evaluate(async (ls) => {
    const lib = await window.__wc.runs();
    // The e2e demo backup (tests/fixtures/runs-demo.jsonl.gz): runs with captured text, for Spotlights.
    const demo = await lib.restore(await (await fetch('/__fixtures/runs-demo.jsonl.gz')).blob());
    const gz = await new Response(new Blob([ls.join('\n') + '\n']).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    return { demo, synthetic: await lib.restore(gz) };
  }, lines);
}
