# Phone support — research

Date: 2026-10-04. Status: research only, nothing decided. Owner request:
explore what opening WebCockpit on a phone would mean, with **no change to
the desktop experience**. Everything below is meant to be gated behind a
phone check, so desktop code paths stay as they are.

`intent.md` (Non-goals) says "Mobile and tablet: desktop Firefox and
Chrome only". Any build work needs an intent amendment first.

Nothing here was tested on a real device. Browser behaviour is from known
platform behaviour (WebKit/Chrome docs), not measured.

## 1. Why it fails today

- **Size guard.** `MIN_VIEW_COLS = 60`, `MIN_VIEW_ROWS = 18`
  (`src/layout/allocate.ts:101-102`). The start page and menus have their
  own copy (`src/chrome/kit/nav.ts:196-197`, `src/chrome/index.tsx:61`).
  Below it the cockpit is replaced by "Window too small" and goes `inert`,
  input line included (`src/layout/cockpit.ts:799-813`).
- **Grid at the default font** (DejaVu 15 → 9×17 CSS px cell):

  | Device | Cols × rows | Result |
  |---|---|---|
  | 390 px portrait | ~43 × 38–44 | too small |
  | 360 px portrait | ~40 cols | too small |
  | 844×~370 landscape | ~93 × 20–22 | fits; game pane ~59 cols |
  | landscape, keyboard open | ~93 × 9–11 | too small, inert |

  Portrait reaches 60 cols only at font size ≤10.
- **"Desktop mode"** makes the browser lay out ~980 px and scale it down,
  so cells are 6–8 px on screen. That is why it runs but menus are hard
  to hit.

## 2. Findings by area

### 2.1 Layout and rendering
- `allocate()` is a pure function with one call site
  (`cockpit.ts:668`). A separate phone allocator/model can be picked at
  startup without touching the desktop one.
- Output scrolling is native `overflow-y: auto` (`ui.css:69-75`); touch
  flick scrolling should work as is.
- Nothing uses `visualViewport`, `dvh`, `interactive-widget`,
  `viewport-fit=cover`, safe-area insets or `(pointer: coarse)`.
  The keyboard will cover the bottom input line, or (if the viewport
  resizes) push rows under 18.
- Viewport resizes re-wrap text and send NAWS on every step; no debounce
  for the keyboard animation.
- Map: one-finger pan works (pointer events, `touch-action: none`,
  `src/panes/map.ts:108-115`). No pinch zoom (wheel only, ADR 0059).
- Docking drags/resize grips have no `touch-action: none`; touch drags
  become page scrolls. Pane close cross is `:hover` only
  (`layout.css:90`).

### 2.2 Input, keys, focus
- Command line is a native `<input>` with autocorrect etc. off
  (`src/ui/input-pane.ts:235-244`), keys matched on `e.key`, `isComposing`
  respected. Typing should work on Gboard and iOS.
- **Focus is the biggest problem.** Three mouseup handlers refocus the
  input (`output-pane.ts:728-737`, `cockpit.ts:1125-1135`,
  `input-pane.ts:817-826`), plus window focus (`input-pane.ts:828-832`).
  A tap fires a compatibility mouseup, so the soft keyboard pops up on
  every tap.
- **ESC menu opens only on the Escape key** (`input-pane.ts:646-649` →
  `app/shell.ts:310`). No button, no `#menu` command.
- **All macros are dead**: names come from `KeyboardEvent.code`
  (`src/script/keys.ts:125-166`), which soft keyboards leave empty.
  Movement in the default template is Numpad-only
  (`src/profiles/template.tin:6-15`).
- History (↑/↓) and autosuggest accept (→/End/Tab) have no keys on a
  phone.
- Enter is sent from keydown only and skipped while composing
  (`input-pane.ts:501,640`); possible lost Enter on some IMEs. Script-pane
  fields read `e.code` for Enter/Esc (`script-pane.ts:612-627`), at risk.
- iOS zooms into inputs with font < 16 px.
- Script-pane links (press + release on the same link) work by tap;
  tooltips are hover-only (already accepted, ADR 0032/0053).

### 2.3 Chrome, menus, frames
- Frame stack is keyboard-first; Esc pops (`chrome/kit/stack.tsx:162-189`).
  Several frames have **no tappable Back** (footer `'ESC Back'` is plain
  text, `widgets.tsx:85,146`): About, Statistics, Credits, import report,
  create-profile choice/copy. The profile editor exits only on Esc.
- Hit targets are one cell high and only the text spans are clickable
  (`widgets.tsx:302-318`); stepper/cycler arrows act only on the selected
  row.
- `.wc-body` is `overflow: hidden` and scrolled only by the cursor
  (`kit.css:48-52`); long option pages cannot be swiped. `.wc-scrollbox`
  tables can.
- History: a tap selects and opens the player at once
  (`history.tsx:449-453`), so RATE/DELETE need open-and-close.
- Hover is cosmetic only, apart from the player's marker tips.

| Screen | Verdict on a phone |
|---|---|
| Start menu, ESC menu | works with bigger targets, a Menu button, relaxed guard |
| Options | needs swipe scroll and bigger stepper targets |
| Profiles | needs tappable Cancel/Back |
| Profile editor, lite | needs a Save & back button; ≥40 cols |
| Profile editor, text (CodeMirror) | usable for light edits; Find is keyboard-only |
| Scripts | small tweaks |
| History | tap-to-select vs open; 60+ cols |
| Statistics, About, Credits | work with a tappable Back |
| Log player | mostly works |
| Export editor | desktop-only |
| Key capture (macro editor) | needs a physical keyboard by nature |

### 2.4 Platform
- **Background = linkdeath.** iOS suspends a backgrounded tab (and a
  home-screen app) within seconds to a minute; Android throttles and
  freezes. The socket dies, MUME sees linkdeath. There is no auto
  reconnect today ("Press Enter to reconnect", `app/app.ts:541-552`) and
  no `visibilitychange` handling. **No browser API fixes this**; only a
  server-side relay could, which breaks the no-server constraint.
- Screen Wake Lock (Chrome Android; Safari 16.4+, home-screen apps 18.4+)
  keeps the screen on while in front. Nothing more.
- **Storage:** `navigator.storage.persist()` is already called
  (`core/db.ts:118-127`). Safari's ITP deletes script storage after 7 days
  without a visit unless the site is added to the home screen. Profiles
  can be lost on iOS.
- **Memory:** 20 000-row scrollback ≈ 80+ MB DOM. iOS kills tabs at a few
  hundred MB. A phone default (e.g. 5 000) would be safer. Lua (wasmoon,
  ~270 KB) is small. WebGL map + 6.8 MB map data in a worker is the other
  big consumer.
- **Fonts:** no `text-size-adjust`; iOS may inflate text in landscape
  and break the measured grid. Device-pixel cells (ADR 0050) handle DPR 3.
- **PWA:** no manifest, no service worker. A manifest with
  `display: standalone` gives full screen, lifts the 7-day ITP rule on iOS
  and does not change desktop. A service worker would interact with
  update notices (ADR 0025); not needed.
- Tests: Playwright runs Firefox and Chrome only (`spec.md:571`); a mobile
  emulation/WebKit project would be needed.

## 3. Possible scope, in steps

All gated on a phone check (e.g. `(pointer: coarse)` plus small screen,
or `?phone`), decided once at startup.

**A. Touch fixes (S–M).** Also helps today's "desktop mode".
Menu button in the cockpit and `#menu`; every `ESC …` footer token
tappable (dispatches a synthetic Escape, so the desktop path runs);
no refocus on touch taps; full-row hit targets; swipe-scrollable
`.wc-body`; `touch-action: manipulation`; `text-size-adjust: 100%`.

**B. Phone layout (L).** Lowered size guard on touch only; separate phone
allocator: game + input, panes as switchable full-screen tabs or a bottom
sheet, no drag/resize; keyboard-aware sizing (`visualViewport`), input
pinned above the keyboard, debounced NAWS; safe-area insets; 16 px input.

**C. Touch play (M).** On-screen direction pad and macro buttons that fire
the profile's existing keys (`Numpad8` etc.), so profiles work unchanged;
history and suggestion buttons; map pinch zoom.

**D. Phone platform (S–M).** Web app manifest and icons; Wake Lock while
connected; detect a dead socket on resume and offer one-tap reconnect;
smaller scrollback default on phones; ITP warning / export reminder on
iOS; mobile emulation in Playwright.

Desktop-only even with phone support: export editor, macro key capture,
docking/arranging panes, probably backup/restore.

## 4. Decisions for the owner

1. Amend `intent.md`: is the phone a goal, and at what ambition (fix
   desktop mode only / companion for chat and light play / full play)?
2. Portrait, landscape or both?
3. Portrait means ~43 cols at a readable size: accept narrow game text,
   or require landscape for play?
4. Which panes and features exist on a phone?
5. Accept that switching app or locking the screen causes linkdeath.
