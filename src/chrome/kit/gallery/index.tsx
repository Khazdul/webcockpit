// The kit gallery (stage 42, ADR 0127): a dev-only look frame that shows
// every part of the lantern kit working, so the page stages start from
// proven parts. Opened by `?kit` (and `?kit=<section>`) on the dev server,
// or in a build made with `VITE_KIT=1 npm run build` (for the benches);
// a normal build holds none of it (src/chrome/frames/start-main.tsx pushes
// it through a dynamic import behind `import.meta.env.DEV || VITE_KIT`).
//
// Sections: every other `.tsx` file in this folder, found by a Vite glob
// import (sections.ts), so a package adds `gallery/<name>.tsx` without
// touching this file. A section file default-exports a
// `KitSection` (kit.ts):
//
//   import type { KitSection } from './kit';
//   export default {
//     title: 'Box',
//     View: function BoxSection() { … },
//   } satisfies KitSection;
//
// The section's id is its file name (`box`), used by `?kit=box` and the
// tab's `data-tab`. A section's own keys: `useKitKeys(handler)`, asked
// before the gallery's. Gallery keys (outside text fields): `[` and `]`
// the previous / next section, 1–9 a section, Esc back to the menu.

import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { Box, BoxBody, BoxHead, Tabs, lookFrame } from '../look';
import { type KeyHandler, useKeys, useNav } from '../stack';
import { KitKeysCtx } from './kit';
import { kitSections } from './sections';
import './gallery.css';

export type { KitSection } from './kit';
export { useKitKeys } from './kit';
export { type KitEntry, kitSections } from './sections';

const inField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null;
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable === true;
};

/** Keeps `?kit=<id>` in the address, so a reload opens the same section. */
function rememberSection(id: string): void {
  try {
    const url = new URL(location.href);
    url.searchParams.set('kit', id);
    history.replaceState(history.state, '', url);
  } catch {
    // Not in a browser (tests): nothing to remember.
  }
}

export const KitGallery = lookFrame(function KitGallery(p: { section?: string }): VNode {
  const nav = useNav();
  const sections = kitSections();
  const [id, setId] = useState(() => (sections.some((s) => s.id === p.section) ? p.section! : (sections[0]?.id ?? '')));
  const sectionKeys = useRef<KeyHandler | null>(null);
  const cur = sections.findIndex((s) => s.id === id);
  const go = (i: number): void => {
    const s = sections[(i + sections.length) % sections.length];
    if (!s) return;
    sectionKeys.current = null;
    setId(s.id);
    rememberSection(s.id);
  };
  useKeys((e, nk) => {
    if (sectionKeys.current?.(e, nk)) return true;
    if (inField(e.target) || e.ctrlKey || e.altKey || e.metaKey) return false;
    if (e.key === '[' || e.key === ']') {
      go(cur + (e.key === ']' ? 1 : -1));
      return true;
    }
    if (/^[1-9]$/.test(e.key) && Number(e.key) <= sections.length) {
      go(Number(e.key) - 1);
      return true;
    }
    return false;
  });
  const View = sections[cur]?.View;
  return (
    <Box size="large" title="Kit" class="wc-kit" winClass="wc-kit-win" onBack={() => nav.pop()}>
      <BoxHead class="wc-kit-head">
        <Tabs
          label="Kit sections"
          tabs={sections.map((s) => ({ value: s.id, label: s.title }))}
          value={id}
          onChange={(v) => go(sections.findIndex((s) => s.id === v))}
        />
      </BoxHead>
      <BoxBody class="wc-kit-body">
        <KitKeysCtx.Provider value={sectionKeys}>
          {View ? (
            <div class="wc-kit-section" data-section={id} key={id}>
              <View />
            </div>
          ) : (
            <p class="wc-lk-empty wc-kit-none">{'No sections yet: each stage 42 package adds its own (gallery/<name>.tsx).'}</p>
          )}
        </KitKeysCtx.Provider>
      </BoxBody>
    </Box>
  );
});
