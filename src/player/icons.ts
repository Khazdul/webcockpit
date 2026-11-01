// The player chrome's icons (stage 32c, ADR 0114): stroke paths in a
// 24-unit box, drawn in the ghost look of the in-game popups (thin grey
// strokes, lit on hover; src/menubar/icons.ts). The paths are the approved
// A2 mockup's (notes/research/player-mockups/gen.mjs). The kind icons mark
// the four spotlight kinds on the rail, in the Spotlights card and in its
// filter, each in its own colour.

import { ICON as BAR_ICON, strokeIcon } from '../menubar/icons';
import type { MarkLetter } from './strip';

export const PLAYER_ICON = {
  start: 'M6 5v14 M19 5.5L9.5 12l9.5 6.5z',
  back: 'M5.6 9.4A7.2 7.2 0 1 1 5 13.4 M5 4.6v4.8h4.8',
  fwd: 'M18.4 9.4A7.2 7.2 0 1 0 19 13.4 M19 4.6v4.8h-4.8',
  play: 'M8 5.2l11 6.8-11 6.8z',
  pause: 'M8.5 5.5v13 M15.5 5.5v13',
  panes: BAR_ICON.panes,
  display: BAR_ICON.settings,
  close: 'M6 6l12 12M18 6L6 18',
  prev: 'M14.5 6l-6 6 6 6',
  next: 'M9.5 6l6 6-6 6',
  chev: 'M9.5 6.5l5.5 5.5-5.5 5.5',
  fullscreen: BAR_ICON.fullscreen,
  fullscreenExit: BAR_ICON.fullscreenExit,
} as const;

export type PlayerIconName = keyof typeof PLAYER_ICON;

/** A spotlight kind as the chrome draws it (the marker letters' kinds). */
export type KindIcon = 'death' | 'pkill' | 'achievement' | 'level';

/** Kind icons: a skull, crossed swords, a star, double chevrons. */
export const KIND_PATH: Readonly<Record<KindIcon, string>> = {
  death:
    'M12 3.5c-4 0-7 2.9-7 6.8 0 2.3 1.1 4.1 2.8 5.1V19a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1v-3.6c1.7-1 2.8-2.8 2.8-5.1 0-3.9-3-6.8-7-6.8z M8.4 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M13 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M10.7 20v-2.2 M13.3 20v-2.2',
  pkill: 'M4 4l9.5 9.5 M11.5 15.5l4-4 M14 14l4.5 4.5 M20 4l-9.5 9.5 M8.5 11.5l4 4 M10 14l-4.5 4.5',
  achievement: 'M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z',
  level: 'M6.5 12.5l5.5-5.5 5.5 5.5 M6.5 18l5.5-5.5 5.5 5.5',
};

/** Kind colours: Death red, PvP kill orange, Achievement gold, Level-up green. */
export const KIND_COLOR: Readonly<Record<KindIcon, string>> = {
  death: '#e06c6c',
  pkill: '#e0915a',
  achievement: '#e3b341',
  level: '#7fbf7f',
};

/** The kind of a marker letter (K/D/A/L). */
export const LETTER_KIND: Readonly<Record<MarkLetter, KindIcon>> = {
  A: 'achievement',
  D: 'death',
  K: 'pkill',
  L: 'level',
};

/** A control icon `<svg class=cls>`. */
export function playerIcon(doc: Document, name: PlayerIconName, cls = 'wc-pc-ic'): SVGSVGElement {
  return strokeIcon(doc, PLAYER_ICON[name], cls).svg;
}

/** A kind icon, stroked in its colour. */
export function kindIcon(doc: Document, kind: KindIcon, cls = 'wc-pc-ki'): SVGSVGElement {
  const svg = strokeIcon(doc, KIND_PATH[kind], cls).svg;
  svg.style.stroke = KIND_COLOR[kind];
  svg.dataset.kind = kind;
  return svg;
}

/** Back or forward 10 s: the turning arrow with `10` inside. */
export function tenIcon(doc: Document, dir: 'back' | 'fwd', cls = 'wc-pc-ic wc-pc-ic10'): SVGSVGElement {
  const svg = strokeIcon(doc, PLAYER_ICON[dir], cls).svg;
  const t = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
  t.setAttribute('x', '12');
  t.setAttribute('y', '15.6');
  t.setAttribute('text-anchor', 'middle');
  t.textContent = '10';
  svg.append(t);
  return svg;
}
