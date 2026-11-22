// The balloon film (video/manuscript-balloons.md draft 3, stage 76), about
// 2:57 at 1920×1080, 60 fps: one take at the fountain in Bree (take
// balloons-fountain) between two cards on black.
//
//   0      the title: the name alone, the line under it, the joke below
//          (its space kept from the start: nothing moves); out together
//   1-3    the take, faded in and out; the pointer drawn from its input
//          log; two captions high on the left, outside the balloons' lane
//          and away from the input line, where the commands are typed
//   4      the end card in the title's type, with the music's credit
//
// The balloons fly at their real speed: the take is frame-stepped (one new
// picture per film frame, record/lib/frame-clock.ts) and never retimed.
// "Into The Wilds" from its start, faded out over 11 s into a phrase's end
// (177.0 s: the harmony turns there, on the music's 4 s grid, and the next
// phrase's downbeat strikes at 177.04).
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import pkg from '../../../package.json';
import { LowerThird, Rule } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { TEXT_FONT, TITLE_FONT } from '../fonts';
import { FPS, type TimelineFile, f, marker } from '../timeline';

export interface BalloonsProps extends Record<string, unknown> {
  take: TimelineFile | null;
}

export const BALLOONS_TAKE = 'balloons-fountain';

/** The version as the film names it: major and minor. */
const VERSION = pkg.version.split('.').slice(0, 2).join('.');

const TITLE = { nameIn: [0.4, 1.8], lineIn: [3.8, 5.0], jokeIn: [7.2, 7.9], out: [11.4, 12.7] } as const;
const JOKE = '(Nobody asked. We did it anyway.)';
/** The take's first frame (a breath of black after the title). */
const GAME_AT_S = 13.1;
const GAME_IN_S = 1.8;
const GAME_OUT_S = 3.0;
/** The music's phrase end (just before the next one's downbeat). */
const PHRASE_END_S = 177.0;
/** The long fade into it. */
const MUSIC_FADE_S = 11;
export const BALLOONS_END_S = 177.4;
/** Fully readable 7.0 s (round 2: 6.9 s). */
const END_CARD = { afterGame: 0.6, inS: 1.3, outS: 2.0 } as const;

const CREDIT = "'Into The Wilds' (edited) by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au";
const CAPTION_KINDS = ['Balloons rise for kills, level ups and achievements.', 'And when you die.'];
const CAPTION_RACES = ['The passenger follows your race.', '8 passengers, 10 balloons each: 80 in all.'];
/** Each caption: long enough to read twice. */
const CAPTION_S = 16;
/** Their top, px: over the oldest text, far from the input line. */
const CAPTION_TOP = 170;

const PARCHMENT = '#efe2bf';
const MIST = 'rgba(222, 213, 194, 0.9)';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const soft = { ...clamp, easing: Easing.inOut(Easing.sin) } as const;

/** Pure black behind; the lines keep their places as they fade in. */
function Title() {
  const s = useCurrentFrame() / FPS;
  const out = interpolate(s, TITLE.out, [1, 0], soft);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: out }}>
      <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 92, letterSpacing: '0.05em', color: PARCHMENT, opacity: interpolate(s, TITLE.nameIn, [0, 1], soft) }}>{`WebCockpit ${VERSION}`}</div>
      <div style={{ opacity: interpolate(s, TITLE.lineIn, [0, 1], soft) }}>
        <Rule width={460} />
        <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 48, color: MIST }}>Now with hot-air balloons.</div>
      </div>
      <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 36, lineHeight: 1.3, marginTop: 26, color: MIST, opacity: interpolate(s, TITLE.jokeIn, [0, 1], soft) }}>{JOKE}</div>
    </AbsoluteFill>
  );
}

/** The end card in the title's style; `from`: film s. */
function EndCard({ from }: { from: number }) {
  const s = useCurrentFrame() / FPS;
  const opacity = interpolate(s, [from, from + END_CARD.inS, PHRASE_END_S - END_CARD.outS, PHRASE_END_S], [0, 1, 1, 0], soft);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity }}>
      <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 54, letterSpacing: '0.04em', color: PARCHMENT, whiteSpace: 'nowrap' }}>Turn them on in Settings → Weather effects.</div>
      <Rule width={460} />
      <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 48, color: MIST }}>mumecockpit.com</div>
      <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 26, color: MIST, opacity: 0.75, marginTop: 64 }}>{CREDIT}</div>
    </AbsoluteFill>
  );
}

export function Balloons({ take }: BalloonsProps) {
  const s = useCurrentFrame() / FPS;
  if (!take) return null;
  const gameEnd = GAME_AT_S + take.frames / FPS;
  const game = interpolate(s, [GAME_AT_S, GAME_AT_S + GAME_IN_S, gameEnd - GAME_OUT_S, gameEnd], [0, 1, 1, 0], soft);
  const balloon = (label: string): number => GAME_AT_S + marker(take, 'balloon', label).t;
  const volume = (fr: number): number =>
    interpolate(fr, [0, f(0.4), f(PHRASE_END_S - MUSIC_FADE_S), f(PHRASE_END_S)], [0, 1, 1, 0], { ...clamp, easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={f(GAME_AT_S)}>
        <Title />
      </Sequence>
      <Sequence from={f(GAME_AT_S)} durationInFrames={take.frames}>
        <AbsoluteFill style={{ opacity: game }}>
          <OffthreadVideo src={staticFile(`recordings/${take.scene}.mp4`)} muted style={{ width: '100%', height: '100%' }} />
          {/* a stepped take's input is logged at the frame before the one that shows it */}
          <Cursor tl={take} startS={-0.5 / FPS} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      <LowerThird from={f(balloon('goblin superb') + 1.5)} dur={f(CAPTION_S)} text={CAPTION_KINDS} top={CAPTION_TOP} />
      <LowerThird from={f(balloon('hobbit levelup') + 1.5)} dur={f(CAPTION_S)} text={CAPTION_RACES} top={CAPTION_TOP} />
      <EndCard from={gameEnd + END_CARD.afterGame} />
      <Audio src={staticFile('music/into-the-wilds.mp3')} volume={volume} />
    </AbsoluteFill>
  );
}
