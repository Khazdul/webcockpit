// Weather effects (stage 28 trial, ADR 0091): the rows and help texts of the
// Settings popup's Weather effects tab (popups/settings-popup.tsx).
// Decorative weather over the whole client, driven by GMCP: the master
// switch loads or unloads the engine at once (src/weather/hook.ts); the
// categories fade their effects in or out live. No UI here.

import type { WEATHER_CATEGORIES } from '../settings';

type Category = (typeof WEATHER_CATEGORIES)[number];

/** Row labels and their one-line help, in the page's order. */
export const WEATHER_ROWS: ReadonlyArray<{ key: Category; label: string; help: string }> = [
  { key: 'sky', label: 'Sky', help: 'Sky, clouds, sunrise and sunset, moon and stars outdoors.' },
  { key: 'precipitation', label: 'Precipitation', help: 'Rain with drips along the panes; snow that builds up.' },
  { key: 'lightning', label: 'Lightning', help: 'A bolt when the game reports a lightning flash.' },
  { key: 'fog', label: 'Fog', help: 'Light or dense fog drifting low over the screen.' },
  { key: 'darkness', label: 'Darkness', help: 'A red bleed when a darkness spell spreads, a lift when it fades.' },
  { key: 'body', label: 'Body', help: 'Sleeping, stunned, incapacitated and dying.' },
];

export const DAY_SKY_HELP = 'The blue sky by day. Off: the page background; clouds, sun and night sky stay.';
export const MASTER_HELP = 'Decoration only; text and keys are never slowed.';
export const WEATHER_UNSUPPORTED = 'Not supported in this browser (needs OffscreenCanvas).';
