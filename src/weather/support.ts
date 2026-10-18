// Whether the weather effects can run here (stage 28, ADR 0091). Its own
// file so Options can ask without pulling in the hook or the engine.

/**
 * False where a CSS backdrop blur over the animated weather canvases costs
 * too much: Gecko (Firefox), where the panes' glass blur (ADR 0091
 * "Frames", addendum: glass rim and nameplate) cost 16–30 % more CPU in
 * heavy rain and a sunset whatever the radius; Chromium ~5 %. There the
 * glass is a denser tint without blur (weather.css `data-weather-flat`).
 */
export function glassBlurCheap(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return !/\bGecko\/\d/.test(ua);
}

/** True where a worker can draw on a transferred canvas (OffscreenCanvas). */
export function weatherAvailable(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype
  );
}
