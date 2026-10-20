// The README screenshots (docs/img/), reproducible:
//
//   npm run screenshots                 every shot
//   npm run screenshots -- hero map     only these
//
// Starts the dev server on WC_SHOT_PORT (default 5188) unless one answers
// there already, and drives Chromium at 1600×900 CSS px, device scale 2
// (3200×1800 PNG). Every shot starts from an empty browser profile (the
// new-player defaults, ADR 0092). The gameplay shots log in through a
// mocked MUME WebSocket (as tests/e2e/live-mock.spec.ts does: nothing
// reaches the real server) that plays a feed built from the repository's
// fixtures (tests/fixtures/*.log, invented names); the weather is pinned
// with the dev hook `__weather` (src/weather/dev.ts). `exporteditor` also
// writes htmlplayer.png: it records a run through the mocked connection,
// exports it as HTML from the export editor and opens the file. The snow
// shot runs in Firefox (see there).
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Browser, type BrowserContext, type Page, type WebSocketRoute, chromium, firefox as firefoxType } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}docs/img/`;
const PORT = Number(process.env.WC_SHOT_PORT ?? 5188);
const BASE = `http://localhost:${PORT}`;
const VIEWPORT = { width: 1600, height: 900 };
const SCALE = 2;
/** Where the exported replay is saved for the htmlplayer shot. */
const TMP = `${mkdtempSync(`${tmpdir()}/wc-shots-`)}/`;

/** The scripts shot's user script: a trigger, a timer and a small pane. */
const KILL_COUNTER = `-- @name     killcounter
-- @summary  Counts your kills, in a small pane
-- @api      1
-- @setting  every number 10 "Minutes between the summaries in the game text (0: none)"
-- @help     Counts the monsters you and your group kill, shows the count and
-- @help     the last one in a pane, and sums up now and then.

local pane = createPane{id = "main", title = "Kills", dock = "right", rows = 3, cols = 30}
local kills, last = 0, "nothing yet"

local function draw()
  pane:clear()
  pane:setLine(1, " Kills: <yellow>" .. kills .. "<reset>")
  pane:setLine(2, " Last:  " .. last)
end

-- "An orc is dead! R.I.P." -- players show as *Name* and are skipped.
tempRegexTrigger("^([^*].*) is dead! R\\\\.I\\\\.P\\\\.$", function()
  kills = kills + 1
  last = matches[2]
  draw()
end)

-- A summary in the game text every few minutes.
if settings.every > 0 then
  tempTimer(settings.every * 60, function()
    cecho("<green>Kills so far: " .. kills .. "<reset>")
  end, true)
end

draw()
`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Firefox, launched on first use. It drops a context's deviceScaleFactor on
 * the cross-origin isolated app page, so the ratio comes from a pref
 * (as tests/e2e/dpr.ts does).
 */
let ff: Promise<Browser> | null = null;
const firefox = (): Promise<Browser> => (ff ??= firefoxType.launch({ firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(SCALE) } }));

// ------------------------------------------------------------ dev server

async function up(): Promise<boolean> {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

async function devServer(): Promise<ChildProcess | null> {
  if (await up()) return null;
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    if (await up()) return child;
    await sleep(500);
  }
  child.kill();
  throw new Error(`dev server did not start on ${BASE}`);
}

// ------------------------------------------------------------ telnet feed

const IAC = 255;
const SB = 250;
const SE = 240;
const WILL = 251;
const GA = 249;
const GMCP = 201;

const gmcpBytes = (body: string): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(body, 'utf8'), Buffer.from([IAC, SE])]);

/** A prompt as replay-socket.ts tells one: visible text ending in `>`, short. */
const isPrompt = (raw: string): boolean => {
  const vis = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
  return vis.length > 0 && vis.length < 80 && vis.endsWith('>');
};

/** One server line: a prompt goes without a newline and ends with GA. */
const lineBytes = (raw: string): Buffer =>
  isPrompt(raw) ? Buffer.concat([Buffer.from(raw, 'utf8'), Buffer.from([IAC, GA])]) : Buffer.from(`${raw}\r\n`, 'utf8');

/** A feed step: bytes from the server, or a command typed into the input line. */
type Step = { out: Buffer } | { cmd: string };

/** The body of each line of a fixture log (timestamps dropped). */
function fixture(name: string): string[] {
  return readFileSync(`${ROOT}tests/fixtures/${name}`, 'utf8')
    .split('\n')
    .filter((l) => l.length >= 17)
    .map((l) => l.slice(17));
}

/**
 * Fixture lines → steps. GMCP records become telnet GMCP, `> cmd` lines are
 * typed. `descs`: a room's description from its Room.Info is shown under
 * the room name (the fixtures keep only the name; MUME prints both).
 */
function toSteps(lines: readonly string[], o: { descs?: boolean; gmcp?: (pkg: string) => boolean } = {}): Step[] {
  const steps: Step[] = [];
  let buf: Buffer[] = [];
  let desc: string | null = null;
  // Commands typed ahead (`n;n;n`) wait for the prompt before them, so each echo sits on its prompt.
  const ahead: string[] = [];
  const flush = (): void => {
    if (buf.length) steps.push({ out: Buffer.concat(buf) });
    buf = [];
  };
  for (const l of lines) {
    if (l.startsWith('> ')) {
      flush();
      if (steps.length && 'cmd' in steps.at(-1)!) ahead.push(l.slice(2));
      else steps.push({ cmd: l.slice(2) });
    } else if (l.startsWith('\x1bGMCP ')) {
      const body = l.slice(6);
      const pkg = body.split(' ')[0]!;
      if (o.gmcp && !o.gmcp(pkg)) continue;
      if (pkg === 'Room.Info' && o.descs) desc = (JSON.parse(body.slice(pkg.length + 1)) as { desc?: string }).desc ?? null;
      buf.push(gmcpBytes(body));
    } else if (/^\x1b[A-Z]/.test(l)) {
      continue; // other client records (VIEW, SIZE, …)
    } else {
      buf.push(lineBytes(l));
      if (desc !== null && l.startsWith('\x1b[32m')) {
        for (const d of desc.replace(/\n+$/, '').split('\n')) buf.push(lineBytes(d));
        desc = null;
      }
      if (isPrompt(l)) {
        flush();
        const next = ahead.shift();
        if (next !== undefined) steps.push({ cmd: next });
      }
    }
  }
  flush();
  return steps;
}

/** Unsolicited channel text: GMCP, then an empty line, the text, an empty line, the prompt. */
function comm(channel: string, talker: string, text: string, colour = ''): Step {
  const g = gmcpBytes(`Comm.Channel.Text ${JSON.stringify({ channel, talker, 'talker-type': 'player', text })}`);
  const shown = colour ? `\x1b[${colour}m${text}\x1b[0m` : text;
  return { out: Buffer.concat([g, lineBytes(''), lineBytes(shown), lineBytes(''), lineBytes('*=>')]) };
}

/** How much of the fight on Hill Road the feed plays. */
type Fight = 'none' | 'mid' | 'full';

/**
 * The fight of gmcp-demo.log (`kill scout` to the achievement), moved to
 * Bree: the orc scout becomes a half-orc ruffian who arrives first. Its
 * Group GMCP is dropped (other ids than this feed's group). `mid` stops
 * while the ruffian is wounded.
 */
function fightSteps(fight: Fight): Step[] {
  if (fight === 'none') return [];
  const demo = fixture('gmcp-demo.log').map((l) =>
    l.replace(/an orc scout/g, 'a half-orc ruffian').replace(/An orc scout/g, 'A half-orc ruffian').replace(/scout/g, 'ruffian'),
  );
  const from = demo.indexOf('> kill ruffian');
  const to = fight === 'mid' ? demo.indexOf('Gibur grins at the ruffian wickedly.') - 3 : demo.indexOf('> narrate ruffian down at the ford');
  const arrive: Step = { out: Buffer.concat([lineBytes(''), lineBytes('\x1b[31mA half-orc ruffian arrives from the north.\x1b[0m'), lineBytes(''), lineBytes('*=>')]) };
  return [arrive, ...toSteps(demo.slice(from, to), { gmcp: (pkg) => !pkg.startsWith('Group.') })];
}

/**
 * The gameplay feed: Rasta logs in on the Old East Road in Bree (map-demo),
 * casts his spells (timers-demo, without its login and GMCP), walks Bree
 * with room descriptions while friends talk on the channels, and ends up
 * on Hill Road, where `fight` may add a fight. All names are the fixtures'
 * invented ones.
 */
function gameFeed(fight: Fight = 'none'): Step[] {
  const map = fixture('map-demo.log');
  const firstMove = map.indexOf('> n');
  const timers = fixture('timers-demo.log');
  const spellsFrom = timers.indexOf('> arm');
  const spellsTo = timers.indexOf('> store fireb');
  const walk = toSteps(map.slice(firstMove), { descs: true });
  const talk: Step[] = [
    comm('tales', 'Gibur', "Gibur narrates 'orcs gathering at the ford'", '33'),
    comm('tells', 'Gibur', "Gibur tells you 'meet me at the Pony, bring the merc'", '32'),
    comm('says', 'Dori', "Dori says 'I can smell them' in Khuzdul.", '36'),
    comm('questions', 'Ecthel', "Ecthel asks 'anyone near Rivendell?'", '33'),
    comm('songs', 'Lindir', "Lindir sings 'A Elbereth Gilthoniel'", '33'),
    comm('tells', 'Gibur', "Gibur tells you 'more coming, 2 trolls'", '32'),
  ];
  // A channel message after every few moves.
  const mixed: Step[] = [];
  let moves = 0;
  for (const s of walk) {
    mixed.push(s);
    if ('cmd' in s && ++moves % 5 === 0 && talk.length) mixed.push(talk.shift()!);
  }
  const friends: Step = {
    out: Buffer.concat([
      gmcpBytes(`Group.Add ${JSON.stringify({ id: 4, type: 'ally', name: 'Dori', label: 0, hp: 118, 'hp-string': 'Fine', maxhp: 150, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 96, 'mp-string': 'Rested', maxmp: 120 })}`),
      gmcpBytes(`Group.Add ${JSON.stringify({ id: 5, type: 'npc', name: 'a sturdy pony', label: 'PONY', hp: 90, 'hp-string': 'Healthy', maxhp: 90, mana: 0, 'mana-string': 'Full', maxmana: 0, mp: 40, 'mp-string': 'Tired', maxmp: 120 })}`),
    ]),
  };
  return [
    ...toSteps(map.slice(0, firstMove), { descs: true }),
    friends,
    ...toSteps(timers.slice(spellsFrom, spellsTo), { gmcp: () => false }),
    ...mixed,
    ...talk,
    ...fightSteps(fight),
  ];
}

// ------------------------------------------------------------ pages

async function newPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, baseURL: BASE });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  return { ctx, page };
}

/**
 * Logs in through a mocked MUME WebSocket and plays `steps` (commands typed
 * into the input line). `prepare` runs on the start page, before the cockpit
 * is built (a layout change after the feed would rewrap its text).
 */
async function live(page: Page, steps: readonly Step[], prepare?: (page: Page) => Promise<void>): Promise<WebSocketRoute> {
  let server: WebSocketRoute | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage(() => {});
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await page.locator('.wc-start .wc-mrow.is-sel', { hasText: 'Enter MUME' }).waitFor();
  await prepare?.(page);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  const input = page.locator('.wc-input-field');
  for (const s of steps) {
    if ('cmd' in s) {
      await input.focus();
      await page.keyboard.insertText(s.cmd);
      await page.keyboard.press('Enter');
      await sleep(30);
    } else {
      server!.send(s.out);
      await sleep(40);
    }
  }
  // The input line keeps the last command; a screenshot shows it empty.
  await input.fill('');
  return server!;
}

/** The weather dev hook; resolves once the effects run. */
async function weather(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const w = await window.__wc!.weather();
    if (!w) throw new Error('weather effects did not start');
  });
}

type Pin = Record<string, unknown>;
/** Outdoors, standing, no clock-driven turn or moon (the demo's SCENE). */
const SCENE: Pin = { fog: '', light: '', position: 'standing', dayAt: -1, nightAt: -1, moonRiseAt: -1, moonSetAt: -1 };

async function jump(page: Page, pin: Pin): Promise<void> {
  await page.evaluate((p) => window.__weather!.jump(p as never), pin);
}

async function shot(page: Page, name: string, png?: Buffer): Promise<void> {
  const file = `${OUT}${name}.png`;
  if (png) writeFileSync(file, png);
  else await page.screenshot({ path: file });
  console.log(`  ${name}.png  ${(statSync(file).size / 1024 / 1024).toFixed(2)} MB`);
}

// ------------------------------------------------------------ shots

type Shot = (browser: Browser) => Promise<void>;

/**
 * The gameplay feed in the default layout, the weather pinned to `pin`
 * (called with now, for the clock-driven values), then `then` before the
 * screenshot (which may return the screenshot it took).
 */
async function gameplay(
  browser: Browser,
  name: string,
  pin: (now: number) => Pin,
  then: (page: Page) => Promise<void | Buffer>,
  o: { prepare?: (page: Page) => Promise<void>; fight?: Fight } = {},
): Promise<void> {
  const { ctx, page } = await newPage(browser);
  await live(page, gameFeed(o.fight), o.prepare);
  await weather(page);
  await jump(page, { ...SCENE, ...pin(Date.now()) });
  const png = await then(page);
  await shot(page, name, png ?? undefined);
  await ctx.close();
}

/** The share of near-white pixels in the open sky between the text and the dock (a lightning bolt there), measured in the page. */
async function brightShare(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const x = Math.round(img.width * 0.5), w = Math.round(img.width * 0.25), h = Math.round(img.height * 0.6);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    g.drawImage(img, x, 0, w, h, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i]! > 225 && d[i + 1]! > 225 && d[i + 2]! > 225) n++;
    return n / (w * h);
  }, png.toString('base64'));
}

const DAY: Pin = { clock: 'day', light: '*', sunU: 0.5, moonUp: false, moonU: -1 };
const NIGHT: Pin = { clock: 'night', light: ')', sunU: -1 };

const SHOTS: Record<string, Shot> = {
  // A sunset by the clock under a clear sky: the shot 20 s before the night begins (the turn runs over the
  // 60 s before it), when the warm glow and its rays are strongest. Tried: -52 … -3 s, sunrises, light clouds.
  hero: (b) => gameplay(b, 'hero', (now) => ({ ...DAY, weather: ' ', sunU: 0.97, nightAt: now + 23_000 }), () => sleep(3000)),
  // A clear night, the full moon past the middle of its way (by the clock).
  'weather-night': (b) =>
    gameplay(b, 'weather-night', (now) => ({ ...NIGHT, weather: ' ', moonUp: true, moonPhase: 1, moonRiseAt: now - 450_000, moonSetAt: now + 295_000 }), () => sleep(5000)),
  // Heavy rain by day during a fight, caught during a lightning strike: the brightest of a few tries.
  'weather-rain': (b) =>
    gameplay(b, 'weather-rain', () => ({ ...DAY, weather: '"' }), async (page) => {
      await sleep(8000);
      let best: { png: Buffer; lit: number } | null = null;
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => window.__weather!.emit('strike'));
        await sleep(120);
        const png = await page.screenshot();
        const lit = await brightShare(page, png);
        if (!best || lit > best.lit) best = { png, lit };
        await sleep(3000);
      }
      return best!.png;
    }, { fight: 'mid' }),
  // Snow by day, built up on the pane tops (at the game's pace). Firefox: its worker canvases draw the
  // far snow layers as dots; headless Chromium's pattern fills showed few of them.
  'weather-snow': async () => gameplay(await firefox(), 'weather-snow', () => ({ ...DAY, weather: '*' }), () => sleep(90_000)),
  // Dense fog by day.
  'weather-fog': (b) => gameplay(b, 'weather-fog', () => ({ ...DAY, weather: '~', fog: '=' }), () => sleep(20_000)),

  // The start page of a new install.
  async startpage(browser) {
    const { ctx, page } = await newPage(browser);
    await page.goto('/');
    await page.locator('.wc-start .wc-mrow.is-sel', { hasText: 'Enter MUME' }).waitFor();
    await sleep(2500);
    await shot(page, 'startpage');
    await ctx.close();
  },

  // ESC → Options → Appearance over the game, on a starry night.
  appearance: (b) =>
    gameplay(b, 'appearance', () => ({ ...NIGHT, weather: ' ', moonUp: false }), async (page) => {
      await sleep(2000);
      await page.keyboard.press('Escape');
      await menuRow(page, 'options').click();
      await menuRow(page, 'appearance').click();
      await page.locator('.wc-overlay .wc-frame:not([hidden]) .wc-title-row', { hasText: 'Appearance' }).waitFor();
      await sleep(800);
    }),

  // A wider right dock (the game text keeps its 80 columns) with a taller map, the mouse resting on a room: the hover box.
  map: (b) =>
    gameplay(
      b,
      'map',
      () => ({ ...DAY, weather: ' ' }),
      async (page) => {
        await sleep(1500);
        const box = (await page.locator('.wc-pane[data-pane="map"]').boundingBox())!;
        // A room west of the player (the map is centred on him); the box shows after the pointer rests 3 s.
        const hover = page.locator('.wc-map-hover');
        for (let i = 0; i < 4 && !(await hover.isVisible()); i++) {
          await page.mouse.move(box.x + box.width / 2 - 70 - i * 3, box.y + box.height / 2 + 4, { steps: 5 });
          await hover.waitFor({ timeout: 6000 }).catch(() => {});
        }
        await hover.waitFor({ timeout: 1000 });
        await sleep(500);
      },
      {
        prepare: (page) =>
          page.evaluate(() => {
            const s = window.__wc!.settings;
            const layout = structuredClone(s.get().layout);
            for (const lane of layout.docks.right.lanes) lane.size = 38;
            for (const p of layout.docks.right.head) if (p.id === 'map') p.desired = 400;
            s.update({ layout });
          }),
      },
    ),

  // A new user script (KILL_COUNTER) in the editor, a call being typed: the completion list and its help.
  async scripts(browser) {
    const { ctx, page } = await newPage(browser);
    await page.goto('/');
    await page.locator('.wc-start .wc-mrow.is-sel', { hasText: 'Enter MUME' }).waitFor();
    await page.evaluate(async (src) => {
      const lib = window.__wc!.shell.scripts as unknown as {
        init(): Promise<void>;
        create(n: string, s: string): Promise<unknown>;
        setEnabled(n: string, on: boolean): Promise<unknown>;
      };
      await lib.init();
      await lib.create('killcounter', src);
      // On: the editor's state line reads "● on · runs when you enter MUME", not "○ off".
      await lib.setEnabled('killcounter', true);
    }, KILL_COUNTER);
    await page.locator('.wc-start .wc-mrow[data-key="options"] .wc-label').click();
    await page.locator('.wc-start .wc-frame:not([hidden]) .wc-mrow[data-key="scripts"] .wc-label').click();
    const f = page.locator('.wc-start .wc-frame:not([hidden])');
    await f.locator('.wc-scr-row[data-script="killcounter"] [data-btn="EDIT"]').click();
    const ed = page.locator('.wc-frame:not([hidden]) > .wc-sed');
    await ed.locator('.cm-content').waitFor();
    // A new line after the trigger, a call being typed (high enough for the help panel to fit).
    await ed.locator('.cm-line', { hasText: /^end\)$/ }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('tempT', { delay: 60 });
    await page.locator('.cm-tooltip-autocomplete').waitFor();
    await sleep(800);
    await shot(page, 'scripts');
    await ctx.close();
  },

  // A run recorded in this session (the gameplay feed with the whole fight, through the mocked
  // connection), History → EXPORT with a comment, then the HTML export of it opened as a file.
  async exporteditor(browser) {
    const { ctx, page } = await newPage(browser);
    const server = await live(page, gameFeed('full'));
    await weather(page);
    await jump(page, { ...SCENE, ...DAY, weather: ' ' });
    // The server ends the connection: the run is sealed when the session leaves `playing`.
    await sleep(1000);
    await server.close();
    await page.waitForFunction(() => !/^playing/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
    await sleep(1500);
    await page.goto('/');
    await page.locator('.wc-start .wc-mrow.is-sel', { hasText: 'Enter MUME' }).waitFor();
    await page.locator('.wc-start .wc-mrow[data-key="history"] .wc-label').click();
    const f = page.locator('.wc-start .wc-frame:not([hidden])');
    await f.locator('.wc-tr:not(.is-empty)').first().waitFor();
    await page.keyboard.press('Home');
    await f.locator('[data-btn="EXPORT"]').click();
    await f.locator('.wc-exp-row:not(.is-empty)').first().waitFor();
    // Down to the ruffian's arrival; a comment before it.
    const rows = f.locator('.wc-exp-row:not(.is-empty)');
    for (let i = 0; i < 400; i++) {
      if (await f.locator('.wc-exp-row.is-cur', { hasText: 'A half-orc ruffian arrives' }).count()) break;
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('c');
    await page.keyboard.type('The ruffian shows up: watch the merc rescue Dori.');
    await page.keyboard.press('Enter');
    // On into the fight, the comment still in view.
    for (let i = 0; i < 16; i++) await page.keyboard.press('ArrowDown');
    await rows.first().waitFor();
    await sleep(800);
    await shot(page, 'exporteditor');

    // EXPORT (HTML is the default format): the downloaded file, opened from disk.
    const download = page.waitForEvent('download');
    await f.locator('[data-btn="EXPORT"]').click();
    const file = `${TMP}replay.html`;
    await (await download).saveAs(file);
    await ctx.close();

    const { ctx: c2, page: p2 } = await newPage(browser);
    await p2.goto(pathToFileURL(file).href);
    // Seek to the fight (src/replay/main.ts exposes `__wcReplay`), then play on a little.
    const engine = 'window.__wcReplay.host.engine';
    await p2.waitForFunction(`!!${engine} && ${engine}.duration > 0`);
    await p2.evaluate(`${engine}.seek(${engine}.duration * 0.93)`);
    await p2.waitForFunction(`!${engine}.seeking`);
    await p2.evaluate(`${engine}.play()`);
    await sleep(2500);
    await shot(p2, 'htmlplayer');
    await c2.close();
  },
};

/** A row of the visible ESC menu frame. */
const menuRow = (page: Page, key: string) => page.locator(`.wc-overlay .wc-frame:not([hidden]) .wc-mrow[data-key="${key}"] .wc-label`);


// ------------------------------------------------------------ main

const wanted = process.argv.slice(2);
for (const w of wanted) if (!(w in SHOTS)) throw new Error(`unknown shot ${w}; known: ${Object.keys(SHOTS).join(' ')}`);
mkdirSync(OUT, { recursive: true });
const server = await devServer();
const browser = await chromium.launch();
const failed: string[] = [];
try {
  for (const [name, run] of Object.entries(SHOTS)) {
    if (wanted.length && !wanted.includes(name)) continue;
    console.log(name);
    try {
      await run(browser);
    } catch (err) {
      failed.push(name);
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
} finally {
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
  const f = ff as Promise<Browser> | null;
  if (f) await (await f).close();
  server?.kill();
}
if (failed.length) {
  console.error(`failed: ${failed.join(' ')}`);
  process.exitCode = 1;
}
