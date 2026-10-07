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
//      << Tileset: Default (MMapper) >>
//      << [X] Background colour: Default >>
//      << [ ] Background colour code: none >>
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
// row in Options → Panes → Appearance.
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
// game clock, as the Map pane resolves it). Background (`mapper.background`,
// ADR 0085 and its addendum): two check-box rows, exactly one checked.
// "Background colour": ←→ cycles the named colours of
// src/map/backgrounds.ts (Default first), Enter or a click checks it.
// "Background colour code": Enter or a click opens the `#rrggbb` prompt;
// a valid code checks the row and is remembered (`mapper.backgroundCode`),
// so ←→ there checks it again. A typed code that is a named colour shows
// as that name. The Map pane draws the colour at once.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { seasonOf } from '../../gmcp/gametime';
import { MAP_BACKGROUNDS, MAP_BG_DEFAULT, isNamedMapBg, mapBgName, parseMapBg } from '../../map/backgrounds';
import type { CurrentMap } from '../../map/store';
import { localStorageOrNull, mumeMonth, storedClockEpoch, TILESET_IDS, tilesetChoice } from '../../map/tilesets';
import { MAP_HOVER_MODES, MAP_HOVER_SIZES } from '../../settings';
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
  TextField,
  menuKey,
  useMenuCursor,
} from '../kit/widgets';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** `5.8 MB`, `812 kB`, `64 B`. */
export function fmtBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} kB`;
  return `${n} B`;
}

/** `30 074` (thin groups, as elsewhere in the chrome). */
export function fmtCount(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Local `YYYY-MM-DD HH:MM`. */
export function fmtDate(ms: number): string {
  const d = new Date(ms);
  const p = (x: number): string => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The info rows for the current map: [label, value]. */
export function mapInfoRows(m: CurrentMap | null): Array<[string, string]> {
  if (!m) return [['Map', '…']];
  if (m.kind === 'bundled') return [['Map', `${m.name} (bundled)`]];
  return [
    ['Map', m.name],
    ...(m.rooms !== undefined ? [['Rooms', fmtCount(m.rooms)] as [string, string]] : []),
    ['Size', fmtBytes(m.size)],
    ['Imported', fmtDate(m.date)],
  ];
}

const LABEL_W = 10;

/** What ←→ cycles on the named background row: the list, Default first. */
const MAP_BG_HEXES = MAP_BACKGROUNDS.map((c) => c.hex);

/** The credit line under the menu; an alternating set adds the season it draws now (game month `month`). */
export function tilesetCredit(id: string, month: number): string {
  const c = tilesetChoice(id);
  if (!c.family) return c.credit;
  const season = seasonOf(month);
  return `${c.credit} · now ${season[0]!.toUpperCase()}${season.slice(1)}`;
}

export function MapperOptionsFrame(): VNode {
  const { settings, maps } = useServices();
  const s = useSettings();
  const nav = useNav();
  const { cols } = useGrid();
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [cur, setCur] = useState<CurrentMap | null>(null);

  const refresh = async (): Promise<void> => {
    if (!maps) return;
    try {
      setCur(await maps.current());
    } catch {
      setCur({ kind: 'bundled', name: 'arda.mm2' });
    }
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
  const credit = tilesetCredit(mapper.tileset, mumeMonth(storedClockEpoch(localStorageOrNull(), Date.now()), Date.now()));
  const sizeLabel = mapper.hoverSize === 'small' ? 'Small' : mapper.hoverSize === 'large' ? 'Large' : 'Medium';
  // Background (ADR 0085 addendum): the code row is checked while the
  // colour is not a named one; the named row then offers Default.
  const byCode = !isNamedMapBg(mapper.background);
  const named = byCode ? MAP_BG_DEFAULT : mapper.background.toLowerCase();

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
      if (!maps) return nav.flash('Import failed: no map storage here.', 'fail');
      nav.flash(`Checking ${file.name}…`);
      try {
        const rec = await maps.importFile(file.name, await file.arrayBuffer());
        nav.flash(`Imported ${rec.name}` + (rec.rooms !== undefined ? ` (${fmtCount(rec.rooms)} rooms).` : '.'));
      } catch (e) {
        nav.flash(`Import failed: ${errText(e)}`, 'fail');
      }
    });

  const useBundled = (): Promise<void> =>
    run(async () => {
      if (!maps || cur?.kind !== 'imported') return;
      await maps.useBundled();
      nav.flash('Using the bundled map.');
    });

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
      adjust: (d) => settings.update({ mapper: { tileset: cycle(TILESET_IDS, tileset.id, d) } }),
    },
    {
      key: 'background',
      glyph: byCode ? '[ ]' : '[X]',
      label: `Background colour: ${mapBgName(named)}`,
      activate: () => settings.update({ mapper: { background: named } }),
      adjust: (d) => settings.update({ mapper: { background: cycle(MAP_BG_HEXES, named, d) } }),
    },
    {
      key: 'backgroundCode',
      glyph: byCode ? '[X]' : '[ ]',
      label: `Background colour code: ${mapper.backgroundCode || 'none'}`,
      activate: () => nav.push(<MapBackgroundCodeFrame />),
      // ←→ check the row again with the remembered code (a typed one: Enter).
      adjust: () => {
        if (mapper.backgroundCode) settings.update({ mapper: { background: mapper.backgroundCode } });
        else nav.push(<MapBackgroundCodeFrame />);
      },
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

  const rows = mapInfoRows(maps ? cur : { kind: 'bundled', name: 'arda.mm2' });
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

// ------------------------------------------------------- map background

/** A swatch of `hex` and its code, centred (the colour code prompt). */
function Swatch(p: { hex: string; prefix?: string }): VNode {
  const head = `${p.prefix ?? ''}${p.hex}  `;
  return (
    <Centered text={head + '███'}>
      <span class="wc-c-body">{head}</span>
      <span class="wc-mapbg-swatch" style={{ color: p.hex }}>
        ███
      </span>
    </Centered>
  );
}

/** The `#rrggbb` prompt for the map background. */
function MapBackgroundCodeFrame(): VNode {
  const { settings } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const cur = settings.get().mapper.background;
  const [value, setValue] = useState(settings.get().mapper.backgroundCode || cur);
  const [error, setError] = useState('');
  const confirm = (): void => {
    const hex = parseMapBg(value);
    if (!hex) return setError('Use #rrggbb, e.g. #1c1c1c.');
    settings.update({ mapper: { background: hex, backgroundCode: hex } });
    nav.pop();
    nav.flash(`Map background set to ${hex}.`);
  };
  useKeys((e, nk) => {
    if (nk === 'activate' && e.key === 'Enter') {
      confirm();
      return true;
    }
    return false;
  });
  const w = 14;
  return (
    <Page
      title="Map background colour"
      footer={[
        { text: 'Enter Confirm', onClick: confirm },
        { text: 'ESC Cancel', onClick: () => nav.pop() },
      ]}
    >
      <Swatch hex={cur} prefix="Now " />
      <Blank />
      <TextField
        value={value}
        onInput={(v) => {
          setValue(v);
          setError('');
        }}
        width={w}
        at={centreLeft(cols, w)}
        maxLength={7}
        label="Map background colour"
      />
      <Centered text="#rrggbb" class="wc-c-hint" />
      {error ? <Centered text={error} class="wc-c-danger" /> : <Blank />}
    </Page>
  );
}
