// Sprites the sky draws every frame (cloud puffs, the soft dot, the moon).
// Small canvases are not GPU-backed in Chromium, so drawing one into an
// accelerated canvas uploads it again on every draw. An ImageBitmap is
// uploaded once; until it is ready (it is made asynchronously) the canvas
// itself is drawn.

export interface Sprite {
  src: CanvasImageSource;
  readonly w: number;
  readonly h: number;
}

/** A sprite of `c` that switches to an ImageBitmap of it when one is ready. */
export function sprite(c: HTMLCanvasElement): Sprite {
  const s: Sprite = { src: c, w: c.width, h: c.height };
  bitmap(c, (b) => {
    s.src = b;
  });
  return s;
}

/** Makes an ImageBitmap of `c` (if the browser can) and hands it to `done`. */
export function bitmap(c: HTMLCanvasElement, done: (b: ImageBitmap) => void): void {
  if (typeof createImageBitmap !== 'function') return;
  createImageBitmap(c).then(done, () => undefined);
}
