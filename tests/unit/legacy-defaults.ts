// The defaults before ADR 0078 (new-user defaults), for tests written
// against them: one right-dock lane with Character and the four shared
// panes (ADR 0023), the map's auto float, DejaVu Sans Mono 15, bold as
// weight only, every built-in pane framed and no script pane entries.
import {
  DEFAULT_PANE_DESIRED,
  DEFAULT_SIDE_DOCK_SIZE,
  DOCKED_BY_DEFAULT,
  EVEN_SHARE_DESIRED,
  type LayoutModel,
  PANEBAR_PANE,
  PANE_IDS,
  defaultMapFloat,
  defaultMapSearchFloat,
} from '../../src/layout/types';
import { LEGACY_MAPPER, type Settings, defaultSettings } from '../../src/settings/types';

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
  const s = adr0078Settings();
  s.appearance = { ...s.appearance, font: 'dejavu', size: 15, boldBright: false };
  const panes = {} as Settings['panes'];
  for (const id of PANE_IDS) panes[id] = { ...s.panes[id], border: true };
  s.panes = panes;
  s.layout = legacyLayout();
  return s;
}

// The defaults of ADR 0078 (before ADR 0092), for tests written against
// them: Character over Group | Timers (20 cells each), then Comm, UI and
// the pane bar; the map and the Map search pane floating at the game
// pane's top-right corner; every built-in pane on, the weather off and
// the MMapper tileset on the default dark grey.

/** `DEFAULT_SHARE` of ADR 0078. */
export const ADR0078_SHARE = { lanes: 81, comm: 211, ui: 31 } as const;
/** `DEFAULT_LANE_SIZE` of ADR 0078: 40 cells in all. */
export const ADR0078_LANE_SIZE = 20;

/** The default layout of ADR 0078. */
export function adr0078Layout(): LayoutModel {
  return {
    docks: {
      left: { lanes: [], head: [], tail: [] },
      right: {
        lanes: [
          { size: ADR0078_LANE_SIZE, panes: [{ id: 'group', desired: ADR0078_SHARE.lanes }] },
          { size: ADR0078_LANE_SIZE, panes: [{ id: 'timers', desired: ADR0078_SHARE.lanes }] },
        ],
        head: [{ id: 'character', desired: DEFAULT_PANE_DESIRED.character }],
        tail: [
          { id: 'comm', desired: ADR0078_SHARE.comm },
          { id: 'ui', desired: ADR0078_SHARE.ui },
          { id: PANEBAR_PANE, desired: 1 },
        ],
      },
      top: { lanes: [], head: [], tail: [] },
      bottom: { lanes: [], head: [], tail: [] },
    },
    floating: [defaultMapFloat(), defaultMapSearchFloat()],
  };
}

/** The default settings of ADR 0078. */
export function adr0078Settings(): Settings {
  const s = defaultSettings();
  s.panes.character = { ...s.panes.character, on: true };
  s.panes.ui = { ...s.panes.ui, on: true };
  s.weather = { ...s.weather, enabled: false };
  s.mapper = { ...s.mapper, ...LEGACY_MAPPER };
  s.layout = adr0078Layout();
  return s;
}
