// The film's two kinds of text (owner, 2026-11-08: few captions, plain and
// descriptive, no slogans, no chapter cards):
//
//   LowerThird  one short plain sentence in Cormorant Garamond, low on the
//               left, on a solid scrim (nothing behind shows through);
//   TitleCard   the opening and end cards: Cinzel over a line of Cormorant
//               italic, centred on a point (the frame's centre by default).
//
// Both come in and go the same way: a 0.45 s fade with a short rise, a
// 0.45 s fade out. Everything stays inside the 5 % safe margin.
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { TEXT_FONT, TITLE_FONT } from '../fonts';

const PARCHMENT = '#efe2bf';
const MIST = 'rgba(222, 213, 194, 0.9)';
const BRASS = 'rgba(201, 164, 92, 0.85)';
/** The safe margin: 5 % of the frame on each side. */
export const SAFE = 0.05;
/** In and out, s. */
const FADE_S = 0.45;
const RISE_PX = 12;

/** Opacity and lift of a text shown from frame `from` for `dur` frames. */
function useShow(from: number, dur: number): { opacity: number; lift: number } {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = Math.round(FADE_S * fps);
  const ease = Easing.bezier(0.33, 0, 0.2, 1);
  const opacity = interpolate(frame, [from, from + fade, from + dur - fade, from + dur], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  });
  const lift = interpolate(frame, [from, from + fade * 1.5], [RISE_PX, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return { opacity, lift };
}

/** One short sentence low on the left, on a solid dark scrim. */
export function LowerThird({ from, dur, text }: { from: number; dur: number; text: string }) {
  const { opacity, lift } = useShow(from, dur);
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: width * SAFE,
          bottom: height * SAFE + 18,
          opacity,
          transform: `translateY(${lift}px)`,
          padding: '16px 30px 18px',
          borderRadius: 6,
          background: 'rgba(9, 8, 12, 0.92)',
          boxShadow: '0 0 0 1px rgba(201, 164, 92, 0.28), 0 10px 40px rgba(0, 0, 0, 0.55)',
          borderLeft: `3px solid ${BRASS}`,
          fontFamily: TEXT_FONT,
          fontWeight: 500,
          fontSize: 44,
          lineHeight: 1.15,
          color: PARCHMENT,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

/** The brass rule with a lozenge in its middle. */
function Rule({ width }: { width: number }) {
  const line = { flex: 1, height: 1.5 } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width, margin: '18px auto 14px' }}>
      <div style={{ ...line, background: `linear-gradient(90deg, transparent, ${BRASS})` }} />
      <div style={{ width: 9, height: 9, transform: 'rotate(45deg)', border: `1.5px solid ${BRASS}` }} />
      <div style={{ ...line, background: `linear-gradient(270deg, transparent, ${BRASS})` }} />
    </div>
  );
}

/**
 * An opening or end card: a Cinzel title, a rule, Cormorant italic lines,
 * centred on (`x`, `y`) in px (default the frame's centre), with a soft
 * dark wash behind it for the sky.
 */
export function TitleCard({ from, dur, title, lines = [], x, y, size = 84 }: { from: number; dur: number; title: string; lines?: string[]; x?: number; y?: number; size?: number }) {
  const { opacity, lift } = useShow(from, dur);
  const { width, height } = useVideoConfig();
  const cx = x ?? width / 2;
  const cy = y ?? height / 2;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity }}>
      <div
        style={{
          position: 'absolute',
          left: cx - 520,
          top: cy - 300,
          width: 1040,
          height: 600,
          background: 'radial-gradient(ellipse 50% 45% at 50% 50%, rgba(4,4,10,0.55) 0%, rgba(4,4,10,0.3) 55%, rgba(4,4,10,0) 100%)',
        }}
      />
      <div style={{ position: 'absolute', left: cx, top: cy, transform: `translate(-50%, -50%) translateY(${lift}px)`, textAlign: 'center', whiteSpace: 'nowrap' }}>
        <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: size, letterSpacing: '0.05em', color: PARCHMENT, textShadow: '0 2px 18px rgba(0,0,0,0.85)' }}>{title}</div>
        {lines.length ? <Rule width={Math.min(460, size * 5.5)} /> : null}
        {lines.map((l) => (
          <div key={l} style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: size * 0.46, lineHeight: 1.3, color: MIST, textShadow: '0 1px 10px rgba(0,0,0,0.9)' }}>
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
