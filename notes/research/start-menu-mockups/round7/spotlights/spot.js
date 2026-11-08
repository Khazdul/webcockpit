/* Round 7 · Spotlights · shared mockup code for the three directions (spotlights-a/b/c.html).
   Throwaway. Re-does, for the mockup, what the app does (CONTENT.md has the inventory):
   - DATA: 11 spotlights over five characters, each with its cut window of game text (real MUME shapes and
     colours, times relative to the moment: the window is [−10 s, +5 s], the pre-roll trimmed to the first line)
   - the Spotlights settings (kinds × characters × period) with the real patch rules, and the rotation order
   - Reel: one timeline over the chosen spotlights (position, play/pause, speed 0.25–8×, ±10 s, ←/→ with the
     1.5 s restart rule, park at the end, rebuild for new settings keeping the current spotlight)
   - screen(el): the game text, bottom-anchored, "scrolls clear" between spotlights, pause cursor line
   - track(el): the reel's progress with one kind-icon marker per spotlight (horizontal or vertical)
   - controls(el): the control row (glass), filterPanel(el), displayPanel(el)
   - shell(): the start menu → page transition (layout A "the mark in the corner" for large boxes; a normal
     box keeps the full wordmark above it), Back / Esc, swapping boxes (filtered page → reel)
   URL: ?open (opens at once) · ?at=N (spotlight N, just after its moment) · ?pause · ?freeze (no clock, for
   screenshots) · ?end · ?none (nothing passes) · ?filter · ?display · ?filtered · ?empty · ?error · ?loading */
(() => {
'use strict';
const qs = new URLSearchParams(location.search);
const NOW = new Date(2026, 10, 7, 1, 30).getTime();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const p2 = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------------------------------------------ kinds, icons
const KIND = {
  achievement: { name: 'Achievement', key: 'achievements', label: 'Achievements', color: '#e3b341', path: 'M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z' },
  death: { name: 'Death', key: 'deaths', label: 'Deaths', color: '#e06c6c', path: 'M12 3.5c-4 0-7 2.9-7 6.8 0 2.3 1.1 4.1 2.8 5.1V19a1 1 0 0 0 1 1h6.4a1 1 0 0 0 1-1v-3.6c1.7-1 2.8-2.8 2.8-5.1 0-3.9-3-6.8-7-6.8z M8.4 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M13 10.8a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0z M10.7 20v-2.2 M13.3 20v-2.2' },
  level: { name: 'Level up', key: 'levelUps', label: 'Level-ups', color: '#7fbf7f', path: 'M6.5 12.5l5.5-5.5 5.5 5.5 M6.5 18l5.5-5.5 5.5 5.5' },
  pkill: { name: 'PvP kill', key: 'pvp', label: 'PvP kills', color: '#e0915a', path: 'M4 4l9.5 9.5 M11.5 15.5l4-4 M14 14l4.5 4.5 M20 4l-9.5 9.5 M8.5 11.5l4 4 M10 14l-4.5 4.5' },
};
const KIND_ORDER = ['achievement', 'death', 'level', 'pkill'];   // the settings' order (ADR 0110)
const kindIcon = (k, cls = 'kic') => `<svg class="${cls}" viewBox="0 0 24 24" data-kind="${k}" style="--k:${KIND[k].color}" aria-hidden="true"><path d="${KIND[k].path}"/></svg>`;
const ICON_PATH = {
  start: 'M6 5v14 M19 5.5L9.5 12l9.5 6.5z',
  back: 'M5.6 9.4A7.2 7.2 0 1 1 5 13.4 M5 4.6v4.8h4.8',
  fwd: 'M18.4 9.4A7.2 7.2 0 1 0 19 13.4 M19 4.6v4.8h-4.8',
  play: 'M8 5.2l11 6.8-11 6.8z',
  pause: 'M8.5 5.5v13 M15.5 5.5v13',
  prev: 'M14.5 6l-6 6 6 6',
  next: 'M9.5 6l6 6-6 6',
  display: 'M4 7h9 M17 7h3 M15 4.5v5 M4 12h3 M11 12h9 M9 9.5v5 M4 17h11 M19 17h1 M17 14.5v5',
  filter: 'M4 5.5h16l-6.2 7.2v5.6l-3.6 1.9v-7.5z',
  fullscreen: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5',
  close: 'M6 6l12 12M18 6L6 18',
  chev: 'M9.5 6.5l5.5 5.5-5.5 5.5',
  list: 'M8 6.5h12 M8 12h12 M8 17.5h12 M4 6.5h.1 M4 12h.1 M4 17.5h.1',
  grid: 'M4.5 4.5h6v6h-6z M13.5 4.5h6v6h-6z M4.5 13.5h6v6h-6z M13.5 13.5h6v6h-6z',
};
const icon = (n, cls = 'pic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATH[n]}"/>${n === 'back' || n === 'fwd' ? '<text x="12" y="15.4" text-anchor="middle">10</text>' : ''}</svg>`;

// ------------------------------------------------------------------------------------------ data
// lines: [t (s, relative to the moment), class, text]; classes: '' plain · p prompt · e command echo ·
// b bold · c31 red (hits on you) · c32 green (room names, tells) · c33 yellow (narrates) · c35 magenta (auras) ·
// c36 cyan (your hits). Inline {31|text} colours a part of a line.
const RAW = [
  { char: 'Gibur', level: 41, kind: 'level', at: '2026-11-06 22:47:12', lines: [
    [-9.6, 'p', '* HP:Fine R:Healthy>'], [-9.2, 'e', '> kill pikeman'],
    [-8.8, 'c36', "You slash an orc pikeman's body very hard."],
    [-8.0, 'c31', 'An orc pikeman pierces your left arm and tickles it.'], [-7.9, '', ''], [-7.9, 'p', '* HP:Fine R:Wounded>'],
    [-6.6, 'c36', "You cleave an orc pikeman's head extremely hard and shatter it."],
    [-6.5, '', "An orc pikeman panics, but can't stop fighting to flee."], [-6.5, '', ''], [-6.5, 'p', '* HP:Fine R:Bad>'],
    [-4.9, 'c33', "Taube narrates 'more of them coming down from the pass'"],
    [-3.4, 'c36', "You slash an orc pikeman's right leg extremely hard and shatter it."],
    [-3.3, '', 'An orc pikeman is incapacitated and will slowly die, if not aided.'], [-3.3, '', ''], [-3.3, 'p', '* HP:Fine R:Dying>'],
    [-0.7, 'c36', "You slash an orc pikeman's body extremely hard and shatter it."],
    [-0.6, '', 'You receive your share of experience.'], [-0.6, '', 'An orc pikeman is dead! R.I.P.'],
    [0, 'b', 'You rise a level!'], [0.1, '', ''], [0.1, 'p', '* HP:Fine>'],
    [1.9, 'c32', "Taube tells you 'grats on 41!'"], [3.1, 'e', '> say thanks, onwards'], [3.3, '', "You say 'thanks, onwards'"], [3.4, '', ''], [3.4, 'p', '* HP:Fine>'],
  ] },
  { char: 'Taube', level: 22, kind: 'achievement', what: 'Put a barrow-wight to rest.', at: '2026-11-05 12:31:40', lines: [
    [-9.7, 'c32', 'Within a Barrow'], [-9.7, 'c35', 'A chill hangs in the air, heavy with the smell of old earth.'],
    [-9.7, '', 'A barrow-wight is here, fighting {31|YOU}.'], [-9.7, '', 'Exits: (south).'], [-9.6, '', ''], [-9.6, 'p', 'o HP:Fine Mana:Hot R:Bad>'],
    [-8.9, 'e', "> cast 'lightning bolt' wight"], [-7.6, 'c36', 'Your lightning bolt hits a barrow-wight very hard.'],
    [-6.8, 'c31', 'A barrow-wight touches your left arm and drains your strength.'], [-6.8, '', ''], [-6.8, 'p', 'o HP:Hurt Mana:Warm R:Awful>'],
    [-5.2, 'c32', "Gittan tells you 'one more bolt, it is almost gone'"], [-4.4, 'e', "> cast 'lightning bolt' wight"],
    [-2.6, 'c36', 'Your lightning bolt hits a barrow-wight extremely hard.'],
    [-2.5, '', 'A barrow-wight is mortally wounded, and will die soon, if not aided.'],
    [-0.4, '', 'A barrow-wight disappears into nothing.'], [0, 'b', 'Achievement unlocked: Put a barrow-wight to rest.'],
    [0.6, '', 'You receive your share of experience.'], [0.7, '', ''], [0.7, 'p', 'o HP:Hurt Mana:Cold>'],
    [2.4, 'c33', "Gittan narrates 'gz Taube, the downs are quiet again'"], [3.9, 'e', '> rest'], [4.1, '', 'You sit down and rest your tired bones.'],
  ] },
  { char: 'Rasta', level: 74, kind: 'death', at: '2026-11-04 23:02:31', lines: [
    [-9.8, 'p', '!O HP:Hurt Mana:Warm *Lindorien the Elf*:Fine>'],
    [-9.3, 'c31', '*Lindorien the Elf* slashes your body extremely hard and shatters it.'],
    [-8.5, 'c36', "You pierce *Lindorien the Elf*'s right arm hard."], [-8.4, '', ''], [-8.4, 'p', '!O HP:Wounded Mana:Warm *Lindorien the Elf*:Fine>'],
    [-7.2, '', '*Aerandil the Half-Elf* arrives from the east, riding a grey horse.'],
    [-6.4, 'c31', "*Aerandil the Half-Elf*'s lightning bolt hits you very hard."], [-6.3, '', ''], [-6.3, 'p', '!O HP:Bad Mana:Warm *Lindorien the Elf*:Fine>'],
    [-5.6, 'e', '> flee'], [-5.1, '', 'You flee head over heels.'], [-5.0, 'c32', 'Ruins of Tharbad'],
    [-5.0, '', 'Broken walls lean over a flooded street. The river murmurs nearby.'], [-5.0, '', 'Exits: east, west.'], [-4.9, '', ''], [-4.9, 'p', '!O HP:Bad Mana:Warm>'],
    [-3.0, '', '*Lindorien the Elf* arrives from the east.'],
    [-1.6, 'c31', '*Lindorien the Elf* pierces your back very hard and shatters it.'], [-1.5, '', ''], [-1.5, 'p', '!O HP:Awful Mana:Warm *Lindorien the Elf*:Fine>'],
    [-0.1, 'c31', '*Lindorien the Elf* slashes your head extremely hard and shatters it.'], [0, 'b', 'You are dead! Sorry...'], [1.2, '', ''],
    [2.0, 'c33', "Dushgar narrates 'rasta down at tharbad, elves at the ford'"], [3.6, 'c33', "Gorzag narrates 'omw'"],
  ] },
  { char: 'Gibur', level: 40, kind: 'pkill', what: '*Bolgrat the Orc*', at: '2026-11-03 21:40:05', lines: [
    [-9.5, 'c32', 'The Great East Road'], [-9.5, '', 'The road runs straight across the open moor, wide and paved with old stones.'],
    [-9.5, '', '*Bolgrat the Orc* is here, fighting {31|YOU}.'], [-9.5, '', 'Exits: east, west.'], [-9.4, '', ''], [-9.4, 'p', '* HP:Hurt R:Wounded>'],
    [-8.2, 'c36', "You cleave *Bolgrat the Orc*'s left arm very hard and shatter it."], [-7.4, 'c31', '*Bolgrat the Orc* slashes your body hard.'],
    [-7.3, '', ''], [-7.3, 'p', '* HP:Hurt R:Bad>'], [-6.0, '', '*Bolgrat the Orc* panics, and attempts to flee.'],
    [-4.8, 'e', '> bash'], [-4.4, 'c36', 'You bash *Bolgrat the Orc* and send him sprawling.'], [-4.3, '', ''], [-4.3, 'p', '* HP:Hurt R:Awful>'],
    [-2.1, 'c36', "You slash *Bolgrat the Orc*'s head extremely hard and shatter it."],
    [-2.0, '', '*Bolgrat the Orc* is mortally wounded, and will die soon, if not aided.'],
    [-0.2, 'c36', "You slash *Bolgrat the Orc*'s body extremely hard and shatter it."], [0, '', '*Bolgrat the Orc* is dead! R.I.P.'],
    [0.1, '', 'You receive your share of experience.'], [0.2, '', ''], [0.2, 'p', '* HP:Hurt>'],
    [1.9, 'c32', "Taube tells you 'nice! was that the scout from Bree?'"], [3.6, 'c33', "Melker narrates 'the road is clear again'"],
  ] },
  { char: 'Rasta', level: 74, kind: 'pkill', what: '*Ibuki the Half-Elf*', at: '2026-10-31 23:58:47', lines: [
    [-9.9, 'p', '!O HP:Fine Mana:Warm *Ibuki the Half-Elf*:Wounded>'],
    [-9.0, 'c36', "You pierce *Ibuki the Half-Elf*'s body extremely hard and shatter it."], [-8.2, 'c31', '*Ibuki the Half-Elf* slashes your right leg hard.'],
    [-8.1, '', ''], [-8.1, 'p', '!O HP:Fine Mana:Warm *Ibuki the Half-Elf*:Bad>'], [-6.9, 'c33', "Dushgar narrates 'hold her at the bridge'"],
    [-5.8, 'c36', "You pierce *Ibuki the Half-Elf*'s left arm very hard and shatter it."], [-5.7, '', '*Ibuki the Half-Elf* panics, and attempts to flee.'],
    [-5.5, '', ''], [-5.5, 'p', '!O HP:Fine Mana:Warm *Ibuki the Half-Elf*:Awful>'],
    [-3.3, 'c36', "You pierce *Ibuki the Half-Elf*'s head extremely hard and shatter it."],
    [-3.2, '', '*Ibuki the Half-Elf* is incapacitated and will slowly die, if not aided.'], [-3.1, '', ''], [-3.1, 'p', '!O HP:Fine Mana:Warm *Ibuki the Half-Elf*:Dying>'],
    [-0.3, 'c36', "You pierce *Ibuki the Half-Elf*'s body extremely hard and shatter it."], [0, '', '*Ibuki the Half-Elf* has drawn her last breath! R.I.P.'],
    [0.1, '', 'You receive your share of experience.'], [0.2, '', ''], [0.2, 'p', '!O HP:Fine Mana:Warm>'],
    [1.8, 'c33', "Kuzzim narrates 'nice one Rasta'"], [3.3, 'e', '> get all corpse'],
    [3.6, '', 'You get a long, slender bow from the corpse of *Ibuki the Half-Elf*.'],
  ] },
  { char: 'Melker', level: 3, kind: 'level', at: '2026-10-31 09:16:30', lines: [
    [-9.4, 'c32', 'The Bree Fields'], [-9.4, '', 'Tall grass sways on either side of a narrow path.'], [-9.4, '', 'A large rat is here.'],
    [-9.4, '', 'Exits: north, south.'], [-9.3, '', ''], [-9.3, 'p', '* HP:Fine>'], [-8.6, 'e', '> kill rat'],
    [-8.1, 'c36', "You hit a large rat's body hard."], [-7.2, 'c31', 'A large rat bites your left foot and tickles it.'], [-7.1, '', ''], [-7.1, 'p', '* HP:Fine R:Wounded>'],
    [-5.3, 'c36', "You hit a large rat's head very hard."], [-4.1, 'c31', 'A large rat barely bites your right leg.'], [-4.0, '', ''], [-4.0, 'p', '* HP:Fine R:Bad>'],
    [-1.2, 'c36', "You hit a large rat's body extremely hard."], [-0.4, '', 'A large rat is dead! R.I.P.'],
    [0, 'b', 'You rise a level!'], [0.1, '', ''], [0.1, 'p', '* HP:Fine>'], [2.6, 'e', '> narrate level 3!'], [2.8, 'c33', "You narrate 'level 3!'"],
    [4.2, 'c33', "Gibur narrates 'welcome to Arda, Melker'"],
  ] },
  { char: 'Taube', level: 21, kind: 'death', at: '2026-10-30 20:55:09', lines: [
    [-9.6, 'c32', 'A Clearing in the Trollshaws'], [-9.6, '', 'Stone shapes loom among the trees, grey and silent.'],
    [-9.6, '', 'A stone-troll is here, fighting {31|YOU}.'], [-9.6, '', 'Exits: north, west.'], [-9.5, '', ''], [-9.5, 'p', 'o HP:Hurt Mana:Cold R:Fine>'],
    [-8.4, 'c31', 'A stone-troll crushes you very hard.'], [-8.3, '', ''], [-8.3, 'p', 'o HP:Wounded Mana:Cold R:Fine>'],
    [-7.5, 'e', '> flee'], [-7.1, '', "PANIC! You couldn't escape!"], [-5.9, 'c31', 'A stone-troll crushes you very hard.'], [-5.8, '', ''],
    [-5.8, 'p', 'o HP:Bad Mana:Cold R:Fine>'], [-4.8, 'e', '> flee'], [-4.4, '', "PANIC! You couldn't escape!"],
    [-2.9, 'c31', 'A stone-troll crushes you extremely hard.'], [-2.8, '', ''], [-2.8, 'p', 'o HP:Awful Mana:Cold R:Fine>'],
    [-0.1, 'c31', 'A stone-troll crushes you extremely hard.'], [0, 'b', 'You are dead! Sorry...'],
    [1.5, 'c32', "Gibur tells you 'oh no, where?'"], [3.2, 'c33', "Gittan narrates 'trolls are out at the Last Bridge, careful'"],
  ] },
  { char: 'Gittan', level: 17, kind: 'achievement', what: 'That was a quick trip!', at: '2026-10-28 21:47:55', lines: [
    [-9.2, 'c32', 'The East Road'], [-9.2, '', 'The road runs west towards the Brandywine between low green hills.'], [-9.2, '', 'Exits: east, west.'],
    [-9.1, '', ''], [-9.1, 'p', '* HP:Fine MV:Tired>'], [-7.3, 'e', '> w'], [-7.0, 'c32', 'The Brandywine Bridge'],
    [-7.0, '', 'The old bridge of three arches spans the wide, brown river.'], [-7.0, '', 'Exits: east, west.'], [-6.9, '', ''], [-6.9, 'p', '* HP:Fine MV:Tired>'],
    [-4.9, 'e', '> w'], [-4.6, 'c32', 'The Bridge Inn'], [-4.6, '', 'A low, friendly inn stands by the western end of the bridge.'],
    [-4.6, '', 'A hobbit innkeeper is here, polishing a mug.'], [-4.6, '', 'Exits: east, west.'], [-4.5, '', ''], [-4.5, 'p', '* HP:Fine MV:Tired>'],
    [-2.2, 'e', '> w'], [-1.9, 'c32', 'The Road to Bywater'], [-1.9, '', 'Exits: east, west.'], [-0.2, '', ''],
    [0, 'b', 'Achievement unlocked: That was a quick trip!'], [0.1, '', ''], [0.1, 'p', '* HP:Fine MV:Tired>'],
    [2.3, 'c32', "Melker tells you 'how did you get to the Shire that fast?'"], [4.0, 'c33', "Gittan narrates 'home for second breakfast'"],
  ] },
  { char: 'Gibur', level: 37, kind: 'death', at: '2026-10-27 22:31:20', lines: [
    [-9.7, 'p', '* HP:Hurt R:Bad>'], [-9.1, 'c31', 'A black uruk slashes your body extremely hard and shatters it.'],
    [-8.3, 'c36', "You cleave a black uruk's left arm hard."], [-8.2, '', ''], [-8.2, 'p', '* HP:Wounded R:Bad>'],
    [-7.0, '', 'A cave troll arrives from the north.'], [-6.1, 'c31', 'A cave troll crushes your head very hard.'], [-6.0, '', ''], [-6.0, 'p', '* HP:Bad R:Bad>'],
    [-5.3, 'e', '> flee'], [-4.9, '', "PANIC! You couldn't escape!"], [-4.0, 'c32', "Taube tells you 'get out of there!'"],
    [-3.2, 'e', '> flee'], [-2.8, '', "PANIC! You couldn't escape!"], [-1.7, 'c31', 'A cave troll crushes your body extremely hard.'],
    [-1.6, '', ''], [-1.6, 'p', '* HP:Awful R:Bad>'], [-0.1, 'c31', 'A black uruk slashes your head extremely hard and shatters it.'],
    [0, 'b', 'You are dead! Sorry...'], [1.9, 'c33', "Taube narrates 'Gibur fell in the Second Hall, avoid the trolls'"],
    [3.8, 'c32', "Melker tells you 'sorry Gibur :('"],
  ] },
  { char: 'Rasta', level: 74, kind: 'level', at: '2026-10-26 15:41:12', lines: [
    [-9.4, 'c32', 'Hall of the Arcane'], [-9.4, 'c35', 'Traces of fierce red tones form the aura of this place.'],
    [-9.4, '', 'Thrakghash of the Mordor Flame, wielding a dagger, is here fighting {31|YOU}.'], [-9.4, '', 'Exits: (up). - u:{33|niche}.'],
    [-9.3, '', ''], [-9.3, 'p', '!O HP:Hurt Mana:Warm Thrakghash of the Mordor Flame:Awful>'],
    [-8.0, 'c36', "You slash Thrakghash of the Mordor Flame's left leg very hard and shatter it."],
    [-7.0, '', 'Thrakghash of the Mordor Flame begins some strange incantations...'], [-6.9, '', ''],
    [-6.9, 'p', '!O HP:Hurt Mana:Warm Thrakghash of the Mordor Flame:Awful>'],
    [-5.2, 'c36', "You strongly slash Thrakghash of the Mordor Flame's left arm and shatter it."],
    [-5.1, '', 'Thrakghash of the Mordor Flame is incapacitated and will slowly die, if not aided.'], [-5.0, '', ''],
    [-5.0, 'p', '!O HP:Hurt Mana:Warm Thrakghash of the Mordor Flame:Dying>'],
    [-2.6, 'c36', "You slash Thrakghash of the Mordor Flame's left leg extremely hard and shatter it."],
    [-2.5, '', 'You receive your share of experience.'], [-2.5, '', "**Yawn** Boring kill, wasn't it?"],
    [-2.4, '', "You hear Thrakghash of the Mordor Flame's death cry as he collapses."], [-2.4, '', 'Thrakghash of the Mordor Flame is dead! R.I.P.'],
    [0, 'b', 'You rise a level!'], [0.1, '', ''], [0.1, 'p', '!O HP:Hurt Mana:Warm>'],
    [2.2, 'c33', "Dushgar narrates 'grats rasta, 74!'"], [3.9, 'e', '> get coins all.corpse'],
  ] },
  { char: 'Taube', level: 14, kind: 'achievement', what: 'Climbed Weathertop.', at: '2026-06-21 19:20:03', lines: [
    [-9.0, 'e', '> u'], [-8.7, 'c32', 'The Summit of Amon Sûl'],
    [-8.7, '', 'A ring of broken stones crowns the hill. Far to the east the land falls away into mist.'],
    [-8.7, '', 'Exits: down.'], [-8.6, '', ''], [-8.6, 'p', '* HP:Fine Mana:Hot MV:Tired>'], [-6.4, 'e', '> look east'],
    [-6.1, '', 'You see the Great East Road winding away towards the Last Bridge.'], [-6.0, '', ''], [-6.0, 'p', '* HP:Fine Mana:Hot MV:Tired>'],
    [-3.5, 'c33', "Gibur narrates 'Taube, the view from up there is worth it'"], [-0.3, '', ''],
    [0, 'b', 'Achievement unlocked: Climbed Weathertop.'], [0.1, '', ''], [0.1, 'p', '* HP:Fine Mana:Hot MV:Tired>'],
    [2.6, 'e', '> rest'], [2.8, '', 'You sit down and rest your tired bones.'],
  ] },
];
const parseAt = (s) => { const [d, t] = s.split(' '), [y, m, dd] = d.split('-').map(Number), [h, mi, se] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi, se).getTime(); };
const DATA = qs.has('empty') ? [] : RAW.map((r, i) => {
  const at = parseAt(r.at), t0 = Math.max(-10, r.lines[0][0]);
  const label = r.kind === 'pkill' ? r.what : r.kind === 'death' ? `Death (level ${r.level})` : r.kind === 'level' ? `Reached level ${r.level}` : `Achievement: ${r.what}`;
  const tip = r.kind === 'pkill' ? `Killed ${r.what}` : r.kind === 'death' ? `Died (level ${r.level})` : r.kind === 'level' ? `Reached level ${r.level}` : `Achievement: ${r.what}`;
  return { id: 's' + i, ...r, atMs: at, label, tip, t0, dur: Math.round((5 - t0) * 1000), moment: Math.round(-t0 * 1000) };
});
const CHARS = [...new Set(DATA.map((s) => s.char))].sort((a, b) => a.localeCompare(b));

// ------------------------------------------------------------------------------------------ formats
const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const fmtLong = (t) => new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`; };
const fmtSpeed = (s) => `${s}×`;
const lineHtml = (text) => esc(text).replace(/\{(\d+)\|([^}]*)\}/g, '<span class="c$1">$2</span>');

// ------------------------------------------------------------------------------------------ the Spotlights settings
const F = { achievements: true, deaths: true, levelUps: true, pvp: true, allCharacters: true, characters: [], period: 'all' };
const PERIODS = [['all', 'All time'], ['year', 'Last year'], ['3months', 'Last 3 months'], ['month', 'Last month'], ['week', 'Last week']];
function periodStart(period) {
  if (period === 'all') return -Infinity;
  const d = new Date(NOW), day = d.getDate();
  if (period === 'week') d.setDate(day - 7);
  else { const m = period === 'year' ? 12 : period === '3months' ? 3 : 1; d.setDate(1); d.setMonth(d.getMonth() - m); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return d.getTime();
}
const passes = (s) => F[KIND[s.kind].key] && (F.allCharacters || F.characters.includes(s.char)) && s.atMs >= periodStart(F.period);
/** Rotation: per-character queues newest first; the queue with the newest head, not the previous character while another has some left. */
function rotate(list) {
  const q = new Map();
  for (const s of [...list].sort((a, b) => b.atMs - a.atMs)) { if (!q.has(s.char)) q.set(s.char, []); q.get(s.char).push(s); }
  const out = []; let prev = null;
  while (out.length < list.length) {
    const others = [...q].some(([c, a]) => c !== prev && a.length);
    let best = null;
    for (const [c, a] of q) { if (!a.length || (c === prev && others)) continue; if (!best || a[0].atMs > best[0].atMs) best = a; }
    const s = best.shift(); out.push(s); prev = s.char;
  }
  return out;
}
const select = () => rotate(DATA.filter(passes));
const filtersOpen = () => F.achievements && F.deaths && F.levelUps && F.pvp && F.allCharacters && F.period === 'all';
const emptyKind = () => (DATA.length === 0 ? 'no_data' : 'filtered');
const fsubs = new Set();
function patch(p) { Object.assign(F, p); for (const f of fsubs) f(F); }
function allCharactersPatch(on) {
  if (on) return { allCharacters: true };
  const kept = CHARS.filter((n) => F.characters.includes(n));
  return { allCharacters: false, characters: kept.length ? kept : [...CHARS] };
}
const characterPatch = (name, on) => ({ characters: CHARS.filter((n) => (n === name ? on : F.characters.includes(n))) });
const kindsSummary = () => { const n = KIND_ORDER.filter((k) => F[KIND[k].key]).length; return n === 4 ? 'All' : n === 0 ? 'None' : `${n} of 4`; };
const charsSummary = () => { if (F.allCharacters) return 'All'; const c = CHARS.filter((n) => F.characters.includes(n)); return c.length ? c.join(', ') : 'None'; };
if (qs.has('filtered')) Object.assign(F, { deaths: false, levelUps: false, pvp: false, allCharacters: false, characters: ['Rasta'] });

// ------------------------------------------------------------------------------------------ the reel (one timeline)
const RESTART_MS = 1500, SKIP_MS = 10000, SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
class Reel {
  constructor() { this.spots = []; this.starts = []; this.total = 0; this.pos = 0; this.playing = false; this.speed = 1; this.subs = new Set(); this.frozen = qs.has('freeze'); }
  load(spots) { this.spots = spots; let t = 0; this.starts = spots.map((s) => { const st = t; t += s.dur; return st; }); this.total = t; }
  get index() { let i = 0; for (let k = 1; k < this.starts.length; k++) if (this.starts[k] <= this.pos) i = k; return i; }
  get spot() { return this.spots[this.index] || null; }
  get local() { return this.pos - (this.starts[this.index] || 0); }
  get atEnd() { return this.total > 0 && this.pos >= this.total; }
  /** 1 at the spotlight's start → 0 at its moment and after. */
  get countdown() { const s = this.spot; if (!s || !s.moment) return 0; return Math.max(0, Math.min(1, (s.moment - this.local) / s.moment)); }
  momentAt(i) { return (this.starts[i] || 0) + (this.spots[i] ? this.spots[i].moment : 0); }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(why) { for (const f of this.subs) f(this, why); }
  play() { if (!this.spots.length) return; if (this.atEnd) this.pos = 0; this.playing = true; this.emit('play'); }
  pause() { this.playing = false; this.emit('pause'); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(ms) { this.pos = Math.max(0, Math.min(this.total, ms)); this.emit('seek'); }
  skip(ms) { this.seek(this.pos + ms); }
  setSpeed(s) { this.speed = s; this.emit('speed'); }
  step(d) { const i = SPEEDS.indexOf(this.speed) + d; if (i >= 0 && i < SPEEDS.length) this.setSpeed(SPEEDS[i]); }
  /** ← (−1) / → (+1): ← restarts the current spotlight when more than 1.5 s in (and the first on the first). Parked at the end: plays again. */
  go(dir) {
    if (!this.starts.length) return;
    const i = this.index; let t;
    if (dir > 0) { if (i + 1 >= this.starts.length) return; t = this.starts[i + 1]; }
    else t = (this.pos - this.starts[i] > RESTART_MS || i === 0) ? this.starts[i] : this.starts[i - 1];
    const parked = this.atEnd; this.seek(t); if (parked) this.play();
  }
  goTo(i) { if (this.starts[i] === undefined) return; const parked = this.atEnd; this.seek(this.starts[i]); if (parked) this.play(); }
  /** New settings: keep the current spotlight at the same offset when it still passes, else from the first; parked plays again. */
  rebuild(spots) {
    const end = this.atEnd, playing = this.playing, cur = this.spot, off = this.local;
    this.load(spots);
    if (!spots.length) { this.pos = 0; this.playing = false; this.emit('rebuild'); return; }
    const j = cur ? spots.indexOf(cur) : -1;
    if (!end && j >= 0) { this.pos = this.starts[j] + Math.min(off, spots[j].dur - 1); this.playing = playing; }
    else { this.pos = 0; this.playing = end ? true : playing; }
    this.emit('rebuild');
  }
  tick(dt) {
    if (!this.playing || this.frozen) return;
    this.pos += dt * this.speed;
    if (this.pos >= this.total) { this.pos = this.total; this.playing = false; this.emit('end'); return; }
    this.emit('tick');
  }
}
const reels = new Set();
let last = performance.now();
(function loop(now) { const dt = Math.min(100, now - last); last = now; for (const r of reels) r.tick(dt); requestAnimationFrame(loop); })(last);
function newReel() { const r = new Reel(); reels.add(r); return r; }

// ------------------------------------------------------------------------------------------ the game-text screen
/** The game text of the current spotlight, bottom-anchored; between spotlights the old text scrolls clear upward.
    In pause a cursor line (↑↓ PgUp PgDn End, a click) marks a line; Space resumes from its time. */
function screen(el, reel, opts = {}) {
  el.classList.add('scr');
  el.innerHTML = '<div class="scr-in" role="log" aria-live="off"></div>';
  const inner = el.firstElementChild;
  const api = { cursor: null, el };
  let lastI = -1, lastN = -1, lastSig = '';
  const visible = () => { const s = reel.spot; if (!s) return 0; const loc = reel.local; let n = 0; for (const l of s.lines) { if ((l[0] - s.t0) * 1000 <= loc + 1) n++; else break; } return n; };
  api.render = (force = false) => {
    const s = reel.spot, i = s ? reel.index : -1, n = visible();
    if (i !== lastI && lastI !== -1 && inner.children.length && !WC.RM) {
      const leave = inner.cloneNode(true); leave.classList.add('scr-leave'); el.append(leave);
      leave.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-100%)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.5,0,.6,1)' }).finished.then(() => leave.remove());
    }
    if (i !== lastI || n < lastN || force) { inner.innerHTML = ''; lastN = 0; api.cursor = null; }
    if (s) for (let k = lastN; k < n; k++) { const [, c, t] = s.lines[k]; inner.insertAdjacentHTML('beforeend', `<div class="ln ${c}" data-k="${k}">${t ? lineHtml(t) : ''}</div>`); }
    lastI = i; lastN = n;
    const sig = `${api.cursor}|${n}`;
    if (sig !== lastSig) { lastSig = sig; [...inner.children].forEach((x, k) => x.classList.toggle('cur', k === api.cursor)); }
  };
  api.moveCursor = (d) => {
    if (reel.playing) reel.pause();
    const n = inner.children.length; if (!n) return;
    api.cursor = d === Infinity ? n - 1 : Math.max(0, Math.min(n - 1, (api.cursor ?? n - 1) + d));
    lastSig = ''; api.render();
  };
  api.resume = () => {
    if (api.cursor !== null && api.cursor < inner.children.length - 1 && reel.spot) { const s = reel.spot; reel.seek(reel.starts[reel.index] + (s.lines[api.cursor][0] - s.t0) * 1000); }
    api.cursor = null; lastSig = ''; reel.play(); api.render(true);
  };
  inner.addEventListener('click', (e) => { const ln = e.target.closest('.ln'); if (!ln || reel.playing) return; api.cursor = [...inner.children].indexOf(ln); lastSig = ''; api.render(); });
  reel.on((r, why) => { if (why === 'pause' && api.cursor === null && opts.cursor !== false) { api.cursor = inner.children.length - 1; lastSig = ''; } if (why === 'play') api.cursor = null; api.render(why === 'seek' || why === 'rebuild'); });
  api.render();
  return api;
}

// ------------------------------------------------------------------------------------------ the track (progress + markers)
/** The reel's progress: a track with the played part, a playhead, one kind-icon marker per spotlight at its moment
    (horizontal: a tick between spotlights too). Click / drag seeks (an MM:SS hint follows), a marker seeks to its
    moment, hovering a marker shows `Rasta: Killed *Ibuki the Half-Elf*`. */
function track(el, reel, opts = {}) {
  const dir = opts.dir || 'h';
  el.classList.add('trk', dir);
  el.innerHTML = '<div class="trk-line"><div class="trk-done"></div><div class="trk-ticks"></div></div><div class="trk-head"></div><div class="trk-marks"></div><div class="trk-hint" hidden></div><div class="trk-tip" hidden></div>';
  const done = el.querySelector('.trk-done'), head = el.querySelector('.trk-head'), marks = el.querySelector('.trk-marks'), ticks = el.querySelector('.trk-ticks');
  const hint = el.querySelector('.trk-hint'), tip = el.querySelector('.trk-tip'), line = el.querySelector('.trk-line');
  let sig = '';
  const frac = (ms) => (reel.total ? ms / reel.total : 0);
  const prop = dir === 'h' ? 'left' : 'top';
  const update = () => {
    const s = reel.spots.map((x) => x.id).join();
    if (s !== sig) {
      sig = s;
      marks.innerHTML = reel.spots.map((x, i) => `<button class="trk-mk" type="button" data-i="${i}" style="${prop}:${(frac(reel.momentAt(i)) * 100).toFixed(3)}%" aria-label="${esc(x.char + ': ' + x.tip)}">${kindIcon(x.kind)}</button>`).join('');
      ticks.innerHTML = reel.starts.slice(1).map((t) => `<i style="${prop}:${(frac(t) * 100).toFixed(3)}%"></i>`).join('');
    }
    const f = frac(reel.pos) * 100;
    if (dir === 'h') { done.style.width = f + '%'; head.style.left = f + '%'; } else { done.style.height = f + '%'; head.style.top = f + '%'; }
    const i = reel.index;
    marks.querySelectorAll('.trk-mk').forEach((m, k) => { m.classList.toggle('cur', k === i); m.classList.toggle('past', reel.pos >= reel.momentAt(k)); });
  };
  const at = (e) => { const r = line.getBoundingClientRect(); const x = dir === 'h' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height; return Math.max(0, Math.min(1, x)) * reel.total; };
  const showHint = (e, ms) => { hint.hidden = false; hint.textContent = fmtClock(ms); const r = el.getBoundingClientRect(); if (dir === 'h') hint.style.left = (e.clientX - r.left) + 'px'; else hint.style.top = (e.clientY - r.top) + 'px'; };
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.trk-mk') || !reel.total) return;
    e.preventDefault(); drag = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    const ms = at(e); reel.seek(ms); showHint(e, ms); opts.onUse && opts.onUse();
  });
  el.addEventListener('pointermove', (e) => { if (drag === null) { if (opts.hoverTime && !e.target.closest('.trk-mk')) showHint(e, at(e)); return; } const ms = at(e); reel.seek(ms); showHint(e, ms); });
  const end = () => { drag = null; hint.hidden = true; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointerleave', () => { if (drag === null) hint.hidden = true; });
  marks.addEventListener('click', (e) => { const m = e.target.closest('.trk-mk'); if (!m) return; e.stopPropagation(); reel.seek(reel.momentAt(+m.dataset.i)); opts.onUse && opts.onUse(); });
  marks.addEventListener('pointerover', (e) => {
    const m = e.target.closest('.trk-mk'); if (!m) return; const s = reel.spots[+m.dataset.i];
    tip.hidden = false; tip.innerHTML = `${kindIcon(s.kind)}<span><b>${esc(s.char)}:</b> ${esc(s.tip)}</span>`;
    const r = el.getBoundingClientRect(), mr = m.getBoundingClientRect();
    if (dir === 'h') { tip.style.left = (mr.left + mr.width / 2 - r.left) + 'px'; } else { tip.style.top = (mr.top + mr.height / 2 - r.top) + 'px'; }
  });
  marks.addEventListener('pointerout', (e) => { if (e.target.closest('.trk-mk')) tip.hidden = true; });
  reel.on(update); update();
  return { el, update };
}

// ------------------------------------------------------------------------------------------ the control row
/** The control row (glass): To the start · −10 s · Play/Pause · +10 s · [‹ ›] · speed ‹ 1× › · time · | · the page's own
    buttons (Filter, Display: labelled, with their shortcut letter) · Fullscreen. Presses never take the focus. */
function controls(el, reel, opts = {}) {
  el.classList.add('ctl');
  const b = (act, title, ic, cls = '') => `<button class="cb ${cls}" type="button" data-act="${act}" title="${title}" aria-label="${title}">${icon(ic)}</button>`;
  const seekKey = (d) => `Shift+${d}`;
  el.innerHTML = `
    ${b('start', 'To the start (Home)', 'start')}
    ${opts.prevNext ? b('prev', 'Previous spotlight (←)', 'prev', 'pn') : ''}
    ${b('back', `Back 10 s (${seekKey('←')})`, 'back', 'ten')}
    <button class="cb play" type="button" data-act="play" title="Play / pause (Space)" aria-label="Pause">${icon('pause')}</button>
    ${b('fwd', `Forward 10 s (${seekKey('→')})`, 'fwd', 'ten')}
    ${opts.prevNext ? b('next', 'Next spotlight (→)', 'next', 'pn') : ''}
    <span class="spd" title="Speed (1–6)">${b('slower', 'Slower (1–6)', 'prev', 'sm')}<span class="spd-v">1×</span>${b('faster', 'Faster (1–6)', 'next', 'sm')}</span>
    <span class="clock"><b>00:00</b> / <span>00:00</span></span>
    <span class="grow"></span>
    ${(opts.buttons || []).map((x) => `<button class="ibtn small ${x.cls || ''}" type="button" data-act="${x.act}" title="${x.title || ''}">${icon(x.icon)}<span>${x.label}</span></button>`).join('')}
    ${opts.fullscreen !== false ? b('fullscreen', 'Fullscreen', 'fullscreen', 'fs') : ''}`;
  el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  el.addEventListener('click', (e) => {
    const x = e.target.closest('[data-act]'); if (!x || x.disabled) return; e.stopPropagation();
    const a = x.dataset.act;
    if (a === 'start') reel.seek(0); else if (a === 'back') reel.skip(-SKIP_MS); else if (a === 'fwd') reel.skip(SKIP_MS);
    else if (a === 'play') (opts.onToggle ? opts.onToggle() : reel.toggle()); else if (a === 'prev') reel.go(-1); else if (a === 'next') reel.go(1);
    else if (a === 'slower') reel.step(-1); else if (a === 'faster') reel.step(1);
    else if (a === 'fullscreen') { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    else if (opts.onAct) opts.onAct(a, x);
    opts.onUse && opts.onUse();
  });
  const playB = el.querySelector('[data-act="play"]'), spd = el.querySelector('.spd-v'), clk = el.querySelector('.clock');
  let sig = '';
  const update = () => {
    const s = `${reel.playing}|${reel.speed}|${fmtClock(reel.pos)}|${fmtClock(reel.total)}|${reel.index}|${reel.spots.length}`;
    if (s === sig) return; sig = s;
    playB.innerHTML = icon(reel.playing ? 'pause' : 'play'); playB.setAttribute('aria-label', reel.playing ? 'Pause' : 'Play');
    spd.textContent = fmtSpeed(reel.speed);
    el.querySelector('[data-act="slower"]').disabled = reel.speed <= SPEEDS[0];
    el.querySelector('[data-act="faster"]').disabled = reel.speed >= SPEEDS[SPEEDS.length - 1];
    clk.firstElementChild.textContent = fmtClock(reel.pos); clk.lastElementChild.textContent = fmtClock(reel.total);
    const pv = el.querySelector('[data-act="prev"]'), nx = el.querySelector('[data-act="next"]');
    if (pv) pv.disabled = !reel.spots.length; if (nx) nx.disabled = !reel.spots.length || reel.index + 1 >= reel.spots.length;
    el.querySelectorAll('.cb:not(.sm):not([data-act="prev"]):not([data-act="next"]):not(.fs)').forEach((x) => { x.disabled = !reel.spots.length; });
  };
  reel.on(update); update();
  return { el, update };
}

// ------------------------------------------------------------------------------------------ the reel's keys
/** The player's keys over a reel (the real ones): ← → previous / next spotlight · Shift+← → ±10 s · Home · Space ·
    1–6 speed · ↑ ↓ PgUp PgDn End the pause cursor. Returns true when handled. */
function reelKey(e, reel, scr) {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  if (!reel.spots.length) return false;
  switch (e.key) {
    case 'ArrowLeft': e.shiftKey ? reel.skip(-SKIP_MS) : reel.go(-1); return true;
    case 'ArrowRight': e.shiftKey ? reel.skip(SKIP_MS) : reel.go(1); return true;
    case 'Home': reel.seek(0); return true;
    case ' ': if (!reel.playing && scr && scr.cursor !== null) scr.resume(); else reel.toggle(); return true;
    case 'ArrowUp': scr && scr.moveCursor(-1); return true;
    case 'ArrowDown': scr && scr.moveCursor(1); return true;
    case 'PageUp': scr && scr.moveCursor(-20); return true;
    case 'PageDown': scr && scr.moveCursor(20); return true;
    case 'End': scr && scr.moveCursor(Infinity); return true;
  }
  const n = e.key.length === 1 ? e.key.charCodeAt(0) - 49 : -1;
  if (n >= 0 && n < SPEEDS.length) { reel.setSpeed(SPEEDS[n]); return true; }
  return false;
}

// ------------------------------------------------------------------------------------------ the filter (Spotlights settings)
/** The Spotlights settings in the new kit: Kinds (four toggles with the kind icons), Characters (All characters, then a
    check per recorded character, dimmed and disabled while All is on), Period (a list). opts.folds: Kinds and
    Characters fold out with a summary (as today's card). Every change goes to the settings at once. */
function filterPanel(el, opts = {}) {
  el.classList.add('fp');
  const open = { kinds: !!opts.openKinds, chars: !!opts.openChars };
  const render = () => {
    const fk = document.activeElement && el.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
    const fold = (k, label, sum) => opts.folds
      ? `<button class="fp-fold" type="button" data-fold="${k}" data-fk="fold-${k}" aria-expanded="${open[k]}">${icon('chev', 'pic fp-chev' + (open[k] ? ' open' : ''))}<span class="fp-fl">${label}</span><span class="fp-sum">${esc(sum)}</span></button>`
      : `<div class="h-sec fp-h">${label}</div>`;
    const kinds = KIND_ORDER.map((k) => `<label class="fp-row"><span class="fp-rl">${kindIcon(k)}${KIND[k].label}</span><input type="checkbox" class="tog" role="switch" data-kind="${k}" data-fk="kind-${k}" ${F[KIND[k].key] ? 'checked' : ''}></label>`).join('');
    const chars = `<label class="fp-row"><span class="fp-rl">All characters</span><input type="checkbox" class="tog" role="switch" data-all data-fk="all" ${F.allCharacters ? 'checked' : ''}></label>
      ${CHARS.length ? `<div class="fp-chars${F.allCharacters ? ' dim' : ''}" role="group" aria-label="Characters">${CHARS.map((n) => `<label class="check"><input type="checkbox" class="chk" data-char="${n}" data-fk="char-${n}" ${F.characters.includes(n) ? 'checked' : ''} ${F.allCharacters ? 'disabled' : ''}>${n}</label>`).join('')}</div>` : '<p class="fp-note">No characters recorded yet.</p>'}`;
    el.innerHTML = `
      <div class="fp-sec">${fold('kinds', 'Kinds', kindsSummary())}${!opts.folds || open.kinds ? `<div class="fp-body">${kinds}</div>` : ''}</div>
      <div class="fp-sec">${fold('chars', 'Characters', charsSummary())}${!opts.folds || open.chars ? `<div class="fp-body">${chars}</div>` : ''}</div>
      <div class="fp-sec fp-per"><label class="fp-row"><span class="${opts.folds ? 'fp-fl' : 'h-sec fp-h'}">Period</span><select class="select fp-sel" data-fk="period" aria-label="Period">${PERIODS.map(([v, l]) => `<option value="${v}" ${F.period === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
    if (fk) { const x = el.querySelector(`[data-fk="${fk}"]`); if (x) x.focus({ preventScroll: true }); }
  };
  el.addEventListener('click', (e) => { const f = e.target.closest('[data-fold]'); if (f) { open[f.dataset.fold] = !open[f.dataset.fold]; render(); } });
  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.kind) patch({ [KIND[t.dataset.kind].key]: t.checked });
    else if ('all' in t.dataset) patch(allCharactersPatch(t.checked));
    else if (t.dataset.char) patch(characterPatch(t.dataset.char, t.checked));
    else if (t.dataset.fk === 'period') { patch({ period: t.value }); }
    // a pointer change, or a period chosen, gives the keys back to the reel (as today's card)
    if (ptr || t.dataset.fk === 'period') { ptr = false; const a = document.activeElement; if (a && el.contains(a)) a.blur(); }
  });
  let ptr = false;
  el.addEventListener('pointerdown', (e) => { if (!e.target.closest('select')) ptr = true; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.activeElement && document.activeElement.blur(); } });
  // A press never takes the focus (as today's card): ← → and Space after a click still drive the reel. Tab still reaches it.
  el.addEventListener('mousedown', (e) => { if (!e.target.closest('select')) e.preventDefault(); });
  fsubs.add(render); render();
  return { el, render, open };
}

// ------------------------------------------------------------------------------------------ Display (font size, colours)
const D = { font: 'default', theme: 'default' };
const FONTS = [['default', 'Default'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const THEMES = [['default', 'Default', 'var(--scr-native, #000)'], ['dark', 'Dark', '#000000'], ['teal', 'Teal', '#002b36'], ['paper', 'Paper', '#f4ecd8'], ['sepia', 'Sepia', '#2b1b12'], ['slate', 'Slate', '#1c2128']];
const dsubs = new Set();
const applyDisplay = () => { document.querySelectorAll('.scr').forEach((s) => { s.dataset.font = D.font; s.dataset.theme = D.theme; }); for (const f of dsubs) f(D); };
function displayPanel(el) {
  el.classList.add('dp');
  const render = () => {
    el.innerHTML = `<div class="h-sec">Font size</div>
      <div class="seg dp-font" role="radiogroup" aria-label="Font size">${FONTS.map(([v, l]) => `<button type="button" role="radio" data-font="${v}" aria-selected="${D.font === v}">${l}</button>`).join('')}</div>
      <div class="h-sec">Colours</div>
      <div class="dp-sws" role="radiogroup" aria-label="Colours">${THEMES.map(([v, l, c]) => `<button type="button" class="dp-sw${D.theme === v ? ' on' : ''}" role="radio" aria-checked="${D.theme === v}" data-theme="${v}"><i style="background:${c}"></i>${l}</button>`).join('')}</div>`;
  };
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', (e) => { const f = e.target.closest('[data-font]'), t = e.target.closest('[data-theme]'); if (f) D.font = f.dataset.font; else if (t) D.theme = t.dataset.theme; else return; applyDisplay(); });
  dsubs.add(render); render();
  return { el, render };
}

// ------------------------------------------------------------------------------------------ the page shell (menu → box)
/** The start menu → page transition. A .box-large page: the full wordmark flies into the small mark at the top left
    (layout A's resting state), the menu panel sinks away, the box rises. A .box-normal page: the wordmark stays, the
    box rises under it (round 6's Profile page). show(box) also swaps one open box for another (filtered → reel).
    opts: menu, key(e) (the page's keys), back() (default: close). */
function shell(opts) {
  const menu = opts.menu, brand = menu.brand;
  document.body.insertAdjacentHTML('afterbegin', '<div class="wm small bare" id="mark" title="Start (Esc)" aria-label="MUME Cockpit — back to the start"></div>');
  const mark = document.getElementById('mark'); WC.Wordmark(mark);
  const EASE = 'cubic-bezier(.45,.05,.2,1)';
  const st = { cur: null, large: false, open: false, pop: null };
  mark.addEventListener('click', () => { if (st.open && !WC.busy) close(); });
  const fly = (anims, D, toCorner) => {
    const from = WC.rect(brand), to = mark.querySelector('.wm-c').getBoundingClientRect();
    if (WC.RM || D === 0) {
      anims.push(brand.animate(toCorner ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: 260 * D, fill: 'forwards' }));
      anims.push(mark.animate(toCorner ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration: 260 * D, fill: 'forwards' }));
    } else if (toCorner) {
      anims.push(brand.animate([{ transform: 'none', opacity: 1 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .78 }, { transform: WC.flyTo(from, to), opacity: 0 }], { duration: 950 * D, easing: EASE, fill: 'forwards' }));
      anims.push(mark.animate([{ opacity: 0 }, { opacity: 0, offset: .72 }, { opacity: 1 }], { duration: 950 * D, fill: 'forwards' }));
    } else {
      anims.push(mark.animate([{ opacity: 1 }, { opacity: 0, offset: .22 }, { opacity: 0 }], { duration: 900 * D, fill: 'forwards' }));
      anims.push(brand.animate([{ transform: WC.flyTo(from, to), opacity: 0 }, { transform: WC.flyTo(from, to), opacity: 1, offset: .2 }, { transform: 'none', opacity: 1 }], { duration: 900 * D, easing: EASE, fill: 'forwards' }));
    }
  };
  async function show(box, { instant = false } = {}) {
    if (WC.busy || st.cur === box) return;
    WC.busy = true;
    const large = box.classList.contains('box-large'), first = !st.open, old = st.cur;
    const D = instant ? 0 : WC.dur(1), anims = [];
    if (first) { menu.active = false; document.body.classList.add('pg'); }
    if (instant) document.body.classList.add('instant');
    box.getAnimations().forEach((a) => a.cancel());
    const bt = (el) => (el.classList.contains('box-normal') ? 'translateX(-50%) ' : '');   // the normal box is centred by a transform
    if (old) anims.push(old.animate([{ opacity: 1, transform: bt(old) || 'none' }, { opacity: 0, transform: bt(old) + 'translateY(14px) scale(.985)' }], { duration: (WC.RM ? 200 : 380) * D, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }));
    if (large !== st.large) { document.body.classList.remove('landed'); fly(anims, D, large); }
    box.classList.add('vis');
    if (opts.onShow) opts.onShow(box);
    anims.push(box.animate([{ opacity: 0, transform: bt(box) + 'translateY(22px) scale(.985)' }, { opacity: 1, transform: bt(box) || 'none' }],
      { duration: (WC.RM ? 260 : 700) * D, delay: (WC.RM || !old ? (WC.RM ? 0 : 180) : 260) * D, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }));
    await Promise.all(anims.map((a) => a.finished));
    if (old) { old.classList.remove('vis'); old.getAnimations().forEach((a) => a.cancel()); }
    if (!large) { brand.getAnimations().forEach((a) => a.cancel()); mark.getAnimations().forEach((a) => a.cancel()); }
    st.cur = box; st.large = large; st.open = true;
    document.body.classList.toggle('landed', large); document.body.classList.remove('instant');
    if (first) st.pop = WC.keys.push({ key: (e) => (opts.key ? opts.key(e) : false), back: () => (opts.back ? opts.back() : close()) });
    WC.busy = false;
  }
  async function close() {
    if (!st.open || WC.busy) return;
    WC.busy = true; st.pop && st.pop(); st.pop = null;
    const box = st.cur, D = WC.dur(1), anims = [];
    document.body.classList.remove('landed');
    const bt = box.classList.contains('box-normal') ? 'translateX(-50%) ' : '';
    anims.push(box.animate([{ opacity: 1, transform: bt || 'none' }, { opacity: 0, transform: bt + 'translateY(18px) scale(.985)' }], { duration: (WC.RM ? 220 : 450) * D, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' }));
    if (st.large) fly(anims, D, false);
    setTimeout(() => document.body.classList.remove('pg'), (WC.RM ? 120 : 250) * D);
    await Promise.all(anims.map((a) => a.finished));
    box.classList.remove('vis');
    [box, brand, mark].forEach((x) => x.getAnimations().forEach((a) => a.cancel()));
    st.cur = null; st.large = false; st.open = false;
    menu.active = true; menu.select(menu.cur); WC.busy = false;
    if (opts.onClosed) opts.onClosed();
  }
  return { show, close, st, mark };
}

/** Menu → Spotlights: `Loading spotlights…`, then open() (or the load error with ?error). A second press while it loads does nothing. */
let loading = false;
function launch(menu, open) {
  if (loading) return; loading = true;
  const fl = document.getElementById('flash');
  WC.flash(fl, 'Loading spotlights…', { ms: 4000 });
  setTimeout(() => {
    loading = false;
    if (qs.has('error')) { WC.flash(fl, 'Spotlights could not be loaded.', { kind: 'fail', ms: 3200 }); return; }
    fl.classList.remove('show'); open();
  }, qs.has('loading') ? 2600 : 420);
}

window.SPOT = {
  qs, NOW, KIND, KIND_ORDER, kindIcon, icon, DATA, CHARS, F, PERIODS, patch, select, filtersOpen, emptyKind, onFilter: (f) => fsubs.add(f),
  allCharactersPatch, characterPatch, kindsSummary, charsSummary,
  Reel, newReel, SPEEDS, screen, track, controls, reelKey, filterPanel, displayPanel, D, applyDisplay, onDisplay: (f) => dsubs.add(f),
  shell, launch, fmtDate, fmtLong, fmtShort, fmtClock, lineHtml, esc,
  EMPTY_NO_DATA: 'No spotlights yet. Play a session, and your highlights (kills, deaths, level-ups and achievements) will be kept here, ready to replay.',
  EMPTY_FILTERED: 'No spotlights match your settings.',
};
})();
