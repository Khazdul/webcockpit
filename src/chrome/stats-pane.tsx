// The Statistics pane's view (stage 30 S7, ADR 0109), mounted by the shell
// into the pane's content element (src/panes/statistics.ts) on its first
// show:
//
//   const view = chrome.mountStatsPane(host, services, { runs, status });
//   view.resize(cols, rows);   // 0 × 0 while the pane is hidden
//
// The rows are the ESC frame's (`statsBody`, statistics.tsx), laid out by
// the pane's cells (`statsPaneLayout`): wide is today's two sides, KILLS /
// PvPs fitting the height; narrow is one column that scrolls as a whole.
// The data is `StatsFeed`'s (live, ≤ 1 Hz, idle while hidden).
//
// No keys and no focus: every mousedown is prevented, so a click leaves the
// keys with the game (the cockpit's mouseup refocuses the input). A click
// on a column title sorts; the wheel and the scrollbars scroll.

import { type VNode, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AppStatusView } from '../app/status';
import type { LiveRuns } from '../runs/live';
import { type ChromeServices, ServicesCtx } from './kit/hooks';
import { centreLeft } from './kit/nav';
import { TuiScrollbar, useScrollBox } from './kit/scroll';
import { indent } from './kit/widgets';
import { paneHeader, statsBody } from './frames/statistics';
import { DEFAULT_KILL_SORT, DEFAULT_PVP_SORT, type KillSortKey, type PvpSortKey, type StatSort, statsPaneLayout } from './frames/stats-layout';
import { type StatsFeedState, StatsFeed } from './stats-feed';

export interface StatsPaneOptions {
  runs: LiveRuns;
  status: AppStatusView;
}

export interface StatsPaneHandle {
  /** The pane's content size in cells; 0 × 0 while hidden. */
  resize(cols: number, rows: number): void;
  dispose(): void;
}

const NO_RUN = 'No run yet';
const noFocus = (): void => {};
const prevent = (e: Event): void => e.preventDefault();

interface SurfaceProps {
  feed: StatsFeed;
  cols: number;
  rows: number;
}

function StatsPaneSurface(p: SurfaceProps): VNode | null {
  const [st, setSt] = useState<StatsFeedState>(p.feed.state);
  useEffect(() => p.feed.subscribe(setSt), [p.feed]);
  const boxes = [useScrollBox(), useScrollBox(), useScrollBox(), useScrollBox()];
  const page = useScrollBox();
  const [ks, setKs] = useState<StatSort<KillSortKey>>(DEFAULT_KILL_SORT);
  const [ps, setPs] = useState<StatSort<PvpSortKey>>(DEFAULT_PVP_SORT);
  const { cols, rows } = p;
  if (cols <= 0 || rows <= 0) return null;

  if (st.noRun) {
    return (
      <div class="wc-stats wc-stats-pane" data-layout="empty" onMouseDown={prevent}>
        {Array.from({ length: Math.max(0, Math.floor((rows - 1) / 2)) }, (_, i) => (
          <div class="wc-line" key={i} />
        ))}
        <div class="wc-line wc-stats-norun" style={indent(centreLeft(cols, NO_RUN.length))}>
          <span class="wc-c-hint">{NO_RUN}</span>
        </div>
      </div>
    );
  }

  const lay = statsPaneLayout(cols, rows);
  // Narrow: the last column is the scrollbar's.
  const w = lay.mode === 'wide' ? cols : cols - 1;
  const out = statsBody({
    model: st.model,
    // Narrow: a cell kept free on each side, as the column's margin.
    headers: [paneHeader(st.model, st.rating, st.ended, lay.mode === 'wide' ? w : w - 2)],
    live: true,
    ...(st.note !== undefined ? { note: st.note } : {}),
    cols: w,
    layout: lay.mode,
    T: lay.T,
    total: lay.total,
    left: lay.left,
    N: lay.mode === 'wide' ? lay.fitRows : 0,
    showSpark: lay.showSpark,
    showRuler: lay.showRuler,
    topBlank: 0,
    boxes,
    focus: null,
    setFocus: noFocus,
    ks,
    setKs,
    ps,
    setPs,
  });
  if (lay.mode === 'wide') {
    return (
      <div class="wc-stats wc-stats-pane" data-layout="wide" onMouseDown={prevent}>
        {out}
      </div>
    );
  }
  // Narrow: the whole content scrolls, with the bar in the last column.
  return (
    <div class="wc-scrollrow wc-stats wc-stats-pane" data-layout="narrow" onMouseDown={prevent}>
      <div class="wc-scrollbox wc-stats-page" ref={page.ref} style={{ width: `calc(var(--cell-w) * ${w})` }}>
        {out}
      </div>
      <TuiScrollbar target={page.ref} rows={rows} thumbClass="wc-stat-bar wc-st-thumb" trackClass="wc-stat-bar wc-st-track" trackChar="█" jump />
    </div>
  );
}

/** Mounts the Statistics pane's view into `host` (hidden until `resize` gives it cells). */
export function mountStatsPane(host: HTMLElement, services: ChromeServices, opts: StatsPaneOptions): StatsPaneHandle {
  const feed = new StatsFeed({ runs: opts.runs, replay: () => opts.status.get().replay });
  let cols = 0;
  let rows = 0;
  const draw = (): void =>
    render(
      <ServicesCtx.Provider value={services}>
        <StatsPaneSurface feed={feed} cols={cols} rows={rows} />
      </ServicesCtx.Provider>,
      host,
    );
  return {
    resize(c, r) {
      const shown = c > 0 && r > 0;
      if (c === cols && r === rows) return;
      cols = shown ? c : 0;
      rows = shown ? r : 0;
      feed.setShown(shown);
      draw();
    },
    dispose() {
      feed.dispose();
      render(null, host);
    },
  };
}
