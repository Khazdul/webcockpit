// The balloon film's one take (video/manuscript-balloons.md draft 2, stage
// 76): Gittan at the fountain in Bree, frame by frame on the film's clock
// (record/lib/frame-clock.ts: every frame a new picture, at the page's real
// pace). Times are seconds from the take's first frame (feeds/balloons.ts).
//
//   act 1  the window full of the run's text; `dr water`; the pointer opens
//          Settings → Weather effects, rests by Balloons, switches it on,
//          closes
//   act 2  the goblin's four, each typed as `#weather balloon as …` and sent
//   act 3  one of each other race, the same way
//
// Off the film it writes public/recordings/balloons-fountain.track.json
// (each frame's balloons: record/motion.ts measures the render by it) and
// checks the hard rules: the count on screen, no early fade, no joined sign,
// no message from the command.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WebSocketRoute } from '@playwright/test';
import { type DevWindow, type Step, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { AMBIENT, DRINK, FLOCKS, PREFEED, SHOWS, TAKE_S, commandOf } from '../../feeds/balloons.ts';
import { FILM_BACKUP } from '../../feeds/film.ts';
import { BALLOON_MODE, BALLOON_PAGE, PAGE_PX, type Seen, balloonList, balloonsSeen, enterFountain, queueFlightSeed, seedsLeft, skyScript } from '../lib/balloon-state.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

const TRACK = fileURLToPath(new URL('../../public/recordings/balloons-fountain.track.json', import.meta.url));
const SEED = 20261122;
/** balloons.ts MAX_BALLOONS: a launch with this many up would fade the oldest out early. */
const MAX_BALLOONS = 5;
/** The owner's limit on screen. */
const MAX_SEEN = 3;

/** Settings, unhurried: about 2 s of rest before the click and after it. */
const UI = { appear: 4.6, settings: 6.2, tab: 8.0, onRow: 9.0, on: 11.2, close: 13.2 } as const;
/** A typed line stands this long before its Enter. */
const READ_BEFORE_ENTER_S = 0.55;

export const balloonsFountain: Scene = {
  mode: BALLOON_MODE,
  page: BALLOON_PAGE,
  stepped: { workers: 2, x: PAGE_PX.x, workerScript: skyScript(FLOCKS, seeded(SEED + 1)) },

  async setup(page) {
    const runs = loadBackup(FILM_BACKUP);
    const pre = excerptFeed(runs, PREFEED);
    const server = await enterFountain(page);
    for (const s of pre.prime) server.send((s as { out: Buffer }).out);
    await play(page, server, pre.steps.map(({ at: _, ...s }) => s as Step), { typeDelay: 0 });
    // the day's sky and the map settle
    await sleep(8000);
    await page.locator('.wc-input-field').focus();
    await page.mouse.move(1150, 560);
    const answer = excerptFeed(runs, DRINK.answer).steps.filter((s) => 'out' in s);
    return { server, answer };
  },

  async run({ page, marks, clock }, state) {
    if (!clock) throw new Error('the balloon take runs on the frame clock');
    const server = state.server as WebSocketRoute;
    const t0 = clock.t0;
    const T = (s: number): number => t0 + s * 1000;
    const until = (s: number): Promise<void> => clock.until(T(s));
    const mark = (kind: string, label: string): void => marks.markAt(clock.now(), kind, label);

    const track: Seen[][] = [];
    let mostUp = 0;
    clock.onFrame = async () => {
      const { all, seen } = await balloonsSeen(page);
      mostUp = Math.max(mostUp, all);
      track.push(seen);
    };
    /** Server bytes, given time to reach the page before its next frame. */
    const send = async (out: Buffer): Promise<void> => {
      server.send(out);
      await sleep(60);
    };
    for (const a of AMBIENT)
      clock.schedule(T(a.at), async () => {
        mark('ambient', a.step.out.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '').split('\r\n')[1]!);
        await send(a.step.out);
      });
    for (const { at } of FLOCKS)
      clock.schedule(T(at), async () => {
        mark('birds', 'a crossing');
        await page.evaluate(() => (window as unknown as DevWindow).__weather!.emit('birds'));
      });

    // a hand on the keys: uneven, a breath at each space
    const rnd = seeded(SEED);
    const type = async (text: string, enter: number): Promise<void> => {
      const gaps = [...text].map((ch) => (ch === ' ' ? 120 + rnd() * 70 : 62 + rnd() * 58));
      let at = T(enter - READ_BEFORE_ENTER_S) - gaps.reduce((a, b) => a + b, 0);
      for (const [i, ch] of [...text].entries()) {
        await clock.until(at);
        if (i === 0) mark('typing', text);
        await page.keyboard.type(ch);
        at += gaps[i]!;
      }
      await until(enter);
      await page.keyboard.press('Enter');
    };

    await clock.frame(); // the first frame
    marks.markAt(t0, 'film0', 'the take starts');
    marks.markAt(t0, 'active', 'the take');

    await type(DRINK.cmd, DRINK.at);
    mark('cmd', DRINK.cmd);
    await until(DRINK.at + DRINK.after);
    for (const s of state.answer as (Step & { out: Buffer })[]) await send(s.out);

    const pointer = new Pointer(page, SEED, { x: 1150, y: 560 }, clock);
    await until(UI.appear);
    const popup = page.locator('.wc-sp-settings');
    marks.markAt(await pointer.clickAt(page.locator('.wc-mb[data-mb="settings"]'), T(UI.settings)), 'settings', 'Settings opens');
    marks.markAt(await pointer.clickAt(popup.locator('.wc-ck-tab[data-tab="weather"]'), T(UI.tab)), 'tab', 'Weather effects');
    await pointer.hoverAt(popup.locator('.wc-sp-wx-balloons .wc-ck-tg'), T(UI.onRow));
    mark('on-row', 'the pointer rests by Balloons');
    marks.markAt(await pointer.pressAt(T(UI.on)), 'balloons-on', 'Balloons on');
    marks.markAt(await pointer.clickAt(popup.getByRole('button', { name: 'Close', exact: true }), T(UI.close)), 'settings-closed', 'Settings closes');
    if (!(await page.evaluate(() => (window as unknown as { __wc: { settings: { get(): { weather: { balloons: boolean } } } } }).__wc.settings.get().weather.balloons)))
      throw new Error('the click did not switch Balloons on');
    await page.locator('.wc-input-field').focus();

    for (const s of SHOWS) {
      const before = await balloonList(page);
      await queueFlightSeed(page, s.seed);
      const cmd = commandOf(s);
      await type(cmd, s.at);
      const up = await balloonList(page);
      if (before.length >= MAX_BALLOONS) throw new Error(`${cmd}: ${before.length} flights were up: the client fades one out early`);
      // the command's own chunks load in real time (no film time passes): the balloon is launched in this frame
      for (let i = 0; (await seedsLeft(page)) > 0; i++) {
        if (i > 400) throw new Error(`${cmd}: no balloon was launched`);
        await sleep(25);
      }
      const now = await balloonList(page);
      const b = now.at(-1);
      if (!b || b.count !== 1 || b.passenger !== s.passenger) throw new Error(`${cmd}: got ${JSON.stringify(now)}`);
      mark('balloon', `${s.passenger} ${s.what}`);
      const line = await page.locator('.wc-input-field').inputValue();
      if (line !== cmd) console.warn(`  the input line shows "${line}", not the command`);
      console.log(`  ${s.at.toFixed(2).padStart(6)}  ${cmd}  (${up.length} flights up at Enter, face ${b.face})`);
    }

    await until(TAKE_S);
    marks.markAt(clock.now(), 'active-end', 'the take');
    clock.onFrame = null;

    const joined = (await balloonList(page)).filter((b) => b.count > 1);
    if (joined.length) throw new Error('two kills joined a sign');
    const said = await page.evaluate(() => /Balloons are off|could not start|Unknown command/.test(document.body.innerText));
    if (said) throw new Error('the command printed a message');
    const most = Math.max(...track.map((f) => f.length));
    console.log(`  balloons in view at most ${most}, flights at most ${mostUp}`);
    if (most > MAX_SEEN || mostUp >= MAX_BALLOONS) throw new Error('too crowded');
    writeFileSync(TRACK, JSON.stringify({ fps: 60, frames: track }));
  },
};
