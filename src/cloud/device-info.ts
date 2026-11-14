// The device type and browser family of a beat (ADR 0147), as the
// constants of shared/cloud/api.ts. Pure.

import type { Browser, DeviceType } from '../../shared/cloud/api.ts';
import type { DeviceFlags } from '../core/device';

/**
 * The device, not its mode (src/core/device.ts): a tablet is a tablet
 * (though it uses the phone's layout, ADR 0140), a phone is a phone also
 * in the browser's "Desktop site" mode (stage 55); everything else is a
 * desktop.
 */
export function deviceType(f: Pick<DeviceFlags, 'phone' | 'tablet' | 'desktopSite'>): DeviceType {
  if (f.tablet) return 'tablet';
  if (f.phone || f.desktopSite) return 'phone';
  return 'desktop';
}

/**
 * The browser family from the user agent. The order matters, since most
 * agents name the engines they are compatible with: Samsung Internet and
 * Edge say `Chrome` too, Chrome says `Safari`, and the iOS browsers (all
 * WebKit) say `Safari` with a mark of their own (`CriOS`, `FxiOS`,
 * `EdgiOS`). Opera, Yandex and the like are `other`; browsers that send
 * Chrome's agent unchanged (Brave, Vivaldi) cannot be told from it.
 */
export function browserFamily(ua: string): Browser {
  if (/SamsungBrowser\//.test(ua)) return 'samsung';
  if (/\b(?:Edg|EdgA|EdgiOS|Edge)\//.test(ua)) return 'edge';
  if (/\b(?:OPR|Opera|OPiOS|OPT|YaBrowser|UCBrowser)\//.test(ua)) return 'other';
  if (/\b(?:Firefox|FxiOS)\//.test(ua)) return 'firefox';
  if (/\b(?:Chrome|Chromium|CriOS)\//.test(ua)) return 'chrome';
  if (/\bSafari\//.test(ua) && /\b(?:Version|Mobile)\//.test(ua)) return 'safari';
  return 'other';
}
