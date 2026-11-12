// Stage 51g (ADR 0136 §12): text contrast on every surface of the phone's
// layout in the live game, on Black and on Paper.
//
// Method. Each surface is opened as a player opens it, and every visible
// element that holds text of its own (a text node; a field's value or
// placeholder) inside the phone's chrome is measured:
//
// - the text colour is the computed `color` (the placeholder's for an empty
//   field), its alpha multiplied by every `opacity` up the tree;
// - the background is what lies under it: the elements up the tree, from
//   the first opaque one, each background colour blended over the one
//   below. A gradient counts as its stop that gives the LEAST contrast (the
//   worst place the text could stand on). Under everything is the page's
//   terminal background;
// - the ratio is WCAG 2's, and must be at least 4.5 (3.0 for text of 24 px,
//   or 18.66 px bold, and more).
//
// Text over the game text (stage 52: the compass keys and the hot keys are
// see-through, a faint veil and a ring; the K ring). Two things are
// measured for these labels:
//
// - as for any text: the label against the key's own veil blended over the
//   PAGE background, as if no game text passed under it (the audit);
// - against its outline (`haloOf`): every glyph is outlined in the page's
//   colour by `text-shadow`s without blur in at least eight directions,
//   with a soft one beyond (shadows lie under the glyph in every browser;
//   no `-webkit-text-stroke`, which old Chromium paints over the letter).
//   The eye icon has the same shapes once more, wider, in that colour. Whatever game text passes under a key, the glyph's
//   nearest surround is that outline, so the label must reach 4.5:1 against
//   the outline's colour, the outline must be at least 1.5 px wide, and its
//   colour must be the page's. What a letter of game text does beyond the
//   outline cannot be bounded (it can be any colour) and is not measured.
//
// Disabled controls are reported (the test's annotations) and not failed.
// There is no other exemption.
//
// `phone` project (Pixel 7). Offline cockpit and a `page.routeWebSocket`
// mock for Comm; nothing reaches MUME.
import { type Page, type TestInfo, type WebSocketRoute, expect, test } from '@playwright/test';

interface Finding {
  text: string;
  where: string;
  ratio: number;
  need: number;
  fg: string;
  bg: string;
  disabled: boolean;
}

/** Measures every text element under the `roots` selectors (see the file header). Runs in the page. */
function audit(page: Page, roots: string[]): Promise<Finding[]> {
  return page.evaluate((roots) => {
    type RGBA = [number, number, number, number];
    const parse = (c: string): RGBA | null => {
      let m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(c.trim());
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4])];
      m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/.exec(c.trim());
      if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4])];
      if (c.trim() === 'transparent') return [0, 0, 0, 0];
      // Any other notation (`oklch()` from a `color-mix`): painted, and read back as sRGB.
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const x = cv.getContext('2d', { willReadFrequently: true });
      if (!x) return null;
      x.fillStyle = '#010203';
      x.fillStyle = c;
      if (x.fillStyle === '#010203') return null;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      if (d[3] === 0) return [0, 0, 0, 0];
      // Un-premultiplied by the canvas already; alpha 0–255.
      return [d[0]!, d[1]!, d[2]!, d[3]! / 255];
    };
    const over = (top: RGBA, under: RGBA): RGBA => {
      const a = top[3];
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
    };
    const lum = (c: RGBA): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: RGBA, b: RGBA): number => {
      const x = lum(a), y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const hex = (c: RGBA): string => `#${[0, 1, 2].map((i) => Math.round(c[i]!).toString(16).padStart(2, '0')).join('')}`;
    /** The colours named in a `background-image` (gradient stops). */
    const stops = (image: string): RGBA[] => {
      const out: RGBA[] = [];
      for (const m of image.matchAll(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g)) {
        const c = parse(m[0]);
        if (c) out.push(c);
      }
      return out;
    };
    const cockpit = document.querySelector<HTMLElement>('.wc-cockpit')!;
    const page: RGBA = parse(getComputedStyle(cockpit).backgroundColor) ?? [0, 0, 0, 1];
    const pageBg: RGBA = page[3] < 1 ? (parse(getComputedStyle(document.body).backgroundColor) ?? [0, 0, 0, 1]) : page;

    /**
     * The background under `el` for text of colour `fg`: the layers up the
     * tree blended from the first opaque one; of a gradient, the stop that
     * leaves the least contrast.
     */
    const backgroundOf = (el: Element, fg: RGBA): RGBA => {
      const layers: RGBA[][] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        const here: RGBA[][] = [];
        // A layer's images lie over its colour.
        const img = cs.backgroundImage;
        if (img && img !== 'none') {
          const s = stops(img);
          if (s.length) here.push(s);
        }
        const col = parse(cs.backgroundColor);
        if (col && col[3] > 0) here.push([col]);
        layers.push(...here);
        if (col && col[3] >= 1) break;
        if (e === cockpit) break;
      }
      // Bottom up; for a gradient, every stop is tried and the worst kept.
      let under: RGBA[] = [pageBg];
      for (const layer of layers.reverse()) {
        const next: RGBA[] = [];
        for (const u of under) for (const c of layer) next.push(over(c, u));
        // Keep the candidates few: the two extremes by luminance are enough for "worst".
        next.sort((a, b) => lum(a) - lum(b));
        under = next.length > 2 ? [next[0]!, next[next.length - 1]!] : next;
      }
      return under.reduce((worst, b) => (ratio(over(fg, b), b) < ratio(over(fg, worst), worst) ? b : worst));
    };

    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      // On screen (a scrolled page's rows above or below its viewport are judged when scrolled to).
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) return false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility !== 'visible') return false;
      }
      return true;
    };
    const opacityOf = (el: Element): number => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity) || (getComputedStyle(e).opacity === '0' ? 0 : 1);
      return o;
    };
    const disabledOf = (el: Element): boolean => el.closest(':disabled, [aria-disabled="true"]') !== null;
    const path = (el: Element): string => {
      const parts: string[] = [];
      for (let e: Element | null = el; e && parts.length < 3; e = e.parentElement) {
        const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
        parts.unshift(`${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`);
      }
      return parts.join(' > ');
    };

    const out: Finding[] = [];
    const seen = new Set<Element>();
    const measure = (el: Element, text: string, colour: string): void => {
      const c = parse(colour);
      if (!c) throw new Error(`contrast: a colour that cannot be read: ${colour} on ${path(el)}`);
      const fgRaw: RGBA = [c[0], c[1], c[2], c[3] * opacityOf(el)];
      const bg = backgroundOf(el, fgRaw);
      const fg = over(fgRaw, bg);
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      out.push({ text: text.trim().slice(0, 40), where: path(el), ratio: Math.floor(ratio(fg, bg) * 100) / 100, need: large ? 3 : 4.5, fg: hex(fg), bg: hex(bg), disabled: disabledOf(el) });
    };
    for (const sel of roots) {
      for (const root of document.querySelectorAll(sel)) {
        const all = [root, ...root.querySelectorAll('*')];
        for (const el of all) {
          if (seen.has(el) || !visible(el)) continue;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            seen.add(el);
            if (el instanceof HTMLInputElement && el.type === 'password') continue;
            if (el.value !== '') measure(el, el.value, getComputedStyle(el).color);
            else if (el.placeholder) measure(el, el.placeholder, getComputedStyle(el, '::placeholder').color);
            continue;
          }
          const own = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '');
          if (own.length === 0) continue;
          seen.add(el);
          measure(el, own.map((n) => n.textContent).join(' '), getComputedStyle(el).color);
        }
      }
    }
    return out;
  }, roots);
}

/**
 * The outline of a see-through key's label (see the file header): its
 * width in px, whether its colour is the page's, and the label's contrast
 * against it. For the eye icon: the wider copy under it (`wc-ph-ico-halo`)
 * against the icon's stroke.
 */
function haloOf(page: Page, sel: string): Promise<{ width: number; isPage: boolean; ratio: number; shadow: string }[]> {
  return page.evaluate((sel) => {
    const rgb = (c: string): [number, number, number] => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const x = cv.getContext('2d', { willReadFrequently: true })!;
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!];
    };
    const lum = (c: [number, number, number]): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: [number, number, number], b: [number, number, number]): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const cockpit = document.querySelector<HTMLElement>('.wc-cockpit')!;
    const pageBg = rgb(getComputedStyle(cockpit).backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : getComputedStyle(cockpit).backgroundColor);
    return [...document.querySelectorAll<HTMLElement>(sel)].map((el) => {
      const cs = getComputedStyle(el);
      const icon = el.querySelector('svg');
      if (icon) {
        const halo = getComputedStyle(icon.querySelector('.wc-ph-ico-halo')!);
        const line = getComputedStyle(icon.querySelector(':not(.wc-ph-ico-halo)')!);
        const h = rgb(halo.stroke);
        // (The copy is wider than the line on both sides; in the icon's own 24 px units, drawn at 18 px.)
        return { width: ((parseFloat(halo.strokeWidth) - parseFloat(line.strokeWidth)) / 2) * (18 / 24), isPage: ratio(h, pageBg) < 1.02, ratio: ratio(rgb(line.stroke), h), shadow: 'icon' };
      }
      // The computed shadows: `<colour> <x>px <y>px <blur>px`, comma-separated.
      const shadows = [...cs.textShadow.matchAll(/(rgba?\([^)]*\)|color\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].map((m) => ({ c: rgb(m[1]!), x: Number(m[2]), y: Number(m[3]), blur: Number(m[4]) }));
      const hard = shadows.filter((sh) => sh.blur === 0 && (sh.x !== 0 || sh.y !== 0));
      // Eight directions: one hard shadow at least in each 45° sector.
      const sectors = new Set(hard.map((sh) => Math.round((Math.atan2(sh.y, sh.x) * 4) / Math.PI + 8) % 8));
      // The outline is as wide as the farthest hard shadows reach, where every sector has one.
      const reach = sectors.size === 8 ? Math.min(...[...sectors].map((k) => Math.max(...hard.filter((sh) => Math.round((Math.atan2(sh.y, sh.x) * 4) / Math.PI + 8) % 8 === k).map((sh) => Math.hypot(sh.x, sh.y))))) : 0;
      const worst = shadows.length ? Math.min(...shadows.map((sh) => ratio(rgb(cs.color), sh.c))) : 0;
      const stroke = parseFloat(cs.webkitTextStrokeWidth) || 0;
      return { width: reach, isPage: shadows.length > 0 && shadows.every((sh) => ratio(sh.c, pageBg) < 1.02), ratio: worst, shadow: `${shadows.some((sh) => sh.blur > 0) ? 'soft' : 'none'}|${stroke}` };
    });
  }, sel);
}

type Theme = 'black' | 'paper';
const THEMES: Theme[] = ['black', 'paper'];

/** Paper as the Appearance settings set it (the phone's Theme switch does the same). */
async function setTheme(page: Page, theme: Theme): Promise<void> {
  if (theme === 'black') return;
  await page.locator('.wc-ph-menu').tap();
  await page.locator('.wc-ph-sheet').waitFor();
  await page.locator('.wc-ph-sheet .wc-ph-swatch.is-paper').tap();
  await expect(page.locator('html')).toHaveAttribute('data-light', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('.wc-ph-sheet')).toBeHidden();
}

/** The phone's chrome on the main screen. */
const MAIN = ['.wc-ph-layer', '.wc-cockpit > .wc-input-slot'];

/** Fails on any enabled text under its ratio; the lowest ratios and the disabled ones go to the report. */
function judge(found: Finding[], surface: string, theme: Theme, info: TestInfo, least = 1): void {
  expect(found.length, `${surface} (${theme}): text was measured`).toBeGreaterThanOrEqual(least);
  const enabled = found.filter((f) => !f.disabled);
  const lowest = [...enabled].sort((a, b) => a.ratio / a.need - b.ratio / b.need)[0];
  if (lowest) info.annotations.push({ type: 'contrast', description: `${surface} (${theme}): ${found.length} texts, lowest ${lowest.ratio} ("${lowest.text}", ${lowest.fg} on ${lowest.bg})` });
  for (const f of found.filter((x) => x.disabled && x.ratio < x.need))
    info.annotations.push({ type: 'contrast-disabled', description: `${surface} (${theme}): disabled "${f.text}" ${f.ratio} (${f.fg} on ${f.bg}), not failed` });
  const bad = enabled.filter((f) => f.ratio < f.need).map((f) => `${f.ratio} < ${f.need}  "${f.text}"  ${f.fg} on ${f.bg}  ${f.where}`);
  expect(bad, `${surface} (${theme}): text under its contrast`).toEqual([]);
}

/**
 * The own keyboard's icon keys (shift, backspace, fold, Enter, the history
 * arrows, space's mark): the icon's colour (the key's `color`, which its
 * strokes take) against the cap it is drawn on (of a gradient, the stop
 * that leaves the least contrast). Graphics, not text: WCAG 2's 3:1 for
 * what is needed to tell a control (1.4.11). `disabled`: a dimmed key
 * (`aria-disabled`), reported and not failed, as disabled text is.
 */
function iconsOf(page: Page): Promise<{ act: string; ratio: number; fg: string; bg: string; disabled: boolean }[]> {
  return page.evaluate(() => {
    const rgb = (c: string): [number, number, number] => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const x = cv.getContext('2d', { willReadFrequently: true })!;
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0]!, d[1]!, d[2]!];
    };
    const lum = (c: [number, number, number]): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: [number, number, number], b: [number, number, number]): number => {
      const x = lum(a), y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const hex = (c: [number, number, number]): string => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    const out: { act: string; ratio: number; fg: string; bg: string; disabled: boolean }[] = [];
    for (const key of document.querySelectorAll<HTMLElement>('.wc-ph-okb .wc-ph-okb-k')) {
      const ico = key.querySelector('svg.wc-ph-ico');
      const cap = key.querySelector('.wc-ph-okb-cap');
      if (!ico || !cap || key.getBoundingClientRect().width < 1) continue;
      // The strokes are the key's colour (`currentColor`).
      const stroke = getComputedStyle(ico).stroke;
      const fg = rgb(stroke && stroke !== 'none' ? stroke : getComputedStyle(key).color);
      const cs = getComputedStyle(cap);
      const stops = cs.backgroundImage !== 'none' ? [...cs.backgroundImage.matchAll(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g)].map((m) => rgb(m[0])) : [];
      const grounds = stops.length ? stops : [rgb(cs.backgroundColor)];
      const bg = grounds.reduce((worst, b) => (ratio(fg, b) < ratio(fg, worst) ? b : worst));
      out.push({ act: key.dataset.act ?? '?', ratio: Math.floor(ratio(fg, bg) * 100) / 100, fg: hex(fg), bg: hex(bg), disabled: key.getAttribute('aria-disabled') === 'true' });
    }
    return out;
  });
}

/** Fails on an enabled icon key under 3:1; the lowest and the dimmed ones go to the report. */
function judgeIcons(found: Awaited<ReturnType<typeof iconsOf>>, surface: string, theme: Theme, info: TestInfo, least: number): void {
  expect(found.length, `${surface} (${theme}): icon keys were measured`).toBeGreaterThanOrEqual(least);
  const enabled = found.filter((f) => !f.disabled);
  const lowest = [...enabled].sort((a, b) => a.ratio - b.ratio)[0];
  if (lowest) info.annotations.push({ type: 'contrast', description: `${surface} (${theme}): ${found.length} icon keys, lowest ${lowest.ratio} (${lowest.act}, ${lowest.fg} on ${lowest.bg})` });
  for (const f of found.filter((x) => x.disabled))
    info.annotations.push({ type: 'contrast-disabled', description: `${surface} (${theme}): dimmed key ${f.act} ${f.ratio} (${f.fg} on ${f.bg}), not failed` });
  expect(enabled.filter((f) => f.ratio < 3).map((f) => `${f.ratio} < 3  ${f.act}  ${f.fg} on ${f.bg}`), `${surface} (${theme}): an icon key under its contrast`).toEqual([]);
}

async function openPhone(page: Page): Promise<void> {
  await page.goto('/?replay&phone=1');
  await expect(page.locator('.wc-ph-pad')).toBeVisible();
}

/** Replays the GMCP demo up to the line before the first one holding `cut` (whole without it). */
async function play(page: Page, cut?: string): Promise<void> {
  await page.evaluate(async (cut) => {
    let text = await (await fetch('/__fixtures/gmcp-demo.log')).text();
    if (cut !== undefined) {
      const lines = text.split('\n');
      text = lines.slice(0, lines.findIndex((l) => l.includes(cut))).join('\n') + '\n';
    }
    window.__wc!.app.startReplay(text, 'gmcp-demo.log', 0);
  }, cut);
  await expect(page.locator('.wc-rows .wc-row').filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
}
const FIGHT = 'Group.Update {"id":3,"hp":61}';

async function holdKey(page: Page, n: number): Promise<void> {
  const b = (await page.locator(`.wc-ph-hk[data-hk="${n - 1}"]`).boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2, id: 0 }] });
  await expect(page.locator('.wc-ph-rb')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const theme of THEMES) {
  test.describe(theme, () => {
    test('the main screen: fight card, lens keys and badge, compass, K, hot keys, command field; pressed and held keys', async ({ page }, info) => {
      await openPhone(page);
      await setTheme(page, theme);
      await play(page, FIGHT);
      await expect(page.locator('.wc-ph-fight')).toBeVisible();
      judge(await audit(page, MAIN), 'main', theme, info, 12);
      // The see-through keys (the file header: text over game text): hardly any backing, and every
      // label outlined in the page's colour, against which it reaches 4.5:1.
      for (const sel of ['.wc-ph-hk', '.wc-ph-key[data-cmd]']) {
        const alphas = await page.locator(sel).evaluateAll((els) => els.map((e) => Number(/[\d.]+\)$/.exec(getComputedStyle(e).backgroundColor.replace(/^rgb\(.*$/, '1)'))![0].slice(0, -1))));
        expect(alphas.length, `${sel}: keys`).toBeGreaterThanOrEqual(3);
        for (const a of alphas) expect(a, `${sel}: the veil's alpha`).toBeLessThanOrEqual(0.15);
        expect(await page.locator(sel).first().evaluate((e) => getComputedStyle(e).backdropFilter), `${sel}: no backdrop filter`).toBe('none');
      }
      const halos = [...(await haloOf(page, '.wc-ph-hk')), ...(await haloOf(page, '.wc-ph-key[data-cmd]'))];
      // Three hot keys and the eight compass keys (seven letters and the eye).
      expect(halos).toHaveLength(11);
      for (const h of halos) {
        expect(h.isPage, 'the outline is the page\'s colour').toBe(true);
        expect(h.width, 'the outline\'s width').toBeGreaterThanOrEqual(1.5);
        expect(h.ratio, 'a label against its outline').toBeGreaterThanOrEqual(4.5);
        if (h.shadow !== 'icon') {
          expect(h.shadow.split('|')[0], 'the soft shadow round the outline').toBe('soft');
          // No text stroke (old Chromium paints it over the glyph): the shadows are the outline.
          expect(Number(h.shadow.split('|')[1]), 'no text stroke').toBe(0);
        }
      }
      info.annotations.push({ type: 'contrast', description: `see-through keys (${theme}): lowest label against its outline ${Math.min(...halos.map((h) => Math.floor(h.ratio * 100) / 100))}` });
      // K unlit (the column hidden).
      await page.locator('.wc-ph-key.is-tog').tap();
      await expect(page.locator('.wc-ph-hot')).toBeHidden();
      judge(await audit(page, ['.wc-ph-pad']), 'compass, K unlit', theme, info, 8);
      // Unlit, the K ring is see-through as well: its letter keeps the halo.
      expect(await page.locator('.wc-ph-key.is-tog:not(.is-on) .wc-ph-kk').evaluate((e) => getComputedStyle(e).textShadow)).not.toBe('none');
      await page.locator('.wc-ph-key.is-tog').tap();
      // Pressed keys: the lit look (`:active`), held by a finger that stays down.
      const cdp = await page.context().newCDPSession(page);
      for (const sel of ['.wc-ph-key[data-cmd="north"]', '.wc-ph-key[data-cmd="flee"]']) {
        const b = (await page.locator(sel).boundingBox())!;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + 20, y: b.y + 20, id: 0 }] });
        judge(await audit(page, [sel]), `pressed ${sel}`, theme, info);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await cdp.detach();
      // The lens hidden: the keys' row (the Comm key's badge on it).
      await page.evaluate(() => window.__wc!.settings.update({ phone: { lens: { show: false } } }));
      await expect(page.locator('.wc-ph-satrow')).toBeVisible();
      judge(await audit(page, MAIN), 'main, key row', theme, info, 12);
    });

    test('the hot key box: every part, a special\'s token, the error line; the held key', async ({ page }, info) => {
      await openPhone(page);
      await setTheme(page, theme);
      await play(page, FIGHT);
      await holdKey(page, 3);
      judge(await audit(page, ['.wc-ph-rb', '.wc-ph-hot']), 'box (special)', theme, info, 14);
      await page.locator('.wc-ph-rb .wc-ph-chip[data-pick="custom"]').tap();
      // Nothing to send: Save refuses (the error line).
      await page.locator('#wc-ph-rb-command').fill('   ');
      await page.locator('.wc-ph-rb .wc-ph-bt.is-go').tap();
      await expect(page.locator('.wc-ph-rb-err')).toBeVisible();
      judge(await audit(page, ['.wc-ph-rb']), 'box (error)', theme, info, 14);
      // An empty field: its placeholder, if it has one, and the unselected chips.
      await page.locator('#wc-ph-rb-command').fill('');
      await page.locator('#wc-ph-rb-label').fill('');
      judge(await audit(page, ['.wc-ph-rb']), 'box (empty)', theme, info, 10);
    });

    test('the menu sheet: status, rows, the stepper at its end, the themes, Exit', async ({ page }, info) => {
      await openPhone(page);
      await setTheme(page, theme);
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await expect(page.locator('.wc-ph-sheet')).toBeVisible();
      judge(await audit(page, ['.wc-ph-menu-host']), 'sheet', theme, info, 8);
      // The stepper at the smallest size: A− is disabled (reported, not failed); the rest still holds.
      await page.evaluate(() => window.__wc!.settings.update({ appearance: { size: 6 } }));
      judge(await audit(page, ['.wc-ph-menu-host']), 'sheet (smallest text)', theme, info, 8);
    });

    test('the Exit session confirmation: the hood, the warning, the rating, Cancel and Exit', async ({ page }, info) => {
      // A live session against a mock: it has a run to rate (a replay has none).
      const IAC = 255, WILL = 251, SB = 250, SE = 240, GMCP = 201;
      const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);
      let server: WebSocketRoute | null = null;
      await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
        server = ws;
        ws.send(Buffer.from([IAC, WILL, GMCP]));
      });
      await page.goto('/?phone=1');
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
      await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
      server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
      await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
      server!.send(gmcp('Char.Vitals', { hp: 100, maxhp: 100, xp: 5770000, tp: 41500 }));
      await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
      await setTheme(page, theme);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet [data-row="exit"]').tap();
      await expect(page.locator('.wc-ph-exitsheet')).toBeVisible();
      await expect(page.locator('.wc-ph-exitsheet .wc-ph-stars')).toBeVisible();
      judge(await audit(page, ['.wc-ph-menu-host']), 'exit', theme, info, 5);
      await page.locator('.wc-ph-exitsheet [data-star="3"]').tap();
      await expect(page.locator('.wc-ph-exitsheet [data-act="clear"]')).toBeVisible();
      judge(await audit(page, ['.wc-ph-menu-host']), 'exit (rated)', theme, info, 6);
    });

    test('six hot keys in two columns', async ({ page }, info) => {
      await openPhone(page);
      await setTheme(page, theme);
      await play(page, FIGHT);
      await page.evaluate(() => window.__wc!.settings.update({ phone: { hotkeyCount: 6 } }));
      await expect(page.locator('.wc-ph-hk')).toHaveCount(6);
      judge(await audit(page, ['.wc-ph-hot']), 'six hot keys', theme, info, 6);
    });

    test('the Timers and Group sub-page, top to bottom, and one of its lists', async ({ page }, info) => {
      await openPhone(page);
      await setTheme(page, theme);
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
      await page.locator('.wc-ph-page [data-row="timers-group"]').tap();
      await expect(page.locator('.wc-ph-page[data-page="sub:timers-group"]')).toBeVisible();
      let total = 0;
      for (const g of ['timers', 'timer-groups', 'group']) {
        await page.locator(`.wc-ph-page [data-group="${g}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
        const found = await audit(page, ['.wc-ph-menu-host']);
        total += found.length;
        judge(found, `timers and group, ${g}`, theme, info, 4);
      }
      expect(total).toBeGreaterThan(20);
      await page.locator('.wc-ph-page [data-row="group-npcs"]').tap();
      await expect(page.locator('.wc-ph-page[data-page="pick:group-npcs"]')).toBeVisible();
      judge(await audit(page, ['.wc-ph-menu-host']), 'timers and group, NPC list', theme, info, 3);
    });

    test('the settings page: every group and row kind, top to bottom, and the font list', async ({ page }, info) => {
      await openPhone(page);
      await setTheme(page, theme);
      await play(page);
      await page.locator('.wc-ph-menu').tap();
      await page.locator('.wc-ph-sheet [data-row="settings"]').tap();
      await expect(page.locator('.wc-ph-page')).toBeVisible();
      const groups = await page.locator('.wc-ph-page [data-group]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.group!));
      expect(groups).toEqual(['text', 'compass', 'keyboard', 'lens', 'panes', 'comm', 'connection']);
      let total = 0;
      for (const g of groups) {
        await page.locator(`.wc-ph-page [data-group="${g}"]`).evaluate((el) => el.scrollIntoView({ block: 'center' }));
        const found = await audit(page, ['.wc-ph-menu-host']);
        total += found.length;
        judge(found, `settings, ${g}`, theme, info, 3);
      }
      expect(total).toBeGreaterThan(40);
      await page.locator('.wc-ph-page [data-group="text"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.locator('.wc-ph-page [data-row="font"]').tap();
      await expect(page.locator('.wc-ph-page[data-page="pick:font"]')).toBeVisible();
      judge(await audit(page, ['.wc-ph-menu-host']), 'settings, font list', theme, info, 2);
    });

    test('the strip\'s chrome over each pane, and the fight card under it', async ({ page }, info) => {
      await openPhone(page);
      await setTheme(page, theme);
      await play(page, FIGHT);
      // Character is out of the strip by default (stage 52): in, so its page is measured too.
      await page.evaluate(() => {
        const s = window.__wc!.settings;
        s.update({ phone: { strip: { panes: s.get().phone.strip.panes.map((e) => ({ ...e, on: true })) } } });
      });
      for (const n of [1, 2, 3, 4]) {
        await page.keyboard.press(`Control+${n}`);
        await expect(page.locator('.wc-ph-strip')).toHaveAttribute('aria-label', new RegExp(`${n} of 4$`));
        judge(await audit(page, ['.wc-ph-strip', '.wc-ph-fight']), `strip page ${n}`, theme, info, 2);
      }
    });

    test('Comm\'s reply line (enabled, typed in, and at a password prompt) and its band', async ({ page }, info) => {
      const IAC = 255, WILL = 251, SB = 250, SE = 240, GMCP = 201;
      const gmcp = (pkg: string, data: unknown): Buffer => Buffer.concat([Buffer.from([IAC, SB, GMCP]), Buffer.from(`${pkg} ${JSON.stringify(data)}`, 'utf8'), Buffer.from([IAC, SE])]);
      let server: WebSocketRoute | null = null;
      await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
        server = ws;
        ws.send(Buffer.from([IAC, WILL, GMCP]));
      });
      await page.goto('/?phone=1');
      await expect(page.locator('.wc-start .wc-sm-item.is-sel .wc-sm-label')).toHaveText('Enter MUME');
      await page.locator('.wc-start .wc-sm-item[data-key="enter"]').tap();
      await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
      server!.send(gmcp('Char.Name', { name: 'Rasta', fullname: 'Rasta the Mock' }));
      await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^playing/);
      await expect(page.locator('.wc-start')).toBeHidden({ timeout: 15_000 });
      await setTheme(page, theme);
      server!.send(gmcp('Comm.Channel.Text', { channel: 'tells', talker: 'Gibur', 'talker-type': 'player', text: "Gibur tells you 'you at the ford?'" }));
      await page.locator('.wc-ph-sat[data-sat="comm"]:visible').tap();
      const comm = page.locator('.wc-cockpit > .wc-pane[data-pane="comm"]');
      await comm.locator('.wc-cm-ent[aria-label^="Gibur"]').tap();
      const reply = comm.locator('.wc-cm-rinput');
      await expect(reply).toBeEnabled();
      // The phone-styled parts: the reply row, and the band; the lens's keys as a row over it.
      const parts = ['.wc-cockpit > .wc-pane[data-pane="comm"] .wc-cm-reply', '.wc-ph-layer'];
      judge(await audit(page, parts), 'Comm, empty reply (placeholder)', theme, info, 3);
      await reply.tap();
      await page.keyboard.type('on my way');
      judge(await audit(page, parts), 'Comm, typed reply', theme, info, 3);
      await reply.fill('');
      // A password prompt: the reply line is disabled (reported, not failed).
      server!.send(Buffer.concat([Buffer.from('Password: '), Buffer.from([IAC, WILL, 1])]));
      await expect(reply).toBeDisabled();
      const found = await audit(page, parts);
      expect(found.some((f) => f.disabled && f.text === 'Not connected')).toBe(true);
      judge(found, 'Comm, reply disabled', theme, info, 3);
    });
    test('the own keyboard (?kbd=sv): letters, the digit row, symbols, shift once and locked, a pressed key, the icon keys lit and dimmed; solid keys', async ({ page }, info) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto('/?replay&phone=1&kbd=sv');
      await expect(page.locator('.wc-ph-pad')).toBeVisible();
      await setTheme(page, theme);
      await page.evaluate(() => window.__wc!.settings.update({ phone: { keyboard: { digits: true } } }));
      await page.locator('.wc-input-slot .wc-input-field').tap();
      const okb = page.locator('.wc-ph-okb');
      await expect(okb).toBeVisible();
      const key = (k: string) => okb.locator(k.length === 1 ? `.wc-ph-okb-k[data-ch="${k}"]` : `.wc-ph-okb-k[data-act="${k}"]`);
      // Letters, digits and the labelled keys (the symbols' key, the digit row's lit toggle).
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, letters', theme, info, 29 + 10 + 2);
      // Shift once, then locked: the capitals.
      await key('shift').tap();
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, shift', theme, info, 41);
      await key('shift').tap();
      await expect(okb).toHaveAttribute('data-shift', 'lock');
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, shift locked', theme, info, 41);
      await key('shift').tap();
      // The digit row's toggle unlit.
      await key('digits').tap();
      await expect(key('digits')).toHaveAttribute('aria-pressed', 'false');
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, digit row folded', theme, info, 31);
      // Symbols, both pages.
      await key('sym').tap();
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, symbols 1', theme, info, 30);
      await key('alt').tap();
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, symbols 2', theme, info, 20);
      await key('sym').tap();
      // A pressed key (the class the press sets), a letter and a labelled one.
      await okb.evaluate((el) => {
        el.querySelector('.wc-ph-okb-k[data-ch="q"]')!.classList.add('is-down');
        el.querySelector('.wc-ph-okb-k[data-act="sym"]')!.classList.add('is-down');
      });
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, pressed', theme, info, 31);
      await okb.evaluate((el) => el.querySelectorAll('.is-down').forEach((k) => k.classList.remove('is-down')));
      // The icon keys (53e): shift, backspace, the fold key, Enter, space's mark and the two history
      // arrows (on the bottom row at this width). Lit, in every state of shift.
      const acts = (f: { act: string }[]): string[] => f.map((x) => x.act).sort();
      const plain = await iconsOf(page);
      expect(acts(plain)).toEqual(['back', 'enter', 'fold', 'newer', 'older', 'shift', 'space']);
      expect(plain.some((f) => f.disabled)).toBe(false);
      judgeIcons(plain, 'own keyboard, icon keys', theme, info, 7);
      await key('shift').tap();
      judgeIcons(await iconsOf(page), 'own keyboard, icon keys, shift', theme, info, 7);
      await key('shift').tap();
      await expect(okb).toHaveAttribute('data-shift', 'lock');
      judgeIcons(await iconsOf(page), 'own keyboard, icon keys, shift locked', theme, info, 7);
      await key('shift').tap();
      // Dimmed keys: at a password prompt the line has no history and the arrows are dimmed
      // (reported, not failed, as every disabled control here). The others stay lit.
      await page.evaluate(() => window.__wc!.app.bus.emit('telnet.echo', { serverEchoes: true }));
      await expect(key('older')).toHaveAttribute('aria-disabled', 'true');
      const dimmed = await iconsOf(page);
      expect(acts(dimmed.filter((f) => f.disabled))).toEqual(['newer', 'older']);
      judgeIcons(dimmed, 'own keyboard, arrows dimmed', theme, info, 7);
      // A dimmed arrow is still told from its cap, and from a lit one.
      for (const f of dimmed.filter((x) => x.disabled)) {
        expect(f.ratio, `dimmed ${f.act} against its cap`).toBeGreaterThan(1.5);
        expect(f.fg, `dimmed ${f.act} against the lit colour`).not.toBe(plain.find((x) => x.act === f.act)!.fg);
      }
      // The keyboard's texts with the arrows dimmed (the same letters; nothing else changed).
      judge(await audit(page, ['.wc-ph-okb']), 'own keyboard, arrows dimmed', theme, info, 31);
      await page.evaluate(() => window.__wc!.app.bus.emit('telnet.echo', { serverEchoes: false }));
      await expect(key('older')).not.toHaveAttribute('aria-disabled');
      // Solid: the band and every cap are opaque, and nothing is filtered.
      const paint = await okb.evaluate((el) => {
        // Computed colours: `rgb(r, g, b)` is opaque, `rgba(r, g, b, a)` has its alpha last.
        const alpha = (c: string): number => (c.startsWith('rgba(') ? Number(c.slice(5, -1).split(',')[3]) : c.startsWith('rgb(') ? 1 : 0);
        const caps = [...el.querySelectorAll('.wc-ph-okb-cap')].map((c) => getComputedStyle(c));
        return {
          band: alpha(getComputedStyle(el).backgroundColor),
          // A cap's ground is a gradient of opaque stops, or an opaque colour.
          caps: caps.every((cs) => (cs.backgroundImage !== 'none' ? /rgb\(/.test(cs.backgroundImage) && !cs.backgroundImage.includes('rgba(') : alpha(cs.backgroundColor) === 1)),
          filters: [getComputedStyle(el), ...caps].every((cs) => cs.backdropFilter === 'none' && cs.filter === 'none'),
          animated: [getComputedStyle(el), ...caps].some((cs) => cs.animationName !== 'none' || parseFloat(cs.transitionDuration) > 0),
        };
      });
      expect(paint).toEqual({ band: 1, caps: true, filters: true, animated: false });
    });
  });
}
