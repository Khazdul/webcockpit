// Spotlights on the start page (ADR 0019, Inv §7.6). The reel itself plays
// in the player (src/player/spotlight-mode.ts, opened through
// `ChromeServices.openSpotlights`); this file holds the start page side:
// the menu action and the empty-state frames that Spotlights and Credits
// share.
//
// - No data (no event of any kind in any run): title, a centred body,
//   `Any key to return`.
// - Filtered (events exist, the Spotlights settings let none through; ADR
//   0110): `No spotlights match your settings.` and a `Settings…` row that
//   opens the Spotlights settings popup (the reel's gear opens the same),
//   drawn inside the page. Esc closes the popup first, then the page. When
//   the popup closes after a change, the owner tries again
//   (`onSettingsClosed`): Spotlights opens the reel when something passes
//   now, Credits builds the chronicle again.

import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { useGrid, useServices } from '../kit/hooks';
import { wrapText } from '../kit/nav';
import { type Nav, useKeys, useNav } from '../kit/stack';
import { Blank, Centered, type MenuItem, MenuRows, Page, menuKey, useBodyRows, useMenuCursor } from '../kit/widgets';
import type { ChromeServices } from '../kit/hooks';
import { placeNear } from '../../menubar/popup';
import { SpotlightsPopup } from '../popups/spotlights-settings';
import '../popups/popups.css';

export type EmptyKind = 'no_data' | 'filtered';

/** Empty-state bodies (our own wording, Inv §7.6; the filtered ones ADR 0110). */
export const SPOTLIGHTS_EMPTY: Readonly<Record<EmptyKind, string>> = {
  no_data:
    'No spotlights yet. Play a session, and your highlights (kills, deaths, level-ups and achievements) will be kept here, ready to replay.',
  filtered: 'No spotlights match your settings.',
};

export const CREDITS_EMPTY: Readonly<Record<EmptyKind, string>> = {
  no_data:
    'No chronicle yet. Your tale is written as you play: kills, deaths, level-ups and achievements each earn a line. Come back once you have made some history.',
  filtered: 'No chronicle entries match your settings.',
};

/** Keys that are not "a key" for `Any key to return` (bare modifiers). */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** Title, a body centred on the page, and `Any key to return` (any key or ESC pops). */
export function EmptyStateFrame(p: { title: string; body: string }): VNode {
  const nav = useNav();
  const { cols } = useGrid();
  const rows = useBodyRows();
  useKeys((e) => {
    if (MODIFIERS.has(e.key)) return false;
    nav.pop();
    return true;
  });
  const lines = wrapText(p.body, Math.max(20, Math.min(cols - 8, 64)));
  const top = Math.max(0, Math.floor((rows - lines.length) / 2) - 1);
  return (
    <Page title={p.title} footer={['Any key to return']}>
      <div class="wc-empty-state" onClick={() => nav.pop()}>
        <Blank n={top} />
        {lines.map((l) => (
          <Centered text={l} class="wc-c-body" />
        ))}
      </div>
    </Page>
  );
}

/**
 * The "filtered" page (ADR 0110): the body, then a `Settings…` row (Enter,
 * Space or a click) that opens the Spotlights settings popup next to it.
 * `onSettingsClosed(changed)` runs when the popup closes; `changed` when the
 * settings differ from when it opened.
 */
export function FilteredFrame(p: { title: string; body: string; onSettingsClosed: (changed: boolean) => void }): VNode {
  const nav = useNav();
  const { settings } = useServices();
  const { cols } = useGrid();
  const rows = useBodyRows();
  const [open, setOpen] = useState(false);
  const before = useRef('');
  const ref = useRef<HTMLDivElement>(null);
  const snap = (): string => JSON.stringify(settings.get().spotlights);
  const close = (): void => {
    setOpen(false);
    ref.current?.closest<HTMLElement>('.wc-stack')?.focus({ preventScroll: true });
    p.onSettingsClosed(snap() !== before.current);
  };
  const toggle = (): void => {
    if (open) return close();
    before.current = snap();
    setOpen(true);
  };
  const items: MenuItem[] = [{ key: 'settings', label: 'Settings…', activate: toggle }];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => {
    if (nk === 'back') {
      if (open) close();
      else nav.pop();
      return true;
    }
    return menuKey(items, cursor, setCursor, nk);
  });
  const lines = wrapText(p.body, Math.max(20, Math.min(cols - 8, 64)));
  const top = Math.max(0, Math.floor((rows - lines.length - 2) / 2) - 1);
  const place = (el: HTMLElement): void => {
    const a = ref.current?.querySelector('.wc-mrow[data-key="settings"] .wc-label');
    if (a) placeNear(el, a);
  };
  return (
    <Page title={p.title} footer={['Enter Settings', 'ESC Back']}>
      <div class="wc-empty-state wc-empty-filtered" ref={ref}>
        <Blank n={top} />
        {lines.map((l) => (
          <Centered text={l} class="wc-c-body" />
        ))}
        <Blank />
        <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      </div>
      {open && <SpotlightsPopup place={place} onClose={close} focusOnOpen />}
    </Page>
  );
}

/**
 * Start page → Spotlights: loads the reel and plays it, or pushes the empty
 * state. `busy` guards against a second activation while it loads.
 */
let busy = false;
export async function startSpotlights(nav: Nav, services: ChromeServices): Promise<void> {
  if (busy) return;
  if (!services.openSpotlights) return nav.flash('Spotlights are not available here.', 'fail');
  busy = true;
  try {
    nav.flash('Loading spotlights…');
    const empty = await services.openSpotlights();
    if (empty) nav.push(spotlightsEmptyFrame(nav, services, empty));
  } catch (err) {
    console.error('WebCockpit: Spotlights could not open', err);
    nav.flash('Spotlights could not be loaded.', 'fail');
  } finally {
    busy = false;
  }
}

function spotlightsEmptyFrame(nav: Nav, services: ChromeServices, kind: EmptyKind): VNode {
  if (kind === 'no_data') return <EmptyStateFrame title="Spotlights" body={SPOTLIGHTS_EMPTY.no_data} />;
  return <FilteredFrame title="Spotlights" body={SPOTLIGHTS_EMPTY.filtered} onSettingsClosed={(changed) => changed && void retrySpotlights(nav, services)} />;
}

/**
 * The filtered page's settings changed: open the reel when something
 * passes now (the page goes, so ESC from the reel returns to the menu);
 * otherwise the page stays (or becomes the no-data page).
 */
async function retrySpotlights(nav: Nav, services: ChromeServices): Promise<void> {
  if (busy || !services.openSpotlights) return;
  busy = true;
  try {
    const empty = await services.openSpotlights();
    if (empty === null) nav.pop();
    else if (empty === 'no_data') nav.replace(spotlightsEmptyFrame(nav, services, empty));
  } catch (err) {
    console.error('WebCockpit: Spotlights could not open', err);
    nav.flash('Spotlights could not be loaded.', 'fail');
  } finally {
    busy = false;
  }
}
