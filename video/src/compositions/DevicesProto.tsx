// The device prototype of film 2 (video/manuscript-2.md act 6, stage 70):
// one live session on a desktop, a tablet and a phone, about 20 s.
//
// Three takes of the same game timeline (record/scenes/devices.ts), one per
// device, are placed in one "world": a generic monitor, a portrait tablet
// and a phone side by side, each playing its take. Each take is aligned by
// its `sync` marker (the excerpt's 0), so at any film time every screen
// shows the same game moment. A camera moves over the world:
//
//   0.0-3.4   the desktop's screen fills the frame (the wolf fight)
//   3.4-4.8   it pulls back: the screen is a monitor
//   5.1-6.4   over to the tablet (the same moment, the phone's game layout)
//   8.4-9.7   over to the phone: fight card, map lens; our keyboard types
//             `butch corpse` as the wolf dies
//   13.9-15.5 out to all three, the walk east in step on all of them
//
// The devices that are not in focus are dimmed. Touches on the tablet and
// the phone (from the takes' input logs) show as a fingertip's ring.
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from 'remotion';
import { LowerThird } from '../components/Caption';
import { FPS, HEIGHT, type TimelineFile, WIDTH, f, marker } from '../timeline';

export interface DevicesProtoProps extends Record<string, unknown> {
  desktop: TimelineFile | null;
  tablet: TimelineFile | null;
  phone: TimelineFile | null;
}

export const DEVICES_TAKES = { desktop: 'devices-desktop', tablet: 'devices-tablet', phone: 'devices-phone' } as const;
type Dev = keyof typeof DEVICES_TAKES;

/** The film's length, s (the takes run about 20.7 s past their sync). */
export const DEVICES_PROTO_S = 20.6;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------------------------------------------------------------- the world
// World px: the side-by-side shot at zoom 1, bottoms on one line (y = 0).

const MON = { w: 860, h: 860 * (9 / 16), bezel: 16, chin: 24, neckW: 110, neckH: 74, baseW: 320, baseH: 14 };
const TAB = { h: 640, w: 640 * (820 / 1180), bezel: 22 };
const PHO = { h: 600, w: 600 * (390 / 844), bezel: 11 };
const GAP = 84;

const monBodyW = MON.w + 2 * MON.bezel;
const tabBodyW = TAB.w + 2 * TAB.bezel;
const phoBodyW = PHO.w + 2 * PHO.bezel;
const totalW = monBodyW + GAP + tabBodyW + GAP + phoBodyW;
const left0 = -totalW / 2;

/** Each device's screen in world px. */
const SCREEN: Record<Dev, Rect> = {
  desktop: { x: left0 + MON.bezel, y: -(MON.baseH + MON.neckH + MON.chin + MON.h), w: MON.w, h: MON.h },
  tablet: { x: left0 + monBodyW + GAP + TAB.bezel, y: -(TAB.bezel + TAB.h), w: TAB.w, h: TAB.h },
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

const groupTop = -(TAB.h + 2 * TAB.bezel);
const CAMS: Record<'desk' | 'monitor' | 'tablet' | 'phone' | 'all', Cam> = {
  // the desktop's screen exactly fills the frame
  desk: { ...center(SCREEN.desktop), z: WIDTH / MON.w },
  // the whole monitor, stand and all
  monitor: { x: center(SCREEN.desktop).x, y: (SCREEN.desktop.y - MON.bezel) / 2 + 6, z: 1.3 },
  tablet: { ...center(SCREEN.tablet), z: 940 / TAB.h },
  phone: { ...center(SCREEN.phone), z: 950 / PHO.h },
  // all three, a little above the middle (the caption goes below)
  all: { x: 0, y: groupTop / 2 + 44, z: 1740 / totalW },
};

/** The camera's moves: [from s, to s, from, to]; it holds between them. */
const MOVES: [number, number, Cam, Cam][] = [
  [3.4, 4.8, CAMS.desk, CAMS.monitor],
  [5.1, 6.4, CAMS.monitor, CAMS.tablet],
  [8.4, 9.7, CAMS.tablet, CAMS.phone],
  [13.9, 15.5, CAMS.phone, CAMS.all],
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
  // a slow push while all three hold
  if (t > 15.5) cam = { ...cam, z: cam.z * (1 + 0.012 * (t - 15.5)) };
  return cam;
}

/** How much each device is in focus (1: lit, 0: dimmed), s → weight. */
function focusAt(t: number, d: Dev): number {
  const w = (pts: [number, number][]): number => interpolate(t, pts.map((p) => p[0]), pts.map((p) => p[1]), { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (d === 'desktop') return w([[0, 1], [5.2, 1], [6.2, 0], [14.0, 0], [15.2, 1]]);
  if (d === 'tablet') return w([[0, 0], [5.4, 0], [6.3, 1], [8.5, 1], [9.5, 0], [14.0, 0], [15.2, 1]]);
  return w([[0, 0], [8.6, 0], [9.6, 1]]);
}

// ---------------------------------------------------------------- the devices

const BODY = '#17191d';
const EDGE = 'rgba(255, 255, 255, 0.09)';
const SHADOW = '0 30px 70px rgba(0, 0, 0, 0.55), 0 8px 18px rgba(0, 0, 0, 0.45)';

/** A take on a screen: its frame at the film time, aligned by the `sync` marker. */
function Screen({ tl, rect, radius, dim, film, touches }: { tl: TimelineFile; rect: Rect; radius: number; dim: number; film: number; touches: boolean }) {
  const sync = marker(tl, 'sync').t;
  const kx = rect.w / tl.width;
  const ky = rect.h / tl.height;
  const now = film + sync;
  const rings = touches ? tl.input.filter((e) => e.type === 'down' && e.t <= now && now - e.t < 0.45) : [];
  return (
    <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: radius, overflow: 'hidden', background: '#000' }}>
      <OffthreadVideo src={staticFile(`recordings/${tl.scene}.mp4`)} trimBefore={f(sync)} muted style={{ width: '100%', height: '100%', display: 'block' }} />
      {rings.map((e) => {
        const age = (now - e.t) / 0.45;
        const r = (16 + 14 * age) * kx * (tl.dpr || 1);
        return (
          <div
            key={`${e.t}`}
            style={{
              position: 'absolute',
              left: e.x! * kx - r,
              top: e.y! * ky - r,
              width: 2 * r,
              height: 2 * r,
              borderRadius: '50%',
              background: `rgba(255, 255, 255, ${0.28 * (1 - age)})`,
              boxShadow: `0 0 0 ${Math.max(1, 2 * kx)}px rgba(255, 255, 255, ${0.55 * (1 - age)})`,
            }}
          />
        );
      })}
      {/* a faint glass sheen */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(118deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0) 38%)' }} />
      <div style={{ position: 'absolute', inset: 0, background: '#07080a', opacity: dim }} />
    </div>
  );
}

const abs = (r: Rect, extra: CSSProperties = {}): CSSProperties => ({ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, ...extra });

function Monitor({ s, k, children }: { s: Rect; k: number; children: ReactNode }) {
  const b = MON.bezel * k;
  const body = { x: s.x - b, y: s.y - b, w: s.w + 2 * b, h: s.h + b + MON.chin * k };
  const neck = { x: s.x + s.w / 2 - (MON.neckW * k) / 2, y: body.y + body.h - 2 * k, w: MON.neckW * k, h: MON.neckH * k + 2 * k };
  const base = { x: s.x + s.w / 2 - (MON.baseW * k) / 2, y: neck.y + neck.h - 1 * k, w: MON.baseW * k, h: MON.baseH * k };
  return (
    <>
      <div style={abs({ x: base.x - 30 * k, y: base.y + base.h - 6 * k, w: base.w + 60 * k, h: 16 * k }, { borderRadius: '50%', background: 'rgba(0,0,0,0.6)', filter: `blur(${10 * k}px)` })} />
      <div style={abs(neck, { background: 'linear-gradient(90deg, #1b1d21, #2a2d33 45%, #1d1f23)', clipPath: 'polygon(14% 0, 86% 0, 100% 100%, 0 100%)' })} />
      <div style={abs(base, { borderRadius: `${6 * k}px ${6 * k}px ${3 * k}px ${3 * k}px`, background: 'linear-gradient(180deg, #30333a, #1a1c20)', boxShadow: `inset 0 ${k}px 0 ${EDGE}` })} />
      <div style={abs(body, { borderRadius: 10 * k, background: BODY, boxShadow: `${SHADOW}, inset 0 0 0 ${Math.max(1, k)}px ${EDGE}` })} />
      {/* a small light in the chin */}
      <div style={abs({ x: s.x + s.w / 2 - 2.5 * k, y: s.y + s.h + (MON.chin * k) / 2 - 2.5 * k, w: 5 * k, h: 5 * k }, { borderRadius: '50%', background: '#2c3036' })} />
      {children}
    </>
  );
}

function Slab({ s, k, bezel, radius, children, buttons }: { s: Rect; k: number; bezel: number; radius: number; children: ReactNode; buttons?: boolean }) {
  const b = bezel * k;
  const body = { x: s.x - b, y: s.y - b, w: s.w + 2 * b, h: s.h + 2 * b };
  const cam = Math.max(3, b * 0.36);
  return (
    <>
      <div style={abs({ x: body.x + 20 * k, y: body.y + body.h - 4 * k, w: body.w - 40 * k, h: 16 * k }, { borderRadius: '50%', background: 'rgba(0,0,0,0.6)', filter: `blur(${10 * k}px)` })} />
      {buttons ? (
        <>
          <div style={abs({ x: body.x + body.w - 1 * k, y: body.y + body.h * 0.22, w: 3 * k, h: body.h * 0.1 }, { borderRadius: k * 2, background: '#25282d' })} />
          <div style={abs({ x: body.x + body.w - 1 * k, y: body.y + body.h * 0.35, w: 3 * k, h: body.h * 0.06 }, { borderRadius: k * 2, background: '#25282d' })} />
        </>
      ) : null}
      <div style={abs(body, { borderRadius: radius * k, background: BODY, boxShadow: `${SHADOW}, inset 0 0 0 ${Math.max(1, k)}px ${EDGE}` })} />
      <div style={abs({ x: s.x + s.w / 2 - cam / 2, y: s.y - b / 2 - cam / 2, w: cam, h: cam }, { borderRadius: '50%', background: '#0a0b0d', boxShadow: `0 0 0 ${Math.max(0.5, 0.8 * k)}px #2a2d33` })} />
      {children}
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
  const dim = (d: Dev): number => 0.7 * (1 - focusAt(t, d));
  const end = DEVICES_PROTO_S;
  const fade = interpolate(t, [end - 0.7, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const volume = (fr: number): number => 0.55 * interpolate(fr / FPS, [0, 1.2, end - 1.6, end], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 42%, #1c1f26 0%, #111318 55%, #0a0b0e 100%)' }}>
      <Monitor s={toFrame(SCREEN.desktop)} k={k}>
        <Screen tl={desktop} rect={toFrame(SCREEN.desktop)} radius={2 * k} dim={dim('desktop')} film={t} touches={false} />
      </Monitor>
      <Slab s={toFrame(SCREEN.tablet)} k={k} bezel={TAB.bezel} radius={30}>
        <Screen tl={tablet} rect={toFrame(SCREEN.tablet)} radius={8 * k} dim={dim('tablet')} film={t} touches />
      </Slab>
      <Slab s={toFrame(SCREEN.phone)} k={k} bezel={PHO.bezel} radius={40} buttons>
        <Screen tl={phone} rect={toFrame(SCREEN.phone)} radius={30 * k} dim={dim('phone')} film={t} touches />
      </Slab>
      <LowerThird from={f(16.0)} dur={f(4.0)} text="The same session on every screen." center />
      <AbsoluteFill style={{ background: '#000', opacity: fade }} />
      <Audio src={staticFile('music/sunset-plains.wav')} volume={volume} />
    </AbsoluteFill>
  );
}
