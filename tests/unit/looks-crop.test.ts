// Stage 80 part D (ADR 0172): the crop step's geometry and the encode's
// quality steps (src/looks/crop.ts), and the shelf's words (src/looks/mine.tsx).
import { describe, expect, it } from 'vitest';
import {
  CROP_OUT,
  type CanvasLike,
  JPEG_GROUND,
  QUALITIES,
  ZOOM_MAX,
  cropClamp,
  cropPan,
  cropPinch,
  cropRect,
  cropScale,
  cropStart,
  cropZoom,
  encodeSquare,
  imageLabel,
  stepQuality,
} from '../../src/looks/crop';
import { FULL_WORDS, refusedWords, removeWords } from '../../src/looks/mine';

const blob = (size: number, type: string): Blob => new Blob([new Uint8Array(size)], { type });

describe('the crop', () => {
  it('starts centred at zoom 1 with the short side filling the square', () => {
    const s = cropStart(400, 200, 240);
    expect(cropScale(s)).toBe(1.2);
    expect(cropRect(s, 240)).toEqual({ dx: -120, dy: 0, dw: 480, dh: 240 });
    expect(cropRect(s, CROP_OUT)).toEqual({ dx: -128, dy: 0, dw: 512, dh: 256 });
  });

  it('pans only as far as the picture covers the square, and zoom stays 1 … ZOOM_MAX', () => {
    const s = cropStart(400, 200, 240);
    expect(cropPan(s, 500, 50)).toMatchObject({ x: 120, y: 0 });
    expect(cropPan(s, -500, 0)).toMatchObject({ x: -120 });
    const z = cropZoom(s, 2);
    expect(z.zoom).toBe(2);
    expect(cropPan(z, 1000, 1000)).toMatchObject({ x: 360, y: 120 });
    expect(cropZoom(s, 99).zoom).toBe(ZOOM_MAX);
    expect(cropZoom(s, 0.1).zoom).toBe(1);
    expect(cropClamp({ ...s, x: Number.NaN, zoom: Number.NaN })).toMatchObject({ x: 0, zoom: 1 });
  });

  it('zooms about a point: the picture under it stays', () => {
    const s = cropStart(300, 300, 240);
    const z = cropZoom(s, 2, 60, 60);
    // The point 60 px right and down of the centre was the picture's (60 / 0.8) = 75 px from its centre; it still is under it.
    const k = cropScale(z);
    expect((60 - z.x) / k).toBeCloseTo(60 / cropScale(s), 6);
    expect(cropRect(z, 240).dw).toBe(480);
  });

  it('a pinch (part F): the zoom follows the fingers’ spread, the picture follows their midpoint', () => {
    const s = cropStart(300, 300, 240);
    // Spread from 40 to 80 px apart about the centre: twice the zoom, nothing moved.
    const z = cropPinch(s, { x: -20, y: 0 }, { x: 20, y: 0 }, { x: -40, y: 0 }, { x: 40, y: 0 });
    expect(z.zoom).toBe(2);
    expect(z).toMatchObject({ x: 0, y: 0 });
    // The same spread about a point 30 px right: the picture's point under it stays under it.
    const a = cropPinch(s, { x: 10, y: 0 }, { x: 50, y: 0 }, { x: -10, y: 0 }, { x: 70, y: 0 });
    expect((30 - a.x) / cropScale(a)).toBeCloseTo((30 - s.x) / cropScale(s), 6);
    // The two fingers moved together without spreading: a pan, the zoom kept.
    const p = cropPinch(z, { x: -20, y: 0 }, { x: 20, y: 0 }, { x: -10, y: 15 }, { x: 30, y: 15 });
    expect(p.zoom).toBe(2);
    expect(p).toMatchObject({ x: 10, y: 15 });
    // Held to the limits.
    expect(cropPinch(s, { x: -10, y: 0 }, { x: 10, y: 0 }, { x: -200, y: 0 }, { x: 200, y: 0 }).zoom).toBe(ZOOM_MAX);
    expect(cropPinch(s, { x: -50, y: 0 }, { x: 50, y: 0 }, { x: -1, y: 0 }, { x: 1, y: 0 }).zoom).toBe(1);
  });

  it('a square that is the whole picture draws the whole picture', () => {
    const s = cropStart(256, 256, 240);
    expect(cropRect(s, CROP_OUT)).toEqual({ dx: 0, dy: 0, dw: 256, dh: 256 });
  });
});

describe('the quality steps', () => {
  it('the first quality whose file is at most the target', async () => {
    const asked: number[] = [];
    const sizes = [50_000, 40_000, 31_000, 30_720, 20_000];
    const r = await stepQuality(async (q) => (asked.push(q), blob(sizes[asked.length - 1]!, 'image/webp')), 'image/webp', 30_720);
    expect(r).toMatchObject({ quality: QUALITIES[3] });
    expect(asked).toEqual(QUALITIES.slice(0, 4));
  });

  it('big when none fits, failed when nothing comes, wrongType when the browser makes another type', async () => {
    expect(await stepQuality(async () => blob(99_999, 'image/webp'), 'image/webp', 30_720)).toBe('big');
    expect(await stepQuality(async () => null, 'image/webp', 30_720)).toBe('failed');
    expect(await stepQuality(async () => blob(10, 'image/png'), 'image/webp', 30_720)).toBe('wrongType');
  });

  function canvas(make: (type: string, q: number) => Blob | null): CanvasLike & { fills: string[]; draws: number[][] } {
    const fills: string[] = [];
    const draws: number[][] = [];
    const g = {
      fillStyle: '' as string,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      clearRect: () => {},
      fillRect() {
        fills.push(g.fillStyle);
      },
      drawImage: (_i: unknown, ...r: number[]) => void draws.push(r),
    };
    return { width: 0, height: 0, fills, draws, getContext: () => g as never, toBlob: (cb, type, q) => cb(make(type ?? '', q ?? 1)) };
  }

  it('WebP 256 × 256 when the browser makes it; else JPEG on a dark ground', async () => {
    const img = {} as CanvasImageSource;
    const st = cropStart(512, 256, 240);
    const c1 = canvas((type) => blob(20_000, type));
    const r1 = await encodeSquare(img, st, c1, 30_720);
    expect(r1).toMatchObject({ ok: true, type: 'image/webp', quality: QUALITIES[0] });
    expect([c1.width, c1.height]).toEqual([256, 256]);
    expect(c1.draws[0]).toEqual([-128, 0, 512, 256]);
    expect(c1.fills).toEqual([]);
    const c2 = canvas((type) => blob(type === 'image/webp' ? 10 : 25_000, type === 'image/webp' ? 'image/png' : type));
    const r2 = await encodeSquare(img, st, c2, 30_720);
    expect(r2).toMatchObject({ ok: true, type: 'image/jpeg' });
    expect(c2.fills).toEqual([JPEG_GROUND]);
    const c3 = canvas((type) => blob(90_000, type));
    expect(await encodeSquare(img, st, c3, 30_720)).toEqual({ ok: false, why: 'big' });
  });
});

describe('the words', () => {
  it('labels, the full shelf, a removal, a refusal', () => {
    expect(imageLabel('My Dwarf.final.png')).toBe('My Dwarf.final');
    expect(imageLabel('.png')).toBe('Image');
    expect(imageLabel('x'.repeat(80) + '.jpeg')).toHaveLength(60);
    expect(FULL_WORDS(50)).toBe('Your shelf is full (50 of 50). Remove an image first.');
    expect(removeWords([])).toBe('No character uses this image.');
    expect(removeWords(['rasta'])).toBe('Rasta uses this image and goes back to automatic.');
    expect(removeWords(['a', 'b', 'c', 'd', 'e'])).toBe('5 characters use this image (A, B, C and 2 more). They go back to automatic.');
    expect(refusedWords('Rasta', 'item_too_large')).toBe('“Rasta” is not in your account: it is larger than the account takes for one image. It stays on this device.');
    expect(refusedWords('Rasta', 'too_many_items')).toContain('as many images as it may');
    expect(refusedWords('', 'storage_full')).toContain("“An image” is not in your account: the account's room for images is full.");
  });
});
