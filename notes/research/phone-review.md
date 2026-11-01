# Phone review — a phone-first WebCockpit

Date: 2026-11-01. Status: **brainstorm, nothing decided.** Owner request:
a broad review of how the phone works today and how the phone experience
could be redone, with a focus on working as well as possible from the
phone. Not every feature has to be reachable from the phone. The start
menu and the ESC menu are not made for touch.

Mockups: the "WebCockpit phone review" design canvas (claude.ai artifact
`LDJAQLb64W4Cnzkw4zfz56`): an overview, today's screenshots, three
directions (A Terminal, B Hybrid, C Touch-native) with 13–14 screens each,
and studies of text width, tablet and platform. Screenshots of today's UI
were made with a Playwright tour (390×844, DPR 3, `?phone=1`, mocked MUME).

Builds on: intent Goal 12, spec §2.12, ADR 0075, 0081, 0086, 0097, 0098,
0112, stage 19, `notes/research/mobile.md`.

## 1. Owner answers (2026-11-01)

| Question | Answer |
|---|---|
| Ambition | Explore **L1 Companion** and **L2 Light play**. Full play on the phone is not relevant. |
| Users | Existing players and new players (a Discord link) **equally**. |
| Orientation | Portrait and landscape **equally**. |
| TUI strictness | **Show all**: pure TUI, hybrid, touch-native. |
| Play helpers to explore | Direction buttons, quick buttons, history and suggestions, chat reply: all four. |
| Menu access in play | Explore several. |
| Platform | Home screen / PWA, keep the screen on, automatic reconnect. Vibration only if cheap. |
| Tablet | Works fairly well today, except that the keyboard takes almost the whole screen. Touch buttons (N S E W U D, Flee…) worth exploring; the owner is unsure they are interesting. |
| Start menu entries | All kept for now (the owner is unsure). |
| Profile editing depth | Explore. |
| Settings on the phone | Text size and theme, which views, pane details, weather and input. |
| Text width (NAWS 80, rewrapped) | Explore. |
| Login | Explore **saving name and password** on the device. |
| What hurts most | Small targets, the menus, playing/typing, readability: all four. |
| Panes | Explore merging/combining. |
| Delivery | A mockup page plus this note. |
| **Desktop** | **Must not be affected negatively in any way** (owner, during the session). |

## 2. Today — findings

From the code inventory and the screenshot tour. File references are as
of `main` at `da5fb37`.

### 2.1 Targets and touch

- Almost every target is one cell high, about **15 CSS px**: start and ESC
  menu rows, Options rows, phone tabs (40–48×15), the input row (14). The
  `☰` is **16×14 px** (`.wc-menu-btn`, `src/ui/ui.css:376`). Rating stars
  are 8×15. Only the fullscreen button is 44×44.
- The **fullscreen corner button** (ADR 0097) sits over content on every
  screen: game text, CHAR "L25", Group bars, the Comm "Soc" filter, the
  editor's HELP, the script editor's DUPLICATE, the Statistics header,
  Credits' "Escape to exit", the Spotlights card.
- Cyclers and steppers (Font, Size, Padding…) change only through the
  `<< >>` arrows, which are invisible until the row is selected; a tap on
  the label steps a cycler forward only and does nothing on a stepper
  (`MenuRow`, `src/chrome/kit/widgets.tsx:343-388`).
- Footers are mostly keyboard hints (`↑↓ Navigate`, `Tab/←→ Cycle`,
  `PgUp/PgDn Help`, `0-5 Rate`, `B Blank profile`, `R Refresh`, `n New`,
  `Del Delete`, `Ctrl+F Find`). They wrap on a phone and eat body rows.
  Tappable ones (`Y Exit`, `ESC Back`) look exactly like the plain hints.
- The profile editor LITE view deletes an entry only with the **Delete
  key** (`src/editor/frame.tsx:986`): no tap path.
- Comm **solo** needs a right mouse button (`src/panes/comm.ts:238`).

### 2.2 Menus

- The ESC menu fills the screen, draws a border (2 of ~41 columns), the
  animated banner, a `Continue` row and a keyboard footer; the rows sit in
  the top third, out of thumb reach (shot 33).
- Options has two "Appearance" pages. Turning a pane (= a tab) on or off
  lives only in **Options → Panes → Appearance**, a 67-column colour grid
  with 3-cell targets that must be swiped sideways (shot 55). Timers is 76
  columns. The Appearance preview is 54 columns and runs off the edge.
- Settings that mean little on a phone: pane tints and borders, padding,
  input colour, bold brightens, ANSI palette, Reset layout (on a phone it
  only changes the tab order, which comes from the desktop dock order),
  map "Room info on **hover**" and "Hover text size", cursor style.
- In-game Profile edits only the active profile; switching is on the
  start page only.
- The Scripts help panel is dropped on a narrow phone (`detailW: 0`), so a
  script's help and settings are not visible there.

### 2.3 Playing and typing

- Everything is typed. The keyboard takes about half the screen. No
  on-screen way to browse the history (↑↓), accept a suggestion (Tab/→),
  page the output or jump to the bottom.
- Macros are dead on a soft keyboard (`KeyboardEvent.code` is empty) and
  macro creation says "Key capture: desktop only."
- Login is text: MUME asks for the name, then the password.

### 2.4 Reading

- The phone reports **at least 80 columns** to MUME (`PHONE_MIN_NAWS_COLS`,
  `src/layout/phone.ts:45`) so MUME's tables and the triggers that match
  whole rows keep working; the output then rewraps to ~41–42 columns.
  Prose wraps raggedly, tables (who, equipment, locate life) break.
- CHAR, GRP and TIME are separate tabs, each about 80 % empty (shots
  26–29). GRP bars have no labels or numbers. On the dark theme SNEAK /
  RIDE / CLIMB / SWIM look off whether they are on or not.
- Landscape shows one view at a time with 93 columns; no side pane.
- The tab strip hides its scrollbar: no sign of tabs off-screen.

### 2.5 Small defects seen

- New Profile shows no visible input box, only `>`.
- History: the body overflows by ~13 px, so one swipe scrolls the filter
  strip out of view (shot 14).
- After a server drop the ESC header still says `Link: 1ms`.
- About and the script manual describe the desktop ("the menu bar").
- Doc drift: ADR 0081's default tab order (`GAME CHAR TIME GRP COMM MAP`)
  differs from what `defaultLayout()` gives today (`GAME CHAR MAP GRP
  TIME COMM`).

### 2.6 What works

Keyboard-up keeps the strip and the input visible; the input never hides
under the keyboard; the map follows and pinches well; the resume check
finds a dead link; the password field swap; Paper reads well.

## 3. Principles

1. **Desktop is untouched.** Everything is behind `device().phone` (and,
   for tablet items, an explicit tablet gate). No change in a shared path
   without a flag branch whose desktop side is today's code. Desktop e2e
   must stay green without edits; new behaviour gets phone e2e. Settings
   the phone adds live under their own keys and are ignored by desktop. A
   profile or settings file moved from a phone to a computer must behave
   on the computer exactly as before.
2. **Read at the top, act at the bottom.** Everything you tap sits in the
   lower half (thumb reach); text and status sit at the top.
3. **44 px** minimum target. No keyboard hints on touch: an action is a
   button or it is not shown.
4. **Game text first.** Chrome folds away when the keyboard is up; nothing
   floats over the text.
5. **Configure on the computer, adjust on the phone.** The phone gets a
   small settings subset; the rest is untouched and keeps its value.
6. **No keyboard needed for the common things** (L2): walk, flee, look,
   reply, repeat.
7. Same identity: black, monospace game text, amber selection, the teal
   wordmark, the surface tokens (ADR 0116).

## 4. Feature decisions (proposal)

Legend: **keep**, **simplify**, **new**, **computer only** (hidden on the
phone; the code and the setting stay for desktop).

### 4.1 Start page

| Today | Phone proposal |
|---|---|
| Banner (45×11) | simplify: smaller wordmark; banner animation optional |
| Enter MUME | simplify: **character cards** with Play; "Add character"; "Play without saving" |
| Profile | simplify: pick, new, rename, delete, **import** (the only bridge from a computer: no sync); export computer only; edit depth per direction (§5) |
| Scripts | simplify: switches, help and settings in a sheet; new, import, export, rename, delete, editor, manual computer only |
| History | simplify: card list, filter by character, play, rate, keep, delete, stats; export (already desktop only), backup, restore computer only |
| Spotlights | keep |
| Credits | simplify: folded into About |
| About | keep, phone-aware text |
| Footer `↑↓ Navigate · Enter/Space Select` | gone on the phone |
| Update / storage notices | keep, as a small banner card |
| Fullscreen corner button | gone; Fullscreen in the menu (Android), and the installed app is fullscreen anyway |

### 4.2 In game

| Today | Phone proposal |
|---|---|
| Tab strip at the top, 15 px | simplify: **bottom navigation** GAME · COMM · STATUS · MAP (≥ 48 px); swipe between views |
| CHAR, GRP, TIME tabs | simplify: one **STATUS** view (character, group, timers) |
| COMM | keep, with filter chips, long-press solo, reply, unread badge |
| MAP | keep; zoom and re-centre buttons; pad overlay in L2 |
| UI pane | computer only (already off on a phone) |
| Script panes | keep, as extra views (in the nav's overflow or under STATUS) |
| Temporary script panes | keep, over GAME |
| `☰` 16×14 | simplify: 44 px menu button |
| Clock strip in the input row | simplify: into STATUS / the menu header |
| Scrolled back | new: "↓ N new lines" pill |
| HP / Mana / Move | new (L2): one-line status strip with the opponent's condition |
| Macros | new (L2): **quick buttons** seeded from the profile's numpad macros; a direction pad |
| ↑↓ history, Tab suggestion | new: history chips above the keyboard; a suggestion chip |
| Tells while on GAME | new: a toast with Reply |
| Comm solo (right click) | simplify: long press |
| Map info (long press) | keep |
| Statistics pane | menu → Statistics while a run is on |

### 4.3 Menu (today the ESC menu)

| Today | Phone proposal |
|---|---|
| Opened by `☰`, Esc, `#menu` | keep the ways in; opens as a sheet/drawer/page per direction |
| Status header Profile · Link · capture | keep, compact: "Rasta · Link 38 ms · Recording" |
| Banner | gone |
| Continue | gone (closing the menu is enough) |
| Reconnect | simplify: automatic reconnect plus a banner button (§6.6) |
| Statistics | keep |
| Profile (live editor) | simplify: **Quick buttons & profile** |
| Options | simplify: **Settings** (§4.4) |
| Exit session, rating | keep, big stars |
| — | new: Fullscreen (Android), About |

### 4.4 Settings on the phone

| Setting | Phone |
|---|---|
| Font size | keep: − N + stepper with a live preview line |
| Background / theme | keep: swatches (font colour and palette follow, ADR 0061) |
| Font | keep: picker list |
| Which views, and their order | new: switches plus drag to reorder; phone-only order |
| Comm channels | keep: chips |
| Comm "show channel header" | computer only (the chips are the header) |
| Group: show players, NPC visibility | keep |
| Timers: which groups | keep |
| Timers: colours, column cap, clock, bar, headers, compact | computer only |
| Map: show, tileset, room notes | keep |
| Map: room info on hover | simplify: "on long press" (Off/Minimal/Full) |
| Map: hover text size, background colour, import, bundled | computer only |
| Weather effects | simplify: one switch (off by default on a phone, as today) |
| Auto-clear input, autosuggest | keep |
| Cursor style and blink | computer only |
| Padding, font colour, input colour, bold brightens | computer only |
| ANSI palette, hex, reset palette | computer only |
| Scrollback | computer only; consider a phone default of 5 000 (memory) |
| Pane colours and borders, Reset layout | computer only |
| Keep screen on while connected | new |
| Reconnect automatically | new |
| Vibrate on tell | new, Android only (`navigator.vibrate`; iOS has none) |
| Quick buttons | new (§6.3) |

## 5. Directions

All three carry the same features (§4); they differ in look, navigation
and profile depth. Each is shown at L1 (A03, B03, C03) and L2 (A04…).

### A — Terminal (pure TUI, made big)

Everything stays a monospace cell grid. Rows are 3 text rows tall with
box-drawn button cells; menus are lists of tall rows anchored to the lower
half; a two-row TUI tab bar sits at the bottom above the input; quick keys
are a Termux-style extra-keys row; settings are `[ − ] 14 [ + ]` and big
`[X]`. Profile: **select only** (aliases, actions, highlights edited on a
computer).

- For: closest to the intent ("very close to Cockpit", TUI look); reuses
  the chrome kit (cell grid, `MenuRow`, frames); the smallest conceptual
  jump for existing players.
- Against: a cell grid is a poor medium for 44 px targets (each target
  costs 3 rows of a ~45-row screen); sliders, sheets and swipes feel
  foreign; the kit's keyboard-first frame stack still shows through.
- Cost: medium. Mostly new phone frames in the existing kit plus the
  bottom bar and key row.

### B — Hybrid (TUI game, touch chrome)

Game text and pane content stay TUI. The chrome around them is touch-made
in the client's own idiom: surface panels (ADR 0116 tokens), monospace
labels, rounded panels, a bottom navigation bar with icons and labels,
**bottom sheets** for the menu and settings (the game stays visible and
dimmed above), a chip bar of quick buttons, a pad sheet. Profile: **simple
list editor** (quick buttons, aliases, highlights, actions as lists; no
code editor).

- For: the best fit for touch without losing the identity; sheets keep
  the game in view; the settings popup (ADR 0107) already shows the
  pattern on desktop (sliders, swatches, switches), so components and
  tokens exist to borrow from; surfaces follow every background (B14 on
  Paper).
- Against: two UI idioms on one screen; more new phone components.
- Cost: medium–large. New phone shell (nav, sheets, chips) in DOM rather
  than the cell grid.

### C — Touch-native (an app around the text)

Only the game text stays TUI. A top app bar (name, link dot, menu), a
left drawer, a bottom tab bar, COMM as a **chat view**, STATUS as cards, a
floating pad button that opens a compass, grouped settings lists with
switches, sans type. Profile: **list and code** (today's depth, touch
friendly).

- For: the most familiar to new players from other apps; the most
  comfortable for chat; the clearest hierarchy.
- Against: the furthest from the TUI identity and Cockpit; an app bar
  costs height; the most new code; two looks to maintain (phone vs
  desktop) become clearly different products.
- Cost: large.

### Recommendation for discussion

**B (Hybrid) as the base**, with A's bottom key row as the L2 quick-key
idea if the chip bar feels too soft, and C's chat-style COMM as an
optional later step. B keeps the game TUI, gives proper touch targets and
reuses the desktop popup's controls and the surface tokens. Profile depth:
B's simple list editor, with the code editor left as "edit on a computer"
(or C's List | Code if the owner wants today's depth).

## 6. Cross-cutting proposals in detail

### 6.1 Launcher and saved login

- Character cards: name, last played, profile, Play. Stored per device
  (IndexedDB, phone only), so desktop never sees them.
- **Login over GMCP:** MUME accepts `Char.Login {name, password}`
  (`/home/ole/MUME/docs/gmcp.md`, Char table). Sent after `Core.Hello`
  while in the login state, it logs in without matching text prompts.
  With the name only, the client can send the name and let MUME ask for
  the password (the password field swap already exists).
- **Saved password:** stored as plain text in the browser's storage (no
  secret to encrypt it with in a serverless client). Shown with "Stored
  unencrypted in this browser." Off by default, per character. Anyone
  with the unlocked phone can play the character. The owner chose to
  explore this; it needs an explicit yes before building.
- "Play without saving" keeps today's flow.
- To verify: MUME's reply when `Char.Login` fails (wrong password), and
  whether it works on the WebSocket endpoint the client uses.

### 6.2 Navigation and views

- Bottom navigation with 4 fixed slots: GAME, COMM, STATUS, MAP; script
  panes go under a "More" slot or into STATUS. Swipe left/right between
  views (the map keeps one-finger pan, so swiping there needs an edge
  zone or is off).
- STATUS combines Character, Group and Timers in one scrolling view, each
  a section; script panes may add sections. Group bars get labels and
  numbers.
- The phone's view order and on/off live in phone-only settings; the
  desktop layout is not written (as today, ADR 0075 §3.1).
- Landscape: game left (~60 %), a side view right (COMM, STATUS or MAP),
  the input under the game.

### 6.3 Input and play helpers

- **History chips** above the keyboard: the last 4–6 distinct commands;
  a tap sends (or fills, a setting); a ↑ button opens the full history.
- **Suggestion chip:** the existing autosuggest's candidate as a chip.
- **Quick buttons:** label → command, seeded once from the profile's
  macros on numpad keys (`Numpad8 north` … `Numpad0 flee`), then edited on
  the phone. Stored in phone settings (not the profile) so the profile
  language and desktop are untouched. Alternative for later: a profile
  command shared with desktop (a desktop change, asked first).
- **Direction pad:** N S E W U D plus Look/Exits in the middle; shown as a
  sheet (B), an overlay on MAP (all), or a compass from a floating
  button (C).
- Commands from buttons go through the normal send path (aliases apply,
  echo, history), as a typed line would.
- Keyboard up: the nav hides, the status strip stays, the chip row sits
  on top of the keyboard.

### 6.4 Comm

- Filter chips (tap toggles, long press solos), an unread badge on the
  COMM slot, a toast for tells while on GAME, **Reply** fills `tell
  <name> ` (or `reply`-style per channel: narrate → `narrate `), Copy.
- Optional: vibrate on a tell (Android only, only while the page is open).

### 6.5 Menu and settings

As §4.3 and §4.4, opened by the 44 px menu button. Sheets in B, drawer in
C, a tall-row page in A. Settings are built from phone components that
read and write the same settings store.

### 6.6 Reconnect

- Today (ADR 0075 §3.4): on resume a dead link opens the ESC menu with
  Reconnect selected.
- Proposal: with "Reconnect automatically" on, a dead link found on
  resume reconnects at once and logs in with `Char.Login` when the
  password is saved (MUME then resumes the linkdead character); a banner
  says "Connection lost in the background — reconnecting…" with Cancel,
  then "Logged in as Rasta". On failure or without a saved password: a
  big Reconnect button over the game (and MUME's own prompt).
- Never after a user's own disconnect or exit; at most one attempt per
  resume; not in replay.

### 6.7 Text width

| Option | What | For | Against |
|---|---|---|---|
| W01 today | NAWS ≥ 80, client rewraps to ~42 | triggers and tables intact in the data | ragged prose, broken tables on screen |
| W02 real width | NAWS = view width | MUME wraps prose cleanly | MUME splits table rows; whole-row triggers miss |
| W03 wide blocks swipe | NAWS 80; prose rewrapped; aligned/tabular lines kept unwrapped in a sideways-swipeable block | tables readable, prose fine, triggers intact | needs a "tabular" detector; a swipe per table |
| W04 wide blocks shrink | as W03, but the block is drawn at a smaller font so 80 columns fit; tap to enlarge | no sideways swipe | small text |
| W05 landscape | turn the phone: 80+ columns fit | no code | only in landscape |

Suggested: **W03** (with W04 as a per-block toggle), keeping NAWS 80 so
triggers and logs are unchanged. The detector can start simple: a run of
≥ 2 lines with column-aligned double spaces, or MUME's known tables. To
study: how MUME's `change width` interacts, and what the run logs show.

### 6.8 Platform

- **What a manifest is:** a small JSON file that tells the phone the site
  can be installed as an app: name, icons, colours, `display: standalone`.
  With it, "Add to Home Screen" gives an icon that opens fullscreen with
  no address bar, and on iPhone Safari stops deleting the site's storage
  after 7 days without a visit (profiles survive). No service worker is
  needed for that; update checks (ADR 0025) are unaffected.
- **Desktop guard:** a manifest link in `index.html` would let desktop
  Chrome offer "Install" too. To keep desktop unchanged, add the
  `<link rel="manifest">` at startup only on a phone (to verify that
  Chrome and Safari pick up a link added by script), or accept the
  desktop install icon as harmless (owner's call).
- An install card on the launcher (P01): Android's install prompt, or
  the Share → Add to Home Screen steps on iPhone. Dismissible, once.
- **Keep the screen on:** Screen Wake Lock while connected and visible
  (`navigator.wakeLock.request('screen')`, re-acquired on return). Chrome
  Android, Safari 16.4+ (installed apps 18.4+). Does not stop linkdeath
  when the app is switched away.
- **Vibration:** `navigator.vibrate` on Android only; cheap.

### 6.9 Tablet

The owner's issue: on a tablet the keyboard covers most of the screen.
Two options, gated on touch and not phone (tablet only; desktop has no
touch flag):

- T02: a "keyboard" toggle in the input row; with the keyboard closed, a
  slim button panel (pad and quick buttons) at the bottom right.
- T03: a one-row accessory bar on top of the keyboard (N S E W U D Flee,
  history).

Could reuse the phone's quick buttons. The owner was unsure; a later,
small add-on.

### 6.10 What happens to the ESC menu code

On the phone the new menu replaces the ESC menu. Its frames (`EscMain`,
`ProfileEntry`, `ExitConfirm`, `LiveStatsFrame`) and the phone-only
Options → Panes → Appearance can then go (ADR 0112 left them for "the
phone stage"). `#menu`, `#settings`, `#profile`, `#scripts`, `#panes`,
`#exit` open the new phone surfaces; desktop's hint text is unchanged.

## 7. Risks and open questions

1. **Which direction**, or which mix (recommendation: B).
2. **L1 first, L2 later**, or both in one stage?
3. **Saved passwords** in plain browser storage: yes or no?
4. **Text width**: W03, W04, or both?
5. **Tablet** buttons: in, later, or out?
6. **Profile depth** on the phone: select only, simple list, or list and
   code?
7. Quick buttons in phone settings (no desktop effect) or in the profile
   (travels to desktop, needs a profile-language change)?
8. Manifest link: phone only (to verify) or also on desktop?
9. Start menu: are Scripts and Spotlights worth a slot on the phone, or do
   they go under "More"?
10. Does a phone with a physical keyboard (ADR 0098) keep Ctrl/Alt+1…9 for
    the new views? (Suggested: yes, by position.)
11. Memory: a phone scrollback default of 5 000 lines?
12. Intent Goal 12 says "log in, read and chat; real play is not a goal".
    L2 widens that to light play: an intent amendment for the owner.

## 8. If this becomes a spec: a possible stage plan

Each step ends with an owner test on the real phone; desktop e2e stays
unchanged throughout.

1. **Phone shell.** Bottom navigation, STATUS view, 44 px menu button,
   the new menu and settings subset, no fullscreen corner button, no
   keyboard footers on the phone, the small defects of §2.5. (L1.)
2. **Launcher and login.** Character cards, add character, `Char.Login`,
   saved password (if approved), automatic reconnect, phone-aware About
   with Credits, History/Scripts phone views.
3. **Chat.** Filter chips, long-press solo, unread badge, tell toast,
   Reply, vibration.
4. **Light play (L2).** Status strip, quick buttons, direction pad,
   history and suggestion chips, map pad.
5. **Text width.** Wide blocks (W03/W04).
6. **Platform.** Manifest and install card, wake lock.
7. **Tablet (optional).** Button panel or accessory bar.

Documents to touch: intent Goal 12 (ambition), spec §2.5, §2.6, §2.12,
new ADRs (phone shell, saved login, quick buttons, wide blocks, manifest),
amendments to ADR 0075, 0081, 0097, 0112.
