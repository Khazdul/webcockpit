# iPad fullscreen with our own keyboard (stage 54 research)

Researched 2026-11-12. Owner's report (iPad 10th gen, iPadOS Safari, our
keyboard up): fullscreen "sometimes protests", sometimes works, sometimes
jumps back out; it flickers and things are redrawn on the way in.

Claim marks: **(a)** primary source (WebKit source at `main` read on this
date, WebKit Bugzilla, webkit.org), **(b)** secondary report, **(c)** my
inference. Nothing here was tested on a device.

WebKit source base: `https://github.com/WebKit/WebKit/blob/main/` (below: `WK/`).

## Verdict

Two separate, intended WebKit behaviours on iOS/iPadOS explain the report.
Neither has an opt-out for a web page.

1. **Focusing a text field exits fullscreen.** (a)
2. **A typing-like touch pattern in fullscreen raises a phishing alert.** (a)

Element fullscreen on iPadOS is built for video and tap-light content. A
page that is typed in cannot stay in it, whatever keyboard is used.

## 1. The typing heuristic (hypothesis: confirmed)

- (a) `WK/Source/WebKit/UIProcess/ios/fullscreen/WKFullScreenViewController.mm`:
  a zero-duration `UILongPressGestureRecognizer` on the fullscreen view calls
  `_touchDetected:` for every touch. On touch end it asks
  `_secheuristic.scoreOfNextTouch(location)`; above `requiredScore()` it calls
  `_showPhishingAlert`.
- (a) The alert: title "It looks like you are typing while in full screen",
  text "Typing is not allowed in full screen websites. "<site>" may be
  showing a fake keyboard to trick you into disclosing personal or financial
  information.", buttons **Exit Full Screen** (the cancel action) and
  **Stay in Full Screen** (resets the score). The page's DOM activity and
  animations are suspended while it shows. It does not exit by itself; the
  user's answer does. This is the "protest".
- (a) Scoring, `FullscreenTouchSecheuristic.cpp` and
  `FullscreenTouchSecheuristicParameters.cpp` (`iosParameters()`):
  `rampUpSpeed 0.25 s, rampDownSpeed 1 s, xWeight 0, yWeight 1, gamma 0.1,
  gammaCutoff 0.08, requiredScore 0.1`, internal weight 0.1. Only the
  **vertical** distance between consecutive touches counts, as a share of
  the view's height.
- (c) Worked out from that code: each touch adds `0.025 * d'` and the old
  score decays by 10 % per second between touches. `d'` is the vertical
  share when it is at most 8 % of the height, and about 0.7 to 1.0 for
  anything above 8 %. So about **5 or 6 consecutive taps, each more than 8 %
  of the screen height above or below the previous one, at more than about
  one tap per 2 s** raise the alert. Taps along one row never do. On the
  iPad 10 (820 x 1180 pt) 8 % is about 94 pt in portrait and 66 pt in
  landscape: two keyboard rows apart, or keyboard to compass, hot keys or
  game text. Normal typing on our keyboard reaches it within a few words.
- (a) No exemption for a site: the only bypasses are visionOS and an active
  text selection in an image (`_shouldAvoidSecurityHeuristicScoreUpdates`,
  `WK/Source/WebKit/UIProcess/ios/WKContentViewInteraction.mm`). No
  permission, attribute or option feeds it.
- (a) Apple calls it intended: bug 205917 (NEW since 2020, comment of
  2026-10-14: "intended phishing protection against fake keyboards",
  "I'm not sure we can actually fix this bug"), with 206853 and 267743
  closed as duplicates. <https://bugs.webkit.org/show_bug.cgi?id=205917>,
  <https://bugs.webkit.org/show_bug.cgi?id=267743>. The pull request that
  proposed a user opt-in (WebKit PR 22953, 2024) is still open, not merged.
- Versions: (a) added 2018-03-11 (bug 183503, "Improvements to fullscreen;
  new UI and security features"), parameters last changed 2019-08 (r248174,
  bug 200446), still in `main`. (b) Reported on iPadOS 13.3, 17.2, 17.7.11
  and 27 in those bugs. (c) So every iPadOS with element fullscreen (12 on).
- iPhone: (b) no element fullscreen for non-video elements; bug 206854 "Add
  Fullscreen API to iOS" is open, and the 17.2 preview is a feature flag
  that is off by default (bug 267743 comment 6). Our `canFullscreen` is
  already false there (`src/core/fullscreen.ts:30`). Not verified in source.

## 2. What else makes entry flicker or bounce back

- **Text field focus exits fullscreen.** (a)
  `WK/Source/WebKit/WebProcess/WebPage/WebPage.cpp`,
  `shouldExitFullscreenAfterFocusingElement`: on iOS, when an `<input>` that
  is a text field, a `<textarea>` or an editable element gains focus while
  the document is fullscreen, `fullyExitFullscreen()` is called.
  `inputmode="none"` is not looked at. Safari 26 narrowed it from "any form
  control" to text entry only (bug 292220,
  <https://bugs.webkit.org/show_bug.cgi?id=292220>; Safari 26 notes,
  <https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/>).
  (a) A blur and refocus of the same element may be skipped
  (`shouldDispatchUpdateAfterFocusingElement`), (c) which would make this
  look random.
- **Swipe down exits.** (a) `WKFullScreenWindowControllerIOS.mm`: a one-finger
  downward swipe starts an interactive dismissal; it exits when the drag
  passed 12.5 % of the height or still moves down on release. (b) Bug 263877
  "scrolling can accidentally exit fullscreen" is open. (c) Dragging the
  scrollback down is such a swipe.
- **Entry animation.** (a) Same file: WebKit snapshots the page, moves the
  web view into a separate fullscreen window and animates (0.2 s steps). The
  page is laid out at its new size during this.
- **Viewport meta ignored in fullscreen.** (a)
  `WK/Source/WebKit/WebProcess/WebPage/ios/WebPageIOS.mm`,
  `resetViewportDefaultConfiguration`: in fullscreen the native viewport
  parameters replace the page's. (b) Wikimedia T390256 saw wrong sizes in
  iPad fullscreen with a non-default viewport meta. (c) Ours
  (`width=device-width, maximum-scale=1, viewport-fit=cover`) is close to
  native, so at most one extra layout.
- **The "x" button and status bar.** (a) Every touch calls `showUI`; the
  auto-hide timer is only armed for playing video, so on our page the button
  stays. WebKit holds the top safe-area inset constant so content does not
  jump. (b) The status bar cannot be hidden (bug 272392, NEW); the button
  covering content is WONTFIX (bug 263876).
- **`navigationUI`.** (a) Accepted by `FullscreenOptions.idl`; (c)
  `FullscreenManager.cpp` never reads it, so no effect.
- **Which element.** (c) No difference: the exit-on-focus test is on the
  document and the heuristic on the whole fullscreen view.
- **Resize event count, rotation.** Not found in a source; not tested.

## 3. Our code path

What we do on a fullscreen change (phone and tablet game layout):

- `src/layout/phone-viewport.ts:269-277` (`onFullscreen`): measures and
  publishes `--wc-vv-h` **at once**, again 150 ms after the last viewport
  event (`:257-266`), and again at 500 ms (`FS_RECHECK_MS`). Written for
  Android's event order (file header, point 1).
- Each new `--wc-vv-h` resizes `#app` (`src/ui/ui.css:551-562`), which fires
  the cockpit's `ResizeObserver` (`src/layout/cockpit.ts:675-676`) and a full
  relayout in the next frame (`:973-980`), with the lens fit
  (`src/phone/index.ts:1236-1241`) and a window size report to MUME.
- `src/phone/index.ts:543-544`: every window `resize` runs `syncLens()`
  (`:1146`), not debounced. `src/phone/keyboard-pages.ts:268-274` places the
  page keyboard again on each resize of the app box.
- (c) So up to three full layouts at different heights inside the first
  half second, on top of WebKit's own animation: this is the visible redraw.
  Nothing re-requests fullscreen and nothing of ours calls `exitFullscreen`
  in the game layout.

What of ours can make WebKit exit (through section 2's focus rule):

- `src/phone/keyboard.ts:540`: every key press calls `t.focus()` on the
  target field; for the command line that is `src/app/shell.ts:959`. A no-op
  while the field has the focus, a real focus (and so an exit) after a tap
  on the game text blurred it. (c)
- `src/ui/input-pane.ts:1343-1347`: a window `focus` event focuses the
  command line. (c) If moving the web view to the fullscreen window fires
  one, this exits right after entry. Needs a device check.
- `src/app/shell.ts:517`, `:944`: closing the menu focuses the command line.
- The user tapping the command line, or any pane field, in fullscreen.
- With the keyboard already up the field keeps its focus through the entry,
  so it "works" until the next real focus or the alert. (c)

A side effect: `src/core/fullscreen.ts:67-79` treats a first
`fullscreenchange` that finds no fullscreen element as a refusal and removes
the key for the page's life (`src/phone/lens.ts:321`). (c) A bounce may
trip it.

## 4. Add to Home Screen

- Project state: `index.html` has an `apple-touch-icon` only. No web app
  manifest, no `apple-mobile-web-app-capable` meta, no service worker
  (`public/`, `src/`, `vite.config.ts`).
- (a) iPadOS 26: "By default, every website added to the Home Screen opens
  as a web app", no manifest needed; the user can turn "Open as Web App"
  off (Safari 26 notes, URL above). (a) Before 26 a manifest with `display:
  standalone` or `fullscreen` is needed, else it is a bookmark
  (<https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>).
- What it gives: (b) no Safari tab bar or toolbar; the status bar stays
  (bug 264220, NEW: `display: fullscreen` is not honoured). (c) Neither
  WebKit rule applies, since both act only in element fullscreen; our
  fullscreen key should then be hidden there, or it brings them back.
- Storage: (a) separate from Safari, by design ("Home Screen apps are
  created as isolated entities without shared state with the browser",
  <https://bugs.webkit.org/show_bug.cgi?id=181849>). Profiles, settings and
  runs do not carry over; our export and import (spec §2) is the way across.
  (a) Its data is not under Safari's 7-day deletion
  (<https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/>).
- COOP/COEP: production on GitHub Pages is not cross-origin isolated
  (`spec.md:138-142`), so nothing changes. WebSocket: (c) no known
  difference; untested. No service worker means no offline start, as in
  Safari.

## Options

1. **Hide the fullscreen key on iPadOS while our keyboard is the keyboard.**
   Cost: small (a platform test in `canFullscreen` or the phone kit). The
   user gets no fullscreen and no alerts or bounces. Grounded: sections 1, 2.
2. **Keep the key, explain.** Cost: small (a notice on first use). The user
   still meets the alert after a few words and an exit on the next field
   focus; "Stay in Full Screen" lasts until the score builds again.
3. **Offer Add to Home Screen as the chrome-free way on iPad.** Cost: small
   to medium: a manifest and meta (needed before iPadOS 26), hiding the
   fullscreen key in standalone, a line of help, and telling users to export
   and import their profiles. The user gets no Safari bars but keeps the
   status bar. Needs a device check of the layout and the WebSocket.
4. **Calm our relayout during the transition.** Cost: small (on iPadOS skip
   the immediate measurement and keep the settled one). Less redraw on the
   way in. Does not stop the alert or the exits, so only worth it with 2.
5. **Avoid focusing in fullscreen** (guard `keyboard.ts:540` and
   `input-pane.ts:1343`, type without a focused field). Cost: medium to
   large, touches ADR 0138's model. Removes the exits only; the alert stays.
   Not recommended on its own.

Options 1 and 3 together are what the sources support. Device checks still
wanted: whether a window `focus` event fires on entry, and the standalone
layout.
