// The herblore catalogue (Inv §2.6.10): each herblore is a fixed sequence of
// phases, each a buff or a debuff with its own length. Facts about the game,
// in our own format (ADR 0017). The order is the Herblores `+` menu's order.
//
// The guide's times are MUME hours, a real minute each (Clearthought's 2, 4
// and 6 hours are 120, 240 and 360 s). Seeing, Shadows, Skillful oil,
// Soothing draught, Strength and Orc balm come from the player-written
// herblore guide alone (stage 77 H9, ADR 0166 addendum 31): no game line is
// known for them, so they are started by hand, as the others.

export interface HerbPhase {
  name: string;
  /** Seconds. */
  duration: number;
  type: 'buff' | 'debuff';
}

export interface HerbDef {
  /** Stable key (saved state, the pane's add/remove). */
  key: string;
  /** Display name in the Herblores `+` menu. */
  name: string;
  phases: readonly HerbPhase[];
}

export const HERBLORES: readonly HerbDef[] = [
  {
    key: 'Healing',
    name: 'Healing',
    phases: [
      { name: 'Healing', duration: 3600, type: 'buff' },
      { name: 'Healing (low)', duration: 3600, type: 'buff' },
    ],
  },
  {
    key: 'Travelling',
    name: 'Travelling',
    phases: [
      { name: 'Travelling', duration: 7200, type: 'buff' },
      { name: 'Travelling (med)', duration: 1440, type: 'buff' },
      { name: 'Travelling (min)', duration: 1440, type: 'buff' },
    ],
  },
  {
    key: 'Clearthought',
    name: 'Clearthought',
    phases: [
      { name: 'Clearthought', duration: 120, type: 'buff' },
      { name: 'Clearthought (low)', duration: 240, type: 'buff' },
      { name: 'Clearthought (neg)', duration: 360, type: 'debuff' },
    ],
  },
  {
    key: 'Walking',
    name: 'Walking',
    phases: [
      { name: 'Walking', duration: 1440, type: 'buff' },
      { name: 'Walking (med)', duration: 7200, type: 'buff' },
      { name: 'Walking (min)', duration: 1440, type: 'buff' },
    ],
  },
  {
    key: 'Haste',
    name: 'Haste',
    phases: [
      { name: 'Haste', duration: 360, type: 'buff' },
      { name: 'Haste (recovery)', duration: 1080, type: 'debuff' },
    ],
  },
  {
    key: 'DarkAura',
    name: 'Dark aura',
    phases: [
      { name: 'Dark aura', duration: 210, type: 'buff' },
      { name: 'Dark aura (faded)', duration: 3600, type: 'debuff' },
    ],
  },
  {
    // Night vision; perception +3, +2, +1 (constitution −1 in the first two).
    key: 'Seeing',
    name: 'Seeing',
    phases: [
      { name: 'Seeing', duration: 600, type: 'buff' },
      { name: 'Seeing (med)', duration: 900, type: 'buff' },
      { name: 'Seeing (min)', duration: 2400, type: 'buff' },
    ],
  },
  {
    // Shroud; perception −3 and willpower −1, then DB +2, then DB +1 (perception −2, −1).
    key: 'Shadows',
    name: 'Shadows',
    phases: [
      { name: 'Shadows (neg)', duration: 600, type: 'debuff' },
      { name: 'Shadows', duration: 3600, type: 'buff' },
      { name: 'Shadows (low)', duration: 1800, type: 'buff' },
    ],
  },
  {
    // OB and DB +5, then OB −5 and DB −10.
    key: 'SkillfulOil',
    name: 'Skillful oil',
    phases: [
      { name: 'Skillful oil', duration: 480, type: 'buff' },
      { name: 'Skillful oil (neg)', duration: 240, type: 'debuff' },
    ],
  },
  {
    // HP regeneration +15 and constitution +2, then +5 and dexterity −2.
    key: 'SoothingDraught',
    name: 'Soothing draught',
    phases: [
      { name: 'Soothing draught', duration: 240, type: 'buff' },
      { name: 'Soothing draught (low)', duration: 300, type: 'buff' },
    ],
  },
  {
    // Strength +2.
    key: 'Strength',
    name: 'Strength',
    phases: [{ name: 'Strength', duration: 7200, type: 'buff' }],
  },
  {
    // HP regeneration +16, +8, +4; mana regeneration −6, −3, −1.
    key: 'OrcBalm',
    name: 'Orc balm',
    phases: [
      { name: 'Orc balm', duration: 180, type: 'buff' },
      { name: 'Orc balm (med)', duration: 360, type: 'buff' },
      { name: 'Orc balm (min)', duration: 180, type: 'buff' },
    ],
  },
];

const BY_KEY: ReadonlyMap<string, HerbDef> = new Map(HERBLORES.map((h) => [h.key, h]));

export function herbDef(key: string): HerbDef | undefined {
  return BY_KEY.get(key);
}

/** The phase running at `now` for a herblore started at `startedAt` (ms). */
export interface HerbPhaseAt {
  index: number;
  phase: HerbPhase;
  /** Phase start and end, ms. */
  startedAt: number;
  expiresAt: number;
}

/**
 * Which phase of `def` runs at `now` for a start at `startedAt` (all ms), or
 * null when every phase has elapsed. The single source of truth for the
 * live tick and the restore.
 */
export function herbPhaseAt(def: HerbDef, startedAt: number, now: number): HerbPhaseAt | null {
  let t = startedAt;
  for (let i = 0; i < def.phases.length; i++) {
    const phase = def.phases[i]!;
    const end = t + phase.duration * 1000;
    if (now < end) return { index: i, phase, startedAt: t, expiresAt: end };
    t = end;
  }
  return null;
}
