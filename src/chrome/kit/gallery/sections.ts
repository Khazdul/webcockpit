// The kit gallery's sections (stage 42, ADR 0127): every `.tsx` file in
// this folder but `index.tsx`, found by `import.meta.glob`.
//
// Kept in a `.ts` file: the dev server's dependency scan sends every file
// whose text holds that call (even in a comment) through a transform of
// its own that ignores the app's JSX settings and would compile a `.tsx`
// file's JSX for React ("react/jsx-dev-runtime could not be resolved", the
// pre-bundling skipped). So the call, and its name, stay out of the `.tsx`
// files of this folder.

import type { KitSection } from './kit';

export interface KitEntry extends KitSection {
  /** The file name (`box` for `box.tsx`): `?kit=box`, the tab's `data-tab`. */
  id: string;
}

/** The packages' sections first, in the stage file's order; others after, by name. */
const ORDER = ['box', 'controls', 'overlays', 'windows', 'code', 'player'];

const MODULES = import.meta.glob<{ default: KitSection }>(['./*.tsx', '!./index.tsx'], { eager: true });

/** Every section of the gallery, in tab order. */
export function kitSections(): KitEntry[] {
  const list = Object.entries(MODULES).map(([path, m]) => ({
    ...m.default,
    id: path.replace(/^\.\//, '').replace(/\.tsx$/, ''),
  }));
  const rank = (e: KitEntry): number => e.order ?? (ORDER.includes(e.id) ? ORDER.indexOf(e.id) : ORDER.length);
  return list.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
