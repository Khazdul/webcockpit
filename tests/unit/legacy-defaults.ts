// The defaults before ADR 0078 (new-user defaults), for tests written
// against them: one right-dock lane with Character and the four shared
// panes (ADR 0023), the map's auto float, DejaVu Sans Mono 15, bold as
// weight only, every built-in pane framed and no script pane entries.
import { DEFAULT_PANE_DESIRED, DEFAULT_SIDE_DOCK_SIZE, DOCKED_BY_DEFAULT, EVEN_SHARE_DESIRED, type LayoutModel, PANE_IDS, defaultMapFloat } from '../../src/layout/types';
import { type Settings, defaultSettings } from '../../src/settings/types';

/** The default layout before ADR 0078. */
export function legacyLayout(): LayoutModel {
  return {
    docks: {
      left: { lanes: [], head: [], tail: [] },
      right: {
        lanes: [
          {
            size: DEFAULT_SIDE_DOCK_SIZE,
            panes: DOCKED_BY_DEFAULT.map((id) => ({
              id,
              desired: id === 'character' ? DEFAULT_PANE_DESIRED.character : EVEN_SHARE_DESIRED,
            })),
          },
        ],
        head: [],
        tail: [],
      },
      top: { lanes: [], head: [], tail: [] },
      bottom: { lanes: [], head: [], tail: [] },
    },
    floating: [defaultMapFloat()],
  };
}

/** The default settings before ADR 0078. */
export function legacySettings(): Settings {
  const s = defaultSettings();
  s.appearance = { ...s.appearance, font: 'dejavu', size: 15, boldBright: false };
  const panes = {} as Settings['panes'];
  for (const id of PANE_IDS) panes[id] = { ...s.panes[id], border: true };
  s.panes = panes;
  s.layout = legacyLayout();
  return s;
}
