// The balloon signs' faces (stage 75, ADR 0159 round 3). The approved
// mockup loads Cinzel, Cormorant Garamond and IM Fell English from Google
// Fonts; the production CSP allows fonts from our own origin only
// (`font-src 'self'`), so the same Latin subsets are bundled in
// public/fonts (README "Balloon sign faces") and loaded here with
// `FontFace`, only while the balloons run: never at the app's start and
// never with Balloons off (nothing in this chunk runs then).
//
// They are added under family names of their own ("WCB …"), so the app's
// own Cinzel and Cormorant rules (src/theme/fonts.ts: one weight each) do
// not gain weights while the balloons are up. The rig's and the
// passengers' CSS is ported as written, with the mockup's family names;
// `signFonts` rewrites those names in it as the style is inserted.

import { fontUrl } from '../../theme/fonts';

interface Face {
  family: string;
  file: string;
  weight: string;
  style?: 'italic';
}

/** The mockup's family name → ours. Longest first (the SC name contains the plain one). */
const FAMILIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/"IM Fell English SC"/g, '"WCB Fell SC"'],
  [/"IM Fell English"/g, '"WCB Fell"'],
  [/"Cormorant Garamond"/g, '"WCB Cormorant"'],
  [/(^|[\s,:])Cinzel(?=[\s,;])/g, '$1"WCB Cinzel"'],
];

/** Every face a sign uses (rig.ts and the dwarf: Cinzel 500 and 700, Cormorant 500/600 upright and italic, IM Fell roman, italic and SC). */
export const FACES: readonly Face[] = [
  { family: 'WCB Cinzel', file: 'Cinzel-Medium-latin.woff2', weight: '500' },
  { family: 'WCB Cinzel', file: 'Cinzel-Bold-latin.woff2', weight: '700' },
  { family: 'WCB Cormorant', file: 'CormorantGaramond-Medium-latin.woff2', weight: '500' },
  { family: 'WCB Cormorant', file: 'CormorantGaramond-MediumItalic-latin.woff2', weight: '500', style: 'italic' },
  { family: 'WCB Cormorant', file: 'CormorantGaramond-SemiBold-latin.woff2', weight: '600' },
  { family: 'WCB Cormorant', file: 'CormorantGaramond-SemiBoldItalic-latin.woff2', weight: '600', style: 'italic' },
  { family: 'WCB Fell', file: 'IMFellEnglish-Regular-latin.woff2', weight: '400' },
  { family: 'WCB Fell', file: 'IMFellEnglish-Italic-latin.woff2', weight: '400', style: 'italic' },
  { family: 'WCB Fell SC', file: 'IMFellEnglishSC-Regular-latin.woff2', weight: '400' },
];

/** The CSS text with the mockup's family names replaced by the bundled faces' (rig.ts inserts it). */
export function signFonts(css: string): string {
  let s = css;
  for (const [re, to] of FAMILIES) s = s.replace(re, to);
  return s;
}

/** The FontFace objects, made once per page (the files download once). */
let made: FontFace[] | null = null;
/** The faces' loads, once. */
let loading: Promise<void> | null = null;

/** Never waits longer than this for the faces before a sign is drawn (a slow network: the sign is fitted again when they arrive), ms. */
export const FONT_WAIT_MS = 2500;

/**
 * Adds the sign faces to `doc` and starts loading them. Resolves when they
 * are loaded, failed, or FONT_WAIT_MS has passed (never rejects). Where the
 * Font Loading API is missing, at once (Georgia then).
 */
export function addSignFonts(doc: Document): Promise<void> {
  const set = (doc as Document & { fonts?: FontFaceSet }).fonts;
  const Face = (doc.defaultView as (Window & { FontFace?: typeof FontFace }) | null)?.FontFace;
  if (!set || !Face) return Promise.resolve();
  made ??= FACES.map((f) => new Face(f.family, `url("${fontUrl(f.file)}") format("woff2")`, { weight: f.weight, style: f.style ?? 'normal', display: 'block' }));
  for (const f of made) if (!set.has(f)) set.add(f);
  loading ??= Promise.all(made.map((f) => f.load().catch(() => null))).then(() => undefined);
  return Promise.race([loading, new Promise<void>((ok) => setTimeout(ok, FONT_WAIT_MS))]);
}

/** Takes the sign faces out of `doc` again (the balloons stopped). */
export function removeSignFonts(doc: Document): void {
  const set = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!set || !made) return;
  for (const f of made) set.delete(f);
}
