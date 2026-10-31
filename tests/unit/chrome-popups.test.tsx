// @vitest-environment happy-dom
// Stage 30c (ADR 0107): the modern control kit, the settings popups'
// surface (open, toggle, close and what it tells the menu bar), the panel's
// key and focus rules, and the Settings popup's four tabs writing the
// settings store live.
import { type VNode, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ChromeServices, type SettingsPopupsHandle, mountSettingsPopups } from '../../src/chrome';
import {
  Dropdown,
  Segmented,
  Slider,
  SwatchGrid,
  Toggle,
  listPlace,
  snapValue,
  stepIndex,
} from '../../src/chrome/popups/controls';
import { HOVER_CHOICES, mapFileLine } from '../../src/chrome/popups/mapper-settings';
import { tabbables } from '../../src/chrome/popups/panel';
import { CURSOR_CHOICES, SETTINGS_TABS, colorOptions, scrollbackOptions } from '../../src/chrome/popups/settings-popup';
import { ProfileStore } from '../../src/profiles';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';
import { TERMINAL_BG_PRESETS, TERMINAL_FG_PRESETS } from '../../src/theme/presets';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

beforeAll(() => {
  // A colour picker that does not open in tests.
  (HTMLInputElement.prototype as { showPicker?: () => void }).showPicker = vi.fn();
});

const keydown = (el: Element, key: string, o: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o }));
  });
const click = (el: Element | null) =>
  act(() => {
    (el as HTMLElement).click();
  });

function mount(v: VNode): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  act(() => render(v, host));
  cleanup.push(() => render(null, host));
  return host;
}

// ------------------------------------------------------------ helpers

describe('control kit helpers', () => {
  it('steps an index with the arrow keys, Home and End', () => {
    expect(stepIndex('ArrowRight', 0, 3)).toBe(1);
    expect(stepIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(stepIndex('ArrowLeft', 0, 3, false)).toBe(0);
    expect(stepIndex('ArrowDown', 2, 3, false)).toBe(2);
    expect(stepIndex('Home', 2, 3)).toBe(0);
    expect(stepIndex('End', 0, 3)).toBe(2);
    expect(stepIndex('a', 0, 3)).toBeNull();
    expect(stepIndex('ArrowRight', 0, 0)).toBeNull();
  });

  it('snaps a slider value to its grid and range', () => {
    expect(snapValue(15.4, 6, 32, 1)).toBe(15);
    expect(snapValue(5, 0, 40, 2)).toBe(6);
    expect(snapValue(-3, 0, 40, 2)).toBe(0);
    expect(snapValue(99, 6, 32, 1)).toBe(32);
  });

  it('places a dropdown list below its button, or above when there is more room there', () => {
    const b = { left: 100, top: 100, bottom: 120, width: 80 };
    expect(listPlace(b, 200, 1000, 800, 60)).toEqual({ left: 100, top: 122, minWidth: 80, maxHeight: 200 });
    // Short below: above, cut to the room.
    const low = { left: 100, top: 700, bottom: 720, width: 80 };
    const up = listPlace(low, 300, 1000, 800, 60);
    expect(up.top + up.maxHeight).toBe(698);
    expect(up.maxHeight).toBe(300);
    // Kept inside the viewport on the right.
    expect(listPlace({ left: 950, top: 0, bottom: 20, width: 80 }, 50, 1000, 800, 120).left).toBe(1000 - 120 - 4);
  });

  it('lists colours by name with an off-palette value first by its hex', () => {
    const fg = colorOptions(TERMINAL_FG_PRESETS, '#C0C0C0');
    expect(fg.map((o) => o.label)).toEqual(['Sage', 'Silver', 'Mist', 'Wheat', 'Lavender', 'Frost', 'Ink']);
    const odd = colorOptions(TERMINAL_BG_PRESETS, '#123456');
    expect(odd[0]).toEqual({ value: '#123456', label: '#123456', swatch: '#123456' });
    expect(odd.length).toBe(TERMINAL_BG_PRESETS.length + 1);
  });

  it('keeps a scrollback outside the choices, and names the cursor styles', () => {
    expect(scrollbackOptions(20000).map((o) => o.label)).toEqual(['5 000 lines', '10 000 lines', '20 000 lines', '50 000 lines']);
    expect(scrollbackOptions(7000).map((o) => o.value)).toEqual([5000, 7000, 10000, 20000, 50000]);
    expect(CURSOR_CHOICES.map((c) => c.label)).toEqual(['Block', 'Bar', 'Underline']);
    expect(HOVER_CHOICES.map((c) => c.value)).toEqual(['off', 'minimal', 'full']);
    expect(SETTINGS_TABS.map((t) => t.label)).toEqual(['Appearance', 'Text input', 'Mapper', 'Weather effects']);
  });

  it('describes the map file', () => {
    expect(mapFileLine(null)).toBe('…');
    expect(mapFileLine({ kind: 'bundled', name: 'arda.mm2' })).toBe('arda.mm2 (bundled)');
    const line = mapFileLine({ kind: 'imported', name: 'x.mm2', size: 5_814_236, date: 0, hash: 'h', rooms: 30074 });
    expect(line).toMatch(/^x\.mm2 · 30 074 rooms · 5\.8 MB · imported \d{4}-\d\d-\d\d \d\d:\d\d$/);
  });
});

// ----------------------------------------------------------- controls

describe('control kit', () => {
  it('Toggle: a switch that flips', () => {
    const on = vi.fn();
    const host = mount(<Toggle on={false} onChange={on} label="Room notes" />);
    const b = host.querySelector('.wc-ck-tg')!;
    expect(b.getAttribute('role')).toBe('switch');
    expect(b.getAttribute('aria-checked')).toBe('false');
    click(b);
    expect(on).toHaveBeenCalledWith(true);
  });

  it('Segmented: a click or ←→ picks; only the chosen one is tabbable', () => {
    const pick = vi.fn();
    const host = mount(<Segmented value="minimal" options={HOVER_CHOICES} onChange={pick} label="Hover" />);
    const btns = [...host.querySelectorAll<HTMLElement>('.wc-ck-sg')];
    expect(btns.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
    expect(btns[1]!.getAttribute('aria-checked')).toBe('true');
    click(btns[2]!);
    expect(pick).toHaveBeenLastCalledWith('full');
    keydown(btns[1]!, 'ArrowRight');
    expect(pick).toHaveBeenLastCalledWith('full');
    keydown(btns[1]!, 'ArrowLeft');
    expect(pick).toHaveBeenLastCalledWith('off');
    keydown(btns[1]!, 'ArrowRight', { ctrlKey: true });
    expect(pick).toHaveBeenCalledTimes(3);
  });

  it('Slider: keys step it inside its range; a press holds the popup until it is let go', () => {
    const set = vi.fn();
    const hold = vi.fn();
    const host = mount(<Slider value={4} min={0} max={40} step={2} onChange={set} label="Padding" unit="px" onHold={hold} />);
    const s = host.querySelector<HTMLElement>('.wc-ck-rng')!;
    expect(s.getAttribute('role')).toBe('slider');
    expect(s.getAttribute('aria-valuenow')).toBe('4');
    expect(host.querySelector('.wc-ck-val')!.textContent).toBe('4 px');
    keydown(s, 'ArrowRight');
    expect(set).toHaveBeenLastCalledWith(6);
    keydown(s, 'ArrowDown');
    expect(set).toHaveBeenLastCalledWith(2);
    keydown(s, 'End');
    expect(set).toHaveBeenLastCalledWith(40);
    keydown(s, 'Home');
    expect(set).toHaveBeenLastCalledWith(0);
    keydown(s, 'PageUp');
    expect(set).toHaveBeenLastCalledWith(8);
    // A press on the track (width 0 here: the minimum) holds, a release lets go.
    act(() => {
      s.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 0, bubbles: true, cancelable: true }));
    });
    expect(hold).toHaveBeenLastCalledWith(true);
    expect(set).toHaveBeenLastCalledWith(0);
    act(() => {
      s.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
    });
    expect(hold).toHaveBeenLastCalledWith(false);
    expect(hold).toHaveBeenCalledTimes(2);
  });

  it('Dropdown: opens on a click or ↓, ↑↓ move, Enter picks, Esc closes the list only', async () => {
    const pick = vi.fn();
    const outer = vi.fn();
    const host = mount(
      <div onKeyDown={(e) => e.key === 'Escape' && outer()}>
        <Dropdown
          value="b"
          label="Letter"
          options={[
            { value: 'a', label: 'Alpha', swatch: '#ff0000' },
            { value: 'b', label: 'Beta' },
            { value: 'c', label: 'Gamma' },
          ]}
          onChange={pick}
        />
      </div>,
    );
    const btn = host.querySelector<HTMLElement>('.wc-ck-dd')!;
    expect(btn.textContent).toBe('Beta');
    click(btn);
    const list = () => host.querySelector<HTMLElement>('.wc-ck-list');
    expect(list()).not.toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(list()!.querySelector('.wc-ck-opt.is-active')!.textContent).toBe('Beta');
    expect(list()!.querySelectorAll('.wc-ck-sw').length).toBe(1);
    expect(document.activeElement).toBe(list());
    keydown(list()!, 'ArrowDown');
    expect(list()!.querySelector('.wc-ck-opt.is-active')!.textContent).toBe('Gamma');
    keydown(list()!, 'ArrowDown');
    expect(list()!.querySelector('.wc-ck-opt.is-active')!.textContent).toBe('Gamma');
    keydown(list()!, 'Enter');
    expect(pick).toHaveBeenCalledWith('c');
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(btn);
    // Esc closes the list and stops there.
    keydown(btn, 'ArrowDown');
    expect(list()).not.toBeNull();
    keydown(list()!, 'Escape');
    expect(list()).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    // A click on an option; the current one picks nothing.
    click(btn);
    click(list()!.querySelectorAll('.wc-ck-opt')[1]!);
    expect(pick).toHaveBeenCalledTimes(1);
    click(btn);
    click(list()!.querySelectorAll('.wc-ck-opt')[0]!);
    expect(pick).toHaveBeenLastCalledWith('a');
    // A press outside closes it.
    click(btn);
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(list()).toBeNull();
  });

  it('Dropdown: a value outside the options shows as given', () => {
    const host = mount(<Dropdown value="zz" label="X" options={[{ value: 'a', label: 'A' }]} onChange={() => {}} />);
    expect(host.querySelector('.wc-ck-dd')!.textContent).toBe('zz');
  });

  it('SwatchGrid: a click picks; arrows move in rows of eight', () => {
    const pick = vi.fn();
    const colors = Array.from({ length: 16 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`);
    const host = mount(<SwatchGrid colors={colors} names={colors.map((_, i) => `c${i}`)} selected={3} onPick={pick} label="Palette" />);
    const cells = [...host.querySelectorAll<HTMLElement>('.wc-ck-pc')];
    expect(cells.length).toBe(16);
    expect(cells[3]!.classList.contains('is-sel')).toBe(true);
    click(cells[9]!);
    expect(pick).toHaveBeenCalledWith(9, cells[9]);
    cells[1]!.focus();
    keydown(cells[1]!, 'ArrowDown');
    expect(document.activeElement).toBe(cells[9]);
    keydown(cells[9]!, 'ArrowDown');
    expect(document.activeElement).toBe(cells[9]);
    keydown(cells[9]!, 'ArrowLeft');
    expect(document.activeElement).toBe(cells[8]);
  });
});

// ------------------------------------------------------------- surface

function services(): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  return {
    settings,
    cells,
    profiles: new ProfileStore({ factory: null }),
    version: '9.9.9',
    runs: () => Promise.reject(new Error('no runs')),
  };
}

function surface() {
  const svc = services();
  const host = document.createElement('div');
  document.body.append(host);
  const focusInput = vi.fn();
  const onOpen = vi.fn();
  const onClose = vi.fn();
  let pops!: SettingsPopupsHandle;
  act(() => {
    pops = mountSettingsPopups(host, svc, { focusInput, onOpen, onClose });
  });
  cleanup.push(() => pops.dispose());
  const place = vi.fn((el: HTMLElement) => {
    el.style.left = '10px';
  });
  const panel = () => host.querySelector<HTMLElement>('.wc-pop');
  const page = (id: string) => host.querySelector<HTMLElement>(`.wc-sp-page[data-page="${id}"]`)!;
  const s = () => svc.settings.get();
  return { svc, host, pops, focusInput, onOpen, onClose, place, panel, page, s };
}

describe('settings popups surface', () => {
  it('toggles the Settings popup; hands it to the bar on open and reports when it closes itself', () => {
    const t = surface();
    act(() => t.pops.toggle('settings', t.place));
    const el = t.panel()!;
    expect(el.classList.contains('wc-sp-settings')).toBe(true);
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.hasAttribute('data-wc-own-keys')).toBe(true);
    expect(t.place).toHaveBeenCalledWith(el);
    expect(t.onOpen).toHaveBeenCalledOnce();
    expect(t.onOpen.mock.calls[0]![0]).toBe('settings');
    expect(t.onOpen.mock.calls[0]![1]).toBe(el);
    expect(t.pops.openKey).toBe('settings');
    expect(t.pops.el).toBe(el);
    // It does not take the focus when it opens.
    expect(el.contains(document.activeElement)).toBe(false);
    act(() => t.pops.toggle('settings', t.place));
    expect(t.panel()).toBeNull();
    expect(t.onClose).toHaveBeenCalledWith('settings');
    expect(t.focusInput).not.toHaveBeenCalled();
    expect(t.pops.isOpen).toBe(false);
  });

  it('the bar’s close does not report back; X and Esc in it close it and give the input its focus', () => {
    const t = surface();
    act(() => t.pops.open('settings', t.place));
    const barClose = t.onOpen.mock.calls[0]![2] as () => void;
    act(() => barClose());
    expect(t.panel()).toBeNull();
    expect(t.onClose).not.toHaveBeenCalled();
    act(() => t.pops.open('settings', t.place));
    click(t.panel()!.querySelector('.wc-pop-x'));
    expect(t.panel()).toBeNull();
    expect(t.onClose).toHaveBeenCalledOnce();
    expect(t.focusInput).toHaveBeenCalledOnce();
    act(() => t.pops.open('settings', t.place));
    keydown(t.panel()!, 'Escape');
    expect(t.panel()).toBeNull();
    expect(t.onClose).toHaveBeenCalledTimes(2);
    expect(t.focusInput).toHaveBeenCalledTimes(2);
  });

  it('one at a time: a gear popup replaces Settings; a pane without one does nothing', () => {
    const t = surface();
    act(() => t.pops.open('settings', t.place));
    act(() => t.pops.open({ pane: 'comm' }, t.place));
    expect(t.pops.openKey).toBe('settings');
    act(() => t.pops.toggle({ pane: 'map' }, t.place));
    expect(t.onClose).toHaveBeenCalledWith('settings');
    expect(t.pops.openKey).toBe('pane:map');
    const el = t.panel()!;
    expect(el.classList.contains('wc-sp-gear-map')).toBe(true);
    expect(el.querySelector('.wc-pop-title')!.textContent).toBe('Map');
    expect(el.querySelector('.wc-ck-tg[aria-label="Show map pane"]')).not.toBeNull();
    expect(t.onOpen.mock.calls.map((c) => c[0])).toEqual(['settings', 'pane:map']);
    // Opening the open one again changes nothing.
    act(() => t.pops.open({ pane: 'map' }, t.place));
    expect(t.onOpen).toHaveBeenCalledTimes(2);
    expect(t.pops.close()).toBe(true);
    expect(t.pops.close()).toBe(false);
  });

  it('a press gives the keys to the control pressed; Tab wraps inside; four pages, one visible', () => {
    const t = surface();
    act(() => t.pops.open('settings', t.place));
    const el = t.panel()!;
    expect([...el.querySelectorAll('.wc-sp-page')].map((p) => (p as HTMLElement).dataset.page)).toEqual([
      'appearance',
      'input',
      'mapper',
      'weather',
    ]);
    expect([...el.querySelectorAll('.wc-sp-page.is-off')].length).toBe(3);
    const tab = el.querySelector<HTMLElement>('.wc-ck-tab[data-tab="input"]')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      tab.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tab);
    expect(el.hasAttribute('data-pointer')).toBe(true);
    click(tab);
    expect(t.page('input').classList.contains('is-off')).toBe(false);
    expect(t.page('appearance').getAttribute('aria-hidden')).toBe('true');
    // Only the visible page's controls are tabbable.
    const items = tabbables(el);
    expect(items.every((i) => !i.closest('[aria-hidden="true"]'))).toBe(true);
    expect(items.some((i) => i.closest('[data-page="input"]'))).toBe(true);
    expect(items.some((i) => i.closest('[data-page="appearance"]'))).toBe(false);
    // Tab from the last goes to the first; Shift+Tab from the first to the last.
    items.at(-1)!.focus();
    keydown(items.at(-1)!, 'Tab');
    expect(document.activeElement).toBe(items[0]);
    expect(el.hasAttribute('data-pointer')).toBe(false);
    keydown(items[0]!, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(items.at(-1));
    // The chosen tab is kept for the next open.
    act(() => void t.pops.close());
    act(() => t.pops.open('settings', t.place));
    expect(t.page('input').classList.contains('is-off')).toBe(false);
    click(t.panel()!.querySelector('.wc-ck-tab[data-tab="appearance"]'));
  });
});

// --------------------------------------------------------------- tabs

describe('Settings popup tabs', () => {
  it('Appearance: every control writes the store at once', () => {
    const t = surface();
    act(() => t.pops.open('settings', t.place));
    const el = t.page('appearance');
    const size0 = t.s().appearance.size;
    keydown(el.querySelector('.wc-ck-rng[aria-label="Size"]')!, 'ArrowRight');
    expect(t.s().appearance.size).toBe(size0 + 1);
    keydown(el.querySelector('.wc-ck-rng[aria-label="Padding"]')!, 'End');
    expect(t.s().appearance.padding).toBe(40);
    // Background: a preset brings its font colour and palette.
    click(el.querySelector('.wc-ck-dd[aria-label="Background"]'));
    click([...el.querySelectorAll('.wc-ck-list .wc-ck-opt')].find((o) => o.textContent === 'Paper')!);
    expect(t.s().appearance.bg).toBe('#f4ecd8');
    expect(t.s().appearance.fg).toBe('#000000');
    // An off-palette font colour shows by its hex and stays.
    act(() => t.svc.settings.update({ appearance: { fg: '#123456' } }));
    expect(el.querySelector('.wc-ck-dd[aria-label="Font colour"]')!.textContent).toBe('#123456');
    click(el.querySelector('.wc-ck-dd[aria-label="Font colour"]'));
    expect(el.querySelector('.wc-ck-list .wc-ck-opt.is-sel')!.textContent).toBe('#123456');
    keydown(el.querySelector('.wc-ck-list')!, 'Escape');
    expect(t.s().appearance.fg).toBe('#123456');
    // Input colour and font.
    click(el.querySelector('.wc-ck-dd[aria-label="Input colour"]'));
    click([...el.querySelectorAll('.wc-ck-list .wc-ck-opt')].find((o) => o.textContent === 'Amber')!);
    expect(t.s().appearance.inputColor).toBe('amber');
    // Bold brightens and scrollback.
    const bold0 = t.s().appearance.boldBright;
    click(el.querySelector('.wc-ck-tg[aria-label="Bold brightens colours"]'));
    expect(t.s().appearance.boldBright).toBe(!bold0);
    click(el.querySelector('.wc-ck-dd[aria-label="Scrollback"]'));
    click([...el.querySelectorAll('.wc-ck-list .wc-ck-opt')].find((o) => o.textContent === '50 000 lines')!);
    expect(t.s().output.scrollback).toBe(50000);
    // The palette: a swatch opens the picker and the hex field; both apply live.
    const sw = el.querySelectorAll<HTMLElement>('.wc-ck-pc')[1]!;
    click(sw);
    expect(HTMLInputElement.prototype.showPicker).toHaveBeenCalled();
    expect(el.querySelector('.wc-sp-palrow .wc-ck-help')!.textContent).toBe('1 Red');
    const picker = el.querySelector<HTMLInputElement>('.wc-sp-picker')!;
    act(() => {
      picker.value = '#aabbcc';
      picker.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(t.s().appearance.ansi[1]).toBe('#aabbcc');
    const hex = el.querySelector<HTMLInputElement>('.wc-ck-hex')!;
    expect(hex.value).toBe('#aabbcc');
    act(() => {
      hex.value = '#112233';
      hex.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(t.s().appearance.ansi[1]).toBe('#112233');
    act(() => {
      hex.value = '#abc';
      hex.dispatchEvent(new Event('input', { bubbles: true }));
    });
    keydown(hex, 'Enter');
    expect(t.s().appearance.ansi[1]).toBe('#aabbcc');
    act(() => {
      hex.value = 'nope';
      hex.dispatchEvent(new Event('input', { bubbles: true }));
    });
    keydown(hex, 'Enter');
    expect(hex.classList.contains('is-bad')).toBe(true);
    expect(t.s().appearance.ansi[1]).toBe('#aabbcc');
    // Reset palette: the background's palette (paper's).
    click(el.querySelector('.wc-sp-resetpal'));
    expect(t.s().appearance.ansi[1]).toBe('#a01c1c');
    expect(el.querySelector('.wc-ck-foot .wc-ck-note')!.textContent).toBe('Palette reset.');
    // Reset appearance.
    click(el.querySelector('.wc-sp-reset'));
    expect(t.s().appearance).toEqual(t.svc.settings.defaults().appearance);
    // The preview: the TUI page's lines.
    expect(el.querySelector('.wc-sp-preview')!.textContent).toContain('A Quiet Glade');
    expect(el.querySelector('.wc-sp-preview .wc-bold.wc-f1')!.textContent).toBe('*an Orc*');
  });

  it('Text input, Mapper and Weather effects', () => {
    const t = surface();
    act(() => t.pops.open('settings', t.place));
    const inp = t.page('input');
    const clear0 = t.s().input.autoClear;
    click(inp.querySelector('.wc-ck-tg[aria-label="Auto-clear input"]'));
    expect(t.s().input.autoClear).toBe(!clear0);
    const sug0 = t.s().input.autosuggest;
    click(inp.querySelector('.wc-ck-tg[aria-label="Autosuggest"]'));
    expect(t.s().input.autosuggest).toBe(!sug0);
    click(inp.querySelector('.wc-ck-sg[data-value="beam"]'));
    expect(t.s().appearance.cursorStyle).toBe('beam');
    const blink0 = t.s().appearance.cursorBlink;
    click(inp.querySelector('.wc-ck-tg[aria-label="Cursor blink"]'));
    expect(t.s().appearance.cursorBlink).toBe(!blink0);

    const map = t.page('mapper');
    const on0 = t.s().panes.map.on;
    click(map.querySelector('.wc-ck-tg[aria-label="Show map pane"]'));
    expect(t.s().panes.map.on).toBe(!on0);
    click(map.querySelector('.wc-ck-sg[data-value="off"]'));
    expect(t.s().mapper.hover).toBe('off');
    click(map.querySelector('[aria-label="Hover text size"] .wc-ck-sg[data-value="large"]'));
    expect(t.s().mapper.hoverSize).toBe('large');
    click(map.querySelector('.wc-ck-dd[aria-label="Background colour"]'));
    click([...map.querySelectorAll('.wc-ck-list .wc-ck-opt')].find((o) => o.textContent === 'Navy')!);
    expect(t.s().mapper.background).toBe('#101c3c');
    expect(map.querySelector('.wc-sp-mapfile')!.textContent).toBe('arda.mm2 (bundled)');
    expect(map.querySelector<HTMLButtonElement>('.wc-sp-bundled')!.disabled).toBe(true);
    expect(map.querySelector('.wc-sp-tileset .wc-ck-help')!.textContent).not.toBe('');
    // Without a map store, import says so.
    click(map.querySelector('.wc-sp-import'));
    expect(map.querySelector('.wc-sp-mapnote')!.textContent).toBe('Map import is not available here.');
    expect(map.querySelector('.wc-sp-mapnote')!.classList.contains('is-fail')).toBe(true);

    const wx = t.page('weather');
    const en0 = t.s().weather.enabled;
    click(wx.querySelector('.wc-ck-tg[aria-label="Weather effects"]'));
    expect(t.s().weather.enabled).toBe(!en0);
    expect(wx.querySelector('.wc-sp-wx-fog')!.classList.contains('is-dim')).toBe(en0);
    // In this test browser there is no OffscreenCanvas: the master row says so.
    expect(wx.querySelector('.wc-sp-master .wc-ck-help')!.textContent).toMatch(/Not supported in this browser|Decoration only/);
    const day0 = t.s().weather.daySky;
    click(wx.querySelector('.wc-ck-tg[aria-label="Blue day sky"]'));
    expect(t.s().weather.daySky).toBe(!day0);
    act(() => t.svc.settings.update({ weather: { enabled: true, sky: false } }));
    expect(wx.querySelector('.wc-sp-wx-daySky')!.classList.contains('is-dim')).toBe(true);
    expect(wx.querySelector('.wc-sp-wx-fog')!.classList.contains('is-dim')).toBe(false);
    click(wx.querySelector('.wc-ck-tg[aria-label="Fog"]'));
    expect(t.s().weather.fog).toBe(false);
  });
});
