// The film's part 1 (video/manuscript.md; music 0:00 to beat 59, 0:44.13):
// the start page at night with a shooting star and the opening lower third,
// Profile (khazdul selected) with its caption, Enter MUME, MUME's login
// screen, and Gittan arriving in the Prancing Pony.
//
// One continuous take (record/scenes/part1.ts), already timed to the music:
// its `music0` marker is the composition's frame 0, and its presses land on
// their beats, so the take plays at its own speed with no cut. The pointer
// is drawn from the take's input log and fades where it rests. No fade at
// the end: part 2 continues from the same game state at beat 59.
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
// The client's version, read from the repository's package.json when the film is bundled.
import pkg from '../../../package.json';
import { beat } from '../beats';
import { LowerThird } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { type TimelineFile, f, marker } from '../timeline';

export interface Part1Props extends Record<string, unknown> {
  tl: TimelineFile | null;
  /** A short fade to black at the end (off: part 2 continues from here). */
  fadeOut?: boolean;
}

/** The part ends on beat 59 (0:44.13), a bar into the game. */
export const PART1_END_BEAT = 59;
/** Fade in from black, s; the short fade out at the end, s. */
const FADE_IN = 1.4;
const FADE_OUT = 0.35;

export function Part1({ tl, fadeOut = false }: Part1Props) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!tl) return null;
  const music0 = marker(tl, 'music0').t;
  // Take seconds → composition frames.
  const at = (kind: string): number => f(marker(tl, kind).t - music0);

  const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) } as const;
  const black = fadeOut
    ? interpolate(frame, [0, f(FADE_IN), durationInFrames - f(FADE_OUT) - 1, durationInFrames - 1], [1, 0, 0, 1], ease)
    : interpolate(frame, [0, f(FADE_IN)], [1, 0], ease);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <OffthreadVideo src={staticFile(`recordings/${tl.scene}.mp4`)} trimBefore={f(music0)} muted style={{ width: '100%', height: '100%' }} />
      {/* It fades 2.5 s after it stops (after Enter MUME: where it clicked). */}
      <Cursor tl={tl} startS={music0} restS={2.5} />

      {/* The opening lower third, from beat 3 until well before the pointer reaches for Profile. */}
      <LowerThird from={beat(3)} dur={beat(15) - beat(3)} text={[`Live demo of WebCockpit ${pkg.version}`, 'Try it at mumecockpit.com']} />
      {/* While the Profile page is open: after its grow, until Back. */}
      <LowerThird from={at('profile') + f(0.9)} dur={at('back') - at('profile') - f(1.2)} text="Profiles hold your basic settings." />

      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio
        src={staticFile('music/sunset-plains.wav')}
        volume={(fr) => interpolate(fr, [0, f(0.4)], [0, 1], { extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
}
