// Renderer seam (ADR 0020 "Modules"): the worker owns one Renderer and
// calls it on demand. `createRenderer` builds the WebGL2 tile renderer
// (webgl.ts: atlases, per-layer meshes, connections, text …);
// `ClearRenderer` only clears to the background (tests).

import type { AssetResolver } from '../assets';
import type { MapData } from '../model';
import type { Scene } from '../scene';
import type { View } from '../view';
import { BACKGROUND, type RGBA } from './palette';
import { WebGLMapRenderer } from './webgl';

/** MMapper background (owner config `#2e3436`), 0…1 RGB: the default (ADR 0085). */
export const MAP_BG: readonly [number, number, number] = [BACKGROUND[0], BACKGROUND[1], BACKGROUND[2]];

/** How a tile source is drawn, beside its files (ADR 0088). */
export interface TileStyle {
  /** The flow marks (`stream-*`) are drawn as they are, not tinted by the river colour. */
  streamsAsIs?: boolean;
}

export interface Renderer {
  /** A new map (null: none); meshes are rebuilt here, not per frame. */
  setMap(map: MapData | null): void;
  /** The drawing buffer size in device px and the CSS→device ratio. */
  resize(width: number, height: number, dpr: number): void;
  /** Player, path and group state; cheap, called before a render. */
  setScene(scene: Scene): void;
  /** Draws one frame of `view`. */
  render(view: View): void;
  dispose(): void;
  /**
   * New tile assets (a tileset change, ADR 0082) and how they are drawn
   * (ADR 0088; applied with the new tiles); absent: the renderer has no tiles.
   */
  setAssets?(assets: AssetResolver, style?: TileStyle): void;
  /** The background colour (Options → Mapper, ADR 0085); drawn from the next render. */
  setBackground?(color: RGBA): void;
  /** False while tiles or the font are still loading (absent: nothing to load). */
  readonly complete?: boolean;
}

/** P0 renderer: clears to the background (MAP_BG unless set). */
export class ClearRenderer implements Renderer {
  private w = 1;
  private h = 1;
  private bg: RGBA = BACKGROUND;
  constructor(private readonly gl: WebGL2RenderingContext) {}
  setMap(_map: MapData | null): void {}
  setScene(_scene: Scene): void {}
  resize(width: number, height: number, _dpr: number): void {
    this.w = width;
    this.h = height;
  }
  render(_view: View): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(this.bg[0], this.bg[1], this.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  setBackground(color: RGBA): void {
    this.bg = color;
  }
  dispose(): void {}
}

/**
 * The renderer the worker uses (assets are read through `assets` only).
 * `onChange` is called when something that was loading (tiles, font)
 * arrived and the map should be drawn again. `style`: how the tiles are
 * drawn (ADR 0088).
 */
export function createRenderer(gl: WebGL2RenderingContext, assets: AssetResolver, onChange?: () => void, style?: TileStyle): Renderer {
  return new WebGLMapRenderer(gl, assets, onChange, style);
}
