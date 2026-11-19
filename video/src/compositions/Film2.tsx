// Film 2 (video/manuscript-2.md draft 3), 1920×1080 at 60 fps, acts 0-8:
//
//   acts 0-3  take film2-a (record/scenes/film2-a.ts) from its `film0`
//             marker: night, Bree, the wilds, the wolves
//   act 4     the device act (DevicesAct) from film2-a's `sync` marker, with
//             film2-a as its desktop: the act's first frame is the take's
//             own, so act 3 runs into it without a cut; it ends with the
//             camera back in on the monitor, which shows take B, so act 4
//             runs into act 5 without a cut too
//   acts 5-8  take film2-b (record/scenes/film2-b.ts) from its `film0`: the
//             inn with Profile and Scripts; Exit, History, the account (the
//             Log in page cut out); the export editor, the share, Community,
//             the watch page and its Back (morphs on the start surface, no
//             page load since 0.21); the start page at night, and a
//             dissolve to the same start page at sunrise under the end card
//
// "Sunset Plains" is laid under once and the film ends with it (no beat
// lock; cuts by picture). On top: the lower thirds, the pane buttons'
// tooltips (a headless capture does not draw the browser's), the pointer
// over the desktop takes. The picture fades out with the music's tail.
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import pkg from '../../../package.json';
import { LowerThird } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { DEVICES } from '../devices';
import { FPS, HEIGHT, type TimelineFile, f, marker } from '../timeline';
import { DevicesAct } from './DevicesProto';
import { Tip } from './Film';

export interface Film2Props extends Record<string, unknown> {
  a: TimelineFile | null;
  tablet: TimelineFile | null;
  phone: TimelineFile | null;
  b: TimelineFile | null;
}

export const FILM2_TAKES = { a: 'film2-a', b: 'film2-b' } as const;

/** The version as the film names it: major and minor (0.17). */
const VERSION = pkg.version.split('.').slice(0, 2).join('.');

/**
 * The film ends with the music (owner round 1, item 10): "Sunset Plains" is
 * 329.68 s long and plays once. Its full sound ends at about 322.7 s and its
 * own tail dies away over the last 7 s: the picture fades to black over that
 * tail, and the last frame is the music's last.
 */
export const MUSIC_S = 329.68;
const TAIL_FROM_S = 323.0;
/** The end card should be up by the music's last bars (a warning in the studio's console otherwise). */
const CARD_LATEST_S = 318.5;
/** Where the card comes when the film leaves room for it: about 6.5 s before the tail. */
const CARD_AT_S = 316.5;

/** Film s where act 4 starts (take A's `sync`). */
export const act4At = (a: TimelineFile): number => marker(a, 'sync').t - marker(a, 'film0').t;

/** The dissolve from the start page at night to the same page at sunrise (act 8), s: slow (owner round 3), it runs under the end card. */
const DAWN_DISSOLVE_S = 7.5;
/** The dissolve starts this long after the night start page is back. */
const DAWN_AFTER_S = 0.5;

/**
 * Where acts 5-8 lie in the film (s): take B in pieces. The Log in page is
 * cut out (owner round 1), and the account's reload; the night start page dissolves into the dawn one
 * (the take reloads the start page at sunrise between them, off the film).
 */
export function film2Plan(a: TimelineFile, b: TimelineFile) {
  const b0 = marker(b, 'film0').t;
  /** Take B s from its film0. */
  const tb = (kind: string): number => marker(b, kind).t - b0;
  const at5 = act4At(a) + DEVICES.end;
  /** Take B stretches [from, to) in take s, each fading in over `fade` s on top of the one before. */
  const spans: { from: number; to: number; fade: number }[] = [
    { from: 0, to: tb('owner') + 0.2, fade: 0 },
    // the Log in page cut out (owner round 1): from the owner row's press to Create account, settled
    // the account's own reload (Continue: a "Loading client" box) cut over, a plain cut at a page load
    { from: tb('create-up'), to: tb('continue') + 0.4, fade: 0 },
    // (the owner row is in the page about 0.9 s before the reloaded start page has drawn its menu)
    { from: tb('owner-in') + 0.9, to: tb('start-again') + DAWN_AFTER_S + DAWN_DISSOLVE_S, fade: 0 },
    { from: tb('dawn'), to: Infinity, fade: DAWN_DISSOLVE_S },
  ];
  const pieces: { at: number; from: number; to: number; fade: number }[] = [];
  let at = at5;
  for (const sp of spans) {
    at -= sp.fade;
    pieces.push({ at, ...sp });
    at += sp.to - sp.from;
  }
  /** Take B s (from film0) → film s (a moment in a skipped stretch maps to the next piece's start). */
  const fromB = (s: number): number => {
    for (const p of pieces) if (s < p.to) return p.at + Math.max(0, s - p.from);
    return pieces.at(-1)!.at + (s - pieces.at(-1)!.from);
  };
  // the card on the music's last bars, at least a moment after the night start page is back (the dawn may still be coming in under it)
  const dawnIn = pieces.at(-1)!.at + DAWN_DISSOLVE_S;
  const cardFrom = Math.max(fromB(tb('start-again')) + 2.5, CARD_AT_S);
  if (dawnIn > TAIL_FROM_S - 1.0) console.warn(`Film2: the dawn is in only at ${dawnIn.toFixed(1)} s, near the tail's fade (${TAIL_FROM_S} s)`);
  if (cardFrom > CARD_LATEST_S) console.warn(`Film2: the end card comes at ${cardFrom.toFixed(1)} s, after the music's last bars (${CARD_LATEST_S} s)`);
  return { b0, at5, pieces, fromB, dawnIn, cardFrom, fadeFrom: TAIL_FROM_S, end: MUSIC_S };
}

/** The film's length, s. */
export const film2Length = (a: TimelineFile, b: TimelineFile): number => film2Plan(a, b).end;

export function Film2({ a, tablet, phone, b }: Film2Props) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!a || !tablet || !phone || !b) return null;
  const f0 = marker(a, 'film0').t;
  /** Film s of take A's marker. */
  const m = (kind: string, label?: string): number => marker(a, kind, label).t - f0;
  const plan = film2Plan(a, b);
  /** Film s of take B's marker. */
  const mb = (kind: string, label?: string): number => plan.fromB(marker(b, kind, label).t - plan.b0);
  const span = (from: number, to: number) => ({ from: f(from), dur: Math.max(1, f(to) - f(from)) });
  const at4 = act4At(a);
  const tips = a.markers
    .filter((x) => x.kind === 'tip' && x.box)
    .map((x) => ({ from: x.t - f0, to: (a.markers.find((e) => e.kind === 'tip-end' && e.label === x.label && e.t >= x.t)?.t ?? x.t + 1.2) - f0, text: x.label, box: x.box! }));

  const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) } as const;
  const black = interpolate(frame, [0, f(1.4), f(plan.fadeFrom), durationInFrames - 1], [1, 0, 0, 1], ease);
  // the music once, at full volume to its own end (a short fade in at the start only)
  const volume = (fr: number): number => interpolate(fr, [0, f(0.4)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={f(at4)}>
        <AbsoluteFill>
          <OffthreadVideo src={staticFile(`recordings/${a.scene}.mp4`)} trimBefore={f(f0)} muted style={{ width: '100%', height: '100%' }} />
          <Cursor tl={a} startS={f0} restS={2.5} />
        </AbsoluteFill>
      </Sequence>
      <Sequence from={f(at4)} durationInFrames={f(plan.at5) - f(at4)}>
        <DevicesAct desktop={a} tablet={tablet} phone={phone} next={b} nextAt={plan.b0} />
      </Sequence>
      {/* acts 5-8: take B in its pieces (act 4's camera ends on its first frame; the dawn dissolves in) */}
      {plan.pieces.map((p, i) => (
        <Sequence key={i} from={f(p.at)} {...(Number.isFinite(p.to) ? { durationInFrames: f(p.at + p.to - p.from) - f(p.at) } : {})}>
          <AbsoluteFill style={p.fade > 0 ? { opacity: interpolate(frame, [f(p.at), f(p.at + p.fade)], [0, 1], ease) } : undefined}>
            <OffthreadVideo src={staticFile(`recordings/${b.scene}.mp4`)} trimBefore={f(plan.b0 + p.from)} muted style={{ width: '100%', height: '100%' }} />
            {i === 0 ? (
              // the camera ends on this take's first frame with the pointer resting on it: it fades in, no pop
              <AbsoluteFill style={{ opacity: interpolate(frame, [f(p.at), f(p.at + 0.4)], [0, 1], ease) }}>
                <Cursor tl={b} startS={plan.b0 + p.from} restS={2.5} />
              </AbsoluteFill>
            ) : (
              <Cursor tl={b} startS={plan.b0 + p.from} restS={2.5} />
            )}
          </AbsoluteFill>
        </Sequence>
      ))}
      {tips.map((t, i) => (
        <Tip key={i} {...t} />
      ))}
      {/* act 0 */}
      <LowerThird {...span(1.5, 10.5)} text={[`Live demo of WebCockpit ${VERSION}`, 'Try it at mumecockpit.com']} />
      {/* act 1: once Comm is up, through Eilwen's chat; then the appearance */}
      <LowerThird {...span(m('pane', 'comm') + 0.8, m('segment', 'merc-arrives') - 0.2)} text="Conversations get a pane of their own." />
      <LowerThird {...span(m('font-list'), m('settings-closed') + 0.3)} text="Customise fonts, colours and more." />
      {/* act 2: Group docked above the map (it lands at its four rows), its look (owner rounds 1 and 2, item 2) */}
      <LowerThird {...span(m('dock-caption'), m('dock-done') + 1.2)} text="Panes can be docked and customised." />
      {/* act 2: once the spells are in the Timers pane */}
      <LowerThird {...span(m('segment', 'casts') + 3.6, m('segment', 'casts') + 7.6)} text="The Timers pane tracks spells, buffs and more." />
      {/* act 5: each caption first, then the pointer goes to the icon */}
      <LowerThird {...span(mb('profile-caption'), mb('profile-closed') + 0.2)} text="Open the profile to create aliases, actions and keys." />
      {/* (through Mercenaries on, its cost and autopay in its settings: owner round 2, item 6) */}
      <LowerThird {...span(mb('scripts-caption'), mb('merc-autopay') + 1.2)} text="A Lua scripting engine for anything more complex." />
      {/* act 6: History; the account, while the Create account page is filled in (owner round 2, item 7) */}
      <LowerThird {...span(mb('history') + 0.5, mb('history-closed'))} text="Every session is saved and can be replayed." />
      <LowerThird {...span(mb('create-up') + 0.4, mb('code') + 1.0)} text={['Create an account and your settings are kept', 'in the cloud, in sync across your devices.']} />
      {/* act 7: the export editor's exclude and comment, then the share (owner round 2, item 8) */}
      <LowerThird {...span(mb('share') + 0.8, mb('community') + 0.4)} text="Edit, comment on and share your runs with friends or the community." />
      {/* act 8: the end card, centred low over the start page at sunrise */}
      <LowerThird from={f(plan.cardFrom)} dur={durationInFrames - f(plan.cardFrom) + f(1)} text={[`WebCockpit ${VERSION}`, 'mumecockpit.com · Free and open source']} center />
      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio src={staticFile('music/sunset-plains.wav')} volume={volume} />
    </AbsoluteFill>
  );
}
