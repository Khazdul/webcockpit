// Map worker protocol (ADR 0020 "Architecture"): the only messages between
// the main thread (src/map/client.ts) and the map worker
// (src/map/worker/map.worker.ts). Plain structured-clone data; the canvas
// and byte buffers are transferred.
//
// Extending it: add a new member to a union with a new `t` value. Both
// sides ignore a `t` they do not know, so a newer client and an older
// worker (or the reverse) never break each other within one build. Never
// change the meaning of an existing field; add an optional one instead.
//
// Coordinates: every pixel value is in CSS px relative to the canvas'
// top-left corner; the worker multiplies by `dpr` itself.

import type { ConnState } from '../core/types';
import type { MapData } from './model';
import type { RoomHoverInfo } from './hover';
import type { RoomQuery } from './query';
import type { RoomDetails, SearchHit, SearchQuery } from './search';
import type { Scene } from './scene';

export type { RoomQuery } from './query';
export type { RoomHoverInfo } from './hover';
export type { RoomDetails, SearchHit, SearchQuery } from './search';

/** Most rooms one mark takes by id (ADR 0077 §B; a query mark keeps QUERY_MAX). */
export const MARK_ROOMS_MAX = 200;

/**
 * A mark's focus (ADR 0057, ADR 0077 §B): `true` fits the view to the
 * player and the marks while the mark blinks; `'move'` fits it once and
 * lets go at the player's first move to another room (the zoom comes back,
 * the view follows the player; the marks stay).
 */
export type MarkFocus = boolean | 'move';

/** A question for the map's data (ADR 0077 §B), answered by `answer`. */
export type MapAsk =
  | { k: 'search'; query: SearchQuery }
  | { k: 'path'; room: number }
  | { k: 'room'; room: number };

/** The answer to a `MapAsk` of the same `k`. */
export type MapAnswer =
  /** `error`: the query failed (a bad regular expression); `results` is then empty. */
  | { k: 'search'; results: SearchHit[]; total: number; here: number | null; error?: string }
  /** null: unknown position, no such room or no path. */
  | { k: 'path'; dirs: string | null; steps: number | null }
  | { k: 'room'; room: RoomDetails | null };

/** How a mark looks (ADR 0057). */
export interface MarkStyle {
  /** 0xRRGGBB. */
  color: number;
  blink: boolean;
  /** Seconds of fade-out at the end. */
  fade: number;
  arrows: boolean;
  label?: string;
  /** Seconds the mark stays, steady and without blinking, after its duration (ADR 0057). */
  linger?: number;
}

/** What a mark marks: rooms by index, or the rooms a query finds. */
export type MarkTarget = { rooms: number[] } | { query: RoomQuery };

/** Bump when a change is not backwards compatible (checked in `init`). */
export const MAP_PROTOCOL_VERSION = 1;

// ------------------------------------------------------------ assets

/**
 * Where the worker finds its static assets (tiles, BMFont), by path
 * relative to the asset root: `pixmaps/terrain-field.png`,
 * `fonts/Cantarell18.fnt` …
 *
 * - `base`: fetched from `url + path` (the app: `${BASE_URL}map/`).
 * - `inline`: looked up in `files` (the HTML replay embeds the files it
 *   needs as data URIs or Blobs); a missing path is an error, unless
 *   `fallback` is set: a data URI answered for a missing `pixmaps/` path
 *   (the replay embeds only the tiles its map subset uses; P3).
 */
export type AssetSource =
  | { kind: 'base'; url: string }
  | { kind: 'inline'; files: Record<string, string | Blob>; fallback?: string };

// --------------------------------------------------------------- maps

/**
 * A map to load.
 * - `url`: a `.mm2` file to fetch (the bundled `arda.mm2`).
 * - `bytes`: a `.mm2` file in memory (an import, or the subset an HTML
 *   replay embeds; transfer the buffer). `name` is shown in status text.
 * - `data`: an already parsed map (structured clone of `MapData`; e.g. a
 *   subset cut on the main thread by `subsetMap`). Derived indexes are
 *   rebuilt by the worker, so they may be left empty.
 */
export type MapSource =
  | { kind: 'url'; url: string; name?: string }
  | { kind: 'bytes'; bytes: ArrayBuffer; name: string }
  | { kind: 'data'; map: MapData; name: string };

/** What the worker reports after a successful load. */
export interface MapInfo {
  name: string;
  rooms: number;
  infomarks: number;
  /** Rooms that have a MUME server id. */
  serverIds: number;
  /** SHA-256 prefix of the file bytes (hex, 32 chars); `''` for `data` sources. */
  hash: string;
  /** Load time in the worker, ms (fetch + inflate + parse + index + mesh build and upload). */
  ms: number;
  /** The load's stages in the worker, ms (P4; `parse` includes the indexes, `meshes` the GPU upload). */
  stages?: { fetch: number; inflate: number; parse: number; hash: number; meshes: number };
}

// ------------------------------------------------------------- events

/** GMCP packages the map uses (ADR 0020); the main thread forwards only these. */
export const MAP_GMCP_PACKAGES = [
  'Room.Info',
  'Event.Moved',
  'Group.Set',
  'Group.Add',
  'Group.Update',
  'Group.Remove',
  'Char.StatusVars',
] as const;
export type MapGmcpPackage = (typeof MAP_GMCP_PACKAGES)[number];

/**
 * Move-failure line kinds (research §6.2): `fail` pops the head of the
 * prespam queue ("Alas, you cannot go that way..." and the others),
 * `dead` clears it ("You are dead!").
 */
export type MoveFailureKind = 'fail' | 'dead';

/** One forwarded game event. */
export type MapEvent =
  /**
   * `seq` (Room.Info only, ADR 0077): set when the main thread wants the
   * room's note; the worker answers with `roomNotes` for it.
   */
  | { k: 'gmcp'; pkg: MapGmcpPackage; data: unknown; seq?: number }
  | { k: 'cmd'; text: string }
  | { k: 'fail'; kind: MoveFailureKind }
  | { k: 'conn'; state: ConnState; replay?: boolean }
  /**
   * Forwarding (re)started after a gap (the pane was hidden): what was
   * queued or pending may be stale, so the worker clears the prespam
   * queue and the pending move. The position stays until the next Room.Info.
   */
  | { k: 'resync' };

// ---------------------------------------------------- main → worker

export type MainToWorker =
  | {
      t: 'init';
      protocol: number;
      /** Transferred from the pane's `<canvas>`. */
      canvas: OffscreenCanvas;
      /** Canvas size in CSS px, and devicePixelRatio. */
      width: number;
      height: number;
      dpr: number;
      assets: AssetSource;
    }
  | { t: 'load'; req: number; source: MapSource }
  | { t: 'resize'; width: number; height: number; dpr: number }
  /** Drag: the grabbed point moved by (dx, dy) CSS px. */
  | { t: 'pan'; dx: number; dy: number }
  /** Wheel: `steps` notches (positive = zoom in) around (x, y) CSS px. */
  | { t: 'zoom'; steps: number; x: number; y: number }
  /** A batch of game events, in order. */
  | { t: 'events'; events: MapEvent[] }
  /** The pane was hidden or shown (the worker skips rendering while hidden). */
  | { t: 'visible'; visible: boolean }
  /**
   * Whether the worker keeps the server ids its locator learns in
   * IndexedDB (`mapIds`, keyed by the map hash). The app's own map pane
   * turns it on; the log player and the HTML replay leave it off (default).
   */
  | { t: 'persistIds'; on: boolean }
  /**
   * Development and tests only: draw `scene` (P1 renderer checks without
   * the tracking side), optionally centred on a room index or a
   * position (current layer = its z) and at a zoom.
   */
  /** Rooms matching a query (ADR 0057); answered by `found`. */
  | { t: 'find'; req: number; query: RoomQuery }
  /**
   * Marks rooms for `ms` ms (Infinity: until `unmark`); answered by
   * `marked`, then `markEnded`. `focus`: fit the view (MarkFocus).
   */
  | { t: 'mark'; id: number; target: MarkTarget; style: MarkStyle; ms: number; focus?: MarkFocus }
  | { t: 'unmark'; id: number }
  /** Map search, paths and room details for scripts (ADR 0077 §B); answered by `answer`. */
  | { t: 'ask'; req: number; ask: MapAsk }
  /**
   * The hover box (ADR 0077): the room under (x, y) CSS px on the current
   * layer; `full` adds description, contents and exits (MMapper's room
   * preview). Answered by `roomAt`.
   */
  | { t: 'roomAt'; req: number; x: number; y: number; full: boolean }
  | {
      t: 'debugScene';
      scene?: Scene;
      center?: { room: number } | { x: number; y: number; z: number };
      zoom?: number;
    };

// ---------------------------------------------------- worker → main

export type WorkerToMain =
  /** After `init`: WebGL2 is up (or `error` with stage `init` instead). */
  | { t: 'ready' }
  | { t: 'loaded'; req: number; info: MapInfo }
  /**
   * `init`: no WebGL2 / context lost; `load`: the map could not be loaded
   * (the previous map, if any, stays); `render`: a draw failed.
   */
  | { t: 'error'; stage: 'init' | 'load' | 'render'; req?: number; message: string }
  /** The WebGL context came back after an `error` "context lost" (P4); drawing again. */
  | { t: 'restored' }
  /** Once per load (P4): the first frame drawn with the map, every tile and the font; ms since the load started. */
  | { t: 'drawn'; req: number; ms: number }
  /** A `find` answered: the rooms (nearest first, at most `max`) and how many matched. */
  | { t: 'found'; req: number; rooms: number[]; total: number }
  /** A `mark` placed on these rooms (empty: nothing matched; then `markEnded` follows at once). */
  | { t: 'marked'; id: number; rooms: number[]; total: number }
  /**
   * Room notes (ADR 0077): one entry per Room.Info forwarded with a `seq`,
   * in order; `note` is the located room's map note, '' when the room was
   * not located or has none.
   */
  | { t: 'roomNotes'; notes: { seq: number; note: string }[] }
  /**
   * A `roomAt` answered: the room (null: none there) with its square on the
   * canvas (CSS px) and the hover box content.
   */
  | {
      t: 'roomAt';
      req: number;
      room: number | null;
      rect?: { x: number; y: number; w: number; h: number };
      info?: RoomHoverInfo;
    }
  /** An `ask` answered. */
  | { t: 'answer'; req: number; answer: MapAnswer }
  /** A mark ended (its time ran out, `unmark`, or a map load). */
  | { t: 'markEnded'; id: number }
  /** Locator state (P2): the player's room index, or null when unknown. */
  | {
      t: 'status';
      located: boolean;
      room: number | null;
      /** How the last Room.Info was matched (src/map/locate.ts `LocateHow`). */
      how?: 'id' | 'learned' | 'dir' | 'text' | 'none';
    };

// ------------------------------------------------------ pane host

/**
 * What the Map pane loads (src/panes/map.ts). The app passes the current
 * map (an import from IndexedDB, else the bundled arda.mm2; src/map/store.ts),
 * the log player the same, the HTML replay its embedded subset, all through
 * `PaneContext.map` (P3). `source()` is read when the worker starts (it may
 * be async; a `bytes` source must be a fresh buffer each call, since it is
 * transferred); null loads nothing. `subscribe` (optional): the map changed
 * (an import, or back to the bundled map); the pane calls `source()` again
 * and reloads.
 */
export interface MapPaneHost {
  source: () => MapSource | null | Promise<MapSource | null>;
  assets: AssetSource;
  subscribe?: (fn: () => void) => () => void;
  /** Persist learned server ids in IndexedDB (the live app's map only). */
  persistIds?: boolean;
}
