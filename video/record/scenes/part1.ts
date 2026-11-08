// The film's part 1 (music 0:00 to beat 59, 0:44.13), one continuous take:
// the start page in the middle of the night, a shooting star; the pointer
// opens Profile, the page grows out of the menu, khazdul is highlighted (the
// pointer on its row) and selected (its Select button), Back; Enter MUME
// (the pointer stays where it clicked), the transition, MUME's welcome
// screen (the real one, mocked socket); the name typed, the password typed
// masked; Gittan arrives in the Prancing Pony's Lodging Foyer and the run
// plays on: a guard leaves, she looks, leads the pony (feeds/arrival.ts).
// Part 2 continues from this game state (the run's `gro pony` at 8.6 s).
//
// The take is timed to the music, so the composition (src/compositions/
// Part1.tsx) only lines it up: `music0` is the take's moment for music
// 0:00, and every press lands on its beat (src/beats.ts) after it. The
// pointer (record/lib/mouse.ts `Pointer`) goes straight from target to
// target and moves like a hand, from a fixed seed.
//
// Markers: `start` (the start page is up), `music0`, `shoot`, `profile`,
// `highlight`, `select`, `back`, `enter`, `banner` (MUME's text arrives),
// `name`, `password`, `arrive` (the room), `cmd` (each command of the run),
// `end`; `active`/`active-end` around the whole take.
import { play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { arrival } from '../../feeds/arrival.ts';
import { beatS } from '../../src/beats.ts';
import { FILM_PAGE, freshStart, prepareFilm, shootingStar } from '../lib/film-state.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { type LoginMock, mockMumeLogin } from '../lib/mume-login.ts';
import type { Scene } from '../lib/scene.ts';

/** Music 0:00 is this long after the start page is up (its sky has faded in). */
const MUSIC0_AFTER_MS = 1200;
/** The take runs this long past the end of the part (room for the join). */
const TAIL_S = 2;
/** The shooting star, s of music (owner: about 5–6 s into the film). */
const SHOOT_S = 5.0;
/** The pointer's and the typing's seed: a retake moves and types the same. */
const SEED = 20261108;

/**
 * The beats (owner, 2026-11-08: into Profile at 12–13 s). Presses land on
 * these; `highlight` is when the pointer arrives on khazdul's row; `name`
 * and `password` are their Enters. The part ends on beat 59 (a bar), once
 * Gittan has arrived and the game has moved a little.
 */
export const BEATS = { profile: 17, highlight: 20, select: 23, back: 27, enter: 31, name: 43, password: 47, end: 59 } as const;
/** Gittan's room appears this long after the password's Enter (MUME's answer). */
const ARRIVE_AFTER_MS = 650;

export const part1: Scene = {
  // PNG frames at the film's size: the night sky's gradients stay clean.
  mode: 'intel-1.2-png',
  page: FILM_PAGE,

  async setup(page) {
    await prepareFilm(page);
    const login = await mockMumeLogin(page);
    return { login, arrival: arrival() };
  },

  async run({ page, marks }, state) {
    const login = state.login as LoginMock;
    const arrive = state.arrival as ReturnType<typeof arrival>;
    await freshStart(page);
    marks.mark('start', 'the start page is up');
    marks.mark('active', 'the take');
    const music0 = Date.now() + MUSIC0_AFTER_MS;
    marks.markAt(music0, 'music0', 'music 0:00');
    const T = (s: number): number => music0 + s * 1000;
    const B = (n: number): number => T(beatS(n));
    const until = async (ms: number): Promise<void> => {
      const w = ms - Date.now();
      if (w > 0) await sleep(w);
    };
    // The hand is off the mouse until it reaches for Profile: the pointer rests low on the right.
    const pointer = new Pointer(page, SEED);
    await pointer.place(1240, 770);

    // The shooting star, top right, away from the wordmark.
    await until(T(SHOOT_S));
    await shootingStar(page, { x: 0.64, y: 0.05, dir: 1, angle: 0.48 });
    marks.mark('shoot', 'a shooting star');

    // Profile: the page grows out of the menu.
    await until(B(BEATS.profile) - 1900);
    const menu = (key: string) => page.locator(`.wc-start .wc-sm-item[data-key="${key}"] .wc-sm-label`).first();
    marks.markAt(await pointer.clickAt(menu('profile'), B(BEATS.profile)), 'profile', `beat ${BEATS.profile}`);
    // khazdul: the pointer on its name highlights the row and shows its buttons; then its Select.
    const row = page.locator('.wc-pl-row[data-name="khazdul"]');
    await pointer.hoverAt(row.locator('.wc-pl-n'), B(BEATS.highlight));
    marks.mark('highlight', `beat ${BEATS.highlight}`);
    marks.markAt(await pointer.clickAt(row.locator('[data-btn="SELECT"]'), B(BEATS.select)), 'select', `beat ${BEATS.select}`);
    // Back, straight there.
    marks.markAt(await pointer.clickAt(page.locator('button[aria-label="Back (Esc)"]').first(), B(BEATS.back)), 'back', `beat ${BEATS.back}`);
    // Enter MUME.
    marks.markAt(await pointer.clickAt(menu('enter'), B(BEATS.enter)), 'enter', `beat ${BEATS.enter}`);

    // MUME's welcome screen. The hand leaves the mouse where it clicked (the overlay pointer fades there).
    await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
    const input = page.locator('.wc-input-field');
    await input.focus();
    // Typing at a person's uneven pace: the Enter of each lands on its beat.
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
    await typeTo('Gittan', B(BEATS.name));
    // Made up; the socket goes nowhere. The client masks it (the server took over the echo).
    await typeTo('starlight', B(BEATS.password));
    // Gittan arrives: the room, then the run plays on from its `from` second.
    const server = login.server()!;
    const arrivedAt = B(BEATS.password) + ARRIVE_AFTER_MS;
    await until(arrivedAt);
    server.send('out' in arrive.arrive ? arrive.arrive.out : Buffer.alloc(0));
    marks.mark('arrive', 'Gittan arrives in the Lodging Foyer');
    await until(arrivedAt + arrive.from * 1000);
    await play(page, server, arrive.steps, { typeDelay: 110, onStep: (st) => ('cmd' in st ? marks.mark('cmd', st.cmd) : undefined) });
    await until(T(beatS(BEATS.end) + TAIL_S));
    for (const k of ['banner', 'name', 'password'] as const) {
      const t = login.at[k];
      if (t !== undefined) marks.markAt(t, k, `MUME: ${k}`);
    }
    marks.markAt(B(BEATS.end), 'end', `beat ${BEATS.end}, ${beatS(BEATS.end).toFixed(2)} s`);
    marks.mark('active-end', 'the take');
  },
};
