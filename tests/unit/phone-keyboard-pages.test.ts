// @vitest-environment happy-dom
// ADR 0139, round 53f: our own keyboard on the phone's pages. The plan (the
// keyboard's place and the page's reserve, pure) and the mount's rules:
// which fields are its own, what opens and closes it, how Enter is sent.
// The real layout and taps are in tests/e2e/phone-own-keyboard-pages.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAGE_AFTER_POINTER_MS,
  PAGE_KEEP_PX,
  PAGE_KEY_AGAIN_MS,
  PAGE_SIDE_GAP,
  PAGE_SIDE_W,
  type PageKeyboardHandle,
  mountPageKeyboard,
  pageKeyboardPlan,
} from '../../src/phone/keyboard-pages';
import { OKB_PAD_X, OKB_UNIT_MAX, OKB_UNIT_MAX_LAND, OKB_UNIT_MIN_LAND, okbHeightPx } from '../../src/phone/keyboard-model';
import { defaultSettings } from '../../src/settings/types';
import type { SettingsStore } from '../../src/settings';
import type { Settings } from '../../src/settings/types';

describe('pageKeyboardPlan', () => {
  it('portrait 360 × 800: the block over the full width, the game layout\'s rows and one more for the page keys', () => {
    const p = pageKeyboardPlan(360, 800, 'sv', false)!;
    expect(p).toMatchObject({ landscape: false, digits: false, left: 0, width: 360, nav: 'row' });
    expect(p.sides).toBeUndefined();
    expect(p.height).toBe(okbHeightPx(false, 800, false, true));
    expect(pageKeyboardPlan(360, 800, 'sv', true)!.height).toBe(okbHeightPx(false, 800, true, true));
    // A narrow phone has room for it too.
    expect(pageKeyboardPlan(320, 568, 'sv', false)).toMatchObject({ nav: 'row', width: 320 });
    expect(568 - pageKeyboardPlan(320, 568, 'sv', true)!.height).toBeGreaterThanOrEqual(PAGE_KEEP_PX);
  });

  it('landscape: the page keys stand in a column at each side of the block, and cost no height', () => {
    const p = pageKeyboardPlan(800, 360, 'sv', false)!;
    expect(p.nav).toBe('sides');
    expect(p.height).toBe(okbHeightPx(true, 360, false));
    // The block keeps its largest keys where there is room beside them, in the middle.
    expect(p.width).toBe(11 * OKB_UNIT_MAX_LAND + 2 * OKB_PAD_X);
    expect(p.left).toBe((800 - p.width) / 2);
    expect(p.sides).toEqual({ left: p.left - PAGE_SIDE_GAP - PAGE_SIDE_W, right: p.left + p.width + PAGE_SIDE_GAP, width: PAGE_SIDE_W });
    expect(p.sides!.left).toBeGreaterThanOrEqual(0);
    expect(p.sides!.right + PAGE_SIDE_W).toBeLessThanOrEqual(800);
    // A smaller phone on its side: the block gets narrower for the columns, its keys never under the least.
    for (const [w, h] of [[640, 360], [568, 320]] as const) {
      const q = pageKeyboardPlan(w, h, 'sv', false)!;
      expect(q.nav).toBe('sides');
      expect(q.width).toBe(Math.min(11 * OKB_UNIT_MAX_LAND + 2 * OKB_PAD_X, w - 2 * (PAGE_SIDE_W + PAGE_SIDE_GAP)));
      expect((q.width - 2 * OKB_PAD_X) / 11).toBeGreaterThanOrEqual(OKB_UNIT_MIN_LAND);
      expect(q.left).toBe((w - q.width) / 2);
      expect(q.sides!.left).toBeGreaterThanOrEqual(0);
      expect(q.sides!.right + PAGE_SIDE_W).toBeLessThanOrEqual(w);
      expect(q.height).toBe(okbHeightPx(true, h, false));
    }
  });

  it('a landscape too narrow for the columns: the row of page keys if the page keeps enough, else none', () => {
    // 480 wide, Swedish: the keys would be under the least beside two columns.
    expect(pageKeyboardPlan(480, 400, 'sv', false)).toMatchObject({ nav: 'row', width: 480, height: okbHeightPx(true, 400, false, true) });
    expect(pageKeyboardPlan(480, 320, 'sv', false)).toMatchObject({ nav: 'none', width: 480, height: okbHeightPx(true, 320, false) });
    // What gives way, in order: the digit row, the row of page keys, the keyboard.
    expect(pageKeyboardPlan(480, 400, 'sv', true)).toMatchObject({ nav: 'row', digits: true });
    expect(pageKeyboardPlan(480, 360, 'sv', true)).toMatchObject({ nav: 'row', digits: false });
    expect(pageKeyboardPlan(480, 280, 'sv', true)).toBeNull();
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
    sendKey: (t, k, mods) => {
      sent.push([t, mods?.shift ? `Shift+${k}` : k]);
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
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe(`${okbHeightPx(false, 800, false, true)}px`);
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

  it('the fields have no history: the keyboard has no history arrows', () => {
    tap(mk('input'));
    for (const a of ['older', 'newer']) expect(kb.el.querySelector(`.wc-ph-okb-k[data-act="${a}"]`)).toBeNull();
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
    // (Hidden with the focus still in it: looked at again when the page has settled.)
    page.hidden = true;
    await vi.advanceTimersByTimeAsync(50);
    expect(kb.open).toBe(false);
  });

  it('a field hidden for a moment with the focus in it (a page between two layouts) keeps the keyboard', async () => {
    const f = mk('input');
    tap(f);
    page.hidden = true;
    await vi.advanceTimersByTimeAsync(0);
    expect(kb.open).toBe(true);
    page.hidden = false;
    await vi.advanceTimersByTimeAsync(50);
    expect(kb.open).toBe(true);
    press('a');
    expect((f as HTMLInputElement).value).toBe('a');
  });

  it('a numeric field opens with the digit row up; its key folds the row for that field without touching the setting', () => {
    const n = mk('input', true, 'digits') as HTMLInputElement;
    tap(n);
    // (Each count has the row of page keys in it.)
    expect(rows()).toBe(6);
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe(`${okbHeightPx(false, 800, true, true)}px`);
    press('7');
    expect(n.value).toBe('7');
    press('digits');
    expect(rows()).toBe(5);
    expect(settings.state.phone.keyboard.digits).toBe(false);
    // On a plain field the key is the setting's, as in the game.
    const f = mk('input');
    tap(f);
    expect(rows()).toBe(5);
    press('digits');
    expect(settings.state.phone.keyboard.digits).toBe(true);
    expect(rows()).toBe(6);
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

// Round 53g (ADR 0139 §4–§5): the multi-line fields, the page keys, and the 53f review's findings.
describe('mountPageKeyboard, round 53g', () => {
  const act = (a: string): HTMLElement => keyEl(`.wc-ph-okb-k[data-act="${a}"]`);
  const dimmed = (a: string): boolean => act(a).getAttribute('aria-disabled') === 'true';

  it('a multi-line field (`data-okb-kind="lines"`): Enter is a line break, drawn as one, and acts on the press; nothing is sent', () => {
    const f = mk('textarea', true, 'lines') as HTMLTextAreaElement;
    tap(f);
    expect(act('enter').dataset.enter).toBe('newline');
    expect(act('enter').getAttribute('aria-label')).toBe('New line');
    press('a');
    act('enter').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(f.value).toBe('a\n');
    act('enter').dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    act('enter').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    press('b');
    expect(f.value).toBe('a\nb');
    expect(sent).toEqual([]);
    for (const a of ['up', 'down', 'left', 'right', 'esc', 'tab']) expect(dimmed(a)).toBe(false);
    // Backspace across the break.
    press('back');
    press('back');
    expect(f.value).toBe('a');
  });

  it('a text area without the kind (the export comment) and an input: Enter is sent, lit; up and down are dimmed', () => {
    const c = mk('textarea') as HTMLTextAreaElement;
    tap(c);
    expect(act('enter').dataset.enter).toBe('submit');
    expect(act('enter').getAttribute('aria-label')).toBe('Enter');
    expect([dimmed('up'), dimmed('down'), dimmed('left'), dimmed('right')]).toEqual([true, true, false, false]);
    press('a');
    press('enter');
    expect(c.value).toBe('a');
    expect(sent).toEqual([[c, 'Enter']]);
    // The face follows the focus to a multi-line field and back.
    const body = mk('textarea', true, 'lines');
    body.focus();
    expect(act('enter').dataset.enter).toBe('newline');
    expect(dimmed('up')).toBe(false);
    c.focus();
    expect(act('enter').dataset.enter).toBe('submit');
  });

  it('the caret keys move the caret in the field (no key is sent) and repeat while held', () => {
    const f = mk('input') as HTMLInputElement;
    tap(f);
    for (const ch of 'abcdef') press(ch);
    press('left');
    press('left');
    expect(f.selectionStart).toBe(4);
    press('x');
    expect(f.value).toBe('abcdxef');
    press('right');
    expect(f.selectionStart).toBe(6);
    const left = act('left');
    left.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(f.selectionStart).toBe(5);
    vi.advanceTimersByTime(400 + 60 * 3);
    expect(f.selectionStart).toBe(2);
    left.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(500);
    expect(f.selectionStart).toBe(2);
    expect(sent).toEqual([]);
  });

  it('caret up and down in a multi-line field', () => {
    const f = mk('textarea', true, 'lines') as HTMLTextAreaElement;
    f.value = 'one\ntwo\nthree';
    tap(f);
    f.setSelectionRange(13, 13);
    press('up');
    expect(f.selectionStart).toBe(7);
    press('up');
    expect(f.selectionStart).toBe(3);
    press('down');
    press('down');
    expect(f.selectionStart).toBe(13);
  });

  it('Esc and Tab are sent as keys on the click, not on the press; Shift and Tab is Shift+Tab and uses the shift up', () => {
    const f = mk('input');
    tap(f);
    for (const a of ['esc', 'tab']) {
      act(a).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(sent).toEqual([]);
      act(a).dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    }
    press('tab');
    press('shift');
    press('tab');
    press('tab');
    press('esc');
    expect(sent).toEqual([
      [f, 'Tab'],
      [f, 'Shift+Tab'],
      [f, 'Tab'],
      [f, 'Escape'],
    ]);
  });

  it('a focus our Tab key brought to another field of ours keeps the keyboard, though the page gave it later', () => {
    const a = mk('input');
    const b = mk('input') as HTMLInputElement;
    tap(a);
    press('tab');
    // The page moves the focus a moment later, through nothing (the field blurred first).
    a.blur();
    vi.advanceTimersByTime(1);
    expect(kb.open).toBe(false);
    b.focus();
    expect(kb.open).toBe(true);
    press('b');
    expect(b.value).toBe('b');
  });

  it('a second Enter or Esc for the same field right after the first is dropped (a double tap)', () => {
    const f = mk('input');
    tap(f);
    press('enter');
    press('enter');
    press('esc');
    expect(sent).toEqual([[f, 'Enter']]);
    vi.advanceTimersByTime(PAGE_KEY_AGAIN_MS + 1);
    press('esc');
    expect(sent).toEqual([
      [f, 'Enter'],
      [f, 'Escape'],
    ]);
  });

  it('while the finger is down on the page nothing opens: the keyboard comes with the click, or just after the finger lifts', () => {
    const f = mk('input');
    f.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    f.focus();
    // (The page must not move under the finger: the tap's click would land on what then lies there.)
    expect(kb.open).toBe(false);
    f.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(kb.open).toBe(false);
    f.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(kb.open).toBe(true);
    press('fold');
    // A press that ends without a click (a long press).
    f.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    f.focus();
    f.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(kb.open).toBe(false);
    vi.advanceTimersByTime(PAGE_AFTER_POINTER_MS);
    expect(kb.open).toBe(true);
    // With the keyboard up: another field tapped is the target once the finger has lifted.
    const g = mk('input') as HTMLInputElement;
    g.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    g.focus();
    vi.advanceTimersByTime(1);
    expect(kb.open).toBe(true);
    g.dispatchEvent(new Event('pointerup', { bubbles: true }));
    g.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    press('g');
    expect(g.value).toBe('g');
  });

  it('landscape: no row of page keys; they stand in two columns beside the block', () => {
    root.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 360, width: 800, height: 360, toJSON: () => ({}) });
    tap(mk('input'));
    expect(rows()).toBe(4);
    expect(kb.el.querySelector('.wc-ph-okb-row.is-nav')).toBeNull();
    const sides = [...kb.el.querySelectorAll<HTMLElement>('.wc-ph-okb-side')];
    expect(sides.map((s) => [...s.children].map((k) => (k as HTMLElement).dataset.act))).toEqual([
      ['esc', 'tab', 'left'],
      ['up', 'down', 'right'],
    ]);
    expect(sides.every((s) => !s.hidden && s.style.width === `${PAGE_SIDE_W}px`)).toBe(true);
    expect(root.style.getPropertyValue('--wc-okb-page-h')).toBe(`${okbHeightPx(true, 360, false)}px`);
  });
});

describe('mountPageKeyboard: a field focused before the mount (the phone chunk came late)', () => {
  it('opens for it at once', () => {
    kb.dispose();
    const f = mk('input') as HTMLInputElement;
    f.focus();
    kb = mountPageKeyboard({ root, settings, sendKey: () => true, onUp: (up) => ups.push(up) });
    expect(kb.open).toBe(true);
    press('z');
    expect(f.value).toBe('z');
  });

  it('opens nothing where no field of ours has the focus', () => {
    kb.dispose();
    const f = mk('input', false);
    f.focus();
    kb = mountPageKeyboard({ root, settings, sendKey: () => true });
    expect(kb.open).toBe(false);
  });
});
