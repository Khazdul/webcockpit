// Whether the weather effects can run here (stage 28, ADR 0091). Its own
// file so Options can ask without pulling in the hook or the engine.

/** True where a worker can draw on a transferred canvas (OffscreenCanvas). */
export function weatherAvailable(): boolean {
  return (
    typeof Worker !== 'undefined' &&
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype
  );
}
