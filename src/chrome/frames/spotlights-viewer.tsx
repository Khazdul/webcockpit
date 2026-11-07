// STAND-IN (WP 46-A): the Spotlights viewer belongs to WP 46-B, which
// replaces this whole file. It exists so the wall (spotlights-wall.tsx)
// builds, plays and can be tested on its own branch: the reel in an
// embedded, bare player over the box's window, from card `start` on,
// ← → previous / next spotlight (`navTarget`), every other key the player
// view's own, Esc (the view's `onEsc`) back to the wall on the current
// spotlight. No head, track, controls, grow / shrink, end card or Display.
//
// The contract (stage 46, "WP 46-A and 46-B agree on this contract"):
// `SpotlightsViewer({ reel, start, cardRect, onLeave })`; the wall's
// `cardRect` also takes a card index (`cardRect(current)`), and Back on
// the box sends an Esc keydown, which the player view handles.

import type { VNode } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { PlayerHost } from '../../app/player-host';
import { PANE_IDS, type PaneId } from '../../layout/types';
import type { Reel } from '../../player/spotlight-reel';
import { SPOTLIGHT_PALETTE_TWEAK } from '../../share/spotlights';
import { useSkyPause } from '../start-surface';
import { useServices } from '../kit/hooks';

export function SpotlightsViewer(p: {
  reel: Reel;
  start: number;
  cardRect: () => DOMRect | null;
  onLeave: (current: number) => void;
}): VNode {
  const services = useServices();
  const slot = useRef<HTMLDivElement>(null);
  const props = useRef(p);
  props.current = p;
  useSkyPause(true);

  useEffect(() => {
    let host: PlayerHost | null = null;
    let dead = false;
    void (async () => {
      const el = slot.current;
      const [mod, tl, h] = await Promise.all([
        import('../../player/spotlight-reel'),
        import('../../player/timeline'),
        el && services.embedPlayer ? services.embedPlayer(el) : Promise.resolve(null),
      ]);
      if (!h) {
        if (!dead) props.current.onLeave(props.current.start);
        return;
      }
      if (dead) return h.close();
      host = h;
      const { reel, start } = props.current;
      let starts: number[] = [];
      const current = (): number => (h.engine ? mod.spotAt(starts, h.engine.position) : start);
      const panes: Partial<Record<PaneId, boolean>> = {};
      for (const id of PANE_IDS) panes[id] = false;
      h.setViewer({ ...h.viewerOverrides, panes });
      h.setPaletteTweak(SPOTLIGHT_PALETTE_TWEAK);
      h.openChain(
        reel.chain,
        [],
        { character: reel.spots[0]!.character },
        {
          edits: { windows: reel.spots.map((s) => ({ fromUs: s.fromUs, toUs: s.toUs })), blankLines: tl.BLANK_LINES },
          marks: (t) => {
            starts = mod.spotStarts(t);
            return mod.reelMarks(t, reel.spots);
          },
          view: {
            bare: true,
            hours: true,
            onEsc: () => props.current.onLeave(current()),
            keys: (e) => {
              if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
              const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!dir) return false;
              const eng = h.engine;
              const t = eng ? mod.navTarget(starts, eng.position, dir) : null;
              if (eng && t !== null) {
                const parked = eng.atEnd;
                eng.seek(t);
                if (parked) eng.play();
              }
              return true;
            },
          },
          viewerSettings: 'display',
          autoplay: true,
        },
      );
      h.hideTempPanes();
      if (h.scriptPaneIds.length > 0) {
        for (const id of h.scriptPaneIds) panes[id] = false;
        h.setViewer({ ...h.viewerOverrides, panes });
      }
      if (start > 0 && starts[start] !== undefined) h.engine?.seek(starts[start]!);
    })();
    return () => {
      dead = true;
      host?.close();
    };
  }, []);

  return (
    <div
      class="wc-spv-standin"
      aria-label="Spotlight"
      style={{ position: 'absolute', inset: 0, zIndex: 8, display: 'flex', padding: '44px 22px 10px', background: 'rgba(11, 9, 7, 0.97)' }}
    >
      <div class="wc-spv-slot" ref={slot} style={{ flex: '1 1 auto', position: 'relative', minHeight: 0 }} />
    </div>
  );
}
