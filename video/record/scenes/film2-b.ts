// Film 2, take B (video/manuscript-2.md draft 2, acts 5-8): one continuous
// desktop take after the device act, timed by picture from its `film0`
// marker (the film cuts to it from the phone in landscape at the Prancing
// Pony's sign).
//
//   act 5  the inn: Gittan goes in from the sign, the barman offers his
//          quest and goes on talking behind the windows. Profile (the
//          caption first, the pointer slowly to the icon, its tooltip, the
//          click): `fk` → `kill wolf` on the Lite form, the Editor, Find, the
//          line held. Scripts: Almanac, Mercenaries on, its cost 20. Timers
//          dragged from floating to the left dock and back.
//   act 6  Exit; the start page at night; History: Sessions (the Bree
//          session's log player in the wolf fight), Spotlights (Rasta's PvP
//          kill of a Half-Elf in the viewer), Diary; Back. The owner row,
//          Log in, Create account with the film's fake account (the
//          password masked), the recovery code, Continue: the page reloads
//          into the account, the owner row shows it. `phone-out` /
//          `phone-in`: the film cuts to the phone take (film2-phone) between.
//   act 7  History, the Bree session's Share: the export editor, Hall of
//          Fame, the dialog with the rules, ticked, Publish, the link; Open
//          Community: the real published log, Random Runes, the warlords,
//          players online; the real log's watch page, its player a few
//          seconds.
//   act 8  Back: the start page reloads (Community over it, then the menu),
//          and the night has become sunrise (the clock moved off camera
//          while the watch page was up).
//
// Off camera the game is brought to the sign where act 4's phone left it
// (the run fast to 152.1 s), with the panes as act 3 left them (Map docked;
// Statistics, Group and Timers floating; NPCs All and the Fight card; the
// weather on at the films' clear night; khazdul). The community is the
// captured real one, served through the cloud fakes (record/lib/community.ts);
// the account is made on camera on the fakes. The take's own live run is
// removed from History after Exit, so History holds the film's runs only, as
// the phone's does.
import type { Locator, Page, WebSocketRoute } from '@playwright/test';
import { type DevWindow, type Step, play, sleep } from '../../../scripts/lib/mume-feed.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
import { type CommunityFakes, communityServer, readCapture, serveCommunity } from '../lib/community.ts';
import { CLEAR_NIGHT, FILM_FLOATS, FILM_NIGHT, FILM_PAGE, freshStart, prepareFilm } from '../lib/film-state.ts';
import { filmUi } from '../lib/film-ui.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { mockMumeLogin } from '../lib/mume-login.ts';
import { excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

const SEED = 20261119;

/** The film's own account, on the cloud fakes only (made on camera; nothing reaches a real server). */
export const FILM_ACCOUNT = { name: 'demo', password: 'starlight-over-bree' } as const;

/** Where act 4's phone leaves the run (the Prancing Pony's sign), run s. */
const SIGN = 152.1;
/** The barman's monologue begins (after `nod barman`), run s. */
const TALK = 172.6;

/** MUME's clock (game minutes) when Exit shows the start page (the same night, a little later), and at sunrise (act 8). */
export const ACT6_NIGHT = FILM_NIGHT + 35;
export const DAWN = FILM_NIGHT - 5 + 5 * 60 + 5;

/** Where Statistics floats (as film2-a leaves it). */
const STATS_FLOAT = { x: 78, y: 4, w: 32, h: 15 } as const;

/** The page's date: a minute after the community capture (its ages read as on the site). */
export const takeBPage = () => ({ ...FILM_PAGE, now: readCapture().capturedAt + 60_000 });

/** The cockpit's cell (CSS px) at 1600 × 900: 160 × 49 cells. */
const CELL = { w: 10, h: 900 / 49 } as const;

/** Sets the film's stage on a page already on the start page (prepareFilm done): the panes as act 3 leaves them. */
async function stagePanes(page: Page): Promise<void> {
  await page.evaluate(
    ({ stats, floats }) => {
      type D = {
        weather: { enabled: boolean };
        panes: Record<string, { on: boolean }>;
        profile: string;
        windows: Record<string, unknown>;
        group: { npcMode: string; fight: boolean };
        layout: { docks: { right: { lanes: { size: number; panes: { id: string }[] }[] } }; floating: { id: string; x: number; y: number; w: number; h: number }[] };
      };
      const wc = (window as unknown as { __wc: { settings: { update(fn: (d: D) => void): void } } }).__wc;
      wc.settings.update((d) => {
        d.weather.enabled = true;
        for (const p of ['map', 'group', 'timers', 'statistics']) d.panes[p]!.on = true;
        d.profile = 'khazdul';
        d.group.npcMode = 'all';
        d.group.fight = true;
        for (const l of d.layout.docks.right.lanes) l.panes = l.panes.filter((p) => p.id !== 'comm');
        d.layout.floating = [
          ...d.layout.floating.filter((f) => !['statistics', 'group', 'timers', 'comm'].includes(f.id)),
          { id: 'statistics', ...stats },
          { id: 'timers', ...floats.timers },
          { id: 'group', ...floats.group },
        ];
        // the windows a little shorter than their default, so the lower thirds sit below them (cells)
        d.windows = { ...d.windows, profile: { x: 12, y: 4, w: 142, h: 37 }, scripts: { x: 12, y: 4, w: 142, h: 37 } };
      });
    },
    { stats: STATS_FLOAT, floats: FILM_FLOATS },
  );
  await page.waitForTimeout(600);
}

/** MUME's clock on the start page set to `moment` (the film's pin; the start page reads it as it shows). */
async function setClock(page: Page, moment: number): Promise<void> {
  await page.evaluate((m) => {
    const now = Math.floor(Date.now() / 1000);
    const w = window as unknown as { __filmClockOk?: boolean };
    w.__filmClockOk = true;
    localStorage.setItem('wc.clock', JSON.stringify({ epoch: now - m, precision: 'unset', lastSync: now, reason: null }));
    w.__filmClockOk = false;
  }, moment);
}

export const film2B: Scene = {
  mode: 'intel-1.2-png',
  get page() {
    return takeBPage();
  },

  async setup(page) {
    const c = await communityServer();
    await serveCommunity(page, c);
    await prepareFilm(page);
    await stagePanes(page);
    const login = await mockMumeLogin(page);
    await freshStart(page, FILM_NIGHT, 'cloudtest');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
    await sleep(1500);
    await page.locator('.wc-input-field').focus();
    await page.keyboard.type('Gittan\n', { delay: 30 });
    await sleep(400);
    await page.keyboard.type('starlight\n', { delay: 30 });
    await sleep(500);
    const server = login.server()!;
    const a = arrival();
    server.send('out' in a.arrive ? a.arrive.out : Buffer.alloc(0));
    // The run fast to the sign, where act 4's phone left it (the pony never labelled).
    const runs = loadBackup(FILM_BACKUP);
    const before = excerptFeed(runs, { run: BREE_RUN, from: 0.5, to: SIGN, primeFrom: 0.5, dropCmds: [/^change width/, /^label pony/], rewrite: noPonyLabel });
    await play(page, server, before.steps.map(({ at: _at, ...s }) => s as Step));
    await page.locator('.wc-input-field').fill('');
    await page.locator('.wc-pane-map .wc-pane-content[data-map-state="loaded"]').waitFor({ timeout: 30_000 }).catch(() => console.warn('  the map did not load'));
    await page.evaluate(async (pin) => {
      const w = window as unknown as DevWindow;
      await w.__wc!.weather();
      w.__weather!.jump(pin);
    }, CLEAR_NIGHT);
    // The Profile window's first open costs a long frame (ADR 0133 round 1): once off camera.
    await page.locator('.wc-mb[data-mb="profile"]').click();
    await page.locator('.wc-win[data-win="profile"]').waitFor();
    await sleep(800);
    await page.keyboard.press('Escape');
    await sleep(400);
    await page.locator('.wc-input-field').focus();
    // the inn at 1.6× (the barman looks up, offers, Gittan nods); his monologue at the game's tempo
    const inn = excerptFeed(runs, { run: BREE_RUN, from: SIGN, to: TALK, primeFrom: SIGN, speed: 2.2, maxGap: 2, rewrite: noPonyLabel });
    const talk = excerptFeed(runs, { run: BREE_RUN, from: TALK, to: 258, primeFrom: TALK, speed: 1, rewrite: noPonyLabel });
    await page.mouse.move(1500, 860);
    await sleep(2500);
    if (!(await page.locator('.wc-pane-timers').isVisible())) console.warn('  the Timers pane is not shown');
    return { c, server, inn: inn.steps, talk: talk.steps };
  },

  async run({ page, marks }, state) {
    const server = state.server as WebSocketRoute;
    const c = state.c as CommunityFakes;
    marks.mark('active', 'the take');
    const film0 = Date.now() + 800;
    marks.markAt(film0, 'film0', 'act 5');
    const T = (s: number): number => film0 + s * 1000;
    const nowS = (): number => (Date.now() - film0) / 1000;
    const until = async (ms: number): Promise<void> => {
      const w = ms - Date.now();
      if (w > 0) await sleep(w);
    };
    const pointer = new Pointer(page, SEED, { x: 1500, y: 860 });
    const u = filmUi(page, pointer, marks);
    const { mb } = u;
    const rnd = seeded(SEED + 1);
    const type = async (text: string, lo = 70, hi = 150): Promise<void> => {
      for (const ch of text) {
        await page.keyboard.type(ch);
        await sleep(lo + rnd() * (hi - lo));
      }
    };
    /** The pointer onto `el`, a rest of `wait` s so the eye finds it, the press `wait` s after it arrives; from `after` s (film) at the earliest. */
    const calm = async (el: Locator, kind: string, label: string, wait = 1.5, after = nowS()): Promise<number> => {
      const at = Math.max(after, nowS()) + 0.9 + wait;
      await pointer.hoverAt(el, T(at - wait));
      const t = await pointer.pressAt(T(at));
      marks.markAt(t, kind, label);
      return (t - film0) / 1000;
    };
    /** A menu-bar icon: the pointer slowly to it, its tooltip shows, held at least a second, the click. */
    const iconClick = async (id: string, arrive: number, kind: string): Promise<void> => {
      await pointer.hoverAt(mb(id), T(arrive), { slow: true });
      await page.locator('.wc-mb-tip').waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
      marks.mark('tooltip', id);
      marks.markAt(await pointer.pressAt(Math.max(T(arrive + 1.3), Date.now() + 1000)), kind, id);
    };
    const frame = (): Locator => page.locator('.wc-start .wc-frame:not([hidden])');
    const menu = (key: string): Locator => page.locator(`.wc-start .wc-sm-item[data-key="${key}"] .wc-sm-label`).first();
    const backBtn = (): Locator => frame().locator('.wc-lk-back').first();

    // ---------------------------------------------------------------- act 5: the game behind
    const game = (async () => {
      await until(T(0.3));
      marks.mark('segment', 'inn');
      await play(page, server, state.inn as Step[], { typeDelay: 85, onStep: (s) => ('cmd' in s ? marks.mark('cmd', s.cmd) : undefined) });
      marks.mark('segment', 'monologue');
      await play(page, server, state.talk as Step[]);
    })();
    // (the game is left at Exit; its steps then go nowhere)
    void game.catch(() => {});

    // Profile: the caption, the icon, the Lite form, the Editor with Find
    marks.markAt(T(6.8), 'profile-caption', 'the Profile caption');
    await iconClick('profile', 10.2, 'profile');
    const pe = page.locator('.wc-win[data-win="profile"] .wc-frame:not([hidden]) .wc-pe');
    await calm(pe.locator('.wc-pe-rit[data-rail="alias"]'), 'alias-rail', 'Aliases', 1.0);
    await calm(pe.locator('[data-btn="NEW"]'), 'alias-new', 'New entry', 1.0);
    await sleep(350);
    await type('fk');
    await sleep(250);
    await page.keyboard.press('Tab');
    await sleep(200);
    await type('kill wolf');
    await sleep(500);
    await page.keyboard.press('Escape');
    marks.mark('alias', 'fk → kill wolf');
    await calm(pe.locator('.wc-pe-views [data-opt="editor"]'), 'editor', 'the Editor view', 1.2);
    await sleep(700);
    // the new line in view: khazdul is long, so the editor's Find goes to it
    if (!(await pe.locator('.cm-line', { hasText: '#alias {fk} {kill wolf}' }).count())) {
      await page.keyboard.press('Control+f');
      await sleep(400);
      const find = pe.locator('[data-field="find"] input').first();
      await find.focus().catch(() => console.warn('  no Find field'));
      await type('{fk}');
      await page.keyboard.press('Enter');
      if ((await find.inputValue().catch(() => '')) !== '{fk}') console.warn('  Find did not take the typing');
      marks.mark('find', 'Find {fk}');
    }
    // the found line held about three seconds
    await sleep(2800);
    const x = page.locator('.wc-win[data-win="profile"] .wc-win-x');
    if (await x.count()) await calm(x.first(), 'profile-closed', 'the Profile window closes', 0.5);
    else {
      await page.keyboard.press('Escape');
      marks.mark('profile-closed', 'the Profile window closes');
    }

    // Scripts: Almanac briefly, then Mercenaries: on, its cost 20 silver
    await sleep(300);
    marks.mark('scripts-caption', 'the Scripts caption');
    await iconClick('scripts', nowS() + 2.4, 'scripts');
    const sw = page.locator('.wc-win[data-win="scripts"]');
    await calm(sw.locator('.wc-scr-row[data-name="almanac"] .wc-scr-name').first(), 'script', 'almanac', 1.0);
    await sleep(700);
    await calm(sw.locator('.wc-scr-row[data-name="mercenaries"] .wc-scr-name').first(), 'script', 'mercenaries', 1.0);
    await sleep(1200);
    await calm(sw.locator('.wc-scr-row[data-name="mercenaries"] .wc-lk-toggle').first(), 'merc-on', 'Mercenaries on', 1.5);
    // its cost: a choice of 10 or 20 silver (the script offers only these two)
    await calm(sw.locator('[aria-label="cost"] [data-opt="1"]').first(), 'merc-cost', 'cost 20 silver', 1.5);
    await sleep(1000);
    const sx = page.locator('.wc-win[data-win="scripts"] .wc-win-x');
    if (await sx.count()) await calm(sx.first(), 'scripts-closed', 'the Scripts window closes', 0.5);
    else {
      await page.keyboard.press('Escape');
      marks.mark('scripts-closed', 'the Scripts window closes');
    }
    // (one take kept the window open after the X: Escape, then the X once more)
    const swin = page.locator('.wc-win[data-win="scripts"]');
    const shut = (): Promise<boolean> => swin.waitFor({ state: 'hidden', timeout: 1200 }).then(() => true, () => false);
    if (!(await shut())) {
      console.warn('  the Scripts window stays open: Escape');
      await page.keyboard.press('Escape');
      if (!(await shut())) {
        await calm(sx.first(), 'scripts-closed-2', 'the Scripts window closes', 0.3);
        if (!(await shut())) console.warn('  the Scripts window stays open');
      }
    }

    // Timers from floating to the left dock, and back (the panes move freely)
    const grip = async (): Promise<{ x: number; y: number }> => {
      const b = (await page.locator('.wc-pane-timers').boundingBox())!;
      return { x: b.x + 6 * CELL.w, y: b.y + CELL.h / 2 };
    };
    const g1 = await grip();
    await pointer.hoverPoint(g1.x, g1.y, T(nowS() + 1.6));
    marks.mark('drag', 'Timers grabbed');
    await page.locator('.wc-drop-bar').waitFor({ state: 'hidden', timeout: 100 }).catch(() => {});
    marks.markAt(await pointer.dragTo(4, 430, Date.now() + 700, { ms: 1300, holdMs: 600 }), 'docked', 'Timers docked left');
    await sleep(700);
    const docked = await page.evaluate(() => (window as unknown as { __wc: { settings: { get(): { layout: { docks: { left: { lanes: { panes: { id: string }[] }[] } } } } } } }).__wc.settings.get().layout.docks.left.lanes.flatMap((l) => l.panes.map((p) => p.id)));
    if (!docked.includes('timers')) console.warn(`  Timers did not dock left (left dock: ${docked.join(', ') || 'empty'})`);
    await sleep(1300);
    const g2 = await grip();
    await pointer.hoverPoint(g2.x, g2.y, T(nowS() + 1.2));
    // back out to float: a docked pane floats at the standard size (36 × 14 cells), so it is dropped
    // with its top at row 34, left of the map's lane and clear of the menu bar (row 48)
    marks.markAt(await pointer.dragTo(80 * CELL.w + 5, 34 * CELL.h + CELL.h / 2, Date.now() + 600, { ms: 1300, holdMs: 400 }), 'floated', 'Timers floats again');
    await sleep(500);
    const fl = await page.evaluate(() => (window as unknown as { __wc: { settings: { get(): { layout: { floating: { id: string; x: number; y: number }[] } } } } }).__wc.settings.get().layout.floating.find((f) => f.id === 'timers'));
    if (!fl) console.warn('  Timers does not float again');
    else if (fl.y + 14 > 48) console.warn(`  Timers floats at ${fl.x}, ${fl.y}: over the menu bar`);
    await sleep(600);

    // ---------------------------------------------------------------- act 6: memory and the account
    // the start page shows the same night a little later (the game's clock is the film's)
    await setClock(page, ACT6_NIGHT);
    await iconClick('exit', nowS() + 2.2, 'exit-icon');
    marks.markAt(await pointer.clickAt(page.locator('.wc-pop-exit [data-act="exit"]'), Date.now() + 1100, { quick: true }), 'exit', 'Exit');
    await page.locator('.wc-start').waitFor();
    // The take's own live run out of History: only the film's runs, as on the phone.
    await sleep(1200);
    const removed = await page.evaluate(async () => {
      type S = { id: string; saved: boolean };
      const lib = (await (window as unknown as { __wc: { runs(): Promise<{ listSessions(n: number): Promise<S[]>; remove(s: S): Promise<void> }> } }).__wc.runs());
      const all = await lib.listSessions(Date.now() * 1000);
      const live = all.filter((s) => !s.saved);
      for (const s of live) await lib.remove(s);
      return live.map((s) => s.id);
    });
    if (removed.length !== 1) console.warn(`  removed ${removed.length} live session(s): ${removed.join(', ')}`);
    await pointer.moveTo(1180, 640);

    // History: Sessions with the Bree session's log player in the wolf fight
    marks.markAt(await pointer.clickAt(menu('history'), Date.now() + 2200), 'history', 'History');
    const hist = frame().locator('.wc-hist');
    await hist.locator('.wc-lk-tr').first().waitFor();
    const bree = hist.locator('.wc-lk-tr', { hasText: '12:07' }).first();
    await calm(bree, 'bree-row', 'the Bree session', 0.8);
    await calm(hist.locator('.wc-lk-btn[data-btn="RUN LOG"]'), 'runlog', 'the log player', 1.2);
    const engine = 'window.__wc.shell.playerHost.engine';
    await page.waitForFunction(`window.__wc.shell.playerHost?.engine?.duration > 0`, undefined, { timeout: 15_000 });
    await page.evaluate(() => {
      type Lane = { size: number };
      const h = (window as unknown as { __wc: { shell: { playerHost: { app: { settings: { get(): { layout: { docks: { right: { lanes: Lane[] } } } } } }; setViewer(o: unknown): void; viewerOverrides: Record<string, unknown> } } } }).__wc.shell.playerHost;
      const layout = JSON.parse(JSON.stringify(h.app.settings.get().layout)) as { docks: { right: { lanes: Lane[] } } };
      const lanes = layout.docks.right.lanes;
      if (lanes.length) {
        const w = Math.round((lanes.reduce((a, l) => a + l.size, 0) / lanes.length) * 0.8);
        for (const l of lanes) l.size = w;
      }
      h.setViewer({ ...h.viewerOverrides, font: 'small', layout });
    });
    // into the second wolf's fight (run 118 s), and play
    await page.evaluate(`${engine}.seek(118e6)`).catch(() => {});
    marks.mark('player', 'the wolf fight plays');
    await sleep(5500);
    await page.keyboard.press('Escape');
    marks.mark('player-closed', 'back to Sessions');
    await sleep(700);

    // Spotlights: the wall, Rasta's PvP kill of *a Half-Elf* in the viewer, Back
    await calm(frame().locator('.wc-htab[data-tab="spotlights"]'), 'tab', 'spotlights', 1.2);
    const wall = frame().locator('.wc-spw');
    await wall.locator('.wc-spw-card').first().waitFor();
    const rasta = wall.locator('.wc-spw-card', { hasText: 'Half-Elf' }).first();
    // a double click opens a card in the viewer (the wall's `activateOn: 'dblclick'`)
    await pointer.hoverAt(rasta, Date.now() + 2400);
    await sleep(1100);
    await page.mouse.down({ clickCount: 1 });
    await page.mouse.up({ clickCount: 1 });
    await sleep(110);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    marks.mark('rasta', 'the Half-Elf spotlight');
    await page.locator('.wc-start .wc-spv-count').first().waitFor({ timeout: 8000 }).catch(() => console.warn('  no spotlight viewer'));
    await sleep(8000);
    const back1 = page.locator('.wc-start button[aria-label="Back (Esc)"]').first();
    if (await back1.isVisible()) await calm(back1, 'back-wall', 'Back to the wall', 0.6);
    else {
      await page.keyboard.press('Escape');
      marks.mark('back-wall', 'Back to the wall');
    }
    await sleep(600);
    // Diary, held
    await calm(frame().locator('.wc-htab[data-tab="diary"]'), 'tab', 'diary', 1.2);
    await sleep(2200);
    await calm(backBtn(), 'history-closed', 'back on the start page', 0.8);
    await sleep(500);

    // The owner row: Log in, Create account with the film's account; the password masked
    await calm(page.locator('.wc-start .wc-sm-item[data-key="owner"]').first(), 'owner', 'Guest · log in', 1.0);
    await frame().locator('[data-page="login"]').waitFor();
    await calm(frame().locator('[data-link="create"]'), 'create', 'Create account', 1.0);
    await frame().locator('[data-page="create"]').waitFor();
    const field = (id: string): Locator => frame().locator(`[data-field="${id}"] input`);
    await sleep(1400);
    await field('name').focus();
    marks.mark('typing', 'the account name');
    await type(FILM_ACCOUNT.name, 110, 200);
    await sleep(400);
    await page.keyboard.press('Tab');
    await sleep(300);
    // (not the user's MUME password, and a made-up one: the fake server checks it, nothing else sees it)
    await type(FILM_ACCOUNT.password, 45, 90);
    await sleep(300);
    await page.keyboard.press('Tab');
    await sleep(300);
    await type(FILM_ACCOUNT.password, 45, 90);
    for (const [id, v] of [['name', FILM_ACCOUNT.name], ['password', FILM_ACCOUNT.password], ['again', FILM_ACCOUNT.password]] as const) {
      if ((await field(id).inputValue()) !== v) {
        console.warn(`  the ${id} field did not take the typing: filled`);
        await field(id).fill(v);
      }
    }
    if ((await field('password').getAttribute('type')) !== 'password') console.warn('  the password is not masked');
    const create = frame().locator('[data-btn="CREATE"]');
    await page.waitForFunction(() => document.querySelector('.wc-start .wc-frame:not([hidden]) [data-btn="CREATE"]')?.getAttribute('aria-disabled') !== 'true', null, { timeout: 8000 }).catch(() => console.warn('  Create account stays off'));
    await calm(create, 'create-press', 'Create account', 1.4);
    await frame().locator('[data-page="code"]').waitFor({ timeout: 15_000 });
    marks.mark('code', 'the recovery code');
    await sleep(1800);
    const code = (await frame().locator('.wc-ac-code-p > span').allTextContents()).join('-');
    await field('last').focus();
    await type(code.slice(-4), 120, 200);
    await calm(frame().locator('[data-btn="CONTINUE"]'), 'continue', 'Continue', 1.0);
    // the page reloads into the account's space; the owner row names it
    await page.waitForLoadState('load');
    await page.locator('.wc-start .wc-sm-item[data-key="owner"]', { hasText: FILM_ACCOUNT.name }).waitFor({ timeout: 20_000 }).catch(() => console.warn('  the owner row does not name the account'));
    marks.mark('owner-in', 'the owner row names the account');
    await sleep(2200);
    marks.mark('phone-out', 'the film cuts to the phone');
    await sleep(1000);
    marks.mark('phone-in', 'back on the desktop');

    // ---------------------------------------------------------------- act 7: community
    await calm(menu('history'), 'history2', 'History', 0.8);
    const hist2 = frame().locator('.wc-hist');
    await hist2.locator('.wc-lk-tr').first().waitFor();
    await calm(hist2.locator('.wc-lk-tr', { hasText: '12:07' }).first(), 'bree-row', 'the Bree session', 0.8);
    await calm(hist2.locator('[data-btn="EXPORT"]'), 'share', 'Share', 1.2);
    await frame().locator('.wc-exp-row').first().waitFor();
    await sleep(600);
    await calm(frame().locator('.wc-exp-outs [data-opt="HOF"]'), 'hof', 'Hall of Fame', 1.4);
    await calm(frame().locator('.wc-exp [data-btn="EXPORT"]'), 'share-dialog', 'the share dialog', 1.0);
    const dlg = frame().locator('[data-dlg="share"]');
    await dlg.waitFor();
    await sleep(2000);
    await calm(dlg.locator('[data-field="rules"]'), 'rules', 'the rules ticked', 1.2);
    await calm(frame().locator('[data-btn="PUBLISH"]'), 'publish', 'Publish', 1.0);
    const done = frame().locator('[data-dlg="share-done"]');
    await done.waitFor({ timeout: 20_000 });
    // the dev server's address in the link reads as the site's (the film shows mumecockpit.com)
    await page.evaluate(() => {
      const i = document.querySelector<HTMLInputElement>('.wc-start [data-dlg="share-done"] [data-field="link"] input');
      if (i) i.value = i.value.replace(/^https?:\/\/[^/]+/, 'https://mumecockpit.com');
    });
    marks.mark('published', 'the link');
    await sleep(2200);
    await calm(frame().locator('[data-btn="COMMUNITY"]'), 'community', 'Open Community', 1.0);
    const cy = frame().locator('.wc-cy');
    await cy.locator('.wc-cy-row').first().waitFor({ timeout: 15_000 });
    await cy.locator('.wc-cy-note').first().waitFor({ timeout: 10_000 }).catch(() => console.warn('  no Random Runes notes'));
    await cy.locator('[data-box="players"]').waitFor({ timeout: 10_000 }).catch(() => console.warn('  no players online'));
    marks.mark('community-up', 'the Community page');
    await pointer.moveTo(1240, 520);
    await sleep(3800);
    // the real log's watch page (no stars or comments yet at the capture: a few seconds of its player)
    const real = c.runs[0]!;
    await calm(cy.locator('.wc-cy-row', { hasText: real.title }).first(), 'watch', real.title, 1.5);
    await page.waitForURL(`**/r/${real.id}**`, { timeout: 15_000 });
    await page.locator('.wc-watch-page[data-watch="playing"]').waitFor({ timeout: 30_000 });
    const fl2 = page.frameLocator('.wc-watch-slot iframe');
    await fl2.locator('.wc-player').waitFor({ timeout: 30_000 });
    marks.mark('watch-up', 'the watch page');
    await sleep(1200);
    await calm(fl2.locator('button.wc-pc-play').first(), 'watch-play', 'Play', 1.2);
    await sleep(500);
    // into the battle
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await sleep(90);
    }
    await sleep(4500);

    // ---------------------------------------------------------------- act 8: dawn
    // while the watch page is up, MUME's clock is moved on to sunrise: the start page reads it as it loads
    await setClock(page, DAWN);
    await calm(page.locator('.wc-watch-page .wc-lk-back'), 'watch-back', 'Back', 1.0);
    await page.waitForURL('**/?community**', { timeout: 15_000 });
    await frame().locator('.wc-cy').waitFor({ timeout: 15_000 });
    marks.mark('dawn', 'the start page at sunrise');
    await sleep(1700);
    await calm(backBtn(), 'community-back', 'Back to the start page', 0.8);
    marks.mark('start-again', 'the start page');
    // the hand leaves the mouse, low on the right
    await sleep(700);
    await pointer.moveTo(1580, 880);
    // the quote fades as the end card comes in (Film2's CARD_DELAY_S after `start-again`)
    await sleep(500);
    await page.addStyleTag({ content: '.wc-start .wc-sm-quote { transition: opacity 0.8s ease !important; opacity: 0 !important; }' });
    marks.mark('quote-hidden', 'the quote fades for the end card');
    await sleep(13_000);
    marks.mark('active-end', 'the take');
  },
};
