# Stage 54 — The tablet's layout

Status: **In progress** (started 2026-11-12; direction changed the same day: the tablet keeps the phone's layout, see "Direction" below).

## Goal

A layout of its own for tablets in the game, between the phone's and
the desktop's. Today a tablet is "touch, not phone"
(`src/core/device.ts`, short side 600 px and up): it gets the desktop
cockpit and the device's keyboard, which covers much of the screen and
has been hard to control on an iPad.

## Owner decisions (2026-11-12)

- No more iPhone work now. 0.7.0 looked over on an iPhone: most works;
  fullscreen is missing (iOS Safari has no element fullscreen on a
  phone) and is left as it is.
- Ambition: **play in between**. Better than the phone, clearly below
  desktop; good for an XP session, probably not PvP (`intent.md`
  Non-goals, reworded the same day).
- No physical keyboard: our own keyboard (ADR 0138) is the keyboard.
- Portrait and landscape must be equally good.
- iPad (10th gen, 820 x 1180 CSS px) is the test device, over the dev
  server on the tailnet (ADR 0096). Android tablets should work; the
  owner cannot test them, so they are covered by emulation only.
- Direction: a hybrid of the phone's layout and fixed panes sounded
  most right. Not yet chosen in detail (mockups below).

## Rules

- Desktop and phone do not change. Tablet code runs only behind a
  tablet gate; shared paths change only where the owner has agreed.
- The phone chunk's rule holds (ADR 0136): what a tablet reuses from
  `src/phone/` must not grow the desktop's first load.
- Stage 52 passes C–E (scrapping the old phone layout) wait until this
  stage has settled what the tablet reuses.

## Plan

1. **Trial** — the phone's game layout and our keyboard unchanged on a
   tablet-size window behind `?tablet=phone` (branch
   `stage-54-tablet`), with screenshots at 820 x 1180 and 1180 x 820 and
   notes in `notes/research/tablet/trial.md`. The owner tries it on the
   iPad. Purpose: learn what breaks and what feels right before the
   design is fixed.
2. **Mockups** — `notes/research/tablet/README.md`. Round 1: A (panes
   always in view) and B (the phone grown up).
3. **Decision** — ADR 0140 from the owner's verdict; this file gets the
   rounds.
4. **Build** in rounds as in stage 53, each with a test guide for the
   iPad; review; release.

## Tasks

- [x] Owner's answers recorded; `intent.md` reworded
- [x] Mockup round 1 published and its sources kept
- [x] Trial flag `?tablet=phone`, screenshots and notes (branch `stage-54-tablet`; unit 4126 passed, phone e2e 118, desktop gating e2e 34; full e2e not run)
- [x] Owner: verdict on round 1 (A, with changes; see feedback)
- [x] Owner: the trial on the iPad (keyboard stays down; fullscreen flaky)
- [x] Mockup round 2 published (A refined: switches, swipe, keys above the compass)
- [x] Owner: verdict on round 2; canvas revised (one frame, draggable dividers)
- [ ] Owner: verdict on the revision; which dividers lock while the keys are on
- [ ] ADR 0140 and the build rounds

## Test guide (for now)

- **Mockups:** open the canvas "WebCockpit tablet layout, round 1"
  (best on the iPad itself, to judge sizes by hand). Wanted: A or B or
  a mix; the pane set; where the keyboard goes; size and place of the
  compass and hot keys.
- **Trial** (branch `stage-54-tablet`, not on main, not released): the
  dev server runs from the branch's worktree with `npm run dev:tailnet`
  (ADR 0096). On the iPad, in a **private tab** (stored desktop
  settings otherwise win over the phone's defaults), open
  `https://<machine>.<tailnet>.ts.net:5173/` with one of:
  - `?tablet=phone` — the live game in the phone's layout.
  - `?fixture=gmcp-demo.log&speed=0&tablet=phone` — the same, filled
    from a log, no login.
  - no flag — today's tablet (the desktop cockpit), to compare.
  The flag must be in the URL on every load. Try both orientations:
  typing with our keyboard, the compass and hot keys, the lens, the
  pane strip, Comm, the menu, a start-menu page with a text field.
  Wanted: what works as it is, what is too small or in the wrong
  place, and anything iPadOS does on its own (its keyboard coming up,
  bars, rotation). What the agent saw in emulation (Chromium only) is
  in `notes/research/tablet/trial.md` with screenshots beside it.

## Owner feedback

### Mockup round 1 and the trial on the iPad (2026-11-12)

- **A** (panes always in view) feels best in landscape and in portrait.
- The borders and details can be made finer, from our theme and how the
  desktop draws panes (frosted glass, glow and so on).
- Map, Comm and the pane box can each be **toggled** on and off.
- The pane box changes pane by a **sideways swipe**, as on the phone (no
  tabs).
- The map zooms by **pinch**.
- The hot keys go **above the compass**, as on the phone.
- All hot keys and the compass can be **hidden and shown** together. The
  room they had is then filled: by panel space in landscape, by the
  command field in portrait. The control for it is always visible;
  perhaps Map, Comm, panes and keys as a group of icons somewhere.
- **Trial on the iPad:** iPadOS's own keyboard stays down. Fullscreen
  with our keyboard up is unreliable: sometimes it works, sometimes it
  jumps back out; it flickers and things seem to be redrawn on the way
  into fullscreen. To investigate in the build.

### Mockup round 2 (2026-11-12)

- The switches sit in the command row (the top bar, X1, is not chosen).
- The column's order in landscape is right: Map, Comm, then the pane
  box beside the keys.
- In portrait the keys ride above the keyboard while typing.
- Six hot keys in two rows of three above the compass: yes.
- **One thick frame round all the panes:** Map, Comm and the pane box
  lie visually in the same floating box, with more discreet dividers
  between them. The pane headers are redone to suit (they can be more
  discreet).
- **The dividers can be dragged** between Map, Comm and the pane box.
  His words: "in portrait only between Map and Comm if the hot keys are
  on". Drawn as: in **landscape** only Map / Comm while the keys are
  on (the keys' row has a fixed height), all dividers otherwise; put
  to him to confirm which orientation he meant.

The canvas of round 2 was revised in place for the last two items
(shared `kit.css`: one frame, hairlines, grips on the dividers that
can be dragged, corner labels).

### Direction changed (2026-11-12, after round 2)

The owner: the mockups are not moving in the right direction. The
phone's layout as it is, seen on the iPad behind `?tablet=phone`, feels
very good. **The tablet keeps the phone's layout as it is, with minor
improvements only.** What chafes: our keyboard is too narrow, and
fullscreen is a little buggy. The mockups of rounds 1 and 2
(`notes/research/tablet/`) are shelved, not built.

## Direction (replaces "Plan" above from step 2 on)

1. **A tablet gets the phone's game layout and our keyboard by
   default** (today only behind the trial flag). ADR 0140.
2. **The keyboard uses the width of a tablet:** wider keys, and rows
   to suit, on a tablet-size window. The phone's sizes do not change.
3. **Fullscreen on the iPad:** find out why it flickers and sometimes
   jumps back out with our keyboard up; fix what is ours, and say
   plainly what is iPadOS's.
4. Owner test on the iPad over the tailnet, then merge and release.

### Tasks (new direction)

- [x] 54a: tablet gate (the phone's layout by default on a tablet), ADR 0140
- [x] 54a: keyboard width on a tablet
- [x] 54a: "a tap in the script editor's text does not bring up our keyboard" (owner, phone and iPad): not a bug (locked scripts; see below)
- [x] 54b: fullscreen on the iPad: investigated (`notes/research/tablet/ipad-fullscreen.md`); owner: left as it is
- [x] 54c: automatic login for the session (ADR 0141); built against a mocked MUME, the owner's live test is open (see "Test guide, 54c")
- [x] Script editor: a tap in the text does not open our keyboard: **not a bug**. The owner's scripts were locked (a read-only bundled script opens no keyboard, by design); he verified on the phone and the iPad that the keyboard comes up in a new script (2026-11-13).
- [ ] Review, owner test, release

## 54a as built (2026-11-12)

ADR 0140 has the decision; this is the short version.

- **The gate.** A third device flag, `tablet` (`src/core/device.ts`): a
  touch device, as the browser reports it, whose screen's short side is
  600 CSS px or more. It turns the phone flag on, and the shell then
  uses the phone's game layout and our keyboard whatever the window's
  size (`phoneGameWanted`, `src/app/shell.ts`), in the game and on the
  menu pages. Desktop, phones, `?touch=1` and `?phone=1` on a desktop
  are as before.
- **Flags.** `?tablet=desktop`: the desktop cockpit and the device's
  keyboard, as a tablet had until now. `?tablet=phone`: forces the
  tablet on any device (tests, a desktop).
- **Stored settings are kept as they are.** A tablet that has never
  opened WebCockpit starts from the phone's defaults (text size 14 and
  so on). A tablet that has stored settings (from the desktop cockpit)
  keeps all of them, the text size too, and the phone's one-time
  defaults (Herblores off, time text off, Character out of the strip)
  are not applied to them.
- **The keyboard** on a window whose short side is 600 px or more
  (`src/phone/keyboard-model.ts`, `tablet`): letter keys up to 72 px
  (a phone: 48 / 46), rows 48 to 56 px in both shapes (a phone: up to
  46, and 36 in landscape), larger key faces. Measured in Chromium:

  | | 820 × 1180 | 1180 × 820 |
  | --- | --- | --- |
  | Key block | 796 px wide, 12 px margins | 796 px wide, between the hot keys and the compass |
  | Letter key (Swedish, 11 a row) | 72 × 56 | 72 × 53 |
  | Space | 282 px | 282 px |
  | Keyboard height | 228 px (270 with the digit row) | 218 px (274 with the digit row) |
  | English (10 a row) | 72 px keys, block 724 px, centred | 72 px keys, block 724 px |
  | Page keyboard | 72 × 56, Esc/Tab/arrows as a row on top (284 px) | 72 × 56, Esc/Tab/arrows in 72 px columns beside the block (228 px) |

  The model asks for 56 px rows at both sizes; in the game the
  allocator keeps whole rows of game text free, which gives 53 to 56.
  The compass, the hot keys, the lens, the strip, Comm and the menu
  are untouched.
- **Tests.** Unit 4141 passed (2 skipped), `tsc --noEmit` clean. Phone
  e2e project: 448 tests, 447 passed and 1 failed in the full run
  (`phone-game-panes.spec.ts:194`, the strip's swipe at phone size;
  it passed 3 of 3 alone and in the run before, and another script was
  loading the same dev server during the full run: taken as flaky, not
  looked into further). Desktop specs that touch the device flags
  (`input-font`, `output`, `chrome`, `esc-click`; Chromium and
  Firefox): 76 passed. The full e2e suite was not run. New:
  `tests/e2e/phone-tablet.spec.ts` (13 cases). In the phone project a
  wide window is now a tablet, so its 16 cases of "the old phone layout
  in a wide window" and "a tablet has the desktop cockpit" say
  `tablet=desktop`.
- **Bundle.** A production build before and after: the same 98 files;
  the desktop's first load is 7 bytes larger; the phone chunk +0.6 kB,
  its CSS +0.5 kB.
- **Screenshots**, with no flag, Chromium as an iPad
  (`node scripts/tablet-shots.ts`): `docs/stages/img/54-a-*.png`
  (portrait) and `54-a-land-*.png` (landscape): `rest`, `keyboard`,
  `digits`, `symbols`, `symbols-digits`, `keyboard-en`, `comm`,
  `comm-keyboard`, `strip`, `strip-group`, `menu`, `settings`, `start`,
  `start-profile-keyboard`, `start-script-keyboard`, and `desktop`
  (`?tablet=desktop`). Sizes: `notes/research/tablet/54a-measures.json`.
  In the two `desktop` pictures the map shows another area than the
  player's room, as in the trial's; not looked into.
- **Not seen on a device.** Everything above is Chromium's emulation.
  Whether iPadOS Safari is found as a tablet without the flag (it
  should be: a coarse pointer, a screen 820 wide), and how the keys
  feel, is for the test below.

### The script editor and our keyboard (owner's report, not solved)

The owner: a tap in the script editor's text does not bring up our
keyboard, on the phone (Samsung S21) and on the iPad.

**Not reproduced** in Chromium's touch emulation, on the dev server and
on a production build. Tried, at 360 × 800 and 820 × 1180 (and 800 ×
360, 1180 × 820 for some), always with the keyboard coming up: start
menu → Scripts → an existing script → Edit; a script made with New and
our keyboard (Enter and the OK button); from the game, menu → Scripts →
Edit, with the game's keyboard down and up; the profile editor's Editor
view from the start menu and from the game; a tap in a line's text, at
its end, right of a short line, in the empty room under the last line;
again after the fold key; after a drag that scrolled the code; touches
held 80 to 350 ms and moved 2 to 8 px. (A tap on the line numbers
opens nothing, and a bundled read-only script opens nothing: both as
designed.)

**One case that does fail, on a phone in landscape only:** a window
800 px wide and 280 px high or lower (an S21 on its side in a browser
tab with the address bar showing is about that; 285 px and up works).
The page keyboard needs 150 px of page above it (`PAGE_KEEP_PX`,
`src/phone/keyboard-pages.ts:194`); below that `place()` gives up and
blurs the buffer (`:373`), so the tap seems to do nothing. This is
ADR 0139's floor working as written, not a regression, and it cannot
be what happens on the iPad. Whether it is what the owner saw on the
phone is not known: **ask which orientation, and whether in fullscreen.**
Nothing was changed.

**Suspects, if it is something else** (all in
`src/phone/keyboard-pages.ts`):

- `:640` `onFocus` / `:657`: a code editor never opens the keyboard on
  a focus alone, only on the tap's `click` (`:680` `onClick`) or, where
  no click comes, 60 ms after `pointerup` if the buffer has the focus
  by then (`:612` `flush`, `:617`). A device that ends the touch with
  `pointercancel` (`:634` counts only `pointerup`) and sends no click
  would open nothing. Emulation always sends both.
- `:337` `editorOf` → `src/editor/own-keyboard-cm.ts:57` `editable()`:
  a buffer that reports itself not editable is not a field of ours.
- `:456` `gone`: closes the keyboard at once when the buffer is not
  shown or has lost the focus just after it opened.
- The dev server itself: on 2026-11-12 the files of this round were
  edited under the running dev server, and for about a minute
  `keyboard-pages.ts` called two functions it did not yet import; a
  page loaded then would open no page keyboard at all. A reload cures
  that. Only relevant if the report was made on the dev server during
  that time.

## Test guide, 54a (the iPad)

The dev server runs from this branch's worktree (ADR 0096). On the iPad
open `https://<machine>.<tailnet>.ts.net:5173/` with **no flag**:

- `/` — the start page; Enter MUME for the live game.
- `/?fixture=gmcp-demo.log&speed=0` — the game filled from a log, no
  login.

**Stored settings:** in a normal tab the iPad keeps the settings it
already has, so the text may be larger than in the screenshots (the
desktop cockpit's size). That is intended, nothing is lost. To see it
as a new tablet gets it (text size 14, the phone's panes), use a
**private tab**. The text size can be changed in the menu (A− / A+).

Try, in both orientations:

1. The game opens in the phone's layout (compass, lens, menu key), not
   the desktop cockpit.
2. Tap the command field: our keyboard, now across the screen. Type a
   line, Enter. The `123` key (digit row), `!#?` (symbols).
3. Comm: open a chat, tap its reply line, type.
4. Start page → Profile → a profile → Rename, and Scripts → New: the
   keyboard under the dialog, with Esc, Tab and arrows.
5. Scripts → a script → Edit, tap in the code: does the keyboard come
   up? (See the note above. If not: which orientation, which script,
   and does it come on a second tap?)
6. `?tablet=desktop` in the address: the old tablet (desktop cockpit),
   to compare or to go back.

Wanted: are the keys the right size now (too large is as possible as
too small: 72 × 56 px), the same question for landscape, and anything
that looks wrong at the keyboard's edges (the hot keys left of it and
the compass right of it in landscape). Fullscreen is a separate round
(54b).

### Owner decisions and reports, 2026-11-12 (evening)

- **Fullscreen on the iPad stays as it is.** The key is kept; nothing
  is changed for now. It mostly works, above all when fullscreen is not
  switched on with the keyboard up, and it is switched on seldom. The
  iPad is not a prioritised target. Background: iPadOS shows a "typing
  is not allowed in full screen" alert after a few fast taps and leaves
  fullscreen when a text field takes the focus; a site cannot turn
  either off (`notes/research/tablet/ipad-fullscreen.md`). Add to Home
  Screen and calming our relayout are noted there as later options.
- **Bug:** a tap in the script editor's text does not fold our keyboard
  up. Seen on his phone (S21) and on the iPad.
- **Wanted: automatic login for the session** on phone and tablet.
  After a login a box asks whether to log in automatically as that
  character for the rest of the session. Name and password are then
  kept for a while in the browser, safely; when the client finds
  itself disconnected on coming back to the window (common on a phone
  or tablet) it connects and types the name and then the password.
  Agreed way to start, to be judged over time: kept in the page's
  memory only, never written to storage.

### Owner report, 2026-11-13

- **The script editor and our keyboard: not a bug.** The scripts he had
  tapped in were locked (read-only bundled scripts open no keyboard, by
  design). In a new script the keyboard comes up, on the phone and on
  the iPad.

## 54c as built (2026-11-13)

ADR 0141 has the decision, the threat notes and the list of what the
live game must confirm; this is the short version.

- **What it does.** On the phone's game layout (phones and tablets),
  when a login typed by hand reaches the game, a card asks "Log in
  automatically as <Name> for the rest of this session?". With Yes the
  session is armed: a dead link found on resume reconnects (whatever
  "Reconnect automatically" says) and the client sends the name at
  MUME's name prompt and the password when the server has turned ECHO
  off. The menu's Reconnect, Enter on a dropped connection and
  `#connect` log in the same way. It is the **account** password that
  is held (the card says so). Notices in the game text: "Logging in
  as <Name>…", "Logged in as <Name>.".
- **Where the login is.** In the page's memory only: one object
  (`src/phone/login-vault.ts`), private fields, no getter. Written from
  one place and read from one, both in `src/phone/auto-login.ts`. Never
  in storage, the run log, the history, the page or a notice. Gone with
  a reload or a closed tab.
- **The question is not a dialog.** No veil, no focus, no key: only a
  tap on Yes or No answers it, and everything typed goes to the game.
  It stands at the top of the game text, clear of the lens (beside it
  on a wide screen, under it on a narrow one); on a phone on its side
  with the keyboard up it is laid out low, the keys beside the text.
  The kit's `Dialog` (asked for) is modal by construction and was not
  used; the card is drawn with the sheet's band, hood and ground.
  Unanswered for 60 s it goes away, the password is dropped, and the
  next login by hand asks again. No is remembered for the page load;
  Yes too (after a wipe the next login by hand as that character arms
  again, with a notice, without a question).
- **One attempt, and any surprise wipes it:** a second name prompt, a
  password prompt before the name or a second time (MUME did not take
  the password), no game within 20 s, the connection ending, another
  character in the game, and, until the password has been sent, any
  non-empty line the player sends. After the password the player's
  lines are their own answers to MUME and stop nothing; an empty line
  never does. The player is then at MUME's own prompt, with a notice
  saying why.
- **A session that ends on purpose is never logged back in** (review,
  2026-11-13). The session stays armed only when the link was LOST:
  the resume check's verdict, or a socket closed with code 1006 (no
  close from the server); and over the player's own Reconnect. Every
  other end wipes and does not reconnect: `#disconnect`, MUME's
  `Core.Goodbye`, and any close the server made itself (quit, rent, an
  idle kick). `isLinkLoss`, `src/net/session.ts`.
- **Other wipes:** Exit session (also with the link already down), a
  replay, a page restored from the back/forward cache.
- **Review fixes, 2026-11-13.** Besides the above: the rule keeps of
  what is typed only one name-shaped line (letters, 2 to 20), dropped
  when the login prompts are left; the controller attaches last, so a
  failed mount of the phone layer leaves no listener; the mock and the
  texts follow the one real login in the reference logs (`Account
  password: `); a tablet's stored settings are read as a desktop's (a
  record with no weather choice no longer loses the weather, ADR 0140
  §3).
- **Desktop does not change:** the phone's chunk holds all of it. The
  session got one nullable property (`loginTap`) and the shell passes
  the session and the bus to the phone layer.
- **Tests** (after the review fixes). Unit: 4214 passed, 2 skipped
  (the rule, each stop, never-the-password-outside-the-prompt, the
  vault, and the controller on a real session and telnet parser, in
  `phone-login-rule.test.ts` and `phone-auto-login.test.ts`; every wipe
  is checked on the vault and on what a following connection is sent).
  `tsc --noEmit` clean. Phone e2e project: **469 passed, 0 failed with
  5 workers** (21 in `tests/e2e/phone-auto-login.spec.ts`, at 412 ×
  915, 800 × 360, 820 × 1180 and 1180 × 820). With the default 10
  workers three of five full runs had failures, 4 to 8 tests, all in
  one file per run (`phone-game-panes.spec.ts` twice,
  `phone-own-keyboard.spec.ts` once), never in the new spec: pages that
  reload did not come up within 5 s, "Page crashed" and
  `ERR_INSUFFICIENT_RESOURCES` in Chromium. The same files pass alone
  and in the 5-worker run; the temp filesystem (RAM) was 84 to 87 %
  full at the time. Taken as the machine, not the code; **not proven**.
  Desktop (Chromium and Firefox): `auto-login-desktop` (new),
  `live-mock`, `input-password-long`, `chrome`, `replay`, `menubar`,
  `smoke`, `weather`: 102 passed. The full e2e suite was not run. MUME
  is mocked (`tests/e2e/mume-login-mock.ts`); nothing connected to the
  live game.
- **Not covered by a test:** a phone layer whose mount throws (the
  controller is the last statement of the layer's constructor, and its
  own constructor is tested to attach nothing when it throws; there is
  no unit harness that builds a `PhoneLayer`). `placeLoginAsk` is
  covered in the browser only (the card clear of the lens and the keys
  at the four sizes), its arithmetic (`placeAsk`) in unit tests.
- **Bundle.** A production build before and after: the same 98 files.
  The desktop's first load is 237 bytes larger, as the size on disk
  of the minified files (the session's chunk +72, the entry chunk with
  the shell +165): more than "a few bytes", for the tap and the wiring.
  The phone chunk +10.9 kB, its CSS +2.2 kB. (Measured before the review
  fixes, which add `isLinkLoss` to the session's chunk and a little to
  the shell; not measured again.)
- **Screenshots** (`node scripts/login-shots.ts`):
  `docs/stages/img/54-c-<size>-<state>.png`, sizes `phone`,
  `phone-land`, `tablet`, `tablet-land`; states `ask`, `ask-keyboard`,
  `armed`, `logged-in`, and `ask-paper`, `ask-keyboard-paper` for the
  two portrait sizes.
- **Not done.** No text in Settings about it (the rows have no second
  line). No switch to turn an armed session off other than
  `#disconnect`, Exit session or a reload. Not seen on a device or
  against the live game.

## Test guide, 54c (phone and iPad, live MUME)

The dev server runs from this branch's worktree. Open it with no flag
on the iPad, or on the phone, and Enter MUME.

1. **The question.** Log in as usual. When the game begins, a card
   asks whether to log in automatically. Before answering, type a
   command: it goes to the game, and the card stays. Is the card in the
   way of anything? Is 60 s right before it goes by itself?
2. **Yes, then lose the link.** Answer Yes. Put the browser in the
   background (another app, or lock the screen) for a minute or more,
   and come back. Wanted: "Connection closed…", "Reconnecting…/
   Connecting", "Logging in as <Name>…", MUME's prompts answered by
   themselves, "Logged in as <Name>.", and you are in the game where
   you were.
3. **The menu's Reconnect** (menu key → Reconnect) while armed: the
   same.
4. **Quit while armed.** Answer Yes, then type `quit` (or rent). Wanted:
   the notice "Automatic login is off: the session ended. The saved
   login is forgotten." Put the browser away and come back later:
   **nothing must connect or log in.** If the character is logged in
   again, or the notice did not come, say so at once: MUME then ends a
   quit in a way the client takes for a lost link (ADR 0141, to verify
   9), and the round must not be released as it is.
5. **No.** Reload, log in, answer No. Lose the link as in 2: MUME's own
   name prompt (or the sheet with Reconnect), nothing typed for you.
   Log in again by hand: no question.
6. **Exit session** while armed, then Enter MUME: MUME's own prompt.
7. **Reload** while armed: the login is gone, and the question comes
   again after the next login.

**What only the live game shows** (please note what you see; ADR 0141
"To verify on the live game" has the full list):

- Does the automatic login work at all? If "Automatic login stopped:
  MUME did not ask as expected in time" comes after 20 s with the name
  prompt on screen, MUME's name prompt reads otherwise than the client
  expects: copy the prompt's exact text.
- Any "Automatic login stopped: …" notice: its exact reason, and what
  MUME had on screen above it.
- After a linkdead reconnect, is there anything between the password
  and the game (a "press return", a menu, a message about another
  connection)? The client does not answer it; you can, and the login
  stands if the game comes within 20 s of the connection.
- The opposite of step 4: does a link lost in the background always
  log in again, or does "the session ended" come there too (the phone
  closing the socket cleanly when it suspends the tab)?
- Does the question come after a login where the name was typed in
  another case than MUME's (`rasta` for Rasta)?
- A new character's creation must not be asked about (if you ever make
  one on a phone).
- How often the browser has thrown the tab away while in the background
  (the page reloads on return and the login is gone): if often, the
  next step is ADR 0141's `sessionStorage` option.
- The password must never be readable on screen: not at the prompt, not
  in the game text, not in the history (arrow up).

