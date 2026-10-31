// The settings popups' surface (stage 30 S5/S6, ADR 0107): a Preact layer
// in the chrome chunk that draws one settings popup at a time, the
// Settings popup above the menu bar's Settings icon and a pane's gear
// popup beside its pane. The shell mounts it on first use in the App's
// element, next to the bar's own popups, where the bar exists (desktop and
// tablet).
//
//   const pops = chrome.mountSettingsPopups(host, services, { focusInput, onOpen, onClose, onChange });
//   pops.toggle('settings', (el) => placePopup(el, icon, bar));
//   pops.toggle({ pane: 'comm' }, (el) => placeBeside(el, paneEl, gameEl));
//   pops.close();
//
// - One popup rule (ADR 0099): `onOpen(key, el, close)` hands the open
//   popup to the menu bar (`MenuBar.adopt`), which closes its own Panes or
//   Exit popup and, from then on, closes this one for every reason it
//   closes its own (another popup, Esc in the input, the ESC menu, the
//   cockpit hidden) by calling `close`; that close does not report back.
//   When the popup closes itself (its X, Esc in it, its toggle, `close()`)
//   it reports `onClose(key)` (`MenuBar.release`).
// - Focus (ADR 0108): it takes the focus when it opens, by a click, a `#`
//   command or a macro: the Settings popup on its selected tab, a gear
//   popup on its first control (`focusPopup`, src/menubar/popup.ts). A
//   click in the game gives the keys back and leaves it open; a click in it
//   takes them again (popups/panel.tsx). Closing from inside it, or while
//   the focus was in it, gives the game input its focus back.
// - `onChange(key)` follows what is open, whoever closed it (the shell marks
//   the pane's Gear with it).
// - The content per target: `settings` → SettingsPopup; `{ pane }` → the
//   pane's entry in `GEAR_POPUPS` (Map, Comm, Timers, Group;
//   pane-settings.tsx). A target without content does nothing.
// - The caller's `place` is called on open and on every relayout (see
//   panel.tsx); `place()` re-places from outside (the cockpit relayout; the
//   shell closes a gear popup whose pane is no longer shown).

import './popups.css';
import type { VNode } from 'preact';
import { render } from 'preact';
import type { PaneId } from '../../layout/types';
import { focusPopup, watchInput } from '../../menubar/popup';
import { type ChromeServices, ServicesCtx } from '../kit/hooks';
import { MapperSettings } from './mapper-settings';
import { type PopupPlace, PopupPanel } from './panel';
import { CommSettings, GroupSettings, TimersSettings } from './pane-settings';
import { SettingsPopup } from './settings-popup';

export type { PopupPlace } from './panel';

/** What a popup is for: the Settings popup or a pane's gear popup. */
export type SettingsPopupTarget = 'settings' | { pane: PaneId };

/** A target's key, as the menu bar holds it (`settings`, `pane:map`). */
export type SettingsPopupKey = 'settings' | `pane:${string}`;

export const popupKey = (t: SettingsPopupTarget): SettingsPopupKey => (t === 'settings' ? 'settings' : `pane:${t.pane}`);

/** A gear popup's title and content (ADR 0107). */
export interface GearPopup {
  title: string;
  body: () => VNode;
}

/**
 * The pane gear popups by pane id (the panes with a Gear,
 * layout/pane-buttons.ts `GEAR_PANES`). Mapper is the same component as
 * Settings → Mapper.
 */
export const GEAR_POPUPS: Partial<Record<string, GearPopup>> = {
  map: { title: 'Map', body: () => <MapperSettings /> },
  comm: { title: 'Comm', body: () => <CommSettings /> },
  timers: { title: 'Timers', body: () => <TimersSettings /> },
  group: { title: 'Group', body: () => <GroupSettings /> },
};

export interface SettingsPopupsOptions {
  /** Gives the game input its focus back. */
  focusInput: () => void;
  /** A popup opened: its panel and a close that does not report back (the bar adopts it). */
  onOpen?: (key: SettingsPopupKey, el: HTMLElement, close: () => void) => void;
  /** The popup closed itself (X, Esc, its toggle, `close()`). */
  onClose?: (key: SettingsPopupKey) => void;
  /** What is open changed (null: none), for any reason. */
  onChange?: (key: SettingsPopupKey | null) => void;
}

export interface SettingsPopupsHandle {
  /** Opens the popup for `target` placed by `place`, or closes it when it is the open one. */
  toggle(target: SettingsPopupTarget, place: PopupPlace): void;
  /** Opens the popup for `target` (the open one closes first); a no-op when it is open. */
  open(target: SettingsPopupTarget, place: PopupPlace): void;
  /** Closes the open popup (reported); `refocus` gives the input its focus. True when one was open. */
  close(refocus?: boolean): boolean;
  /** Places the open popup again. */
  place(): void;
  readonly openKey: SettingsPopupKey | null;
  readonly isOpen: boolean;
  /** The open popup's panel. */
  readonly el: HTMLElement | null;
  dispose(): void;
}

interface Open {
  key: SettingsPopupKey;
  target: SettingsPopupTarget;
  place: PopupPlace;
  epoch: number;
}

function Surface(p: { open: Open | null; onClose: () => void }): VNode | null {
  const o = p.open;
  if (!o) return null;
  if (o.target === 'settings') return <SettingsPopup key={o.epoch} place={o.place} onClose={p.onClose} />;
  const gear = GEAR_POPUPS[o.target.pane];
  if (!gear) return null;
  return (
    <PopupPanel key={o.epoch} cls={`wc-sp-gear wc-sp-gear-${o.target.pane}`} label={`${gear.title} settings`} title={gear.title} place={o.place} onClose={p.onClose}>
      <div class="wc-sp-body">
        <div class="wc-sp-page">{gear.body()}</div>
      </div>
    </PopupPanel>
  );
}

/** Mounts the settings popups' layer into `host` (none open). */
export function mountSettingsPopups(host: HTMLElement, services: ChromeServices, opts: SettingsPopupsOptions): SettingsPopupsHandle {
  const doc = host.ownerDocument;
  let open: Open | null = null;
  let epoch = 0;
  const panel = (): HTMLElement | null => host.querySelector<HTMLElement>(':scope > .wc-pop');

  const draw = (): void =>
    render(
      <ServicesCtx.Provider value={services}>
        <Surface open={open} onClose={() => close(true)} />
      </ServicesCtx.Provider>,
      host,
    );

  /** Closes the open popup; `report` tells `onClose`. */
  const shut = (report: boolean, refocus: boolean): boolean => {
    const o = open;
    if (!o) return false;
    const hadFocus = host.contains(doc.activeElement);
    open = null;
    draw();
    opts.onChange?.(null);
    if (report) opts.onClose?.(o.key);
    if (report && (refocus || hadFocus)) opts.focusInput();
    return true;
  };
  const close = (refocus = false): boolean => shut(true, refocus);

  const openTarget = (target: SettingsPopupTarget, place: PopupPlace): void => {
    const key = popupKey(target);
    if (open?.key === key) return;
    if (target !== 'settings' && !GEAR_POPUPS[target.pane]) return;
    if (open) close();
    open = { key, target, place, epoch: ++epoch };
    draw();
    const el = panel();
    if (!el) {
      open = null;
      return;
    }
    opts.onChange?.(key);
    // The bar holds it from now on; its close does not report back.
    opts.onOpen?.(key, el, () => void shut(false, false));
    // It takes the keys (ADR 0108): the first control (Settings: its selected tab).
    if (open?.key === key) focusPopup(el);
  };

  watchInput(doc);
  draw();
  return {
    toggle(target, place) {
      if (open?.key === popupKey(target)) close();
      else openTarget(target, place);
    },
    open: openTarget,
    close,
    place() {
      const el = panel();
      if (el && open) open.place(el);
    },
    get openKey() {
      return open?.key ?? null;
    },
    get isOpen() {
      return open !== null;
    },
    get el() {
      return open ? panel() : null;
    },
    dispose() {
      open = null;
      render(null, host);
    },
  };
}
