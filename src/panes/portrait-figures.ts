// The Character card's placeholder portraits (stage 77 part E, decision
// 22, ADR 0166 addendum 10): the nine crude figures of round 9's mockup
// (notes/research/character-pane-mockups/round9.html, its `r-…` symbols)
// as data, with their own fills and a transparent background, and the
// neutral figure in the pane's colours (character.css `.wc-cc-fig-*`).
// All share the round frame's 60 × 75 box and placement (`.wc-cc-fig`),
// so one swaps for another without a shift. Built with createElementNS,
// once per change of the portrait (character-dom.ts `setPortrait`).

import type { RaceKind } from '../gmcp/race';
import { SVG_NS } from './icons';

/** A portrait: a race's (`raceKind`), or the neutral figure. */
export type PortraitId = RaceKind | 'neutral';

type Shape = readonly [tag: 'path' | 'rect' | 'ellipse' | 'circle', attrs: Readonly<Record<string, string>>];

/** The neutral figure: head and shoulders, filled by the pane's colours. */
const NEUTRAL: readonly Shape[] = [
  ['path', { class: 'wc-cc-fig-cloak', d: 'M3 80C5 61 16 55 23 53L30 59L37 53C44 55 55 61 57 80Z' }],
  ['path', { class: 'wc-cc-fig-hood', d: 'M14 55C16 48 16 42 16 36C16 24 22 17 30 14C38 17 44 24 44 36C44 42 44 48 46 55L37 53L30 59L23 53Z' }],
  ['path', { class: 'wc-cc-fig-face', d: 'M30 26C36 26 39.5 31 39.5 38C39.5 45 35.5 51 30 51S20.5 45 20.5 38C20.5 31 24 26 30 26Z' }],
];

/** The mockup's nine (`r-bn` is the Black Númenórean), its fills kept. */
const RACES: Readonly<Record<RaceKind, readonly Shape[]>> = {
  human: [
    ['path', { d: 'M4 78C6 61 17 55 30 55S54 61 56 78Z', fill: '#3c4a5e' }],
    ['rect', { x: '26', y: '45', width: '8', height: '12', fill: '#b58c68' }],
    ['ellipse', { cx: '30', cy: '36', rx: '11', ry: '13', fill: '#c9a27c' }],
    ['path', { d: 'M19 35C17 20 43 20 41 35C39 28 35 26 30 26S21 28 19 35Z', fill: '#5a3b22' }],
    ['circle', { cx: '26', cy: '37', r: '1.3', fill: '#2a1d12' }],
    ['circle', { cx: '34', cy: '37', r: '1.3', fill: '#2a1d12' }],
    ['path', { d: 'M27 44h6', stroke: '#8a5e44', 'stroke-width': '1.2' }],
  ],
  elf: [
    ['path', { d: 'M17 30h26v30H17Z', fill: '#d9c27a' }],
    ['path', { d: 'M5 78C7 61 18 56 30 56S53 61 55 78Z', fill: '#3e5a44' }],
    ['rect', { x: '26.5', y: '45', width: '7', height: '12', fill: '#cdb08e' }],
    ['path', { d: 'M20 36L12 27L21 41Z M40 36L48 27L39 41Z', fill: '#e2c6a6' }],
    ['ellipse', { cx: '30', cy: '36', rx: '10', ry: '13.5', fill: '#e2c6a6' }],
    ['path', { d: 'M20 34C19 20 41 20 40 34C37 27 34 25 30 25S23 27 20 34Z', fill: '#e3cd86' }],
    ['path', { d: 'M20.5 30C26 28 34 28 39.5 30', stroke: '#d8dde4', 'stroke-width': '1.2', fill: 'none' }],
    ['circle', { cx: '26', cy: '37', r: '1.2', fill: '#2b4a6a' }],
    ['circle', { cx: '34', cy: '37', r: '1.2', fill: '#2b4a6a' }],
  ],
  halfelf: [
    ['path', { d: 'M18 30h24v22H18Z', fill: '#6b3524' }],
    ['path', { d: 'M4 78C6 61 17 55 30 55S54 61 56 78Z', fill: '#5a4630' }],
    ['rect', { x: '26', y: '45', width: '8', height: '12', fill: '#c29e7a' }],
    ['path', { d: 'M20 37L15 31L21 41Z M40 37L45 31L39 41Z', fill: '#d6b48e' }],
    ['ellipse', { cx: '30', cy: '36', rx: '10.5', ry: '13', fill: '#d6b48e' }],
    ['path', { d: 'M19.5 35C18 20 42 20 40.5 35C38 27 34 25.5 30 25.5S22 27 19.5 35Z', fill: '#7a3d27' }],
    ['circle', { cx: '26', cy: '37', r: '1.2', fill: '#2a3b2a' }],
    ['circle', { cx: '34', cy: '37', r: '1.2', fill: '#2a3b2a' }],
  ],
  dwarf: [
    ['path', { d: 'M2 78C4 59 16 54 30 54S56 59 58 78Z', fill: '#6a3b2a' }],
    ['ellipse', { cx: '30', cy: '40', rx: '12.5', ry: '12', fill: '#c08f6a' }],
    ['path', { d: 'M17 42C17 63 26 71 30 73C34 71 43 63 43 42C39 50 21 50 17 42Z', fill: '#8b5a2b' }],
    ['path', { d: 'M24 46C27 44 33 44 36 46', stroke: '#6e4420', 'stroke-width': '2', fill: 'none' }],
    ['path', { d: 'M16 37C16 21 44 21 44 37Z', fill: '#8a9098' }],
    ['path', { d: 'M16 37h28', stroke: '#5c6168', 'stroke-width': '2' }],
    ['rect', { x: '28.8', y: '33', width: '2.4', height: '10', fill: '#6e737a' }],
    ['circle', { cx: '25', cy: '40', r: '1.3', fill: '#1e140c' }],
    ['circle', { cx: '35', cy: '40', r: '1.3', fill: '#1e140c' }],
  ],
  hobbit: [
    ['path', { d: 'M10 78C12 64 20 59 30 59S48 64 50 78Z', fill: '#4f6a35' }],
    ['path', { d: 'M24 60l6 8 6-8', fill: '#c9b48a' }],
    ['path', { d: 'M19 41L16 36L20 44Z M41 41L44 36L40 44Z', fill: '#e0b48c' }],
    ['circle', { cx: '30', cy: '42', r: '12', fill: '#e0b48c' }],
    ['circle', { fill: '#5a3a1e', cx: '21', cy: '34', r: '4' }],
    ['circle', { fill: '#5a3a1e', cx: '26', cy: '30', r: '4.2' }],
    ['circle', { fill: '#5a3a1e', cx: '32', cy: '29.5', r: '4.2' }],
    ['circle', { fill: '#5a3a1e', cx: '38', cy: '32', r: '4' }],
    ['circle', { fill: '#5a3a1e', cx: '40', cy: '37', r: '3' }],
    ['circle', { fill: '#5a3a1e', cx: '19.5', cy: '38', r: '3' }],
    ['circle', { cx: '24', cy: '46', r: '2.4', fill: '#e89a86', opacity: '.6' }],
    ['circle', { cx: '36', cy: '46', r: '2.4', fill: '#e89a86', opacity: '.6' }],
    ['circle', { cx: '26', cy: '42', r: '1.3', fill: '#2a1d12' }],
    ['circle', { cx: '34', cy: '42', r: '1.3', fill: '#2a1d12' }],
    ['path', { d: 'M27 49q3 2 6 0', stroke: '#8a5e44', 'stroke-width': '1.2', fill: 'none' }],
  ],
  beorning: [
    ['path', { d: 'M1 78C3 57 14 50 30 50S57 57 59 78Z', fill: '#5b3d24' }],
    ['ellipse', { cx: '30', cy: '39', rx: '12.5', ry: '13.5', fill: '#b98b62' }],
    ['path', { d: 'M19 44C20 55 26 57 30 57S40 55 41 44C37 49 23 49 19 44Z', fill: '#3b2516' }],
    ['path', { d: 'M13 42C11 22 21 14 30 14S49 22 47 42C45 30 39 25 30 25S15 30 13 42Z', fill: '#6e4a2c' }],
    ['circle', { cx: '17', cy: '18', r: '5', fill: '#6e4a2c' }],
    ['circle', { cx: '43', cy: '18', r: '5', fill: '#6e4a2c' }],
    ['circle', { cx: '17', cy: '18', r: '2.2', fill: '#3b2516' }],
    ['circle', { cx: '43', cy: '18', r: '2.2', fill: '#3b2516' }],
    ['circle', { cx: '25.5', cy: '39', r: '1.3', fill: '#1e140c' }],
    ['circle', { cx: '34.5', cy: '39', r: '1.3', fill: '#1e140c' }],
  ],
  orc: [
    ['path', { d: 'M2 78C4 60 16 54 30 54S56 60 58 78Z', fill: '#2a2622' }],
    ['path', { d: 'M8 66l8-6 6 8M52 66l-8-6-6 8', stroke: '#55504a', 'stroke-width': '2', fill: 'none' }],
    ['path', { d: 'M18 38L11 33L19 43Z M42 38L49 33L41 43Z', fill: '#7c8656' }],
    ['ellipse', { cx: '30', cy: '39', rx: '12', ry: '12.5', fill: '#7c8656' }],
    ['path', { d: 'M19 35C22 32 27 33 29 35M31 35C33 33 38 32 41 35', stroke: '#3a3f26', 'stroke-width': '2.6', fill: 'none', 'stroke-linecap': 'round' }],
    ['circle', { cx: '25', cy: '38', r: '1.6', fill: '#ffcf4a' }],
    ['circle', { cx: '35', cy: '38', r: '1.6', fill: '#ffcf4a' }],
    ['path', { d: 'M24 48l1.5-4 1.5 4Z M33 48l1.5-4 1.5 4Z', fill: '#efe4c8' }],
    ['path', { d: 'M24 48h12', stroke: '#3a3f26', 'stroke-width': '1.4' }],
    ['path', { d: 'M26 27C26 22 34 22 34 27C32 25 28 25 26 27Z', fill: '#141210' }],
    ['path', { d: 'M30 23V16', stroke: '#141210', 'stroke-width': '3', 'stroke-linecap': 'round' }],
  ],
  troll: [
    ['path', { d: 'M-4 78C-2 54 12 48 30 48S62 54 64 78Z', fill: '#5b5f5a' }],
    ['ellipse', { cx: '30', cy: '37', rx: '17', ry: '15.5', fill: '#7f8a86' }],
    ['path', { d: 'M15 33C20 29 26 30 28 32M32 32C34 30 40 29 45 33', stroke: '#4d5551', 'stroke-width': '3.4', fill: 'none', 'stroke-linecap': 'round' }],
    ['circle', { cx: '23', cy: '35', r: '1.2', fill: '#ff9a3a' }],
    ['circle', { cx: '37', cy: '35', r: '1.2', fill: '#ff9a3a' }],
    ['ellipse', { cx: '30', cy: '41', rx: '5', ry: '4', fill: '#6c7672' }],
    ['path', { d: 'M20 48q10 5 20 0', stroke: '#3e4542', 'stroke-width': '2', fill: 'none' }],
    ['path', { d: 'M23 48l1.5-3.5 1.5 3.5Z M34 48l1.5-3.5 1.5 3.5Z', fill: '#d8d2bf' }],
  ],
  numenorean: [
    ['path', { d: 'M2 78C4 56 14 46 30 46S56 56 58 78Z', fill: '#141416' }],
    ['path', { d: 'M12 52C10 26 19 12 30 12S50 26 48 52C44 46 40 44 30 44S16 46 12 52Z', fill: '#1c1c20' }],
    ['ellipse', { cx: '30', cy: '37', rx: '9.5', ry: '12', fill: '#cfc2b2' }],
    ['path', { d: 'M20.5 33C23 24 37 24 39.5 33C36 29 24 29 20.5 33Z', fill: '#141416' }],
    ['path', { d: 'M21 31.5C26 29.5 34 29.5 39 31.5', stroke: '#b9bec6', 'stroke-width': '1.3', fill: 'none' }],
    ['circle', { cx: '30', cy: '30.2', r: '1.4', fill: '#c22a2a' }],
    ['path', { d: 'M24.5 37.5h3M32.5 37.5h3', stroke: '#2a2124', 'stroke-width': '1.5', 'stroke-linecap': 'round' }],
    ['path', { d: 'M27.5 44.5h5', stroke: '#7d6a62', 'stroke-width': '1' }],
  ],
};

/** The figure for `id` (a new element; the caller places it once). */
export function figureSvg(doc: Document, id: PortraitId): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'wc-cc-fig');
  svg.setAttribute('viewBox', '0 0 60 75');
  svg.setAttribute('preserveAspectRatio', 'xMidYMin meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.portrait = id;
  for (const [tag, attrs] of id === 'neutral' ? NEUTRAL : RACES[id]) {
    const e = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
  }
  return svg;
}
