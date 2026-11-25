// The Character pane film's one take (video/manuscript-character.md, the
// round 3 plan, draft 5; stage 78): Gittan's run from Mason Road in Bree to
// a pork-pie in Tharbad as the owner edited its text, frame by frame on the
// film's clock (record/lib/frame-clock.ts). Times are take seconds from its
// first frame (feeds/character.ts; the film's 0:07).
//
//   Mason Road  the pointer switches the map on (docked right); Gittan
//               narrates (`Ok.`); the coach arrives; the Character pane on
//               (it floats in the middle, Large); `enter coach`
//   the coach   a click on the position icon rests her; Thorgrim; Comm on
//               (under the map, borderless, clear); a calm look at Stats
//               and Lore, back to Status; Mirel, Gittan's answer; the
//               level ring's tooltip; the card dragged to the right dock
//               above the map and made taller; `stat`, `eq`, the rings
//   Tharbad     to the bakery, the bandit, the north gate ("assaulted …";
//               Odalric on the way back), the revenge (`ag` typed; a click
//               on Mood: aggressive → wimpy), the pie; the achievement
//               staged: its balloon rises, rests and flies on
//
// The mock answers the hidden info poll with Gittan's values as they stand
// at the take's moment of the run, the card's clicks and her own narrates
// with MUME's own answers; every other line is the run's, as the owner kept
// them. From just after the achievement balloon's rest every frame is shot
// a second time with only the balloon drawn (transparent PNGs in
// public/recordings/character-balloon/): the composition keeps it while the
// rest fades.
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Locator } from '@playwright/test';
import { gmcpBytes, lineBytes, sleep } from '../../../scripts/lib/mume-feed.ts';
import {
  ACHIEVEMENT,
  AFTER_REST_S,
  ANSWER_LAG_S,
  BALLOONS_ON_AT,
  CHARACTER_BACKUP,
  CHARACTER_RUN,
  CLICKS,
  END_LOG_S,
  FIRST_PROMPT,
  LAYER_FROM_S,
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
import { type FeedEvent, type StateChange, feedEvents } from '../lib/character-feed.ts';
import { CELL, CHARACTER_PAGE, Mume, enterMasonRoad, promptBytes } from '../lib/character-state.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

const SEED = 20261125;
const LAYER = fileURLToPath(new URL('../../public/recordings/character-balloon/', import.meta.url));

/** The pointer's moments (take s). */
const UI = {
  mapPanes: 0.5,
  mapRow: 1.4,
  /** Gittan's first narrate is typed from here (the Panes popup closed). */
  firstType: 2.3,
  cardPanes: 7.2,
  cardRow: 8.1,
  commPanes: 21.8,
  commRow: 22.7,
  stats: 25.2,
  lore: 31.4,
  status: 37.6,
  ring: 40.0,
  ringOff: 42.4,
  dockGrab: 44.0,
  resizeGrab: 47.0,
  park: { x: 780, y: 620 },
} as const;

/** Where a command is not typed (the pointer is in a menu or a window): it is sent as typed ones are. */
const BUSY: readonly [number, number][] = [
  [UI.mapPanes - 0.3, UI.mapRow + 0.8],
  [UI.cardPanes - 0.3, UI.cardRow + 0.8],
  [UI.commPanes - 0.3, UI.commRow + 0.8],
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
    await enterMasonRoad(page, mume);
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
    // the login poll answered, the page settled
    await sleep(4000);
    if (mume.polls.length === 0) throw new Error('no login poll: is fetchInfo on?');
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
    // one's own narrate: Comm.Channel.Text (talker `you`) for Comm, and in the game window only MUME's `Ok.` (the owner, draft 5)
    const narrAnswer = (words: string): Answer => ({
      sends: `narr ${words}`,
      out: () =>
        Buffer.concat([
          gmcpBytes(`Comm.Channel.Text ${JSON.stringify({ channel: 'tales', talker: 'you', text: words })}`),
          lineBytes('Ok.'),
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
    clock.schedule(T(takeOf(448.51)), () => mark('fight', 'the bandit'));
    clock.schedule(T(takeOf(467.68)), () => mark('peak', 'the bandit dead'));
    // the balloons on, in the settings alone (no frame shows it): only the achievement gets one
    clock.schedule(T(BALLOONS_ON_AT), async () => {
      await page.evaluate(() => (window as unknown as Wc).__wc.settings.update((d) => void (d.weather.balloons = true)));
      mark('balloons-on', 'Balloons on (settings)');
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

    // ---- the coach: `r` a click on the position icon
    const [rest0, wi] = CLICKS;
    await clickCard('position', takeOf(rest0!.log), rest0!.steps[0]!);
    await pointer.moveTo(UI.park.x, UI.park.y);

    // Comm on: under the map, borderless and clear, Public
    await paneOn('comm', UI.commPanes, UI.commRow);
    mark('comm-on', 'Comm under the map');
    console.log(`  Comm on: the right dock's lane ${await lane()}`);

    // a calm look at Stats and Lore, then Status again
    const tab = (id: string): Locator => card.locator(`.wc-cc-tab[data-tab="${id}"]`);
    marks.markAt(await pointer.clickAt(tab('stats'), T(UI.stats)), 'tab', 'stats');
    marks.markAt(await pointer.clickAt(tab('lore'), T(UI.lore)), 'tab', 'lore');
    const more = await card.locator('.wc-pane-content').evaluate((e) => e.textContent?.includes('more') ?? false);
    if (more) console.warn('  Lore shows "more": not all of it fits');
    marks.markAt(await pointer.clickAt(tab('status'), T(UI.status)), 'tab', 'status');

    // the ring's tooltip
    await pointer.hoverAt(card.locator('.wc-cc-ring'), T(UI.ring));
    mark('ring-tip', 'the level ring');
    await pointer.rest(T(UI.ringOff));

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
    await input.focus();
    await pointer.moveTo(UI.park.x, UI.park.y);

    // ---- Tharbad: after the bandit's kill, a click on Mood (aggressive → wimpy)
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
    await clock.until(restAt + LAYER_FROM_S * 1000);
    // from here every frame twice: the take's, then the page with only the balloon drawn (transparent)
    rmSync(LAYER, { recursive: true, force: true });
    mkdirSync(LAYER, { recursive: true });
    await page.addStyleTag({
      content:
        '[data-film-layer] body, [data-film-layer] body * { background: transparent !important; background-color: transparent !important; box-shadow: none !important; } [data-film-layer] body * { visibility: hidden !important; } [data-film-layer] .wc-balloon, [data-film-layer] .wc-balloon * { visibility: visible !important; } [data-film-layer] { background: transparent !important; }',
    });
    let layerFrames = 0;
    clock.onFrame = async (index) => {
      // the take's frame `index` and this one show the same moment
      if (layerFrames === 0) marks.markAt(t0 + (index * 1000) / 60, 'layer-from', 'the balloon alone, frame by frame');
      await page.evaluate(() => document.documentElement.setAttribute('data-film-layer', ''));
      await page.screenshot({ path: `${LAYER}${String(layerFrames).padStart(5, '0')}.png`, omitBackground: true });
      await page.evaluate(() => document.documentElement.removeAttribute('data-film-layer'));
      layerFrames++;
    };
    await clock.until(restAt + AFTER_REST_S * 1000);
    clock.onFrame = null;
    console.log(`  the balloon alone: ${layerFrames} frames from ${((restAt - t0) / 1000 + LAYER_FROM_S).toFixed(2)} s`);
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
