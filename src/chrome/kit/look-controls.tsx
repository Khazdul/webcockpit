// The lantern kit's controls and widgets (stage 41, ADR 0125; stage 42b,
// ADR 0127). Package 42b owns this file; its look is look-controls.css
// (the glass buttons' is look-glass.css, shared with the player).
//
// Re-derived from the round 7 base (notes/research/start-menu-mockups/
// round7/base/: gallery.html, base.css) in the app's structure. Every
// colour is a `--lk-*` token (look-tokens.css), so the same control works
// over the sky, in a dark window body and on Paper (`data-light`).
//
// Rules (the owner's, README "Baseline"): no key-hint rows; a shortcut is
// the letter marked inside its label; selection only brightens (no glide,
// glow or sweep). Buttons, options, tabs, checks and toggles never take
// the DOM focus (the frame stack keeps it: `tabIndex=-1`, no focus on
// press); the page's keys reach them through `selected` and its letters.
// Text fields and selects do take the focus while they are typed in (the
// stack's Esc rule gives it back, 42c). Nothing depends on hover.
//
// ARIA: `Seg` is a radiogroup of radios (one choice) or a group of
// checkboxes (`multi`), both with `aria-checked`; `Tabs` a tablist of tabs
// with `aria-selected`; `Check` a checkbox and `Toggle` a switch with
// `aria-checked`; disabled pieces carry `aria-disabled` (they stay in the
// layout and ignore presses); `Table` a table with column heads and
// `aria-sort`; a `Field` with an error is `aria-invalid` and described by
// its error or hint line.

import type { ComponentChildren, Ref, VNode } from 'preact';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { type IconDraw, type IconName, Icon } from './look-icons';
import { KeyLabel } from './look-keys';
import { FLASH_MS, type Flash, type FlashKind, useFlash } from './stack';
import './look-controls.css';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

function IconOf(p: { icon: IconName | IconDraw }): VNode {
  return typeof p.icon === 'string' ? <Icon name={p.icon} /> : <Icon {...p.icon} />;
}

/** Presses never move the DOM focus (the frame stack keeps it). */
const keepFocus = (e: MouseEvent): void => e.preventDefault();

function setRef<T>(ref: Ref<T> | undefined, el: T | null): void {
  if (typeof ref === 'function') ref(el);
  else if (ref) ref.current = el;
}

// ------------------------------------------------------------ buttons

export interface GlassButtonProps {
  /** The label; none: an icon-only button (then `title` is required). */
  label?: string;
  /** The shortcut letter, marked in the label (the page handles the key). */
  letter?: string;
  icon?: IconName | IconDraw;
  /** The icon after the label (Next →). */
  iconAfter?: boolean;
  /** Keep the icon on the phone (glass buttons drop their icons there). */
  keepIcon?: boolean;
  /** `data-btn` (tests and the page's own lookups). */
  id?: string;
  /** Keyboard cursor on it (the page's button zone). */
  selected?: boolean;
  disabled?: boolean;
  /** Destructive (Delete). */
  danger?: boolean;
  /** The page's main action. */
  primary?: boolean;
  small?: boolean;
  title?: string;
  onClick: () => void;
}

/**
 * A glass button: clear, faintly frosted glass with a lit top edge, no
 * texture. Never takes the focus (the frame stack keeps it); the page's
 * keys reach it through `selected` and its shortcut letter. Icon-only
 * without `label` (square; `title` is its name).
 */
export function GlassButton(p: GlassButtonProps): VNode {
  const cls = cx(
    'wc-lk-btn',
    p.selected && 'is-sel',
    p.disabled && 'is-disabled',
    p.danger && 'is-danger',
    p.primary && 'is-primary',
    p.small && 'is-small',
    p.keepIcon && 'keep-ic',
    p.label === undefined && 'is-icon',
  );
  const icon = p.icon && <IconOf icon={p.icon} />;
  return (
    <button
      type="button"
      class={cls}
      data-btn={p.id}
      tabIndex={-1}
      title={p.title}
      aria-label={p.label === undefined ? p.title : undefined}
      aria-disabled={p.disabled ? 'true' : undefined}
      aria-keyshortcuts={p.letter?.toUpperCase()}
      onMouseDown={keepFocus}
      onClick={(e) => {
        e.stopPropagation();
        if (!p.disabled) p.onClick();
      }}
    >
      {!p.iconAfter && icon}
      {p.label !== undefined && <KeyLabel text={p.label} letter={p.letter} />}
      {p.iconAfter && icon}
    </button>
  );
}

// ------------------------------------------------------------ choices

export interface SegOption {
  value: string;
  label: string;
  letter?: string;
  icon?: IconName | IconDraw;
  title?: string;
  disabled?: boolean;
  /** `data-opt`. */
  id?: string;
}

export type SegProps = {
  options: SegOption[];
  label: string;
  /** `pills`: scroll sideways, the chosen one kept in view. */
  kind?: 'seg' | 'pills';
  /** The keyboard's option (.is-sel). */
  selected?: number;
} & (
  | { multi?: false; value: string; onChange(v: string): void }
  | { multi: true; values: readonly string[]; onChange(v: string, on: boolean): void }
);

/** Scrolls `child` into `box`'s sideways view (only `box`, never the page). */
function keepInView(box: HTMLElement, child: HTMLElement | null): void {
  if (!child || box.scrollWidth <= box.clientWidth) return;
  const pad = 12;
  const left = child.offsetLeft;
  const right = left + child.offsetWidth;
  if (left - pad < box.scrollLeft) box.scrollLeft = Math.max(0, left - pad);
  else if (right + pad > box.scrollLeft + box.clientWidth) box.scrollLeft = right + pad - box.clientWidth;
}

/**
 * A segmented control (`kind="seg"`, one well) or a row of pills
 * (`kind="pills"`: one line that scrolls sideways, the keyboard's or the
 * chosen pill kept in view): one choice, or several with `multi` (chips).
 * The chosen option is lit glass; the keyboard's has a fine lit ring.
 */
export function Seg(p: SegProps): VNode {
  const on = (v: string): boolean => (p.multi ? p.values.includes(v) : p.value === v);
  const pills = p.kind === 'pills';
  const box = useRef<HTMLDivElement>(null);
  const chosen = p.multi ? undefined : p.value;
  useLayoutEffect(() => {
    const el = box.current;
    if (!pills || !el) return;
    const i = p.selected ?? (chosen === undefined ? -1 : p.options.findIndex((o) => o.value === chosen));
    keepInView(el, (el.children[i] as HTMLElement | undefined) ?? null);
  }, [pills, chosen, p.selected]);
  return (
    <div
      ref={box}
      class={cx('wc-lk-seg', pills && 'is-pills', p.multi && 'is-multi')}
      role={p.multi ? 'group' : 'radiogroup'}
      aria-label={p.label}
    >
      {p.options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          class={cx('wc-lk-opt', on(o.value) && 'is-on', p.selected === i && 'is-sel', o.disabled && 'is-disabled')}
          role={p.multi ? 'checkbox' : 'radio'}
          aria-checked={on(o.value) ? 'true' : 'false'}
          aria-disabled={o.disabled ? 'true' : undefined}
          aria-keyshortcuts={o.letter?.toUpperCase()}
          data-opt={o.id ?? o.value}
          tabIndex={-1}
          title={o.title}
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation();
            if (o.disabled) return;
            if (p.multi) p.onChange(o.value, !on(o.value));
            else if (!on(o.value)) p.onChange(o.value);
          }}
        >
          {o.icon && <IconOf icon={o.icon} />}
          <KeyLabel text={o.label} letter={o.letter} />
        </button>
      ))}
    </div>
  );
}

/** Page tabs: text with a fine lit underline under the active one (scrolls sideways when narrow). */
export function Tabs(p: { tabs: SegOption[]; value: string; onChange(v: string): void; label: string }): VNode {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (el) keepInView(el, el.querySelector<HTMLElement>('.wc-lk-tab.is-on'));
  }, [p.value]);
  return (
    <div ref={box} class="wc-lk-tabs" role="tablist" aria-label={p.label}>
      {p.tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          class={cx('wc-lk-tab', t.value === p.value && 'is-on', t.disabled && 'is-disabled')}
          role="tab"
          aria-selected={t.value === p.value ? 'true' : 'false'}
          aria-disabled={t.disabled ? 'true' : undefined}
          aria-keyshortcuts={t.letter?.toUpperCase()}
          data-tab={t.id ?? t.value}
          tabIndex={-1}
          title={t.title}
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation();
            if (!t.disabled && t.value !== p.value) p.onChange(t.value);
          }}
        >
          {t.icon && <IconOf icon={t.icon} />}
          <KeyLabel text={t.label} letter={t.letter} />
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ fields

export interface FieldProps {
  value: string;
  onInput(v: string): void;
  /** The value is committed: Enter or leaving the field after a change (the input's `change`). */
  onCommit?(v: string): void;
  label?: string;
  /** `data-field`. */
  id?: string;
  mono?: boolean;
  error?: string | null;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  selectAll?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

export interface TextAreaProps extends Omit<FieldProps, 'inputRef'> {
  rows?: number;
  inputRef?: Ref<HTMLTextAreaElement>;
}

function FieldShell(p: {
  label?: string | undefined;
  id?: string | undefined;
  error?: string | null | undefined;
  hint?: string | undefined;
  mono?: boolean | undefined;
  noteId: string;
  area?: boolean;
  children: ComponentChildren;
}): VNode {
  return (
    <label class={cx('wc-lk-field', p.area && 'is-area', p.mono && 'is-mono', p.error && 'is-bad')} data-field={p.id}>
      {p.label && <span class="wc-lk-lbl">{p.label}</span>}
      {p.children}
      {p.error ? (
        <span class="wc-lk-ferr" id={p.noteId}>
          {p.error}
        </span>
      ) : p.hint ? (
        <span class="wc-lk-fhint" id={p.noteId}>
          {p.hint}
        </span>
      ) : null}
    </label>
  );
}

/**
 * The field's own behaviour: the first focus (`autoFocus`, `selectAll`),
 * and kept above the phone's soft keyboard (when the visual viewport
 * shrinks under a focused field, the field scrolls into view).
 */
function useFieldEl(ref: { current: HTMLInputElement | HTMLTextAreaElement | null }, auto?: boolean, all?: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (auto) {
      el.focus({ preventScroll: true });
      if (all) el.select();
    }
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!vv) return;
    const onResize = (): void => {
      if (document.activeElement !== el || keyboardInset() <= 0) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > vv.offsetTop + vv.height || r.top < vv.offsetTop) el.scrollIntoView({ block: 'nearest' });
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);
}

/**
 * A text input in a glass well, with its label (small Cinzel caps) and an
 * error or hint line. Text in it is selectable (`user-select: text`).
 */
export function Field(p: FieldProps): VNode {
  const own = useRef<HTMLInputElement | null>(null);
  const noteId = useId();
  useFieldEl(own, p.autoFocus, p.selectAll);
  return (
    <FieldShell label={p.label} id={p.id} error={p.error} hint={p.hint} mono={p.mono} noteId={noteId}>
      <input
        ref={(el) => {
          own.current = el;
          setRef(p.inputRef, el);
        }}
        class="wc-lk-input"
        type="text"
        value={p.value}
        placeholder={p.placeholder}
        maxLength={p.maxLength}
        spellcheck={false}
        autocomplete="off"
        autocapitalize="off"
        aria-invalid={p.error ? 'true' : undefined}
        aria-describedby={p.error || p.hint ? noteId : undefined}
        onInput={(e) => p.onInput(e.currentTarget.value)}
        onChange={(e) => p.onCommit?.(e.currentTarget.value)}
      />
    </FieldShell>
  );
}

/** A multi-line text field in a glass well (resizes vertically). */
export function TextArea(p: TextAreaProps): VNode {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const noteId = useId();
  useFieldEl(own, p.autoFocus, p.selectAll);
  return (
    <FieldShell label={p.label} id={p.id} error={p.error} hint={p.hint} mono={p.mono} noteId={noteId} area>
      <textarea
        ref={(el) => {
          own.current = el;
          setRef(p.inputRef, el);
        }}
        class="wc-lk-input"
        value={p.value}
        rows={p.rows ?? 4}
        placeholder={p.placeholder}
        maxLength={p.maxLength}
        spellcheck={false}
        aria-invalid={p.error ? 'true' : undefined}
        aria-describedby={p.error || p.hint ? noteId : undefined}
        onInput={(e) => p.onInput(e.currentTarget.value)}
        onChange={(e) => p.onCommit?.(e.currentTarget.value)}
      />
    </FieldShell>
  );
}

/** A checkbox: a small well with a lit tick, and its label. */
export function Check(p: { checked: boolean; onChange(on: boolean): void; label: string; id?: string }): VNode {
  return (
    <button
      type="button"
      class={cx('wc-lk-check', p.checked && 'is-on')}
      role="checkbox"
      aria-checked={p.checked ? 'true' : 'false'}
      data-field={p.id}
      tabIndex={-1}
      onMouseDown={keepFocus}
      onClick={(e) => {
        e.stopPropagation();
        p.onChange(!p.checked);
      }}
    >
      <span class="wc-lk-cbox" aria-hidden="true" />
      <span class="wc-lk-clabel">{p.label}</span>
    </button>
  );
}

/** A toggle: a groove with a riveted knob, its state ("On" / "Off") and its label. */
export function Toggle(p: { on: boolean; onChange(on: boolean): void; label: string; id?: string }): VNode {
  return (
    <button
      type="button"
      class={cx('wc-lk-toggle', p.on && 'is-on')}
      role="switch"
      aria-checked={p.on ? 'true' : 'false'}
      aria-label={p.label}
      data-field={p.id}
      tabIndex={-1}
      onMouseDown={keepFocus}
      onClick={(e) => {
        e.stopPropagation();
        p.onChange(!p.on);
      }}
    >
      <span class="wc-lk-groove" aria-hidden="true">
        <i class="wc-lk-knob" />
      </span>
      <span class="wc-lk-tstate" aria-hidden="true">
        {p.on ? 'On' : 'Off'}
      </span>
      <span class="wc-lk-tlabel" aria-hidden="true">
        {p.label}
      </span>
    </button>
  );
}

/** A native select in a glass well, with a chevron and its label. */
export function Select(p: {
  value: string;
  options: { value: string; label: string }[];
  onChange(v: string): void;
  label: string;
  id?: string;
}): VNode {
  // A choice made with the pointer gives the focus back to the frame stack
  // at once (its letters and arrows work again); one made with the keys
  // keeps it in the select until Esc (the stack's Esc rule).
  const byPointer = useRef(false);
  return (
    <label class="wc-lk-field wc-lk-select" data-field={p.id}>
      <span class="wc-lk-lbl">{p.label}</span>
      <select
        class="wc-lk-input"
        value={p.value}
        aria-label={p.label}
        onPointerDown={() => (byPointer.current = true)}
        onKeyDown={() => (byPointer.current = false)}
        onChange={(e) => {
          const el = e.currentTarget;
          p.onChange(el.value);
          if (!byPointer.current) return;
          byPointer.current = false;
          const stack = el.closest<HTMLElement>('.wc-stack');
          el.blur();
          stack?.focus({ preventScroll: true });
        }}
      >
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ------------------------------------------------------------ tables

export interface TableHead {
  key: string;
  label: string;
  sort?: boolean;
  align?: 'end';
}

/**
 * A table on one grid (`cols` is its `grid-template-columns`) with
 * sortable heads: the sorted one has `data-dir` (`1` ascending ▴, `-1`
 * descending ▾) and `aria-sort`. Below `stackBelow` px of its own width
 * the table is `.is-stacked`: the heads hide and each row takes two lines
 * (the first cell on the first, the others after it; a page refines it in
 * its own CSS). Rows: `TableRow` in `.wc-lk-tbody`, cells `.wc-lk-td`
 * (`.is-end` right). With `scroll` the table fills its parent (a flex
 * column) and only the rows scroll under the fixed heads, in a thin iron
 * scrollbar (`bodyRef` is that scroller: a list cursor's `scrollRef`).
 */
export function Table(p: {
  /** `grid-template-columns`. */
  cols: string;
  heads: TableHead[];
  sort?: { key: string; dir: 1 | -1 };
  onSort?(key: string): void;
  /** Below this width (px) the rows take two lines. */
  stackBelow?: number;
  /** The heads stay, the rows scroll (the table fills a flex column). */
  scroll?: boolean;
  /** The rows' element (the scroller with `scroll`). */
  bodyRef?: Ref<HTMLDivElement>;
  children?: ComponentChildren;
}): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  const below = p.stackBelow;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !below) {
      setStacked(false);
      return;
    }
    const check = (w: number): void => setStacked(w > 0 && w < below);
    check(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => {
      const e = es[es.length - 1];
      if (e) check(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [below]);
  return (
    <div ref={ref} class={cx('wc-lk-tbl', stacked && 'is-stacked', p.scroll && 'is-scroll')} role="table" style={{ '--lk-cols': p.cols }}>
      <div class="wc-lk-throw" role="row">
        {p.heads.map((h) => {
          const dir = p.sort?.key === h.key ? p.sort.dir : undefined;
          return (
            <span
              key={h.key}
              class={cx('wc-lk-th', h.sort && 'is-sort', h.align === 'end' && 'is-end')}
              role="columnheader"
              data-key={h.key}
              data-dir={dir === undefined ? undefined : String(dir)}
              aria-sort={dir === undefined ? (h.sort ? 'none' : undefined) : dir === 1 ? 'ascending' : 'descending'}
              onMouseDown={h.sort ? keepFocus : undefined}
              onClick={h.sort ? () => p.onSort?.(h.key) : undefined}
            >
              {h.label}
            </span>
          );
        })}
      </div>
      <div class={cx('wc-lk-tbody', p.scroll && 'wc-lk-scroll')} role="rowgroup" ref={(el) => setRef(p.bodyRef, el)}>
        {p.children}
      </div>
    </div>
  );
}

/**
 * A table row (cells: `.wc-lk-td`, `.is-end` right-aligned). `on`: the
 * chosen row (its text brightens, nothing else). Takes a list cursor's
 * `rowProps(i)` whole: `onPointerDown` (which tells a touch tap from a
 * click), `onPointerMove`, the clicks and `data-i`.
 */
export function TableRow(p: {
  on?: boolean;
  id?: string;
  class?: string;
  onClick?(e: MouseEvent): void;
  onDblClick?(e: MouseEvent): void;
  onPointerDown?(e: PointerEvent): void;
  onPointerMove?(e: PointerEvent): void;
  'data-i'?: number;
  children?: ComponentChildren;
}): VNode {
  return (
    <div
      class={cx('wc-lk-tr', p.on && 'is-on', p.class)}
      role="row"
      data-id={p.id}
      data-i={p['data-i']}
      onPointerDown={p.onPointerDown && ((e) => p.onPointerDown?.(e))}
      onPointerMove={p.onPointerMove && ((e) => p.onPointerMove?.(e))}
      onClick={p.onClick && ((e) => p.onClick?.(e))}
      onDblClick={p.onDblClick && ((e) => p.onDblClick?.(e))}
    >
      {p.children}
    </div>
  );
}

// ------------------------------------------------------------ text pieces

/** A section heading with a hairline (and an optional right-hand button: Settings ─── Reset all). */
export function Rule(p: { title: string; children?: ComponentChildren }): VNode {
  return (
    <div class="wc-lk-rule">
      <h3 class="wc-lk-sec">{p.title}</h3>
      <i class="wc-lk-hair" aria-hidden="true" />
      {p.children}
    </div>
  );
}

/** A thin rule with an open diamond in the middle. */
export function OrnRule(): VNode {
  return <div class="wc-lk-orn" role="separator" aria-hidden="true" />;
}

/** A fold: a heading (small caps, a chevron) that opens and closes its content. */
export function Fold(p: { open: boolean; onToggle(): void; label: string; class?: string; children?: ComponentChildren }): VNode {
  const bodyId = useId();
  return (
    <div class={cx('wc-lk-fold', p.open && 'is-open', p.class)}>
      <button
        type="button"
        class="wc-lk-fold-h"
        aria-expanded={p.open ? 'true' : 'false'}
        aria-controls={p.open ? bodyId : undefined}
        tabIndex={-1}
        onMouseDown={keepFocus}
        onClick={(e) => {
          e.stopPropagation();
          p.onToggle();
        }}
      >
        <Icon name="fold" />
        <span>{p.label}</span>
      </button>
      {p.open && (
        <div class="wc-lk-fold-b" id={bodyId}>
          {p.children}
        </div>
      )}
    </div>
  );
}

/** A well: a sunk, solid surface (code, a log, a quote); `mono` in the terminal font. */
export function Well(p: { mono?: boolean; class?: string; children?: ComponentChildren }): VNode {
  return <div class={cx('wc-lk-well', p.mono && 'wc-lk-mono', p.class)}>{p.children}</div>;
}

/** A row of stars (`n` of `max`, default 5): gold, the rest faint. */
export function Stars(p: { n: number; max?: number }): VNode {
  const max = Math.max(0, Math.round(p.max ?? 5));
  const n = Math.max(0, Math.min(max, Math.round(p.n)));
  return (
    <span class="wc-lk-stars" role="img" aria-label={`${n} of ${max}`}>
      <span class="wc-lk-star-on">{'★'.repeat(n)}</span>
      <span class="wc-lk-star-off">{'★'.repeat(max - n)}</span>
    </span>
  );
}

/**
 * The "M" mark: the favicon's drawing (public/favicon.svg, built by
 * scripts/build-favicons.ts from the wordmark's M), as an image so its SVG
 * ids never clash and it costs no bundle bytes.
 */
export function Seal(p: { size?: number }): VNode {
  const s = p.size ?? 32;
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return <img class="wc-lk-seal" src={`${base}favicon.svg`} width={s} height={s} alt="" aria-hidden="true" draggable={false} />;
}

// ------------------------------------------------------------ feedback

/**
 * The page's transient message: an italic line at the bottom of the box.
 * Always laid out (empty when none), so the box never changes height.
 * Controlled when `flash` is given (`useLocalFlash`; then it works
 * outside a frame too), else the stack's flash (~3 s).
 */
export function LookFlash(p: { class?: string; flash?: Flash | null }): VNode {
  return p.flash !== undefined ? <FlashLine class={p.class} flash={p.flash} /> : <StackFlash class={p.class} />;
}

/** The stack's flash (only inside a frame). */
function StackFlash(p: { class?: string | undefined }): VNode {
  return <FlashLine class={p.class} flash={useFlash()} />;
}

function FlashLine(p: { class?: string | undefined; flash: Flash | null }): VNode {
  const f = p.flash;
  return (
    <div class={'wc-lk-flash' + (p.class ? ' ' + p.class : '')} role="status" aria-live="polite">
      {f && (
        <span key={f.seq} class={f.kind === 'ok' ? 'is-ok' : 'is-fail'}>
          {f.text}
        </span>
      )}
    </div>
  );
}

/** A flash of the page's own (a dialog, a pane of a page): `[flash, show(text, kind, ms)]`. */
export function useLocalFlash(): [Flash | null, (text: string, kind?: FlashKind, ms?: number) => void] {
  const [flash, setFlash] = useState<Flash | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const show = useRef((text: string, kind: FlashKind = 'ok', ms = FLASH_MS): void => {
    if (timer.current) clearTimeout(timer.current);
    setFlash({ text, kind, seq: ++seq.current });
    timer.current = setTimeout(() => setFlash(null), ms);
  }).current;
  return [flash, show];
}

// ------------------------------------------------------------ the soft keyboard

/**
 * The px the soft keyboard covers at the bottom of the layout viewport
 * (from `visualViewport`), 0 without one. A pinch zoom shrinks the visual
 * viewport too; that is told apart by its scale.
 */
export function keyboardInset(win: Pick<Window, 'innerHeight' | 'visualViewport'> | undefined = typeof window === 'undefined' ? undefined : window): number {
  const vv = win?.visualViewport;
  if (!win || !vv) return 0;
  const covered = vv.scale > 1.01 ? win.innerHeight - vv.height * vv.scale : win.innerHeight - vv.height - vv.offsetTop;
  return covered > 1 ? Math.round(covered) : 0;
}

/** The px the soft keyboard covers now (`keyboardInset`), updated as it opens and closes (one update per frame). */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(() => keyboardInset());
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const on = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setInset(keyboardInset()));
    };
    vv.addEventListener('resize', on);
    vv.addEventListener('scroll', on);
    on();
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', on);
      vv.removeEventListener('scroll', on);
    };
  }, []);
  return inset;
}
