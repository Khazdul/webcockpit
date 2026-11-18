// A run opened on the start surface (stage 74 A, ADR 0163): the watch page
// (src/watch/page.tsx) pushed as a frame on the start page's stack, from
// the Community page and from the Account page's Published runs, instead of
// a page load to `<base>r/<id>`. The surface's morph runs for it as for any
// other page (the watch box reports as a large box), and the page below
// stays mounted, so Back finds it as it was left.
//
// The address is the run's own while it shows (`watchHref`, by
// `history.pushState`; src/watch/embed-session.ts), so a reload there gives
// the standalone page, and Back (in the app or the browser's) pops the
// frame. `?fsmode` and `?fsdebug` on the start page's address are carried
// to the run's (the tablet's fullscreen modes and readout, stage 73 round
// 3, can be tried on the embedded page too).
//
// Imported by the Community page and Published runs (the account pages'
// lazy chunk); the watch page itself is in the chrome chunk already.

import type { Nav } from '../chrome/kit/stack';
import { beginWatchSession, carriedQuery } from './embed-session';
import { type WatchFrom, watchHref } from './href';
import { WATCH_ID_PATTERN } from './model';
import { WatchPage } from './page';

/** The watch page's title until the run's meta gives its own (as `startWatch` sets it). */
export const WATCH_TITLE = 'Shared log · WebCockpit';

/** Opens the run `id` over the top page of `nav`'s stack; its Back comes here again. */
export function openWatchFrame(nav: Nav, id: string, from: WatchFrom): void {
  const depth = nav.depth();
  const session = beginWatchSession({
    href: watchHref(id, from) + carriedQuery(location.search),
    title: WATCH_TITLE,
    // The run's frame and whatever lies over it (the Report dialog).
    close: () => {
      const over = nav.depth() - depth;
      if (over > 0) nav.pop(over);
    },
  });
  nav.push(<WatchPage id={id} valid={WATCH_ID_PATTERN.test(id)} admin={false} embedded={session} />);
}
