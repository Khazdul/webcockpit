// What a kit gallery section imports (stage 42, ADR 0127): the section's
// shape and its own keys. A file of its own, so the sections never import
// the gallery that loads them.
//
//   import type { KitSection } from './kit';
//   export default {
//     title: 'Box',
//     View: function BoxSection() { … },
//   } satisfies KitSection;

import { type FunctionComponent, createContext } from 'preact';
import { useContext, useLayoutEffect, useRef } from 'preact/hooks';
import type { KeyHandler } from '../stack';

export interface KitSection {
  /** The tab's label. */
  title: string;
  /** Sort key among the sections (default: by the package order, then the name). */
  order?: number;
  View: FunctionComponent;
}

/** The shown section's key handler (the gallery asks it first). */
export const KitKeysCtx = createContext<{ current: KeyHandler | null } | null>(null);

/** A section's own keys (latest closure wins), asked before the gallery's. */
export function useKitKeys(handler: KeyHandler): void {
  const slot = useContext(KitKeysCtx);
  const mine = useRef(handler);
  mine.current = handler;
  if (slot) slot.current = handler;
  // On unmount, unless the next section has taken the slot already.
  useLayoutEffect(
    () => () => {
      if (slot?.current === mine.current) slot.current = null;
    },
    [],
  );
}
