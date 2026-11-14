// The device type and browser family of a beat (ADR 0147), as the
// constants of shared/cloud/api.ts, and the label of an account's session
// ("Firefox on Linux", stage 60). Pure.

import { type Browser, type DeviceType, LABEL_MAX_LENGTH } from '../../shared/cloud/api.ts';
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

const BROWSER_NAMES: Record<Browser, string> = {
  firefox: 'Firefox',
  chrome: 'Chrome',
  safari: 'Safari',
  edge: 'Edge',
  samsung: 'Samsung Internet',
  other: 'Browser',
};

/**
 * The operating system from the user agent, or null. Android before Linux
 * (its agents say both); an iPad that asks for the desktop site says it is
 * a Mac and is taken for one.
 */
export function osName(ua: string): string | null {
  if (/\bAndroid\b/.test(ua)) return 'Android';
  if (/\b(?:iPhone|iPad|iPod)\b/.test(ua)) return 'iOS';
  if (/\bWindows\b/.test(ua)) return 'Windows';
  if (/\bCrOS\b/.test(ua)) return 'ChromeOS';
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return 'macOS';
  if (/\bLinux\b|\bX11\b/.test(ua)) return 'Linux';
  return null;
}

/**
 * A session's label as the server keeps it (worker/accounts.ts `labelOf`):
 * what is printable ASCII of `text`, trimmed and cut to
 * `LABEL_MAX_LENGTH`. Also what the client does to a label that came from
 * the server before a page gets it (it is still text, never markup).
 */
export function cleanLabel(text: string): string {
  return text
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, LABEL_MAX_LENGTH)
    .trim();
}

/** What this device is called in the account's list of sessions: "Firefox on Linux", or the browser alone. */
export function deviceLabel(ua: string): string {
  const browser = BROWSER_NAMES[browserFamily(ua)];
  const os = osName(ua);
  return cleanLabel(os ? `${browser} on ${os}` : browser);
}
