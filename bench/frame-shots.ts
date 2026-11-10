// Screenshots of a floating pane's frame over the game text and the weather
// (stage 50): the look before and after a change, on dark and Paper, in
// every tint, glass and clear.
//
//   node bench/frame-shots.ts --url http://localhost:5310 --out <dir> [--browser firefox|chromium] [--headed]
//
// Each shot is the float and a margin round it, with game text fed under
// it, the weather pinned to a still, clear night (no rain, no lightning) so
// two builds give comparable pictures. Writes <dir>/<background>-<tint>-<glass|clear>.png.

import { mkdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});

const L = await import('./lib');
const F = await import('./float-frame');
const { listFixtures } = await import('../tests/e2e/fixtures');

const argv = process.argv.slice(2);
const opt = (name: string, def: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : def;
};
const base = opt('url', 'http://localhost:5310');
const out = opt('out', 'shots');
const browser = opt('browser', 'firefox') as 'firefox' | 'chromium';
const TINTS = opt('tints', 'black,red,green,blue,grey,orange,purple').split(',');
const fixture = listFixtures().at(-1);
const logText = readFileSync(fixture ? fixture.path : new URL('../tests/fixtures/map-demo.log', import.meta.url).pathname, 'utf8');
mkdirSync(out, { recursive: true });

const t = await L.launchTarget(browser === 'chromium' ? 'chromium-gpu' : 'firefox', L.OWNER, [], { headless: !argv.includes('--headed') });
for (const paper of [false, true]) {
  for (const glass of [true, false]) {
    for (const tint of TINTS) {
      const c = F.cell({ name: 'shot', paper, glass });
      const settings = F.cellSettings(c) as { panes: Record<string, Record<string, unknown>> };
      settings.panes.statistics!.color = tint;
      const page = await L.openBench(t, base, { settings });
      await page.evaluate(async () => {
        const ctl = await window.__wcBench!.app!.weather?.settled();
        if (!ctl) throw new Error('no weather');
        await ctl.engine.ready;
        ctl.pin({ weather: '', fog: '', position: 'standing', clock: 'night', moonUp: true, light: '' } as never);
      });
      await page.evaluate(() => window.__wcBench!.connectFake());
      const n = await page.evaluate(([text]) => window.__wcBench!.loadFrames(text!, 1, 80), [logText] as const);
      for (let i = 0; i < n; i++) await page.evaluate((k) => window.__wcBench!.inject(k), i);
      await L.pause(4000);
      const r = await page.evaluate(() => {
        const el = document.querySelector('.wc-pane[data-pane="statistics"]')!.getBoundingClientRect();
        return { x: Math.max(0, el.x - 24), y: Math.max(0, el.y - 24), width: el.width + 48, height: el.height + 48 };
      });
      const name = `${out}/${paper ? 'paper' : 'dark'}-${tint}-${glass ? 'glass' : 'clear'}.png`;
      await page.screenshot({ path: name, clip: r });
      console.log(name);
      await L.closePage(page);
    }
  }
}
await t.browser.close();
