// The Character card's placeholder portraits (stage 77 part E, decision
// 22, ADR 0166 addenda 10 and 11): the nine crude figures of round 9's
// mockup (notes/research/character-pane-mockups/round9.html, its `r-…`
// symbols), now the races' fallbacks, and one per subrace in the same
// style (the Tarkhnarb shares the orc's), all as data with their own fills
// and a transparent background, and the neutral figure in the pane's
// colours (character.css `.wc-cc-fig-*`). The subraces differ mainly by
// colour and silhouette (hair, beard, hood, one feature each), so they
// read apart at the Medium size.
// All share the round frame's 60 × 75 box and placement (`.wc-cc-fig`),
// so one swaps for another without a shift. Built with createElementNS,
// once per change of the portrait (character-dom.ts `setPortrait`).

import type { RaceKind, SubraceKind } from '../gmcp/race';
import { SVG_NS } from './icons';

/** A portrait: a subrace's (`subraceKind`), a race's (`raceKind`), or the neutral figure. */
export type PortraitId = SubraceKind | RaceKind | 'neutral';

type Shape = readonly [tag: 'path' | 'rect' | 'ellipse' | 'circle', attrs: Readonly<Record<string, string>>];

/** The neutral figure: head and shoulders, filled by the pane's colours. */
const NEUTRAL: readonly Shape[] = [
  ['path', { class: 'wc-cc-fig-cloak', d: 'M3 80C5 61 16 55 23 53L30 59L37 53C44 55 55 61 57 80Z' }],
  ['path', { class: 'wc-cc-fig-hood', d: 'M14 55C16 48 16 42 16 36C16 24 22 17 30 14C38 17 44 24 44 36C44 42 44 48 46 55L37 53L30 59L23 53Z' }],
  ['path', { class: 'wc-cc-fig-face', d: 'M30 26C36 26 39.5 31 39.5 38C39.5 45 35.5 51 30 51S20.5 45 20.5 38C20.5 31 24 26 30 26Z' }],
];

/** The mockup's orc: the generic orc's and the Tarkhnarb's. */
const ORC: readonly Shape[] = [
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
];

/** The mockup's nine (`r-bn` is the Black Númenórean), its fills kept, and the subraces. */
const FIGURES: Readonly<Record<Exclude<PortraitId, 'neutral'>, readonly Shape[]>> = {
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
  orc: ORC,
  tarkhnarb: ORC,
  // Not in the mockup (the owner, after part E): a Zaugurz is rougher than
  // a Tarkhnarb: darker hide, a torn ear, a scar, longer tusks, a spiked
  // pauldron, blood on the cheeks, and a collar of pale snow fur (the far
  // north).
  zaugurz: [
    ['path', { d: 'M2 78C4 60 16 54 30 54S56 60 58 78Z', fill: '#241d19' }],
    ['path', { d: 'M8 62l6-9 3 8M52 62l-6-9-3 8', fill: '#5d5650' }],
    ['path', { d: 'M8 66l8-6 6 8M52 66l-8-6-6 8', stroke: '#4a3f37', 'stroke-width': '2.4', fill: 'none' }],
    ['path', { d: 'M13 61L16 54L19 58L22 51L26 57L30 50L34 57L38 51L41 58L44 54L47 61C41 64.5 36 65.5 30 65.5S19 64.5 13 61Z', fill: '#dfe3e6' }],
    ['path', { d: 'M18 38L10 32L13 36L11 37L19 43Z M42 38L50 33L41 43Z', fill: '#5f6a40' }],
    ['ellipse', { cx: '30', cy: '39', rx: '12.5', ry: '12.5', fill: '#5f6a40' }],
    ['path', { d: 'M19 34C22 31 27 33 29 35.5M31 35.5C33 33 38 31 41 34', stroke: '#2b2f1b', 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round' }],
    ['circle', { cx: '25', cy: '38', r: '1.6', fill: '#ff8a2a' }],
    ['circle', { cx: '35', cy: '38', r: '1.6', fill: '#ff8a2a' }],
    ['path', { d: 'M33 31L38 45', stroke: '#3c2a22', 'stroke-width': '1.2', 'stroke-linecap': 'round' }],
    ['path', { d: 'M19.5 41C20.5 40 22.5 40.5 23 42C22.5 44.5 21 46 20 45.5C19 44.5 19 42.5 19.5 41Z M37.5 42C38.5 40.5 40.5 40.5 41 41.5C41.5 43.5 40.5 45 39 45.5C38 45 37 43.5 37.5 42Z', fill: '#9e1b16', opacity: '0.85' }],
    ['path', { d: 'M21 46l-0.4 2.5M39.5 46l0.3 2', stroke: '#9e1b16', 'stroke-width': '0.9', 'stroke-linecap': 'round', opacity: '0.8' }],
    ['path', { d: 'M24 48.5l1.6-5.5 1.6 5.5Z M32.8 48.5l1.6-5.5 1.6 5.5Z', fill: '#e2d6b4' }],
    ['path', { d: 'M24 48.5h12', stroke: '#2b2f1b', 'stroke-width': '1.6' }],
    ['path', { d: 'M24 28C25 21 35 21 36 28C33 25 27 25 24 28Z', fill: '#141210' }],
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

  // The subraces (ADR 0166 addendum 11). Men:
  // a Dúnadan ranger: dark green hood and cloak, dark hair, grey eyes, stern, a silver star.
  dunadan: [
    ['path', { d: 'M2 78C4 56 14 46 30 46S56 56 58 78Z', fill: '#24361f' }],
    ['path', { d: 'M12 52C10 26 19 12 30 12S50 26 48 52C44 46 40 44 30 44S16 46 12 52Z', fill: '#355230' }],
    ['ellipse', { cx: '30', cy: '37', rx: '9.5', ry: '12', fill: '#c7a385' }],
    ['path', { d: 'M20.5 34C22 24.5 38 24.5 39.5 34C36 30 33 29 30 31C27 29 24 30 20.5 34Z', fill: '#231a14' }],
    ['path', { d: 'M23.5 35.2l4 1.2M36.5 35.2l-4 1.2', stroke: '#231a14', 'stroke-width': '1.3', 'stroke-linecap': 'round' }],
    ['circle', { cx: '26', cy: '38.5', r: '1.25', fill: '#8a9aa8' }],
    ['circle', { cx: '34', cy: '38.5', r: '1.25', fill: '#8a9aa8' }],
    ['path', { d: 'M27.5 45h5', stroke: '#7d5e4c', 'stroke-width': '1.1' }],
    ['path', { d: 'M30 51l1.3 3 3.2.3-2.4 2.1.7 3.1L30 57.9l-2.8 1.6.7-3.1-2.4-2.1 3.2-.3Z', fill: '#e2e6ec' }],
  ],
  // an Eriadorian villager: brown hair, a short beard, ruddy, a homespun brown tunic.
  eriadorian: [
    ['path', { d: 'M4 78C6 61 17 55 30 55S54 61 56 78Z', fill: '#7a5634' }],
    ['path', { d: 'M25 56l5 7 5-7', stroke: '#4f3620', 'stroke-width': '1.4', fill: 'none' }],
    ['rect', { x: '26', y: '45', width: '8', height: '12', fill: '#bb8a62' }],
    ['ellipse', { cx: '30', cy: '36', rx: '11', ry: '13', fill: '#d39c76' }],
    ['circle', { cx: '23.5', cy: '40', r: '2.6', fill: '#d8644c', opacity: '.55' }],
    ['circle', { cx: '36.5', cy: '40', r: '2.6', fill: '#d8644c', opacity: '.55' }],
    ['path', { d: 'M19 36C16 19 44 19 41 36C40 29 37 27 34 27.5L31 25.5L28 27.5C24 27 20 29 19 36Z', fill: '#6b4426' }],
    ['path', { d: 'M19.3 40C20 50 25 53.5 30 53.5S40 50 40.7 40C38.5 45.5 34 46.5 30 46S21.5 45.5 19.3 40Z', fill: '#7a4e2c' }],
    ['circle', { cx: '26', cy: '36.5', r: '1.3', fill: '#2a1d12' }],
    ['circle', { cx: '34', cy: '36.5', r: '1.3', fill: '#2a1d12' }],
    ['path', { d: 'M27 46.2h6', stroke: '#4a2e18', 'stroke-width': '1.3' }],
  ],
  // one of the Rohirrim: long blond hair in braids, blue eyes, a fair beard, a green cloak with gold.
  rohirrim: [
    ['path', { d: 'M17 31C17 22 43 22 43 31L45 62C41 64 38 60 38 56H22C22 60 19 64 15 62Z', fill: '#e0bf62' }],
    ['path', { d: 'M3 78C5 60 16 55 30 55S55 60 57 78Z', fill: '#2f5a2c' }],
    ['path', { d: 'M9 65C15 58.5 23 56.5 30 56.5S45 58.5 51 65', stroke: '#d9aa2a', 'stroke-width': '3', fill: 'none' }],
    ['rect', { x: '26.5', y: '45', width: '7', height: '12', fill: '#c9a07e' }],
    ['ellipse', { cx: '30', cy: '36', rx: '10.5', ry: '13', fill: '#d9b08c' }],
    ['path', { d: 'M19.5 35C18 20 42 20 40.5 35C38 27 34 25.5 30 25.5S22 27 19.5 35Z', fill: '#ecc965' }],
    ['path', { d: 'M18.8 38L16.8 63M41.2 38L43.2 63', stroke: '#c9a441', 'stroke-width': '3.4', 'stroke-linecap': 'round' }],
    ['circle', { cx: '26', cy: '37', r: '1.3', fill: '#2f68b4' }],
    ['circle', { cx: '34', cy: '37', r: '1.3', fill: '#2f68b4' }],
    ['path', { d: 'M23.5 44C26 42.5 34 42.5 36.5 44C35.5 49.5 24.5 49.5 23.5 44Z', fill: '#d4b04e' }],
  ],
  // Elves: a Noldo: long dark hair, grey eyes, a silver circlet with a gem, deep blue.
  noldo: [
    ['path', { d: 'M17 31C17 24 43 24 43 31V62H17Z', fill: '#1d1a22' }],
    ['path', { d: 'M5 78C7 61 18 56 30 56S53 61 55 78Z', fill: '#233a72' }],
    ['path', { d: 'M22.5 57l7.5 7 7.5-7', stroke: '#c9ced6', 'stroke-width': '1.4', fill: 'none' }],
    ['rect', { x: '26.5', y: '45', width: '7', height: '12', fill: '#dcc3aa' }],
    ['path', { d: 'M20 36L12 27L21 41Z M40 36L48 27L39 41Z', fill: '#e6cfb8' }],
    ['ellipse', { cx: '30', cy: '36', rx: '10', ry: '13.5', fill: '#e6cfb8' }],
    ['path', { d: 'M20 34C19 20 41 20 40 34C37 27 34 25 30 25S23 27 20 34Z', fill: '#1d1a22' }],
    ['path', { d: 'M20.5 30C26 28 34 28 39.5 30', stroke: '#e6eaf0', 'stroke-width': '1.4', fill: 'none' }],
    ['circle', { cx: '30', cy: '28.6', r: '1.7', fill: '#8adcff' }],
    ['circle', { cx: '26', cy: '37', r: '1.2', fill: '#6c7886' }],
    ['circle', { cx: '34', cy: '37', r: '1.2', fill: '#6c7886' }],
  ],
  // a Sinda, a Grey Elf: long silver-grey hair, pale, a grey cloak with a leaf clasp.
  sinda: [
    ['path', { d: 'M17 31C17 24 43 24 43 31V64H17Z', fill: '#c4c9d1' }],
    ['path', { d: 'M5 78C7 61 18 56 30 56S53 61 55 78Z', fill: '#666b74' }],
    ['path', { d: 'M30 58C33 59.5 33 63 30 64.5C27 63 27 59.5 30 58Z', fill: '#7fae6a' }],
    ['rect', { x: '26.5', y: '45', width: '7', height: '12', fill: '#e2d0c0' }],
    ['path', { d: 'M20 36L12 27L21 41Z M40 36L48 27L39 41Z', fill: '#efe0d2' }],
    ['ellipse', { cx: '30', cy: '36', rx: '10', ry: '13.5', fill: '#efe0d2' }],
    ['path', { d: 'M20 34C19 20 41 20 40 34C37 27 34 25 30 25S23 27 20 34Z', fill: '#d6dae1' }],
    ['circle', { cx: '26', cy: '37', r: '1.2', fill: '#5a6a7a' }],
    ['circle', { cx: '34', cy: '37', r: '1.2', fill: '#5a6a7a' }],
  ],
  // a Silvan wood-elf: auburn hair, a green hood, a bow over the shoulder.
  silvan: [
    ['path', { d: 'M15 52C13 30 20 17 30 17S47 30 45 52C42 47 38 45 30 45S18 47 15 52Z', fill: '#3f6b34' }],
    ['path', { d: 'M5 78C7 61 18 56 30 56S53 61 55 78Z', fill: '#5f4a2a' }],
    ['path', { d: 'M7 71C11 60 20 55 30 55S49 60 53 71C45 65 38 63.5 30 63.5S15 65 7 71Z', fill: '#3f6b34' }],
    ['path', { d: 'M44 50C53 55 57 65 56 78', stroke: '#8a5428', 'stroke-width': '2.4', fill: 'none' }],
    ['path', { d: 'M44 50L16 78', stroke: '#eadfb2', 'stroke-width': '1.1' }],
    ['rect', { x: '26.5', y: '45', width: '7', height: '11', fill: '#cfa982' }],
    ['path', { d: 'M20 37L13 29L21 41Z M40 37L47 29L39 41Z', fill: '#d8b590' }],
    ['ellipse', { cx: '30', cy: '37', rx: '10', ry: '13', fill: '#d8b590' }],
    ['path', { d: 'M20 35C19.5 23.5 40.5 23.5 40 35C37 29 34 27.5 30 28.5S23 29 20 35Z', fill: '#9c4a1f' }],
    ['circle', { cx: '26', cy: '38', r: '1.2', fill: '#3c5a2a' }],
    ['circle', { cx: '34', cy: '38', r: '1.2', fill: '#3c5a2a' }],
  ],
  // Hobbits: a Fallohide: taller and slimmer, fair curls, pale, a red waistcoat.
  fallohide: [
    ['path', { d: 'M11 78C13 64 21 59 30 59S47 64 49 78Z', fill: '#9a3a26' }],
    ['path', { d: 'M24 60l6 8 6-8', fill: '#ece3cc' }],
    ['path', { d: 'M19.5 40L16.5 34.5L20.5 43Z M40.5 40L43.5 34.5L39.5 43Z', fill: '#f0d4b8' }],
    ['ellipse', { cx: '30', cy: '41', rx: '10.8', ry: '12.5', fill: '#f0d4b8' }],
    ['circle', { fill: '#e6c870', cx: '21.5', cy: '33', r: '3.8' }],
    ['circle', { fill: '#e6c870', cx: '26', cy: '29', r: '4' }],
    ['circle', { fill: '#e6c870', cx: '32', cy: '28.5', r: '4' }],
    ['circle', { fill: '#e6c870', cx: '37.5', cy: '31', r: '3.8' }],
    ['circle', { fill: '#e6c870', cx: '39.6', cy: '36', r: '2.8' }],
    ['circle', { fill: '#e6c870', cx: '20.2', cy: '37', r: '2.8' }],
    ['circle', { cx: '24.5', cy: '45.5', r: '2.2', fill: '#ec9a8a', opacity: '.55' }],
    ['circle', { cx: '35.5', cy: '45.5', r: '2.2', fill: '#ec9a8a', opacity: '.55' }],
    ['circle', { cx: '26', cy: '41', r: '1.25', fill: '#2f4f74' }],
    ['circle', { cx: '34', cy: '41', r: '1.25', fill: '#2f4f74' }],
    ['path', { d: 'M27 48.5q3 2 6 0', stroke: '#9a6a52', 'stroke-width': '1.2', fill: 'none' }],
  ],
  // a Harfoot: the smallest, browner skin, dark curls, no beard, a mustard coat.
  harfoot: [
    ['path', { d: 'M13 78C15 66 22 62 30 62S45 66 47 78Z', fill: '#8a7428' }],
    ['path', { d: 'M25 63l5 6 5-6', fill: '#c9b48a' }],
    ['path', { d: 'M20 43.5L17 38.5L21 46.5Z M40 43.5L43 38.5L39 46.5Z', fill: '#b27a4e' }],
    ['circle', { cx: '30', cy: '44.5', r: '11', fill: '#b27a4e' }],
    ['circle', { fill: '#24160c', cx: '22', cy: '37.5', r: '3.8' }],
    ['circle', { fill: '#24160c', cx: '26.5', cy: '33.8', r: '4' }],
    ['circle', { fill: '#24160c', cx: '32', cy: '33.4', r: '4' }],
    ['circle', { fill: '#24160c', cx: '37.5', cy: '35.6', r: '3.8' }],
    ['circle', { fill: '#24160c', cx: '39.6', cy: '40.4', r: '2.8' }],
    ['circle', { fill: '#24160c', cx: '20.4', cy: '41.4', r: '2.8' }],
    ['circle', { cx: '24.5', cy: '48.5', r: '2.2', fill: '#d0705a', opacity: '.5' }],
    ['circle', { cx: '35.5', cy: '48.5', r: '2.2', fill: '#d0705a', opacity: '.5' }],
    ['circle', { cx: '26', cy: '44.5', r: '1.25', fill: '#1e140c' }],
    ['circle', { cx: '34', cy: '44.5', r: '1.25', fill: '#1e140c' }],
    ['path', { d: 'M27.5 51q2.5 1.6 5 0', stroke: '#6e4430', 'stroke-width': '1.2', fill: 'none' }],
  ],
  // a Stoor: the heftiest, a round face, sideburns and a beard, a blue-grey coat.
  stoor: [
    ['path', { d: 'M5 78C7 62 18 57 30 57S53 62 55 78Z', fill: '#465c6c' }],
    ['path', { d: 'M24 58l6 8 6-8', fill: '#c9b48a' }],
    ['path', { d: 'M17 41L13.5 35.5L18 44Z M43 41L46.5 35.5L42 44Z', fill: '#d9a982' }],
    ['circle', { cx: '30', cy: '42', r: '13.8', fill: '#d9a982' }],
    ['circle', { fill: '#6b4526', cx: '19.5', cy: '33.5', r: '4.2' }],
    ['circle', { fill: '#6b4526', cx: '25', cy: '29', r: '4.5' }],
    ['circle', { fill: '#6b4526', cx: '31.5', cy: '28', r: '4.5' }],
    ['circle', { fill: '#6b4526', cx: '37.5', cy: '30.5', r: '4.3' }],
    ['circle', { fill: '#6b4526', cx: '41', cy: '35.5', r: '3.2' }],
    ['path', { d: 'M16.5 37C15.5 50 22 56 30 56S44.5 50 43.5 37C42.5 43 40.5 46 38.5 45.5C36.5 50.5 23.5 50.5 21.5 45.5C19.5 46 17.5 43 16.5 37Z', fill: '#6b4526' }],
    ['circle', { cx: '26', cy: '41', r: '1.3', fill: '#1e140c' }],
    ['circle', { cx: '34', cy: '41', r: '1.3', fill: '#1e140c' }],
    ['path', { d: 'M27 48q3 1.8 6 0', stroke: '#4a2e18', 'stroke-width': '1.2', fill: 'none' }],
  ],
  // Dwarves: a Longbeard of Durin's folk: a very long grey-white beard, a blue hood.
  longbeard: [
    ['path', { d: 'M2 78C4 59 16 54 30 54S56 59 58 78Z', fill: '#2d4470' }],
    ['path', { d: 'M13 50C11 28 19 17 30 17S49 28 47 50C43 44 38 42 30 42S17 44 13 50Z', fill: '#3a5a94' }],
    ['ellipse', { cx: '30', cy: '40', rx: '12', ry: '12', fill: '#c69a76' }],
    ['path', { d: 'M16.5 37C16 25 44 25 43.5 37C39 31.5 21 31.5 16.5 37Z', fill: '#3a5a94' }],
    ['path', { d: 'M17 42C16 62 24 76 30 80C36 76 44 62 43 42C39 50 21 50 17 42Z', fill: '#dcdcd6' }],
    ['path', { d: 'M26 54v14M30 54v18M34 54v14', stroke: '#a9a9a2', 'stroke-width': '1' }],
    ['path', { d: 'M23 46.5C26 44 34 44 37 46.5C34 48.5 26 48.5 23 46.5Z', fill: '#bdbdb6' }],
    ['path', { d: 'M21.5 37.3h6M32.5 37.3h6', stroke: '#e8e8e2', 'stroke-width': '2.2', 'stroke-linecap': 'round' }],
    ['circle', { cx: '25', cy: '40.5', r: '1.3', fill: '#1e140c' }],
    ['circle', { cx: '35', cy: '40.5', r: '1.3', fill: '#1e140c' }],
  ],
  // a Firebeard: a red-orange braided beard with gold beads, a horned copper helmet.
  firebeard: [
    ['path', { d: 'M2 78C4 59 16 54 30 54S56 59 58 78Z', fill: '#4a3a30' }],
    ['ellipse', { cx: '30', cy: '40', rx: '12.5', ry: '12', fill: '#c99070' }],
    ['path', { d: 'M17 42C17 63 26 71 30 73C34 71 43 63 43 42C39 50 21 50 17 42Z', fill: '#d5581e' }],
    ['path', { d: 'M24.5 64l-1.5 10M35.5 64l1.5 10', stroke: '#d5581e', 'stroke-width': '3.2', 'stroke-linecap': 'round' }],
    ['circle', { cx: '23', cy: '73', r: '1.7', fill: '#f0c64a' }],
    ['circle', { cx: '37', cy: '73', r: '1.7', fill: '#f0c64a' }],
    ['path', { d: 'M24 46C27 44 33 44 36 46', stroke: '#a83e14', 'stroke-width': '2', fill: 'none' }],
    ['path', { d: 'M18 30C11 28 8 22 9 16C12.5 21 15 24 20 25Z M42 30C49 28 52 22 51 16C47.5 21 45 24 40 25Z', fill: '#e8dec4' }],
    ['path', { d: 'M16 37C16 21 44 21 44 37Z', fill: '#b8703a' }],
    ['path', { d: 'M16 37h28', stroke: '#7e4a1e', 'stroke-width': '2' }],
    ['circle', { cx: '25', cy: '40', r: '1.3', fill: '#1e140c' }],
    ['circle', { cx: '35', cy: '40', r: '1.3', fill: '#1e140c' }],
  ],
  // a Broadbeam: very broad, a black beard and side hair, a bald pate, heavy armoured shoulders.
  broadbeam: [
    ['path', { d: 'M-6 78C-4 58 12 53 30 53S64 58 66 78Z', fill: '#363b42' }],
    ['ellipse', { cx: '9', cy: '62', rx: '12.5', ry: '8.5', fill: '#7a8088' }],
    ['ellipse', { cx: '51', cy: '62', rx: '12.5', ry: '8.5', fill: '#7a8088' }],
    ['path', { d: 'M-1 65C5 57 13 56 20 59M61 65C55 57 47 56 40 59', stroke: '#565c64', 'stroke-width': '1.8', fill: 'none' }],
    ['circle', { cx: '5', cy: '59.5', r: '1.1', fill: '#c8ccd2' }],
    ['circle', { cx: '13', cy: '57.5', r: '1.1', fill: '#c8ccd2' }],
    ['circle', { cx: '47', cy: '57.5', r: '1.1', fill: '#c8ccd2' }],
    ['circle', { cx: '55', cy: '59.5', r: '1.1', fill: '#c8ccd2' }],
    ['ellipse', { cx: '30', cy: '40', rx: '13.5', ry: '12', fill: '#b8865e' }],
    ['path', { d: 'M16.6 42C15.5 33 17.5 29 21 27.5L21.5 37Z M43.4 42C44.5 33 42.5 29 39 27.5L38.5 37Z', fill: '#1a1614' }],
    ['path', { d: 'M24 30.5q6-3 12 0', stroke: '#d2a27a', 'stroke-width': '1.2', fill: 'none', 'stroke-linecap': 'round' }],
    ['path', { d: 'M16 42C15 62 24 70 30 72C36 70 45 62 44 42C40 50 20 50 16 42Z', fill: '#1c1816' }],
    ['path', { d: 'M21 36.5l6 1.2M39 36.5l-6 1.2', stroke: '#1a1614', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
    ['circle', { cx: '25', cy: '40.5', r: '1.3', fill: '#1e140c' }],
    ['circle', { cx: '35', cy: '40.5', r: '1.3', fill: '#1e140c' }],
  ],
  // Orcs (the Tarkhnarb is the mockup's orc, above): a Morruhk: ashen hide, a snuffler's snout, scarification, a warg-fur collar.
  morruhk: [
    ['path', { d: 'M2 78C4 60 16 54 30 54S56 60 58 78Z', fill: '#2e2a24' }],
    ['path', { d: 'M7 65L10 56L14 60L17 52L21 58L25 51L28 57L30 50L32 57L35 51L39 58L43 52L46 60L50 56L53 65C45 61.5 38 60.5 30 60.5S15 61.5 7 65Z', fill: '#7d7268' }],
    ['path', { d: 'M18 38L11 33L19 43Z M42 38L49 33L41 43Z', fill: '#8e8262' }],
    ['ellipse', { cx: '30', cy: '39', rx: '12', ry: '12.5', fill: '#8e8262' }],
    ['path', { d: 'M19 34.5C22 31.5 27 32.5 29 34.5M31 34.5C33 32.5 38 31.5 41 34.5', stroke: '#3c3726', 'stroke-width': '2.6', fill: 'none', 'stroke-linecap': 'round' }],
    ['path', { d: 'M19.5 40.5l3.2 2.4M19.5 43.8l3.2 2.4M40.5 40.5l-3.2 2.4M40.5 43.8l-3.2 2.4M28 27.5l2 3 2-3', stroke: '#e4d6b0', 'stroke-width': '1.1', fill: 'none', 'stroke-linecap': 'round' }],
    ['circle', { cx: '25', cy: '37.5', r: '1.5', fill: '#ff9e2a' }],
    ['circle', { cx: '35', cy: '37.5', r: '1.5', fill: '#ff9e2a' }],
    ['ellipse', { cx: '30', cy: '43', rx: '5.4', ry: '3.8', fill: '#6c6146' }],
    ['circle', { cx: '28', cy: '43.6', r: '1.1', fill: '#221d14' }],
    ['circle', { cx: '32', cy: '43.6', r: '1.1', fill: '#221d14' }],
    ['path', { d: 'M24.5 50l1.4-3.5 1.4 3.5Z M32.7 50l1.4-3.5 1.4 3.5Z', fill: '#efe4c8' }],
    ['path', { d: 'M24 50h12', stroke: '#3c3726', 'stroke-width': '1.4' }],
  ],
  // Trolls: a Cave Troll: dark green scales, pale glowing eyes.
  cavetroll: [
    ['path', { d: 'M-4 78C-2 54 12 48 30 48S62 54 64 78Z', fill: '#2c412d' }],
    ['path', { d: 'M8 66q3 3 6 0M14 59q3 3 6 0M40 59q3 3 6 0M46 66q3 3 6 0M21 70q3 3 6 0M33 70q3 3 6 0', stroke: '#1a281b', 'stroke-width': '1.2', fill: 'none' }],
    ['ellipse', { cx: '30', cy: '37', rx: '17', ry: '15.5', fill: '#44663e' }],
    ['path', { d: 'M17 28q2.5 2.5 5 0M23.5 25q2.5 2.5 5 0M31.5 25q2.5 2.5 5 0M38 28q2.5 2.5 5 0M15 42q2.5 2.5 5 0M40 42q2.5 2.5 5 0', stroke: '#2b4428', 'stroke-width': '1.1', fill: 'none' }],
    ['path', { d: 'M15 33C20 29 26 30 28 32M32 32C34 30 40 29 45 33', stroke: '#2b4428', 'stroke-width': '3.4', fill: 'none', 'stroke-linecap': 'round' }],
    ['circle', { cx: '23', cy: '35', r: '1.4', fill: '#e4f58a' }],
    ['circle', { cx: '37', cy: '35', r: '1.4', fill: '#e4f58a' }],
    ['ellipse', { cx: '30', cy: '41', rx: '5', ry: '4', fill: '#385634' }],
    ['path', { d: 'M20 48q10 5 20 0', stroke: '#1f321d', 'stroke-width': '2', fill: 'none' }],
    ['path', { d: 'M23 48l1.5-3.5 1.5 3.5Z M34 48l1.5-3.5 1.5 3.5Z', fill: '#d8d2bf' }],
  ],
  // a Hill Troll: brownish grey, hard plates, a great hammer over the shoulder.
  hilltroll: [
    ['path', { d: 'M-4 78C-2 54 12 48 30 48S62 54 64 78Z', fill: '#665c4e' }],
    ['path', { d: 'M38 80L49 12', stroke: '#6a4626', 'stroke-width': '3.2', 'stroke-linecap': 'round' }],
    ['path', { d: 'M41 6L57 9.5L55 20L39 16.5Z', fill: '#5c6066' }],
    ['path', { d: 'M8 62l6-3 6 3M40 62l6-3 6 3', stroke: '#4c4438', 'stroke-width': '1.6', fill: 'none' }],
    ['ellipse', { cx: '30', cy: '37', rx: '17', ry: '15.5', fill: '#8a7e6c' }],
    ['path', { d: 'M19 26l5-2.5 5 2.5M31 26l5-2.5 5 2.5M14.5 40l3 3 3-3M39.5 40l3 3 3-3', stroke: '#5e5546', 'stroke-width': '1.5', fill: 'none' }],
    ['path', { d: 'M15 33C20 29 26 30 28 32M32 32C34 30 40 29 45 33', stroke: '#544b3e', 'stroke-width': '3.4', fill: 'none', 'stroke-linecap': 'round' }],
    ['circle', { cx: '23', cy: '35', r: '1.2', fill: '#ff9a3a' }],
    ['circle', { cx: '37', cy: '35', r: '1.2', fill: '#ff9a3a' }],
    ['ellipse', { cx: '30', cy: '41', rx: '5', ry: '4', fill: '#776c5c' }],
    ['path', { d: 'M20 48q10 5 20 0', stroke: '#433b30', 'stroke-width': '2', fill: 'none' }],
    ['path', { d: 'M23 48l1.5-3.5 1.5 3.5Z M34 48l1.5-3.5 1.5 3.5Z', fill: '#d8d2bf' }],
  ],
  // a Mountain Troll: the tallest and wildest, wild black hair, grey-blue stony hide with cracks.
  mountaintroll: [
    ['path', { d: 'M-6 78C-4 52 12 46 30 46S64 52 66 78Z', fill: '#4c5a68' }],
    ['path', { d: 'M9 42L5 24L13 28L11 11L20 19L23 3L30 14L37 3L40 19L49 11L47 28L55 24L51 42Z', fill: '#24221f' }],
    ['ellipse', { cx: '30', cy: '37', rx: '17.5', ry: '16', fill: '#7c8ea0' }],
    ['path', { d: 'M21 29l3 4-2 3.5M39 29l-3 4 2 3.5M25.5 50l2.5-2.5 1.5 2', stroke: '#52647a', 'stroke-width': '1.2', fill: 'none' }],
    ['path', { d: 'M15 32C20 28 26 29 28 31.5M32 31.5C34 29 40 28 45 32', stroke: '#3c4a5a', 'stroke-width': '3.6', fill: 'none', 'stroke-linecap': 'round' }],
    ['circle', { cx: '23', cy: '35', r: '1.4', fill: '#ffd24a' }],
    ['circle', { cx: '37', cy: '35', r: '1.4', fill: '#ffd24a' }],
    ['ellipse', { cx: '30', cy: '41', rx: '5', ry: '4.2', fill: '#687a8c' }],
    ['path', { d: 'M20 48q10 5 20 0', stroke: '#33404e', 'stroke-width': '2', fill: 'none' }],
    ['path', { d: 'M22.5 48.5l1.6-4.5 1.6 4.5Z M34.3 48.5l1.6-4.5 1.6 4.5Z', fill: '#d8d2bf' }],
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
  for (const [tag, attrs] of id === 'neutral' ? NEUTRAL : FIGURES[id]) {
    const e = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    svg.append(e);
  }
  return svg;
}
