// Options → Mapper (ADR 0020 "Map files and storage").
//
//   ─── Mapper ───
//        Map       arda.mm2 (bundled)          or the imported file:
//                                              Map  my.mm2 · Rooms 30 074
//                                              Size 5.8 MB · Imported <date>
//
//      << [X] Show map pane >>
//      << Room notes: On >>
//      << Room info on hover: Full >>
//      << Hover text size: Medium >>
//      << Tileset: MMapper >>
//      << Background colour: Default >>
//      << Import map file… >>
//      << Use bundled map >>
//
//      << Back >>
//
//               MMapper's default tiles                (credit of the set)
//          ↑↓ Move · ←→ Adjust · Enter Select · ESC Back
//
// Import reads a `.mm2` (a hidden file input), checks it in the map tools
// worker (MapStore.importFile; the page never parses a map on the main
// thread) and stores it in IndexedDB; a running Map pane reloads. A bad
// file flashes the reason and the old map stays. "Use bundled map"
// deletes the import. The Map pane's on/off is the same setting as its
// row in the Panes popup (and Options → Panes → Appearance on a phone).
// The logic is shared with the Settings popup's Mapper tab
// (../mapper-model.ts, ADR 0107).
//
// Room notes (ADR 0077, `mapper.notes`, default On): the map file's note
// for the located room after its exits line in the game window. Room info
// on hover (`mapper.hover`: Off / Minimal / Full, default Full, ADR 0080): no
// hover box, the room name and note, or MMapper's room preview (name,
// description, contents, exits, note). Hover text size (`mapper.hoverSize`:
// Small / Medium / Large = 0.72 / 0.85 / 1 of the cockpit's font size,
// default Medium). Tileset (`mapper.tileset`, ADR 0082): ←→ cycles the
// catalogue (src/map/tilesets.ts); the line under the menu credits the
// set, and an alternating set names the season it draws now (the saved
// game clock, as the Map pane resolves it). A set drawn for a light map
// (Gefe & Rik, Gray's Map) switches the background colour to its own and
// leaving it restores the user's (`chooseTileset`, ADR 0088). Background colour
// (`mapper.background`, ADR 0085 and its addenda): ←→ cycles the named
// colours of src/map/backgrounds.ts (Default first, Transparent last),
// Enter steps forward like the other cyclers. The Map pane draws the
// colour at once.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { mapBgName } from '../../map/backgrounds';
import type { CurrentMap } from '../../map/store';
import { chooseTileset, TILESET_IDS, tilesetChoice } from '../../map/tilesets';
import { MAP_HOVER_MODES, MAP_HOVER_SIZES } from '../../settings';
import {
  BUNDLED_MAP,
  MAP_BG_HEXES,
  currentMap,
  importMapFile,
  mapBgChoice,
  mapInfoRows,
  tilesetCreditNow,
  useBundledMap,
} from '../mapper-model';
import { useGrid, useServices, useSettings } from '../kit/hooks';
import { centreLeft, cycle } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Centered,
  FlashRow,
  Line,
  type MenuItem,
  MenuRows,
  Page,
  menuKey,
  useMenuCursor,
} from '../kit/widgets';

// The helpers live in ../mapper-model.ts (shared with the Settings popup's
// Mapper tab, ADR 0107); re-exported for the page's callers.
export { fmtBytes, fmtCount, fmtDate, mapInfoRows, tilesetCredit } from '../mapper-model';

const LABEL_W = 10;

export function MapperOptionsFrame(): VNode {
  const { settings, maps } = useServices();
  const s = useSettings();
  const nav = useNav();
  const { cols } = useGrid();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [cur, setCur] = useState<CurrentMap | null>(null);

  const refresh = async (): Promise<void> => {
    if (maps) setCur(await currentMap(maps));
  };
  useEffect(() => {
    void refresh();
    return maps?.subscribe(() => void refresh());
  }, [maps]);

  const on = s.panes.map.on;
  const toggle = (): void => settings.update({ panes: { map: { on: !on } } });
  const mapper = s.mapper;
  const toggleNotes = (): void => settings.update({ mapper: { notes: !mapper.notes } });
  const hoverLabel = mapper.hover === 'full' ? 'Full' : mapper.hover === 'off' ? 'Off' : 'Minimal';
  const tileset = tilesetChoice(mapper.tileset);
  const credit = tilesetCreditNow(mapper.tileset);
  const sizeLabel = mapper.hoverSize === 'small' ? 'Small' : mapper.hoverSize === 'large' ? 'Large' : 'Medium';
  // Background (ADR 0085): migration keeps only named colours; anything else reads as Default.
  const bg = mapBgChoice(mapper.background);

  const run = async (f: () => Promise<void>): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      await f();
    } finally {
      busy.current = false;
    }
  };

  const onFile = (): Promise<void> =>
    run(async () => {
      const input = fileRef.current;
      const file = input?.files?.[0];
      if (!input || !file) return;
      input.value = '';
      await importMapFile(maps, file, (t, k) => nav.flash(t, k));
    });

  const useBundled = (): Promise<void> => run(() => useBundledMap(maps, cur, (t) => nav.flash(t)));

  const items: MenuItem[] = [
    { key: 'on', glyph: on ? '[X]' : '[ ]', label: 'Show map pane', activate: toggle, adjust: toggle },
    { key: 'notes', label: `Room notes: ${mapper.notes ? 'On' : 'Off'}`, adjust: toggleNotes },
    {
      key: 'hover',
      label: `Room info on hover: ${hoverLabel}`,
      adjust: (d) => settings.update({ mapper: { hover: cycle(MAP_HOVER_MODES, mapper.hover, d) } }),
    },
    {
      key: 'hoverSize',
      label: `Hover text size: ${sizeLabel}`,
      adjust: (d) => settings.update({ mapper: { hoverSize: cycle(MAP_HOVER_SIZES, mapper.hoverSize, d) } }),
    },
    {
      key: 'tileset',
      label: `Tileset: ${tileset.name}`,
      adjust: (d) => settings.update({ mapper: chooseTileset(mapper, cycle(TILESET_IDS, tileset.id, d)) }),
    },
    {
      key: 'background',
      label: `Background colour: ${mapBgName(bg)}`,
      adjust: (d) => settings.update({ mapper: { background: cycle(MAP_BG_HEXES, bg, d) } }),
    },
    {
      key: 'import',
      label: 'Import map file…',
      activate: () => {
        if (!maps) return nav.flash('Map import is not available here.', 'fail');
        fileRef.current?.click();
      },
    },
    { key: 'bundled', label: 'Use bundled map', disabled: cur?.kind !== 'imported', activate: () => void useBundled() },
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));

  const rows = mapInfoRows(maps ? cur : BUNDLED_MAP);
  const w = LABEL_W + Math.max(...rows.map(([, v]) => v.length));
  const at = centreLeft(cols, w);
  return (
    <Page title="Mapper" footer={['↑↓ Move', '←→ Adjust', 'Enter Select', 'ESC Back']}>
      {rows.map(([k, v]) => (
        <Line at={at} class="wc-mapper-info">
          <span class="wc-c-hint">{k.padEnd(LABEL_W)}</span>
          <span class="wc-c-item">{v}</span>
        </Line>
      ))}
      <Blank />
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      <Blank />
      <Centered text={credit} class="wc-c-hint wc-mapper-credit" />
      <FlashRow />
      <input ref={fileRef} type="file" accept=".mm2" hidden class="wc-mapper-file" onChange={() => void onFile()} />
    </Page>
  );
}
