// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// The player, group mates and the prespam path (research §6–§7), rebuilt
// per frame from the Scene (a handful of vertices). Ported from MMapper
// 26.06.0 display/Characters.cpp and display/MapCanvasData.cpp (MapScreen
// visibility and proxy location; GPL-2.0-or-later). Pure.
//
// Script marks (ADR 0057; WebCockpit's own) are drawn first: a fill and an
// outline a little larger than the room, a screen dot when rooms are
// small, an edge arrow when off view, the layer arrow on another layer.

import type { MapData } from '../model';
import type { Scene } from '../scene';
import { type View, pxPerRoom } from '../view';
import { type FontMetrics, FontVerts, layoutText } from './font';
import { ColorTris, lineQuad, lineQuadSafe, perpendicularNormal, type Vec3, vec } from './geometry';
import { type RGBA, rgb, textColor, withAlpha } from './palette';
import { L256 } from './textures';

const PATH_LINE_WIDTH = 0.1;
/** Round point diameter at the end of the path, physical px. */
const PATH_POINT_SIZE = 8;
/** GL line width of the far-style outlines, physical px. */
const CHAR_LINE_WIDTH = 2;
const FILL_ALPHA = 0.1;
const LINE_ALPHA = 0.9;
/** MapScreen::DEFAULT_MARGIN_PIXELS. */
const MARGIN = 24;
/** Zoom at or below which characters use the far (outline) style. */
export const CHAR_FAR_ZOOM = 0.4;
/** Most off-view arrows per mark (nearest rooms first). */
export const MARK_ARROWS = 8;
/** Below this many CSS px per room a mark also gets a screen dot. */
export const MARK_DOT_BELOW = 12;
/** The dot's size, CSS px. */
const MARK_DOT = 16;
/** How far a mark's box reaches past its room, in rooms. */
const MARK_PAD = 0.12;
/** 45/π degrees: rotation step of extra characters in one room. */
const MAGIC_ANGLE = 45 / Math.PI;

/** Viewport projection in CSS px (y down), MMapper's 2D camera. */
export class Screen {
  constructor(
    readonly view: View,
    readonly w: number,
    readonly h: number,
  ) {}

  project(p: Vec3): [number, number] | null {
    if (60 - 7 * p[2] <= 5) return null; // behind MMapper's near plane
    const s = pxPerRoom(this.view.zoom, p[2]);
    return [this.w / 2 + (p[0] - this.view.x) * s, this.h / 2 - (p[1] - this.view.y) * s];
  }

  /** 0 inside the margin, 1 on it, 2 outside, 3 off screen (MapScreen::testVisibility). */
  visibility(p: Vec3, margin: number): 0 | 1 | 2 | 3 {
    const q = this.project(p);
    if (!q) return 3;
    const d = Math.min(this.w / 2 - Math.abs(q[0] - this.w / 2), this.h / 2 - Math.abs(q[1] - this.h / 2));
    const lo = Math.floor(margin);
    if (d < lo) return 2;
    if (d > lo + 1) return 0;
    return 1;
  }

  roomVisible(x: number, y: number, z: number, margin: number): boolean {
    for (let i = 0; i < 4; i++) {
      if (this.visibility([x + (i & 1), y + ((i >> 1) & 1), z], margin) >= 2) return false;
    }
    return true;
  }

  centre(): Vec3 {
    return [this.view.x, this.view.y, this.view.layer];
  }

  /** The point on the line centre → p that sits on the margin (MapScreen::getProxyLocation). */
  proxy(p: Vec3, margin: number): Vec3 {
    const c = this.centre();
    const v = this.visibility(p, margin);
    if (v <= 1) return p;
    let f = 0.5;
    let step = 0.25;
    let best = c;
    let bestF = 0;
    for (let i = 0; i < 23; i++, step *= 0.5) {
      const t: Vec3 = [c[0] + (p[0] - c[0]) * f, c[1] + (p[1] - c[1]) * f, c[2] + (p[2] - c[2]) * f];
      const r = this.visibility(t, margin);
      if (r === 1) return t;
      if (r === 0) {
        if (f > bestF) {
          best = t;
          bestF = f;
        }
        f += step;
      } else f -= step;
    }
    return best;
  }
}

/** Per-frame scene geometry, in draw order. */
export interface SceneGeometry {
  /** char-room-sel quads: 10 floats per vertex (x, y, z, r, g, b, a, u, v, layer). */
  roomSel: number[];
  /** Far-style fills (α 0.1), then outlines (α 0.9, 2 px). */
  tris: ColorTris;
  /** Off-screen arrows (char-arrows atlas), world anchors. */
  arrows: FontVerts;
  /** Path end points (round), world anchors. */
  points: FontVerts;
  pathQuads: ColorTris;
  /** Name labels, screen anchors in physical px (y down). */
  names: FontVerts;
}

export interface SceneContext {
  map: MapData;
  view: View;
  /** Canvas size in CSS px, device pixel ratio. */
  w: number;
  h: number;
  dpr: number;
  font: FontMetrics | null;
}

type V2 = readonly [number, number];

class CharBatch {
  readonly g: SceneGeometry = {
    roomSel: [],
    tris: new ColorTris(),
    arrows: new FontVerts(),
    points: new FontVerts(),
    pathQuads: new ColorTris(),
    names: new FontVerts(),
  };
  private readonly lines = new ColorTris();
  private readonly counts = new Map<string, number>();
  private readonly screen: Screen;

  constructor(private readonly ctx: SceneContext) {
    this.screen = new Screen(ctx.view, ctx.w, ctx.h);
  }

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }
  reserve(x: number, y: number, z: number): void {
    const k = this.key(x, y, z);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }
  clear(x: number, y: number, z: number): void {
    this.counts.set(this.key(x, y, z), 0);
  }

  /** World units per physical pixel on layer z. */
  private unitsPerPx(z: number): number {
    return 1 / (pxPerRoom(this.ctx.view.zoom, z) * this.ctx.dpr);
  }

  /** drawQuadCommon: FILL (α 0.1 triangles) and/or OUTLINE (α 0.9 2-px lines). */
  private quadCommon(pts: readonly Vec3[], color: RGBA, fill: boolean): void {
    const [a, b, c, d] = pts as [Vec3, Vec3, Vec3, Vec3];
    if (fill) {
      const fc = withAlpha(color, FILL_ALPHA);
      this.g.tris.tri(a, b, c, fc);
      this.g.tris.tri(a, c, d, fc);
    }
    const lc = withAlpha(color, LINE_ALPHA);
    for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]] as const) {
      const seg = vec.sub(q, p);
      if (vec.len(seg) < 1e-6) continue;
      const n = perpendicularNormal(vec.normalize(seg));
      lineQuad(this.lines, p, q, CHAR_LINE_WIDTH * this.unitsPerPx(p[2]), lc, n);
    }
  }

  private arrow(centre: Vec3, degrees: number, color: RGBA, fill: boolean): void {
    // d / a-c \ b, rotated about the centre.
    const r = (degrees * Math.PI) / 180;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    const t = (p: V2): Vec3 => [centre[0] + p[0] * cs - p[1] * sn, centre[1] + p[0] * sn + p[1] * cs, centre[2]];
    this.quadCommon([t([-0.5, 0]), t([0.75, -0.5]), t([0.25, 0]), t([0.75, 0.5])], color, fill);
  }

  private screenArrow(pos: Vec3, degrees: number, color: RGBA, fill: boolean): void {
    const r = (degrees * Math.PI) / 180;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    const s = MARGIN * this.ctx.dpr;
    const corners = ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).map(([u, v]) => {
      const x = u * 2 - 1;
      const y = v * 2 - 1;
      const f = fill ? 0.5 : 0;
      return [u * 0.5 + f, v * 0.5 + f, s * (x * cs - y * sn), s * (x * sn + y * cs)] as const;
    });
    this.g.arrows.quad(pos[0], pos[1], pos[2], color, corners);
  }

  /** A script mark on one room (ADR 0057); `arrow`: point to it when off view. */
  drawMark(x: number, y: number, z: number, color: RGBA, alpha: number, arrow: boolean): void {
    if (alpha <= 0.01) return;
    const centre: Vec3 = [x + 0.5, y + 0.5, z];
    const p = MARK_PAD;
    const pts: Vec3[] = [
      [x - p, y - p, z],
      [x + 1 + p, y - p, z],
      [x + 1 + p, y + 1 + p, z],
      [x - p, y + 1 + p, z],
    ];
    const [a, b, c, d] = pts as [Vec3, Vec3, Vec3, Vec3];
    const fc = withAlpha(color, 0.35 * alpha);
    this.g.tris.tri(a, b, c, fc);
    this.g.tris.tri(a, c, d, fc);
    const lc = withAlpha(color, alpha);
    for (const [u, v] of [[a, b], [b, c], [c, d], [d, a]] as const) {
      const n = perpendicularNormal(vec.normalize(vec.sub(v, u)));
      lineQuad(this.lines, u, v, CHAR_LINE_WIDTH * this.unitsPerPx(z), lc, n);
    }
    if (pxPerRoom(this.ctx.view.zoom, z) < MARK_DOT_BELOW) {
      const h = MARK_DOT / 2;
      this.g.points.quad(centre[0], centre[1], centre[2], lc, [
        [-4, 0, -h, -h],
        [-3, 0, h, -h],
        [-3, 1, h, h],
        [-4, 1, -h, h],
      ]);
    }
    if (!arrow) return;
    if (!this.screen.roomVisible(x, y, z, MARGIN / 2)) {
      const cc = this.screen.centre();
      const deg = (Math.atan2(centre[1] - cc[1], centre[0] - cc[0]) * 180) / Math.PI;
      this.screenArrow(this.screen.proxy(centre, MARGIN), deg, lc, true);
    }
    const layerDiff = z - this.ctx.view.layer;
    if (layerDiff !== 0) this.arrow([centre[0], centre[1], this.ctx.view.layer], layerDiff > 0 ? 90 : 270, lc, true);
  }

  /** A mark's label above its first room. */
  drawMarkLabel(x: number, y: number, z: number, text: string, color: RGBA): void {
    this.drawName(x, y, z, text, color);
  }

  drawCharacter(x: number, y: number, z: number, color: RGBA, fill: boolean, far: boolean): void {
    const centre: Vec3 = [x + 0.5, y + 0.5, z];
    const layerDiff = z - this.ctx.view.layer;
    if (!this.screen.roomVisible(x, y, z, MARGIN / 2)) {
      const c = this.screen.centre();
      const deg = (Math.atan2(centre[1] - c[1], centre[0] - c[0]) * 180) / Math.PI;
      this.screenArrow(this.screen.proxy(centre, MARGIN), deg, color, fill);
    }
    if (layerDiff !== 0) this.arrow([centre[0], centre[1], this.ctx.view.layer], layerDiff > 0 ? 90 : 270, color, fill);
    this.drawBox(x, y, z, color, fill, far);
  }

  private drawBox(x: number, y: number, z: number, color: RGBA, fill: boolean, far: boolean): void {
    const k = this.key(x, y, z);
    const already = this.counts.get(k) ?? 0;
    this.counts.set(k, already + 1);
    let deg = 0;
    if (already !== 0) {
      deg = already * MAGIC_ANGLE;
      fill = false;
    }
    const r = (deg * Math.PI) / 180;
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    const t = (px: number, py: number): Vec3 => {
      const dx = px - 0.5;
      const dy = py - 0.5;
      return [x + 0.5 + dx * cs - dy * sn, y + 0.5 + dx * sn + dy * cs, z];
    };
    const corners: V2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (far) {
      this.quadCommon(corners.map(([u, v]) => t(u, v)), color, fill);
      return;
    }
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const [u, v] = corners[i]!;
      const p = t(u, v);
      this.g.roomSel.push(p[0], p[1], p[2], color[0], color[1], color[2], color[3], u, v, L256.charRoomSel);
    }
  }

  drawPath(from: Vec3, path: readonly Vec3[], color: RGBA): void {
    if (path.length === 0) return;
    const verts = [from, ...path].map((p): Vec3 => [p[0] + 0.5, p[1] + 0.5, p[2]]);
    for (let i = 0; i + 1 < verts.length; i++) lineQuadSafe(this.g.pathQuads, verts[i]!, verts[i + 1]!, PATH_LINE_WIDTH, color);
    const e = verts[verts.length - 1]!;
    const h = PATH_POINT_SIZE / 2;
    this.g.points.quad(e[0], e[1], e[2], color, [
      [-4, 0, -h, -h],
      [-3, 0, h, -h],
      [-3, 1, h, h],
      [-4, 1, -h, h],
    ]);
  }

  drawName(x: number, y: number, z: number, text: string, color: RGBA): void {
    const fm = this.ctx.font;
    if (!fm || text === '') return;
    const centre: Vec3 = [x + 0.5, y + 0.5, z];
    let at: [number, number] | null;
    let vOff: number;
    if (this.screen.roomVisible(x, y, z, MARGIN / 2)) {
      at = this.screen.project(centre);
      const top = this.screen.project([centre[0], centre[1] + 0.5, z]);
      vOff = at && top ? Math.hypot(at[0] - top[0], at[1] - top[1]) + 2 : 10;
    } else {
      at = this.screen.project(this.screen.proxy(centre, MARGIN));
      vOff = 15;
    }
    if (!at) return;
    const stack = (this.counts.get(this.key(x, y, z)) ?? 1) - 1;
    const dpr = this.ctx.dpr;
    layoutText(
      fm,
      {
        x: at[0] * dpr,
        y: (at[1] - vOff) * dpr - stack * fm.lineHeight,
        z: 0,
        text,
        fg: textColor(color),
        bg: withAlpha(color, 0.6),
        center: true,
      },
      this.g.names,
    );
  }

  finish(): SceneGeometry {
    this.g.tris.data.push(...this.lines.data);
    return this.g;
  }
}

const colorOf = (c: number): RGBA => rgb(c & 0xffffff);

/** Builds the frame's character geometry (MapCanvas::paintCharacters). */
export function buildScene(scene: Scene, ctx: SceneContext): SceneGeometry {
  const map = ctx.map;
  const b = new CharBatch(ctx);
  const far = ctx.view.zoom <= CHAR_FAR_ZOOM;
  const pos = (r: number): Vec3 => [map.x[r]!, map.y[r]!, map.z[r]!];
  const valid = (r: number | null): r is number => r !== null && r >= 0 && r < map.roomCount;
  const you = valid(scene.room) ? scene.room : null;

  // Script marks first, under the group and the player (ADR 0057).
  for (const mk of scene.marks ?? []) {
    const color = withAlpha(colorOf(mk.color), 1);
    let arrows = 0;
    for (const r of mk.rooms) {
      if (!valid(r)) continue;
      const [x, y, z] = pos(r);
      b.drawMark(x, y, z, color, mk.alpha, mk.arrows && arrows++ < MARK_ARROWS);
    }
    const first = mk.rooms.find(valid);
    if (mk.label && first !== undefined && mk.alpha > 0.01) {
      const [x, y, z] = pos(first);
      b.drawMarkLabel(x, y, z, mk.label, withAlpha(color, mk.alpha));
    }
  }

  const drawGroup = () => {
    const drawn = new Set<number>();
    for (const m of scene.members) {
      if (!valid(m.room)) continue;
      const [x, y, z] = pos(m.room);
      const color = colorOf(m.color);
      b.drawCharacter(x, y, z, color, !drawn.has(m.room), far);
      if (m.room !== you) b.drawName(x, y, z, m.text, color);
      drawn.add(m.room);
    }
  };

  if (you !== null) {
    const [x, y, z] = pos(you);
    b.reserve(x, y, z);
    drawGroup();
    b.clear(x, y, z);
    const color = colorOf(scene.color);
    b.drawCharacter(x, y, z, color, true, far || !scene.located);
    b.drawPath(
      [x, y, z],
      scene.path.filter(valid).map(pos),
      color,
    );
  } else {
    drawGroup();
  }
  return b.finish();
}
