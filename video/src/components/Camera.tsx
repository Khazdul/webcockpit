// The camera over a recording: shows the whole recording, or zooms into a
// box from the timeline (video px) and back. A zoom keeps one point of the
// picture still and changes the scale geometrically, so it reads as moving
// in, not sliding; the box is grown to the frame's aspect with a margin and
// kept inside the picture.
import type { ReactNode } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Box } from '../timeline';

export interface Shot {
  /** The box to zoom into, video px. */
  box: Box;
  /** Frames: zoom in from `in` over `inFor`, out from `out` over `outFor`. */
  in: number;
  inFor: number;
  out: number;
  outFor: number;
  /** Space around the box, a share of its size (default 0.08). */
  margin?: number;
  /** Where the box sits in the frame when it does not fill it: 0 left/top … 1 right/bottom (default 0.5). */
  alignX?: number;
  alignY?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part of the picture (composition px) a shot ends on. */
function target(s: Shot, scale: number, W: number, H: number): Rect {
  const m = s.margin ?? 0.08;
  const bw = s.box.w * scale * (1 + 2 * m);
  const bh = s.box.h * scale * (1 + 2 * m);
  const k = Math.min(1, Math.max(bw / W, bh / H));
  const w = W * k;
  const h = H * k;
  const cx = (s.box.x + s.box.w / 2) * scale;
  const cy = (s.box.y + s.box.h / 2) * scale;
  const x = cx - w * (s.alignX ?? 0.5);
  const y = cy - h * (s.alignY ?? 0.5);
  return { x: Math.min(Math.max(x, 0), W - w), y: Math.min(Math.max(y, 0), H - h), w, h };
}

/** How far into the shot (0 the whole picture … 1 the box) at `frame`. */
function progress(s: Shot, frame: number): number {
  const ease = Easing.bezier(0.45, 0, 0.2, 1);
  if (frame < s.out) return interpolate(frame, [s.in, s.in + s.inFor], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return interpolate(frame, [s.out, s.out + s.outFor], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
}

export function Camera({ shots, videoWidth, children }: { shots: Shot[]; videoWidth: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const scale = W / videoWidth;
  let transform = 'none';
  const s = shots.find((x) => frame >= x.in && frame < x.out + x.outFor);
  if (s) {
    const p = progress(s, frame);
    const r = target(s, scale, W, H);
    const kEnd = r.w / W;
    // the still point F: r = F + (frame − F)·kEnd, per axis
    const fx = kEnd < 1 ? r.x / (1 - kEnd) : 0;
    const fy = kEnd < 1 ? r.y / (1 - kEnd) : 0;
    const k = kEnd ** p;
    const z = 1 / k;
    const vx = fx * (1 - k);
    const vy = fy * (1 - k);
    transform = `translate(${-vx * z}px, ${-vy * z}px) scale(${z})`;
  }
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: 'black' }}>
      <AbsoluteFill style={{ transformOrigin: '0 0', transform }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}
