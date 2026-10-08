// Uploads one tile into a layer of a texture array (ADR 0082, ADR 0088
// addendum). A tile of the array's size is uploaded as is. A tile of
// another size (a tileset's file in an array sized by its largest file)
// is scaled on the GPU: uploaded at its own size to a scratch texture and
// blitted into the layer with linear filtering.
//
// Why not `createImageBitmap(…, {resizeWidth, resizeHeight})`: Firefox
// returns a fully opaque bitmap for `resizeQuality: 'high'` with
// `premultiplyAlpha: 'none'` (every alpha 255), so transparent texels drew
// as solid colour (stage 26 round 1: Gefe's flow marks as cyan squares,
// Gray's doors as black squares). A 2D canvas keeps alpha but premultiplies,
// losing the colour of transparent texels (the dark rim the flow marks
// avoid). A blit copies the unpremultiplied texels exactly, in every
// browser.

/** Source images WebGL can upload. */
export type TileImage = ImageBitmap | ImageData;

/**
 * Puts `img` into layer `layer` (mip level 0) of the bound-or-not
 * `TEXTURE_2D_ARRAY` `array` of edge `size`. Leaves the framebuffer
 * bindings at null (the canvas) and `TEXTURE_2D_ARRAY` bound to `array`.
 */
export function uploadLayer(gl: WebGL2RenderingContext, array: WebGLTexture, size: number, layer: number, img: TileImage): void {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, array);
  if (img.width === size && img.height === size) {
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return;
  }
  const src = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, src);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  const read = gl.createFramebuffer()!;
  const draw = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read);
  gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src, 0);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
  gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, array, 0, layer);
  gl.blitFramebuffer(0, 0, img.width, img.height, 0, 0, size, size, gl.COLOR_BUFFER_BIT, gl.LINEAR);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  gl.deleteFramebuffer(read);
  gl.deleteFramebuffer(draw);
  gl.deleteTexture(src);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, array);
}
