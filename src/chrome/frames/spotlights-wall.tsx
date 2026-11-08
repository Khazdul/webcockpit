// The Spotlights page (stage 46, B "Galleriet"; ADR 0019, 0110, 0131): a
// wall of cards in the large box of layout B, one card per spotlight in
// reel order, with the Spotlights settings as the filter row above it.
//
//   [Back]                      ( Spotlights )
//      FILTER  [☆ Achievements][☠ Deaths][» Level-ups][⚔ PvP kills]  [All][Gittan][Rasta]  [All time ▾]
//      ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
//      │ ☠ DEATH      1 │ │ » LEVEL UP   2 │ │ ⚔ PVP KILL   3 │
//      │ ░ still: the   │ │ ░ last four    │ │ ░ lines of the │
//      │ ░ game text at │ │ ░ visible      │ │ ░ game text    │
//      │ Death (level…) │ │ Reached level… │ │ *Ibuki the …*  │
//      │ RASTA · level… │ │ GITTAN · level │ │ RASTA · level… │
//      └────────────────┘ └────────────────┘ └────────────────┘
//      ──────────────────────────────────────────────────────────
//      [▶ Play all]  5 spotlights · 01:12                 flash
//
// The card's still is the last visible lines before the moment, in the
// Default palette with the brighter red (`SPOTLIGHT_PALETTE_TWEAK`) while
// the viewer's Display colours are Default, else in that theme's
// background and font colour with the plain palette (`stillPalette`). The
// chosen card (`.is-on`) brightens; with the keyboard in the filter row it
// stays chosen but dimmer (`.is-idle`).
//
// Filter row (the settings, saved at once, `settings.spotlights`; Credits
// follows them, ADR 0110): one chip per kind with its icon, `All` and one
// chip per recorded character (`chipPatch`: a name while All is on shows
// only that name, the last name off turns All back on), the period as a
// native select. A change rebuilds the wall through the page's
// `WallSource` (the shell's `ReelSource`: only windows not read yet are
// read), latest change wins; the chosen card stays chosen when it still
// passes, else the first.
//
// States: a reel (the wall); nothing passes (the filter row stays, the
// wall says so); no data at all (no filter row; how spotlights are made).
// The foot's Play all stays in every state, disabled without a card.
//
// Keys. On the wall: arrows move in 2D (the columns from the layout),
// PgUp / PgDn, Home / End, Enter or Space plays the chosen card, P plays
// all, F (or Tab, or ↑ from the top row) moves the keyboard into the
// filter row, Esc / Back to the menu. In the filter row: ← → walk the
// chips and the period, Tab / Shift+Tab the groups (kinds, characters,
// period), Space / Enter toggles a chip or steps the period, ↓ or Esc back
// to the wall. Mouse: a click chooses a card, a double click plays; touch:
// a tap plays.
//
// The viewer (WP 46-B, `SpotlightsViewer`) is mounted over the box's
// window while a card plays: the wall stays laid out under it (inert) so
// the viewer can grow out of a card and shrink back into one
// (`cardRect(i)`); its keys are the player view's own, so the wall's
// handler swallows every key while it is open. `onLeave(i)` unmounts it
// and chooses card i (scrolled into view).

import { Component, type ComponentChildren, type VNode } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { type Color, type StyleRun, isTrueColor } from '../../core/types';
import type { Reel, ReelEmpty, StillLine } from '../../player/spotlight-reel';
import { KIND_COLOR } from '../../player/icons';
import { fmtClock } from '../../player/strip';
import { SPOTLIGHT_PERIODS, type SpotlightSettings } from '../../settings';
import {
  KIND_LABEL,
  PERIOD_LABELS,
  SPOTLIGHT_KINDS,
  SPOTLIGHT_PALETTE_TWEAK,
  type Spotlight,
  type SpotlightKindKey,
  chipPatch,
  chipsOn,
} from '../../share/spotlights';
import { DOS_PALETTE } from '../../theme/presets';
import { type ViewerTheme, themeColors } from '../../player/viewer';
import { colorToCss } from '../../ui/palette';
import { useServices, useSettings } from '../kit/hooks';
import {
  Box,
  BoxBody,
  BoxFoot,
  BoxHead,
  GlassButton,
  Icon,
  KeyLabel,
  LookFlash,
  type RowProps,
  Select,
  Seg,
  letterAction,
  lookFrame,
  useBoxSettled,
  useGridCursor,
} from '../kit/look';
import { isBrowserShortcut, useKeys, useNav } from '../kit/stack';
import { KIND_ICON } from './spotlights-icons';
import { SpotlightsViewer, keptSpotlightsHost } from './spotlights-viewer';
import './spotlights.css';

/** The empty states' texts (Inv §7.6; the filtered one ADR 0110). */
export const SPOTLIGHTS_EMPTY: Readonly<Record<ReelEmpty, string>> = {
  no_data:
    'No spotlights yet. Play a session, and your highlights (kills, deaths, level-ups and achievements) will be kept here, ready to replay.',
  filtered: 'No spotlights match your settings.',
};

/** The nothing-passes wall's second line. */
export const SPOTLIGHTS_FILTERED_HINT = 'Turn on a kind or a character above, or choose a longer period.';

// ------------------------------------------------------------ the page's model

/** A reel as the wall shows it: the reel, each card's still, its length. */
export interface WallReel {
  reel: Reel;
  /** Spotlight i's still (`spotStill`), index for index. */
  stills: readonly StillLine[][];
  /** The reel's playing length, ms (`reelLengthMs`). */
  lengthMs: number;
}

export type WallState = WallReel | { empty: ReelEmpty };

/** Loads the wall for the settings' filters (the shell's `ReelSource` and the reel module; tests: a double). */
export interface WallSource {
  load(filters: SpotlightSettings, nowUs: number): Promise<WallState>;
}

export interface SpotlightsWallProps {
  source: WallSource;
  /** The wall as loaded before the page opened. */
  reel: WallState;
  /** The recorded characters (the chips), alphabetical. */
  characters: readonly string[];
  /** Now, µs (the period's clock; tests). */
  now?: () => number;
}

/** What the viewer is given (WP 46-B's contract; `cardRect` also takes an index). */
interface Viewing {
  start: number;
  seq: number;
}

const hasReel = (s: WallState): s is WallReel => !('empty' in s);

// ------------------------------------------------------------ small helpers

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `26 Sep 2026`, local time (fixed English month names, whatever the locale's). */
export function cardDate(us: number): string {
  const d = new Date(us / 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** `12 spotlights · 03:12` (h:mm:ss from one hour), or '' for none. */
export function wallSummary(count: number, lengthMs: number): string {
  if (count <= 0) return '';
  return `${count} spotlight${count === 1 ? '' : 's'} · ${fmtClock(lengthMs, true)}`;
}

const STILL_PALETTES = new Map<ViewerTheme, Record<string, string>>();

/**
 * The stills' colours for the viewer's Display theme (the CSS custom
 * properties `--spw-a0` … `--spw-a15`, `--spw-fg`, `--spw-bg`, `--spw-bold`
 * on the page). Default: the Default (DOS) palette with the brighter red
 * on the page's near-black well (owner decision 4). A chosen theme keeps
 * its own red, as the viewer draws it: the plain palette (the theme sets
 * only the background and the font colour, `applyViewer`) on the theme's
 * background, in its font colour.
 */
export function stillPalette(theme: ViewerTheme): Record<string, string> {
  const had = STILL_PALETTES.get(theme);
  if (had) return had;
  const colors = themeColors(theme);
  const out: Record<string, string> = {};
  DOS_PALETTE.forEach((c, i) => (out[`--spw-a${i}`] = (colors ? undefined : SPOTLIGHT_PALETTE_TWEAK[i]) ?? c));
  if (colors) {
    out['--spw-fg'] = colors.fg;
    out['--spw-bg'] = colors.bg;
    // Bold in the font colour brightens it (white), except on Paper's light ground (ink stays ink).
    out['--spw-bold'] = theme === 'paper' ? colors.fg : '#ffffff';
  }
  STILL_PALETTES.set(theme, out);
  return out;
}

/** The Display theme the stills follow: the kept viewer host's (Default without one). */
function viewerTheme(): ViewerTheme {
  try {
    return keptSpotlightsHost()?.viewerControls(true).theme() ?? 'default';
  } catch {
    return 'default';
  }
}

/** The CSS colour of a still's run colour: the page's palette for 0–15 (bold brightens 0–7), else its own. */
function runColor(c: Color, bold: boolean): string {
  if (!isTrueColor(c) && c >= 0 && c < 16) return `var(--spw-a${bold && c < 8 ? c + 8 : c})`;
  return colorToCss(c);
}

/** One still line as spans. */
function stillLine(l: StillLine): ComponentChildren {
  if (l.cmd) return l.text;
  if (l.runs.length === 0) return l.text;
  const out: ComponentChildren[] = [];
  let at = 0;
  l.runs.forEach((r: StyleRun, k) => {
    if (r.start > at) out.push(l.text.slice(at, r.start));
    const style: Record<string, string> = {};
    const fg = r.inverse ? r.bg : r.fg;
    if (fg !== undefined) style.color = runColor(fg, !!r.bold);
    else if (r.bold) style.color = 'var(--spw-bold)';
    if (r.bold) style.fontWeight = '600';
    if (r.italic) style.fontStyle = 'italic';
    if (r.underline) style.textDecoration = 'underline';
    out.push(
      <span key={k} style={style}>
        {l.text.slice(r.start, r.end)}
      </span>,
    );
    at = r.end;
  });
  if (at < l.text.length) out.push(l.text.slice(at));
  return out;
}

// ------------------------------------------------------------ a card

interface CardProps {
  i: number;
  spot: Spotlight;
  still: readonly StillLine[];
  on: boolean;
  idle: boolean;
  rowProps: RowProps;
}

/** A card; renders again only when its spotlight or its selection changes (a wall can hold hundreds). */
class Card extends Component<CardProps> {
  override shouldComponentUpdate(n: CardProps): boolean {
    const p = this.props;
    return n.spot !== p.spot || n.still !== p.still || n.on !== p.on || n.idle !== p.idle || n.i !== p.i;
  }

  override render(): VNode {
    const { i, spot: s, still, on, idle, rowProps } = this.props;
    return (
      <div
        class={'wc-lk-row wc-spw-card' + (on ? (idle ? ' is-idle' : ' is-on') : '')}
        role="option"
        aria-selected={on ? 'true' : 'false'}
        aria-label={`${KIND_LABEL[s.kind]}: ${s.label}, ${s.character}`}
        data-id={s.id}
        data-kind={s.kind}
        style={{ '--k': KIND_COLOR[s.kind] }}
        {...rowProps}
      >
        <div class="wc-spw-top">
          <span class="wc-spw-kind">
            <Icon {...KIND_ICON[s.kind]} />
            {KIND_LABEL[s.kind]}
          </span>
          <span class="wc-spw-n">{i + 1}</span>
        </div>
        <div class="wc-spw-still" aria-hidden="true">
          {still.map((l, k) => (
            <div key={k} class={'wc-spw-ln' + (l.cmd ? ' is-cmd' : '')}>
              {stillLine(l)}
            </div>
          ))}
        </div>
        <div class="wc-spw-label">{s.label}</div>
        <div class="wc-spw-meta">
          <b>{s.character}</b>
          {s.level !== undefined ? ` · level ${s.level}` : ''} · {cardDate(s.atUs)}
        </div>
      </div>
    );
  }
}

// ------------------------------------------------------------ the filter row's stops

type Stop = { group: 'kind'; key: SpotlightKindKey } | { group: 'char'; name: string | null } | { group: 'period' };

function stopsOf(names: readonly string[]): Stop[] {
  return [
    ...SPOTLIGHT_KINDS.map((k): Stop => ({ group: 'kind', key: k.key })),
    { group: 'char', name: null },
    ...names.map((name): Stop => ({ group: 'char', name })),
    { group: 'period' },
  ];
}

const PERIOD_OPTIONS = SPOTLIGHT_PERIODS.map((v) => ({ value: v, label: PERIOD_LABELS[v] }));

// ------------------------------------------------------------ the page

export const SpotlightsWall = lookFrame(function SpotlightsWall(p: SpotlightsWallProps): VNode {
  const nav = useNav();
  const { settings: store } = useServices();
  const filters = useSettings().spotlights;
  const settled = useBoxSettled();
  const now = p.now ?? (() => Date.now() * 1000);

  const [state, setState] = useState<WallState>(p.reel);
  const reel = hasReel(state) ? state : null;
  const count = reel?.reel.spots.length ?? 0;
  const noData = !reel && 'empty' in state && state.empty === 'no_data';

  const [zone, setZone] = useState<'wall' | 'filter'>('wall');
  const [fsel, setFsel] = useState(0);
  const [view, setView] = useState<Viewing | null>(null);
  /** The Display theme the stills are drawn in (read from the viewer's host when it is left). */
  const [stillTheme, setStillTheme] = useState<ViewerTheme>(viewerTheme);
  const viewSeq = useRef(0);
  /** A rebuild is in flight (the latest one). */
  const loading = useRef(false);
  /** A card asked to play while it was (`id`; null: Play all), opened when the new wall lands. */
  const wantOpen = useRef<{ id: string | null } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const periodRef = useRef<HTMLDivElement>(null);

  const names = p.characters;
  const stops = useMemo(() => stopsOf(names), [names]);
  const periodStop = stops.length - 1;

  // ---------------------------------------------------------------- the grid

  const columns = (): number => {
    const el = gridRef.current;
    if (!el || typeof getComputedStyle !== 'function') return 1;
    return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  };
  /**
   * Plays card i (`all`: Play all, from the first). While a rebuild is in
   * flight the cards on screen are the old reel's: the open waits for the
   * new wall and plays that spotlight there (or the new first one), if it
   * still passes.
   */
  const openViewer = (i: number, all = false): void => {
    if (!reel || i < 0 || i >= count || view) return;
    if (loading.current) {
      wantOpen.current = { id: all ? null : (reel.reel.spots[i]?.id ?? null) };
      return;
    }
    setZone('wall');
    setView({ start: i, seq: ++viewSeq.current });
  };
  const grid = useGridCursor({
    count,
    columns,
    activateOn: 'dblclick',
    touch: 'tap-activates',
    onActivate: (i) => openViewer(i),
  });
  const gridKeyRef = grid.scrollRef as { current: HTMLElement | null };
  const setGrid = (el: HTMLDivElement | null): void => {
    gridRef.current = el;
    gridKeyRef.current = el;
  };

  /** Card i into view (the nearest edge; instant). */
  const reveal = (i: number): HTMLElement | null => {
    const card = gridRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`) ?? null;
    if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return card;
  };

  // After the box has landed, the chosen card into view (a remembered choice may be far down).
  useEffect(() => {
    if (settled && count > 0) reveal(grid.i);
  }, [settled]);

  // ---------------------------------------------------------------- rebuilds

  const seq = useRef(0);
  const keep = useRef<string | null>(null);
  const filterKey = JSON.stringify(filters);
  const loadedKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey === loadedKey.current) return;
    loadedKey.current = filterKey;
    const my = ++seq.current;
    loading.current = true;
    keep.current = reel?.reel.spots[grid.i]?.id ?? null;
    p.source.load(filters, now()).then(
      (next) => {
        if (my !== seq.current) return;
        loading.current = false;
        setState(next);
      },
      (err: unknown) => {
        if (my !== seq.current) return;
        loading.current = false;
        wantOpen.current = null;
        console.error('WebCockpit: Spotlights could not be loaded', err);
        nav.flash('Spotlights could not be loaded.', 'fail');
      },
    );
  }, [filterKey]);

  // A rebuilt wall keeps the chosen card when it still passes, else the
  // first; a card asked to play during the rebuild plays now.
  useLayoutEffect(() => {
    const want = wantOpen.current;
    wantOpen.current = null;
    if (!reel) return;
    const id = want ? want.id : keep.current;
    keep.current = null;
    const found = id === null ? -1 : reel.reel.spots.findIndex((s) => s.id === id);
    const j = want && want.id === null ? 0 : found;
    grid.set(Math.max(0, j));
    if (j > 0) reveal(j);
    else gridRef.current?.closest('.wc-lk-bbody')?.scrollTo?.({ top: 0 });
    if (want && j >= 0 && j < reel.reel.spots.length) {
      setZone('wall');
      setView({ start: j, seq: ++viewSeq.current });
    }
  }, [state]);

  const patch = (f: Partial<SpotlightSettings>): void => {
    if (Object.keys(f).length > 0) store.update({ spotlights: f });
  };
  const toggleStop = (s: Stop): void => {
    if (s.group === 'kind') patch({ [s.key]: !filters[s.key] });
    else if (s.group === 'char') patch(chipPatch(filters, s.name, names));
    else {
      const i = SPOTLIGHT_PERIODS.indexOf(filters.period);
      patch({ period: SPOTLIGHT_PERIODS[(i + 1) % SPOTLIGHT_PERIODS.length]! });
    }
  };

  // ---------------------------------------------------------------- the viewer

  /** The rect of card i (default: the chosen one), scrolled into view first (the viewer grows from it and shrinks back into it). */
  const cardRect = useRef((i?: number): DOMRect | null => null);
  cardRect.current = (i?: number) => {
    const card = reveal(i ?? grid.i);
    return card ? card.getBoundingClientRect() : null;
  };
  const viewerRect = useCallback((i?: number) => cardRect.current(i), []);
  const keepChosen = useRef<number | null>(null);
  const leave = useCallback((i: number): void => {
    keepChosen.current = i;
    setStillTheme(viewerTheme());
    setView(null);
    setZone('wall');
  }, []);
  useLayoutEffect(() => {
    const i = keepChosen.current;
    if (view || i === null) return;
    keepChosen.current = null;
    grid.set(i);
    reveal(i);
  }, [view]);

  /** Back while the viewer is open leaves it as Esc does (the viewer's keys are the player view's). */
  const back = (): void => {
    if (!view) return nav.pop();
    const win = gridRef.current?.ownerDocument.defaultView;
    win?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  };

  // ---------------------------------------------------------------- keys

  const toFilter = (): void => {
    if (noData) return;
    setZone('filter');
    if (fsel > periodStop) setFsel(0);
  };
  const playAll = (): void => openViewer(0, true);
  const blurPeriod = (): void => {
    const sel = periodRef.current?.querySelector('select');
    if (sel && sel.ownerDocument.activeElement === sel) sel.blur();
  };
  const groupStart = (g: Stop['group']): number => stops.findIndex((s) => s.group === g);

  useKeys((e, nk) => {
    // The viewer's keys are the player view's own (a window listener after the stack's); the browser's shortcuts pass.
    if (view) return !isBrowserShortcut(e);
    const inSelect = (e.target as HTMLElement | null)?.tagName === 'SELECT';
    if (zone === 'filter') {
      if (nk === 'back' || nk === 'down') {
        blurPeriod();
        setZone('wall');
        return true;
      }
      if (inSelect) return false;
      if (letterAction(e, { p: playAll, f: () => {} })) return true;
      if (nk === 'left' || nk === 'right') {
        setFsel((s) => Math.max(0, Math.min(periodStop, s + (nk === 'left' ? -1 : 1))));
        return true;
      }
      if (nk === 'tab' || nk === 'backtab') {
        const groups: Stop['group'][] = ['kind', 'char', 'period'];
        const g = groups.indexOf(stops[fsel]!.group);
        const to = groups[(g + (nk === 'tab' ? 1 : groups.length - 1)) % groups.length]!;
        setFsel(groupStart(to));
        return true;
      }
      if (nk === 'activate') {
        toggleStop(stops[fsel]!);
        return true;
      }
      return nk !== null;
    }
    if (inSelect && nk === 'back') {
      blurPeriod();
      return true;
    }
    if (letterAction(e, { p: playAll, f: toFilter })) return true;
    if (nk === 'back') {
      nav.pop();
      return true;
    }
    if (nk === 'tab' || nk === 'backtab') {
      toFilter();
      return true;
    }
    if (nk === 'up' && (count === 0 || grid.i < columns())) {
      toFilter();
      return true;
    }
    return grid.key(e, nk);
  });

  // ---------------------------------------------------------------- render

  const kindsOn = SPOTLIGHT_KINDS.filter((k) => filters[k.key]).map((k) => k.kind);
  const charValues = filters.allCharacters ? ['*'] : chipsOn(filters, names);
  const sel = zone === 'filter' ? stops[fsel] : undefined;
  const kindSel = sel?.group === 'kind' ? fsel : undefined;
  const charSel = sel?.group === 'char' ? fsel - groupStart('char') : undefined;

  return (
    <Box
      title="Spotlights"
      size="large"
      onBack={back}
      class="wc-spw"
      winClass={'wc-spw-win' + (view ? ' is-viewing' : '')}
    >
      <div class="wc-spw-wall" style={stillPalette(stillTheme)} data-still-theme={stillTheme} inert={view ? true : undefined}>
        {!noData && (
          <BoxHead class={'wc-spw-head' + (zone === 'filter' ? ' is-cur' : '')}>
            <span class="wc-spw-cap" aria-hidden="true">
              <Icon name="filter" />
              <KeyLabel text="Filter" letter="f" />
            </span>
            <div class="wc-spw-kinds">
              <Seg
                multi
                kind="pills"
                label="Kinds"
                options={SPOTLIGHT_KINDS.map((k) => ({ value: k.kind, id: k.kind, label: k.label, icon: KIND_ICON[k.kind] }))}
                values={kindsOn}
                selected={kindSel}
                onChange={(v) => {
                  const i = SPOTLIGHT_KINDS.findIndex((k) => k.kind === v);
                  setFsel(i);
                  toggleStop(stops[i]!);
                }}
              />
            </div>
            <div class="wc-spw-chars">
              <Seg
                multi
                kind="pills"
                label="Characters"
                options={[{ value: '*', id: 'all', label: 'All' }, ...names.map((n) => ({ value: n, label: n }))]}
                values={charValues}
                selected={charSel}
                onChange={(v) => {
                  const k = v === '*' ? 0 : names.indexOf(v) + 1;
                  setFsel(groupStart('char') + k);
                  toggleStop(stops[groupStart('char') + k]!);
                }}
              />
              {names.length === 0 && <span class="wc-spw-none">No characters recorded yet.</span>}
            </div>
            <div class={'wc-spw-period' + (sel?.group === 'period' ? ' is-sel' : '')} ref={periodRef}>
              <Select
                label="Period"
                id="period"
                value={filters.period}
                options={PERIOD_OPTIONS}
                onChange={(v) => {
                  setFsel(periodStop);
                  patch({ period: v as SpotlightSettings['period'] });
                  blurPeriod();
                }}
              />
            </div>
          </BoxHead>
        )}
        <BoxBody class="wc-spw-body">
          {reel ? (
            <div class="wc-spw-grid" role="listbox" aria-label="Spotlights" ref={setGrid}>
              {reel.reel.spots.map((s, i) => (
                <Card
                  key={s.id}
                  i={i}
                  spot={s}
                  still={reel.stills[i] ?? []}
                  on={i === grid.i}
                  idle={zone !== 'wall'}
                  rowProps={grid.rowProps(i)}
                />
              ))}
            </div>
          ) : (
            <div class="wc-spw-grid is-empty" ref={setGrid}>
              <p class="wc-lk-empty wc-spw-empty">
                {noData ? SPOTLIGHTS_EMPTY.no_data : SPOTLIGHTS_EMPTY.filtered}
                {!noData && <small>{SPOTLIGHTS_FILTERED_HINT}</small>}
              </p>
            </div>
          )}
        </BoxBody>
        <BoxFoot class="wc-spw-foot">
          <GlassButton id="PLAY" label="Play all" letter="p" icon="play" primary disabled={count === 0} onClick={playAll} />
          <span class="wc-spw-sum">{reel ? wallSummary(count, reel.lengthMs) : ''}</span>
          <LookFlash class="wc-spw-flash" />
        </BoxFoot>
      </div>
      {view && reel && (
        <SpotlightsViewer key={view.seq} reel={reel.reel} start={view.start} cardRect={viewerRect} onLeave={leave} />
      )}
    </Box>
  );
});
