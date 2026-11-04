// The line icons of the Group and Timers panes (ADR 0122; the set of
// mockup 3c, notes/research/group-timers-mockups/r2-P3c-revised.dc.html).
// Each is one SVG path `d` on a 24×24 view box, drawn as a stroke (no
// fill): stroke width 2, round caps and joins, `currentColor`. Several
// subpaths share one `d` (`M … M …`).

/** The icon names. */
export type IconName =
  | 'sanct'
  | 'stored'
  | 'poison'
  | 'thirsty'
  | 'slept'
  | 'blind'
  | 'bashed'
  | 'snared'
  | 'wound'
  | 'hungry'
  | 'waiting'
  | 'standing'
  | 'fighting'
  | 'resting'
  | 'sleeping'
  | 'riding'
  | 'tank'
  | 'axe'
  | 'charm'
  | 'spell'
  | 'buff'
  | 'debuff'
  | 'herb'
  | 'pin'
  | 'player'
  | 'enemy'
  | 'npc'
  | 'close';

/** Path data by name. */
export const ICONS: Readonly<Record<IconName, string>> = {
  /** Sanctuary ("Radiant"): a figure with rays, no enclosing outline. */
  sanct: 'M12 7.2a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4 M7.5 20.5c0-3.2 2-5.3 4.5-5.3s4.5 2.1 4.5 5.3 M12 1.8v2.4 M5.4 4.4l1.6 1.7 M18.6 4.4L17 6.1 M2.4 10.8h2.4 M19.2 10.8h2.4',
  /** A stored spell ("Held spark"): a spark between brackets. */
  stored: 'M12 7l1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5z M6.5 4.5a9 9 0 0 0 0 15 M17.5 4.5a9 9 0 0 1 0 15',
  /** Poisoned: a vial. */
  poison: 'M9.5 3h5 M10.5 3v5.5L6 17a2.4 2.4 0 0 0 2.1 3.5h7.8A2.4 2.4 0 0 0 18 17l-4.5-8.5V3 M7.6 14h8.8 M11 17.2h.01 M13.5 16h.01',
  /** Thirsty: a drop. */
  thirsty: 'M12 3c-3 4-6 7-6 10.5a6 6 0 0 0 12 0C18 10 15 7 12 3z M9.8 14.2a2.2 2.2 0 0 0 2.2 2.2',
  /** Magically asleep (`slept`): Zz. */
  slept: 'M4 6h6l-6 7h6 M13 12h6l-6 7h6',
  /** Blind: a crossed-out eye (also the Blinds group). */
  blind: 'M3 3l18 18 M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 4.5 9 6a10 10 0 0 1-2.4 3.2 M6.6 6.6C4.3 8 3 10.2 3 12c0 1.5 4 6 9 6a9 9 0 0 0 4.4-1.1 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  /** Bashed: a burst. */
  bashed: 'M12 2l1.8 5.5L19 5l-2.5 5.2L22 12l-5.5 1.8L19 19l-5.2-2.5L12 22l-1.8-5.5L5 19l2.5-5.2L2 12l5.5-1.8L5 5l5.2 2.5z',
  /** Snared: a chain link. */
  snared: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  /** Wounded: a bandage. */
  wound: 'M4.6 14.6l10-10a3.5 3.5 0 0 1 5 5l-10 10a3.5 3.5 0 0 1-5-5z M9 9l6 6',
  /** Hungry: fork and knife. */
  hungry: 'M7 3v8 M5 3v4a2 2 0 0 0 4 0V3 M7 11v10 M17 3c-2 0-3 3-3 6s1 3 3 3 M17 3v18',
  /** Waiting (`waiting`): an hourglass. */
  waiting: 'M7 3h10 M7 21h10 M8 3v2a4 4 0 0 0 1.6 3.2L12 12l2.4-3.8A4 4 0 0 0 16 5V3 M8 21v-2a4 4 0 0 1 1.6-3.2L12 12l2.4 3.8A4 4 0 0 1 16 19v2',
  /** Position standing. */
  standing: 'M12 2.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M12 8.5v7 M7.5 11h9 M12 15.5l-3 6 M12 15.5l3 6',
  /** Position fighting: crossed swords. */
  fighting: 'M14.5 17.5L3 6V3h3l11.5 11.5 M13 19l6-6 M16 16l4 4 M19 21l2-2 M14.5 6.5L18 3h3v3l-3.5 3.5 M5 14l4 4 M7 17l-3 3 M3 19l2 2',
  /** Position resting (and sitting): a seated figure. */
  resting: 'M9 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M9 9v6h6l1 6 M6 12h6 M4 21h16',
  /** Position sleeping: a bed. */
  sleeping: 'M3 19V7 M3 15h18v4 M21 15v-2a3 3 0 0 0-3-3h-8v5 M6.5 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3 M15 3h4l-4 4h4',
  /** Riding (`ride`): a horse head. */
  riding: 'M6 21v-5l3-4-1.5-4L11 4l2 3h3l4 5-2 2-3-1-2 3v5',
  /** The tank (fight buffer): a shield. */
  tank: 'M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z',
  /** The opponent: an axe. */
  axe: 'M4 21L15.5 9.5 M12 6.2c1.2-2.7 4.6-3.9 7.3-1.5s1.2 6.1-1.5 7.3L12 6.2z M10.5 4.5l1.5 1.7',
  /** A charmie: a heart. */
  charm: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  /** The Spells group: a sparkle. */
  spell: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  /** The Buffs group: an up arrow. */
  buff: 'M12 19V5 M6 11l6-6 6 6',
  /** The Debuffs group: a down arrow. */
  debuff: 'M12 5v14 M6 13l6 6 6-6',
  /** A herblore buff or debuff: a leaf. */
  herb: 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14z M5 19l8-8',
  /** Elsewhere (the room name): a map pin. */
  pin: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z M12 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  /** A player member (ally, neutral): a person. */
  player: 'M12 4a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7 M5 20c0-3.5 3-6 7-6s7 2.5 7 6',
  /** A player of an enemy race: a horned helm. */
  enemy: 'M6 11a6 6 0 0 1 12 0v4H6z M6 10.5L3 4.5 M18 10.5l3-6 M12 5v10 M8.5 15v4.5 M15.5 15v4.5',
  /** An NPC member: a diamond. */
  npc: 'M12 3l8 9-8 9-8-9z',
  /** Close / forget (the charm ×). */
  close: 'M5 5l14 14 M19 5L5 19',
};

/** The view box every icon is drawn in. */
export const ICON_VIEWBOX = '0 0 24 24';

/** The icon of a GMCP position (`ride` wins over standing). Unknown positions: standing. */
export function positionIcon(position: string | null, ride: boolean): IconName {
  switch (position) {
    case 'fighting':
      return 'fighting';
    case 'resting':
    case 'sitting':
      return 'resting';
    case 'sleeping':
    case 'incapacitated':
    case 'stunned':
    case 'dying':
      return 'sleeping';
    default:
      return ride ? 'riding' : 'standing';
  }
}

/** The icon of each status flag (src/gmcp/group.ts `STATUS_FLAGS`). */
export const STATUS_ICON = {
  sanctuary: 'sanct',
  poison: 'poison',
  slept: 'slept',
  blind: 'blind',
  bashed: 'bashed',
  snared: 'snared',
  wound: 'wound',
  hungry: 'hungry',
  thirsty: 'thirsty',
  waiting: 'waiting',
} as const satisfies Record<string, IconName>;

/** The header icon of each timer group. */
export const GROUP_ICON = {
  sanct: 'sanct',
  spell: 'spell',
  buff: 'buff',
  debuff: 'debuff',
  stored: 'stored',
  blind: 'blind',
  charm: 'charm',
} as const satisfies Record<string, IconName>;
