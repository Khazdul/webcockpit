// Start page main frame (Inv §3.2): banner, menu, Tolkien quote, footer.
// Top-anchored: blank, banner, blank, menu, flash row, quote, attribution;
// the footer sits on the last row. The banner is dropped when it does not
// fit with everything else (the menu always wins). The client notices
// (ADR 0025) are drawn by the start surface on the top row, above every
// start frame (src/chrome/index.tsx `StartNotices`).

import type { VNode } from 'preact';
import { Banner } from '../banner';
import { BANNER_H, bannerFits } from '../banner-data';
import { useGrid, useServices } from '../kit/hooks';
import { wrapText } from '../kit/nav';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Centered,
  FlashRow,
  Footer,
  type MenuItem,
  MenuRows,
  menuKey,
  useMenuCursor,
} from '../kit/widgets';
import type { Quote } from '../quotes';
import { AboutFrame } from './about';
import { CreditsFrame } from './credits';
import { HistoryFrame } from './history';
import { OptionsHub } from './options';
import { ProfileFrame } from './profiles';
import { ScriptsFrame } from './scripts';
import { startSpotlights } from './spotlights';

export const LATER = 'Coming in a later stage.';

export interface StartMainProps {
  onEnter: () => void;
  quote: Quote;
}

export function StartMain(p: StartMainProps): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const { cols, rows } = useGrid();
  const services = useServices();
  const items: MenuItem[] = [
    { key: 'enter', label: 'Enter MUME', activate: p.onEnter },
    { key: 'profile', label: 'Profile', activate: () => nav.push(<ProfileFrame />) },
    ...(services.scripts ? [{ key: 'scripts', label: 'Scripts', activate: () => nav.push(<ScriptsFrame />) }] : []),
    { key: 'options', label: 'Options', activate: () => nav.push(<OptionsHub />) },
    { key: 'history', label: 'History', activate: () => nav.push(<HistoryFrame />) },
    { key: 'spotlights', label: 'Spotlights', activate: () => void startSpotlights(nav, services) },
    { key: 'credits', label: 'Credits', activate: () => nav.push(<CreditsFrame />) },
    { key: 'about', label: 'About', activate: () => nav.push(<AboutFrame />) },
  ];
  const [cursor, setCursor] = useMenuCursor(items, 'enter');
  useKeys((_e, nk) => (nk === 'back' ? true : menuKey(items, cursor, setCursor, nk)));

  const quoteLines = wrapText(`"${p.quote.text}"`, Math.min(cols - 4, 72));
  const attr = `— ${p.quote.by}`;
  // blank, menu, flash row, quote, attribution, footer.
  const withQuote = 1 + items.length + 1 + quoteLines.length + 1 + 1;
  const showQuote = rows >= withQuote;
  const reserved = showQuote ? withQuote - 1 : items.length + 2;
  const showBanner = bannerFits(rows, reserved);
  const used = (showBanner ? BANNER_H + 2 : 1) + items.length + 1 + (showQuote ? quoteLines.length + 1 : 0);

  return (
    <div class="wc-page wc-start-main">
      {showBanner ? (
        <>
          <Blank />
          <Banner hz={12} run={isTop} />
          <Blank />
        </>
      ) : (
        <Blank />
      )}
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
      <FlashRow />
      {showQuote && (
        <>
          {quoteLines.map((l) => (
            <Centered text={l} class="wc-c-quote" />
          ))}
          <Centered text={attr} class="wc-c-quote-attr" />
        </>
      )}
      <Blank n={Math.max(0, rows - used - 1)} />
      <Footer tokens={START_FOOTER} />
    </div>
  );
}

const START_FOOTER = ['↑↓ Navigate', 'Enter/Space Select'];
