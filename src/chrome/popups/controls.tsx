// The modern control kit (stage 30 S5/S6, ADR 0107): the controls of the
// Settings popup and the pane gear popups, in the menu bar's ghost look
// (mockup 30a-3; styles in popups.css, on top of the bar's `.wc-pop`).
//
//   <Row label="Size" help="…"><Slider … /></Row>
//   <Toggle on={x} onChange={…} label="Room notes" />
//   <Segmented value={v} options={[{ value, label }]} onChange={…} label="Cursor style" />
//   <Slider value={15} min={6} max={32} onChange={…} label="Size" unit="px" />
//   <Dropdown value={v} options={[{ value, label, swatch?, font? }]} onChange={…} label="Font" />
//   <SwatchGrid colors={…} names={…} selected={i} onPick={…} label="ANSI palette" />
//   <GhostButton onClick={…}>Reset palette</GhostButton>
//   <Stepper value={4} min={1} max={6} onChange={…} label="Spells columns" />
//   <CardGrid value={v} options={[{ value, label, name, preview }]} onChange={…} cols={5} labelledBy={id} />
//
// - Every control is a real focusable element with its ARIA role, and is
//   used from the keyboard once the popup has the keys (after a click in
//   it, ADR 0099): Tab and Shift+Tab move between them, Space or Enter
//   press, ←→ (and ↑↓) step a slider, a stepper, a segmented control, the
//   tabs and the swatches (a card grid: ←→ the next, ↑↓ the row above or
//   below), Home/End jump. A dropdown opens with Enter, Space or ↓;
//   its list takes ↑↓, Home/End, Enter and Esc (Esc closes only the list).
// - A slider is drawn here (pointer capture, `touch-action: none`), so it
//   drags the same in every browser and tells the popup while it is held
//   (`onHold`): the popup keeps its scale until it is let go (ADR 0107).
// - A dropdown's list is `position: fixed` next to its button, inside the
//   popup's DOM (the popup's key and click rules apply), not clipped by the
//   popup's inner scroll; it closes on a press outside it, a scroll or a
//   resize.
// - Values are shown as given: a colour that is not in a list stays
//   selected and is shown by its hex (the caller adds it, `colorOptions`).
// - An option with `font` draws its label in that CSS font family, on the
//   button and in the list (the font dropdown shows each font in itself).

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

const cls = (...xs: Array<string | false | null | undefined>): string => xs.filter(Boolean).join(' ');

/** A setting's row: its label (with a help line) left, the control right. */
export function Row(p: {
  label: ComponentChildren;
  help?: ComponentChildren;
  /** Label and control top-aligned (a help line, a tall control). */
  top?: boolean;
  /** Greyed (a master switch is off); the control still works. */
  dim?: boolean;
  class?: string;
  children?: ComponentChildren;
}): VNode {
  return (
    <div class={cls('wc-ck-row', p.top && 'is-top', p.dim && 'is-dim', p.class)}>
      <span class="wc-ck-l">
        {p.label}
        {p.help !== undefined && p.help !== null && p.help !== '' && <small class="wc-ck-help">{p.help}</small>}
      </span>
      <span class="wc-ck-ctl">{p.children}</span>
    </div>
  );
}

/** An on/off switch (`role=switch`). */
export function Toggle(p: { on: boolean; onChange: (on: boolean) => void; label: string; class?: string }): VNode {
  return (
    <button
      type="button"
      role="switch"
      class={cls('wc-ck-tg', p.on && 'is-on', p.class)}
      aria-checked={p.on ? 'true' : 'false'}
      aria-label={p.label}
      onClick={(e) => {
        e.stopPropagation();
        p.onChange(!p.on);
      }}
    >
      <i />
    </button>
  );
}

export interface Choice<T> {
  value: T;
  label: string;
}

/** The index after `at` for a step key (wrapping), or null for another key. */
export function stepIndex(key: string, at: number, n: number, wrap = true): number | null {
  if (n <= 0) return null;
  let next: number;
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      next = at - 1;
      break;
    case 'ArrowRight':
    case 'ArrowDown':
      next = at + 1;
      break;
    case 'Home':
      return 0;
    case 'End':
      return n - 1;
    default:
      return null;
  }
  if (wrap) return (next + n) % n;
  return Math.max(0, Math.min(n - 1, next));
}

const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;

/** One choice of a few, side by side (`role=radiogroup`); ←→ pick the next. */
export function Segmented<T extends string>(p: {
  value: T;
  options: readonly Choice<T>[];
  onChange: (v: T) => void;
  label: string;
}): VNode {
  const ref = useRef<HTMLSpanElement>(null);
  const at = p.options.findIndex((o) => o.value === p.value);
  const onKey = (e: KeyboardEvent): void => {
    if (!plain(e)) return;
    const next = stepIndex(e.key, Math.max(0, at), p.options.length);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    p.onChange(p.options[next]!.value);
    ref.current?.querySelectorAll<HTMLElement>('.wc-ck-sg')[next]?.focus({ preventScroll: true });
  };
  return (
    <span class="wc-ck-seg" role="radiogroup" aria-label={p.label} ref={ref} onKeyDown={onKey}>
      {p.options.map((o, i) => {
        const on = i === at;
        return (
          <button
            type="button"
            role="radio"
            class={cls('wc-ck-sg', on && 'is-on')}
            aria-checked={on ? 'true' : 'false'}
            tabIndex={on || (at < 0 && i === 0) ? 0 : -1}
            data-value={o.value}
            onClick={(e) => {
              e.stopPropagation();
              p.onChange(o.value);
            }}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/** `v` on the slider's grid (`min + k × step`), inside [min, max]. */
export function snapValue(v: number, min: number, max: number, step: number): number {
  const k = Math.round((v - min) / step);
  const out = min + k * step;
  return Math.max(min, Math.min(max, Number(out.toFixed(6))));
}

/** A horizontal slider with its value beside it (`role=slider`). */
export function Slider(p: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  /** Shown after the value (`15 px`). */
  unit?: string;
  /** Pressed (true) and let go (false): the popup keeps its scale meanwhile. */
  onHold?: (held: boolean) => void;
}): VNode {
  const step = p.step ?? 1;
  const ref = useRef<HTMLDivElement>(null);
  const held = useRef<number | null>(null);
  // The latest props for the pointer handlers.
  const props = useRef(p);
  props.current = p;
  const set = (v: number): void => {
    const q = props.current;
    const next = snapValue(v, q.min, q.max, step);
    if (next !== q.value) q.onChange(next);
  };
  const fromX = (x: number): number => {
    const r = ref.current!.getBoundingClientRect();
    const t = r.width > 0 ? Math.max(0, Math.min(1, (x - r.left) / r.width)) : 0;
    return p.min + t * (p.max - p.min);
  };
  const end = (e: PointerEvent): void => {
    if (held.current !== e.pointerId) return;
    held.current = null;
    try {
      ref.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    props.current.onHold?.(false);
  };
  useEffect(
    () => () => {
      if (held.current !== null) props.current.onHold?.(false);
    },
    [],
  );
  const onKey = (e: KeyboardEvent): void => {
    if (!plain(e)) return;
    const big = Math.max(step, Math.round((p.max - p.min) / 10 / step) * step);
    let v: number | null = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = p.value - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = p.value + step;
    else if (e.key === 'PageDown') v = p.value - big;
    else if (e.key === 'PageUp') v = p.value + big;
    else if (e.key === 'Home') v = p.min;
    else if (e.key === 'End') v = p.max;
    if (v === null) return;
    e.preventDefault();
    e.stopPropagation();
    set(v);
  };
  const t = p.max > p.min ? (Math.max(p.min, Math.min(p.max, p.value)) - p.min) / (p.max - p.min) : 0;
  const pct = `${(t * 100).toFixed(3)}%`;
  const text = p.unit ? `${p.value} ${p.unit}` : String(p.value);
  return (
    <>
      <div
        class="wc-ck-rng"
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={p.label}
        aria-valuemin={p.min}
        aria-valuemax={p.max}
        aria-valuenow={p.value}
        aria-valuetext={text}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          held.current = e.pointerId;
          try {
            ref.current?.setPointerCapture(e.pointerId);
          } catch {
            /* not capturable (tests) */
          }
          ref.current?.focus({ preventScroll: true });
          p.onHold?.(true);
          set(fromX(e.clientX));
        }}
        onPointerMove={(e) => {
          if (held.current === e.pointerId) set(fromX(e.clientX));
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        <span class="wc-ck-rng-track" />
        <span class="wc-ck-rng-fill" style={{ width: pct }} />
        <span class="wc-ck-rng-thumb" style={{ left: pct }} />
      </div>
      <span class="wc-ck-val">{text}</span>
    </>
  );
}

export interface DropdownOption<T> extends Choice<T> {
  /** A colour swatch before the label (any CSS colour). */
  swatch?: string;
  /** A CSS `font-family` for the label (the font dropdown: each name in its own font). */
  font?: string;
}

/** Rows a dropdown's list shows before it scrolls. */
const LIST_ROWS = 12;
/** Gap between the button and its list, and the least margin to the viewport edge (px). */
const LIST_GAP = 2;
const LIST_MARGIN = 4;

interface ListPos {
  left: number;
  top: number;
  minWidth: number;
  maxHeight: number;
}

/**
 * Where a list of natural height `h` goes for a button at `b` in a
 * viewport `vw × vh`: below the button when it fits (or has the more
 * room), else above; never past the viewport.
 */
export function listPlace(b: { left: number; top: number; bottom: number; width: number }, h: number, vw: number, vh: number, w: number): ListPos {
  const below = vh - b.bottom - LIST_GAP - LIST_MARGIN;
  const above = b.top - LIST_GAP - LIST_MARGIN;
  const down = h <= below || below >= above;
  const maxHeight = Math.max(0, Math.min(h, down ? below : above));
  const top = down ? b.bottom + LIST_GAP : b.top - LIST_GAP - maxHeight;
  const width = Math.max(w, b.width);
  const left = Math.max(LIST_MARGIN, Math.min(b.left, vw - width - LIST_MARGIN));
  return { left: Math.round(left), top: Math.round(top), minWidth: Math.round(b.width), maxHeight: Math.floor(maxHeight) };
}

const CHEVRON = 'M2 3.5l3 3 3-3';

/** A ghost-styled select: a button with the value; its list opens below (or above). */
export function Dropdown<T extends string | number>(p: {
  value: T;
  options: readonly DropdownOption<T>[];
  onChange: (v: T) => void;
  label: string;
  class?: string;
}): VNode {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<ListPos | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const at = p.options.findIndex((o) => o.value === p.value);
  const cur = at >= 0 ? p.options[at] : undefined;
  const id = useRef(`wc-ck-dd-${Math.random().toString(36).slice(2, 9)}`).current;

  const show = (): void => {
    setActive(Math.max(0, at));
    setPos(null);
    setOpen(true);
  };
  const hide = (refocus: boolean): void => {
    setOpen(false);
    if (refocus) btn.current?.focus({ preventScroll: true });
  };
  const pick = (i: number): void => {
    const o = p.options[i];
    hide(true);
    if (o && o.value !== p.value) p.onChange(o.value);
  };

  // Place the list once it is drawn (its natural size), then give it the focus.
  useLayoutEffect(() => {
    if (!open || pos) return;
    const b = btn.current;
    const l = list.current;
    if (!b || !l) return;
    const win = b.ownerDocument.defaultView;
    const row = l.querySelector<HTMLElement>('.wc-ck-opt')?.offsetHeight ?? 0;
    const natural = row > 0 ? Math.min(l.scrollHeight, row * LIST_ROWS + 2) : l.scrollHeight;
    setPos(listPlace(b.getBoundingClientRect(), natural, win?.innerWidth ?? 0, win?.innerHeight ?? 0, l.offsetWidth));
  }, [open, pos]);

  // Once placed (and visible), the list takes the focus.
  const placed = open && pos !== null;
  useLayoutEffect(() => {
    if (placed) list.current?.focus({ preventScroll: true });
  }, [placed]);

  // The active option stays in view.
  useLayoutEffect(() => {
    if (!open) return;
    const el = list.current?.querySelectorAll<HTMLElement>('.wc-ck-opt')[active];
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, pos]);

  // A press outside, a scroll outside the list or a resize closes it.
  useEffect(() => {
    if (!open) return;
    const doc = btn.current!.ownerDocument;
    const win = doc.defaultView;
    const inside = (t: EventTarget | null): boolean =>
      !!t && (list.current?.contains(t as Node) === true || btn.current?.contains(t as Node) === true);
    const onDown = (e: Event): void => {
      if (!inside(e.target)) hide(false);
    };
    const onScroll = (e: Event): void => {
      if (!list.current?.contains(e.target as Node)) hide(false);
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
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      show();
    }
  };
  const onListKey = (e: KeyboardEvent): void => {
    if (!plain(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      pick(active);
      return;
    }
    if (e.key === 'Tab') {
      hide(true);
      return;
    }
    const step = e.key === 'PageDown' ? LIST_ROWS : e.key === 'PageUp' ? -LIST_ROWS : 0;
    const next = step !== 0 ? Math.max(0, Math.min(p.options.length - 1, active + step)) : stepIndex(e.key, active, p.options.length, false);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    setActive(next);
  };

  return (
    <span class={cls('wc-ck-ddw', p.class)}>
      <button
        type="button"
        class={cls('wc-ck-dd', open && 'is-open')}
        ref={btn}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={p.label}
        onKeyDown={onBtnKey}
        onClick={(e) => {
          e.stopPropagation();
          if (open) hide(true);
          else show();
        }}
      >
        {cur?.swatch !== undefined && <span class="wc-ck-sw" style={{ background: cur.swatch }} />}
        <span class="wc-ck-v" style={cur?.font ? { fontFamily: cur.font } : undefined}>
          {cur?.label ?? String(p.value)}
        </span>
        <svg class="wc-ck-chev" viewBox="0 0 10 10" aria-hidden="true">
          <path d={CHEVRON} />
        </svg>
      </button>
      {open && (
        <div
          class="wc-ck-list"
          ref={list}
          id={id}
          role="listbox"
          aria-label={p.label}
          tabIndex={-1}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          style={
            pos
              ? { left: `${pos.left}px`, top: `${pos.top}px`, minWidth: `${pos.minWidth}px`, maxHeight: `${pos.maxHeight}px` }
              : { visibility: 'hidden', left: '0px', top: '0px' }
          }
        >
          {p.options.map((o, i) => (
            <div
              id={`${id}-${i}`}
              role="option"
              class={cls('wc-ck-opt', i === active && 'is-active', i === at && 'is-sel')}
              aria-selected={i === at ? 'true' : 'false'}
              data-value={String(o.value)}
              onPointerMove={() => i !== active && setActive(i)}
              onClick={(e) => {
                e.stopPropagation();
                pick(i);
              }}
            >
              {o.swatch !== undefined && <span class="wc-ck-sw" style={{ background: o.swatch }} />}
              <span class="wc-ck-v" style={o.font ? { fontFamily: o.font } : undefined}>
                {o.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

/** A grid of colour swatches (eight a row); a click or Enter picks one. */
export function SwatchGrid(p: {
  colors: readonly string[];
  /** Each swatch's name (tooltip and label). */
  names: readonly string[];
  selected: number | null;
  onPick: (i: number, el: HTMLElement) => void;
  label: string;
  cols?: number;
}): VNode {
  const ref = useRef<HTMLSpanElement>(null);
  const cols = p.cols ?? 8;
  const focusAt = (i: number): void => ref.current?.querySelectorAll<HTMLElement>('.wc-ck-pc')[i]?.focus({ preventScroll: true });
  const onKey = (e: KeyboardEvent): void => {
    if (!plain(e)) return;
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('.wc-ck-pc') ?? [])];
    const at = els.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    const n = els.length;
    let next: number | null = null;
    if (e.key === 'ArrowLeft') next = Math.max(0, at - 1);
    else if (e.key === 'ArrowRight') next = Math.min(n - 1, at + 1);
    else if (e.key === 'ArrowUp') next = at - cols >= 0 ? at - cols : at;
    else if (e.key === 'ArrowDown') next = at + cols < n ? at + cols : at;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    focusAt(next);
  };
  return (
    <span class="wc-ck-pal" role="group" aria-label={p.label} ref={ref} onKeyDown={onKey} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {p.colors.map((c, i) => (
        <button
          type="button"
          class={cls('wc-ck-pc', p.selected === i && 'is-sel')}
          style={{ background: c }}
          aria-label={p.names[i] ?? c}
          aria-pressed={p.selected === i ? 'true' : 'false'}
          title={`${p.names[i] ?? ''} ${c}`.trim()}
          data-index={i}
          onClick={(e) => {
            e.stopPropagation();
            p.onPick(i, e.currentTarget as HTMLElement);
          }}
        />
      ))}
    </span>
  );
}

/** A small bordered ghost button. */
export function GhostButton(p: {
  onClick: () => void;
  children: ComponentChildren;
  disabled?: boolean;
  danger?: boolean;
  class?: string;
  label?: string;
}): VNode {
  return (
    <button
      type="button"
      class={cls('wc-ck-gb', p.danger && 'is-danger', p.class)}
      disabled={p.disabled}
      aria-disabled={p.disabled ? 'true' : undefined}
      {...(p.label ? { 'aria-label': p.label } : {})}
      onClick={(e) => {
        e.stopPropagation();
        if (!p.disabled) p.onClick();
      }}
    >
      {p.children}
    </button>
  );
}

/**
 * A small number stepper (`role=spinbutton`): `‹ 4 ›`, one tab stop; ←↓
 * and ‹ step down, →↑ and › up, Home/End jump to the ends. Inside
 * [min, max].
 */
export function Stepper(p: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; class?: string }): VNode {
  const set = (v: number): void => {
    const n = Math.max(p.min, Math.min(p.max, v));
    if (n !== p.value) p.onChange(n);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (!plain(e)) return;
    const k = e.key;
    const next =
      k === 'ArrowLeft' || k === 'ArrowDown'
        ? p.value - 1
        : k === 'ArrowRight' || k === 'ArrowUp'
          ? p.value + 1
          : k === 'Home'
            ? p.min
            : k === 'End'
              ? p.max
              : null;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    set(next);
  };
  const step = (d: number, glyph: string, disabled: boolean): VNode => (
    <button
      type="button"
      class={cls('wc-ck-step', disabled && 'is-off')}
      tabIndex={-1}
      aria-hidden="true"
      data-step={d < 0 ? 'dec' : 'inc'}
      onClick={(e) => {
        e.stopPropagation();
        set(p.value + d);
      }}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <path d={glyph} />
      </svg>
    </button>
  );
  return (
    <span
      class={cls('wc-ck-num', p.class)}
      role="spinbutton"
      tabIndex={0}
      aria-label={p.label}
      aria-valuenow={p.value}
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      onKeyDown={onKey}
    >
      {step(-1, 'M6 2.5 3.5 5 6 7.5', p.value <= p.min)}
      <span class="wc-ck-num-v">{p.value}</span>
      {step(1, 'M4 2.5 6.5 5 4 7.5', p.value >= p.max)}
    </span>
  );
}

/** Tabs over a popup's pages (`role=tablist`); ←→ pick the next. */
export function Tabs<T extends string>(p: { value: T; tabs: readonly Choice<T>[]; onChange: (v: T) => void; label: string }): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const at = p.tabs.findIndex((t) => t.value === p.value);
  const onKey = (e: KeyboardEvent): void => {
    if (!plain(e) || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End')) return;
    const next = stepIndex(e.key, Math.max(0, at), p.tabs.length);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    p.onChange(p.tabs[next]!.value);
    ref.current?.querySelectorAll<HTMLElement>('.wc-ck-tab')[next]?.focus({ preventScroll: true });
  };
  return (
    <div class="wc-ck-tabs" role="tablist" aria-label={p.label} ref={ref} onKeyDown={onKey}>
      {p.tabs.map((t, i) => (
        <button
          type="button"
          role="tab"
          class={cls('wc-ck-tab', i === at && 'is-sel')}
          aria-selected={i === at ? 'true' : 'false'}
          tabIndex={i === at ? 0 : -1}
          data-tab={t.value}
          onClick={(e) => {
            e.stopPropagation();
            p.onChange(t.value);
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** A tick (a card grid's chosen card). */
const CHECK = 'M2.5 6.2l2.4 2.4 4.6-5';

export interface CardOption<T> extends Choice<T> {
  /** The full name (accessible name and tooltip) when the label is short. */
  name?: string;
  /** The picture: fills a square above the label. */
  preview: ComponentChildren;
}

/**
 * The index a grid key moves to from `at` in `n` cards of `cols` a row:
 * ←→ the previous or next card (into the row above or below), ↑↓ the
 * same column a row up or down, Home/End the first and last; it stops at
 * the ends. Null for another key.
 */
export function gridStep(key: string, at: number, n: number, cols: number): number | null {
  let next: number;
  switch (key) {
    case 'ArrowLeft':
      next = at - 1;
      break;
    case 'ArrowRight':
      next = at + 1;
      break;
    case 'ArrowUp':
      next = at - cols;
      break;
    case 'ArrowDown':
      next = at + cols;
      break;
    case 'Home':
      return n > 0 ? 0 : null;
    case 'End':
      return n > 0 ? n - 1 : null;
    default:
      return null;
  }
  return next >= 0 && next < n ? next : at;
}

/**
 * One choice of a grid of picture cards (`role=radiogroup`, ADR 0118):
 * each card a square preview with a check box in its top-right corner and
 * its label under it. One tab stop (the chosen card); the arrow keys move
 * and choose (`gridStep`).
 */
export function CardGrid<T extends string>(p: {
  value: T;
  options: readonly CardOption<T>[];
  onChange: (v: T) => void;
  cols: number;
  /** The id of the element naming the group, else `label`. */
  labelledBy?: string;
  label?: string;
  class?: string;
}): VNode {
  const ref = useRef<HTMLSpanElement>(null);
  const at = p.options.findIndex((o) => o.value === p.value);
  const onKey = (e: KeyboardEvent): void => {
    if (!plain(e)) return;
    const next = gridStep(e.key, Math.max(0, at), p.options.length, p.cols);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    if (next !== at) p.onChange(p.options[next]!.value);
    ref.current?.querySelectorAll<HTMLElement>('.wc-ck-card')[next]?.focus({ preventScroll: true });
  };
  return (
    <span
      class={cls('wc-ck-cards', p.class)}
      role="radiogroup"
      ref={ref}
      onKeyDown={onKey}
      style={{ gridTemplateColumns: `repeat(${p.cols}, minmax(0, 1fr))` }}
      {...(p.labelledBy ? { 'aria-labelledby': p.labelledBy } : { 'aria-label': p.label })}
    >
      {p.options.map((o, i) => {
        const on = i === at;
        return (
          <button
            type="button"
            role="radio"
            class={cls('wc-ck-card', on && 'is-on')}
            aria-checked={on ? 'true' : 'false'}
            aria-label={o.name ?? o.label}
            title={o.name ?? o.label}
            tabIndex={on || (at < 0 && i === 0) ? 0 : -1}
            data-value={o.value}
            onClick={(e) => {
              e.stopPropagation();
              if (!on) p.onChange(o.value);
            }}
          >
            <span class="wc-ck-card-pv">
              {o.preview}
              <span class="wc-ck-card-box" aria-hidden="true">
                {on && (
                  <svg viewBox="0 0 12 12">
                    <path d={CHECK} />
                  </svg>
                )}
              </span>
            </span>
            <span class="wc-ck-card-l">{o.label}</span>
          </button>
        );
      })}
    </span>
  );
}
