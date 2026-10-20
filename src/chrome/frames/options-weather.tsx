// Options → Weather effects (stage 28 trial, ADR 0091): decorative weather
// over the whole client, driven by GMCP. The master switch loads or unloads
// the engine at once (src/weather/hook.ts); the categories fade their
// effects in or out live. Global, saved as each row flips.
//
//   ─── Weather effects ───
//      [ ] Weather effects
//
//      [X] Sky
//      [X] Blue day sky
//      [X] Precipitation
//      [X] Lightning
//      [X] Fog
//      [X] Darkness
//      [X] Body
//
//            Back
//
//   Clouds, sun, moon and stars over the client.      ← help for the row

import type { VNode } from 'preact';
import { WEATHER_CATEGORIES, type WeatherSettings } from '../../settings';
import { weatherAvailable } from '../../weather/support';
import { useServices, useSettings } from '../kit/hooks';
import { useKeys, useNav } from '../kit/stack';
import { Blank, Centered, type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';

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

const DAY_SKY_HELP = 'The blue sky by day. Off: the page background; clouds, sun and night sky stay.';
const MASTER_HELP = 'Decoration only; text and keys are never slowed.';
const UNSUPPORTED = 'Not supported in this browser (needs OffscreenCanvas).';

export function WeatherOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const w = s.weather;
  const flip = (k: keyof WeatherSettings): void =>
    settings.update((d) => {
      d.weather[k] = !d.weather[k];
    });
  const items: Array<MenuItem & { help?: string }> = [
    {
      key: 'enabled',
      glyph: w.enabled ? '[X]' : '[ ]',
      label: 'Weather effects',
      activate: () => flip('enabled'),
      adjust: () => flip('enabled'),
      help: weatherAvailable() ? MASTER_HELP : UNSUPPORTED,
    },
    { key: 'sp0', spacer: true },
    ...WEATHER_ROWS.flatMap((r): Array<MenuItem & { help: string }> => {
      const row = {
        key: r.key,
        glyph: w[r.key] ? '[X]' : '[ ]',
        label: r.label,
        dim: !w.enabled,
        activate: () => flip(r.key),
        adjust: () => flip(r.key),
        help: r.help,
      };
      if (r.key !== 'sky') return [row];
      // The blue day sky on its own, under Sky (owner feedback 36).
      return [
        row,
        {
          key: 'daySky',
          glyph: w.daySky ? '[X]' : '[ ]',
          label: 'Blue day sky',
          dim: !w.enabled || !w.sky,
          activate: () => flip('daySky'),
          adjust: () => flip('daySky'),
          help: DAY_SKY_HELP,
        },
      ];
    }),
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  const help = items[cursor]?.help ?? '';
  return (
    <Page title="Weather effects" footer={['↑↓ Navigate', 'Enter Toggle', 'ESC Back']}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      <Blank />
      <Centered text={help} class="wc-c-hint wc-weather-help" />
    </Page>
  );
}
