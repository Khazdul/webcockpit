// Viewer overrides (ADR 0021 "Viewer overrides"): what the person watching
// a log (RUN LOG, the HTML replay, the Spotlights reel) changed on top of
// the recorded screen — font size, colour theme, pane on/off (built-in
// and script panes, ADR 0053 P1) and the pane layout. The PlayerHost holds one `ViewerOverrides` per open (never a
// player App, so it survives the App rebuild of a backward seek) and
// composes the player settings as
//
//   viewer's settings → every VIEW record so far (overlayView) → applyViewer
//
// so the recorded screen applies first and the viewer's choices always win,
// later VIEW records included. Nothing here is saved (ADR 0021 "Not saved").
// Pure.

import { type LayoutModel, type PaneId, isScriptPaneId } from '../layout/types';
import { type Settings, paneSettingsOf } from '../settings/types';
import { TERMINAL_BG_PRESETS, TERMINAL_FG_PRESETS } from '../theme/presets';

export type ViewerFont = 'default' | 'small' | 'medium' | 'large';
export type ViewerTheme = 'default' | 'dark' | 'teal' | 'paper' | 'sepia' | 'slate';

/** Cycle orders (the settings section's `◄ name ►`). */
export const VIEWER_FONTS: readonly ViewerFont[] = ['default', 'small', 'medium', 'large'];
export const VIEWER_THEMES: readonly ViewerTheme[] = ['default', 'dark', 'teal', 'paper', 'sepia', 'slate'];

/** Font sizes in CSS px; `default` keeps the recorded size. */
export const VIEWER_FONT_PX: Readonly<Record<Exclude<ViewerFont, 'default'>, number>> = {
  small: 12,
  medium: 15,
  large: 18,
};

/** Theme background / foreground by preset name (src/theme/presets.ts). */
export const VIEWER_THEME_PRESETS: Readonly<Record<Exclude<ViewerTheme, 'default'>, { bg: string; fg: string }>> = {
  dark: { bg: 'black', fg: 'silver' },
  teal: { bg: 'teal', fg: 'silver' },
  paper: { bg: 'paper', fg: 'ink' },
  sepia: { bg: 'sepia', fg: 'silver' },
  slate: { bg: 'slate', fg: 'silver' },
};

const LABELS: Readonly<Record<ViewerFont | ViewerTheme, string>> = {
  default: 'Default',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  dark: 'Dark',
  teal: 'Teal',
  paper: 'Paper',
  sepia: 'Sepia',
  slate: 'Slate',
};

/** The settings section's name for a font or theme choice. */
export function viewerLabel(v: ViewerFont | ViewerTheme): string {
  return LABELS[v];
}

export interface ViewerOverrides {
  font: ViewerFont;
  theme: ViewerTheme;
  /** Pane on/off chosen by the viewer; absent = recorded. */
  panes?: Partial<Record<PaneId, boolean>>;
  /** The viewer's layout (docks, order, sizes, floats); absent = recorded. */
  layout?: LayoutModel;
}

/** Nothing changed: the recorded screen. */
export function noOverrides(): ViewerOverrides {
  return { font: 'default', theme: 'default' };
}

/** The next (dir +1) or previous (−1) entry of `list` after `cur`, wrapping. */
export function cycle<T>(list: readonly T[], cur: T, dir: 1 | -1 = 1): T {
  const i = list.indexOf(cur);
  const n = list.length;
  return list[(((i < 0 ? 0 : i + dir) % n) + n) % n]!;
}

const hexOf = (list: typeof TERMINAL_BG_PRESETS, name: string): string => list.find((c) => c.name === name)!.hex;

/** `theme`'s terminal colours, or null for `default` (the recorded ones). */
export function themeColors(theme: ViewerTheme): { bg: string; fg: string } | null {
  if (theme === 'default') return null;
  const p = VIEWER_THEME_PRESETS[theme];
  return { bg: hexOf(TERMINAL_BG_PRESETS, p.bg), fg: hexOf(TERMINAL_FG_PRESETS, p.fg) };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Applies `o` to `draft` (a settings store update, after the recorded VIEW
 * parts). Font: the size; theme: bg/fg and every pane's colour `black`
 * (None); panes: `on`; layout: replaced whole.
 */
export function applyViewer(draft: Settings, o: Readonly<ViewerOverrides>): void {
  if (o.font !== 'default') draft.appearance.size = VIEWER_FONT_PX[o.font];
  const colors = themeColors(o.theme);
  if (colors) {
    draft.appearance.bg = colors.bg;
    draft.appearance.fg = colors.fg;
    for (const id of Object.keys(draft.panes) as PaneId[]) {
      const p = draft.panes[id];
      if (p) p.color = 'black';
    }
  }
  if (o.panes) {
    for (const [id, on] of Object.entries(o.panes) as Array<[PaneId, boolean | undefined]>) {
      if (on === undefined) continue;
      const p = draft.panes[id];
      if (p) p.on = on;
      // A script pane without an entry has the defaults (ADR 0053).
      else if (isScriptPaneId(id)) draft.panes[id] = { ...paneSettingsOf(draft.panes, id), on };
    }
  }
  if (o.layout) draft.layout = clone(o.layout);
}

/** `o` with pane `id` switched `on`. */
export function withPane(o: Readonly<ViewerOverrides>, id: PaneId, on: boolean): ViewerOverrides {
  return { ...o, panes: { ...o.panes, [id]: on } };
}

/** `o` with the viewer's `layout` (a copy). */
export function withLayout(o: Readonly<ViewerOverrides>, layout: LayoutModel): ViewerOverrides {
  return { ...o, layout: clone(layout) };
}

/** Reset layout: the recorded panes and layout again (font and theme stay). */
export function resetLayout(o: Readonly<ViewerOverrides>): ViewerOverrides {
  return { font: o.font, theme: o.theme };
}

/** The viewer changed panes or the layout (Reset has something to do). */
export function hasLayoutOverride(o: Readonly<ViewerOverrides>): boolean {
  return o.layout !== undefined || (o.panes !== undefined && Object.keys(o.panes).length > 0);
}
