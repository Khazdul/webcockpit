// The film's part 1 (video/manuscript.md, music 0:00 to the phrase at
// 0:50.06, beat 67): the start page at dusk with the opening card, Profile
// (khazdul selected) with its caption, Enter MUME and MUME's login screen.
//
// One continuous take (record/scenes/part1.ts), already timed to the music:
// its `music0` marker is the composition's frame 0, and its clicks land on
// their beats, so the take plays at its own speed with no cut. The pointer
// is drawn from the take's input log. The end fades out quickly at beat 67
// (the music runs on into part 2, which starts at the same beat).
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { beat } from '../beats';
import { LowerThird, TitleCard } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { type TimelineFile, f, marker } from '../timeline';

export interface Part1Props extends Record<string, unknown> {
  tl: TimelineFile | null;
  /** Fade to black at the end (off when the parts are joined). */
  fadeOut?: boolean;
}

/** The part ends on beat 67 (0:50.06). */
export const PART1_END_BEAT = 67;
/** Fade in from black, s; the short fade out at the end, s. */
const FADE_IN = 1.4;
const FADE_OUT = 0.35;

export function Part1({ tl, fadeOut = true }: Part1Props) {
  const frame = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  if (!tl) return null;
  const music0 = marker(tl, 'music0').t;
  // Take seconds → composition frames.
  const at = (kind: string): number => f(marker(tl, kind).t - music0);

  const black = interpolate(
    frame,
    [0, f(FADE_IN), durationInFrames - (fadeOut ? f(FADE_OUT) : 0) - 1, durationInFrames - 1],
    [1, 0, 0, fadeOut ? 1 : 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <OffthreadVideo src={staticFile(`recordings/${tl.scene}.mp4`)} trimBefore={f(music0)} muted style={{ width: '100%', height: '100%' }} />
      <Cursor tl={tl} startS={music0} />

      {/* The opening card, left of the menu (the wordmark and the menu stay clear). */}
      <TitleCard from={beat(3)} dur={beat(15) - beat(3)} title="WebCockpit" lines={['mumecockpit.com']} x={width * 0.19} size={76} />
      {/* While the Profile page is open: after its grow, until Back. */}
      <LowerThird from={at('profile') + f(1.0)} dur={at('back') - at('profile') - f(1.5)} text="Profiles hold your basic settings." />

      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio
        src={staticFile('music/sunset-plains.wav')}
        volume={(fr) => interpolate(fr, [0, f(0.4)], [0, 1], { extrapolateRight: 'clamp' })}
      />
    </AbsoluteFill>
  );
}
