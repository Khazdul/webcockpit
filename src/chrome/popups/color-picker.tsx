// The colour picker of the Group and Timers gear popups (ADR 0122): a
// swatch button that opens a small popover with the twelve picker colours
// (src/panes/palette.ts `PICKER_COLORS`), Auto (the pane's own default for
// the background, shown in its current colour) and a free colour input.
// The value is a colour setting: `auto` or `#rrggbb`.
//
//   <ColorPicker label="Spells colour" value={g.color} auto="#66b2ff" onChange={…} />
//
// - The popover is `position: fixed` next to its button (as the dropdown's
//   list, `listPlace`), inside the popup's DOM, so the popup's key and click
//   rules apply; it closes on a press outside it, a scroll outside it, a
//   resize or Esc (which gives the focus back to the button).
// - Keys: Enter, Space or ↓ open it; inside, ←→↑↓ move between the
//   swatches (six a row), Home/End jump, Enter or Space pick; Tab moves on
//   to Auto and the free colour input. Picking a swatch or Auto closes it;
//   the free input changes the value live while it is dragged.

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { PICKER_COLORS } from '../../panes/palette';
import type { ColorSetting } from '../../settings/types';
import { colorName } from '../pane-options-model';
import { listPlace } from './controls';

/** Swatches a row in the popover. */
export const PICKER_COLS = 6;

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** The index of `value` in the picker colours, or -1 (Auto, a free colour). */
export function pickerIndex(value: ColorSetting): number {
  if (value === 'auto') return -1;
  const v = value.toLowerCase();
  return PICKER_COLORS.findIndex((c) => c.hex.toLowerCase() === v);
}

/** The next swatch index for a key in a `cols`-wide grid of `n`, or null. */
export function pickerStep(key: string, at: number, n: number, cols = PICKER_COLS): number | null {
  switch (key) {
    case 'ArrowLeft':
      return Math.max(0, at - 1);
    case 'ArrowRight':
      return Math.min(n - 1, at + 1);
    case 'ArrowUp':
      return at - cols >= 0 ? at - cols : at;
    case 'ArrowDown':
      return at + cols < n ? at + cols : at;
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
  }
  return null;
}

const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;
const cls = (...xs: Array<string | false | null | undefined>): string => xs.filter(Boolean).join(' ');

interface Pos {
  left: number;
  top: number;
}

export function ColorPicker(p: {
  value: ColorSetting;
  /** The colour Auto stands for on this pane's background. */
  auto: string;
  onChange: (v: ColorSetting) => void;
  label: string;
  class?: string;
}): VNode {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const shown = p.value === 'auto' ? p.auto : p.value;
  const sel = pickerIndex(p.value);

  const hide = (refocus: boolean): void => {
    setOpen(false);
    if (refocus) btn.current?.focus({ preventScroll: true });
  };
  const show = (): void => {
    setPos(null);
    setOpen(true);
  };
  const pick = (v: ColorSetting): void => {
    hide(true);
    if (v !== p.value) p.onChange(v);
  };

  useLayoutEffect(() => {
    if (!open || pos) return;
    const b = btn.current;
    const el = pop.current;
    if (!b || !el) return;
    const win = b.ownerDocument.defaultView;
    const at = listPlace(b.getBoundingClientRect(), el.offsetHeight, win?.innerWidth ?? 0, win?.innerHeight ?? 0, el.offsetWidth);
    setPos({ left: at.left, top: at.top });
  }, [open, pos]);

  // Once placed, the selected swatch (or the first, or Auto) takes the focus.
  const placed = open && pos !== null;
  useLayoutEffect(() => {
    if (!placed) return;
    const el = pop.current;
    const target =
      sel >= 0
        ? el?.querySelectorAll<HTMLElement>('.wc-cp-sw')[sel]
        : p.value === 'auto'
          ? el?.querySelector<HTMLElement>('.wc-cp-auto')
          : el?.querySelector<HTMLElement>('.wc-cp-sw');
    target?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    if (!open) return;
    const doc = btn.current!.ownerDocument;
    const win = doc.defaultView;
    const inside = (t: EventTarget | null): boolean =>
      !!t && (pop.current?.contains(t as Node) === true || btn.current?.contains(t as Node) === true);
    const onDown = (e: Event): void => {
      if (!inside(e.target)) hide(false);
    };
    const onScroll = (e: Event): void => {
      if (!pop.current?.contains(e.target as Node)) hide(false);
    };
    const onResize = (): void => hide(false);
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('scroll', onScroll, true);
    win?.addEventListener('resize', onResize);
    return () => {
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('scroll', onScroll, true);
      win?.removeEventListener('resize', onResize);
    };
  }, [open]);

  const onBtnKey = (e: KeyboardEvent): void => {
    if (!plain(e) || open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      show();
    }
  };
  const onPopKey = (e: KeyboardEvent): void => {
    if (!plain(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
      return;
    }
    const sws = [...(pop.current?.querySelectorAll<HTMLElement>('.wc-cp-sw') ?? [])];
    const at = sws.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const next = pickerStep(e.key, at, sws.length);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    sws[next]?.focus({ preventScroll: true });
  };

  return (
    <span class={cls('wc-cp', p.class)}>
      <button
        type="button"
        class={cls('wc-cp-btn', open && 'is-open')}
        ref={btn}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={`${p.label}: ${colorName(p.value)}`}
        data-value={p.value}
        onKeyDown={onBtnKey}
        onClick={(e) => {
          e.stopPropagation();
          if (open) hide(true);
          else show();
        }}
      >
        <span class="wc-ck-sw" style={{ background: shown }} />
        <span class="wc-cp-v">{colorName(p.value)}</span>
        <svg class="wc-ck-chev" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5l3 3 3-3" />
        </svg>
      </button>
      {open && (
        <div
          class="wc-cp-pop"
          ref={pop}
          role="dialog"
          aria-label={p.label}
          onKeyDown={onPopKey}
          style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { visibility: 'hidden', left: '0px', top: '0px' }}
        >
          <span class="wc-cp-grid" role="group" aria-label="Colours">
            {PICKER_COLORS.map((c, i) => (
              <button
                type="button"
                class={cls('wc-cp-sw', sel === i && 'is-sel')}
                style={{ background: c.hex }}
                aria-label={c.label}
                aria-pressed={sel === i ? 'true' : 'false'}
                title={`${c.label} ${c.hex}`}
                data-hex={c.hex}
                onClick={(e) => {
                  e.stopPropagation();
                  pick(c.hex);
                }}
              />
            ))}
          </span>
          <span class="wc-cp-foot">
            <button
              type="button"
              class={cls('wc-cp-auto', p.value === 'auto' && 'is-sel')}
              aria-pressed={p.value === 'auto' ? 'true' : 'false'}
              onClick={(e) => {
                e.stopPropagation();
                pick('auto');
              }}
            >
              <span class="wc-ck-sw" style={{ background: p.auto }} />
              Auto <span class="wc-cp-note">(follows background)</span>
            </button>
            <label class={cls('wc-cp-free', p.value !== 'auto' && sel < 0 && 'is-sel')} title="Any colour">
              <input
                type="color"
                class="wc-cp-input"
                aria-label={`${p.label}: any colour`}
                value={shown}
                onInput={(e) => {
                  const hex = (e.currentTarget as HTMLInputElement).value;
                  if (HEX_RE.test(hex) && hex.toLowerCase() !== p.value) p.onChange(hex.toLowerCase());
                }}
              />
              Custom
            </label>
          </span>
        </div>
      )}
    </span>
  );
}
