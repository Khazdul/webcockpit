// Affects MUME puts on a character (Inv §2.6.5): the game lines that start,
// refresh and drop each one, its nominal duration and its type. Facts about
// the game, written in our own format (ADR 0017 "Game data").
//
// A line is the full text of one game line (matched exactly, after colour
// is stripped) or `{ prefix }` for the few lines that end in a variable part.
// One line may serve several affects: `Your energy wanes as your second wind
// fades.` drops *second wind* and starts *winded*; the comfortable lines
// move between *comfortable* and *very comfortable*. The trackers apply the
// drops of a line before its starts.
//
// `start` and `refresh` behave the same in the tracker (a start on an active
// affect refreshes it, a refresh on an inactive one starts it); they are kept
// apart because that is what the game means by them.

export type AffectType = 'spell' | 'buff' | 'debuff';

/** A game line: the exact full text, or the start of a longer line. */
export type GameLine = string | { prefix: string };

export interface AffectDef {
  type: AffectType;
  /** Nominal duration in seconds; absent = indefinite (no timer). */
  duration?: number;
  start?: readonly GameLine[];
  refresh?: readonly GameLine[];
  drop?: readonly GameLine[];
  /** Damage can end it early: shorter samples are not learned (Inv §2.6.5). */
  damageDroppable?: boolean;
}

const PALE_SURGE = 'You feel a pale surge of energy flow back into you.';

/** The known affects by name (the name is what `stat` lists and the pane shows). */
export const AFFECTS: Readonly<Record<string, AffectDef>> = {
  // ------------------------------------------------------------ spells
  sanctuary: {
    type: 'spell',
    duration: 270,
    start: ['You start glowing.'],
    refresh: ['Your aura glows more intensely.'],
    drop: ['The white aura around your body fades.'],
  },
  'breath of briskness': {
    type: 'spell',
    duration: 180,
    start: ['An energy begins to flow within your legs as your body becomes lighter.'],
    refresh: ['The energy in your legs is refreshed.'],
    drop: ['Your legs feel heavier.'],
  },
  shield: {
    type: 'spell',
    duration: 1560,
    start: ['You feel protected.'],
    refresh: ['Your protection is revitalised.'],
    drop: ['Your magical shield wears off.'],
  },
  armour: {
    type: 'spell',
    duration: 1100,
    damageDroppable: true,
    start: ['A blue transparent wall slowly appears around you.'],
    refresh: ['Your magic armour is revitalised.'],
    drop: ['You feel less protected.'],
  },
  strength: {
    type: 'spell',
    duration: 1560,
    start: ['You feel stronger.'],
    refresh: ['The duration of the strength spell has been improved.'],
    drop: ['You feel weaker.'],
  },
  'detect magic': {
    type: 'spell',
    duration: 2400,
    start: ['You become sensitive of magical auras.'],
    refresh: ['Your awareness of magical auras is renewed.'],
    drop: ['Your perception of magical auras wears off.'],
  },
  bless: {
    type: 'spell',
    duration: 480,
    start: ['You begin to feel the light of Aman shine upon you.'],
    refresh: ['You feel a renewed light shine upon you.'],
    drop: ['The light of Aman fades away from you.'],
  },
  'detect evil': {
    type: 'spell',
    duration: 3600,
    start: ['You feel aware of all that is foul and evil.'],
    refresh: ['Your awareness of evil is refreshed.'],
    drop: ['You sense the red in your vision disappear.'],
  },
  'sense life': {
    type: 'spell',
    duration: 3200,
    start: ['You feel your awareness improve.'],
    refresh: ['Your awareness is refreshed.'],
    drop: ['You feel less aware of your surroundings.'],
  },
  shroud: {
    type: 'spell',
    duration: 1600,
    damageDroppable: true,
    start: ['You are surrounded by a misty shroud.'],
    refresh: ['Your misty shroud is renewed.'],
    drop: ['You feel more exposed.'],
  },
  'night vision': {
    type: 'spell',
    duration: 2650,
    start: ['Your eyes tingle.'],
    refresh: ['Your night vision is refreshed.'],
    drop: ['Your vision blurs.'],
  },
  'protection from evil': {
    type: 'spell',
    duration: 1650,
    start: ['You have a righteous feeling!'],
    refresh: ['You feel a renewed righteousness.'],
    drop: ['You feel less righteous.'],
  },

  // ------------------------------------------------------------- buffs
  'second wind': {
    type: 'buff',
    duration: 60,
    start: ['You feel a surge of energy as you gain a second wind.'],
    drop: ['Your energy wanes as your second wind fades.'],
  },
  'Orkish draught': {
    type: 'buff',
    duration: 120,
    start: ['The draught burns down your throat, and a fiery feeling fills your limbs.'],
    drop: ['As the warmth of the draught recedes from your limbs, you feel less energetic.'],
  },
  'battle glory': {
    type: 'buff',
    duration: 170,
    start: ['Hearing the horn blow, you feel your urge to battle increase!'],
    drop: ['You feel your newfound strength leaving you again.'],
  },
  miruvor: {
    type: 'buff',
    duration: 180,
    start: ['You feel a pleasant warmth filling your limbs.'],
    drop: ['The warmth of the cordial slowly leaves your body.'],
  },
  growth: {
    // Seen only in `stat` / `info` (no known game lines).
    type: 'buff',
  },
  comfortable: {
    type: 'buff',
    start: ['You feel comfortable.'],
    refresh: ['You feel slightly less comfortable.'],
    drop: ['You no longer feel comfortable.', "You're starting to feel very comfortable."],
  },
  'very comfortable': {
    type: 'buff',
    start: ["You're starting to feel very comfortable."],
    drop: ['You no longer feel very comfortable.', 'You feel slightly less comfortable.'],
  },
  anger: {
    // No drop line: pruned at its expiry.
    type: 'buff',
    duration: 30,
    start: ['You are filled with anger!'],
  },
  'shadow-link': {
    type: 'buff',
    start: [{ prefix: 'Your focus sharpens as you share an enslaved shadow' }],
    refresh: [{ prefix: 'Your focus sharpens as you share a dreadful warg' }],
    drop: ['Your link to the wraith-world disappears.'],
  },
  antidote: {
    type: 'buff',
    duration: 540,
    start: ['A warm feeling runs through your body.'],
    drop: ['You feel a strange taste in your mouth.'],
  },
  'spectral health': {
    type: 'buff',
    start: ['A spectral energy courses through your veins.'],
    refresh: [{ prefix: 'You completely drain' }],
    drop: ['The spectral energy sustaining your health wanes.'],
  },
  'Blood of Sauron': {
    type: 'buff',
    duration: 660,
    start: ['You feel a surge of power.'],
    drop: ['The warm taste of blood in your mouth vanishes.'],
  },
  'a pitch-black robe (pale tones)': {
    type: 'buff',
    duration: 30,
    start: ['You feel energy building up as your robe glows a pale red.'],
    drop: [PALE_SURGE],
  },
  'a pure white robe (pale tones)': {
    type: 'buff',
    duration: 30,
    start: ['You feel energy building up as your robe glows a pale white.'],
    drop: [PALE_SURGE],
  },
  'heightened senses': {
    type: 'buff',
    duration: 270,
    start: ['You quaff the potion and a pounding fills your head, but it is soon replaced with calm, sharp focus.'],
    drop: ['Your new-found clarity fades and is replaced by a slight headache.'],
  },
  'dark aura': {
    type: 'buff',
    duration: 390,
    start: ['You are surrounded by a murky aura.'],
    drop: ['The dark aura surrounding you fades.'],
  },
  smothered: {
    type: 'buff',
    duration: 600,
    start: [{ prefix: 'Your lungs seem to burst as' }],
    drop: ['The grip on your lungs recedes.'],
  },
  'shadow-veil': {
    type: 'buff',
    duration: 5700,
    start: ["You feel your Master's strength join your own."],
    refresh: ["You feel your Master's strength refreshed."],
    drop: ["Your Master's strength leaves you."],
  },
  'haste (active)': {
    type: 'buff',
    duration: 360,
    start: ['As you drink the tea, your muscles begin to quiver and twitch.'],
    drop: ['You feel less hasty.'],
  },
  // Seen only in `stat` and the info poll's `%f` (no lines of their own,
  // stage 77 H9; notes/research/stone-icons/inventory.md): untimed.
  bloodlust: { type: 'buff' },
  'some pipe-weed': { type: 'buff' },
  // A herblore's draught as MUME lists it (which one is not said); no stone
  // while a herblore runs (character-stones.ts).
  potion: { type: 'buff' },

  // ----------------------------------------------------------- debuffs
  winded: {
    type: 'debuff',
    duration: 1380,
    start: ['Your energy wanes as your second wind fades.'],
    drop: ['You feel less winded.'],
  },
  blindness: {
    type: 'debuff',
    duration: 90,
    start: ['You have been blinded!'],
    drop: ['You feel a cloak of blindness dissolve.'],
  },
  lethargy: {
    type: 'debuff',
    duration: 330,
    start: ['You feel a sudden loss of energy as the power that once mingled with your own vanishes.'],
    drop: ['You feel your magic energy coming back to you.'],
  },
  tiredness: {
    type: 'debuff',
    duration: 330,
    start: ['You feel your muscles relax and your pulse slow as the strength that welled within you subsides.'],
    drop: ['You feel your muscles regain some of their former energy.'],
  },
  depression: {
    type: 'debuff',
    start: [
      'Alas, you realise that yet again the mighty knowledge of drowned Númenor has been lost... Despair settles on you.',
    ],
    drop: ['Your heart feels lighter.'],
  },
  haggardness: {
    type: 'debuff',
    duration: 330,
    start: ['You feel a sudden flash of dizziness causing you to pause before getting your directional bearings back.'],
    drop: ['You feel steadier now.'],
  },
  hunger: {
    type: 'debuff',
    start: ['You are hungry.'],
    drop: ['You are full.', 'You do not feel hungry anymore.'],
  },
  thirst: {
    type: 'debuff',
    start: ['You are thirsty.'],
    drop: ['You do not feel thirsty anymore.', 'You are not thirsty anymore.', 'You feel less thirsty.'],
  },
  'chill touch': {
    type: 'debuff',
    start: ['An icy gust of wind makes you shiver with cold.'],
    drop: ['You feel warmer.'],
  },
  'heavy burden': {
    type: 'debuff',
    start: ['Your burden is really heavy.'],
    refresh: ['Your burden is sheer torture.'],
    drop: ['Your load feels light.', 'Your burden is no longer all that heavy.'],
  },
  torpor: {
    type: 'debuff',
    duration: 780,
    start: ['As you remove the amulet, a cloud descends over your mind.'],
    drop: ['You feel much better now.'],
  },
  'heightened senses (faded)': {
    type: 'debuff',
    duration: 1470,
    start: ['Your new-found clarity fades and is replaced by a slight headache.'],
    drop: ['The prickly feeling behind your eyes dissipates.'],
  },
  'dark aura (faded)': {
    type: 'debuff',
    duration: 1560,
    start: ['The dark aura surrounding you fades.'],
    drop: ['The last vestiges of darkness surrounding you dissipates.'],
  },
  dreaming: {
    type: 'debuff',
    duration: 1260,
    start: [
      'As you drink from the murky river, a wave of exhaustion sweeps over you and you are cast into a deep sleep.',
    ],
    drop: [
      'A deep fog recedes from your sleep, and you feel once again able to wake.',
      'The visions end abruptly and your mind reels from the shock.',
    ],
  },
  blindfolded: {
    type: 'debuff',
    duration: 300,
    start: ['Tethel gently ties a blindfold over your eyes.'],
    drop: ['Tethel removes your blindfold and helps you disembark.'],
  },
  'haste (recovery)': {
    type: 'debuff',
    duration: 1080,
    start: ['You feel less hasty.'],
    drop: ['Your muscles feel normal again.'],
  },
  // Seen only in `stat` and `%f` (stage 77 H9): untimed. Panic and sunlight
  // have candidate lines in the inventory, not yet confirmed in the game.
  panic: { type: 'debuff' },
  sunlight: { type: 'debuff' },
  'unable to quit': { type: 'debuff' },
  'unable to void': { type: 'debuff' },
  'unable to sneak': { type: 'debuff' },
};

/**
 * The group of an affect a list names that is not in the table: a stone
 * with the group's generic icon (stage 77 H9, ADR 0166 addendum 31). A
 * debuff: what is on you and not known is worth seeing, and the debuffs
 * stay before the buffs when the stones overflow.
 */
export const UNLISTED_TYPE: AffectType = 'debuff';

/**
 * A list's lines that are not affects of their own: a GMCP flag's `stat`
 * form (`poison (type: poison)`, `a light wound at the right arm (clean)`),
 * which the flag's stone already shows.
 */
export function isFlagForm(name: string): boolean {
  return /^poison\b/i.test(name) || / wound at /i.test(name);
}

/** An affect name as `stat` might print it → the table's name (case-insensitive). */
const BY_LOWER: ReadonlyMap<string, string> = new Map(Object.keys(AFFECTS).map((n) => [n.toLowerCase(), n]));

/** The table name of an affect, or undefined when unknown. */
export function affectName(name: string): string | undefined {
  return BY_LOWER.get(name.trim().toLowerCase());
}

/** True when the affect has a game line of its own (a start, refresh or drop). */
export function hasLines(def: AffectDef): boolean {
  return (def.start?.length ?? 0) + (def.refresh?.length ?? 0) + (def.drop?.length ?? 0) > 0;
}

/** True when the affect has at least one drop line (the drop line is the normal expiry). */
export function hasDropLine(def: AffectDef): boolean {
  return (def.drop?.length ?? 0) > 0;
}
