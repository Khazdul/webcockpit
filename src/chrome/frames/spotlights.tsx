// Spotlights on the start page (ADR 0019, Inv §7.6). Start menu →
// Spotlights (`startSpotlights`) loads the reel and opens the Spotlights
// page, B "Galleriet" (stage 46): a wall of cards in the large box with
// the filter row above it (src/chrome/frames/spotlights-wall.tsx); a card
// plays in the viewer over the box (spotlights-viewer.tsx). No data and
// nothing passing are states of the wall, not pages of their own (the
// old-look empty pages and the settings popup they opened are gone,
// stage 46/47 wave 3).

import type { Reel } from '../../player/spotlight-reel';
import type { RunLibrary } from '../../runs/library';
import type { ChromeServices } from '../kit/hooks';
import type { Nav } from '../kit/stack';
import { SpotlightsWall, type WallReel, type WallSource } from './spotlights-wall';

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
