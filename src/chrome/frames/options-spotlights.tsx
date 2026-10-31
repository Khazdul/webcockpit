// Options → Spotlights (Inv §3.8): which kinds of event feed the Spotlights
// reel and the Credits chronicle. Global (not per profile), saved to the
// settings store as each row flips.
//
//   ─── Spotlights ───
//      << [X] Achievements >>
//         [X] Deaths
//         [X] Level-ups
//         [X] PvP kills
//
//            Back

import type { VNode } from 'preact';
import { useServices, useSettings } from '../kit/hooks';
import { useKeys, useNav } from '../kit/stack';
import { type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';

/** The rows, in Cockpit's order. */
export const SPOTLIGHT_ROWS: ReadonlyArray<{ key: 'achievements' | 'deaths' | 'levelUps' | 'pvp'; label: string }> = [
  { key: 'achievements', label: 'Achievements' },
  { key: 'deaths', label: 'Deaths' },
  { key: 'levelUps', label: 'Level-ups' },
  { key: 'pvp', label: 'PvP kills' },
];

export function SpotlightsOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const items: MenuItem[] = [
    ...SPOTLIGHT_ROWS.map((r): MenuItem => {
      const flip = (): void =>
        settings.update((d) => {
          d.spotlights[r.key] = !d.spotlights[r.key];
        });
      return { key: r.key, glyph: s.spotlights[r.key] ? '[X]' : '[ ]', label: r.label, activate: flip };
    }),
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Spotlights" footer={['↑↓ Navigate', 'Enter Toggle', 'ESC Back']}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
    </Page>
  );
}
