// Does the Playwright Firefox build write a Gecko profile at shutdown?
//   node perf/c-gecko-try.ts
import { launch, openApp, pause, startServer, ROOT } from './lib.ts';
import { resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';

const out = '/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/C/gecko-try.json';
const s = await startServer(resolve(ROOT, 'dist'), 4223, false);
const browser = await launch('firefox', {
  env: {
    MOZ_PROFILER_STARTUP: '1',
    MOZ_PROFILER_SHUTDOWN: out,
    MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,cpu,markersallthreads',
    MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer',
    MOZ_PROFILER_STARTUP_INTERVAL: '1',
    MOZ_PROFILER_STARTUP_ENTRIES: '100000000',
  },
});
const page = await openApp(browser, 'firefox', 'http://127.0.0.1:4223');
await page.keyboard.press('F12');
await pause(1000);
await browser.close();
s.close();
await pause(2000);
console.log(existsSync(out) ? `profile: ${statSync(out).size} bytes` : 'no profile written');
