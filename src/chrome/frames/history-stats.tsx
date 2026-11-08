// History → Stats in the new look (stage 45 WP 45-B, ADR 0130; Inv §7.3,
// §7.4): the session's details in History's own large box (stage 42's box
// swap: the box stays, the hood's title and the content cross-fade; Back /
// Esc returns to History as it was).
//
//   GIBUR  LEVEL 41   Session details · Friday, 6 November 2026 · 21:12 · 3h41m · 2 runs · ★★★★
//   ─────────────────────────────────────────────────────────────────────
//   ALLIES                          ACHIEVEMENTS
//   ♦ Lindir                        ⇈ Reached level 41          1:11:10
//   KILLS      N   XP/N  XP TOT ▾   PVPS              N     XP ▾
//   a stone troll 10  2.6k  25.9k   ⚔ *Ugluk the Orc*  2   30.1k
//   Total     64          77.2k     Total              2   30.1k
//   XP PER HOUR (sparkline)         TP PER HOUR (sparkline)
//   EXPERIENCE  ├──── 95.3k XP ────┤ the ruler across both columns
//
// A new component, not a restyle of statistics.tsx: that renderer also
// serves the in-game Statistics pane (ADR 0109) and the phone's ESC menu,
// which stay as they are. The data model is the same (`buildStats`,
// `rateSeries`) and so are the pure helpers (`sortKills`, `sortPvps`,
// `nextStatSort`, `fmtK`, `fmtClock`).
//
// Keys: Tab / Shift+Tab move the focus over the four tables (the focused
// section's head in the accent colour), ↑↓ scroll the focused table a row,
// PgUp / PgDn a page, Home / End; Esc back. A press or the wheel on a table
// focuses it; a click on a head sorts it (the same head flips). When the
// focused table does not scroll (the phone: one column, tables unbounded),
// the keys scroll the box's body instead.
//
// Performance: the sparkline paths and the ruler's geometry are built once
// per data load (memoised on the model), not per render; no animation of
// its own; no backdrop-filter (ADR 0127).

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { xpForLevel } from '../../gmcp/levels';
import type { PvpRow, KillRow, StatsModel, XpRuler } from '../../runs/stats';
import { buildStats, rateSeries } from '../../runs/stats';
import type { Session } from '../../runs/stitch';
import { useServices } from '../kit/hooks';
import { Box, BoxBody, BoxHead, Icon, type IconDraw, Stars, Table, TableRow, lookFrame } from '../kit/look';
import { useKeys, useNav } from '../kit/stack';
import { HISTORY_MAX_W, fmtDur, fmtLongDate, fmtTime } from './history-model';
import {
  DEFAULT_KILL_SORT,
  DEFAULT_PVP_SORT,
  type KillSortKey,
  type PvpSortKey,
  type StatSort,
  fmtClock,
  fmtK,
  nextStatSort,
  sortKills,
  sortPvps,
} from './stats-layout';
import './history-stats.css';

/** Samples per sparkline (one `rateSeries` call per chart and data load). */
export const SPARK_BUCKETS = 48;

/** The sparkline's drawing box: x 0 … buckets − 1, y 0 … SPARK_H (stretched to the chart's width). */
export const SPARK_H = 74;

/** The four focusable sections, in Tab order. */
export const STAT_SECTIONS = ['allies', 'achievements', 'kills', 'pvps'] as const;
export type StatSection = (typeof STAT_SECTIONS)[number];

const KILLS = 2;
const PVPS = 3;

/** A row's height when the focused table cannot tell (↑↓ scroll by it). */
const ROW_PX = 27;

// ------------------------------------------------------------------ text

/** The head's line without the stars: `Session details · Friday, 6 November 2026 · 21:12 · 3h41m · 2 runs`. */
export function statsWhen(s: Session): string {
  const n = s.runs.length;
  return [
    'Session details',
    fmtLongDate(s.startUs),
    fmtTime(s.startUs),
    fmtDur(s.endUs - s.startUs),
    ...(n > 0 ? [`${n} run${n === 1 ? '' : 's'}`] : []),
  ].join(' · ');
}

// ------------------------------------------------------------- sparkline

/** A sparkline's paths in its drawing box (x 0 … n − 1, y 0 … SPARK_H) and its y maximum. */
export interface SparkPaths {
  /** The filled area under the line, closed along the bottom. */
  area: string;
  line: string;
  /** The largest value (the y axis's top label); 0 for an empty chart. */
  max: number;
  /** The drawing box's width (n − 1, at least 1). */
  w: number;
}

const n1 = (v: number): string => String(Math.round(v * 10) / 10);

/** The sparkline of `values` (gains per hour): one path for the line, one for the area under it. */
export function sparkPaths(values: readonly number[]): SparkPaths {
  const vals = values.length >= 2 ? values : values.length === 1 ? [values[0]!, values[0]!] : [0, 0];
  const max = Math.max(0, ...vals);
  const w = vals.length - 1;
  const y = (v: number): number => (max > 0 ? SPARK_H - (Math.max(0, v) / max) * (SPARK_H - 6) - 1 : SPARK_H - 1);
  const pts = vals.map((v, i) => `${i} ${n1(y(v))}`);
  const line = 'M' + pts.join(' L');
  const area = `M0 ${SPARK_H} L` + pts.join(' L') + ` L${w} ${SPARK_H} Z`;
  return { area, line, max: values.length ? Math.max(0, ...values) : 0, w };
}

// ------------------------------------------------------------------ ruler

/** The XP ruler as the page draws it: positions in percent of the track. */
export interface RulerView {
  /** The gained (or lost) band: from `a` to `b` (%). */
  a: number;
  b: number;
  loss: boolean;
  /** `95.3k XP`, `−12.0k XP`. */
  label: string;
  /** The level marks (the first at 0 %, the last at 100 %). */
  marks: { level: number; at: number }[];
}

/** Below this band width (%) the label floats free over the band instead of spanning it. */
export const RULER_LABEL_MIN = 14;

export function rulerView(r: XpRuler): RulerView {
  const span = Math.max(1, r.toXp - r.fromXp);
  const at = (xp: number): number => Math.max(0, Math.min(100, ((xp - r.fromXp) / span) * 100));
  const a = at(Math.min(r.startXp, r.nowXp));
  const b = at(Math.max(r.startXp, r.nowXp));
  const loss = r.delta < 0;
  const marks: RulerView['marks'] = [];
  for (let L = r.fromLevel; L <= r.toLevel; L++) marks.push({ level: L, at: at(xpForLevel(L)) });
  return { a, b, loss, label: `${loss ? '−' : ''}${fmtK(Math.abs(r.delta))} XP`, marks };
}

// ------------------------------------------------------------------ icons

/** The spotlight kind drawings (src/player/icons.ts `KIND_PATH`; a unit test keeps them equal). */
export const HS_PATH = {
  pkill: 'M4 4l9.5 9.5 M11.5 15.5l4-4 M14 14l4.5 4.5 M20 4l-9.5 9.5 M8.5 11.5l4 4 M10 14l-4.5 4.5',
  achievement: 'M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z',
  level: 'M6.5 12.5l5.5-5.5 5.5 5.5 M6.5 18l5.5-5.5 5.5 5.5',
} as const;

const draw = (d: string): IconDraw => ({ draw: <path d={d} />, box: 24 });
const PKILL = draw(HS_PATH.pkill);
const ACHIEVEMENT = draw(HS_PATH.achievement);
const LEVEL = draw(HS_PATH.level);

// ------------------------------------------------------------------ the page

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

const KILL_HEADS = [
  { key: 'name', label: 'Kills', sort: true },
  { key: 'n', label: 'N', sort: true, align: 'end' as const },
  { key: 'xpPer', label: 'XP/N', sort: true, align: 'end' as const },
  { key: 'xpTotal', label: 'XP tot', sort: true, align: 'end' as const },
];
const PVP_HEADS = [
  { key: 'name', label: 'PvPs', sort: true },
  { key: 'n', label: 'N', sort: true, align: 'end' as const },
  { key: 'xp', label: 'XP', sort: true, align: 'end' as const },
];

function Spark(p: { kind: 'xp' | 'tp'; spark: SparkPaths; durUs: number }): VNode {
  const { spark } = p;
  return (
    <div class={'wc-hs-spark is-' + p.kind} data-chart={p.kind}>
      <div class="wc-hs-y" aria-hidden="true">
        <span>{fmtK(spark.max)}</span>
        <span>{fmtK(spark.max / 2)}</span>
        <span>0</span>
      </div>
      <svg viewBox={`0 0 ${spark.w} ${SPARK_H}`} preserveAspectRatio="none" role="img" aria-label={`Peak ${fmtK(spark.max)} per hour`}>
        <path class="wc-hs-ar" d={spark.area} />
        <path class="wc-hs-ln" d={spark.line} />
      </svg>
      <div class="wc-hs-x" aria-hidden="true">
        <span>00:00</span>
        <span>{fmtClock(p.durUs)}</span>
      </div>
    </div>
  );
}

function Ruler(p: { view: RulerView }): VNode {
  const v = p.view;
  const free = v.b - v.a < RULER_LABEL_MIN;
  const mid = (v.a + v.b) / 2;
  return (
    <div class={cx('wc-hs-ruler', v.loss && 'is-loss')}>
      {free ? (
        <div class="wc-hs-rlabel is-free" style={{ left: `${mid}%`, transform: `translateX(-${mid}%)` }}>
          <span>{v.label}</span>
        </div>
      ) : (
        <div class="wc-hs-rlabel" style={{ left: `${v.a}%`, width: `${v.b - v.a}%` }}>
          <span>{v.label}</span>
        </div>
      )}
      <div class="wc-hs-rtrack">
        <i class="wc-hs-rband" style={{ left: `${v.a}%`, width: `${v.b - v.a}%` }} />
        {v.marks.map((m) => (
          <b key={m.level} style={{ left: `${m.at}%` }} />
        ))}
      </div>
      <div class="wc-hs-rmarks">
        {v.marks.map((m, i) => (
          <span key={m.level} class={cx(i === 0 && 'is-first', i === v.marks.length - 1 && i > 0 && 'is-end')} style={{ left: `${m.at}%` }}>
            {m.level}
          </span>
        ))}
      </div>
    </div>
  );
}

/** What the page draws from a loaded model (built once per load). */
interface Drawn {
  xp: SparkPaths;
  tp: SparkPaths;
  ruler: RulerView | null;
}

function drawn(m: StatsModel): Drawn {
  const start = m.startUs ?? 0;
  const end = m.endUs ?? start;
  const series = (g: StatsModel['xpGains']): number[] =>
    m.startUs === null ? new Array<number>(SPARK_BUCKETS).fill(0) : rateSeries(g, start, end, SPARK_BUCKETS);
  return { xp: sparkPaths(series(m.xpGains)), tp: sparkPaths(series(m.tpGains)), ruler: m.ruler ? rulerView(m.ruler) : null };
}

/** History → Stats: one archived session's details, in History's box. */
export const HistoryStatsFrame = lookFrame(function HistoryStatsFrame(p: { session: Session }): VNode {
  const s = p.session;
  const nav = useNav();
  const { runs } = useServices();
  const [model, setModel] = useState<StatsModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState(KILLS);
  const [ks, setKs] = useState<StatSort<KillSortKey>>(DEFAULT_KILL_SORT);
  const [ps, setPs] = useState<StatSort<PvpSortKey>>(DEFAULT_PVP_SORT);
  const bodyRef = useRef<HTMLDivElement>(null);
  const secRefs = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)];
  const scrollRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const lib = await runs();
        const events = await lib.events(s.runs.map((r) => r.runId));
        if (alive) setModel(buildStats(events, { character: s.character }));
      } catch (e) {
        if (alive) setError(`Could not read the session: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The heads and the Total rows leave room for the rows' scrollbar: its real
  // width (8 px in Chromium, 0 with overlay scrollbars, as in Firefox on
  // Linux), read when a table's rows change size, never per frame.
  useLayoutEffect(() => {
    const RO = globalThis.ResizeObserver;
    const bodies = [scrollRefs[KILLS]!.current, scrollRefs[PVPS]!.current].filter((b): b is HTMLDivElement => !!b);
    const put = (b: HTMLElement): void => {
      const gut = Math.max(0, b.offsetWidth - b.clientWidth);
      b.closest<HTMLElement>('.wc-hs-tbl')?.style.setProperty('--hs-gut', `${gut}px`);
    };
    bodies.forEach(put);
    if (!RO) return;
    const ro = new RO((es) => es.forEach((e) => put(e.target as HTMLElement)));
    bodies.forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, [model]);

  const pics = useMemo(() => (model ? drawn(model) : null), [model]);
  const kills = useMemo(() => sortKills(model?.kills ?? [], ks), [model, ks]);
  const pvps = useMemo(() => sortPvps(model?.pvps ?? [], ps), [model, ps]);

  /** The element the keys scroll: the focused table when it overflows, else the box's body. */
  const scroller = (): HTMLElement | null => {
    const el = scrollRefs[focus]!.current;
    if (el && el.scrollHeight > el.clientHeight + 1) return el;
    return bodyRef.current;
  };

  /** Brings a section into the body's view (the phone's one column), without scrolling the page. */
  const reveal = (i: number): void => {
    const body = bodyRef.current;
    const sec = secRefs[i]!.current;
    if (!body || !sec) return;
    const b = body.getBoundingClientRect();
    const r = sec.getBoundingClientRect();
    if (r.top < b.top) body.scrollTop += r.top - b.top - 8;
    else if (r.bottom > b.bottom) body.scrollTop += Math.min(r.top - b.top - 8, r.bottom - b.bottom + 8);
  };

  useKeys((_e, nk) => {
    switch (nk) {
      case 'tab':
      case 'backtab': {
        const next = (focus + (nk === 'tab' ? 1 : STAT_SECTIONS.length - 1)) % STAT_SECTIONS.length;
        setFocus(next);
        reveal(next);
        return true;
      }
      case 'up':
      case 'down': {
        const el = scroller();
        if (el) {
          const row = scrollRefs[focus]!.current?.querySelector<HTMLElement>('.wc-lk-tr')?.offsetHeight || ROW_PX;
          el.scrollTop += nk === 'up' ? -row : row;
        }
        return true;
      }
      case 'pgup':
      case 'pgdn': {
        const el = scroller();
        if (el) el.scrollTop += (nk === 'pgup' ? -1 : 1) * Math.max(ROW_PX, el.clientHeight - ROW_PX);
        return true;
      }
      case 'home': {
        const el = scroller();
        if (el) el.scrollTop = 0;
        return true;
      }
      case 'end': {
        const el = scroller();
        if (el) el.scrollTop = el.scrollHeight;
        return true;
      }
    }
    return false;
  });

  const level = s.level ?? model?.level ?? null;
  const rated = s.saved && s.rating > 0;

  /** A focusable section: a press or the wheel focuses it. */
  const sec = (i: number, cls: string, children: ComponentChildren): VNode => (
    <section
      ref={secRefs[i]}
      class={cx('wc-hs-sec', cls, focus === i && 'is-focus')}
      data-sec={STAT_SECTIONS[i]}
      onPointerDown={() => setFocus(i)}
      onWheel={() => focus !== i && setFocus(i)}
    >
      {children}
    </section>
  );

  const content = (m: StatsModel, d: Drawn): VNode => (
    <div class="wc-hs-grid">
      {sec(
        0,
        'wc-hs-small',
        <>
          <h3 class="wc-lk-sec">Allies</h3>
          <div ref={scrollRefs[0]} class="wc-hs-scroll wc-lk-scroll wc-hs-allies">
            {m.allies.length ? (
              m.allies.map((a) => (
                <span class="wc-hs-ally" key={a}>
                  <i aria-hidden="true">♦</i>
                  {a}
                </span>
              ))
            ) : (
              <span class="wc-hs-none">Played alone.</span>
            )}
          </div>
        </>,
      )}
      {sec(
        1,
        'wc-hs-small',
        <>
          <h3 class="wc-lk-sec">Achievements</h3>
          <div ref={scrollRefs[1]} class="wc-hs-scroll wc-lk-scroll wc-hs-ach">
            {m.milestones.length ? (
              m.milestones.map((x, i) => (
                <div class="wc-hs-mile" data-kind={x.kind} key={i}>
                  <Icon {...(x.kind === 'level' ? LEVEL : ACHIEVEMENT)} />
                  <span class="wc-hs-mtext">{x.text.slice(2)}</span>
                  <span class="wc-hs-at">{fmtClock(x.us - (m.startUs ?? x.us))}</span>
                </div>
              ))
            ) : (
              <span class="wc-hs-none">None this session.</span>
            )}
          </div>
        </>,
      )}
      {sec(
        KILLS,
        'wc-hs-tsec',
        <div class="wc-hs-tbl" data-tbl="kills">
          <Table
            cols="var(--hs-kcols)"
            heads={KILL_HEADS}
            sort={ks}
            onSort={(k) => {
              setKs(nextStatSort(ks, k as KillSortKey));
              setFocus(KILLS);
              if (scrollRefs[KILLS]!.current) scrollRefs[KILLS]!.current.scrollTop = 0;
            }}
            scroll
            bodyRef={scrollRefs[KILLS]}
          >
            {kills.length ? (
              kills.map((k: KillRow) => (
                <TableRow key={k.name} id={k.name}>
                  <span class="wc-lk-td" title={k.name}>
                    {k.name}
                  </span>
                  <span class="wc-lk-td is-end">{k.n}</span>
                  <span class="wc-lk-td is-end">{fmtK(k.xpPer)}</span>
                  <span class="wc-lk-td is-end">{fmtK(k.xpTotal)}</span>
                </TableRow>
              ))
            ) : (
              <TableRow class="wc-hs-nonerow">
                <span class="wc-lk-td wc-hs-none">No kills.</span>
              </TableRow>
            )}
          </Table>
          {m.killTotal.n > 0 && (
            <div class="wc-hs-total" role="row">
              <span>Total</span>
              <span class="is-end">{m.killTotal.n}</span>
              <span />
              <span class="is-end">{fmtK(m.killTotal.xp)}</span>
            </div>
          )}
        </div>,
      )}
      {sec(
        PVPS,
        'wc-hs-tsec',
        <div class="wc-hs-tbl" data-tbl="pvps">
          <Table
            cols="var(--hs-pcols)"
            heads={PVP_HEADS}
            sort={ps}
            onSort={(k) => {
              setPs(nextStatSort(ps, k as PvpSortKey));
              setFocus(PVPS);
              if (scrollRefs[PVPS]!.current) scrollRefs[PVPS]!.current.scrollTop = 0;
            }}
            scroll
            bodyRef={scrollRefs[PVPS]}
          >
            {pvps.length ? (
              pvps.map((v: PvpRow) => (
                <TableRow key={v.label} id={v.label}>
                  <span class="wc-lk-td wc-hs-pk" title={v.label}>
                    <Icon {...PKILL} />
                    {v.label}
                  </span>
                  <span class="wc-lk-td is-end">{v.n}</span>
                  <span class="wc-lk-td is-end">{fmtK(v.xp)}</span>
                </TableRow>
              ))
            ) : (
              <TableRow class="wc-hs-nonerow">
                <span class="wc-lk-td wc-hs-none">No PvP this session.</span>
              </TableRow>
            )}
          </Table>
          {m.pvpTotal.n > 0 && (
            <div class="wc-hs-total" role="row">
              <span>Total</span>
              <span class="is-end">{m.pvpTotal.n}</span>
              <span class="is-end">{fmtK(m.pvpTotal.xp)}</span>
            </div>
          )}
        </div>,
      )}
      <section class="wc-hs-sec wc-hs-chart" data-sec="xph">
        <h3 class="wc-lk-sec">XP per hour</h3>
        <Spark kind="xp" spark={d.xp} durUs={m.durationUs} />
      </section>
      <section class="wc-hs-sec wc-hs-chart" data-sec="tph">
        <h3 class="wc-lk-sec">TP per hour</h3>
        <Spark kind="tp" spark={d.tp} durUs={m.durationUs} />
      </section>
      <section class="wc-hs-sec wc-hs-ruler-sec" data-sec="experience">
        <h3 class="wc-lk-sec">Experience</h3>
        {d.ruler ? <Ruler view={d.ruler} /> : <p class="wc-hs-noxp">No XP data.</p>}
      </section>
    </div>
  );

  return (
    <Box
      title="Statistics"
      size="large"
      maxWidth={HISTORY_MAX_W}
      onBack={() => nav.pop()}
      class="wc-hs-box"
      winClass="wc-hs"
    >
      <BoxHead class="wc-hs-head">
        <div class="wc-hs-who">
          <span class="wc-hs-name">{s.character}</span>
          {level !== null && <span class="wc-hs-lvl">Level {level}</span>}
        </div>
        <div class="wc-hs-when">
          {statsWhen(s)}
          {rated && (
            <>
              {' · '}
              <Stars n={s.rating} />
            </>
          )}
        </div>
      </BoxHead>
      <BoxBody class="wc-hs-body" bodyRef={bodyRef}>
        {model && pics ? (
          content(model, pics)
        ) : (
          <p class={cx('wc-lk-empty', 'wc-hs-note', error && 'wc-lk-bad')} role={error ? 'alert' : 'status'}>
            {error ?? 'Loading…'}
          </p>
        )}
      </BoxBody>
    </Box>
  );
});
