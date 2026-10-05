// Viewer overrides (ADR 0021): font, theme, pane toggles and layout over
// the recorded settings; cycles; reset.
import { legacyLayout } from './legacy-defaults';
import { describe, expect, it } from 'vitest';
import { PANE_IDS } from '../../src/layout/types';
import { overlayView } from '../../src/player/fit';
import {
  VIEWER_FONTS,
  VIEWER_THEMES,
  applyViewer,
  cycle,
  hasLayoutOverride,
  noOverrides,
  resetLayout,
  themeColors,
  viewerLabel,
  withLayout,
  withPane,
} from '../../src/player/viewer';
import { defaultSettings, migrateSettings } from '../../src/settings';
import { movePane, moveToNewLane } from '../../src/layout/model';

describe('viewer overrides', () => {
  it('no overrides leave the settings as recorded', () => {
    const s = defaultSettings();
    s.appearance.size = 13;
    s.appearance.bg = '#0e141c';
    const before = JSON.stringify(s);
    applyViewer(s, noOverrides());
    expect(JSON.stringify(s)).toBe(before);
    expect(hasLayoutOverride(noOverrides())).toBe(false);
  });

  it('font: Small 12, Medium 15, Large 18; Default keeps the recorded size', () => {
    const px = VIEWER_FONTS.map((font) => {
      const s = defaultSettings();
      s.appearance.size = 21;
      applyViewer(s, { ...noOverrides(), font });
      return s.appearance.size;
    });
    expect(px).toEqual([21, 12, 15, 18]);
  });

  it('theme: preset bg/fg and every pane None; Default keeps the recorded colours', () => {
    const want = {
      dark: ['#000000', '#c0c0c0'],
      teal: ['#002b36', '#c0c0c0'],
      paper: ['#f4ecd8', '#000000'],
      sepia: ['#2b1b12', '#c0c0c0'],
      slate: ['#1c2128', '#c0c0c0'],
    };
    for (const [theme, [bg, fg]] of Object.entries(want)) {
      const s = defaultSettings();
      applyViewer(s, { ...noOverrides(), theme: theme as keyof typeof want });
      expect([s.appearance.bg, s.appearance.fg]).toEqual([bg, fg]);
      expect(PANE_IDS.map((id) => s.panes[id].color)).toEqual(PANE_IDS.map(() => 'black'));
      // Borders and on/off stay as recorded.
      expect(s.panes.timers.border).toBe(true);
      expect(s.panes.timers.on).toBe(true);
    }
    const s = defaultSettings();
    s.panes.timers.color = 'red';
    applyViewer(s, noOverrides());
    expect(s.panes.timers.color).toBe('red');
    expect(themeColors('default')).toBeNull();
  });

  it('pane toggles and the layout win over a later VIEW record', () => {
    const layout = movePane(legacyLayout(), 'group', 'left', 0, 0);
    let o = withPane(noOverrides(), 'comm', false);
    o = withPane(o, 'map', true);
    o = withLayout(o, layout);
    const s = defaultSettings();
    s.panes.map.on = false;
    // A VIEW record passes: recorded layout and panes, then the viewer's.
    overlayView(s, { panes: defaultSettings().panes, layout: legacyLayout() });
    applyViewer(s, o);
    expect(s.panes.comm.on).toBe(false);
    expect(s.panes.map.on).toBe(true);
    expect(s.panes.character.on).toBe(true);
    expect(s.layout).toEqual(layout);
    expect(s.layout).not.toBe(o.layout);
    expect(hasLayoutOverride(o)).toBe(true);
  });

  it('withLayout copies; reset drops panes and layout, keeps font and theme', () => {
    const layout = legacyLayout();
    const o = withLayout({ ...noOverrides(), font: 'large', theme: 'paper' }, layout);
    layout.docks.right.lanes[0]!.size = 99;
    expect(o.layout!.docks.right.lanes[0]!.size).not.toBe(99);
    const r = resetLayout(withPane(o, 'ui', false));
    expect(r).toEqual({ font: 'large', theme: 'paper' });
    expect(hasLayoutOverride(r)).toBe(false);
  });

  it('spans survive the viewer layout and a replay migration (ADR 0067)', () => {
    let layout = moveToNewLane(legacyLayout(), 'group', 'right', 1, 20);
    layout = movePane(layout, 'ui', 'right', 'head', 0);
    const o = withLayout(noOverrides(), layout);
    layout.docks.right.head.length = 0;
    expect(o.layout!.docks.right.head.map((p) => p.id)).toEqual(['ui']);
    const s = defaultSettings();
    applyViewer(s, o);
    expect(s.layout.docks.right.head.map((p) => p.id)).toEqual(['ui']);
    // A recorded settings payload (replay page, VIEW) goes through migrateSettings.
    const replay = migrateSettings(JSON.parse(JSON.stringify(s)));
    expect(replay.layout).toEqual(s.layout);
    // An old recording without spans gets empty ones.
    const old = JSON.parse(JSON.stringify(defaultSettings()));
    delete old.layout.docks.right.head;
    delete old.layout.docks.right.tail;
    expect(migrateSettings(old).layout.docks.right).toMatchObject({ head: [], tail: [] });
  });

  it('cycles wrap both ways; labels', () => {
    expect(cycle(VIEWER_FONTS, 'default')).toBe('small');
    expect(cycle(VIEWER_FONTS, 'large')).toBe('default');
    expect(cycle(VIEWER_FONTS, 'default', -1)).toBe('large');
    expect(cycle(VIEWER_THEMES, 'slate')).toBe('default');
    expect(VIEWER_THEMES.map(viewerLabel)).toEqual(['Default', 'Dark', 'Teal', 'Paper', 'Sepia', 'Slate']);
    expect(VIEWER_FONTS.map(viewerLabel)).toEqual(['Default', 'Small', 'Medium', 'Large']);
  });
});
