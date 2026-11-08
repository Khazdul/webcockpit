// History → Run log (stage 45 owner feedback 2026-11-08, ADR 0130): the
// run log player in the start page's big box, over the still sky.
//
//   ┌──────────────── ( Run log ) ────────────────┐
//   │ [Back]  Gibur (L41) · Run 1 of 2 · …   hints │
//   │ the player cockpit                     │rail │
//   │                              [control box]   │
//   └──────────────────────────────────────────────┘
//
// History opens the session first (`services.openRunLog`: the host loads
// parked out of sight, so a failed open shows History's error box and
// History stays) and pushes this frame with the playing host. The frame is
// a large box (layout B), so the push is the kit's box swap: History's box
// stays, its hood's title turns to "Run log" and the player fades in. The
// host's element moves into the box's window and fills it; the player
// keeps everything it has (Back, header, rail, control box, popups, keys).
// The box's own Back is not drawn: the player's Back (which hides with its
// chrome) is the way back, with Esc and the control box's Close.
//
// Fullscreen (the control box's button) puts the player's own element in
// the browser's fullscreen (player-host.ts): it fills the screen without
// the box or the sky, and leaving fullscreen any way (the button, the
// browser's Esc, F11) puts it back in the box.
//
// Keys: the player owns them while the frame shows (`usePlayerKeys`, as
// the Spotlights viewer); its Esc closes an open popup, then the player.
// The host's close disposes it and the frame pops itself: History is shown
// as it was (filter, sort, cursor, scroll). A frame that goes another way
// (the stack torn down) disposes the host. The sky pauses while the frame
// shows (`useSkyPause`): it stays as a still picture around the box.

import type { VNode } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { PlayerHost } from '../../app/player-host';
import { Box, lookFrame } from '../kit/look';
import { useIsTop, useNav, usePlayerKeys } from '../kit/stack';
import { useSkyPause } from '../start-surface';
import './run-log.css';

export const RunLogFrame = lookFrame(function RunLogFrame(p: { host: PlayerHost }): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const top = useRef(isTop);
  top.current = isTop;
  const slot = useRef<HTMLDivElement>(null);
  usePlayerKeys(true);
  useSkyPause(true);

  useLayoutEffect(() => {
    const host = p.host;
    let gone = false;
    if (host.isClosed) {
      nav.pop();
      return;
    }
    slot.current?.appendChild(host.el);
    // Esc, Back or Close: the host is gone; back to History.
    host.onDispose(() => {
      if (!gone && top.current) nav.pop();
    });
    return () => {
      gone = true;
      host.dispose();
    };
  }, [p.host]);

  const close = (): void => p.host.close();
  return (
    <Box title="Run log" size="large" onBack={close} class="wc-rl-box" winClass="wc-rl-win">
      <div class="wc-rl-slot" ref={slot} />
    </Box>
  );
});
