// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (C) 2026 The WebCockpit Authors
// Derived from MMapper 26.06.0 (https://github.com/MUME/MMapper),
// Copyright (C) 2019-2026 The MMapper Authors. Modified for WebCockpit
// (2026-09-28): rewritten in TypeScript and WebGL2; see
// THIRD_PARTY_NOTICES.md "MMapper-derived code".
//
// GLSL ES 3.00 programs of the map renderer. The room, font and point
// logic follows MMapper 26.06.0 resources/shaders/legacy/{room,font,point}
// (GPL-2.0-or-later).
//
// Projection (research §2.2, ProjectionUtils::calculateViewProjOld): a
// perspective camera above the view centre with world z scaled by 7, so
// clip = ((x − sx)·kx, (y − sy)·ky, 0, 60 − 7z) with
// kx = 5280·zoom / widthCss (likewise ky). Layer 0 at zoom 1 is 44 CSS px
// per room; other layers are slightly larger or smaller.

const PROJ = /* glsl */ `
uniform vec4 uView;
vec4 proj(vec3 p) {
  return vec4((p.x - uView.x) * uView.z, (p.y - uView.y) * uView.w, 0.0, 60.0 - 7.0 * p.z);
}
`;

export const MAX_NAMED_COLORS = 16;

/** Instanced room quads (room/tex/acolor). */
export const ROOM_VS = /* glsl */ `#version 300 es
${PROJ}
uniform vec4 uNamed[${MAX_NAMED_COLORS}];
layout(location = 0) in ivec4 aInst;
out vec4 vColor;
out vec3 vTc;
void main() {
  // Triangle strip 0-1-2-3: (0,0) (1,0) (0,1) (1,1).
  ivec2 o = ivec2(gl_VertexID & 1, gl_VertexID >> 1);
  int tex = aInst.w & 255;
  int col = (aInst.w >> 8) % ${MAX_NAMED_COLORS};
  vColor = uNamed[col];
  vTc = vec3(vec2(o), float(tex));
  gl_Position = proj(vec3(vec2(aInst.xy + o), float(aInst.z)));
}`;

export const ROOM_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform vec4 uColor;
uniform bool uWhite;
in vec4 vColor;
in vec3 vTc;
out vec4 oColor;
void main() {
  vec4 t = uWhite ? vec4(1.0) : texture(uTex, vTc);
  oColor = vColor * uColor * t;
}`;

/** Coloured world-space triangles (plain/acolor). */
export const COLOR_VS = /* glsl */ `#version 300 es
${PROJ}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
out vec4 vColor;
void main() {
  vColor = aColor;
  gl_Position = proj(aPos);
}`;

// uInk (0 = off) takes that share of a colour's white part away: white
// lines turn dark grey, red stays red (connections and infomark lines on
// a light map background, ADR 0085 addendum).
export const COLOR_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uColor;
uniform float uInk;
in vec4 vColor;
out vec4 oColor;
void main() {
  vec4 c = vColor * uColor;
  c.rgb -= min(min(c.r, c.g), c.b) * uInk;
  oColor = c;
}`;

/** Coloured, textured world-space triangles (tex/acolor; the character square). */
export const TEXCOLOR_VS = /* glsl */ `#version 300 es
${PROJ}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColor;
layout(location = 2) in vec3 aTc;
out vec4 vColor;
out vec3 vTc;
void main() {
  vColor = aColor;
  vTc = aTc;
  gl_Position = proj(aPos);
}`;

export const TEXCOLOR_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
in vec4 vColor;
in vec3 vTc;
out vec4 oColor;
void main() {
  oColor = vColor * texture(uTex, vTc);
}`;

/**
 * Text and other pixel-sized quads (font/): the anchor is projected and
 * snapped to a physical pixel, then offset by aOff physical px. With
 * uScreen the anchor is already in physical px (y down).
 */
export const FONT_VS = /* glsl */ `#version 300 es
${PROJ}
uniform vec2 uPhys;
uniform bool uScreen;
layout(location = 0) in vec3 aBase;
layout(location = 1) in vec4 aColor;
layout(location = 2) in vec2 aTc;
layout(location = 3) in vec2 aOff;
out vec4 vColor;
out vec2 vTc;
void main() {
  vColor = aColor;
  vTc = aTc;
  vec2 ndc;
  if (uScreen) {
    ndc = vec2(aBase.x / uPhys.x * 2.0 - 1.0, 1.0 - aBase.y / uPhys.y * 2.0);
  } else {
    vec4 p = proj(aBase);
    if (any(greaterThan(abs(p.xy), vec2(1.5 * abs(p.w)))) || abs(p.w) < 1e-3) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    ndc = p.xy / p.w;
  }
  vec2 px = floor((ndc * 0.5 + 0.5) * uPhys);
  gl_Position = vec4((px + aOff) / uPhys * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FONT_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec4 vColor;
in vec2 vTc;
out vec4 oColor;
void main() {
  vec4 t;
  if (vTc.x < -5.0) {
    t = vec4(1.0);
  } else if (vTc.x < -1.0) {
    vec2 c = vec2(vTc.x + 4.0, vTc.y) - 0.5;
    if (dot(c, c) > 0.25) discard;
    t = vec4(1.0);
  } else {
    t = texture(uTex, vTc);
  }
  oColor = vColor * t;
}`;

/** A full-screen triangle in one colour (fullscreen/). */
export const FULL_VS = /* glsl */ `#version 300 es
void main() {
  gl_Position = vec4(vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0, 0.0, 1.0);
}`;

export const FULL_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 oColor;
void main() {
  oColor = uColor;
}`;

/**
 * Map tokens (stage 80 §7, ADR 0171): one instanced quad per token, sized
 * in device px around its projected centre (never snapped, so a moving
 * token glides). Per instance (16 floats): centre xyz, picture radius
 * (CSS px); texture layer (-1: none), kind (0 drawing, 1 library or own,
 * 2 `+n` disc), HP (-1: no arc), arc width (CSS px); ring rgb; arc rgb;
 * the picture's crop (zoom, top offset).
 */
export const TOKEN_VS = /* glsl */ `#version 300 es
${PROJ}
uniform vec2 uPhys;
uniform float uDpr;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec3 aRing;
layout(location = 3) in vec3 aArc;
layout(location = 4) in vec2 aCrop;
out vec2 vPx;
flat out vec4 vB;
flat out vec3 vRing;
flat out vec3 vArc;
flat out vec3 vCrop;
void main() {
  vec4 p = proj(aA.xyz);
  if (abs(p.w) < 1e-3) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  // Out to the arc and its dark backdrop, plus a pixel for the smoothing.
  float reach = (aA.w + 1.0 + 1.0 + 1.0 + aB.w + 1.0) * uDpr + 1.0;
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vPx = corner * reach;
  vB = aB;
  vRing = aRing;
  vArc = aArc;
  vCrop = vec3(aCrop, aA.w * uDpr);
  gl_Position = vec4(p.xy / p.w + vPx * 2.0 / uPhys, 0.0, 1.0);
}`;

// Every edge is a coverage of the distance in device px (±0.5 px), so the
// disc, the 1 px ring and outline and the arc hold at every zoom and
// device scale. The layers are put together premultiplied, back to front
// (the mockup's canvas order): the disc (gradient, the picture over it),
// the outline, the ring, the arc's dark backdrop, the arc. The pictures
// are premultiplied and mipmapped (trilinear): no shimmer when small.
export const TOKEN_FS = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray uTex;
uniform float uDpr;
in vec2 vPx;
flat in vec4 vB;
flat in vec3 vRing;
flat in vec3 vArc;
flat in vec3 vCrop;
out vec4 oColor;
vec4 over(vec4 dst, vec3 rgb, float a) {
  return vec4(rgb * a, a) + dst * (1.0 - a);
}
float disc(float d, float r) {
  return clamp(r - d + 0.5, 0.0, 1.0);
}
float band(float d, float lo, float hi) {
  return clamp(min(d - lo, hi - d) + 0.5, 0.0, 1.0);
}
void main() {
  float px = uDpr;
  float R = vCrop.z;
  float d = length(vPx);
  vec2 q = vPx / max(R, 0.5);
  // The picture's crop: a square of side 1/zoom, centred across, at oy down (texture v grows down).
  float sw = 1.0 / vCrop.x;
  vec2 uv = vec2((1.0 - sw) * 0.5 + (q.x * 0.5 + 0.5) * sw, (1.0 - sw) * vCrop.y + (0.5 - q.y * 0.5) * sw);
  vec4 tx = texture(uTex, vec3(uv, max(vB.x, 0.0)));
  if (vB.x < 0.0) tx = vec4(0.0);
  vec4 c = vec4(0.0);
  if (vB.y > 1.5) {
    // The +n disc: dark, a thin light rim, the count's glyphs.
    float rr = R + px;
    c = over(c, vec3(0.0824, 0.0902, 0.1020), disc(d, rr));
    c = tx * disc(d, R) + c * (1.0 - tx.a * disc(d, R));
    c = over(c, vec3(0.9137, 0.8118, 0.6235), 0.7 * band(d, rr - 0.5 * px, rr + 0.5 * px));
  } else {
    float t = clamp(length(q - vec2(0.0, 0.2)) / 1.2, 0.0, 1.0);
    vec3 bg = vB.y > 0.5 ? mix(vec3(0.4353, 0.4078, 0.3569), vec3(0.1647, 0.1490, 0.1255), t)
                         : mix(vec3(0.2275, 0.1333, 0.1333), vec3(0.0706, 0.0471, 0.0471), t);
    vec4 inner = tx + vec4(bg, 1.0) * (1.0 - tx.a);
    c = inner * disc(d, R);
    float rw = px;
    c = over(c, vec3(0.0), band(d, R + rw - 0.25 * px, R + rw + 0.75 * px));
    c = over(c, vRing, band(d, R, R + rw));
    if (vB.z >= 0.0) {
      float aw = vB.w * px;
      float ar = R + rw + 0.5 * px + aw * 0.5;
      c = over(c, vec3(0.0), 0.78 * band(d, ar - aw * 0.5 - 0.5 * px, ar + aw * 0.5 + 0.5 * px));
      // From 12 o'clock, clockwise; butt ends.
      float ang = atan(vPx.x, vPx.y);
      if (ang < 0.0) ang += 6.2831853;
      float along = clamp(min(ang, vB.z * 6.2831853 - ang) * ar + 0.5, 0.0, 1.0);
      c = over(c, vArc, band(d, ar - aw * 0.5, ar + aw * 0.5) * along);
    }
  }
  if (c.a < 0.002) discard;
  oColor = vec4(c.rgb / c.a, c.a);
}`;
