// The Character pane film (video/manuscript-character.md, the round 3 plan,
// draft 5; stage 78): 3:06.35 at 1920×1080, 60 fps, as long as its music,
// which ends by itself (no fade). One frame-stepped take (character-tour)
// between a title and the end.
//
//   0      the title (the music's soft start)
//   1      the take, faded in; its pointer drawn from the input log; the
//          captions high on the left, away from the input line and the
//          right dock, each at a marker of the take
//   2      the achievement's balloon comes to rest and flies on, moving all
//          the while: everything else fades to black under it (the take's
//          balloon-only frames, public/recordings/character-balloon/), the
//          balloon alone, then it fades too
//   3      three posters, still, cross-faded
//   4      the end card in the balloon film's style, to the last frame
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import pkg from '../../../package.json';
import { LowerThird, Rule } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { TEXT_FONT, TITLE_FONT } from '../fonts';
import { FPS, type TimelineFile, f, marker } from '../timeline';

export interface CharacterProps extends Record<string, unknown> {
  take: TimelineFile | null;
}

export const CHARACTER_TAKE = 'character-tour';

/** The music's length: the film's. */
export const CHARACTER_END_S = 186.35;

/** The version as the film names it: major and minor. */
const VERSION = pkg.version.split('.').slice(0, 2).join('.');

const TITLE = { nameIn: [0.5, 2.0], lineIn: [2.6, 3.8], out: [5.7, 6.7] } as const;
/** The take's first frame. */
export const GAME_AT_S = 7.0;
const GAME_IN_S = 1.2;
/** From the achievement balloon's rest (draft 5): everything else fades rest+3 → rest+7, the balloon alone to rest+11, its fade to rest+15. */
const END_FADE = { start: 3, gone: 7, alone: 11, out: 15 } as const;
/** The posters (video/public/posters/: gitignored; record/posters/ makes them). */
const POSTERS = ['posters/1-faces-of-arda.png', 'posters/2-status-stats-lore.png', 'posters/3-the-stones.png'];
/** Each poster's time is what the end card leaves (4–5.5 s), its cross-fade into the next, the first's fade in. */
const POSTER = { min: 4.0, max: 5.5, cross: 0.5, inS: 0.8 } as const;
/** The end card stands this long, its fade in included, to the last frame. */
const END_CARD_S = 8.8;
const END_IN_S = 1.2;

const CREDIT = ['"No Good Layabout" Kevin MacLeod (incompetech.com)', 'Licensed under Creative Commons: By Attribution 4.0', 'https://creativecommons.org/licenses/by/4.0/'];

/** Each caption: at a marker (kind, label?), shifted `at` s, standing `dur` s. */
const CAPTIONS: { kind: string; label?: string; at: number; dur: number; text: string[] }[] = [
  { kind: 'card-on', at: 0.7, dur: 4.2, text: ['The Character pane.'] },
  { kind: 'tab', label: 'stats', at: 0.4, dur: 5.2, text: ['Stats: abilities, age, senses.'] },
  { kind: 'tab', label: 'lore', at: 0.4, dur: 5.2, text: ['Lore: race, alignment, towns,', 'war fame and purse.'] },
  { kind: 'docked', at: 0.6, dur: 4.2, text: ['It fits any size.'] },
  { kind: 'fight', at: 0.6, dur: 4.6, text: ['A fight: the crossed swords.'] },
  { kind: 'peak', at: 0.5, dur: 4.4, text: ['The ring: your experience', 'to the next level.'] },
  { kind: 'mood-click', at: 0.3, dur: 4.0, text: ['A click sends the command.'] },
];
/** Their top, px: over the game's oldest text, clear of the right dock and the input line. */
const CAPTION_TOP = 150;

const PARCHMENT = '#efe2bf';
const MIST = 'rgba(222, 213, 194, 0.9)';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const soft = { ...clamp, easing: Easing.inOut(Easing.sin) } as const;

function Title() {
  const s = useCurrentFrame() / FPS;
  const out = interpolate(s, TITLE.out, [1, 0], soft);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity: out }}>
      <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 92, letterSpacing: '0.05em', color: PARCHMENT, opacity: interpolate(s, TITLE.nameIn, [0, 1], soft) }}>{`MumeCockpit ${VERSION}`}</div>
      <div style={{ opacity: interpolate(s, TITLE.lineIn, [0, 1], soft) }}>
        <Rule width={460} />
        <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 48, color: MIST }}>The Character pane.</div>
      </div>
    </AbsoluteFill>
  );
}

/** The end card in the balloon film's style, readable to the film's last frame; `from`: film s. */
function EndCard({ from }: { from: number }) {
  const s = useCurrentFrame() / FPS;
  const opacity = interpolate(s, [from, from + END_IN_S], [0, 1], soft);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center', opacity }}>
      <div style={{ fontFamily: TITLE_FONT, fontWeight: 700, fontSize: 54, letterSpacing: '0.04em', color: PARCHMENT, whiteSpace: 'nowrap' }}>Turn it on under Panes → Character.</div>
      <Rule width={460} />
      <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 48, color: MIST }}>mumecockpit.com</div>
      <div style={{ fontFamily: TEXT_FONT, fontStyle: 'italic', fontWeight: 500, fontSize: 26, lineHeight: 1.35, color: MIST, opacity: 0.75, marginTop: 64 }}>
        {CREDIT.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/** One poster in its Sequence, still: faded in, held, faded out. */
function Poster({ src, dur, inS, outS }: { src: string; dur: number; inS: number; outS: number }) {
  const s = useCurrentFrame() / FPS;
  const opacity = interpolate(s, [0, inS, dur - outS, dur], [0, 1, 1, 0], soft);
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
  );
}

/** The take's balloon-only frames, frame for frame with the take (`count` of them). */
function BalloonLayer({ count }: { count: number }) {
  const n = Math.min(count - 1, useCurrentFrame());
  return <Img src={staticFile(`recordings/character-balloon/${String(n).padStart(5, '0')}.png`)} style={{ width: '100%', height: '100%' }} />;
}

/** The film s of a take's marker. */
const at = (take: TimelineFile, kind: string, label?: string): number => GAME_AT_S + marker(take, kind, label).t;

export function Character({ take }: CharacterProps) {
  const s = useCurrentFrame() / FPS;
  if (!take) return null;
  const rest = at(take, 'balloon-rest');
  const layerAt = at(take, 'layer-from');
  const gameEnd = GAME_AT_S + take.frames / FPS;
  const layerCount = Math.round((gameEnd - layerAt) * FPS);
  const fadeAt = rest + END_FADE.start;
  const goneAt = rest + END_FADE.gone;
  const postersAt = rest + END_FADE.out;
  const endAt = CHARACTER_END_S - END_CARD_S;
  // three posters, two cross-fades between them and one into the end card
  const posterS = Math.max(POSTER.min, Math.min(POSTER.max, (endAt - postersAt + 3 * POSTER.cross) / 3));
  const game = interpolate(s, [GAME_AT_S, GAME_AT_S + GAME_IN_S, fadeAt, goneAt], [0, 1, 1, 0], soft);
  const balloon = interpolate(s, [rest + END_FADE.alone, postersAt], [1, 0], soft);
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={f(GAME_AT_S)}>
        <Title />
      </Sequence>
      <Sequence from={f(GAME_AT_S)} durationInFrames={f(goneAt - GAME_AT_S) + 1}>
        <AbsoluteFill style={{ opacity: game }}>
          <OffthreadVideo src={staticFile(`recordings/${take.scene}.mp4`)} muted style={{ width: '100%', height: '100%' }} />
          {/* a stepped take's input is logged at the frame before the one that shows it */}
          <Cursor tl={take} startS={-0.5 / FPS} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      {/* the balloon alone, moving: the take's own pixels of it, over the take from before its fade */}
      <Sequence from={f(layerAt)} durationInFrames={Math.min(layerCount, f(postersAt - layerAt) + 1)}>
        <AbsoluteFill style={{ opacity: balloon }}>
          <BalloonLayer count={layerCount} />
        </AbsoluteFill>
      </Sequence>
      {CAPTIONS.map((c) => (
        <LowerThird key={c.text[0]} from={f(at(take, c.kind, c.label) + c.at)} dur={f(c.dur)} text={c.text} top={CAPTION_TOP} />
      ))}
      {POSTERS.map((p, i) => {
        const from = postersAt + i * (posterS - POSTER.cross);
        return (
          <Sequence key={p} from={f(from)} durationInFrames={f(posterS) + 1}>
            <Poster src={p} dur={posterS} inS={i === 0 ? POSTER.inS : POSTER.cross} outS={POSTER.cross} />
          </Sequence>
        );
      })}
      <EndCard from={postersAt + 3 * posterS - 3 * POSTER.cross} />
      <Audio src={staticFile('music/no-good-layabout.mp3')} />
    </AbsoluteFill>
  );
}
