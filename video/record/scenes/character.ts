// The Character pane film's one take (video/manuscript-character.md draft 3,
// stage 78): Gittan's run from Mason Road in Bree to Tharbad and back aboard
// the coach, frame by frame on the film's clock (record/lib/frame-clock.ts).
// Times are take seconds from its first frame (feeds/character.ts; the
// film's 0:08).
//
//   Mason Road  `l`; the pointer switches the map on (docked right), the
//               coach arrives, the Character pane on (it floats in the
//               middle, Medium); `st`, `enter coach`; a click on the
//               position icon rests her
//   the coach   the tour while the card floats: Stats, Lore (scrolled),
//               Status, the level ring's tooltip, a click on Mood; the
//               card dragged to the right dock above the map and made
//               taller there; a glimpse of Paper (Settings → Appearance →
//               Background) and back
//   Tharbad     the rings, the bakery, the bandit, the north gate, the
//               tarantulas, the camp and the quakes, the revenge with its
//               clicks (Mood, Casts), the pie; the wait cut; aboard
//
// The mock answers the hidden info poll with Gittan's values as they stand
// at the take's moment of the run, and the card's clicks with MUME's own
// answers; every other line is the run's. Off the film it checks that the
// poll was answered and hidden, that every click was taken, and that the
// card ends as the run did.
import type { Locator } from '@playwright/test';
import { gmcpBytes, lineBytes, sleep } from '../../../scripts/lib/mume-feed.ts';
import {
  ANSWER_LAG_S,
  CHARACTER_BACKUP,
  CHARACTER_RUN,
  CLICKS,
  FIRST_PROMPT,
  LEGS,
  LOOK,
  NARRATES,
  PEAK_TAKE_S,
  PIE_LOG_S,
  PRE_LOG_S,
  STRONGER_LOG_S,
  TAKE_S,
  TOUR_MOOD,
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

/** The pointer's moments (take s). */
const UI = {
  mapPanes: 3.4,
  mapRow: 4.4,
  cardPanes: 8.7,
  cardRow: 9.7,
  status: 21.8,
  stats: 29.0,
  lore: 33.6,
  loreScroll: 35.4,
  statusAgain: 39.0,
  ring: 40.4,
  ringOff: 43.0,
  mood: 44.0,
  dockGrab: 48.6,
  resizeGrab: 51.8,
  settings: 55.0,
  appearance: 55.8,
  bg: 56.5,
  paper: 57.4,
  /** Paper stands at least this long. */
  paperHold: 2.6,
  bgBack: 60.0,
  black: 60.8,
  close: 61.5,
  park: { x: 780, y: 620 },
} as const;

/** Where a command is not typed (the pointer is in a menu or a window): it is sent as typed ones are. */
const BUSY: readonly [number, number][] = [
  [UI.mapPanes - 0.3, UI.mapRow + 0.8],
  [UI.cardPanes - 0.3, UI.cardRow + 0.8],
  [UI.settings - 0.3, UI.close + 1.5],
];

/** A typed line stands this long before its Enter. */
const READ_BEFORE_ENTER_S = 0.4;
/** A command's typing starts at least this long after the one before it went. */
const AFTER_ENTER_S = 0.25;

interface Wc {
  __wc: {
    app: { session: { sendCommand(t: string): void }; game: { char: { view(): Record<string, unknown> } } };
    settings: { get(): { layout: { docks: { right: { lanes: { panes: { id: string; desired: number }[] }[] } } }; appearance: { bg: string } } };
  };
}

export const characterTour: Scene = {
  mode: 'intel-1.2-png',
  page: CHARACTER_PAGE,
  stepped: { workers: 0, x: 0 },

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
    // the login poll answered, the page settled
    await sleep(4000);
    if (mume.polls.length === 0) throw new Error('no login poll: is fetchInfo on?');
    await page.locator('.wc-input-field').focus();
    await page.mouse.move(UI.park.x, UI.park.y);
    return { mume, run, room, events: feedEvents(run, PRE_LOG_S, 630) };
  },

  async run({ page, marks, clock }, state) {
    if (!clock) throw new Error('the Character take runs on the frame clock');
    const mume = state.mume as Mume;
    const events = state.events as FeedEvent[];
    const t0 = clock.t0;
    const T = (s: number): number => t0 + s * 1000;
    const until = (s: number): Promise<void> => clock.until(T(s));
    const mark = (kind: string, label: string, box?: { x: number; y: number; w: number; h: number } | null): void => marks.markAt(clock.now(), kind, label, box ?? null);
    const card = page.locator('.wc-pane-character');
    const input = page.locator('.wc-input-field');

    /** Server bytes; the poll's state follows the run. */
    // Held while a Settings list is open: the game's text scrolling the output closes it (round 1's finding)
    let held: (() => void)[] | null = null;
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
    const block = (lines: readonly string[], gmcp: readonly string[]): Buffer =>
      Buffer.concat([...lines.map((l) => lineBytes(l)), ...gmcp.map((g) => gmcpBytes(g)), promptBytes(mume.state.prompt)]);
    const vitalsOf = (gmcp: readonly string[]): StateChange =>
      ({ vitals: Object.assign({}, ...gmcp.filter((g) => g.startsWith('Char.Vitals ')).map((g) => JSON.parse(g.slice(12)) as object)) as Record<string, unknown> });

    // ---- the clicks' answers: MUME's, a pulse after the card's command reaches it
    const expected: { sends: string; lines: readonly string[]; gmcp: readonly string[] }[] = [];
    const answered: string[] = [];
    mume.onCommand = (cmd) => {
      const i = expected.findIndex((e) => e.sends === cmd);
      if (i < 0) return;
      const e = expected.splice(i, 1)[0]!;
      answered.push(cmd);
      clock.schedule(clock.now() + ANSWER_LAG_S * 1000, () => send(block(e.lines, e.gmcp), vitalsOf(e.gmcp)));
    };

    // ---- the run
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
    /** Typed so that its Enter lands at `enter`; a hand's pace, quicker when the run's next command is close. */
    const type = (text: string, enter: number): void => {
      const gaps = [...text].map((ch) => (ch === ' ' ? 120 + rnd() * 60 : 60 + rnd() * 45));
      const want = gaps.reduce((a, b) => a + b, 0) / 1000;
      const room = enter - READ_BEFORE_ENTER_S - Math.max(lastEnter + AFTER_ENTER_S, 0);
      if (room < text.length * 0.03) {
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
    // Mason Road: `l`, MUME's answer a pulse later
    type(LOOK.cmd, LOOK.at);
    clock.schedule(T(LOOK.at + 0.25), () => send(block(LOOK.lines, [])));
    for (const e of events) {
      if (e.kind === 'out') clock.schedule(T(e.take), () => send(e.out, e.change, e.log));
      else if (e.typed && !busy(e.take) && e.take > 1) type(e.cmd, e.take);
      else {
        clock.schedule(T(e.take), () => sendCmd(e.cmd));
        lastEnter = e.take;
      }
    }
    for (const l of LEGS) clock.schedule(T(l.take), () => mark(l.cut ? 'cut' : 'leg', l.name));
    for (const n of NARRATES) {
      const text = `${n.talker} narrates '${n.words}'`;
      const g = `Comm.Channel.Text ${JSON.stringify({ channel: 'tales', talker: n.talker, 'talker-type': 'player', text })}`;
      clock.schedule(T(n.at), () => {
        mark('narrate', n.talker);
        send(Buffer.concat([lineBytes(''), lineBytes(`\x1b[33m${text}\x1b[0m`), lineBytes(''), gmcpBytes(g), promptBytes(mume.state.prompt)]));
      });
    }
    // the moments the captions follow
    clock.schedule(T(takeOf(STRONGER_LOG_S)), () => mark('stones', 'You feel stronger.'));
    clock.schedule(T(takeOf(308.02)), () => mark('fight', 'the tarantulas'));
    clock.schedule(T(takeOf(312.02)), () => mark('poison', 'poisoned'));
    clock.schedule(T(takeOf(424.51)), () => mark('peak', 'both tarantulas dead'));
    clock.schedule(T(takeOf(469.52)), () => mark('pie', 'six copper'));
    clock.schedule(T(takeOf(629.27)), () => mark('homeward', 'The coach starts moving towards Bree and Fornost.'));

    await clock.frame(); // the first frame
    marks.markAt(t0, 'film0', 'the take starts');
    marks.markAt(t0, 'active', 'the take');
    const pointer = new Pointer(page, SEED, UI.park, clock);

    /** Frames until `ok` holds (checked every few frames), at most `ms`. */
    const waitFor = async (ok: () => Promise<boolean>, ms: number, what: string): Promise<void> => {
      const end = clock.now() + ms;
      while (!(await ok())) {
        if (clock.now() > end) {
          console.warn(`  ${what}: not after ${ms} ms`);
          return;
        }
        await clock.sleep(50);
      }
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
    const boxOf = async (l: Locator): Promise<{ x: number; y: number; w: number; h: number } | null> => {
      const b = await l.boundingBox();
      return b ? { x: b.x * 1.2, y: b.y * 1.2, w: b.width * 1.2, h: b.height * 1.2 } : null;
    };
    const field = (id: string): Locator => card.locator(`[data-click="${id}"]`).first();
    const pending = async (id: string): Promise<boolean> => (await field(id).getAttribute('data-pending')) !== null;
    /** A click on the card that MUME answers (`steps`), each press `gap` s after the one before. */
    const clickCard = async (id: string, at: number, steps: readonly { sends: string; lines: readonly string[]; gmcp: readonly string[] }[], gap = 0.95): Promise<void> => {
      for (const [i, s] of steps.entries()) {
        expected.push(s);
        await waitFor(async () => !(await pending(id)), 1500, `${id} still pending`);
        const down = await pointer.clickAt(field(id), T(at + i * gap), { quick: i > 0 });
        marks.markAt(down, 'click', `${id}: ${s.sends}`, await boxOf(field(id)));
      }
    };

    // the map on, docked right; it finds Gittan once its map file is read
    await paneOn('map', UI.mapPanes, UI.mapRow);
    await waitFor(async () => (await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').count()) > 0, 8000, 'the map');
    if (state.room) send(state.room as Buffer);
    mark('map-on', 'the map finds Mason Road');

    // the Character pane on: it floats in the middle, Medium
    await paneOn('character', UI.cardPanes, UI.cardRow);
    await waitFor(async () => (await card.count()) > 0 && (await card.isVisible()), 2000, 'the card');
    mark('card-on', 'the Character pane', await boxOf(card));
    console.log(`  the card: ${await card.locator('.wc-cc').getAttribute('data-mode')} at ${JSON.stringify(await card.boundingBox())}`);

    // `r` in the coach: a click on the position icon
    const [rest0, rest1, ag, casts, wi] = CLICKS;
    await clickCard('position', takeOf(rest0!.log), rest0!.steps);

    // ---- the tour
    const tab = (id: string): Locator => card.locator(`.wc-cc-tab[data-tab="${id}"]`);
    marks.markAt(T(UI.status), 'status', 'Status');
    marks.markAt(await pointer.clickAt(tab('stats'), T(UI.stats)), 'tab', 'stats');
    marks.markAt(await pointer.clickAt(tab('lore'), T(UI.lore)), 'tab', 'lore');
    await pointer.hoverAt(card.locator('.wc-pane-content'), T(UI.loreScroll));
    mark('lore-scroll', 'the rest of Lore');
    for (let i = 0; i < 7; i++) {
      await page.mouse.wheel(0, 36);
      await clock.sleep(110);
    }
    marks.markAt(await pointer.clickAt(tab('status'), T(UI.statusAgain)), 'tab', 'status again');
    await pointer.hoverAt(card.locator('.wc-cc-ring'), T(UI.ring));
    mark('ring-tip', 'the level ring', await boxOf(card.locator('.wc-cc-ring')));
    await pointer.rest(T(UI.ringOff - 0.6));
    await clickCard('mood', UI.mood, [TOUR_MOOD]);
    mark('mood-click', 'change mood prudent');

    // docked above the map: by the title row to the screen's top right edge, then taller
    const c0 = (await card.boundingBox())!;
    await pointer.hoverPoint(c0.x + c0.width * 0.3, c0.y + CELL.h * 0.45, T(UI.dockGrab - 0.9));
    marks.markAt(await pointer.dragTo(1596, CELL.h * 0.8, T(UI.dockGrab), { ms: 1400, holdMs: 500 }), 'docked', 'the card above the map');
    await clock.sleep(400);
    const lane = await page.evaluate(() => (window as unknown as Wc).__wc.settings.get().layout.docks.right.lanes[0]?.panes.map((p) => p.id).join(','));
    if (lane !== 'character,map') console.warn(`  the right dock's lane: ${lane}`);
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
    mark('dock-done', 'docked', await boxOf(card));
    console.log(`  docked: ${JSON.stringify(await card.boundingBox())} ${await card.locator('.wc-cc').getAttribute('data-mode')}`);

    // a glimpse of Paper
    const popup = page.locator('.wc-sp-settings');
    marks.markAt(await pointer.clickAt(page.locator('.wc-mb[data-mb="settings"]'), T(UI.settings)), 'settings', 'Settings');
    await clock.sleep(300);
    await pointer.clickAt(popup.locator('.wc-ck-tab[data-tab="appearance"]'), T(UI.appearance), { quick: true });
    const bg = popup.locator('.wc-ck-dd[aria-label="Background"]');
    const opt = (hex: string): Locator => page.locator(`.wc-ck-list[aria-label="Background"] .wc-ck-opt[data-value="${hex}"]`);
    /** The Background list opened (a frame or two in the frozen page), then the colour chosen; returns the press. */
    const optBox = (hex: string): Promise<{ x: number; y: number } | null> =>
      page.evaluate((h) => {
        const o = document.querySelector(`.wc-ck-list[aria-label="Background"] .wc-ck-opt[data-value="${h}"]`);
        const b = o?.getBoundingClientRect();
        return b && b.width > 0 ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
      }, hex);
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
    const paperAt = (await choose('#f4ecd8', UI.bg, UI.paper, 'paper', 'Paper') - t0) / 1000;
    const back = Math.max(UI.bgBack, paperAt + UI.paperHold - 0.8);
    await choose('#000000', back, back + 0.8, 'lykta', 'back to black');
    await pointer.rest(Math.max(T(UI.close), clock.now() + 500));
    await page.keyboard.press('Escape');
    mark('settings-closed', 'Settings closed');
    await input.focus();
    const bgNow = await page.evaluate(() => (window as unknown as Wc).__wc.settings.get().appearance.bg);
    if (bgNow !== '#000000') console.warn(`  the background is ${bgNow}`);
    await pointer.moveTo(UI.park.x, UI.park.y);

    // ---- Tharbad and back: the clicks that were typed
    await clickCard('position', takeOf(rest1!.log), rest1!.steps);
    await pointer.moveTo(UI.park.x, UI.park.y + 40);
    await clickCard('mood', takeOf(ag!.log) - (ag!.lead ?? 0), ag!.steps);
    await clickCard('casts', takeOf(casts!.log), casts!.steps);
    await clickCard('mood', takeOf(wi!.log), wi!.steps);
    await pointer.moveTo(UI.park.x, UI.park.y);

    await until(TAKE_S);
    marks.markAt(clock.now(), 'active-end', 'the take');

    // ---- checks, off the film
    const shown = await page.evaluate(() => document.querySelector('.wc-output')?.textContent ?? '');
    if (/WC[a-z0-9]{6}[[\]]/.test(shown)) throw new Error('a poll answer shows in the game pane');
    const view = await page.evaluate(() => (window as unknown as Wc).__wc.app.game.char.view());
    console.log(`  polls answered: ${mume.polls.length}; clicks answered: ${answered.length} (${answered.join(' · ')})`);
    if (expected.length) console.warn(`  clicks not taken: ${expected.map((e) => e.sends).join(', ')}`);
    console.log(`  the card ends: mood ${view.mood}, casts ${view.spellEffort}, position ${view.position}`);
    console.log(`  the peak at ${(takeOf(424.51)).toFixed(2)} s (planned ${PEAK_TAKE_S})`);
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

