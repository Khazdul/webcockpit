// The engraving kit (stage 75's, ADR 0159 round 3; shared since stage 77's
// portrait pass, ADR 0166 addendum 12): the tinted engraving's pen ink,
// its filter (pen wobble, blotchy ink, paper grain), its hatch patterns and
// the colour helpers. The balloon rig (src/weather/balloons/rig.ts) and the
// Character card's portraits (src/panes/portraits/) draw with it. Pure
// strings: no DOM.

export const INK = '#23170f';
export const n = (v: number): number => +v.toFixed(1), n2 = (v: number): number => +v.toFixed(2);

/**
 * The engraving filter's settings. Beyond the pen wobble (`freq`, `scale`)
 * and the paper grain (`grain`): the blotchy ink tone (its colour `ink`,
 * its strength `blot` and offset `bias`) and the grain's alpha (`ga`,
 * `gb`). Stage 75: the softer copies three passengers drew for themselves
 * (elf, human, hobbit) are these options; `SOFT` is the elf's set.
 */
export interface FiltOpts {
  freq?: number;
  scale?: number;
  grain?: number;
  ink?: readonly [number, number, number];
  blot?: number;
  bias?: number;
  ga?: number;
  gb?: number;
}
/** A number as the mockup writes it in the filter's matrices (".16", "-.7"). */
const fm = (v: number): string => String(v).replace(/^(-?)0\./, '$1.');
// The pen wobble (a displacement), a blotchy ink tone and paper grain, kept inside the drawing.
export const filt = (id: string, o: FiltOpts = {}): string => {
  const [r, g, b] = o.ink ?? [.16, .09, .04];
  return `<filter id="${id}" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${o.freq ?? .06}" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${o.scale ?? 1.5}" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 ${fm(r)} 0 0 0 0 ${fm(g)} 0 0 0 0 ${fm(b)} ${fm(o.blot ?? 1.5)} 0 0 0 ${fm(o.bias ?? -.7)}" result="b"/><feTurbulence type="fractalNoise" baseFrequency="${o.grain ?? .8}" numOctaves="2" seed="11"/><feColorMatrix type="matrix" values="0 0 0 0 .14 0 0 0 0 .08 0 0 0 0 .04 0 ${fm(o.ga ?? 1.2)} 0 0 ${fm(o.gb ?? -.56)}" result="g"/><feMerge result="m"><feMergeNode in="b"/><feMergeNode in="g"/></feMerge><feComposite in="m" in2="d" operator="in" result="mc"/><feMerge><feMergeNode in="d"/><feMergeNode in="mc"/></feMerge></filter>`;
};
/** The softer ink (lighter blots, a fainter grain): the elf's, and a start for any other soft drawing. */
export const SOFT: FiltOpts = Object.freeze({ blot: .8, bias: -.46, ga: 1, gb: -.5 });
export const hatch = (id: string, rot: number, gap: number, op: number, sw = .55): string => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(${rot})"><path d="M0,.5H${gap}" stroke="${INK}" stroke-width="${sw}" opacity="${op}"/></pattern>`;
export const ink2 = (d: string, w: number, col: string, extra = ''): string => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n2(w + 1.5)}" ${extra}/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" ${extra}/>`;
const rgb = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const mix = (a: string, b: string, t: number): string => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join(''); };
export const dark = (h: string, t = .3): string => mix(h, '#1a110b', t), light = (h: string, t = .3): string => mix(h, '#f6ecd4', t);
