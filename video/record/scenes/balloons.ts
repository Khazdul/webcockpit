// The balloon film's takes (video/manuscript-balloons.md, stage 76): one
// desktop take per act, the whole window, no pointer.
//
//   balloons-title   the start page's night sky with its menu, wordmark and
//                    almanac hidden (the title card goes over it); off
//                    camera first, a still of the hobbit's balloon for the
//                    card (public/recordings/balloons-sprite.png, `sprite`)
//   balloons-gittan  act 1, by day: the troll in Gloomy Valley, the prison
//                    guard and the mastiffs, the chest (feeds/balloons.ts
//                    GITTAN)
//   balloons-rasta   act 2, at dusk: the PvP kills in the caves (RASTA)
//   balloons-parade  act 3, at night: Gittan at the Gates of Ingrove, six
//                    passengers sent one by one from the scene (PARADE_SHOWS)
//
// The game is the owner's runs, played in legs (record/lib/balloon-state.ts
// `playLegs`): the take marks `piece-in` / `piece-out` where the film's
// pieces start and end, and every kill, level and achievement line as it is
// sent. The composition (src/compositions/Balloons.tsx) cuts from them.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { sleep } from '../../../scripts/lib/mume-feed.ts';
import { BALLOON_BACKUP, type BalloonTake, GITTAN, GITTAN_PREV, PARADE, RASTA } from '../../feeds/balloons.ts';
import { FILM_BACKUP } from '../../feeds/film.ts';
import { type Light, MOMENT, type LegPlan, balloonList, balloonPage, enterBalloons, planLegs, playLeg, setBalloons, shiftedRun, showBalloon } from '../lib/balloon-state.ts';
import { freshStart } from '../lib/film-state.ts';
import { loadBackup } from '../lib/run-feed.ts';
import type { Scene, SceneState } from '../lib/scene.ts';
import { Marks } from '../lib/timeline.ts';

const SPRITE = fileURLToPath(new URL('../../public/recordings/balloons-sprite.png', import.meta.url));

/** The parade (owner, 2026-11-21: one at a time, about 3 s apart, varied races and moods). */
export const PARADE_SHOWS: { passenger: string; notice: Record<string, unknown> }[] = [
  { passenger: 'dwarf', notice: { name: 'A mountain troll', xp: 20648, face: 'superb' } },
  { passenger: 'elf', notice: { kind: 'achievement', text: 'You found the hidden path to Rivendell!' } },
  { passenger: 'troll', notice: { name: 'A field mouse', xp: 140, face: 'poor' } },
  { passenger: 'human', notice: { kind: 'levelup', level: 37 } },
  { passenger: 'orc', notice: { name: '*Brandir the Dúnadan Man*', xp: 46200, face: 'pvp' } },
  { passenger: 'numenorean', notice: { kind: 'death', level: 52 } },
];
/**
 * The parade's pace, s: the first balloon after the take's `film0`, then
 * one every `gap`, except that a kill waits until the last kill's balloon
 * has left its readable spot (balloons.ts: a kill that comes while a kill
 * balloon is arriving or readable joins its sign, whoever flies it; three
 * of the six are kills, so they come about 10 s apart). `tail`: the take
 * runs on this long after the last one.
 */
export const PARADE_AT = { first: 0.4, gap: 2.6, tail: 14 } as const;

/** The title's balloon: the hobbit's, with an achievement of its own. */
const SPRITE_SHOW = { passenger: 'hobbit', notice: { kind: 'achievement', text: 'You unlocked hot-air balloons!' } };

const faces = async (page: Page, what: string): Promise<void> => {
  const l = await balloonList(page);
  console.log(`  ${what}: ${l.map((b) => `${b.passenger} ${b.kind} ${b.face} ×${b.count} (${b.phase})`).join('; ') || 'no balloons'}`);
};

/** Sets up a run take: enters the game in `light`, plays the first (fast) leg off camera. */
async function runSetup(page: Page, take: BalloonTake, backup: string, light: Light, prev?: string): Promise<SceneState> {
  const runs = loadBackup(backup);
  const plan = planLegs(runs, take);
  // the earlier run's last event two minutes before now: the live run chains to it (src/runs/stitch.ts: within the hour)
  const { server } = await enterBalloons(page, light, prev ? () => shiftedRun(backup, prev, (Date.now() - 120_000) * 1000) : undefined);
  const first = plan[0]!;
  if (first.leg.kind !== 'fast') throw new Error('a take starts with a fast leg');
  await playLeg(page, server, first, new Marks(1));
  // Balloons on now that the run is in the store: the rating's history is read when they start
  // (and on a run's start, which is before the recorder has written the run: see the stage file, round 1)
  await sleep(2600);
  await setBalloons(page, false);
  await setBalloons(page, true);
  await sleep(1200);
  return { server, plan };
}

async function runTake(page: Page, marks: Marks, st: SceneState, take: BalloonTake): Promise<void> {
  const plan = st.plan as LegPlan[];
  const server = st.server as Parameters<typeof playLeg>[1];
  marks.mark('active', 'the take');
  marks.mark('film0', 'the take starts');
  await sleep(400);
  for (const lp of plan.slice(1)) {
    if (lp.leg.noBalloons) await setBalloons(page, false);
    await playLeg(page, server, lp, marks, take.pieces);
    if (lp.leg.noBalloons) {
      await setBalloons(page, true);
      await sleep(600);
    }
    if (lp.leg.kind === 'real') await faces(page, lp.leg.name ?? 'leg');
  }
  await sleep(1500);
  await faces(page, 'at the end');
  marks.mark('active-end', 'the take');
}

export const balloonsGittan: Scene = {
  mode: 'intel-1.2-png',
  page: balloonPage('day'),
  setup: (page) => runSetup(page, GITTAN, FILM_BACKUP, 'day', GITTAN_PREV),
  run: ({ page, marks }, st) => runTake(page, marks, st, GITTAN),
};

export const balloonsRasta: Scene = {
  mode: 'intel-1.2-png',
  page: balloonPage('dusk'),
  setup: (page) => runSetup(page, RASTA, BALLOON_BACKUP, 'dusk'),
  run: ({ page, marks }, st) => runTake(page, marks, st, RASTA),
};

export const balloonsParade: Scene = {
  mode: 'intel-1.2-png',
  page: balloonPage('night'),
  setup: (page) => runSetup(page, PARADE, FILM_BACKUP, 'night'),
  async run({ page, marks }, st) {
    const plan = st.plan as LegPlan[];
    const server = st.server as Parameters<typeof playLeg>[1];
    marks.mark('active', 'the take');
    const film0 = Date.now();
    marks.markAt(film0, 'film0', 'the parade starts');
    const game = (async () => {
      for (const lp of plan.slice(1)) await playLeg(page, server, lp, marks);
    })();
    const parade = (async () => {
      let next = film0 + PARADE_AT.first * 1000;
      for (const s of PARADE_SHOWS) {
        const w = next - Date.now();
        if (w > 0) await sleep(w);
        if (!('kind' in s.notice)) {
          // a kill: not while the last kill's balloon can still take it on its sign
          while ((await balloonList(page)).some((b) => b.kind === 'kill' && (b.phase === 'arrive' || b.phase === 'read'))) await sleep(40);
        }
        await showBalloon(page, s.notice, s.passenger);
        marks.mark('parade', `${s.passenger} ${String(s.notice.face ?? s.notice.kind)}`);
        next = Date.now() + PARADE_AT.gap * 1000;
      }
    })();
    await Promise.all([game, parade]);
    await faces(page, 'the parade');
    await sleep(PARADE_AT.tail * 1000);
    await faces(page, 'at the end');
    marks.mark('active-end', 'the take');
  },
};

export const balloonsTitle: Scene = {
  mode: 'intel-1.2-png',
  page: balloonPage('night'),
  async setup(page) {
    // The card's balloon: a still of the rig (reduced motion holds it at its readable spot), with
    // everything else hidden and the page's background left out (a PNG with alpha).
    await enterBalloons(page, 'night');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await showBalloon(page, SPRITE_SHOW.notice, SPRITE_SHOW.passenger);
    await sleep(2500);
    const style = await page.addStyleTag({
      content: 'html, body { background: transparent !important; } body * { visibility: hidden !important; } .wc-balloons, .wc-balloons * { visibility: visible !important; }',
    });
    const el = page.locator('.wc-balloons-front > *, .wc-balloons-sky > *').first();
    const box = await el.boundingBox();
    if (!box) throw new Error('no balloon to capture');
    const pad = 24;
    const png = await page.screenshot({ omitBackground: true, clip: { x: box.x - pad, y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad } });
    writeFileSync(SPRITE, png);
    console.log(`  the title's balloon: ${SPRITE} (${Math.round(box.width)} × ${Math.round(box.height)} CSS px)`);
    await style.evaluate((s) => (s as Element).remove());
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    // the start page at night, the sky alone
    await freshStart(page, MOMENT.night);
    await page.addStyleTag({ content: '.wc-start-scenery, .wc-stack, .wc-lk-morph { visibility: hidden !important; }' });
    await sleep(2500);
    return {};
  },
  async run({ marks }) {
    marks.mark('active', 'the take');
    marks.mark('film0', 'the title');
    await sleep(7000);
    marks.mark('active-end', 'the take');
  },
};
