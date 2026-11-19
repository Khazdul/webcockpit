// Film 2, take B (video/manuscript-2.md draft 3, acts 5-8): one continuous
// desktop take after the device act, timed by picture from its `film0`
// marker. The device act's camera comes back to the monitor on this take's
// last seconds before `film0` (the Prancing Pony's sign, still) and fills
// the frame on `film0`, so the film goes on in it without a cut.
//
//   act 5  the inn: Gittan goes in from the sign, the barman offers his
//          quest and goes on talking behind the windows. Profile (the
//          caption first, the pointer slowly to the icon, its tooltip, the
//          click): `fk` → `kill wolf` on the Lite form, the Editor, Find, the
//          line held. Scripts: Almanac, Mercenaries on (its pane shows Tod:
//          staged), then in its settings the cost 20 and autopay on (owner
//          round 2, item 6).
//   act 6  Exit; the start page at night; History: Sessions (the Bree
//          session's log player in the wolf fight), Spotlights (Rasta's PvP
//          kill of a Half-Elf in the viewer); Back. The owner row, Log in
//          (cut out of the film), Create account with the film's fake
//          account (the password masked), the recovery code, Continue: the
//          page reloads into the account, the owner row shows it.
//   act 7  History, the Bree session's Share: the export editor, a few lines
//          selected and excluded, a comment added (owner round 2, item 8);
//          Hall of Fame, the dialog with the rules, ticked, Publish, the
//          link; Open Community: the real published log, Random Runes, the
//          warlords, players online; the real log's watch page (a frame on
//          the start surface since 0.21: the morph, no page load), its
//          player a few seconds; Back (the morph back to Community).
//   act 8  Back to the start page at night (`night`); off the film the start
//          page is loaded again with MUME's clock at sunrise (`dawn`): the
//          film dissolves from the one to the other.
//
// Off camera the game is brought to the sign where act 4's phone left it
// (the run fast to 152.1 s), with the panes as act 3 left them (Map docked,
// Group docked above it, borderless and clear; Timers floating; NPCs All
// and the Fight card; the weather on at the films' clear night; khazdul).
// The community is the captured real one, served through the cloud fakes
// (record/lib/community.ts); the account is made on camera on the fakes.
// The take's own live run is removed from History after Exit, so History
// holds the film's runs only.
import type { Locator, Page, WebSocketRoute } from '@playwright/test';
import { type DevWindow, type Step, play, sleep, startMenu } from '../../../scripts/lib/mume-feed.ts';
import { arrival } from '../../feeds/arrival.ts';
import { BREE_RUN, FILM_BACKUP, noPonyLabel } from '../../feeds/film.ts';
import { type CommunityFakes, communityServer, readCapture, serveCommunity } from '../lib/community.ts';
import { CLEAR_NIGHT, FILM_FLOATS, FILM_NIGHT, FILM_PAGE, FILM_SKY, dockGroup, freshStart, prepareFilm } from '../lib/film-state.ts';
import { filmUi } from '../lib/film-ui.ts';
import { Pointer, seeded } from '../lib/mouse.ts';
import { mockMumeLogin } from '../lib/mume-login.ts';
import { excerptFeed, loadBackup } from '../lib/run-feed.ts';
import type { Scene } from '../lib/scene.ts';

const SEED = 20261119;

/** The film's own account, on the cloud fakes only (made on camera; nothing reaches a real server). */
export const FILM_ACCOUNT = { name: 'demo', password: 'starlight-over-bree' } as const;

/** The export editor's lines dragged over and excluded (the pony led and grouped, at the top of the log), and the row (from the top) the comment goes before (owner round 2, item 8). */
const EXCLUDE_FROM = 'lead pony';
const EXCLUDE_TO = 'is now a group member';
const COMMENT_ROW = 1;
/** The comment: plain, the film's own, about this run. */
const FILM_COMMENT = 'Two wolves on the way out of Bree.';

/** Where act 4's phone leaves the run (the Prancing Pony's sign), run s. */
const SIGN = 152.1;
/** The barman's monologue begins (after `nod barman`), run s. */
const TALK = 172.6;

/** MUME's clock (game minutes) when Exit shows the start page (the same night, a little later), and at sunrise (act 8). */
export const ACT6_NIGHT = FILM_NIGHT + 35;
export const DAWN = FILM_NIGHT - 5 + 5 * 60 + 5;

/** The page's date: a minute after the community capture (its ages read as on the site). */
export const takeBPage = () => ({ ...FILM_PAGE, now: readCapture().capturedAt + 60_000 });

/** The cockpit's cell (CSS px) at 1600 × 900: 160 × 49 cells. */
const CELL = { w: 10, h: 900 / 49 } as const;

/** Sets the film's stage on a page already on the start page (prepareFilm done): the panes as act 3 leaves them. */
async function stagePanes(page: Page): Promise<void> {
  await page.evaluate(
    ({ floats }) => {
      type D = {
        weather: { enabled: boolean };
        panes: Record<string, { on: boolean }>;
        profile: string;
        windows: Record<string, unknown>;
        group: { npcMode: string; fight: boolean };
        timers: { timeText: boolean };
        layout: { docks: { right: { lanes: { size: number; panes: { id: string }[] }[] } }; floating: { id: string; x: number; y: number; w: number; h: number }[] };
      };
      const wc = (window as unknown as { __wc: { settings: { update(fn: (d: D) => void): void } } }).__wc;
      wc.settings.update((d) => {
        d.weather.enabled = true;
        // no Statistics since owner round 2 (item 3)
        for (const p of ['map', 'group', 'timers']) d.panes[p]!.on = true;
        d.panes.statistics!.on = false;
        d.profile = 'khazdul';
        d.group.npcMode = 'all';
        d.group.fight = true;
        d.timers.timeText = false;
        for (const l of d.layout.docks.right.lanes) l.panes = l.panes.filter((p) => p.id !== 'comm');
        d.layout.floating = [
          ...d.layout.floating.filter((f) => !['statistics', 'group', 'timers', 'comm'].includes(f.id)),
          { id: 'timers', ...floats.timers },
        ];
        // the windows a little shorter than their default, so the lower thirds sit below them (cells)
        d.windows = { ...d.windows, profile: { x: 12, y: 4, w: 142, h: 37 }, scripts: { x: 12, y: 4, w: 142, h: 37 } };
      });
    },
    { floats: FILM_FLOATS },
  );
  // Group docked above the map, borderless and clear, as act 2 leaves it (owner round 1, item 5)
  await dockGroup(page);
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
    const inn = excerptFeed(runs, { run: BREE_RUN, from: SIGN, to: TALK, primeFrom: SIGN, speed: 3, maxGap: 1.2, rewrite: noPonyLabel });
    const talk = excerptFeed(runs, { run: BREE_RUN, from: TALK, to: 258, primeFrom: TALK, speed: 1, rewrite: noPonyLabel });
    // Staged (owner round 1, item 7): Mercenaries reads its contracts as if it had been on at the hire,
    // so Tod shows in its pane once it is switched on (its store: Tod's contract, hired at run 71 s)
    await page.evaluate(() => {
      const lib = (window as unknown as { __wc: { shell: { scripts: { storeSet(n: string, k: string, v: unknown): void; flush(): Promise<void> } } } }).__wc.shell.scripts;
      const ends = Math.floor(Date.now() / 1000) + 25 * 60 - 150;
      lib.storeSet('mercenaries', 'mercs', [{ name: 'Tod', ends, state: 'active', paid: 10, warned: false }]);
      return lib.flush();
    });
    await page.mouse.move(1500, 860);
    await sleep(2500);
    if (!(await page.locator('.wc-pane-timers').isVisible())) console.warn('  the Timers pane is not shown');
    return { c, server, inn: inn.steps, talk: talk.steps };
  },

  async run({ page, marks }, state) {
    const server = state.server as WebSocketRoute;
    const c = state.c as CommunityFakes;
    marks.mark('active', 'the take');
    // the device act's camera comes back to the monitor on the take's last 3.6 s before film0: a still sign
    const film0 = Date.now() + 4500;
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
    marks.markAt(T(2.4), 'profile-caption', 'the Profile caption');
    await iconClick('profile', 5.8, 'profile');
    const pe = page.locator('.wc-win[data-win="profile"] .wc-frame:not([hidden]) .wc-pe');
    await calm(pe.locator('.wc-pe-rit[data-rail="alias"]'), 'alias-rail', 'Aliases', 0.8);
    await calm(pe.locator('[data-btn="NEW"]'), 'alias-new', 'New entry', 0.8);
    await sleep(350);
    await type('fk');
    await sleep(250);
    await page.keyboard.press('Tab');
    await sleep(200);
    await type('kill wolf');
    await sleep(500);
    await page.keyboard.press('Escape');
    marks.mark('alias', 'fk → kill wolf');
    await calm(pe.locator('.wc-pe-views [data-opt="editor"]'), 'editor', 'the Editor view', 1.0);
    await sleep(600);
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
    // the found line held about a second and a half
    await sleep(1500);
    const x = page.locator('.wc-win[data-win="profile"] .wc-win-x');
    if (await x.count()) await calm(x.first(), 'profile-closed', 'the Profile window closes', 0.5);
    else {
      await page.keyboard.press('Escape');
      marks.mark('profile-closed', 'the Profile window closes');
    }

    // Scripts: Almanac briefly, then Mercenaries switched on: its pane shows Tod (staged, see setup)
    await sleep(300);
    marks.mark('scripts-caption', 'the Scripts caption');
    await iconClick('scripts', nowS() + 1.8, 'scripts');
    const sw = page.locator('.wc-win[data-win="scripts"]');
    await calm(sw.locator('.wc-scr-row[data-name="almanac"] .wc-scr-name').first(), 'script', 'almanac', 0.6);
    await sleep(200);
    await calm(sw.locator('.wc-scr-row[data-name="mercenaries"] .wc-scr-name').first(), 'script', 'mercenaries', 0.8);
    await sleep(400);
    await calm(sw.locator('.wc-scr-row[data-name="mercenaries"] .wc-lk-toggle').first(), 'merc-on', 'Mercenaries on', 2.0);
    // its own settings (owner round 2, item 6): the cost 20 silver (paid as 1 gold), then autopay on; about 2 s on each before the click
    const set = (name: string): Locator => sw.locator(`.wc-scr-set[data-set="${name}"]`).first();
    await set('cost').waitFor({ timeout: 3000 }).catch(() => console.warn('  no cost setting in Scripts'));
    await calm(set('cost').locator('.wc-lk-opt[data-opt="1"]').first(), 'merc-cost', 'cost 20 silver', 2.0);
    await sleep(300);
    await calm(set('autopay').locator('.wc-lk-toggle').first(), 'merc-autopay', 'autopay on', 2.0);
    await sleep(300);
    const merc = await page.evaluate(() => {
      const el = (n: string) => document.querySelector(`.wc-win[data-win="scripts"] .wc-scr-set[data-set="${n}"]`);
      return { cost: el('cost')?.querySelector('.wc-lk-opt.is-on')?.textContent ?? '?', autopay: el('autopay')?.querySelector('.wc-lk-toggle')?.getAttribute('aria-checked') ?? '?' };
    });
    if (merc.autopay !== 'true' || !/20/.test(merc.cost)) console.warn(`  the Mercenaries settings: cost ${merc.cost}, autopay ${merc.autopay}`);
    await sleep(900);
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

    // The Mercenaries pane: Tod's contract (staged), the cost the setting gave it
    const mp = page.locator('.wc-pane[data-pane="mercenaries/main"]');
    await mp.waitFor({ state: 'visible', timeout: 3000 }).catch(() => console.warn('  no Mercenaries pane'));
    const rows = mp.locator('.wc-pane-content .wc-prow');
    const tod = await rows.nth(1).textContent().catch(() => '');
    if (!/Tod/.test(tod ?? '')) console.warn(`  the Mercenaries pane does not show Tod: "${tod}"`);
    const head = (await rows.nth(0).textContent().catch(() => '')) ?? '';
    if (!head.includes('[1g]')) console.warn(`  the pane's cost is not 1 gold: "${head}"`);
    await sleep(700);

    // ---------------------------------------------------------------- act 6: memory and the account
    // the start page shows the same night a little later (the game's clock is the film's)
    await setClock(page, ACT6_NIGHT);
    // (a plain click: the icon's tooltip was seen at Profile and Scripts)
    marks.markAt(await pointer.clickAt(mb('exit'), Date.now() + 1300), 'exit-icon', 'exit');
    marks.markAt(await pointer.clickAt(page.locator('.wc-pop-exit [data-act="exit"]'), Date.now() + 900, { quick: true }), 'exit', 'Exit');
    await page.locator('.wc-start').waitFor();
    // The take's own live run out of History: only the film's runs.
    await sleep(800);
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
    marks.markAt(await pointer.clickAt(menu('history'), Date.now() + 1700), 'history', 'History');
    const hist = frame().locator('.wc-hist');
    await hist.locator('.wc-lk-tr').first().waitFor();
    const bree = hist.locator('.wc-lk-tr', { hasText: '12:07' }).first();
    await calm(bree, 'bree-row', 'the Bree session', 0.8);
    await calm(hist.locator('.wc-lk-btn[data-btn="RUN LOG"]'), 'runlog', 'the log player', 1.0);
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
    await sleep(3600);
    await page.keyboard.press('Escape');
    marks.mark('player-closed', 'back to Sessions');
    await sleep(500);

    // Spotlights: the wall, Rasta's PvP kill of *a Half-Elf* in the viewer, Back
    await calm(frame().locator('.wc-htab[data-tab="spotlights"]'), 'tab', 'spotlights', 1.0);
    const wall = frame().locator('.wc-spw');
    await wall.locator('.wc-spw-card').first().waitFor();
    const rasta = wall.locator('.wc-spw-card', { hasText: 'Half-Elf' }).first();
    // a double click opens a card in the viewer (the wall's `activateOn: 'dblclick'`)
    await pointer.hoverAt(rasta, Date.now() + 1900);
    await sleep(900);
    await page.mouse.down({ clickCount: 1 });
    await page.mouse.up({ clickCount: 1 });
    await sleep(110);
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    marks.mark('rasta', 'the Half-Elf spotlight');
    await page.locator('.wc-start .wc-spv-count').first().waitFor({ timeout: 8000 }).catch(() => console.warn('  no spotlight viewer'));
    await sleep(10_000);
    const back1 = page.locator('.wc-start button[aria-label="Back (Esc)"]').first();
    if (await back1.isVisible()) await calm(back1, 'back-wall', 'Back to the wall', 0.6);
    else {
      await page.keyboard.press('Escape');
      marks.mark('back-wall', 'Back to the wall');
    }
    await sleep(400);
    await calm(backBtn(), 'history-closed', 'back on the start page', 0.8);
    await sleep(300);

    // The owner row: Log in, Create account with the film's account; the password masked
    await calm(page.locator('.wc-start .wc-sm-item[data-key="owner"]').first(), 'owner', 'Guest · log in', 1.0);
    await frame().locator('[data-page="login"]').waitFor();
    // the Log in page is cut out of the film (owner round 1): from the owner row's press to Create account
    marks.markAt(await pointer.clickAt(frame().locator('[data-link="create"]'), Date.now() + 700, { quick: true }), 'create', 'Create account');
    await frame().locator('[data-page="create"]').waitFor();
    await sleep(500);
    marks.mark('create-up', 'the Create account page');
    const field = (id: string): Locator => frame().locator(`[data-field="${id}"] input`);
    await sleep(400);
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
    await calm(create, 'create-press', 'Create account', 1.0);
    await frame().locator('[data-page="code"]').waitFor({ timeout: 15_000 });
    marks.mark('code', 'the recovery code');
    await sleep(600);
    const code = (await frame().locator('.wc-ac-code-p > span').allTextContents()).join('-');
    await field('last').focus();
    await type(code.slice(-4), 120, 200);
    await calm(frame().locator('[data-btn="CONTINUE"]'), 'continue', 'Continue', 0.8);
    // the page reloads into the account's space; the owner row names it
    await page.waitForLoadState('load');
    await page.locator('.wc-start .wc-sm-item[data-key="owner"]', { hasText: FILM_ACCOUNT.name }).waitFor({ timeout: 20_000 }).catch(() => console.warn('  the owner row does not name the account'));
    marks.mark('owner-in', 'the owner row names the account');
    await sleep(1000);

    // ---------------------------------------------------------------- act 7: community
    await calm(menu('history'), 'history2', 'History', 0.6);
    const hist2 = frame().locator('.wc-hist');
    await hist2.locator('.wc-lk-tr').first().waitFor();
    // the Bree session is the first row, chosen as History opens
    if (!/12:07/.test((await hist2.locator('.wc-lk-tr.is-on').first().textContent().catch(() => '')) ?? '')) {
      console.warn('  the Bree session is not the chosen row: pressed');
      await calm(hist2.locator('.wc-lk-tr', { hasText: '12:07' }).first(), 'bree-row', 'the Bree session', 0.6);
    }
    await calm(hist2.locator('[data-btn="EXPORT"]'), 'share', 'Share', 0.8);
    await frame().locator('.wc-exp-row').first().waitFor();
    await sleep(600);
    // The editor's own way (owner round 2, item 8): a few lines dragged over and excluded, then a comment added
    const exp = frame().locator('.wc-exp');
    const entries = exp.locator('.wc-exp-row[data-kind="entry"]');
    const rowBox = async (i: number) => (await entries.nth(i).boundingBox())!;
    // (a typed command is its own kind of row)
    const textBox = async (t: string) => (await exp.locator('.wc-exp-row', { hasText: t }).first().boundingBox({ timeout: 5000 }))!;
    const [ra, rb] = [await textBox(EXCLUDE_FROM), await textBox(EXCLUDE_TO)];
    await pointer.hoverPoint(ra.x + 60, ra.y + ra.height / 2, T(nowS() + 1.1));
    marks.markAt(await pointer.dragTo(rb.x + 260, rb.y + rb.height / 2, Date.now() + 500, { ms: 700, holdMs: 300 }), 'exp-select', 'lines selected');
    await sleep(300);
    const nsel = await exp.locator('.wc-exp-row.is-sel').count();
    if (nsel < 2) console.warn(`  ${nsel} rows selected`);
    await calm(exp.locator('[data-btn="EXCLUDE"]'), 'exp-exclude', 'Exclude', 1.0);
    await sleep(1100);
    // the comment: the cursor to its row (a press), Add comment, typed, saved
    const cb = await rowBox(COMMENT_ROW);
    await pointer.hoverPoint(cb.x + 80, cb.y + cb.height / 2, T(nowS() + 1.0));
    marks.markAt(await pointer.pressAt(Date.now() + 400), 'exp-row', 'the comment row');
    await calm(exp.locator('[data-btn="COMMENT"]'), 'exp-comment', 'Add comment', 0.8);
    const ta = exp.locator('.wc-exp-comp textarea').first();
    await ta.waitFor({ timeout: 3000 }).catch(() => console.warn('  no comment composer'));
    await sleep(350);
    await ta.focus().catch(() => {});
    await type(FILM_COMMENT, 45, 85);
    if ((await ta.inputValue().catch(() => '')) !== FILM_COMMENT) {
      console.warn('  the comment did not take the typing: filled');
      await ta.fill(FILM_COMMENT);
    }
    await sleep(400);
    await calm(exp.locator('.wc-exp-comp [data-btn="SAVE"]'), 'exp-saved', 'the comment saved', 0.7);
    await sleep(1100);
    await calm(frame().locator('.wc-exp-outs [data-opt="HOF"]'), 'hof', 'Hall of Fame', 0.8);
    await calm(frame().locator('.wc-exp [data-btn="EXPORT"]'), 'share-dialog', 'the share dialog', 0.8);
    const dlg = frame().locator('[data-dlg="share"]');
    await dlg.waitFor();
    await sleep(900);
    await calm(dlg.locator('[data-field="rules"]'), 'rules', 'the rules ticked', 0.8);
    await calm(frame().locator('[data-btn="PUBLISH"]'), 'publish', 'Publish', 0.8);
    const done = frame().locator('[data-dlg="share-done"]');
    await done.waitFor({ timeout: 20_000 });
    // the dev server's address in the link reads as the site's (the film shows mumecockpit.com)
    await page.evaluate(() => {
      const i = document.querySelector<HTMLInputElement>('.wc-start [data-dlg="share-done"] [data-field="link"] input');
      if (i) i.value = i.value.replace(/^https?:\/\/[^/]+/, 'https://mumecockpit.com');
    });
    marks.mark('published', 'the link');
    await sleep(1100);
    await calm(frame().locator('[data-btn="COMMUNITY"]'), 'community', 'Open Community', 0.8);
    const cy = frame().locator('.wc-cy');
    await cy.locator('.wc-cy-row').first().waitFor({ timeout: 15_000 });
    await cy.locator('.wc-cy-note').first().waitFor({ timeout: 10_000 }).catch(() => console.warn('  no Random Runes notes'));
    await cy.locator('[data-box="players"]').waitFor({ timeout: 10_000 }).catch(() => console.warn('  no players online'));
    marks.mark('community-up', 'the Community page');
    await pointer.moveTo(1240, 520);
    await sleep(1200);
    // the real log's watch page (no stars or comments yet at the capture: a few seconds of its player)
    const real = c.runs[0]!;
    await calm(cy.locator('.wc-cy-row', { hasText: real.title }).first(), 'watch', real.title, 0.8);
    // a frame on the start surface since 0.21 (ADR 0163): the morph, the address by pushState, no page load
    await page.waitForURL(`**/r/${real.id}**`, { timeout: 15_000 });
    await page.locator('.wc-watch-page[data-watch="playing"]').waitFor({ timeout: 30_000 });
    const fl2 = page.frameLocator('.wc-watch-slot iframe');
    await fl2.locator('.wc-player').waitFor({ timeout: 30_000 });
    marks.mark('watch-up', 'the watch page');
    await sleep(300);
    await calm(fl2.locator('button.wc-pc-play').first(), 'watch-play', 'Play', 0.8);
    await sleep(500);
    // into the battle
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowRight');
      await sleep(90);
    }
    await sleep(1400);
    // Back: the frame pops, the morph back to the Community page as it was
    await calm(page.locator('.wc-watch-page .wc-lk-back').first(), 'watch-back', 'Back', 0.8);
    await page.locator('.wc-watch-page').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => console.warn('  the watch page stays'));
    await page.locator('.wc-start .wc-cy').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => console.warn('  no Community page after Back'));
    marks.mark('community-again', 'the Community page again');
    await sleep(700);
    await calm(backBtn(), 'community-back', 'Back to the start page', 0.8);
    await page.locator('.wc-start .wc-sm-item[data-key="enter"]').first().waitFor({ state: 'visible', timeout: 10_000 });
    await sleep(700);
    // the hand leaves the mouse, low on the right
    await pointer.moveTo(1580, 880);
    marks.mark('start-again', 'the start page at night');
    await sleep(1100);
    marks.mark('night', 'the night start page: the dissolve to sunrise starts');

    // ---------------------------------------------------------------- act 8: dawn
    // Off the film (under the dissolve's far side): MUME's clock moved on to sunrise and the start
    // page loaded again, so its sky is the sunrise's. The quote stays out: the end card's place.
    await sleep(3200);
    await setClock(page, DAWN);
    await page.addInitScript(() => {
      const put = () => {
        const st = document.createElement('style');
        st.textContent = '.wc-start .wc-sm-quote { opacity: 0 !important; }';
        document.head.appendChild(st);
      };
      if (document.head) put();
      else document.addEventListener('DOMContentLoaded', put);
    });
    await page.goto(`/?skyWeather=${FILM_SKY}&cloudtest`);
    await startMenu(page);
    await page.locator('.wc-start .wc-sm-item[data-key="owner"]', { hasText: FILM_ACCOUNT.name }).waitFor({ timeout: 20_000 }).catch(() => console.warn('  the dawn start page does not name the account'));
    await sleep(2500);
    marks.mark('dawn', 'the start page at sunrise, settled');
    // the start page under the end card until the music's tail has faded (Film2 times the card by the music)
    await sleep(30_000);
    marks.mark('active-end', 'the take');
  },
};
