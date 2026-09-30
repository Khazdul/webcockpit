// Checks that Playwright's Firefox writes a Gecko profile at shutdown.
import { firefox } from '@playwright/test';

const out = process.argv[2] ?? 'perf/results/ffprof-test.json';
const b = await firefox.launch({
  env: {
    ...process.env,
    MOZ_PROFILER_STARTUP: '1',
    MOZ_PROFILER_SHUTDOWN: out,
    MOZ_PROFILER_STARTUP_FEATURES: 'js,stackwalk,cpu,markersallthreads,nomarkerstacks',
    MOZ_PROFILER_STARTUP_FILTERS: 'GeckoMain,Compositor,Renderer,DOM Worker',
    MOZ_PROFILER_STARTUP_INTERVAL: '1',
  },
});
const p = await b.newPage();
await p.setContent('<style>@keyframes k{0%{opacity:1}50%{opacity:0}} div{animation:k 1s steps(1,end) infinite}</style><div>caret</div>');
await new Promise((r) => setTimeout(r, 4000));
await b.close();
console.log('closed');
