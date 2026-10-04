# Research: Cockpit feature inventory for WebCockpit

> Status: research note, 2026-09-27. Input to `spec.md`. Not authoritative;
> `intent.md` wins, decisions go into ADRs.
>
> Source: Cockpit (`/home/ole/MUME`, read-only) at commit `0fffa08`
> (v0.15.0): `docs/*.md`, `docs/decisions/*.md` (147 ADRs), templates,
> profiles and, where the docs are silent, code read for behaviour only.
> Nothing here is code to port. "ADR NNNN" always means a **Cockpit** ADR
> (`/home/ole/MUME/docs/decisions/`), not a WebCockpit ADR.

## How to read this

- Every section describes **observable behaviour and look**: what the user
  sees, what they can do, what data drives it, what is saved, and the
  lessons Cockpit learned (with ADR numbers).
- **Browser note** lines flag what disappears or changes in a browser: tmux,
  TinTin++, Lua and Python processes, the terminal emulator (foot, WSL),
  MMapper as a proxy, and files on disk (→ IndexedDB).
- **OUT OF SCOPE** marks Cockpit features intent.md excludes (see §11).
- Cockpit is a terminal app: all sizes are in character cells (columns ×
  rows) and all colours are 24-bit hex unless stated. The web client keeps
  the cell grid as its design unit ("TUI look").

## Contents

1. Game output pane and input pane
2. Right-column panes (layout and frame, character, group, UI messages, clock, timers and trackers, communication)
3. Launcher (start page)
4. ESC popup menu
5. Profile editor
6. tt++ command subset actually used
7. Logging, runs and replay
8. GMCP usage
9. Session lifecycle
10. Visual design system
11. Out of scope
12. Observations for scope and staging

## 1. Game output pane and input pane

The two panes the player lives in. The game pane is the raw MUD output (tt++ in
Cockpit). The input pane is a separate 1-row line editor across the full window
width. Keyboard focus is **always** in the input pane. Every other surface hands
focus back to it (docs/input-pane.md, docs/tmux-bindings.md, ADR 0024, 0127).

```
┌────────────────────────────────────────────┬──────────────┐
│ game pane (MUD output, ANSI colour)        │ right column │
│ ...                                        │ (char/timers/│
│ !#>  l                                     │  group/comm/ │
│                                            │  ui panes)   │
├────────────────────────────────────────────┴──────────────┤
│> kill orc the great▌                              4:33 ☼ │  ← input pane, 1 row, full width
└───────────────────────────────────────────────────────────┘
```

### 1.1 Game pane

**Look**
- Raw MUD text with ANSI SGR colours as MUME sends them (bold, 8/16 colours).
  There is no pane frame or title in the game area. Cockpit's canonical terminal
  palette is the "DOS palette" (install/examples/foot.ini, ADR 0143):

  | idx | normal | bright |
  |---|---|---|
  | 0 black | `#000000` | `#808080` |
  | 1 red | `#800000` | `#FF0000` |
  | 2 green | `#008000` | `#00FF00` |
  | 3 yellow | `#808000` | `#FFFF00` |
  | 4 blue | `#000080` | `#0000FF` |
  | 5 magenta | `#800080` | `#FF00FF` |
  | 6 cyan | `#008080` | `#00FFFF` |
  | 7 white | `#C0C0C0` | `#FFFFFF` |

  Default fg `#C0C0C0`, bg `#000000`. Font: DejaVu Sans Mono 15. Cursor: beam,
  blinking. Configurable fg/bg (Terminal Settings, ADR 0143: bg names include
  teal/sepia/slate/paper `#F4ECD8`; fg ramp sage→silver→ash→stone→shadow→ink).
  This is intent Goal 6 (configurable look).
- **Command echo:** each sent command appears in the game text after the prompt.
  This is tt++'s default behaviour and Cockpit adds no styling of its own. The
  run log records it as `> eq` after the `!#>` prompt line, as in
  data/runs/*.log. Aliases routed via `_send` also `#showme` the expanded command
  (`_echo_sends=1`, ttpp/core/system.tin). *Verify the exact on-screen form
  against a live Cockpit session: it is not documented.*
- Prompts end with telnet GA. tt++ shows the prompt as a line and the next
  output continues below it.
- Client-injected lines in the game pane: `[SYSTEM] ...` session messages,
  `## ACHIEVEMENT: <text>`, `[COCKPIT] Goodbye. Shutting down client...`, and
  the welcome banner (§9).
- **Burst atomicity (ADR 0144):** large bursts (`score`, `eq`, a combat round)
  must appear as one frame, never half-painted. Cockpit needed a pty-coalescing
  pump (1 ms idle debounce, 12 ms max hold, 32 KiB cap) because tt++ writes one
  line per `write()`. The lesson is to batch **by timing, never by content**.
  Nothing per-line goes on the hot path (ADR 0050).
  - Browser note: append each WebSocket message (or everything decoded in one
    task) to the DOM in one go. Never render line by line with awaits in
    between. No smooth scroll and no animation (intent Goal 1).

**Scrollback**
- Depth is 100 000 lines (tmux `history-limit`, ADR 0141). Memory is used only
  for lines actually produced. tt++'s own `#buffer` is not exposed (ADR 0025).
- One canonical scrollback. Mouse wheel and PageUp/PageDown drive the **same**
  scroll position and are interchangeable (ADR 0025).
- **Live-tail behaviour:** while scrolled up, new output is appended below and
  the view stays where it is (tmux copy-mode). Scrolling back to the bottom
  (wheel down, or PageDown past the end) exits scroll mode automatically and
  the view is live again.
- Scroll entry points:
  - Wheel over the game pane scrolls it. Focus stays in the input, so typed
    letters keep landing in the input line (ADR 0127).
  - **PageUp** in the input pane scrolls the game pane up one page. The input
    keeps focus.
  - **PageDown** scrolls down one page. It does nothing at the live tail and
    leaves scroll mode when it passes the bottom.
- **Snap to tail on send:** if the pane is scrolled, sending a command (Enter,
  including empty Enter) or pressing any forwarded macro key first snaps the
  game pane back to the live tail (ADR 0127).
- **ESC while scrolled:** the first ESC exits the scroll (back to the live tail)
  and the second ESC opens the in-game menu. When not scrolled, ESC opens the
  menu directly (docs/tmux-bindings.md root table, ADR 0127).
- Cockpit shows tmux's copy-mode position indicator (`[n/m]` top right) while
  scrolled. This is a tmux artefact, and a browser equivalent is a design choice
  (e.g. a subtle "scrolled / N new lines" marker). **Not specified by Cockpit.**

**Selection / copy (mouse)** (docs/tmux-bindings.md, ADR 0036)
- **Drag** in the game pane (or the comm/ui panes) selects text. On release the
  selection is **copied to the system clipboard automatically** (copy-on-select)
  and focus returns to the input.
- **Double-click** selects and copies a word. **Triple-click** selects and
  copies a line. In Cockpit focus does *not* return after these (a tmux quirk).
  A browser should return focus anyway.
- A drag that ends on another pane or border still copies and leaves no stuck
  selection state (ADR 0036 "sweep" invariant).
- Right-click does nothing (tmux context menu disabled). A plain click on any
  non-input pane gives focus back to the input and does **not** cancel an
  active scrollback (deliberate asymmetry, docs/tmux-bindings.md).
- Browser note: all of the tmux/copy-mode/OSC 52/`(goto line)` machinery
  disappears. Use the native DOM selection plus `navigator.clipboard.writeText`
  on mouseup (copy-on-select). Clicking must not steal focus from the input
  for longer than the selection gesture lasts.

### 1.2 Input pane

**Look** (docs/input-pane.md, ADR 0029, 0067, 0068)
- Exactly **1 row**, **full window width**, at the bottom of the whole window,
  spanning under the right column too (ADR 0029). Always on, and cannot be
  toggled (ADR 0024).
- Three horizontal segments:

  | Segment | Width | Content |
  |---|---|---|
  | prompt | 2 cols fixed | `> ` in default fg, never scrolled off (ADR 0068) |
  | buffer | flex | the edited line; scrolls horizontally when long |
  | clock strip | 7 cols fixed | ` ` gutter + 5-col time (left-aligned, space-padded) + 1-col icon |

- Selection (including "recall state", below) uses the terminal's normal
  selected-text look (reverse video). No custom colour (ADR 0022).
- Autosuggest ghost text is grey `#666666`.
- No pane-toggle buttons (removed in ADR 0067). ADR 0067 notes the right strip
  could later hold a connection-status indicator or badge (not built).

**Clock strip** (docs/input-pane.md §Clock strip, ADR 0034, 0067)
- Shows the time **remaining until the next day/night transition** (not game
  time):

  | precision | format | examples |
  |---|---|---|
  | MINUTE | `M:SS` (total minutes : seconds) | `4:33`, `0:05`, `15:21` |
  | HOUR | `~N`, N = max(1, ceil(remaining/60)) | `~3` |

- Icon in the rightmost column: `☼` sun `#ffb000` during day, `☾` moon
  `#4a90e2` during night (same as the character pane Time row).
- Time text is **bold white `#ffffff`** on a dark background. On a light
  background it uses the washed-out bg-tinted "dark ink" shared with the UI
  pane base text (ADR 0145).
- Renders as `4:33 ☼` / `15:21☼`. If period, transition time or precision is
  unknown, all 6 cells are blank. There is never a partial value or a lone icon.
- The countdown ticks at 1 Hz, aligned to wall-clock second boundaries. The
  source is the clock model (GMCP `Event.Sun` + `time` text lines, see §8).
- Always visible at every width.

**Enter semantics**

| Buffer | Action |
|---|---|
| non-empty | Send it and append to history (consecutive dedup). The buffer is **refilled with the sent text, fully selected** ("recall state"). |
| empty | Send a **bare newline**. Never re-sends the last command. MUME uses an empty line to **abort a delayed command/cast** (feeds `user_input_empty`, §8). tt++ `REPEAT ENTER` is OFF. |
| recall state (selected) | Enter sends the same text again, so repeating a command is a single Enter. |

**Recall state = whole-buffer selection** (ADR 0022)
- Entered by the post-Enter refill, by Up/Down history navigation, and by Ctrl+A.
- While the whole buffer is selected:
  - a printable key replaces it (new command);
  - Backspace/Delete clears it;
  - Left/Right/Home/End deselect and move the cursor;
  - Shift+Left/Right adjust the selection;
  - Ctrl+C copies it (handy for grabbing the command just sent).
- Shift+Home / Shift+Up select from the cursor to the start. Shift+End /
  Shift+Down select from the cursor to the end. Each press recomputes the
  selection; there is no multi-step extension (ADR 0022 amendment).
  Ctrl+Shift+arrows select by word.

**History** (in-memory, per running client; **not persisted**, no size cap)
- Consecutive dedup: `look, look, look` gives one entry, while `look, north, look`
  keeps both `look` entries.
- Up from recall state (just sent) skips the entry already shown and goes to the
  one before it.
- Up from a typed draft saves the draft and shows the newest entry.
- Up while browsing goes one older, clamped at the oldest.
- Down while browsing goes one newer. Past the newest it restores the saved
  draft, and one more Down clears the line. Down when not browsing does nothing.
- Any edit ends browsing.
- Browser note: persisting history per profile/character is a possible
  improvement. Cockpit does not do it.

**Inline autosuggest** (opt-in, **default off**; toggled live from the in-game
menu Options and the launcher Options; ADR 0142)
- Fish-style grey suggestion: the newest history entry that starts with the
  typed text and is not equal to it.
- **Nothing is suggested until the buffer contains a space.** `kill ` matches
  `kill orc` but not `killer`.
- Right (at end of line) or End accepts the whole suggestion without sending it.
- **Tab** accepts the next word (`kill ` → `kill orc` → `kill orc the` → …).
  Once the suggestion is fully used, further Tab does nothing. With no active
  suggestion, Tab is forwarded as a macro key.
- No suggestion is shown in recall state. Backspace/Delete hide it until the
  next typed character.
- **Prefix-filtered browse:** with a suggestion showing, Up/Down walk only the
  history entries matching the typed prefix.
  - The typed prefix stays committed with no selection, and the match remainder
    shows as ghost text.
  - Up skips the currently suggested entry (it is already visible).
  - Down past the newest returns to the plain prefix and its default suggestion.
  - Enter sends the browsed match directly. Right/End/Tab accept it without
    sending.
  - Any edit leaves filter mode.

**Clipboard keys** (ADR 0022)

| Key | Action |
|---|---|
| Ctrl+C | Copy the selection. Does nothing without a selection. Never quits or interrupts. |
| Ctrl+X | Cut the selection. |
| Ctrl+V | Paste, replacing the selection. CRLF is normalised to LF. |
| Ctrl+A | Select the whole buffer. |
| Ctrl+D | No-op. |

Other editing keys: Backspace, Ctrl+W, Alt+Backspace (delete word), Ctrl+E,
and Alt+B/F/D (readline word moves/delete, so those Alt letters are reserved).

**Forwarded macro keys** (keys the input pane does not consume are sent to the
macro table; docs/input-pane.md §Forwarded key classes)

| Class | Keys forwarded | Reserved / not forwarded |
|---|---|---|
| F-keys | F1–F12 | Shift+F-keys (terminal limitation) |
| Numpad | 0–9 `.` `+` `-` `*` `/` Enter (needs Num Lock ON) | numpad with Num Lock off |
| Alt+letter | a c e g h i j k l m n p q r s t u v w x y z | b d f (word editing), **o** (parser collision with numpad `/`) |
| Ctrl+letter | g l o | everything else (editing, clipboard, terminal) |
| Tab | when no autosuggest is active | — |
| Bare ESC | never (opens menu) | — |

- The shipped profile template binds the numpad: `0` flee, `2` south, `3` down,
  `4` west, `5` exits, `6` east, `8` north, `9` up, `+` open exit, `-` close
  exit (bridge/launcher/templates/blank_profile.tin).
- tt++'s `^` "only at start of input line" macro prefix does not work in Cockpit.
- The macro-key list is duplicated in the profile editor's key list and must
  stay in sync (ADR 0082). The browser should have **one** key table shared by
  the input handler and the editor.

**Terminal artefacts a browser lifts (intent Goal 8: any combination the
browser allows can be bound)**
- Alt+o not forwarded: an escape-sequence parser collision. Gone in a browser.
- Shift+letter is indistinguishable from an uppercase letter in a terminal. A
  browser sees `shiftKey` + `code`.
- Shift+F-keys, Ctrl+Shift+letter, Ctrl+most letters, and Alt+b/d/f are all
  bindable in a browser (subject to browser-reserved keys such as Ctrl+W/T/N,
  F5, F11 and Ctrl+Tab). Deciding the reserved set is a spec item.
- Numpad works regardless of Num Lock. `KeyboardEvent.code` gives `Numpad0`… even
  with Num Lock off, though `key` differs. DECKPAM/SS3 is irrelevant.
- The ESC 10 ms disambiguation timer and startup keystroke-echo hygiene are
  irrelevant.
- The OSC 52 clipboard write and the WSL win32yank/pyperclip paste chain are
  irrelevant. Use the async Clipboard API (paste needs a user gesture or
  permission, and Firefox restricts `readText`; a native `paste` event on the
  input is the robust path).
- Cursor flicker when the popup opens: gone.

### 1.3 Focus rules
- Invariant: **the input line always has focus.**
- Clicking any other pane returns focus to the input. This covers game, comm,
  ui, char, group and timers panes, borders and the status area. Clicks that
  act on pane widgets still perform their action.
- Wheel scrolling the game pane keeps focus in the input.
- Drag-select anywhere copies and then returns focus to the input.
- A click inside the input positions the cursor (mouse support in the input).
- The in-game menu (ESC) takes focus while open and gives it back on close.
- Browser note: also handle window blur/focus. Re-focus the input on
  `window.focus` and after any overlay closes.

OUT OF SCOPE: readability modules (they touch input echo/game text; see
intent non-goals).


## 2. Right-column panes

### 2.1 Layout, pane frame, toggles and per-pane options

#### Overall window layout

```
+--------------------------------------------+----------------------+
|                                            |▛▀▀ Character ▀▀▀▀▀▀▀▜|
|                                            |▌ (status, 9 rows)   ▐|
|                                            |▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟|
|                                            |▛▀▀ Timers ▀▀▀▀▀▀▀▀▀▀▜|
|          game pane (main output)           |▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟|
|          min width MAIN_MIN = 30           |▛▀▀ Group ▀▀▀▀▀▀▀▀▀▀▀▜|
|                                            |▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟|
|                                            |▛▀▀ Comm ▀▀▀▀▀▀▀▀▀▀▀▀▜|
|                                            |▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟|
|                                            |▛▀▀ UI ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜|
|                                            |▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟|
|                                            | dev (raw tail, off)  |
+--------------------------------------------+----------------------+
| > input line (full width, 1 row)                            4:33☼ |
+-------------------------------------------------------------------+
```

- **Game pane** left, flexible width. **Right column** a fixed-order vertical stack.
  **Input** is one row across the full window width at the bottom (ADR 0029/0030),
  with a 7-col day/night clock strip at its right end (see 2.5).
- **Fixed order, top to bottom:** `status` (Character) → `timers` (was "buffs") →
  `group` → `comm` → `ui` → `dev` (ADR 0006, 0053). Any subset may be open; order is
  always preserved. Status is always topmost when present.
- **Right-column width:** one absolute value `ui_width` (default **33** cols),
  changed only by dragging the main↔right border; persisted in `layout.conf`. No
  minimum width tied to pane content (ADR 0038 dropped the 29/33-col floors); panes
  adapt to any width, content is chopped when narrow (ADR 0023).
- **Browser note — scope gap:** Cockpit's layout is a single fixed-order right
  column. intent.md asks for panes that can be "docked and arranged freely".
  Cockpit gives no reference behaviour for reordering, docking left/right, tabs or
  floating panes; that is new design. The Cockpit layout is the *default* layout.

#### Heights

| Pane   | Default desired (content rows) | Minimum | Framed |
|--------|-------------------------------:|--------:|:------:|
| status | 9  | 3 | yes |
| timers | 8  | 1 | yes |
| group  | 6  | 1 | yes |
| comm   | 10 | 1 | yes |
| ui     | 5  | 1 | yes |
| dev    | 3  | 1 | never |

(bridge/layout/right_column_budget.sh; ADR 0071, 0137)

- Heights are **content rows**; a framed pane adds 2 rows (top+bottom border).
- **Allocation (cold start and every window resize):** if Σdesired fits, every pane
  gets its desired height and the leftover goes to the highest-priority pane.
  Otherwise the **Character pane is reserved its desired height first** (ADR 0137),
  then the others scale linearly between minimum and desired. Priority for leftover
  rows: `ui > status > comm > timers > group > dev`.
- **Survivor selection** when even the minimums don't fit: drop panes in order
  `dev, group, timers, comm, status, ui` until the minimums fit. The user's
  on/off preference is **not** changed; a bigger window next time restores them
  (ADR 0055, 0071).
- **Drag resize:** dragging a horizontal border between two right-column panes
  resizes them freely; on drag end the new heights are saved as the new
  `desired_<pane>` (persistent across sessions). Mid-session toggles never snap
  heights back (ADR 0030); only window resize and `cp -reset-heights` re-apply.
- **`cp -reset-heights`**: restores all desired heights to the defaults above, live.
- **Opening a pane when the column is full:** first equalize existing panes to fair
  share, retry; if still impossible, show
  `⚠ WARN: Cannot open <pane> pane — terminal too short. Close another pane or enlarge the terminal.`
  in the UI pane and leave the pane off (on/off setting not saved) (ADR 0072).
- **Overflow inside a pane:** status/group/timers are anchor-top and show a passive
  `↓ N more rows` / `↓ N more members` line (`#d4a04e` italic amber) when clipped;
  comm/ui are anchor-bottom with a clickable `↓ N newer messages` (ADR 0037).
- **Lesson/tmux artefacts:** ADRs 0004/0005/0006/0030/0053/0055/0070/0041/0072 are
  almost entirely tmux-geometry fights (split direction drift, "pane too small"
  displacing the input row, non-atomic relayout flicker — ADR 0012). A browser
  layout engine (CSS grid/flex, one atomic relayout per frame) removes all of
  them. Keep the *behaviour*: desired heights, per-pane minimums, Character
  reserved first, drag persists, resize re-applies, reset command.

#### Narrow window collapse and minimum-size gate

- **Narrow collapse:** when the window becomes too narrow to give the right column
  `ui_width` while keeping the game pane ≥ 30 cols, all right-column panes are hidden;
  the list of what was open is remembered and restored in order when the window
  widens again. Pane toggles are no-ops while collapsed. (docs/bridge-services.md)
- **Too-small gate (launcher/menus):** below **60 × 18** the launcher shows only
  "Terminal too small"; all keys swallowed except Ctrl-C/Ctrl-Q; recovers
  automatically on resize. The R-to-reset-foot.ini hatch (ADR 0113) is
  OUT OF SCOPE (foot/WSL specific).
- **Browser note:** equivalent is a min-viewport rule (e.g. collapse the right
  column below a width breakpoint, show a "window too small" overlay under some
  min size). Decide thresholds in spec; 60×18 cells is the Cockpit reference.

#### Toggles

| Surface | How |
|---|---|
| `cp -c` | Character (status) |
| `cp -t` | Timers |
| `cp -g` | Group |
| `cp -m` | Comm |
| `cp -u` | UI |
| `cp -d` | Developer |
| Options → Panes → General grid (launcher and in-game popup) | on/off + colour + border per pane |

- Every path **persists** (`show_<key>` in `startup.conf`, ADR 0039). Popup changes
  apply live; launcher changes on Back/ESC and take effect at next start.
- Fresh defaults: all on except `dev` (off).
- `cp -h` (global headers toggle) is retired; colours/borders/corner style have no
  `cp` alias.

#### Options → Panes → General (the pane × colour grid, ADR 0086)

```
─── Panes ───  (hub: General · Timers · Communication · Group · Back)

              None    Red     Green   Blue    Grey    Orange  Purple  Border
Character    [X]     [ ]███  [ ]███  [ ]███  [ ]███  [ ]███  [ ]███    [X]
Buffs        [ ]     [X]███  [ ]███  ...                               [X]
Group        ...                     (green checked)                   [X]
Communication...                             (blue)                    [X]
UI           [X]     ...                                               [X]
Developer    (whole row dim = off)                                     (blank)

             << Corner style: Auto >>

             << Back >>
                         ↑↓←→ Move · Enter Toggle · ESC Back
```

- Each row: **0 or 1 checked cell**. 0 = pane off (entire row dim `C_PANE_OFF`);
  1 = pane on with that colour. Clicking the checked cell turns the pane off;
  clicking another cell turns it on with that colour.
- "None" column = no background override (terminal/page background); its swatch is
  blank spaces.
- Trailing **Border** checkbox per pane (`border_<key>`); inert blank for Developer.
- **Corner style** cycle: Auto → Quadrant → Block.
- Cursor grammar: gold foreground on the cursor cell's `[ ]`/`[X]`; checked `[X]` =
  `C_ACTIVE`, unchecked = `C_HINT`; mouse hover moves the cursor. Arrow keys clamp,
  column position persists across rows.
- Lost affordance (accepted): cannot pre-set a colour on an off pane.
- Grid row label for timers is still "Buffs" in the launcher doc (naming drift).

#### Per-pane background palette

| Name | Label | Fill hex | Border hex (fill + 0x14/channel) | Shade (h, s) |
|---|---|---|---|---|
| `black` | None | — (terminal bg) | derived from terminal bg (see below) | from terminal bg |
| `red` | Red | `#1a0e0e` | `#2e2222` | (2, 60) |
| `green` | Green | `#0e1a0e` | `#222e22` | (130, 42) |
| `blue` | Blue | `#0e141c` | `#222830` | (210, 58) |
| `grey` | Grey | `#161616` | `#2a2a2a` | (0, 0) |
| `orange` | Orange | `#1c140a` | `#30281e` | (28, 62) |
| `purple` | Purple | `#16101c` | `#2a2430` | (278, 46) |

(bridge/launcher/palette.py, bridge/panes/pane_frame.py)

- Shipped defaults: Character None, Timers Red, Group Green, Comm Blue, UI None,
  Dev Grey.
- Colour changes apply **live** (next frame) — every colour decision is re-resolved
  per render, never cached at load (ADR 0145 lesson).

#### Pane frame (ADR 0136, docs/pane-frame.md)

- Drawn **inside** the pane: top row `▛▀▀ <Label> ▀▀…▀▜`, left edge `▌`, right edge
  `▐`, bottom row `▙▄▄…▄▟`. Label left-aligned on the top border.
  Labels: `Character`, `Timers`, `Group`, `Comm`, `UI`. Dev is never framed.
- **Foreground-only** glyphs: the pane background shows through everywhere; content
  area shrinks to W−2 × H−2 when framed.
- **Corners:** quadrant `▛▜▙▟` when the font has them, else full block `█` at all
  four corners. Setting Auto/Quadrant/Block; Auto probes the terminal font's own
  file (fontconfig/fontTools). Browser note: the font is ours (web font), so
  probing is unnecessary; Quadrant can be the default, the setting may remain as a
  fallback for user-chosen fonts.
- **Border/label colour:** named pane colour → table above. None pane → terminal bg
  lifted +0x14/channel, floored at HSL L16 (pure black → ~`#292929`). On a light
  effective background → same hue at HSL L80 (`BORDER_L_LIGHT`).
- Border per pane on/off (`border_<key>`, default on).

#### Shade ramp (used by Character and Group content)

One hue (pane colour's h,s; None → terminal bg's h,s; neutral → greys) walked down
HSL lightness. Dark ramp (L, Δsat) / light ramp:

| Role | Dark L (Δs) | Light L (Δs) | Used for |
|---|---|---|---|
| `track` | 15 (−8) | 80 (−10) | bar bg, inactive ticks, toggle off-box |
| `dim` | 27 (0) | 55 (−6) | XP session-gain bg, TP-baseline fg, gauge labels |
| `mid` | 42 (0) | 40 (−4) | TP session-gain fg |
| `paneBg` | 8 (0) | 25 (−2) | dark text on toggle boxes |
| `vtext` | 72 (−30) | 22 (−18) | gauge value text, group names |
| `label` | 60 (−22) | 34 (−14) | player name, level badge |
| `glow` | 64 (−18) | 60 (0) | active tick, wimpy caret, toggle on-box |

- Light/dark chosen from the pane's **own effective background**
  (HSL L > 58 = light), not the terminal's (ADR 0145). Helpers: `light_shift`
  (darken/saturate text for light bg), `washout` (pastel fills), `dark_ink`
  (bg-tinted L40 ink). Browser note: the light theme matters only if WebCockpit
  offers light page themes (intent goal 6: configurable colours).

#### Inactive / disconnected panes (ADR 0051)

- When no MUME session is connected, **Character, Timers, Group, Comm blank their
  content area** (and overflow indicators); frame, size and position unchanged.
  UI pane keeps showing its log. Light-up/dark-down is aligned with the
  `● SYSTEM: X logged in.` / `logged out.` lines.
- On disconnect the character state is reset (all fields null), so after reconnect
  the board starts from `—` until GMCP arrives.

#### Developer pane

Optional, undecided (Cockpit: raw tail of debug.log, never framed, default off).

---

### 2.2 Character (status) pane

Nine content rows, no blank separators (docs/status-pane.md, ADR 0138). Every
colour comes from the pane's shade ramp (2.1), so the board retints with the
pane colour. Mockup at W=31:

```
▛▀▀ Character ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
▌           Khazdul         L42▐   row 1  name, XP bar as background, level badge
▌▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀          ▐   row 2  TP thin bar
▌ SNEAK   RIDE    CLIMB   SWIM ▐   row 3  four filled toggle boxes
▌     MOOD         ALERTNESS   ▐   rows 4-6  gauge: label / value bar / ticks
▌    wimpy          normal     ▐
▌▀   ▀  ▀   ▀  ▀  ▀  ▀  ▀  ▀  ▀▐
▌   POSITION         WIMPY     ▐   rows 7-9
▌   standing          100      ▐
▌▀    ▀     ▀    ▀     ^       ▐
▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟
```

#### Row 1 — name, XP progress, level

- Name (`Char.Name`, capitalised) centred in W; `—` when unknown. Fg = `label`.
- Background is the XP bar across the whole row, three segments:
  `floor(W·xp_baseline)` cols `track` (XP at session start) → up to
  `floor(W·xp_progress)` cols `dim` (XP gained this session) → rest no bg.
- `L<level>` badge right-aligned in the last cells, `label` fg, over the bar.
  Level is **derived from XP** via the level threshold table (levels 1–100), not
  from `Char.StatusVars` (unreliable after a death level-drop).
- `xp_progress` = fraction through the current level.

#### Row 2 — TP thin bar

- `▀` glyphs: baseline `dim` fg, session-gain `mid` fg, rest blank.
- TP thresholds scaled ×0.1 for race `troll` (e.g. L5 with 100 TP = full bar for
  troll, 10 % otherwise).

#### Session-gain rules (ADR 0008 addendum)

| Situation | Bar |
|---|---|
| Level-up this session | baseline re-anchored to 0 → whole fill in gain shade until next level |
| Reconnect | run counters reset → all baseline shade |
| XP lost this session (negative run XP) | all baseline shade, gain segment 0 until XP recovers past session start |
| Death level-drop | progress within the new lower level, baseline shade |

- Session anchor (XP/TP at run start) is immutable within a run; only the kill-fold
  anchor rebases on negative delta. Session XP/TP deltas are **not** printed as
  numbers in this pane; they appear as the gain segments (and per-kill in the UI
  pane, see 2.4).

#### Row 3 — toggle boxes

- Four equal columns (`(W−3)//4`, remainder to leftmost), 1-col gaps:
  `SNEAK RIDE CLIMB SWIM`, label centred, uppercase.
- Off: `track` bg; on: `glow` bg; label fg `paneBg` (dark) in both states.
- Data (`Char.Vitals`): sneak `s`/`S` → on; ride truthy → on; climb `c`/`C` → on;
  swim boolean. Missing/null → off.

#### Rows 4–9 — 2×2 stepped gauges

- Two columns: left = cols 1+2 of the toggle grid + gap, right = cols 3+4 + gap, so
  the gauge gap lines up under the RIDE/CLIMB gap.
- Each gauge = 3 rows: centred uppercase label (`dim` fg, no bg) / centred value on
  a full-width `track` bar (`vtext` fg; empty bar when null) / tick row on the real
  pane bg.
- **Ordinal ticks:** N `▀` teeth at `round(k·(colW−1)/(N−1))`; current step `glow`,
  others `track`; unknown value → all inactive.

| Gauge | Steps (low → high) | Source |
|---|---|---|
| MOOD | wimpy, prudent, normal, brave, aggressive, berserk | `Char.Vitals.mood` |
| ALERTNESS | normal, careful, attentive, vigilant, paranoid | `Char.Vitals.alertness` |
| POSITION | sleeping, resting, sitting, standing | `Char.Vitals.position` |
| WIMPY | continuous: single `glow` `^` at `round(clamp(wimpy/maxhp)·(colW−1))` | `Char.Vitals.wimpy` + `maxhp` |

- Wimpy value also updated from text lines `Wimpy set to: …` / `Wimpy removed.`
  (no GMCP packet for those). Caret hidden when wimpy or maxhp unknown/0.
- Position values not in the list (e.g. fighting/incap) show text but no lit tooth.

#### Time row

- **No time row any more.** Game time moved to the input-line clock strip (2.5). The
  `panel_time` format string and "status pane Time row" references in
  docs/clock.md / input-pane.md are stale. Status still carries the time fields as
  the transport for the input clock.

#### Width, height, behaviour

- Width fully adaptive, recomputed each frame; numbers may be chopped at very narrow
  widths (ADR 0023). Content 9 rows; desired 9, min 3, reserved first under a tight
  budget (ADR 0137).
- Anchor-top, no scroll; mouse does nothing; passive `↓ N more rows` if clipped.
- Updates: every `Char.Name`, `Char.StatusVars`, `Char.Vitals`, clock change, reset.
- **Browser note:** data path (Lua → JSON file → 50 ms poll) disappears; render
  directly from GMCP state on change.

---

### 2.3 Group pane

(docs/group-pane.md)

#### Look

- One row per displayed member: three bars filling the row with no gaps,
  `[HP][Mana][Moves]`, widths `W//3` (+1 to leftmost for remainder).
- Fill = `int(pct·bar_w + 0.5)` (round half up). Null pct → empty bar.
- **Colours (all three bars share thresholds):**

| Condition | Bar bg |
|---|---|
| pct ≤ 0.25 | `#e02020` red |
| 0.25 < pct ≤ 0.45 | `#ff7020` orange |
| > 0.45 | HP `#005A18`, Mana `#0000AA`, Moves `#5A3C1E` |

  Light pane bg: defaults washed to pastels `#90d5a2` / `#9090d5` / `#c4b2a1`;
  red/orange stay vivid.
- **Name overlay** left-aligned from col 0 across all three bars, truncated to W, no
  ellipsis. Fg `vtext` shade (light grey on dark); bg = the bar colour under that
  column if inside the fill, else pane bg.
- Overlay text: NPC with label → `Name (Label)` (e.g. `citizen mercenary (Aragorn)`);
  allies and unlabeled NPCs → bare name. Players never labeled.
- Order: ascending GMCP id. Anchor-top; overflow line `↓ N more members`
  (`#d4a04e` italic), showing first H−1. Empty set → blank pane.
- Default height 6; inactive run → blank.

```
▛▀▀ Group ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜
▌Gandalf███████ ████████ ███████▐
▌citizen mercenary (Bob)█  ████ ▐
▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟
```

#### Data (GMCP `Group.*`)

- `Group.Set` (full), `Group.Add`, `Group.Update` (partial, by id), `Group.Remove`.
- Member types: `ally` (player), `npc`, `you` (self — always excluded; covered by
  Char.*).
- **Room-scoped (ADR 0096):** MUME only reports members in your room. Leaving the room
  → `Remove`; returning → `Add` with a **new id**. The pane shows "who is here", not
  the roster. Stable identity = `label` (NPC) or `name` (ally).
- **Labeled NPCs (ADR 0094/0095):** NPC with non-empty string `label` is a member;
  `label: 0`/null/`""` = unlabeled. An `Update` adding a label promotes the NPC
  into the list; clearing it demotes it. Unlabeled NPCs are kept in a side set.
- **Vital-pair freshness (ADR 0052):** each vital has value+max and a band string
  (`hp-string` etc.). Updates may carry only one half:
  both → store both; value only → drop stale string; string only → keep cached
  value only if its % lies in the string's band, else drop value. Pct = value/max
  when known, else **band midpoint**.

| Kind | Bands (inclusive %) |
|---|---|
| HP | dying 0, awful 1–10, bad 11–25, wounded 26–45, hurt 46–70, fine 71–99, healthy 100 |
| Mana | frozen 0, icy 1–10, cold 11–25, warm 26–45, hot 46–75, burning 76–99, full 100 |
| Moves | exhausted 0, fainting 1–4, weak 5–14, slow 15–29, tired 30–49, rested 50–69, steadfast 70–99, unwearied 100 (placeholder calibration) |

#### Display options (Options → Panes → Group; ADR 0139, 0140)

```
─── Group ───
   << [X] Show players >>
   << NPC visibility: Labeled >>

   << Back >>
          ↑↓ Move · ←→ Adjust · Enter Toggle · ESC Back
```

| Key | Values | Default | Effect |
|---|---|---|---|
| `group_show_players` | 1/0 | 1 | 0 hides allies |
| `group_npc_mode` | off / labeled / all | labeled | off hides NPCs; all also shows unlabeled group-NPCs (charmies, pets, mounts, unlabeled mercs), interleaved by id, bare name |

- Filtering is **display-only**; membership logic (and consumers like run log) sees
  the canonical set. Popup changes apply live; launcher on next start.
- ADR 0124 (controlled mobs: enslaved shadow, wood elf, dreadful warg) concerns
  the Timers pane's charm list, not this pane; such followers appear here only as
  unlabeled NPCs in `all` mode.

---

### 2.4 UI messages pane

(docs/ui-pane.md, docs/ui-messaging.md)

#### Look

- Scrolling log, newest at bottom, wrapped lines, one event per line, **no
  timestamps**. Base text bold bright white; dynamic values (names, numbers,
  files) bold yellow `#FFEE58`. Every message is a sentence ending in `.`.
- Default height 5 rows; highest-priority pane for leftover rows.

| Prefix | Kind | Prefix colour |
|---|---|---|
| `▶ NAME:` | script / feature event | teal `#26C6DA` |
| `● SYSTEM:` | infrastructure (connect, disconnect, profile save) | blue `#42A5F5` |
| `◆ TAG:` | character-state lifecycle | per tag (below) |
| `⚠ WARN:` | degraded path the player should see | amber `#FFB300` |
| `✖ ERROR:` | failure | red `#E53935` |

| `◆` tag | Colour | Emitted for |
|---|---|---|
| SPELL | `#7AA9D6` | spell affect up / refreshed / down |
| BUFF | `#8FBC8F` | buff affect up / refreshed / down |
| DEBUFF | `#C97070` | debuff up / down |
| STORE | `#B39DDB` | stored spell stored / recalled / decayed (detail) |
| BLIND | `#00CCCC` | blind landed / expired (90 s) |
| CHARM | `#B388FF` | charm/controlled follower up / down |
| HERB | `#9CCC65` | herblore phase up / down |
| AFFECT | `#26C6DA` | fallback for unknown category |

Form: `◆ TAG: name verb.` or `◆ TAG: name verb (detail).`
Verbs: `up`, `refreshed`, `down`, `stored`, `recalled`, `decayed` (`expiring`
reserved).

#### What core emits (representative)

| Category | Line |
|---|---|
| Connection | `● SYSTEM: Connecting to MUME...` / `X logged in.` / `X logged out.` / `Connection to MUME closed.` / reconnect notices |
| Profile | `● SYSTEM: Profile saved to …` ; `✖ ERROR: cp -s: no profile loaded.` |
| Kills | `▶ KILL: <mob>, <xp> xp.` (XP folded 500 ms after the R.I.P., split evenly across a burst of kills — ADR 0008) |
| Player kills | `▶ PKILL: <name>, <xp> xp.` |
| Death | `▶ DEATH: You died.` |
| Achievement | `▶ ACHIEVEMENT: Unlocked.` (GMCP `Event.Achieved`) |
| Affects / stored spells / blinds / charms / herbs | `◆` lines above; `▶ STORE: cast attempt for X failed.`; `⚠ WARN: STORE: lost track of stored spells.` |
| Layout | `⚠ WARN: Cannot open <pane> pane — terminal too short. …` |
| Run log | `⚠ WARN: RUN_LOG: failed to seal …` |
| Scripts | `▶ AUTOSTAB: Running.` etc. (scripts OUT OF SCOPE; the `▶` kind stays for user scripts) |

- No level-up line found in core UI output (level-ups surface via Spotlights).
- Readability warnings exist but readability is OUT OF SCOPE.
- Rules: max ~33 chars for `▶` messages (fits the default column); one helper
  call per event; combat hits/HP crossings never go here; comms are in the Comm pane.

#### Scroll

- Mouse wheel scrolls by line, wrap-aware; fully scrolled up pins the oldest line
  at the top (no blank space above).
- While scrolled up, new lines do not move the view; a clickable
  `↓ N newer messages` (amber `#d4a04e` italic) row appears; click → jump to live.
- Buffer: last 1000 lines.

#### Persistence

- **Correction to the brief:** `ui.log` does **not** survive a cockpit restart — it
  is truncated at every cockpit start, so the pane shows the current session only.
  It does survive reconnects within one cockpit run. The UI pane is **not** blanked
  when disconnected.
- **Browser note:** in-memory ring buffer per tab is enough; optionally keep it in
  session storage across reloads (spec decision). Light-theme recolouring is done
  at display time (never alters stored lines).

---

### 2.5 Clock

(docs/clock.md, ADR 0034, ttpp/core/clock.tin)

#### Model

- Passive, never sends commands. One anchor `mume_start_epoch` (real unix time of
  MUME year 0); 1 real second = 1 MUME minute; hour 60 s, day 1440 s, month 30 days,
  year 12 months (518 400 s). Current time computed on demand.
- Precision: `UNSET < DAY < HOUR < MINUTE`; never decreases during a session.
- Dawn/dusk hours per month (0 = Afteryule):
  `dawn = 8,9,8,7,7,6,5,4,5,6,7,7`, `dusk = 18,17,18,19,20,20,21,22,21,20,20,19`.
  Day = dawn ≤ hour < dusk; everything else night.
- Month names (Westron/Sindarin) and weekday names in docs/clock.md.

#### Sync sources

| Source | Trigger | Effect |
|---|---|---|
| GMCP `Event.Sun` `{what:"rise"}` / `"set"` | sunrise/sunset | hour = dawn/dusk of current month, minute 0 → MINUTE (needs ≥ DAY). WebCockpit (stage 18): `light` = dawn + 1 h and `dark` = dusk + 1 h, on the hour, also sync MINUTE |
| `time` output, full | `^%1 of the Third Age.$` e.g. `8 am on Mersday, the 26th of Solmath, year 2973 of the Third Age.` | date + hour → HOUR |
| `time` output, date only | `Mersday, the 26th of Solmath, year 2973 of the Third Age.` | date → DAY (keeps known hour/minute) |
| Room clock | `^The current time is %1.$` e.g. `The current time is 8:00am.` | hour+minute → MINUTE (needs ≥ DAY) |

- Ignored: `You cannot guess the time indoors.` and vague outdoor phrases.
- Internally a 4 Hz ticker emits `clock_changed` on each new MUME minute.

#### Where shown

- **Input-line clock strip** (right end of the input row, 7 cols): `␠` + 5-col
  countdown to the next day/night flip + 1-col icon. `☼` (`#ffb000`) during day,
  `☾` (`#4a90e2`) at night — icon shows the **current** period.
  MINUTE precision: `H:MM` (hours:minutes of game time = minutes:seconds real,
  e.g. `4:33`, ticks down each real second, aligned to wall-clock seconds —
  ADR 0034). HOUR precision: `~N` (N = ceil(remaining/60), min 1). DAY/UNSET:
  blank (no lone icon). Time text bold white (`dark_ink` on light background).
- Not in the Character pane any more (see 2.2). Clock formats (`compact`, `panel`,
  `full`) exist for other consumers; UNSET always renders `?`, never a wrong year.
- **Lesson (ADR 0034):** compute the countdown in the renderer from a target
  epoch, re-render on each wall-clock second boundary — otherwise the display
  skips/holds seconds. Directly applicable in the browser (`setTimeout` aligned
  to the next second).

#### Persistence and degradation

- Saved after every successful sync (not per tick) to `data/shared/clock.state`,
  **shared across all profiles/characters**: `mume_start_epoch`,
  `last_sync_epoch`, `last_sync_reason`, `precision`.
- On load:

| Age of last sync | Result |
|---|---|
| missing / > 7 days | seed epoch, precision UNSET (shows blank/`?`) |
| 24 h – 7 days | keep epoch, precision forced to DAY (no countdown) |
| ≤ 24 h | as stored |

- Seed: `SEED_EPOCH = 218678400` (MUME year 2850 start ≈ unix 1696118400).
- **Browser note:** store in browser storage, global (not per profile). Two tabs
  share it; last writer wins is fine since all syncs agree.

### 2.6 Timers (buffs) pane and its trackers

Right-column pane directly below Status (order: status → timers → comm → ui → dev).
Default height 8 content rows (`desired_timers=8`). Frame header label `Timers`.
Historically called the "buffs" pane (ADR 0032 split it out of the status pane).
Five independent trackers feed it: **affects**, **stored spells**, **blinds**,
**charms** (incl. controlled followers), **herblores**. The trackers run whether or
not the pane is visible (docs/timers-pane.md "Data layer").

#### 2.6.1 Look

**Groups**, top to bottom; a group renders only if enabled and non-empty:

| Group | Source | Membership | Default colour | Default cols cap |
|---|---|---|---|---|
| Spells | affects | `type == "spell"` | `#66b2ff` blue | 4 |
| Buffs | affects + herblores | type neither spell nor debuff | `#00d900` green | 4 |
| Debuffs | affects + herblores | `type == "debuff"` | `#d90000` red | 4 |
| Stored | stored spells | all | `#ff66ff` magenta | 4 |
| Blinds | blinds | all | `#00cccc` cyan | 2 |
| Charmies | charms + controlled mobs | all | `#B388FF` violet (name fg only) | 1 (max 2) |

Herblores have no group of their own: the current phase lands in Buffs or Debuffs
and moves between them by itself when a phase flips type.

**Optional group chrome** (two global toggles): a dim `Group:` header row above
each group (default on; colour = pane's bg-derived "dim" shade), and a blank row
between groups (default off = "compact").

**Grid.** Width `W` split into `n = min(cap, max(1, items))` cells —
the cap is a ceiling, so a lone item spans the full width. Widths:
`base = W // n`, the first `W % n` cells get +1. Each cell = `(cell_w−1)` chars of
`NAME.UPPER()` (truncated from the right, left-justified) + a `▌` separator.
Partial last rows end after the last cell.

```
SANCTUARY   ▌SHIELD      ▌ARMOUR      ▌BLESS       +     <- corner "+" (gold)
HUNGER      ▌THIRST      ▌
FIREBALL                   ▌EARTHQUAKE                ▌  <- Stored
2.ORC                               ▌TROLL           ▌  <- Blinds, 2-up
Huge stone troll                                 21m ×   <- Charm row
Enslaved shadow                                      ×   <- permanent: no minutes
```

**Bar drain** (timed cells):
`pct = clamp(remaining / expected_duration, 0, 1)`; `filled = int(pct*cell_w + 0.5)`
(round half up — do not use banker's rounding). Filled portion: `bg:<group colour>`,
`fg:#000000`. Unfilled portion: name in `fg:#C0C0C0` on pane bg. The `▌`
separator is drawn in the group colour only while the bar is full; otherwise it is a
plain space (adjacent drained cells merge visually). Indefinite affects: always full.
Redraw at 1 Hz aligned to wall-clock second boundaries.

**Special cell states**

| State | Rendering |
|---|---|
| Untracked affect (seen in `stat`/`info` only) | no fill, name `fg:#3a3a3a`, blank separator |
| Untracked stored spell (after magic blast / reconcile) | full bar in fixed grey `#cccccc`, black text, regardless of theme colour |
| Overrun (past expected expiry, drop line not yet seen) | bar simply empty (pct clamped 0), countdown `0s`; no `!` in this pane (the `!` of ADR 0027 was a status-pane rendering) |
| Barless group (`bar=0`) | no fill/no separator; name painted in group colour as fg (darkened on light backgrounds) |

**Countdown ("Clock", per group, default off; ADR 0133).** Right-justified over the
bar, name stays left. Format: remaining ≤ 90 s → `Ns`; > 90 s → minutes rounded
half-up `(secs+30)//60` → `Nm` (`91s → 2m`; `1m` never appears); clamp `0s`.
Narrow-cell ladder: A = name + space + time; B = clipped name + time flush;
C = name only. Rightmost-column clock cells drop the `▌` so digits reach the edge;
the topmost visible row's rightmost cell keeps one trailing blank so the corner `+`
never covers digits (scroll-aware). No countdown on charms, indefinite or untracked
entries.

**Blink:** removed. A final-30 s blink existed earlier; ADR 0133 replaced it with the
countdown. Do not reimplement.

**Charm row** (no bar): `<Name> <mins> ×`. Name: first letter capitalised, inner
case preserved, colour = charm colour. Minutes: count-**up** since landing,
`min(99, floor((now−started)/60))`, right-justified width 3 (` 0m`…`99m`),
`fg:#C0C0C0`. `×` in `#CC5555`, hover `#E88888`. Permanent entries (no expiry) show
no minutes and the name reclaims those columns. Name truncates from the right
(`Pack horse 21m ×` → `Pac 21m ×`). Sorted oldest first.

**Sort order within groups**
- Spells/Buffs/Debuffs: untimed first (alphabetical, case-insensitive), then timed by
  most time remaining first, name as tie-break.
- Stored: tracked first (most remaining first), then untracked (alphabetical).
- Blinds: most remaining first. Charm: oldest first.

**Corner control (ADR 0125).** A single `+` pinned to the pane's inner top-right
(inside the frame when the border is on), gold `#d4a04e`, hover `#f0c070`, no
background. It opens the herblore add-view; in the add-view it becomes `×` (close).
It **yields** (disappears) when the topmost visible row is a charm row, so that
row's own drop `×` is clickable. Glyph rule from ADR 0125: single-cell glyphs must
be ASCII/Latin-1 (`+`, `×`), never ambiguous-width (✚ ✖ ⊕ rendered double-width).
Browser note: the width problem disappears with a real font, but the corner/charm
collision logic still matters if the same geometry is kept.

**Scroll.** Wheel scrolls by rows. A 1-row indicator below the grid:
`↑ N rows above` (clickable → back to top) when scrolled, else `↓ N more rows`
(informational) when content overflows. Style `fg:#d4a04e italic`. New entries while
at the top extend the bottom without shifting the view.

**Inactive run** (not connected): grid and indicator blank, pane chrome kept.
Disconnect also resets add-view → grid and scroll → 0.

#### 2.6.2 Interaction

| Action | Effect |
|---|---|
| Click `×` on a charm row | Forget that charm (tracker only; nothing sent to MUME). Row clears when state updates. |
| Click corner `+` | Switch to herblore add-view (scroll reset). |
| Add-view: click `[+] Name` / `[-] Name` | Start / remove that herblore. Label flips once state updates (no optimistic UI). Hover brightens the label. |
| Click corner `×` in add-view | Back to grid. |
| Wheel | Scroll rows (both views). |
| Click `↑ N rows above` | Jump to top. |

No keyboard bindings in the pane. Known Cockpit wart: the drop command
(`_cp_charm_drop <id>`) echoes into the game scrollback because it goes through
tmux send-keys → tt++. Browser note: in a browser the click calls the tracker
directly, the echo problem and the send-keys channel vanish.

Add-view layout, one row per catalogue entry in catalogue order:

```
[+] Healing
[-] Travelling          <- active
[+] Clearthought
[+] Walking
[+] Haste
[+] DarkAura                                        ×
```

#### 2.6.3 Layout menu (Options → Panes → Timers; ADR 0126)

A 6-row grid (Spells, Buffs, Debuffs, Stored, Blinds, Charmies) with a dim header
row of column labels:

```
           Blue  Green  Red  Magent Cyan Violet Orange  Cols   Clock Bar
Spells   [X]███[ ]███[ ]███[ ]███[ ]███[ ]███[ ]███  ◄ 4 ►   [ ]  [X]
...
Charmies [ ]███ ...                 [X]███ ...       ◄ 1 ►
[X] Display headers
[X] Compact layout
Back
```

- 7 swatches (`TIMERS_COLOR_ORDER` in bridge/launcher/palette.py): Blue `#66b2ff`,
  Green `#00d900`, Red `#d90000`, Magenta `#ff66ff`, Cyan `#00cccc`, Violet
  `#B388FF`, Orange `#ff9933`. (ADR 0126 says nine incl. Yellow/Teal; code and
  launcher.md have seven — code wins.)
- Per row 0 or 1 swatch checked: 0 = group hidden (row painted dim, colour
  remembered); checking another swatch moves the choice. Charmies' swatch colours the
  name.
- `◄ N ►` column cap, clamp 1–6 (Charmies 1–2). The digit is display-only.
- `Clock` and `Bar` checkboxes per group; inert blank for Charmies.
- Two global toggles: Display headers, Compact layout.
- Keys: ↑↓ rows, ←→ columns on grid rows (7 colours, ◄, ►, Clock, Bar), Enter/click
  toggles, ESC/Back saves. Mouse hover moves the cursor.
- Launcher saves on Back; the in-game popup writes each change immediately and the
  running pane picks it up within ~100 ms (live re-read). Browser: just apply live.

**Config keys** (global, not per character; `timers_layout.conf`):
`timers_<type>_{enabled,color,cols,clock,bar}` for type ∈
`spell|buff|debuff|stored|blind|charm`, plus `timers_headers`, `timers_compact`.
Defaults: all enabled, colours as in the table above, cols 4/4/4/4/2/1, clock 0,
bar 1, headers 1, compact 1. Invalid values fall back per key. Disabling
buff/debuff also hides herblores in that group.

#### 2.6.4 Common tracker model

All trackers share the same shape; the web client can have one generic "timed
entry" model:

- Entry: `name`, `type`, `started_at`, `expected_duration`, `expires_at` (both null
  = indefinite/untracked), optional `tracked=false`.
- **Per-character persistence** under `data/characters/<Char.Name verbatim>/`:
  active list written atomically on every mutation, an empty list written as `[]`
  (never deleted), **never touched on disconnect**; loaded on `Char.Name`
  (login/reconnect/restart), dropping entries whose `expires_at` passed during
  downtime. Restore is silent (no announcement lines).
- Each landing/removal emits a `◆ TAG: name verb.` line to the UI pane (tags
  SPELL/BUFF/DEBUFF/STORE/BLIND/CHARM/HERB; see docs/ui-messaging.md — covered in
  the UI-pane section).
- Browser note: `data/characters/...json` files become browser storage keyed by
  character name; tt++ `#action` becomes the client's own line-trigger engine;
  `#delay` ticks become timers. The tt++ "one action per pattern" shadowing hazard
  (ADR 0123) goes away if the trigger engine allows several handlers per line — but
  the single-owner design for shared cast lines is still a good idea.

#### 2.6.5 Affects tracker (docs/affects.md; ADRs 0027, 0118)

**Data table:** `lua/core/affects_data.lua` — **47 affects** (19 buff, 16 debuff,
12 spell); **37 have a fixed `duration`**, 10 are indefinite (hunger, thirst,
comfortable, very comfortable, growth, depression, shadow-link, chill touch, heavy
burden, spectral health). 2 are flagged `damage_droppable` (armour, shroud).
Schema:

```lua
["sanctuary"] = {
    type = "spell", duration = 270,               -- seconds; absent = indefinite
    initString_1 = "^You start glowing.$",           -- start (refresh if already active)
    initString_2 = "^Your aura glows more intensely.$", -- refresh (start if not active)
    dropString_1 = "^The white aura around your body fades.$", -- up to dropString_3
    damage_droppable = true,                      -- optional (ADR 0118)
},
```

Patterns are anchored full lines in tt++ syntax (`%*` = wildcard; `.` literal). A
few are unanchored prefixes (e.g. `^Your focus sharpens as you share an enslaved
shadow`). One line can serve two affects: `^Your energy wanes as your second wind
fades.$` drops *second wind* and starts *winded*. Several affects share a line
between drop of one and start of another (comfortable ↔ very comfortable).

Representative rows:

| Affect | Type | Dur (s) | Start line | Drop line |
|---|---|---|---|---|
| sanctuary | spell | 270 | `You start glowing.` | `The white aura around your body fades.` |
| armour | spell | 1100 | `A blue transparent wall slowly appears around you.` | `You feel less protected.` |
| shield | spell | 1560 | `You feel protected.` | `Your magical shield wears off.` |
| bless | spell | 480 | `You begin to feel the light of Aman shine upon you.` | `The light of Aman fades away from you.` |
| second wind | buff | 60 | `You feel a surge of energy as you gain a second wind.` | `Your energy wanes as your second wind fades.` |
| winded | debuff | 1380 | `Your energy wanes as your second wind fades.` | `You feel less winded.` |
| blindness | debuff | 90 | `You have been blinded!` | `You feel a cloak of blindness dissolve.` |
| hunger | debuff | — | `You are hungry.` | `You are full.` / `You do not feel hungry anymore.` |
| anger | buff | 30 | `You are filled with anger!` | (none — tick-pruned) |

**Durations — learned per character.** Ring buffer of the last **3** observed
durations per affect; `expected_duration = floor(mean(samples))`, else the table
`duration`. A sample is recorded only when the drop line is seen for a tracked,
timed entry (`now − started_at`). Saved to `affects_learned.json`
(`{"armour":[1095,1100,1102]}`).
- ADR 0118: for `damage_droppable` affects, samples shorter than the table duration
  are discarded (early drop from damage) — the learned value can only rise.

**Expiry (ADR 0027).** Affects with a drop line: the drop line is the only normal
expiry. Past `expires_at` the entry stays (overrun, bar empty) until the drop line
arrives; safety net prunes silently at `2.5 × expected_duration` with no sample.
Affects without a drop line: pruned at `expires_at`, no sample. Tick every 10 s.
Rationale: early pruning created a self-reinforcing under-prediction loop.

**Stat/info reconcile** (`ttpp/core/stat_reconcile.tin`, `lua/core/stat_reconcile.lua`):
after `^Affected by:$` or `^You are subjected to the following temporary effects:$`,
each `- <name>` line is collected until the first line not starting with `- `.
Lines starting `stored spell ` go to the stored-spell reconcile. Against the known
table: observed but not active → add (timed-capable ones as **untracked**, no bar);
active but not observed → remove silently (including indefinite ones); both → keep
the running timer. An untracked entry "graduates" to tracked on its next start/refresh
line.

**Persistence:** `affects_learned.json` (samples) and `affects_active.json` (timed
entries only; indefinite ones are never persisted and must be re-seen in game).

#### 2.6.6 Stored spells tracker (docs/stored-spells.md)

**Data table:** `lua/core/spells_data.lua` — **36 spells**, schema
`["magic missile"] = { shortest = "magic m" }` (shortest unambiguous prefix, used to
resolve abbreviations). Input `s` resolves to a spell iff it is at least as long as
`shortest`, matches that prefix, and is a prefix of the full name; exactly one match
required (`fireb`→fireball, `magic `→none).

**Detection**

| Signal | Source | Effect |
|---|---|---|
| Outgoing `sto X` / `stor X` / `store X` / `cast [speed] 'store' X` | user input | push X onto store-attempt FIFO |
| Outgoing `cast [speed] 'X' ...` | user input | remember X as last cast intent |
| `^[c%1 '%2'` / `^[c%1 %2 '%3'` (MUME's echo `[cast 'armour']`) | server line | last cast intent (catches alias-expanded casts) |
| `^You stored it.$` | server | pop FIFO → add entry |
| `^Your mind feels empty for a while.$` | server | oldest entry decays; record sample if tracked |
| `^You quickly recall your stored spell...$` | server (shared, spellcast) | remove newest entry of last-cast-intent spell |
| `^You blast the area with magical energies.$`, `^%1 blasts the area with magical energies.$` | server | all entries → untracked (grey), warning line |
| `Your mind is too full to store it.`, `You failed.`, `You do not know any such a spell.`, `You can cast quickly, fast, normally, carefully, or thoroughly.` | server | pop FIFO (store failed) |
| 8 shared cast-failure lines, empty Enter | spellcast | pop FIFO |

**Durations:** default **5400 s (90 min)**; learned mean of last 3 natural decays per
spell per character (`stored_spells_learned.json`). On decay, other tracked entries of
the same spell get their expiry recomputed from the new mean.

**Reconcile** from stat/info: multiset diff per spell name (duplicates are real —
two stored earthquakes = two lines); extra observed → add untracked; missing →
remove untracked first, then oldest tracked. Silent.

**Persistence:** `stored_spells_active.json` (tracked + untracked; untracked never
expire) and `stored_spells_learned.json`.

#### 2.6.7 Shared cast-attempt queue (docs/spellcast.md; ADR 0123)

Casting in MUME is serialised, so a FIFO of outgoing cast attempts maps generic
feedback lines to the right cast. One owner registers each shared line once:

| Line | Meaning |
|---|---|
| `Argh! You cannot concentrate any more...` | fail |
| `Nah... You feel too relaxed to do that.` | fail |
| `In your dreams, or what?` | fail |
| `Alas, not enough mana flows through you...` | fail |
| `Your spell backfired!` | fail |
| `Nothing seems to happen.` | fail |
| `You flee %1.` | fail |
| `You are too afraid.` | fail |
| `Nobody here by that name.` | bad target: pop front |
| `You quickly recall your stored spell...` | recalled (in flight) |
| `You start to concentrate...` / `You muster all of your concentration...` | cast started (in flight) |
| (empty input line sent) | cast aborted: pop front |

Queue entries `{kind="blindness", prefix}` / `{kind="charm", inflight}`; flushed after
10 s of no new casts. Accepted flaw: a shared failure pops the front of **both** the
blind/charm queue and the store queue ("cross-pop"). Runtime only, never persisted.
Cast recognition: first token a prefix of `cast` (`c`…`cast`), then optional speed
words, then a quoted spell token (blindness: prefix ≥3 chars `'bli'`; charm: ≥2
`'ch'`).

#### 2.6.8 Blinds tracker (docs/blinds.md)

- Trigger: `^%1 seems to be blinded!$` always creates a bar (strip leading `A `/`An `
  article only before whitespace — `Anaru` stays). If a blindness cast is at the
  queue front with a typed numeric prefix (`cast 'bli' 2.orc`), the bar is named
  `2.orc`; otherwise bare name. Captures item and third-party blinds too.
- `^Your victim is already blind.$` → pop the queue.
- **Fixed 90 s**, no drop line, no learning; pruned at expiry (2 s tick).
- Announcements `◆ BLIND: 2.orc up.` / `down.` (tag cyan `#00CCCC`).
- Persistence: `blinds_active.json`; survives reconnect/restart minus elapsed time.

#### 2.6.9 Charm tracker (docs/charm.md; ADR 0124)

- Charm cast enqueues `{kind="charm"}`; the entry is marked in-flight by "start to
  concentrate"/"muster" or by a stored-spell recall.
- Success: `^%1 starts following you.$` or `^Your control on %1 is renewed!$` — only
  accepted when an **in-flight** charm is at the queue front (the follow line is
  ambiguous: mercs, pets, group members). Article `a/an/the` stripped
  case-insensitively. A re-charm adds a fresh entry (user drops the stale one).
- Resist: `^%1 seems to be ruled by powers other than yours...$` → pop.
- **Cap 99 min** (`expires_at = start + 5940`), 2 s tick prunes; count-up display.
- **Controlled-without-charm** mobs recognised by name on the same follow line,
  no cast needed and no queue consumed:

| Mob | Behaviour |
|---|---|
| enslaved shadow | permanent (no timer, only × removes) |
| wood elf | timed 99 min; drop on `^A wood elf leaves and vanishes into the distance.$` |
| dreadful warg | permanent; replaces the oldest enslaved shadow (in-game transform) |

- Each entry has a monotonic `id` (never reused, restored past max on load) — the ×
  targets the id.
- Persistence: `charms_active.json`; permanent entries survive any downtime.

#### 2.6.10 Herblore tracker (docs/herblores.md)

Manual only (no triggers): user adds/removes via the add-view. A herblore is a fixed
sequence of phases; the current phase shows as an ordinary buff/debuff cell whose bar
drains across that phase. Catalogue (in `lua/core/herblores.lua`, 6 entries, order
fixed):

| Key | Phases (name · seconds · type) |
|---|---|
| Healing | Healing 3600 buff → Healing (low) 3600 buff |
| Travelling | Travelling 7200 buff → (med) 1440 buff → (min) 1440 buff |
| Clearthought | Clearthought 120 buff → (low) 240 buff → (neg) 360 **debuff** |
| Walking | Walking 1440 buff → (med) 7200 buff → (min) 1440 buff |
| Haste | Haste 360 buff → Haste (recovery) 1080 **debuff** |
| DarkAura | Dark aura 210 buff → Dark aura (faded) 3600 **debuff** |

- Add is a no-op if already active (no refresh). Phase derived purely from
  `started_at` + catalogue, so persistence stores only `[{key, started_at}]`
  (`herblores_active.json`); restore replays elapsed phases silently.
- Announcements: `◆ HERB: <phase> up.` on add and every live phase change;
  `down.` on final expiry/removal. HERB tag `#9CCC65`.
- Note: `affects_data.lua` also contains game-detected entries named like herblore
  phases (`dark aura`, `haste (active)`, `haste (recovery)`, `heightened senses`…),
  independent of the manual catalogue.
- Browser note: Cockpit keys are single tokens only because of tmux send-keys —
  irrelevant in a browser; the display names can be used directly.

#### 2.6.11 Browser notes and lessons (summary)

- Irrelevant: `timers.state` file + 100 ms mtime poll, tmux send-keys, tt++ echo of
  drop command, launcher-vs-popup save asymmetry, duplicated defaults across Python
  packages (ADR 0126), prompt_toolkit Float tricks (ADR 0033/0125 rationale).
- Keep: learned durations (3-sample mean), drop-line-as-truth with 2.5× net (ADR
  0027), armour floor (ADR 0118), untracked states, stat/info reconcile, cast FIFO,
  per-character persistence that survives reload, round-half-up bar maths,
  cap-as-ceiling column rule, the countdown format.
- Light-background handling: barless colours are darkened on light pane backgrounds.

### 2.7 Communication pane

Right-column pane below Timers (status → timers → comm → ui → dev). Default height 10
content rows. Frame header label `Comm`. Shows the GMCP channel history with a
one-row clickable channel-filter header.

#### 2.7.1 Data (GMCP)

| Message | Dir | Fields used |
|---|---|---|
| `Core.Supports.Set` incl. `"Comm.Channel 1"` | → | at handshake |
| `Comm.Channel.List` | ← | array of `{name, caption, command}` |
| `Comm.Channel.Enable` | → | sent for **every** advertised channel on receipt of the list (nothing hardcoded) |
| `Comm.Channel.Text` | ← | `channel`, `talker` (`"you"` for own), `destination` (only on sent messages), `talker-type` (npc/ally/neutral/enemy — stored, no longer used for display), `text` (may contain ANSI) |

Stored entry: `{ts, channel, talker, talker_type, destination, text}` — raw,
unnormalised; all normalisation happens at render time (ADR 0013), so the archive
stays re-renderable.

#### 2.7.2 Look

```
Narrates Tells Says Yells Prayers Emotes Whispers Questions Songs Socials   <- header
Gibur tells you 'np :)'
You whisper to Dori 'hej'
Vit bows before you.
Aragorn narrates 'anyone selling a sword?'
↓ 3 newer messages                                                          <- only when scrolled
```

**Header.** Channels in fixed order `tales, tells, says, yells, prayers, emotes,
whispers, questions, songs, socials` (filtered to those advertised; unknown advertised
channels appended in server order). Label = override (`tales` → `Narrates`) else
server `caption` else `name.title()`. Enabled label in channel colour, disabled in
`#3a3a3a`. No background. Whole padded cell is the click target; cells flush left.

**Width-responsive header (ADR 0098).** Given N labels and width W:
1. if `W−(N−1) ≥ N`: 1-space separators, budget `W−(N−1)`;
2. elif `W ≥ N`: no separators, 1+ char each;
3. else only the first W channels, 1 char each (others hidden but their filters still
   apply).
Per-cell width: natural lengths if the even share fits the longest label, otherwise
even prefix truncation (`budget // n`, first `budget % n` cells +1). Regimes: full
names → uniform truncation → single char + space → single char → trailing channels
dropped. No uniqueness logic (`S` for says and songs is accepted).

**Channel colours** (verb and header label):

| Channel | Colour | | Channel | Colour |
|---|---|---|---|---|
| tales (Narrates) | `#949400` | | whispers | `#965a00` |
| tells | `#008000` | | prayers | `#c3c36e` |
| emotes | `#008000` | | songs | `#b49696` |
| says | `#008f8f` | | questions | `#008f8f` |
| yells | `#640064` | | socials | `#9600a0` |
| unknown | `#78909c` | | | |

**Other colours:** time `#687685`; "you" talker/destination `#afd2d2`; other
talker/destination `#c2a878`; own message `#c3e6e9`; others' message `#91bec1`;
indicator `#d4a04e italic`. On a light pane background the content colours
(channel, talker, message) are darkened/saturated; time, off-label and indicator are
not.

#### 2.7.3 Message formatting (ADR 0013)

- **Quoted channels** (tales, tells, says, yells, whispers, prayers, songs,
  questions): `<Talker> <verb> [prep] [Destination] '<message>'`.
  - Message = text between the first and last `'` of `text` (fallback: whole text);
    for own messages `text` is already bare. Drops server suffixes like
    `" in Khuzdul."` and the doubled `Besor narrates` prefix.
  - Verbs self/other: narrate/narrates, tell/tells, say/says, yell/yells,
    whisper/whispers, pray/prays, sing/sings, ask/asks; unknown → channel name.
  - Missing destination on incoming tells/whispers is filled with `you`.
  - Preposition table: `{whispers: "to"}` → `You whisper to Dori 'hej'`.
- **Action channels** (emotes, socials): `text` verbatim, split into talker part and
  body: visible text starts with `You ` → self colours (ignore `talker` field, MUME
  may set it to the char name); else starts with `talker + " "` (case-insensitive,
  ANSI-skipping) → other colours; else prepend `<Talker> `.
- **Talker name:** strip `" the <descriptor>"` (`Vit the innkeeper` → `Vit`) unless
  the name starts with an article (`a dwarven sergeant` stays); capitalise first
  char; `you` → `You` (as destination stays lowercase `you`).
- ANSI inside the message is preserved; plain text gets the message colour.
- **Timestamps** only while scrolled back: `HH:MM` (or `DD/MM` if older than 24 h)
  on every row; live view has none. Computed once per render so rows never mix. One
  reflow on the first scroll tick is accepted.

#### 2.7.4 Wrapping (ADR 0040)

Word wrap owned by the renderer: greedy fill on whitespace across styled fragments;
continuation rows never start with whitespace; a token longer than the width is
hard-broken. ANSI sequences are zero-width. The same function computes row counts
for scroll maths so rendering and scrolling cannot disagree. Browser note: CSS
wrapping replaces this, but scroll-by-message and "bottom-anchored" behaviour must
still be kept.

#### 2.7.5 Scrolling

- Offset counted in **messages**, 0 = live bottom (newest message pinned to the
  bottom edge; an over-tall anchor message clips at the top).
- Wheel up +1 / down −1. Max offset is such that the oldest message sits at the top
  with no blank space above.
- New messages while scrolled: offset grows by the same amount (view stays put).
- Indicator row below the list when scrolled: `↓ N newer messages`, click → live.
- Filter flip clamps the offset.

#### 2.7.6 Interaction and filters

| Action | Effect |
|---|---|
| Left-click header label | Toggle channel on/off; saved immediately; silent (nothing to the game). |
| Right-click label | **Solo**: all other channels off. Right-click the same label again → restore the pre-solo snapshot. Right-click another label while soloed → switch solo, keep the original snapshot. |
| Left-click while soloed | Drop snapshot; normal manual toggling resumes. |
| Wheel / click indicator | Scroll / return to live. |

Toggle fires on mouse **down** (avoids missed clicks). Solo snapshot is runtime only;
the resulting per-channel states are saved. An external filter change (menu) cancels
solo.

**Options → Panes → Communication** (launcher + in-game popup; ADR 0129): vertical
list of the 10 fixed channels `[X]███ Narrates` … (checkbox, 3-cell swatch in the
channel colour, grey when off, label), blank, `[X] Show channel header`, blank,
`Back`. ↑↓ / Enter / click / ESC. Launcher saves on Back; popup saves immediately;
the pane re-reads within 250 ms.

**Show header off**: the header row disappears and the list takes the row.

#### 2.7.7 Persistence

| What | Where | Scope | When |
|---|---|---|---|
| Channel filters | `comm_filters.conf`, sparse `name=true\|false`; missing = enabled (ADR 0010) | global (not per character) | each toggle, atomic |
| Show header | `comm_prefs.conf`, `show_header=true\|false`, default true | global | on change |
| Message archive | `data/comm/<Char.Name>.jsonl`, one entry per line, ANSI verbatim (ADR 0011) | per character | append per message; pruned to **7 days** on startup (rewrite) |
| In-memory history | ring of **1000** messages | per session | seeded from archive on `Char.Name` (last 1000 of 7 days) |

- History is **not** cleared on disconnect.
- A torn last line in the JSONL is skipped on read.
- Characters never see each other's archive.
- Sparse filters mean new server channels appear enabled automatically.
- Browser note: `comm.state` projection file + 250 ms mtime poll (ADR 0009) and the
  cross-process conf re-read disappear; the archive becomes browser storage
  (IndexedDB suits an append log; size stays sub-MB per week). Whether filters should
  become per character in the web client is open; in Cockpit they are global.
- Inactive run (not connected): header and list blank.

## 3. Launcher (start page)

Sources: docs/launcher.md, bridge/launcher/{launcher.py, palette.py, launcher_banner.py, menu_chrome.py, quotes.txt, about.txt}, ADRs cited inline.

In Cockpit the launcher is a full-screen TUI shown *before* the game session
exists (ADR 0069). It is a **frame stack**: one frame visible at a time,
sub-pages pushed/popped; ESC pops one level. In WebCockpit this becomes the
page you land on when opening the link.

### 3.1 Startup

| Cockpit | Browser note |
|---|---|
| `start.sh` shows the menu; `--no-menu`, `-d` (dev pane on), `-u` (UI pane on) skip it for one run | Irrelevant. Could map to URL query params later (e.g. `?nomenu`); decide in spec. |
| Exec-chain launcher → tmux → back to launcher on "Exit session" (sentinel `.return_to_menu`), alt-screen kept continuous so no shell flash | Browser: "Exit session" just swaps the game view back to the start page in the same tab. The *lesson* stays: no visible flash/blank between start page and cockpit. |
| Layout built before attach so the user sees one transition, not a cascade of pane splits (ADR 0070) | Lesson carries over: render the full cockpit layout in one go. |
| Fresh-install defaults come from one shipped template (`templates/startup.conf`, ADR 0101); launcher and boot path read the same defaults | Keep: one default-settings object, used both to seed storage and to fill missing keys on upgrade. |
| Minimum-size gate: `cols < 60` or `rows < 18` → "Terminal too small" screen, keys swallowed; foot-only "Press R to reset terminal settings" hatch (ADR 0113) | Browser: a too-small viewport should still show a notice rather than a broken layout. The R-reset hatch is foot-specific, but the lesson (a bad font size can make the settings page itself unreachable → need an escape to defaults) applies to the browser font-size setting too. |

### 3.2 Main page (startup menu)

**Look** — vertically: banner (top-anchored), blank, menu rows (ragged-centred), blank, quote, attribution, blank, footer on the last row.

```
                 ✧            ✧         ·     ·
            ·               ·       ◦
         ◦              ·                  ·
            (5 starfield rows, twinkling)
     ·   █▄ ▄█ █   █ █▄ ▄█ █▀▀▀                     <- MUME, #00d0d0
         █ █ █ █   █ █ █ █ █▀▀
         █   █ ▀▄▄▄▀ █   █ █▄▄▄
   ▄▀▀▀▄ ▄▀▀▀▄ ▄▀▀▀▄ █ ▄▀  █▀▀▀▄ ▀█▀ ▀▀█▀▀            <- COCKPIT, #0a9a9c
   █     █   █ █     █▀▄   █▀▀▀   █    █
   ▀▄▄▄▀ ▀▄▄▄▀ ▀▄▄▄▀ █  ▀▄ █     ▄█▄   █

                  << Enter MUME >>                  <- cursor row: gold << >>, white label
                      Profile
                      Options
                      History
                     Spotlights
                      Credits
                       About
                        Quit

      "Not all those who wander are lost."          <- italic #8a8a8a
                 — Bilbo Baggins                    <- sage #87af87

          ↑↓ Navigate · Enter/Space Select          <- footer, #585858, last row
```

**Menu entries** (order, `_rebuild_main_items`):

| Row | When shown | Action |
|---|---|---|
| `Enter MUME` / `Resume MUME` / `Mirror MUME (attached elsewhere)` | Always first; label depends on whether a tmux session exists and whether a client is attached | Start or re-attach the cockpit. **Browser:** only "Enter MUME" makes sense (one character per tab, the session dies with the tab). |
| `Fresh start` | Only when a session already exists (index 1) | Kill the wedged session and cold-start. Inline two-step confirm: first Enter relabels the row to `Fresh start — close MUME and drop the connection? Enter confirm · Esc cancel`; highlight is pinned; second Enter confirms; ESC / moving / activating another row disarms (ADR 0128). **Browser:** no detached session to recover → drop. Keep the *inline two-step confirm* pattern for other destructive actions. |
| `Update` | Only when a newer release is known (see 3.10) | Runs updater. **Browser:** drop. |
| `Profile` | always | → `profile` frame (3.4) |
| `Options` | always | → `options` frame (3.5) |
| `History` | always | → history (§7) |
| `Spotlights` | always | → spotlight reel (§7) |
| `Credits` | always | → credits roll (§7), ADR 0122 |
| `About` | always | → about page (3.11) |
| `Quit` | always | Exit launcher to shell. **Browser:** no meaningful equivalent (can't close a tab from script reliably) — drop or omit. |

- Selection is preserved **by label** across rebuilds (rows appear/disappear live, e.g. Update appearing mid-view; ADR 0019).
- **ESC on the main page is intentionally a no-op.**
- Row grammar: `menu_row` — fixed 3-cell prefix/suffix, `<< label >>` on the cursor row with arrows in `C_CURSOR_CELL` gold `#ffaf00` bold and label `C_ACTIVE` bold `#ffffff`; hover: no arrows, label `C_HOVER` `#dadada`; inactive: label `C_ITEM` `#bcbcbc`. Label never shifts horizontally between states. Each row centred on its own width (`len+6`) → ragged-centre (ADR 0085, 0087).
- **Mouse:** click = select + activate in one click; hover lightens. Hover-clear invariant: moving the pointer onto any non-row area (title, blanks, padding, footer) clears hover — otherwise the highlight sticks (ADR 0087). In a browser this is `mouseleave` on rows; easy, but test it.

**Banner** (launcher_banner.py, ADR 0100 — shared verbatim with the ESC popup's main frame):

| Property | Value |
|---|---|
| Size | 45 cells wide × 11 rows: 5 starfield + 3 MUME + 3 COCKPIT, no separator row |
| Wordmark colours | MUME `C_BANNER_WORD` `#00d0d0`; COCKPIT `C_BANNER_WORD_DIM` `#0a9a9c` |
| Stars | Data list `(row, col, glyph, tier)`; glyphs `· ◦ ✦ ✧`; tiers DIM `#1f595b`, MID `#2f9092`, BRIGHT `#74e8e8` |
| Twinkle | Each open-field star gets random period 12–32 s and phase; holds base tier, pulses ±1 tier when a sine crosses 0.82. `✦`/`✧` use a 5× slower period and swap glyph at the bright peak. Stars inside the wordmark span stay static. |
| Redraw rate | Launcher 12 Hz, popup 6 Hz; animate only while the main frame is visible (submenus static) |
| Responsive | `banner_fits(rows, reserved)`: if banner (+2 blank rows) can't fit together with menu + quote + footer, drop the banner entirely and keep the menu. Re-evaluated every render. |

Browser note: animate with `requestAnimationFrame` or a low-rate timer, only while visible; must never cost latency on the game view (goal 1). Text should say "WebCockpit"? — the wordmark says COCKPIT; decision for the owner/spec, not here.

**Tolkien quotes** — `quotes.txt`, 30 lines `text|attribution`, `#` comments ignored; one chosen at random **per launcher start** (not per return to the page). Rendered `"text"` centred in `C_QUOTE` (italic `#8a8a8a`), then `— attribution` in `C_QUOTE_ATTR` (`#87af87`). Attribution line omitted when absent. Example lines: *"Not all those who wander are lost." — Bilbo Baggins*; *"All we have to decide is what to do with the time that is given us." — Gandalf*.

**Version line** — there is no version line on the main page. The version appears right-aligned in the About title (`─── About ─── 0.X.Y`), plus `Update available: vX.Y.Z` in `C_ACCENT` when newer. Browser: show the build version on About only.

**Session re-probe** — the main page re-renders every 1 s so the first row label and Update row track external state. Browser: not needed (the page owns the only session).

### 3.3 Navigation grammar (all launcher frames)

| Input | Meaning |
|---|---|
| ↑ ↓ ← → | Move within a zone; at a zone edge, cross to the spatially adjacent zone |
| Tab / Shift+Tab | Cycle zones |
| ESC | Back (and save, where the frame saves on exit). ESC fires in ~50 ms (prompt_toolkit timeout lowered) — browser gets this for free. |
| Enter / Space | Always a **forward** action, never dead on a selectable element (ADR 0120): (1) activate a button / openable row; (2) advance a toggle or cycler one value (≡ →, wrapping); (3) on a live-applied selector (history filter pills, profile-editor kind buttons, LITE/EDITOR toggle) commit and descend into the governed content at row 0 |
| Exception | Bare numeric steppers (font size, padding, …): Enter/Space inert |
| Mouse | Click selects + activates. Hover lightens (`C_HOVER`). Wheel scrolls lists (without moving cursor on tables). |
| Footer | Every frame has a `C_HINT` shortcut row anchored to the last row, e.g. `↑↓ Navigate · Tab/←→ Cycle · Enter Select · ESC Back` |

Shared chrome (ADR 0085): sub-page titles `─── Name ───` centred in `C_SECTION` bold `#008787`, 2 blank rows above in the launcher (1 in the popup), 1 below. Three cell grammars (ADR 0087):

| Grammar | Where | Cursor focused | Selected, zone unfocused | Hover | Other |
|---|---|---|---|---|---|
| Filled button | Profile/History button columns, editor kind row, LITE/EDITOR toggle | black on gold bg `#ffaf00` | black on grey bg `#bcbcbc` | fg `#dadada`, no fill | fg `#bcbcbc` no fill; disabled `#585858` no fill |
| Swatch/checkbox cell | pane × colour grids | gold fg on `[ ]` only | — (gold-or-nothing) | cursor follows mouse | — |
| `<< label >>` menu row | every vertical menu list | gold arrows + white label | — | label lightened | `#bcbcbc` |

Persistent "active" marker is always **green** `C_OK` `#7ac46f` bold (e.g. ✓), never gold — gold means transient cursor only. Toggle/radio glyphs `[X]`/`[ ]`/`(•)`/`( )` carry on/off state so colour stays reserved for cursor/hover. Glyph rows stack left-aligned inside a centred block; plain rows (incl. Back) centre individually.

Other palette roles: `C_TITLE` bold `#00d7d7`, `C_BODY` `#8a8a8a`, `C_HINT` `#585858`, `C_ACCENT` bold `#ffaf00`, `C_YELLOW` bold `#ffd75f` (warnings), `C_ERR` bold `#ff5f5f`, `C_DANGER` `#a04030` (inline validation).

### 3.4 Profile sub-menu

**What a profile is.** One tt++ script file `ttpp/profiles/<name>.tin` holding the player's aliases, actions, highlights, substitutes, macros (hotkeys), variables… The selected profile is stored as `profile=<name>` in `startup.conf` and loaded into tt++ at connect. It is auto-saved back to the file on session exit. **Global list**, not per character. Browser: profile = a named record in browser storage, in the WebCockpit tt++-subset syntax (goal 3, 7); export/import as a file.

**Default profile seeding (ADR 0042).** `default` is created from `templates/blank_profile.tin` if missing; "Create blank" copies the same template. The template has a header comment and ten numpad `#macro`s (keypad application mode): `\eOp` flee, `\eOr` south, `\eOs` down, `\eOt` west, `\eOu` exits, `\eOv` east, `\eOx` north, `\eOy` up, `\eOk` open exit, `\eOm` close exit. Reason: tt++ errors on reading an empty file, so every profile carries at least one entry. Browser: keep one template as single source of truth; map numpad keys via `KeyboardEvent.code` (Numpad1…); the empty-file bug itself disappears.

**`profile` frame** (ADR 0088 "P4" layout):

```
                            ─── Profile ───

          SELECT    Name ▲          Selected
          NEW       default            ✓          <- ✓ green #7ac46f
          EDIT    ▌ pvp_warrior               ▐   <- cursor row: gold bg (table focused)
          RENAME    ranger                          or grey bg (table unfocused)
          DELETE    test
          EXPORT
          BACK
                    Exported to ~/pvp_warrior.tin.   <- feedback row, ~3 s, C_ACCENT

   ↑↓ Navigate · Tab/←→ Cycle · Enter Select · ESC Back
```

- Centred package `[ button column | 2-cell gap | table | scrollbar ]`, recentred on resize. Button column: 7 uppercase buttons, width = longest label + 2, no borders; first button top-aligns with the table header.
- Table: `Name` (dynamic width, sortable by clicking header, default `▲` asc), `Selected` (width 8, centred ✓ on the active profile, not sortable). Header row always `C_HINT`.
- **Focus:** two zones (table, buttons). Tab/Shift+Tab toggles; ← focuses buttons, → focuses table (non-wrapping). Opens with cursor on the active profile.
- **Keys:** table ↑↓ move, PgUp/PgDn ±10, Home/End, Enter/Space = Select. Buttons ↑↓ skip disabled buttons, Enter/Space activate. ESC → main.
- **Mouse:** click row = move cursor + focus table; click header = toggle sort; click button = focus + activate; wheel scrolls table without moving the cursor.
- **Disabled rules:** Select disabled when cursor row is already active; Rename/Delete disabled on `default`; others always enabled. Disabled = dim `#585858`, no bg.

| Button | Behaviour |
|---|---|
| SELECT | Makes cursor row the active profile; saved immediately; ✓ moves (no flash — ✓ is the confirmation) |
| NEW | `profile_create_name`: title `─── Create New Profile ───`, prompt `> name_`, hint `letters and _ only · must start with a letter · max 32` (actual rule: starts with letter; letters, digits, `_`; ≤32; no collision), footer `Enter Confirm · ESC Cancel`, inline error on invalid. Then `profile_create_choose`: `Name: <n>`, footer `B Blank profile · C Copy from existing · ESC Cancel`. C → `profile_create_copy_picker` (`Copy from:` list, `↑↓ Navigate · Enter Select · ESC Cancel`; empty-state `No profiles available to copy from.` / `Any key to continue`). **The new profile becomes the active one.** |
| EDIT | Parses the file and opens the profile editor (lite/editor views — covered in the profile-editor section of this inventory). Parse/I/O failure → feedback `Could not open <name>.tin: <reason>` in `C_HINT`, no push. |
| RENAME | `profile_rename`: `Rename "<old>" to:` + input, same validation; same name = silent no-op; if active, `startup.conf` follows the new name; table re-sorts, cursor follows; feedback `Renamed to "<new>".` |
| DELETE | `profile_delete_confirm`: `Delete profile '<name>'?  (y/N)` in `C_ACTIVE`, hint `Y to confirm · any other key to cancel`. On `default`: `You can't delete the default profile.` in `C_YELLOW`, `Any key to continue`. |
| EXPORT | Copies the file to `~/<name>.tin`, overwrite without asking; feedback `Exported to ~/<name>.tin.` / `Export failed: <reason>`. **Browser:** becomes a file download; add an **Import** action (goal 7 — not in Cockpit). |
| BACK | = ESC |

Feedback row: centred under the package, ~3 s, success in `C_ACCENT`, failures in `C_HINT`.

### 3.5 Options sub-menu

Hub page `─── Options ───` with `<< label >>` rows:

| Row | Target | WebCockpit relevance |
|---|---|---|
| Connection | `options_connection` (3.6) | Mostly irrelevant |
| Terminal | `options_terminal` (3.7) — only shown under managed-foot deployment | **Relevant** as the "Appearance" page (goal 6) |
| Panes | hub → General (pane × colour grid, borders, corner style), Timers layout, Communication channels, Group options | see §2 |
| Readability | module manager | OUT OF SCOPE |
| Scripts | Lua script manager (`options_scripts`) | OUT OF SCOPE |
| Spotlights | per-kind toggles (3.8) | relevant |
| *(blank)* | | |
| `[X] Input autosuggest` | in-place toggle, no sub-page; Enter/Space flips; key `input_autosuggest`, default **off** (`0`); gates inline history autosuggestion in the input line | relevant (see input section) |
| *(blank)* | | |
| Back | | |

Persistence: all launcher Options changes are written on **Back / ESC** (batched); see 3.9.

### 3.6 `options_connection` — Connection mode

Three radios left-aligned in a centred block, then Back:

```
      (•) MMapper  (localhost:4242)
      ( ) Direct   (mume.org:4242, TLS)
      ( ) Custom   (host:port)
                 Back
```

Custom opens `options_connection_custom`: two fields Host / Port, Tab cycles, port validated 1–65535, invalid field highlighted, Enter saves, ESC cancels. Keys `connection_mode`, `connection_host`, `connection_port`.

**Browser:** MMapper (local telnet proxy) and Custom host:port are impossible/irrelevant — the browser can only reach MUME's WebSocket `wss://mume.org/ws-play/` (ADR 0002 of WebCockpit). Only "Direct" survives, so the page likely disappears (or shows the endpoint read-only). Map integration is handled separately (WebCockpit ADR 0003). The status header's "Mode" field (§4.3) loses meaning likewise.

### 3.7 `options_terminal` — font, colours, cursor (→ WebCockpit appearance settings)

Cockpit edits the managed keys of foot's `foot.ini` and relaunches the terminal on **Apply** (ADR 0107, 0105). The *option set and value ranges* are the relevant part; foot/WSL/relaunch mechanics are not.

| # | Row | Kind | Values / range | Browser mapping |
|---|---|---|---|---|
| 1 | Font | opens `terminal_font_picker` | installed monospace families (`fc-list :spacing=mono`) | CSS `font-family`; list must be a curated set / webfonts / user-typed name (browsers can't enumerate fonts portably) |
| 2 | Size | numeric stepper, ←→ ±1 | 6–32 (pt) | CSS font-size |
| 3 | Window mode | cycler | windowed / maximized / fullscreen | Irrelevant (maybe Fullscreen API toggle) |
| 4 | Width / Height | steppers, ±100 px, only when windowed | 800–7680 × 600–4320 | Irrelevant |
| 5 | Padding | stepper, ±2 px, symmetric x/y | 0–40 px | CSS padding around the cockpit |
| 6 | Cursor style | cycler | block / beam / underline | input caret style |
| 7 | Cursor blink | cycler | Off / On | caret blink |
| — | *(blank)* | | | |
| 8 | Font color | cycler | sage `#778A8D`, silver `#C0C0C0` (default), ash `#A0A0A0`, stone `#808080`, shadow `#606060`, ink `#000000`; off-palette on-disk hex prepended as its own entry | default text fg |
| 9 | Background color | cycler | black `#000000`, red `#1A0E0E`, green `#0E1A0E`, blue `#0E141C`, grey `#161616`, orange `#1C140A`, purple `#16101C`, teal `#002B36`, sepia `#2B1B12`, slate `#1C2128`, paper `#F4ECD8` (off-white, not `#FFFFFF`: pure white broke dark-assuming chrome) | page background |
| — | live preview box | only when pending fg/bg ≠ saved | 5-line room description: line 1 (room name) in ANSI green, rest in pending fg, all on pending bg, thin grey border | keep — cheap and useful |
| 10 | Apply | action; dead-grey and skipped by ↑↓ when nothing changed | | Browser: could apply live instead (no relaunch needed) — spec decision |
| 11 | Back | discards pending edits (ESC same) | | |

- Transparency (foot `alpha`) was removed — no effect under WSLg (ADR 0108).
- Delta display: `Label: <saved> → <pending>` when changed, else `Label: <value>`.
- Footer `↑↓ Navigate · ←→ Adjust · Enter Select · ESC Back`; with changes it appends `Apply restarts the terminal` — no confirm modal.
- Terminal bg and fg palettes are deliberately separate from the pane-tint palette (the seven shared names resolve through the pane palette; `None` pane tint = literal `#000000` here).
- After Apply + relaunch, a one-shot resume hint reopens the launcher on this page with the cursor restored (ADR 0105). Browser: irrelevant if applied live.
- Colours cover only default fg/bg — never the 16 ANSI palette colours. WebCockpit goal 6 ("colours") may want to go further (ANSI palette); spec decision.

**`terminal_font_picker`**: scrollable list of family names + trailing `<< Back >>` row inside the cursor space. Row states: cursor row gold bg; pending family (cursor elsewhere) grey bg; hover grey bg; others `C_ITEM`. Long names truncated with `…`. ↑↓ wrap, PgUp/PgDn page; hover does not move cursor; click / Enter / Space commits and pops; ESC pops unchanged. Pending font not installed → prepended to the list so it's never lost. No fonts → `No monospace fonts found` + Back.

### 3.8 `options_spotlights`

Four `[X]`/`[ ]` rows (glyph block) + blank + Back; Enter/Space/click flips; ESC/Back saves. Filters which event kinds feed both Spotlights and Credits (§7):

| Row | key (default 1) | event |
|---|---|---|
| Achievements | `spotlights_show_achievements` | `achievement` |
| Deaths | `spotlights_show_deaths` | `char_death` |
| Level-ups | `spotlights_show_levelups` | `level_up` |
| PvP kills | `spotlights_show_pvp` | `pkill` |

### 3.9 Persistence asymmetry vs. the popup

| Surface | When written | When it takes effect |
|---|---|---|
| Launcher Options | Batched on Back / ESC (profile Select: immediately) | Next cockpit start (panes don't exist yet) |
| ESC popup Options | Each change written immediately | Live, within a tick, in the running cockpit |

Both write the same keys (`show_<pane>`, `pane_color_<pane>`, `border_<pane>`, `frame_corners`, `input_autosuggest`, group/comm/timers keys). All toggle paths (popup, launcher, input-pane buttons, `cp -X` aliases) persist (ADR 0039).

**Browser note:** the asymmetry exists only because the launcher runs before tmux panes exist. In one browser app both surfaces edit the same live settings store; the start page simply has no running cockpit to update. Recommend one settings model with immediate write for both, and keep the observable rule "popup changes show instantly".

### 3.10 Update flow / version check

Cockpit spawns a background GitHub-release check, polls `version.cache` mtime to add an `Update` row live (ADR 0019), runs `update.sh` in a worker, then re-execs itself. **Browser: irrelevant** — update = reload the page. At most, show the build version on About; optionally a "new version available — reload" notice if the deployed build changes (spec decision).

### 3.11 About, Credits, Exit

- **About** — scrollable page from `about.txt` (~170 lines: intro, CONNECTION, GMCP, … keys/commands). Title `─── About ─── 0.X.Y` (version right-aligned `C_BODY`, optional `Update available` in `C_ACCENT`). Three-colour rule per line: ALL-CAPS line → heading `C_TITLE`; indented line → `C_ACCENT` (commands like `  cp -e`); other text → `C_BODY`. Word-wrapped to width, scroll with arrows/PgUp/PgDn/wheel. Browser: content must be rewritten for WebCockpit (no MMapper/TinTin++/tmux text).
- **Credits** — standalone main-menu entry (ADR 0122) opening a scrolling end-credits chronicle built from all characters' events; details in §7.
- **Quit** — see 3.2 (browser: drop).

### 3.12 Other launcher frames (covered in §7)

- **History** (`history`, `history_detail`, `history_rate`, `history_delete_confirm`) — per-session run list, rating, delete. See §7.
- **Spotlights** (`log_view` in spotlight mode, `spotlights_empty`) — cross-character reel of deaths/level-ups/PvP kills/achievements. See §7.
- **Credits** (`credits`, `credits_empty`). See §7.
- **log_view** — log player. See §7.
- **export_editor** / `export_input` — HTML replay export. See §7.

---

## 4. ESC popup menu

Sources: docs/popup-menu.md, bridge/launcher/ingame_menu.py, ADRs 0039, 0058, 0062, 0066, 0110, 0114, 0119, 0130.

### 4.1 Overview

- **Trigger:** ESC from any pane opens an overlay over the live cockpit (tmux root key binding, so it works regardless of focus). It is its own full-screen TUI app (ADR 0062) with a frame stack like the launcher's, sharing chrome, palette and banner (ADR 0085, 0100).
- **Size / position:** 80% × 80% of the terminal, centred; border in section cyan `#008787`.
- **Game keeps running** underneath (output continues; the popup overlays it).
- Closing: ESC on the main frame, Continue, or any action that exits.
- **Browser note:** becomes a modal overlay `div` (80%/80%, centred, 1-cell cyan border). ESC must be captured by the client (it's also a MUME-irrelevant key, so fine), but beware ESC being bound as a user hotkey — spec decision. Focus must return to the input line on close (Cockpit had to fix focus drifting to a re-tinted pane).

### 4.2 Main frame

```
┌──────────────────────────────────────────────────────────────┐  border #008787
│      Profile: default  ·  Direct  ·  Link: 38ms (stable)     │  status header, C_HINT
│                                                              │
│                ✧            ✧         ·     ·                │
│             (animated starfield + MUME/COCKPIT wordmark,     │
│              same banner as launcher, 6 Hz)                  │
│                                                              │
│                      << Continue >>                          │  pre-selected
│                        Reconnect                             │
│                        Statistics                            │  only if a run is active
│                         Profile                              │
│                         Options                              │
│                       Exit session                           │
│                                                              │
│                  (flash row, e.g. "Profile updated.")        │
│          ↑↓ Navigate · Enter Select · ESC Dismiss            │  footer on last row
└──────────────────────────────────────────────────────────────┘
```

| Row | Shown when | Action |
|---|---|---|
| Continue | connected | Close popup. Pre-selected when connected. |
| Reconnect | always (also when connected, for silent half-open links — ADR 0058) | Sends the `reconnect` command, closes popup. Pre-selected (index 0) when disconnected so Enter reconnects immediately. |
| Statistics | a character is known **and** its current run file exists (re-checked each render; vanishes if either disappears) | → `statistics` frame: read-only current-run stats (header `◆ STATISTICS — <char> · Lvl N · Run <duration>`, ALLIES/ACHIEVEMENTS, KILLS/PvPs tables, XP/h & TP/h sparklines, XP ruler). Details in §7. |
| Profile | always | Profile editor over the live profile (4.5) |
| Options | always | → options (4.4) |
| Exit session | always | → `exit_confirm` (4.6) |

- **"Save run" row no longer exists** — rating/saving moved into Exit (ADR 0119). The old `rate_session` frame (`─── Rate the run ───`, star row, `0-5 Set · ←→ Adjust · Enter Save · ESC Cancel`) is unreachable legacy; do not reproduce.
- Banner drops out when the popup is too short (same `banner_fits` rule as launcher).
- Flash row: transient feedback (~1–3 s) on main, e.g. `Profile updated.` in `C_ACCENT`, errors in `C_HINT`. Flash colour beats hover.

### 4.3 Status header

`Profile: <name>  ·  <Mode>  ·  Link: <ms>ms (<quality>)` — topmost row, `C_HINT` `#585858`. Quality suffix colour: stable = `C_HINT`; `jittery`/`spiking` = `C_YELLOW` `#ffd75f`; `timeout`/`dead`/unknown = `C_ERR` `#ff5f5f`. Re-read every render; popup invalidates 1×/s.

**Browser note:** Mode (MMapper/Direct/Custom) is moot — only direct WebSocket. Link latency needs a browser-side measurement (e.g. timing a GMCP round-trip or MUME's own ping); the ping source in Cockpit is an external ping monitor — spec decision.

### 4.4 Options (popup)

```
      ─── Options ───

           Panes
        Readability            <- OUT OF SCOPE
          Scripts              <- OUT OF SCOPE
   [X] Input autosuggest       <- in-place toggle, immediate write

           Back
```

- **Panes** hub → **General** (pane × colour grid with Border column + Corner style cycle), **Timers** (layout grid), **Communication** (10 channel on/off rows `[X]███ Label` + `[X] Show channel header`), **Group** (`[X] Show players`, `NPC visibility: Off / Labeled / All`). Same models as launcher; see §2.
- **Every change applies live and is written immediately** (pane opens/closes and re-tints instantly; comm/group/timers panes pick it up within a tick). Grid frames are cursor-only: hovering a cell *moves the cursor* there (no separate hover style).
- Backgrounds in popup = pane tint column of the General grid (None/Red/Green/Blue/Grey/Orange/Purple). No terminal fg/bg or font settings in the popup.
- Not in the popup by design: About, profile switch/create, connection mode (launcher-only, "requires restart"). Browser: switching profile mid-session could be reconsidered, but keep Cockpit's scope for v1.

### 4.5 Profile (popup) — editing the live profile (ADR 0110)

Opens the same profile editor as the launcher (lite + editor views), but over the **live** profile:

| State | Load | On ESC out of editor |
|---|---|---|
| **Connected** | Snapshot of the profile currently loaded in the running client (tt++ writes its live class to a file; popup waits ≤2 s; failure → flash reason, don't open) | No changes → back to main silently. Changes → `profile_apply_confirm` |
| **Disconnected** | Read the saved profile file of the selected profile | No changes → back. Changes → save to disk directly, flash confirmation |

`profile_apply_confirm` modal:

```
   Apply changes to your profile?

   Y to apply · N to discard · ESC to keep editing
```

- **Y** → shows `Applying…`, replaces the live profile, verifies it loaded completely (a canary variable appended to the end of the file; if the load stops early, roll back to the snapshot), then persists to disk. Success: flash `Profile updated.` (`C_ACCENT`); failure: rollback message (`C_HINT`). Back to main either way.
- **N** → discard edits, back to main.
- **ESC** → back into the editor with edits intact. Other keys swallowed while applying.
- Dirty check = serialised text differs from the text at open.

**Browser note:** the file handshake, 2 s polling and tt++ class tricks vanish — the profile is an in-memory object in the same app. The *observable contract* to keep: edits are staged; on leaving the editor while connected you get Apply / Discard / Keep editing; apply is atomic (all-or-nothing with rollback on parse failure); disconnected edits save straight away. `cp -s` (explicit profile save) is a separate command, unrelated to run saving.

### 4.6 Exit session + rating (ADR 0119, 0130)

```
             ─── Exit session ───

        Rate & save this run (optional)        <- C_HINT
                ★ ★ ★ ☆ ☆                       <- first N gold #ffd060, rest #585858

   Attention! This terminates the current session.   <- C_ERR

     0-5 Rate · ←→ Adjust · Y Exit · ESC Cancel       <- footer, last row
```

- **Rateable?** Connected → the active run. Disconnected → the most recent sealed run **only if it started during this cockpit session** (never offer rating an old run, it would overwrite it). If no such run: label + stars omitted, footer `Y Exit · ESC Cancel`.
- **Prefill:** the rating already saved on this run's chain (the run stitched with predecessors that were continuations; ADR 0056), else 0.
- **Keys:** `0`–`5` set, ←/→ adjust (clamped 0..5), click star N = N, `Y`/`y` commit + exit, ESC cancel (back to main). No catch-all cancel.
- **Commit (Y):** rating > 0 → save the whole chain with that rating (protects it from the 14-day retention sweep). Rating 0 → "inherit": if the chain was already saved, re-save at the existing rating (never downgrades); if not saved, save nothing. **Exit never un-saves**; de-saving only via History delete.
- Then the session ends and the user returns to the launcher main page. Browser: close the WebSocket and show the start page in the same tab.
- The rating shows later on the Statistics header (` · ★★★`) and in History (§7).

### 4.7 Auto-open on disconnect (ADR 0058)

- Popup opens automatically when the connection goes from connected → disconnected. Triggers: GMCP `Core.Goodbye`, server-close text, or socket closed. Browser: WebSocket `close` event / `Core.Goodbye`.
- **Dedup:** only on the transition; a second signal for the same disconnect does nothing.
- **User-reconnect suppression:** Reconnect deliberately disconnects first; a one-shot flag suppresses the auto-open for that transient.
- **Double-open guard:** if the popup is already open, don't reopen/disturb it.
- **Bootstrap:** no auto-open before the first connect completes.
- On open, Reconnect is at index 0 and pre-selected.

### 4.8 Input and focus

| Input | Behaviour |
|---|---|
| ESC | Main: close popup. Submenu: pop one level (Readability: save + pop). Fires instantly (eager, 50 ms timeout). |
| ↑ ↓ | Move between selectable rows (wrap-around on menus; comm list clamps) |
| ← → | Adjust cyclers/rating; grid columns |
| Enter / Space | Activate row / toggle / advance cycler |
| Mouse click | Select + activate in one click |
| Mouse hover | Main and Options rows lighten (`C_HOVER`); hover-clear on chrome; grids: hover moves the cursor |
| Wheel | Only on scrolling frames (Scripts, Readability, Statistics): over a list = cursor ±1 per notch; over a detail panel/chrome = scroll 3 rows; over a Statistics table = scroll that table 1 row and focus it (ADR 0114). Other frames ignore the wheel. |

- **Focus on push (ADR 0066):** each frame's main area must get keyboard focus when shown and regain it when returned to; otherwise mouse/keys silently route to the wrong control. Browser: set focus explicitly on frame change; trap focus inside the modal; restore focus to the game input on close.
- Frame titles: `C_SECTION` `#008787`, 1 blank row above (launcher uses 2).
- Footer shortcut row always on the popup's last row.

## 5. Profile editor

A full-screen editor for one profile (`<name>.tin`), with two views over the
same in-memory profile: **LITE** (forms) and **EDITOR** (the whole file as
tt++ text). Sources: docs/launcher.md "profile_editor frame" through the
"profile_editor_macro_keybind overlay" section, bridge/launcher/profile_io.py,
macro_keys.py, ttpp_syntax.py, palette.py, ADRs 0042, 0081–0084, 0089–0092,
0109, 0110.

### 5.1 Entry points

| Opened from | What it edits | On close (ESC) |
|---|---|---|
| Launcher → Profile → **Edit** button | The profile file on disk (not live) | Parses if needed, saves the file, returns to `profile` frame, flashes `Saved <name>.tin.` (C_ACCENT) or `Save failed: <reason>` (C_HINT) |
| In-game ESC popup, **disconnected** | The file on disk | Same as launcher (ADR 0110) |
| In-game ESC popup, **connected** | A snapshot of the *live* profile | Dirty check (serialise before vs after). Clean: pops silently. Dirty: modal **Y** apply / **N** discard / **ESC** keep editing. While applying it shows "Applying…" and ignores keys. Apply replaces the live rule set; if the load fails partway it **rolls back** to the snapshot (canary check). After a successful apply the file is saved too (ADR 0110) |

- The popup version uses 1 blank row above the title; the launcher uses 2.
- Mode is **not** remembered. Each open starts in LITE mode.
- The editor itself is identical in both hosts (ADR 0109 extracted it into
  one component with a small host interface).
- **Browser note:** there is no tt++ class to snapshot. The browser keeps the
  profile model in memory and in storage. "Apply to live session" means
  swapping the active rule set atomically, and it keeps the Y/N/ESC confirm
  and the rollback-on-parse-failure guarantee. The canary file handshake
  goes away.

### 5.2 Kinds (what exists and what doesn't)

The GUI edits **exactly five kinds**: `ACTIONS`, `ALIASES`, `HIGHLIGHTS`,
`MACROS`, `SUBSTITUTES`, shown in that alphabetical order.

| Kind | tt++ command | Field labels (pattern / body) | Priority arg | New-entry default |
|---|---|---|---|---|
| action | `#action` | Pattern / Commands | optional 3rd `{n}` | blank |
| alias | `#alias` | Pattern / Commands | optional 3rd | blank |
| highlight | `#highlight` | Pattern / Color | optional 3rd | body `light yellow` |
| macro | `#macro` | Key / Commands | **none** (exactly 2 args) | blank, and the key-capture overlay opens immediately |
| substitute | `#substitute` / `#sub` | Text / New text | optional 3rd | blank |

**Not in the GUI:** gags, variables (`#var`), tickers, events (`#event`),
functions, classes, `#showme`, and so on. These can only be edited in EDITOR
mode, where they survive as "passthrough" lines (see 5.9). Command names
match tt++ rules: case-insensitive, and an unambiguous prefix of at least 2
chars counts (`#mac`, `#Hi`, `#SUB`). Plurals such as `#macros` do not match.

> WebCockpit intent lists gags, variables and scripting logic as goals.
> Adding a GAGS tab (and possibly VARIABLES/TICKERS) is a scope decision for
> spec.md, because Cockpit only has five.

### 5.3 Layout

The editor is not centred vertically: the body is anchored to the top and
the footer hint sits on the **last terminal row**. A spacer fills the rows
in between.

**LITE mode** (the body block is 77 cells wide, centred):

```
                                                      (2 blank rows)
────────── Profile Editor: rasta ──────────              LITE  EDITOR
                                                      (blank)
█████████████   █████████████   █████████████   █████████████   █████████████
█  ACTIONS  █   █  ALIASES  █   █HIGHLIGHTS █   █  MACROS   █   █SUBSTITUTES█   <- 13x3 filled blocks,
█████████████   █████████████   █████████████   █████████████   █████████████      3-cell gaps
                                                      (blank)
Pattern  Commands                     ▲     Pattern
gv       get %1;value %1              █     ┌─────────────────────────────────┐
k        kill %1;…                    ░     │ gv %1                           │
...                                   ░     └─────────────────────────────────┘
+ New entry                           ▼     Commands
|<-------- list 38 ------------------>|1|3 | ┌─────────────────────────────────┐
                                            │ get %1;value %1                 │
                                            │ (≤10 rows, inline scrollbar)    │
                                            └─────────────────────────────────┘
                                            <inline error, C_DANGER>
                                                      (blank)
                                                 ─── Hint ───
                                            %1 %2 capture words · ; chains
                                            gv %1  →  get %1;value %1
                                                      (flex spacer)
         n New · Del Delete · Tab Cycle · ESC Save & back           <- last row
```

- Widths: kind row = 5×13 + 4×3 = 77. Body = list 38 + scrollbar 1 + gap 3 +
  detail 35 = 77.
- The LITE/EDITOR toggle is two 1-row blocks, ` LITE ` (6 cells) and
  ` EDITOR ` (8 cells), with one space between them. It is right-aligned so
  that the `R` of EDITOR sits above the right `┐` of the detail Pattern box.
  When space is short, the title's right-hand dashes are truncated before
  the toggle is.
- The title `─── Profile Editor: <name> ───` is C_SECTION (`bold #008787`).

**EDITOR mode** (no kind row, no frame around the buffer):

```
                                                      (2 blank rows)
────────── Profile Editor: rasta ──────────              LITE  EDITOR
                                                      (blank)
  1 #action {^%1 raises %2 hand} {group %1}                            █
  2                                                                    █
  3 #alias {gv %1} {get %1;value %1}                                   ░
  4 #alias {k} {kill %1;                                               ░
    bash}            <- soft-wrap continuation, no number              ░
  5 #highlight {^%1 enters} {light yellow}   <- current line: bg band  ░
 ...
                                                      (blank)
        Tab Cycle · ESC Save & back          3 unclosed {  ·  Ln 5, Col 12
```

- Chrome budget: 2 blanks + title + blank + buffer + blank + footer, so the
  buffer is `rows − 6` tall.
- Line-number gutter: 3 digits right-aligned plus a 1-cell gap, `#585858`. It
  widens past 999 lines.
- Soft wrap is on. Scrollbar: 1 cell on the right edge, shown only when the
  content overflows.

### 5.4 Three-state colour grammar (ADR 0083, 0134)

| State | Token | Style |
|---|---|---|
| Inactive | `C_BUTTON_INACTIVE` | fg `#bcbcbc`, **no bg** (terminal bg shows through) |
| Hover (inactive) | `C_HOVER` | fg `#dadada`, no fill |
| Selected, zone unfocused | `C_BUTTON_ACTIVE_UNFOCUSED` | fg `#000000` bg `#bcbcbc` (grey) |
| Selected, zone focused | `C_BUTTON_ACTIVE_FOCUSED` | fg `#000000` bg `#ffaf00` (amber) |

- **Where it applies:** kind buttons, the LITE/EDITOR toggle, and the
  entry-list cursor row.
- **Detail field borders:** `C_HINT #585858` when unfocused, `C_ACCENT`
  (`bold #ffaf00`) when focused. This is the only focus indicator for the box.
- **Rule:** wherever keyboard focus is, it is amber. Cursor plus focus beats
  hover and beats the selected state.
- **Grey means a persistent selection only:** the current kind tab and the
  entry being edited.
- **Palette zones (Style toggles, Text/BG swatches, macro Key cell) are
  amber-or-nothing.** The cursor cell's `[ ]` brackets are gold
  (C_CURSOR_CELL `bold #ffaf00`) when the zone is focused. Otherwise nothing
  is marked. The cursor index is still remembered internally.
- **Headers stay grey (C_HINT) at all times:** `Pattern  Commands`,
  `Pattern`, `Commands`, `─── Hint ───`.
- **Hover:** foreground brightening means "pointer"; a fill means
  "selected" (ADR 0134). Hovering over gaps, padding or blank rows clears
  hover.

### 5.5 LITE/EDITOR toggle and mode flip

- **Keys on the focused toggle:** `←` selects LITE and `→` selects EDITOR
  (no-op if that mode is already active). `Enter`/`Space`/`↓` go down into
  the first zone of the mode. They **never** flip the mode.
- **Mouse:** clicking the inactive block flips the mode. Clicking the active
  block does nothing. Hovering the inactive block paints C_HOVER.
- **No hotkey flips the mode.** `m`/`e`/`M`/`E` insert literal characters in
  every text context.
- **LITE → EDITOR:** the profile is serialised into the buffer. Cursor goes
  to offset 0 and scroll to 0.
- **EDITOR → LITE:** the buffer is parsed back into the same profile object.
  The list cursor goes to 0. Parsing is lenient: unknown or malformed lines
  become passthrough and nothing throws. There is **no parse-error flash**;
  at worst an entry turns into passthrough.
- A flip clears the undo/redo stacks, the pending auto-close braces, the
  flash, and auto-scroll.
- Because the flip goes through serialise → parse, it also re-sorts.

### 5.6 Lite mode

#### Kind buttons row

- Keys: `←`/`→` move between kinds (no wrap). `↑` goes to the toggle.
  `↓`/`Enter`/`Space` go to the entry list (row 0).
- Clicking a button selects that kind and focuses the row.

#### Entry list

- **Header:** `<pattern label>  <body label>` in C_HINT. The pattern column
  is a fixed 8 chars; the body column flexes.
- **Body preview:** skips leading blank lines. It appends `…` when the first
  line is truncated *or* when more non-blank lines follow (so
  `testcommand1;\ntestcommand2` shows as `testcommand1;…`).
- **Sort:** ascending by pattern, case-sensitive. Macros sort by display
  name, so F-keys come before numpad, which comes before Alt. There is no
  sort toggle. While you type a pattern the list re-sorts live and the
  cursor follows the entry. A *new* entry stays at the bottom of its kind
  until the next save or flip (ADR 0084).
- **`+ New entry` sentinel:** the last row, in C_HINT. `Enter` on it, `n`
  anywhere in the list, or a single click appends a blank entry and focuses
  Pattern.
- **Sentinel selected:** the detail panel shows a centred, word-wrapped
  prompt: `Press Enter to create a new <kind>.` or
  `No <kinds> yet. Press n to add one.`
- **`Del`** deletes the cursor entry **immediately, with no confirmation**.
  The earlier `d` binding was retired as too easy to hit by accident.
- **Scrolling:** the scrollbar shows only on overflow. Wheel scrolls ±3 rows
  without moving the cursor. Clicking the track pages. Click-and-hold
  auto-scrolls (5.8).
- `PgUp`/`PgDn` page the cursor.

#### Detail panel (35 wide), per kind

| Kind | Fields (Tab order) |
|---|---|
| alias / action / substitute | Pattern (single-line box) → Body (multi-line box, max **10 visible rows**, inline scrollbar in the box's right inner cell) |
| macro | Key cell → Commands body |
| highlight | Pattern → Style toggles → Text swatches → BG swatches |

- **Pattern field:** single line. Double-click selects the word run;
  triple-click selects the whole field.
- **Body field:**
  - `Enter` splits the line. `←`/`→` cross line boundaries. `↑`/`↓` keep the
    column.
  - `PgUp`/`PgDn` page, without falling through to other fields.
  - Wheel scrolls the viewport; the cursor stays put.
  - Double-click selects a word; triple-click selects the line (not the
    `\n`).
  - Alt+↑/↓ does not work here (EDITOR only).
- **Validation (one inline message at a time, C_DANGER `#a04030`):**
  precedence is `Pattern required` > `Unbalanced braces in Pattern` >
  `Unbalanced braces in Commands`.
  - An empty pattern only raises the error after you leave the field.
  - The brace check ignores `\{` and `\}`.
  - **Saving is never blocked.** Entries with an empty pattern are silently
    dropped on save.
- **Live binding:** every keystroke updates the entry. An edited entry loses
  its "original raw text" and is re-serialised canonically on save.

#### Highlight colour picker

```
Pattern
┌─────────────────────────────────┐
│ ^%1 enters                      │
└─────────────────────────────────┘
                                          (blank)
 [ ]Undersc. [ ]Blink [ ]Reverse
                                          (blank)
   ── Text ──           ── BG ──
 [ ]██  [X]██       [ ]██  [ ]██     row: red     / Red
 [ ]██  [ ]██       [ ]██  [ ]██          green   / Green
 [ ]██  [ ]██       [ ]██  [ ]██          yellow  / Yellow
 [ ]██  [ ]██       [ ]██  [ ]██          blue    / Blue
 [ ]██  [ ]██       [ ]██  [ ]██          magenta / Magenta
 [ ]██  [ ]██       [ ]██  [ ]██          cyan    / Cyan
 [ ]██  [ ]██       [ ]██  [ ]██          white   / White
```

- **Grid:** 7 rows × 2 columns per dimension (left column is the dark
  colour, right is the bright one), with Text and BG side by side. That makes
  28 swatch cells. Each swatch is 6 cells wide (`[X]██`), with a 3-cell gap
  between Text and BG.
- **Swatch colours are the terminal's ANSI colours:**
  - `red`→ansired, `Red`/`light red`→ansibrightred, and the same pattern for
    green, yellow, blue, magenta and cyan.
  - `white`→ansiwhite. `White`→`gray` (ansibrightblack), the closest match.
  - Browser: map these to the 16-colour palette in §10.
- **Style toggles:** `underscore`, `blink`, `reverse`. Bold was removed
  because tt++ does not accept it for `#highlight`.
- **Cursor and selection are separate (ADR 0084):** arrows move the cursor.
  `Enter` or a click toggles that swatch. Each dimension has 0 or 1 swatch
  selected, and selecting one clears the other in that dimension.
- **Serialised body:** `[styles in order underscore,blink,reverse]
  [text colour] [b <bg colour>]`. The text colour is left out if none is
  chosen, and `b <bg>` is left out if no BG is chosen.
- **Parsing:** lowercase, Capitalised and `light <c>` forms are all
  accepted.
- **Unparseable bodies** (for example ones containing `bold`, or RGB codes)
  are kept verbatim until you touch a swatch. In that case the cursor parks
  at (0,0) and nothing is selected.
- The list's Color column renders the value in its own colour.

#### Macro Key cell and key-capture overlay

- **Key cell text:**
  - `[ F1 ]`, `[ Numpad 0 ]`, `[ Alt+a ]` for known keys.
  - `[ Custom: <raw> ]` (C_HINT) for unknown escapes.
  - `[ Press to bind… ]` (C_HINT) when empty.
- **Opening the overlay:** `Enter` or a click on the Key cell opens it.
  `+ New entry` on Macros opens it automatically.
- **Overlay layout** (centred):
  ```
  ─── Bind key ───

  Press the key to bind…

     <That key isn't available.>   (C_DANGER, only after a failed press)

     ESC Cancel
  ```
- **Key matches:** the pattern is set, the list re-sorts, the overlay
  closes, and `Bound to <display name>.` flashes in C_ACCENT for ~2 s. Focus
  moves to Commands if the overlay opened automatically, otherwise to the
  Key cell.
- **No match:** the message is always `That key isn't available.` and the
  overlay stays open.
- **ESC:** cancels. An auto-created entry is removed.
- **Known keys** (on-disk escape → display name, macro_keys.py):

| Group | Escapes → names |
|---|---|
| F1–F12 | `\eOP \eOQ \eOR \eOS` (F1–F4), `\e[15~ \e[17~ \e[18~ \e[19~ \e[20~ \e[21~ \e[23~ \e[24~` (F5–F12) → `F1`…`F12` |
| Numpad (SS3) | `\eOp`…`\eOy` → `Numpad 0`…`Numpad 9`; `\eOn` `Numpad .`; `\eOM` `Numpad Enter`; `\eOj` `Numpad *`; `\eOk` `Numpad +`; `\eOm` `Numpad -`; `\eOo` `Numpad /` |
| Alt+letter | `\e<letter>` → `Alt+<letter>` for a c e g h i j k l m n p q r s t u v w x y z (b/d/f are reserved for word editing in the input line; o clashes with the SS3 numpad parse) |
| Ctrl+letter | `^G ^L ^O` → `Ctrl+g/l/o` |

- **Escape normalisation:** when resolving names, `\x1b`, `\033` and a
  literal ESC byte are treated like `\e`.
- **Lesson (ADR 0082):** the key list must match what the input line
  actually forwards, or a macro is saved but never fires.
- **Browser note:** the whole terminal-escape layer disappears. The browser
  captures `KeyboardEvent` (code, key and modifiers) and can bind any combo
  the browser allows (intent goal 8). The known-key whitelist and
  "isn't available" become "reserved by browser/app" rejections. There is
  **a storage-format decision** to make: keep tt++ `\eOp`-style patterns in
  EDITOR text for readability and familiarity, or use a WebCockpit key
  notation such as `#macro {Numpad0}`. Either way, display names like
  `Numpad 0`/`F1`/`Alt+a`/`Ctrl+g` remain the UI vocabulary. Terminals
  cannot distinguish numpad keys unless in application mode (NumLock); the
  browser can, via `code`.

#### Hint content (two C_HINT lines under `─── Hint ───`; must fit ~33 chars)

| Kind | Line 1 | Line 2 |
|---|---|---|
| alias | `%1 %2 capture words · ; chains` | `gv %1  →  get %1;value %1` |
| action | `%1 %2 match text · ^ anchors line` | `^%1 raises %2 hand  →  group %1` |
| highlight | `%1 matches text · ^ anchors line` | `^%1 enters  colours whole line` |
| substitute | `%1 %2 capture & reuse in New text` | `%1 massacres %2 → %1 MASSACRES %2` |
| macro | `Enter on Key cell to bind a key` | `$var inserts variable · ; chains` |

### 5.7 Editor mode

#### Syntax highlighting (ttpp_syntax.py, ADR 0089)

The tokenizer is purely lexical, single pass, and has no whitelist of
command names. Base text is C_ITEM `#bcbcbc`.

| Class | Matches | Colour |
|---|---|---|
| command | `#` + identifier, only in command position (line start, after `{`, after `;`, with whitespace allowed) | `#5fafaf` muted teal |
| brace | every `{` `}` not consumed by `${…}` | `#8290a0` slate |
| delim | every `;` | `#c8a060` dim amber |
| var | `$id`, `${…}` (on one line), `&id`, `%<digits>`, `%` + one of `.+*?^$|()[]` (not `%U`-style format codes) | `#87af87` sage |
| code | `<…>` short colour codes such as `<088>`, `\`-escapes such as `\n`, `\xFF`, `\uNNNN`, `\u{…}`, `\UNNNNNN` | `#9b86b3` lavender |
| brace match | the brace next to the cursor and its partner | fg `#dadada` bg `#3a3a3a` |

- Style priority, highest first: selection (C_SELECTED `#000` on `#bcbcbc`),
  then brace-match bg, then the current-line band.
- A stray `;` inside text gets coloured too. This is an accepted cost.

#### Current-line band

- It is drawn only when the buffer has focus. The colour is the terminal bg
  moved 12% toward white on dark themes, or toward black on light ones
  (`#1f1f1f` on black).
- It is hidden while the toggle has focus.

#### Editing keys

| Key | Action |
|---|---|
| `←`/`→`, `↑`/`↓` (column kept), `Home`/`End`, `PgUp`/`PgDn` | Move the cursor. `↑` on the top line moves focus to the toggle |
| `Shift`+ any of the moves above | Extend the selection from the anchor |
| `Alt+↑` / `Alt+↓` | Swap the current line with the one above/below. The cursor follows, and the column is kept. One undo unit. Clears the selection. No block move |
| `Backspace` / `Delete` | Delete a character, or the selection |
| `Enter` | Insert a newline (replaces the selection) |
| `Tab` | Move focus to the toggle (**no literal tab**) |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste (5.7 Clipboard) |
| printable | Insert (replaces the selection) |

#### Brace assistance (EDITOR only)

1. **Auto-close `{` → `{}`** with the cursor between the braces. It only
   happens when the next char is end-of-buffer, whitespace or `}`.
   - The inserted `}` is tentative: typing `}` or pressing `→` steps over it.
   - `Backspace` right after the auto-insert removes both braces.
   - Only `{` auto-closes (not `(` or `[`).
   - Any other navigation ends tracking.
   - Paste never auto-closes.
2. **Matching-brace highlight:** only structural braces count, not those in
   `${…}` or `\{`. An unbalanced brace gets no highlight.
3. **Balance indicator** on the footer in C_DANGER: `3 unclosed {` and/or
   `2 stray }`. It is hidden when braces balance.

#### Footer

- **Right-pinned:** `Ln <n>, Col <n>` (1-based). The brace segment sits to
  its left, joined by `  ·  `. Ln/Col never moves.
- **Flash:** `Copied`/`Cut` flashes in C_ACCENT in the centred slot for
  ~1.5 s and hides the brace segment while it shows.

#### Undo/redo (ADR 0091)

- **What is saved:** each undo step is a snapshot of text, cursor and
  anchor. Depth is capped at 200.
- **Reset:** both stacks reset on open and on every mode flip.
- **Coalescing:** consecutive typed characters make one step, and so do
  consecutive Backspace/Delete presses.
- **Step boundaries** come from:
  - newline
  - any cursor move or click
  - switching between insert and delete
  - paste, cut, auto-close, overtype, or pair-delete (each is its own step)
  - a focus change or mode flip
- There is **no time-based boundary**.
- Any new edit clears redo. Undo/redo clears pending auto-close braces.

#### Mouse

- **Click:** moves the cursor there, clears the selection, and takes focus
  from the toggle.
- **Double-click:** selects a same-class run (word = alnum and `_`;
  whitespace; other). It never crosses a line and ignores syntax, so a click
  in `${var}` selects `var`.
- **Triple-click:** selects the logical line (not the `\n`).
- **Click counting:** a click within 0.4 s *at the same cell* counts as the
  next click (1→2→3→1).
- **Wheel:** ±3 rows, also over the gutter. The cursor does not move, and
  the next cursor key pulls the view back.
- **Scrollbar** (`█` thumb `bold #ffffff`, `░` track `#585858`):
  - Clicking the track pages.
  - Clicking the thumb does nothing.
  - **Click-and-hold on the track:** pages once, then after ~300 ms repeats
    every ~100 ms until the thumb covers the held row (ADR 0092). The target
    is fixed, so a missed mouse-up cannot cause runaway scrolling.
- **Drag-to-select is not supported**, because terminal mouse reporting is
  unreliable. **Browser note:** implement native drag selection (and
  thumb-drag). The double/triple-click and Shift-arrow behaviours still
  apply.

#### Clipboard (ADR 0090)

- **Contexts:** EDITOR buffer, lite Pattern and lite Body share one
  internal register.
- **`Ctrl+C`:** copies the selection, or the whole line (with its `\n`) if
  nothing is selected.
- **`Ctrl+X`:** cuts the same way and does not leave a blank line.
- **`Ctrl+V`:** pastes the internal register. In Pattern, newlines become
  spaces.
- **In Cockpit:** copy/cut also emit OSC 52 to the system clipboard, but
  `Ctrl+V` never reads the system clipboard. Paste from outside arrives as
  bracketed paste, with CRLF normalised.
- **Other rules:** palette zones and the Key cell ignore clipboard keys. The
  global Ctrl+C quit is disabled inside the editor.
- **Browser note:** OSC 52 and bracketed paste are irrelevant. Use the
  native Clipboard API and paste events, so Ctrl+V can read the system
  clipboard, which removes the asymmetry. Keep the copy-line-when-no-selection
  behaviour and the `Copied`/`Cut` flash.
- **ESC timing:** Cockpit delays bare ESC by up to 50 ms so it can tell it
  apart from Alt+↑ and Alt+letter. **Browser note:** the delay disappears,
  because the browser reports Alt directly.

### 5.8 Focus model

- **Axes:** mode ∈ {lite, editor}; a toggle-focused flag; in lite mode a zone
  ∈ {kind, list, detail} plus the detail field index.
- **Tab cycle:**
  - LITE: toggle → kind → list → Pattern/Key → Body → toggle.
  - Highlights: Pattern → Style → Text → BG.
  - EDITOR: toggle → buffer → toggle.
- **`↑` fall-through:**
  - kind row → toggle
  - list top row → kind row
  - detail Pattern → kind row
  - buffer top line → toggle
- **`↓`:** toggle → kind row (lite) or buffer (editor, offset 0); kind row →
  list row 0.
- **Stepwise `←` at position 0:**
  - Pattern → list
  - Body (0,0) → Pattern end
  - Macro Key → list
  - Macro Body (0,0) → Key
  - Highlight Style's first toggle → Pattern end
  - Text column 0 → Style's last toggle (Reverse)
  - BG column 0 → Text column 1
- Fall-through clears any selection.
- **Footer hints** (C_HINT, last row; arrows and Enter are deliberately
  left out):
  - List focus: `n New · Del Delete · Tab Cycle · ESC Save & back`.
  - Everything else: `Tab Cycle · ESC Save & back`.

### 5.9 Save semantics and round-trip rules

- **Save** happens on ESC from either mode. EDITOR mode parses first. The
  file write is atomic (temp file then rename).
- **Canonical entry form:** `#<kind> {pattern} {body}[ {priority}]`.
  - Priority is kept even though the UI does not show it: editing the body
    of `#alias {test} {x} {7}` keeps `{7}`.
  - Macros never get a priority.
  - A non-integer priority makes the line a passthrough.
- **Untouched entries** are written back byte-exact from their original
  text.
- **Unknown commands** (`#var`, `#event`, `#gag`, `#ticker`, …) and
  malformed or ambiguous lines (such as trailing text after the last `}`)
  are preserved verbatim as passthrough.
- **Canonical file order** (ADR 0084): items are grouped by command name
  (alphabetical), sorted case-insensitively by first brace argument within a
  group, with **one blank line between groups**. This applies to every
  `#cmd`, including passthroughs. A load and save with no edits still
  re-sorts the file.
- **Dropped on parse/sort:** `#nop` comments (ADR 0042), `#class {…}
  {open|close}` lines (ADR 0110), blank lines, free text,
  unclassifiable/malformed passthroughs, and the continuation lines of
  multi-line passthrough blocks. The last is a **known data-loss
  limitation**.
- **Multi-line entries:** the five kinds may span lines, and brace groups
  can be separated by newlines. `\` escapes the next char inside braces.
- **Body normalisation** (action/alias/macro only): tt++ re-indents bodies
  when writing. On load, leading and trailing blank lines are stripped and 4
  leading spaces are removed per line. Highlights and substitutes are left
  alone, since their whitespace may matter.
- **Core alias guard:** before writing, `#alias` entries whose pattern
  collides with a built-in Cockpit alias are removed, and the user is told.
  **Browser note:** WebCockpit needs an equivalent reserved-command list
  (for example its own `cp`-style commands).
- **Blank profile template** (ADR 0042):

  | Key | Command |
  |---|---|
  | Numpad 0 | `flee` |
  | Numpad 2 | `south` |
  | Numpad 3 | `down` |
  | Numpad 4 | `west` |
  | Numpad 5 | `exits` |
  | Numpad 6 | `east` |
  | Numpad 8 | `north` |
  | Numpad 9 | `up` |
  | Numpad + | `open exit` |
  | Numpad - | `close exit` |

  It also has `#nop` header comments, which are lost on first save. A new
  profile should ship with these defaults.
- **Lessons that carry over:**
  - Never overwrite a good profile with an empty one after a failed or
    partial load (ADR 0063 `_profile_loaded` guard; ADR 0061).
  - Save at defined points (ADR 0014 autosave on session end).
  - **Browser note:** file, tt++ class and sanitiser mechanics disappear. A
    "has loaded" guard before any autosave of runtime-created rules still
    applies, and so does atomic replace in storage.
- **ADR 0081 (format-code escaping):** a tt++ quirk where `%%U` in alias
  bodies unwraps differently per platform. Rule: single `%` for `#format`
  codes, `%%0..%%99` only for arguments. It only matters if WebCockpit's
  interpreter implements `#format` and nested `%%` unwrapping; spec.md
  should define that behaviour explicitly rather than inherit the
  ambiguity.

### 5.10 Browser-irrelevant bits (summary)

- OSC 52 / bracketed paste
- ESC-vs-Alt timeout
- prompt_toolkit click-count reconstruction (use the native `detail` count)
- missing drag selection
- mouse-motion-under-button unreliability
- terminal-escape macro keys and application-keypad mode
- `.tin` temp-file/rename
- tt++ class snapshot/apply/canary
- `sanitize_profile.sh`
- `#write` re-indent normalisation (only relevant when importing tt++ files,
  which is a non-goal, but keep it for pasted text)

---


## 6. tt++ command subset actually used

Scope of the scan (Cockpit @ `0fffa08`, v0.15.0):

| Corpus | File(s) | Role |
|---|---|---|
| Real player profile | `ttpp/profiles/khazdul.tin` (584 lines) and its near-copy `bridge/launcher/templates/khazdul.tin` | The owner's PvP profile. The only non-trivial profile. |
| Default / blank template | `ttpp/profiles/default.tin`, `bridge/launcher/templates/blank_profile.tin` (16 lines) | What every new profile starts with (ADR 0042). |
| Core `.tin` | `ttpp/main.tin`, `ttpp/core/*.tin` (~560 lines) | Cockpit's own plumbing. Becomes native code in WebCockpit, **not** user-visible tt++. Listed for completeness only. |
| Lua-issued tt++ | `lua/core/*.lua` via `game_cmd`/`session_cmd`/`tintin_cmd` | Trackers registering actions at runtime. Native code in WebCockpit. |
| Readability modules | `ttpp/readability/modules/*.tin` | OUT OF SCOPE (461 `#substitute`, 4 `#highlight`). Useful only as a perf data point: hundreds of substitutes must not hurt latency. |

Counts are brace-depth aware: "definitions" = commands at brace depth 0 (a profile entry),
"in bodies" = commands inside `{…}` bodies (executed when an alias/action/macro fires).

### 6.1 Profile-level entry kinds (what a profile file contains)

| Kind | khazdul.tin defs | blank template | Lite-mode tab in Cockpit's editor? | Notes |
|---|---:|---:|---|---|
| `#alias` | 201 | 0 | yes | 116 multi-line bodies; 1 regex-style name (`^b%+1..d$`) |
| `#highlight` | 22 | 0 | yes | colour **names** (`Cyan`, `green`, `red`, `Magenta`), all priority `{5}` |
| `#variable` | 19 | 0 | **no** (preserved as "unknown") | state that aliases mutate at runtime (target, spell, class, doors…) |
| `#action` | 12 | 0 | yes | all anchored `^…$` except one (`{WARNING}`) |
| `#macro` | 9 | 10 | yes | F-keys `\e[15~`…`\e[20~`, numpad `\eOp`…`\eOy`, `\eOk`/`\eOm`, PF1–PF4 `\eOP`…`\eOS` |
| `#substitute` | 2 | 0 | yes | recolour whole line via `%0` + colour codes |
| `#ticker` | 1 | 0 | no | **a leaked core ticker** (`#TICKER {clock} {#lua {state.world.clock.tick()}} {0.25}`) that got saved into the profile. Lesson: keep system registrations out of the profile store (ADRs 0014, 0049, 0064). |
| `#nop` | 0 | 4 | no | comments. Cockpit's editor drops them on save (§5.9); WebCockpit should keep them |

Kinds with **zero** use in any profile: `#gag`, `#delay`, `#event`, `#class`, `#math`,
`#format`, `#list`, `#foreach`, `#loop`, `#while`, `#switch`, `#regexp`, `#replace`,
`#function`, `#local`, `#tab`, `#prompt`, `#split`, `#path`, `#map`, `#antisubstitute`,
`#button`, `#history`, `#cr`, `#send`.

### 6.2 Commands used inside bodies (khazdul.tin)

| Command | Count | Usage |
|---|---:|---|
| `#variable` (set) | 58 | `#variable {spell} {'sleep'}`, `#variable {sd1} {%1}`, string concat `{$_sd_line<F9AA8B7> SD1: …}` |
| `#if` / `#elseif` / `#else` | 35 / 5 / 17 | string compare; nested up to 3 levels |
| `#showme` (and abbrev. `#show`) | 15 + 1 | local status echo with truecolour codes (`## TARGET: …`) |
| `#action` / `#unaction` | 2 / 2 | runtime-created trigger toggled by aliases (`autobashon`/`autobashoff`) |
| `#lua` | 1 | only in the leaked ticker; not supportable, preserve verbatim |
| plain MUD commands | most bodies | `_send <cmd>` (≈150 uses) or bare commands, `;`-separated |

`_send` is **not** a tt++ built-in: it is a core alias (`ttpp/core/system.tin`) that
`#showme`s the expanded command locally (if `$_echo_sends`) and then sends it. Profiles
lean on it heavily, so the web client needs an equivalent built-in (or echo sent commands
by default) if the owner's habits are to carry over (profile import itself is a non-goal).

### 6.3 Pattern and expansion features used

| Feature | Where | Count / example |
|---|---|---|
| `%1`…`%3` capture / positional args | actions, aliases, highlights | `%1` ×78, `%2` ×8, `%3` ×4 |
| `%0` (all args / whole match) | alias bodies, action/substitute bodies | ×20; `#SUBSTITUTE {^-%1wound%2} {<Fff0000>%0<900>}` |
| `^` / `$` anchors | actions, aliases, substitutes | 28 `^`, 24 `$` |
| Range matcher `%+1..d` | alias name `^b%+1..d$` (b1d, b12d → blind nth target) | 1 |
| Unused-arg append | aliases without `%N` (e.g. `bb` → `_send bash $target`) | tt++ appends extra typed words to the expansion when `%0…%99` are absent — implicit, very common |
| `$var` expansion | 252 occurrences, 18 distinct vars | inside send text, `#if` operands, `#showme` |
| `;` command separator | 286 | also across newlines in multi-line bodies |
| `{}` nesting, multi-line bodies | 116 multi-line bodies | brace-balanced, whitespace/indent inside bodies is free-form |
| `#if` operators | `==` ×36, `!=` ×56, `\|\|` ×11 | `&&` not used in profiles (used in core) |
| Glob compare in `#if` | `"$target" == "*hobbit*"` | tt++ string `==` treats `*` as wildcard (regex compare) |
| Priority argument | `{5}` on all highlights/substitutes | actions/aliases omit it (default 5); float allowed, lower = earlier |
| Colour codes in text | `<F9AA8B7>` (24-bit fg) ×42, `<FFFFFFF>` ×26, `<099>` (reset to default fg/bg) ×28, `<F23aaee>`, `<Fff0000>` | plus `<900>` ×4 — not a valid attribute digit; parser must tolerate unknown codes |
| Colour names in `#highlight` | `Cyan`, `green`, `red`, `Green`, `Magenta`, `magenta`, `cyan` | capitalised = light/bright, lowercase = dark |
| Case-insensitive command words | `#VARIABLE`, `#HIGHLIGHT`, `#SUBSTITUTE`, `#TICKER`, `#MACRO` mixed with `#alias` | serializer/`#class write` output is upper-case; hand edits are lower-case |
| Abbreviations | `#show` (=`#showme`), core uses `#var`, `#ses`, `#act` | tt++ accepts any unique prefix |
| Macro key escapes | `\eOp`…`\eOy` (numpad 0–9), `\eOk` (+), `\eOm` (−), `\eOP`…`\eOS` (PF1–4 = F1–F4 in SS3 form), `\e[15~`…`\e[20~` (F5–F9) | a browser maps `KeyboardEvent.code` to these canonical names |
| Non-ASCII alias names | `é`, `ú`, `ń`, `ś`, `ẃ` (dead-key typos mapped to directions) | UTF-8 in names must work |
| Double-escape in nested defs | core only: `%%1` inside `#action` created by an alias | needed if users write alias-that-creates-action (khazdul does, but with no captures) |

Not used anywhere in profiles: `%*`, `%w`, `%d`, `%s`, `%S`, `%a`, `%i`, embedded PCRE `{…}`,
`~` colour-matching, `&var` existence checks (core only), `@function()` calls, `#math`,
nested `$var[key]` tables, `#list`.

### 6.4 Core `.tin` usage (reference only — becomes native code)

| Command | Count | What it does in Cockpit | WebCockpit equivalent |
|---|---:|---|---|
| `#nop` | 207 | comments | — |
| `#lua` | 40 | hand-off to the Lua brain | native JS |
| `#alias` | 40 | `_send`, `connect`, `reconnect`, `cp -X`, `_register_*` | built-in commands (`cp -s`, `reconnect`, …) |
| `#class` open/close/write/kill | 32 | core vs profile separation; profile save = `#class write` | profile store in IndexedDB |
| `#if` | 31 | | |
| `#action` | 22 | death lines, wimpy, time lines, run-log, trackers | native trigger table (§8.3) |
| `#showme` | 20 | welcome banner, system messages | |
| `#system` | 18 | shell out (toggle panes, sanitize, save) | n/a |
| `#event` | 13 | `SESSION CONNECTED/DISCONNECTED/TIMED OUT/DEACTIVATED`, `RECEIVED LINE`, `SENT OUTPUT`, `RECEIVED INPUT`, `IAC WILL GMCP`, `IAC SB GMCP`, `PROGRAM TERMINATION` | internal event bus |
| `#message` | 9 | silence `#OK` registration echoes | n/a |
| `#format` (`%U` µs time, `%p`, `%.1s`) | 6 | run-log timestamps | `performance.now()` / `Date` |
| `#delay` / `#undelay` | 3 (+17/11 from Lua) | reconnect bounce, tracker expiry | timers |
| `#ticker` | 1 | 4 Hz clock tick | `setInterval` |
| `#line log` / `#line quiet` / `#line gag` | 3 | raw run capture; keymanager gags (out of scope) | |
| `#send` (raw bytes) | 4 | GMCP negotiation | telnet layer |
| `#config {REPEAT ENTER} {OFF}` | 1 | empty Enter sends a bare newline (MUME cast-abort) | input pane rule (§1) |
| `#zap`, `#session`, `#gts`, `#ses`, `#run`, `#script`, `#read`, `#buffer`, `#screen` | ≤7 each | session/process plumbing | n/a |

Lua-issued tt++ at runtime (trackers): `#action` 33, `#alias` 22, `#delay` 17, `#unaction` 16,
`#undelay` 11, `#var`/`#unvar`/`#macro`/`#unmacro` 1 each. Nested dynamic actions such as
"header line arms a catch-all `^%1$` action until a blank line" (stat reconcile) show that
**synchronous, same-line-order registration** matters (ADR 0050).

### 6.5 Minimum command set implied

Derived from 6.1–6.3 plus intent Goal 2 (actions, aliases, substitutes, highlights, gags,
hotkeys, variables, scripting logic):

| Tier | Commands / features |
|---|---|
| **Must (used by real profiles)** | `#alias`, `#action`, `#unaction`, `#highlight`, `#substitute`, `#macro`, `#variable`, `#if`/`#elseif`/`#else`, `#showme`, `#nop`, `;` separators, `{}` nesting and multi-line bodies, `%0`–`%99`, `^`/`$`, `%+n..mX` ranges, unused-arg append, `$var`, `==`/`!=`/`\|\|`/`&&` with glob `*`, colour codes `<xyz>`/`<Frrggbb>`/`<Frgb>`, colour names light/dark, priorities, case-insensitive command words and unique-prefix abbreviations, a `_send`-style echo-and-send |
| **Must (intent Goal 2 explicitly, unused today)** | `#gag`, `#ticker`, `#delay`/`#undelay`, `#unalias`/`#unhighlight`/`#unsubstitute`/`#unmacro`/`#unticker`/`#unvariable` |
| **Should (common tt++ scripting)** | `#math`, `#format` (basic), `#class` (group + kill, not files), `#event` (a small curated set: connected, disconnected, GMCP module events), `%*`, `%w`, `%d`, `%s`, `%S`, `%i`, embedded `{regex}`, `&var` |
| **Won't / verbatim-preserve only** | `#lua`, `#system`, `#script`, `#run`, `#read`/`#write` of files, `#session`/`#zap`/`#gts`, `#line log`, `#buffer`, `#screen`, `#split`, `#map` — unknown commands round-trip byte-exact but do nothing (Cockpit's editor already preserves unknown commands, see §5) |

## 7. Logging, runs and replay

Cockpit records every play session ("run") as two paired files per character: a structured
JSONL event log (drives Statistics, History, Spotlights, Credits, markers) and a raw
microsecond-timestamped text capture (drives the log player, Spotlights reel and exports).
Everything downstream is a *reader* over these two streams. Sources: docs/runs.md,
docs/launcher.md (History/Spotlights/Credits/log_view/export frames), docs/popup-menu.md
(Statistics, Exit confirmation), bridge/launcher/*.py, templates/log_replay.html.

**Real on-disk example** (`/home/ole/MUME/data/runs/`):

```
data/runs/
  Gittan/  2026-09-19T21-35-58.jsonl   1 031 B   .log   288 452 B
           2026-09-19T22-10-27.jsonl     183 B   .log     9 478 B
  Melker/  2026-09-25T21-54-04.jsonl     143 B   .log     2 772 B
  Rasta/   2026-09-18T18-11-42.jsonl  29 686 B   .log 4 732 905 B  (5h27m, 107 941 lines)
           2026-09-25T22-03-02.jsonl   9 864 B   .log 3 169 118 B  (2h24m,  70 098 lines)
           2026-09-25T22-03-02.meta.json   65 B
           2026-09-25T22-03-02.export.json 446 B
           2026-09-26T21-00-45.jsonl  27 815 B   .log 3 913 213 B  (5h02m,  91 071 lines)
  Globur/ Miffo/ Riekor/ Svin/   (empty dirs — character seen, no run sealed)
```

**Sizes to plan for:** raw `.log` ≈ **0.8–1.3 MB per played hour** (~18–30k lines/h); gzip
brings it to ~20 % (4.7 MB → 0.97 MB). JSONL is ~1 % of the `.log` (5–10 KB/h). A regular
player keeping 14 days of unsaved runs holds tens of MB of raw log; saved runs accumulate
beyond that.

### 7.1 Raw capture (`<run-id>.log`)

**Format** — one line per event, UTF-8 text, inbound and outbound interleaved in
microsecond order:

```
<µs since epoch> <raw inbound line, ANSI SGR preserved>
<µs since epoch> > <outbound command, post-alias-expansion>
```

Real excerpt (`Rasta/2026-09-26T21-00-45.log`, `^[` = ESC):

```
1790449245424814 > who
1790449245596613 Allies
1790449245597195       Rasta Fari
1790449245599624 7 allies on.
1790449245600201 oO>
1790449246198284 > arm
1790449246341032 [cast n 'armour']
1790449247842113 ^[[35mA blue transparent wall slowly appears around you.^[[0m
1790449247842391 oO Mana:Hot>
1790449249592919 ^[[33mXaark narrates 'yes'^[[0m
```

| Aspect | Behaviour |
|---|---|
| Timestamp | 16-digit integer µs since Unix epoch, per line (not per batch — Cockpit had a bug where a batch shared one timestamp; fixed by computing it inline per event) |
| Direction | char after `<ts><space>`: `>` + space = outbound; anything else inbound |
| Inbound | every server line incl. blank lines and prompts (`oO Mana:Hot>` appears as its own line); ANSI SGR kept; telnet IAC already stripped by the telnet layer |
| Outbound | every command actually sent, **after** alias/macro expansion (one keypress that expands to 3 commands → 3 `>` lines); empty Enter logs as `<ts> > ` |
| IAC filter (ADR 0076) | outbound payloads whose first byte is `0xFF` (NAWS resize, GMCP `Core.Hello`/`Core.Supports.Set`, other subnegotiations) are dropped — both from the `.log` and from the internal "user input" event bus. Inbound needs no filter |
| Not captured | login screen / anything before the first `Char.Vitals` after login (short gap); GMCP payloads themselves are **not** logged |
| Correlation with JSONL | `int(log_ts_us / 1e6) == jsonl.ts` |
| Orphans | a `.log` without a sealed sibling `.jsonl` = orphaned (no marker line in the `.log`) |

Lesson: capture sits on the hot path; Cockpit keeps it in native tt++ with no script dispatch
per line to protect PvP latency.

**Browser note.** Capture at the telnet/line layer after IAC stripping, before triggers/gags
(Cockpit logs server lines raw, *not* post-substitution/gag — confirm in spec). Timestamp with
`performance.timeOrigin + performance.now()` → µs. Do not write to IndexedDB per line: buffer
and flush in batches (e.g. every 1–2 s and on `pagehide`/`visibilitychange`), optionally
compressed with `CompressionStream('gzip')` per chunk. Chunked storage (run-id + chunk seq)
keeps the player's lazy loading and the retention sweep cheap. Outbound: log the post-expansion
commands the client actually sends; skip anything that is protocol bytes (GMCP out, NAWS). Local
echo, input history and hotkey names are not logged.

### 7.2 Run lifecycle and JSONL events

**Vocabulary (ADR 0044).** A *run* = one MUME login → logout for one character. "Session"
in the UI (History) = a **stitched chain** of runs (§ stitching below). All run data is
**per character**, never per profile.

**Lifecycle.**

| Step | Trigger | Effect |
|---|---|---|
| Arm | MUME "connected" (`Char.Name` received) | orphan check (below), archive dir created, `run_start` deferred |
| Start | first `Char.Vitals` after login | `run_start` row written to `current.jsonl`; `.log` capture armed |
| Play | events | rows appended (open-append-close per row) |
| End | disconnect (`Core.Goodbye`, connection closed) | `run_end` row, `current.jsonl` renamed to `<run-id>.jsonl`; `.log` capture disarmed |
| Too short | disconnect before any `Char.Vitals` | nothing written at all |

**Run id** — `YYYY-MM-DDTHH-MM-SS` (local time of `run_start.ts`, colons → dashes);
lexicographic order = chronological. Used as the filename stem for `.jsonl`, `.log`,
`.meta.json`, `.export.json`.

**Orphans.** If the process died mid-run, `current.jsonl` is left. On next arm for that
character: append `{"event":"orphan_close","ts":now}`, rename to the run-id derived from its
first row. Readers must tolerate runs with no `run_end`.

**Linking (ADR 0056).** `run_start.previous_run_id` = lexicographic max sealed run-id for
that character at write time (after orphan sealing, so a link-loss orphan becomes the
predecessor). Absent (not null) when none. The writer never merges runs; **consumers stitch**:
a run joins its predecessor's chain if `start_ts − predecessor.last_event_ts < 3600 s`
(`max_gap_seconds`, default in `list_sessions` / `previous_run_chain`).

**Schema.** Every row has `event` + `ts` (epoch seconds, integer). `run_start.schema = 1`;
absent/unknown → treat as 1. All later event types were added without bumping (additive);
readers ignore unknown events.

| `event` | Fields | Written when |
|---|---|---|
| `run_start` | `character`, `level`?, `xp`?, `tp`?, `previous_run_id`?, `schema` | first Vitals tick; baseline snapshot (optional fields omitted if unknown) |
| `run_end` | — | clean disconnect, before seal |
| `orphan_close` | — (`ts` = seal time, not true end) | sealing a crashed run |
| `level_up` | `level` | `Char.StatusVars` level higher than last seen (decreases not logged) |
| `kill` | `mob_name` (with article, trailing ` (MIN)`-style label stripped), `xp_delta` | kill fold (below) |
| `pkill` | `name` (R.I.P. name up to ` the `), `race` (`"the Orc"` or `""`), `xp_delta` | kill fold, PC victim |
| `tp_gained` | `tp_delta` (> 0) | each Vitals tick where TP rose |
| `xp_loss` | `xp_delta` (< 0) | each Vitals tick where XP fell (death penalty etc.) |
| `tp_loss` | `tp_delta` (< 0) | Vitals TP fell (trainer spend **or** death — indistinguishable) |
| `char_death` | `level`? | text `You are dead! Sorry...` |
| `achievement` | `name` (= GMCP `Event.Achieved.what`) | GMCP `Event.Achieved` (ADR 0117; requires `Event 1` in `Core.Supports.Set`) |
| `group_changed` | `members` (player allies only, sorted by join order; `[]` when alone) | ally composition changes (join/leave); NPC/mount churn and vitals updates ignored; first `Group.Set` before baseline ignored |

**Kill fold (ADR 0008).** MUME sends `Char.Vitals` on every hit, so XP is accumulated; each
`R.I.P.`/mob death line queues a name and (re)starts a **500 ms debounce**. On fold:
`pending_xp = xp_now − xp_at_last_fold`, split evenly across all queued kills (mobs and PCs
mixed), remainder to the last. `ts` = fold time, not death time. Negative XP resets the fold
anchor; the *session* anchor (for status-bar "Sess XP") is immutable within a run.

Observed mix (Rasta, 5 h): 316 `tp_gained`, 136 `kill`, 10 `group_changed`, 1 `pkill`.
Real rows:

```
{"event":"run_start","character":"Rasta","level":73,"tp":400793,"schema":1,"ts":1790449245,"previous_run_id":"2026-09-25T22-03-02","xp":81832309}
{"event":"kill","ts":1790449565,"xp_delta":5424,"mob_name":"Thrakghash of the Mordor Flame"}
{"event":"pkill","name":"a Half-Elf","ts":1790460057,"xp_delta":775,"race":""}
{"event":"group_changed","ts":1790455437,"members":["Kvällulv","Kuzzim","Norsy","Taube"]}
{"event":"run_end","ts":1790467398}
```

**Markers.** ADR 0043 is the UI-pane `◆` character-event marker (not run data). The run
"markers" are the K/D/A/L letters on the player strip: `pkill`→K, `char_death`→D,
`achievement`→A, `level_up`→L. **ADR 0135:** K and D are anchored to their exact `.log`
line by content match on ANSI-stripped text (`R.I.P.` / `You are dead`) within ±1 s of the
JSONL `ts`, disambiguated by pkill name; fallback = nearest log line by time. A and L
(GMCP-sourced, no text line) always use the time snap.

**Browser note.** One character per tab makes "per character" natural, but two tabs on the
same character must not both own a `current` run (use a Web Lock / BroadcastChannel per
character). Tab close / crash = orphan: flush on `pagehide`, seal orphans on next start for
that character. Since JSONL `ts` is whole seconds only because Lua `os.time()` was the
clock, the browser can store ms/µs timestamps and a direct `.log` line reference for kills and
deaths, removing the need for ADR 0135 content matching (keep content-match only if importing
old logs, which is a non-goal). Keep `schema` and additive-event discipline. Store runs as
IndexedDB records (`runs` store keyed `[character, runId]`, events as an array or a separate
store) rather than JSONL text; offer JSONL/`.log` as export formats.

### 7.3 Statistics frame

Two surfaces with the same layout (ADR 0073 accepted duplicated rendering): **popup →
Statistics** (live current run, 1 Hz refresh, `R` = refresh now) and **History → Stats**
(`history_detail`, archived chain, no tick). Popup row "Statistics" is shown only while a
character is known and a `current` run exists.

```
            ◆ STATISTICS — Rasta · Lvl 73 · Run 2h 14m · ★★★
ALLIES                                ▒  ACHIEVEMENTS                          ▒
♦ Kvällulv          ♦ Norsy           █  ★ That was a quick trip!              █
♦ Kuzzim            ♦ Taube           ▒  ↑ Reached level 74                    ▒
                                      ▒                                        ▒
KILLS            N ▼  XP/N  XP tot    ▒  PvPs                 N     XP ▼       ▒
────────────────────────────────────  ▒  ────────────────────────────────────  ▒
Thrakghash of the M…  1   5424  5424  █  ⚔ *a Half-Elf*       1     775        █
A bloodthirsty bat    4     56   224  ▒                                        ▒
Total               136        48.2k     Total                1     775
XP/h                                     TP/h
─────┬──────────────────────────────     ─────┬──────────────────────────────
 9.1k│   ▂▅█▃                             120│ ▁ ▃▆█▂
 4.6k│ ▁▆████▅▂ ▁                          60│▃█▅████▆▃
    0│██████████▇▃▁                         0│██████████▅▂
     └────────────────                        └────────────────
      00:00             2:14:00                00:00           2:14:00
         ▌◄▬▬▬▬ 48.2k XP ▬▬▬►▐
████████████████▓▓▓▓▓▓▓▓▓████████████████████████████████████
▌73                                                      74▐
```

| Part | Content / behaviour |
|---|---|
| Header | `◆ STATISTICS — <char> · Lvl N · Run <dur>` in `#5c5c5c`; `· ★★★` appended if saved with rating > 0; `· Run ended` appended if the run ended while open. Lvl derived from current XP vs XP table (follows death-penalty drops). History variant: `◆ Session details — <Char> · <Date> · <Time> · <Dur.>` |
| ALLIES | alphabetical union of all `group_changed.members` (minus self); `♦` `#00d7d7`; **two allies per row**, 3 visible rows (6 names), scrollbar in pair-rows |
| ACHIEVEMENTS | chronological merge of achievements `★` and level-ups `↑ Reached level N`, both `#ffd060`; 3 rows |
| KILLS | columns Mob · N · XP/N · XP tot; default sort `XP tot ▼`; grouped by mob name; rows `#909090`; sticky **Total** row bold `#b0b0b0` |
| PvPs | columns Player · N · XP; default `XP ▼`; `⚔` `#ff5f5f`; name wrapped `*Name the Race*`, truncation `…` inside asterisks |
| Sort | click a title-row label: same column toggles ▲/▼; new column uses type default (text asc, numbers desc); clicking KILLS/PvPs sorts by name; resets that table's scroll |
| Sizing | popup: KILLS/PvPs auto-fit to height (min 2), same row count both sides; History: data-fit, totals directly under data, hidden side total when count 0 |
| Sparklines | XP/h (green `#6fe060`, from kill+pkill XP) and TP/h (`#ffc847`, from `tp_gained`); width = table width − 7; 3 rows × 8 levels (`▁▂▃▄▅▆▇█`); y-labels max/half/0 (k-formatted); x-axis `00:00 … duration`; gains only (losses excluded) |
| XP ruler ("XP-linjal") | 84-wide bar: track `#1f1f1f` █, gained segment green; above it `▌◄▬▬ N XP ▬▬►▐` label (narrow → plain `N XP`); below it level boundaries `▌73 … 74▐`, range spans `level(min(start,now))`..`level(max)+1`. Net loss: band red `#e03c3c`, label `-N XP` |
| Focus | Tab/Shift+Tab over the 4 tables; focused title row turns gold `#ffaf00`, others section cyan `#008787`; click/wheel on a table focuses it |
| Keys | ↑/↓ scroll 1, PgUp/PgDn a page, Tab cycle, `R` refresh (popup), ESC back. Scrollbars: click-to-jump, no drag. History variant adds row hover (`C_ROW_HOVER`) |

**Data:** aggregation over the run chain's JSONL (ADR 0065): XP now = start + Σ kill/pkill
deltas + xp_loss; TP likewise; duration = last `ts` − first `ts`; `deaths` counted but not
shown as a section. Footer: `ESC Back · ↑↓ Scroll · Tab/Shift+Tab Switch table`.

**Browser note.** One renderer for both surfaces (no reason to duplicate). Live mode can
subscribe to the in-memory event stream instead of re-reading storage every second.

### 7.4 History browser

Main-menu entry **History** (start page). Lists **sessions** (stitched chains, § 7.2), never
the active run.

```
                         ─── History ───
              [ All ]  Gittan   Melker   Rasta
  RUN LOG   Char    Date ▼      Time   Dur.    Expires   Rating    ▲
  STATS     Rasta   2026-09-26  21:00  5h02m   13 days             █
  RATE      Rasta   2026-09-25  22:03  2h24m   Saved     ★★★★★     ▒
  SAVE      Gittan  2026-09-19  21:35  34m     6 days              ▒
  EXPORT
  DELETE
  BACK
                  Saved to ~/mume-Rasta-2026-09-25T22-03-02.html
  footer hints …
```

| Element | Behaviour |
|---|---|
| Filter pills | `All` + one pill per character with sealed runs (alphabetical). Moving the pill cursor (←/→ or click) filters immediately; resets to `All` on each open. Overflow: row windows by whole pills with `‹`/`›` in 2-cell edge slots; clicking an arrow pans one pill without moving the cursor |
| Button column (left) | RUN LOG, STATS, RATE, SAVE, EXPORT, DELETE, BACK; gold = cursor+focused, grey = cursor unfocused, hover brightens, disabled = dim text only; ↑/↓ skips disabled |
| Table columns | Char · Date · Time · Dur. · Expires · Rating. Header `#585858`; click header toggles sort, ` ▲`/` ▼` suffix; default `Date ▼` |
| Expires | `Saved` gold, else `<N> days` = ceil((oldest run start + 14 d − now)/1 d), floor 0 |
| Rating | N × `★` gold; blank when unsaved or 0. Sorting Expires/Rating keeps Saved grouped above numbers |
| Disabled rules | RUN LOG / EXPORT need a `.log` in the chain; SAVE disabled when saved; STATS/RATE/DELETE need a row; BACK always |
| Feedback row | under the table, ~3 s: `Saved to ~/<file>` gold, `Export failed: …` grey |
| Empty | `No runs recorded yet.`, only `All` pill, only BACK enabled |

**Keys:** Tab/Shift+Tab cycle filter → table → buttons; filter ↓/Enter enters table row 0;
table ↑ at row 0 returns to filter; table ← → buttons, buttons → → table; PgUp/PgDn 10,
Home/End; Enter/Space/click on a row with a log opens the **log player** directly; ESC back.
Wheel scrolls table only.

**Actions.**
- **Save** — writes a meta sidecar (rating 0) for **every run in the chain**; row flips to
  `Saved` immediately.
- **Rate** (`history_rate`) — title `─── Rate the session ───`, 5 stars gold `#ffd060` /
  grey; `0`–`5`, ←/→, click star N; Enter/Space saves (also saves an unsaved chain) and
  returns; ESC cancels. Initial = current rating or 0.
- **Delete** (`history_delete_confirm`, ADR 0075) — modal: title `─── Delete session ───`,
  Character/Date/Time/Duration/Runs, `Saved: yes — ★★★★★` in gold if saved, warnings
  `This will permanently delete the session's logs and run data.` / `This cannot be undone.`,
  footer `Y  Delete       Any other key  Cancel`. Saved sessions are deletable (the modal is the
  only guard). Removes `.jsonl/.log/.meta.json/.export.json` for all runs; cursor stays at the
  same index.
- **Stats** — `history_detail` (§ 7.3).
- **Export** — export editor (§ 7.7).

Chain-level saved/rating: `saved` = any run in chain has a saved meta; `rating` = max over
saved runs.

**Also in the popup — Exit confirmation (ADR 0119 → 0130).** Rating/saving the live run
happens in `Exit session`: `Rate & save this run (optional)` + star row + red warning
`Attention! This terminates the current session.`; keys `0-5`, ←→, `Y` exit, ESC cancel.
Anchor = active run, or when disconnected the most recent sealed run *that started during this
app session* (never an older one). `0` means **inherit** the chain's existing rating (re-saves
the whole chain so a continued session stays whole under retention); never un-saves, never
creates a save.

**Browser note.** "This app session" = this tab's lifetime (sessionStorage stamp). File
feedback `Saved to ~/…` becomes a browser download. All data comes from IndexedDB; list
building should read only run summaries (keep a per-run summary record so History doesn't
parse every run's events).

### 7.5 Log player (`log_view`)

Opened from History (RUN LOG / row). Replays the chain's `.log` files as one timeline.
Opens **playing from 00:00** with chrome visible.

```
Rasta (L73) · Run 1 of 2 · 2026-09-25 22:03                     ESC Back  ░░
…full-width replayed MUME text, ANSI colours…                              ░░
                                                                       K► ██  ← marker
…                                                                         ▄▄  ← gold playhead
                                                                          ▓▓
                                                  ┌────────────────────┐  ▓▓
                                                  │◄◄ Rewind  ▌▌ Pause │  ▓▓
                                                  │   12:04 / 78:34    │  ▓▓
                                                  └────────────────────┘  ▓▓
```

| Element | Look / behaviour |
|---|---|
| Canvas | log wraps at **full width**; chrome floats over it (no gutter/reflow when hidden). Inbound: 16-colour SGR + underline, bold brightens 30–37 → 90–97; 256/truecolour dropped. Outbound: shown without `>`, colour `#86a0a0` |
| Header | `<char> (L<lvl>) · Run X of Y · YYYY-MM-DD HH:MM` left, `ESC Back` right; name `C_BODY`, rest `#585858`; 80 cols centred |
| Strip (ADR 0121) | right edge, 2 cols, full height: played `#9a9a9a` above, remaining `#242424` below, **gold `#ffaf00` half-block playhead** (`▀`/`▄`, 2× vertical resolution). Click or drag anywhere on it seeks proportionally; bottom row = end |
| Markers | 5-col transparent layer left of strip; at event rows right-aligned letters `A D K L` + `►` (e.g. `K►`, `ADKL►`) in `#4d4d4d`; same offset→row mapping as the playhead; click seeks (mode-preserving) |
| Control box | framed `┌─┐` `#585858`, 8 cols in from right, 1 row up: `◄◄ Rewind`, `► Play` / `▌▌ Pause` (grey; gold reserved for playhead), clock `MM:SS / MM:SS` (minutes unbounded, `78:34`); hover `bold #dde4e0 on #242a27` |
| Auto-hide | header+strip+markers+box fade after **6 s** in play; always visible in pause; any key/mouse re-arms |
| Timing | real-time; gaps > **10 s** between lines collapse to 0 (so overnight chain gaps don't stall). Only 1x speed in the TUI player |
| End | auto-pauses parked on the last line |

**Modes & keys.**
- **Play**: view bottom-anchored at the playhead line. Wheel/click on text only re-shows chrome.
- **Pause**: full buffer scrollable; **cursor line** highlighted `bg:#303030` across full
  width. Resume (Space) always restarts from the cursor line's time.
- `Space` play/pause; `↑/↓` cursor ±1 line, `PgUp/PgDn` ±20, `Home/End` first/last — all
  auto-pause first. Pause: wheel moves cursor ±1, click on a line sets cursor (does not
  resume). `ESC` back to History with its state intact.

**Browser note.** Straightforward in DOM: render only a window of lines around the playhead
(Cockpit's HTML replay already does bottom-anchored windowing + `requestAnimationFrame`).
Parse `.log` chunks lazily; a 5 h run is ~100k lines / 4 MB — pre-parsing ANSI for all lines is
feasible but should be incremental. Consider adding the HTML replay's speed buttons to the
in-app player too (owner decision).

### 7.6 Spotlights reel and Credits

**Spotlights** (main menu, between History and Credits) — cross-character highlight reel
played in the same `log_view` engine (spotlight mode).

| Aspect | Behaviour |
|---|---|
| Events (ADR 0077) | `char_death`, `level_up`, `pkill`, `achievement` from **all characters'** sealed runs that have a `.log`; **one spotlight per event** (no merging) |
| Window (ADR 0079) | nominal `[event − 10 s, event + 5 s]`; pre-roll **trimmed forward** to the first log line in the window (no silent countdown); post-roll **never clamped** (dwells 5 s); events with zero lines in the window are dropped from the reel |
| Rotation | per-character queues newest-first; pick the queue whose head is most recent, but not the same character twice in a row if any other remains |
| Transitions (ADR 0078) | 100 zero-duration blank phantom lines inserted before each spotlight (and before the first) → the scene "scrolls clear" to blank; cursor skips phantoms in pause |
| Start | auto-plays; header/strip/box **hidden** on entry (mouse reveals), info box always visible |
| Header | `<CHAR>[ (L<lvl>)]  ·  SPOTLIGHT N / TOTAL  ·  YYYY-MM-DD`, hint `ESC Back · ←→ Prev/next` |
| Keys | all player keys, plus `→` next spotlight (no-op at last), `←` previous (restarts current if > 1.5 s in; restarts first at first) |
| End (ADR 0122) | parks paused on the last spotlight; does **not** roll into credits (ADR 0080 superseded) |
| Strip | covers the whole reel; markers across the reel |

**Info box** (30×7 + 1 countdown row, top-right `top=2`, 4 cols from right, background =
canvas, fully occluding; hidden if the terminal is too narrow):

```
┌────────────────────────────┐   frame #585858
│         ◄ 2 of 7 ►         │   arrows #c79a4a (clickable, hidden at ends), count #6f6f6f
│      RASTA: PvP kill       │   #8a8a8a  (types: PvP kill / Death / Level up / Achievement)
│                            │
│        *a Half-Elf*        │   label bold #dde4e0 (wraps to 2 lines, then …)
│                            │
└────────────────────────────┘
    ▐████████████████████▌        countdown bar #333333, drains symmetrically to the event
```

Labels: pkill `*Name the Race*`, death `Death (level N)`, level-up `Reached level N`,
achievement `Achievement: <text>`.

**Empty states** (`spotlights_empty` / `credits_empty`): title, centred body, `Any key to
return`. Variant `no_data` ("No spotlights yet. Play a session and your highlights — kills,
deaths, level-ups, and achievements — will be captured here, ready to replay.") vs `filtered`
(any toggle off: "All matching event kinds are disabled. Enable some in Options → Spotlights
to see content here.").

**Credits** (main menu, ADR 0122) — scrolling end-credits chronicle of **all** tracked events
(including the ones the reel drops), no log needed.
- Opening `Herein are recorded the deeds of your characters.`, chapters per character
  (oldest first) with deterministic headers (`The Chronicle of {name}`, `Wherein {name} Did
  Things of Variable Merit`, …), one sentence per event from per-kind templates chosen by a
  stable hash of (character, run, ts, kind) so the same event always reads the same
  (`On the first of May, 2026 you reduced *X* to a thoughtful silence.`), closing `The End.`
- Centred column `min(60, max(40, cols − 8))` wide; scroll **1 row/s** bottom-to-top; top and
  bottom 35 % fade linearly between canvas colour and white; `Escape to exit` hint top-right
  `#555555`; auto-returns to menu when `The End.` leaves the top. Only ESC is bound.

**Options → Spotlights** (`options_spotlights`): four `[X]`/`[ ]` rows — Achievements,
Deaths, Level-ups, PvP kills (all default on), `Back`; Enter/Space/click toggles; saved
globally (startup.conf). Filter applies to reel and credits. Note: plain mob kills are never
spotlights.

**Browser note.** Needs cross-character reads in one origin — fine, since IndexedDB is shared
across tabs; Spotlights/Credits are start-page features. Loading N × 15 s windows means
random access into raw logs by time → store `.log` in time-indexed chunks. Option toggles
are global settings (not per profile).

### 7.7 Export editor and HTML replay

History → **EXPORT** (needs a log) opens `export_editor` (ADR 0147).

```
                        ─── Export Editor ───
 Rasta (L73) · 2026-09-25 · 70098 lines · 3 excluded · 1 comments · → ~/mume-Rasta-….html
 EXCLUDE FROM HERE    ► ▌ [greyed excluded line]                           █
 ADD COMMENT            ▌ [greyed excluded line]                           ■
 EDIT COMMENT           ## This log happened in DT yesterday. Me and…      K
 DELETE COMMENT         Rasta flees head over heels.                       │
 FORMAT: HTML           …                                                  │
 TITLE                  ── end of log ──
 EXPORT
 BACK
 ▌ excluded
 ## comment
```

| Element | Behaviour |
|---|---|
| Info row | `<Char> (L<lvl>) · <date> · <N> lines · <M> excluded · <K> comments · → ~/<title>.<ext>` |
| Log | 3-cell gutter: `►` cursor (gold when focused), `▌` exclusion bar `#af5f5f`; excluded lines lose colour → flat `#4e4e4e`; comments `## …` `#ffd75f`; final `── end of log ──` row; cursor row `bg:#303030` |
| Map | 2-col overview: `■` comment, K/D/A/L markers gold, `█` excluded `#6f3030`, viewport thumb; click jumps cursor (centred) |
| Exclusion model | sorted half-open line ranges; `EXCLUDE FROM HERE` opens a range to the next range's end or end of log (merging); `STOP EXCLUDING` on an excluded line closes the range just above the cursor (on a range's first line: removes it) |
| Comments | inserted **before** the cursor line (after, if the cursor is on a comment); single paragraph, whitespace-collapsed, ≤ 600 chars, wrapped at 80 cols with every line prefixed `## ` |
| Input frame (`export_input`) | comment / title entry: printable + bracketed paste (newlines → spaces), Backspace, Ctrl+U clear, Enter save (empty comment = delete), ESC cancel; comment mode previews wrapped lines and hold time |
| Keys | ↑↓, PgUp/PgDn, Home/End, Tab/←→ switch focus, Enter/Space button, `X` exclude/stop, `C`/`E`/`D` add/edit/delete comment, `F` format, `T` title, `S` export, ESC back; wheel = 3 rows; click line/button/map |

**Persistence** — every edit saved to `<first-run-id>.export.json` (anchors are `.log` line
**µs timestamps**, not line numbers, so a chain growing later doesn't shift them; `null` =
end of log). Real file:

```json
{"schema":1,"title":"","format":"html",
 "excludes":[[1790366583498044,1790366584523797],[1790366584523797,1790366588023215],[1790366588023215,1790374016926083]],
 "comments":[{"before_ts":1790374016926083,"text":"This log happened in DT yesterday. …"}]}
```

**Export output.** File to `~/<title>.<ext>`; default title `mume-<char>-<first-run-id>`;
unsafe chars → `-`; never overwrites (`-2`, `-3`).
- **Text**: kept lines, timestamps / `> ` / ANSI stripped, comments as `## ` lines, blank line
  between stitched runs.
- **HTML**: one self-contained file = template + embedded JSON payload (lines pre-rendered to
  coloured spans identical to `log_view`, playback offsets, holds, markers). Replay features:
  - black canvas, Lucida Console 21 px (13 px ≤ 700 px wide; font not embedded), fg
    `#c0c0c0`, comments `#ffd75f`;
  - header: title (if set) · `char (Llvl)` · date; hint `Space Play · ↑↓ Scroll · 1–4 Speed ·
    F Fullscreen` (hidden < 1100 px);
  - right strip played/remaining + gold playhead, click/drag seek with `MM:SS` hover tooltip;
    marker `ADKL►` groups (tooltip lists events + times), click seeks;
  - control box: `◄◄ Rewind`, `► Play`/`▌▌ Pause`, speeds **0.25x/0.5x/0.75x/1x**, clock,
    `Fullscreen` / `Exit fullscreen`;
  - timing: gaps > 10 s → 0, excluded cuts → ≤ 0.5 s; **comments hold playback in real time**
    `2 s + len/15 s`, clamped **5–20 s**, independent of speed;
  - chrome auto-hides after 6 s in play (cursor hidden too); keys Space, ↑↓ ±1, PgUp/PgDn ±20
    (auto-pause), Home = rewind, End = last, `1`–`4` speed, `F` fullscreen; wheel/touch moves
    cursor (auto-pause on scroll up); click a line in pause sets cursor; replay restarts from
    top when played at end.

**Browser note.** The HTML replay is already browser code (behaviour reference only — rewrite,
don't copy). Output becomes a Blob download (`<title>.html` / `.txt`); "never overwrite" is the
browser's job. Sidecar → an IndexedDB record keyed by chain's first run-id. The in-app log
player and the exported replay could share one renderer in WebCockpit.

### 7.8 Retention and saved runs

| Aspect | Cockpit behaviour |
|---|---|
| Saved marker | `<run-id>.meta.json` = `{"schema":1,"saved":true,"rating":0..5,"saved_ts":<epoch>}` (real: `{"schema": 1, "saved": true, "rating": 5, "saved_ts": 1790375310}`); **file exists ⇔ saved**; atomic write (tmp + rename); active run's meta uses its computed run-id |
| Granularity | one sidecar per run, but every save/rate writes **all runs in the chain** |
| Rating | 0 = saved, unrated; chain rating shown = max (History) / most-recently-saved member (exit prefill) |
| Sweep (ADR 0074) | once per launcher start, before the menu; for every character: delete unsaved sealed runs older than **14 days** (from run-id timestamp) — `.jsonl`, `.log`, stray `.meta.json`, `.export.json`; also orphan metas/exports; never `current`; malformed meta = unsaved; errors silent |
| Un-save | not available; only History → Delete removes a saved run (ADR 0075) |
| Exit save | popup Exit: rating > 0 saves chain; 0 inherits (ADR 0130) |

**Browser note.** Run the sweep on app start (start page), guarded so only one tab sweeps
(Web Locks). IndexedDB storage can be evicted under pressure unless
`navigator.storage.persist()` is granted — request it, since saved runs are user data; show
usage via `navigator.storage.estimate()` somewhere (e.g. History footer). Compress raw logs
(≈ 5× smaller). Consider a "export all runs / import" backup path, since browser storage is
per-origin and lost with site data (import of Cockpit data is a non-goal; own backups are not).

## 8. GMCP usage

### 8.1 Negotiation
- Cockpit registers its GMCP handlers **before** the first server bytes. The
  lesson was that tt++ otherwise answers `DONT GMCP` by default (docs/gmcp.md
  §Negotiation). Browser: the telnet layer must answer `IAC WILL GMCP` with
  `IAC DO GMCP` immediately.
- On `IAC WILL GMCP` Cockpit sends, in order (ttpp/core/gmcp.tin):
  1. `IAC DO GMCP`
  2. `Core.Hello {"client":"Cockpit","version":"<VERSION>"}`
  3. `Core.Supports.Set ["Char 1","Comm.Channel 1","Event 1","Core 1","Group 1"]`
- `Core.Supports.Set` **replaces** the whole set, so one registry must build it
  (the "two-place sync" pain in docs/gmcp.md).
- Channel enable flow:
  1. The server auto-sends `Comm.Channel.List [{name,caption,command}]`.
  2. The client sends `Comm.Channel.Enable "<name>"` for **every** listed
     channel. Nothing is hardcoded.
  3. The server streams `Comm.Channel.Text`.
- Not sent by Cockpit: `Core.KeepAlive`, client `Core.Ping`, `Char.Login`, and
  anything `MUME.Client.*`.
- Received `Core.Ping` only sets `last_ping` (unused).
- WebCockpit baseline, from the MMapper research §7.5: add `Room 1`,
  `Room.Chars 1`, `MUME.Client 1`, then send
  `MUME.Client.XML {"enable":true,"silent":true}`. Also send a client
  `Core.Ping` (or `IAC NOP`) at under 45 s of idle as keep-alive (webcockpit
  ADR 0002).
- Pre-login the server already sends `Client.GUI` and `Client.Map` (Mudlet
  URLs); ignore them.

**Dispatch model (ADR 0046):** every packet has one primary writer that
updates state, then **always** emits an event to all subscribers. No handler
consumes a message exclusively. JSON `null` must stay distinct from "absent":
`{"climb":null}` means "off" (docs/gmcp.md §Null handling). Payloads can be an
object, array, string, bare integer (`Group.Remove 3`) or empty. Keys are
kebab-case. Debug aid: global trace plus a per-module/package whitelist trace
(ADR 0051), which maps naturally onto the planned GMCP editor/inspector.

### 8.2 Message → fields → consumer

| Module / message | Dir | Fields used | Consumer feature |
|---|---|---|---|
| Core.Hello | → | client, version | handshake |
| Core.Supports.Set | → | module list | handshake |
| Core.Goodbye | ← | reason (logged only) | **connection state → disconnected** (logout line, run end, menu auto-open, §9) |
| Core.Ping | ← | — | timestamp only (unused) |
| Char.Name | ← | name, fullname | **connection state → connected** ("<Name> logged in.", run start); per-character data load (affects, stored spells, charms, herblores, comm archive, timers); character pane header; **server prefs**: sends `change width all 500` and `change width table terminal` on every Char.Name |
| Char.StatusVars | ← | race, subrace, subclass, level, next-level-xp/tp, fullname, name | character pane (race drives the TP progress table); runs (level-up rows) |
| Char.Vitals | ← | xp, tp | character pane XP/TP progress bars + run XP/TP; `tp_gained`; kill XP attribution (runs/statistics); level derived from xp (StatusVars unreliable after death-level-drop) |
| Char.Vitals | ← | maxhp, wimpy | character pane wimpy gauge (maxhp is the denominator) |
| Char.Vitals | ← | mood, alertness, position, sneak, climb, ride, swim | character pane state cells (null→off) |
| Char.Vitals | ← | buffer, opponent, buffer-hits, opponent-hits | **group pane**: live mid-fight member HP band (matched by label/name tokens, accent-folded); identity cached from the fight-start packet; later packets carry only `*-hits` |
| Char.Vitals | ← | hp/mana/mp (+ `-string`), light, fog, weather, spell-effort, mount-moves, carrying, hidden | stored flat; no dedicated Cockpit consumer found (the MUME prompt shows them) |
| Comm.Channel.List | ← | name, caption, command | comm pane channel set; triggers Enable |
| Comm.Channel.Enable | → | channel name | — |
| Comm.Channel.Text | ← | channel, talker, talker-type (npc/ally/neutral/enemy), destination, text (ANSI kept) | **comm pane** + per-character comm archive |
| Group.Set / Add / Update / Remove | ← | id, type (you/ally/npc), name, label, hp/mana/mp (+`-string`), maxhp/maxmana/maxmp | **group pane**; run log composition rows. See rules below. |
| Event.Sun | ← | what: rise/set (light/dark ignored) | **clock** sync → day/night countdown in the input strip + character pane Time |
| Event.Darkness / Moon / Moved | ← | what / dir | stored only (Moved is key for a future map) |
| Event.Achieved | ← | what | runs (`achievement` row), UI pane "ACHIEVEMENT: Unlocked.", game pane `## ACHIEVEMENT: <text>` (ADR 0117; replaced a text trigger) |

Group rules for the table row above:
- Membership is **room-scoped**: `Group.Remove` means "not in this room", and
  ids are reassigned on re-add, so key members on label/name (ADR 0096).
- `label` is `0` or a string. Only NPCs with a non-empty label count as members
  (ADR 0094/0095, 0140).
- `Group.Update` is partial: a value and its band string can arrive separately,
  which needs freshness inference (ADR 0052).

Not used by Cockpit but relevant to WebCockpit: `Room.Info` (map), `Room.Chars`,
`MUME.Client.Edit/View/Write/CancelEdit` (remote editing of notes/mail; MMapper
used to own this), `MUME.Client.XML`, `Char.Login` (a GMCP password path used
by MMapper Web; consider it only as an option, since the plain text login works).

### 8.3 Text-trigger events (game text, not GMCP; the web client must reproduce them)
All are anchored `^…$` on clean text. `%1` is a capture. Priority matters where
patterns overlap: tt++ fires only one action per line, so pc_death (prio 3)
must win over mob_death (prio 4) (ADR 0115). **Browser note:** triggers should
fan out through one event bus so several consumers can react to the same line.
Cockpit's "one handler per pattern/event" collisions (ADR 0059, spellcast
ownership ADR 0123) disappear if the engine supports multiple subscribers.

| Event | Representative lines | Consumer |
|---|---|---|
| mob_death (living) | `^%1 is dead! R.I.P.$`, `^%1 has drawn his last breath! R.I.P.$`, `…her last breath! R.I.P.$` | runs/kill XP attribution (500 ms fold) |
| mob_death (undead) | `^%1 disappears into nothing.$` | same |
| pc_death | `^\*%1\* is dead! R.I.P.$` (+ his/her last breath) | runs pkills (`Name the Race` split) |
| char_death | `^You are dead! Sorry...$` | runs deaths |
| wimpy_changed | `^Wimpy removed.$`, `^Wimpy set to: %1$` | character pane wimpy |
| mume_time_line | `^%1 of the Third Age.$` (e.g. `8 am on Mersday, the 26th of Solmath, year 2973 of the Third Age.`) | clock sync |
| room_clock_line | `^The current time is %1.$` (`The current time is 2:31 am.`) | clock sync |
| affect_init / refresh / down | per-affect table (lua/core/affects_data.lua), e.g. `^You start glowing.$` / `^Your aura glows more intensely.$` / `^The white aura around your body fades.$`; `^You feel protected.$` | timers pane affects |
| affects_observed / stored_spells_observed | header `^Affected by:$` (stat) or `^You are subjected to the following temporary effects:$` (info), then `- <name>` lines until a non-`- ` line; `- stored spell <x>` split off | affects + stored spells reconcile |
| user_cast | `^[cast '%1'` / `^[cast <speed> '%1'` (MUME echo of casts incl. server aliases) | stored spells last-cast intent |
| spell_cast_started | `^You start to concentrate...$`, `^You muster all of your concentration...$` | charm gating |
| spell_cast_recalled | `^You quickly recall your stored spell...$` | stored spells, charm |
| spell_cast_failed | `^Argh! You cannot concentrate any more...$`, `^Nah... You feel too relaxed to do that.$`, `^In your dreams, or what?$`, `^Alas, not enough mana flows through you...$`, `^Your spell backfired!$`, `^Nothing seems to happen.$`, `^You flee %1.$`, `^You are too afraid.$`; also `^Nobody here by that name.$` (drops the front of the cast queue) | shared cast FIFO (blinds/charm), stored spells |
| store_* | `^You stored it.$`, `^Your mind feels empty for a while.$`, `^You blast the area with magical energies.$`, `^%1 blasts the area with magical energies.$`, fails: `^Your mind is too full to store it.$`, `^You failed.$`, `^You do not know any such a spell.$`, `^You can cast quickly, fast, normally, carefully, or thoroughly.$` | stored spells timers |
| blinds | `^%1 seems to be blinded!$`, fail `^Your victim is already blind.$` | timers pane blinds |
| charm | `^%1 starts following you.$` (prio 4), `^Your control on %1 is renewed!$`, fail `^%1 seems to be ruled by powers other than yours...$`, `^A wood elf leaves and vanishes into the distance.$` | timers pane charms |

Input-derived (not game text): `user_input` (each sent line; parsed for
`cast 'store' X`, blindness and charm casts) and `user_input_empty` (Enter on an
empty line = cast abort). Browser: emit both from the input/send path; no
telnet echo is involved.

Lesson (ADR 0050, 0144): trigger work must stay cheap and synchronous per line.
Server-side `change width all 500` exists so that lines never wrap mid-pattern.
Keep sending it, and have the client wrap visually itself.

### 8.4 What MMapper used to do that the browser client now owns
(notes/research/mmapper-integration.md §1.2, §5, §7)
- **Transport and telnet:** TLS/WebSocket to MUME. WebCockpit does telnet
  itself: IAC parsing, GMCP, CHARSET (UTF-8, answer the server's own REQUEST),
  NAWS, TTYPE, MSSP, MCCP2 (optional, `DecompressionStream`), GA prompt
  boundaries, and a keep-alive under 45 s.
- **NAWS:** tt++ reported the game pane size. `change width table terminal`
  depends on it, so the browser must send NAWS from the game pane's cols×rows
  and resend on resize.
- **Telnet ECHO (password masking):** tt++ honoured the server's echo-off during
  the password prompt. The browser input must mask and not store the password
  in history. *Verify the exact MUME signal at the password prompt.*
- **Extra GMCP modules:** MMapper merged `Room`, `Room.Chars`, `MUME.Client`
  into Supports.Set and hid all `MUME.Client.*` from the client. Direct-mode
  Cockpit never got `Room.*`. WebCockpit subscribes to these itself.
- **XML mode:** Cockpit never saw XML. MMapper enabled it and stripped the tags.
  WebCockpit must enable it (`MUME.Client.XML`), strip tags, decode
  `&lt; &gt; &amp;`, and keep tag metadata. Triggers match clean text.
- **Remote edit:** `MUME.Client.Edit/View` → an editor, answered with
  `MUME.Client.Write/CancelEdit`.
- **`_`-commands** (`_connect`, `_disconnect`): gone. The MMapper disconnect
  text `Status: MUME closed the connection.` is gone as a signal too.

## 9. Session lifecycle

### 9.1 Connect
- **Connection modes** in Cockpit (launcher Options → Connection):

  | Mode | Target | Transport |
  |---|---|---|
  | MMapper (default) | `localhost:4242` | plain telnet |
  | Direct | `mume.org:4242` | TLS |
  | Custom | host/port input (port 1–65535) | plain |

  Browser: **only** `wss://mume.org/ws-play/` exists (subprotocol `binary`;
  webcockpit ADR 0002). The Connection options page shrinks to nothing, or at
  most an advanced override URL. Decide in the spec.
  "MMapper mode" and its `_disconnect`/`_connect` workarounds do not carry over.
- **Flow:** launcher (start page) → "Enter MUME" → cockpit layout → welcome
  screen → **auto-connect** (ttpp/core/welcome.tin):
  1. Clear scrollback.
  2. Print the static white block-glyph wordmark `MUME` / `COCKPIT` (no
     starfield, no animation; ADR 0100).
  3. Print `Welcome to MUME Cockpit.`, `Press <Esc> for menu.`,
     `Connecting to MUME...`, and open the connection.
  4. The UI pane shows `Connecting to MUME...`.
- Startup readiness gate: auto-connect waits for the Lua brain's ready signal,
  with a 10 s fallback. Browser: connect once the JS modules are initialised;
  no gate is needed.
- **Login** is MUME's normal in-band text flow (name, password, menu). Cockpit
  has **no auto-login** and does not use `Char.Login`. The profile is not the
  character: the profile file is chosen on the start page and the character
  comes from `Char.Name` after login.
- **One game session only:** a second session is refused with
  `[SYSTEM] WARNING: only one game session allowed -- closing <name>`. Browser:
  one character per tab by intent. Multiple tabs are the player's business,
  though two tabs sharing one profile in IndexedDB need a write policy.

### 9.2 Connection-state detection (ADR 0003)
- **Connected** is driven by **GMCP `Char.Name`** (after login), not by the
  socket opening.
- **Disconnected** is driven by **`Core.Goodbye`** (graceful `quit`), with a
  fallback on socket close.
- Transitions are idempotent. A single dispatch point dedups several signals
  for the same drop.
- **Bootstrap window:** between socket open and `Char.Name` (login screen), the
  state is "disconnected". The menu shows Reconnect and **no** menu auto-open
  fires then.
- On **connected**:
  - UI line `<Name> logged in.`
  - `run_started`: a new run begins, and an orphaned previous run is sealed.
  - Per-character persisted state loads.
  - The data panes (character, timers, group, comm) render. They are blank /
    inactive while disconnected (ADR 0051 inactive content blanked).
- On **disconnected**, in order:
  1. UI line `<Name> logged out.`
  2. **Menu auto-open** (unless already open, or a user reconnect is in
     progress).
  3. `run_ending`: the run is sealed.
  4. Run and character state reset, and panes blank.
- On socket close: `Connection to MUME closed.` plus
  `[SYSTEM] Session <x> disconnected -- returning to gts`. The second message is
  a tt++ artefact; drop it.
- **Silent disconnect (half-open TCP) is not detected** by Cockpit. The player
  uses ESC → Reconnect. Browser: a keep-alive `Core.Ping` with a reply timeout
  could detect it, but the ADRs rejected active probing only for Cockpit's
  popup. Decide in the spec.
- Browser simplification: the socket *is* the MUME link, so ADR 0003's
  "socket up but MUME gone" split mostly collapses. Keep `Char.Name`/Goodbye
  semantics for "logged in" (login screen ≠ playing).

### 9.3 Reconnect UX (ADR 0058; docs/popup-menu.md)
- ESC menu top items depend on state:

  | State | Items | Pre-selected |
  |---|---|---|
  | Connected | **Continue**, **Reconnect** | Continue |
  | Disconnected | **Reconnect** only | Reconnect |

  Reconnect is offered while connected because a half-open link looks
  connected.
- `reconnect` is also an input-line alias. Direct mode drops the session, waits
  **1 s**, then connects again.
- A user-initiated reconnect suppresses the menu auto-open once. This is a
  single-shot flag; the next real disconnect opens the menu normally.
- On a real disconnect the menu opens by itself with Reconnect highlighted:
  press Enter to reconnect.
- The menu is never opened twice.
- Browser: same UX, no sentinel files. Close the WebSocket, open a new one, and
  flag the transient close as user-initiated. Whether the 1 s delay is still
  needed without MMapper is an implementation detail.

### 9.4 Link / latency display (ADR 0001; docs/bridge-services.md)
- The in-game menu status header shows
  `Profile: default  ·  MMapper  ·  Link: 38ms (stable)` in muted hint grey.
  It refreshes 1×/s while the menu is open.
- Cockpit measures with an **ICMP ping to mume.org once per second**, from a
  background monitor that lives for the whole session. It keeps a 60-sample
  ring, so there is no warm-up when the menu opens.
- Quality label from p95−p50 spread and loss over the 60 samples:

  | Label | Spread (ms) | Loss | Colour |
  |---|---|---|---|
  | stable | < 8 | 0 % | hint grey `#585858` |
  | ok | < 20 | < 5 % | hint grey |
  | jittery | < 50 | < 15 % | bold `#ffd75f` |
  | spiking | < 120 | < 30 % | yellow |
  | poor | otherwise | otherwise | bold `#ff5f5f` |
  | dead | any | ≥ 80 % | red |

  With fewer than 10 samples there is no label. If the current sample timed
  out, `timeout` shows in red.
- Browser: ICMP is impossible. Measure application RTT with **GMCP
  `Core.Ping`** (the client sends it and MUME answers `Core.Ping`) on the same
  1 s or slower cadence, starting at connect. This doubles as the keep-alive.
  The measurement includes the WS gateway. The "Mode" field becomes a fixed
  label or disappears.

### 9.5 Save points (ADR 0060 → 0061 → 0063 → 0064)
- Cockpit saves the tt++ profile class to disk at every exit path while the
  session is still alive:
  - `cp -s` / the menu Save button;
  - `cp -e` (exit);
  - session deactivation (covers drop and `#zap`);
  - the MMapper disconnect text.
- A `_profile_loaded` guard prevents a failed connect from **overwriting the
  profile with an empty one** (ADR 0063).
- Not covered in Cockpit: crash, SIGKILL or terminal close. Periodic autosave
  was parked.
- Browser:
  - Save profile edits **when they happen** (IndexedDB) rather than on
    disconnect. Most of this ADR chain then disappears.
  - Keep the lesson: never persist an empty or unloaded profile over a good
    one.
  - Run logs, comm archive and per-character timers should be written
    incrementally, because **tab close = disconnect with no clean shutdown
    hook**. `beforeunload`/`pagehide` are best-effort only; no async IndexedDB
    work is guaranteed to finish.
  - A run sealed "on next start" (as Cockpit does for orphaned `current.jsonl`
    on `run_started`) is the robust pattern.

### 9.6 Exit (ADR 0119 → 0130)
- ESC menu → **Exit session** opens a confirmation frame:
  ```
  ─── Exit session ───

   Rate & save this run (optional)      (C_HINT #585858)
            ★ ★ ★ ☆ ☆                   (set stars #ffd060, rest #585858)

  Attention! This terminates the current session.   (bold #ff5f5f)
  0-5 Rate · ←→ Adjust · Y Exit · ESC Cancel
  ```
- Keys:
  - `0`–`5` set the rating, and ←/→ adjust it. Clicking star N sets N.
  - **`Y` commits** (not Enter, as deliberate friction).
  - ESC cancels.
- The rating targets the **latest run of this client session**:
  - Connected: the active run.
  - Disconnected: the newest sealed run that started after this session's
    launch stamp.
  - If there is no such run, a plain Y/ESC confirmation is shown without stars.
- Rating semantics:
  - The rating is pre-filled from the chain's existing rating.
  - `0` inherits the existing chain rating; it never un-saves and never creates
    a save.
  - `>0` saves the whole continued-session chain.
- On `Y`, in order:
  1. Save the rating.
  2. Save the profile.
  3. Show `[COCKPIT] Goodbye. Shutting down client...`
  4. Close the connection.
  5. Return to the **launcher/start page** (Cockpit's return-to-menu
     sentinel).
- Browser: exit returns to the start page inside the same tab (close the socket
  first). A "session start" stamp is just an in-memory timestamp.

### 9.7 What changes in the browser (summary)

| Cockpit | WebCockpit |
|---|---|
| tmux session survives a closed terminal; launcher offers **Resume / Mirror / Fresh start** (ADR 0128) | No detached session. **Closing or reloading the tab = disconnect.** Resume/Mirror/Fresh start disappear. Consider a `beforeunload` "leave page?" prompt while logged in (PvP safety), as a spec decision. |
| MMapper/Direct/Custom modes | one WSS endpoint |
| GMCP + MMapper text + tt++ SESSION events for disconnect | GMCP `Char.Name`/`Core.Goodbye` + WebSocket `close`/`error` |
| ICMP ping monitor process | GMCP `Core.Ping` RTT, which is also the < 45 s keep-alive |
| Save on disconnect hooks | save continuously; `pagehide` best-effort |
| Stale-sentinel cleanup on start (`.popup_open`, `.user_reconnecting`, `.return_to_menu`) | in-memory flags; nothing to clean |
| Laptop suspend → half-open TCP (undetected) | browsers usually fire `close` after resume, but not always. Use a ping timeout plus `visibilitychange`/`online` events to offer Reconnect. |
| Login typed at MUME prompt | same; ensure password masking and no history capture |

## 10. Visual design system

Everything is designed as a **character grid on a dark canvas**. Colour roles
are few and consistent: cyan for titles and branding, amber/gold for focus
and cursor, grey levels for hierarchy, green for "on/OK", muted red for
errors. Sources: bridge/launcher/palette.py, menu_chrome.py,
launcher_banner.py, bridge/panes/pane_frame.py, docs/launcher.md rendering
sections, docs/pane-frame.md, docs/ui-messaging.md, install/examples/foot.ini,
docs/img/export-editor.png, ADRs 0085, 0087, 0099, 0100, 0108, 0134, 0136,
0138, 0143, 0145.

### 10.1 Font and grid

| Token | Value | Notes |
|---|---|---|
| `--font-mono` | `"DejaVu Sans Mono", monospace` | The shipped foot.ini uses `font=DejaVu Sans Mono:size=15`. The export-editor screenshot looks like a different mono (JetBrains-Mono-like), so the font is user-choosable (Terminal settings: any installed monospace family, size **6–32**, default 15) |
| `--font-size` | 15px (user 6–32) | |
| `--pad` | 0 (user 0–40, step 2) | foot `pad` |
| Min grid | 60 cols × 18 rows | Below this: a centred "Terminal too small" screen that swallows keys |
| Glyph needs | box drawing `─│┌┐└┘`, half-blocks `▀▄▌▐`, quadrants `▛▜▙▟`, full `█`, shade `░`, `·◦✦✧`, `◄►▲▼`, `⚔♦★✓●◆▶⚠✖` | Cockpit checks quadrant coverage in the font and falls back to `█` corners. **Browser note:** use a web font with full coverage (or bundle one) so the fallback is never needed; box and block glyphs must tile seamlessly (line-height = cell height, no letter-spacing) |

- Everything is laid out in whole character cells.
- Widths quoted in this document are **cells**.
- The browser should render on a fixed cell grid (for example CSS `ch`
  units or a measured cell size).
- Text is never proportional.

### 10.2 Terminal palette (foot.ini, "DOS palette")

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| `--ansi-0` black | `#000000` | | `--ansi-8` bright black | `#808080` |
| `--ansi-1` red | `#800000` | | `--ansi-9` bright red | `#FF0000` |
| `--ansi-2` green | `#008000` | | `--ansi-10` bright green | `#00FF00` |
| `--ansi-3` yellow | `#808000` | | `--ansi-11` bright yellow | `#FFFF00` |
| `--ansi-4` blue | `#000080` | | `--ansi-12` bright blue | `#0000FF` |
| `--ansi-5` magenta | `#800080` | | `--ansi-13` bright magenta | `#FF00FF` |
| `--ansi-6` cyan | `#008080` | | `--ansi-14` bright cyan | `#00FFFF` |
| `--ansi-7` white | `#C0C0C0` | | `--ansi-15` bright white | `#FFFFFF` |
| `--term-fg` | `#C0C0C0` | | `--term-bg` | `#000000` |

- The launcher never changes the ANSI 16. It only changes foreground and
  background.
- **Font colour presets** (`TERMINAL_FG`):

  | Name | Hex |
  |---|---|
  | sage | `#778A8D` |
  | silver | `#C0C0C0` (default) |
  | ash | `#A0A0A0` |
  | stone | `#808080` |
  | shadow | `#606060` |
  | ink | `#000000` |

- **Background presets** (`TERMINAL_BG_ORDER`):

  | Name | Hex |
  |---|---|
  | black | `#000000` |
  | red | `#1A0E0E` |
  | green | `#0E1A0E` |
  | blue | `#0E141C` |
  | grey | `#161616` |
  | orange | `#1C140A` |
  | purple | `#16101C` |
  | teal | `#002B36` |
  | sepia | `#2B1B12` |
  | slate | `#1C2128` |
  | paper | `#F4ECD8` |

  - `paper` is off-white on purpose; pure white broke chrome that assumes a
    dark background (ADR 0143).
  - An off-palette value is kept and shown as its hex.
  - Foreground and background can be combined freely.
- **Terminal settings page:** a live preview box (a room description with a
  green room name) appears while the foreground or background differs from
  the saved value.
- **Cursor** (foot `[cursor]`): the default is **beam, blinking**. Options
  are `block`/`beam`/`underline` and blink on/off. Tokens: `--cursor-style`,
  `--cursor-blink`.
- **Transparency** was removed (ADR 0108).
- **Browser note:**
  - The foot relaunch/apply flow (sentinel files, supervisor) disappears;
    changes apply live.
  - Window mode and pixel size are irrelevant.
  - OSC 11 background detection (ADR 0099) disappears: the page *knows* its
    own `--term-bg`. Every "derived from terminal bg" rule below simply
    reads that token.

### 10.3 UI colour tokens (palette.py)

| Token | CSS value | Use |
|---|---|---|
| `C_TITLE` | bold `#00d7d7` | Page banner/heading text, About headings |
| `C_SECTION` | bold `#008787` | **Sub-page titles** `─── Name ───`, section headers |
| `C_HEADER` | bold `#ffd060` | Gold `◆ STATISTICS` banner only |
| `C_ACTIVE` | bold `#ffffff` | Selected row label, emphasis |
| `C_ITEM` | `#bcbcbc` | Normal selectable rows; editor base text |
| `C_HOVER` | `#dadada` | Mouse hover (foreground only) |
| `C_BODY` | `#8a8a8a` | Prose/body text |
| `C_HINT` / `C_DIVIDER` | `#585858` | Footers, headers, labels, dividers, unfocused borders, scrollbar track, line numbers |
| `C_PANE_OFF` | `#3a3a3a` | Disabled row, one step below hint |
| `C_ACCENT` | bold `#ffaf00` | Call-to-action, focused field border, success flash (`Saved…`, `Copied`) |
| `C_CURSOR_CELL` | bold `#ffaf00` | Gold `<< >>` arrows and focused `[ ]` brackets |
| `C_YELLOW` | bold `#ffd75f` | Warnings |
| `C_ERR` | bold `#ff5f5f` | Hard errors |
| `C_DANGER` | `#a04030` | Inline validation errors (muted red) |
| `C_OK` | bold `#7ac46f` | Persistent "active/selected" marker (✓), never gold |
| `C_NOTE` | `#b8923c` | Advisory/read-only notes (dark gold) |
| `C_QUOTE` | italic `#8a8a8a` | Main-page quote |
| `C_QUOTE_ATTR` | `#87af87` | Quote attribution |
| `C_SELECTED` | `#000000` on `#bcbcbc` | Table cursor row, text selection band |
| `C_BUTTON_INACTIVE` | `#bcbcbc`, no bg | Button, idle |
| `C_BUTTON_ACTIVE_UNFOCUSED` | `#000000` on `#bcbcbc` | Selected, zone unfocused |
| `C_BUTTON_ACTIVE_FOCUSED` | `#000000` on `#ffaf00` | Selected, zone focused |
| `C_BUTTON_DISABLED` | `#585858`, no bg | Disabled button |
| `C_BUTTON` / `C_BUTTON_HOVER` | `#bcbcbc` on `#1a1a1a` / `#2a2a2a` | Legacy popup widgets only. Don't adopt |
| Scrollbar | thumb `█` bold `#ffffff`; track `░` `#585858` | Shared scrollbar widget. Statistics uses thumb `#707070`, track `#1f1f1f` |
| `C_SYN_*` | see §5.7 | Editor syntax |
| `C_LOG_*`, `C_EXPORT_*`, `C_SPOTLIGHT_*`, `_S_*` | see the log player, export and statistics sections | Feature palettes (for example export: excluded `#4e4e4e`, excluded mark `#af5f5f`, `## ` comment `#ffd75f`) |

- `C_ROW_HOVER` is listed in docs/launcher.md but is not defined in
  palette.py; it is a stale doc row.
- **UI-messages pane colours** (docs/ui-messaging.md, truecolour in the
  text itself):

  | Prefix | Hex |
  |---|---|
  | `▶ SCRIPT` | `#26C6DA` |
  | `● SYSTEM` | `#42A5F5` |
  | `⚠ WARN` | `#FFB300` |
  | `✖ ERROR` | `#E53935` |
  | `◆ SPELL` | `#7AA9D6` |
  | `◆ BUFF` | `#8FBC8F` |
  | `◆ DEBUFF` | `#C97070` |
  | `◆ STORE` | `#B39DDB` |
  | `◆ BLIND` | `#00CCCC` |
  | `◆ CHARM` | `#B388FF` |
  | `◆ HERB` | `#9CCC65` |
  | dynamic values | bold `#FFEE58` |

  Message text is bold bright white.
- **Timers group swatches:**

  | Name | Hex |
  |---|---|
  | Blue | `#66b2ff` |
  | Green | `#00d900` |
  | Red | `#d90000` |
  | Magenta | `#ff66ff` |
  | Cyan | `#00cccc` |
  | Violet | `#B388FF` |
  | Orange | `#ff9933` |

### 10.4 Pane backgrounds and frames

**Pane tints** (`PANE_COLORS`; the stored name is `black`, shown to the user
as "None"):

| Name | Fill | Border (fill + 0x14/channel) | Shade (h, s) |
|---|---|---|---|
| None / black | terminal bg | term bg + 0x14, floored at HSL L16 (≈ `#292929` on black) | from term bg (grey on black) |
| red | `#1A0E0E` | `#2e2222` | (2, 60) |
| green | `#0E1A0E` | `#222e22` | (130, 42) |
| blue | `#0E141C` | `#222830` | (210, 58) |
| grey | `#161616` | `#2a2a2a` | (0, 0) |
| orange | `#1C140A` | `#30281e` | (28, 62) |
| purple | `#16101C` | `#2a2430` | (278, 46) |

**In-pane frame** (ADR 0136, per-pane toggle, default on):

```
▛▀▀ Character ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▜      corners ▛▜▙▟ (or █ █ █ █ fallback)
▌ content (inner = w-2, h-2)     ▐      edges: top ▀, bottom ▄, left ▌, right ▐
▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟
```

- **Glyphs:** foreground only, so the pane fill shows through. The label is
  left-aligned on the top edge after `▀▀ `.
- **Labels:** `Character`, `Timers`, `Group`, `Comm`, `UI`. The dev pane is
  never framed.
- **Colour:** the border colour is also exposed so a pane can tint labels
  inside its content to match.
- **Corner style setting:** Auto / Quadrant / Block.
- **Browser note:** the half-block frame is pure glyph art and ports as-is
  in a monospace grid. Alternatively use CSS borders, but then the look
  drifts from "very close".

**Shade ramp** (`pane_shades`, ADR 0138): one hue (the pane's h,s) walked
down HSL lightness. Each value is L then Δsat.

| Role | Dark ramp (L, Δs) | Light ramp (L, Δs) | Used for |
|---|---|---|---|
| track | 15, −8 | 80, −10 | Bar background, inactive tick, toggle off-box |
| dim | 27, 0 | 55, −6 | Gauge labels, XP gain bg |
| mid | 42, 0 | 40, −4 | TP gain fg |
| paneBg | 8, 0 | 25, −2 | Near-bg text on boxes, tick bg |
| vtext | 72, −30 | 22, −18 | Gauge value text |
| label | 60, −22 | 34, −14 | Level badge, player name |
| glow | 64, −18 | 60, 0 | Active tick, wimpy caret, toggle on-box |

### 10.5 Light-background theming (ADR 0145)

- **The light/dark decision uses the pane's own effective bg** (its fill, or
  the terminal bg if it has none), never the terminal bg alone. A pane is
  light when HSL **L > 58**.
- **Re-resolve every frame.** Pane colours change live; caching this
  decision caused stale panes.
- **Transforms** (each moves toward a target and never overshoots):

  | Transform | Rule | Use |
  |---|---|---|
  | `light_shift(c, Lmax=45, Smin=55)` | cap L, floor S; achromatic (S<10) unchanged | coloured **text** on paper |
  | `washout(c, L=70, s×0.45)` | pastel | dark saturated **fills** (group HP/mana/move bars; threshold red/orange stay vivid) |
  | `dark_ink(bg, L=40, s×0.85)` | faded ink tinted to the bg | base text replacing bright white (UI pane, input clock) |
  | border on light | same (h,s) as the pane at L=80 (`BORDER_L_LIGHT`) | frame |

- **Recolour at display time.** Stored logs keep canonical colours; the
  renderer remaps them to the theme.
- **Editor current-line band:** terminal bg lifted 12% toward white (dark
  theme) or toward black (light theme).
- **Browser note:**
  - Implement as CSS custom properties recomputed from `--term-bg` and the
    per-pane `--pane-bg`.
  - For example `data-light` attributes per pane, plus JS helpers for the
    HSL transforms, or `color-mix()`/relative colour syntax where it
    suffices.
  - Chrome tokens in 10.3 assume a dark canvas. `paper` is the only light
    preset and the least polished path in Cockpit.

### 10.6 Chrome grammar

**Title block** (`title_block`):

- 2 blank rows (1 in the popup), then a centred `─── Title ───` in
  C_SECTION, then 1 blank row.
- The dashes are part of the title text (`───` U+2500 ×3 each side).
- The screenshot shows the same pattern: `── Export Editor ──`, teal.

**Footer block** (`footer_block`):

- Centred C_HINT text on the **last row**.
- Tokens are joined by ` · `, as in
  `↑↓ Move · X Exclude/Stop · C Comment · … · ESC Back`: the key comes
  first, then the verb.
- The footer position never shifts between sibling pages.

**Menu rows** (`menu_row`, ADR 0087): these are vertical menus.

- The layout is `<< label >>`: a 3-cell prefix `<< ` or three spaces, then
  the label, then a 3-cell suffix ` >>` or three spaces. So the label never
  moves between states.

  | State | Arrows | Label |
  |---|---|---|
  | selected | gold (C_CURSOR_CELL) | C_ACTIVE (bold white) |
  | hover | blank | C_HOVER |
  | inactive | blank | C_ITEM (or C_HINT for dimmed) |

- Selection wins over hover.
- **Alignment:**
  - Plain rows are each centred on their own width (ragged-centred).
  - Rows with a leading `[X]`/`[ ]`/`(•)`/`( )` glyph left-align in one
    centred block so the glyphs stack.
  - `Back` is always centred on its own.
- The glyph carries the on/off state; colour is reserved for cursor and
  hover.

**Filled buttons** (`button_fragment`, ADR 0134): a label centred in a fixed
width.

| State | Style |
|---|---|
| inactive | `#bcbcbc`, no fill |
| hover | `#dadada`, no fill |
| selected_unfocused | black on `#bcbcbc` |
| selected_focused | black on `#ffaf00` |
| disabled | `#585858` |

- **Rule:** a fill means *selected*, foreground brightening means *pointer*.
- **Used by:** the Profile/History option columns, the profile-editor kind
  row and toggle, and the font picker.
- **Screenshot:** the export editor shows uppercase button labels
  (`EXCLUDE FROM HERE`, `ADD COMMENT`, …). The selected one is a grey fill;
  the unavailable ones are dim.

**Swatch/checkbox cells:**

- `[X]██` / `[ ]██`. The cursor paints the brackets gold, and the swatch
  keeps its own colour.
- Gold or nothing; there is no unfocused marker.

**Hover-clear invariant:** every non-row cell (title, footer, padding,
blanks) clears hover, so a highlight never sticks. In a browser this is
`mouseleave` on rows plus hover only on row elements; CSS `:hover` gives it
for free.

**Boxes:**

- Thin single-line `┌─┐│└┘`: grey `#585858` for floating boxes, C_HINT or
  C_ACCENT for input fields.
- Floating overlays (the log-player control box, the spotlight box) fill
  every cell with the terminal bg so they hide what is behind them.

### 10.7 Banner (starfield + wordmark, ADR 0100)

- **Size and structure:** 45 cells × 11 rows: 5 starfield rows, then `MUME`
  (3 rows), then `COCKPIT` (3 rows). There is no separator row. The banner
  is centred, anchored to the top of the main page, and also shown in the
  in-game ESC popup.

  ```
  MUME   (#00d0d0)             COCKPIT (#0a9a9c)
  █▄ ▄█ █   █ █▄ ▄█ █▀▀▀       ▄▀▀▀▄ ▄▀▀▀▄ ▄▀▀▀▄ █ ▄▀  █▀▀▀▄ ▀█▀ ▀▀█▀▀
  █ █ █ █   █ █ █ █ █▀▀        █     █   █ █     █▀▄   █▀▀▀   █    █
  █   █ ▀▄▄▄▀ █   █ █▄▄▄       ▀▄▄▄▀ ▀▄▄▄▀ ▀▄▄▄▀ █  ▀▄ █     ▄█▄   █
  ```

  (In the real banner the two wordmarks are stacked, each centred in the 45
  cells.)

- **Stars:** `(row, col, glyph, tier)`:
  - Row 0: (0,8 ✧ BRIGHT), (0,22 ✧ MID), (0,35 · DIM), (0,41 · DIM).
  - Row 1: (1,3 · DIM), (1,19 · DIM), (1,27 ◦ MID).
  - Row 2: (2,0 ◦ DIM), (2,14 · MID), (2,33 · DIM).
  - Row 4: (4,9 · DIM), (4,31 ◦ DIM).
  - Row 5: (5,5 · DIM).
- **Tier colours:** DIM `#1f595b`, MID `#2f9092`, BRIGHT `#74e8e8`.
- **Twinkle:**
  - Each free star has a random period of 12–32 s and a random phase. It
    goes up or down one tier briefly when a sine wave passes 0.82.
  - `✦`/`✧` use a 5× slower period and swap glyph at the bright peak.
  - Stars inside a wordmark span stay static.
  - It redraws at 12 Hz in the launcher and 6 Hz in the popup, only while
    the main page is visible.
- **Responsive:** the banner is dropped when there is not room for the
  banner plus 2 rows *and* the menu, quote and footer. The menu always wins.
- **Browser note:** render it as text in spans. Animate with
  `requestAnimationFrame` or a CSS animation, and pause it when hidden.

### 10.8 Other visual conventions

- **Selection band and cursor row:**
  - C_SELECTED is black on `#bcbcbc`.
  - The log-player pause cursor is bg `#303030`.
  - The export editor's cursor row is a dark grey full-width band with a
    gold `►` in the gutter (screenshot).
- **Divider headers:** `─── Hint ───`, `── Text ──`. These are C_HINT
  box-drawing dashes around a label.
- **Flash messages:** a transient one-line message in C_ACCENT (success) or
  C_HINT/C_DANGER (failure), placed on the feedback row or in the footer
  slot. It clears after ~1.5–2 s.
- **No animation** anywhere except the banner twinkle and click-and-hold
  auto-scroll. This matches intent goal 1 (no smooth scrolling).
- **tmux divider rows** were painted in the terminal bg so they are
  invisible (ADR 0099). **Browser note:** pane gaps should use the page bg,
  with no visible splitter chrome except the in-pane frames.

### 10.9 Suggested CSS token list

```
--font-mono  --font-size  --cell-w  --cell-h  --pad
--term-bg #000000  --term-fg #C0C0C0  --ansi-0..15 (10.2)
--cursor-style beam  --cursor-blink 1
--c-title #00d7d7  --c-section #008787  --c-header #ffd060
--c-active #ffffff  --c-item #bcbcbc  --c-hover #dadada  --c-body #8a8a8a
--c-hint #585858  --c-off #3a3a3a  --c-accent #ffaf00  --c-cursor #ffaf00
--c-yellow #ffd75f  --c-err #ff5f5f  --c-danger #a04030  --c-ok #7ac46f
--c-note #b8923c  --c-quote-attr #87af87
--c-sel-fg #000000  --c-sel-bg #bcbcbc  --c-focus-bg #ffaf00
--c-scroll-thumb #ffffff  --c-scroll-track #585858
--c-syn-cmd #5fafaf  --c-syn-brace #8290a0  --c-syn-delim #c8a060
--c-syn-var #87af87  --c-syn-code #9b86b3  --c-brace-match-bg #3a3a3a
--c-line-hl  (term-bg ±12% toward white/black)
--banner-word #00d0d0  --banner-word-dim #0a9a9c
--star-dim #1f595b  --star-mid #2f9092  --star-bright #74e8e8
--pane-bg-{none,red,green,blue,grey,orange,purple}  --pane-border-*  (10.4)
--pane-shade-{track,dim,mid,paneBg,vtext,label,glow}  (computed per pane)
--ui-script #26C6DA --ui-system #42A5F5 --ui-warn #FFB300 --ui-err #E53935 ... (10.3)
```

## 11. Out of scope

Per intent.md non-goals and the task brief. Listed so the spec can say "no"
explicitly; each one leaves a trace elsewhere in Cockpit that must also go.

| Cockpit feature | Where it shows up in Cockpit | Why out / what remains |
|---|---|---|
| Readability modules (`ttpp/readability/modules/*.tin`, `.meta` previews, ADRs 0111, 0112) | Launcher and popup Options → Readability; per-character toggles | Intent non-goal. Remove the Options entry. Users can write their own `#substitute`/`#highlight` (the modules are ~460 substitutes, a useful perf benchmark). |
| Key manager (`lua/scripts/keymanager.lua`, ADRs 0131, 0132) | `locate life` capture panel, `teleport`/`portal`/… aliases, Alt+s | Intent non-goal. |
| Standalone scripts: autostab, autobow, coinlooter, mercenaries (`lua/scripts/`, ADR 0093) | Launcher/popup Options → Scripts page, `cp -<script>` help, `scripts.conf`, `▶ NAME:` UI lines | Intent non-goal. Remove the Scripts page and `cp` script help. Note: mercenaries' labelled-NPC behaviour in the group pane is core (ADRs 0094–0096), not script. |
| Install, bootstrap, Windows installer, WSL, foot supervisor, self-update, version check, release process (ADRs 0015–0020, 0028, 0035, 0101–0107, 0116, 0146) | Launcher update banner/flow, Options → Terminal relaunch | Irrelevant: the app is a web page; "update" = reload. Keep only the *settings* Options → Terminal exposes (font, size, colours, cursor) because intent Goal 6 wants them. |
| tmux specifics: copy-mode scrollback, root key table, pane index juggling, `.layout_lock`, drag-end sweep, too-small gate reset hatch, `escape-time` (ADRs 0021, 0025, 0036, 0041, 0053, 0055, 0070, 0113, 0141, 0144) | Everywhere in layout and input | Replaced by DOM layout. The *behaviours* they implement (scroll keeps input focused, ESC exits scroll first, 100 000-line scrollback) are kept and listed in §1–§2. |
| Connection modes MMapper / Custom (host:port) | Launcher Options → Connection | Browser has one transport: `wss://mume.org/ws-play/` (WebCockpit ADR 0002). Map comes later per WebCockpit ADR 0003. |
| `cp -e` full shutdown, `.return_to_menu`, supervisor loops | Popup Exit | In a tab, Exit = back to start page (or close tab). |
| Developer pane (`cp -d`, tail of `debug.log`) | Right column, never framed | **Optional, undecided.** A GMCP editor/inspector (intent Goal 5) may cover the same need. |

## 12. Observations for scope and staging

Findings from this inventory that `spec.md` has to handle. Each one is either
something Cockpit does not answer or a place where copying Cockpit would be wrong.

### 12.1 Where Cockpit gives no answer (new design)

| # | Topic | Detail | Section |
|---|---|---|---|
| 1 | Free docking | Cockpit has one fixed-order right column (status → timers → group → comm → ui → dev) with one width (33 cols). intent.md wants panes that can be "docked and arranged freely". Cockpit is only the **default layout**; reordering, docking and tabs are new. | §2.1 |
| 2 | Lite-view kinds | Cockpit's GUI edits only 5 kinds: actions, aliases, highlights, macros, substitutes. Gags, variables and tickers are listed in intent Goal 2 but have no lite tab. | §5.2, §6.1 |
| 3 | Round-trip | Cockpit's save re-sorts the file and **drops** `#nop` comments, blank lines and the continuation lines of multi-line unknown blocks (a known data-loss bug). intent's success criterion says "nothing lost", so WebCockpit must do better than Cockpit here. | §5.9 |
| 4 | Macro key notation | Cockpit stores terminal escapes (`\eOp`, `\e[15~`). A browser captures `KeyboardEvent.code`. Decide whether profile text keeps the tt++ escape form or uses readable names (`Numpad0`, `F5`, `Alt+a`). Also decide which keys the browser reserves (Ctrl+W/T/N, F5, F11, ESC for the menu). | §1.2, §5.6 |
| 5 | Tab close | Tab close or reload = disconnect. Resume / Mirror / Fresh start have no equivalent. A `beforeunload` "leave page?" prompt while logged in is a decision for the owner. | §9.7 |
| 6 | Latency readout | The menu's `Link: 38ms (stable)` comes from ICMP ping, which a browser cannot send. GMCP `Core.Ping` RTT can replace it and also serves as the keep-alive under 45 s (WebCockpit ADR 0002). | §9.4 |
| 7 | Half-open links | Cockpit never detects a silent disconnect. The browser can, with a ping timeout. | §9.2 |
| 8 | Import | intent Goal 7 needs profile Import/Export on the profile page. Cockpit has neither. | §3.4 |
| 9 | Fonts | A browser cannot list installed fonts. Font choice needs a curated list of bundled web fonts, which must cover box-drawing, half-block and quadrant glyphs (`▛▜▙▟`). | §3.7, §10.1 |
| 10 | Comm filter scope | Comm filters are global in Cockpit. Global or per character? | §2.7 |
| 11 | Run backup | Browser storage is lost when site data is cleared. Decide on export/import of all runs, and call `navigator.storage.persist()`. | §7 |

### 12.2 Foundations that must come early

- **Trigger engine with fan-out.** About 50 anchored game-text patterns
  (§8.3) plus the input-side `user_input` / `user_input_empty` events feed
  runs, affects, stored spells, blinds, charm, clock and wimpy. Several
  consumers must see the same line. This removes Cockpit's one-handler
  collisions (ADR 0059, 0123). The user's tt++ actions go in the same engine
  but in a separate class from the system rules.
- **Keep system rules out of the profile.** Cockpit leaked a core
  `#TICKER {clock}` into the owner's saved profile (§6.1). System and user
  rules must be stored separately from day one (ADRs 0014, 0049, 0064).
- **Telnet duties tt++ and MMapper used to perform** (§8.4):
  - NAWS: `change width table terminal` depends on it.
  - Password echo-off: mask the input, keep the password out of history.
  - `change width all 500`, so trigger lines never wrap.
  - XML mode with tag stripping.
  - `Room.*` and `MUME.Client.*` modules.
- **Run capture from stage 1.** Statistics, History, the log player,
  Spotlights, Credits and Export all read the run data. Capture has to start
  early even if those screens come late. Size is about 0.8–1.3 MB of raw log
  per played hour, so writes to IndexedDB must be chunked, batched and
  indexed by time (§7). Guard against two tabs writing the same character's
  run (Web Locks). Seal orphaned runs on the next start.
- **Colour toolkit.** Character and Group content colours come from the
  pane colour through a 7-step HSL shade ramp, with a light-background
  variant (ADRs 0138, 0145). Without it the panes do not look like Cockpit.
  Build it together with the pane frame.
- **Data tables:**
  - `affects_data.lua`: 47 affects.
  - `spells_data.lua`: 36 spells with shortest unambiguous prefixes.
  - Herblore catalogue: 6 multi-phase entries.

  This is game content the web client needs in its own format (§2.6).
- **Group pane is not only rendering.** It needs:
  - room-scoped membership keyed by label or name (ADR 0096);
  - value and band-string freshness handling (ADR 0052);
  - labelled-NPC promote/demote (ADRs 0094, 0095).

### 12.3 Things that disappear or shrink in the browser

- Connection modes: only `wss://mume.org/ws-play/` remains.
- The update flow and version check: update = reload the page.
- Launcher next-start vs popup live-apply asymmetry: this only existed
  because tmux panes do not exist before launch. Use one settings store,
  applied live everywhere.
- The whole save-on-disconnect chain (ADRs 0060–0064): save when things
  change instead. Keep the "never overwrite a good profile with an unloaded
  one" rule.
- The popup profile-editor file handshake: keep only the visible behaviour
  (staged edits, then Apply / Discard / Keep editing, applied all-or-nothing
  with rollback).
- Statistics is drawn twice in Cockpit (ADR 0073). WebCockpit needs one
  renderer. The HTML replay player and the in-app log player can also share
  one renderer.
- The JSONL whole-second timestamps forced text-matching to anchor events in
  the raw log (ADR 0135). Store precise times or line references instead.
- Terminal key limits all go away: Alt+o, Shift+letter, Shift+F-keys, the Num
  Lock requirement, Alt+b/d/f.
- Corner-glyph font probing, OSC 11 background detection and OSC 52 clipboard
  all go away.

### 12.4 Documentation drift found in Cockpit

The inventory follows the code or the newest ADR in each case.

- There is no "Save run" row in the ESC menu any more. The rating moved into
  the Exit dialog (ADR 0119), and the old `rate_session` frame cannot be
  reached.
- The Character pane has no time row any more. Game time is shown only in the
  input clock strip, although parts of `docs/clock.md` and
  `docs/input-pane.md` still describe the row.
- `ui.log` is cleared at every Cockpit start. It survives only reconnects
  within one run, not restarts (the README implies otherwise).
- The timers colour palette has 7 swatches in the code but 9 in ADR 0126.
- The launcher grid still labels the Timers pane "Buffs".
- `C_ROW_HOVER` appears in `docs/launcher.md` but not in `palette.py`.
- There is no version line on the launcher main page. The version appears
  only on About.
- The README says round-trip "preserves unknown tt++ commands … verbatim".
  That is true for single-line unknowns only (see 12.1 #3).

### 12.5 Still to verify against a live Cockpit or MUME session

- The exact on-screen form of the echo of sent commands in the game pane
  (tt++ default plus `_send`'s `#showme`).
- The signal MUME sends at the password prompt (telnet ECHO), for masking.
- Whether the raw capture records text before or after substitutes and gags.
  Cockpit captures at `RECEIVED LINE`, which is believed to be before
  display-side substitution.
