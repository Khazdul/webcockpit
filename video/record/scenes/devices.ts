// The device prototype of film 2 (video/manuscript-2.md act 6, stage 70):
// one live session on desktop, tablet and phone. Three takes of the same
// game timeline, one per device, recorded one after the other:
//
//   devices-desktop  1600×900 CSS at DPR 1.2 (the film's 1920×1080): Map
//                    docked, Group and Timers floating, typed on a keyboard
//   devices-tablet   820×1180 CSS (an iPad in portrait), mobile and touch,
//                    DPR 1: the phone's game layout (ADR 0140)
//   devices-phone    390×844 CSS, mobile and touch, DPR 1.2: the phone's game
//                    layout (ADR 0136-0138): fight card, map lens, compass
//
// Off camera every take is brought to the same moment: the Bree run's GMCP
// and text from its start to 119.0 s sent fast down a mocked socket (no
// commands typed). On camera the wolf fight plays from 119.0 s on a fixed
// clock: the `sync` marker is the excerpt's 0 in every take, so the
// composition (src/compositions/DevicesProto.tsx) shows the same game moment
// on each device at the same film time. The game is driven by the feed alone
// (the mock ignores what the client sends), so the input only has to look
// right: the desktop types on the keyboard; the touch devices tap our own
// keyboard (ADR 0138) for words and the compass for directions, with touch
// presses held like a finger's (the composition draws the touches from the
// input log).
import type { CDPSession, Page, WebSocketRoute } from '@playwright/test';
import { GMCP, IAC, WILL, type Step, gmcpBytes, sleep } from '../../../scripts/lib/mume-feed.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
import { FILM_PAGE, prepareFilm } from '../lib/film-state.ts';
import { seeded } from '../lib/mouse.ts';
import { type Excerpt, excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

export type Device = 'desktop' | 'tablet' | 'phone';

/** The run second the excerpt starts at (the pre-play ends here). */
const FROM = 119.0;

/** The wolf (take A's cut of it), then the walk back east to the West Gate. */
export const DEVICES_EXCERPT: Excerpt = {
  run: BREE_RUN,
  from: FROM,
  to: 148.2,
  speed: 1,
  maxGap: 1.5,
  // the flee and the way back (take A's dip)
  drop: [[122.3, 125.6]],
  dropCmds: [/^get coins/, /^l$/],
  rewrite: noPonyLabel,
};

/** Camera rolls, then this long before the excerpt's 0 (`sync`), ms. */
const LEAD_MS = 2500;
/** After the excerpt, ms. */
const TAIL_MS = 1500;

const DIRS: Record<string, string> = { n: 'north', e: 'east', s: 'south', w: 'west', u: 'up', d: 'down' };

/** Where a finger lands on an element (CSS px): a little off the centre, as a thumb lands. */
async function aim(page: Page, selector: string, rnd: () => number): Promise<{ x: number; y: number }> {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return { x: b.x + b.width * (0.5 + (rnd() - 0.5) * 0.3), y: b.y + b.height * (0.5 + (rnd() - 0.5) * 0.3) };
}

/** A finger's press at `p` (CSS px), held `holdMs`: pointerdown, then up and the click. */
async function touchAt(cdp: CDPSession, p: { x: number; y: number }, holdMs = 70): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, radiusX: 6, radiusY: 6, force: 1 }] });
  await sleep(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const touch = async (cdp: CDPSession, page: Page, selector: string, rnd: () => number, holdMs = 70): Promise<void> =>
  touchAt(cdp, await aim(page, selector, rnd), holdMs);

const okbKey = (ch: string): string => (ch === ' ' ? '.wc-ph-okb-k[data-act="space"]' : `.wc-ph-okb-k[data-ch="${ch}"]`);

function devicesScene(device: Device): Scene {
  const mobile = device !== 'desktop';
  const viewport = { desktop: undefined, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } }[device];
  return {
    mode: device === 'tablet' ? 'intel-1-png' : 'intel-1.2-png',
    page: { ...FILM_PAGE, ...(viewport ? { viewport, mobile: true } : {}) },

    async setup(page) {
      await prepareFilm(page);
      await page.evaluate(() => {
        type D = {
          weather: { enabled: boolean };
          panes: Record<string, { on: boolean }>;
          profile: string;
          group: { npcMode: string; fight: boolean };
          timers: { layout: string; cols: number | string; style: string; groups: Record<string, { enabled: boolean }> };
        };
        const wc = (window as unknown as { __wc: { settings: { update(fn: (d: D) => void): void } } }).__wc;
        // as take A leaves them at the wolf
        wc.settings.update((d) => {
          d.weather.enabled = true;
          d.panes.map!.on = true;
          d.panes.group!.on = true;
          d.panes.timers!.on = true;
          d.profile = 'khazdul';
          d.group.npcMode = 'all';
          d.group.fight = true;
          d.timers.groups.herb!.enabled = false;
          d.timers.layout = 'flow';
          d.timers.cols = 2;
          d.timers.style = 'bars';
        });
      });
      await sleep(600);
      // A mocked MUME (nothing reaches mume.org): pings answered, everything else ignored.
      let server: WebSocketRoute | null = null;
      await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
        server = ws;
        ws.onMessage((m) => {
          if (Buffer.from(m as Buffer).includes('Core.Ping')) ws.send(gmcpBytes('Core.Ping'));
        });
        ws.send(Buffer.from([IAC, WILL, GMCP]));
      });
      await page.goto('/');
      await page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label', { hasText: 'Enter MUME' }).waitFor();
      await sleep(1500);
      if (mobile) await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
      else await page.keyboard.press('Enter');
      await page.waitForFunction(() => /^(login|playing)/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''), null, { timeout: 20_000 });
      await sleep(800);
      const ws = server as WebSocketRoute | null;
      if (!ws) throw new Error('the client never opened its socket');
      const a = arrival();
      ws.send('out' in a.arrive ? a.arrive.out : Buffer.alloc(0));
      await sleep(500);
      // The run fast to the fight: its server side only, in sends of about 32 KiB.
      const runs = loadBackup(FILM_BACKUP);
      const before = excerptFeed(runs, { run: BREE_RUN, from: 0.5, to: FROM, primeFrom: 0.5, rewrite: noPonyLabel });
      let buf: Buffer[] = [];
      let size = 0;
      for (const st of before.steps) {
        if (!('out' in st)) continue;
        buf.push(st.out);
        size += st.out.length;
        if (size > 32_768) {
          ws.send(Buffer.concat(buf));
          buf = [];
          size = 0;
          await sleep(40);
        }
      }
      if (buf.length) ws.send(Buffer.concat(buf));
      await page.locator('.wc-start').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
      await page
        .locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]')
        .waitFor({ timeout: 30_000 })
        .catch(() => console.warn('  the map did not load'));
      if (mobile) await page.locator('.wc-cockpit[data-phone-game]').waitFor({ timeout: 5000 });
      const ex = excerptFeed(runs, DEVICES_EXCERPT);
      console.log(`  excerpt: ${(ex.durationMs / 1000).toFixed(2)} s, ${ex.steps.filter((s) => 'cmd' in s).length} commands`);
      await sleep(2500);
      if (!mobile) await page.mouse.move(1590, 890);
      return { server: ws, steps: ex.steps, durationMs: ex.durationMs };
    },

    async run({ page, marks }, state) {
      const server = state.server as WebSocketRoute;
      const steps = state.steps as Step[];
      const t0 = Date.now();
      marks.mark('active', 'the take');
      const sync = t0 + LEAD_MS;
      marks.markAt(sync, 'sync', `run ${FROM} s`);
      const until = async (ms: number): Promise<void> => {
        const w = ms - Date.now();
        if (w > 0) await sleep(w);
      };
      const rnd = seeded(20261117);
      const cdp = mobile ? await page.context().newCDPSession(page) : null;
      let kbdUp = false;

      /** Types `cmd` so that its Enter lands at `at` (epoch ms). */
      const command = async (cmd: string, at: number): Promise<void> => {
        if (!cdp) {
          // a keyboard: 70 ms a key, as take A
          const lead = cmd.length * 70 + 40;
          await until(at - lead);
          marks.mark('cmd', cmd);
          await page.locator('.wc-input-field').focus();
          await page.keyboard.type(cmd, { delay: 70 });
          await page.keyboard.press('Enter');
          return;
        }
        const dir = DIRS[cmd];
        if (dir && !kbdUp) {
          await until(at - 40);
          marks.mark('cmd', cmd);
          await touch(cdp, page, `.wc-ph-key[data-cmd="${dir}"]`, rnd, 60 + rnd() * 40);
          return;
        }
        // our keyboard: a thumb's pace, about 140 ms a key, each press on its own time
        const gaps = [...cmd].map(() => 110 + rnd() * 70);
        const typing = gaps.reduce((s, g) => s + g, 0);
        const open = kbdUp ? 0 : 650;
        await until(at - typing - open);
        marks.mark('cmd', cmd);
        if (!kbdUp) {
          await touch(cdp, page, '.wc-input-slot .wc-input-field', rnd, 80);
          await page.locator('.wc-ph-okb').waitFor({ timeout: 2000 });
          kbdUp = true;
        }
        // the keys' places, found before the first press (they stay put while the keyboard is up)
        const spots = [];
        for (const ch of cmd) spots.push(await aim(page, okbKey(ch), rnd));
        const enter = await aim(page, '.wc-ph-okb-k[data-act="enter"]', rnd);
        let tk = at - typing;
        for (const [i, p] of spots.entries()) {
          await until(tk);
          await touchAt(cdp, p, 55 + rnd() * 35);
          tk += gaps[i]!;
        }
        await until(at);
        await touchAt(cdp, enter, 70);
        marks.mark('enter', cmd);
      };

      // the keyboard folds away a moment after a command, so the compass is back for the walk
      const fold = async (): Promise<void> => {
        if (!cdp || !kbdUp) return;
        await sleep(650);
        // (a held touch on Hide keyboard gives no click here: Playwright's tap does)
        await page.locator('.wc-ph-okb-k[data-act="fold"]').first().tap();
        await page.locator('.wc-ph-okb').waitFor({ state: 'hidden', timeout: 1500 }).catch(() => console.warn('  the keyboard did not fold'));
        kbdUp = false;
        marks.mark('fold', 'the keyboard folds');
      };

      // Commands and server output on one clock: a command's typing runs while earlier output arrives.
      const out = (async () => {
        for (const st of steps) {
          if (!('out' in st)) continue;
          await until(sync + (st.at ?? 0));
          server.send(st.out);
        }
      })();
      const cmds = (async () => {
        const list = steps.filter((s): s is Step & { cmd: string } => 'cmd' in s);
        for (const [i, st] of list.entries()) {
          await command(st.cmd, sync + (st.at ?? 0));
          const next = list[i + 1];
          // folded after a command unless another word follows soon
          if (kbdUp && (!next || DIRS[next.cmd] || (next.at ?? 0) - (st.at ?? 0) > 2500)) await fold();
        }
      })();
      await Promise.all([out, cmds]);
      await until(sync + (state.durationMs as number) + TAIL_MS);
      marks.mark('active-end', 'the take');
    },
  };
}

export const devicesDesktop = devicesScene('desktop');
export const devicesTablet = devicesScene('tablet');
export const devicesPhone = devicesScene('phone');
