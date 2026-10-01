# WebCockpit — Spec

> Status: APPROVED by owner 2026-09-27.
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

- **Static web app.** No backend.
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
   - Triggers fan out: every matching consumer sees the line.
6. **Display pipeline.** Substitutes, gags and highlights change only the
   displayed copy. Taps and the raw log see the unmodified line.
7. **UI.** Panes, launcher, ESC menu, editors.

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

- **IndexedDB** holds profiles, settings, comm history, UI messages, runs
  and, later, the map store.
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

### 1.5 Hosting and headers

- **During development:** the owner runs `npm run dev`, a local Vite
  server. The test guide for each stage gives the exact command.
- **Before anyone else tests:** a private deployment is decided in an ADR.
- **Production:** GitHub Pages at <https://mumecockpit.com/>, the app at
  the root, released by a version tag (ADR 0028, ADR 0029). The earlier
  Tailscale/Caddy site (ADR 0022) is retired.
- **Headers:** cross-origin isolation stays possible (COOP/COEP), and
  WebAssembly is allowed by the CSP. This keeps the MMapper iframe route
  open (ADR 0003). `vite dev` and `vite preview` send COOP/COEP; Pages
  cannot, so production is not cross-origin isolated
  (`coi-serviceworker` if it is ever needed).
- **Self-hosted assets only.** Fonts and scripts are served by us; there
  are no third-party embeds.

## 2. Features

Each feature lists what it maps to in the inventory and the WebCockpit
differences.

### 2.1 Connection and session

Mapped to Inv §9.

- **Session.** One character per tab. Connect, login, disconnect, and
  reconnect from the ESC menu. The menu opens automatically on disconnect
  (ADR 0058 behaviour).
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
    there.
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
  added only if the owner asks for them.
- **Visual system.**
  - Inv §10: palette tokens, pane frame, 7-step shade ramp and
    light-background variant.
  - Minimum size screen of 60×18 cells.
- **Appearance settings** (intent Goal 6):
  - font family, from bundled web fonts (Inv §12.1 #9);
  - font size 6–32;
  - padding;
  - terminal palette;
  - cursor style and blink.
- **Bundled fonts.** DejaVu Sans Mono (Cockpit's default) and JetBrains
  Mono are bundled. Both are checked for the box, block and quadrant
  glyphs the UI uses. (ADR 0049 adds thirteen more bundled families, fill
  faces for the glyphs some lack, and Lucida Console where installed.)
- **Settings take effect immediately**, from both the start page and the
  ESC menu. There is one settings store.

### 2.4 Right-column panes

| Pane | Inventory | Notes |
|---|---|---|
| Character | Inv §2.2 | Vitals, XP/TP gains, toggles, gauges. |
| Timers | Inv §2.6 | Grid view plus the trackers for affects, stored spells, cast queue, blinds, charm and herblore. Needs the game-data tables, rewritten in our own format. |
| Group | Inv §2.3 | Room-scoped membership, value freshness, NPC label promotion. |
| Communication | Inv §2.7 | Channel filters (global, as in Cockpit), right-click solo, per-channel colours, history kept across reloads. |
| UI messages | Inv §2.4 | Structured messages from the system and scripts. |
| Clock | Inv §2.5 | Shown in the input clock strip. Syncs from MSSP and game text. |

### 2.5 Start page (launcher)

Mapped to Inv §3.

- **Profile picker:** create, copy, delete, **import and export** (new).
- **Options:** panes, appearance and spotlights.
- **History, Statistics, Spotlights, Credits, About.**
- **Removed:** connection modes and the update flow. Updating means
  reloading the page.

### 2.6 ESC menu

Mapped to Inv §4.

- **Entries:** Continue/Reconnect, Statistics, Options, Profile (live
  editing with Apply, Discard or Keep editing), and Exit with a run
  rating.
- **Status header** with the `Link:` round-trip time.

### 2.7 Profile editor

Mapped to Inv §5.

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
  - History browser.
  - Log player, with play, pause, scrubber, jump and speed control.
  - Statistics.
  - Spotlights reel and Credits.
  - Export editor with cuts and comments. It exports plain text or a
    self-contained HTML replay.
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
- **Kept open:** the MMapper iframe route.
- **Nothing bundled.** Map data is never shipped with the client.

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
  nothing, and show a hint in the editor.
- **Nested definitions:** actions defined inside an alias are registered
  synchronously, in line order (Inv §6.4).

## 4. Testing

- **Unit tests** (Vitest) cover telnet, the line/XML parser, the script
  engine and round-trip.
- **Round-trip test corpus:** the owner's profile shapes. This is test
  data only; profile import is a non-goal.
- **Replay fixtures.** Raw session logs from Cockpit are read, never
  copied into the product, and replayed through a local fake socket.
  They drive:
  - parser and trigger tests;
  - the performance benchmark;
  - an offline **replay mode** the owner can use without logging in.
- **Browser tests** (Playwright) run in Firefox and Chrome.
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

## 6. Open questions for the owner

None. New questions are raised in the stage files (`docs/stages/`).
