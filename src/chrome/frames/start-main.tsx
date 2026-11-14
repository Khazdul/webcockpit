// Start page main frame (Inv §3.2; stage 41, ADR 0125): the menu panel
// in the lantern box under the wordmark, and the Tolkien quote below it.
// The wordmark, the almanac and the client notices belong to the start
// surface (src/chrome/start-surface.tsx), which also draws the sky.
//
// Items: Enter MUME (primary, set apart by a rule), Profile (with the
// selected profile's name, small, dim, italic), Scripts, History,
// Spotlights, Credits, About; each with a small line icon. Keys: ↑↓ (and
// Tab), Home / End, Enter / Space, and the shortcut letter marked in each
// label (E P S H L C A). The mouse selects on hover and activates on a
// click; a tap activates. No key-hint row (the owner's rule).
//
// Account (stage 60, spec §7.2, the owner's entry A): a row between
// Spotlights and Credits, key U, built as the Profile row: `ACCOUNT (log
// in)` when nobody is logged in on this device, `ACCOUNT (<name>)` when
// somebody is. It exists only while accounts are on for this page
// (`accountState().enabled`: the server's flag `accounts`, asked on idle
// time); otherwise the menu is exactly what it was and U does nothing.
// The flag arrives after the menu is drawn, so the row comes in late
// (`useAccountRow`): never while a pointer rests on what would move under
// it (the rows below, the panel's foot) and never while a finger is down;
// the cursor is kept by key, so it stays where it was. The pages are a
// lazy chunk (./account), loaded when the row is activated.
//
// Scripts needs the script library, which the shell always has; only
// tests mount the page without it, and then the row is not there. Options
// left the start page in stage 32 (its settings are changed in the game).

import { Fragment, type VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { type AccountState, accountState, onAccountState, watchAccountState } from '../../cloud/account/state';
import { whenIdle } from '../../cloud/config';
import { useServices, useSettings } from '../kit/hooks';
import { Box, Icon, type IconName, KeyLabel, LookFlash, letterOf, lookFrame, useScenery } from '../kit/look';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import { type MenuItem, menuKey, useMenuCursor } from '../kit/widgets';
import type { Quote } from '../quotes';
import { useBrightBack, useDarkInk } from '../start-surface';
import { AboutFrame, PrivacyFrame, atPrivacyPath } from './about';
import { CreditsFrame } from './credits';
import { HistoryFrame } from './history';
import { ProfileFrame } from './profiles';
import { ScriptsFrame } from './scripts';
import { startSpotlights } from './spotlights';

export const LATER = 'Coming in a later stage.';

export interface StartMainProps {
  onEnter: () => void;
  quote: Quote;
}

interface StartItem extends MenuItem {
  label: string;
  /** The shortcut letter, marked in the label. */
  letter: string;
  icon: IconName;
  /** After the label, small and dim (Profile: the selected profile's name). */
  note?: string;
}

export const StartMain = lookFrame(function StartMain(p: StartMainProps): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const services = useServices();
  const { profile } = useSettings();
  useScenery('main');
  const menu = useRef<HTMLUListElement>(null);
  const account = useAccountRow(menu);
  const openAccount = useAccountPages(nav);
  const items: StartItem[] = [
    { key: 'enter', label: 'Enter MUME', letter: 'e', icon: 'door', activate: p.onEnter },
    {
      key: 'profile',
      label: 'Profile',
      letter: 'p',
      icon: 'person',
      note: profile,
      activate: () => nav.push(<ProfileFrame />),
    },
    ...(services.scripts
      ? [
          {
            key: 'scripts',
            label: 'Scripts',
            letter: 's',
            icon: 'scroll' as const,
            activate: () => nav.push(<ScriptsFrame />),
          },
        ]
      : []),
    { key: 'history', label: 'History', letter: 'h', icon: 'hourglass', activate: () => nav.push(<HistoryFrame />) },
    {
      key: 'spotlights',
      label: 'Spotlights',
      letter: 'l',
      icon: 'star',
      activate: () => void startSpotlights(nav, services),
    },
    ...(account
      ? [
          {
            key: 'account',
            label: 'Account',
            letter: 'u',
            icon: 'key' as const,
            note: account.name ?? 'log in',
            activate: openAccount,
          },
        ]
      : []),
    { key: 'credits', label: 'Credits', letter: 'c', icon: 'quill', activate: () => nav.push(<CreditsFrame />) },
    { key: 'about', label: 'About', letter: 'a', icon: 'info', activate: () => nav.push(<AboutFrame />) },
  ];
  const [cursor, setCursor] = useMenuCursor(items, 'enter');
  const kit = useKitGallery(nav);
  usePrivacyAddress(nav);
  useKeys((e, nk) => {
    if (nk === 'back') return true;
    if (kit(e)) return true;
    const l = letterOf(e);
    const i = l ? items.findIndex((it) => it.letter === l) : -1;
    if (i >= 0) {
      setCursor(i);
      items[i]!.activate!();
      return true;
    }
    return menuKey(items, cursor, setCursor, nk);
  });

  const ink = useDarkInk('quote');
  const bright = useBrightBack('quote');
  return (
    <div class="wc-start-main wc-lk-page">
      <div class="wc-sm-stage">
        <Box label="Start menu" class="wc-sm-panel" winClass="wc-sm-win">
          <ul class="wc-sm" role="menu" aria-label="Start menu" ref={menu}>
            {items.map((it, i) => (
              <Fragment key={it.key}>
                <MenuRow item={it} selected={i === cursor} active={isTop} onSelect={() => setCursor(i)} />
                {i === 0 && <li class="wc-sm-sep" role="separator" aria-hidden="true" />}
              </Fragment>
            ))}
          </ul>
          <LookFlash class="wc-sm-flash" />
        </Box>
        <blockquote class={'wc-sm-quote wc-lk-fades' + (ink ? ' is-ink' : bright ? ' is-lit' : '')}>
          <p>{p.quote.text}</p>
          <span class="wc-sm-orn" aria-hidden="true" />
          <cite>{p.quote.by}</cite>
        </blockquote>
      </div>
    </div>
  );
});

// ------------------------------------------------------------ the Account row

/** The rows above the Account row: they do not move when it comes in. */
const ABOVE_ACCOUNT = new Set(['enter', 'profile', 'scripts', 'history', 'spotlights']);
/** A finger's click follows its lift by up to about this (ms): the row waits it out. */
const AFTER_TOUCH_MS = 350;

/**
 * The Account row's state, or null while the row is not shown: accounts
 * are off or not known yet, or the row waits for the pointer (below).
 *
 * The flag is asked on idle time (`watchAccountState`: the shared
 * `/api/config`, and no request at all where the page may not call the
 * API). When it turns on, the row comes in at once unless that would move
 * something under a pointer: a mouse resting on the rows below it or on
 * the panel's foot (a click there would land on another row than the one
 * it was aimed at), or a finger that is down (its click comes after the
 * lift). Then it waits until the pointer has left that part, or the
 * finger's click is over.
 */
function useAccountRow(menu: { current: HTMLUListElement | null }): AccountState | null {
  const [state, setState] = useState<AccountState>(accountState);
  const [shown, setShown] = useState(() => accountState().enabled === true);
  useEffect(() => {
    const off = onAccountState(setState);
    setState(accountState());
    whenIdle(() => void watchAccountState());
    return off;
  }, []);
  const on = state.enabled === true;
  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    if (shown) return;
    const ul = menu.current;
    const doc = ul?.ownerDocument;
    const win = doc?.defaultView;
    if (!ul || !doc || !win) {
      setShown(true);
      return;
    }
    let down = false;
    let timer = 0;
    const hovers = (): boolean => win.matchMedia?.('(hover: hover)').matches !== false;
    /** `under`: what a pointer event says the pointer is on (`:hover` may still be the element it just left). */
    const safe = (under?: Element | null): boolean => {
      if (down) return false;
      // A touch screen keeps `:hover` on what was last tapped: only a finger that is down counts there.
      if (!hovers()) return true;
      const panel = ul.closest('.wc-sm-panel') ?? ul;
      if (under === undefined ? !panel.matches(':hover') : !under || !panel.contains(under)) return true;
      const row = under ? under.closest<HTMLElement>('.wc-sm-item') : ul.querySelector<HTMLElement>('.wc-sm-item:hover');
      return !!row && ABOVE_ACCOUNT.has(row.dataset.key ?? '');
    };
    const tryIn = (): void => {
      if (safe()) setShown(true);
    };
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch' && safe(e.target as Element | null)) setShown(true);
    };
    const onLeave = (): void => {
      if (safe(null)) setShown(true);
    };
    const onDown = (): void => {
      down = true;
      win.clearTimeout(timer);
    };
    const onUp = (e: PointerEvent): void => {
      down = false;
      win.clearTimeout(timer);
      timer = win.setTimeout(tryIn, e.pointerType === 'touch' ? AFTER_TOUCH_MS : 0);
    };
    doc.addEventListener('pointerdown', onDown, true);
    doc.addEventListener('pointerup', onUp, true);
    doc.addEventListener('pointercancel', onUp, true);
    doc.addEventListener('pointermove', onMove, true);
    doc.documentElement.addEventListener('pointerleave', onLeave);
    tryIn();
    return () => {
      win.clearTimeout(timer);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      doc.removeEventListener('pointermove', onMove, true);
      doc.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [on, shown]);
  return on && shown ? state : null;
}

/**
 * Opens the account pages: the lazy chunk (./account), then the Account
 * page when somebody is logged in here, else Log in. One load at a time;
 * a page opened meanwhile (another key) keeps the menu as it is.
 */
function useAccountPages(nav: ReturnType<typeof useNav>): () => void {
  const loading = useRef(false);
  return () => {
    if (loading.current) return;
    loading.current = true;
    const depth = nav.depth();
    void import('./account')
      .then((m) => {
        if (nav.depth() === depth) nav.push(m.accountEntry(accountState().name !== null));
      })
      .catch(() => nav.flash('The account pages could not be loaded. Check the connection and try again.', 'fail'))
      .finally(() => {
        loading.current = false;
      });
  };
}

// The privacy page's address (stage 59): a page opened at `<base>privacy`
// (privacy.html, a copy of the app's page) opens the privacy leaf over the
// menu after the first render, once per page load; Back leaves it for the
// menu (and puts the address back to the base, about.tsx).
let privacyOpened = false;
function usePrivacyAddress(nav: ReturnType<typeof useNav>): void {
  useEffect(() => {
    if (privacyOpened || !atPrivacyPath()) return;
    privacyOpened = true;
    nav.push(<PrivacyFrame />);
  }, []);
}

// Dev only (stage 42, ADR 0127): `?kit` (or `?kit=<section>`) opens the kit
// gallery over the menu after the first render, once per page load; with
// `?kit` in the address, `k` on the menu opens it again (the benches and
// the e2e specs measure the menu → large box morph with it). A normal
// build holds none of it: the condition folds to false and the dynamic
// import goes with it; `VITE_KIT=1 npm run build` keeps it.
let kitOpened = false;
function useKitGallery(nav: ReturnType<typeof useNav>): (e: KeyboardEvent) => boolean {
  const open = (section: string): void => {
    void import('../kit/gallery').then((m) => nav.push(<m.KitGallery section={section || undefined} />));
  };
  useEffect(() => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_KIT)) return;
    const section = new URLSearchParams(location.search).get('kit');
    if (section === null || kitOpened) return;
    kitOpened = true;
    open(section);
  }, []);
  return (e) => {
    if (!(import.meta.env.DEV || import.meta.env.VITE_KIT)) return false;
    if (e.key !== 'k' || e.ctrlKey || e.altKey || e.metaKey) return false;
    const section = new URLSearchParams(location.search).get('kit');
    if (section === null) return false;
    open(section);
    return true;
  };
}

function MenuRow(p: { item: StartItem; selected: boolean; active: boolean; onSelect: () => void }): VNode {
  const ref = useRef<HTMLLIElement>(null);
  const it = p.item;
  useLayoutEffect(() => {
    const el = ref.current;
    if (p.selected && p.active && el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [p.selected, p.active]);
  return (
    <li
      ref={ref}
      class={'wc-sm-item' + (it.key === 'enter' ? ' is-prime' : '') + (p.selected ? ' is-sel' : '')}
      role="menuitem"
      data-key={it.key}
      aria-current={p.selected ? 'true' : undefined}
      aria-keyshortcuts={it.letter.toUpperCase()}
      onMouseDown={(e) => e.preventDefault()}
      onPointerMove={(e) => {
        // On a move (not pointerenter, which fires when the page reappears under a resting pointer).
        if (e.pointerType !== 'touch' && !p.selected) p.onSelect();
      }}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect();
        it.activate?.();
      }}
    >
      <Icon name={it.icon} class="wc-sm-ic" />
      <KeyLabel class="wc-sm-label" text={it.label} letter={it.letter} />
      {it.note && <span class="wc-sm-note">({it.note})</span>}
    </li>
  );
}
