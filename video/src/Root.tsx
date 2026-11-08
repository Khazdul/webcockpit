// The film's compositions. Each scene's length and times come from its
// recording's timeline (public/recordings/<scene>.json, `npm run record`).
import { Composition } from 'remotion';
import { TestBree, type TestBreeProps } from './compositions/TestBree';
import './fonts';
import { FPS, HEIGHT, WIDTH, loadTimeline } from './timeline';

export function Root() {
  return (
    <>
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
