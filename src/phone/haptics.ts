// The keys' vibration (ADR 0136 §7): a short pulse on a compass or hot key
// tap that sends. Only where the browser has `navigator.vibrate` (Android;
// not iOS Safari): elsewhere there is no pulse and the settings row is
// absent.

/** The part of `navigator` used here. */
export interface VibrateSource {
  vibrate?: (pattern: number) => boolean;
}

/** The pulse's length, ms: felt, not heard. */
export const TAP_PULSE_MS = 10;

export function canVibrate(nav: VibrateSource | undefined): boolean {
  return typeof nav?.vibrate === 'function';
}

/** One short pulse, where the browser can. Never throws. */
export function pulse(nav: VibrateSource | undefined): void {
  if (!canVibrate(nav)) return;
  try {
    nav!.vibrate!(TAP_PULSE_MS);
  } catch {
    // Refused (no user gesture yet, a policy): the tap works without it.
  }
}
