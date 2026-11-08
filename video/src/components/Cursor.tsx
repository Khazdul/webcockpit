// A pointer drawn over a headless recording (which has none) from the
// timeline's input events: it follows the logged moves, shows a ring on a
// press, fades in on the first move and out after a rest. Put it inside the
// Camera so it zooms with the picture.
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { TimelineFile } from '../timeline';

/** Seconds of rest before the pointer fades out (default; `restS` per composition). */
const REST_S = 4.5;
/** Logged moves closer than this belong to one movement (a glide logs one every frame). */
const MOVE_GAP_S = 0.2;

export function Cursor({ tl, startS = 0, restS = REST_S }: { tl: TimelineFile; startS?: number; restS?: number }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = startS + frame / fps;
  const scale = width / tl.width;
  const pts = tl.input.filter((e) => e.x !== undefined && (e.type === 'move' || e.type === 'down' || e.type === 'up'));
  if (!pts.length || t < pts[0]!.t) return null;
  // the position: between the logged points around t while it moves; at rest where it stopped
  let i = pts.findIndex((e) => e.t > t);
  if (i < 0) i = pts.length;
  const a = pts[i - 1]!;
  const b = pts[i];
  const moving = !!b && b.t - a.t < MOVE_GAP_S;
  const u = moving ? Math.min(1, (t - a.t) / Math.max(b.t - a.t, 1e-3)) : 0;
  const x = (a.x! + (moving ? (b.x! - a.x!) * u : 0)) * scale;
  const y = (a.y! + (moving ? (b.y! - a.y!) * u : 0)) * scale;
  // this movement's first event, and whether the pointer had faded out before it
  let j = i - 1;
  while (j > 0 && pts[j]!.t - pts[j - 1]!.t < MOVE_GAP_S) j--;
  const wasHidden = j === 0 || pts[j]!.t - pts[j - 1]!.t > restS + 0.6;
  const fadeIn = wasHidden ? interpolate(t - pts[j]!.t, [0, 0.25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const last = moving ? t : a.t;
  const fadeOut = interpolate(t - last, [restS, restS + 0.6], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const press = tl.input.filter((e) => e.type === 'down' && e.t <= t).at(-1);
  const ring = press ? (t - press.t) / 0.45 : 1;
  // a 20 CSS px pointer, as the page would show it
  const size = 20 * tl.dpr * scale;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: Math.min(fadeIn, fadeOut) }}>
      {ring < 1 ? (
        <div
          style={{
            position: 'absolute',
            left: x - 22,
            top: y - 22,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: '2px solid rgba(239, 226, 191, 0.9)',
            transform: `scale(${0.4 + ring * 0.9})`,
            opacity: 1 - ring,
          }}
        />
      ) : null}
      <svg style={{ position: 'absolute', left: x - 2, top: y - 1, width: size, height: size * 1.4, overflow: 'visible' }} viewBox="0 0 20 28">
        <path d="M1 1 L1 22 L6.5 17 L10.5 26 L14 24.5 L10 15.8 L17.5 15.8 Z" fill="#f4f1ea" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
}
