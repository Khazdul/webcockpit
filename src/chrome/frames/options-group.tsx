// Options → Panes → Group (Inv §2.3 "Display options"; ADR 0016 P1,
// ADR 0122).
//
//   ─── Group ───
//      << [X] Show players >>
//      << NPC visibility: Labeled >>
//      << Away members: Room name >>
//      << [X] Fight card >>
//      << HP colour: Auto >>
//      << Mana colour: Auto >>
//      << Moves colour: Auto >>
//
//      << Back >>
//          ↑↓ Move · ←→ Adjust · Enter Toggle · ESC Back
//
// Written to the settings store at once; the Group pane follows live
// (display-only filter over the canonical member set). The labels are
// shared with the Group gear popup (../pane-options-model.ts). A colour
// steps through Auto and the twelve picker colours (`stepColor`); a free
// colour set in the gear popup stays in the cycle while it is chosen.

import type { VNode } from 'preact';
import { GROUP_AWAY_MODES, GROUP_NPC_MODES } from '../../settings';
import { useServices, useSettings } from '../kit/hooks';
import { cycle } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';
import { AWAY_MODE_LABEL, NPC_MODE_LABEL, VITAL_COLOR_ROWS, colorName, setGroup, setVitalColor, stepColor } from '../pane-options-model';

export { NPC_MODE_LABEL } from '../pane-options-model';

export function GroupOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const g = s.group;
  const togglePlayers = (): void => setGroup(settings, { showPlayers: !g.showPlayers });
  const toggleFight = (): void => setGroup(settings, { fight: !g.fight });
  const items: MenuItem[] = [
    {
      key: 'players',
      glyph: g.showPlayers ? '[X]' : '[ ]',
      label: 'Show players',
      activate: togglePlayers,
      adjust: togglePlayers,
    },
    {
      key: 'npc',
      label: `NPC visibility: ${NPC_MODE_LABEL[g.npcMode]}`,
      adjust: (d) => setGroup(settings, { npcMode: cycle(GROUP_NPC_MODES, g.npcMode, d) }),
    },
    {
      key: 'away',
      label: `Away members: ${AWAY_MODE_LABEL[g.away]}`,
      adjust: (d) => setGroup(settings, { away: cycle(GROUP_AWAY_MODES, g.away, d) }),
    },
    {
      key: 'fight',
      glyph: g.fight ? '[X]' : '[ ]',
      label: 'Fight card',
      activate: toggleFight,
      adjust: toggleFight,
    },
    ...VITAL_COLOR_ROWS.map(
      (r): MenuItem => ({
        key: `color-${r.key}`,
        label: `${r.label} colour: ${colorName(g.colors[r.key])}`,
        adjust: (d) => setVitalColor(settings, r.key, stepColor(g.colors[r.key], d)),
      }),
    ),
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Group" footer={['↑↓ Move', '←→ Adjust', 'Enter Toggle', 'ESC Back']}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
    </Page>
  );
}
