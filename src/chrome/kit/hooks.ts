// TUI kit: shared contexts and hooks (services, settings, cell grid).

import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useState } from 'preact/hooks';
import type { AppStatusState, AppStatusView } from '../../app/status';
import type { ProfileStore } from '../../profiles';
import type { RunLibrary } from '../../runs/library';
import type { Session } from '../../runs/stitch';
import type { Settings, SettingsStore } from '../../settings';
import type { CellMetrics, CellSize } from '../../theme/cells';
import type { MapStore } from '../../map/store';
import type { NoticeState, Notices } from '../../app/notices';

/** Everything the chrome needs from the rest of the app. */
export interface ChromeServices {
  settings: SettingsStore;
  cells: CellMetrics;
  profiles: ProfileStore;
  /** Build version for About (CLIENT_VERSION). */
  version: string;
  /** Build commit for About (CLIENT_COMMIT, ADR 0025). Absent: not shown. */
  commit?: string;
  /** The profile editor saved `name` (the UI pane line, ADR 0016). */
  onProfileSaved?: (name: string) => void;
  /** The run library (History, backups; ADR 0018), opened on first use. */
  runs: () => Promise<RunLibrary>;
  /**
   * Opens the log player on `session` (History → RUN LOG, ADR 0018). The
   * shell hides the start page (its frame stack intact) and shows it again
   * with `show({ keep: true })` when the player closes. Absent: History
   * reports that the player is not available.
   */
  openPlayer?: (session: Session) => void;
  /**
   * Loads the Spotlights reel and plays it in the player (ADR 0019), the
   * start page hidden as for `openPlayer`. Resolves to the empty state to
   * show when there is nothing to play, else null once the reel is up.
   */
  openSpotlights?: () => Promise<'no_data' | 'filtered' | null>;
  /**
   * The current map (ADR 0020; Options → Mapper, the HTML replay
   * export). Absent: the Mapper page says the map store is not available
   * and exports use the bundled map.
   */
  maps?: MapStore;
  /** Client notices (ADR 0025): the ESC header and the start page show them. */
  notices?: Notices;
}

export const ServicesCtx = createContext<ChromeServices | null>(null);

export function useServices(): ChromeServices {
  const s = useContext(ServicesCtx);
  if (!s) throw new Error('chrome: no services');
  return s;
}

/** The live settings (re-renders on every change). */
export function useSettings(): Readonly<Settings> {
  const { settings } = useServices();
  const [s, set] = useState(settings.get());
  useEffect(() => {
    set(settings.get());
    return settings.subscribe((next) => set(next));
  }, [settings]);
  return s;
}

/** The live cell size. */
export function useCells(): CellSize {
  const { cells } = useServices();
  const [c, set] = useState(cells.get());
  useEffect(() => {
    set(cells.get());
    return cells.subscribe((next) => set(next));
  }, [cells]);
  return c;
}

/** The live app status (ESC menu header). */
export function useStatus(view: AppStatusView): Readonly<AppStatusState> {
  const [s, set] = useState(view.get());
  useEffect(() => {
    set(view.get());
    return view.subscribe((next) => set(next));
  }, [view]);
  return s;
}

const NO_NOTICES: Readonly<NoticeState> = Object.freeze({ update: null, storageSuperseded: false });

/** The live client notices (ADR 0025); none without `services.notices`. */
export function useNotices(): Readonly<NoticeState> {
  const { notices } = useServices();
  const [s, set] = useState(notices?.get() ?? NO_NOTICES);
  useEffect(() => {
    if (!notices) return;
    set(notices.get());
    return notices.subscribe((next) => set(next));
  }, [notices]);
  return s;
}

/**
 * The pixel size of an element, tracked with a ResizeObserver and re-read
 * after every render (so a surface that was just shown has its size before
 * the next event, not one observer callback later). A hidden element
 * (0 × 0) keeps its last size.
 */
export function useElementSize(ref: { current: HTMLElement | null }): { w: number; h: number } {
  const [size, set] = useState({ w: 0, h: 0 });
  const read = (): void => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w === 0 && h === 0) return;
    set((cur) => (cur.w === w && cur.h === h ? cur : { w, h }));
  };
  useLayoutEffect(read);
  useLayoutEffect(() => {
    const el = ref.current;
    const RO = el?.ownerDocument.defaultView?.ResizeObserver;
    if (!el || !RO) return;
    const ro = new RO(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** The chrome's grid in cells, and which surface it is on. */
export interface Grid {
  cols: number;
  rows: number;
  /** `start`: the start page (2 blank rows above titles); `menu`: the ESC menu (1). */
  surface: 'start' | 'menu';
}

export const GridCtx = createContext<Grid>({ cols: 80, rows: 24, surface: 'start' });

export function useGrid(): Grid {
  return useContext(GridCtx);
}

/** Whole cells that fit in an element, and the pixel offsets that centre them. */
export interface HostGrid {
  cols: number;
  rows: number;
  /** Left/top offset in px of a cols × rows box centred in the element. */
  left: number;
  top: number;
  cellW: number;
  cellH: number;
}

export function useHostGrid(ref: { current: HTMLElement | null }): HostGrid {
  const size = useElementSize(ref);
  const c = useCells();
  // Cells can be fractional CSS px (whole device px, ADR 0050): the
  // offsets are whole device px too.
  const cols = c.w > 0 ? Math.floor(size.w / c.w + 1e-6) : 0;
  const rows = c.h > 0 ? Math.floor(size.h / c.h + 1e-6) : 0;
  const dpr = ref.current?.ownerDocument.defaultView?.devicePixelRatio || 1;
  return {
    cols,
    rows,
    left: Math.floor(((size.w - cols * c.w) / 2) * dpr + 1e-6) / dpr,
    top: Math.floor(((size.h - rows * c.h) / 2) * dpr + 1e-6) / dpr,
    cellW: c.w,
    cellH: c.h,
  };
}
