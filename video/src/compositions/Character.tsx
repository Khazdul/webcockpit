// The Character pane film (video/manuscript-character.md, the round 2
// proposal, draft 4; stage 78): 3:06.35 at 1920×1080, 60 fps, as long as
// its music, which ends by itself (no fade). One frame-stepped take
// (character-tour) between a title and the end.
//
//   0      the title (the music's soft start)
//   1      the take, faded in; its pointer drawn from the input log; the
//          captions high on the left, away from the input line and the
//          right dock, each at a marker of the take
//   2      the achievement's balloon at rest: the take stands still from
//          its cutout's frame, then fades to black under it; the balloon alone (the take's cutout,
//          public/recordings/character-balloon.png) on the track's loudest
//          bar, then it fades too
//   3      three posters, each with a slow push-in, cross-faded
//   4      the end card in the balloon film's style, to the last frame
import { AbsoluteFill, Audio, Easing, Freeze, Img, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
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
/** The balloon at rest is read this long before everything else fades. */
const REST_HOLD_S = 4.0;
/** Everything but the balloon fades to black. */
const FADE_S = 2.0;
/** The balloon alone on black, then its own fade. */
const ALONE_S = 5.0;
const BALLOON_OUT_S = 2.0;
/** The posters (video/public/posters/: gitignored; record/posters/ makes them). */
const POSTERS = ['posters/1-faces-of-arda.png', 'posters/2-status-stats-lore.png', 'posters/3-the-stones.png'];
/** Each poster's time, its cross-fade into the next, and its push-in. */
const POSTER = { s: 6.0, cross: 0.7, inS: 1.0, zoom: [1.0, 1.04] } as const;
/** The end card's fade in; it stands to the last frame. */
const END_IN_S = 1.2;

const CREDIT = ['"No Good Layabout" Kevin MacLeod (incompetech.com)', 'Licensed under Creative Commons: By Attribution 4.0', 'https://creativecommons.org/licenses/by/4.0/'];

/** Each caption: at a marker (kind, label?), shifted `at` s, standing `dur` s. */
const CAPTIONS: { kind: string; label?: string; at: number; dur: number; text: string[] }[] = [
  { kind: 'card-on', at: 0.7, dur: 4.2, text: ['The Character pane.'] },
  { kind: 'docked', at: 0.6, dur: 4.2, text: ['It fits any size.'] },
  { kind: 'stones', at: 0.4, dur: 4.4, text: ['Stones: what is on you,', 'and for how long.'] },
  { kind: 'fight', at: 0.5, dur: 4.6, text: ['A fight: the crossed swords.', 'Poisoned: a red stone.'] },
  { kind: 'peak', at: 0.6, dur: 4.4, text: ['The ring: your experience', 'to the next level.'] },
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

/** One poster in its Sequence: faded in, held, faded out; a slow even push-in through all of it. */
function Poster({ src, inS, outS }: { src: string; inS: number; outS: number }) {
  const s = useCurrentFrame() / FPS;
  const opacity = interpolate(s, [0, inS, POSTER.s - outS, POSTER.s], [0, 1, 1, 0], soft);
  // linear: no stepping, no ease into a stop while it shows
  const scale = interpolate(s, [0, POSTER.s], POSTER.zoom, clamp);
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`, transformOrigin: '50% 50%' }} />
    </AbsoluteFill>
  );
}

/** The film s of a take's marker. */
const at = (take: TimelineFile, kind: string, label?: string): number => GAME_AT_S + marker(take, kind, label).t;

export function Character({ take }: CharacterProps) {
  const s = useCurrentFrame() / FPS;
  if (!take) return null;
  const rest = at(take, 'balloon-rest');
  // the take stands still from the cutout's frame (the balloon moves on after about 4 s at rest)
  const still = at(take, 'cutout');
  const freeze = rest + REST_HOLD_S;
  const gameOut = freeze + FADE_S;
  const aloneEnd = gameOut + ALONE_S;
  const postersAt = aloneEnd + BALLOON_OUT_S;
  const endAt = postersAt + POSTERS.length * POSTER.s - (POSTERS.length - 1) * POSTER.cross;
  const game = interpolate(s, [GAME_AT_S, GAME_AT_S + GAME_IN_S, freeze, gameOut], [0, 1, 1, 0], soft);
  const balloon = interpolate(s, [aloneEnd, postersAt], [1, 0], soft);
  const freezeFrame = f(still - GAME_AT_S);
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={f(GAME_AT_S)}>
        <Title />
      </Sequence>
      <Sequence from={f(GAME_AT_S)} durationInFrames={f(gameOut - GAME_AT_S) + 1}>
        <AbsoluteFill style={{ opacity: game }}>
          <Freeze frame={freezeFrame} active={(fr) => fr >= freezeFrame}>
            <OffthreadVideo src={staticFile(`recordings/${take.scene}.mp4`)} muted style={{ width: '100%', height: '100%' }} />
          </Freeze>
          {/* a stepped take's input is logged at the frame before the one that shows it */}
          <Cursor tl={take} startS={-0.5 / FPS} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      {/* the balloon alone: the take's own pixels of it at rest, over the take from its rest */}
      <Sequence from={f(still)} durationInFrames={f(postersAt - still)}>
        <AbsoluteFill style={{ opacity: balloon }}>
          <Img src={staticFile('recordings/character-balloon.png')} style={{ width: '100%', height: '100%' }} />
        </AbsoluteFill>
      </Sequence>
      {CAPTIONS.map((c) => (
        <LowerThird key={c.text[0]} from={f(at(take, c.kind, c.label) + c.at)} dur={f(c.dur)} text={c.text} top={CAPTION_TOP} />
      ))}
      {POSTERS.map((p, i) => {
        const from = postersAt + i * (POSTER.s - POSTER.cross);
        return (
          <Sequence key={p} from={f(from)} durationInFrames={f(POSTER.s) + 1}>
            <Poster src={p} inS={i === 0 ? POSTER.inS : POSTER.cross} outS={POSTER.cross} />
          </Sequence>
        );
      })}
      <EndCard from={endAt - POSTER.cross} />
      <Audio src={staticFile('music/no-good-layabout.mp3')} />
    </AbsoluteFill>
  );
}
