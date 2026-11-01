# 0103 — Windows: Profile and Scripts

- Status: Accepted
- Date: 2026-10-31
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S2, S8, "30b build
  plan"), ADR 0099 (menu bar), ADR 0100 (Disconnected notice), ADR 0095
  (pane buttons), ADR 0097 (fullscreen button), ADR 0014 (floating panes)

## Context

Stage 30 lets the user play and change settings at the same time. Step
30b turns the bar's Profile and Scripts into movable windows over the
running cockpit (S8): the active profile's editor with live apply, and the
Scripts page. After the 30a mockups' round 2 the owner wanted a
conventional frame set apart from the panes: a thin cyan border, almost
square corners, a slim title bar (title left, X right), a small resize
grip, an opaque terminal background, and a dimmed look without focus.
S2 adds the rules for focus and Esc. During the build the owner also asked
that Esc in fullscreen should not leave fullscreen but act as the Exit
button.

## Decision

- **Where:** a Preact surface in the chrome chunk (`src/chrome/windows.tsx`,
  `mountWindows`), since the content (the profile editor, the Scripts page)
  lives there; the chunk is loaded at boot on `/` and prefetched in the
  offline modes. The shell mounts it on first use in a layer inside the
  cockpit element (`.wc-windows-host`). Desktop and tablet only: the phone
  keeps the ESC menu targets of ADR 0099.
- **Window kit** (`src/chrome/kit/window.tsx`, `window.css`): the frame,
  title bar, X, grip and eight resize bands. Pointer events with pointer
  capture and `touch-action: none`, so a finger or pen moves and resizes
  as a mouse does. A press in the frame never moves the DOM focus or
  selects text. The border is drawn over the box (`::after`), so the
  content starts on whole cells.
- **Geometry** (`src/chrome/kit/window-geom.ts`, pure): whole cells on the
  cockpit grid (origin at the cockpit element's top left, as the panes).
  The rectangle is the outer box; the title bar is its top row and the
  content grid is inset one cell left, right and bottom (the border and
  resize bands live there), so the content is `w − 2 × h − 2` cells.
  Minimum content 60 × 18 (outer 62 × 20); along an axis where the screen
  is smaller the window fills the screen. Default: 80% of the screen,
  centred; a window opened at its default place while another one stands
  at its default place is offset one cell right and down. Drags round the
  pointer offset to whole cells (`cellDelta`); moves and resizes are
  clamped to the screen and the minimum. A stored rectangle is shown
  through `fitRect` (shrink, then move), so a window is always fully on
  screen, also after a viewport or font change, without rewriting the
  stored place.
- **Persistence:** `settings.windows` (`{ profile, scripts }`, each
  `{ x, y, w, h }` in cells or null), global, not per profile. Written
  when a move or resize ends, never during a drag. Additive in the schema:
  `migrateWindows` keeps whole numbers (size at least 1, a sanity bound of
  10000) and drops anything else to null.
- **Stacking:** the layer is a stacking context at z-index 98 in the
  cockpit: above the panes (floating from 10 up) and the weather's front
  layer (90); below the ESC menu (100), the drop bars and drag shield, the
  bar popups (260) and tooltips (270). Within it, open windows are stacked
  in the order last raised.
- **Frame stack, window mode** (`src/chrome/kit/stack.tsx`): each window
  holds its own `FrameStack` on its own cell grid with `trap={false}` and
  `active` while the window has the focus. Keys go through one capture-phase
  listener per browser window shared by all active stacks, which hands a
  key to the most recently activated stack only; two capture listeners on
  the same target would both fire, and `stopPropagation` does not stop the
  other. `useIsTopFrame()` tells a frame it is the top of its stack even
  while the window has no focus (`useIsTop()` stays false then, so frames
  that grab the focus on a re-render leave it alone).
- **Focus follows presses** (S2): a document `pointerdown` listener in the
  capture phase focuses and raises the window pressed in, and takes the
  focus from the windows on any other press (game text, input, a pane,
  the bar, a popup); the game input gets the DOM focus back when it was in
  a window. The bar's Profile and Scripts carry `data-wc-window-btn`, so a
  press on them keeps the focus and their toggle sees the window focused.
  A window without focus never takes the DOM focus: a `focusin` into it is
  sent back. Windows carry `data-wc-own-keys`, so the input pane's
  document mouseup and window-focus routing leave them alone. Opening the
  ESC menu takes the focus from the windows.
- **Opening:** the bar's icons and `#profile` / `#scripts` toggle: closed →
  open and focus; open without focus → raise and focus; focused → the close
  request. The ESC menu's Profile and Options → Scripts open the window and
  close the menu (`EscActions.openWindow`, `OpenWindowCtx`), so a profile is
  never edited in two places. The icons are marked (`is-open`) while their
  window is open.
- **Profile window:** its root frame loads the active profile's editor over
  itself (`editProfile`, `profileEditOptions`: live apply while connected,
  `flushWriteBack` before the read) and closes the window once the editor
  is left, unless the editor left with a failure flash (a failed save or
  apply): then the flash stays, Enter opens the editor again, Esc closes.
  Title `Profile: <name>`. **Scripts window:** `ScriptsFrame` as its root.
- **Close request** (`StackControl.requestClose`): the X, Esc on a root
  frame, the toggle and Esc from the input leave the stack as Esc would,
  frame by frame. A frame that asks first registers
  `useUnsaved(dirty, prompting)` (the profile editor and the script
  editor). The request sends Esc to the top frame; after every pop it goes
  on with the next frame; while the top frame prompts (or saves) it waits;
  the prompt closing with the frame still there (Keep editing) drops it.
  An Esc that closed something inside a frame (a search, a pop-up) is
  repeated, up to six times. The root's Esc calls `onRootBack`, which
  closes the window.
- **Esc in the game input** (S2): scrolled back → bottom; else the open bar
  popup; else the topmost window gets the focus and its close request (so
  its prompt can be answered); else, in the cockpit's fullscreen, the Exit
  popup; else the ESC menu.
- **Leaving the cockpit:** the windows close with it (Exit, the start
  page); unsaved changes are discarded. The Exit popup shows a warning line,
  `Unsaved changes in an open window will be lost.`, when a frame's `dirty`
  says so.
- **Esc in fullscreen:** while the cockpit is shown in page fullscreen the
  menu bar asks for the Esc key with the Keyboard Lock API
  (`navigator.keyboard.lock(['Escape'])`, Chromium) and unlocks when
  fullscreen ends, the cockpit is hidden or the bar is disposed. Esc then
  reaches the page and follows the order above, ending at the Exit popup
  instead of the ESC menu; a press and hold of Esc still leaves fullscreen.
  Firefox and Safari have no Keyboard Lock: Esc leaves fullscreen there,
  and nothing opens the Exit popup on a fullscreen exit. The phone and the
  HTML replay page are unchanged. `#fullscreen` uses the bar's toggle.

## Consequences

- Profile and Scripts no longer cover the game: the user can play with
  them open. Keys belong to the last press, so macros do not fire while a
  window has the focus, as with the ESC menu.
- The profile editor and the script editor carry one `useUnsaved` line;
  other frames need nothing to live in a window.
- An ok flash at the end of the editor (`Saved default.`, `Profile
  updated.`) is no longer seen, since the window closes, as with the ESC
  menu's interim target in 30a; the UI pane's lines still report saves and
  applies.
- The e2e specs that reached the editor or the Scripts page through the
  ESC menu on desktop now find them in the windows.
- Firefox and Safari users still leave fullscreen with Esc.

## Addendum (2026-11-01, stage 30f)

The ESC menu is gone where the windows exist (ADR 0112). The menu's
Profile and Options → Scripts no longer open the windows
(`EscActions.openWindow`, `OpenWindowCtx` and `Shell.openWindow` are
removed; on the phone they are frames, as before), and "opening the ESC
menu takes the focus from the windows" is gone with `WindowsHandle.blur`.
Esc in the game input ends after the Exit popup in fullscreen with
nothing, not the ESC menu. The windows still stack below z-index 100,
where the phone's ESC menu sits; the phone has no windows.
