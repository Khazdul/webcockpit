// Take A of the film (video/manuscript.md draft 3): parts 1 and 2 and the
// first half of part 3 in one continuous take, music 0:00 to about 1:34.
//
//   part 1   the start page, Profile, Enter MUME, the login, Gittan in the inn
//            (scenes/part1.ts `opening`)
//   part 2   the run plays on: the pony grouped and labelled, south to the
//            fountain (outdoors). Settings: tabs flicked on the beat to
//            Weather effects, the switch on, the night sky fades in; then
//            Appearance, background Black → Paper → Black. `where`. Panes:
//            Map on; the mercenary hired, Group on as Tod joins; out of the
//            west gate, Timers on, shield, arm, invis; the sky darkens, rain.
//   part 3   the lightning strike on beat 107 (1:19.68), the storm, the
//            second wolf (attack, Tod joins, assist, the kill, butcher).
//
// The game is the owner's Bree run (feeds/film.ts), cut into segments that
// keep its order, each started at its music time and played at its own
// pace; the GMCP of what is cut between them arrives at the next one's
// start (`primeFrom`), so the panes and the map stay right. Commands are
// never typed while a popup holds the keys. Only the weather is staged
// (the dev hook `__weather`, after the switch is flipped on camera).
import type { Page } from '@playwright/test';
import { type DevWindow, type Step, gmcpBytes, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { beatS } from '../../src/beats.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP } from '../../feeds/film.ts';
import { FILM_PAGE, prepareFilm } from '../lib/film-state.ts';
import { mockMumeLogin } from '../lib/mume-login.ts';
import { type Excerpt, type Run, excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';
import { opening } from './part1.ts';

/** A piece of the run played from a music time. */
interface Segment {
  name: string;
  /** Music s when it starts. */
  at: number;
  ex: Excerpt;
  /** ms between typed keys (default 70: a quick typist). */
  typeDelay?: number;
}

/** The run's segments after the arrival (run seconds; see the run's log). */
export const SEGMENTS: Segment[] = [
  // gro pony, label pony MINE, s, l, s: at the fountain (15.73), outdoors
  { name: 'pony', at: 44.3, ex: { run: BREE_RUN, from: 8.5, to: 16.0, primeFrom: 8.5 }, typeDelay: 100 },
  // `where` and a drink at the fountain, after Settings is closed
  { name: 'where', at: 65.3, ex: { run: BREE_RUN, from: 16.0, to: 17.6, primeFrom: 16.0 }, typeDelay: 100 },
  // the mercenary: 10 silver refused, 1 gold, grouped (his label Tod arrives with the next cut's GMCP)
  { name: 'merc', at: 70.4, ex: { run: BREE_RUN, from: 64.5, to: 71.4, primeFrom: 17.6, speed: 1.6, maxGap: 1 }, typeDelay: 55 },
  // to the West Gate, `sa open`, out through it
  { name: 'gate', at: 75.9, ex: { run: BREE_RUN, from: 80.6, to: 83.7, primeFrom: 71.4, speed: 2, maxGap: 0.6 }, typeDelay: 55 },
  // shield, arm, invis (Timers is on by now)
  { name: 'casts', at: 79.45, ex: { run: BREE_RUN, from: 86.1, to: 94.0, primeFrom: 83.7, speed: 2, maxGap: 0.6 }, typeDelay: 55 },
  // the second wolf: k wolf, Tod joins; (flee and back cut); assist, the fight, the kill, butcher, the fur
  {
    name: 'wolf',
    at: 83.2,
    ex: { run: BREE_RUN, from: 119.5, to: 144.0, primeFrom: 94.0, speed: 2.4, maxGap: 0.7, drop: [[122.3, 125.6]], dropCmds: [/^get coins/] },
    typeDelay: 55,
  },
];

/** UI moments, music s (beats where it matters). */
const UI = {
  settings: beatS(69),
  tabs: [beatS(71), beatS(72), beatS(73)] as const, // Text input, Mapper, Weather effects
  weatherOn: beatS(75),
  appearance: beatS(79),
  bgOpen: beatS(80),
  paper: beatS(81),
  bgOpen2: beatS(84),
  black: beatS(85),
  close: beatS(87),
  panesMap: 67.6,
  map: 68.4,
  panesGroup: 74.42,
  group: 75.2,
  panesTimers: 77.55,
  timers: 78.4,
} as const;

/** The weather's moments, music s. */
const SKY = {
  /** Clouds, light rain ("the sky darkens and rain starts"). */
  rain: 75.6,
  heavy: 77.9,
  /** The strike lands on beat 107; the hook is called this much earlier (the worker's frame). */
  strike: beatS(107),
  /** Measured: the return stroke's flash comes about 210 ms after the call (the stepped leader before it). */
  strikeLeadMs: 210,
};

/** The take ends here (music s): the cut to take B is on beat 125. */
export const TAKE_A_END = beatS(125) + 1.5;

/** All the segments' steps, with the prime first. */
function segmentSteps(runs: Map<string, Run>, seg: Segment): Step[] {
  const f = excerptFeed(runs, seg.ex);
  return [...f.prime.map((s) => ({ ...s, at: 0 })), ...f.steps];
}

async function popupClose(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
}

export const takeA: Scene = {
  mode: 'intel-1.2-png',
  page: FILM_PAGE,

  async setup(page) {
    await prepareFilm(page);
    const login = await mockMumeLogin(page);
    const runs = loadBackup(FILM_BACKUP);
    // The fountain's Room.Info, sent again when the Map pane comes on: it was hidden when Gittan got there.
    const run = runs.get(BREE_RUN)!;
    const infos = run.lines.filter((l) => l.body.startsWith('\x1bGMCP Room.Info ') && (l.us - run.meta.startedUs) / 1e6 < 17.6);
    const fountain = gmcpBytes(infos.at(-1)!.body.slice(6));
    return { login, arrival: arrival(), fountain, segments: SEGMENTS.map((s) => ({ seg: s, steps: segmentSteps(runs, s) })) };
  },

  async run({ page, marks }, state) {
    const { T, B, until, pointer, server } = await opening(page, marks, state);
    const segs = state.segments as { seg: Segment; steps: Step[] }[];

    // The game: each segment from its music time.
    const game = (async () => {
      for (const { seg, steps } of segs) {
        await until(T(seg.at));
        marks.mark('segment', seg.name);
        await play(page, server, steps, { typeDelay: seg.typeDelay ?? 70, onStep: (st) => ('cmd' in st ? marks.mark('cmd', st.cmd) : undefined) });
      }
    })();

    // Settings, the weather, the panes: the pointer.
    const ui = (async () => {
      const mb = (id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
      const tab = (id: string) => page.locator(`.wc-sp-settings .wc-ck-tab[data-tab="${id}"]`);
      marks.markAt(await pointer.clickAt(mb('settings'), T(UI.settings)), 'settings', 'Settings opens');
      const tabs = ['input', 'mapper', 'weather'];
      for (const [i, id] of tabs.entries()) marks.markAt(await pointer.clickAt(tab(id), T(UI.tabs[i]!), { quick: true }), 'tab', id);
      // The switch on; the dev hook pins a clear night (the game says day: only the weather is staged).
      marks.markAt(await pointer.clickAt(page.locator('.wc-sp-settings .wc-ck-tg[aria-label="Weather effects"]'), T(UI.weatherOn)), 'weather-on', 'Weather effects on');
      await page.evaluate(async () => {
        const w = window as unknown as DevWindow;
        await w.__wc!.weather();
        w.__weather!.jump({ weather: ' ', fog: '', clock: 'night', light: ')', sunU: -1, moonUp: false, moonU: -1, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 });
      });
      // Appearance: background Black → Paper, held, back to Black.
      marks.markAt(await pointer.clickAt(tab('appearance'), T(UI.appearance)), 'tab', 'appearance');
      const bg = page.locator('.wc-sp-settings .wc-ck-dd[aria-label="Background"]');
      const opt = (hex: string) => page.locator(`.wc-ck-list[aria-label="Background"] .wc-ck-opt[data-value="${hex}"]`);
      await pointer.clickAt(bg, T(UI.bgOpen));
      marks.markAt(await pointer.clickAt(opt('#f4ecd8'), T(UI.paper), { quick: true }), 'paper', 'Paper');
      await pointer.clickAt(bg, T(UI.bgOpen2));
      marks.markAt(await pointer.clickAt(opt('#000000'), T(UI.black), { quick: true }), 'black', 'Black again');
      await until(T(UI.close));
      await popupClose(page);
      marks.mark('settings-closed', 'Settings closes');
      // Panes: Map, then Group as Tod joins, then Timers before the casts.
      for (const [open, pick, pane] of [
        [UI.panesMap, UI.map, 'map'],
        [UI.panesGroup, UI.group, 'group'],
        [UI.panesTimers, UI.timers, 'timers'],
      ] as const) {
        await pointer.clickAt(mb('panes'), T(open));
        marks.markAt(await pointer.clickAt(page.locator(`.wc-pop-row[data-pane="${pane}"]`), T(pick), { quick: true }), 'pane', pane);
        await sleep(220);
        await popupClose(page);
        // the map locates Gittan at once (a Room.Info counts as a look), once its pane is in the layout
        if (pane === 'map') {
          await page.locator('.wc-pane[data-pane="map"]').waitFor({ timeout: 3000 }).catch(() => {});
          await sleep(150);
          server.send(state.fountain as Buffer);
        }
      }
    })();

    // The weather: the sky darkens, rain, the strike on beat 107 with the storm after it.
    const sky = (async () => {
      await until(T(SKY.rain));
      await page.evaluate(() => (window as unknown as DevWindow).__weather!.jump({ weather: "'", fog: '-' }));
      marks.mark('rain', 'clouds and light rain');
      await until(T(SKY.heavy));
      await page.evaluate(() => (window as unknown as DevWindow).__weather!.jump({ weather: '"', fog: '-' }));
      marks.mark('heavy', 'heavy rain');
      await until(T(SKY.strike) - SKY.strikeLeadMs);
      await page.evaluate(() => (window as unknown as DevWindow).__weather!.emit('strike', { storm: true }));
      marks.markAt(T(SKY.strike), 'strike', 'beat 107');
    })();

    await Promise.all([game, ui, sky]);
    await until(T(TAKE_A_END));
    marks.markAt(B(125), 'cut', 'beat 125: the cut to take B');
    marks.mark('active-end', 'the take');
  },
};
