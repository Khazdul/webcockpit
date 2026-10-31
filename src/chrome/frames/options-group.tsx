// Options → Panes → Group (Inv §2.3 "Display options"; ADR 0016 P1).
//
//   ─── Group ───
//      << [X] Show players >>
//      << NPC visibility: Labeled >>
//
//      << Back >>
//          ↑↓ Move · ←→ Adjust · Enter Toggle · ESC Back
//
// Written to the settings store at once; the Group pane follows live
// (display-only filter over the canonical member set). The labels are
// shared with the Group gear popup (../pane-options-model.ts).

import type { VNode } from 'preact';
import { GROUP_NPC_MODES } from '../../settings';
import { useServices, useSettings } from '../kit/hooks';
import { cycle } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';
import { NPC_MODE_LABEL } from '../pane-options-model';

export { NPC_MODE_LABEL } from '../pane-options-model';

export function GroupOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const g = s.group;
  const togglePlayers = (): void => settings.update({ group: { showPlayers: !g.showPlayers } });
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
      adjust: (d) => settings.update({ group: { npcMode: cycle(GROUP_NPC_MODES, g.npcMode, d) } }),
    },
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
