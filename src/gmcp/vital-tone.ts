// The tone of a vital (ADR 0122, stage 80 §7): the Group pane's bars and the
// map tokens' HP arc ask this one function, so their thresholds cannot
// drift. Orange at 45 % and below, red at 25 % and below; an unknown value
// keeps the base colour. Pure TS (the map worker imports it).

export type VitalTone = 'ok' | 'low' | 'critical';

/** At or below this fraction a vital is low (orange). */
export const VITAL_LOW = 0.45;
/** At or below this fraction a vital is critical (red). */
export const VITAL_CRITICAL = 0.25;

/** The tone of a vital at `pct` (0–1), or `ok` when unknown. */
export function vitalTone(pct: number | null): VitalTone {
  if (pct !== null && pct <= VITAL_CRITICAL) return 'critical';
  if (pct !== null && pct <= VITAL_LOW) return 'low';
  return 'ok';
}
