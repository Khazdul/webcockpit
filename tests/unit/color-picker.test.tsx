// @vitest-environment happy-dom
// Stage 39c (ADR 0122): the colour picker of the Group and Timers gears.
import { type VNode, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ColorPicker, pickerIndex, pickerStep } from '../../src/chrome/popups/color-picker';
import { colorName as colorLabel } from '../../src/chrome/pane-options-model';
import { PICKER_COLORS } from '../../src/panes/palette';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

const keydown = (el: Element, key: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
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

describe('colour picker helpers', () => {
  it('names a value: Auto, a picker colour, else the hex', () => {
    expect(colorLabel('auto')).toBe('Auto');
    expect(colorLabel(PICKER_COLORS[2]!.hex.toUpperCase())).toBe(PICKER_COLORS[2]!.label);
    expect(colorLabel('#123456')).toBe('#123456');
    expect(pickerIndex('auto')).toBe(-1);
    expect(pickerIndex(PICKER_COLORS[5]!.hex)).toBe(5);
    expect(pickerIndex('#123456')).toBe(-1);
  });

  it('steps the swatches in rows of six', () => {
    expect(pickerStep('ArrowRight', 0, 12)).toBe(1);
    expect(pickerStep('ArrowLeft', 0, 12)).toBe(0);
    expect(pickerStep('ArrowDown', 2, 12)).toBe(8);
    expect(pickerStep('ArrowDown', 8, 12)).toBe(8);
    expect(pickerStep('ArrowUp', 8, 12)).toBe(2);
    expect(pickerStep('End', 3, 12)).toBe(11);
    expect(pickerStep('x', 3, 12)).toBeNull();
  });
});

describe('ColorPicker', () => {
  it('opens a popover; a swatch, Auto and the free input set the value; Esc closes it', () => {
    const set = vi.fn();
    const host = mount(<ColorPicker label="Spells colour" value="auto" auto="#66b2ff" onChange={set} />);
    const btn = host.querySelector<HTMLElement>('.wc-cp-btn')!;
    expect(btn.textContent).toContain('Auto');
    const pop = () => host.querySelector<HTMLElement>('.wc-cp-pop');
    expect(pop()).toBeNull();
    click(btn);
    expect(pop()).not.toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const sws = [...pop()!.querySelectorAll<HTMLElement>('.wc-cp-sw')];
    expect(sws.length).toBe(PICKER_COLORS.length);
    // Auto is the current value: it has the focus.
    expect(document.activeElement).toBe(pop()!.querySelector('.wc-cp-auto'));
    click(sws[3]!);
    expect(set).toHaveBeenLastCalledWith(PICKER_COLORS[3]!.hex);
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(btn);
    // The free input changes it live.
    click(btn);
    const input = pop()!.querySelector<HTMLInputElement>('input[type="color"]')!;
    act(() => {
      input.value = '#abcdef';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(set).toHaveBeenLastCalledWith('#abcdef');
    // Arrows move between the swatches; Esc closes.
    const first = pop()!.querySelector<HTMLElement>('.wc-cp-sw')!;
    first.focus();
    keydown(first, 'ArrowRight');
    expect(document.activeElement).toBe(pop()!.querySelectorAll('.wc-cp-sw')[1]);
    keydown(document.activeElement!, 'Escape');
    expect(pop()).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it('shows a picked colour by name, a free one by its hex, and Auto resets it', () => {
    const set = vi.fn();
    const host = mount(<ColorPicker label="X" value="#123456" auto="#66b2ff" onChange={set} />);
    const btn = host.querySelector<HTMLElement>('.wc-cp-btn')!;
    expect(btn.textContent).toContain('#123456');
    expect(btn.querySelector<HTMLElement>('.wc-ck-sw')!.style.background).toMatch(/#123456|rgb\(18, 52, 86\)/);
    click(btn);
    click(host.querySelector('.wc-cp-auto'));
    expect(set).toHaveBeenLastCalledWith('auto');
  });
});
