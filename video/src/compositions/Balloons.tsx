// The balloon film (video/manuscript-balloons.md, stage 76), 1920×1080 at
// 60 fps, about 1:22: only the balloon notices of 0.22.
//
//   0  the title card over the start page's night sky (take balloons-title),
//      the hobbit's balloon rising through it (a still of the rig)
//   1  Gittan by day (balloons-gittan): the troll, the mastiffs joining the
//      prison guard's sign, the chest's achievement
//   2  Rasta at dusk (balloons-rasta): the PvP kills, the level 74 balloon
//      beside the Dwarf's
//   3  the parade at night (balloons-parade), the end card over its tail
//
// Plain cuts between the takes' pieces (`piece-in` / `piece-out` markers);
// the whole window throughout, no pointer. "Into The Wilds" from its start;
// the picture and the music fade together into its first section break.
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import pkg from '../../../package.json';
import { LowerThird, TitleCard } from '../components/Caption';
import { TEXT_FONT } from '../fonts';
import { type TimelineFile, f, marker } from '../timeline';

export interface BalloonsProps extends Record<string, unknown> {
  title: TimelineFile | null;
  gittan: TimelineFile | null;
  rasta: TimelineFile | null;
  parade: TimelineFile | null;
}

export const BALLOONS_TAKES = { title: 'balloons-title', gittan: 'balloons-gittan', rasta: 'balloons-rasta', parade: 'balloons-parade' } as const;

/** The version as the film names it: major and minor. */
const VERSION = pkg.version.split('.').slice(0, 2).join('.');

/** The film's end: the music's first section break (its level drops after 81.5 s). */
export const BALLOONS_END_S = 82.0;
/** The picture and the music fade over the section's last bars. */
const FADE_FROM_S = 79.5;
/** The title card's length. */
const TITLE_S = 3.0;
/** The end card comes up this long before the end. */
const CARD_S = 7.0;
/** The parade is cut in this long after its take's `film0`. */
const PARADE_PREROLL_S = 1.0;

const CREDIT = "'Into The Wilds' (edited) by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au";

interface Piece {
  take: TimelineFile;
  /** Take s. */
  from: number;
  to: number;
  /** Film s. */
  at: number;
  name: string;
}

/** Where every piece lies in the film. */
export function balloonsPlan(p: { title: TimelineFile; gittan: TimelineFile; rasta: TimelineFile; parade: TimelineFile }) {
  const pieces: Piece[] = [];
  let at = 0;
  const add = (take: TimelineFile, from: number, to: number, name: string): void => {
    pieces.push({ take, from, to, at, name });
    at += to - from;
  };
  add(p.title, marker(p.title, 'film0').t, marker(p.title, 'film0').t + TITLE_S, 'title');
  for (const take of [p.gittan, p.rasta]) {
    for (const m of take.markers.filter((x) => x.kind === 'piece-in')) add(take, m.t, marker(take, 'piece-out', m.label).t, m.label);
  }
  // the parade's first balloon is sent just before the cut: it is coming up as the act begins
  const p0 = marker(p.parade, 'film0').t + PARADE_PREROLL_S;
  add(p.parade, p0, p0 + (BALLOONS_END_S - at), 'parade');
  const paradeAt = pieces.at(-1)!.at;
  const last = p.parade.markers.filter((x) => x.kind === 'parade').at(-1);
  if (last && paradeAt + last.t - p0 + 6.5 > FADE_FROM_S) console.warn(`Balloons: the parade's last balloon is at rest only at ${(paradeAt + last.t - p0 + 6.5).toFixed(1)} s`);
  if (p.parade.durationS < pieces.at(-1)!.to) console.warn('Balloons: the parade take is shorter than the film needs');
  return { pieces, paradeAt };
}

/** The title's balloon (public/recordings/balloons-sprite.png, recorded with the title's take): it rises through the card. */
function RisingBalloon() {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const s = frame / 60;
  const y = interpolate(s, [0, TITLE_S + 0.4], [height * 0.62, -height * 0.32], { easing: Easing.bezier(0.3, 0.1, 0.6, 1) });
  const x = width * 0.5 + 250 + 14 * Math.sin(s * 1.3);
  const tilt = 1.6 * Math.sin(s * 1.1 + 0.4);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <Img src={staticFile('recordings/balloons-sprite.png')} style={{ position: 'absolute', left: x, top: y, transform: `translateX(-50%) rotate(${tilt}deg)`, transformOrigin: '50% 0' }} />
    </AbsoluteFill>
  );
}

/** The end card: the lower third's box, two lines and the music's credit, over the parade's sky. */
function EndCard({ from, dur }: { from: number; dur: number }) {
  const frame = useCurrentFrame();
  const fade = f(0.45);
  const ease = Easing.bezier(0.33, 0, 0.2, 1);
  const opacity = interpolate(frame, [from, from + fade], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const lift = interpolate(frame, [from, from + fade * 1.5], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  if (frame < from || frame > from + dur) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 96,
          top: 300,
          opacity,
          transform: `translateY(${lift}px)`,
          padding: '22px 34px 22px',
          borderRadius: 6,
          background: 'rgba(9, 8, 12, 0.92)',
          boxShadow: '0 0 0 1px rgba(201, 164, 92, 0.28), 0 10px 40px rgba(0, 0, 0, 0.55)',
          borderLeft: '3px solid rgba(201, 164, 92, 0.85)',
          fontFamily: TEXT_FONT,
          fontWeight: 500,
          color: '#efe2bf',
          whiteSpace: 'nowrap',
        }}
      >
        <div style={{ fontSize: 48, lineHeight: 1.15 }}>Turn them on in Settings → Weather effects.</div>
        <div style={{ fontSize: 36, lineHeight: 1.3, marginTop: 8, color: 'rgba(222, 213, 194, 0.92)' }}>{`WebCockpit ${VERSION} · mumecockpit.com · Free and open source`}</div>
        <div style={{ fontSize: 21, lineHeight: 1.3, marginTop: 18, fontStyle: 'italic', color: 'rgba(222, 213, 194, 0.7)' }}>{CREDIT}</div>
      </div>
    </AbsoluteFill>
  );
}

export function Balloons({ title, gittan, rasta, parade }: BalloonsProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!title || !gittan || !rasta || !parade) return null;
  const { pieces, paradeAt } = balloonsPlan({ title, gittan, rasta, parade });
  const at = (name: string): Piece => pieces.find((p) => p.name === name)!;
  /** A caption over a piece, from `a` s into it to `b` s before its end. */
  const over = (name: string, a = 0.35, b = 0.15) => {
    const p = at(name);
    return { from: f(p.at + a), dur: f(p.to - p.from - a - b) };
  };
  const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) } as const;
  const black = interpolate(frame, [0, f(0.5), f(FADE_FROM_S), durationInFrames - 1], [1, 0, 0, 1], ease);
  const volume = (fr: number): number => interpolate(fr, [0, f(0.3), f(FADE_FROM_S), durationInFrames - 1], [0, 1, 1, 0], ease);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {pieces.map((p, i) => (
        <Sequence key={i} from={f(p.at)} durationInFrames={Math.max(1, f(p.at + p.to - p.from) - f(p.at))}>
          <OffthreadVideo src={staticFile(`recordings/${p.take.scene}.mp4`)} trimBefore={f(p.from)} muted style={{ width: '100%', height: '100%' }} />
        </Sequence>
      ))}
      {/* act 0 */}
      <Sequence durationInFrames={f(TITLE_S)}>
        <RisingBalloon />
      </Sequence>
      <TitleCard from={f(0.15)} dur={f(TITLE_S - 0.15)} title={`WebCockpit ${VERSION}`} lines={['Now with hot-air balloons.']} small="(Because: Why not?)" />
      {/* act 1 */}
      <LowerThird {...over('troll')} text="Every kill sends up a balloon." />
      <LowerThird {...over('guard')} text="Kills close together share a sign." />
      <LowerThird {...over('chest')} text="Level ups and achievements get one of their own." />
      {/* act 2 */}
      <LowerThird {...over('morgrim')} text="The passenger follows the race you play." />
      {/* act 3 */}
      <LowerThird from={f(paradeAt + 1.0)} dur={f(9.0)} text="A selection: 8 passengers, 10 balloons each. 80 in all." />
      {/* act 4 */}
      <EndCard from={f(BALLOONS_END_S - CARD_S)} dur={f(CARD_S) + 1} />
      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio src={staticFile('music/into-the-wilds.mp3')} volume={volume} />
    </AbsoluteFill>
  );
}
