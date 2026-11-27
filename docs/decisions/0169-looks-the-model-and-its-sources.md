# 0169 — Looks: the model and the order of its sources

Date: 2026-11-26. Status: accepted (stage 80 part A; parts B–E build on
it). Related: ADR 0166 addenda 10–12 (the engraved portraits), ADR 0170
(the token library), ADR 0150 (spaces), ADR 0151/0152 (the sync engine),
`docs/stages/80-character-tokens.md` §1, §4, §5.

## Context

Stage 80 lets a player choose the picture of a character (a *look*): the
portrait in the Character pane, a round token on the map and in Group.
Three panes draw looks and four sources can give one (your choice, the
directory's shared token, the engraved drawing by race and sex, a name
match for NPCs). If each pane decided by itself they would drift.

## Decision

- **`LookRef`** (`src/looks/types.ts`): `{src:'auto'}`, `{src:'lib', id}`
  or `{src:'own', id}`. One look gives both sizes. `auto` is stored too: a
  reset to automatic is an entry, so it beats an older choice on another
  device.
- **One pure resolver** (`src/looks/resolve.ts`), asked by every pane:
  `resolveSelf` (rows 1, 3, 4) and `resolveMember` (rows 1–5):

  | # | Yourself | A group member |
  |---|---|---|
  | 1 | your choice | your assignment for the name |
  | 2 | — | the directory's library token |
  | 3 | the engraved drawing (race, subrace, sex) | the drawing for the directory's kinds |
  | 4 | the neutral silhouette | an NPC: the library picture its name matches |
  | 5 | — | the neutral silhouette (player), the type icon (NPC) |

  The answer (`Look`) says what to draw (`lib`, `own`, `drawn` with a
  portrait id and sex, `icon`) and where it came from (`choice`,
  `shared`, `auto`, `unknown`, `matched`, `icon`): the picker's "where
  the current look comes from" line reads `from`.
- **Fallbacks are silent and one row down**: a library id the manifest
  lacks (once loaded), an own image not on the device's shelf, and in the
  pane a picture that fails to load (it falls to the drawing). The stored
  choice is kept, so an image that arrives later shows again.
- **Inputs, so the later parts plug in**: `choice` (the looks store),
  `library` (the manifest: id checks and NPC matching; null until it has
  loaded, and then ids are trusted and NPCs not matched; the caller
  resolves again on `onLibrary`), `ownImages` (part D: the ids on the
  shelf), `dir` (part E: `{race, subrace, sex, token}` as kinds; NPCs
  never have one), `mode` (`live`, or `none` where no looks are drawn).
- **Where looks are drawn**: the log player and the replay bundle get
  `mode: 'none'` (no `ctx.looks`; the bundle's library never fetches),
  i.e. the drawings as before. The dev feed (`?fixture=`, `?replay`) is
  the live app: looks are drawn; the directory is silent there because
  its caller (part E) passes no `dir`.
- **Unknown sex is male.** **Bear form**: `race` "Bear" (MUME's
  `Char.StatusVars` in the form) gives the portrait id `bear`
  (`portraitFor`); `raceKind` still says `beorning`, and a directory row
  (`dirKinds`) stays a Beorning. A chosen look does not change with the
  form. The `info` line in bear form ("You are a male Bear.") is read as
  the character's sex whichever form GMCP last reported.
- **NPC matching** (`src/looks/match.ts`): an entry's `match` words end in
  the head noun, which must be a word of the name (a plural `s` counts);
  each other word in the name adds one; most words win, a tie goes to the
  first in the manifest (characters, singles, mounts, mobs, each by id).
- **The looks store** (`src/looks/store.ts`) is one record under the key
  `looks` in the current space's IndexedDB (store `looks`, DB_VERSION 11,
  with an empty `lookImages` store for part D, so staging has one
  upgrade): `{names: {[name]: {look, at, own?}}}`, names lower case.
  `own` marks the character being played and is never pruned. At most 500
  names; the prune is deterministic (not own, `at` ascending, then name),
  so two devices agree. `mergeLooks` (per name, newest `at`, `own`
  sticks) is the sync policy part D uses. The panes read it
  synchronously; the picker's live selection is a `preview` that is
  never stored.
- **The picker** is a look-kit `Dialog` in the chrome chunk
  (`src/looks/picker.tsx`), mounted by the shell over the window
  (`AppUi.openLook` → `PaneContext.openLook`, absent in the log player,
  on the phone until part F, and in tests). It runs its own key ring
  (Tab over everything focusable, arrows in the tabs and the grid) in a
  key layer, and passes the dialog `at` for its buttons. Its CSS prefix
  is `wc-looks-`: the stage file asked for `wc-lk-`, which is the look
  kit's own prefix (hundreds of classes); a prefix of its own was the
  intent.
- **The R3 ring** colour is one function (`src/looks/ring.ts`): the hue
  muted 25 % toward grey 140; yours from the map's player colour.

## Consequences

- Part B (map) asks `resolveSelf`/`resolveMember` and bakes `drawn` looks
  at 128 px; part C adds the member assignment (`looks.choose(name, look)`
  without `own`) and passes `npc` and the manifest; part D fills
  `ownImages` and `replace`s the record from a pull; part E passes `dir`.
- An old tab (0.23.2) loses its stores when a new tab upgrades the
  database to 11 (existing behaviour, N5).

## Addendum (stage 80 part F, 2026-11-27): the picker on the phone and the tablet

- **One model, two faces.** `usePickerModel` (`src/looks/picker.tsx`)
  holds what both pickers share: the selection and its live preview,
  the tab, the library filter, the resolved and the automatic look, the
  texts (source line, share note), Cancel and Use. The desktop
  `PickerFrame` adds its dialog, its key ring and its buttons; the
  phone's `PhoneLookPage` (`src/looks/phone-page.tsx`, the chrome chunk)
  adds the phone's page. `LibraryTab` and `MineTab` (with the crop step)
  are the same components; `phone-page.css` sizes them for a finger
  (every key 44 px or more; a chip 36 px with a 4 px margin that takes
  the tap too) and maps the picker's colours to the phone's tokens, so
  Paper follows.
- **Where it lives.** The page is a view of the phone layer's menu
  (`PhoneMenu.openLook`, `view.at === 'look'`, in the menu's surface over
  the cockpit, the settings pages' look: the iron band with Back, the
  hood, the column that scrolls, a foot with Cancel and "Use this look").
  The phone chunk imports nothing of the chrome: the shell hands the
  layer a render function (`lookPage`, built on the chrome's
  `phoneLookPage`) with the app's looks store and game state. Reached by
  `AppUi.openLook` on the phone branch too (the Character card's
  portrait, a Group token), and by the Character settings' "Look…" row
  (a settings row kind `look`, shown only where there is a look page,
  dimmed until the game named the character), which opens it as a level
  of the settings page, so Back returns there. Where the phone flag is on
  but the phone's game layout is not (`?phone=1` on a large window) the
  desktop dialog opens.
- **Back.** The band's Back, Esc and the back gesture cancel (the
  preview is dropped when the page unmounts without Use); Cancel and Use
  as on the desktop.
- **The tablet** gets the same page (ADR 0140: the phone's layout, minor
  changes only), not a sheet: the library needs the height, and the
  tablet's other pages are full pages too. Its column is up to 800 px
  (960 in landscape, where the preview stands beside the tabs).
- **The search field** is the one text field: it is marked for our own
  keyboard (`ownFieldAttrs`), and the pages' keyboard takes fields in
  `[data-okb-page]` as well as `.wc-chrome` and `.wc-overlay`; over the
  look page it stands above the menu (z 450), the page ends above it and
  its foot gives way. Esc in the field lets go of it instead of closing
  the page. The menu lets a hardware keyboard type in the field.
- **The crop by touch**: a two-finger pinch zooms about the fingers'
  midpoint and follows it (`cropPinch`, pure, unit-tested); the view's
  canvas is drawn at its size on screen (the phone's is 300 px).
