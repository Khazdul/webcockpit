// Film 2's device act (video/manuscript-2.md act 4, stage 70; owner rounds 1
// and 2): one live session that goes on from a desktop to a tablet to a
// phone, one device live at a time. Three takes of the same game timeline,
// one per device, recorded one after the other:
//
//   devices-desktop  1600×900 CSS at DPR 1.2 (the film's 1920×1080): Map
//                    docked, Group and Timers floating, typed on a keyboard
//                    (the prototype's; film 2 uses film2-a as its desktop)
//   devices-tablet   1180×820 CSS (an iPad in landscape), mobile and touch,
//                    DPR 1.5 (the camera goes in on it, owner round 2): the
//                    phone's game layout (ADR 0140); after the fight the map
//                    lens moved, made about half again as large and its zoom
//                    stepped by taps (round 53k)
//   devices-phone    390×844 CSS, mobile and touch, DPR 1.2: the phone's game
//                    layout (ADR 0136-0138); later Messages (Comm) with two
//                    chats, the pane strip swiped and its band made smaller
//                    (no landscape turn since owner round 2)
//
// Off camera every take is brought to the same moment: the Bree run's GMCP
// and text from its start to 119.0 s sent fast down a mocked socket (no
// commands typed). On camera the game plays on a fixed clock whose 0 is the
// `sync` marker in every take (the schedule: src/devices.ts): the wolf
// fight, a rest, the walk back into Bree, and staged tells (feeds/comm.ts,
// invented names). The composition (src/compositions/DevicesProto.tsx)
// shows each device only while it is the live one. The game is driven by
// the feed alone (the mock ignores what the client sends), so the input only
// has to look right: the desktop types on the keyboard; the touch devices
// tap our own keyboard (ADR 0138) for words and the compass for directions,
// with touch presses held like a finger's (the composition draws the
// touches from the input log).
import type { CDPSession, Page, WebSocketRoute } from '@playwright/test';
import { type DevWindow, GMCP, IAC, WILL, type Step, gmcpBytes, sleep } from '../../../scripts/lib/mume-feed.ts';
import { DEVICES } from '../../src/devices.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_TELLS, breeAct1Comm, commStep } from '../../feeds/comm.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
import { CLEAR_NIGHT, FILM_PAGE, dockGroup, prepareFilm } from '../lib/film-state.ts';
import { seeded } from '../lib/mouse.ts';
import { type Excerpt, type Run, excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

export type Device = 'desktop' | 'tablet' | 'phone';

/** The run second the excerpt starts at (the pre-play ends here). */
export const FROM = 119.0;
/** Where the fight's segment ends and the walk's begins: after the fur, before the first `e`. */
const WALK_FROM = 143.9;

/** The wolf (take A's cut of it, the flee dropped) to the fur; then the walk back east into Bree to the Prancing Pony's sign. */
const EXCERPT: Omit<Excerpt, 'from' | 'to'> = {
  run: BREE_RUN,
  speed: 1,
  maxGap: 1.5,
  drop: [[122.3, 125.6]],
  dropCmds: [/^get coins/, /^l$/],
  rewrite: noPonyLabel,
};
const TO = 152.1;

/** Camera rolls, then this long before the clock's 0 (`sync`), ms. */
const LEAD_MS = 2500;

/** The game's steps on the film's clock (ms from sync): the fight, the walk from DEVICES.walk, the staged tells. */
export function deviceSteps(runs: Map<string, Run>): Step[] {
  const fight = excerptFeed(runs, { ...EXCERPT, from: FROM, to: WALK_FROM });
  const walk = excerptFeed(runs, { ...EXCERPT, from: WALK_FROM, to: TO, speed: DEVICES.walkSpeed, maxGap: 0.8 });
  const first = walk.steps.find((s) => 'cmd' in s)!.at ?? 0;
  const shift = DEVICES.walk * 1000 - first;
  // (owner round 3) A command typed ahead of the last one's answer goes: a thumb on the compass is
  // slower than the run's typing, so it lands after the room it led to and is echoed at the end.
  // The same for a command just before the walk's last answer (the Prancing Pony's sign): its tap
  // would land after it, and the window would be left with that echo under the sign.
  const lastOut = Math.max(...walk.steps.filter((s) => 'out' in s).map((s) => s.at ?? 0));
  const walkSteps = walk.steps.filter((s, i) => !('cmd' in s && ((i > 0 && 'cmd' in walk.steps[i - 1]!) || lastOut - (s.at ?? 0) < 350)));
  const tells = BREE_TELLS.map((m, i) => ({ ...commStep(m, '*# R Mana:Hot>'), at: DEVICES.tells[i]! * 1000 }));
  return [...fight.steps, ...walkSteps.map((s) => ({ ...s, at: (s.at ?? 0) + shift })), ...tells].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}

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

/**
 * A finger pressed at `from`, held still `holdMs`, moved to `to` over `ms`,
 * lifted. The path is timed by the clock, not by steps (each touch event
 * takes a while to send): a swipe must end within 800 ms, and a move that
 * dawdles under 8 px for 400 ms would arm the lens's resize instead.
 */
async function drag(cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }, ms: number, holdMs = 0): Promise<void> {
  const pt = (x: number, y: number) => [{ x, y, radiusX: 6, radiusY: 6, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from.x, from.y) });
  if (holdMs) await sleep(holdMs);
  const t0 = Date.now();
  for (;;) {
    const u = Math.min(1, (Date.now() - t0) / ms);
    // eased out: a finger sets off at once and settles
    const k = 1 - (1 - u) ** 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k) });
    if (u >= 1) break;
    await sleep(12);
  }
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const okbKey = (ch: string): string => (ch === ' ' ? '.wc-ph-okb-k[data-act="space"]' : `.wc-ph-okb-k[data-ch="${ch}"]`);

function devicesScene(device: Device): Scene {
  const mobile = device !== 'desktop';
  const viewport = { desktop: undefined, tablet: { width: 1180, height: 820 }, phone: { width: 390, height: 844 } }[device];
  /** The take runs this long past sync (a device left is only seen frozen), s. */
  const endS = { desktop: DEVICES.toTablet + 1.5, tablet: DEVICES.toPhone + 1.5, phone: DEVICES.back + 1.0 }[device];
  return {
    // the tablet at DPR 1.5: the camera goes in on it (about 1400 px wide on the frame)
    mode: device === 'tablet' ? 'intel-1.5-png' : 'intel-1.2-png',
    page: { ...FILM_PAGE, ...(viewport ? { viewport, mobile: true } : {}) },

    async setup(page) {
      await prepareFilm(page);
      await page.evaluate(() => {
        type D = {
          weather: { enabled: boolean };
          panes: Record<string, { on: boolean }>;
          profile: string;
          group: { npcMode: string; fight: boolean };
          timers: { layout: string; cols: number | string; style: string; timeText: boolean; groups: Record<string, { enabled: boolean }> };
        };
        const wc = (window as unknown as { __wc: { settings: { update(fn: (d: D) => void): void } } }).__wc;
        // as film2-a leaves them at the wolf
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
          // owner round 1: no time text on the timers (item 4)
          d.timers.timeText = false;
        });
      });
      // Group docked above the map, borderless and clear (owner round 1, item 5; a phone lays it out in its strip)
      await dockGroup(page);
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
      // Film 2's act 1 talk (staged, invented names; Gittan's reply too), so Messages holds it later as on the desktop
      for (const st of breeAct1Comm('*# R Mana:Burning>')) ws.send(st.out);
      await sleep(300);
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
      // the films' clear night, as film 2's desktop take leaves it before the wolves
      await page.evaluate(async (pin) => {
        const w = window as unknown as DevWindow;
        await w.__wc!.weather();
        w.__weather!.jump(pin);
      }, CLEAR_NIGHT);
      const steps = deviceSteps(runs).filter((s) => (s.at ?? 0) < endS * 1000);
      console.log(`  ${steps.length} steps, ${steps.filter((s) => 'cmd' in s).length} commands, the last at ${((steps.at(-1)?.at ?? 0) / 1000).toFixed(2)} s`);
      await sleep(2500);
      if (!mobile) await page.mouse.move(1590, 890);
      return { server: ws, steps };
    },

    async run({ page, marks }, state) {
      const server = state.server as WebSocketRoute;
      const steps = state.steps as Step[];
      const t0 = Date.now();
      marks.mark('active', 'the take');
      const sync = t0 + LEAD_MS;
      marks.markAt(sync, 'sync', `run ${FROM} s`);
      const S = (s: number): number => sync + s * 1000;
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
      /** The lens's box now (CSS px): its centre and radius. */
      const lens = async (): Promise<{ x: number; y: number; r: number } | null> => {
        const b = await page.locator('.wc-ph-lens').first().boundingBox();
        return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width / 2 } : null;
      };
      // The tablet's own steps (owner round 2, item 4), fairly quick, by touch: the lens a little
      // down and left, held (the resize arms at 400 ms) and pulled outwards to about 1.5 times its
      // size, then four taps on the glass, each one zoom level further out and the last back to the
      // nearest (round 53k).
      const tabletLens = async (c: CDPSession): Promise<void> => {
        await until(S(DEVICES.lensMove));
        const l1 = await lens();
        if (!l1) return console.warn('  no lens on the tablet');
        console.log(`  the lens: ${(2 * l1.r).toFixed(0)} px at ${l1.x.toFixed(0)}, ${l1.y.toFixed(0)}`);
        await drag(c, { x: l1.x + 8, y: l1.y + 6 }, { x: l1.x - 90, y: l1.y + 58 }, 850);
        marks.mark('ui', 'lens moved');
        await until(S(DEVICES.lensResize));
        const l2 = await lens();
        if (!l2) return;
        // the rim follows the finger: half the growth in diameter, out along the diagonal
        const grow = l2.r;
        const from = { x: l2.x + l2.r * 0.42, y: l2.y + l2.r * 0.34 };
        const k = grow / 2 / Math.hypot(0.42, 0.34);
        await drag(c, from, { x: from.x + 0.42 * k, y: from.y + 0.34 * k }, 900, 650);
        marks.mark('ui', 'lens larger');
        await sleep(300);
        const l3 = await lens();
        if (l3) console.log(`  the lens: ${(2 * l2.r).toFixed(0)} → ${(2 * l3.r).toFixed(0)} px`);
        const level = async (): Promise<string> => (await page.locator('.wc-ph-lens-glass').first().getAttribute('aria-label').catch(() => null)) ?? '?';
        for (const at of DEVICES.lensTaps) {
          await until(S(at));
          const l = (await lens()) ?? l3!;
          await touchAt(c, { x: l.x + (rnd() - 0.5) * l.r * 0.5, y: l.y + (rnd() - 0.2) * l.r * 0.4 }, 80 + rnd() * 40);
          marks.mark('ui', 'lens zoom');
          await sleep(250);
          console.log(`  the lens zoom: ${await level()}`);
        }
      };

      // The phone's own steps (src/devices.ts), each after a rest: Messages, the pane strip.
      const ui = (async () => {
        if (device === 'tablet' && cdp) return tabletLens(cdp);
        if (device !== 'phone' || !cdp) return;
        const tap = async (at: number, sel: string, label: string): Promise<void> => {
          await until(S(at));
          const el = page.locator(sel).first();
          await el.tap({ timeout: 3000 }).catch((e: Error) => console.warn(`  ${label}: ${e.message.split('\n')[0]}`));
          marks.mark('ui', label);
        };
        const comm = '.wc-ph-sat[data-sat="comm"]:visible';
        const panes = '.wc-ph-sat[data-sat="panes"]:visible';
        const chat = (name: string): string => `.wc-pane[data-pane="comm"] .wc-cm-ent[aria-label^="${name}"]:visible`;
        await tap(DEVICES.commOpen, comm, 'Messages open');
        await tap(DEVICES.chatA, chat(BREE_TELLS[1]!.talker), `chat ${BREE_TELLS[1]!.talker}`);
        await tap(DEVICES.chatB, chat(BREE_TELLS[0]!.talker), `chat ${BREE_TELLS[0]!.talker}`);
        await tap(DEVICES.commClose, comm, 'Messages closed');
        await tap(DEVICES.panesOpen, panes, 'panes open');
        const swipe = async (at: number, left: boolean, label: string): Promise<void> => {
          await until(S(at) - 150);
          const b = await page.locator('.wc-ph-strip').first().boundingBox();
          if (!b) return console.warn('  no pane strip');
          const y = b.y + b.height * 0.55;
          const [x0, x1] = left ? [b.x + b.width * 0.78, b.x + b.width * 0.3] : [b.x + b.width * 0.25, b.x + b.width * 0.73];
          await drag(cdp, { x: x0, y }, { x: x1, y: y + 6 }, 300);
          marks.mark('ui', label);
        };
        await swipe(DEVICES.swipeA, true, 'swipe to the next pane');
        await swipe(DEVICES.swipeB, false, 'swipe back');
        // the strip's band dragged up to about half the strip's height (owner round 1, item 6)
        await until(S(DEVICES.stripResize) - 150);
        const st = await page.locator('.wc-ph-strip').first().boundingBox();
        const grip = await page.locator('.wc-ph-strip-grip').first().boundingBox();
        if (!st || !grip) console.warn('  no strip band');
        else {
          const from = { x: grip.x + grip.width * 0.3, y: grip.y + grip.height / 2 };
          const before = st.height;
          await drag(cdp, from, { x: from.x + 4, y: from.y - st.height * 0.5 }, 900, 120);
          marks.mark('ui', 'strip smaller');
          await sleep(300);
          const after = (await page.locator('.wc-ph-strip').first().boundingBox())?.height ?? before;
          console.log(`  the strip: ${before.toFixed(0)} → ${after.toFixed(0)} px`);
        }
        await tap(DEVICES.panesClose, panes, 'panes closed');
      })();
      await Promise.all([out, cmds, ui]);
      await until(S(endS));
      marks.mark('active-end', 'the take');
    },
  };
}

export const devicesDesktop = devicesScene('desktop');
export const devicesTablet = devicesScene('tablet');
export const devicesPhone = devicesScene('phone');
