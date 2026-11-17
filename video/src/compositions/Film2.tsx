// Film 2 (video/manuscript-2.md draft 2), 1920×1080 at 60 fps. For now
// acts 0-4:
//
//   acts 0-3  take film2-a (record/scenes/film2-a.ts) from its `film0`
//             marker: night, Bree, the wilds, the wolves
//   act 4     the device act (DevicesAct) from film2-a's `sync` marker, with
//             film2-a as its desktop: the act's first frame is the take's
//             own, so act 3 runs into it without a cut
//
// "Sunset Plains" is laid under (no beat lock; cuts by picture). On top: the
// lower thirds, the pane gear's tooltip (a headless capture does not draw the
// browser's), the pointer over the desktop take.
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import pkg from '../../../package.json';
import { LowerThird } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { DEVICES } from '../devices';
import { type TimelineFile, f, marker } from '../timeline';
import { DevicesAct } from './DevicesProto';
import { Tip } from './Film';

export interface Film2Props extends Record<string, unknown> {
  a: TimelineFile | null;
  tablet: TimelineFile | null;
  phone: TimelineFile | null;
}

/** The version as the film names it: major and minor (0.17). */
const VERSION = pkg.version.split('.').slice(0, 2).join('.');

/** Film s where act 4 starts (take A's `sync`). */
export const act4At = (a: TimelineFile): number => marker(a, 'sync').t - marker(a, 'film0').t;
/** The film's length so far, s: acts 0-4. */
export const film2Length = (a: TimelineFile): number => act4At(a) + DEVICES.end;

export function Film2({ a, tablet, phone }: Film2Props) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!a || !tablet || !phone) return null;
  const f0 = marker(a, 'film0').t;
  /** Film s of take A's marker. */
  const m = (kind: string, label?: string): number => marker(a, kind, label).t - f0;
  const span = (from: number, to: number) => ({ from: f(from), dur: Math.max(1, f(to) - f(from)) });
  const at4 = act4At(a);
  // the first wolf dies about 1.1 s before the `l` that follows it (the last `l` before act 4)
  const kill = (a.markers.filter((x) => x.kind === 'cmd' && x.label === 'l' && x.t - f0 < at4).at(-1)?.t ?? f0 + at4 - 2.5) - f0 - 1.1;
  const tips = a.markers
    .filter((x) => x.kind === 'tip' && x.box)
    .map((x) => ({ from: x.t - f0, to: (a.markers.find((e) => e.kind === 'tip-end' && e.label === x.label && e.t >= x.t)?.t ?? x.t + 1.2) - f0, text: x.label, box: x.box! }));

  const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) } as const;
  const black = interpolate(frame, [0, f(1.4), durationInFrames - f(0.9), durationInFrames - 1], [1, 0, 0, 1], ease);
  const volume = (fr: number): number => interpolate(fr, [0, f(0.4), durationInFrames - f(2.5), durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={f(at4)}>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(`recordings/${a.scene}.mp4`)} trimBefore={f(f0)} muted style={{ width: '100%', height: '100%' }} />
          <Cursor tl={a} startS={f0} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={f(at4)}>
        <DevicesAct desktop={a} tablet={tablet} phone={phone} />
      </Sequence>
      {tips.map((t, i) => (
        <Tip key={i} {...t} />
      ))}
      {/* act 0 */}
      <LowerThird {...span(1.5, 10.5)} text={[`Live demo of WebCockpit ${VERSION}`, 'Try it at mumecockpit.com']} />
      {/* act 1: once Comm is up, through Eilwen's chat; then the appearance */}
      <LowerThird {...span(m('pane', 'comm') + 0.8, m('segment', 'merc-arrives') - 0.2)} text="Conversations get a pane of their own." />
      <LowerThird {...span(m('font-list'), m('settings-closed') + 0.3)} text="Customise fonts, colours and more." />
      {/* act 2: once the spells are in the Timers pane */}
      <LowerThird {...span(m('segment', 'casts') + 3.6, m('segment', 'casts') + 7.6)} text="The Timers pane tracks spells, buffs and more." />
      {/* act 3: from the kill (Last kill shows) until the camera pulls back in act 4 */}
      <LowerThird {...span(kill, at4 + 3.0)} text="Statistics follow every kill." />
      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio src={staticFile('music/sunset-plains.wav')} volume={volume} loop />
    </AbsoluteFill>
  );
}
