// The Character pane film's one take (video/manuscript-character.md, the
// round 2 proposal, draft 4; stage 78): Gittan's run from Mason Road in
// Bree to a pork-pie in Tharbad, frame by frame on the film's clock
// (record/lib/frame-clock.ts). Times are take seconds from its first frame
// (feeds/character.ts; the film's 0:07).
//
//   Mason Road  the pointer switches the map on (docked right); Gittan
//               narrates; the coach arrives; the Character pane on (it
//               floats in the middle, Medium); `enter coach`
//   the coach   a click on the position icon rests her; the level ring's
//               tooltip; Thorgrim; Comm on (under the map, borderless,
//               clear); Mirel, Gittan's answer; the card dragged to the
//               right dock above the map and made taller; a glimpse of
//               Paper (Settings → Appearance → Background) and back
//   Tharbad     the ring, the bakery, the bandit, the north gate, the
//               tarantulas (their joined balloon), the camp and the quakes,
//               the revenge (`ag` typed; the kill's balloon; a click on
//               Mood: aggressive → wimpy), the pie; the achievement staged,
//               its balloon at rest: the take ends there
//
// The mock answers the hidden info poll with Gittan's values as they stand
// at the take's moment of the run, the card's clicks and her own narrates
// with MUME's own answers; every other line is the run's. The balloons'
// ratings come from an earlier run of hers restored as the chain's start.
// At the achievement balloon's rest the page is shot once more with only
// the balloon drawn (public/recordings/character-balloon.png, transparent):
// the composition keeps it while the rest fades.
import { fileURLToPath } from 'node:url';
import type { Locator } from '@playwright/test';
import { gmcpBytes, lineBytes, sleep } from '../../../scripts/lib/mume-feed.ts';
import {
  ACHIEVEMENT,
  AFTER_REST_S,
  ANSWER_LAG_S,
  CHAIN_RUN,
  CHARACTER_BACKUP,
  CHARACTER_RUN,
  CLICKS,
  END_LOG_S,
  FIRST_PROMPT,
  LEGS,
  LOOK,
  NARRATES,
  OWN_NARRATES,
  PIE_LOG_S,
  PRE_LOG_S,
  STRONGER_LOG_S,
  WIMPY_LOG_S,
  affectsAt,
  takeOf,
} from '../../feeds/character.ts';
import { FILM_BACKUP } from '../../feeds/film.ts';
import { type FeedEvent, type StateChange, feedEvents } from '../lib/character-feed.ts';
import { CELL, CHARACTER_PAGE, Mume, enterMasonRoad, promptBytes, shiftedRun } from '../lib/character-state.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

const SEED = 20261125;
const CUTOUT = fileURLToPath(new URL('../../public/recordings/character-balloon.png', import.meta.url));

/** The pointer's moments (take s). */
const UI = {
  mapPanes: 0.5,
  mapRow: 1.4,
  /** Gittan's first narrate is typed from here (the Panes popup closed). */
  firstType: 2.3,
  cardPanes: 7.2,
  cardRow: 8.1,
  ring: 17.4,
  ringOff: 19.6,
  commPanes: 22.4,
  commRow: 23.3,
  dockGrab: 34.0,
  resizeGrab: 37.2,
  settings: 40.4,
  appearance: 41.2,
  bg: 41.9,
  paper: 42.8,
  /** Paper stands at least this long. */
  paperHold: 2.6,
  bgBack: 45.2,
  black: 46.0,
  close: 46.8,
  park: { x: 780, y: 620 },
} as const;

/** Where a command is not typed (the pointer is in a menu or a window): it is sent as typed ones are. */
const BUSY: readonly [number, number][] = [
  [UI.mapPanes - 0.3, UI.mapRow + 0.8],
  [UI.cardPanes - 0.3, UI.cardRow + 0.8],
  [UI.commPanes - 0.3, UI.commRow + 0.8],
  [UI.settings - 0.3, UI.close + 1.5],
];

/** A typed line stands this long before its Enter. */
const READ_BEFORE_ENTER_S = 0.4;
/** A command's typing starts at least this long after the one before it went. */
const AFTER_ENTER_S = 0.25;

interface Wc {
  __wc: {
    app: {
      session: { sendCommand(t: string): void };
      game: { char: { view(): Record<string, unknown> } };
      weather: { controller: { balloons(): Promise<{ list(): { phase: string; kind: string; count: number }[] } | null> } | null } | null;
    };
    settings: {
      get(): { layout: { docks: { right: { lanes: { panes: { id: string; desired: number }[] }[] } } }; appearance: { bg: string }; weather: { balloons: boolean } };
      update(fn: (d: { weather: { balloons: boolean } }) => void): void;
    };
  };
}

/** What a command sent to MUME is answered with. */
interface Answer {
  sends: string;
  out: () => Buffer;
  change?: StateChange;
}

export const characterTour: Scene = {
  mode: 'intel-1.2-png',
  page: CHARACTER_PAGE,
  stepped: { workers: 1, x: 0 },

  async setup(page) {
    const run = loadBackup(CHARACTER_BACKUP).get(CHARACTER_RUN);
    if (!run) throw new Error(`no run ${CHARACTER_RUN} in ${CHARACTER_BACKUP}: node record/character-runs.ts <log>`);
    const mume = new Mume({ strong: false, shields: { ob: 50, db: -1, pb: 60, abs: 70 }, wimpy: 204, copper: 48, vitals: {}, affects: affectsAt(0), prompt: FIRST_PROMPT });
    // the chain's earlier run ends a minute and a half before this one starts
    await enterMasonRoad(page, mume, shiftedRun(FILM_BACKUP, CHAIN_RUN, Date.now() * 1000 - 90e6));
    // the run up to Mason Road's first prompts, off camera
    let room: Buffer | null = null;
    for (const e of feedEvents(run, 0, PRE_LOG_S)) {
      if (e.kind !== 'out') continue;
      apply(mume, e.change, e.log);
      mume.send(e.out);
      await sleep(40);
    }
    for (const l of run.lines) if (l.body.startsWith('\x1bGMCP Room.Info ') && (l.us - run.meta.startedUs) / 1e6 < PRE_LOG_S) room = gmcpBytes(l.body.slice(6));
    // `l`: Mason Road as MUME showed it to her
    await page.evaluate((c) => (window as unknown as Wc).__wc.app.session.sendCommand(c), LOOK.cmd);
    await sleep(250);
    mume.send(Buffer.concat([...LOOK.lines.map((l) => lineBytes(l)), promptBytes(mume.state.prompt)]));
    // the login poll answered, the run stored; then the balloons read the chain again (balloon film
    // round 1's finding: at `run_start` the run is not yet in the store, so the chain is the live run alone)
    await sleep(4000);
    if (mume.polls.length === 0) throw new Error('no login poll: is fetchInfo on?');
    await page.evaluate(() => (window as unknown as Wc).__wc.settings.update((d) => void (d.weather.balloons = false)));
    await sleep(800);
    await page.evaluate(() => (window as unknown as Wc).__wc.settings.update((d) => void (d.weather.balloons = true)));
    await sleep(2500);
    await page.locator('.wc-input-field').focus();
    await page.mouse.move(UI.park.x, UI.park.y);
    return { mume, run, room, events: feedEvents(run, PRE_LOG_S, END_LOG_S) };
  },

  async run({ page, marks, clock }, state) {
    if (!clock) throw new Error('the Character take runs on the frame clock');
    const mume = state.mume as Mume;
    const events = state.events as FeedEvent[];
    const t0 = clock.t0;
    const T = (s: number): number => t0 + s * 1000;
    const until = (s: number): Promise<void> => clock.until(T(s));
    const mark = (kind: string, label: string): void => marks.markAt(clock.now(), kind, label, null);
    const card = page.locator('.wc-pane-character');
    const input = page.locator('.wc-input-field');

    // Held while a Settings list is open: the game's text scrolling the output closes it (round 1's finding)
    let held: (() => void)[] | null = null;
    /** Server bytes; the poll's state follows the run. */
    const send = (out: Buffer, change: StateChange = {}, log?: number): void => {
      if (held) {
        held.push(() => send(out, change, log));
        return;
      }
      apply(mume, change, log);
      mume.send(out);
    };
    const release = (): void => {
      const q = held ?? [];
      held = null;
      for (const f of q) f();
    };
    const vitalsOf = (gmcp: readonly string[]): StateChange =>
      ({ vitals: Object.assign({}, ...gmcp.filter((g) => g.startsWith('Char.Vitals ')).map((g) => JSON.parse(g.slice(12)) as object)) as Record<string, unknown> });

    // ---- the answers to the clicks and to her own narrates: MUME's, a pulse after the command reaches it
    const expected: Answer[] = [];
    const answered: string[] = [];
    mume.onCommand = (cmd) => {
      const i = expected.findIndex((e) => e.sends === cmd);
      if (i < 0) return;
      const e = expected.splice(i, 1)[0]!;
      answered.push(cmd);
      clock.schedule(clock.now() + ANSWER_LAG_S * 1000, () => send(e.out(), e.change ?? {}));
    };
    const clickAnswer = (s: { sends: string; lines: readonly string[]; gmcp: readonly string[] }): Answer => ({
      sends: s.sends,
      out: () => Buffer.concat([...s.lines.map((l) => lineBytes(l)), ...s.gmcp.map((g) => gmcpBytes(g)), promptBytes(mume.state.prompt)]),
      change: vitalsOf(s.gmcp),
    });
    // one's own narrate, as the fixture has it: the GMCP, the yellow line, a blank line, the prompt
    const narrAnswer = (words: string): Answer => ({
      sends: `narr ${words}`,
      out: () =>
        Buffer.concat([
          gmcpBytes(`Comm.Channel.Text ${JSON.stringify({ channel: 'tales', talker: 'you', text: words })}`),
          lineBytes(`\x1b[33mYou narrate '${words}'\x1b[0m`),
          lineBytes(''),
          promptBytes(mume.state.prompt),
        ]),
    });

    // ---- the run, her narrates among its commands
    let lastEnter = -1;
    const rnd = seeded(SEED);
    const busy = (s: number): boolean => BUSY.some(([a, b]) => s >= a && s <= b);
    const sendCmd = async (cmd: string): Promise<void> => {
      if (held) {
        held.push(() => void sendCmd(cmd));
        return;
      }
      await page.evaluate((c) => (window as unknown as Wc).__wc.app.session.sendCommand(c), cmd);
    };
    /** Typed so that its Enter lands at `enter`, not before `from`; a hand's pace, quicker when the next is close. */
    const type = (text: string, enter: number, from = 0): void => {
      const gaps = [...text].map((ch) => (ch === ' ' ? 115 + rnd() * 55 : 58 + rnd() * 40));
      const want = gaps.reduce((a, b) => a + b, 0) / 1000;
      const room = enter - READ_BEFORE_ENTER_S - Math.max(lastEnter + AFTER_ENTER_S, from);
      if (room < text.length * 0.03) {
        console.warn(`  "${text.slice(0, 30)}…" has no room to be typed (${room.toFixed(2)} s): sent`);
        clock.schedule(T(enter), () => sendCmd(text));
        lastEnter = enter;
        return;
      }
      const k = Math.min(1, room / want);
      let at = enter - READ_BEFORE_ENTER_S - want * k;
      clock.schedule(T(at - 0.02), async () => {
        await input.focus();
        await page.keyboard.press('Control+A');
        mark('typing', text);
      });
      for (const [i, ch] of [...text].entries()) {
        clock.schedule(T(at), () => page.keyboard.type(ch));
        at += (gaps[i]! / 1000) * k;
      }
      clock.schedule(T(enter), async () => {
        await page.keyboard.press('Enter');
        mark('cmd', text);
      });
      lastEnter = enter;
    };
    type Item = FeedEvent | { kind: 'narr'; take: number; words: string };
    const items: Item[] = [...events, ...OWN_NARRATES.map((n) => ({ kind: 'narr' as const, take: n.at, words: n.words }))];
    items.sort((a, b) => a.take - b.take);
    for (const e of items) {
      if (e.kind === 'out') clock.schedule(T(e.take), () => send(e.out, e.change, e.log));
      else if (e.kind === 'narr') {
        expected.push(narrAnswer(e.words));
        type(`narr ${e.words}`, e.take, e.take < 10 ? UI.firstType : 0);
      } else if (e.typed && !busy(e.take) && e.take > 1) type(e.cmd, e.take);
      // sent as typed ones are: the input line stays free for the next to be typed
      else clock.schedule(T(e.take), () => sendCmd(e.cmd));
    }
    for (const l of LEGS) clock.schedule(T(l.take), () => mark('leg', l.name));
    for (const n of NARRATES) {
      const text = `${n.talker} narrates '${n.words}'`;
      const g = `Comm.Channel.Text ${JSON.stringify({ channel: 'tales', talker: n.talker, 'talker-type': 'player', text })}`;
      clock.schedule(T(n.at), () => {
        mark('narrate', n.talker);
        send(Buffer.concat([lineBytes(''), lineBytes(`\x1b[33m${text}\x1b[0m`), lineBytes(''), gmcpBytes(g), promptBytes(mume.state.prompt)]));
      });
    }
    // the achievement (staged; the fixture's form)
    clock.schedule(T(ACHIEVEMENT.at), () => {
      mark('achievement', ACHIEVEMENT.what);
      send(Buffer.concat([gmcpBytes(`Event.Achieved ${JSON.stringify({ what: ACHIEVEMENT.what })}`), lineBytes(`Achievement unlocked: ${ACHIEVEMENT.what}`), lineBytes(''), promptBytes(mume.state.prompt)]));
    });
    // the moments the captions follow
    clock.schedule(T(takeOf(STRONGER_LOG_S)), () => mark('stones', 'You feel stronger.'));
    clock.schedule(T(takeOf(308.02)), () => mark('fight', 'the tarantulas'));
    clock.schedule(T(takeOf(312.02)), () => mark('poison', 'poisoned'));
    clock.schedule(T(takeOf(424.51)), () => mark('peak', 'both tarantulas dead'));
    clock.schedule(T(takeOf(467.68)), () => mark('bandit', 'the bandit dead'));
    // the balloons' signs as they come (the tarantulas' joined, the bandit's rating)
    for (const log of [424.51, 467.68])
      clock.schedule(T(takeOf(log) + 1.5), async () => {
        const b = await page.evaluate(async () => {
          const x = await (window as unknown as Wc).__wc.app.weather?.controller?.balloons();
          return x ? x.list() : [];
        });
        console.log(`  balloons at ${(takeOf(log) + 1.5).toFixed(1)} s: ${JSON.stringify(b)}`);
      });
    clock.schedule(T(takeOf(469.52)), () => mark('pie', 'six copper'));

    await clock.frame(); // the first frame
    marks.markAt(t0, 'film0', 'the take starts');
    marks.markAt(t0, 'active', 'the take');
    const pointer = new Pointer(page, SEED, UI.park, clock);

    /** Frames until `ok` holds (checked every few frames), at most `ms`. */
    const waitFor = async (ok: () => Promise<boolean>, ms: number, what: string): Promise<boolean> => {
      const end = clock.now() + ms;
      while (!(await ok())) {
        if (clock.now() > end) {
          console.warn(`  ${what}: not after ${ms} ms`);
          return false;
        }
        await clock.sleep(50);
      }
      return true;
    };
    const paneOn = async (pane: string, open: number, pick: number): Promise<void> => {
      marks.markAt(await pointer.clickAt(page.locator('.wc-mb[data-mb="panes"]'), T(open)), 'panes', pane);
      // the popup morphs in (0.21 s)
      await clock.sleep(320);
      marks.markAt(await pointer.clickAt(page.locator(`.wc-pop-row[data-pane="${pane}"]`), T(pick), { quick: true }), 'pane-on', pane);
      await clock.sleep(260);
      await page.keyboard.press('Escape');
      await input.focus();
    };
    const field = (id: string): Locator => card.locator(`[data-click="${id}"]`).first();
    const lane = (): Promise<string> =>
      page.evaluate(() => (window as unknown as Wc).__wc.settings.get().layout.docks.right.lanes[0]?.panes.map((p) => `${p.id}:${p.desired}`).join(',') ?? '');
    /** A click on the card that MUME answers. */
    const clickCard = async (id: string, at: number, s: { sends: string; lines: readonly string[]; gmcp: readonly string[] }): Promise<number> => {
      expected.push(clickAnswer(s));
      const down = await pointer.clickAt(field(id), T(at));
      marks.markAt(down, 'click', `${id}: ${s.sends}`);
      return down;
    };

    // the map on, docked right; it finds Gittan once its map file is read
    await paneOn('map', UI.mapPanes, UI.mapRow);
    await waitFor(async () => (await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').count()) > 0, 8000, 'the map');
    if (state.room) send(state.room as Buffer);
    mark('map-on', 'the map finds Mason Road');

    // the Character pane on: it floats in the middle, Medium
    await paneOn('character', UI.cardPanes, UI.cardRow);
    await waitFor(async () => (await card.count()) > 0 && (await card.isVisible()), 2000, 'the card');
    mark('card-on', 'the Character pane');
    console.log(`  the card: ${await card.locator('.wc-cc').getAttribute('data-mode')} at ${JSON.stringify(await card.boundingBox())}`);

    // ---- the coach: `r` a click on the position icon; the ring's tooltip
    const [rest0, rest1, wi] = CLICKS;
    await clickCard('position', takeOf(rest0!.log), rest0!.steps[0]!);
    await pointer.hoverAt(card.locator('.wc-cc-ring'), T(UI.ring));
    mark('ring-tip', 'the level ring');
    await pointer.rest(T(UI.ringOff));
    await pointer.moveTo(UI.park.x, UI.park.y);

    // Comm on: under the map, borderless and clear, Public
    await paneOn('comm', UI.commPanes, UI.commRow);
    mark('comm-on', 'Comm under the map');
    console.log(`  Comm on: the right dock's lane ${await lane()}`);
    await pointer.moveTo(UI.park.x, UI.park.y);

    // the card docked above the map: by the title row to the screen's top right edge, then taller
    const c0 = (await card.boundingBox())!;
    await pointer.hoverPoint(c0.x + c0.width * 0.3, c0.y + CELL.h * 0.45, T(UI.dockGrab - 0.9));
    marks.markAt(await pointer.dragTo(1596, CELL.h * 0.8, T(UI.dockGrab), { ms: 1400, holdMs: 500 }), 'docked', 'the card above the map');
    await clock.sleep(400);
    const handle = await page.evaluate(() => {
      for (const e of document.querySelectorAll<HTMLElement>('.wc-handle[data-axis="y"]')) {
        const r = e.getBoundingClientRect();
        if (r.left >= 1090 && r.top < 400 && r.height < 12) return { x: r.left + r.width * 0.42, y: r.top + r.height / 2 };
      }
      return null;
    });
    if (!handle) throw new Error('no handle between the card and the map');
    await pointer.hoverPoint(handle.x, handle.y, T(UI.resizeGrab - 0.8));
    marks.markAt(await pointer.dragTo(handle.x, handle.y + 5 * CELL.h, T(UI.resizeGrab), { ms: 1000, holdMs: 250 }), 'resized', 'the card taller');
    await clock.sleep(300);
    mark('dock-done', 'docked');
    console.log(`  docked: ${JSON.stringify(await card.boundingBox())} ${await card.locator('.wc-cc').getAttribute('data-mode')}; the lane ${await lane()}`);

    // a glimpse of Paper
    const popup = page.locator('.wc-sp-settings');
    marks.markAt(await pointer.clickAt(page.locator('.wc-mb[data-mb="settings"]'), T(UI.settings)), 'settings', 'Settings');
    await clock.sleep(300);
    await pointer.clickAt(popup.locator('.wc-ck-tab[data-tab="appearance"]'), T(UI.appearance), { quick: true });
    const bg = popup.locator('.wc-ck-dd[aria-label="Background"]');
    const optBox = (hex: string): Promise<{ x: number; y: number } | null> =>
      page.evaluate((h) => {
        const o = document.querySelector(`.wc-ck-list[aria-label="Background"] .wc-ck-opt[data-value="${h}"]`);
        const b = o?.getBoundingClientRect();
        return b && b.width > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
      }, hex);
    /** The Background list opened, the game's text held, the colour pressed; returns the press. */
    const choose = async (hex: string, open: number, pick: number, kind: string, label: string): Promise<number> => {
      await waitFor(async () => (await page.locator('.wc-ck-list[aria-label="Background"]').count()) === 0, 1500, 'the list closing');
      await pointer.hoverAt(bg, Math.max(T(open), clock.now() + 300));
      held = [];
      await pointer.pressAt(clock.now() + 150);
      await waitFor(async () => (await optBox(hex)) !== null, 1500, `the ${label} option`);
      // the list morphs in: its boxes are read once it has landed
      await clock.sleep(400);
      const r = await optBox(hex);
      let down = clock.now();
      if (r) {
        await pointer.hoverPoint(r.x, r.y, Math.max(T(pick), clock.now() + 350));
        down = await pointer.pressAt(clock.now() + 120);
      }
      marks.markAt(down, kind, label);
      await clock.sleep(150);
      release();
      const got = await page.evaluate(() => (window as unknown as Wc).__wc.settings.get().appearance.bg);
      if (got !== hex) console.warn(`  ${label}: not chosen (${got})`);
      return down;
    };
    const paperAt = ((await choose('#f4ecd8', UI.bg, UI.paper, 'paper', 'Paper')) - t0) / 1000;
    const back = Math.max(UI.bgBack, paperAt + UI.paperHold - 0.8);
    await choose('#000000', back, back + 0.8, 'lykta', 'back to black');
    await pointer.rest(Math.max(T(UI.close), clock.now() + 500));
    await page.keyboard.press('Escape');
    mark('settings-closed', 'Settings closed');
    await input.focus();
    await pointer.moveTo(UI.park.x, UI.park.y);

    // ---- Tharbad: the camp's rest a click; after the bandit's kill, a click on Mood (aggressive → wimpy)
    await clickCard('position', takeOf(rest1!.log), rest1!.steps[0]!);
    await pointer.moveTo(UI.park.x, UI.park.y + 40);
    const down = await clickCard('mood', takeOf(wi!.log), wi!.steps[0]!);
    marks.markAt(down, 'mood-click', 'change mood wimpy');
    await pointer.moveTo(UI.park.x, UI.park.y + 120);

    // ---- the achievement's balloon: up, at rest; the page shot with only the balloon
    const balloons = (): Promise<{ phase: string; kind: string; count: number }[]> =>
      page.evaluate(async () => {
        const b = await (window as unknown as Wc).__wc.app.weather?.controller?.balloons();
        return b ? b.list() : [];
      });
    await until(ACHIEVEMENT.at);
    const ach = (l: { phase: string; kind: string; count: number }[]): { phase: string; kind: string; count: number } | undefined => l.find((b) => /achiev/.test(b.kind));
    if (await waitFor(async () => ach(await balloons()) !== undefined, 3000, 'the achievement balloon')) mark('balloon-up', 'the achievement balloon');
    await waitFor(async () => ach(await balloons())?.phase === 'read', 15000, 'the achievement balloon at rest');
    mark('balloon-rest', 'the achievement balloon at rest');
    const restAt = clock.now();
    console.log(`  balloons: ${JSON.stringify(await balloons())}`);
    await clock.sleep(300);
    // only the achievement's balloon (the bandit's may still be in view): its sign names the pie
    const one = await page.evaluate((what) => {
      const els = [...document.querySelectorAll<HTMLElement>('.wc-balloon')];
      const el = els.find((e) => e.textContent?.includes(what.slice(0, 12))) ?? els.at(-1);
      el?.setAttribute('data-film-cutout', '');
      return { n: els.length, found: !!el?.textContent?.includes(what.slice(0, 12)) };
    }, ACHIEVEMENT.what);
    console.log(`  the cutout: ${one.n} balloons in the page, the achievement's by its sign: ${one.found}`);
    await page.addStyleTag({
      content:
        'html, body, body * { background: transparent !important; background-color: transparent !important; box-shadow: none !important; } body * { visibility: hidden !important; } .wc-balloon[data-film-cutout], .wc-balloon[data-film-cutout] * { visibility: visible !important; } #wc-film-cutout {}',
    });
    await page.screenshot({ path: CUTOUT, omitBackground: true });
    await page.evaluate(() => {
      for (const s of document.querySelectorAll('style')) if (s.textContent?.includes('#wc-film-cutout')) s.remove();
      document.querySelector('[data-film-cutout]')?.removeAttribute('data-film-cutout');
    });
    mark('cutout', 'the balloon alone');
    await clock.until(restAt + AFTER_REST_S * 1000);
    if (ach(await balloons())?.phase !== 'read') console.warn('  the achievement balloon moved on before the take ended');
    marks.markAt(clock.now(), 'active-end', 'the take');

    // ---- checks, off the film
    const shown = await page.evaluate(() => document.querySelector('.wc-output')?.textContent ?? '');
    if (/WC[a-z0-9]{6}[[\]]/.test(shown)) throw new Error('a poll answer shows in the game pane');
    const view = await page.evaluate(() => (window as unknown as Wc).__wc.app.game.char.view());
    console.log(`  polls answered: ${mume.polls.length}; answered: ${answered.length} (${answered.map((a) => a.slice(0, 24)).join(' · ')})`);
    if (expected.length) console.warn(`  not taken: ${expected.map((e) => e.sends).join(', ')}`);
    console.log(`  the card ends: mood ${view.mood}, position ${view.position}; the achievement at ${ACHIEVEMENT.at} s, at rest ${((restAt - t0) / 1000).toFixed(2)} s`);
  },
};

/** The poll's state at log second `log` (the run's change, then what the log time says). */
function apply(mume: Mume, change: StateChange, log?: number): void {
  const s = mume.state;
  if (change.vitals) Object.assign(s.vitals, change.vitals);
  if (change.prompt) s.prompt = change.prompt;
  if (change.shields) s.shields = change.shields;
  if (log === undefined) return;
  s.strong = log >= STRONGER_LOG_S;
  s.wimpy = log >= WIMPY_LOG_S ? 100 : 204;
  s.copper = log >= PIE_LOG_S ? 42 : 48;
  s.affects = affectsAt(log);
}
