// The device prototype of film 2 (video/manuscript-2.md act 6, stage 70;
// owner round 1): one live session that goes on from a desktop to a
// tablet to a phone, one device live at a time, about 55 s.
//
// Three takes of the same game timeline (record/scenes/devices.ts), one per
// device, are placed in one "world": a generic monitor, a tablet in
// landscape and a phone side by side. Each take is aligned by its `sync`
// marker, which is the film's 0 (the schedule: src/devices.ts). Only the
// live device plays: a device that is left freezes on the moment it was
// left and its screen goes dark (asleep); the next one wakes on that same
// moment and plays on. A camera moves over the world:
//
//   0-3.4     the desktop's screen fills the frame (the wolf fight)
//   3.4-5.0   it pulls back to all three; the desktop is left at 5.6 and the
//             tablet wakes, in the wide view (the tablet is never zoomed)
//   14.2      the tablet is left and the phone wakes; the camera goes in
//             and the sleeping desktop and tablet fade into the dark, until
//             only the phone is seen
//   18-27     the walk back into Bree on the compass; tells arrive
//   28.5-35   Messages: two chats; 37-43 the pane strip, Timers and Group
//   45        the phone turns to landscape (the frame turns here; its take
//             changed viewport); 48.3 the map lens moved, 51 made larger
//
// Touches on the tablet and the phone (from the takes' input logs) show as
// a fingertip's ring, which follows a drag.
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Audio, Easing, Freeze, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { LowerThird } from '../components/Caption';
import { DEVICES } from '../devices';
import { FPS, HEIGHT, type TimelineFile, WIDTH, f, marker } from '../timeline';

export interface DevicesProtoProps extends Record<string, unknown> {
  desktop: TimelineFile | null;
  tablet: TimelineFile | null;
  phone: TimelineFile | null;
}

export const DEVICES_TAKES = { desktop: 'devices-desktop', tablet: 'devices-tablet', phone: 'devices-phone' } as const;
type Dev = keyof typeof DEVICES_TAKES;

/** The film's length, s. */
export const DEVICES_PROTO_S = DEVICES.end;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- the world
// World px: the wide shot at zoom 1, bottoms on one line (y = 0).

const MON = { w: 860, h: 860 * (9 / 16), bezel: 16, chin: 24, neckW: 110, neckH: 74, baseW: 320, baseH: 14 };
const TAB = { w: 560, h: 560 * (820 / 1180), bezel: 20 };
const PHO = { h: 560, w: 560 * (390 / 844), bezel: 11 };
const GAP = 90;

const monBodyW = MON.w + 2 * MON.bezel;
const tabBodyW = TAB.w + 2 * TAB.bezel;
const phoBodyW = PHO.w + 2 * PHO.bezel;
const totalW = monBodyW + GAP + tabBodyW + GAP + phoBodyW;
const left0 = -totalW / 2;
const monTall = MON.bezel + MON.h + MON.chin + MON.neckH + MON.baseH;

/** Each device's screen in world px (the phone upright). */
const SCREEN: Record<Dev, Rect> = {
  desktop: { x: left0 + MON.bezel, y: -(MON.baseH + MON.neckH + MON.chin + MON.h), w: MON.w, h: MON.h },
  // the tablet's screen level with the monitor's
  tablet: { x: left0 + monBodyW + GAP + TAB.bezel, y: -(MON.baseH + MON.neckH + MON.chin + MON.h / 2) - TAB.h / 2, w: TAB.w, h: TAB.h },
  phone: { x: left0 + monBodyW + GAP + tabBodyW + GAP + PHO.bezel, y: -(PHO.bezel + PHO.h), w: PHO.w, h: PHO.h },
};
const center = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ---------------------------------------------------------------- the camera

interface Cam {
  /** World point at the frame's centre. */
  x: number;
  y: number;
  z: number;
}

const CAMS: Record<'desk' | 'all' | 'phone' | 'phoneLand', Cam> = {
  // the desktop's screen exactly fills the frame
  desk: { ...center(SCREEN.desktop), z: WIDTH / MON.w },
  // all three, a little above the middle (the caption goes below)
  all: { x: 0, y: -monTall / 2 + 40, z: 1760 / totalW },
  // only the phone, upright
  phone: { ...center(SCREEN.phone), z: 960 / PHO.h },
  // only the phone, on its side
  phoneLand: { ...center(SCREEN.phone), z: 1640 / PHO.h },
};

/** The camera's moves: [from s, to s, from, to]; it holds between them. */
const MOVES: [number, number, Cam, Cam][] = [
  [3.4, 5.0, CAMS.desk, CAMS.all],
  [DEVICES.toPhone + 0.5, DEVICES.toPhone + 2.3, CAMS.all, CAMS.phone],
  // in once the phone has turned most of the way: its long side across the frame never overflows the height
  [DEVICES.rotate + 0.55 * DEVICES.rotateS, DEVICES.rotate + DEVICES.rotateS + 0.5, CAMS.phone, CAMS.phoneLand],
];
const ease = Easing.bezier(0.45, 0, 0.2, 1);

function camAt(t: number): Cam {
  let cam = MOVES[0]![2];
  for (const [a, b, from, to] of MOVES) {
    if (t < a) break;
    if (t >= b) {
      cam = to;
      continue;
    }
    const k = ease((t - a) / (b - a));
    // zoom in log space, the point linearly: an even feel of speed
    cam = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: Math.exp(Math.log(from.z) + (Math.log(to.z) - Math.log(from.z)) * k) };
  }
  return cam;
}

// ---------------------------------------------------------------- live and asleep

/** When each device is the live one, s. */
const LIVE: Record<Dev, [number, number]> = {
  desktop: [-Infinity, DEVICES.toTablet],
  tablet: [DEVICES.toTablet, DEVICES.toPhone],
  phone: [DEVICES.toPhone, Infinity],
};
/** A device left holds its last picture this long, then its screen goes dark over SLEEP_S. */
const HOLD_S = 0.35;
const SLEEP_S = 0.8;
/** A device picked up wakes over this long. */
const WAKE_S = 0.3;
/** How dark an asleep screen is (a faint ghost of where it was left stays). */
const ASLEEP = 0.93;

/** The screen's darkness (0 lit, 1 black) and the moment it shows (null: live). */
function screenState(t: number, d: Dev): { dark: number; frozenAt: number | null; live: number } {
  const [from, to] = LIVE[d];
  if (t < from) return { dark: 1, frozenAt: from, live: 0 };
  if (t < to) return { dark: from === -Infinity ? 0 : interpolate(t, [from, from + WAKE_S], [1, 0], { extrapolateRight: 'clamp' }), frozenAt: null, live: 1 };
  const dark = interpolate(t, [to + HOLD_S, to + HOLD_S + SLEEP_S], [0, ASLEEP], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
  return { dark, frozenAt: to, live: interpolate(t, [to, to + HOLD_S + SLEEP_S], [1, 0], { extrapolateRight: 'clamp' }) };
}

// ---------------------------------------------------------------- the devices

const BODY = '#17191d';
const EDGE = 'rgba(255, 255, 255, 0.09)';
const SHADOW = '0 30px 70px rgba(0, 0, 0, 0.55), 0 8px 18px rgba(0, 0, 0, 0.45)';
/** The live device's faint glow in the wide view. */
const GLOW = (a: number, k: number): string => `0 0 ${46 * k}px ${4 * k}px rgba(201, 164, 92, ${0.22 * a})`;

/** Video px of a take's picture (a phone's take is a square canvas with the page at its top left). */
interface Crop {
  w: number;
  h: number;
}

/** One finger's touches from a take's input log: each press with its moves, until it lifts. */
interface Touch {
  down: number;
  up: number;
  path: { t: number; x: number; y: number }[];
}
function touchesOf(tl: TimelineFile): Touch[] {
  const out: Touch[] = [];
  let cur: Touch | null = null;
  for (const e of tl.input) {
    if (e.x === undefined || e.y === undefined) continue;
    if (e.type === 'down') {
      cur = { down: e.t, up: e.t + 0.1, path: [{ t: e.t, x: e.x, y: e.y }] };
      out.push(cur);
    } else if (cur && e.type === 'move') cur.path.push({ t: e.t, x: e.x, y: e.y });
    else if (cur && e.type === 'up') {
      cur.up = e.t;
      cur.path.push({ t: e.t, x: e.x, y: e.y });
      cur = null;
    }
  }
  return out;
}

/** A take on a screen at film time `film` (or frozen at `frozenAt`), aligned by its `sync` marker. */
function Screen(o: { tl: TimelineFile; rect: Rect; crop: Crop; radius: number; dark: number; film: number; frozenAt: number | null; touches: Touch[] | null }) {
  const { tl, rect, crop } = o;
  const sync = marker(tl, 'sync').t;
  const k = rect.w / crop.w;
  const now = (o.frozenAt ?? o.film) + sync;
  const rings: ReactNode[] = [];
  for (const [i, tc] of (o.touches ?? []).entries()) {
    if (now < tc.down || now > tc.up + 0.45) continue;
    let p = tc.path[0]!;
    for (const q of tc.path) if (q.t <= now) p = q;
    const age = now > tc.up ? (now - tc.up) / 0.45 : 0;
    const r = (17 + 12 * age) * tl.dpr * k;
    rings.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: p.x * k - r,
          top: p.y * k - r,
          width: 2 * r,
          height: 2 * r,
          borderRadius: '50%',
          background: `rgba(255, 255, 255, ${0.26 * (1 - age)})`,
          boxShadow: `0 0 0 ${Math.max(1, 1.6 * tl.dpr * k)}px rgba(255, 255, 255, ${0.6 * (1 - age)})`,
        }}
      />,
    );
  }
  const video = (
    <OffthreadVideo
      src={staticFile(`recordings/${tl.scene}.mp4`)}
      trimBefore={f(sync)}
      muted
      style={{ position: 'absolute', left: 0, top: 0, width: tl.width * k, height: tl.height * k, maxWidth: 'none', display: 'block' }}
    />
  );
  return (
    <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: o.radius, overflow: 'hidden', background: '#000' }}>
      {o.dark < 1 ? (o.frozenAt !== null ? <Freeze frame={Math.max(0, f(o.frozenAt))}>{video}</Freeze> : video) : null}
      {o.dark < 1 ? rings : null}
      {/* a faint glass sheen */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 38%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#050608', opacity: o.dark }} />
    </div>
  );
}

const abs = (r: Rect, extra: CSSProperties = {}): CSSProperties => ({ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, ...extra });

function Monitor({ s, k, glow, children }: { s: Rect; k: number; glow: number; children: ReactNode }) {
  const b = MON.bezel * k;
  const body = { x: s.x - b, y: s.y - b, w: s.w + 2 * b, h: s.h + b + MON.chin * k };
  const neck = { x: s.x + s.w / 2 - (MON.neckW * k) / 2, y: body.y + body.h - 2 * k, w: MON.neckW * k, h: MON.neckH * k + 2 * k };
  const base = { x: s.x + s.w / 2 - (MON.baseW * k) / 2, y: neck.y + neck.h - 1 * k, w: MON.baseW * k, h: MON.baseH * k };
  return (
    <>
      <div style={abs({ x: base.x - 30 * k, y: base.y + base.h - 6 * k, w: base.w + 60 * k, h: 16 * k }, { borderRadius: '50%', background: 'rgba(0,0,0,0.6)', filter: `blur(${10 * k}px)` })} />
      <div style={abs(neck, { background: 'linear-gradient(90deg, #1b1d21, #2a2d33 45%, #1d1f23)', clipPath: 'polygon(14% 0, 86% 0, 100% 100%, 0 100%)' })} />
      <div style={abs(base, { borderRadius: `${6 * k}px ${6 * k}px ${3 * k}px ${3 * k}px`, background: 'linear-gradient(180deg, #30333a, #1a1c20)', boxShadow: `inset 0 ${k}px 0 ${EDGE}` })} />
      <div style={abs(body, { borderRadius: 10 * k, background: BODY, boxShadow: `${GLOW(glow, k)}, ${SHADOW}, inset 0 0 0 ${Math.max(1, k)}px ${EDGE}` })} />
      {/* a small light in the chin: lit while the screen is */}
      <div style={abs({ x: s.x + s.w / 2 - 2.5 * k, y: s.y + s.h + (MON.chin * k) / 2 - 2.5 * k, w: 5 * k, h: 5 * k }, { borderRadius: '50%', background: glow > 0.5 ? '#3b5c46' : '#2c3036' })} />
      {children}
    </>
  );
}

/** A tablet or a phone: a slab with an even bezel; the camera dot on the `cam` side's bezel. */
function Slab(o: { s: Rect; k: number; bezel: number; radius: number; glow: number; cam: 'top' | 'left'; buttons?: 'right' | 'top'; children: ReactNode }) {
  const { s, k } = o;
  const b = o.bezel * k;
  const body = { x: s.x - b, y: s.y - b, w: s.w + 2 * b, h: s.h + 2 * b };
  const cam = Math.max(3, b * 0.36);
  const dot = o.cam === 'top' ? { x: s.x + s.w / 2 - cam / 2, y: s.y - b / 2 - cam / 2 } : { x: s.x - b / 2 - cam / 2, y: s.y + s.h / 2 - cam / 2 };
  const btn = (a: number, len: number): Rect =>
    o.buttons === 'right' ? { x: body.x + body.w - k, y: body.y + body.h * a, w: 3 * k, h: body.h * len } : { x: body.x + body.w * a, y: body.y - 2 * k, w: body.w * len, h: 3 * k };
  return (
    <>
      <div style={abs({ x: body.x + 20 * k, y: body.y + body.h - 4 * k, w: body.w - 40 * k, h: 16 * k }, { borderRadius: '50%', background: 'rgba(0,0,0,0.6)', filter: `blur(${10 * k}px)` })} />
      {o.buttons ? (
        <>
          <div style={abs(btn(0.22, 0.1), { borderRadius: k * 2, background: '#25282d' })} />
          <div style={abs(btn(0.35, 0.06), { borderRadius: k * 2, background: '#25282d' })} />
        </>
      ) : null}
      <div style={abs(body, { borderRadius: o.radius * k, background: BODY, boxShadow: `${GLOW(o.glow, k)}, ${SHADOW}, inset 0 0 0 ${Math.max(1, k)}px ${EDGE}` })} />
      <div style={abs({ ...dot, w: cam, h: cam }, { borderRadius: '50%', background: '#0a0b0d', boxShadow: `0 0 0 ${Math.max(0.5, 0.8 * k)}px #2a2d33` })} />
      {o.children}
    </>
  );
}

export function DevicesProto({ desktop, tablet, phone }: DevicesProtoProps) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  if (!desktop || !tablet || !phone) return null;
  const cam = camAt(t);
  const toFrame = (r: Rect): Rect => ({ x: (r.x - cam.x) * cam.z + WIDTH / 2, y: (r.y - cam.y) * cam.z + HEIGHT / 2, w: r.w * cam.z, h: r.h * cam.z });
  const k = cam.z;
  const st = { desktop: screenState(t, 'desktop'), tablet: screenState(t, 'tablet'), phone: screenState(t, 'phone') };
  // the glow marks the live device only while all three are seen
  const wide = interpolate(k, [CAMS.all.z * 1.02, CAMS.all.z * 1.15], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const glow = (d: Dev): number => st[d].live * wide;
  // Going in to the phone, the sleeping desktop and tablet fade into the dark: only the phone is seen.
  const others = interpolate(t, [DEVICES.toPhone + 0.6, DEVICES.toPhone + 2.0], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // The phone: upright, turning (its last upright picture turns with it), then on its side, live.
  const rotA = DEVICES.rotate;
  const rotB = DEVICES.rotate + DEVICES.rotateS;
  const turn = ease(interpolate(t, [rotA, rotB], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const landIn = interpolate(t, [rotB, rotB + 0.3], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const ps = toFrame(SCREEN.phone);
  const pc = { x: ps.x + ps.w / 2, y: ps.y + ps.h / 2 };
  const land: Rect = { x: pc.x - ps.h / 2, y: pc.y - ps.w / 2, w: ps.h, h: ps.w };
  const portraitCrop = { w: Math.round(390 * phone.dpr), h: Math.round(844 * phone.dpr) };
  const landCrop = { w: portraitCrop.h, h: portraitCrop.w };
  const phoneTouches = touchesOf(phone);

  const end = DEVICES_PROTO_S;
  const fade = interpolate(t, [end - 0.8, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const volume = (fr: number): number => 0.5 * interpolate(fr / FPS, [0, 1.2, end - 2, end], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 42%, #1c1f26 0%, #111318 55%, #0a0b0e 100%)' }}>
      {others > 0 ? (
        <AbsoluteFill style={{ opacity: others }}>
          <Monitor s={toFrame(SCREEN.desktop)} k={k} glow={glow('desktop')}>
            <Screen tl={desktop} rect={toFrame(SCREEN.desktop)} crop={{ w: desktop.width, h: desktop.height }} radius={2 * k} {...st.desktop} film={t} touches={null} />
          </Monitor>
          <Slab s={toFrame(SCREEN.tablet)} k={k} bezel={TAB.bezel} radius={26} glow={glow('tablet')} cam="left" buttons="top">
            <Screen tl={tablet} rect={toFrame(SCREEN.tablet)} crop={{ w: tablet.width, h: tablet.height }} radius={8 * k} {...st.tablet} film={t} touches={touchesOf(tablet)} />
          </Slab>
        </AbsoluteFill>
      ) : null}
      {t < rotB + 0.3 ? (
        <div style={{ position: 'absolute', inset: 0, transform: `rotate(${-90 * turn}deg)`, transformOrigin: `${pc.x}px ${pc.y}px` }}>
          <Slab s={ps} k={k} bezel={PHO.bezel} radius={40} glow={glow('phone')} cam="top" buttons="right">
            <Screen tl={phone} rect={ps} crop={portraitCrop} radius={30 * k} {...st.phone} frozenAt={t >= rotA ? rotA : st.phone.frozenAt} film={t} touches={phoneTouches} />
          </Slab>
        </div>
      ) : null}
      {t >= rotB ? (
        <div style={{ position: 'absolute', inset: 0, opacity: landIn }}>
          <Slab s={land} k={k} bezel={PHO.bezel} radius={40} glow={0} cam="left" buttons="top">
            <Screen tl={phone} rect={land} crop={landCrop} radius={30 * k} dark={0} frozenAt={null} film={t} touches={phoneTouches} />
          </Slab>
        </div>
      ) : null}
      <LowerThird from={f(DEVICES.toTablet + 0.6)} dur={f(DEVICES.toPhone - DEVICES.toTablet - 0.4)} text="The same session, picked up on a tablet, then on a phone." center />
      <AbsoluteFill style={{ background: '#000', opacity: fade }} />
      <Audio src={staticFile('music/sunset-plains.wav')} volume={volume} />
    </AbsoluteFill>
  );
}
