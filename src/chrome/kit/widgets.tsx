// TUI kit: the cell-grid widgets (Inv §3.3, §10.6).
//
// Every widget is built from one-cell-high lines (`.wc-line`) and is
// positioned in whole cells: an indent of n cells is `n × --cell-w`.
// Colours come only from the `--c-*` tokens (kit.css).
//
// Grammar:
// - Page: title block `─── Name ───` (C_SECTION; 2 blank rows above on the
//   start page, 1 in the ESC menu, 1 below), a body, and a footer (C_HINT,
//   tokens joined with ` · `) on the last row.
// - Menu rows: `<< label >>` with gold arrows and a bold white label on the
//   cursor row, lighter label on hover, C_ITEM otherwise, C_HINT when
//   dimmed. The label never moves. Plain rows are ragged-centred; rows
//   with a `[X]`/`( )` glyph stack left-aligned in one centred block; Back
//   is centred on its own.
// - Filled buttons: fill = selected (gold when the zone has focus, grey
//   when not), brighter text = pointer, dim = disabled.
// - Check cells `[X]███`: gold brackets on the cursor cell only.
// - Hover: CSS :hover on row elements only, so leaving a row always clears
//   it (hover-clear invariant). Mouse click = select + activate.

import type { ComponentChildren, JSX, VNode } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { type NavKey, cellLen, centreLeft, footerText, scrollbar, step, truncate } from './nav';
import { useGrid } from './hooks';
import { useFlash } from './stack';
import { TuiScrollbar, useScrollBox } from './scroll';

// ------------------------------------------------------------------- lines

/** Inline style for an indent of `n` cells. */
export const indent = (n: number): JSX.CSSProperties => ({ paddingLeft: `calc(var(--cell-w) * ${n})` });

/** Inline style for a width of `n` cells. */
export const cellsWide = (n: number): JSX.CSSProperties => ({ width: `calc(var(--cell-w) * ${n})` });

export interface LineProps {
  /** Left offset in cells. */
  at?: number;
  class?: string;
  children?: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
}

/** One row of the grid. */
export function Line(p: LineProps): VNode {
  return (
    <div class={'wc-line' + (p.class ? ' ' + p.class : '')} style={p.at ? indent(p.at) : undefined} onClick={p.onClick}>
      {p.children}
    </div>
  );
}

/** One row with `text` centred on the grid (width = its length). */
export function Centered(p: { text: string; class?: string; width?: number; children?: ComponentChildren }): VNode {
  const { cols } = useGrid();
  const w = p.width ?? cellLen(p.text);
  return (
    <Line at={centreLeft(cols, w)}>
      <span class={p.class}>{p.children ?? p.text}</span>
    </Line>
  );
}

export function Blank(p: { n?: number }): VNode {
  return <>{Array.from({ length: p.n ?? 1 }, (_, i) => <div key={i} class="wc-line" />)}</>;
}

/**
 * Scrolls the nearest `.wc-body` so that `el` is inside it (whole rows).
 * Used by every cursor so long pages keep the cursor on screen.
 */
export function ensureVisible(el: Element | null): void {
  const body = el?.closest('.wc-body') as HTMLElement | null;
  if (!el || !body) return;
  const b = body.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const top = r.top - b.top + body.scrollTop;
  if (top < body.scrollTop) body.scrollTop = top;
  else if (top + r.height > body.scrollTop + body.clientHeight) body.scrollTop = top + r.height - body.clientHeight;
}

// ---------------------------------------------------------------- page

export type FooterToken = string | { text: string; onClick: () => void };

export interface PageProps {
  title?: string;
  /** The title's colour class (default C_SECTION; modals use `wc-c-header`). */
  titleClass?: string;
  /** After the title on the same row (About: the version, Inv §3.11). */
  titleRight?: string;
  /** Rows above the title block (ESC menu: the status header). */
  header?: ComponentChildren;
  footer: readonly FooterToken[];
  children?: ComponentChildren;
}

/** Rows left for the body of a titled Page on this grid. */
export function useBodyRows(): number {
  const { rows, surface } = useGrid();
  return Math.max(1, rows - (surface === 'start' ? 2 : 1) - 2 - 1);
}

/** A full frame: title block, scrollable body, footer on the last row. */
export function Page(p: PageProps): VNode {
  const { cols, surface } = useGrid();
  const gap = surface === 'start' ? 2 : 1;
  const title = p.title ? `─── ${p.title} ───` : '';
  return (
    <div class="wc-page">
      {p.header}
      {p.title && (
        <>
          <Blank n={p.header ? Math.max(0, gap - 1) : gap} />
          <div class="wc-line wc-title-row">
            <span style={indent(centreLeft(cols, cellLen(title)))} class={p.titleClass ?? 'wc-c-section'}>
              {title}
            </span>
            {p.titleRight && <span class="wc-c-body">{' ' + p.titleRight}</span>}
          </div>
          <Blank />
        </>
      )}
      <div class="wc-body">{p.children}</div>
      <Footer tokens={p.footer} />
    </div>
  );
}

/** The footer row: centred C_HINT tokens joined by ` · `. Tokens may be clickable. */
export function Footer(p: { tokens: readonly FooterToken[] }): VNode {
  const { cols } = useGrid();
  const texts = p.tokens.map((t) => (typeof t === 'string' ? t : t.text));
  const full = truncate(footerText(texts), cols);
  const fits = full === footerText(texts);
  return (
    <div class="wc-line wc-footer wc-c-hint" style={indent(centreLeft(cols, cellLen(full)))}>
      {fits
        ? p.tokens.map((t, i) => (
            <>
              {i > 0 && ' · '}
              {typeof t === 'string' ? (
                t
              ) : (
                <span class="wc-footer-btn" onClick={t.onClick}>
                  {t.text}
                </span>
              )}
            </>
          ))
        : full}
    </div>
  );
}

/** The flash row: the stack's transient message, centred (blank when none). */
export function FlashRow(): VNode {
  const f = useFlash();
  const { cols } = useGrid();
  if (!f) return <div class="wc-line wc-flash" />;
  const text = truncate(f.text, cols);
  return (
    <div
      class={'wc-line wc-flash ' + (f.kind === 'ok' ? 'wc-c-accent' : 'wc-c-hint')}
      style={indent(centreLeft(cols, cellLen(text)))}
      role="status"
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------- menus

export interface MenuItem {
  key: string;
  /** Shown text (a cycler includes its value: `Cursor style: beam`). */
  label?: string;
  /** `[X]`, `[ ]`, `(•)`, `( )`: the row joins the left-aligned glyph block. */
  glyph?: string;
  /** Shown in C_HINT but selectable (e.g. "coming in a later stage"). */
  dim?: boolean;
  /** Skipped by the cursor. */
  disabled?: boolean;
  /** A blank row (not selectable). */
  spacer?: boolean;
  /** Enter / Space / click. */
  activate?: () => void;
  /** ← / → (cyclers, steppers). Enter/Space call `adjust(+1)` unless `stepper`. */
  adjust?: (delta: number) => void;
  /** A bare numeric stepper: Enter/Space inert (Inv §3.3). */
  stepper?: boolean;
}

const selectable = (it: MenuItem | undefined): boolean => !!it && !it.spacer && !it.disabled;

/** Index of the first selectable item with `key`, else the first selectable. */
export function menuIndex(items: readonly MenuItem[], key?: string): number {
  const i = key === undefined ? -1 : items.findIndex((it) => it.key === key && selectable(it));
  return i >= 0 ? i : Math.max(0, items.findIndex(selectable));
}

/**
 * Menu cursor state, kept by key so rows can come and go (e.g. Continue
 * appears when connected) without the cursor jumping.
 */
export function useMenuCursor(items: readonly MenuItem[], initial?: string): [number, (i: number) => void] {
  const [key, setKey] = useState<string | undefined>(initial);
  const idx = menuIndex(items, key);
  return [idx, (i: number) => setKey(items[i]?.key)];
}

/** Menu keys: ↑↓ wrap over selectable rows, ←→ adjust, Enter/Space forward. */
export function menuKey(items: readonly MenuItem[], cursor: number, setCursor: (i: number) => void, nk: NavKey | null): boolean {
  const it = items[cursor];
  const enabled = (i: number): boolean => selectable(items[i]);
  switch (nk) {
    case 'up':
    case 'backtab':
      setCursor(step(items.length, cursor, -1, { wrap: true, enabled }));
      return true;
    case 'down':
    case 'tab':
      setCursor(step(items.length, cursor, 1, { wrap: true, enabled }));
      return true;
    case 'home':
      setCursor(step(items.length, -1, 1, { enabled }));
      return true;
    case 'end':
      setCursor(step(items.length, items.length, -1, { enabled }));
      return true;
    case 'left':
    case 'right':
      if (it?.adjust) it.adjust(nk === 'left' ? -1 : 1);
      return true;
    case 'activate':
      if (!it || it.stepper) return true;
      if (it.activate) it.activate();
      else it.adjust?.(1);
      return true;
  }
  return false;
}

export interface MenuRowsProps {
  items: readonly MenuItem[];
  cursor: number;
  setCursor: (i: number) => void;
  /** Hovering a row moves the cursor there (grids, Inv §4.4). Default: hover lightens only. */
  hoverMoves?: boolean;
}

/** The rows of a vertical menu, laid out per the menu-row grammar. */
export function MenuRows(p: MenuRowsProps): VNode {
  const { cols } = useGrid();
  const width = (it: MenuItem): number => cellLen(rowText(it)) + 6;
  const glyphW = Math.max(0, ...p.items.filter((it) => it.glyph && !it.spacer).map(width));
  const glyphAt = centreLeft(cols, glyphW);
  return (
    <>
      {p.items.map((it, i) =>
        it.spacer ? (
          <div key={it.key} class="wc-line" />
        ) : (
          <MenuRow
            key={it.key}
            item={it}
            at={it.glyph ? glyphAt : centreLeft(cols, width(it))}
            selected={i === p.cursor}
            onSelect={() => p.setCursor(i)}
            hoverMoves={p.hoverMoves ?? false}
          />
        ),
      )}
    </>
  );
}

const rowText = (it: MenuItem): string => (it.glyph ? `${it.glyph} ${it.label ?? ''}` : (it.label ?? ''));

function MenuRow(p: { item: MenuItem; at: number; selected: boolean; onSelect: () => void; hoverMoves: boolean }): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const it = p.item;
  useLayoutEffect(() => {
    if (p.selected) ensureVisible(ref.current);
  }, [p.selected]);
  const click = (e: MouseEvent, part: 'pre' | 'label' | 'post'): void => {
    e.stopPropagation();
    if (it.disabled) return;
    const wasSelected = p.selected;
    p.onSelect();
    // On a cycler/stepper the arrows adjust: << = back, >> = forward.
    if (it.adjust && wasSelected && part !== 'label') return it.adjust(part === 'pre' ? -1 : 1);
    if (it.stepper) return;
    if (it.activate) it.activate();
    else it.adjust?.(1);
  };
  const cls =
    'wc-mrow' + (p.selected ? ' is-sel' : '') + (it.dim ? ' is-dim' : '') + (it.disabled ? ' is-disabled' : '');
  return (
    <div class="wc-line" style={indent(p.at)} ref={ref}>
      <span
        class={cls}
        data-key={it.key}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={p.hoverMoves && !it.disabled ? p.onSelect : undefined}
      >
        <span class="wc-arrow" onClick={(e) => click(e, 'pre')}>
          {p.selected ? '<< ' : '   '}
        </span>
        <span class="wc-label" onClick={(e) => click(e, 'label')}>
          {rowText(it)}
        </span>
        <span class="wc-arrow" onClick={(e) => click(e, 'post')}>
          {p.selected ? ' >>' : '   '}
        </span>
      </span>
    </div>
  );
}

// -------------------------------------------------------------- buttons

export interface ButtonProps {
  label: string;
  /** Width in cells; the label is centred in it. */
  width: number;
  selected: boolean;
  /** The button's zone has focus (gold fill) or not (grey fill). */
  focused: boolean;
  disabled?: boolean;
  /** Selectable but dimmed ("coming in a later stage"). */
  dim?: boolean;
  onClick: () => void;
}

/** A filled button (ADR 0134 grammar in Inv §10.6). */
export function Button(p: ButtonProps): VNode {
  const pad = Math.max(0, p.width - cellLen(p.label));
  const left = Math.floor(pad / 2);
  const text = ' '.repeat(left) + p.label + ' '.repeat(pad - left);
  const state = p.disabled ? 'is-disabled' : p.selected ? (p.focused ? 'is-sel-focus' : 'is-sel') : '';
  return (
    <span
      class={'wc-btn ' + state + (p.dim && !p.disabled ? ' is-dim' : '')}
      data-btn={p.label}
      aria-disabled={p.disabled ? 'true' : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (!p.disabled) p.onClick();
      }}
    >
      {text}
    </span>
  );
}

// ----------------------------------------------------------------- stars

/** Cells a star row takes (`★ ★ ★ ☆ ☆`). */
export const STARS_W = 9;

/**
 * A 0–5 star picker row (Inv §4.6, §7.4): the first `value` stars gold,
 * the rest grey. Clicking star N sets N.
 */
export function Stars(p: { value: number; at: number; onSet: (n: number) => void }): VNode {
  return (
    <div class="wc-line wc-stars" style={indent(p.at)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <>
          {n > 1 && ' '}
          <span
            class={'wc-star-btn ' + (n <= p.value ? 'wc-st-star' : 'wc-c-hint')}
            data-star={n}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              p.onSet(n);
            }}
          >
            {n <= p.value ? '★' : '☆'}
          </span>
        </>
      ))}
    </div>
  );
}

/** A rating key: `0`–`5` → that value, ← / → → ±1 (clamped), else null. */
export function ratingKey(e: { key: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }, cur: number): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (/^[0-5]$/.test(e.key)) return Number(e.key);
  if (e.key === 'ArrowLeft') return Math.max(0, cur - 1);
  if (e.key === 'ArrowRight') return Math.min(5, cur + 1);
  return null;
}

// ---------------------------------------------------------- check cells

export interface CheckCellProps {
  checked: boolean;
  cursor: boolean;
  /** Swatch colour (a CSS value); omitted = no swatch. `''` = a blank swatch (None). */
  swatch?: string;
  /** Row off: everything in C_PANE_OFF. */
  off?: boolean;
  onClick: () => void;
  onHover?: () => void;
  title?: string;
}

/** `[X]███`: checkbox plus optional colour swatch (Inv §10.6). */
export function CheckCell(p: CheckCellProps): VNode {
  const cls = 'wc-check' + (p.cursor ? ' is-cursor' : '') + (p.checked ? ' is-on' : '') + (p.off ? ' is-off' : '');
  return (
    <span
      class={cls}
      title={p.title}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={p.onHover}
      onClick={(e) => {
        e.stopPropagation();
        p.onClick();
      }}
    >
      <span class="wc-check-box">{p.checked ? '[X]' : '[ ]'}</span>
      {p.swatch !== undefined && (
        <span class="wc-swatch" style={p.swatch && !p.off ? { color: p.swatch } : undefined}>
          {p.swatch ? '███' : '   '}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- table

export interface Column<T> {
  key: string;
  title: string;
  width: number;
  align?: 'left' | 'center';
  sortable?: boolean;
  cell: (row: T) => { text: string; class?: string };
}

export interface TableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  cursor: number;
  /** Rows shown (the header is extra). */
  visible: number;
  focused: boolean;
  sort: { key: string; dir: 1 | -1 };
  onSort: (key: string) => void;
  onRowClick: (i: number) => void;
}

const fit = (s: string, w: number, align: 'left' | 'center' = 'left'): string => {
  const t = truncate(s, w);
  const pad = w - cellLen(t);
  if (align === 'center') {
    const l = Math.floor(pad / 2);
    return ' '.repeat(l) + t + ' '.repeat(pad - l);
  }
  return t + ' '.repeat(pad);
};

/**
 * A sortable table with a cursor row and a scrollbar (Inv §3.4). One space
 * between columns. The rows scroll natively (pixels, as EDITOR) under the
 * header; the TUI scrollbar follows them, and the cursor is kept in view
 * when it moves.
 */
export function Table<T>(p: TableProps<T>): VNode {
  const box = useScrollBox();
  useLayoutEffect(() => box.show(p.cursor), [p.cursor, p.visible, p.rows.length]);
  const width = p.columns.reduce((n, c) => n + c.width, 0) + Math.max(0, p.columns.length - 1);
  const overflow = p.rows.length > p.visible;
  const height = `calc(var(--cell-h) * ${p.visible})`;
  return (
    <div class="wc-table">
      <div class="wc-line wc-c-hint">
        {p.columns.map((c, i) => {
          const arrow = c.sortable && p.sort.key === c.key ? (p.sort.dir > 0 ? ' ▲' : ' ▼') : '';
          const text = fit(c.title + arrow, c.width, c.align);
          return (
            <>
              {i > 0 && ' '}
              <span
                class={c.sortable ? 'wc-th is-sortable' : 'wc-th'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={c.sortable ? () => p.onSort(c.key) : undefined}
              >
                {text}
              </span>
            </>
          );
        })}
      </div>
      <div class="wc-scrollrow" style={{ height }}>
        <div class="wc-scrollbox wc-table-rows" ref={box.ref} style={{ ...cellsWide(width), height }}>
          {Array.from({ length: Math.max(p.visible, p.rows.length) }, (_, i) => {
            const row = p.rows[i];
            const isCur = row !== undefined && i === p.cursor;
            const band = isCur ? (p.focused ? ' is-cur-focus' : ' is-cur') : '';
            return (
              <div class="wc-line" key={i}>
                <span
                  class={'wc-tr' + band + (row === undefined ? ' is-empty' : '')}
                  data-row={row === undefined ? undefined : i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={row === undefined ? undefined : () => p.onRowClick(i)}
                >
                  {p.columns.map((c, ci) => {
                    if (row === undefined) return (ci > 0 ? ' ' : '') + ' '.repeat(c.width);
                    const v = c.cell(row);
                    return (
                      <>
                        {ci > 0 && ' '}
                        <span class={isCur ? undefined : v.class}>{fit(v.text, c.width, c.align)}</span>
                      </>
                    );
                  })}
                </span>
              </div>
            );
          })}
        </div>
        {overflow && <TuiScrollbar target={box.ref} rows={p.visible} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ text field

export interface TextFieldProps {
  value: string;
  onInput: (v: string) => void;
  /** Width in cells, prompt included. */
  width: number;
  at: number;
  maxLength?: number;
  label: string;
}

/** A one-line text input `> text_` on the grid; focused when mounted. */
export function TextField(p: TextFieldProps): VNode {
  const ref = useRef<HTMLInputElement>(null);
  // A layout effect: typing right after the frame opens lands in the field.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <div class="wc-line" style={indent(p.at)}>
      <span class="wc-c-accent">{'> '}</span>
      <input
        ref={ref}
        class="wc-field"
        style={cellsWide(Math.max(1, p.width - 2))}
        value={p.value}
        maxLength={p.maxLength}
        aria-label={p.label}
        spellcheck={false}
        autocomplete="off"
        onInput={(e) => p.onInput((e.currentTarget as HTMLInputElement).value)}
      />
    </div>
  );
}
