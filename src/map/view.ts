// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// The map view (research §2): scroll centre, zoom and layer, and the
// pan and zoom-at-cursor operations. Pure; owned by the worker.
//
// World: a room (x, y, z) covers [x, x+1] × [y, y+1]; +y is north (up on
// screen). MMapper's 2D projection gives `s(z) = 2640·zoom / (60 − 7z)`
// CSS px per room on layer z (44 px on layer 0 at zoom 1); the camera
// ignores the current layer.

/** Zoom limits and wheel step (MMapper ScaleFactor). */
export const ZOOM_MIN = 0.04;
export const ZOOM_MAX = 5;
export const ZOOM_STEP = 1.175;

export interface View {
  /** World point at the canvas centre. */
  x: number;
  y: number;
  zoom: number;
  /** The current layer (z). */
  layer: number;
}

export const defaultView = (): View => ({ x: 0, y: 0, zoom: 1, layer: 0 });

/** CSS px per room on layer `z`. */
export function pxPerRoom(zoom: number, z: number): number {
  return (2640 * zoom) / (60 - 7 * z);
}

/** Centres on room (x, y, z) and makes z the current layer (MMapper's move behaviour). */
export function centreOn(v: View, x: number, y: number, z: number): View {
  return { ...v, x: x + 0.5, y: y + 0.5, layer: z };
}

/** Drag by (dx, dy) CSS px: the grabbed world point follows the pointer. */
export function pan(v: View, dx: number, dy: number): View {
  const s = pxPerRoom(v.zoom, v.layer);
  return { ...v, x: v.x - dx / s, y: v.y + dy / s };
}

/**
 * Zooms by `steps` wheel notches around (px, py) CSS px in a `w` × `h`
 * canvas, keeping the world point under the cursor fixed on the current
 * layer.
 */
export function zoomAt(v: View, steps: number, px: number, py: number, w: number, h: number): View {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * ZOOM_STEP ** steps));
  if (zoom === v.zoom) return v;
  const s0 = pxPerRoom(v.zoom, v.layer);
  const s1 = pxPerRoom(zoom, v.layer);
  const ox = px - w / 2;
  const oy = py - h / 2;
  const wx = v.x + ox / s0;
  const wy = v.y - oy / s0;
  return { ...v, zoom, x: wx - ox / s1, y: wy + oy / s1 };
}

/**
 * A view that shows the player's room and `targets` (rooms as x, y, z)
 * on the player's layer, with `margin` CSS px around them in a `w` × `h`
 * canvas (ADR 0057): it never zooms in. When they cannot all fit even at
 * ZOOM_MIN, the targets win (ADR 0079): the targets alone on their layer,
 * else centred on the first (nearest) target at ZOOM_MIN. With no player
 * position, the targets alone. Nothing to show: `v` itself.
 */
export function fitRooms(
  v: View,
  player: { x: number; y: number; z: number } | null,
  targets: readonly { x: number; y: number; z: number }[],
  w: number,
  h: number,
  margin = 48,
): View {
  const pts = player ? [player, ...targets] : [...targets];
  if (pts.length === 0 || w <= 0 || h <= 0) return v;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + 1);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y + 1);
  }
  const layer = player ? player.z : pts[0]!.z;
  const s = Math.min(Math.max(1, w - 2 * margin) / (maxX - minX), Math.max(1, h - 2 * margin) / (maxY - minY));
  const want = (s * (60 - 7 * layer)) / 2640;
  if (want < ZOOM_MIN && targets.length > 0) {
    // Too far apart: never a view halfway between that shows neither.
    if (player) return fitRooms(v, null, targets, w, h, margin);
    if (targets.length > 1) return fitRooms(v, null, targets.slice(0, 1), w, h, margin);
    return { ...centreOn(v, targets[0]!.x, targets[0]!.y, targets[0]!.z), zoom: ZOOM_MIN };
  }
  const zoom = Math.max(ZOOM_MIN, Math.min(v.zoom, want));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom, layer };
}
