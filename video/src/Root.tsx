// The film's compositions. Each scene's length and times come from its
// recording's timeline (public/recordings/<scene>.json, `npm run record`).
import { Composition } from 'remotion';
import { beat } from './beats';
import { Film, type FilmProps, ending } from './compositions/Film';
import { PART1_END_BEAT, Part1, type Part1Props } from './compositions/Part1';
import { TestBree, type TestBreeProps } from './compositions/TestBree';
import { DecodeTest } from './DecodeTest';
import './fonts';
import { FPS, HEIGHT, WIDTH, loadTimeline } from './timeline';

export function Root() {
  return (
    <>
      <Composition
        id="Film"
        component={Film}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={FPS * 190}
        defaultProps={{ a: null, b: null } satisfies FilmProps}
        calculateMetadata={async ({ props }) => {
          const b = await loadTimeline('take-b');
          return { durationInFrames: Math.round(ending(b).end * FPS), props: { ...props, a: await loadTimeline('take-a'), b } };
        }}
      />
      {/* A check, not the film: a recording as Remotion decodes it (ADR 0133 addendum). */}
      <Composition id="DecodeTest" component={DecodeTest} width={1920} height={1080} fps={60} durationInFrames={20} defaultProps={{ file: 'part1.mp4' }} />
      <Composition
        id="Part1"
        component={Part1}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={beat(PART1_END_BEAT)}
        defaultProps={{ tl: null, fadeOut: false } satisfies Part1Props}
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
