// A window's title and note from its top frame (stage 42, ADR 0127).
// Package 42d owns this file: it carries the call from the top frame of a
// window's stack to `WindowFrame` (src/chrome/kit/window.tsx), reverting
// when the frame pops (as `useScenery` does on the start surface).
//
// Defaults (the window's own): Profile title "Profile", note the profile
// name; Scripts title "Scripts".
//
// 42-0 stub: a no-op everywhere (it is a no-op outside a window for good).

export interface WindowChrome {
  title?: string;
  note?: string;
}

/** Sets the window's title and note while this frame is the top of the window's stack; no-op outside a window. */
export function useWindowChrome(_c: WindowChrome): void {}
