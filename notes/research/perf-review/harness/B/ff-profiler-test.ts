// Can Playwright's Firefox write a Gecko profile at shutdown?
import { firefox } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';

const out = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B/ff-test-profile.json';
const b = await firefox.launch({
  env: {
    ...process.env,
    MOZ_PROFILER_STARTUP: '1',
    MOZ_PROFILER_SHUTDOWN: out,
    MOZ_PROFILER_STARTUP_INTERVAL: '0.1',
    MOZ_PROFILER_STARTUP_ENTRIES: '100000000',
    MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,cpu',
    MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain',
  },
});
const page = await b.newPage();
await page.setContent('<p>x</p>');
const r = await page.evaluate(() => {
  function busy(ms: number): number {
    const t = performance.now();
    let x = 0;
    while (performance.now() - t < ms) x += Math.sqrt(x + 1);
    return x;
  }
  return busy(300);
});
console.log('evaluated', r > 0);
await b.close();
await new Promise((ok) => setTimeout(ok, 2000));
console.log('profile exists', existsSync(out), existsSync(out) ? statSync(out).size : 0);
