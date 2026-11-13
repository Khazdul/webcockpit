# WebCockpit — Spec

> Status: APPROVED by owner 2026-09-27.
> §7 (cloud: accounts, sync, statistics, sharing) added 2026-11-13 from
> the owner's decisions of that day; stages 58–66.
> Derived from `intent.md` (approved 2026-09-27). Where this document and
> `intent.md` disagree, `intent.md` wins.

## 0. How to read this

- `intent.md` says what and why. This document says how, and in what
  order.
- **Normative appendix.** Cockpit's observable behaviour is described in
  `notes/research/cockpit-inventory.md`, cited as "Inv §n".
  - For every in-scope feature, the behaviour described there is the
    requirement, unless this spec overrides it.
  - The visual target is "very close", not pixel-identical.
- Technical choices are recorded as ADRs in `docs/decisions/`.

## 1. Architecture

### 1.1 Shape

- **Static web app** for everything the game needs. A small backend
  beside it (§7, ADR 0144) keeps accounts, counts use and hosts shared
  runs; it is never in the game's path.
- **Connection:** the browser connects directly to
  `wss://mume.org/ws-play/` (subprotocol `binary`, binary frames),
  ADR 0002.
- **Code:**
  - TypeScript, built with Vite into static files.
  - The hot path is plain TypeScript with direct DOM work.
  - UI chrome (launcher, menus, forms) uses Preact.
  - ADR 0004.

```
 WebSocket ─► Telnet ─► (MCCP) ─► Line assembler ─► XML/ANSI parser ─► Line model
    ▲           │                        │                                 │
    │           ├── GMCP ─► GMCP registry ─► event bus ◄──────────────────┤
    │           └── NAWS/TTYPE/CHARSET/ECHO                                │
    │                                                                      ▼
 Sender ◄── Alias/command engine ◄── Input pane      Trigger engine (system + user)
    │                                                    │ fan-out
    └──────────── sent-command tap ─► event bus          ▼
                                             Display pipeline (subst/gag/highlight)
                                                         │
                                                  Game output pane
 Event bus consumers: panes, trackers, run recorder, (map, later)
```

### 1.2 Layers

1. **Transport.** One WebSocket per tab, owned by the client. Nothing
   else opens a connection. This rule includes the future map.
2. **Telnet.** The client does its own telnet handling:
   - IAC parsing and option negotiation.
   - GMCP, including Core.Hello and a single `Core.Supports.Set` built from
     a module registry.
   - CHARSET: ask for UTF-8, fall back to Latin-1.
   - NAWS, TTYPE, MSSP.
   - ECHO: password masking.
   - GA/EOR prompt boundaries.
   - MCCP2 via `DecompressionStream`, only if measurements show it helps.
3. **Line layer.**
   - Assembles lines and prompts.
   - Parses ANSI SGR and MUME XML mode tags (ADR 0003).
   - Produces a line model: plain text, style runs and tag metadata. The
     `&lt;` family is decoded before triggers see the text.
4. **Event bus.** Ordered and synchronous, with many subscribers. Taps:
   - raw bytes in and out;
   - lines, with prompt flag;
   - GMCP, both raw and parsed;
   - sent commands after alias expansion;
   - connection state.

   No consumer can swallow an event from another.
5. **Script engine.**
   - Interprets the tt++ subset (§3) over two separate rule stores:
     **system** (built-in trackers, run capture) and **user** (the
     profile).
   - System rules are never written to the profile.
   - A third store, **scripts**, holds the triggers, aliases and keys
     of enabled Lua scripts (§2.10, ADR 0051). Matching stays in
     TypeScript; Lua runs only on a match.
   - Triggers fan out: every matching consumer sees the line.
6. **Display pipeline.** Substitutes, gags and highlights change only the
   displayed copy. Taps and the raw log see the unmodified line.
7. **UI.** Panes, launcher, menu bar (the ESC menu on the phone), editors.

### 1.3 Performance budgets

tt++ in a terminal is the reference (intent Goal 1). Budgets, checked with
an automated benchmark that replays recorded sessions:

| Path | Budget |
|---|---|
| Key press → `ws.send` (Enter, macro, no await in path) | < 1 ms of script time |
| Socket frame received → text painted | next animation frame (≤ 16 ms at 60 Hz), with no smoothing or animated scroll |
| Burst: 1 MB of output (large `who` / spam) | UI stays responsive; no frame > 50 ms |
| 500 user rules (actions + substitutes + highlights) | < 0.2 ms per line on average |
| Scrollback | 20 000 lines by default (5 000–50 000 in Options → Appearance, ADR 0046), with no slowdown as it fills |
| Cold start (link → start page) | < 1 s on broadband; map and editor code are loaded lazily |

- **Output rendering:**
  - Lines are appended to the DOM in batches, at most one paint per frame.
  - Old lines are recycled once scrollback is full.
  - Scrolling is `overflow` with `scroll-behavior: auto`.
- **Cell grid.** All TUI chrome is laid out on a measured character-cell
  grid.
- The approach is revisited only if the benchmarks fail (ADR 0004).

### 1.4 Storage

ADR 0006.

- **IndexedDB** holds profiles, settings, comm history, UI messages, runs,
  the map store and scripts with their data (ADR 0051).
- **`localStorage`** is used only for small conveniences.
- **`navigator.storage.persist()`** is requested on first use.
- **Saving.** Everything is saved as it changes. There is no
  save-on-exit, because a closed tab cannot save.
- **Run capture.**
  - The raw log is written in time-indexed chunks, batched (about 1 MB
    per played hour).
  - JSONL-style run events are stored as records with precise
    timestamps.
- **One writer per character.** A Web Lock per character prevents two
  tabs from writing the same run. Runs orphaned by a crash are sealed on
  the next start.
- **Export and import:**
  - A profile goes to and from a single file (intent Goal 7).
  - All runs can be exported and imported as a backup archive.
- **With an account** (§7.4), IndexedDB is still what the client plays
  from; sync copies between it and the server in the background.

### 1.5 Hosting and headers

- **During development:** the owner runs `npm run dev`, a local Vite
  server. The test guide for each stage gives the exact command.
- **Before anyone else tests:** a private deployment is decided in an ADR.
- **Production:** GitHub Pages at <https://mumecockpit.com/>, the app at
  the root, released by a version tag (ADR 0028, ADR 0029). The earlier
  Tailscale/Caddy site (ADR 0022) is retired. **From stage 58** the same
  address is served by a Cloudflare Worker (§7.1, ADR 0144), which can
  set headers; the release flow stays a version tag.
- **Headers:** cross-origin isolation stays possible (COOP/COEP), and
  WebAssembly is allowed by the CSP. This keeps the MMapper iframe route
  open (ADR 0003). `vite dev` and `vite preview` send COOP/COEP; Pages
  cannot, so production is not cross-origin isolated
  (`coi-serviceworker` if it is ever needed).
- **Self-hosted assets only.** Fonts and scripts are served by us; there
  are no third-party embeds. One exception from stage 60: Cloudflare
  Turnstile, loaded only on the account pages (ADR 0145).

## 2. Features

Each feature lists what it maps to in the inventory and the WebCockpit
differences.

### 2.1 Connection and session

Mapped to Inv §9.

- **Session.** One character per tab. Connect, login, disconnect, and
  reconnect. On desktop and tablet a dropped connection shows a
  `Disconnected — Reconnect` notice in the input row, and Enter
  reconnects (ADR 0100). On the phone the ESC menu opens automatically on
  disconnect with Reconnect selected (ADR 0058 behaviour).
  On the phone's game layout (phones and tablets) the player can let the
  session log in again by itself: asked once after a login, the name and
  password are then kept in the page's memory only, and every new
  connection after a LOST link is logged in at MUME's own prompts, until
  the page is closed or reloaded, the session ends on purpose (the
  player disconnects or exits, MUME says goodbye or closes the
  connection itself: a quit is never logged back in), or anything
  unexpected happens (ADR 0141; not yet verified against the live
  game).
- **Keep-alive.** GMCP `Core.Ping` goes out every 10 s (ADR 0007, amended).
  - The `Link:` readout is an HTTPS round trip to mume.org, with the
    `Core.Ping` round trip as the fallback (ADR 0030).
  - A missing pong detects a half-open link.
- **Tab close.**
  - While connected, the browser asks "Leave page?". Closing the tab by
    accident, for example with Ctrl+W, would otherwise cost a PvP fight.
  - Resume, Mirror and Fresh start do not exist in the browser.
- **Client-side commands MUME expects:**
  - password masking and no history for passwords;
  - `change width all 500` after login, where Cockpit did it;
  - NAWS updates when the window is resized.

### 2.2 Game output and input

Mapped to Inv §1.

- **Output pane.**
  - Scrollback follows Inv §1.1.
  - Page Up/Down scroll the output.
  - A scrolled-back view shows the split and live indicator described
    there. On the desktop it splits (ADR 0117): the live tail stays
    visible below a draggable divider, the split goes at the bottom or
    on Esc, and sending a command keeps the view. Touch devices, the log
    player and the HTML replay keep the tail bar and the snap on send.
  - Sent commands are echoed as Cockpit/tt++ does. The exact form is
    checked against a live session in stage 1.
- **Input pane.** Always on, full width, one line (Inv §1.2).
  - History recall selects the recalled line.
  - Empty Enter sends a bare newline, which aborts a cast in MUME.
  - The input is not cleared after send.
  - Clicking anywhere returns focus to the input.
- **Built-in `_send`.** An echo-then-send command, so that existing
  habits carry over (Inv §6.2).

### 2.3 Layout, panes and appearance

Mapped to Inv §2.1 and §10.

- **Default layout.** Cockpit's layout: game and input on the left, and a
  right column 33 cells wide with Character, Timers, Group, Comm and UI.
- **Changes beyond Cockpit (intent Goal 4):**
  - Panes can be dragged to the left, right or bottom dock areas.
  - Panes can be reordered and resized.
  - Panes can be toggled on and off.
  - Per-pane options match Cockpit's: background colour, and the
    options listed per pane in the inventory.
- **Docking engine.** Our own, cell-grid aligned, with no tabs. Tabs are
  added only if the owner asks for them. The dock geometry (where the
  side, top and bottom docks and the input row with its menu bar sit) is
  in ADR 0012, ADR 0101 and ADR 0102.
- **Visual system.**
  - Inv §10: palette tokens, pane frame, 7-step shade ramp and
    light-background variant. The pane frame's look is ADR 0123 (stage
    40, the lantern frame; it replaces ADR 0091's glass rim and
    nameplate), and on a light page a tint is a pale wash of its hue
    (ADR 0123 "Paper").
  - Minimum size screen of 60×18 cells.
- **Appearance settings** (intent Goal 6):
  - font family, from bundled web fonts (Inv §12.1 #9);
  - font size 6–32;
  - padding;
  - terminal palette;
  - cursor style and blink (in Options → Text input, ADR 0066).
- **Bundled fonts.** DejaVu Sans Mono (Cockpit's default) and JetBrains
  Mono are bundled. Both are checked for the box, block and quadrant
  glyphs the UI uses. (ADR 0049 adds thirteen more bundled families, fill
  faces for the glyphs some lack, and Lucida Console where installed.)
- **Settings take effect immediately**, in play from the menu bar's
  Settings popup and the pane gears (stage 30, ADR 0107); on the phone
  from the ESC menu's Options. The start page has no Options since stage
  32: settings are changed in the game. There is one settings store.

### 2.4 Right-column panes

| Pane | Inventory | Notes |
|---|---|---|
| Character | Inv §2.2 | Vitals, XP/TP gains, toggles, gauges. |
| Timers | Inv §2.6 | The trackers for affects, stored spells, cast queue, blinds, charm and herblore, plus a Sanctuary group (yours and your group's). Needs the game-data tables, rewritten in our own format. Look and options: ADR 0122 (stage 39). |
| Group | Inv §2.3 | Membership (NPCs room-scoped, players not; ADR 0120), value freshness, NPC label promotion. Look, fight zone, statuses and options: ADR 0122 (stage 39). |
| Communication | Inv §2.7, ADR 0134 | Public (channel filters, Public's only), Group, one chat per person, search, a reply line in chats and Group, a fold-away chat column, per-channel and per-person colours, history kept across reloads (stage 49). |
| UI messages | Inv §2.4 | Structured messages from the system and scripts. |
| Clock | Inv §2.5 | On desktop and tablet at the left end of the menu bar: a sun or moon in a ring of the period left, `~` after it while synced to the hour only, the countdown in its tooltip (stage 31a, ADR 0099). On the phone the input clock strip with the countdown text. Syncs from MSSP and game text. |

### 2.5 Start page (launcher)

Mapped to Inv §3.

- **Main menu** (stage 32): Enter MUME, Profile, Scripts, History,
  Spotlights, Credits, About. No Options: settings are changed in the
  game (§2.3, §2.6).
- **Profile picker:** create, copy, delete, **import and export** (new).
  Import also takes foreign settings files (§2.11).
- **Scripts:** the Scripts page (§2.10), under Profile.
- **History, Statistics, Spotlights, Credits, About.** The Spotlights
  settings (kinds, characters, period) are in the reel's card at the top
  right (stage 30e, ADR 0110; stage 32c, ADR 0114).
- **Removed:** connection modes and the update flow. Updating means
  reloading the page.
- **Look** (stage 41, 2026-11-07; ADRs 0124–0126,
  `docs/stages/41-start-page.md`): the TUI page of Inv §3.2 (pixel
  banner, `<< >>` menu, key-hint footer) is replaced by a sky driven by
  the offline game clock, a forged-iron "MUME" wordmark with a cyan metal
  inlay, a menu panel whose shortcut letters are marked in the labels
  (E P S H L C A; no key-hint rows), the quote in book type and an
  almanac at the bottom right. Sub-pages move to the same box, with Back
  and glass buttons, one stage at a time; the Profile list was first
  (ADR 0125).

### 2.6 Menu bar and ESC menu

Mapped to Inv §4.

- **Desktop and tablet:** there is no ESC menu in play (stage 30f, ADR
  0112). The menu bar right of the input field holds its entries: the
  Profile window (live editing with Apply, Discard or Keep editing), the
  Scripts window, the Panes popup, the Settings popup, Fullscreen, and the
  Exit popup with a run rating (ADR 0099, 0103, 0107). The Statistics
  pane shows the live run (ADR 0109), the Disconnected notice offers
  Reconnect (ADR 0100), and the tooltips carry the status header (link
  round-trip time, profile, capture). Esc closes the open popup or the
  topmost window and otherwise opens the Exit popup, as the Exit icon
  does; `#menu` prints a hint naming
  the bar and its `#` commands.
- **Phone** (stage 51, ADR 0136): a bottom sheet, opened by the menu
  key, Esc or `#menu`. **Entries:** Reconnect, Profile (live editing
  with Apply, Discard or Keep editing), Scripts, Settings (the phone's
  own page), text size, Black / Paper, and Exit with a run rating.
  **Status line** with the `Link:` round-trip time. Statistics is a pane
  in the phone's pane strip. The run log player on a phone keeps the ESC
  menu.

### 2.7 Profile editor

Mapped to Inv §5.

- **In play** on desktop and tablet the editor opens in a movable
  Profile window over the cockpit, and the Scripts page in a Scripts
  window (stage 30 S8, ADR 0103).
- **The look (stage 43, ADR 0128).** One lantern page in every place: a
  large box on the start page, the Profile window's body, a full-screen
  page in the phone's ESC menu. Three views, Lite, Editor and Help (L, E,
  H), with a rail that follows the view (the kinds; the manual's
  headings; Editor has none, its buffer takes the width: owner feedback
  2026-11-08), and a quiet status at the foot.

- **Lite view.**
  - Cockpit's 5 kinds: actions, aliases, highlights, macros and
    substitutes.
  - All other settings (gags, variables, tickers, …) are edited in the
    editor view.
- **Editor view.** A text editor built on CodeMirror 6, with:
  - tt++ syntax highlighting, brace matching and auto-close;
  - undo and redo;
  - Cockpit's colours.
- **Round-trip is lossless.** WebCockpit keeps:
  - `#nop` comments, blank lines and entry order;
  - unknown and multi-line commands, byte for byte.

  This fixes a data-loss bug in Cockpit (Inv §12.1 #3).
- **Macro keys.**
  - Stored as readable names, such as `F5`, `Numpad0`, `Alt+a` and
    `Ctrl+Shift+F1` (ADR 0005).
  - tt++ escape forms such as `\eOp` and `\e[15~` are also accepted,
    so pasted tt++ text works.
  - Captured from the keyboard in the lite view.
  - Every combination the browser lets through can be bound.
  - Reserved keys (Ctrl+W/T/N) are shown as unavailable.

### 2.8 Logging, runs and replay

Mapped to Inv §7.

- **Raw capture and runs.**
  - The raw capture records the line before display substitution
    (checked in stage 1).
  - Run events cover run_start, kill, pkill, xp_loss, level_up,
    achievement, group_changed and run_end.
  - **Capture starts in stage 1**, even though the screens that use the
    data come later.
- **Screens:**
  - History: a table of sessions and a card for the chosen one, in the
    large box (stage 45, ADR 0130); Statistics, Rate and Delete open in
    or over the same box.
  - Log player, with play, pause, scrubber, jump and speed control. Its
    chrome (stage 32c, ADR 0114) is in the ghost look of the in-game
    popups: a control box (to the start, back and forward 10 s,
    play/pause, speed `◄ 1× ►`, time, Panes, Display, Close), a thin
    rail at the right edge with kind-icon markers, and the header line
    with the key hints; a Back chip at the top left and h:mm:ss from one
    hour (stage 42, ADR 0127).
  - Statistics.
  - Spotlights: a wall of cards with the filter row, and a viewer that
    grows out of a card and plays the reel (stage 46, ADR 0131; the
    full-page reel with its card, ADR 0114, is gone). Credits: the
    chronicle as a book, filtered by the same row (stage 47, ADR 0132).
  - Export editor with cuts and comments written inline, as a large page
    with a format toggle (stage 43, ADR 0128 §43d). It exports plain text
    or a self-contained HTML replay.
  - The log player and the HTML replay share one renderer.
  - The log player and the HTML replay show the whole screen as the
    player saw it: the game output and every pane, in the player's
    layout. The input pane is left out. (Owner, 2026-09-27; the run
    capture records GMCP and layout from stage 4, ADR 0016.)
- **Retention.** Runs older than 14 days are deleted automatically,
  unless they have been saved.

### 2.9 Map (after v1)

ADR 0003.

- **Own map pane.** Imports MMapper map files (arda.xml or MMapper's web
  JSON) and tracks the player with `Room.Info` and `Event.Moved`.
- **Room notes and hover** (ADR 0077). The map file's room notes show
  in the game window after the room's exits (Options → Mapper, on by
  default). Resting the pointer on a room for about 3 s (also after a
  click) shows a box with its name in green and its note (long press on
  touch); Options → Mapper *Room info on hover: Full* shows MMapper's
  room preview instead (name, description, contents, the exits line as
  MMapper writes it, note; no flags, area or terrain), and *Hover text
  size* is Small / Medium / Large (0.72 / 0.85 / 1 of the cockpit font,
  default Medium; round 2). The box sits beside the pointer (right and
  below, flipped left / up at the viewport's edges), may extend past the
  Map pane's edges and stays inside the viewport (round 2).
- **Tilesets** (ADR 0082). Options → Mapper *Tileset*: Default
  (MMapper), Shimrod (alternating), Shimrod Spring / Summer / Autumn /
  Winter, Desert, with a one-line credit. Alternating draws the
  Shimrod set of MUME's current season (game clock) and switches when
  the season turns. A set overrides the default tiles file by file;
  only the chosen set is fetched, and the HTML replay embeds the set
  shown at export. Adding a set is a folder and a catalogue entry.
- **Kept open:** the MMapper iframe route.
- **Nothing bundled.** Map data is never shipped with the client.

### 2.10 Scripts

Intent Goal 10, ADR 0051. Brainstorm: `notes/research/scripting.md`.

- **Library.** Scripts are a separate library beside the profile.
  - Enable and disable are global, not per profile.
  - One `.lua` file is one script. There is no `require` between
    scripts.
  - Export and import work per file, like profiles. Import shows the
    code and a warning that the script can send commands to the game.
  - *Export* also offers a backup of all user scripts with every
    script's settings and saved data, as one file. *Import* restores it:
    it adds what is missing, turned off, and replaces nothing (ADR 0053).
- **Menu.** *Scripts* sits under *Profile* on the start page's main menu
  (stage 32). In play it
  is the menu bar's Scripts window (ADR 0103), and on the phone the ESC
  menu's Options → Scripts.
- **Scripts page** (the lantern look of stage 44, ADR 0129; the behaviour
  of ADR 0121 is kept, its cell layout is not). The same page, editor and
  manual run on the start page (layout B's large box, with Back), in the
  game's Scripts window (one Lykta frame on every page; the title is
  *Scripts*, the note names the editor's script or *Manual*, and the
  sub-pages have a small Back) and in the phone's ESC menu (a full-screen
  box with Back). Three columns, by the width of the page itself:
  - **Index:** every script by name, with an enable switch, a padlock on
    bundled scripts, a running or failed mark and the error line under a
    failed script.
  - **Panel:** the selected script: its name, summary, status
    (`on · running`, `on · at login` before the game, `off`, …) and
    problems; *Edit*, *Export*, *Rename*, *Delete*; its settings as tiles
    (a switch, a number with ◂ ▸, a choice, a text field), saved at once,
    and *Reset all*; its aliases and keys.
  - **Help:** the `@help` text, typeset (paragraphs, lists, tables,
    headings), as a reading column of its own.
  - *New*, *Import* and *Manual* are in the foot with the count. Narrower,
    the help moves under the panel; on a phone or in a small window the
    index is alone and a tap opens the script's panel (settings work
    there too). Letters N I M E X R D work the buttons. The dialogs (New,
    Rename, Delete, Export, Import, Restore) are small boxes over the
    page.
  - **Edit** opens the script editor (direction "Fokus"):
    - CodeMirror with Lua mode, the script's name in the hood (`•` while
      unsaved);
    - completion, signature help and hover docs for the script API, and
      live errors;
    - Save, Find and Manual as small icons in the code's corner (their
      tooltips name Ctrl+S, Ctrl+F / Ctrl+H and F1), and a status line
      under the code;
    - save reloads the script at once if it is enabled; leaving with
      unsaved changes asks first.

    A bundled script opens read-only, with *Duplicate*.
  - **Manual** (direction "Boken"): the guide, the API reference and the
    Lua reference as one text with folding contents and a find in the
    head; F1 in the editor opens it at the name under the cursor.
  - Errors appear in UI messages and on the script's row as
    `<script>:<line>: <message>`.
- **Header:**

  ```lua
  -- @name     coinlooter
  -- @summary  Loots coins from corpses
  -- @api      1
  -- @alias    cl  toggle on/off
  -- @setting  delay number 0.5 0..10 step 0.5 unit s "Seconds before looting"
  -- @help     Free text, one line per tag.
  ```

  `@setting` types are `number`, `string`, `boolean` and `choice`
  (`a|b|c`); a number takes a range, a step and a unit (ADR 0121).
- **In-game commands:**
  - `#script list`
  - `#script help <name>`: prints the same help in the game output
  - `#script set <name> <setting> <value>`
  - `#script enable <name>` and `#script disable <name>`
  - `#script reload <name>`
- **API, version 1.** Mudlet names where they fit and cost nothing.
  - Triggers and aliases:
    - `tempTrigger(substring, fn)`, `tempRegexTrigger(regex, fn)` and
      `tempAlias(regex, fn)` return an id; `killTrigger(id)` and
      `killAlias(id)` remove them.
    - In a handler, `matches` and `line` are set as in Mudlet.
    - `deleteLine()` gags the current line.
    - `replaceLine(text)` substitutes the displayed copy.
    - `copy2cecho()` returns the trigger's line with its colours as cecho
      tags; `isPrompt()` tells whether it is a prompt.
    - `highlight(color)` colours the displayed copy.
    - An alias consumes the input unless its handler returns `false`.
  - Keys: `tempKey(name, fn)` and `killKey(id)`. Key names follow
    ADR 0005.
  - Timers: `tempTimer(seconds, fn[, repeat])` and `killTimer(id)`.
    `getEpoch()` returns the wall-clock time in seconds.
  - Events: `registerAnonymousEventHandler(event, fn)` and
    `killAnonymousEventHandler(id)`. The events are:
    - `gmcp.<Package>.<Message>`;
    - connection events (`sysConnectionEvent`, `sysDisconnectionEvent`);
    - `sysLoadEvent`;
    - the curated `#event` names (spec §3).
  - Game data:
    - the global `gmcp` table, as in Mudlet;
    - `state`, a read-only view of character, group and room data from
      the client's trackers.
  - Output:
    - `send(cmd)` sends without alias expansion.
    - `expandAlias(cmd)` goes through profile and script aliases.
    - `echo(text)` writes plain text to the game output.
    - `cecho(text)` writes coloured text. It understands Mudlet `<name>`
      colours and tt++ `<Frrggbb>`/`<xyz>` codes.
    - `uiMessage(source, text)` writes to the UI messages pane.
  - Profile bridge:
    - `getVariable(name)` and `setVariable(name, value)` read and write
      tt++ variables.
    - `export(name, fn)` makes a function callable from the profile as
      `#lua {script} {name} {args}`.
  - Script data:
    - `settings.<name>` is read-only. `setSetting(name, value)` saves
      one of the script's own settings, as `#script set` does.
    - `scriptName` is the script's own name.
    - `store.get(key)` and `store.set(key, value)` persist strings,
      numbers, booleans and tables per script.
  - Panes:
    - `createPane{id, title, dock = "right"|"left"|"top"|"bottom"|"float", rows, cols, anchor, temporary, at}`
      returns a pane. It docks, floats, toggles and is coloured like
      built-in panes, and the user's placement is remembered per script
      and id. Running script panes are listed in Options → Panes.
    - Content that does not fit scrolls like the built-in panes;
      `anchor = "bottom"` (default) follows new lines like a console,
      `"top"` stays at the first line like a list.
    - `temporary = true` makes a short-lived pane: it floats over the
      game pane (`at`: centre, an edge or a corner), never
      docks and is never listed in menus. Where the user moves it is
      kept per device for the next time; Reset layout forgets it. Its
      close cross closes it. `group` + `grid = {cols}` tile a script's
      temporary panes from `at`'s corner in opening order without gaps;
      a drag moves the group, a resize sizes it (kept per device).
    - Pane methods:
      - `:clear()`, `:echo(text)` and `:cecho(text)`;
      - `:setLine(row, text)`;
      - `:gauge(row, {value, max, color, label})`;
      - `:cechoLink(text, fn, hint)`, `:setLink(row, col, len, fn, hint)`.
        Any span, down to a single cell, can be clickable and have a
        tooltip (`fn` nil: a tooltip only). A hovered link keeps its band
        and tooltip through redraws while it stays at the same place
        (ADR 0056).
      - `:setText(row, col, text)` writes over cells, keeping the row's
        other cells and links.
      - `:size()` returns rows and cols. `:onResize(fn)` is called
        when the pane's size changes.
      - `:show()`, `:hide()`, `:visible()` and `:setTitle(text)`.
      - `:close()` removes the pane until `createPane` is called again;
        `:onClose(fn)` is called when the user closes a temporary pane.
      - `:setInput(row, col, len, {value, placeholder, maxLength,
        onSubmit, onCancel, onChange, onBlur, onKey})` puts an editable
        one-line text field on a span of cells and returns it, with
        `:focus()`, `:select()`, `:value()`, `:setValue(text)` and
        `:remove()` (ADR 0055). While a field has the keyboard, nothing
        typed reaches the game or macros; Enter, Esc, a click elsewhere
        or the pane closing give the keyboard back to the input line.
        Runs show the field's text.
      - `:setCheckbox(row, col, {label, checked, hint, onChange})` and
        `:setRadio(row, col, {group, value, label, checked, hint,
        onChange})` draw `[ ] Label` / `( ) Label` (`[x]`, `(•)` when
        checked) as text under a link and return a toggle with
        `:checked()`, `:set(on)` and `:remove()` (ADR 0077). A click
        flips a checkbox (`onChange(checked)`) or chooses a radio button,
        one per group in the pane (`onChange(value)`). They go with their
        row like links; runs show them as text.
  - Map marks (ADR 0057): `mapMark(target, opts, fn)` marks rooms (ids,
    or a query by name, description lines and exits; nearest 20 first)
    on the Map pane for a while, blinking, with arrows when off view and
    an optional `focus` that zooms out to show them; `mapUnmark(handle)`;
    `mapFind(query, fn)`. Map off: `nil, "map off"`. Live only.
  - Map search (ADR 0077): `mapSearch({text, field, case, regex, max},
    fn)` by name, description, contents, note, area, exits (door
    names), flags or all, as MMapper's Find Rooms, ignoring diacritics
    (`o` finds `ó`); `fn(results, total,
    here)` with `{id, name, area, note, steps, dirs}` nearest first by
    the shortest path from the player's room (MMapper's costs), `dirs`
    as `3e n 2u`. `mapPath(id, fn)` → `fn(dirs, steps)` or `fn(nil)`;
    `mapRoom(id, fn)` → the room's text, terrain, exits and flags. A bad
    regex: `nil, "bad regex: …"`. `mapMark` takes up to 200 ids, lasts
    until unmarked with `duration = 0`, and `focus = "move"` zooms out
    once and follows the player again at the first move.
  - Game time (ADR 0074): `gameTime([epoch])` gives the game date,
    time, season, period of day and moon (phase, level, waxing,
    visibility, position) for now or any real time, or nil while the
    clock is unset. `gameTimeFind(cond, [from], [horizon])` gives the
    next window where a condition holds (season, month, hours, period,
    moon phase or visibility, or a moment such as dawn, moonrise or a
    season start). `sysGameTimeEvent` fires on sync and on changes.
- **Limits** (ADR 0051): sandboxed environment, instruction budget per
  call, memory cap, auto-disable on repeated errors.
- **Runs.** Script pane content is recorded and shows in the log player
  and the HTML replay like the built-in panes.
- **Bundled scripts:**
  - **Coin looter:** loot coins from corpses after kills.
  - **Mercenaries:** a pane with the mercenaries' contracts, a cost of
    10 silver or 1 gold, autopay, pay on click, and the orders `ask
    <name> lead`, `ride` and `flee`.
  - **Key manager:** port keys from `locate life`, per character, for
    12 hours, in a Port keys pane with casts (teleport, portal, scry,
    watch room), inline rename and a safe key (Ctrl+S, Alt+S). Every
    locate opens a pick window where the key's name is typed; `$name` in
    any command becomes the key. Scry and watch room output goes to TV
    panes tiled from the top left, and a scried room is marked on the
    map (ADR 0054, 0057). It follows the owner's Mudlet script.
  - **Readability:** Cockpit's readability modules as a script (stage
    16): short mob names from Lamia's list with tier colours, movement
    and Exits in teal, flags tinted, each part a setting (ADR 0068).
  - **Almanac:** a pane with the tabs NOW (moon, game time, daylight
    and year bands, upcoming events with reminders), PLAN (real-date
    calendar with seasons and moon events) and LORE (time-bound things
    in Arda). Events are data rows; players add their own in the pane
    and share them as text (ADR 0074, stage 18). It opens in a 50-column
    lane of its own at the right edge and narrows gracefully when moved.
    Times are MUME time (game hours and days), redrawn once a game hour.
    Players build events in a pop-up editor with clicks (seasons,
    months, time of day, hours, moon phase, moon up/down, one moment,
    icon and colour); the choice is kept as short condition text, which
    is also an advanced alias path. `almanac export` / `import` move the
    player's events as one `ALM1:` line. A reminder is a line in the game
    window and a UI message (there is no sound API).
  - **Map search:** a pane like MMapper's Find Rooms dialog (`mapsearch`
    shows or hides it; `mapsearch <text>` searches). Query with Find and
    Close; Search radios in two columns (Name, Description, Contents,
    Area | Exits, Notes, Flags, All); case- and accent-blind (no Case
    sensitive or Regular expression for now, round 1); results nearest
    first (up to 200) with steps, room name and area (no way text, round
    1); no tooltips anywhere in the pane (round 2). Nothing is sent to
    the game. A click marks or unmarks a room; marked rooms pulse on the
    map until Clear or Close, and each change zooms to show the player
    and the marks until the player moves. Mark all, Clear; a new search
    keeps the marks; choosing another Search field searches again. It
    opens in a 60-column lane of its own at the right edge, drops the
    Area column when narrow (ADR 0077 §C, stage 21).

  Scripts can name **adaptive colours** (`<~gold>`, `highlight("~gold")`):
  the hue is kept and the lightness moved to 4.5:1 against the current
  background, live in scrollback (ADR 0068).

  Bundled scripts are read-only and are updated with each release.
  *Duplicate* makes an editable copy that is never overwritten.
- **Out for now:** testing a script against a recorded run, script
  packages with several files, and Mudlet API compatibility beyond the
  names above.

### 2.11 Foreign profile import (intent Goal 11)

Research: `notes/research/import/`. Design: ADR 0073.

- **Formats:** TinTin++ (1.x and 2.x), JMC (3.x `.set`), Powwow
  (saved definition files) and Mudlet (profile saves and exported
  package XML, `.mpackage`/`.zip`; ADR 0076). Other clients are out of
  scope.
- **Input:** Import on the Profile list opens the import page (stage 43,
  ADR 0128 §43c): one or more files at once, dropped on it or chosen
  (Choose files…). Files referenced by `#read` (tt++, JMC) are resolved
  by name among the chosen files and inlined; references not found are
  listed in the receipt. A failed import is shown on the page.
- **Decoding:** strict UTF-8, else windows-1252 (windows-1251 when the
  text scores as Cyrillic); a BOM is stripped; CRLF becomes LF.
- **Detection:** signature scoring per format (ADR 0073). Plain WebCockpit
  exports and native tt++ go the tt++ path. The detected format and the
  deciding signals are shown in the receipt.
- **Translation:** each source item is *translated* (to the profile
  language), *kept* (preserved as text: inert tt++ commands verbatim,
  untranslatable foreign lines in a marked `#nop` block with a reason),
  or *skipped* (client state with no meaning here, e.g. JMC's `#presub`,
  Powwow's `#option`; still listed in the receipt). Nothing is dropped
  without a receipt line.
- **Receipt:** after import the page turns into a receipt (stage 43,
  ADR 0128 §43c; it was the "IMPORT REPORT" frame): the format and its
  signals, a summary sentence of the counts translated / kept / skipped /
  warnings, and collapsible lists of every item that was not translated
  as-is, with its source line and reason. OK only; the new profile is
  then selected on the list. A native profile that needed no change gets
  a short form. The profile itself starts with a short `#nop` header
  naming the source and date.
- **Mudlet (ADR 0076):** profile only, never scripts. Item bodies are
  Lua; a Lua-subset translator turns the common forms (`send`,
  variables, `matches[n]`, `if/elseif/else`, `cecho`/`decho`/`echo`,
  `deleteLine`, enable/disable by name, `selectString` with
  `fg`/`bg`/`replace`) into tt++, and inlines simple functions defined in
  the profile's Scripts. Colorizer triggers become `#highlight`, key
  codes become macro key names, saved variables become `#variable`.
  Items of third-party packages are skipped and the receipt names the
  built-in replacement where there is one.
- **Pure core:** detection, decoding and translation are pure functions
  in `src/import/` with no DOM, unit-tested with corpus files.

### 2.12 Phone access (intent Goal 12)

Research: `notes/research/mobile.md`. Design: ADR 0075. Stage 19.

- **Gating.** Three flags, decided once at startup: *touch*
  (`(pointer: coarse) and (hover: none)`), *phone* (touch and the
  short screen side under 600 CSS px) and *tablet* (touch and the short
  side 600 px or more). `?touch=1` / `?phone=1` force the first two
  for development and tests. With all off, no phone code runs and no
  phone CSS matches: desktop is unchanged.
- **A tablet uses the phone's layout** (stage 54, ADR 0140): the
  tablet flag turns the phone flag on, and the phone's game layout and
  keyboard are used whatever the window's size. Everything this
  section says of "the phone" holds for a tablet; what this spec says
  of "desktop and tablet" holds for a tablet only behind
  `?tablet=desktop` (the desktop cockpit and the device's keyboard, as
  before). `?tablet=phone` forces the tablet flag on any device.
  Settings already stored on a tablet are kept as they are. On a
  window whose short side is 600 px or more the keyboard's keys are
  larger (letter keys up to 72 px, rows up to 56 px) and its block
  spans the width.
- **Touch (part A):** an on-screen menu button replaces Esc (on the phone
  only since stage 30f: a tablet has the menu bar, ADR 0112); every Back /
  Esc footer becomes tappable; taps do not pull focus to the input (no
  keyboard pop-up); whole menu rows are tap targets; menu bodies scroll
  by swipe; no double-tap zoom on controls.
- **Phone layout (part B):** the 60×18 guard is lowered for phones; no
  dragging or resizing of panes; the input stays above the on-screen
  keyboard; safe-area insets in landscape and on notched screens. The
  run log player and the Spotlights viewer show the game output at full
  width with a tab strip, one pane at a time (ADR 0075 §3).
- **The phone's layout in the live game** (stage 51, ADR 0136; light
  play, Goal 12). Portrait is the design; landscape uses it as it is.
  - *Top:* a pane strip can be opened from the top edge: one pane at a
    time (Timers, Group, Character, Statistics, script panes), a
    sideways swipe changes pane. Under it, when opened, Comm (the Comm
    pane in rail mode, its reply line as the compose field, the lower
    edge dragged to resize; never lower than its whole reply line and
    one line of chat). Under the panes that are open, and at the very
    top when none is, a fight card only while fighting (two names, two
    bars, no numbers or condition words); Settings → Panes turns the
    card off (round 53k).
  - *Map lens:* the map as a round lens top right (iron ring, glass
    shine), Shimrod, locked settings, a tap steps four zoom levels
    (about 5, 10, 20 and 44 rooms across; the zoom follows the lens's
    size). Three keys on it: panes, fullscreen (where supported), Comm
    with the unread count. No incoming message cards. A finger that
    drags the lens moves it; held still for 0.4 s and then dragged, it
    resizes it (from 96 px to what the free area holds). The place and
    size wanted are stored per orientation; what is shown follows the
    room: under the panes and the fight card, above the command row and
    the keys, shrunk where it does not fit, hidden with its keys as a
    row where not even 96 px fit, and back where it was dropped when the
    room returns. Settings → Map lens resets it (round 53k; ADR 0137's
    addendum).
  - *Bottom right:* a compass from the bottom edge (N, W, look, E, S, U,
    D, flee; every direction always live) and above it up to three hot
    keys along the right edge (K1 lowest; label of at most four
    characters; tap sends, hold rebinds; quick picks, Custom, and two
    specials that set wimpy to 50 % or 25 % of current HP). A K key
    shows and hides them. Stored in the phone's settings, not in the
    profile.
  - *Bottom left:* the menu key and the command field.
  - *Keyboard* (stage 53, ADR 0138 and ADR 0139): a phone has an
    on-screen keyboard of its own, and the device's keyboard stays down
    (the fields ask for none: `inputmode="none"`). **It is the phone's
    only keyboard**, used by every text field a phone user reaches. In
    the game layout: the command field (also at the name and password
    prompts), Comm's reply and search, the hot key box, script pane
    fields. A tap on a field opens it, its fold key closes it, and it
    stays up after Enter. It takes fixed rows at the bottom from the
    layout's allocator, so the page never changes size and MUME gets one
    window size when it opens and one when it closes.
    - *Layouts:* Swedish and English, chosen in Settings → Keyboard
      (default: the browser's language). Three letter rows with shift
      (one tap: one capital; a double tap locks) and backspace (repeats
      while held), and a bottom row: fold, symbols, the digit row's
      toggle, `;`, space, `.`, Enter.
    - *Digit row:* `1`–`0` above the letters, folded up and down with
      its toggle and remembered; history ↑ ↓ stand on it where the keys
      are wide enough, else on the bottom row.
    - *Symbols:* a second page of the same rows, in order of use; with
      the digit row folded its first row is the digits.
    - *Beside it:* in portrait the block spans the width and the compass
      and the K keys stand above it as with the keyboard down, lifted by
      its height; in landscape the block is compressed towards the
      middle with K1–K3 left of it, K4–K6 right of it and the compass at
      the far right. On a screen with no room the K keys give way first,
      then the compass.
    - A key acts on the press and calls the field's editing interface;
      no keyboard event is made up (macros never see these keys). The
      password is masked in place, with no password field.
    - *Vibration:* Settings → Quick buttons → Vibrate on key press (off
      by default; not shown where the browser has no vibration): one
      short pulse on a key of the keyboard, the compass and the K keys.
    - *On the pages* (ADR 0139): the start page and every page and
      frame opened from a menu (profiles, scripts, export, Lite, the two
      code editors and their find row) use the same keyboard, standing
      at the bottom of the app box with the page ending at its top edge
      (no window size is sent for it). It has more keys there: Esc, Tab
      and four caret keys (a row above the letters in portrait, a column
      at each side in landscape); Enter is a line break in a multi-line
      field and in code. Enter, Esc, Tab (and in code Backspace and the
      carets) are sent to the focused field as marked key events that
      macros and key label learning ignore; text never is. For code the
      symbols stand in a code order and the digit row is up in portrait.
    - *A smaller visible area* (a split screen, a window made lower, the
      browser's bars): nothing special. The layout uses the area as on
      any small screen (`--wc-vv-h`); the keyboard stays while the
      allocator has rows for it and closes, once, when it has not. A
      tap on a screen too low for it opens nothing.
    - *No device keyboard, no switch:* there is no setting or address
      parameter for the device's keyboard (`?kbd=0` was removed at the
      release; `?kbd=sv|en` names the layout for tests, `?kbd=1|debug`
      shows a readout). Lost with it, by decision: prediction, swipe
      typing, dictation, other layouts, password managers at the
      password prompt. iPhone and iPad are not verified yet. The run log
      player and Spotlights have no command line; a pane field there (a
      search in Comm) and the old phone layout (a phone flag forced in a
      wide window, or a phone whose phone chunk could not be loaded)
      still get the device's keyboard, and `src/layout/phone-viewport.ts`
      keeps its keyboard state for them only.
  - *Menu:* a bottom sheet with Reconnect, Profile, Scripts, Settings (a
    small phone page), text size, Black / Paper and Exit session.
  - *Automatic login for the session* (ADR 0141): after a login typed by
    hand a card in the game text asks "Log in automatically as <Name>
    for the rest of this session?" (no veil, no key: play goes on under
    it). With Yes a dead link found on resume reconnects, whatever
    "Reconnect automatically" says, and the client sends the name at the
    name prompt and the password when the server has turned ECHO off;
    the menu's Reconnect does the same. It is the account password that
    is held: memory only, never stored; one attempt, and any surprise,
    or a session that ended on purpose, wipes it.
  - *Weather* (off by default on a phone) fills the whole width when on.
- **Desktop-only on a phone:** arranging panes and macro key capture
  (the export editor works on a phone since stages 43 and 45).

## 3. Profile language

tt++ syntax. The supported set comes from real use (Inv §6.5).

- **Must** (stages 3–4):
  - Rules: `#alias`, `#action`, `#highlight`, `#substitute`, `#gag`,
    `#macro`, `#variable`, `#ticker`, `#delay`, each with its `#un…`
    form.
  - Logic and output: `#if`/`#elseif`/`#else`, `#showme`, `#nop`.
  - Syntax: `;`, `{}` nesting, `%0`–`%99`, `^`/`$`, `%+n..mX`, unused
    argument append, `$var`.
  - Comparisons: `== != || &&` with glob `*`.
  - Colour codes (`<xyz>`, `<Frrggbb>`, `<Frgb>`) and colour names.
  - Priorities, case-insensitive command words and unique-prefix
    abbreviations.
- **Should:**
  - `#math`, basic `#format`.
  - `#class`: groups and kill only.
  - `#event`: a curated list of connection and GMCP events.
  - Patterns: `%*`, `%w`, `%d`, `%s`, `%S`, `%i`, `{regex}`.
  - `&var`.
- **Preserved but inert:** file, shell, session and screen commands
  (`#lua`, `#system`, `#read`, `#session`, …). They are kept verbatim, do
  nothing, and show a hint in the editor. Exceptions (§2.10): `#script`
  with a known subcommand, and `#lua {script} {function} {args}`.
- **Nested definitions:** actions defined inside an alias are registered
  synchronously, in line order (Inv §6.4).

## 4. Testing

- **Unit tests** (Vitest) cover telnet, the line/XML parser, the script
  engine and round-trip.
- **Round-trip test corpus:** the owner's profile shapes (test data).
- **Import corpus:** small sample files per foreign format (§2.11).
- **Replay fixtures.** Raw session logs from Cockpit are read, never
  copied into the product, and replayed through a local fake socket.
  They drive:
  - parser and trigger tests;
  - the performance benchmark;
  - an offline **replay mode** the owner can use without logging in.
- **Browser tests** (Playwright) run in Firefox and Chrome, plus a
  phone-emulation project (Chromium, touch) for §2.12.
- **Live checks.** Each stage lists what must be checked on a real MUME
  login. The owner performs these checks.

## 5. Stages

Each stage ends with a short test guide: what to open, what to try and
what feedback is wanted.

| # | Stage | The owner can test |
|---|---|---|
| 1 | **Connect and play.** Transport, telnet, GMCP negotiation, XML mode, the line model, the fast output pane, the input pane (history, empty Enter, masking), keep-alive and `Link:` readout, raw run capture, and the benchmark. | Log in and play plain MUME; compare speed side by side with tt++. Confirm the XML mode and idle timeout facts. |
| 2 | **Look and layout.** Visual system and tokens, bundled fonts, appearance settings, pane frame, default Cockpit layout, docking with toggles and per-pane colours, the start page with the profile picker (including import and export), and the ESC menu skeleton with reconnect. | Does it look and feel like Cockpit? Arrange panes. |
| 3 | **Script engine and profile editor.** The tt++ subset, system/user stores, display pipeline, macros, lite and editor views, and lossless round-trip. | Paste your PvP profile's tt++ text into the editor view and play with it. |
| 4 | **GMCP panes.** Character, Group, Comm, UI messages and Clock. GMCP works under the hood with no user-facing GMCP tools. | Group PvP with the panes. |
| 5 | **Timers and trackers.** The timers pane, the system trigger table (Inv §8.3), and the data tables for affects, spells and herbs. | Timers during real fights. |
| 6 | **Runs.** Run events, History, the log player, Statistics, retention and backup export. | Review the day's sessions. |
| 7 | **Sharing.** The export editor, the HTML replay, Spotlights and Credits. | Export a fight and share it. |
| 8 | **Hardening → v1.** Fixes from PvP testing, a performance pass and polish. | Several live PvP sessions; the v1 verdict. |
| 9 | **Map** (after v1). | |
| 10 | **Scripts** (before v1, by owner request). Lua runtime and sandbox, script API without panes, Scripts page and editor, `#script`, bundled coin looter. | Enable coin looter and play; write a small script of your own. |
| 11 | **Script panes.** `createPane`, gauges, clickable rows and cells, run capture and replay of script panes, bundled mercenaries. | Use the mercenaries pane in play; watch it in a replay. |
| 12 | **Key manager.** The bundled key manager, from the owner's Mudlet reference script, over several polish rounds. | Your usual key and door routine. |
| 17 | **Foreign import.** Detect and translate TinTin++, JMC and Powwow settings into a new profile, with an import report (§2.11). | Import your old tt++/JMC/powwow files and read the report. |
| 18 | **Almanac.** Clock moon and season model, the game time API for scripts, and the bundled almanac script with data-driven events (ADR 0074). | Open the almanac; plan a session; add an event of your own. |
| 19 | **Phone access.** Touch fixes for menus and a phone layout, gated so desktop is unchanged (§2.12, ADR 0075). | Open WebCockpit on your phone, log in, chat, browse the menus. |
| 20 | **Mudlet import.** Mudlet profiles and packages to a plain tt++ profile through a Lua-subset translator, with the import report (§2.11, ADR 0076). | Import your Mudlet profile and read the report; play with the aliases and keys. |
| 21 | **Room notes and map search.** Notes in the game window, map hover box, search/room/path API, the bundled Map search pane (ADR 0077). | Walk past herb rooms; hover the map; search for a herb and follow the marks. |
| 23 | **Remote editing** (parked 2026-10-07). MUME.Client Edit/View over GMCP: a floating edit pane and read-only view panes, Latin-1 and size checks, disconnect handling, and Edit/View text kept out of recordings and exports. | Write a mail and a board post in the edit pane; view a board post. |
| 24 | **Loading indicators.** A TUI loading bar and fade-in for the start page (no piecemeal font reveal), and a progress bar over the map pane while map data and tiles load. | Load the page and turn the map on over a slow connection (phone). |
| 30 | **Fixed menu.** A menu bar right of the input field (clock, Profile, Scripts, Panes, Settings, Fullscreen, Exit) in the ghost-icon look. Movable Profile and Scripts windows, a live Settings popup, gears on the panes, a Statistics pane, Spotlights settings in the reel; the ESC menu removed on desktop last (`docs/stages/30-fixed-menu.md`, steps 30a–f). | Change settings while you play. |
| 31 | **Menu bar clock and weather smoothness.** Mockups for a clock that blends into the menu bar (small tweaks and drastic variants), then the chosen one built; a review of why snow (and other weather) feels jerky, and the fix (`docs/stages/31-clock-and-snow.md`, steps 31a–b). | Pick a clock; watch snow fall smoothly. |
| 38 | **Scripts page.** Mockups in four directions, then the chosen one (A, pure TUI) built: the selected script joins a framed detail, settings edited in place and saved at once, typeset help in its own scrolling box, `@setting` ranges, units and choices (`docs/stages/38-scripts-page.md`, ADR 0121). | Change a script's settings in the small Scripts window; read a long help. |
| 41 | **The new start page.** The night sky, the mithril wordmark, the almanac, the lantern menu panel and kit (ADR 0124–0126), the Profile list with row actions, and the Enter MUME transition (`docs/stages/41-start-page.md`). | Open the start page on desktop and phone; pick a profile and enter MUME. |
| 42 | **The shared base for the look pages.** Layout B "Rummet växer" (the big box that grows out of the menu), box places (start page, in-game window, the phone's ESC menu), the kit's controls, dialogs and cursors, the one Lykta window frame (dark and Paper), the lantern CodeMirror look, the find row and the manual reader, and the run log player core; a dev-only kit gallery (`?kit`, ADR 0127). | The kit gallery's grow and shrink motion; the Profile and Scripts windows in their new frame; the run log player's Back. |
| 43 | **Profile pages in the new look.** The Profile editor (B "Ryggen") as a big page and as an in-game window, Import (C) and Export (B, with a format toggle and EXPORT) (ADR 0128). | Edit a profile on the start page and in the game; import and export one. |
| 44 | **Script pages in the new look.** The Scripts page (C "Instrumentbrädan"), the script editor (C "Fokus") and the script manual (A "Boken") (ADR 0129). | Change a script's settings, edit a script, read and search the manual. |
| 45 | **History and the run log player.** History in the big box (A "Tabell och kort") with Statistics, Rate and Delete; the run log player with Back and h:mm:ss (ADR 0130). | Browse, rate and delete sessions; play a run log. |
| 46 | **Spotlights: the gallery.** A wall of spotlight cards (B "Galleriet") with the settings as its filter row, and the reel in a viewer that grows out of a card (ADR 0131). | Browse the wall, play one spotlight and the whole reel, change the filter. |
| 47 | **Credits and About.** Credits as a book (B "Krönikeboken") and About as one long leaf (A "Bladet") (ADR 0132). | Read the chronicle and the About page on desktop and phone. |
| 48 | **Presentation film.** A three-minute film made as code (Remotion in `video/`) (ADR 0133). | Watch the film. |
| 49 | **Comm and Statistics panes.** Comm as conversations: Public, Group, a chat per person, search, a reply line; Statistics as a live kill feed with a rating, tiles and a Last kill card (ADR 0134). | Talk, read chats, follow a run's kills. |
| 50 | **Firefox frame latency.** Veils under floats when Firefox composites in software; `#perf` as a live overlay, `#perf report` for the table (ADR 0135). | Play with a large float in Firefox; try `#perf`. |
| 51 | **The phone's layout in the game.** Fight card, map lens with its three keys, pane strip, Comm under the fight card, compass and hot keys, the menu sheet and the phone settings page, weather in full width, Paper (§2.12, ADR 0136, `docs/stages/51-phone-layout.md`, steps 51a–g). | Play lightly on your phone: walk, flee, chat, read the panes. |
| 52 | **The phone's layout, round 2.** Landscape with its own arrangement (the strip and Comm as a left column), resizable strip and Comm, a lens that shrinks before it hides, up to six hot keys in two columns, see-through keys, the menu and settings reworked (§2.12, ADR 0137, `docs/stages/52-phone-round-2.md`). | Play in portrait and landscape on your phone; resize the panes and Comm. |
| 53 | **An on-screen keyboard of our own.** The phone's game layout types with a keyboard that is part of the client: Swedish and English, a digit row, symbols, the compass and K keys beside it, vibration as a setting; the device's keyboard stays down. It is the phone's only keyboard, on the menu's pages and in both code editors too (Esc, Tab and caret keys there); no device keyboard and no switch for one (§2.12, ADR 0138, ADR 0139, `docs/stages/53-own-keyboard.md`, rounds 53a–i). | Type commands, tells, the password, profiles and scripts on your phone without the device's keyboard. |
| 58 | **Move to Cloudflare.** The same site from a Cloudflare Worker with static assets, an empty API, cache and security headers, the release workflow, the domain switch with a rollback (§7.1, §7.12, ADR 0144). | Open mumecockpit.com after the switch: your profiles and runs are there, play as usual. |
| 59 | **Usage statistics.** The heartbeat, presence and daily figures in D1, "N online" on the start page, the admin page behind Cloudflare Access with plain numbers, the privacy text (§7.6, ADR 0147). | Open `/admin` and see yourself online; judge the start page's counter. |
| 60 | **Accounts.** Register, log in, recovery code, change password, sessions, delete account; keys and encryption in the browser; Turnstile, limits, the CSP; no sync yet (§7.2–7.3, ADR 0145). | On the staging site: create an account, log in on a second device, lose the password and come back with the code. |
| 61 | **Sync of profiles and scripts.** The sync engine, IndexedDB 9, first sync with a safety copy, keep-both conflicts, the state mark (§7.4, ADR 0146). | Edit a profile on the desktop, find it on the phone; edit the same one on both while offline. |
| 62 | **Sync of settings.** Settings per device type, the first-sync choice, script data, logging out with or without the local data (§7.4). | Two desktops share the layout; the phone keeps its own. |
| 63 | **Runs in the cloud.** Saved runs upload, the storage limit and the "does not fit" dialog with download, runs listed from the account and fetched when opened, export docs (§7.5). | Save a run on the desktop, play it on the tablet; fill the limit and see the offer to download. |
| 64 | **Share links.** Link in the export editor, the watch page with the sandboxed replay, My shared runs, Report, the moderation tools in the admin page (§7.7, §7.9, ADR 0148). | Cut a fight, send the link to a friend without an account. |
| 65 | **The gallery.** Publish, the public list, stars, comments, the top list, the notice of new runs, reports that hide (§7.8). | Publish a run, rate and comment from a second account, get the notice. |
| 66 | **The admin panel.** Accounts with clean-up and limits, graphs of use, storage and sharing, the audit log (§7.9). | Look at a month of use; remove a test account. |

## 6. Open questions for the owner

None. New questions are raised in the stage files (`docs/stages/`).

## 7. Cloud: accounts, sync, statistics and sharing

Intent Goals 13–15. Decisions and their reasons: ADR 0144 (platform),
0145 (accounts and encryption), 0146 (sync), 0147 (statistics), 0148
(sharing, gallery, admin). Facts: `notes/research/cloudflare-platform.md`
and `notes/research/cloud-data-inventory.md`. Built in stages 58–66
(§7.12).

### 7.0 Rules that hold for all of it

1. **The game path is untouched.** No cloud call is awaited between a
   key press and `ws.send`, or between a socket frame and its paint
   (§1.3). Encryption, compression and uploads run in a Web Worker or
   on idle time. The benchmarks of §1.3 must not move.
2. **Logged out is today's client.** Every feature that exists at
   0.9.1 works without an account and with the service down.
3. **The server cannot read private data** (§7.3). Only what a player
   chose to share is readable.
4. **Nothing a player wrote is dropped without a notice.**
5. **Dark until opened.** A cloud feature appears in production when
   its flag in `GET /api/config` is on. The owner tests on staging
   first.
6. **Desktop is not disturbed.** New entries on the start page and in
   the game are put to the owner in each stage's mockup or test (as
   intent Goal 12 asks for phone changes).

### 7.1 Shape

```
 Browser ──── wss://mume.org/ws-play/ ───────────────► MUME   (unchanged)
    │
    └─ https://mumecockpit.com
          ├─ /, /assets/*, /map/*, /replay/* …  static files (free, no Worker)
          ├─ /r/<id>                            the app, on its watch page
          ├─ /admin                             the admin page (Cloudflare Access)
          └─ /api/*  ─► Worker `webcockpit` ─┬─ D1 `webcockpit` (eu)
                                             └─ R2 `webcockpit` (eu)
```

- One Worker, one origin. `run_worker_first` for `/api/*` and
  `/admin*`; unknown paths get `index.html`.
- Code: `worker/` (Worker, migrations), `src/cloud/` (client),
  `shared/cloud/` (API types), `wrangler.jsonc`.
- Environments: `production` (the domain) and `staging`
  (`webcockpit-staging.<account>.workers.dev`, its own D1 and R2).
- Development: `npm run dev` starts Vite as today; `npm run dev:cloud`
  also starts `wrangler dev` with local D1 and R2, and Vite proxies
  `/api` to it. Without it, the client behaves as when the service is
  down.
- API conventions: JSON, errors as `{error: "<code>"}` with a fitting
  status; encrypted blobs as `application/octet-stream`. Everything
  that needs a login is under `/api/u/`; the session cookie's path is
  `/api/u`. State-changing requests carry `X-WC: 1` and a matching
  `Origin`.

### 7.2 Accounts

ADR 0145.

- **Where.** A new start menu entry, Account (shows "Log in" or the
  user name). Its pages are in the look kit of stage 42: Log in,
  Create account, Recovery, and the Account page.
- **Create account:** user name (3–20 of `a-z 0-9 _ -`, unique without
  regard to case, fixed), password twice (≥ 10 characters, strength
  hint, a warning against the MUME password), the six-point "what
  happens to your data" text, Turnstile. Then the recovery code is
  shown once (24 characters in groups, Copy, Download as a text file)
  and the player confirms having kept it by typing its last group.
- **Log in:** name and password; Turnstile after three failures; ten
  failures per name in 15 minutes give a 15-minute wait. The same
  message for "no such name" and "wrong password".
- **Recovery:** name, recovery code, new password. Ends every session.
- **Account page:** storage in use against the limits; sync state and
  "Sync now"; sessions with "End" and "End all others"; change
  password; new recovery code; the gallery notice switch; the local
  safety copy as files; the existing exports ("Download everything":
  profiles, scripts backup, runs backup); Log out (keep or remove the
  data on this device); Delete account (password, typed confirmation,
  everything removed at once).
- **Phone and tablet** get the same pages in the phone menu, typed
  with our own keyboard (§2.12).
- **Suspended account** (§7.9): sync works; sharing, voting and
  commenting answer `suspended`.

| Endpoint | Does |
|---|---|
| `GET /api/config` | flags, limits, Turnstile site key, server time |
| `GET /api/auth/params?name=` | salt and KDF parameters (a stable fake for unknown names) |
| `POST /api/auth/register` | name, salt, KDF, `authKey`, `recoveryAuth`, both wrapped data keys, Turnstile token → session |
| `POST /api/auth/login` | name, `authKey` → session, wrapped data key |
| `POST /api/auth/recover` | name, `recoveryAuth`, Turnstile → wrapped data key; then new `authKey` and wrap |
| `POST /api/u/auth/logout` | ends this session |
| `GET /api/u/account` | name, created, usage, limits, state, sessions, prefs |
| `POST /api/u/account/password` | old and new `authKey`, new wrap |
| `POST /api/u/account/recovery` | new `recoveryAuth` and wrap |
| `DELETE /api/u/account/sessions/<id>` | ends a session |
| `PATCH /api/u/account/prefs` | the gallery notice switch |
| `DELETE /api/u/account` | deletes the account and all it owns |

### 7.3 Keys and encryption

ADR 0145, "Keys". Requirements on the build:

- WebCrypto only. PBKDF2-HMAC-SHA-256 with 600 000 rounds runs in a
  Web Worker with a "Working…" state; the parameters come from the
  server per account.
- The data key is a non-extractable `CryptoKey`, stored in IndexedDB
  beside the sync state. Removing the data from a device removes it.
- Blob format: `version (1 byte) | nonce (12) | AES-256-GCM
  ciphertext`, associated data `kind | id`. Run bodies are encrypted
  in 1 MB segments, each with the segment number in the associated
  data, so a body can be streamed and a cut-off one is detected.
- Opaque ids: `HMAC-SHA-256(idKey, kind | localKey)`, 128 bits,
  base64url; `idKey` is derived from the data key.
- Test vectors for every step are checked in, so a later rewrite
  cannot quietly change the format.
- A review by a second agent with only the code and ADR 0145 is part
  of stage 60, before the stage is released.

### 7.4 Sync

ADR 0146. What follows the account: profiles, user scripts, script
data, settings per device type, saved runs (§7.5), export docs.

**Engine** (`src/cloud/sync/`), pure where it can be:

1. Take the sync lock (Web Lock `webcockpit-sync`).
2. Pull `changes?since=<cursor>`; decrypt.
3. Scan local stores, hash, compare with the `sync` store: find local
   changes, deletes and new items.
4. Resolve per the table in ADR 0146 (keep both, or last writer).
5. Apply remote changes to IndexedDB **unless a session is playing**
   and the item is in use (the active profile, enabled scripts, the
   settings): those wait for the start page. Other items apply at
   once.
6. Push local changes with their base `rev`; on `409` go to 2 (at most
   three rounds, then back off).
7. Store the cursor.

- **Triggers:** login, page load, start page shown, tab visible, 5 s
  after a local change, every 5 minutes on the start page.
- **State mark** on the start page beside the Account entry, and on
  the Account page: in step, syncing, offline, needs attention (with
  what: "cloud storage full", "update the client to read newer
  data"). Keep-both conflicts raise a notice naming both copies.
- **IndexedDB 9:** `profiles` records get `id`; new stores `sync`
  (per item: kind, local key, server id, rev, hash, state) and
  `syncMeta` (account, cursor, device label, the data key, the
  safety copy).
- **Renames** keep the item (profile `id`, script `id`).
- **Bundled content.** Bundled scripts are not items; their
  `scriptData` is. The seeded `default` and `khazdul` profiles are
  items like any other once changed; untouched seeds give way to the
  account's at the first sync.
- **Settings** sync as the whole record under the device type's item.
  The `settings.version` migration runs on what was pulled; a record
  from a newer client is left alone and raises "update the client".
  `webcockpit.appearance` in `localStorage` is rewritten after a pull
  so first paint follows.
- **First sync** on a device with data: ADR 0146's six steps, shown as
  one short page ("This device has 4 profiles and 2 scripts; your
  account has 6 and 3. Here is what will happen…") with the settings
  choice on it.
- **Tests:** the engine against an in-memory server model with
  generated sequences of edits, renames, deletes, offline periods and
  two or three devices: after everybody has synced, all devices are
  equal and no edit is missing. Plus e2e with two browser contexts.

| Endpoint | Does |
|---|---|
| `GET /api/u/sync/changes?since=` | changed items (blobs inline for small kinds), new cursor, usage |
| `PUT /api/u/sync/items/<kind>/<id>` | body = blob; `If-Match: <rev>`; `409` returns the current item |
| `DELETE /api/u/sync/items/<kind>/<id>` | tombstone, `If-Match` |

Limits: 1 MB per item, 2 MB of small items per account, 2 000 items
(100 accounts at the limit are 200 MB of D1's free 500 MB).

### 7.5 Runs in the cloud

ADR 0146, "Runs".

- **Upload on save.** `RunLibrary.save` (Exit popup, phone exit sheet,
  History) queues the chain's runs. Each sealed run becomes one body:
  the backup's JSONL lines for that run, gzip, encrypted, `PUT` to
  `/api/u/runs/<id>`; then its `run` item (meta, summary, rating,
  body size) is pushed. Uploads happen on the start page or in the
  background, never during a fight's frames.
- **The limit.** 50 MB per account to begin with, for run bodies and
  shared payloads, 20 MB per body. Stage 63 measures the stored size
  of real saved runs first; the owner then confirms or changes the
  number. The server refuses over-limit uploads
  with `quota` and the numbers.
- **"Does not fit" dialog** (look kit): "Your cloud storage is full
  (49 of 50 MB). The run is saved on this device." with Download the
  run, Open History, Keep on this device. It is shown where the save
  was asked for; after an Exit it is shown on the start page.
- **History** lists runs from the account that are not on the device,
  with a cloud mark and their size; opening one fetches and stores it,
  with a progress bar (§2.5, stage 24's bar). Device-only runs carry
  their own mark. The storage line shows cloud use beside the
  device's.
- **Unsave or delete** removes the body and tombstones the item, after
  a confirmation that says "on all your devices".
- **Retention** is unchanged for unsaved runs. A saved run is never
  swept, on the device or in the cloud.
- **Export docs** sync as items, so a cut begun on one device
  continues on another.
- **Statistics, Spotlights, Credits** use what is on the device and
  say how many cloud-only sessions are not counted, with "Fetch all"
  on desktop.

| Endpoint | Does |
|---|---|
| `PUT /api/u/runs/<id>` | stores a body (stream to R2); `quota` when it does not fit |
| `GET /api/u/runs/<id>` | the body |
| `DELETE /api/u/runs/<id>` | removes it |

### 7.6 Usage statistics

ADR 0147.

- **Client:** `src/cloud/beat.ts`. Device id in `localStorage`
  (`wc.device`). `POST /api/beat` with `credentials: 'omit'` and
  `keepalive`: at load, every 5 minutes while visible, and on a change
  between `menu`, `playing` and `replay`. Off in dev and in e2e.
- **Server:** tables `presence`, `device_day`, `stat_sample`,
  `stat_daily`; a Cron every 5 minutes samples, and at 00:10 UTC rolls
  up and prunes.
- `GET /api/stats/public` → `{online, playing}`, cached 60 s.
- **Start page:** one quiet line, "N online", by the almanac; hidden
  when the request fails. The owner keeps or removes it after stage
  59.
- **About:** a "What the site knows" section. A `/privacy` leaf in the
  About look with the full text: the heartbeat, the account, shared
  runs, Cloudflare as processor, the abuse address, how to delete.

### 7.7 Share links

ADR 0148, "Sharing" and "Watching".

- **Export editor:** the format toggle gets Link beside HTML and Text.
  EXPORT then opens the share dialog: title, description, size, the
  "this will be readable by anyone with the link" line, Published
  on/off (from stage 65), Create link. The result shows the link with
  Copy.
- **Server:** the payload goes to R2 under `pub/<id>`, a row to
  `publication`.
- **Watch page** `/r/<id>`: the app boots straight to it (no start
  page animation). The replay runs in a sandboxed frame fed by
  `postMessage`; the frame's document is the replay runtime of
  ADR 0019 with a CSP of its own (`default-src 'none'`, inline script
  and style by hash, `img-src data:`, `font-src data:`, `worker-src
  blob:`). Around it: title, sender, character and level, length,
  date, Report, Download as HTML, and from stage 65 stars and
  comments. Back goes to the gallery (stage 65) or the start page.
- **My shared runs** on the Account page and from History's row for a
  shared session: link, views, stars, listed, Remove.
- **Payloads are hostile input.** The replay runtime is reviewed for
  that in stage 64: sizes and counts bounded, no HTML from the
  payload, the embedded map and settings validated, fuzz tests over
  mutated payloads.

| Endpoint | Does |
|---|---|
| `POST /api/u/pub` | meta + payload → id; `quota`, `suspended` |
| `PATCH /api/u/pub/<id>` | title, description, listed |
| `DELETE /api/u/pub/<id>` | removes it |
| `GET /api/u/pub` | my shared runs |
| `GET /api/pub/<id>` | meta (public); `gone`, `hidden` |
| `GET /api/pub/<id>/payload` | the payload, long cache |
| `POST /api/pub/<id>/view` | counts a view (device id, once a day) |
| `POST /api/u/report` | item kind and id, reason |

### 7.8 The gallery

ADR 0148, "The gallery" and "A notice of new runs".

- **Start menu:** a new entry (working name Gallery). Mockups first,
  in the look of History and Spotlights (stage 45, 46); the owner
  picks the direction, the word and the letter.
- **List:** title, sender, character and level, length, date, stars
  and votes, comments, views. Top (weighted mean, default), New, Most
  watched; week, month, all. Pages of 30.
- **Stars** on the watch page: 1–5, the client's star control; one's
  own vote is shown and can be changed; not on one's own run.
- **Comments** under the replay: plain text ≤ 1000 characters, newest
  last, Remove for the writer and the run's owner, Report.
- **Rules** shown once per account before the first publication, with
  a tick.
- **The notice:** logged-in players are told of newly published runs
  through the client's notices (ADR 0025's mechanism); see ADR 0148.
  In the game it is a quiet notice like the update notice, never over
  the output. A switch in the game's Settings popup (§2.6; the phone's
  settings page too), "Notices of new gallery runs", on by default,
  turns it off; it is shown when logged in, is the same switch as on
  the Account page, and holds for the account on every device.
- **Reports** hide an item at five from different accounts.

| Endpoint | Does |
|---|---|
| `GET /api/gallery?sort=&period=&page=` | the list (public, cached 60 s) |
| `GET /api/pub/<id>/comments?page=` | comments (public) |
| `PUT /api/u/pub/<id>/vote` | 1–5 |
| `POST /api/u/pub/<id>/comments` | a comment |
| `DELETE /api/u/comments/<id>` | writer or run owner |
| `GET /api/u/gallery/news` | published since `gallery_seen`; `POST` moves it |

### 7.9 Admin and moderation

ADR 0148, "The admin page".

- `/admin` is its own small page (`worker/admin/`), served by the
  Worker only after the Access token is verified (issuer, audience,
  the owner's identity). `/api/admin/*` checks the same. It is not in
  the client bundle and loads nothing from the app.
- **Stage 59:** online now, today and the last 30 days as a table, the
  day's Worker requests and D1 writes against the plan's limits.
- **Stage 64:** the report queue (item, reasons, reporters' count),
  Hide, Restore, Delete for runs and comments; Suspend, Restore and
  Delete for accounts. Every action lands in `admin_log`.
- **Stage 66:** accounts (name, created, last seen, item count, bytes,
  shared runs, state) with search and sort; limits per account;
  graphs: online over 24 h and 30 days, daily/weekly/monthly devices,
  new devices and new accounts, device types, browsers, client
  versions, storage in total and the largest accounts, shares, votes
  and comments per day; the audit log.
- Graphs are drawn by the page itself (SVG), in a plain, readable
  look; this page is a tool, not part of the TUI.

### 7.10 Abuse and limits

| What | Limit |
|---|---|
| Registration | Turnstile; 3 an hour and 10 a day per address (hashed, daily pepper) |
| Login | 10 failures per name in 15 min → 15 min wait; Turnstile after 3 |
| API in general | the rate limiting binding, 120 requests a minute per session or address |
| Small items | 1 MB each, 2 MB and 2 000 items per account |
| Runs and shared payloads | 50 MB per account; 20 MB per run body; 5 MB per shared payload; 50 shared runs |
| Comments, votes | 20 and 60 an hour per account |
| Reports | 30 a day per account |

Limits live in `/api/config` and per account (`limits` column), so
the owner changes them without a release.

### 7.11 Data model (D1)

```
account(id, name, name_key UNIQUE, created, last_seen, state,
        salt, kdf, auth_hash, recovery_hash, wrap_pw, wrap_rc,
        limits, prefs, gallery_seen, seq)
reserved_name(name_key)                      -- deleted accounts' names
session(id_hash, account, label, created, last_used, expires)
item(account, kind, id, rev, seq, deleted, size, updated, blob)
     PRIMARY KEY (account, kind, id); INDEX (account, seq)
run_body(account, id, size, created)         -- body in R2 u/<account>/<id>
publication(id, account, title, description, character, level,
            length_s, size, listed, state, created, views,
            vote_sum, vote_count, comment_count)
vote(publication, account, stars)            PRIMARY KEY (publication, account)
comment(id, publication, account, text, created, state)
report(id, kind, target, account, reason, created, handled)
presence(device, first_seen, last_seen, state, type, browser, version)
device_day(device, day)
stat_sample(ts, online, playing)
stat_daily(day, metric, key, value)
attempt(key, window, count)                  -- login and registration limits
admin_log(ts, who, action, target, note)
```

Small item blobs (≤ 1 MB) are in D1; run bodies and payloads in R2.
Migrations are numbered SQL files, applied by the release workflow
before the Worker is deployed, and always backward compatible with
the Worker version still running.

### 7.12 The stages, step by step

Each stage has its own file when it starts (`docs/stages/`), with the
tasks, the test guide and the owner's feedback. Order and content:

**58 — Move to Cloudflare** (`docs/stages/58-cloudflare-move.md`).
1. `wrangler.jsonc`, `worker/` with `GET /api/config` and
   `GET /api/health`; `public/_headers`; `npm run dev:cloud`.
2. `build:pages` → `build:site`; a `cloudflare` profile in
   `scripts/static-server.ts` and `playwright.prod.config.ts`.
3. Owner: an API token and two repository secrets (the stage file
   says exactly where to click).
4. Workflow `deploy.yml` on `v*` tags: build, `wrangler deploy`.
   First to `workers.dev`; `test:prod` there.
5. The switch: delete the apex A/AAAA records, attach the domain,
   `www` redirect; `test:prod` live; the owner checks his data.
6. Pages stays deployable for two releases, then `pages.yml` goes.

**59 — Usage statistics.**
1. D1 and R2 created with jurisdiction `eu` (production and staging);
   migrations in the workflow.
2. The heartbeat, presence, Cron samples and roll-up.
3. Owner: Cloudflare Access application for `/admin`; e-mail routing
   for `abuse@`.
4. The admin page with numbers; "N online" on the start page; About's
   "What the site knows" and `/privacy`.

**60 — Accounts.**
1. `src/cloud/crypto` with test vectors; the Web Worker for the KDF.
2. Worker: auth endpoints, sessions, attempts, Turnstile check.
3. Mockups of the account pages; the owner picks; build for desktop,
   tablet and phone.
4. The CSP, enforced (first report-only on staging).
5. Review of crypto and auth by a second agent; fixes.
6. Owner test on staging; flag `accounts` on in production.

**61 — Sync of profiles and scripts.**
1. IndexedDB 9, profile ids, the `sync` stores.
2. The engine against the model, with generated tests.
3. Worker: item endpoints; limits.
4. First sync page, safety copy, keep-both notices, state mark.
5. Two-context e2e; a review of the engine by a second agent.
6. Owner test with two devices on staging; flag `sync` on.

**62 — Sync of settings.**
1. Settings items per device type; pull while playing deferred;
   first-paint copy.
2. Script data items.
3. Log out with or without local data; "Download everything".
4. Owner test: two desktops and a phone.

**63 — Runs in the cloud.**
1. Body format, segmented encryption, upload queue.
2. Worker: R2 endpoints, usage accounting, `quota`.
3. History: cloud and device marks, fetch on open, storage line; the
   "does not fit" dialog.
4. Export docs; Statistics, Spotlights and Credits with cloud-only
   runs.
5. Owner test; flag `runs` on.

**64 — Share links.**
1. Worker: publications, payload storage, views, reports.
2. Export editor: Link and the share dialog; My shared runs.
3. The watch page and the sandboxed frame; Download as HTML.
4. Hardening of the replay runtime against hostile payloads; fuzzing.
5. Admin: report queue, hide, delete, suspend; `admin_log`.
6. Owner test; flag `share` on.

**65 — The gallery.**
1. Mockups of the gallery and the watch page with stars and comments;
   the owner picks.
2. Worker: list with the weighted mean, votes, comments, news.
3. The gallery page, stars, comments, rules tick, Published switch.
4. The notice of new runs; its switch in the game's Settings and on
   the Account page.
5. Reports that hide; owner test with two accounts; flag `gallery` on.

**66 — The admin panel.**
1. Accounts list, limits, delete; the audit log view.
2. Graphs.
3. Owner test.

Before 60, 61 and 64 are opened in production the owner tells the
Valar what the client now does (intent Constraints); the text of the
registration page is a good thing to show them.

### 7.13 Later, perhaps

Not planned; listed so they are not forgotten (intent Non-goals):

- Version history of profiles and scripts in the cloud.
- A shared library of scripts and tilesets.
- Voluntary error reports from the client.
- Test versions per branch (Cloudflare previews).
- Passkeys as a second way in.
- Sync of the imported map and of comm history.
