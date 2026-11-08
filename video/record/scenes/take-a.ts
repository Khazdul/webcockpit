// Take A of the film (video/manuscript.md; owner rounds 1-3): parts 1 and 2
// and the first half of part 3 in one continuous take, music 0:00 to beat
// 175 (2:10.05).
//
//   part 1   the start page, Profile, Enter MUME, the login, Gittan in the inn
//            (scenes/part1.ts `opening`)
//   part 2   lead and group the pony (never labelled); south to the fountain
//            (outdoors); the Group pane on (floating) and its settings, calmly:
//            the gear's tooltip, NPC visibility All, the Fight card; Settings:
//            tabs two beats each to Weather effects, the switch on, the night
//            sky fades in; Appearance: the font list held open, backgrounds
//            Paper, Teal, Sepia, back to Black; the mercenary arrives (staged),
//            10 silver refused, a visible pause, 1 gold; rain
//   part 3   the strike on beat 107 (1:19.68), in the street; the mercenary
//            grouped; out of the West Gate; Timers on (floating beside Group;
//            Herblores already off), shield, arm, invis; the Timers settings,
//            calmly: Grid, Circles, 2 columns, back to Bars and Flow; Map on
//            (docked; Group and Timers float over it); a walk into the wolves'
//            hills; (a dip) the second wolf at about the game's tempo, the
//            kill, butcher
//
// The game is the owner's Bree run in segments that keep its order, each
// started at its music time; the GMCP of what is cut between them arrives at
// the next one's start (`primeFrom`). Where the run jumps into the fight, the
// take marks a `dip` and the jump falls in its middle (the Film darkens the
// frame there). Commands are never typed while a popup holds the keys. Only
// the weather and the mercenary's arrival line are staged.
import type { Locator } from '@playwright/test';
import { type DevWindow, type Step, gmcpBytes, lineBytes, play, sleep } from '../../../scripts/lib/mume-feed.ts';
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
  /** The run jumps here: a dip of the whole frame centred on the segment's start. */
  dip?: boolean;
  /** Staged text lines sent at `at` instead of the excerpt (the mercenary's arrival). */
  lines?: string[];
}

const ex = (e: Omit<Excerpt, 'run' | 'rewrite'>): Excerpt => ({ run: BREE_RUN, rewrite: noPonyLabel, ...e });

/** The run's segments after the arrival (run seconds; see the run's log). */
export const SEGMENTS: Segment[] = [
  // lead pony, gro pony
  { name: 'pony', at: 37.6, ex: ex({ from: 5.6, to: 9.0, primeFrom: 5.6, speed: 1.2, maxGap: 1 }), typeDelay: 90 },
  // a guard arrives; s, s: at the fountain (outdoors). No label for the pony, no second look.
  {
    name: 'fountain',
    at: 40.6,
    ex: ex({ from: 9.0, to: 15.8, primeFrom: 9.0, speed: 1.8, maxGap: 0.8, drop: [[12.05, 12.3], [13.85, 14.0]], dropCmds: [/^label /] }),
    typeDelay: 90,
  },
  // (staged) the mercenary arrives
  { name: 'merc-arrives', at: 73.6, ex: ex({ from: 64.6, to: 64.6 }), lines: ['', 'A citizen mercenary has arrived from the west.', '', '*# R Mana:Burning>'] },
  // 10 silver, refused and given back
  { name: 'merc', at: 75.1, ex: ex({ from: 64.6, to: 65.5, primeFrom: 15.8, speed: 1 }), typeDelay: 45 },
  // a visible pause, nothing typed (owner round 3: at least 2.5 s from the returned silver to the first key), then 1 gold
  { name: 'merc-gold', at: 78.9, ex: ex({ from: 67.5, to: 68.0, primeFrom: 65.5, speed: 1 }), typeDelay: 45 },
  // grouped (after the strike)
  { name: 'merc-group', at: 81.3, ex: ex({ from: 70.7, to: 71.3, primeFrom: 68.0, speed: 1 }), typeDelay: 45 },
  // to the West Gate, `sa open`, out through it
  { name: 'gate', at: 82.6, ex: ex({ from: 80.6, to: 83.7, primeFrom: 71.4, speed: 2.2, maxGap: 0.5 }), typeDelay: 55 },
  // shield, arm, invis (Timers is on by now)
  { name: 'casts', at: 85.7, ex: ex({ from: 84.5, to: 94.0, primeFrom: 83.7, speed: 2, maxGap: 0.6 }), typeDelay: 55 },
  // a few rooms west and north into the hills, into the wolves' Grassy Hills (its name shown)
  { name: 'walk', at: 105.4, ex: ex({ from: 94.4, to: 103.6, primeFrom: 94.0, speed: 2, maxGap: 0.5, drop: [[98.6, 98.85]] }), typeDelay: 55 },
  // (a dip) k wolf, Tod joins; (flee and back cut); assist, the kill, butcher, the fur: at about the game's own tempo
  {
    name: 'wolf',
    at: 110.6,
    dip: true,
    ex: ex({ from: 119.0, to: 143.9, primeFrom: 103.6, speed: 1.15, maxGap: 1.5, drop: [[122.3, 125.6]], dropCmds: [/^get coins/, /^l$/] }),
    typeDelay: 70,
  },
];

const b = beatS;
/** UI moments, music s (beats where the eye follows the music). */
const UI = {
  // the Group pane and its settings
  panesGroup: 45.0,
  group: 45.7,
  gearTip: 47.0,
  gearPress: 48.2,
  npcAll: 50.8,
  fightCard: 53.4,
  gearClose: 54.9,
  // Settings: tabs two beats each, the switch, Appearance
  settings: b(75),
  tabs: [b(77), b(79), b(81)] as const, // Text input, Mapper, Weather effects
  weatherOn: b(83),
  appearance: b(86),
  fontOpen: b(87),
  fontClose: b(87) + 1.9,
  backgrounds: [
    ['#f4ecd8', 67.8], // Paper
    ['#002b36', 69.7], // Teal
    ['#2b1b12', 71.6], // Sepia
    ['#000000', 73.4], // Black again
  ] as const,
  settingsClose: 74.3,
  // after the strike: Timers on, its settings once the spells are in, back to Bars and Flow; then Map
  panesTimers: 84.3,
  timers: 85.0,
  timersTip: 91.4,
  timersPress: 92.5,
  grid: 94.0,
  circles: 95.6,
  colsOpen: 97.0,
  cols: 97.7,
  bars: 99.2,
  flow: 100.7,
  timersClose: 101.9,
  panesMap: 102.2,
  map: 102.9,
} as const;

/** The weather's moments, music s. */
const SKY = {
  rain: 75.6,
  heavy: 77.6,
  /** The strike lands on beat 107; the hook is called this much earlier (measured: the return stroke's flash). */
  strike: b(107),
  strikeLeadMs: 210,
};

/** The film cuts to take B on beat 175 (2:10.05), a downbeat; the take runs on a little. */
export const CUT_A = 175;
export const TAKE_A_END = b(CUT_A) + 1.5;

function segmentSteps(runs: Map<string, Run>, seg: Segment): Step[] {
  if (seg.lines) return [{ out: Buffer.concat(seg.lines.map(lineBytes)), at: 0 }];
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
        if (seg.dip) marks.mark('dip', seg.name);
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
      /**
       * A pane's gear: the pointer onto the pane (its buttons show), onto the gear, which shows its
       * tooltip (`tip` marker: the page's own tooltip is the browser's, which a headless capture
       * does not draw, so the Film draws it from the marker), held, then the press.
       */
      const gear = async (pane: 'group' | 'timers', tipAt: number, pressAt: number): Promise<Locator> => {
        await pointer.hoverAt(page.locator(`.wc-pane-${pane} .wc-pane-content`), T(tipAt) - 900);
        const g = page.locator(`.wc-pane-${pane} > .wc-pane-btn-gear`);
        await pointer.hoverAt(g, T(tipAt));
        const bx = await g.boundingBox();
        const title = (await g.getAttribute('title')) ?? `${pane === 'group' ? 'Group' : 'Timers'} settings`;
        marks.mark('tip', title, bx ? { x: bx.x, y: bx.y, w: bx.width, h: bx.height } : null);
        marks.markAt(await pointer.pressAt(T(pressAt)), 'tip-end', title);
        return page.locator(`.wc-sp-gear-${pane}`);
      };
      /** A setting: the pointer onto it, a pause so the eye finds it, then the press. */
      const choose = async (el: Locator, at: number, kind: string, label: string, wait = 2.0): Promise<void> => {
        await pointer.hoverAt(el, T(at - wait));
        marks.markAt(await pointer.pressAt(T(at)), kind, label);
      };

      // Group on (floating, bottom right), its settings calmly
      await paneOn('group', UI.panesGroup, UI.group);
      const gg = await gear('group', UI.gearTip, UI.gearPress);
      marks.mark('group-gear', 'the Group pane settings');
      await choose(gg.locator('[aria-label="NPC visibility"] [data-value="all"]'), UI.npcAll, 'npc-all', 'NPC visibility: All');
      await choose(gg.locator('.wc-ck-tg[aria-label="Fight card"]'), UI.fightCard, 'fight-card', 'Fight card on');
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

      // After the strike: Timers on (floating beside Group); its settings once the spells are in
      await paneOn('timers', UI.panesTimers, UI.timers);
      const tg = await gear('timers', UI.timersTip, UI.timersPress);
      marks.mark('timers-gear', 'the Timers pane settings');
      await choose(tg.locator('[aria-label="Layout"] [data-value="grid"]'), UI.grid, 'timers-mode', 'grid', 1.2);
      await choose(tg.locator('[aria-label="Style"] [data-value="circles"]'), UI.circles, 'timers-mode', 'circles', 1.2);
      await choose(tg.locator('.wc-ck-dd[aria-label="Grid columns"]'), UI.colsOpen, 'cols-open', 'Grid columns', 1.0);
      await choose(page.locator('.wc-ck-list[aria-label="Grid columns"] .wc-ck-opt[data-value="2"]'), UI.cols, 'timers-mode', 'columns', 0.6);
      await choose(tg.locator('[aria-label="Style"] [data-value="bars"]'), UI.bars, 'timers-mode', 'bars', 1.2);
      await choose(tg.locator('[aria-label="Layout"] [data-value="flow"]'), UI.flow, 'timers-mode', 'flow', 1.2);
      await until(T(UI.timersClose));
      await close();
      marks.mark('timers-gear-closed', 'closed');
      // Map on, docked; it finds Gittan once it has read its map file
      await paneOn('map', UI.panesMap, UI.map);
      await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').waitFor({ timeout: 8000 }).catch(() => {});
      server.send(state.here as Buffer);
      marks.mark('map-located', 'the map finds Gittan');
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
