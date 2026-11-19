# 0163 — The watch page as a frame on the start surface

Date: 2026-11-18. Status: accepted (built on `stage-74a`, stage 74 part
A). Related: ADR 0154 (the watch page, its sandboxed frame), ADR 0155 (the
Community; C2 and W1: the watch page in the start page's look, `?from=`),
ADR 0155 addendum 2026-11-18 (the arrival on `?community`), ADR 0127
(layout B, the morph), ADR 0160 addenda (fullscreen and the turn on touch
devices), ADR 0144 (the CSP).

Numbering note: part B of stage 74 was built in parallel; if a number
collides at the merge, the main session renumbers.

## Context

The owner's report of 2026-11-18: going from the Community page into a
posted log blinks, and so does Back. He wants the soft transition the
start menu's other pages have: the iron frame changes size softly and the
content comes once the frame has its new size.

The blink was a full page load both ways. A run was opened with
`location.assign(watchHref(…))` to the standalone watch page (mounted by
`src/main.ts` instead of the start page), and its Back was
`location.assign(backHref(…))`, which stage 73 part D could only soften
(the arrival). The watch page was already drawn in the kit's large-box
look, by a box of its own that the morph did not know.

## Decision

A run opened **from the Community page or from the Account page's
Published runs** is the watch page pushed as a frame on the start
surface's frame stack: no page load, the surface's morph as for any other
page, and the page below stays mounted, so Back finds it as it was left
(its view, cursor and scroll position).

- **One page, two mounts.** `WatchPage` (src/watch/page.tsx) takes
  `embedded` (the session below). Standalone (`startWatch`) is unchanged:
  a bare link `<base>r/<id>` (with or without `?from=`), a reload on a
  run's address and `?admin` (standalone only); its Back is still the page
  load to `?community` / `?account…` with the arrival of stage 73 D.
  Embedded differs in three things only: Back, Esc, and what the mount
  installs (below). Everything else is the same code: the meta and the
  payload, the frame host and its sandbox, the view count (once per mount
  of the page, when the frame has the run), Share, Report, the stars, the
  comments.
- **The address** (src/watch/embed-session.ts). On open,
  `history.pushState` to the run's `watchHref(id, from)`, and the title
  becomes the watch page's (then the run's, from its meta). **One way
  out:** the in-app Back (the button, B, and Esc) calls `history.back()`;
  the `popstate` that follows, as after the browser's own Back or a swipe,
  pops the frame and puts the title back. Nothing is written on the way
  out, so the history never holds a stale entry. A second Back while the
  first is on its way does nothing (it would leave the site).
- **Forward** after Back lands on the run's entry with no frame for it:
  the page steps back again (a window-wide `popstate` guard), so the
  address never names a run the page does not show. Reopening the run
  there was not built: the page that opened it may no longer be the top
  one.
- **One run at a time.** A second press while a run shows (a double click
  on a row) opens nothing more.
- **Overlays.** The Report dialog is an overlay frame over the run with no
  history entry of its own: its Close and Esc pop it alone; the browser's
  Back pops the run and whatever lies over it in one step (`nav.pop(n)`
  down to the depth the run was opened at).
- **A reload** on the run's address gives the standalone page, as today.
- **Log in from the embedded page** (Report, the stars, the comments)
  keeps the round trip of src/watch/return.ts: the note's `back` is the
  address, which is the run's, then the start page's Log in, then a load
  of the standalone page.
- **Esc is Back** on the embedded page, as on every sub-page of the start
  surface (on the standalone page it does nothing, as before). A click in
  the replay gives the frame the keys, as before; B and Esc are then the
  player's.
- **The morph.** `WatchBox` reports itself to the surface's frame host
  (`BoxHostCtx`) as a `large` box and the page asks for the large
  scenery, so `data-lk-box`, the calm sky rate, the phone's hidden
  fullscreen button and the wordmark behave as for any large box. The box
  has the first view's size from its mount at every width (the page's
  outer box has the frame's height and the box grows to it; what loads
  later only makes it longer below the fold), so the rectangle the proxy
  flies to is right before the meta arrives.
- **The layout is the standalone page's.** The embedded page's root is
  `.wc-watch-page.wc-watch.wc-watch-emb`, filling its frame as the
  standalone host fills the window; watch.css's standalone-only rules moved
  to `.wc-chrome.wc-watch`. From 1000 px the band and the replay were the
  window's grid items through `display: contents` on `.wc-watch-screen`; an
  element without a box cannot be faded by the morph, so it is now a
  subgrid spanning the window's grid (the same tracks, the comments over
  its second row; `@supports not` keeps `display: contents`).
- **Fullscreen and the turn** are untouched code. `installWatchTurn` and
  `--wc-watch-vh` find `.wc-watch` (now the embedded page's root, of the
  same size as the standalone host); `#app` gets `wc-watch-app` while the
  embedded run shows (the root filled by CSS, not by the measured visual
  viewport: ADR 0160 round 3) and loses it at the unmount; `fsModeFor`
  reads the run's address, to which `?fsmode` and `?fsdebug` of the start
  page's address are carried. The fill (`is-filled`, `position: fixed`) has
  no containing block or stacking context between it and the window on the
  start surface either (checked by test: on top at nine points).
- **Disposal.** The popped frame stays mounted for the stack's hold (its
  content fades) and then unmounts: the frame host is disposed, the iframe
  removed, `wc-watch-app` taken off. A frame unmounted by anything else
  than Back (the stack made anew) leaves its history entry the same way.
- **The sandbox and the CSP** do not depend on the page's path: the frame
  document is `<base>r/frame` resolved from `BASE_URL`, the app's policy is
  one rule for `/*` (`frame-src 'self'`), and the frame's own policy is its
  own response's.
- **Chunks.** The watch page already loaded with the chrome chunk; the
  opener (src/watch/embed.tsx, embed-session.ts) is in the account pages'
  lazy chunk beside its two callers (+1.4 kB there). Imported from two
  chunks now, the page moved from the chrome chunk (175.7 → 143.8 kB) into
  the kit's shared chunk that the chrome chunk imports (134.4 → 166.3 kB,
  which the bundler now names `counter` instead of `model`). The start
  page's static chunks (the chrome chunk, the start surface and all they
  import) are the same bytes: 1058.7 kB before and after (373.4 → 372.7 kB
  gzip), and the entry's preload list is the same 50 files.

## Alternatives

- **The View Transitions API across the two documents.** Keeps the page
  load (the app boots again, the sky restarts) and is not in Firefox.
- **`history.replaceState` on the way out** instead of `history.back()`:
  two paths out (the browser's Back would still be a `popstate`), and the
  run's entry would stay in the history behind the Community.
- **A hash or no address at all** for the embedded run: a reload or a
  copied address would no longer be the run.

## Consequences

- The start page's document can now show the address `<base>r/<id>`.
  Nothing on the start page reads `location.pathname` after boot (checked),
  and relative fetches use `BASE_URL`.
- The live sky is behind the embedded run (at its calm rate under a large
  box) where the standalone page has a still one.
- Tests: tests/unit/watch-embed.test.ts (the session against a fake
  history); tests/e2e/watch-embed.spec.ts and phone-watch-embed.spec.ts
  (no document load, the morph, the address and title, Back four ways,
  Forward, Report under the browser's Back, a reload, a gone run, Log in,
  the same rectangles as the standalone page, the fill, a turn);
  published-runs.spec.ts (the title's press and Enter).
