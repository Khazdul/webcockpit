// The crop step of an own image (stage 80 §3, ADR 0172): a square view of
// the picked picture with pan and zoom, a circle that marks the token's
// cut, and the encode to 256 × 256. Everything runs in the browser: the
// original never leaves it, only the encoded square is kept.
//
//   view       a square of `view` CSS px; the picture covers it at zoom 1
//              (its short side fills the square), zoom 1 … ZOOM_MAX
//   pan        the picture's centre from the view's centre, in view px,
//              held so that the picture always covers the square
//   encode     WebP at the quality stepped down from QUALITIES[0] until the
//              file is at most the target (30 720 bytes); a browser that
//              makes no WebP (its toBlob gives another type) gets JPEG on
//              a dark ground (JPEG has no alpha) the same way
//
// The geometry and the quality steps are pure (unit tests); the canvas
// work takes a `CanvasLike` so it can be faked.

/** The encoded square's side, px. */
export const CROP_OUT = 256;
export const ZOOM_MAX = 4;
/** The qualities tried, best first. */
export const QUALITIES = [0.92, 0.86, 0.8, 0.74, 0.68, 0.6, 0.52, 0.44, 0.36, 0.28, 0.2, 0.12] as const;
/** The ground under a JPEG (it has no alpha): the token's dark disc. */
export const JPEG_GROUND = '#17130f';

export interface CropState {
  /** The picture's size, px. */
  w: number;
  h: number;
  /** The view's side, CSS px. */
  view: number;
  /** 1 … ZOOM_MAX. */
  zoom: number;
  /** The picture's centre from the view's centre, view px. */
  x: number;
  y: number;
}

/** A crop of a `w` × `h` picture in a view of `view` px: zoom 1, centred. */
export function cropStart(w: number, h: number, view: number): CropState {
  return { w, h, view, zoom: 1, x: 0, y: 0 };
}

/** The picture's scale in the view (view px per picture px). */
export const cropScale = (s: CropState): number => (s.view / Math.min(s.w, s.h)) * s.zoom;

/** `s` with the zoom and the pan held to what keeps the square covered. */
export function cropClamp(s: CropState): CropState {
  const zoom = Math.min(ZOOM_MAX, Math.max(1, Number.isFinite(s.zoom) ? s.zoom : 1));
  const k = (s.view / Math.min(s.w, s.h)) * zoom;
  const mx = Math.max(0, (s.w * k - s.view) / 2);
  const my = Math.max(0, (s.h * k - s.view) / 2);
  const clamp = (v: number, m: number): number => (Number.isFinite(v) ? Math.min(m, Math.max(-m, v)) : 0);
  return { ...s, zoom, x: clamp(s.x, mx), y: clamp(s.y, my) };
}

/** `s` moved by (dx, dy) view px. */
export const cropPan = (s: CropState, dx: number, dy: number): CropState => cropClamp({ ...s, x: s.x + dx, y: s.y + dy });

/**
 * `s` zoomed to `zoom`, keeping the picture's point under (`ax`, `ay`)
 * (view px from the view's centre; the centre by default) where it is.
 */
export function cropZoom(s: CropState, zoom: number, ax = 0, ay = 0): CropState {
  const z = Math.min(ZOOM_MAX, Math.max(1, zoom));
  const f = z / s.zoom;
  return cropClamp({ ...s, zoom: z, x: ax + (s.x - ax) * f, y: ay + (s.y - ay) * f });
}

/** A point in the view, view px from its centre. */
export interface CropPoint {
  x: number;
  y: number;
}

/**
 * Two fingers (stage 80 part F): from `s` when they came down at `a0`, `b0`
 * to `a1`, `b1` now (view px from the view's centre). The zoom follows the
 * distance between them, and the picture's point under their midpoint
 * follows the midpoint, so the picture moves with the fingers as well.
 */
export function cropPinch(s: CropState, a0: CropPoint, b0: CropPoint, a1: CropPoint, b1: CropPoint): CropState {
  const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
  const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
  const z = Math.min(ZOOM_MAX, Math.max(1, s.zoom * (d1 / d0)));
  const f = z / s.zoom;
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  return cropClamp({ ...s, zoom: z, x: m1.x + (s.x - m0.x) * f, y: m1.y + (s.y - m0.y) * f });
}

/** Where the picture is drawn on a square of `side` px (the view's canvas, or the encoded 256). */
export function cropRect(s: CropState, side: number): { dx: number; dy: number; dw: number; dh: number } {
  const f = side / s.view;
  const k = cropScale(s) * f;
  const dw = s.w * k;
  const dh = s.h * k;
  return { dx: side / 2 + s.x * f - dw / 2, dy: side / 2 + s.y * f - dh / 2, dw, dh };
}

/** What `encodeSquare` needs of a canvas (an HTMLCanvasElement fits). */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(id: '2d'): {
    fillStyle: string | CanvasGradient | CanvasPattern;
    imageSmoothingEnabled: boolean;
    imageSmoothingQuality: ImageSmoothingQuality;
    clearRect(x: number, y: number, w: number, h: number): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    drawImage(img: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
  } | null;
  toBlob(cb: (b: Blob | null) => void, type?: string, quality?: number): void;
}

export type EncodeResult =
  | { ok: true; bytes: Uint8Array<ArrayBuffer>; type: 'image/webp' | 'image/jpeg'; quality: number }
  /** `big`: not under the target even at the lowest quality; `failed`: the browser would not encode. */
  | { ok: false; why: 'big' | 'failed' };

const blobOf = (c: CanvasLike, type: string, q: number): Promise<Blob | null> => new Promise((r) => c.toBlob(r, type, q));

/**
 * The quality steps (pure but for `encode`): the first quality whose file
 * is at most `target`; `big` when none is; `failed` when `encode` gives
 * nothing, `wrongType` when it gives another type than asked (no WebP).
 */
export async function stepQuality(
  encode: (q: number) => Promise<Blob | null>,
  type: string,
  target: number,
): Promise<{ blob: Blob; quality: number } | 'big' | 'failed' | 'wrongType'> {
  for (const q of QUALITIES) {
    const b = await encode(q);
    if (!b) return 'failed';
    if (b.type !== type) return 'wrongType';
    if (b.size <= target) return { blob: b, quality: q };
  }
  return 'big';
}

/** Draws the crop of `img` onto `canvas` (256 × 256) and encodes it (see the file header). */
export async function encodeSquare(img: CanvasImageSource, s: CropState, canvas: CanvasLike, target: number): Promise<EncodeResult> {
  canvas.width = CROP_OUT;
  canvas.height = CROP_OUT;
  const g = canvas.getContext('2d');
  if (!g) return { ok: false, why: 'failed' };
  const r = cropRect(s, CROP_OUT);
  const draw = (ground: string | null): void => {
    g.clearRect(0, 0, CROP_OUT, CROP_OUT);
    if (ground) {
      g.fillStyle = ground;
      g.fillRect(0, 0, CROP_OUT, CROP_OUT);
    }
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, r.dx, r.dy, r.dw, r.dh);
  };
  draw(null);
  const webp = await stepQuality((q) => blobOf(canvas, 'image/webp', q), 'image/webp', target);
  let out: { blob: Blob; quality: number; type: 'image/webp' | 'image/jpeg' } | null = null;
  if (typeof webp === 'object') out = { ...webp, type: 'image/webp' };
  else if (webp === 'big') return { ok: false, why: 'big' };
  else {
    draw(JPEG_GROUND);
    const jpeg = await stepQuality((q) => blobOf(canvas, 'image/jpeg', q), 'image/jpeg', target);
    if (typeof jpeg !== 'object') return { ok: false, why: jpeg === 'big' ? 'big' : 'failed' };
    out = { ...jpeg, type: 'image/jpeg' };
  }
  return { ok: true, bytes: new Uint8Array(await out.blob.arrayBuffer()), type: out.type, quality: out.quality };
}

/** The longest side a picked picture is decoded to (a photo of 6000 px is made smaller once). */
export const DECODE_MAX = 2048;

/**
 * A picked file as a bitmap (an animated one gives its first frame), made
 * smaller when it is very large; null when the browser cannot decode it.
 */
export async function decodeFile(file: Blob, win: { createImageBitmap?: typeof createImageBitmap } = globalThis): Promise<ImageBitmap | null> {
  const make = win.createImageBitmap?.bind(win);
  if (!make) return null;
  let bmp: ImageBitmap;
  try {
    bmp = await make(file);
  } catch {
    return null;
  }
  if (!bmp.width || !bmp.height) return null;
  const long = Math.max(bmp.width, bmp.height);
  if (long <= DECODE_MAX) return bmp;
  const f = DECODE_MAX / long;
  try {
    const small = await make(bmp, { resizeWidth: Math.round(bmp.width * f), resizeHeight: Math.round(bmp.height * f), resizeQuality: 'high' });
    bmp.close();
    return small;
  } catch {
    return bmp;
  }
}

/** The label an own image gets from its file's name: without the extension, at most 60 characters. */
export function imageLabel(fileName: string): string {
  const base = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();
  return (base || 'Image').slice(0, 60);
}
