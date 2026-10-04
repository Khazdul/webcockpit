// Credits (ADR 0019 "Credits", Inv §7.6): every character's deeds rolled
// up the screen like end credits. The chronicle (src/share/chronicle.ts)
// is built once from every stored run's events (no log needed), filtered
// by Options → Spotlights, in a centred column min(60, max(40, cols − 8))
// wide.
//
// Scroll: 1 row/s, bottom to top, smooth. The first line starts on the
// bottom row; when `The End.` has left the top the frame pops back to the
// menu. The column moves with a Web Animations transform (linear, on the
// compositor), so the roll costs no script per frame and nothing at all
// when the frame is not shown. A resize keeps the elapsed time.
//
// Fade: the top and bottom 35 % fade linearly between the canvas colour
// and white. The text is white and the view has a mask that goes from
// transparent to opaque over those bands, which over the canvas is exactly
// that blend. `Escape to exit` sits top-right in #555555. Only ESC is bound.

import './credits.css';
import { device } from '../../core/device';
import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { RunLibrary } from '../../runs/library';
import { buildChronicle, type ChronicleRun } from '../../share/chronicle';
import { emptyState } from '../../share/spotlights';
import { useCells, useGrid, useServices, useSettings } from '../kit/hooks';
import { cellLen, centreLeft } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { indent } from '../kit/widgets';
import { EscToken } from '../kit/esc';
import { CREDITS_EMPTY, EmptyStateFrame } from './spotlights';
import type { SpotlightSettings } from '../../settings';

/** Scroll speed, rows per second (Inv §7.6). */
export const CREDITS_ROWS_PER_S = 1;
/** Share of the view each fade band takes. */
export const CREDITS_FADE = 0.35;
export const CREDITS_HINT = 'Escape to exit';

/** The column width for a grid `cols` wide. */
export function creditsWidth(cols: number): number {
  // A phone narrower than 48 columns: the column fits the grid (ADR 0075 §3.2).
  if (device().phone && cols - 8 < 40) return Math.max(20, Math.min(40, cols - 2));
  return Math.min(60, Math.max(40, cols - 8));
}

/**
 * The roll for `lines` in a view `rows` high with cells `cellH` px high:
 * the column's start and end offsets (px from the view top) and the time
 * between. It starts with the first line on the bottom row and ends when
 * the last non-blank line (`The End.`) has left the top.
 */
export function creditsRoll(lines: readonly string[], rows: number, cellH: number): { fromY: number; toY: number; ms: number } {
  let last = lines.length - 1;
  while (last > 0 && lines[last] === '') last--;
  const travel = rows + last; // rows from "first line on the bottom row" to "last line above the top"
  return { fromY: (rows - 1) * cellH, toY: -(last + 1) * cellH, ms: (travel * 1000) / CREDITS_ROWS_PER_S };
}

/** Every stored run with its events (the chronicle's input). */
async function chronicleRuns(lib: RunLibrary): Promise<ChronicleRun[]> {
  const metas = await lib.store.listRuns();
  return Promise.all(metas.map(async (meta) => ({ meta, events: await lib.events([meta.runId]) })));
}

export function CreditsFrame(): VNode {
  const { runs } = useServices();
  const settings = useSettings();
  const nav = useNav();
  const [data, setData] = useState<ChronicleRun[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    runs()
      .then(chronicleRuns)
      .then((r) => live && setData(r))
      .catch((err: unknown) => {
        console.error('WebCockpit: Credits could not load the runs', err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [runs]);
  if (failed) return <EmptyStateFrame title="Credits" body="The chronicle could not be read from this browser's storage." />;
  if (!data) {
    return <LoadingFrame />;
  }
  return <CreditsRoll runs={data} filters={settings.spotlights} onDone={() => nav.pop()} />;
}

function LoadingFrame(): VNode {
  useKeys((_e, nk) => nk !== null && nk !== 'back');
  return <div class="wc-page wc-credits" />;
}

function CreditsRoll(p: { runs: ChronicleRun[]; filters: SpotlightSettings; onDone: () => void }): VNode {
  const { cols, rows } = useGrid();
  const cells = useCells();
  const width = creditsWidth(cols);
  const lines = useMemo(() => buildChronicle(p.runs, p.filters, { width }), [p.runs, p.filters, width]);
  if (lines.length === 0) return <EmptyStateFrame title="Credits" body={CREDITS_EMPTY[emptyState(p.filters)]} />;
  return <Roll lines={lines} cols={cols} rows={rows} cellH={cells.h} width={width} onDone={p.onDone} />;
}

function Roll(p: { lines: string[]; cols: number; rows: number; cellH: number; width: number; onDone: () => void }): VNode {
  const nav = useNav();
  const colRef = useRef<HTMLDivElement>(null);
  const started = useRef<number | null>(null);
  const done = useRef(p.onDone);
  done.current = p.onDone;
  // Only ESC is bound; other keys do nothing (nav keys keep their default prevented).
  useKeys((_e, nk) => {
    if (nk === 'back') {
      nav.pop();
      return true;
    }
    return nk !== null;
  });

  useLayoutEffect(() => {
    const el = colRef.current;
    if (!el || !(p.cellH > 0) || p.rows <= 0) return;
    const roll = creditsRoll(p.lines, p.rows, p.cellH);
    const now = performance.now();
    started.current ??= now;
    const elapsed = Math.min(roll.ms, now - started.current);
    const from = `translateY(${roll.fromY}px)`;
    const to = `translateY(${roll.toY}px)`;
    if (typeof el.animate !== 'function') {
      // No Web Animations (test DOMs): place it and end on time.
      el.style.transform = from;
      const t = setTimeout(() => done.current(), roll.ms - elapsed);
      return () => clearTimeout(t);
    }
    const a = el.animate([{ transform: from }, { transform: to }], { duration: roll.ms, easing: 'linear', fill: 'forwards' });
    a.currentTime = elapsed;
    a.onfinish = () => done.current();
    return () => {
      a.onfinish = null;
      a.cancel();
    };
  }, [p.lines, p.rows, p.cellH]);

  const at = centreLeft(p.cols, p.width);
  const band = `${CREDITS_FADE * 100}%`;
  const mask = `linear-gradient(to bottom, transparent 0, #000 ${band}, #000 calc(100% - ${band}), transparent 100%)`;
  return (
    <div class="wc-page wc-credits">
      <div class="wc-credits-view" style={{ maskImage: mask, WebkitMaskImage: mask }}>
        <div class="wc-credits-col" ref={colRef}>
          {p.lines.map((l) => (
            <div class="wc-line" style={indent(at + centreLeft(p.width, cellLen(l)))}>
              {l}
            </div>
          ))}
        </div>
      </div>
      <div class="wc-line wc-credits-hint" style={indent(Math.max(0, p.cols - 2 - CREDITS_HINT.length))}>
        {device().touch ? <EscToken text={CREDITS_HINT} /> : CREDITS_HINT}
      </div>
    </div>
  );
}
