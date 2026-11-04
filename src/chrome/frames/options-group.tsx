// Options → Panes → Group (Inv §2.3 "Display options"; ADR 0016 P1,
// ADR 0122).
//
//   ─── Group ───
//      << [X] Show players >>
//      << NPC visibility: Labeled >>
//      << Away members: Room name >>
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
// steps through Auto and the twelve picker colours (`colorCycle`); a free
// colour set in the gear popup stays in the cycle while it is chosen.

import type { VNode } from 'preact';
import { PICKER_COLORS } from '../../panes/palette';
import { type ColorSetting, GROUP_AWAY_MODES, GROUP_NPC_MODES } from '../../settings';
import { useServices, useSettings } from '../kit/hooks';
import { cycle } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';
import { AWAY_MODE_LABEL, NPC_MODE_LABEL, VITAL_COLOR_ROWS, setVitalColor } from '../pane-options-model';

export { NPC_MODE_LABEL } from '../pane-options-model';

/** Auto, then the picker colours; a free colour (not in the list) after Auto. */
export function colorCycle(current: ColorSetting): ColorSetting[] {
  const list: ColorSetting[] = ['auto', ...PICKER_COLORS.map((c) => c.hex)];
  if (current !== 'auto' && !list.some((c) => c.toLowerCase() === current.toLowerCase())) list.splice(1, 0, current);
  return list;
}

/** A colour setting's name on the TUI page: Auto, a picker colour's name, or the hex. */
export function colorName(c: ColorSetting): string {
  if (c === 'auto') return 'Auto';
  return PICKER_COLORS.find((p) => p.hex.toLowerCase() === c.toLowerCase())?.label ?? c.toLowerCase();
}

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
    {
      key: 'away',
      label: `Away members: ${AWAY_MODE_LABEL[g.away]}`,
      adjust: (d) => settings.update({ group: { away: cycle(GROUP_AWAY_MODES, g.away, d) } }),
    },
    ...VITAL_COLOR_ROWS.map(
      (r): MenuItem => ({
        key: `color-${r.key}`,
        label: `${r.label} colour: ${colorName(g.colors[r.key])}`,
        adjust: (d) => {
          const cur = g.colors[r.key];
          const list = colorCycle(cur);
          const at = list.findIndex((c) => c.toLowerCase() === cur.toLowerCase());
          setVitalColor(settings, r.key, list[(at + d + list.length) % list.length]!);
        },
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
