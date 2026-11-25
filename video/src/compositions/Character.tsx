// The Character pane film (video/manuscript-character.md draft 3, stage 78):
// 3:06 at 1920×1080, 60 fps, as long as its music, which ends by itself (no
// fade). One frame-stepped take (character-tour) between two cards on black.
//
//   0      the title (the music's soft start)
//   1      the take, faded in; its pointer drawn from the input log; a dip
//          to black over its one hard cut (the wait for the coach home);
//          the captions high on the left, away from the input line and
//          the right dock, each at a marker of the take
//   2      the take fades out, the end card with the music's credit
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
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

const TITLE = { nameIn: [0.5, 2.0], lineIn: [2.8, 4.0], out: [6.6, 7.7] } as const;
/** The take's first frame. */
export const GAME_AT_S = 8.0;
const GAME_IN_S = 1.2;
const GAME_OUT_S = 1.6;
/** The dip over the cut: out before it, in after it (s). */
const DIP = { before: 0.3, after: 0.45 } as const;
/** The end card: in after the take is out, readable to the end. */
const END_CARD = { afterGame: 0.2, inS: 1.2 } as const;

const CREDIT = ['"No Good Layabout" Kevin MacLeod (incompetech.com)', 'Licensed under Creative Commons: By Attribution 4.0', 'https://creativecommons.org/licenses/by/4.0/'];

/** Each caption: at a marker (kind, label?), shifted `at` s, standing `dur` s. */
const CAPTIONS: { kind: string; label?: string; at: number; dur: number; text: string[] }[] = [
  { kind: 'card-on', at: 0.7, dur: 4.4, text: ['The Character pane.'] },
  { kind: 'status', at: 0, dur: 4.4, text: ['Status: mood, casts, alertness,', 'weight, and your four shields.'] },
  { kind: 'tab', label: 'stats', at: 0.3, dur: 4.0, text: ['Stats: abilities, age, senses.'] },
  { kind: 'tab', label: 'lore', at: 0.3, dur: 4.6, text: ['Lore: race, alignment, towns,', 'war fame and purse.'] },
  { kind: 'mood-click', at: 0.3, dur: 4.2, text: ['A click sends the command.'] },
  { kind: 'docked', at: 0.6, dur: 4.4, text: ['It fits any size.'] },
  { kind: 'stones', at: 0.4, dur: 4.4, text: ['Stones: what is on you,', 'and for how long.'] },
  { kind: 'fight', at: 0.5, dur: 4.6, text: ['A fight: the crossed swords.', 'Poisoned: a red stone.'] },
  { kind: 'peak', at: 0.4, dur: 4.4, text: ['The ring: your experience', 'to the next level.'] },
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

/** The end card in the title's style, readable to the film's last frame; `from`: film s. */
function EndCard({ from }: { from: number }) {
  const s = useCurrentFrame() / FPS;
  const opacity = interpolate(s, [from, from + END_CARD.inS], [0, 1], soft);
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

/** The film s of a take's marker. */
const at = (take: TimelineFile, kind: string, label?: string): number => GAME_AT_S + marker(take, kind, label).t;

export function Character({ take }: CharacterProps) {
  const s = useCurrentFrame() / FPS;
  if (!take) return null;
  const gameEnd = GAME_AT_S + take.frames / FPS;
  const cut = at(take, 'cut');
  const game = interpolate(s, [GAME_AT_S, GAME_AT_S + GAME_IN_S, gameEnd - GAME_OUT_S, gameEnd], [0, 1, 1, 0], soft);
  const dip = interpolate(s, [cut - DIP.before, cut, cut + 0.05, cut + DIP.after], [1, 0, 0, 1], soft);
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={f(GAME_AT_S)}>
        <Title />
      </Sequence>
      <Sequence from={f(GAME_AT_S)} durationInFrames={take.frames}>
        <AbsoluteFill style={{ opacity: game * dip }}>
          <OffthreadVideo src={staticFile(`recordings/${take.scene}.mp4`)} muted style={{ width: '100%', height: '100%' }} />
          {/* a stepped take's input is logged at the frame before the one that shows it */}
          <Cursor tl={take} startS={-0.5 / FPS} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      {CAPTIONS.map((c) => (
        <LowerThird key={c.text[0]} from={f(at(take, c.kind, c.label) + c.at)} dur={f(c.dur)} text={c.text} top={CAPTION_TOP} />
      ))}
      <EndCard from={gameEnd + END_CARD.afterGame} />
      <Audio src={staticFile('music/no-good-layabout.mp3')} />
    </AbsoluteFill>
  );
}
