// The Mapper settings' shared logic (ADR 0020, ADR 0107): what Options →
// Mapper (the TUI page, frames/options-mapper.tsx) and the modern Mapper
// component (popups/mapper-settings.tsx, in Settings → Mapper and, from 30c
// part 2, the map pane's gear popup) both show and do. No UI here.
//
// - The current map's info rows (name, rooms, size, imported date).
// - The tileset's credit line, with the season an alternating set draws
//   now (the saved game clock, as the Map pane resolves it).
// - The background colour as the list knows it (migration keeps only named
//   colours; anything else reads as Default, ADR 0085).
// - Import a `.mm2` (checked in the map tools worker, stored in IndexedDB)
//   and go back to the bundled map, reporting through a flash callback.

import { type Season, seasonOf } from '../gmcp/gametime';
import { MAP_BACKGROUNDS, MAP_BG_DEFAULT, isNamedMapBg } from '../map/backgrounds';
import type { CurrentMap, MapStore } from '../map/store';
import { localStorageOrNull, mumeMonth, storedClockEpoch, tilesetChoice } from '../map/tilesets';

/** How a result is reported (the TUI's flash row, the popup's note line). */
export type MapFlash = (text: string, kind?: 'ok' | 'fail') => void;

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

/** The map shown when there is no map store (or it failed): the bundled one. */
export const BUNDLED_MAP: CurrentMap = { kind: 'bundled', name: 'arda.mm2' };

/** The credit line; an alternating set adds the season it draws now (game month `month`). */
export function tilesetCredit(id: string, month: number): string {
  const c = tilesetChoice(id);
  if (!c.family) return c.credit;
  const season = seasonOf(month);
  return `${c.credit} · now ${season[0]!.toUpperCase()}${season.slice(1)}`;
}

/** The game month (0–11) now by the saved game clock, as the Map pane resolves a set. */
export function mumeMonthNow(now: number = Date.now()): number {
  return mumeMonth(storedClockEpoch(localStorageOrNull(), now), now);
}

/** The season an alternating set draws now (the saved game clock). */
export function seasonNow(now: number = Date.now()): Season {
  return seasonOf(mumeMonthNow(now));
}

/** The credit line for tileset `id` now (the saved game clock). */
export function tilesetCreditNow(id: string, now: number = Date.now()): string {
  return tilesetCredit(id, mumeMonthNow(now));
}

/** The background choices, Default first (ADR 0085). */
export const MAP_BG_HEXES: readonly string[] = MAP_BACKGROUNDS.map((c) => c.hex);

/** The stored background as a list entry: a named colour, else Default. */
export function mapBgChoice(stored: string): string {
  return isNamedMapBg(stored) ? stored.toLowerCase() : MAP_BG_DEFAULT;
}

/** The current map, or the bundled one when the store fails. */
export async function currentMap(maps: MapStore): Promise<CurrentMap> {
  try {
    return await maps.current();
  } catch {
    return BUNDLED_MAP;
  }
}

/** Imports `file` as the map; the result (or the reason it failed) goes to `flash`. */
export async function importMapFile(maps: MapStore | undefined, file: File, flash: MapFlash): Promise<void> {
  if (!maps) return flash('Import failed: no map storage here.', 'fail');
  flash(`Checking ${file.name}…`);
  try {
    const rec = await maps.importFile(file.name, await file.arrayBuffer());
    flash(`Imported ${rec.name}` + (rec.rooms !== undefined ? ` (${fmtCount(rec.rooms)} rooms).` : '.'));
  } catch (e) {
    flash(`Import failed: ${errText(e)}`, 'fail');
  }
}

/** Deletes the imported map (the bundled one is used again); nothing while the bundled one is current. */
export async function useBundledMap(maps: MapStore | undefined, cur: CurrentMap | null, flash: MapFlash): Promise<void> {
  if (!maps || cur?.kind !== 'imported') return;
  await maps.useBundled();
  flash('Using the bundled map.');
}
