// The lantern kit's controls and widgets (stage 41, ADR 0125; stage 42,
// ADR 0127). Package 42b owns this file.
//
// `GlassButton` and `LookFlash` are stage 41's, unchanged in behaviour.
// The rest are 42-0 stubs: the stage 42 API's names, props and exports,
// rendered as plain elements with the right roles, so that the parallel
// packages (42c's dialogs, 42e's find head, the gallery sections) can code
// against them before 42b draws them.
//
// Rules (the owner's, README "Baseline"): glass buttons never take the DOM
// focus (the frame stack keeps it); the page's keys reach them through
// `selected` and their shortcut letter.

import type { ComponentChildren, Ref, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type IconDraw, type IconName, Icon } from './look-icons';
import { KeyLabel } from './look-keys';
import { FLASH_MS, type Flash, type FlashKind, useFlash } from './stack';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

function IconOf(p: { icon: IconName | IconDraw }): VNode {
  return typeof p.icon === 'string' ? <Icon name={p.icon} /> : <Icon {...p.icon} />;
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
 * keys reach it through `selected` and its shortcut letter.
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
      onMouseDown={(e) => e.preventDefault()}
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

/** A segmented control or a row of pills (one choice, or several with `multi`). 42-0 stub. */
export function Seg(p: SegProps): VNode {
  const on = (v: string): boolean => (p.multi ? p.values.includes(v) : p.value === v);
  return (
    <div
      class={cx('wc-lk-seg', p.kind === 'pills' && 'is-pills')}
      role={p.multi ? 'group' : 'radiogroup'}
      aria-label={p.label}
    >
      {p.options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          class={cx('wc-lk-opt', on(o.value) && 'is-on', p.selected === i && 'is-sel')}
          role={p.multi ? 'checkbox' : 'radio'}
          aria-checked={on(o.value) ? 'true' : 'false'}
          aria-disabled={o.disabled ? 'true' : undefined}
          data-opt={o.id ?? o.value}
          tabIndex={-1}
          title={o.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            if (o.disabled) return;
            if (p.multi) p.onChange(o.value, !on(o.value));
            else p.onChange(o.value);
          }}
        >
          {o.icon && <IconOf icon={o.icon} />}
          <KeyLabel text={o.label} letter={o.letter} />
        </button>
      ))}
    </div>
  );
}

/** Page tabs (a fine lit underline on the active one). 42-0 stub. */
export function Tabs(p: { tabs: SegOption[]; value: string; onChange(v: string): void; label: string }): VNode {
  return (
    <div class="wc-lk-tabs" role="tablist" aria-label={p.label}>
      {p.tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          class={cx('wc-lk-tab', t.value === p.value && 'is-on')}
          role="tab"
          aria-selected={t.value === p.value ? 'true' : 'false'}
          aria-disabled={t.disabled ? 'true' : undefined}
          data-tab={t.id ?? t.value}
          tabIndex={-1}
          title={t.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            if (!t.disabled) p.onChange(t.value);
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

function FieldShell(p: { label?: string | undefined; id?: string | undefined; error?: string | null | undefined; hint?: string | undefined; mono?: boolean | undefined; children: ComponentChildren }): VNode {
  return (
    <label class={cx('wc-lk-field', p.mono && 'is-mono', p.error && 'is-bad')} data-field={p.id}>
      {p.label && <span class="wc-lk-lbl">{p.label}</span>}
      {p.children}
      {p.error ? <span class="wc-lk-ferr">{p.error}</span> : p.hint ? <span class="wc-lk-fhint">{p.hint}</span> : null}
    </label>
  );
}

function useAutoFocus(ref: { current: HTMLInputElement | HTMLTextAreaElement | null }, auto?: boolean, all?: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !auto) return;
    el.focus({ preventScroll: true });
    if (all) el.select();
  }, []);
}

/** A text input in a glass well, with its label and an error or hint line. 42-0 stub. */
export function Field(p: FieldProps): VNode {
  const own = useRef<HTMLInputElement | null>(null);
  useAutoFocus(own, p.autoFocus, p.selectAll);
  return (
    <FieldShell label={p.label} id={p.id} error={p.error} hint={p.hint} mono={p.mono}>
      <input
        ref={(el) => {
          own.current = el;
          if (typeof p.inputRef === 'function') p.inputRef(el);
          else if (p.inputRef) p.inputRef.current = el;
        }}
        type="text"
        value={p.value}
        placeholder={p.placeholder}
        maxLength={p.maxLength}
        spellcheck={false}
        aria-invalid={p.error ? 'true' : undefined}
        onInput={(e) => p.onInput(e.currentTarget.value)}
        onChange={(e) => p.onCommit?.(e.currentTarget.value)}
      />
    </FieldShell>
  );
}

/** A multi-line text field in a glass well. 42-0 stub. */
export function TextArea(p: TextAreaProps): VNode {
  const own = useRef<HTMLTextAreaElement | null>(null);
  useAutoFocus(own, p.autoFocus, p.selectAll);
  return (
    <FieldShell label={p.label} id={p.id} error={p.error} hint={p.hint} mono={p.mono}>
      <textarea
        ref={(el) => {
          own.current = el;
          if (typeof p.inputRef === 'function') p.inputRef(el);
          else if (p.inputRef) p.inputRef.current = el;
        }}
        value={p.value}
        rows={p.rows}
        placeholder={p.placeholder}
        maxLength={p.maxLength}
        spellcheck={false}
        aria-invalid={p.error ? 'true' : undefined}
        onInput={(e) => p.onInput(e.currentTarget.value)}
        onChange={(e) => p.onCommit?.(e.currentTarget.value)}
      />
    </FieldShell>
  );
}

/** A checkbox with a lit tick. 42-0 stub. */
export function Check(p: { checked: boolean; onChange(on: boolean): void; label: string; id?: string }): VNode {
  return (
    <label class="wc-lk-check" data-field={p.id}>
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.currentTarget.checked)} />
      <span>{p.label}</span>
    </label>
  );
}

/** A toggle: a groove and a riveted knob, "On / Off". 42-0 stub. */
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
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        p.onChange(!p.on);
      }}
    >
      <span class="wc-lk-tlabel">{p.label}</span>
      <span class="wc-lk-tstate">{p.on ? 'On' : 'Off'}</span>
    </button>
  );
}

/** A select in a glass well. 42-0 stub. */
export function Select(p: {
  value: string;
  options: { value: string; label: string }[];
  onChange(v: string): void;
  label: string;
  id?: string;
}): VNode {
  return (
    <label class="wc-lk-field wc-lk-select" data-field={p.id}>
      <span class="wc-lk-lbl">{p.label}</span>
      <select value={p.value} onChange={(e) => p.onChange(e.currentTarget.value)}>
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

/** A table on one grid with sortable heads (`data-dir`). 42-0 stub. */
export function Table(p: {
  /** `grid-template-columns`. */
  cols: string;
  heads: TableHead[];
  sort?: { key: string; dir: 1 | -1 };
  onSort?(key: string): void;
  /** Below this width (px) the rows take two lines. */
  stackBelow?: number;
  children?: ComponentChildren;
}): VNode {
  return (
    <div class="wc-lk-tbl" role="table" style={{ '--lk-cols': p.cols }}>
      <div class="wc-lk-throw" role="row">
        {p.heads.map((h) => (
          <span
            key={h.key}
            class={cx('wc-lk-th', h.sort && 'is-sort', h.align === 'end' && 'is-end')}
            role="columnheader"
            data-key={h.key}
            data-dir={p.sort?.key === h.key ? String(p.sort.dir) : undefined}
            onClick={h.sort ? () => p.onSort?.(h.key) : undefined}
          >
            {h.label}
          </span>
        ))}
      </div>
      {p.children}
    </div>
  );
}

/** A table row (cells: `.wc-lk-td`). 42-0 stub. */
export function TableRow(p: {
  on?: boolean;
  id?: string;
  onClick?(): void;
  onDblClick?(): void;
  children?: ComponentChildren;
}): VNode {
  return (
    <div
      class={cx('wc-lk-tr', p.on && 'is-on')}
      role="row"
      data-id={p.id}
      onClick={p.onClick && (() => p.onClick?.())}
      onDblClick={p.onDblClick && (() => p.onDblClick?.())}
    >
      {p.children}
    </div>
  );
}

// ------------------------------------------------------------ text pieces

/** A section heading with a hairline (and an optional right-hand button). 42-0 stub. */
export function Rule(p: { title: string; children?: ComponentChildren }): VNode {
  return (
    <div class="wc-lk-rule">
      <span class="wc-lk-sec">{p.title}</span>
      <i class="wc-lk-hair" />
      {p.children}
    </div>
  );
}

/** A thin rule with an open diamond. 42-0 stub. */
export function OrnRule(): VNode {
  return <div class="wc-lk-orn" role="separator" aria-hidden="true" />;
}

/** A fold: a heading that opens and closes its content. 42-0 stub. */
export function Fold(p: { open: boolean; onToggle(): void; label: string; children?: ComponentChildren }): VNode {
  return (
    <div class={cx('wc-lk-fold', p.open && 'is-open')}>
      <button
        type="button"
        class="wc-lk-fold-h"
        aria-expanded={p.open ? 'true' : 'false'}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          p.onToggle();
        }}
      >
        {p.label}
      </button>
      {p.open && <div class="wc-lk-fold-b">{p.children}</div>}
    </div>
  );
}

/** A well: a sunk, solid surface (code, a log, a quote). 42-0 stub. */
export function Well(p: { mono?: boolean; class?: string; children?: ComponentChildren }): VNode {
  return <div class={cx('wc-lk-well', p.mono && 'wc-lk-mono', p.class)}>{p.children}</div>;
}

/** A row of stars (`n` of `max`). 42-0 stub. */
export function Stars(p: { n: number; max?: number }): VNode {
  const max = p.max ?? 5;
  return (
    <span class="wc-lk-stars" role="img" aria-label={`${p.n} of ${max}`}>
      {'★'.repeat(Math.max(0, Math.min(max, p.n)))}
      {'☆'.repeat(Math.max(0, max - Math.max(0, p.n)))}
    </span>
  );
}

/** The "M" mark (the favicon's drawing). 42-0 stub. */
export function Seal(p: { size?: number }): VNode {
  const s = p.size ?? 32;
  return <span class="wc-lk-seal" style={{ width: `${s}px`, height: `${s}px` }} aria-hidden="true" />;
}

// ------------------------------------------------------------ feedback

/**
 * The page's transient message: an italic line at the bottom of the box.
 * Always laid out (empty when none), so the box never changes height.
 * Controlled when `flash` is given (`useLocalFlash`), else the stack's
 * flash (~3 s).
 */
export function LookFlash(p: { class?: string; flash?: Flash | null }): VNode {
  const stack = useFlash();
  const f = p.flash !== undefined ? p.flash : stack;
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

/** The px the soft keyboard covers at the bottom of the layout viewport (visualViewport). 42-0 stub: 0. */
export function useKeyboardInset(): number {
  return 0;
}
