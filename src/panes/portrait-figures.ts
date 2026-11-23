// The Character card's stand-in while a portrait loads (stage 77 part E,
// ADR 0166 addenda 10–12): the neutral head-and-shoulders silhouette of
// round 9's mockup in the pane's colours (character.css `.wc-cc-fig-*`),
// shown until the first drawn portrait (src/panes/portraits/) is baked. The
// crude per-race placeholders it once held gave way to the drawings in the
// portrait pass. It keeps the round frame's 60 × 75 box and placement
// (`.wc-cc-fig`). Built with createElementNS, once per card.

import { SVG_NS } from './icons';

type Shape = readonly [tag: 'path' | 'rect' | 'ellipse' | 'circle', attrs: Readonly<Record<string, string>>];

/** The neutral figure: head and shoulders, filled by the pane's colours. */
const NEUTRAL: readonly Shape[] = [
  ['path', { class: 'wc-cc-fig-cloak', d: 'M3 80C5 61 16 55 23 53L30 59L37 53C44 55 55 61 57 80Z' }],
  ['path', { class: 'wc-cc-fig-hood', d: 'M14 55C16 48 16 42 16 36C16 24 22 17 30 14C38 17 44 24 44 36C44 42 44 48 46 55L37 53L30 59L23 53Z' }],
  ['path', { class: 'wc-cc-fig-face', d: 'M30 26C36 26 39.5 31 39.5 38C39.5 45 35.5 51 30 51S20.5 45 20.5 38C20.5 31 24 26 30 26Z' }],
];

/** The neutral silhouette (a new element; the caller places it once). */
export function figureSvg(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'wc-cc-fig');
  svg.setAttribute('viewBox', '0 0 60 75');
  svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attrs] of NEUTRAL) {
    const e = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
  }
  return svg;
}
