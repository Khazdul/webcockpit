// The film's compositions. Each scene's length and times come from its
// recording's timeline (public/recordings/<scene>.json, `npm run record`).
import { Composition } from 'remotion';
import { beat } from './beats';
import { BALLOONS_END_S, BALLOONS_TAKE, Balloons, type BalloonsProps } from './compositions/Balloons';
import { DEVICES_PROTO_S, DEVICES_TAKES, DevicesProto, type DevicesProtoProps } from './compositions/DevicesProto';
import { Film, type FilmProps, ending } from './compositions/Film';
import { FILM2_TAKES, Film2, type Film2Props, film2Length } from './compositions/Film2';
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
      {/* Film 2 (video/manuscript-2.md): acts 0-8. */}
      <Composition
        id="Film2"
        component={Film2}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={FPS * 330}
        defaultProps={{ a: null, tablet: null, phone: null, b: null } satisfies Film2Props}
        calculateMetadata={async ({ props }) => {
          const a = await loadTimeline(FILM2_TAKES.a);
          const b = await loadTimeline(FILM2_TAKES.b);
          return {
            durationInFrames: Math.floor(film2Length(a, b) * FPS),
            props: {
              ...props,
              a,
              b,
              tablet: await loadTimeline(DEVICES_TAKES.tablet),
              phone: await loadTimeline(DEVICES_TAKES.phone),
            },
          };
        }}
      />
      {/* The balloon film (video/manuscript-balloons.md, stage 76). */}
      <Composition
        id="Balloons"
        component={Balloons}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={Math.round(BALLOONS_END_S * FPS)}
        defaultProps={{ take: null } satisfies BalloonsProps}
        calculateMetadata={async ({ props }) => ({ props: { ...props, take: await loadTimeline(BALLOONS_TAKE) } })}
      />
      {/* Film 2's device prototype (stage 70): one session on desktop, tablet and phone. */}
      <Composition
        id="DevicesProto"
        component={DevicesProto}
        width={WIDTH}
        height={HEIGHT}
        fps={FPS}
        durationInFrames={Math.round(DEVICES_PROTO_S * FPS)}
        defaultProps={{ desktop: null, tablet: null, phone: null } satisfies DevicesProtoProps}
        calculateMetadata={async ({ props }) => ({
          props: {
            ...props,
            desktop: await loadTimeline(DEVICES_TAKES.desktop),
            tablet: await loadTimeline(DEVICES_TAKES.tablet),
            phone: await loadTimeline(DEVICES_TAKES.phone),
          },
        })}
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
