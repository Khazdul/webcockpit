// Titles and captions in the start page's voice: Cinzel in warm parchment
// over a soft dark wash, a thin brass rule with a lozenge, a line of
// Cormorant italic under it. They fade and rise a little in, fade out.
import type { CSSProperties } from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { TEXT_FONT, TITLE_FONT } from '../fonts';

const PARCHMENT = '#efe2bf';
const BRASS = 'rgba(201, 164, 92, 0.85)';
const MIST = 'rgba(214, 205, 186, 0.86)';

/** Opacity and lift for an element shown from `from` for `dur` frames, fading over `fade`. */
function useShow(from: number, dur: number, fade: number): { opacity: number; lift: number } {
  const frame = useCurrentFrame();
  const ease = Easing.bezier(0.33, 0, 0.2, 1);
  const opacity = interpolate(frame, [from, from + fade, from + dur - fade, from + dur], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const lift = interpolate(frame, [from, from + fade * 1.6], [14, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return { opacity, lift };
}

/** The brass rule with a lozenge in its middle. */
function Rule({ width }: { width: number }) {
  const line: CSSProperties = { flex: 1, height: 1.5, background: `linear-gradient(90deg, transparent, ${BRASS})` };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width, margin: '18px auto 16px' }}>
      <div style={line} />
      <div style={{ width: 9, height: 9, transform: 'rotate(45deg)', border: `1.5px solid ${BRASS}` }} />
      <div style={{ ...line, background: `linear-gradient(270deg, transparent, ${BRASS})` }} />
    </div>
  );
}

/** A big centred title with a line under it, over a dark wash that hides the game behind. */
export function Title({ from, dur, title, line }: { from: number; dur: number; title: string; line?: string }) {
  const { opacity, lift } = useShow(from, dur, 24);
  return (
    <AbsoluteFill style={{ opacity, justifyContent: 'center', alignItems: 'center' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 48% at 50% 50%, rgba(4,4,8,0.88) 0%, rgba(4,4,8,0.7) 55%, rgba(4,4,8,0.25) 100%)' }} />
      <div style={{ transform: `translateY(${lift}px)`, textAlign: 'center' }}>
        <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 76, letterSpacing: '0.04em', color: PARCHMENT, textShadow: '0 2px 18px rgba(0,0,0,0.85)' }}>{title}</div>
        {line ? (
          <>
            <Rule width={520} />
            <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 40, color: MIST, textShadow: '0 1px 10px rgba(0,0,0,0.9)' }}>{line}</div>
          </>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

/** A caption in a corner of the frame (default bottom left), on a soft dark band. */
export function Caption({
  from,
  dur,
  text,
  sub,
  place = 'bottom-left',
}: {
  from: number;
  dur: number;
  text: string;
  sub?: string;
  place?: 'bottom-left' | 'bottom-right' | 'top-left';
}) {
  const { opacity, lift } = useShow(from, dur, 20);
  const right = place === 'bottom-right';
  const top = place === 'top-left';
  return (
    <AbsoluteFill style={{ opacity, pointerEvents: 'none' }}>
      {/* The game text behind is blurred and darkened under the caption, so the two never read as one. */}
      <div
        style={{
          position: 'absolute',
          [top ? 'top' : 'bottom']: 0,
          [right ? 'right' : 'left']: 0,
          width: 1280,
          height: 340,
          backdropFilter: 'blur(5px)',
          WebkitMaskImage: `radial-gradient(ellipse 90% 100% at ${right ? '100%' : '0%'} ${top ? '0%' : '100%'}, black 0%, black 45%, transparent 100%)`,
          maskImage: `radial-gradient(ellipse 90% 100% at ${right ? '100%' : '0%'} ${top ? '0%' : '100%'}, black 0%, black 45%, transparent 100%)`,
          background: `radial-gradient(ellipse 90% 100% at ${right ? '100%' : '0%'} ${top ? '0%' : '100%'}, rgba(4,4,8,0.93) 0%, rgba(4,4,8,0.8) 45%, rgba(4,4,8,0) 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          [top ? 'top' : 'bottom']: 70,
          [right ? 'right' : 'left']: 90,
          transform: `translateY(${top ? -lift : lift}px)`,
          textAlign: right ? 'right' : 'left',
        }}
      >
        <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 46, letterSpacing: '0.03em', color: PARCHMENT, textShadow: '0 2px 14px rgba(0,0,0,0.9)' }}>{text}</div>
        {sub ? (
          <div style={{ marginTop: 10, fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 32, color: MIST, textShadow: '0 1px 10px rgba(0,0,0,0.95)' }}>{sub}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
