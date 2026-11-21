// Stage 69 (ADR 0159): balloon notices. The Balloons switch under Settings →
// Weather effects loads and unloads them live; `#weather balloon …` shows
// one without a fight; a real kill and an achievement (a fake MUME) send
// balloons up. Round 2: the balloons are under every pane, docked or
// floating, in every phase; a level up, a death and an achievement have
// balloons of their own; the phone's layout never loads them. Stage 75:
// the shared rig with a passenger (the dwarf, the proof), its sign set in
// the bundled faces; nothing of it loads with Balloons off.
import { type Page, expect, test } from '@playwright/test';

const toggle = (page: Page, label: string) => page.locator(`.wc-sp-settings .wc-ck-tg[aria-label="${label}"]`);
const layers = (page: Page) => page.locator('.wc-cockpit > .wc-balloons');
const balloon = (page: Page) => page.locator('.wc-cockpit > .wc-balloons .wc-balloon');
const rows = (page: Page) => page.locator('.wc-rows .wc-row');

async function type(page: Page, text: string): Promise<void> {
  await page.locator('.wc-input-field').fill(text);
  await page.keyboard.press('Enter');
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

test('Settings → Weather effects → Balloons loads them live; #weather balloon shows one; off unloads', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();

  // The effects off: the command says how to turn them on.
  await type(page, '#weather balloon great');
  await expect(rows(page).filter({ hasText: 'turn on Settings → Weather effects first' })).toHaveCount(1);

  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="weather"]').click();
  await expect(toggle(page, 'Balloons')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.wc-sp-wx-balloons')).toContainText('Desktop only');
  await toggle(page, 'Weather effects').click();
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  // Weather on, Balloons off: nothing of the balloons is there.
  await expect(layers(page)).toHaveCount(0);

  await toggle(page, 'Balloons').click();
  expect(await page.evaluate(() => window.__wc!.settings.get().weather.balloons)).toBe(true);
  await expect(layers(page)).toHaveCount(2);
  // The sky layer right after the back canvas (under the text); the front one right after the game pane (over the text, under the panes).
  expect(await page.evaluate(() => document.querySelector('.wc-cockpit > canvas.wc-weather-back')!.nextElementSibling!.className)).toBe('wc-balloons wc-balloons-sky');
  expect(await page.evaluate(() => document.querySelector('.wc-cockpit > .wc-game')!.nextElementSibling!.className)).toBe('wc-balloons wc-balloons-front');
  await page.keyboard.press('Escape');

  await type(page, '#weather balloon great');
  const b = balloon(page);
  await expect(b).toHaveCount(1);
  await expect(page.locator('.wc-balloons-front .wc-balloon')).toHaveCount(1);
  await expect(b.locator('.rig-title')).toHaveText('An Uruk-hai tracker');
  await expect(b.locator('.rig-fig')).toHaveText('3,700xp');
  await expect(b.locator('.rig-word')).toHaveText('Great');
  // A slow rise (about 7 s), readable about 3 s, then it leaves into the sky layer, behind the text.
  await expect(page.locator('.wc-balloons-sky .wc-balloon')).toHaveCount(1, { timeout: 20_000 });

  // A burst: four kills on one sign.
  await type(page, '#weather balloon burst');
  const front = page.locator('.wc-balloons-front .wc-balloon');
  await expect(front.locator('.rig-title')).toHaveText('4 kills', { timeout: 5_000 });
  await expect(front.locator('.rig-word')).toHaveText('Great');
  await expect(front.locator('.rig-more')).toHaveText('an orc scout · a goblin thief · an Uruk-hai tracker · …');

  await page.locator('.wc-mb[data-mb="settings"]').click();
  await page.locator('.wc-ck-tab[data-tab="weather"]').click();
  await toggle(page, 'Balloons').click();
  await expect(layers(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('round 2: a level up, a death and an achievement each rise on a balloon of their own', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  await type(page, '#weather balloon burst');
  await type(page, '#weather balloon levelup');
  await type(page, '#weather balloon death');
  await type(page, '#weather balloon achievement');
  const signs = page.locator('.wc-balloons-front .rig-sign');
  await expect(signs.filter({ hasText: 'Level 23!' })).toHaveCount(1);
  await expect(signs.filter({ hasText: 'You died' })).toHaveCount(1);
  const ach = signs.filter({ hasText: 'Achievement' });
  await expect(ach).toHaveCount(1);
  await expect(ach.locator('.rig-title')).toContainText('Old Forest');
  await expect(page.locator('.wc-balloons-front .rig-sign[data-mood="levelup"]')).toHaveCount(1);
  // The burst's later kills still join the kill balloon only.
  await expect(signs.filter({ hasText: '4 kills' })).toHaveCount(1, { timeout: 5_000 });
  await expect(balloon(page)).toHaveCount(4);
  // Stage 75, the rig's height limit: no sign ends below 363 px (K.MAXH) of the rig.
  for (const e of await signs.all()) {
    const end = await e.evaluate((s) => (s as HTMLElement).offsetTop + (s as HTMLElement).offsetHeight);
    expect(end).toBeLessThanOrEqual(363);
  }
  expect(errors).toEqual([]);
});

test('round 2: the balloons are under every pane, docked and floating, in every phase; over the bare game text only while readable', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  // A floating pane: Statistics, over the game pane.
  await page.locator('.wc-mb[data-mb="panes"]').click();
  await page.locator('.wc-pop-row[data-pane="statistics"]').click();
  await page.keyboard.press('Escape');
  const float = page.locator('.wc-pane[data-pane="statistics"]');
  await expect(float).toHaveAttribute('data-floating', '');

  // What paints on top at a point, as the browser hit-tests it: a probe that
  // takes the pointer fills each balloon layer (they take none themselves).
  const order = (where: 'float' | 'docked' | 'text') =>
    page.evaluate((where) => {
      for (const l of document.querySelectorAll('.wc-cockpit > .wc-balloons')) {
        if (l.querySelector(':scope > .probe')) continue;
        const p = document.createElement('div');
        p.className = 'probe';
        p.style.cssText = 'position:absolute;inset:0;pointer-events:auto';
        l.append(p);
      }
      const docked = [...document.querySelectorAll<HTMLElement>('.wc-cockpit > .wc-pane:not([data-floating]):not([hidden])')].find((e) => e.offsetWidth > 50)!;
      const el = where === 'float' ? document.querySelector<HTMLElement>('.wc-pane[data-floating]:not([hidden])')! : where === 'docked' ? docked : document.querySelector<HTMLElement>('.wc-game')!;
      const r = el.getBoundingClientRect();
      // the bare text: the game pane's left part, above the input row, clear of the floating pane
      const x = where === 'text' ? r.left + 40 : r.left + r.width / 2;
      const y = where === 'text' ? r.top + 40 : r.top + r.height / 2;
      const stack = document.elementsFromPoint(x, y);
      const at = (pred: (e: Element) => boolean) => stack.findIndex(pred);
      return {
        target: at((e) => e === el || el.contains(e)),
        front: at((e) => e.classList.contains('probe') && e.parentElement!.classList.contains('wc-balloons-front')),
        sky: at((e) => e.classList.contains('probe') && e.parentElement!.classList.contains('wc-balloons-sky')),
      };
    }, where);

  await type(page, '#weather balloon good');
  const seen = new Set<string>();
  const check = async () => {
    const phase = await page.evaluate(() => {
      const b = document.querySelector('.wc-balloon');
      return b ? (b.parentElement!.classList.contains('wc-balloons-front') ? 'front' : 'sky') : 'gone';
    });
    if (phase === 'gone') return phase;
    seen.add(phase);
    for (const where of ['float', 'docked'] as const) {
      const o = await order(where);
      expect(o.target, `${where} ${phase}`).toBeGreaterThanOrEqual(0);
      expect(o.target, `${where} over the front layer (${phase})`).toBeLessThan(o.front);
      expect(o.target, `${where} over the sky layer (${phase})`).toBeLessThan(o.sky);
    }
    const t = await order('text');
    // the front layer over the game text, the sky under it
    expect(t.front).toBeLessThan(t.target);
    expect(t.target).toBeLessThan(t.sky);
    return phase;
  };
  // arriving and readable (front), then gliding and drifting (sky)
  await expect(page.locator('.wc-balloons-front .wc-balloon')).toHaveCount(1);
  await check();
  await expect(page.locator('.wc-balloons-sky .wc-balloon')).toHaveCount(1, { timeout: 20_000 });
  await check();
  expect([...seen].sort()).toEqual(['front', 'sky']);
  expect(errors).toEqual([]);
});

test('round 2: desktop only: the phone layout never loads the balloons, and #weather balloon says so', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-app')).toBeVisible();
  expect(await page.evaluate(() => window.__wc!.app.cockpit.isPhoneGame)).toBe(true);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await page.locator('.wc-input-slot .wc-input-field').fill('#weather balloon levelup');
  await page.keyboard.press('Enter');
  await expect(rows(page).filter({ hasText: 'Balloons are desktop only' })).toHaveCount(1);
  // Nothing of them, and their chunk never fetched.
  await expect(layers(page)).toHaveCount(0);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((r) => /balloons\/(notices|balloons|flight|rig|passengers)|IMFell|Cinzel-Medium|SemiBold/.test(r.name)))).toBe(false);
  expect(errors).toEqual([]);
});

const IAC = 255, WILL = 251, SB = 250, SE = 240, GMCP = 201;
const bytes = (...parts: (number[] | string)[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));
const gmcp = (payload: string) => bytes([IAC, SB, GMCP], payload, [IAC, SE]);

test('a real kill sends a balloon up with its name and XP (calibrating: no rating word); an achievement one of its own', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(page.locator('.wc-cockpit > .wc-balloons')).toHaveCount(2);
  server!.send(gmcp('Char.Name {"name":"Balloonist","fullname":"Balloonist the Mock"}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing · Balloonist/);
  server!.send(gmcp('Char.Vitals {"hp":100,"maxhp":100,"xp":5770000,"tp":41500}'));
  server!.send(bytes('An orc scout is dead! R.I.P.\r\n'));
  server!.send(gmcp('Char.Vitals {"xp":5772600}'));
  const b = balloon(page);
  await expect(b).toHaveCount(1);
  await expect(b.locator('.rig-title')).toHaveText('An orc scout');
  await expect(b.locator('.rig-fig')).toHaveText('2,600xp');
  // calibrating: no rating word, the unrated "?"
  await expect(b.locator('.rig-word')).toHaveCount(0);
  await expect(b.locator('.rig-q')).toHaveText('?');
  server!.send(gmcp('Event.Achieved {"what":"You have slain your first orc scout."}'));
  await expect(b).toHaveCount(2);
  await expect(b.nth(1).locator('.rig-title')).toHaveText('You have slain your first orc scout.');
  await expect(b.nth(0).locator('.rig-title')).toHaveText('An orc scout');
  // Stage 75: the race is read per balloon; `#weather balloon race` says what the client holds.
  server!.send(gmcp('Char.StatusVars {"race":"Dwarf","subrace":""}'));
  await page.locator('.wc-input-field').fill('#weather balloon race');
  await page.keyboard.press('Enter');
  await expect(rows(page).filter({ hasText: 'race "Dwarf", subrace ""; the passenger is the dwarf.' })).toHaveCount(1);
  server!.send(gmcp('Char.StatusVars {"race":"Man","subrace":"Dunadan"}'));
  await page.locator('.wc-input-field').fill('#weather balloon race');
  await page.keyboard.press('Enter');
  await expect(rows(page).filter({ hasText: 'race "Man", subrace "Dunadan"; the passenger is the human.' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

/** CSP violations as the page reports them (the dev server sends no policy; the production walk enforces one). */
async function watchCsp(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

test('stage 75: the dwarf flies every kind with the game\'s text, in the bundled faces, without an error', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  const csp = await watchCsp(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  const check = async (what: string, title: string, fig: string) => {
    const r = page.locator(`.wc-balloon > .rig.dwarf-v[data-mood="${what}"]`);
    await expect(r, what).toHaveCount(1);
    if (title) await expect(r.locator('.rig-title')).toHaveText(title);
    if (fig) await expect(r.locator('.rig-fig')).toHaveText(fig);
  };
  // a poor kill; a superb one once the first has left (a kill joins a readable kill's sign)
  await type(page, '#weather balloon as dwarf poor');
  await check('poor', 'A field mouse', '140xp');
  await expect(page.locator('.wc-balloons-sky .rig[data-mood="poor"]')).toHaveCount(1, { timeout: 20_000 });
  await type(page, '#weather balloon as dwarf superb');
  await check('superb', 'A cave troll', '12,400xp');
  // the moments, each on its own balloon
  await type(page, '#weather balloon as dwarf levelup');
  await type(page, '#weather balloon as dwarf death');
  await type(page, '#weather balloon as dwarf achievement');
  await check('levelup', '', 'Level 23!');
  await check('death', '', 'You died');
  await check('achievement', 'You have explored every room of the Old Forest, from the Withywindle to the Barrow-downs.', '');
  await expect(page.locator('.wc-balloon > .rig.dwarf-v')).toHaveCount(5);
  // four kills joined on one sign (a sixth balloon: the oldest fades out)
  await type(page, '#weather balloon as dwarf burst');
  await expect(page.locator('.rig-title').filter({ hasText: '4 kills' })).toHaveCount(1, { timeout: 8_000 });
  // the sign faces are the bundled ones, loaded
  const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/"/g, '').startsWith('WCB')).map((f) => `${f.family} ${f.weight} ${f.style} ${f.status}`));
  expect(faces.length).toBe(9);
  for (const f of faces) expect(f).toMatch(/loaded$/);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.rig-title')!).fontFamily)).toContain('WCB Cormorant');
  expect(errors).toEqual([]);
  expect(await csp()).toEqual([]);
});

test('stage 75: reduced motion: the rig\'s still form at the readable spot', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  await type(page, '#weather balloon good');
  const r = page.locator('.wc-balloons-front .wc-balloon > .rig');
  await expect(r).toHaveClass(/rig-rm/);
  await expect(r).toHaveClass(/rig-at/);
  await expect(r).toHaveClass(/rig-still/);
  const at = () => r.evaluate((e) => (e.parentElement as HTMLElement).style.transform);
  const t0 = await at();
  await page.waitForTimeout(1000);
  expect(await at()).toBe(t0);
  // no running animation anywhere in it
  expect(await r.evaluate((e) => e.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)).toBe(0);
  expect(errors).toEqual([]);
});

test('stage 75: Balloons off loads nothing of them: no rig, no passenger chunk, no sign face', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: false } }));
  await expect(page.locator('.wc-cockpit[data-weather]')).toHaveCount(1);
  await page.waitForTimeout(1500);
  await expect(layers(page)).toHaveCount(0);
  const fetched = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /balloons\/(notices|balloons|rig|passengers|fonts)|IMFell|Cinzel-Medium|CormorantGaramond-SemiBold/.test(n)));
  expect(fetched).toEqual([]);
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('WCB')))).toBe(false);
  // switched on and off again: the faces leave the document with the balloons
  await page.evaluate(() => window.__wc!.settings.update({ weather: { balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => [...document.fonts].filter((f) => f.family.includes('WCB')).length)).toBe(9);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { balloons: false } }));
  await expect(layers(page)).toHaveCount(0);
  expect(await page.evaluate(() => [...document.fonts].some((f) => f.family.includes('WCB')))).toBe(false);
  expect(await page.evaluate(() => document.querySelectorAll('style[data-wc-rig]').length)).toBe(0);
  expect(errors).toEqual([]);
});

/** The rig's CSS id per passenger (the Númenórean's is short). */
const CSS_ID: Record<string, string> = { dwarf: 'dwarf', elf: 'elf', human: 'human', hobbit: 'hobbit', troll: 'troll', goblin: 'goblin', orc: 'orc', numenorean: 'num' };
const IDS = Object.keys(CSS_ID);
/** The passenger modules the page has fetched (dev: the source modules; a build: the hashed chunks). */
/** Vite's dev server loads hundreds of modules: room for all of them in the resource timeline (call before goto). */
const roomForResources = (page: Page) => page.addInitScript(() => performance.setResourceTimingBufferSize(10_000));
const passengerChunks = (page: Page) =>
  page.evaluate((ids) => {
    const got = new Set<string>();
    for (const r of performance.getEntriesByType('resource')) {
      const m = /passengers\/(\w+)\.ts|\/assets\/(\w+)-[\w-]{8}\.js/.exec(r.name);
      const id = m?.[1] ?? m?.[2];
      if (id && ids.includes(id)) got.add(id);
    }
    return [...got].sort();
  }, IDS);

test('stage 75: all eight passengers fly, a kill and a moment each, each from its own chunk, without an error or a rig warning', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().startsWith('Rig:')) warnings.push(m.text());
  });
  const csp = await watchCsp(page);
  await roomForResources(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/?replay');
  await expect(page.locator('.wc-app')).toBeVisible();
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  // Not logged in: the player's passenger is the goblin, fetched when the balloons start, nothing else.
  await expect.poll(() => passengerChunks(page)).toEqual(['goblin']);
  const want = new Set(['goblin']);
  const moments = ['levelup', 'death', 'achievement'];
  for (const [i, id] of IDS.entries()) {
    const kill = (['poor', 'good', 'superb', 'pvp'] as const)[i % 4];
    await type(page, `#weather balloon as ${id} ${kill}`);
    await type(page, `#weather balloon as ${id} ${moments[i % 3]}`);
    const rigs = page.locator(`.wc-balloon > .rig.${CSS_ID[id]}-v`);
    await expect(rigs, id).toHaveCount(2);
    await expect(page.locator(`.wc-balloon > .rig.${CSS_ID[id]}-v[data-kind="kill"] .rig-fig`), id).toHaveText(/xp$/);
    await expect(page.locator(`.wc-balloon > .rig.${CSS_ID[id]}-v[data-kind="${moments[i % 3]}"]`), id).toHaveCount(1);
    want.add(id);
    expect(await passengerChunks(page), id).toEqual([...want].sort());
    // every sign ends inside the rig's 363 px
    for (const e of await rigs.locator('.rig-sign').all()) expect(await e.evaluate((s) => (s as HTMLElement).offsetTop + (s as HTMLElement).offsetHeight), id).toBeLessThanOrEqual(363);
    // the next passenger on a clear sky: off and on (the chunks stay cached)
    await page.evaluate(() => window.__wc!.settings.update({ weather: { balloons: false } }));
    await expect(layers(page)).toHaveCount(0);
    await page.evaluate(() => window.__wc!.settings.update({ weather: { balloons: true } }));
    await expect(layers(page)).toHaveCount(2);
  }
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
  expect(await csp()).toEqual([]);
});

test('stage 75: the race the game sends picks the passenger, per balloon', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  let server: { send(b: Buffer): void } | null = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.send(bytes([IAC, WILL, GMCP]));
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await page.evaluate(() => window.__wc!.settings.update({ weather: { enabled: true, balloons: true } }));
  await expect(layers(page)).toHaveCount(2);
  server!.send(gmcp('Char.Name {"name":"Balloonist","fullname":"Balloonist the Mock"}'));
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing · Balloonist/);
  server!.send(gmcp('Char.Vitals {"hp":100,"maxhp":100,"xp":5770000,"tp":41500}'));
  const rows5: Array<[string, string, string]> = [
    ['Dwarf', '', 'dwarf'],
    ['Elf', 'Noldo', 'elf'],
    ['Man', 'Dunadan', 'human'],
    ['Orc', 'Zaugurz', 'orc'],
    ['Ent', '', 'goblin'],
  ];
  for (const [race, sub, id] of rows5) {
    server!.send(gmcp(`Char.StatusVars {"race":"${race}","subrace":"${sub}"}`));
    server!.send(gmcp(`Event.Achieved {"what":"Played as ${race}/${sub}."}`));
    const sign = page.locator('.wc-balloon .rig-title').filter({ hasText: `Played as ${race}/${sub}.` });
    await expect(sign, race).toHaveCount(1);
    await expect(sign.locator(`xpath=ancestor::div[contains(@class,"rig ")][1]`), race).toHaveClass(new RegExp(`\\b${CSS_ID[id]}-v\\b`));
  }
  expect(errors).toEqual([]);
});
