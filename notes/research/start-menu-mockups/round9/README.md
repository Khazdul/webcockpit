# Sync mockups, round 9 (stage 61, part A)

Throwaway mockups for the seven points under "For the owner to decide"
in `docs/stages/61-sync-profiles-scripts.md`. They are not app code: the
DOM is simplified and uses the real classes, and none of it should be
copied into `src/`.

Open `index.html` to see every state as a picture, each one linking into
the file, or open `start-menu-round9.html`, which holds everything in one
self-contained file. In the file, the first row of tabs picks the point
(1–7), the second picks the variant (a, b, c), the third picks the state,
and Desktop / Phone picks the view.

## Files

| File | Holds |
|---|---|
| `start-menu-round9.html` | Everything in one file (913 KB, no network) |
| `index.html` | The review page over `shots/` |
| `shots/` | 58 pictures (29 states × desktop and phone), `<state>.<view>.jpg` |
| `build/` | How the files are made (see "How true the look is") |

Shot names: `<state>.desktop.jpg` (1440 × 900) and `<state>.phone.jpg`
(390 × 844 at 1.5×).

| Point | States |
|---|---|
| 1 After Create account | `moved-a-done`, `moved-a-running`, `moved-a-waiting`, `moved-b-done`, `moved-b-running`, `moved-b-waiting`, `moved-c-done` |
| 2 The locked copy | `locked-a`, `locked-b`, `locked-c`, `locked-remove` |
| 3 The start menu's messages | `msg-a-out`, `msg-a-lost`, `msg-a-deleted`, `msg-b-out`, `msg-b-lost`, `msg-b-deleted` |
| 4 Log out, first form | `logout-all`, `logout-some`, `logout-refused`, `logout-syncing` |
| 5 Keep both | `both-a`, `both-b` |
| 6 Delete account | `delete-dialog`, `delete-after` |
| 7 Account page's sync section | `sync-synced`, `sync-syncing`, `sync-offline`, `sync-full` |

## How true the look is

`build/capture.spec.ts` is a Playwright "spec" so that it can use the e2e
fake of the account API (`tests/e2e/cloud-account-fake.ts`, with
`?cloudtest` and the Turnstile stub). It runs against a dev server on
port 5394 and captures, for desktop and phone:

- the start page as a guest with the flag `accounts` on (the built owner
  row, stage 67);
- the start page logged in as `ole`;
- the built Account page;
- the built Log out dialog and Delete account dialog over it;
- the Profile page;
- the kit gallery's owner rows in every state (`?kit=menu`: synced,
  syncing, offline, storage full, locked, guest);
- the stylesheets, the theme and one still of the dusk sky.

`build/build.mjs` (round 8's, adapted) puts these together with
`build/mock.css` and `build/states.js`, which hold the new content in
`mk-*` classes.

What is real and what is drawn:

- **Real:** the panel, rows, owner row (the built DOM of each state),
  message line, kit dialogs and buttons, the Account page, the Profile
  list and the sky.
- **Drawn here:** the sync section, the receipt, the locked notice, the
  message line grown to several lines, the owner-row look of a message,
  the dialogs' new texts and rows, and the "kept both" mark.

The sky stands still and nothing animates, apart from the breathing dot.

    npx vite --port 5394 --strictPort          # never 5173
    npx playwright test -c notes/research/start-menu-mockups/round9/build/pw.config.ts
    node notes/research/start-menu-mockups/round9/build/build.mjs
    node notes/research/start-menu-mockups/round9/build/shoot.mjs

**Two layout facts the mockups had to change** (both under "What did not
fit well"):

- **The message line wraps.** Today it is one line of 18 px that never
  wraps (it cuts with an ellipsis). Every message here needs two or three
  lines in the 360 px panel, so the mockups let it wrap and move About
  down to make room.
- **The Account page scrolls on a desktop.** With the sync section added
  it no longer fits at 1440 × 900, so it takes its tall form (the form it
  already has on short screens): the box fills the height and its body
  scrolls. Leaving ends up below the fold.

## The words

The brief's drafts are used as written, except:

- **1, waiting:** "4 things moved into ole. 2 scripts still to move: they
  go when the server can be reached, and stay on this device until
  then." This adds what did move and is one sentence shorter.
- **3b:** the owner-row look puts the name first, so the words are
  shortened: "OLE · logged out. Everything is in your account.",
  "OLE · you were logged out on this device.", "OLE · this account was
  deleted."
- **4, something not in it:** a lead line before the rows: "Not
  everything is in your account yet. Logging out removes these from this
  device:".
- **4, syncing:** the dialog's own question stays and the work line says
  "Syncing before you log out… 2 changes".
- **Remove's dialog** is titled "Remove copy". It adds "To keep them,
  log in to ole instead." because there is no download in the locked
  state.
- **7:** "Synced · 2 minutes ago", "Syncing…", "Offline · last synced at
  14:02", "Cloud storage full", each with a short note where something
  waits.

A possible tightening for 1, not drawn: "This device is back at its
starting set" is true but abstract to a player who is now logged in.
"Logged out, this device starts fresh." says the same thing in plainer
words.

## 1. After Create account

Under ADR 0150 Create account changes the space, so the page **reloads
to the start menu**. Where the player lands therefore decides a lot.

- **a · The start menu's message line.** The message sits between
  History and About, in today's orange italic, wrapped to two lines.
  - Moving: "Moving 6 things into ole… 3 of 6", with the owner row
    saying "syncing".
  - Waiting: the network sentence (three lines on a desktop), with the
    owner row saying "offline".
  - It needs nothing new on the page, and it is where the player lands.
- **b · A receipt on the Account page.** A well above the sync section,
  like the Import page's receipt:
  - a check mark and "MOVED INTO OLE";
  - "4 profiles warrior, mage, gibur, rasta" and "2 scripts autoloot,
    hunt";
  - a note saying the device is back at its starting set, and OK.
  - Moving and waiting forms are drawn too.
  - It is the clearest of the three: it names what moved. But the reload
    would have to land on the Account page instead of the start menu,
    and it pushes the page into scrolling.
- **c · A line in the sync section.** "✓ Moved here from this device
  when the account was made: 4 profiles, 2 scripts." It is quiet and
  stays findable, but nobody sees it unless they open the Account page.

**Recommendation: a**, with c as its permanent record.

- The reload lands on the start menu, the owner row already carries
  "syncing" and "offline", and the message line is where the start page
  already speaks.
- The count is what matters at that moment. The names can be checked on
  Profile and Scripts, one key away.
- Adding c's line costs nothing and answers "what happened?" later.
- Choose b only if the owner wants the names shown at once. Then the
  reload after Create account goes to the Account page.

## 2. The locked copy

The menu is in the device's space, and the owner row is in its built
locked state ("🔒 ole · logged out here").

- **a · Under the owner row.** The notice sits in the panel, in the
  serif italic, indented with the names, with small Log in and Remove
  buttons (Remove in the kit's red). A rule then parts it from Profile.
  It costs about 70 px of panel height.
- **b · A card below the panel.** A glass card where the quote stands,
  with a lock, "OLE · kept on this device", the text and the two
  buttons. The menu itself is untouched, but the card stands on the sky,
  apart from the row it explains.
- **c · The message line.** The notice is on the message line, with Log
  in · Remove as links in it. Today's message line takes no pointer or
  keys, and it is a passing message, while this notice lasts with no
  time limit.
- **Remove's question.** A kit dialog over the menu:
  - "Remove ole's copy from this device?"
  - "3 changes that are not in the account are lost:"
  - a row each: the profile **warrior**; the scripts **autoloot** and
    **hunt**
  - "To keep them, log in to ole instead."
  - Keep (lit, Enter) and Remove (red).

**Recommendation: a.**

- The notice belongs to the owner row, which already says
  "ole · logged out here". Under it, the two read as one thing.
- It is inside the panel, so the menu's cursor and keys can reach Log in
  (L) and Remove (R).
- It stays there as long as the copy does, which a message line cannot
  do.
- c should be dropped. b is the choice if the panel must not change
  height.

## 3. The start menu's messages

- **a · Plain line.** Today's flash: orange serif italic with a glow,
  centred, about one line ("Logged out. Everything is in your account
  ole." just fits on a desktop).
- **b · With the owner row's mark.** The message starts with a mark (a
  green dot for logged out, a hollow ring for a lost session, an amber
  diamond for deleted), then the name in the owner row's small caps,
  then the words in the plain parchment italic with no orange.

**Recommendation: a.**

- The three messages are one-off news after a reload, which is what the
  orange flash already means everywhere in the kit ("Logged out.",
  "Coming in a later stage.").
- b looks good, but it borrows the owner row's marks for events that are
  not states. A green dot after a log out would read as "synced" when
  nothing is logged in. It would also make two styles of message on one
  page.

## 4. The Log out dialog, first form

One design, built on the real dialog:

- **All in the account:** the spec's text, with Cancel and Log out (lit,
  Enter).
- **Something not in it:** 560 px wide and left-aligned, with a row each
  on the kit's row plates:
  - ○ **2 changes** not synced *(the server could not be reached)*
  - 💾 **1 saved run** on this device only
  - ⌛ **3 unsaved runs** of the last 14 days — *open History* to save
    them
  - The buttons are **Stay logged in** (lit, Enter), Download, and
    **Log out anyway** (red). On a phone all three fit on one row.
- **Refused:** "A game is running in another tab. Log out when it has
  ended." with OK.
- **Syncing first:** the question with a breathing gold dot and
  "Syncing before you log out… 2 changes", with Cancel only.

**Recommendation: as drawn.**

- The row icons match the marks used elsewhere (the hollow ring is
  offline's).
- "open History" uses the History row's letter H.
- Download takes D. It is not on the Account page today.
- Some wording questions are left open: "Log out anyway" uses L, the
  letter Log out has on the Account page. "on this device only" could
  also be "not in the cloud" (spec §7.4 uses both).

## 5. Keep both

- **a · The start menu's message line.** "warrior was changed on two
  devices. Both are kept: warrior and warrior (from phone, 14 Nov)." It
  takes two lines, with the menu's Profile row showing "(warrior)".
- **b · A mark on the Profile page.** The new copy "warrior (from phone,
  14 Nov)" carries a gold "◆ kept both" tag where "Selected" stands on
  other rows. The Profile page's own message line says "warrior was
  changed on two devices. Both are kept."

**Recommendation: both together.**

- The message shows on the start menu after the sync (a), where the
  player is when it happens.
- The tag (b) stays on the copy until it is opened, renamed or deleted,
  so the player can still find it after the message has gone.
- The message alone is easy to miss, and the tag alone does not say why
  the copy is there.

## 6. Delete account

The built dialog stays as it is, with the "What stays" paragraph
replaced (marked with a dashed outline in the mockup only):

> **What happens on this device:** your profiles and scripts in **ole**
> come back to this device as its own. A name that exists on both sides
> keeps both.

Afterwards, the start menu shows the guest owner row and "The account
ole is deleted. Its profiles and scripts are this device's now." on two
lines.

**Recommendation: as drawn.** It replaces today's "The account ole is
deleted. What is on this device is untouched." (`account-dialogs.tsx`
line 615).

## 7. The Account page's sync section

A "Sync" rule right under the head, before Devices. It holds:

- the state mark (the owner row's own: dot, breathing dot, ring,
  diamond), the state in words, and a small **Sync now** (S, with the
  reset icon) at the right;
- a mono line "12 profiles · 5 scripts" with "140 KB of 2 MB" at the
  right;
- a thin storage bar;
- a short note when something waits.

The four states:

- **Synced:** "Synced · 2 minutes ago", no note.
- **Syncing:** "Syncing…", with Sync now greyed.
- **Offline:** "Offline · last synced at 14:02" and "2 changes wait on
  this device. They go when the server can be reached."
- **Storage full:** "Cloud storage full", with an amber diamond, the bar
  full, the KB figure in amber, and "1 change is kept on this device
  until there is room. Delete a profile or script you no longer need."

**Recommendation: as drawn.** It uses the same marks as the owner row,
so the two places read alike. The counts and the bar replace the account
mockups' two bars until runs come (stage 63 adds a second bar for saved
runs).

## What did not fit well

- **The message line is one line today.** Every message of points 1, 3
  (most), 5 and 6 needs two or three lines in 360 px. The mockups let it
  wrap and push About down (`.mk-wrap`). The panel then grows by 20 to
  40 px while a message shows and shrinks when it goes. The alternative
  is shorter messages, but "Moved into ole: 4 profiles, 2 scripts." is
  already near one line's limit.
- **The Account page no longer fits a desktop** with the sync section.
  It takes the tall, scrolling form, and Leaving is below the fold at
  1440 × 900. With 1b's receipt it is further down still. A compact head
  (the state on the head's line) would win back about 40 px.
- **2c needs a message line that takes clicks and keys.** Today's line
  has `pointer-events: none` and is a passing message, and the locked
  notice is not passing.
- **Long keep-both names are cut on a phone:** "WARRIOR (FROM PHON…".
  The date is the part that is lost.
- **The kit's red is faint.** Remove, Log out anyway and Delete account
  use the kit's danger style (reddish text). The brief said "Remove
  (red)", and it reads as red only up close.
- **Cursor states are not drawn:** the cursor on the locked notice's
  buttons, and Tab between the dialog's rows and buttons.
- **The move's names** in 1b are invented (warrior, mage, gibur, rasta;
  autoloot, hunt), and the Profile page's extra rows are clones of the
  seeds' rows.
