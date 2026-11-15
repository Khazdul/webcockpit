// "A game is this tab's view" (ADR 0151 "In use", stage 62 review F7): set
// by the shell where it takes and lets go of the game lock (Enter MUME, the
// start page shown again), never by the start page's animation, so it is
// right even when the leave's fade never finishes (a hidden tab, a
// cancelled transition). The sync (src/cloud/space/runtime.ts) reads it and
// listens. Tiny and dependency free: the shell is in the entry chunk.

let playing = false;
const fns = new Set<(on: boolean) => void>();

/** A game is the view (true) or the start page is shown again (false). */
export function setPlaying(on: boolean): void {
  if (on === playing) return;
  playing = on;
  for (const fn of [...fns]) fn(on);
}

export function isPlaying(): boolean {
  return playing;
}

export function onPlaying(fn: (on: boolean) => void): () => void {
  fns.add(fn);
  return () => void fns.delete(fn);
}

/** Tests: not playing, no listeners. */
export function resetPlayingForTests(): void {
  playing = false;
  fns.clear();
}
