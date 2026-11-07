// The lantern kit's line icons (stage 41, ADR 0125; split out of look.tsx
// in stage 42-0, ADR 0127). Package 42b owns this file and draws the new
// names; until then a name without a drawing renders an empty icon.
//
// All icons are line drawings with `stroke: currentColor` (look-glass.css
// `.wc-lk-ic`). A page's own icon (the Spotlight kinds, src/player/icons.ts)
// is passed as an `IconDraw`.

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
  // Stage 42 (42b draws them).
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
  | 'drop';

/** A page's own line icon: its drawing (paths, stroke: currentColor) and its viewBox side (default 16). */
export type IconDraw = { draw: ComponentChildren; box?: number };

export const ICONS: Partial<Record<IconName, ComponentChildren>> = {
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
};

/** The size of each icon's drawing (its viewBox side): the start menu's are 18 (door 22), the rest 16. */
const ICON_BOX: Partial<Record<IconName, number>> = {
  door: 22,
  person: 18,
  scroll: 18,
  hourglass: 18,
  star: 18,
  quill: 18,
  info: 18,
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
