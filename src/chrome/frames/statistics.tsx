// Statistics (Inv §7.3, ADR 0018): one renderer, two surfaces.
//
//   ESC → Statistics   LiveStatsFrame: the live run chain (`app.runs`),
//                      refreshed at 1 Hz and on R; ` · Run ended` when the
//                      run ends while it is open (the data stays).
//   History → STATS    SessionStatsFrame: an archived chain, loaded once.
//
//   ◆ STATISTICS — Rasta · Lvl 42 · Run 1h 10m · ★★★★        (centred)
//   ALLIES …                  ▒  ACHIEVEMENTS …          ▒   3 rows each
//   KILLS        N  XP/N  XP tot ▒  PvPs         N     XP ▼  ▒   sortable
//   ────────────                 ────────────
//   rows …  (live: fit to the height; History: fit to the data)
//   Total                        Total
//   XP/h                         TP/h                        sparklines
//   ▌◄▬▬ 48.2k XP ▬▬►▐                                         XP ruler
//
// Focus: Tab / Shift+Tab over the four tables (the focused title is gold);
// a click or the wheel on a table focuses it. ↑↓ scroll 1, PgUp/PgDn a
// page, Home/End. Clicking a title label sorts (same label flips).
// Scrollbars: click-to-jump. Layout helpers: stats-layout.ts.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppStatusView } from '../../app/status';
import { nowUs } from '../../core/types';
import type { LiveRuns } from '../../runs/live';
import { type StatsModel, buildStats, rateSeries } from '../../runs/stats';
import type { Session } from '../../runs/stitch';
import { useGrid, useServices } from '../kit/hooks';
import { cellLen, centreLeft, scrollbar, truncate } from '../kit/nav';
import { useIsTop, useKeys } from '../kit/stack';
import { Footer, indent } from '../kit/widgets';
import { WHEEL_NOTCH_PX, wheelSteps } from '../kit/wheel';
import { fmtDate, fmtDur, fmtTime, stars } from './history-model';
import {
  DEFAULT_KILL_SORT,
  DEFAULT_PVP_SORT,
  type Seg,
  type StatCol,
  type StatSort,
  allyPairs,
  fitNum,
  fmtClock,
  fmtK,
  fmtRunDur,
  killCells,
  killCols,
  nextStatSort,
  pvpCells,
  pvpCols,
  rulerRows,
  sortKills,
  sortPvps,
  sparkBuckets,
  sparkLabels,
  sparkRows,
  statsWidths,
  titleSegs,
} from './stats-layout';

/** Live refresh interval (Inv §7.3: 1 Hz). */
export const LIVE_TICK_MS = 1000;

const ALLIES = 0;
const ACHIEVEMENTS = 1;
const KILLS = 2;
const PVPS = 3;
/** Rows of ALLIES / ACHIEVEMENTS. */
const SMALL_ROWS = 3;

function Segs(p: { segs: readonly Seg[] }): VNode {
  return <>{p.segs.map((s) => (s.cls ? <span class={s.cls}>{s.text}</span> : s.text))}</>;
}

const pad = (n: number): Seg => ({ text: ' '.repeat(Math.max(0, n)) });

/** The live header: `◆ STATISTICS — Rasta · Lvl 42 · Run 1h 10m[ · ★★★][ · Run ended]`. */
export function liveHeader(m: StatsModel | null, rating: number, ended: boolean): string {
  const parts = [`◆ STATISTICS — ${m?.character ?? '—'}`];
  if (m?.level != null) parts.push(`Lvl ${m.level}`);
  parts.push(`Run ${fmtRunDur(m?.durationUs ?? 0)}`);
  if (rating > 0) parts.push(stars(rating));
  if (ended) parts.push('Run ended');
  return parts.join(' · ');
}

/** The History header: `◆ Session details — Rasta · 2026-09-26 · 21:00 · 1h10m`. */
export function sessionHeader(s: Session): string {
  return `◆ Session details — ${s.character} · ${fmtDate(s.startUs)} · ${fmtTime(s.startUs)} · ${fmtDur(s.endUs - s.startUs)}`;
}

export interface StatsViewProps {
  model: StatsModel | null;
  header: string;
  /** Live: KILLS/PvPs fit the height, R refreshes, Totals always shown. */
  live: boolean;
  onRefresh?: () => void;
  /** Shown in place of the ruler (loading, errors). */
  note?: string;
}

/** The Statistics frame body (both surfaces). */
export function StatsView(p: StatsViewProps): VNode {
  const { cols, rows, surface } = useGrid();
  const [focus, setFocus] = useState(KILLS);
  const [tops, setTops] = useState([0, 0, 0, 0]);
  const [ks, setKs] = useState<StatSort<'name' | 'n' | 'xpPer' | 'xpTotal'>>(DEFAULT_KILL_SORT);
  const [ps, setPs] = useState<StatSort<'name' | 'n' | 'xp'>>(DEFAULT_PVP_SORT);
  const m = p.model;
  const { T, total } = statsWidths(cols);
  const left = centreLeft(cols, total);
  const allies = allyPairs(m?.allies ?? []);
  const miles = m?.milestones ?? [];
  const kills = sortKills(m?.kills ?? [], ks);
  const pvps = sortPvps(m?.pvps ?? [], ps);
  const kc = killCols(T);
  const pc = pvpCols(T);

  // Vertical budget: header, blank, 4 (allies), blank, title + divider,
  // Total, footer (+ a blank above on the start page); then two data rows,
  // the sparklines (8) and the ruler (4) as far as they fit.
  const topBlank = surface === 'start' ? 1 : 0;
  let rest = rows - topBlank - 11 - 2;
  const showSpark = rest >= 8;
  if (showSpark) rest -= 8;
  const showRuler = rest >= 4;
  if (showRuler) rest -= 4;
  const fitRows = 2 + Math.max(0, rest);
  const N = p.live ? fitRows : Math.min(fitRows, Math.max(1, kills.length, pvps.length));

  const counts = [allies.length, miles.length, kills.length, pvps.length];
  const vis = [SMALL_ROWS, SMALL_ROWS, N, N];
  const top = tops.map((t, i) => Math.max(0, Math.min(t, counts[i]! - vis[i]!)));
  const setTop = (i: number, t: number): void =>
    setTops((cur) => cur.map((x, j) => (j === i ? Math.max(0, Math.min(t, counts[i]! - vis[i]!)) : x)));

  useKeys((e, nk) => {
    if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'r' || e.key === 'R') && p.onRefresh) {
      p.onRefresh();
      return true;
    }
    const f = focus;
    switch (nk) {
      case 'tab':
      case 'backtab':
        setFocus((f + (nk === 'tab' ? 1 : 3)) % 4);
        return true;
      case 'up':
      case 'down':
        setTop(f, top[f]! + (nk === 'up' ? -1 : 1));
        return true;
      case 'pgup':
      case 'pgdn':
        setTop(f, top[f]! + (nk === 'pgup' ? -1 : 1) * vis[f]!);
        return true;
      case 'home':
        setTop(f, 0);
        return true;
      case 'end':
        setTop(f, counts[f]!);
        return true;
    }
    return false;
  });

  // ------------------------------------------------------------- pieces

  const titleCls = (id: number): string => (id === focus ? 'wc-c-accent' : 'wc-c-section');
  const bars = counts.map((c, i) => scrollbar(c, vis[i]!, top[i]!));

  /** One side of a table row: T cells of content, 2 blank, the scrollbar cell. */
  const side = (id: number | null, segs: readonly Seg[], vi?: number): VNode => {
    const bar = id !== null && vi !== undefined ? bars[id]! : [];
    const cell =
      bar.length > 0 ? (
        <span
          class={'wc-stat-bar ' + (bar[vi!] ? 'wc-st-thumb' : 'wc-st-track')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setFocus(id!);
            const maxTop = counts[id!]! - vis[id!]!;
            setTop(id!, Math.round((vi! / Math.max(1, vis[id!]! - 1)) * maxTop));
          }}
        >
          █
        </span>
      ) : (
        ' '
      );
    const w = segs.reduce((n, s) => n + cellLen(s.text), 0);
    return (
      <span
        class="wc-stat-side"
        data-table={id ?? undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={id === null ? undefined : () => setFocus(id)}
        onWheel={
          id === null
            ? undefined
            : (e: WheelEvent) => {
                e.preventDefault();
                setFocus(id);
                const n = wheelSteps(e, WHEEL_NOTCH_PX);
                if (n !== 0) setTop(id, top[id]! + n);
              }
        }
      >
        <Segs segs={segs} />
        {' '.repeat(Math.max(0, T - w)) + '  '}
        {cell}
      </span>
    );
  };

  const line = (l: VNode, r: VNode, key?: string): VNode => (
    <div class="wc-line" style={indent(left)} key={key}>
      {l}
      {'  '}
      {r}
    </div>
  );

  /** A sortable title row: the section name and the column labels are sort triggers. */
  const renderTitle = <K extends string>(
    id: number,
    colsDef: readonly StatCol<K>[],
    sort: StatSort<K>,
    set: (s: StatSort<K>) => void,
  ): VNode => {
    const segs = titleSegs(colsDef, sort);
    return (
      <span class="wc-stat-side" data-table={id} onMouseDown={(e) => e.preventDefault()} onClick={() => setFocus(id)}>
        {segs.map((s) => {
          const key = s.key;
          if (key === undefined) return s.text;
          return (
            <span
              class={`${titleCls(id)} wc-stat-sort`}
              data-sort={key}
              onClick={(e) => {
                e.stopPropagation();
                setFocus(id);
                set(nextStatSort(sort, key));
                setTop(id, 0);
              }}
            >
              {s.text}
            </span>
          );
        })}
        {' '.repeat(Math.max(0, T + 3 - segs.reduce((n, s) => n + cellLen(s.text), 0)))}
      </span>
    );
  };

  // ---------------------------------------------------------------- rows

  const out: VNode[] = [];
  const blank = (k: string): void => void out.push(<div class="wc-line" key={k} />);
  if (topBlank) blank('top');
  const header = truncate(p.header, cols);
  out.push(
    <div class="wc-line wc-stats-header" style={indent(centreLeft(cols, cellLen(header)))} key="hdr">
      <span class="wc-st-hint">{header}</span>
    </div>,
  );
  blank('b1');

  // ALLIES + ACHIEVEMENTS.
  out.push(
    line(
      side(ALLIES, [{ text: 'ALLIES', cls: titleCls(ALLIES) }]),
      side(ACHIEVEMENTS, [{ text: 'ACHIEVEMENTS', cls: titleCls(ACHIEVEMENTS) }]),
      'at',
    ),
  );
  const sub = Math.floor((T - 2) / 2);
  const ally = (name: string | undefined): Seg[] =>
    name === undefined
      ? [pad(sub)]
      : [
          { text: '♦ ', cls: 'wc-st-ally' },
          { text: truncate(name, sub - 2).padEnd(sub - 2), cls: 'wc-st-value' },
        ];
  for (let vi = 0; vi < SMALL_ROWS; vi++) {
    const pair = allies[top[ALLIES]! + vi];
    const ms = miles[top[ACHIEVEMENTS]! + vi];
    const l: Seg[] = pair ? [...ally(pair[0]), pad(2), ...ally(pair[1])] : [];
    const r: Seg[] = ms
      ? [
          { text: ms.text.slice(0, 1), cls: 'wc-st-star' },
          { text: truncate(ms.text.slice(1), T - 1), cls: 'wc-st-value' },
        ]
      : [];
    out.push(line(side(ALLIES, l, vi), side(ACHIEVEMENTS, r, vi), `a${vi}`));
  }
  blank('b2');

  // KILLS + PvPs.
  out.push(line(renderTitle(KILLS, kc, ks, setKs), renderTitle(PVPS, pc, ps, setPs), 'kt'));
  const rule: Seg[] = [{ text: '─'.repeat(T), cls: 'wc-c-hint' }];
  out.push(line(side(null, rule), side(null, rule), 'kd'));
  for (let vi = 0; vi < N; vi++) {
    const k = kills[top[KILLS]! + vi];
    const v = pvps[top[PVPS]! + vi];
    const l: Seg[] = k ? [{ text: killCells(k, kc).join(''), cls: 'wc-st-label' }] : [];
    const r: Seg[] = v
      ? [
          { text: '⚔ ', cls: 'wc-st-pvp' },
          { text: pvpCells(v, pc).join(''), cls: 'wc-st-label' },
        ]
      : [];
    out.push(line(side(KILLS, l, vi), side(PVPS, r, vi), `k${vi}`));
  }
  const kt = m?.killTotal ?? { n: 0, xp: 0 };
  const pt = m?.pvpTotal ?? { n: 0, xp: 0 };
  const killTotal: Seg[] =
    p.live || kt.n > 0
      ? [
          {
            text: 'Total'.padEnd(kc[0]!.width) + fitNum(kt.n, 4) + ' '.repeat(7) + fmtK(kt.xp).padStart(9),
            cls: 'wc-st-total',
          },
        ]
      : [];
  const pvpTotal: Seg[] =
    p.live || pt.n > 0
      ? [
          {
            text: 'Total'.padEnd(pc[0]!.width) + fitNum(pt.n, 4) + fmtK(pt.xp).padStart(9),
            cls: 'wc-st-total',
          },
        ]
      : [];
  out.push(line(side(null, killTotal), side(null, pvpTotal), 'kT'));

  // Sparklines.
  if (showSpark) {
    blank('b3');
    const buckets = sparkBuckets(T);
    const startUs = m?.startUs ?? 0;
    const endUs = m?.endUs ?? 0;
    const chart = (title: string, gains: StatsModel['xpGains'], cls: string): Seg[][] => {
      const values = m && m.startUs !== null ? rateSeries(gains, startUs, endUs, buckets) : [];
      const bars = sparkRows(values.length ? values : new Array<number>(buckets).fill(0));
      const labels = sparkLabels(Math.max(0, ...values));
      const endLabel = fmtClock(endUs - startUs);
      const xAxis = ' '.repeat(6) + '00:00';
      return [
        [{ text: title, cls: 'wc-c-section' }],
        [{ text: '─────┬' + '─'.repeat(T - 6), cls: 'wc-c-hint' }],
        ...bars.map((b, i): Seg[] => [
          { text: labels[i]!, cls: 'wc-st-label' },
          { text: '│', cls: 'wc-c-hint' },
          { text: b, cls },
        ]),
        [{ text: '     └' + '─'.repeat(buckets), cls: 'wc-c-hint' }],
        [
          {
            text: xAxis + endLabel.padStart(Math.max(cellLen(endLabel) + 1, 6 + buckets - cellLen(xAxis))),
            cls: 'wc-st-label',
          },
        ],
      ];
    };
    const xp = chart('XP/h', m?.xpGains ?? [], 'wc-st-gained');
    const tp = chart('TP/h', m?.tpGains ?? [], 'wc-st-tp');
    xp.forEach((l, i) => out.push(line(side(null, l), side(null, tp[i]!), `s${i}`)));
  }

  // XP ruler.
  if (showRuler) {
    blank('b4');
    const r = m?.ruler ? rulerRows(m.ruler, total) : null;
    if (r) {
      for (const [k, segs] of [
        ['rl', r.label],
        ['rb', r.bar],
        ['rm', r.marks],
      ] as const) {
        out.push(
          <div class="wc-line wc-stats-ruler" style={indent(left)} key={k}>
            <Segs segs={segs} />
          </div>,
        );
      }
    } else {
      const note = p.note ?? (m ? 'No XP data.' : 'Loading…');
      out.push(<div class="wc-line" key="rl" />);
      out.push(
        <div class="wc-line" style={indent(centreLeft(cols, cellLen(note)))} key="rb">
          <span class="wc-c-hint">{note}</span>
        </div>,
      );
      out.push(<div class="wc-line" key="rm" />);
    }
  }

  const footer = ['ESC Back', '↑↓ Scroll', 'Tab/Shift+Tab Switch table', ...(p.onRefresh ? ['R Refresh'] : [])];
  return (
    <div class="wc-page wc-stats">
      <div class="wc-body">{out}</div>
      <Footer tokens={footer} />
    </div>
  );
}

// ---------------------------------------------------------------- live

export interface LiveStatsProps {
  runs: LiveRuns;
  status: AppStatusView;
}

/** ESC → Statistics: the live run chain (Inv §7.3). */
export function LiveStatsFrame(p: LiveStatsProps): VNode {
  const isTop = useIsTop();
  const [model, setModel] = useState<StatsModel | null>(null);
  const [ended, setEnded] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState<string | undefined>(undefined);
  const busy = useRef(false);
  const had = useRef(false);

  const load = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (!p.runs.current()) {
        // The run ended: the data stays, the tick stops.
        if (had.current) setEnded(true);
        return;
      }
      const events = await p.runs.chainEvents();
      // A replay's events are on log time: no running clock.
      const live = !p.status.get().replay;
      setModel(buildStats(events, live ? { nowUs: nowUs() } : {}));
      had.current = true;
      setEnded(false);
      setNote(undefined);
    } catch (e) {
      setNote(`Could not read the run: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busy.current = false;
    }
  };
  const loadRating = async (): Promise<void> => {
    try {
      const lib = await p.runs.library();
      const id = p.runs.anchor();
      const s = lib && id ? await lib.chainOf(id, nowUs()) : null;
      setRating(s?.saved ? s.rating : 0);
    } catch {
      /* the header just shows no stars */
    }
  };

  useEffect(() => {
    void load();
    void loadRating();
  }, []);
  useEffect(() => {
    if (!isTop || ended) return;
    const t = setInterval(() => void load(), LIVE_TICK_MS);
    return () => clearInterval(t);
  }, [isTop, ended]);

  return (
    <StatsView
      model={model}
      header={liveHeader(model, rating, ended)}
      live
      note={note}
      onRefresh={() => {
        void load();
        void loadRating();
      }}
    />
  );
}

// ------------------------------------------------------------- archived

/** History → STATS: an archived chain (Inv §7.3, §7.4). */
export function SessionStatsFrame(p: { session: Session }): VNode {
  const { runs } = useServices();
  const [model, setModel] = useState<StatsModel | null>(null);
  const [note, setNote] = useState<string | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const lib = await runs();
        const events = await lib.events(p.session.runs.map((r) => r.runId));
        if (alive) setModel(buildStats(events, { character: p.session.character }));
      } catch (e) {
        if (alive) setNote(`Could not read the session: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return <StatsView model={model} header={sessionHeader(p.session)} live={false} note={note} />;
}
