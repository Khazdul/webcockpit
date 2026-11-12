// @vitest-environment happy-dom
// ADR 0139, round 53f: our own keyboard on the phone's pages. The plan (the
// keyboard's place and the page's reserve, pure) and the mount's rules:
// which fields are its own, what opens and closes it, how Enter is sent.
// The real layout and taps are in tests/e2e/phone-own-keyboard-pages.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_KEEP_PX, type PageKeyboardHandle, mountPageKeyboard, pageKeyboardPlan } from '../../src/phone/keyboard-pages';
import { OKB_PAD_X, OKB_UNIT_MAX, OKB_UNIT_MAX_LAND, okbHeightPx } from '../../src/phone/keyboard-model';
import { defaultSettings } from '../../src/settings/types';
import type { SettingsStore } from '../../src/settings';
import type { Settings } from '../../src/settings/types';

describe('pageKeyboardPlan', () => {
  it('portrait 360 × 800: the block over the full width, the game layout\'s height', () => {
    const p = pageKeyboardPlan(360, 800, 'sv', false)!;
    expect(p).toMatchObject({ landscape: false, digits: false, left: 0, width: 360 });
    expect(p.height).toBe(okbHeightPx(false, 800, false));
    expect(pageKeyboardPlan(360, 800, 'sv', true)!.height).toBe(okbHeightPx(false, 800, true));
  });

  it('a wide portrait page: the keys keep their largest width and the block stands in the middle', () => {
    const p = pageKeyboardPlan(700, 1000, 'en', false)!;
    expect(p.width).toBe(10 * OKB_UNIT_MAX + 2 * OKB_PAD_X);
    expect(p.left).toBe((700 - p.width) / 2);
  });

  it('landscape 800 × 360: the low rows, the block compressed towards the middle', () => {
    const p = pageKeyboardPlan(800, 360, 'en', false)!;
    expect(p.landscape).toBe(true);
    expect(p.height).toBe(okbHeightPx(true, 360, false));
    expect(p.width).toBe(10 * OKB_UNIT_MAX_LAND + 2 * OKB_PAD_X);
    expect(p.left).toBe((800 - p.width) / 2);
    expect(360 - p.height).toBeGreaterThanOrEqual(PAGE_KEEP_PX);
  });

  it('the digit row gives way where the page would keep too little, and then the keyboard', () => {
    // Landscape 800 × 320: five rows leave under the least, four do not.
    const five = okbHeightPx(true, 320, true);
    const four = okbHeightPx(true, 320, false);
    expect(320 - five).toBeLessThan(PAGE_KEEP_PX);
    expect(320 - four).toBeGreaterThanOrEqual(PAGE_KEEP_PX);
    expect(pageKeyboardPlan(800, 320, 'en', true)).toMatchObject({ digits: false, height: four });
    expect(pageKeyboardPlan(800, 240, 'en', true)).toBeNull();
    expect(pageKeyboardPlan(0, 0, 'en', false)).toBeNull();
  });
});

// ------------------------------------------------------------------ the mount

function store(): SettingsStore & { state: Settings } {
  const subs = new Set<(n: Settings, p: Settings) => void>();
  const s = {
    state: defaultSettings(),
    get: () => s.state,
    update(u: { phone?: { keyboard?: Partial<Settings['phone']['keyboard']>; vibrate?: boolean } }) {
      const prev = s.state;
      s.state = { ...prev, phone: { ...prev.phone, ...u.phone, keyboard: { ...prev.phone.keyboard, ...u.phone?.keyboard } } } as Settings;
      for (const fn of subs) fn(s.state, prev);
    },
    subscribe(fn: (n: Settings, p: Settings) => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  return s as unknown as SettingsStore & { state: Settings };
}

let root: HTMLElement;
let page: HTMLElement;
let kb: PageKeyboardHandle;
let sent: Array<[Element, string]>;
let ups: boolean[];
let settings: ReturnType<typeof store>;

function mk(tag: 'input' | 'textarea', marked = true, kind?: string): HTMLInputElement | HTMLTextAreaElement {
  const el = document.createElement(tag);
  if (marked) {
    el.setAttribute('inputmode', 'none');
    el.setAttribute('virtualkeyboardpolicy', 'manual');
  }
  if (kind) el.setAttribute('data-okb-kind', kind);
  page.append(el);
  return el;
}

/** A tap: the pointer, the focus it brings, its release and the click. */
function tap(el: HTMLElement): void {
  el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  el.focus();
  el.dispatchEvent(new Event('pointerup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

const keyEl = (sel: string): HTMLElement => kb.el.querySelector<HTMLElement>(sel)!;
/** A key by its character or its act, pressed and released as a finger does. */
function press(k: string): void {
  const el = keyEl([...k].length === 1 ? `.wc-ph-okb-k[data-ch=${JSON.stringify(k)}]` : `.wc-ph-okb-k[data-act="${k}"]`);
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}
const rows = (): number => kb.el.querySelectorAll('.wc-ph-okb-row').length;

beforeEach(() => {
  vi.useFakeTimers();
  // happy-dom lays nothing out: every element has a box, and the app box is a phone's screen.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.isConnected && !this.closest('[hidden]') ? [{ width: 100, height: 20 }] : []) as unknown as DOMRectList;
  });
  root = document.createElement('div');
  root.id = 'app';
  root.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 360, bottom: 800, width: 360, height: 800, toJSON: () => ({}) });
  page = document.createElement('div');
  page.className = 'wc-chrome';
  root.append(page);
  document.body.append(root);
  sent = [];
  ups = [];
  settings = store();
  kb = mountPageKeyboard({
    root,
    settings,
    sendKey: (t, k) => {
      sent.push([t, k]);
      return true;
    },
    onUp: (up) => ups.push(up),
  });
});

afterEach(() => {
  kb.dispose();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('mountPageKeyboard', () => {
  it('is closed at mount: hidden, no reserve, no class', () => {
    expect(kb.open).toBe(false);
    expect(kb.el.hidden).toBe(true);
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe('');
    expect(document.documentElement.classList.contains('wc-okb-pg')).toBe(false);
  });

  it('a tap on a marked field opens it: the class, the reserve as high as the keyboard, and the shell is told', () => {
    const f = mk('input');
    tap(f);
    expect(kb.open).toBe(true);
    expect(kb.el.hidden).toBe(false);
    expect(document.documentElement.classList.contains('wc-okb-pg')).toBe(true);
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe(`${okbHeightPx(false, 800, false)}px`);
    expect(ups).toEqual([true]);
    expect(document.activeElement).toBe(f);
  });

  it('the keys type through the field\'s adapter (an input event), and Enter is sent as a marked key on its click', () => {
    const f = mk('input') as HTMLInputElement;
    const seen: string[] = [];
    f.addEventListener('input', () => seen.push(f.value));
    for (const t of ['keydown', 'keyup']) f.addEventListener(t, () => seen.push(t));
    tap(f);
    press('h');
    press('i');
    expect(f.value).toBe('hi');
    expect(seen).toEqual(['h', 'hi']);
    // Enter: nothing at the press, the key at the click.
    const enter = keyEl('.wc-ph-okb-k[data-act="enter"]');
    enter.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(sent).toEqual([]);
    enter.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    enter.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(sent).toEqual([[f, 'Enter']]);
    expect(f.value).toBe('hi');
  });

  it('the fields have no history: both arrows are dimmed', () => {
    tap(mk('input'));
    for (const a of ['older', 'newer']) expect(keyEl(`.wc-ph-okb-k[data-act="${a}"]`).getAttribute('aria-disabled')).toBe('true');
  });

  it('a focus without a pointer opens nothing; one just after a pointer does (a dialog a tap opened)', () => {
    const f = mk('input');
    f.focus();
    expect(kb.open).toBe(false);
    f.blur();
    // A tap on a button, then the dialog focuses its field.
    const b = document.createElement('button');
    page.append(b);
    b.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    b.dispatchEvent(new Event('pointerup', { bubbles: true }));
    f.focus();
    expect(kb.open).toBe(true);
  });

  it('an unmarked field, and a field outside the pages, are not ours', () => {
    const area = mk('textarea', false);
    tap(area);
    expect(kb.open).toBe(false);
    // In the cockpit (the game layout's keyboard is the layer's own).
    const cockpit = document.createElement('div');
    cockpit.className = 'wc-cockpit';
    root.append(cockpit);
    const line = document.createElement('textarea');
    line.setAttribute('inputmode', 'none');
    cockpit.append(line);
    tap(line);
    expect(kb.open).toBe(false);
  });

  it('the target follows the focus between our fields; the reserve stays', () => {
    const a = mk('input') as HTMLInputElement;
    const b = mk('input') as HTMLInputElement;
    tap(a);
    press('a');
    b.focus();
    press('b');
    expect([a.value, b.value]).toEqual(['a', 'b']);
    expect(kb.open).toBe(true);
    expect(ups).toEqual([true]);
  });

  it('a field that is not ours taking the focus closes it: the two keyboards never stand together', () => {
    const f = mk('input');
    const area = mk('textarea', false);
    tap(f);
    area.focus();
    expect(kb.open).toBe(false);
    expect(document.documentElement.classList.contains('wc-okb-pg')).toBe(false);
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe('');
    expect(ups).toEqual([true, false]);
    // The other field keeps the focus (it gets the device's keyboard).
    expect(document.activeElement).toBe(area);
  });

  it('the fold key closes and blurs', () => {
    const f = mk('input');
    tap(f);
    press('fold');
    expect(kb.open).toBe(false);
    expect(document.activeElement).not.toBe(f);
    // A tap on the field opens it again.
    tap(f);
    expect(kb.open).toBe(true);
  });

  it('the field losing the focus to something that is no field closes it', () => {
    const f = mk('input');
    tap(f);
    f.blur();
    vi.runAllTimers();
    expect(kb.open).toBe(false);
  });

  it('a field that goes away closes it at once: taken out, or hidden with its page', async () => {
    const f = mk('input');
    tap(f);
    f.remove();
    await vi.advanceTimersByTimeAsync(0);
    expect(kb.open).toBe(false);
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe('');

    const g = mk('input');
    tap(g);
    expect(kb.open).toBe(true);
    page.hidden = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(kb.open).toBe(false);
  });

  it('a numeric field opens with the digit row up; its key folds the row for that field without touching the setting', () => {
    const n = mk('input', true, 'digits') as HTMLInputElement;
    tap(n);
    expect(rows()).toBe(5);
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe(`${okbHeightPx(false, 800, true)}px`);
    press('7');
    expect(n.value).toBe('7');
    press('digits');
    expect(rows()).toBe(4);
    expect(settings.state.phone.keyboard.digits).toBe(false);
    // On a plain field the key is the setting's, as in the game.
    const f = mk('input');
    tap(f);
    expect(rows()).toBe(4);
    press('digits');
    expect(settings.state.phone.keyboard.digits).toBe(true);
    expect(rows()).toBe(5);
  });

  it('the layout setting applies: Swedish has its eleventh key', () => {
    settings.update({ phone: { keyboard: { layout: 'sv' } } });
    tap(mk('input'));
    expect(kb.el.querySelector('.wc-ph-okb-k[data-ch="å"]')).not.toBeNull();
    settings.update({ phone: { keyboard: { layout: 'en' } } });
    expect(kb.el.querySelector('.wc-ph-okb-k[data-ch="å"]')).toBeNull();
  });

  it('vibrates on a key press only while the setting is on', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { ...navigator, vibrate, languages: ['en'] });
    Object.defineProperty(window, 'navigator', { value: { vibrate, languages: ['en'] }, configurable: true });
    tap(mk('input'));
    press('a');
    expect(vibrate).not.toHaveBeenCalled();
    settings.update({ phone: { vibrate: true } });
    press('a');
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('a page with no room for it gets none (the field keeps the focus of a physical keyboard)', () => {
    root.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 200, width: 800, height: 200, toJSON: () => ({}) });
    tap(mk('input'));
    expect(kb.open).toBe(false);
    expect(document.documentElement.classList.contains('wc-okb-pg')).toBe(false);
  });

  it('dispose closes it and takes the host away', () => {
    tap(mk('input'));
    kb.dispose();
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe('');
    expect(root.querySelector('.wc-okb-page')).toBeNull();
    expect(ups).toEqual([true, false]);
  });
});
