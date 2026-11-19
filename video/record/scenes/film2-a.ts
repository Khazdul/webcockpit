// Film 2, take A (video/manuscript-2.md draft 2, acts 0-3, and the desktop
// part of act 4): one continuous desktop take, timed by picture (no beat
// lock). Times are film seconds from the `film0` marker.
//
//   act 0  the start page at night, the shooting star; Enter MUME; MUME's
//          welcome screen; the name and the masked password
//   act 1  Gittan in the Prancing Pony; a narrate on Public and a tell from
//          Eilwen (staged, feeds/comm.ts); Comm on, floating, Eilwen's chat;
//          Gittan answers in the pane's reply line, Eilwen answers twice
//          (owner round 3);
//          the mercenary (10 silver refused, a pause, 1 gold, grouped);
//          Group on (NPCs All and the Fight card set off camera, owner round
//          1); Settings: tabs, Weather effects on (the clear night),
//          Appearance: the font list, backgrounds Paper, Teal, Black
//   act 2  Comm off; rain, heavy rain, the strike in the street; out of the
//          West Gate; Map on, docked; Group dragged to dock above the map,
//          where it lands as a slim four-row strip (owner round 2, item 2:
//          the map's size is the player's, set off camera), its border
//          off, its background Clear; the spells with Timers on, floating
//          (Time text off)
//   act 3  the storm clears; the walk into the hills, the first wolf (the
//          room, then the attack, the kill; `l`). No Statistics (owner
//          round 2, item 3)
//   act 4  from the `sync` marker the device act's clock (src/devices.ts):
//          the second wolf's `k wolf`, on until the desktop is left. The
//          composition plays this take on the monitor in act 4, so act 3
//          runs into it without a cut.
//
// The game is the owner's Bree run in segments that keep its order, each
// started at its film time, the GMCP of what is cut between them sent at the
// next one's start (`primeFrom`). Staged: the weather, the mercenary's
// arrival line and the Comm lines (invented names).
import type { Locator, Page } from '@playwright/test';
import { type DevWindow, type Step, gmcpBytes, lineBytes, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { DEVICES } from '../../src/devices.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_ARRIVAL_COMM, BREE_REPLY, BREE_REPLY_ANSWERS, commMine, commStep } from '../../feeds/comm.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
import { communityServer, serveCommunity } from '../lib/community.ts';
import { CLEAR_NIGHT, freshStart, prepareFilm, shootingStar } from '../lib/film-state.ts';
import { filmUi } from '../lib/film-ui.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { type LoginMock, mockMumeLogin } from '../lib/mume-login.ts';
import { type Excerpt, type Run, excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';
import type { Marks } from '../lib/timeline.ts';
import { deviceSteps } from './devices.ts';
import { takeBPage } from './film2-b.ts';

const SEED = 20261118;

/** The cockpit's cell (CSS px) at 1600 × 900: 160 × 49 cells. */
const CELL = { w: 10, h: 900 / 49 } as const;

/** A piece of the run played from a film time. */
interface Segment {
  name: string;
  /** Film s when it starts. */
  at: number;
  ex: Excerpt;
  /** ms between typed keys (default 70: a quick typist). */
  typeDelay?: number;
  /** Staged steps sent at `at` instead of the excerpt. */
  staged?: Step[];
}

const ex = (e: Omit<Excerpt, 'run' | 'rewrite'>): Excerpt => ({ run: BREE_RUN, rewrite: noPonyLabel, ...e });
const MERC_PROMPT = '*# R Mana:Burning>';

/** Act 0's moments, film s. */
const OPEN = { shoot: 5.0, enter: 11.5, name: 20.0, password: 22.0 } as const;
/** Gittan's room appears this long after the password's Enter. */
const ARRIVE_AFTER_MS = 650;

/** The run's segments after the arrival (run seconds; their film times). */
export const SEGMENTS: Segment[] = [
  // lead pony, gro pony
  { name: 'pony', at: 24.4, ex: ex({ from: 5.6, to: 9.0, primeFrom: 5.6, speed: 1.6, maxGap: 0.8 }), typeDelay: 80 },
  // a guard arrives; s, s: at the fountain (outdoors)
  {
    name: 'fountain',
    at: 26.6,
    ex: ex({ from: 9.0, to: 15.8, primeFrom: 9.0, speed: 2.4, maxGap: 0.6, drop: [[12.05, 12.3], [13.85, 14.0]], dropCmds: [/^label /] }),
    typeDelay: 80,
  },
  // (staged) a narrate on Public, then Eilwen's tell
  { name: 'public', at: 29.8, ex: ex({ from: 15.8, to: 15.8 }), staged: [commStep(BREE_ARRIVAL_COMM[0]!, MERC_PROMPT)] },
  { name: 'eilwen', at: 31.0, ex: ex({ from: 15.8, to: 15.8 }), staged: [commStep(BREE_ARRIVAL_COMM[1]!, MERC_PROMPT)] },
  // (staged) the mercenary arrives
  { name: 'merc-arrives', at: 44.4, ex: ex({ from: 64.6, to: 64.6 }), staged: [{ out: Buffer.concat(['', 'A citizen mercenary has arrived from the west.', '', MERC_PROMPT].map(lineBytes)) }] },
  // 10 silver, refused and given back
  { name: 'merc', at: 45.6, ex: ex({ from: 64.6, to: 65.5, primeFrom: 15.8, speed: 1 }), typeDelay: 45 },
  // a visible pause (at least 2.5 s from the returned silver to the first key), then 1 gold
  { name: 'merc-gold', at: 49.3, ex: ex({ from: 67.5, to: 68.0, primeFrom: 65.5, speed: 1 }), typeDelay: 45 },
  // grouped
  { name: 'merc-group', at: 51.4, ex: ex({ from: 70.7, to: 71.3, primeFrom: 68.0, speed: 1 }), typeDelay: 45 },
  // to the West Gate, `sa open`, out through it (after the strike in the street)
  { name: 'gate', at: 83.0, ex: ex({ from: 80.6, to: 83.7, primeFrom: 71.4, speed: 2.2, maxGap: 0.5 }), typeDelay: 55 },
  // shield, arm, invis (Timers comes on as they start, once Group is docked)
  { name: 'casts', at: 100.6, ex: ex({ from: 84.5, to: 94.0, primeFrom: 83.7, speed: 2, maxGap: 0.6 }), typeDelay: 55 },
  // west and north into the hills: the Plains with two wolves, then east into the Grassy Hills
  { name: 'walk', at: 108.2, ex: ex({ from: 94.4, to: 103.6, primeFrom: 94.0, speed: 2, maxGap: 0.5, drop: [[98.6, 98.85]] }), typeDelay: 55 },
  // the first wolf: k wolf, Tod joins, the lightning bolt, the kill; `l` shows the second wolf
  // (a little quicker since the Statistics segment went, owner round 2 item 3)
  { name: 'wolf1', at: 113.0, ex: ex({ from: 103.6, to: 119.0, primeFrom: 103.6, speed: 1.4, maxGap: 1.2, dropCmds: [/^get coins/] }), typeDelay: 70 },
];

/** UI moments, film s. */
const UI = {
  commPanes: 32.6,
  comm: 33.3,
  chat: 35.6,
  // Gittan's reply in the pane's own line (owner round 3), Eilwen's two answers
  reply: 37.2,
  replyAnswers: [41.6, 43.0] as const,
  groupPanes: 52.6,
  group: 53.3,
  settings: 55.0,
  tabs: [56.6, 58.1, 59.6] as const, // Text input, Mapper, Weather effects
  weatherOn: 61.4,
  appearance: 63.4,
  fontOpen: 64.8,
  fontClose: 66.8,
  backgrounds: [
    ['#f4ecd8', 68.6], // Paper, held about 3 s
    ['#002b36', 71.6], // Teal, held about 3 s
    ['#000000', 74.6], // Black again
  ] as const,
  settingsClose: 75.8,
  commOffPanes: 76.8,
  commOff: 77.5,
  mapPanes: 85.0,
  map: 85.7,
  // Group docked above the map (from the right screen edge, where a floating pane docks), its look, its height
  dockCaption: 86.8,
  dockGrab: 88.6,
  // (3 s earlier since round 2: no resize drag)
  timersPanes: 100.8,
  timers: 101.5,
} as const;

/** The weather's moments, film s. */
const SKY = { rain: 77.4, heavy: 79.4, strike: 81.4, strikeLeadMs: 210, clear: 105.7 } as const;

/** Where Comm floats (cells: the cockpit is 160 × 49 at 1600 × 900 CSS px): at the top right before the map is docked there (it is turned off before the gate). */
const FLOATS = { comm: { x: 104, y: 1, w: 55, h: 21 } } as const;
/**
 * The map's size in the right dock's lane, as the player left it in an earlier session
 * (owner round 2, item 2): the app gives a pane docked from floating its default rows (Group
 * 6) and shares the lane out between `desired` sizes, so with the map at 60 Group lands at
 * four rows (its two members) both framed and borderless. The default map (330) left it one.
 */
const MAP_DESIRED = 60;

function segmentSteps(runs: Map<string, Run>, seg: Segment): Step[] {
  if (seg.staged) return seg.staged.map((s) => ({ ...s, at: 0 }));
  const f = excerptFeed(runs, seg.ex);
  return [...f.prime.map((s) => ({ ...s, at: 0 })), ...f.steps];
}

/** The start page, the login, Gittan's arrival (act 0). Returns the film clock. */
async function opening(page: Page, marks: Marks, login: LoginMock, arrive: ReturnType<typeof arrival>, pointer: Pointer) {
  // the cloud flags on (owner round 1, item 1): the start menu as in act 6, Community and the owner row
  await freshStart(page, undefined, 'cloudtest');
  await page.keyboard.press('ArrowUp');
  await sleep(300);
  marks.mark('start', 'the start page is up');
  marks.mark('active', 'the take');
  const film0 = Date.now() + 1200;
  marks.markAt(film0, 'film0', 'film 0:00');
  const T = (s: number): number => film0 + s * 1000;
  const until = async (ms: number): Promise<void> => {
    const w = ms - Date.now();
    if (w > 0) await sleep(w);
  };
  await pointer.place(1240, 770);
  await until(T(OPEN.shoot));
  await shootingStar(page, { x: 0.64, y: 0.05, dir: 1, angle: 0.48 });
  marks.mark('shoot', 'a shooting star');
  const menu = (key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"] .wc-sm-label`).first();
  marks.markAt(await pointer.clickAt(menu('enter'), T(OPEN.enter)), 'enter', 'Enter MUME');
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  const input = page.locator('.wc-input-field');
  await input.focus();
  const rnd = seeded(SEED + 1);
  const typeTo = async (text: string, enterAt: number): Promise<void> => {
    const gaps = [...text].map(() => 85 + rnd() * 120);
    const total = gaps.reduce((a, b) => a + b, 0) + 120 + rnd() * 120;
    await until(enterAt - total);
    for (const [i, ch] of [...text].entries()) {
      await page.keyboard.type(ch);
      await sleep(gaps[i]!);
    }
    await until(enterAt);
    await page.keyboard.press('Enter');
  };
  await typeTo('Gittan', T(OPEN.name));
  // Made up; the socket goes nowhere. The client masks it (the server took over the echo).
  await typeTo('starlight', T(OPEN.password));
  const server = login.server()!;
  const arrivedAt = T(OPEN.password) + ARRIVE_AFTER_MS;
  await until(arrivedAt);
  server.send('out' in arrive.arrive ? arrive.arrive.out : Buffer.alloc(0));
  marks.mark('arrive', 'Gittan arrives in the Lodging Foyer');
  await until(arrivedAt + arrive.from * 1000);
  await play(page, server, arrive.steps, { typeDelay: 110, onStep: (st) => ('cmd' in st ? marks.mark('cmd', st.cmd) : undefined) });
  for (const k of ['banner', 'name', 'password'] as const) {
    const t = login.at[k];
    if (t !== undefined) marks.markAt(t, k, `MUME: ${k}`);
  }
  return { T, until, server };
}

export const film2A: Scene = {
  mode: 'intel-1.2-png',
  // the capture's date, as take B (the community's ages)
  get page() {
    return takeBPage();
  },

  async setup(page) {
    await serveCommunity(page, await communityServer());
    await prepareFilm(page);
    // khazdul selected off camera (act 0 has no Profile); Comm floats (off yet); the map's size the player's
    await page.evaluate(
      ({ floats, mapDesired }) => {
        type D = { profile: string; group: { npcMode: string; fight: boolean }; timers: { timeText: boolean }; layout: { docks: { right: { lanes: { size: number; panes: { id: string }[] }[] } }; floating: { id: string; x: number; y: number; w: number; h: number }[] } };
        const wc = (window as unknown as { __wc: { settings: { update(fn: (d: D) => void): void } } }).__wc;
        wc.settings.update((d) => {
          d.profile = 'khazdul';
          // Group's settings set off camera (owner round 1, item 2); Timers without its time text (item 4)
          d.group.npcMode = 'all';
          d.group.fight = true;
          d.timers.timeText = false;
          // Character stays off (with the map's lane shorter once Group docks, it would find room)
          (d as unknown as { panes: Record<string, { on: boolean }> }).panes.character!.on = false;
          // the right dock's lane keeps its width for the map, with no pane in it
          for (const l of d.layout.docks.right.lanes) {
            l.panes = l.panes.filter((p) => p.id !== 'comm');
            for (const p of l.panes as { id: string; desired: number }[]) if (p.id === 'map') p.desired = mapDesired;
          }
          d.layout.floating = [...d.layout.floating.filter((f) => f.id !== 'comm'), { id: 'comm', ...floats.comm }];
        });
      },
      { floats: FLOATS, mapDesired: MAP_DESIRED },
    );
    await sleep(600);
    const login = await mockMumeLogin(page);
    const runs = loadBackup(FILM_BACKUP);
    // Where Gittan stands when the Map pane comes on (sent again then: the map reads its file the first time its pane appears)
    const run = runs.get(BREE_RUN)!;
    const infos = run.lines.filter((l) => l.body.startsWith('\x1bGMCP Room.Info ') && (l.us - run.meta.startedUs) / 1e6 < 83.7);
    const here = gmcpBytes(infos.at(-1)!.body.slice(6));
    // the device act's desktop part, on its clock from `sync`
    const tail = deviceSteps(runs).filter((s) => (s.at ?? 0) < (DEVICES.toTablet + 1.5) * 1000);
    return { login, arrival: arrival({ to: 5.6, speed: 2 }), here, tail, segments: SEGMENTS.map((s) => ({ seg: s, steps: segmentSteps(runs, s) })) };
  },

  async run({ page, marks }, state) {
    const pointer = new Pointer(page, SEED);
    const { T, until, server } = await opening(page, marks, state.login as LoginMock, state.arrival as ReturnType<typeof arrival>, pointer);
    const segs = state.segments as { seg: Segment; steps: Step[] }[];
    let syncAt = 0;

    const game = (async () => {
      for (const { seg, steps } of segs) {
        await until(T(seg.at));
        marks.mark('segment', seg.name);
        await play(page, server, steps, { typeDelay: seg.typeDelay ?? 70, onStep: (st) => ('cmd' in st ? marks.mark('cmd', st.cmd) : undefined) });
        if (seg.name === 'wolf1') {
          // the excerpt ran to its end (119.0 s of the run): the device act's clock starts on it
          const ex = excerptFeed(loadBackup(FILM_BACKUP), seg.ex);
          syncAt = T(seg.at) + ex.durationMs;
        }
      }
      await until(syncAt);
      marks.markAt(syncAt, 'sync', 'run 119 s: the device act');
      await play(page, server, state.tail as Step[], { typeDelay: 70, onStep: (st) => ('cmd' in st ? marks.mark('cmd', st.cmd) : undefined) });
    })();

    const ui = (async () => {
      const u = filmUi(page, pointer, marks);
      const { mb, close } = u;
      const paneOn = (pane: string, open: number, pick: number): Promise<void> => u.paneOn(pane, T(open), T(pick));
      const choose = (el: Locator, at: number, kind: string, label: string, wait = 2.0): Promise<void> => u.choose(el, T(at), kind, label, wait);

      // Comm on (floating, top right), Eilwen's chat
      await paneOn('comm', UI.commPanes, UI.comm);
      await choose(page.locator('.wc-pane[data-pane="comm"] .wc-cm-ent[aria-label^="Eilwen"]').first(), UI.chat, 'chat', 'Eilwen', 1.6);
      // Gittan answers in the chat's own reply line (not the game's command line); the mock ignores
      // the `tell` the pane sends, so MUME's echo of it is staged, then Eilwen's answers (owner round 3)
      const reply = page.locator('.wc-pane[data-pane="comm"] .wc-cm-reply input').first();
      marks.markAt(await pointer.clickAt(reply, T(UI.reply)), 'reply', 'the reply line');
      await sleep(250);
      const rr = seeded(SEED + 7);
      for (const ch of BREE_REPLY.text) {
        await page.keyboard.type(ch);
        await sleep(30 + rr() * 25);
      }
      await sleep(300);
      await page.keyboard.press('Enter');
      marks.mark('reply-sent', 'the reply sent');
      await sleep(150);
      server.send(commMine(BREE_REPLY.to, BREE_REPLY.text, MERC_PROMPT).out);
      if ((await reply.inputValue().catch(() => '')) !== '') console.warn('  the reply line kept its text');
      if (Date.now() > T(UI.replyAnswers[0]!) - 900) console.warn(`  the reply was sent late: ${((Date.now() - T(0)) / 1000).toFixed(1)} s`);
      for (const [i, m] of BREE_REPLY_ANSWERS.entries()) {
        await until(T(UI.replyAnswers[i]!));
        server.send(commStep(m, MERC_PROMPT).out);
        marks.mark('reply-answer', m.text);
      }

      // Group on (floating; its NPCs and Fight card were set off camera)
      await paneOn('group', UI.groupPanes, UI.group);

      // Settings
      const tab = (id: string) => page.locator(`.wc-sp-settings .wc-ck-tab[data-tab="${id}"]`);
      marks.markAt(await pointer.clickAt(mb('settings'), T(UI.settings)), 'settings', 'Settings opens');
      for (const [i, id] of ['input', 'mapper', 'weather'].entries()) marks.markAt(await pointer.clickAt(tab(id), T(UI.tabs[i]!), { quick: true }), 'tab', id);
      marks.markAt(await pointer.clickAt(page.locator('.wc-sp-settings .wc-ck-tg[aria-label="Weather effects"]'), T(UI.weatherOn)), 'weather-on', 'Weather effects on');
      await page.evaluate(async (pin) => {
        const w = window as unknown as DevWindow;
        await w.__wc!.weather();
        w.__weather!.jump(pin);
      }, CLEAR_NIGHT);
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

      // Comm off before the gate (the map docks where it floats)
      await paneOn('comm', UI.commOffPanes, UI.commOff);
      marks.mark('comm-off', 'Comm off');
      // Map on, docked, once out of the gate; it finds Gittan once it has read its map file
      await paneOn('map', UI.mapPanes, UI.map);
      await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').waitFor({ timeout: 8000 }).catch(() => {});
      server.send(state.here as Buffer);
      marks.mark('map-located', 'the map finds Gittan');

      // Group docked above the map: a floating pane docks from the screen edge; it goes into the
      // right dock's lane before the map, at four rows (its two members; MAP_DESIRED). Then its
      // border off and its background Clear (owner rounds 1 and 2, items 5 and 2).
      marks.markAt(T(UI.dockCaption), 'dock-caption', 'the docking caption');
      const gbox = async () => (await page.locator('.wc-pane-group').boundingBox())!;
      const g0 = await gbox();
      await pointer.hoverPoint(g0.x + 6 * CELL.w, g0.y + CELL.h / 2, T(UI.dockGrab - 1.0));
      marks.markAt(await pointer.dragTo(1596, 1.5 * CELL.h, T(UI.dockGrab), { ms: 1500, holdMs: 600 }), 'docked', 'Group docked above the map');
      await sleep(500);
      const right = await page.evaluate(() => (window as unknown as { __wc: { settings: { get(): { layout: { docks: { right: { lanes: { panes: { id: string }[] }[] } } } } } } }).__wc.settings.get().layout.docks.right.lanes.flatMap((l) => l.panes.map((p) => p.id)));
      if (right.indexOf('group') < 0 || right.indexOf('group') > right.indexOf('map')) console.warn(`  Group is not docked above the map (right dock: ${right.join(', ')})`);
      /** A look button on Group's hood: onto the pane, onto the button (its tooltip, drawn by the film), held, pressed. */
      const lookOn = async (what: 'border' | 'glass'): Promise<boolean> =>
        page.evaluate((w) => (window as unknown as { __wc: { settings: { get(): { panes: { group: Record<string, boolean> } } } } }).__wc.settings.get().panes.group[w] !== false, what);
      const look = async (what: 'border' | 'glass', rest: number): Promise<void> => {
        const g = await gbox();
        // a fresh move over the pane's first row: its buttons show while it is hovered
        await pointer.hoverPoint(g.x + g.width * 0.55, g.y + CELL.h * 0.45, Date.now() + rest * 1000);
        const btn = page.locator(`.wc-pane-group > .wc-pane-btn-${what}`);
        await btn.waitFor({ state: 'visible', timeout: 2000 }).catch(() => console.warn(`  no ${what} button`));
        const bx = await btn.boundingBox();
        if (bx) await pointer.hoverPoint(bx.x + bx.width / 2, bx.y + bx.height / 2, Date.now() + 700);
        const title = (await btn.getAttribute('title')) ?? what;
        marks.mark('tip', title, bx ? { x: bx.x, y: bx.y, w: bx.width, h: bx.height } : null);
        // the tooltip held about a second, then the press
        marks.markAt(await pointer.pressAt(Date.now() + 1000), 'tip-end', title);
        await sleep(250);
        if (await lookOn(what)) {
          console.warn(`  the ${what} press did not take: clicked`);
          await btn.dispatchEvent('click');
        }
        marks.mark(`look-${what}`, title);
      };
      await look('border', 0.8);
      await look('glass', 0.7);
      marks.mark('dock-done', 'Group docked, borderless and clear');
      const gh = ((await gbox()).height / CELL.h).toFixed(2);
      if (Math.abs(Number(gh) - 4) > 0.2) console.warn(`  Group is ${gh} rows high, not 4`);
      else console.log(`  Group docked: ${gh} rows`);
      if (Date.now() > T(UI.timersPanes) - 2100) console.warn(`  the docking ran late: ${((Date.now() - T(0)) / 1000).toFixed(1)} s`);
      await sleep(400);
      const gs = await page.evaluate(() => {
        const st = (window as unknown as { __wc: { settings: { get(): { panes: { group: unknown }; layout: unknown } } } }).__wc.settings.get();
        return JSON.stringify({ group: st.panes.group, right: (st.layout as { docks: { right: unknown } }).docks.right });
      });
      console.log(`  Group docked: ${gs}`);
      // the hand leaves the map
      await pointer.moveTo(900, 560);
      // Timers on as the spells start
      await paneOn('timers', UI.timersPanes, UI.timers);
      // (one take showed no Timers although its switch was on; the next did: warn if it happens again)
      await page.locator('.wc-pane-timers').waitFor({ state: 'visible', timeout: 2000 }).catch(() => console.warn('  the Timers pane is not shown'));
      // the hand leaves the mouse low on the right, away from the panes
      await pointer.hoverAt(page.locator('.wc-input-field'), T(UI.timers + 3.0));
    })();

    // The weather: clouds and rain, heavy rain, the strike in the street, then the storm clears.
    const sky = (async () => {
      const jump = (pin: Record<string, unknown>) => page.evaluate((p) => (window as unknown as DevWindow).__weather!.jump(p), pin);
      await until(T(SKY.rain));
      await jump({ weather: "'", fog: '-' });
      marks.mark('rain', 'clouds and light rain');
      await until(T(SKY.heavy));
      await jump({ weather: '"', fog: '-' });
      marks.mark('heavy', 'heavy rain');
      await until(T(SKY.strike) - SKY.strikeLeadMs);
      await page.evaluate(() => (window as unknown as DevWindow).__weather!.emit('strike', { storm: true }));
      marks.markAt(T(SKY.strike), 'strike', 'the strike');
      await until(T(SKY.clear));
      await jump({ ...CLEAR_NIGHT });
      marks.mark('clear', 'the storm clears');
    })();

    await Promise.all([game, ui, sky]);
    await until(syncAt + (DEVICES.toTablet + 1.5) * 1000);
    marks.mark('active-end', 'the take');
  },
};
