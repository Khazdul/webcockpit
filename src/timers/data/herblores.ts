// The herblore catalogue (Inv §2.6.10): each herblore is a fixed sequence of
// phases, each a buff or a debuff with its own length. Facts about the game,
// in our own format (ADR 0017). The order is the Herblores `+` menu's order.

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
