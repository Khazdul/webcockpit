// A shared run on a phone or tablet (stage 71, ADR 0160): the replay
// runtime (the exported HTML file and the watch page's frame) decides the
// device flags as the app does (`initDevice`) and, where the device is a
// phone or a tablet, plays the run in the phone's layout with the phone
// layer over it (`PlayerHostOptions.phone`), as the run log player does
// there (stage 55).
//
// The runtime is one IIFE (vite.config.ts `bundleReplayRuntime`): the
// dynamic import below is inlined into it, so the file and the frame stay
// self-contained (no chunk to fetch: the file may be opened from file://,
// and the frame's CSP allows only its own inline script). It is evaluated
// only on a phone or a tablet: a computer carries its bytes, but never
// runs it. The phone kit is the app's (src/app/phone-kit.ts); the look
// kit's controls are left out (the menu's settings page, which is never
// shown over a replay).

import { device, initDevice } from '../core/device';
import type { PlayerPhone } from '../app/player-host';

/** Decides the device flags for `win` (`<html>` gets `wc-touch` / `wc-phone`) and loads the phone layer where they say phone. */
export async function replayPhone(win: Window): Promise<PlayerPhone | undefined> {
  initDevice(win);
  if (!device().phone) return undefined;
  const [phone, kit] = await Promise.all([import('../phone'), import('../app/phone-kit')]);
  return { mount: (deps) => phone.mountPhoneLayer(deps), kit: kit.PHONE_KIT };
}
