// The lantern kit's line icons (stage 41, ADR 0125; split out of look.tsx
// in stage 42-0, drawn in 42b, ADR 0127). Package 42b owns this file.
//
// All icons are line drawings with `stroke: currentColor` (look-glass.css
// `.wc-lk-ic`), re-derived in the round 7 mockups' style: round caps and
// joins, one stroke weight, a 16 × 16 box (the start menu's are 18, the door
// 22; the two skip buttons 24, for their "10"). A page's own icon (the
// Spotlight kinds, src/player/icons.ts) is passed as an `IconDraw`.

import type { ComponentChildren, VNode } from 'preact';

/** Every icon of the kit (stage 42 API). */
export type IconName =
  // Stage 41.
  | 'door'
  | 'person'
  | 'scroll'
  | 'hourglass'
  | 'star'
  | 'quill'
  | 'info'
  | 'back'
  | 'check'
  | 'plus'
  | 'pencil'
  | 'rename'
  | 'import'
  | 'export'
  | 'trash'
  // Stage 42 (42b).
  | 'book'
  | 'save'
  | 'find'
  | 'duplicate'
  | 'reset'
  | 'lock'
  | 'fold'
  | 'up'
  | 'down'
  | 'prev'
  | 'next'
  | 'close'
  | 'play'
  | 'pause'
  | 'start'
  | 'back10'
  | 'fwd10'
  | 'display'
  | 'fullscreen'
  | 'filter'
  | 'stats'
  | 'backup'
  | 'restore'
  | 'help'
  | 'action'
  | 'alias'
  | 'highlight'
  | 'macro'
  | 'substitute'
  | 'exclude'
  | 'include'
  | 'comment'
  | 'title'
  | 'html'
  | 'text'
  | 'folder'
  | 'drop'
  // Stage 60 (the start menu's Account row), 18 × 18.
  | 'key';

/** A page's own line icon: its drawing (paths, stroke: currentColor) and its viewBox side (default 16). */
export type IconDraw = { draw: ComponentChildren; box?: number };

export const ICONS: Record<IconName, ComponentChildren> = {
  // Start menu (round 6 mockup), 18 × 18 unless noted.
  door: (
    <>
      <path d="M4.5 20V10.5a6.5 6.5 0 0 1 13 0V20" />
      <path d="M2.5 20h17" />
      <path d="M8 20v-8.5a3 3 0 0 1 6 0V20" />
      <path d="M12.4 16.4h.1" />
    </>
  ),
  person: (
    <>
      <circle cx="9" cy="5.6" r="3" />
      <path d="M3 16c0-3.6 2.7-5.6 6-5.6s6 2 6 5.6" />
    </>
  ),
  scroll: (
    <>
      <path d="M5.5 2.5h8a2 2 0 0 1 2 2v1.5h-2" />
      <path d="M13.5 4.5v9a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-1.5h8v1.5a2 2 0 0 0 2 2" />
      <path d="M5.5 2.5a2 2 0 0 0-2 2v7.5" />
      <path d="M6.5 6.5h4.5M6.5 9h4.5" />
    </>
  ),
  hourglass: <path d="M4.5 2h9M4.5 16h9M5.5 2c0 4 7 5 7 7s-7 3-7 7M12.5 2c0 4-7 5-7 7s7 3 7 7" />,
  star: <path d="M9 1.5l1.7 5.8 5.8 1.7-5.8 1.7L9 16.5l-1.7-5.8L1.5 9l5.8-1.7z" />,
  quill: (
    <>
      <path d="M15.5 2.5C9 3 5.2 8 4 14.5L2.6 16.2" />
      <path d="M15.5 2.5c-.8 5.2-4.8 9.2-10.6 10.4" />
      <path d="M8.5 9.5l-2-1.2" />
    </>
  ),
  info: (
    <>
      <circle cx="9" cy="9" r="7" />
      <path d="M9 8.2v4.8M9 5.4v.1" />
    </>
  ),
  // Buttons, 16 × 16.
  back: <path d="M9.8 3.2 5 8l4.8 4.8" />,
  check: <path d="M3 8.5 6.4 12 13 4.5" />,
  plus: <path d="M8 3v10M3 8h10" />,
  pencil: <path d="M10.5 2.5l3 3-8 8H2.5v-3z" />,
  rename: (
    <>
      <path d="M2.5 12.5 5.5 4l3 8.5M3.6 9.6h3.8" />
      <path d="M11 3.5v9M9.5 3.5h3M9.5 12.5h3" />
    </>
  ),
  import: <path d="M8 2v8M4.8 7 8 10.2 11.2 7M2.5 13.5h11" />,
  export: <path d="M8 10.2V2.2M4.8 5.4 8 2.2l3.2 3.2M2.5 13.5h11" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9" />,
  // Stage 42 (42b), 16 × 16 unless noted.
  book: <path d="M8 4.2C6.6 3 4.6 2.6 2.5 2.8v9.6c2.1-.2 4.1.2 5.5 1.4 1.4-1.2 3.4-1.6 5.5-1.4V2.8C11.4 2.6 9.4 3 8 4.2zM8 4.2v9.6" />,
  save: <path d="M3 2.5h8l2 2v9H3zM5.5 2.5v3h5v-3M5.5 13.5v-4h5v4" />,
  find: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="M10.2 10.2l3.3 3.3" />
    </>
  ),
  duplicate: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
      <path d="M10.5 5.5V3.6c0-.6-.5-1.1-1.1-1.1H3.6c-.6 0-1.1.5-1.1 1.1v5.8c0 .6.5 1.1 1.1 1.1h1.9" />
    </>
  ),
  reset: <path d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M4.4 2.2v2.7h2.7" />,
  lock: (
    <>
      <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" />
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path d="M8 9.6v1.4" />
    </>
  ),
  fold: <path d="M4.8 6.4 8 9.6l3.2-3.2" />,
  up: <path d="M4 10l4-4 4 4" />,
  down: <path d="M4 6l4 4 4-4" />,
  prev: <path d="M10 3.5 5.5 8l4.5 4.5" />,
  next: <path d="M6 3.5 10.5 8 6 12.5" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  play: <path d="M5 3.2 12.6 8 5 12.8z" />,
  pause: <path d="M5.5 3.5v9M10.5 3.5v9" />,
  start: <path d="M4 3.5v9M12.5 3.8 6.6 8l5.9 4.2z" />,
  back10: (
    <>
      <path stroke-width="1.9" d="M5.4 9.2a7 7 0 1 1-.5 4M4.8 4.6v4.8h4.8" />
      <text x="12.2" y="14.7" text-anchor="middle">
        10
      </text>
    </>
  ),
  fwd10: (
    <>
      <path stroke-width="1.9" d="M18.6 9.2a7 7 0 1 0 .5 4M19.2 4.6v4.8h-4.8" />
      <text x="11.8" y="14.7" text-anchor="middle">
        10
      </text>
    </>
  ),
  display: <path d="M2.5 4.5h6.5M12 4.5h1.5M10.5 3v3M2.5 8h2M7.5 8h6M6 6.5v3M2.5 11.5h7.5M12.8 11.5h.7M11.4 10v3" />,
  fullscreen: <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  filter: <path d="M2.5 3.5h11L9.3 8.4v3.9l-2.6 1.3V8.4z" />,
  stats: <path d="M2.5 13.5h11M4.5 11V7.5M8 11V4M11.5 11V6" />,
  backup: <path d="M2.5 3.5h11v2.6h-11zM3.6 6.1v6.9h8.8V6.1M6.4 8.6h3.2" />,
  restore: <path d="M2.8 8a5.2 5.2 0 1 0 1.5-3.7M2.8 2.6v3h3M8 5.4V8l1.9 1.3" />,
  help: (
    <>
      <circle cx="8" cy="8" r="5.8" />
      <path d="M6.2 6.4a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.3v.3M8 11.4v.1" />
    </>
  ),
  action: <path d="M9.2 1.8 3.8 9h4.1l-1.1 5.2L12.2 7H8.1z" />,
  alias: <path d="M2.5 5h7M2.5 8h11M2.5 11h5.5M11 3l2 2-2 2" />,
  highlight: <path d="M10.2 2.4l3.4 3.4-6.2 6.2H4V8.6zM2.5 14h11" />,
  macro: (
    <>
      <rect x="1.8" y="4" width="12.4" height="8" rx="1.4" />
      <path d="M4.5 6.8h.1M7 6.8h.1M9.5 6.8h.1M12 6.8h-.6M5 9.4h6" />
    </>
  ),
  substitute: <path d="M2.5 5.2h9.5M9.8 3l2.2 2.2-2.2 2.2M13.5 10.8H4M6.2 8.6 4 10.8 6.2 13" />,
  exclude: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M4.2 11.8l7.6-7.6" />
    </>
  ),
  include: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M5.3 8.3l1.9 1.9 3.6-3.8" />
    </>
  ),
  comment: <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />,
  title: <path d="M3 3.5h10M8 3.5v9.5M6 13h4" />,
  html: (
    <>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M6.6 6.1 10 8l-3.4 1.9z" />
    </>
  ),
  text: <path d="M4 2.5h5.5L12 5v8.5H4zM9.5 2.5V5H12M6 8h4M6 10.5h4" />,
  folder: <path d="M2 4h4.2l1.5 1.5H14v7H2z" />,
  drop: <path d="M8 2v7M5.2 6.4 8 9.2l2.8-2.8M2.5 9.5v4h11v-4" />,
  // Stage 60, 18 × 18: a key, its bow at the lower left.
  key: (
    <>
      <circle cx="5.8" cy="12.2" r="3.3" />
      <path d="M8.2 9.8 15.6 2.4M12.4 5.6l2.2 2.2M14.4 3.6l1.6 1.6" />
    </>
  ),
};

/** The size of each icon's drawing (its viewBox side): the start menu's are 18 (door 22), the skip buttons 24, the rest 16. */
const ICON_BOX: Partial<Record<IconName, number>> = {
  door: 22,
  person: 18,
  scroll: 18,
  hourglass: 18,
  star: 18,
  quill: 18,
  info: 18,
  key: 18,
  back10: 24,
  fwd10: 24,
};

/** A small line icon (stroke: currentColor): a kit icon by name, or a page's own drawing. */
export function Icon(p: ({ name: IconName } | IconDraw) & { class?: string | undefined }): VNode {
  const named = 'name' in p;
  const n = named ? (ICON_BOX[p.name] ?? 16) : (p.box ?? 16);
  return (
    <svg class={'wc-lk-ic' + (p.class ? ' ' + p.class : '')} viewBox={`0 0 ${n} ${n}`} aria-hidden="true">
      {named ? ICONS[p.name] : p.draw}
    </svg>
  );
}
