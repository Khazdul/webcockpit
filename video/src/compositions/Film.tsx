// The whole film (video/manuscript.md draft 3), 1920×1080 at 60 fps, the
// music from 0:00. Two takes (record/scenes/take-a.ts, take-b.ts), each
// already timed to the music:
//
//   take A  0:00 → beat 140 (1:44.13)  the start page, Profile, the login,
//                                      the game to the strike, the walk, the wolf
//   take B  beat 140 → the end         the inn, Profile and Scripts windows,
//                                      History, Spotlights, Credits, and the
//                                      start page under the end card
//
// A take's music time comes from its markers (`music0` in A; `musicfrom`
// in B, whose label is the music second it started at), so a new take
// needs no retiming. On top: the lower thirds, the end card, the music, the
// fades. (The montage of round 0 is gone: owner round 1, item 13.)
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import pkg from '../../../package.json';
import { beat, beatS } from '../beats';
import { LowerThird } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { type TimelineFile, f, marker } from '../timeline';

export interface FilmProps extends Record<string, unknown> {
  a: TimelineFile | null;
  b: TimelineFile | null;
}

/** Take B starts on this beat. */
const CUT_B = 140;
/** The end card from beat 229 (after Credits' Back); the last full hit is beat 251; black by about 3:10. */
const CARD_FROM = 229;
const LAST_HIT = 251;
export const FILM_END_S = 190.2;

/** A take's time (s from its first frame) at a music time. */
interface Take {
  tl: TimelineFile;
  at: (music: number) => number;
}

function takeA(tl: TimelineFile): Take {
  const m0 = marker(tl, 'music0').t;
  return { tl, at: (m) => m0 + m };
}
function takeB(tl: TimelineFile): Take {
  const m = marker(tl, 'musicfrom');
  const from = Number(m.label);
  return { tl, at: (music) => m.t + (music - from) };
}

/** A stretch of a take from its time `from` (s), placed in the film by the parent Sequence. */
function Shot({ take, from, cursor = true }: { take: Take; from: number; cursor?: boolean }) {
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(`recordings/${take.tl.scene}.mp4`)} trimBefore={Math.max(0, f(from))} muted style={{ width: '100%', height: '100%' }} />
      {cursor ? <Cursor tl={take.tl} startS={from} restS={2.5} /> : null}
    </AbsoluteFill>
  );
}

export function Film({ a, b }: FilmProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  if (!a || !b) return null;
  const A = takeA(a);
  const Bt = takeB(b);
  /** Music s of a take's marker. */
  const mA = (kind: string, label?: string): number => marker(a, kind, label).t - marker(a, 'music0').t;
  const mB = (kind: string, label?: string): number => {
    const m = marker(b, 'musicfrom');
    return marker(b, kind, label).t - m.t + Number(m.label);
  };
  const cutB = beat(CUT_B);
  const fs = (s: number): number => f(s);
  const span = (from: number, to: number) => ({ from: fs(from), dur: Math.max(1, fs(to) - fs(from)) });

  const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) } as const;
  const black = interpolate(frame, [0, f(1.4), beat(LAST_HIT), durationInFrames - f(0.4)], [1, 0, 0, 1], ease);
  const volume = (fr: number): number => interpolate(fr, [0, f(0.4), beat(LAST_HIT), durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={cutB}>
        <Shot take={A} from={A.at(0)} />
      </Sequence>
      <Sequence from={cutB}>
        <Shot take={Bt} from={Bt.at(beatS(CUT_B))} />
      </Sequence>
      {/* The lower thirds, each while what it names is on screen (owner round 1: the menu-bar ones come first, then the pointer). */}
      <LowerThird from={beat(3)} dur={beat(15) - beat(3)} text={[`Live demo of WebCockpit ${pkg.version}`, 'Try it at mumecockpit.com']} />
      <LowerThird {...span(mA('profile') + 0.9, mA('back') - 0.3)} text="Profiles hold your basic settings." />
      <LowerThird {...span(mA('weather-on') + 0.4, mA('font-list') - 0.5)} text="Weather effects follow the game." />
      <LowerThird {...span(mA('font-list'), mA('settings-closed') + 0.3)} text="Customise fonts, colours and more." />
      {/* once Shield, Armour and Shroud are in the Timers pane, then Group as Tod fights; the Group settings follow */}
      <LowerThird {...span(mA('segment', 'casts') + 4.8, mA('segment', 'casts') + 8.8)} text="The Timers pane tracks spells, buffs and more." />
      <LowerThird {...span(mA('segment', 'wolf') + 1.7, mA('group-gear-2') - 0.6)} text="The Group pane shows your group and follows your fights." />
      <LowerThird {...span(beatS(147), mB('profile-closed') + 0.2)} text="Create aliases, actions and keys from the menu or in the editor." />
      <LowerThird {...span(beatS(165), mB('scripts-closed'))} text="A Lua scripting engine for anything more complex." />
      <LowerThird {...span(beatS(184), beatS(199) - 0.3)} text="Every session is saved and can be replayed." />
      <LowerThird {...span(beatS(202) + 0.5, beatS(216))} text="Spotlights collect your kills, deaths, level-ups and achievements." />
      <LowerThird {...span(beatS(219) + 0.6, beatS(226))} text="Credits tell your characters' story as a book." />
      {/* The end card, centred low over the night start page (its quote faded on the page); it fades with the music's tail. */}
      <LowerThird from={beat(CARD_FROM)} dur={durationInFrames - beat(CARD_FROM) + f(1)} text={[`WebCockpit ${pkg.version}`, 'mumecockpit.com · Free and open source']} center />

      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio src={staticFile('music/sunset-plains.wav')} volume={volume} />
    </AbsoluteFill>
  );
}
