// Take A of the film (video/manuscript.md; owner round 1): parts 1 and 2
// and the first half of part 3 in one continuous take, music 0:00 to beat
// 140 (1:44.13).
//
//   part 1   the start page, Profile, Enter MUME, the login, Gittan in the inn
//            (scenes/part1.ts `opening`)
//   part 2   lead and group the pony (never labelled); Group pane on and, from
//            its gear, unlabelled NPCs shown and the Fight card on; south to the
//            fountain (outdoors); Settings: tabs held two beats each to Weather
//            effects, the switch on, the night sky fades in; Appearance: the font
//            list held open, backgrounds Paper, Teal, Sepia, back to Black; the
//            mercenary (10 silver refused, a pause, 1 gold), Timers on, out of the
//            West Gate; rain
//   part 3   the strike on beat 107 (1:19.68), just outside the gate; shield,
//            arm, invis fill Timers; Map on; a walk of a few rooms into the
//            wolves' hills; the second wolf (Tod joins, assist, the kill,
//            butcher); the Group pane's settings held open
//
// Map on moved after the strike (round 1 allows it: the part before the
// strike would not fit otherwise). The game is the owner's Bree run in
// segments that keep its order, each started at its music time; the GMCP of
// what is cut between them arrives at the next one's start (`primeFrom`).
// Commands are never typed while a popup holds the keys. Only the weather
// is staged.
import type { Locator } from '@playwright/test';
import { type DevWindow, type Step, gmcpBytes, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { beatS } from '../../src/beats.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
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

const ex = (e: Omit<Excerpt, 'run' | 'rewrite'>): Excerpt => ({ run: BREE_RUN, rewrite: noPonyLabel, ...e });

/** The run's segments after the arrival (run seconds; see the run's log). */
export const SEGMENTS: Segment[] = [
  // lead pony, gro pony
  { name: 'pony', at: 38.2, ex: ex({ from: 5.6, to: 9.0, primeFrom: 5.6, speed: 1.2, maxGap: 1 }), typeDelay: 90 },
  // a guard arrives; s, s: at the fountain (outdoors). No label for the pony, no second look.
  {
    name: 'fountain',
    at: 45.9,
    ex: ex({ from: 9.0, to: 15.8, primeFrom: 9.0, speed: 1.8, maxGap: 0.8, drop: [[12.05, 12.3], [13.85, 14.0]], dropCmds: [/^label /] }),
    typeDelay: 90,
  },
  // the mercenary: 10 silver refused, a pause of about 2.5 s, 1 gold, grouped (his label Tod arrives with the GMCP)
  { name: 'merc', at: 71.3, ex: ex({ from: 64.5, to: 71.4, primeFrom: 15.8, speed: 1, maxGap: 1.2 }), typeDelay: 45 },
  // to the West Gate, `sa open`, out through it: just outside when the strike comes
  { name: 'gate', at: 78.95, ex: ex({ from: 80.6, to: 83.7, primeFrom: 71.4, speed: 2.2, maxGap: 0.5 }), typeDelay: 55 },
  // shield, arm, invis
  { name: 'casts', at: 80.4, ex: ex({ from: 84.5, to: 94.0, primeFrom: 83.7, speed: 2, maxGap: 0.6 }), typeDelay: 55 },
  // a few rooms west and north into the hills, where the wolves are; into Grassy Hills (its name shown)
  { name: 'walk', at: 86.6, ex: ex({ from: 94.4, to: 103.7, primeFrom: 94.0, speed: 2, maxGap: 0.5, drop: [[98.6, 98.85]] }), typeDelay: 55 },
  // the second wolf: k wolf, Tod joins; (flee and back cut); assist, the fight, the kill, butcher, the fur
  {
    name: 'wolf',
    at: 91.3,
    ex: ex({ from: 119.5, to: 143.9, primeFrom: 103.7, speed: 2.4, maxGap: 0.7, drop: [[122.3, 125.6]], dropCmds: [/^get coins/] }),
    typeDelay: 55,
  },
];

const b = beatS;
/** UI moments, music s (beats where the eye follows the music). */
const UI = {
  // the Group pane and its gear
  panesGroup: b(55),
  group: b(56),
  gearGroup: b(58),
  npcAll: b(59),
  fightCard: b(60),
  gearClose: b(61),
  // Settings: tabs two beats each, the switch, Appearance
  settings: b(68),
  tabs: [b(70), b(72), b(74)] as const, // Text input, Mapper, Weather effects
  weatherOn: b(76),
  appearance: b(79),
  fontOpen: b(80),
  fontClose: b(80) + 1.9,
  backgrounds: [
    ['#f4ecd8', 62.4], // Paper
    ['#002b36', 64.6], // Teal
    ['#2b1b12', 66.8], // Sepia
    ['#000000', 69.0], // Black again
  ] as const,
  settingsClose: 70.2,
  // Timers before the gate; Map after the strike and the casts
  panesTimers: 77.9,
  timers: 78.55,
  panesMap: 85.3,
  map: 86.0,
  // the Group pane's settings, held at least 6 s after the Group caption
  gearGroup2: 98.0,
  gearClose2: 104.0,
} as const;

/** The weather's moments, music s. */
const SKY = {
  rain: 74.5,
  heavy: 77.0,
  /** The strike lands on beat 107; the hook is called this much earlier (measured: the return stroke's flash). */
  strike: b(107),
  strikeLeadMs: 210,
};

/** The film cuts to take B on beat 140 (1:44.13); the take runs on a little. */
export const CUT_A = 140;
export const TAKE_A_END = b(CUT_A) + 1.5;

function segmentSteps(runs: Map<string, Run>, seg: Segment): Step[] {
  const f = excerptFeed(runs, seg.ex);
  return [...f.prime.map((s) => ({ ...s, at: 0 })), ...f.steps];
}

export const takeA: Scene = {
  mode: 'intel-1.2-png',
  page: FILM_PAGE,

  async setup(page) {
    await prepareFilm(page);
    const login = await mockMumeLogin(page);
    const runs = loadBackup(FILM_BACKUP);
    // Where Gittan stands when the Map pane comes on (sent again then: the map reads its file the first time its pane appears)
    const run = runs.get(BREE_RUN)!;
    const infos = run.lines.filter((l) => l.body.startsWith('\x1bGMCP Room.Info ') && (l.us - run.meta.startedUs) / 1e6 < 94.0);
    const here = gmcpBytes(infos.at(-1)!.body.slice(6));
    return { login, arrival: arrival({ to: 5.6, speed: 2 }), here, segments: SEGMENTS.map((s) => ({ seg: s, steps: segmentSteps(runs, s) })) };
  },

  async run({ page, marks }, state) {
    const { T, until, pointer, server } = await opening(page, marks, state);
    const segs = state.segments as { seg: Segment; steps: Step[] }[];

    const game = (async () => {
      for (const { seg, steps } of segs) {
        await until(T(seg.at));
        marks.mark('segment', seg.name);
        await play(page, server, steps, { typeDelay: seg.typeDelay ?? 70, onStep: (st) => ('cmd' in st ? marks.mark('cmd', st.cmd) : undefined) });
      }
    })();

    const ui = (async () => {
      const mb = (id: string) => page.locator(`.wc-mb[data-mb="${id}"]`);
      const close = async (): Promise<void> => {
        await page.keyboard.press('Escape');
      };
      const paneOn = async (pane: string, open: number, pick: number): Promise<void> => {
        await pointer.clickAt(mb('panes'), T(open));
        marks.markAt(await pointer.clickAt(page.locator(`.wc-pop-row[data-pane="${pane}"]`), T(pick), { quick: true }), 'pane', pane);
        await sleep(220);
        await close();
      };
      /** The Group pane's gear: the pointer on the pane brings its buttons, then the gear. */
      const groupGear = async (at: number): Promise<Locator> => {
        await pointer.hoverAt(page.locator('.wc-pane-group'), T(at) - 700);
        await pointer.clickAt(page.locator('.wc-pane-group > .wc-pane-btn-gear'), T(at), { quick: true });
        return page.locator('.wc-sp-gear-group');
      };

      // Group on, its gear: unlabelled NPCs shown (the pony appears), the Fight card on
      await paneOn('group', UI.panesGroup, UI.group);
      const gear = await groupGear(UI.gearGroup);
      marks.mark('group-gear', 'the Group pane settings');
      marks.markAt(await pointer.clickAt(gear.locator('[aria-label="NPC visibility"] [data-value="all"]'), T(UI.npcAll)), 'npc-all', 'NPC visibility: All');
      marks.markAt(await pointer.clickAt(gear.locator('.wc-ck-tg[aria-label="Fight card"]'), T(UI.fightCard), { quick: true }), 'fight-card', 'Fight card on');
      await until(T(UI.gearClose));
      await close();

      // Settings
      const tab = (id: string) => page.locator(`.wc-sp-settings .wc-ck-tab[data-tab="${id}"]`);
      marks.markAt(await pointer.clickAt(mb('settings'), T(UI.settings)), 'settings', 'Settings opens');
      for (const [i, id] of ['input', 'mapper', 'weather'].entries()) marks.markAt(await pointer.clickAt(tab(id), T(UI.tabs[i]!), { quick: true }), 'tab', id);
      // The switch on; the dev hook pins a clear night (the game says day: only the weather is staged).
      marks.markAt(await pointer.clickAt(page.locator('.wc-sp-settings .wc-ck-tg[aria-label="Weather effects"]'), T(UI.weatherOn)), 'weather-on', 'Weather effects on');
      await page.evaluate(async () => {
        const w = window as unknown as DevWindow;
        await w.__wc!.weather();
        w.__weather!.jump({ weather: ' ', fog: '', clock: 'night', light: ')', sunU: -1, moonUp: false, moonU: -1, dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 });
      });
      // Appearance: the font list held open (no change), then backgrounds
      marks.markAt(await pointer.clickAt(tab('appearance'), T(UI.appearance)), 'tab', 'appearance');
      marks.markAt(await pointer.clickAt(page.locator('.wc-sp-settings .wc-ck-dd[aria-label="Font"]'), T(UI.fontOpen), { quick: true }), 'font-list', 'the font list');
      await until(T(UI.fontClose));
      await close();
      const bg = page.locator('.wc-sp-settings .wc-ck-dd[aria-label="Background"]');
      const opt = (hex: string) => page.locator(`.wc-ck-list[aria-label="Background"] .wc-ck-opt[data-value="${hex}"]`);
      for (const [hex, at] of UI.backgrounds) {
        await pointer.clickAt(bg, T(at) - 700, { quick: true });
        marks.markAt(await pointer.clickAt(opt(hex), T(at), { quick: true }), 'background', hex);
      }
      await until(T(UI.settingsClose));
      await close();
      marks.mark('settings-closed', 'Settings closes');

      // Timers before the gate
      await paneOn('timers', UI.panesTimers, UI.timers);
      // Map after the casts; it finds Gittan once it has read its map file
      await paneOn('map', UI.panesMap, UI.map);
      await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').waitFor({ timeout: 8000 }).catch(() => {});
      server.send(state.here as Buffer);
      marks.mark('map-located', 'the map finds Gittan');

      // The Group pane's settings, held after the Group caption
      await groupGear(UI.gearGroup2);
      marks.mark('group-gear-2', 'the Group pane settings, held');
      await until(T(UI.gearClose2));
      await close();
      marks.mark('group-gear-closed', 'closed');
    })();

    // The weather: clouds and rain, heavy rain, the strike on beat 107 with the storm after it.
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
    marks.markAt(T(b(CUT_A)), 'cut', `beat ${CUT_A}: the cut to take B`);
    marks.mark('active-end', 'the take');
  },
};

