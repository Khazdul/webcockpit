// The film's compositions. Each scene's length and times come from its
// recording's timeline (public/recordings/<scene>.json, `npm run record`).
import { Composition } from 'remotion';
import { beat } from './beats';
import { PART1_END_BEAT, Part1, type Part1Props } from './compositions/Part1';
import { TestBree, type TestBreeProps } from './compositions/TestBree';
import './fonts';
import { FPS, HEIGHT, WIDTH, loadTimeline } from './timeline';

export function Root() {
  return (
    <>
      <Composition
        id="Part1"
        component={Part1}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={beat(PART1_END_BEAT)}
        defaultProps={{ tl: null, fadeOut: true } satisfies Part1Props}
        calculateMetadata={async ({ props }) => ({ props: { ...props, tl: await loadTimeline('part1') } })}
      />
      <Composition
        id="TestBree"
        component={TestBree}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={FPS * 15}
        defaultProps={{ tl: null } satisfies TestBreeProps}
        calculateMetadata={async () => {
          const tl = await loadTimeline('bree');
          return { durationInFrames: tl.frames, props: { tl } };
        }}
      />
    </>
  );
}
