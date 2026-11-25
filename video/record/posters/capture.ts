// Captures Character cards from the real app on a mocked MUME (nothing
// reaches mume.org): one page per character, then each shot (tab, size,
// theme) of it as a PNG of the pane alone, transparent around it.
//
//   node capture.ts [id …]       (the dev server on WC_POSTER_PORT, default 5190)
//
// At deviceScaleFactor POSTER_SHOT_DSF (default 4: the posters' render at
// 2 draws the shots at about twice their CSS size, so 4 keeps every shot at
// least 1:1 in a 5120 × 2880 poster; render.ts reports the ratios).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page, type WebSocketRoute } from '@playwright/test';
import { answerText, pollNonce } from '../../../tests/fixtures/info-poll-answer.ts';
import { xpForLevel, tpForLevel } from '../../../src/gmcp/levels.ts';
import { CHARS, FIGHT, type Char } from './chars.ts';

const PORT = Number(process.env.WC_POSTER_PORT ?? 5190);
const BASE = `http://localhost:${PORT}`;
const DSF = Number(process.env.POSTER_SHOT_DSF ?? 4);
const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

export interface Shot {
  out: string;
  tab: 'status' | 'stats' | 'lore';
  /** Cells of content (the frame adds 2). */
  cols: number;
  rows: number;
  paper?: boolean;
  /** The pane's own background see-through (the poster shows through it). */
  clear?: boolean;
  /** Only the portrait column (`.wc-cc-left`). */
  part?: 'left';
  /** Dump the stones (icon, tone, state) to `<out>.json`. */
  dump?: boolean;
}

// --------------------------------------------------------------- the plan

const plan: { char: Char; shots: Shot[] }[] = [];
const add = (id: string, ...shots: Shot[]): void => {
  const char = id === FIGHT.id ? FIGHT : CHARS.find((c) => c.id === id)!;
  plan.push({ char, shots });
};
// 1: the gallery, Medium (with portrait) each, some Paper, some clear
const MED = { cols: 40, rows: 9 };
const gallery = CHARS.map((c) => c.id);
for (const [i, id] of gallery.entries()) add(id, { out: `med-${id}`, tab: 'status', ...MED, paper: i % 4 === 2, dump: true }, { out: `medclear-${id}`, tab: 'status', ...MED, clear: true }, { out: `face-${id}`, tab: 'status', cols: 61, rows: 20, clear: true, part: 'left' }, { out: `facep-${id}`, tab: 'status', cols: 61, rows: 20, paper: true, clear: true, part: 'left' });
add('azruphel', { out: 'medp-azruphel', tab: 'status', ...MED, paper: true });
// 2: Status · Stats · Lore
add('gruzhbag', { out: 'big-status-gruzhbag', tab: 'status', cols: 62, rows: 16 });
add('aerlinn', { out: 'big-stats-aerlinn', tab: 'stats', cols: 61, rows: 17, paper: true }, { out: 'big-stats-aerlinn-black', tab: 'stats', cols: 61, rows: 17 });
add('nalbor', { out: 'big-lore-nalbor', tab: 'lore', cols: 60, rows: 28 }, { out: 'big-lore-nalbor-clear', tab: 'lore', cols: 60, rows: 28, clear: true });
// 3: the stones
add(FIGHT.id,
  { out: 'fight-status', tab: 'status', cols: 62, rows: 16, dump: true },
  { out: 'fight-status-clear', tab: 'status', cols: 61, rows: 17, clear: true },
  { out: 'fight-status-paper', tab: 'status', cols: 61, rows: 17, paper: true },
);
// 4: every size
add('azruphel',
  { out: 'size-l-azruphel', tab: 'status', cols: 61, rows: 17 },
  { out: 'size-m-azruphel', tab: 'status', cols: 44, rows: 11 },
  { out: 'size-s-azruphel', tab: 'status', cols: 34, rows: 7 },
  { out: 'size-c-azruphel', tab: 'status', cols: 46, rows: 3 },
  { out: 'size-l-azruphel-p', tab: 'status', cols: 61, rows: 17, paper: true },
  { out: 'size-m-azruphel-p', tab: 'status', cols: 44, rows: 11, paper: true },
  { out: 'size-s-azruphel-p', tab: 'status', cols: 34, rows: 7, paper: true },
  { out: 'size-c-azruphel-p', tab: 'status', cols: 46, rows: 3, paper: true },
);
add('tansy', { out: 'size-c-tansy', tab: 'status', cols: 46, rows: 3 }, { out: 'size-c-tansy-p', tab: 'status', cols: 46, rows: 3, paper: true }, { out: 'size-m-tansy-p', tab: 'status', cols: 44, rows: 11, paper: true }, { out: 'size-m-tansy', tab: 'status', cols: 44, rows: 11 });
add('ughlakh', { out: 'size-c-ughlakh', tab: 'status', cols: 46, rows: 3 }, { out: 'size-m-ughlakh', tab: 'status', cols: 44, rows: 11 }, { out: 'size-c-ughlakh-p', tab: 'status', cols: 46, rows: 3, paper: true });

// --------------------------------------------------------------- the wire

const IAC = 255;
const wire = (s: string): Buffer => Buffer.from(s, 'utf8');
const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, 250, 201]), wire(`${pkg} ${JSON.stringify(data)}`), Buffer.from([IAC, 240])]);
const PROMPT = Buffer.concat([wire('<prompt>*&gt;</prompt>'), Buffer.from([IAC, 249])]);
const G = (n: number): string => `\x1b[32m${n}\x1b[0m`;

function fields(c: Char): string[] {
  const a = c.abilities;
  const b = c.base ?? a;
  const [ob, db, pb, abs] = c.shields;
  return [
    String(c.level), String(ob), String(db), String(pb), String(abs),
    ...a.map(String),
    `Str:${b[0]} Int:${b[1]} Wis:${b[2]} Dex:${b[3]} Con:${b[4]} Wil:${b[5]} Per:${b[6]}`,
    ...c.age.map(String),
    c.height, c.weight, c.equipment, c.load, c.alignment, c.citizen,
    `${G(c.purse[0])} gold coins, ${G(c.purse[1])} silver pennies, and ${G(c.purse[2])} copper pennies`,
    c.warFame,
    ...c.perception.map(String),
    String(c.wimpy),
  ];
}

function vitals(c: Char): Record<string, unknown> {
  const at = xpForLevel(c.level);
  const next = xpForLevel(c.level + 1);
  const xp = Math.round(at + (next - at) * c.through);
  const tp = Math.round(tpForLevel(c.level, c.race) + (tpForLevel(c.level + 1, c.race) - tpForLevel(c.level, c.race)) * c.tpShare);
  const t = c.toggles ?? {};
  const v: Record<string, unknown> = {
    xp, tp,
    hp: c.hp[0], maxhp: c.hp[1], mp: c.mp[0], maxmp: c.mp[1],
    mood: c.mood, alertness: c.alertness, carrying: c.carrying, position: c.position,
    sneak: t.sneak ? 's' : null, ride: t.ride ? 'r' : null, climb: t.climb ? 'c' : null, swim: t.swim ? 'w' : null,
  };
  if (c.mana) Object.assign(v, { mana: c.mana[0], maxmana: c.mana[1], 'spell-effort': c.casts ?? 'normal' });
  return v;
}

// --------------------------------------------------------------- one page

async function capture(page: Page, char: Char, shots: Shot[]): Promise<void> {
  let server: WebSocketRoute | null = null;
  const pollAnswer = (nonce: string): Buffer => {
    const fighting = !!char.fight;
    const vit = [char.hp[0], char.hp[1], char.mana?.[0] ?? 0, char.mana?.[1] ?? 0, char.mp[0], char.mp[1]].map((n) => (fighting ? 'xxx' : String(n)));
    const affects = [...(char.listed ?? []), ...(char.stones ?? []).filter((s) => s.untracked).map((s) => s.name)];
    return Buffer.concat([wire(answerText(nonce, { cols: 100, fields: fields(char), vitals: vit, affects })), PROMPT]);
  };
  let polls = 0;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => {
      const raw = typeof m === 'string' ? Buffer.from(m) : Buffer.from(m);
      if (raw[0] === IAC || raw.includes('Core.Ping')) return;
      const text = raw.toString('utf8');
      const nonce = pollNonce(text);
      if (nonce) {
        polls++;
        setTimeout(() => ws.send(pollAnswer(nonce)), 60);
        return;
      }
      for (const line of text.split(/\r?\n/)) if (/^change width /.test(line)) ws.send(Buffer.concat([wire('Ok.\r\n\r\n'), PROMPT]));
    });
    ws.send(Buffer.from([IAC, 251, 201]));
  });
  await page.addInitScript((o) => localStorage.setItem('wc.charSex.v1', JSON.stringify({ [o.n]: o.s })), { n: char.name.toLowerCase(), s: char.sex });
  await page.goto(`${BASE}/?replay`);
  await page.waitForFunction(() => (window as any).__wc?.app !== undefined);
  await page.evaluate(() => {
    (window as any).__wc.settings.update((d: any) => {
      d.weather.enabled = false;
      d.character.fetchInfo = true;
      d.character.height = 'auto';
      for (const p of Object.values(d.panes) as any[]) if (p) p.on = false;
      d.panes.character.on = true;
      Object.assign(d.panes.character, { border: true, glass: false });
    });
  });
  await place(page, shots[0]!, false);
  await page.evaluate(() => (window as any).__wc.app.connectLive());
  for (let i = 0; i < 100 && !server; i++) await page.waitForTimeout(100);
  if (!server) throw new Error('no socket');
  const ws = server as WebSocketRoute;
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  ws.send(gmcp('Char.Name', { name: char.name, fullname: `${char.name} the Wanderer` }));
  await page.waitForFunction(() => /^playing/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  const v = vitals(char);
  // the session's start a little below now: the ring shows what was gained
  const at = xpForLevel(char.level);
  const next = xpForLevel(char.level + 1);
  const start = Math.round(at + (next - at) * Math.max(0, char.through - char.gained));
  const tps = Math.round((v.tp as number) * 0.995);
  const self: Record<string, unknown> = { id: 1, type: 'you', name: char.name };
  for (const f of char.flags ?? []) self[f] = true;
  ws.send(Buffer.concat([
    gmcp('Char.StatusVars', { race: char.race, subrace: char.subrace, level: char.level }),
    gmcp('Char.Vitals', { ...v, xp: start, tp: tps }),
    gmcp('Char.Vitals', v),
    gmcp('Group.Set', [self]),
    wire('Welcome back.\r\n\r\n'),
    PROMPT,
  ]));
  if (char.fight) ws.send(Buffer.concat([gmcp('Char.Vitals', { opponent: char.fight.opponent, 'hp-string': char.fight.hp }), PROMPT]));
  for (let i = 0; i < 150 && polls === 0; i++) await page.waitForTimeout(100);
  if (!polls) console.warn(`  ${char.id}: no poll`);
  await page.waitForTimeout(600);
  // the timed stones
  await page.evaluate((stones) => {
    const t = (window as any).__wc.app.game.timers;
    const now = Date.now();
    for (const [i, s] of stones.entries()) {
      if (s.untracked) continue;
      const total = (s.total ?? 600) * 1000;
      const left = (s.left ?? 0) * 1000;
      const timed = s.left !== undefined;
      t.debugAdd({
        id: `poster-${i}`, name: s.name, group: s.group,
        startedAt: timed ? now - (total - left) : now, expiresAt: timed ? now + left : null, expected: timed ? total : null, tracked: true,
        ...(s.herbKey ? { herbKey: s.herbKey, phase: s.phase ?? 'buff' } : {}),
      });
    }
  }, char.stones ?? []);
  for (const s of shots) {
    await place(page, s, true);
    const pane = page.locator('.wc-pane-character');
    await pane.locator(`.wc-cc-tab[data-tab="${s.tab}"]`).click({ timeout: 2000 }).catch(() => {});
    await page.mouse.move(2, 2);
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const c = document.querySelector('.wc-pane-character .wc-cc');
      return { mode: c?.getAttribute('data-mode'), portrait: c?.querySelector('.wc-cc-disc')?.getAttribute('data-art'), stones: c?.querySelectorAll('.wc-cc-stone').length ?? 0 };
    });
    if (s.part === 'left') {
      const clip = await pane.evaluate((p) => {
        const rs = ['.wc-cc-name', '.wc-cc-medal', '.wc-cc-icons'].map((q) => p.querySelector(q)!.getBoundingClientRect());
        const x = Math.min(...rs.map((r) => r.left)) - 6, y = Math.min(...rs.map((r) => r.top)) - 6;
        return { x, y, width: Math.max(...rs.map((r) => r.right)) + 6 - x, height: Math.max(...rs.map((r) => r.bottom)) + 6 - y };
      });
      await page.screenshot({ path: `${OUT}${s.out}.png`, clip, omitBackground: true, animations: 'disabled' });
    } else await pane.screenshot({ path: `${OUT}${s.out}.png`, omitBackground: true, animations: 'disabled' });
    if (s.dump) {
      const stones = await pane.evaluate((p) => [...p.querySelectorAll('.wc-cc-st[data-k="stone"]')].map((e) => {
        const svg = e.querySelector('.wc-cc-sti svg')!;
        return { id: e.getAttribute('data-id'), tone: e.getAttribute('data-tone'), state: e.getAttribute('data-state'), color: getComputedStyle(e).getPropertyValue('--c').trim(), svg: svg.outerHTML };
      }));
      const named = stones.map((x) => {
        const m = /^poster-(\d+)$/.exec(x.id ?? '');
        return { ...x, name: m ? char.stones![Number(m[1])]!.name : (x.id ?? '').replace(/^(flag|affect):/, '') };
      });
      writeFileSync(`${OUT}${s.out}.json`, JSON.stringify(named, null, 1));
    }
    console.log(`  ${s.out}: ${JSON.stringify(state)}`);
  }
}

/** The pane floating at the top left, `cols` × `rows` of content; the theme; the see-through. */
async function place(page: Page, s: Shot, wait: boolean): Promise<void> {
  await page.evaluate((s) => {
    (window as any).__wc.settings.update((d: any) => {
      d.appearance.bg = s.paper ? '#f4ecd8' : '#000000';
      for (const dock of Object.values(d.layout.docks) as any[]) {
        const strip = (l: any[]) => l.filter((p) => p.id !== 'character');
        dock.head = strip(dock.head);
        dock.tail = strip(dock.tail);
        for (const l of dock.lanes) l.panes = strip(l.panes);
        dock.lanes = dock.lanes.filter((l: any) => l.panes.length > 0);
      }
      d.layout.floating = [...d.layout.floating.filter((f: any) => f.id !== 'character'), { id: 'character', x: 2, y: 2, w: s.cols + 2, h: s.rows + 2 }];
    });
    let st = document.getElementById('poster-css');
    if (!st) {
      st = document.createElement('style');
      st.id = 'poster-css';
      document.head.append(st);
    }
    // everything around the pane transparent; the pane's own sheet too when `clear`
    st.textContent = `html,body{background:transparent!important}
      ${s.clear ? '.wc-app{background:transparent!important}' : ''}`;
  }, s);
  if (wait) await page.waitForTimeout(400);
}

// --------------------------------------------------------------- main

const only = process.argv.slice(2);
const browser = await chromium.launch({ args: [`--force-device-scale-factor=${DSF}`] });
try {
  for (const { char, shots } of plan) {
    const mine = only.length ? shots.filter((s) => only.some((o) => s.out.includes(o) || char.id === o)) : shots;
    if (!mine.length) continue;
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: DSF });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
    console.log(char.id);
    try {
      await capture(page, char, mine);
    } catch (e) {
      console.warn(`  ${char.id} failed: ${(e as Error).message}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
