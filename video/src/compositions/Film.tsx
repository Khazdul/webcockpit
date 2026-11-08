// The whole film (video/manuscript.md draft 3), 1920×1080 at 60 fps, the
// music from 0:00. Two takes (record/scenes/take-a.ts, take-b.ts), each
// already timed to the music:
//
//   take A  0:00 → beat 175 (2:10.05)  the start page, Profile, the login,
//                                      the game to the strike, the walk, the wolf
//   take B  beat 175 → the end         the inn, Profile and Scripts windows,
//                                      History, Spotlights, Credits, and the
//                                      start page under the end card
//
// A take's music time comes from its markers (`music0` in A; `musicfrom`
// in B, whose label is the music second it started at), so a new take
// needs no retiming. On top: the lower thirds, the pane gears' tooltips (a
// headless capture does not draw the browser's), a dip of the whole frame
// where the game jumps into the fight (the take's `dip` marker), the end card,
// the music, the fades.
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import pkg from '../../../package.json';
import { beat, beatS, isDownbeat } from '../beats';
import { LowerThird } from '../components/Caption';
import { Cursor } from '../components/Cursor';
import { type Box, type TimelineFile, f, marker } from '../timeline';

export interface FilmProps extends Record<string, unknown> {
  a: TimelineFile | null;
  b: TimelineFile | null;
}

/** Take B starts on this beat (a downbeat). */
const CUT_B = 175;
/** The last full hit of the music before its break. */
const LAST_HIT = 251;
/** The music restarts on this beat (3:12.28), a downbeat on the same grid. */
const RESTART_BEAT = 259;
/** Half a dip (to dark, then back), s. */
const DIP_S = 0.35;
/** The end card holds at least this long before the fade, s. */
const CARD_HOLD_S = 4;
/** The card comes up this long after Credits' Back (owner round 4: the start menu is seen alone first), s. */
const CARD_DELAY_S = 2.6;
/** A fade at the end that is not the music's own ring-out, s (picture and music together). */
const END_FADE_S = 3.5;

/** The music s of take B's marker. */
function musicB(b: TimelineFile, kind: string, label?: string): number {
  const m = marker(b, 'musicfrom');
  return marker(b, kind, label).t - m.t + Number(m.label);
}

/**
 * The ending (owner rounds 2 and 3): the end card from just after Credits'
 * Back, held at least CARD_HOLD_S, then the picture and the music fade
 * together over END_FADE_S from the next downbeat. When the card can hold
 * 3-8 s before the last hit (3:06.35) the old ending stays instead: the fade
 * from the hit, black at 3:10.2, the music ringing out. The music breaks
 * after the hit and restarts at 3:12.28, which is beat 259 on the same grid
 * (a downbeat; measured, ADR 0133): a fade that would start in the break
 * starts on that downbeat.
 */
export function ending(b: TimelineFile): { cardFrom: number; fadeFrom: number; end: number } {
  const back = musicB(b, 'start-again');
  const cardFrom = back + CARD_DELAY_S;
  const hit = beatS(LAST_HIT);
  if (cardFrom + 3 <= hit && cardFrom + 8 >= hit) return { cardFrom, fadeFrom: hit, end: 190.2 };
  // the fade is placed from the Back (round 3's card at +0.6, held 4 s), so the later card (round 4) holds about 3 s
  const earliest = back + 0.6 + CARD_HOLD_S;
  let n = Math.ceil((earliest - beatS(0)) / (beatS(1) - beatS(0)));
  while (!isDownbeat(n)) n++;
  if (n > LAST_HIT && n < RESTART_BEAT) n = RESTART_BEAT;
  const fadeFrom = beatS(n);
  return { cardFrom, fadeFrom, end: fadeFrom + END_FADE_S };
}

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

/** A dip of the whole frame centred on music second `at`. */
function Dip({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const c = f(at);
  const h = f(DIP_S);
  const o = interpolate(frame, [c - h, c, c + h], [0, 0.94, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
  return o > 0 ? <AbsoluteFill style={{ backgroundColor: 'black', opacity: o }} /> : null;
}

/** A pane button's tooltip (its `title`), drawn above it: box in video px (= film px at 1920). */
function Tip({ from, to, text, box }: { from: number; to: number; text: string; box: Box }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [f(from), f(from) + 6, f(to) - 4, f(to)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: o }}>
      <div
        style={{
          position: 'absolute',
          right: 1920 - (box.x + box.w) - 4,
          top: box.y - 40,
          padding: '5px 11px 6px',
          borderRadius: 5,
          background: 'rgba(20, 18, 16, 0.96)',
          border: '1px solid rgba(201, 164, 92, 0.55)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.6)',
          color: '#ece0c4',
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 500,
          fontSize: 22,
          whiteSpace: 'nowrap',
        }}
      >
        {text}
      </div>
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
  const mB = (kind: string, label?: string): number => musicB(b, kind, label);
  const cutB = beat(CUT_B);
  const fs = (s: number): number => f(s);
  const span = (from: number, to: number) => ({ from: fs(from), dur: Math.max(1, fs(to) - fs(from)) });
  const end = ending(b);

  const ease = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) } as const;
  const black = interpolate(frame, [0, f(1.4), f(end.fadeFrom), durationInFrames - f(0.15)], [1, 0, 0, 1], ease);
  const volume = (fr: number): number =>
    interpolate(fr, [0, f(0.4), f(end.fadeFrom), durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const m0A = marker(a, 'music0').t;
  // only into the wolf fight now (owner round 3: no dip at the mercenary or the inn)
  // none now (owner round 4: the wolf too is a plain cut); the takes' `dip` markers are kept
  const dips: number[] = [];
  const tips = a.markers
    .filter((m) => m.kind === 'tip' && m.box)
    .map((m) => ({ from: m.t - m0A, to: (a.markers.find((e) => e.kind === 'tip-end' && e.label === m.label && e.t >= m.t)?.t ?? m.t + 1.2) - m0A, text: m.label, box: m.box! }));

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <Sequence durationInFrames={cutB}>
        <Shot take={A} from={A.at(0)} />
      </Sequence>
      <Sequence from={cutB}>
        <Shot take={Bt} from={Bt.at(beatS(CUT_B))} />
      </Sequence>
      {tips.map((t, i) => (
        <Tip key={i} {...t} />
      ))}
      {dips.map((at, i) => (
        <Dip key={i} at={at} />
      ))}
      {/* The lower thirds, each while what it names is on screen; the menu-bar ones come first, then the pointer. */}
      <LowerThird from={beat(3)} dur={beat(15) - beat(3)} text={[`Live demo of WebCockpit ${pkg.version}`, 'Try it at mumecockpit.com']} />
      <LowerThird {...span(mA('profile') + 0.9, mA('back') - 0.3)} text="Profiles hold your basic settings." />
      <LowerThird {...span(mA('weather-on') + 0.4, mA('font-list') - 0.5)} text="Weather effects follow the game." />
      <LowerThird {...span(mA('font-list'), mA('settings-closed') + 0.3)} text="Customise fonts, colours and more." />
      {/* once Shield, Armour and Shroud are in the Timers pane; then Group as Tod fights */}
      <LowerThird {...span(mA('segment', 'casts') + 4.8, mA('segment', 'casts') + 8.8)} text="The Timers pane tracks spells, buffs and more." />
      <LowerThird {...span(mA('segment', 'wolf') + 1.7, beatS(CUT_B) - 0.5)} text="The Group pane shows your group and follows your fights." />
      <LowerThird
        {...span(mB('segment', 'monologue') + 0.8, mB('profile-closed') + 0.2)}
        text="Open the profile to create aliases, actions and keys from the menu or in the editor."
      />
      <LowerThird {...span(mB('scripts-caption'), mB('scripts-closed'))} text="A Lua scripting engine for anything more complex." />
      <LowerThird {...span(mB('history') + 0.5, mB('history-closed'))} text="Every session is saved and can be replayed." />
      <LowerThird {...span(mB('spotlights') + 0.5, mB('back-start'))} text="Spotlights collect your kills, deaths, level-ups and achievements." />
      <LowerThird {...span(mB('credits') + 0.6, mB('credits-back'))} text="Credits tell your characters' story as a book." />
      {/* The end card, centred low over the night start page (its quote faded on the page). */}
      <LowerThird from={f(end.cardFrom)} dur={durationInFrames - f(end.cardFrom) + f(1)} text={[`WebCockpit ${pkg.version}`, 'mumecockpit.com · Free and open source']} center />

      <AbsoluteFill style={{ backgroundColor: 'black', opacity: black }} />
      <Audio src={staticFile('music/sunset-plains.wav')} volume={volume} />
    </AbsoluteFill>
  );
}
