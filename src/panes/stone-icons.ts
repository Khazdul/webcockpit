// The stones' own icons (stage 77 H8, ADR 0166 addendum 34): the owner's
// picks of `notes/research/stone-icons/picks.md` (rounds 1–2), taken from
// the round pages exactly (`round1.html`, `round2.html`: the same 24 × 24
// view box, one path `d`, drawn as a stroke like the rest of `icons.ts`).
//
//   STONE_ICONS       the picked paths that are not already in `icons.ts`
//   AFFECT_STONE      a buff or debuff affect (the table's name) → its pick
//   HERB_STONE        a herblore (the catalogue key) → its pick, every phase
//   FLAG_STONE        a GMCP flag that is a stone → its pick
//   GENERIC_STONE     the generic icon of each group, for the rest
//   affectStoneIcon, herbStoneIcon, flagStoneIcon   the lookups
//
// A pick marked `confirmed: false` is an affect the app does not recognise
// yet (picks.md, "Not recognised yet"): it keeps its group's generic icon
// until the owner has seen it in the game. Turning one on is deleting its
// `confirmed: false`.
//
// The icon is chosen when a stone or a Spells item is built; the lookups
// are a record read (and, for an affect, one memo per name), no per-tick
// work of their own.

import type { IconName } from './icons';

/** The picked paths not already in `icons.ts` (`st-<round page id>`). */
export const STONE_ICONS = {
  // ------------------------------------------------------------ buffs
  /** second wind 7: winded 1's gust, the arrow up, longer and further out. */
  'st-second-wind': 'M3 8h11a3 3 0 1 0-3-3 M3 12h6 M3 16h4 M19 21V9 M16 12l3-3 3 3',
  /** Orkish draught 6: a bottle tipped to drink, two drops. */
  'st-orkish-draught': 'M4.2 7.7L6.3 5.6L9.1 8.4L12.6 8.4L20.1 15.8L14.4 21.5L7.0 14.1L7.0 10.5z M4.5 10.5h.01 M3.5 14h.01',
  /** battle glory 1: a war horn. */
  'st-battle-glory': 'M3 19c6-1 10-5 12-15 M3 19c7 0 13-4 17-12 M15 4l5 3',
  /** miruvor 1: a cordial bottle with a star. */
  'st-miruvor': 'M10 3h4 M11 3v4c-3 1-5 3-5 7v5a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-5c0-4-2-6-5-7V3 M12 12v5 M9.5 14.5h5',
  /** growth 2: a tree. */
  'st-growth': 'M12 21v-5 M12 3l6 8h-3l4 5H5l4-5H6z',
  /** comfortable 1: a campfire. */
  'st-comfortable': 'M5 20l14-3 M5 17l14 3 M12 15c-3 0-4-2-4-4 0-3 4-4 4-8 2 2 4 4 4 8 0 2-1 4-4 4z',
  /** very comfortable 2: an armchair with a star. */
  'st-very-comfortable': 'M6 12V8h8 M3 12h3v4h12v-4h3v7H3z M5 19v2 M19 19v2 M19 2.5v5 M16.5 5h5',
  /** anger 1: an angry face. */
  'st-anger': 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M7 8l3 2 M17 8l-3 2 M8.5 16c2-2 5-2 7 0',
  /** shadow-link 3: two linked minds. */
  'st-shadow-link': 'M3 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M15 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M8.5 9c2 4 5 2 7 6',
  /** antidote 8: the poison flag's flask, struck through. */
  'st-antidote':
    'M9.5 3h5 M10.5 3v5.5L6 17a2.4 2.4 0 0 0 2.1 3.5h7.8A2.4 2.4 0 0 0 18 17l-4.5-8.5V3 M7.6 14h8.8 M11 17.2h.01 M13.5 16h.01 M3 3l18 18',
  /** spectral health 1: a heart and a wisp. */
  'st-spectral-health': 'M12 17s-7-4-7-9a3.5 3.5 0 0 1 7-1 3.5 3.5 0 0 1 7 1c0 5-7 9-7 9z M7 21c2-1 8-1 10 0',
  /** Blood of Sauron 1: the lidless eye. */
  'st-blood-of-sauron': 'M2 12c3-5 6-7 10-7s7 2 10 7c-3 5-6 7-10 7s-7-2-10-7z M12 8c-1 2-1 6 0 8 1-2 1-6 0-8z',
  /** a pitch-black robe (pale tones) 1: a robe. */
  'st-robe-black': 'M9 3h6l1.5 4L20 21H4L7.5 7z M9 3c0 2 1.3 3 3 3s3-1 3-3',
  /** a pure white robe (pale tones) 1: a robe with a halo. */
  'st-robe-white': 'M9 3h6l1.5 4L20 21H4L7.5 7z M9 3c0 2 1.3 3 3 3s3-1 3-3 M9 1.8a3 1 0 1 0 6 0a3 1 0 1 0 -6 0',
  /** heightened senses 1: an ear. */
  'st-heightened-senses': 'M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0 M10 9a2 2 0 0 1 4 0',
  /** dark aura 1: an eclipse. */
  'st-dark-aura': 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 4a5 8 0 0 1 0 16',
  /** smothered 1: lungs. */
  'st-smothered': 'M12 4v7 M12 11c-1-1-2-1-3 0-2 1-4 4-4 7v1a2 2 0 0 0 3 1l4-2z M12 11c1-1 2-1 3 0 2 1 4 4 4 7v1a2 2 0 0 1-3 1l-4-2z',
  /** shadow-veil 4: a hood with eyes. */
  'st-shadow-veil': 'M4 21c0-9 3-17 8-17s8 8 8 17 M9 12h.01 M15 12h.01 M8 21h8',
  /** haste (active) 1: lightning. */
  'st-haste-active': 'M13 2L4 14h7l-1 8 9-12h-7z',
  /** bloodlust 1 (not recognised yet): fangs. */
  'st-bloodlust': 'M4 7c2 6 14 6 16 0 M8 9.5l1 4 1-3.5 M14 10.5l1 3.5 1-4',
  /** some pipe-weed 5 (not recognised yet): a long hobbit pipe. */
  'st-pipe-weed': 'M2 9c3 3 7 5 12 5 M14 9h5v4a3 3 0 0 1-3 3 2 2 0 0 1-2-2z M17 6c-1-1.5 1-2.5 0-4',
  /** potion 1 (not recognised yet): a round flask. */
  'st-potion': 'M10 2.5h4 M10.5 2.5v5a7 7 0 1 0 3 0v-5 M6 15h12',

  // ---------------------------------------------------------- debuffs
  /** winded 1: a broken gust, the arrow down. */
  'st-winded': 'M3 8h11a3 3 0 1 0-3-3 M3 12h6 M3 16h4 M17 11v10 M14 18l3 3 3-3',
  /** lethargy 2: a broken wand. */
  'st-lethargy': 'M4 20l8-8 M14 10l2-2 M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  /** tiredness 3: a dumbbell, an arrow down. */
  'st-tiredness': 'M3 6v6 M6 4v10 M18 4v10 M21 6v6 M6 9h12 M12 15v6 M9 18l3 3 3-3',
  /** depression 2: a sad face. */
  'st-depression': 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M8 16c2-2 6-2 8 0 M9 9.5h.01 M15 9.5h.01',
  /** haggardness 1: a dizzy spiral. */
  'st-haggardness': 'M12 11.5a1 1 0 0 1 1 1 2 2 0 0 1-2 2 3 3 0 0 1-3-3 4 4 0 0 1 4-4 5 5 0 0 1 5 5 6 6 0 0 1-6 6',
  /** heavy burden 1: a weight. */
  'st-heavy-burden': 'M9 7a3 3 0 0 1 6 0 M6 9h12l2 11H4z',
  /** chill touch 1: a snowflake. */
  'st-chill-touch': 'M12 2v20 M3.3 7l17.4 10 M3.3 17L20.7 7 M9 4l3 2 3-2 M9 20l3-2 3 2',
  /** torpor 1: a cloud over the mind. */
  'st-torpor': 'M6 10a3 3 0 0 1 1.5-5.6 4.5 4.5 0 0 1 8.5.6A2.5 2.5 0 0 1 18 10z M9 15a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M7 22a5 5 0 0 1 10 0',
  /** heightened senses (faded) 1: the ear, slashed. */
  'st-heightened-senses-faded': 'M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0 M10 9a2 2 0 0 1 4 0 M3 3l18 18',
  /** dark aura (faded) 1: a broken eclipse. */
  'st-dark-aura-faded': 'M12 4a8 8 0 0 1 8 8 M12 20a8 8 0 0 1-8-8 M12 4a5 8 0 0 1 0 16',
  /** dreaming 3: a closed eye. */
  'st-dreaming': 'M3 11c3 4 6 5 9 5s6-1 9-5 M6 15l-1 2 M12 16v3 M18 15l1 2',
  /** blindfolded 4: an eye under a band. */
  'st-blindfolded': 'M2 12c3-5 6-7 10-7s7 2 10 7c-3 5-6 7-10 7s-7-2-10-7z M2 10h20 M2 14h20',
  /** haste (recovery) 1: broken lightning (also the Haste herblore, haste 6). */
  'st-haste-recovery': 'M13 2L6 12h5 M13 13h5l-8 9 1-6',
  /** panic 2: fleeing. */
  'st-panic': 'M10 4h.01 M11 8l3 5h-4l-2 7 M14 13l4 2 M11 8l-4 3H4 M19 5l1-2 M21 8h1',
  /** sunlight 1 (not recognised yet): the sun. */
  'st-sunlight':
    'M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0 M19.0 12.0L21.5 12.0 M16.9 16.9L18.7 18.7 M12.0 19.0L12.0 21.5 M7.1 16.9L5.3 18.7 M5.0 12.0L2.5 12.0 M7.1 7.1L5.3 5.3 M12.0 5.0L12.0 2.5 M16.9 7.1L18.7 5.3',
  /** unable to quit 4: power off, slashed. */
  'st-unable-to-quit': 'M12 3v8 M7 6a8 8 0 1 0 10 0 M3 3l18 18',
  /** unable to void 1 (not recognised yet): a vortex, slashed. */
  'st-unable-to-void': 'M12 11.5a1 1 0 0 1 1 1 2 2 0 0 1-2 2 3 3 0 0 1-3-3 4 4 0 0 1 4-4 5 5 0 0 1 5 5 6 6 0 0 1-6 6 M3 3l18 18',
  /** unable to sneak 2 (not recognised yet): a footprint, slashed. */
  'st-unable-to-sneak': 'M11 4c2.5 0 4 2.5 4 6s-1.5 5-4 5-4-1.5-4-5 1.5-6 4-6z M9 19h4 M3 3l18 18',

  // -------------------------------------------------------- herblores
  /** Healing 5: a cross in a circle. */
  'st-healing': 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M12 8v8 M8 12h8',
  /** Travelling 4: a winged boot. */
  'st-travelling': 'M7 3h5v9l6.5 2.5a2 2 0 0 1 1.5 2V20H4v-5l3-2z M14 6h7 M14 9h5',
  /** Clearthought 6: a head with a star. */
  'st-clearthought':
    'M8.5 14a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0 M5.5 23c0-2.8 2.9-4.5 6.5-4.5s6.5 1.7 6.5 4.5 M12 1.2l1.06 2.74 2.74 1.06 -2.74 1.06 -1.06 2.74 -1.06 -2.74 -2.74 -1.06 2.74 -1.06z',
  /** Walking 1: a walker. */
  'st-walking': 'M13 4h.01 M12 8l-2 6 3 2v5 M10 14l-3 7 M12 8l4 3 M12 8l-4 2v3',
  /** Dark aura (herblore) 5: an eclipse, a leaf's vein. */
  'st-dark-aura-herb': 'M4 12a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M12 4a5 8 0 0 1 0 16 M8 16l8-8',
  /** Seeing 1: an eye with a glow. */
  'st-seeing': 'M2 12c3-5 6-7 10-7s7 2 10 7c-3 5-6 7-10 7s-7-2-10-7z M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M12 1v2 M5 3l1.5 1.5 M19 3l-1.5 1.5',
  /** Shadows 6: a crescent. */
  'st-shadows': 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  /** Skillful oil 1: an oil vial. */
  'st-skillful-oil': 'M9 3h6 M10 3v15a2 2 0 0 0 4 0V3 M10 12h4',
  /** Soothing draught 1: a honey pot. */
  'st-soothing-draught': 'M6 9h12v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z M5 6h14v3H5z M12 2v4',
  /** Strength 1: a flexed arm. */
  'st-strength': 'M4 19c0-6 3-11 6-14h3v3l-3 2c4-1 9 1 9 5 0 3-3 4-6 4z',
  /** Orc balm 4: putrid bubbles. */
  'st-orc-balm': 'M3 11h18a9 9 0 0 1-18 0z M8 7h.01 M12 5h.01 M16 7h.01',

  // ------------------------------------------------------------ flags
  /** snared 4: a lasso. */
  'st-snared': 'M4 8a8 4 0 1 0 16 0a8 4 0 1 0 -16 0 M8 11c-1 3-3 6-5 9',
  /** wound 4: a cut and a drop. */
  'st-wound': 'M3 9l8-6 M12 12c-2.5 3.5-4 5.5-4 7a4 4 0 0 0 8 0c0-1.5-1.5-3.5-4-7z',

  // ---------------------------------------------------------- generic
  /** The generic herblore, herblore 4: a flask and a leaf. */
  'st-generic-herb': 'M10 2.5h4 M10.5 2.5v5a7 7 0 1 0 3 0v-5 M9 16c0-2 2-4 6-4 0 3-2 4-6 4z',
  /** The generic flag, flag 4: a question mark (no flag reaches it today). */
  'st-generic-flag': 'M9 9a3 3 0 1 1 4 2.8c-1 .5-1 1.2-1 2.2 M12 18h.01',
} as const;

export type StoneIconName = keyof typeof STONE_ICONS;

/** One stone's pick. */
export interface StonePick {
  icon: IconName;
  /** The round page's proposal (`<id>-<n>`), for the record. */
  pick: string;
  /** False: not recognised yet (picks.md); the group's generic icon until the owner has seen it. */
  confirmed?: false;
}

/** The generic icon of each group: buff 1, debuff 1, herblore 4, flag 4 (picks.md, "Generic"). */
export const GENERIC_STONE = {
  buff: 'buff',
  debuff: 'debuff',
  herb: 'st-generic-herb',
  flag: 'st-generic-flag',
} as const satisfies Record<string, IconName>;

/**
 * Every buff and debuff of the affect table (`src/timers/data/affects.ts`,
 * by its name in lower case) → its pick. The twins of the flags
 * (blindness, hunger, thirst) are one stone with the flag: its pick.
 */
export const AFFECT_STONE: Readonly<Record<string, StonePick>> = {
  // buffs
  'second wind': { icon: 'st-second-wind', pick: 'second-wind-7' },
  'orkish draught': { icon: 'st-orkish-draught', pick: 'orkish-draught-6' },
  'battle glory': { icon: 'st-battle-glory', pick: 'battle-glory-1' },
  miruvor: { icon: 'st-miruvor', pick: 'miruvor-1' },
  growth: { icon: 'st-growth', pick: 'growth-2' },
  comfortable: { icon: 'st-comfortable', pick: 'comfortable-1' },
  'very comfortable': { icon: 'st-very-comfortable', pick: 'very-comfortable-2' },
  anger: { icon: 'st-anger', pick: 'anger-1' },
  'shadow-link': { icon: 'st-shadow-link', pick: 'shadow-link-3' },
  antidote: { icon: 'st-antidote', pick: 'antidote-8' },
  'spectral health': { icon: 'st-spectral-health', pick: 'spectral-health-1' },
  'blood of sauron': { icon: 'st-blood-of-sauron', pick: 'blood-of-sauron-1' },
  'a pitch-black robe (pale tones)': { icon: 'st-robe-black', pick: 'robe-black-1' },
  'a pure white robe (pale tones)': { icon: 'st-robe-white', pick: 'robe-white-1' },
  'heightened senses': { icon: 'st-heightened-senses', pick: 'heightened-senses-1' },
  'dark aura': { icon: 'st-dark-aura', pick: 'dark-aura-1' },
  smothered: { icon: 'st-smothered', pick: 'smothered-1' },
  'shadow-veil': { icon: 'st-shadow-veil', pick: 'shadow-veil-4' },
  'haste (active)': { icon: 'st-haste-active', pick: 'haste-active-1' },
  bloodlust: { icon: 'st-bloodlust', pick: 'bloodlust-1', confirmed: false },
  'some pipe-weed': { icon: 'st-pipe-weed', pick: 'pipe-weed-5', confirmed: false },
  potion: { icon: 'st-potion', pick: 'potion-1', confirmed: false },
  // debuffs
  winded: { icon: 'st-winded', pick: 'winded-1' },
  blindness: { icon: 'blind', pick: 'blind-1' },
  lethargy: { icon: 'st-lethargy', pick: 'lethargy-2' },
  tiredness: { icon: 'st-tiredness', pick: 'tiredness-3' },
  depression: { icon: 'st-depression', pick: 'depression-2' },
  haggardness: { icon: 'st-haggardness', pick: 'haggardness-1' },
  hunger: { icon: 'hungry', pick: 'hungry-1' },
  thirst: { icon: 'thirsty', pick: 'thirsty-1' },
  'chill touch': { icon: 'st-chill-touch', pick: 'chill-touch-1' },
  'heavy burden': { icon: 'st-heavy-burden', pick: 'heavy-burden-1' },
  torpor: { icon: 'st-torpor', pick: 'torpor-1' },
  'heightened senses (faded)': { icon: 'st-heightened-senses-faded', pick: 'heightened-senses-faded-1' },
  'dark aura (faded)': { icon: 'st-dark-aura-faded', pick: 'dark-aura-faded-1' },
  dreaming: { icon: 'st-dreaming', pick: 'dreaming-3' },
  blindfolded: { icon: 'st-blindfolded', pick: 'blindfolded-4' },
  'haste (recovery)': { icon: 'st-haste-recovery', pick: 'haste-recovery-1' },
  sunlight: { icon: 'st-sunlight', pick: 'sunlight-1', confirmed: false },
  // Confirmed by the owner live (stage 77, "H9 test").
  'unable to quit': { icon: 'st-unable-to-quit', pick: 'unable-to-quit-4' },
  // Confirmed by the owner live (stage 77, closing test).
  panic: { icon: 'st-panic', pick: 'panic-2' },
  'unable to void': { icon: 'st-unable-to-void', pick: 'unable-to-void-1', confirmed: false },
  'unable to sneak': { icon: 'st-unable-to-sneak', pick: 'unable-to-sneak-2', confirmed: false },
};

/** Every herblore of the catalogue (`src/timers/data/herblores.ts`, by its key) → its pick, the same in every phase. */
export const HERB_STONE: Readonly<Record<string, StonePick>> = {
  Healing: { icon: 'st-healing', pick: 'healing-5' },
  Travelling: { icon: 'st-travelling', pick: 'travelling-4' },
  Clearthought: { icon: 'st-clearthought', pick: 'clearthought-6' },
  Walking: { icon: 'st-walking', pick: 'walking-1' },
  // haste 6: haste (recovery) 1's broken bolt, so the herblore and its after-effect belong together.
  Haste: { icon: 'st-haste-recovery', pick: 'haste-6' },
  DarkAura: { icon: 'st-dark-aura-herb', pick: 'dark-aura-herb-5' },
  Seeing: { icon: 'st-seeing', pick: 'seeing-1' },
  Shadows: { icon: 'st-shadows', pick: 'shadows-6' },
  SkillfulOil: { icon: 'st-skillful-oil', pick: 'skillful-oil-1' },
  SoothingDraught: { icon: 'st-soothing-draught', pick: 'soothing-draught-1' },
  Strength: { icon: 'st-strength', pick: 'strength-herb-1' },
  OrcBalm: { icon: 'st-orc-balm', pick: 'orc-balm-4' },
};

/** The GMCP flags that are stones (`STONE_FLAGS`) → their picks; and your sanctuary. */
export const FLAG_STONE: Readonly<Record<string, StonePick>> = {
  poison: { icon: 'poison', pick: 'poison-1' },
  blind: { icon: 'blind', pick: 'blind-1' },
  snared: { icon: 'st-snared', pick: 'snared-4' },
  wound: { icon: 'st-wound', pick: 'wound-4' },
  hungry: { icon: 'hungry', pick: 'hungry-1' },
  thirsty: { icon: 'thirsty', pick: 'thirsty-1' },
};

/** Your sanctuary, sanctuary 1: the Sanctuary group's figure (unchanged). */
export const SANCT_STONE: StonePick = { icon: 'sanct', pick: 'sanctuary-1' };

const usable = (p: StonePick | undefined): IconName | undefined => (p !== undefined && p.confirmed !== false ? p.icon : undefined);

/** Memo by the name as given, per group: a Spells item is built on every tick. */
const AFFECT_MEMO: Record<'buff' | 'debuff', Map<string, IconName>> = { buff: new Map(), debuff: new Map() };

/** A buff or debuff affect's icon: its pick, else (unknown, or not recognised yet) the group's generic. */
export function affectStoneIcon(name: string, group: 'buff' | 'debuff'): IconName {
  const memo = AFFECT_MEMO[group];
  let icon = memo.get(name);
  if (icon === undefined) {
    icon = usable(AFFECT_STONE[name.trim().toLowerCase()]) ?? GENERIC_STONE[group];
    memo.set(name, icon);
  }
  return icon;
}

const HERB_BY_LOWER: ReadonlyMap<string, StonePick> = new Map(Object.entries(HERB_STONE).map(([k, p]) => [k.toLowerCase(), p]));

/** A herblore's icon in every phase: its pick by the catalogue key, else the generic herblore. */
export function herbStoneIcon(key: string | undefined): IconName {
  if (key === undefined) return GENERIC_STONE.herb;
  return usable(HERB_STONE[key] ?? HERB_BY_LOWER.get(key.toLowerCase())) ?? GENERIC_STONE.herb;
}

/** A GMCP flag stone's icon: its pick, else the generic flag. */
export function flagStoneIcon(flag: string): IconName {
  return usable(FLAG_STONE[flag]) ?? GENERIC_STONE.flag;
}

/** The affects whose picks wait for the owner to see them in the game (`confirmed: false`). */
export function unconfirmedAffects(): string[] {
  return Object.entries(AFFECT_STONE)
    .filter(([, p]) => p.confirmed === false)
    .map(([n]) => n);
}
