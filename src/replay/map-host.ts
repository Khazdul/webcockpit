// The Map pane host of an HTML replay page (ADR 0020 "Replays"): the map
// subset the export embedded (src/replay/map-embed.ts), its tiles and
// fonts as data URIs, and a transparent tile for any tile left out. A
// payload without a map gives a host that loads nothing. An exported set
// whose flow marks draw untinted says so (`streamsAsIs`, ADR 0088), and
// carries its room tints (`tints`, ADR 0088 addendum).

import { EMPTY_PNG } from '../map/assets';
import type { MapPaneHost, RoomTints } from '../map/protocol';
import type { ReplayMap } from '../share/payload';
import { fromBase64 } from './codec';

const HEX = /^#[0-9a-f]{6}$/i;

/** A payload's room tints, if well formed (the page reads untrusted files). */
function validTints(t: unknown): t is RoomTints {
  if (!t || typeof t !== 'object') return false;
  const x = t as Record<string, unknown>;
  return typeof x.dark === 'string' && HEX.test(x.dark) && typeof x.noSundeath === 'string' && HEX.test(x.noSundeath);
}

export function replayMapHost(map: ReplayMap | undefined): MapPaneHost {
  if (!map || typeof map.mm2 !== 'string') return { source: () => null, assets: { kind: 'inline', files: {} } };
  const bytes = fromBase64(map.mm2);
  return {
    // A fresh buffer per load: the pane transfers it to its worker (and a
    // backward seek builds a new App with a new pane).
    source: () => ({ kind: 'bytes', bytes: bytes.slice().buffer, name: map.name }),
    assets: {
      kind: 'inline',
      files: map.files ?? {},
      fallback: EMPTY_PNG,
      ...(map.streamsAsIs === true ? { streamsAsIs: true } : {}),
      ...(validTints(map.tints) ? { tints: map.tints } : {}),
    },
  };
}
