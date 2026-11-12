// The keys' vibration (ADR 0138 §7; it was in 0.5.0, went in stage 52 and
// is back as a choice): one short pulse on the press of a key of our own
// keyboard, of the compass and of a hot key, while `phone.vibrate` is on.
// Only where the browser has `navigator.vibrate` (Android; not iOS
// Safari): elsewhere there is no pulse and the settings row is absent.
//
// - Called from a pointer's own handler only (a press the user made), never
//   from a timer: a held backspace's repeats do not pulse.
// - The browser needs the page to have been activated once (a tap that
//   ended, a key): the pulse of the very first touch of a visit may be
//   refused. A refusal returns false or throws; neither reaches the caller.
// - The length: 0.5.0 asked for 10 ms, which the owner's Galaxy S21 never
//   showed. Nothing in the way it was called explains that (it was called
//   in the press's own handler, in the top frame); what is known of such
//   phones is that a pulse shorter than the motor's start-up (some 20 to
//   30 ms) is asked for and not felt, and that Android gives no pulse at
//   all while the phone's touch vibration is off or it is in a silent or
//   Do not disturb mode. So the pulse is 30 ms now. Not verified on a
//   device.

/** The part of `navigator` used here. */
export interface VibrateSource {
  vibrate?: (pattern: number) => boolean;
}

/** The pulse's length, ms: long enough for a phone's motor to start, short enough for fast typing. */
export const TAP_PULSE_MS = 30;

export function canVibrate(nav: VibrateSource | null | undefined): boolean {
  return typeof nav?.vibrate === 'function';
}

/** One short pulse, where the browser can. Never throws. */
export function pulse(nav: VibrateSource | null | undefined): void {
  if (!canVibrate(nav)) return;
  try {
    nav!.vibrate!(TAP_PULSE_MS);
  } catch {
    // Refused (no user gesture yet, a policy): the press works without it.
  }
}
