// ADR 0088 addendum (stage 26 round 1): a tile of another size than its
// texture array keeps its alpha and the colour of its transparent texels
// when scaled into the array, in every browser. Firefox's
// createImageBitmap resize ('high', premultiplyAlpha 'none') returned an
// opaque bitmap: Gefe's flow marks drew as cyan squares and Gray's doors
// as black squares.
import { expect, test } from '@playwright/test';

test('uploadLayer scales a tile into a larger array layer, alpha and transparent colour kept', async ({ page }) => {
  await page.goto('/?replay');
  const out = await page.evaluate(async () => {
    const { uploadLayer } = (await import('/src/map/render/upload.ts' as string)) as typeof import('../../src/map/render/upload');
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2')!;
    const DECODE: ImageBitmapOptions = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    const probe = async (url: string, size: number) => {
      const bmp = await createImageBitmap(await (await fetch(url)).blob(), DECODE);
      const src = { w: bmp.width, h: bmp.height };
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, size, size, 2);
      uploadLayer(gl, t, size, 1, bmp);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, t, 0, 1);
      const d = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, d);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      let clear = 0;
      let opaque = 0;
      const clearRgb = new Set<string>();
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) {
          clear++;
          clearRgb.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
        } else if (d[i + 3] === 255) opaque++;
      }
      return { src, clear: clear / (size * size), opaque: opaque / (size * size), clearRgb: [...clearRgb] };
    };
    return {
      gefe: await probe('map/tilesets/gefe-rik/stream-in-north.png', 200),
      gray: await probe('map/tilesets/grays-map/door-north.png', 256),
      error: gl.getError(),
    };
  });
  expect(out.error).toBe(0);
  // Gefe's 160² flow mark in a 200² array: mostly transparent, its cyan kept under alpha 0 (no dark rim).
  expect(out.gefe.src).toEqual({ w: 160, h: 160 });
  expect(out.gefe.clear).toBeGreaterThan(0.9);
  expect(out.gefe.opaque).toBeGreaterThan(0.001);
  expect(out.gefe.clearRgb).toEqual(['76,216,255']);
  // Gray's 128² door in a 256² array: mostly transparent, not a filled square.
  expect(out.gray.src).toEqual({ w: 128, h: 128 });
  expect(out.gray.clear).toBeGreaterThan(0.8);
  expect(out.gray.opaque).toBeLessThan(0.15);
});
