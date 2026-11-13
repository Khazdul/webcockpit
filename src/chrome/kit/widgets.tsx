// TUI kit: what is left of the cell-grid widgets (Inv §3.3, §10.6) since
// the old ESC menu and its Options pages went (stage 55).
//
// - The menu cursor (`MenuItem`, `useMenuCursor`, `menuKey`): the start
//   page's menu (frames/start-main.tsx) draws its own rows and keeps its
//   cursor with these.
// - `indent`, `Line`, `Blank` and `Page` (title block `─── Name ───`, a
//   body, a footer of C_HINT tokens joined with ` · ` on the last row):
//   every page of the client is a look frame now (kit/look.tsx); the kit
//   gallery's Windows section (dev only) still shows one old-look frame on
//   its cell grid with them.
//
// Every widget is built from one-cell-high lines (`.wc-line`) and is
// positioned in whole cells: an indent of n cells is `n × --cell-w`.
// Colours come only from the `--c-*` tokens (kit.css).

import type { ComponentChildren, JSX, VNode } from 'preact';
import { useState } from 'preact/hooks';
import { type NavKey, cellLen, centreLeft, footerText, step, truncate } from './nav';
import { useGrid } from './hooks';
import { EscToken, escHints, isEscToken } from './esc';

// ------------------------------------------------------------------- lines

/** Inline style for an indent of `n` cells. */
export const indent = (n: number): JSX.CSSProperties => ({ paddingLeft: `calc(var(--cell-w) * ${n})` });

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

export function Blank(p: { n?: number }): VNode {
  return <>{Array.from({ length: p.n ?? 1 }, (_, i) => <div key={i} class="wc-line" />)}</>;
}

// ---------------------------------------------------------------- page

export type FooterToken = string | { text: string; onClick: () => void };

export interface PageProps {
  title?: string;
  footer: readonly FooterToken[];
  children?: ComponentChildren;
}

const tokenText = (t: FooterToken): string => (typeof t === 'string' ? t : t.text);

/** A full frame: title block, scrollable body, footer on the last row. */
export function Page(p: PageProps): VNode {
  const { cols, surface } = useGrid();
  const gap = surface === 'start' ? 2 : 1;
  const title = p.title ? `─── ${p.title} ───` : '';
  return (
    <div class="wc-page">
      {p.title && (
        <>
          <Blank n={gap} />
          <div class="wc-line wc-title-row">
            <span style={indent(centreLeft(cols, cellLen(title)))} class="wc-c-section">
              {title}
            </span>
          </div>
          <Blank />
        </>
      )}
      <div class="wc-body">{p.children}</div>
      <Footer tokens={p.footer} />
    </div>
  );
}

/**
 * The footer row: centred C_HINT tokens joined by ` · `. Tokens may be
 * clickable; an `ESC …` string token always is (it sends Escape, kit/esc.tsx).
 */
function Footer(p: { tokens: readonly FooterToken[] }): VNode {
  const { cols } = useGrid();
  const texts = p.tokens.map(tokenText);
  const full = truncate(footerText(texts), cols);
  const fits = full === footerText(texts);
  return (
    <div class="wc-line wc-footer wc-c-hint" style={indent(centreLeft(cols, cellLen(full)))}>
      {fits ? <FooterTokens tokens={p.tokens} /> : escHints(full)}
    </div>
  );
}

function FooterTokens(p: { tokens: readonly FooterToken[] }): VNode {
  return (
    <>
      {p.tokens.map((t, i) => (
        <>
          {i > 0 && ' · '}
          {typeof t === 'string' ? (
            isEscToken(t) ? (
              <EscToken text={t} />
            ) : (
              t
            )
          ) : (
            <span class="wc-footer-btn" onClick={t.onClick}>
              {t.text}
            </span>
          )}
        </>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- menus

export interface MenuItem {
  key: string;
  /** Shown text. */
  label?: string;
  /** Enter / Space / click. */
  activate?: () => void;
}

/** Index of the item with `key`, else the first. */
export function menuIndex(items: readonly MenuItem[], key?: string): number {
  const i = key === undefined ? -1 : items.findIndex((it) => it.key === key);
  return Math.max(0, i);
}

/** Menu cursor state, kept by key so rows can come and go without the cursor jumping. */
export function useMenuCursor(items: readonly MenuItem[], initial?: string): [number, (i: number) => void] {
  const [key, setKey] = useState<string | undefined>(initial);
  const idx = menuIndex(items, key);
  return [idx, (i: number) => setKey(items[i]?.key)];
}

/** Menu keys: ↑↓ wrap over the rows, Home / End, Enter/Space activate; ←→ are taken and do nothing. */
export function menuKey(items: readonly MenuItem[], cursor: number, setCursor: (i: number) => void, nk: NavKey | null): boolean {
  switch (nk) {
    case 'up':
    case 'backtab':
      setCursor(step(items.length, cursor, -1, { wrap: true }));
      return true;
    case 'down':
    case 'tab':
      setCursor(step(items.length, cursor, 1, { wrap: true }));
      return true;
    case 'home':
      setCursor(step(items.length, -1, 1));
      return true;
    case 'end':
      setCursor(step(items.length, items.length, -1));
      return true;
    case 'left':
    case 'right':
      return true;
    case 'activate':
      items[cursor]?.activate?.();
      return true;
  }
  return false;
}
