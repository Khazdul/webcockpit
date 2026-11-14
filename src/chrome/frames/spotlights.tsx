// Spotlights on the start page (ADR 0019, Inv §7.6). History's
// Spotlights tab (`SpotlightsTab`, stage 67, ADR 0149) loads the reel and
// shows the Spotlights page, B "Galleriet" (stage 46): a wall of cards in the large box with
// the filter row above it (src/chrome/frames/spotlights-wall.tsx); a card
// plays in the viewer over the box (spotlights-viewer.tsx). No data and
// nothing passing are states of the wall, not pages of their own (the
// old-look empty pages and the settings popup they opened are gone,
// stage 46/47 wave 3).

import type { VNode } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Reel } from '../../player/spotlight-reel';
import type { RunLibrary } from '../../runs/library';
import { type ChromeServices, useServices } from '../kit/hooks';
import { Box, BoxBody } from '../kit/look';
import { type Nav, useKeys, useNav } from '../kit/stack';
import { HistoryFrame } from './history';
import { useHistoryTabs } from './history-tabs';
import { SpotlightsWall, type WallReel, type WallSource, type WallState } from './spotlights-wall';

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

/** The tab's texts while the wall cannot be shown. */
export const SPOTLIGHTS_TAB_TEXT = {
  loading: 'Loading spotlights…',
  unavailable: 'Spotlights are not available here.',
  failed: 'Spotlights could not be loaded.',
} as const;

type TabState =
  | { kind: 'loading' | 'unavailable' | 'failed' }
  | { kind: 'wall'; source: WallSource; reel: WallState; characters: readonly string[] };

/**
 * History's Spotlights tab (stage 67, ADR 0149): loads the reel each time
 * the tab is shown (a new `ReelSource`, as the menu's Spotlights row did:
 * a session deleted on Sessions is gone here) and shows the page on its
 * wall of cards (or the nothing-passes or no-data wall). While it loads,
 * or when it cannot, the tab is the page's box with a line of text (shown
 * only if loading takes a moment). The reel plays in an embedded player
 * (`services.embedPlayer`); without one the page is not available.
 */
export function SpotlightsTab(): VNode {
  const services = useServices();
  const [state, setState] = useState<TabState>(() => (services.embedPlayer ? { kind: 'loading' } : { kind: 'unavailable' }));
  useEffect(() => {
    if (!services.embedPlayer) return;
    let live = true;
    void (async () => {
      try {
        const [mod, lib] = await Promise.all([import('../../player/spotlight-reel'), services.runs()]);
        const source = wallSource(mod, lib);
        const [reel, characters] = await Promise.all([source.load(services.settings.get().spotlights, Date.now() * 1000), lib.characters()]);
        if (live) setState({ kind: 'wall', source, reel, characters });
      } catch (err) {
        console.error('WebCockpit: Spotlights could not open', err);
        if (live) setState({ kind: 'failed' });
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  if (state.kind === 'wall') return <SpotlightsWall source={state.source} reel={state.reel} characters={state.characters} />;
  return <SpotlightsWait text={SPOTLIGHTS_TAB_TEXT[state.kind]} kind={state.kind} />;
}

/** The tab's box while the wall cannot be shown: the strip and one line. */
function SpotlightsWait(p: { text: string; kind: string }): VNode {
  const nav = useNav();
  const tabs = useHistoryTabs('Spotlights');
  useKeys((e, nk) => tabs.key(e) || (nk !== null && nk !== 'back'));
  return (
    <Box title={tabs.title} size="large" onBack={() => nav.pop()} class="wc-spw-wait" winClass={'wc-spw-win' + tabs.winClass}>
      {tabs.strip}
      <BoxBody class="wc-spw-body">
        <div class="wc-spw-grid is-empty" data-state={p.kind}>
          <p class={'wc-lk-empty wc-spw-empty' + (p.kind === 'loading' ? ' wc-htab-wait' : '')}>{p.text}</p>
        </div>
      </BoxBody>
    </Box>
  );
}

/**
 * The old Spotlights row of the start menu (until the menu of stage 67 is
 * in, ADR 0149): History opened on its Spotlights tab. `services` is no
 * longer used (the tab loads its reel itself).
 */
export function startSpotlights(nav: Nav, _services?: ChromeServices): void {
  nav.push(<HistoryFrame tab="spotlights" />);
}
