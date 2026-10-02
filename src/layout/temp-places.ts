// Where the player put temporary script panes (ADR 0053 addendum, owner
// 2026-10-02): the outer rectangle in cells per pane id
// (`<script>/~<pane>`), kept per device in localStorage. Not in the
// settings: those are recorded in runs and exported, and a pick window's
// place is this screen's business. Options → Reset layout forgets them.

import type { Rect } from './allocate';

/** Where a temporary pane opens until the user moves it (`createPane{at}`). */
export type TempPaneAt =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

/** Every `at` value (createPane checks against it). */
export const TEMP_PANE_AT: readonly TempPaneAt[] = [
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];


/** localStorage key of the saved rectangles. */
export const TEMP_PLACES_KEY = 'webcockpit.tempPanes';
/** Most rectangles kept (the oldest go first). */
export const MAX_TEMP_PLACES = 200;

const MAX_CELLS = 2000;

function storage(s?: Storage | null): Storage | null {
  if (s !== undefined) return s;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isRect(v: unknown): v is Rect {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const ok = (n: unknown, min: number): boolean => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= MAX_CELLS;
  return ok(r.x, 0) && ok(r.y, 0) && ok(r.w, 1) && ok(r.h, 1);
}

function readAll(s: Storage | null): Record<string, Rect> {
  if (!s) return {};
  try {
    const v = JSON.parse(s.getItem(TEMP_PLACES_KEY) ?? '{}') as unknown;
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    const out: Record<string, Rect> = {};
    for (const [k, r] of Object.entries(v)) if (isRect(r)) out[k] = { x: r.x, y: r.y, w: r.w, h: r.h };
    return out;
  } catch {
    return {};
  }
}

/** The saved rectangle of temporary pane `id`, or null. */
export function tempPlace(id: string, s?: Storage | null): Rect | null {
  return readAll(storage(s))[id] ?? null;
}

/** Saves temporary pane `id`'s rectangle (null forgets it). */
export function saveTempPlace(id: string, rect: Rect | null, s?: Storage | null): void {
  const st = storage(s);
  if (!st) return;
  const all = readAll(st);
  delete all[id];
  if (rect) all[id] = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TEMP_PLACES))) delete all[k];
  try {
    if (Object.keys(all).length === 0) st.removeItem(TEMP_PLACES_KEY);
    else st.setItem(TEMP_PLACES_KEY, JSON.stringify(all));
  } catch {
    /* full or blocked: the place is not kept */
  }
}

/** Forgets every saved rectangle (Reset layout). */
export function forgetTempPlaces(s?: Storage | null): void {
  try {
    storage(s)?.removeItem(TEMP_PLACES_KEY);
  } catch {
    /* blocked */
  }
}
