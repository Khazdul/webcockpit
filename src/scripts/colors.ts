// Colours for script output (spec §2.10): `cecho`, `replaceLine` and
// `highlight`.
//
// `cecho` text understands, in angle brackets:
// - tt++ colour codes, as `#showme` does (`<118>`, `<Faa00ff>`, `<g12>` …,
//   src/script/engine/color.ts);
// - Mudlet colour names: `<red>`, `<light_blue>`, `<ansi_light_red>`,
//   `<ansi_123>`, a background after a colon (`<white:red>`, `<:blue>`),
//   `<r,g,b>` and `<r,g,b:r,g,b>`, `<#rrggbb>` and `<#rrggbb:#rrggbb>`;
// - Mudlet's `<b>` `</b>`, `<i>` `</i>`, `<u>` `</u>`: bold, italic and
//   underline on and off (the line model's styles; Mudlet's `<s>` and `<o>`
//   have no style here and stay text);
// - `<reset>` and `<r>`: the default style;
// - adaptive colours (ADR 0068): a `~` before a Mudlet colour name,
//   `#rrggbb` or `r,g,b` (`<~gold>`, `<~#f0c850>`, `<~240,200,80>`,
//   `<~gold:~navy>`, `<:~gold>`): the colour keeps its hue and each renderer
//   adjusts its lightness to the background so it keeps 4.5:1 contrast.
//   `~ansi_*` is the palette colour as is (the theme already fits it);
// - in a script pane's text only (`parseCecho(text, { shades: true })`,
//   ADR 0065): the pane's shade roles `@track @dim @mid @bg @text @label
//   @glow` as a colour name (`<@text:@dim>`, `<:@track>`), resolved by the
//   pane every frame so they follow its tint and the theme.
// Anything else in angle brackets is text.
//
// Mudlet names are its X11 colour table (a selection) as 24-bit colours;
// the `ansi_*` names are the palette (the theme's colours 0–15, 16–255).
// `highlight(colour)` takes a profile colour name (`light red`, `bold
// yellow`, tt++ codes: parseHighlight), any of the cecho tags above (`<b>
// <red>`), or a Mudlet colour without brackets (`orange`, `white:red`,
// `255,0,0`, `#ff8800`), each also with a `~` (`~gold`, `~gold:~navy`).

import { type Color, type ShadeRoleName, type StyleRun, TRUECOLOR, adaptiveColor, shadeColor } from '../core/types';
import { type Colored, type Style, parseHighlight } from '../script/engine';
import { applyCode, isDefaultStyle, pushRun } from '../script/engine/color';

const X11: Record<string, readonly [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [190, 190, 190],
  grey: [190, 190, 190],
  light_gray: [211, 211, 211],
  light_grey: [211, 211, 211],
  dark_gray: [169, 169, 169],
  dark_grey: [169, 169, 169],
  dim_gray: [105, 105, 105],
  dim_grey: [105, 105, 105],
  slate_gray: [112, 128, 144],
  silver: [192, 192, 192],
  white_smoke: [245, 245, 245],
  snow: [255, 250, 250],
  ivory: [255, 255, 240],
  beige: [245, 245, 220],
  linen: [250, 240, 230],
  orange: [255, 165, 0],
  dark_orange: [255, 140, 0],
  orange_red: [255, 69, 0],
  tomato: [255, 99, 71],
  coral: [255, 127, 80],
  salmon: [250, 128, 114],
  light_salmon: [255, 160, 122],
  dark_salmon: [233, 150, 122],
  light_coral: [240, 128, 128],
  indian_red: [205, 92, 92],
  firebrick: [178, 34, 34],
  dark_red: [139, 0, 0],
  maroon: [176, 48, 96],
  brown: [165, 42, 42],
  sienna: [160, 82, 45],
  chocolate: [210, 105, 30],
  peru: [205, 133, 63],
  sandy_brown: [244, 164, 96],
  burlywood: [222, 184, 135],
  tan: [210, 180, 140],
  rosy_brown: [188, 143, 143],
  wheat: [245, 222, 179],
  gold: [255, 215, 0],
  goldenrod: [218, 165, 32],
  khaki: [240, 230, 140],
  dark_khaki: [189, 183, 107],
  light_yellow: [255, 255, 224],
  yellow_green: [154, 205, 50],
  chartreuse: [127, 255, 0],
  lawn_green: [124, 252, 0],
  light_green: [144, 238, 144],
  pale_green: [152, 251, 152],
  spring_green: [0, 255, 127],
  lime_green: [50, 205, 50],
  forest_green: [34, 139, 34],
  sea_green: [46, 139, 87],
  medium_sea_green: [60, 179, 113],
  dark_green: [0, 100, 0],
  olive_drab: [107, 142, 35],
  dark_olive_green: [85, 107, 47],
  aquamarine: [127, 255, 212],
  turquoise: [64, 224, 208],
  dark_turquoise: [0, 206, 209],
  pale_turquoise: [175, 238, 238],
  light_cyan: [224, 255, 255],
  dark_cyan: [0, 139, 139],
  cadet_blue: [95, 158, 160],
  powder_blue: [176, 224, 230],
  light_blue: [173, 216, 230],
  light_sky_blue: [135, 206, 250],
  sky_blue: [135, 206, 235],
  deep_sky_blue: [0, 191, 255],
  dodger_blue: [30, 144, 255],
  cornflower_blue: [100, 149, 237],
  steel_blue: [70, 130, 180],
  royal_blue: [65, 105, 225],
  slate_blue: [106, 90, 205],
  light_slate_blue: [132, 112, 255],
  medium_purple: [147, 112, 219],
  dark_blue: [0, 0, 139],
  navy: [0, 0, 128],
  navy_blue: [0, 0, 128],
  midnight_blue: [25, 25, 112],
  dark_slate_gray: [47, 79, 79],
  lavender: [230, 230, 250],
  thistle: [216, 191, 216],
  plum: [221, 160, 221],
  violet: [238, 130, 238],
  orchid: [218, 112, 214],
  dark_violet: [148, 0, 211],
  purple: [160, 32, 240],
  dark_magenta: [139, 0, 139],
  pink: [255, 192, 203],
  light_pink: [255, 182, 193],
  hot_pink: [255, 105, 180],
  deep_pink: [255, 20, 147],
};

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** A Mudlet colour name (any case, spaces or `_`), `r,g,b` or `#rrggbb` as a colour, or null. */
export function mudletColor(name: string): Color | null {
  const n = name.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (n === '') return null;
  if (n.charCodeAt(0) === 35 /* # */) return /^#[0-9a-f]{6}$/.test(n) ? TRUECOLOR | parseInt(n.slice(1), 16) : null;
  const rgb = /^(\d{1,3}),(\d{1,3}),(\d{1,3})$/.exec(n.replace(/_/g, ''));
  if (rgb) {
    const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (r > 255 || g > 255 || b > 255) return null;
    return TRUECOLOR | (r << 16) | (g << 8) | b;
  }
  if (n.startsWith('ansi_')) {
    const rest = n.slice(5);
    if (/^\d{1,3}$/.test(rest)) {
      const i = Number(rest);
      return i <= 255 ? i : null;
    }
    const light = rest.startsWith('light_');
    const i = ANSI.indexOf(light ? rest.slice(6) : rest);
    return i < 0 ? null : i + (light ? 8 : 0);
  }
  const c = X11[n];
  return c ? TRUECOLOR | (c[0] << 16) | (c[1] << 8) | c[2] : null;
}

/** Shade-role names in pane text (ADR 0065) → the ramp role. */
export const SHADE_TAGS: Readonly<Record<string, ShadeRoleName>> = {
  track: 'track',
  dim: 'dim',
  mid: 'mid',
  bg: 'paneBg',
  text: 'vtext',
  label: 'label',
  glow: 'glow',
};

/** Options of `parseCecho`. */
export interface CechoOptions {
  /** Accept the shade-role names `@track` … `@glow` (script pane text, ADR 0065). */
  shades?: boolean;
}

/**
 * An adaptive colour (ADR 0068): `~` and a Mudlet colour, `#rrggbb` or
 * `r,g,b`; `~ansi_*` is the palette colour itself. Null when the rest is
 * not a colour.
 */
export function adaptiveTag(name: string): Color | null {
  const n = name.trim();
  if (n.charCodeAt(0) !== 126 /* ~ */) return null;
  const c = mudletColor(n.slice(1));
  if (c === null) return null;
  return c >= TRUECOLOR ? adaptiveColor(c & 0xffffff) : c;
}

/** A colour name in a tag: a Mudlet colour, `~` adaptive, or with `shades` a shade role (`@dim`). */
function tagColor(name: string, shades: boolean): Color | null {
  const n = name.trim();
  if (n.charCodeAt(0) === 126 /* ~ */) return adaptiveTag(n);
  if (n.charCodeAt(0) === 64 /* @ */) {
    const role = shades ? SHADE_TAGS[n.slice(1).toLowerCase()] : undefined;
    return role ? shadeColor(role) : null;
  }
  return mudletColor(n);
}

/** Mudlet's attribute tags: `<b>` sets bold, `</b>` clears it. */
const ATTR: Record<string, 'bold' | 'italic' | 'underline'> = { b: 'bold', i: 'italic', u: 'underline' };

/** The style after a Mudlet tag (without `<>`), or undefined when it is not one. */
function applyMudlet(cur: Style, tag: string, shades = false): Style | undefined {
  const t = tag.trim().toLowerCase();
  if (t === 'reset' || t === 'r') return {};
  if (t.length <= 2) {
    const attr = ATTR[t.length === 2 && t[0] === '/' ? t[1]! : t];
    if (attr) {
      const s: Style = { ...cur };
      if (t[0] === '/') delete s[attr];
      else s[attr] = true;
      return s;
    }
  }
  const colon = tag.indexOf(':');
  const fgName = colon < 0 ? tag : tag.slice(0, colon);
  const bgName = colon < 0 ? '' : tag.slice(colon + 1);
  const fg = fgName.trim() === '' ? undefined : tagColor(fgName, shades);
  const bg = bgName.trim() === '' ? undefined : tagColor(bgName, shades);
  if (fg === null || bg === null || (fg === undefined && bg === undefined)) return undefined;
  const s: Style = { ...cur };
  if (fg !== undefined) s.fg = fg;
  if (bg !== undefined) s.bg = bg;
  return s;
}

/** Parses `cecho` text (see the file header) into text and style runs. */
export function parseCecho(input: string, opts: CechoOptions = {}): Colored {
  const shades = opts.shades === true;
  if (input.indexOf('<') < 0) return { text: input, runs: [] };
  let text = '';
  const runs: StyleRun[] = [];
  let cur: Style = {};
  let segStart = 0;
  const flush = (): void => {
    if (text.length > segStart && !isDefaultStyle(cur)) pushRun(runs, { start: segStart, end: text.length, ...cur });
    segStart = text.length;
  };
  let i = 0;
  while (i < input.length) {
    const lt = input.indexOf('<', i);
    if (lt < 0) {
      text += input.slice(i);
      break;
    }
    text += input.slice(i, lt);
    const gt = input.indexOf('>', lt + 1);
    if (gt < 0 || gt - lt - 1 > 40) {
      text += '<';
      i = lt + 1;
      continue;
    }
    const tag = input.slice(lt + 1, gt);
    let next: Style | null | undefined = tag.length <= 7 ? applyCode(cur, tag) : undefined;
    if (next === undefined) next = applyMudlet(cur, tag, shades);
    if (next === undefined) {
      text += '<';
      i = lt + 1;
      continue;
    }
    if (next !== null) {
      flush();
      cur = clean(next);
    }
    i = gt + 1;
  }
  flush();
  return { text, runs };
}

/**
 * A `highlight` colour: a profile colour name or code, cecho tags (`<b><red>`,
 * `<#ff8800>`), else a Mudlet colour without brackets (`fg:bg` too). Null
 * when unknown.
 */
export function parseScriptColor(arg: string): Style | null {
  const h = parseHighlight(arg);
  if (h) return h;
  const t = arg.trim();
  if (t.startsWith('<')) {
    // Only tags: the style of a one-character sample after them.
    const c = parseCecho(t + '\u0000');
    const r = c.text === '\u0000' ? c.runs[0] : undefined;
    if (!r) return null;
    const { start: _s, end: _e, ...style } = r;
    return style;
  }
  const m = applyMudlet({}, t);
  return m && !isDefaultStyle(m) ? m : null;
}

function clean(s: Style): Style {
  const o: Style = {};
  if (s.fg !== undefined) o.fg = s.fg;
  if (s.bg !== undefined) o.bg = s.bg;
  if (s.bold) o.bold = true;
  if (s.italic) o.italic = true;
  if (s.underline) o.underline = true;
  if (s.inverse) o.inverse = true;
  if (s.blink) o.blink = true;
  return o;
}
