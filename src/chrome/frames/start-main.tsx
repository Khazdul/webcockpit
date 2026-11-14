// Start page main frame (Inv §3.2; stage 41, ADR 0125): the menu panel
// in the lantern box under the wordmark, and the Tolkien quote below it.
// The wordmark, the almanac and the client notices belong to the start
// surface (src/chrome/start-surface.tsx), which also draws the sky.
//
// The menu (stage 67, ADR 0149 and its addendum; the rows and their order:
// start-menu-model.ts): three zones parted by the rule with the diamond,
// *play* (Enter MUME), *mine* (the owner row, Profile with the selected
// profile's name, Scripts, History) and *everybody's* (Community), and
// About as the panel's last, quiet row. Each row has a small line icon
// (About none). Keys: ↑↓ (and Tab), Home / End, Enter / Space, and the
// shortcut letter marked in each label (E P S H C A); the owner row's U
// works unseen (its texts hold no u). L and the old C (Spotlights,
// Credits) are gone: Spotlights and the Diary are tabs of History. The
// mouse selects on hover and activates on a click; a tap activates. No
// key-hint row (the owner's rule).
//
// The owner row (stage 67; it replaces stage 60's Account row, key U): a
// heading line over "mine" that is also a button. "Guest · log in" for a
// guest (opens Log in), the account's name logged in (opens the Account
// page). What it says is `ownerRow` of the model, a pure function of the
// account state; until stage 61 nothing syncs, so it says the name alone.
// It exists only while accounts are on for this page
// (`accountState().enabled`: the server's flag `accounts`, asked on idle
// time); otherwise U does nothing. The flag arrives after the menu is
// drawn, so the row comes in late (`useAccountRow`): never while a mouse
// rests on what would move under it (everything under Enter MUME) and
// never while a finger is down; a row held back that way comes in when
// the mouse leaves that part, on the menu's next key (U then opens it),
// or while a page hides the menu. The cursor is kept by key, so it stays
// where it was. The pages are a lazy chunk (./account), loaded when the
// row is activated.
//
// Community (flag `gallery`, stage 65) has no page and no flag in the
// client yet: the start page never shows it, and C does nothing. The row
// and its counter are drawn by the kit gallery (`?kit=menu`), and on the
// dev server by `?community=<n>` (a press says it comes later).
//
// Scripts needs the script library, which the shell always has; only
// tests mount the page without it, and then the row is not there. Options
// left the start page in stage 32 (its settings are changed in the game).

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { type AccountState, accountState, onAccountState, watchAccountState } from '../../cloud/account/state';
import { whenIdle } from '../../cloud/config';
import { type LockedNotice, type SyncView, onSyncMessage, onSyncView, startSync, syncView, takeSyncMessage } from '../../cloud/sync-view';
import { currentSpace, lockedCopies, takeSpaceMessage } from '../../core/space';
import { useServices, useSettings } from '../kit/hooks';
import { Box, GlassButton, Icon, type IconName, KeyLabel, LookFlash, letterOf, lookFrame, useScenery } from '../kit/look';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import { type MenuItem, menuKey, useMenuCursor } from '../kit/widgets';
import type { Quote } from '../quotes';
import { useBrightBack, useDarkInk } from '../start-surface';
import { AboutFrame, PrivacyFrame, atPrivacyPath } from './about';
import { openHistory } from './history';
import { ProfileFrame } from './profiles';
import { ScriptsFrame } from './scripts';
import { START_LETTERS, type OwnerSync, type OwnerView, type StartRowKey, communityCount, ownerRow, startMenu } from './start-menu-model';

export const LATER = 'Coming in a later stage.';

export interface StartMainProps {
  onEnter: () => void;
  quote: Quote;
}

export interface StartItem extends MenuItem {
  key: StartRowKey;
  label: string;
  /** The shortcut letter, marked in the label (the owner row's is not shown). */
  letter: string;
  icon?: IconName;
  /** After the label, small and dim (Profile: the selected profile's name). */
  note?: string;
  /** After the label in gold italic (Community: "3 new"). */
  count?: string | null;
  /** The owner row's text. */
  owner?: OwnerView;
}

const ICONS: Partial<Record<StartRowKey, IconName>> = {
  enter: 'door',
  profile: 'person',
  scripts: 'scroll',
  history: 'hourglass',
  community: 'star',
};

const LABELS: Record<StartRowKey, string> = {
  enter: 'Enter MUME',
  owner: 'Account',
  profile: 'Profile',
  scripts: 'Scripts',
  history: 'History',
  community: 'Community',
  about: 'About',
};

/** A row of the menu from its key: label, icon, letter (`START_LETTERS`); the caller adds what it does. */
export function startItem(key: StartRowKey, more: Partial<StartItem> = {}): StartItem {
  const icon = ICONS[key];
  return { key, label: LABELS[key], letter: START_LETTERS[key], ...(icon ? { icon } : {}), ...more };
}

export const StartMain = lookFrame(function StartMain(p: StartMainProps): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const services = useServices();
  const { profile } = useSettings();
  useScenery('main');
  const menu = useRef<HTMLUListElement>(null);
  const accountRow = useAccountRow(menu, isTop);
  useFlashRoom(menu);
  const account = accountRow.row;
  const openAccount = useAccountPages(nav);
  // Community: the flag `gallery` and the page come in stage 65 (dev: `?community=<n>`).
  const community = devCommunity();
  const entries = startMenu({ owner: account !== null, scripts: !!services.scripts, community });
  const sync = useSyncView(services, nav, isTop);
  const lockedKey = account && account.name === null ? (sync.locked?.nameKey ?? lockedCopies()[0] ?? null) : null;
  const lockedName = lockedKey ? (sync.locked?.nameKey === lockedKey ? sync.locked.name : lockedKey) : null;
  const notice = lockedKey && sync.locked?.nameKey === lockedKey ? sync.locked : null;
  const owner = account ? ownerRow({ name: account.name, sync: account.name ? ownerSyncOf(sync) : null, locked: lockedName }) : null;
  const openLocked = useLockedActions(nav);
  const does: Record<StartRowKey, Partial<StartItem>> = {
    enter: { activate: p.onEnter },
    // What a press opens is the model's (`opens`): Log in for a guest, the Account page logged in.
    owner: owner ? { owner, activate: () => openAccount(owner.opens) } : {},
    profile: { note: profile, activate: () => nav.push(<ProfileFrame />) },
    scripts: { activate: () => nav.push(<ScriptsFrame />) },
    history: { activate: () => openHistory(nav) },
    community: { count: community ? communityCount(community.count) : null, activate: () => nav.flash(LATER) },
    about: { activate: () => nav.push(<AboutFrame />) },
  };
  const items: StartItem[] = entries.flatMap((e) => (e.kind === 'row' ? [startItem(e.key, does[e.key])] : []));
  const [cursor, setCursor] = useMenuCursor(items, 'enter');
  const kit = useKitGallery(nav);
  usePrivacyAddress(nav);
  useKeys((e, nk) => {
    if (nk === 'back') return true;
    if (kit(e)) return true;
    const l = letterOf(e);
    // A waiting owner row comes in on the menu's next key (useAccountRow); U opens it at once.
    const waiting = accountRow.waiting;
    if (waiting) {
      accountRow.show();
      if (l === START_LETTERS.owner) {
        openAccount(ownerRow({ name: waiting.name }).opens);
        return true;
      }
    }
    if (notice && (l === 'l' || l === 'r')) {
      if (!e.repeat) openLocked(notice, l === 'l' ? 'login' : 'remove');
      return true;
    }
    const i = l ? items.findIndex((it) => it.letter === l) : -1;
    if (i >= 0) {
      setCursor(i);
      items[i]!.activate?.();
      return true;
    }
    return menuKey(items, cursor, setCursor, nk);
  });

  const ink = useDarkInk('quote');
  const bright = useBrightBack('quote');
  let n = 0;
  return (
    <div class="wc-start-main wc-lk-page">
      <div class="wc-sm-stage">
        <Box label="Start menu" class="wc-sm-panel" winClass="wc-sm-win">
          <ul class="wc-sm" role="menu" aria-label="Start menu" ref={menu}>
            {entries.map((e, k) => {
              if (e.kind === 'rule') return <li key={`rule${k}`} class="wc-sm-sep" role="separator" aria-hidden="true" />;
              const i = n++;
              const it = items[i]!;
              const row = <MenuRow key={it.key} item={it} selected={i === cursor} active={isTop} onSelect={() => setCursor(i)} />;
              if (it.key !== 'owner' || !notice) return row;
              return [row, <LockedLine key="locked" notice={notice} onAct={(what) => openLocked(notice, what)} />];
            })}
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

// ------------------------------------------------------------ the sync (stage 61)

/** The owner row's word for the engine's state; null without a sync in this page. */
function ownerSyncOf(v: SyncView): OwnerSync | null {
  return v.status ? v.status.state : null;
}

/**
 * The sync's view for the menu (src/cloud/sync-view.ts), and its messages
 * on the menu's line: the change of space's (`takeSpaceMessage`), the
 * move's, keep both. Starts the page's sync once the account state is
 * known (the sync's code is a lazy chunk). The message line wraps, and
 * About moves down while it shows (`useFlashRoom`).
 */
function useSyncView(services: ReturnType<typeof useServices>, nav: ReturnType<typeof useNav>, isTop: boolean): SyncView {
  const [v, setV] = useState<SyncView>(syncView);
  useEffect(() => {
    const off = onSyncView(setV);
    setV(syncView());
    const space = takeSpaceMessage();
    if (space) nav.flash(space, 'ok', SPACE_MESSAGE_MS);
    // On idle time, as the owner row's own flag (spec §7.0 rule 1: nothing of the cloud competes with the cold start).
    whenIdle(
      () =>
        void watchAccountState().then((st) => {
          // Only where there is something to do: somebody logged in, an account's space, a locked copy.
          if (st.enabled && (st.name !== null || currentSpace().kind === 'account' || lockedCopies().length > 0)) {
            startSync(services as unknown as Parameters<typeof startSync>[0]);
          }
        }),
    );
    return off;
  }, []);
  useEffect(() => {
    if (!isTop) return;
    const drain = (): void => {
      const m = takeSyncMessage();
      if (m) nav.flash(m.text, 'ok', m.ms);
    };
    drain();
    return onSyncMessage(drain);
  }, [isTop]);
  return v;
}

/**
 * The message line wraps (stage 61: the sync's messages take two or three
 * lines in the panel): its height is measured and About's place follows
 * it (`--wc-sm-flash-h` on the panel's window).
 */
function useFlashRoom(menu: { current: HTMLUListElement | null }): void {
  useLayoutEffect(() => {
    const win = menu.current?.parentElement;
    const line = win?.querySelector<HTMLElement>('.wc-sm-flash');
    if (!win || !line) return;
    const put = (): void => {
      const h = Math.max(18, Math.ceil(line.offsetHeight));
      win.style.setProperty('--wc-sm-flash-h', `${h}px`);
    };
    put();
    if (typeof ResizeObserver !== 'function') return;
    // The change of layout waits for the next frame (inside the observer's call it would loop).
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(put);
    });
    ro.observe(line);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);
}

/** How long a message from a change of space stays on the menu's line. */
const SPACE_MESSAGE_MS = 12_000;

/** The locked copy's notice under the owner row (the owner's pick 2a): what is kept, Log in (L) and Remove (R). */
function LockedLine(p: { notice: LockedNotice; onAct: (what: 'login' | 'remove') => void }): VNode {
  const n = p.notice;
  const one = /^1 /.test(n.what) && !n.what.includes(' and ');
  return (
    <li class="wc-sm-lock" role="note" data-locked={n.nameKey}>
      <p class="wc-sm-lock-t">
        {n.what} {one ? 'is' : 'are'} not in the account <b>{n.name}</b> yet. {one ? 'It is' : 'They are'} kept on this device until you log in.
      </p>
      <div class="wc-sm-lock-b">
        <GlassButton id="LOCKED-LOGIN" label="Log in" letter="l" small onClick={() => p.onAct('login')} />
        <GlassButton id="LOCKED-REMOVE" label="Remove" letter="r" small danger onClick={() => p.onAct('remove')} />
      </div>
    </li>
  );
}

/** Log in (the Log in page, the name filled in) and Remove (its question) of the locked copy: the account chunk. */
function useLockedActions(nav: ReturnType<typeof useNav>): (n: LockedNotice, what: 'login' | 'remove') => void {
  const loading = useRef(false);
  return (n, what) => {
    if (loading.current) return;
    loading.current = true;
    const depth = nav.depth();
    void import('./account')
      .then((m) => {
        if (nav.depth() !== depth) return;
        if (what === 'login') nav.push(m.loginFor(n.name));
        else nav.push(m.removeCopyDialog(n), { overlay: true });
      })
      .catch(() => nav.flash('The account pages could not be loaded. Check the connection and try again.', 'fail'))
      .finally(() => {
        loading.current = false;
      });
  };
}

// ------------------------------------------------------------ the owner row coming in

/** The rows above the owner row: they do not move when it comes in. */
const ABOVE_ACCOUNT = new Set(['enter']);
/** A finger's click follows its lift by up to about this (ms): the row waits it out. */
const AFTER_TOUCH_MS = 350;

interface AccountRow {
  /** The owner row's account state; null while the row is not shown (accounts off or not known yet, or it waits). */
  row: AccountState | null;
  /** The state of a row that waits to come in (below); null: none waits. */
  waiting: AccountState | null;
  /** Brings a waiting row in now (the menu's keys: the hands are on the keyboard). */
  show(): void;
}

/**
 * The owner row: whether it is shown, and with which account state.
 *
 * When the menu learns of the row: only after its first paint. The flag
 * `accounts` comes from the server (`watchAccountState` on idle time: the
 * shared `/api/config`, and no request at all where the page may not call
 * the API), so the row's height cannot be kept free from the start (a
 * production page, flag off, would show a hole); the account's name is
 * known at once (a localStorage hint), but without the flag it is no row.
 *
 * When the flag turns on, the row comes in at once unless that would move
 * something under a pointer: a mouse resting on the rows below it or on
 * the panel's foot (a click there would land on another row than the one
 * it was aimed at), or a finger that is down (its click comes after the
 * lift). Then it waits, and comes in at the first of: the mouse leaves
 * that part (onto Enter MUME, off the panel, out of the window), the
 * finger's click is over, the menu's next key (`show`: the hands are on
 * the keyboard, and the cursor is kept by key), or the menu is no longer
 * the top frame (a page over it hides it; Back finds the row there).
 */
function useAccountRow(menu: { current: HTMLUListElement | null }, isTop: boolean): AccountRow {
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
    if (!isTop) setShown(true);
    else tryIn();
    return () => {
      win.clearTimeout(timer);
      doc.removeEventListener('pointerdown', onDown, true);
      doc.removeEventListener('pointerup', onUp, true);
      doc.removeEventListener('pointercancel', onUp, true);
      doc.removeEventListener('pointermove', onMove, true);
      doc.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [on, shown, isTop]);
  return {
    row: on && shown ? state : null,
    waiting: on && !shown ? state : null,
    show: () => setShown(true),
  };
}

/**
 * Opens the account pages: the lazy chunk (./account), then the page the
 * owner row's model names (`OwnerView.opens`: the Account page, or Log
 * in). One load at a time; a page opened meanwhile (another key) keeps
 * the menu as it is.
 */
function useAccountPages(nav: ReturnType<typeof useNav>): (opens: OwnerView['opens']) => void {
  const loading = useRef(false);
  return (opens) => {
    if (loading.current) return;
    loading.current = true;
    const depth = nav.depth();
    void import('./account')
      .then((m) => {
        if (nav.depth() === depth) nav.push(m.accountEntry(opens === 'account'));
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

// Dev only (stage 67): `?community=<n>` shows the Community row with <n>
// new runs, for the e2e specs and the screenshots, until the flag
// `gallery` and the page exist (stage 65). A normal build folds it to
// null.
function devCommunity(): { count: number } | null {
  if (!import.meta.env.DEV) return null;
  const n = new URLSearchParams(globalThis.location?.search ?? '').get('community');
  return n === null ? null : { count: Number(n) || 0 };
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

/** A row of the menu: the kinds differ in look only (Enter MUME is prime, About quiet, the owner row a heading line). */
export function MenuRow(p: { item: StartItem; selected: boolean; active: boolean; onSelect: () => void }): VNode {
  const ref = useRef<HTMLLIElement>(null);
  const it = p.item;
  useLayoutEffect(() => {
    const el = ref.current;
    if (p.selected && p.active && el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [p.selected, p.active]);
  const kind = it.key === 'enter' ? ' is-prime' : it.key === 'about' ? ' is-foot' : it.owner ? ' wc-sm-owner is-' + it.owner.kind : '';
  return (
    <li
      ref={ref}
      class={'wc-sm-item' + kind + (p.selected ? ' is-sel' : '')}
      role="menuitem"
      data-key={it.key}
      data-state={it.owner?.kind}
      aria-label={it.owner?.label}
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
      {it.owner ? (
        <OwnerLine view={it.owner} />
      ) : (
        <>
          {it.icon && <Icon name={it.icon} class="wc-sm-ic" />}
          <KeyLabel class="wc-sm-label" text={it.label} letter={it.letter} />
          {it.note && <span class="wc-sm-note">({it.note})</span>}
          {it.count && <span class="wc-sm-count">{it.count}</span>}
        </>
      )}
    </li>
  );
}

/**
 * The owner row's content: the state mark in the left margin, the name in
 * small capitals (it gives way with an ellipsis), the state in italic and
 * the reactions mark in gold (never cut), a chevron at the right end.
 */
export function OwnerLine(p: { view: OwnerView }): VNode {
  const v = p.view;
  return (
    <>
      <span class={'wc-so-mark' + (v.mark ? ' is-' + v.mark : '')} aria-hidden="true">
        {v.mark === 'key' && <Icon name="key" />}
        {v.mark === 'lock' && <Icon name="lock" />}
      </span>
      <span class="wc-so-text" aria-hidden="true">
        <span class="wc-so-name">{v.name}</span>
        {v.state && (
          <span class={'wc-so-state' + (v.stateIsAction ? ' is-act' : '')}>
            <span class="wc-so-sep"> · </span>
            <span class="wc-so-word">{v.state}</span>
          </span>
        )}
        {v.news && (
          <span class="wc-so-news">
            <span class="wc-so-sep"> · </span>
            {v.news}
          </span>
        )}
      </span>
      <Icon name="next" class="wc-so-chev" />
    </>
  );
}
