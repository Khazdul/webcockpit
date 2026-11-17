// Film 2 (video/manuscript-2.md draft 2), 1920×1080 at 60 fps, acts 0-8:
//
//   acts 0-3  take film2-a (record/scenes/film2-a.ts) from its `film0`
//             marker: night, Bree, the wilds, the wolves
//   act 4     the device act (DevicesAct) from film2-a's `sync` marker, with
//             film2-a as its desktop: the act's first frame is the take's
//             own, so act 3 runs into it without a cut
//   acts 5-8  a plain cut to take film2-b (record/scenes/film2-b.ts) from its
//             `film0`: the inn with Profile, Scripts and a pane moved; Exit,
//             History, the account; at its `phone-out` the phone shot
//             (film2-phone in the device act's phone frame), then film2-b
//             again from `phone-in`: the share, Community, the watch page,
//             and the start page at sunrise under the end card
//
// "Sunset Plains" is laid under, looped (no beat lock; cuts by picture).
// On top: the lower thirds, the pane gear's tooltip (a headless capture does
// not draw the browser's), the pointer over the desktop takes. Picture and
// music fade out together at the end.
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import pkg from '../../../package.json';
import { LowerThird } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { DEVICES, PHONE_SHOT } from '../devices';
import { FPS, HEIGHT, type TimelineFile, f, marker } from '../timeline';
import { DevicesAct, PHO, Screen, Slab, touchesOf } from './DevicesProto';
import { Tip } from './Film';

export interface Film2Props extends Record<string, unknown> {
  a: TimelineFile | null;
  tablet: TimelineFile | null;
  phone: TimelineFile | null;
  b: TimelineFile | null;
  phone2: TimelineFile | null;
}

export const FILM2_TAKES = { a: 'film2-a', b: 'film2-b', phone2: 'film2-phone' } as const;

/** The version as the film names it: major and minor (0.17). */
const VERSION = pkg.version.split('.').slice(0, 2).join('.');

/** The end card comes up this long after the start page is back (s), holds, then picture and music fade together. */
const CARD_DELAY_S = 1.6;
const CARD_HOLD_S = 4.2;
const FADE_S = 3.0;

/** Film s where act 4 starts (take A's `sync`). */
export const act4At = (a: TimelineFile): number => marker(a, 'sync').t - marker(a, 'film0').t;

/** Where acts 5-8 lie in the film (s): take B's two stretches and the phone shot between them. */
export function film2Plan(a: TimelineFile, b: TimelineFile) {
  const b0 = marker(b, 'film0').t;
  const at5 = act4At(a) + DEVICES.end;
  /** Take B s → its film s in the first stretch (to `phone-out`). */
  const out = marker(b, 'phone-out').t - b0;
  const back = marker(b, 'phone-in').t - b0;
  const phoneAt = at5 + out;
  const resumeAt = phoneAt + PHONE_SHOT.end;
  /** Take B s (from film0) → film s: before the phone shot or after it. */
  const fromB = (s: number): number => (s <= out ? at5 + s : resumeAt + (s - back));
  const startAgain = fromB(marker(b, 'start-again').t - b0);
  const cardFrom = startAgain + CARD_DELAY_S;
  const fadeFrom = cardFrom + CARD_HOLD_S;
  return { b0, at5, out, back, phoneAt, resumeAt, fromB, cardFrom, fadeFrom, end: fadeFrom + FADE_S };
}

/** The film's length, s. */
export const film2Length = (a: TimelineFile, b: TimelineFile): number => film2Plan(a, b).end;

/** Act 6's phone: the device act's phone frame, upright, right of the middle (the caption sits at the left). */
function PhoneShot({ tl }: { tl: TimelineFile }) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const h = 940;
  const k = h / PHO.h;
  const w = PHO.w * k;
  const rect = { x: 1400 - w / 2, y: (HEIGHT - h) / 2 - 6, w, h };
  const crop = { w: Math.round(390 * tl.dpr), h: Math.round(844 * tl.dpr) };
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 70% at 62% 46%, #1c1f26 0%, #111318 55%, #0a0b0e 100%)' }}>
      <Slab s={rect} k={k} bezel={PHO.bezel} radius={40} glow={0} cam="top" buttons="right">
        <Screen tl={tl} rect={rect} crop={crop} radius={30 * k} dark={0} frozenAt={null} film={t} touches={touchesOf(tl)} />
      </Slab>
    </AbsoluteFill>
  );
}

export function Film2({ a, tablet, phone, b, phone2 }: Film2Props) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!a || !tablet || !phone || !b || !phone2) return null;
  const f0 = marker(a, 'film0').t;
  /** Film s of take A's marker. */
  const m = (kind: string, label?: string): number => marker(a, kind, label).t - f0;
  const plan = film2Plan(a, b);
  /** Film s of take B's marker. */
  const mb = (kind: string, label?: string): number => plan.fromB(marker(b, kind, label).t - plan.b0);
  const span = (from: number, to: number) => ({ from: f(from), dur: Math.max(1, f(to) - f(from)) });
  const at4 = act4At(a);
  // the first wolf dies about 1.1 s before the `l` that follows it (the last `l` before act 4)
  const kill = (a.markers.filter((x) => x.kind === 'cmd' && x.label === 'l' && x.t - f0 < at4).at(-1)?.t ?? f0 + at4 - 2.5) - f0 - 1.1;
  const tips = a.markers
    .filter((x) => x.kind === 'tip' && x.box)
    .map((x) => ({ from: x.t - f0, to: (a.markers.find((e) => e.kind === 'tip-end' && e.label === x.label && e.t >= x.t)?.t ?? x.t + 1.2) - f0, text: x.label, box: x.box! }));

  const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) } as const;
  const black = interpolate(frame, [0, f(1.4), f(plan.fadeFrom), durationInFrames - 1], [1, 0, 0, 1], ease);
  const volume = (fr: number): number => interpolate(fr, [0, f(0.4), f(plan.fadeFrom), durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={f(at4)}>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(`recordings/${a.scene}.mp4`)} trimBefore={f(f0)} muted style={{ width: '100%', height: '100%' }} />
          <Cursor tl={a} startS={f0} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={f(at4)} durationInFrames={f(plan.at5) - f(at4)}>
        <DevicesAct desktop={a} tablet={tablet} phone={phone} />
      </Sequence>
      {/* acts 5-6 to the phone shot: a plain cut from the phone in landscape */}
      <Sequence from={f(plan.at5)} durationInFrames={f(plan.phoneAt) - f(plan.at5)}>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(`recordings/${b.scene}.mp4`)} trimBefore={f(plan.b0)} muted style={{ width: '100%', height: '100%' }} />
          <Cursor tl={b} startS={plan.b0} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={f(plan.phoneAt)} durationInFrames={f(plan.resumeAt) - f(plan.phoneAt)}>
        <PhoneShot tl={phone2} />
      </Sequence>
      {/* acts 6 (its end) to 8 */}
      <Sequence from={f(plan.resumeAt)}>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(`recordings/${b.scene}.mp4`)} trimBefore={f(plan.b0 + plan.back)} muted style={{ width: '100%', height: '100%' }} />
          <Cursor tl={b} startS={plan.b0 + plan.back} restS={2.5} />
        </AbsoluteFill>
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
      {/* act 5: each caption first, then the pointer goes to the icon */}
      <LowerThird {...span(mb('profile-caption'), mb('profile-closed') + 0.2)} text="Open the profile to create aliases, actions and keys from the menu or in the editor." />
      <LowerThird {...span(mb('scripts-caption'), mb('scripts-closed'))} text="A Lua scripting engine for anything more complex." />
      {/* act 6: History; the account, from the owner row naming it through the phone */}
      <LowerThird {...span(mb('history') + 0.5, mb('history-closed'))} text="Every session is saved and can be replayed." />
      <LowerThird {...span(mb('owner-in') + 0.3, plan.resumeAt - 0.2)} text="An account keeps profiles, scripts, settings and runs in sync." />
      {/* act 7: while the share dialog is up (the Community page's boxes stay clear) */}
      <LowerThird {...span(mb('share-dialog') + 0.8, mb('community') + 0.4)} text="Share your runs with the community." />
      {/* act 8: the end card, centred low over the start page at sunrise */}
      <LowerThird from={f(plan.cardFrom)} dur={durationInFrames - f(plan.cardFrom) + f(1)} text={[`WebCockpit ${VERSION}`, 'mumecockpit.com · Free and open source']} center />
      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio src={staticFile('music/sunset-plains.wav')} volume={volume} loop />
    </AbsoluteFill>
  );
}
