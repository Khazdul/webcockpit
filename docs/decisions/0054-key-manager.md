# 0054 — Key manager

- Status: Accepted
- Date: 2026-10-02
- Builds on intent Goal 10, spec §2.10 (bundled scripts), ADR 0051
  (script host), ADR 0053 (script panes), ADR 0055 (pane text fields)

## Context

Stage 12 ships a bundled key manager for MUME's port keys: `locate life`
gives a key per room, and `teleport`, `portal`, `scry` and `watch room`
take it. The owner's reference is his Mudlet "Port Key Library" v1.1.1
(`notes/research/mudlet-portkeys/`), to be followed and improved; the
Cockpit key manager (`/home/ole/MUME/docs/keymanager.md`) is a second
reference. Both are behaviour references only. Owner decisions are in
`docs/stages/12-key-manager.md`.

MUME facts used: a locate row is `<creature> - <room type>  <distance>
key: '<key>'` (two or more spaces between the columns; the Mudlet
pattern `^(.*?)\s+-\s+(.*?)\s{2,}(.*?)\s{2,}key: '(.*)'$`), a block of
rows ends with a blank line, and no hit is `Your mind fails to locate any
such creature.` A key works only for the character who located it, for
12 hours.

## Decision

The script is `src/scripts/bundled/keymanager.lua` (bundled, off by
default). No host change was needed for round 1 beyond ADR 0055.

### Capture

- **Every locate is caught**, however it was cast: `locatel`, a profile
  alias or typed by hand (owner, 2026-10-02). The row trigger is always
  on; its rows are gagged.
- A block ends at the first line that is not a row (a temporary trigger
  `^(?!.*key: '.*'$)`, registered only while a block is open, so blank
  lines do not call Lua otherwise) or 2 s after the last row.
- `locatel [<target>] <name>` only **arms a name** for the next block:
  it sends `cast n 'locate life' [<target>]` and waits 15 s. The failure
  lines of the Mudlet script (`Argh! You cannot concentrate any more...`,
  `Nah... You feel too relaxed to do that.`, `In your dreams, or what?`,
  `Alas, this location is out of range!`, `Alas, not enough mana flows
  through you...`, `Your spell backfired!`, `Your mind fails to locate
  any such creature.`) and Cockpit's `You feel very confused and can't
  concentrate any more.` cancel an armed name with a message; a timeout
  says so too. Mudlet's empty-line cancel is left out (unverified in
  MUME).
- When a block ends: a `locatel` name with a single hit is stored at
  once. Everything else opens the **pick window**.

### Pick window

- A temporary pane (ADR 0053) `Pick a key`: `Name: $[field]` on top
  (ADR 0055), a status row, then `#`, mob, room type, distance and key per
  hit, the selected hit marked `▶`, and a footer with the keys and an
  `[ OK ]` link.
- The field holds the `locatel` name, else a **suggestion**: the hit's
  name when its key is already stored (Enter then renews it), else a
  name made up from the room type's last word for a row of your own
  character (`On a hill` → `hill`) or the creature's last word after
  `a`/`an`/`the` (`A hungry warg` → `warg`), cut to 10 characters, with
  `2`, `3` … on a clash. It is focused and selected, so typing replaces
  it. An unedited suggestion follows the selection.
- Up/Down (and PgUp/PgDn) in the field move the selection; Enter stores
  the selected hit under the typed name (a leading `$` is allowed) and
  closes the window; Esc or the close cross closes it. A click on a row
  selects it and gives the field the keyboard back; a second click on the
  selected row within 0.5 s, or `[ OK ]`, stores it.
- The status row says what Enter will do: `Enter stores hit 2 as
  $cave.`, `Enter renews $hill.`, `Enter replaces $cave (key).` (orange),
  or why it cannot (`A name is 1 to 10 letters, digits or _.`); an
  invalid Enter keeps the window and selects the name again.
- A hit whose key is in the library shows `= $name` in green. `kpick`
  opens the last window again. The Mudlet Alt+arrow / Alt+Enter / Alt+Q
  bindings were dropped: the field gives plain keys.

### Library, per character

- One store entry per character, `char.<lower-case name>`:
  `{ name, safe, keys = [{ name, key, room, dist, at }] }`, `at` the
  wall-clock time it was located (`getEpoch`). The character is
  `state.char.name`, followed on `gmcp.Char.Name` (a moment later, when
  the state is up to date). Before a character is known the pane says
  `Not logged in` and every command that needs the library refuses with
  a message. After a disconnect the last character's keys stay shown.
- Names: 1–10 of `[A-Za-z0-9_]` (Mudlet's 10), matched case-insensitively,
  kept as typed.
- **Expiry**: `hours` setting (12). Expired keys are dropped once a
  minute (which also redraws the time left), on use and on load, and
  named once in a UI message (`KEYS: Key $home expired.`). A named cast
  of an expired key is refused; it never falls back to another key.

### Safe key

- The first key stored in an empty library is the safe key. `skey
  <name>` or a click on a key's star moves it; `skey` alone names it.
- When the safe key expires or is deleted, the **freshest** live key
  takes over (Cockpit's rule; Mudlet took the first in its list), said
  once in the same message. A rename keeps it. Only an empty library has
  no safe key; `tsafe`, `qtsafe`, `psafe`, Ctrl+S and Alt+S then say `No
  keys, so no safe key.`

### Commands and keys

- Mudlet's names: `keys` (toggle; `keys list`, `keys help` →
  `#script help <scriptName>`), `locatel`, `kpick`, `nkey <name> <key>`,
  `rkey`/`krename <name> <new>`, `dkey <name>`, `skey [<name>]`,
  `teleport|portal|scry|watchr [$]<name>`, `tsafe`, `qtsafe` (`cast q`),
  `psafe`. Casts send `cast n '<spell>' <key>`; watch room adds the name
  (`cast n 'watch room' <key> <name>`, so MUME labels the watch lines
  `[name]`).
- **Ctrl+S / Alt+S** are `tempKey`s. Ctrl+S is bindable (not in the
  browser-reserved list) and the input line's macro path calls
  `preventDefault`, so the browser's save dialog does not open (checked
  in Chromium and Firefox, e2e). No key-layer change was needed.
- Feedback is one line per action, tagged `KEYS` in light yellow (as
  MERC), names in light cyan, keys dim, errors light red; background
  events (expiry, safe-key moves) go to the UI messages.

### `$name` in commands

- A script alias `^.*\$[A-Za-z0-9_]`, defined last, takes any typed
  command with a `$word`. Each `$word` that is a live key's name becomes
  its key and the command runs again through `expandAlias`, so profile
  aliases still apply; the engine does not re-enter an active alias, so
  it never loops. With no key name in it the handler returns `false` and
  the command goes on untouched.
- **Order**: the engine substitutes tt++ variables before any alias sees
  a command (`execText`), so a profile variable `$home` wins over a key
  `home`, and `$$home` reaches the alias as `$home` (it is then
  substituted; accepted). Profile aliases come before script aliases of
  the same priority (ADR 0051), so `tp $home` with a profile alias `tp`
  works: the alias body runs, and its `$home` is replaced on the way out.

### The Keys pane

- `createPane{id = "keys", title = "Keys", dock = "right", rows = 8,
  cols = 44}`, redrawn whole on every change and from `onResize`.
- Header: character name, `N keys` and a `?` link (help).
- A row per key, sorted by name: a star (green ★ safe, dim ☆ others;
  click to make safe), `$name` (light cyan; inverted for 4 s after it was
  stored; its hint has room type, distance, key, age and time left), room
  type, key (dim), time left (`12h`, rounded up like Mudlet's; `45m` in
  orange under an hour), and the letters `t p s w` (teleport, portal,
  scry, watch room; hint: the exact command) and a red `x` (delete; the
  first click turns the letters into `delete? x` for 4 s, the second
  deletes).
- Narrow panes: name, time and the letters stay; the key column goes
  first, then the room type (cut with `…` before it goes); below that the
  letters drop from the right. Glyphs ★ ☆ ▶ are in the symbol set the
  fonts cover (font test).

## Consequences

- Every `locate life` opens a window while the script runs, even one the
  player only wanted to read; the window closes with Esc.
- Keys of a character who never logs in again stay in the store (a few
  hundred bytes each).
- Open, unverified against MUME: the failure lines are the Mudlet
  script's; long creature or room names may be padded differently
  (the pattern trims); whether `cast q 'teleport'` is accepted as quick
  casting.
- Later round (owner): TV, the scry and watch room output in temporary
  panes.

## Feedback round 1 (2026-10-02)

Owner feedback after the first test (stage file, "Owner feedback →
Round 1"). Supersedes the sections above where they differ.

- **Messages.** One rule: a change to the library is a UI message
  (`uiMessage("keys", …)`, `▶ KEYS: …`, plain text): a key stored,
  renewed or replaced (with room type, distance, key, `Same key as $x`,
  and `It is your safe key` for the first), deleted, renamed or expired,
  and the safe key moving (set, or re-elected after an expiry or a
  delete). Everything else stays an in-game `KEYS` line: casts, the
  locate in flight, its failures, errors and replies (`skey`, `keys
  list`). The in-game `Stored …` lines are gone, so nothing is said
  twice.
- **Pane.** Title `Port keys`, `anchor = "top"` (a list that stays at
  its first line when it overflows; ADR 0053 addendum). The header has
  the key count and the `?` help link (no character name); while a name
  is being edited it holds the edit's prompt or error. The time left has
  no hint and no link. A `sysSettingChanged` handler prunes and redraws,
  so `#script set keymanager hours 10` shows at once (new API event, ADR
  0051's host: raised for the script whose own setting changed, with the
  name and the new value, after `settings` is updated; the mercenaries
  script now redraws on it too instead of a timer).
- **Inline rename.** A click on a key's name (hint `Click to rename`)
  puts a text field (ADR 0055) over the name cells after the `$`, the
  name column's width, prefilled and selected. Enter renames (a leading
  `$` allowed); an invalid or taken name shows in the header row in red
  and the field keeps the text and the keyboard. Esc cancels. The minute
  redraw leaves the row and its field alone while the rows stay where
  they are; if they move (a key added or gone) the field is made again
  with the text typed so far. The safe key follows a rename.
- **Commands.** `dkey`, `rkey` and `krename` are removed (the pane's `x`
  and the name do it); `nkey` stays. Typing them now goes to the game.
- **Pick window** opens at the top of the game pane (`at = "top"`),
  clear of the locate text printed below it, and where the player last
  moved it on this device (ADR 0053 addendum).

## Feedback round 2 (2026-10-02)

- **Rename field.** Drawn opaque with readable text (ADR 0055 feedback
  round 2). Losing the keyboard to a click elsewhere (`onBlur`) cancels
  the rename like Esc and redraws the row whole. Every other action on a
  key row (`x`, the star, `t p s w`) cancels an open rename first, so the
  row never stays half edited (round 1's stuck row came from the redraw
  keeping the field's row while `x` waited for its second click).
- **`skey` is removed.** The safe key is set only with the star in the
  pane; `keys list` still marks it with ★. Typing `skey` goes to the game.
- **Short safe key messages.** A safe key change names only the key:
  `Safe key: $home.` (set with the star, or appended to the first key's
  `Stored …`), and a re-election is its own message after the expiry or
  delete message: `Safe key is now $home ($old expired).` /
  `($old deleted)`, or `No safe key: no keys left.` No keys to press are
  mentioned (the star's tooltip still says Ctrl+S and Alt+S).
