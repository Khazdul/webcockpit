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
// Scripts needs the script library, which the shell always has; only
// tests mount the page without it, and then the row is not there. Options
// left the start page in stage 32 (its settings are changed in the game);
// the phone's ESC menu keeps it.

import { Fragment, type VNode } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { useServices, useSettings } from '../kit/hooks';
import { Box, Icon, type IconName, KeyLabel, LookFlash, letterOf, lookFrame, useScenery } from '../kit/look';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import { type MenuItem, menuKey, useMenuCursor } from '../kit/widgets';
import type { Quote } from '../quotes';
import { useBrightBack, useDarkInk } from '../start-surface';
import { AboutFrame } from './about';
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
    { key: 'credits', label: 'Credits', letter: 'c', icon: 'quill', activate: () => nav.push(<CreditsFrame />) },
    { key: 'about', label: 'About', letter: 'a', icon: 'info', activate: () => nav.push(<AboutFrame />) },
  ];
  const [cursor, setCursor] = useMenuCursor(items, 'enter');
  useKeys((e, nk) => {
    if (nk === 'back') return true;
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
          <ul class="wc-sm" role="menu" aria-label="Start menu">
            {items.map((it, i) => (
              <Fragment key={it.key}>
                <MenuRow item={it} selected={i === cursor} active={isTop} onSelect={() => setCursor(i)} />
                {i === 0 && <li class="wc-sm-sep" role="separator" aria-hidden="true" />}
              </Fragment>
            ))}
          </ul>
          <LookFlash class="wc-sm-flash" />
        </Box>
        <blockquote class={'wc-sm-quote' + (ink ? ' is-ink' : bright ? ' is-lit' : '')}>
          <p>{p.quote.text}</p>
          <span class="wc-sm-orn" aria-hidden="true" />
          <cite>{p.quote.by}</cite>
        </blockquote>
      </div>
    </div>
  );
});

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
