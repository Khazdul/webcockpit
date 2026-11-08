// The film's part 1 (video/manuscript.md, music 0:00 to 0:50.06), one
// continuous take: the start page at dusk; the pointer opens Profile, the
// page grows out of the menu, khazdul is highlighted (the pointer on its
// row) and selected (its Select button), Back;
// Enter MUME, the transition, MUME's welcome screen (the real one, mocked
// socket); the name typed, the password typed masked.
//
// The take is timed to the music, so the composition (src/compositions/
// Part1.tsx) only lines it up: `music0` is the take's moment for music
// 0:00, and every click lands on its beat (src/beats.ts) after it. The
// choices: Profile on beat 27 (0:20.43, a downbeat), khazdul highlighted on
// beat 31 and selected on beat 35 (the phrase at 0:26.36), Back on beat 41,
// Enter MUME on beat 47 (0:35.24, a downbeat: the client's transition takes
// about 4.5 s, so MUME's screen is up by 0:40 and held), the name's Enter
// on beat 61, the password's on beat 65; the part ends at beat 67 (0:50.06).
//
// Markers: `start` (the start page is up), `music0`, `profile`, `highlight`,
// `select`, `back`, `enter`, `banner` (MUME's text arrives), `name`,
// `password`, `end`; `active`/`active-end` around the whole take.
import { sleep } from '../../../scripts/lib/mume-feed.ts';
import { beatS } from '../../src/beats.ts';
import { FILM_PAGE, freshStart, prepareFilm } from '../lib/film-state.ts';
import { glide, glideClick, place } from '../lib/mouse.ts';
import { type LoginMock, mockMumeLogin } from '../lib/mume-login.ts';
import type { Scene } from '../lib/scene.ts';

/** Music 0:00 is this long after the start page is up (its sky has faded in). */
const MUSIC0_AFTER_MS = 1200;
/** The take runs this long past the end of the part (room for the join). */
const TAIL_S = 2.5;

export const BEATS = { profile: 27, highlight: 31, select: 35, back: 41, enter: 47, name: 61, password: 65, end: 67 } as const;

export const part1: Scene = {
  page: FILM_PAGE,

  async setup(page) {
    await prepareFilm(page);
    const login = await mockMumeLogin(page);
    return { login };
  },

  async run({ page, marks }, state) {
    const login = state.login as LoginMock;
    await freshStart(page);
    marks.mark('start', 'the start page is up');
    marks.mark('active', 'the take');
    const music0 = Date.now() + MUSIC0_AFTER_MS;
    marks.markAt(music0, 'music0', 'music 0:00');
    const T = (s: number): number => music0 + s * 1000;
    const until = async (ms: number): Promise<void> => {
      const w = ms - Date.now();
      if (w > 0) await sleep(w);
    };
    // The pointer rests low on the right, out of the way, until it is needed.
    await place(page, 1250, 760);

    /** Glides to `sel` and clicks so that the click lands on beat `n`. */
    const clickOn = async (n: number, sel: string, kind: string, o: { ms?: number; dx?: number } = {}): Promise<void> => {
      const ms = o.ms ?? 950;
      await until(T(beatS(n)) - ms - 190);
      await glideClick(page, page.locator(sel).first(), { ms, ...(o.dx !== undefined ? { dx: o.dx } : {}) });
      marks.mark(kind, `beat ${n}`);
    };

    // Profile: the page grows out of the menu.
    await clickOn(BEATS.profile, '.wc-start .wc-sm-item[data-key="profile"]', 'profile', { ms: 1300 });
    // khazdul: the pointer on its row highlights it and shows its buttons (beat 31); its Select (beat 35).
    await until(T(beatS(BEATS.highlight)) - 1000);
    // on the name itself, near the row's left end
    const kz = (await page.locator('.wc-pl-row[data-name="khazdul"]').boundingBox())!;
    await glide(page, kz.x + 64, kz.y + kz.height * 0.5, { ms: 1000 });
    marks.mark('highlight', `beat ${BEATS.highlight}`);
    await clickOn(BEATS.select, '.wc-pl-row[data-name="khazdul"] [data-btn="SELECT"]', 'select', { ms: 700 });
    // A breath, the pointer drifts off the button so its "Selected" tag reads.
    await sleep(700);
    const row = await page.locator('.wc-pl-row[data-name="khazdul"]').boundingBox();
    if (row) await glide(page, row.x + row.width * 0.62, row.y + row.height + 150, { ms: 900 });
    // To Back round the left of the box, so no other row lights up on the way.
    const box = await page.locator('.wc-pl').first().boundingBox();
    if (box) {
      await until(T(beatS(BEATS.back)) - 1900);
      await glide(page, box.x - 50, box.y + box.height * 0.45, { ms: 900 });
    }
    await clickOn(BEATS.back, 'button[aria-label="Back (Esc)"]', 'back', { ms: 700 });
    // Enter MUME: the pointer arrives early and rests on it, the click on its beat.
    await until(T(beatS(BEATS.enter)) - 2600);
    const enter = page.locator('.wc-start .wc-sm-item[data-key="enter"] .wc-sm-label').first();
    const eb = (await enter.boundingBox())!;
    await glide(page, eb.x + eb.width * 0.4, eb.y + eb.height * 0.55, { ms: 1100 });
    await clickOn(BEATS.enter, '.wc-start .wc-sm-item[data-key="enter"] .wc-sm-label', 'enter', { ms: 250, dx: 0.45 });

    // MUME's welcome screen; the pointer goes away from the text.
    await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
    await glide(page, 1180, 700, { ms: 1200 });
    const input = page.locator('.wc-input-field');
    await input.focus();
    // The name: its Enter on beat 59.
    const name = 'Gittan';
    await until(T(beatS(BEATS.name)) - name.length * 140 - 60);
    await page.keyboard.type(name, { delay: 140 });
    await page.keyboard.press('Enter');
    // The password, masked (the server took over the echo): its Enter on beat 63. Made up; the socket goes nowhere.
    const secret = 'starlight';
    await until(T(beatS(BEATS.password)) - secret.length * 115 - 60);
    await page.keyboard.type(secret, { delay: 115 });
    await page.keyboard.press('Enter');
    await until(T(beatS(BEATS.end) + TAIL_S));
    for (const k of ['banner', 'name', 'password'] as const) {
      const t = login.at[k];
      if (t !== undefined) marks.markAt(t, k, `MUME: ${k}`);
    }
    marks.markAt(T(beatS(BEATS.end)), 'end', 'beat 67, 0:50.06');
    marks.mark('active-end', 'the take');
  },
};
