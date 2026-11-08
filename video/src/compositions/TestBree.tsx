// "An evening in Bree", the pipeline's test scene (ADR 0133): the bree
// recording with a title, a zoom into the map pane while Rasta walks, a
// caption for the sunset, music, fades. Every time comes from the
// recording's markers, so a new take needs no retiming.
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Camera, type Shot } from '../components/Camera';
import { Caption, Title } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { type TimelineFile, f, marker } from '../timeline';

export interface TestBreeProps extends Record<string, unknown> {
  tl: TimelineFile | null;
}

/** Fade from and to black, s. */
const FADE_IN = 0.6;
const FADE_OUT = 1.2;
/** The music's fades, s. */
const MUSIC_IN = 1.5;
const MUSIC_OUT = 2.5;
const MUSIC_VOLUME = 0.8;

export function TestBree({ tl }: TestBreeProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!tl) return null;

  const walk = marker(tl, 'walk').t;
  const tell = marker(tl, 'tell').t;
  const night = marker(tl, 'night').t;
  const map = marker(tl, 'map').box!;

  // In just after the first command, out so the view is whole again when the tell arrives.
  const zoom: Shot = {
    box: map,
    in: f(walk + 0.4),
    inFor: f(1.3),
    out: f(tell - 1.25),
    outFor: f(1.1),
    margin: 0.04,
    alignX: 0.5,
    alignY: 0.5,
  };

  const black = interpolate(frame, [0, f(FADE_IN), durationInFrames - f(FADE_OUT), durationInFrames - 1], [1, 0, 0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.quad),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Camera shots={[zoom]} videoWidth={tl.width}>
        <OffthreadVideo src={staticFile(`recordings/${tl.scene}.mp4`)} muted style={{ width: '100%', height: '100%' }} />
        <Cursor tl={tl} />
      </Camera>

      <Title from={f(0.25)} dur={f(Math.max(2.6, walk + 0.3))} title="MUME, in a browser tab." line="WebCockpit · nothing to install, just a link" />
      <Caption from={zoom.in + f(0.7)} dur={zoom.out - zoom.in} text="The map follows every step." sub="Rooms and exits drawn as you walk Bree." />
      {/* While the dusk glow is strongest, after the tell has had its moment. */}
      <Caption from={f(Math.min(tell + 1.2, night - 4))} dur={f(4.4)} text="Dusk falls over Bree." sub="Weather and daylight follow the game." />

      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />

      <Audio
        src={staticFile('music/sunset-plains.wav')}
        volume={(fr) =>
          MUSIC_VOLUME *
          interpolate(fr, [0, f(MUSIC_IN), durationInFrames - f(MUSIC_OUT), durationInFrames - 1], [0, 1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          })
        }
      />
    </AbsoluteFill>
  );
}
