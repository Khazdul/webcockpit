// Options → Mapper (ADR 0020 "Map files and storage").
//
//   ─── Mapper ───
//        Map       arda.mm2 (bundled)          or the imported file:
//                                              Map  my.mm2 · Rooms 30 074
//                                              Size 5.8 MB · Imported <date>
//
//      << [X] Show map pane >>
//      << Room notes: On >>
//      << Room info on hover: Minimal >>
//      << Import map file… >>
//      << Use bundled map >>
//
//      << Back >>
//          ↑↓ Move · ←→ Adjust · Enter Select · ESC Back
//
// Import reads a `.mm2` (a hidden file input), checks it in the map tools
// worker (MapStore.importFile; the page never parses a map on the main
// thread) and stores it in IndexedDB; a running Map pane reloads. A bad
// file flashes the reason and the old map stays. "Use bundled map"
// deletes the import. The Map pane's on/off is the same setting as its
// row in Options → Panes → General.
//
// Room notes (ADR 0077, `mapper.notes`, default On): the map file's note
// for the located room after its exits line in the game window. Room info
// on hover (`mapper.hover`: Off / Minimal / Full, default Minimal): no
// hover box, the room name and note, or also the description, exits and
// mob/load flags.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { CurrentMap } from '../../map/store';
import { MAP_HOVER_MODES } from '../../settings';
import { useGrid, useServices, useSettings } from '../kit/hooks';
import { centreLeft, cycle } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { Blank, FlashRow, Line, type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';

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
      <FlashRow />
      <input ref={fileRef} type="file" accept=".mm2" hidden class="wc-mapper-file" onChange={() => void onFile()} />
    </Page>
  );
}
