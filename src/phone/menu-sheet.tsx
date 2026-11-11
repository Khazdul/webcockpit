// The phone's menu (ADR 0136 §10): a bottom sheet over the game, and the
// settings page it leads to. It replaces the ESC menu for the live game on
// a phone: the menu key, Esc, `#menu`, a dropped link and the resume watch
// open the sheet (the shell routes them here, src/app/shell.ts); the run
// log player keeps the ESC menu.
//
//   status line     character · profile · Link, and Recording while a run is captured
//   Reconnect       first; lit when the link is down
//   Profile         what `#profile` opens on a phone: the profile editor
//   Scripts         the Scripts page
//   Settings        the phone's settings page (settings-page.tsx)
//   text size       A− / A+
//   Black / Paper   the two themes
//   close, Exit     a key that folds the sheet down, and Exit session:
//                   the confirmation with the run's rating (exit-sheet.tsx)
//
// Profile and Scripts are the existing pages (the shell opens them straight
// at their frame, as `#profile` … did before; leaving one returns to the
// game). The sheet closes by its close key, a tap outside it, Esc or the
// back gesture. It is not dragged, so it has no grip (stage 52).
//
// `PhoneMenu` owns one host element over the cockpit and renders into it
// only while the menu is open: closed, nothing is mounted and nothing is
// subscribed. Open, it follows the settings and the status (the link time
// changes every few seconds). Nothing here takes the DOM focus, so a tap
// never moves it to the command field and never raises the keyboard.
//
// Keys: while the menu is open no key reaches the command line behind the
// scrim (nothing typed, nothing sent, no macro run, Alt or Ctrl ones
// included). Esc goes one step back. The browser keeps its own keys: only
// plain typing keys lose their default; function keys and shortcuts with
// Ctrl, Alt or Meta do what the browser does with them. Opening the menu
// also takes the focus out of the command field, so the on-screen keyboard
// closes and cannot type behind the scrim either.

import { type VNode, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { AppStatusState, AppStatusView } from '../app/status';
import type { LiveRuns } from '../runs/live';
import { ExitSheet } from './exit-sheet';
import type { SettingsStore } from '../settings';
import type { Settings } from '../settings/types';
import { phoneKit } from './kit';
import { ICON_CHEVRON, PhIcon, SettingsPage, Stepper } from './settings-page';
import { PHONE_THEMES, canStep, stepSize, themeOf } from './text-settings';

/** The existing pages the sheet leads to (the shell opens them at their frame). */
export type MenuFrame = 'profile' | 'scripts';

export interface PhoneMenuDeps {
  /** The element the menu's host is appended to (the cockpit). */
  parent: HTMLElement;
  settings: SettingsStore;
  status: AppStatusView;
  /** How many scripts are switched on (the Scripts row says so). */
  scriptsOn(): number;
  /** `#reconnect`. */
  reconnect(): void;
  /** Opens the profile editor or the Scripts page. */
  openFrame(frame: MenuFrame): void;
  /** Exit session, confirmed: the shell closes the connection and shows the start page. */
  exit(): void;
  /** The live run, for the confirmation's rating; absent: no rating row. */
  runs?: Pick<LiveRuns, 'anchor' | 'chain' | 'saveChain'> | undefined;
  /** The menu closed back to the game. */
  onClose?(): void;
  /** The menu opened (the sheet or the settings page, from closed). */
  onOpen?(): void;
  /**
   * Whether the game still fits the screen at a text size: A+ is dimmed
   * where the next size would bring the "Window too small" notice.
   * Absent: every size fits.
   */
  fits?(size: number): boolean;
}

type View =
  | { at: 'closed' }
  | { at: 'sheet' }
  | { at: 'settings'; from: 'sheet' | 'game'; focus?: string }
  | { at: 'exit'; from: 'sheet' | 'game' };

/** Presses never move the DOM focus. */
const keepFocus = (e: MouseEvent): void => e.preventDefault();

const ICONS = {
  reconnect: 'M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4',
  profile: 'M4 20c1-4 4-6 8-6s7 2 8 6',
  scripts: 'M9 4C7 4 6 5 6 7v2c0 1.5-1 3-2.5 3C5 12 6 13.5 6 15v2c0 2 1 3 3 3M15 4c2 0 3 1 3 3v2c0 1.5 1 3 2.5 3-1.5 0-2.5 1.5-2.5 3v2c0 2-1 3-3 3',
  settings: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1',
  exit: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
  down: 'M6 9l6 6 6-6',
} as const;

/** Re-renders on every change of a store. */
function useStore<T>(get: () => T, subscribe: (fn: () => void) => () => void): T {
  const [v, set] = useState(get);
  useEffect(() => {
    set(get());
    return subscribe(() => set(get()));
  }, []);
  return v;
}

/** The status line's text: `Rasta · default · Link: 38ms` (the character once MUME has named it). */
export function statusText(st: Readonly<AppStatusState>, profile: string): string {
  return [st.character, profile, phoneKit().formatLink(st.linkMs, st.linkSuspect)].filter(Boolean).join(' · ');
}

interface SheetProps {
  s: Readonly<Settings>;
  st: Readonly<AppStatusState>;
  deps: PhoneMenuDeps;
  close(): void;
  openSettings(): void;
  openExit(): void;
}

function MenuSheet(p: SheetProps): VNode {
  const { s, st, deps } = p;
  const a = s.appearance;
  const kit = phoneKit();
  const lim = { min: kit.fontSizeMin, max: kit.fontSizeMax };
  const down = !kit.isLive(st);
  const theme = themeOf(a.bg);
  const row = (key: string, icon: VNode, label: string, value: string | null, chevron: boolean, act: () => void, cls = ''): VNode => (
    <button
      type="button"
      class={`wc-ph-row${cls}`}
      data-row={key}
      tabIndex={-1}
      onMouseDown={keepFocus}
      onClick={(e) => {
        e.stopPropagation();
        act();
      }}
    >
      {icon}
      <span class="wc-ph-row-t">{label}</span>
      {value !== null && <span class="wc-ph-row-v">{value}</span>}
      {chevron && <PhIcon d={ICON_CHEVRON} small class="wc-ph-chev" />}
    </button>
  );
  const frame = (f: MenuFrame) => () => deps.openFrame(f);
  const on = deps.scriptsOn();
  return (
    <>
      <button type="button" class="wc-ph-scrim" tabIndex={-1} aria-label="Close menu" onMouseDown={keepFocus} onClick={p.close} />
      <div class="wc-ph-sheet" role="dialog" aria-label="Menu" data-link={down ? 'down' : 'up'}>
        <div class="wc-ph-sheet-top" />
        <div class="wc-ph-sheet-body">
          <span class="wc-ph-hood">Menu</span>
          <div class="wc-ph-status">
            <span class="wc-ph-status-t">{statusText(st, s.profile)}</span>
            {st.capture === kit.captureRecording && (
              <span class="wc-ph-rec">
                <i />
                Recording
              </span>
            )}
          </div>
          <div class="wc-ph-card wc-ph-rows">
            {row('reconnect', <PhIcon d={ICONS.reconnect} />, 'Reconnect', down ? 'Not connected' : null, false, deps.reconnect, down ? ' is-lit' : '')}
            {row(
              'profile',
              <PhIcon d={ICONS.profile}>
                <circle cx="12" cy="8" r="4" />
              </PhIcon>,
              'Profile',
              s.profile,
              true,
              frame('profile'),
            )}
            {row('scripts', <PhIcon d={ICONS.scripts} />, 'Scripts', on > 0 ? `${on} on` : null, true, frame('scripts'))}
            {row(
              'settings',
              <PhIcon d={ICONS.settings}>
                <circle cx="15" cy="7" r="2" />
                <circle cx="9" cy="12" r="2" />
                <circle cx="17" cy="17" r="2" />
              </PhIcon>,
              'Settings',
              null,
              true,
              p.openSettings,
            )}
          </div>
          <div class="wc-ph-quick">
            <div class="wc-ph-quick-size">
              <Stepper
                label="Text size"
                value={a.size}
                less={{ text: 'A−', label: 'Smaller text', on: canStep(a.size, -1, lim) }}
                more={{ text: 'A+', label: 'Larger text', on: canStep(a.size, 1, lim) && (deps.fits?.(stepSize(a.size, 1, lim)) ?? true) }}
                onStep={(d) => deps.settings.update({ appearance: { size: stepSize(a.size, d, lim) } })}
              />
              <span class="wc-ph-tiny">Text size</span>
            </div>
            <div class="wc-ph-themes" role="group" aria-label="Theme">
              {PHONE_THEMES.map((t) => (
                <div key={t.value}>
                  <button
                    type="button"
                    class={`wc-ph-swatch is-${t.value}${theme === t.value ? ' is-on' : ''}`}
                    data-theme={t.value}
                    tabIndex={-1}
                    aria-label={`${t.label} theme`}
                    aria-pressed={theme === t.value ? 'true' : 'false'}
                    onMouseDown={keepFocus}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (theme !== t.value) deps.settings.update({ appearance: kit.backgroundPatch(a.bg, t.bg) });
                    }}
                  />
                  <span class={`wc-ph-tiny${theme === t.value ? ' is-on' : ''}`}>{t.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div class="wc-ph-foot">
            <button
              type="button"
              class="wc-ph-fold"
              data-row="close"
              tabIndex={-1}
              aria-label="Close menu"
              onMouseDown={keepFocus}
              onClick={(e) => {
                e.stopPropagation();
                p.close();
              }}
            >
              <PhIcon d={ICONS.down} />
            </button>
            <button
              type="button"
              class="wc-ph-exit"
              data-row="exit"
              tabIndex={-1}
              onMouseDown={keepFocus}
              onClick={(e) => {
                e.stopPropagation();
                p.openExit();
              }}
            >
              <PhIcon d={ICONS.exit} small />
              Exit session
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Surface(p: {
  view: View;
  deps: PhoneMenuDeps;
  menu: PhoneMenu;
  backRef: { current: (() => boolean) | null };
  keysRef: { current: ((e: KeyboardEvent) => void) | null };
}): VNode | null {
  const { deps, view } = p;
  const s = useStore(
    () => deps.settings.get(),
    (fn) => deps.settings.subscribe(fn),
  );
  const st = useStore(
    () => deps.status.get(),
    (fn) => deps.status.subscribe(fn),
  );
  if (view.at === 'closed') return null;
  return (
    // `wc-look`: the kit's tokens for its controls; Paper on a light game background.
    <div class="wc-look wc-ph-menu-surface" data-light={phoneKit().isLight(s.appearance.bg) ? '' : undefined} data-view={view.at}>
      {view.at === 'sheet' ? (
        <MenuSheet s={s} st={st} deps={deps} close={() => p.menu.close()} openSettings={() => p.menu.openSettings('sheet')} openExit={() => p.menu.openExit('sheet')} />
      ) : view.at === 'exit' ? (
        <ExitSheet runs={deps.runs} exit={() => deps.exit()} cancel={() => p.menu.back()} keysRef={p.keysRef} />
      ) : (
        <SettingsPage s={s} settings={deps.settings} fits={deps.fits} focus={view.focus} onBack={() => p.menu.back()} backRef={p.backRef} />
      )}
    </div>
  );
}

/** The phone's menu: the sheet and the settings page, in one host over the cockpit. */
export class PhoneMenu {
  readonly host: HTMLDivElement;
  private readonly deps: PhoneMenuDeps;
  private view: View = { at: 'closed' };
  /** The open page's own Back (a pick list), asked before the menu's. */
  private readonly backRef: { current: (() => boolean) | null } = { current: null };
  /** The open view's own keys (the Exit confirmation: Y, the rating), given every plain keydown the menu swallows. */
  private readonly keysRef: { current: ((e: KeyboardEvent) => void) | null } = { current: null };

  constructor(deps: PhoneMenuDeps) {
    this.deps = deps;
    this.host = deps.parent.ownerDocument.createElement('div');
    this.host.className = 'wc-ph-menu-host';
    this.host.hidden = true;
    deps.parent.append(this.host);
  }

  get isOpen(): boolean {
    return this.view.at !== 'closed';
  }

  /** What is shown: `closed`, `sheet`, `settings` or `exit`. */
  get showing(): View['at'] {
    return this.view.at;
  }

  /** Opens the sheet (from anywhere: the settings page goes back to it). */
  open(): void {
    this.show({ at: 'sheet' });
  }

  /**
   * Opens the settings page; Back returns to the sheet (`from` it) or to
   * the game. `focus`: the group to bring into view (`#panes`: `panes`).
   */
  openSettings(from: 'sheet' | 'game' = 'game', focus?: string): void {
    this.show({ at: 'settings', from, ...(focus ? { focus } : {}) });
  }

  /**
   * Opens the Exit session confirmation (the sheet's Exit session, `#exit`);
   * Cancel returns to the sheet (`from` it) or to the game.
   */
  openExit(from: 'sheet' | 'game' = 'game'): void {
    this.show({ at: 'exit', from });
  }

  /**
   * One step back (Esc, the back gesture, the page's Back, Cancel): a pick
   * list to its page, the settings page or the Exit confirmation to the
   * sheet it came from, else closed. False when nothing was open.
   */
  back(): boolean {
    const v = this.view;
    if (v.at === 'closed') return false;
    if (v.at === 'settings' || v.at === 'exit') {
      if (v.at === 'settings' && this.backRef.current?.()) return true;
      if (v.from === 'sheet') {
        this.show({ at: 'sheet' });
        return true;
      }
    }
    this.close();
    return true;
  }

  /** Closes the menu, back to the game. `quiet`: another page takes over, the game is not back yet. */
  close(quiet = false): void {
    if (this.view.at === 'closed') return;
    this.show({ at: 'closed' });
    if (!quiet) this.deps.onClose?.();
  }

  /**
   * The menu's keys while it is open, taken on the window before the
   * command line's own handlers (they listen on the document).
   */
  private readonly onKey = (e: KeyboardEvent): void => {
    // Never on to the command line: no typing, no send, no macro.
    e.stopImmediatePropagation();
    const plain = !(e.ctrlKey || e.altKey || e.metaKey);
    // The browser's own keys (F5, F12, Ctrl+R …) keep working.
    if (plain && !/^F\d{1,2}$/.test(e.key)) e.preventDefault();
    if (plain && e.type === 'keydown' && e.key === 'Escape' && !e.repeat) this.back();
    else if (plain && e.type === 'keydown') this.keysRef.current?.(e);
  };

  private show(view: View): void {
    const was = this.view.at !== 'closed';
    this.view = view;
    this.backRef.current = null;
    this.keysRef.current = null;
    const open = view.at !== 'closed';
    const win = this.host.ownerDocument.defaultView;
    if (open !== was && win) {
      for (const type of ['keydown', 'keypress', 'keyup'] as const) {
        if (open) win.addEventListener(type, this.onKey, true);
        else win.removeEventListener(type, this.onKey, true);
      }
    }
    if (open && !was) {
      this.deps.onOpen?.();
      // A focused text field (the command line) lets go: the on-screen keyboard closes.
      const active = this.host.ownerDocument.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) active.blur();
    }
    this.host.hidden = !open;
    // Closed: unmounted, so nothing follows the settings or the status.
    render(open ? <Surface view={view} deps={this.deps} menu={this} backRef={this.backRef} keysRef={this.keysRef} /> : null, this.host);
  }

  dispose(): void {
    this.show({ at: 'closed' });
    this.host.remove();
  }
}
