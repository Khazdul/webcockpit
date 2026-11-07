// E2E helper for Credits (stage 47): a synthetic chronicle, many
// characters with many deeds, for a book of many spreads (the demo backup
// fills one). Not a spec (no tests).
import type { Page } from '@playwright/test';

/**
 * Restores a synthetic backup: one run per character (in this order, so the
 * chapters come in this order), each with `deeds` level-ups, achievements
 * and PvP kills, a few days before the demo clock.
 */
export async function restoreChronicle(page: Page, chars: string[], deeds: number): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __wc?: unknown }).__wc !== undefined);
  await page.evaluate(
    async ([chars, deeds]) => {
      const base = Date.UTC(2026, 8, 20, 18) * 1000;
      const lines = [JSON.stringify({ type: 'webcockpit-runs', schema: 1, exportedUs: base })];
      chars.forEach((c, i) => {
        const runId = `${c}/2026-09-2${i}T18-00-00`;
        const start = base + i * 86_400e6;
        lines.push(JSON.stringify({ type: 'run', run: { runId, character: c, startedUs: start, endedUs: start + 3_600e6, sealed: true, bytes: 0, lines: 0 } }));
        for (let k = 0; k < deeds; k++) {
          const us = start + (k + 1) * 60e6;
          const event =
            k % 3 === 0
              ? { type: 'level_up', us, level: 10 + k }
              : k % 3 === 1
                ? { type: 'achievement', us, name: `Walked the long road past the ${k}th milestone and lived to tell of it.` }
                : { type: 'pkill', us, logUs: us, name: `Foe${k}`, race: 'the Orc', xpDelta: 1 };
          lines.push(JSON.stringify({ type: 'event', runId, seq: k, event }));
        }
      });
      const gz = await new Response(new Blob([lines.join('\n') + '\n']).stream().pipeThrough(new CompressionStream('gzip'))).blob();
      const w = window as unknown as { __wc: { runs(): Promise<{ restore(b: Blob): Promise<unknown> }> } };
      await (await w.__wc.runs()).restore(gz);
    },
    [chars, deeds] as const,
  );
}
