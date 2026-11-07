// Spotlights on the start page (ADR 0019, Inv §7.6). Start menu →
// Spotlights (`startSpotlights`) loads the reel and opens the Spotlights
// page, B "Galleriet" (stage 46): a wall of cards in the large box with
// the filter row above it (src/chrome/frames/spotlights-wall.tsx); a card
// plays in the viewer over the box (spotlights-viewer.tsx). No data and
// nothing passing are states of the wall, not pages of their own.
//
// This file also keeps the old-look empty-state frames that Credits still
// uses (until stage 47 rebuilds Credits):
//
// - No data (no event of any kind in any run): title, a centred body,
//   `Any key to return`.
// - Filtered (events exist, the Spotlights settings let none through; ADR
//   0110): `No … match your settings.` and a `Settings…` row that opens
//   the Spotlights settings popup, drawn inside the page. Esc closes the
//   popup first, then the page. When the popup closes after a change, the
//   owner tries again (`onSettingsClosed`): Credits builds the chronicle
//   again.

import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { Reel } from '../../player/spotlight-reel';
import type { RunLibrary } from '../../runs/library';
import { useGrid, useServices } from '../kit/hooks';
import { wrapText } from '../kit/nav';
import { type Nav, useKeys, useNav } from '../kit/stack';
import { Blank, Centered, type MenuItem, MenuRows, Page, menuKey, useBodyRows, useMenuCursor } from '../kit/widgets';
import type { ChromeServices } from '../kit/hooks';
import { placeNear } from '../../menubar/popup';
import { SpotlightsPopup } from '../popups/spotlights-settings';
import { SPOTLIGHTS_EMPTY, SpotlightsWall, type WallReel, type WallSource } from './spotlights-wall';
import '../popups/popups.css';

export type EmptyKind = 'no_data' | 'filtered';

/** Empty-state bodies (our own wording, Inv §7.6; the filtered ones ADR 0110); Spotlights' live with its wall. */
export { SPOTLIGHTS_EMPTY };

export const CREDITS_EMPTY: Readonly<Record<EmptyKind, string>> = {
  no_data:
    'No chronicle yet. Your tale is written as you play: kills, deaths, level-ups and achievements each earn a line. Come back once you have made some history.',
  filtered: 'No chronicle entries match your settings.',
};

/** Keys that are not "a key" for `Any key to return` (bare modifiers). */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** Title, a body centred on the page, and `Any key to return` (any key or ESC pops). */
export function EmptyStateFrame(p: { title: string; body: string }): VNode {
  const nav = useNav();
  const { cols } = useGrid();
  const rows = useBodyRows();
  useKeys((e) => {
    if (MODIFIERS.has(e.key)) return false;
    nav.pop();
    return true;
  });
  const lines = wrapText(p.body, Math.max(20, Math.min(cols - 8, 64)));
  const top = Math.max(0, Math.floor((rows - lines.length) / 2) - 1);
  return (
    <Page title={p.title} footer={['Any key to return']}>
      <div class="wc-empty-state" onClick={() => nav.pop()}>
        <Blank n={top} />
        {lines.map((l) => (
          <Centered text={l} class="wc-c-body" />
        ))}
      </div>
    </Page>
  );
}

/**
 * The "filtered" page (ADR 0110): the body, then a `Settings…` row (Enter,
 * Space or a click) that opens the Spotlights settings popup next to it.
 * `onSettingsClosed(changed)` runs when the popup closes; `changed` when the
 * settings differ from when it opened.
 */
export function FilteredFrame(p: { title: string; body: string; onSettingsClosed: (changed: boolean) => void }): VNode {
  const nav = useNav();
  const { settings } = useServices();
  const { cols } = useGrid();
  const rows = useBodyRows();
  const [open, setOpen] = useState(false);
  const before = useRef('');
  const ref = useRef<HTMLDivElement>(null);
  const snap = (): string => JSON.stringify(settings.get().spotlights);
  const close = (): void => {
    setOpen(false);
    ref.current?.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
    p.onSettingsClosed(snap() !== before.current);
  };
  const toggle = (): void => {
    if (open) return close();
    before.current = snap();
    setOpen(true);
  };
  const items: MenuItem[] = [{ key: 'settings', label: 'Settings…', activate: toggle }];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => {
    if (nk === 'back') {
      if (open) close();
      else nav.pop();
      return true;
    }
    return menuKey(items, cursor, setCursor, nk);
  });
  const lines = wrapText(p.body, Math.max(20, Math.min(cols - 8, 64)));
  // A third down, not centred: the popup opens below `Settings…` without covering the text.
  const top = Math.max(0, Math.floor((rows - lines.length - 2) / 3));
  const place = (el: HTMLElement): void => {
    const a = ref.current?.querySelector('.wc-mrow[data-key="settings"] .wc-label');
    if (a) placeNear(el, a);
  };
  return (
    <Page title={p.title} footer={['Enter Settings', 'ESC Back']}>
      <div class="wc-empty-state wc-empty-filtered" ref={ref}>
        <Blank n={top} />
        {lines.map((l) => (
          <Centered text={l} class="wc-c-body" />
        ))}
        <Blank />
        <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      </div>
      {open && <SpotlightsPopup place={place} onClose={close} focusOnOpen />}
    </Page>
  );
}

// ------------------------------------------------------------ the Spotlights page (stage 46)

type ReelModule = typeof import('../../player/spotlight-reel');

/** The wall for a loaded reel: each card's still and the reel's length, once per load. */
function wallReel(mod: ReelModule, reel: Reel): WallReel {
  return { reel, stills: reel.spots.map((_, i) => mod.spotStill(reel, i)), lengthMs: mod.reelLengthMs(reel) };
}

/**
 * The page's source: one `ReelSource` for as long as the page is open, so
 * the runs are read once and a rebuild for new settings reads only the
 * windows not read yet (ADR 0110).
 */
function wallSource(mod: ReelModule, lib: RunLibrary): WallSource {
  const src = new mod.ReelSource(lib);
  return {
    async load(filters, nowUs) {
      const r = await src.load(filters, nowUs);
      return 'empty' in r ? r : wallReel(mod, r);
    },
  };
}

/**
 * Start page → Spotlights: loads the reel (`Loading spotlights…` on the
 * menu) and opens the page on its wall of cards (or the nothing-passes or
 * no-data wall). `busy` guards against a second activation while it loads.
 * The reel plays in an embedded player (`services.embedPlayer`); without
 * one the page is not available.
 */
let busy = false;
export async function startSpotlights(nav: Nav, services: ChromeServices): Promise<void> {
  if (busy) return;
  if (!services.embedPlayer) return nav.flash('Spotlights are not available here.', 'fail');
  busy = true;
  try {
    nav.flash('Loading spotlights…');
    const [mod, lib] = await Promise.all([import('../../player/spotlight-reel'), services.runs()]);
    const source = wallSource(mod, lib);
    const [reel, characters] = await Promise.all([source.load(services.settings.get().spotlights, Date.now() * 1000), lib.characters()]);
    nav.push(<SpotlightsWall source={source} reel={reel} characters={characters} />);
  } catch (err) {
    console.error('WebCockpit: Spotlights could not open', err);
    nav.flash('Spotlights could not be loaded.', 'fail');
  } finally {
    busy = false;
  }
}
