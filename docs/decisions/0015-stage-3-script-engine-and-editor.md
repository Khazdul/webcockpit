# 0015 — Stage 3: script engine, profile document and editor

- Status: Accepted
- Date: 2026-09-27

## Context

Stage 3 (spec §1.2 layers 5–6, §2.7, §3) adds the tt++ script engine,
the display pipeline, macros and the profile editor. Three builders work
on it: P1 (document model and key table) first, then P2 (engine) and P3
(editor) in parallel. This ADR fixes the contracts between them. The
builders add their own details below "Package notes".

## Decision

### Modules

| Module | Owner | Role |
|---|---|---|
| `src/script/doc/` | P1 | Lossless profile document model. Used by the editor and by variable write-back. |
| `src/script/keys.ts` | P1 | The one key table (Inv §1.2 lesson, ADR 0082 in Cockpit). |
| `src/script/engine/` | P2 | Command parser, interpreter, pattern compiler, rule stores, timers, display pipeline. |
| `src/editor/` | P3 | Preact + CodeMirror 6 profile editor. Its own lazy chunk, separate from `src/chrome/`. |

`src/script/` never imports the DOM, Preact or CodeMirror. It is pure
TypeScript, unit tested in Node.

### Two parsers, one language

- **The document model** understands file structure only: top-level
  entries (command word, brace arguments, trailing text), comments,
  blank lines, and passthrough. It never executes anything.
- **The engine** loads a profile by executing its top-level commands in
  order, as tt++ reads a file. It tokenises bodies (`;`, `{}`, `\`
  escapes) at run time with its own tokenizer, cached per body.
- Both share one command table (name, kind, minimum abbreviation,
  inert flag) in `src/script/commands.ts`, owned by P1.

### Document model contract

- `parseProfile(text)` never throws. Every byte of the input belongs to
  exactly one node; `serialize(parseProfile(t)) === t` for every `t`.
- Entries of the five lite kinds (action, alias, highlight, macro,
  substitute) and `#variable` are exposed as typed entries with
  pattern, body, optional priority and the command word as written.
- Editing an entry re-serialises only that entry, in canonical form
  `#<word> {pattern} {body}[ {priority}]`, keeping the command word as
  written and the priority. Untouched entries keep their exact text.
- **Order is kept.** A new entry goes after the last entry of the same
  kind (after the last entry of any kind if none, separated by a blank
  line). The lite list sorts for display only. This replaces Cockpit's
  canonical re-sort (Inv §5.9), which spec §2.7 rules out.
- `setVariable(doc, name, value)` rewrites only the value argument of an
  existing top-level `#variable` entry.

### Key names

- Canonical form: modifiers in the order `Ctrl+Alt+Shift+Meta`, then the
  key, from `KeyboardEvent.code` with the `Key`/`Digit` prefix dropped:
  `F5`, `Numpad0`, `NumpadAdd`, `Alt+A`, `Ctrl+Shift+F1`, `Alt+1`.
- Reading accepts case-insensitive names, `Numpad 0`-style display
  names and the tt++ escape forms (`\eOp`…, `\e[15~`…, `\ea`, `^G`); the
  text is kept as written. Display names follow Inv §5.6.
- **Not bindable:** bare ESC (menu), Enter, printable keys without Ctrl
  or Alt (letters, digits, punctuation, space, with or without Shift),
  and keys the browser keeps (Ctrl+W/T/N, Ctrl+Shift+W/T/N, Ctrl+Tab,
  Ctrl+Shift+Tab). Numpad keys are bindable with or without NumLock.
- **A bound macro wins** over the input line's own use of a key (for
  example Ctrl+A or Alt+B), as in tt++. Unbound keys keep their input
  line meaning. The editor warns when a macro shadows an input key.

### Engine contract

- `ScriptEngine` owns two rule stores. **User** is replaced as a whole
  by `loadProfile(text)`. **System** is written only through code
  (`engine.system`) and is never serialised.
- `loadProfile` is atomic: it builds a new user store and swaps it in
  only when loading finished. Timers from the old store stop at the swap.
- Actions from both stores fan out: every matching rule fires, in
  priority order (lower first, default 5, ties in definition order).
- Nested definitions (an action defined inside an alias) are registered
  synchronously, in line order (Inv §6.4).
- Input: `engine.input(text)` handles a typed line: `#` commands,
  aliases, `;` splitting, `$var` expansion, unused-argument append.
  Commands for MUME go to `Sender.sendCommand`, one per command.
- **Built-ins.** The stage 1 commands (`#connect`, `#disconnect`,
  `#reconnect`, `#runlog`, `#replay`, `#help`) join the command table as
  client commands. `_send` is a built-in alias that sends its argument;
  it cannot be shadowed by a profile alias (the editor warns).
- **Echo.** Every command sent to MUME is echoed, as in stage 1. `_send`
  therefore behaves like a bare command. (Owner feedback wanted.)
- Unknown `#` commands and inert commands report through `sys.message`.
- Timers (`#ticker`, `#delay`) use an injectable clock.

### Display pipeline and bus

- New bus event `text.display`: `{ line: Line; source: Line }` for each
  line that is shown; `line` is the displayed copy, `source` the
  original. A gagged line emits nothing. The output pane subscribes to
  `text.display` instead of `text.line`. Capture and all other taps keep
  using `text.line`.
- Order per line: actions (on the original), then substitutes, then
  gags, then highlights (on the substituted text).
- Partial lines (`text.partial`) get substitutes and highlights but no
  actions; actions run when the line completes.
- `#showme` lines are shown through the display pipeline and run
  actions, as in tt++, with a recursion guard. They are not captured.
- Colour codes (`<xyz>`, `<Frrggbb>`, `<Frgb>`, `<Brrggbb>`) become style
  runs; unknown codes are dropped silently.

### Live profile and write-back

- The selected profile loads into the engine when a session starts, and
  again on Apply from the ESC menu.
- **Runtime variables** (owner decision 2026-09-27): when a script sets a
  variable that has a top-level `#variable` entry in the saved profile,
  the saved text is updated with `setVariable` (debounced, flushed on
  `pagehide` and disconnect). Only after a complete load ("has loaded"
  guard, Inv §5.9). Write-back is applied to the latest stored text, so
  an edit made in the editor meanwhile is not overwritten.
- Everything else created at runtime (rules, new variables) lives for
  the session.
- Amended by 0038: definitions and `#un…` commands typed on the input
  line are written to the profile at once.

### Editor host

- `src/editor/` exports `openProfileEditor(host)`, where the host gives
  the profile name and text, whether the session is live, and
  `apply(text) → { ok: true } | { ok: false; reason }`. The start page
  and the ESC menu provide the host; the ESC menu's host calls the
  engine.
- CodeMirror 6 (MIT) is added as a dependency for the editor view only.

## Consequences

- The profile text is always the source of truth; the lite view is a
  view over document entries.
- The game output pane depends on the display pipeline, so the engine
  sits on the hot path. It is measured by the benchmark (spec §1.3).

## Package notes

(P1–P3 append decisions made while building.)

### P1 — document model, command table, key table

- **Command resolution** (`src/script/commands.ts`). The table lists every
  tt++ command, not only the ones we run, plus the client commands, in
  alphabetical order. A word resolves case-insensitively: an exact name
  wins, else the first name in alphabetical order that starts with the
  word, as tt++ walks its table (`#var`, `#act`, `#al`, `#sub`, `#show`,
  `#hi`, `#mac`, `#tick`, `#ses` all resolve as in tt++; `#re` is `#read`,
  `#con` is `#config`, `#conn` is `#connect`). Exception: a one-letter
  word that starts several names is `'ambiguous'` (tt++ would pick the
  first, so `#s` would silently be `#scan`). `minAbbrev` is derived from
  this rule. Tiers: `must`/`should` (spec §3), `client`, `inert` (file,
  shell, session, screen commands) and `unsupported` (real tt++ commands
  out of scope this stage: `#list`, `#foreach`, `#loop`, `#switch` …).
  Both of the last two have `inert: true` and a hint.
- **Document structure.** A node covers whole lines. A command runs to
  the line where its brace depth is back to 0, and also takes following
  lines that start with `{` (tt++'s `#class write` layout). A backslash
  escapes the next character except a line break. A typed entry needs
  all arguments braced: exactly 2 for macros and variables, 2–3 for the
  others with a numeric third (`5`, `-1`, `2.5`), and only whitespace
  after the last `}`. Unbraced forms (`#var x 1`) are passthrough
  (`malformed`). Each blank line is its own node.
- **Passthrough reasons:** `text`, `unknown` (including ambiguous words),
  `inert`, `command` (known but not typed, e.g. `#gag`, `#ticker`, `#if`),
  `malformed`. The editor can show the inert hint from `node.command`.
- **Edits are pure:** every edit returns a new `ProfileDoc`; untouched
  nodes are shared. Edits do not validate: callers use `validateEntry` /
  `isSafeArgument` first ("saving is never blocked", Inv §5.6).
- **Add placement:** after the last entry of the same kind; with none,
  after the last entry of any kind, with a blank line before it (and one
  after when text follows); with no entries, at the end after a blank
  line. The command word copies the last entry of the kind, else the full
  name, upper-cased when the file's entries are upper-case. New text uses
  the document's dominant line ending.
- **Remove rule:** when the removed node sits between a blank line and a
  blank line (or the end), the blank line before it goes too; when it is
  the first node and a blank line follows, that blank line goes. Blank-
  separated entries stay separated by exactly one blank line.
- **Body normalisation** is only `displayBody`/`storeBody`. `storeBody`
  returns the previous raw body when its display is unchanged, and
  stores an edited multi-line action/alias/macro body as
  `{\n    a;\n    b\n}` inside the canonical form.
- **setVariable** updates the last top-level definition of the name
  (the one that wins on load), case-sensitive, splicing only the value.
  It refuses (returns the same doc) a value with unbalanced braces or a
  trailing lone backslash.
- **Validation messages** use the kind's field labels (`Key required` for
  macros, `Unbalanced braces in New text` for substitutes), with the
  Inv §5.6 precedence.
- **Keys** (`src/script/keys.ts`). Display: letters lower-case unless Shift
  is held (`Alt+a`, `Ctrl+Shift+A`), `Up`/`PgDn`/`Del`/`Ins`/`Esc`,
  punctuation as its character. Escape forms also cover xterm modifier
  forms (`\e[15;5~`, `\e[1;2P`), cursor keys and `\e<Upper>` =
  Alt+Shift. Bindability follows the ADR list; Meta+letter counts as
  printable (needs Ctrl or Alt). Lite sort (`compareKeys`): keys without
  modifiers first, then by modifier set (Shift, Alt, Alt+Shift, Ctrl, …);
  inside a set F-keys, numpad, letters, digits, navigation, editing,
  punctuation; unknown keys last. `INPUT_LINE_KEYS` lists what the input
  line (and the native text field) does with a key, for the editor's
  shadow warning. AltGr on Windows arrives as Ctrl+Alt: P2 should ignore
  keydowns with `getModifierState('AltGraph')` when matching macros.

### P2 — script engine, display pipeline, app wiring

- **Layout** (`src/script/engine/`): `text.ts` (splitting, arguments,
  `%N`/`$var` expansion, escapes), `pattern.ts`, `expr.ts` (#if/#math),
  `format.ts`, `color.ts` + `runs.ts` (colour codes → style runs),
  `store.ts` (RuleStore), `timers.ts` (injectable `Scheduler`,
  `FakeScheduler`), `engine.ts` (ScriptEngine). No DOM.
- **Splitting.** A command list splits at `;` outside braces; newlines are
  whitespace (a profile's top-level commands come one per document node).
  A backslash protects the next character and stays in the text until the
  text is used (sent, shown), so nested levels still see it; then
  `\\ \; \{ \} \$ \% \&` lose the backslash and a line break inside a
  command becomes one space. Parsed lists are cached by text.
- **`%` rule (Inv §5.9, Cockpit ADR 0081).** `%0`–`%99` are replaced in a
  rule body before it is split, as tt++ does. A run of n > 1 `%` before
  digits loses one `%` and is not replaced (`%%1` → `%1`, one level
  later), which is how an alias defines an action with captures. A `%`
  not followed by a digit is never touched, so `#format` codes pass
  through; a code with a width inside a body needs doubling (`%%5d`).
  Missing arguments are ''.
- **Variables.** `$name`, `${name}`; an unknown variable stays as written.
  `&name` is `1` for a defined variable and stays as written otherwise
  (the evaluator reads a leftover `&name` as 0). `$$name` → `$name`.
  Expanded per command at run time in: game text, `#variable` name and
  value, `#showme`, `#if` conditions, `#math`, `#format`, timer times,
  client-command arguments, substitute text. Definition bodies are stored
  raw. Patterns with `$var` are compiled at match time (cached by text).
  User variables are looked up before system ones.
- **Aliases.** Matched on the variable-expanded command. `_send` is
  checked first and cannot be shadowed. Then the first alias by priority
  (ties: definition order) among (a) plain names — the first word equals
  the name (a name with spaces must be followed by a space or the end);
  `%0` is the rest, `%1`… its words (a `{…}` group is one word); when the
  body has no `%N`, the rest is appended (tt++ unused-argument append) —
  and (b) pattern aliases, matched anchored at the start, arguments from
  the captures, no append. An alias never re-enters itself: its own name
  in its body goes to the game (`#alias {look} {look;exits}` works).
  Nesting stops at 32.
- **Patterns.** Explicit `%N` fills argument N; every other wildcard
  (`%*`, `%d`, `{regex}` …) fills the argument after the highest used so
  far (tt++'s numbering; in `{a|b} %1` both land in %1). `%N`/`%*`/`%+`
  are lazy unless they end the pattern. `%+n..mX` = n to m of X, `%+n..X`
  = n or more, `%+nX` = exactly n. `%i` makes the whole pattern
  case-insensitive. Word characters include U+00C0 and up (`é`, `ẃ`).
  Each pattern keeps its longest literal for an `indexOf` pre-check, which
  is what keeps 500 rules at ~20 µs per line.
- **#if.** The chain state belongs to the command list: `#if {…} {…};
  #else {…}` works, and so does `#if {…} {…} #else {…}` without `;` (the
  text after the branches continues the chain, as tt++ accepts). A quoted
  or braced operand is a string; `==`/`!=` compare strings when either
  side is one, with `*` in the right-hand side as a glob; `<`/`>` are
  lexical for two strings. Unquoted non-numbers are strings. #math keeps
  tt++ precision: as many decimals as the most precise literal (`7/2` =
  3, `7.0/2` = 3.5).
- **Actions** of both stores fan out in priority order, ties by
  definition order (one counter across both stores). Redefining a key
  replaces the rule and counts as a new definition. Lists are
  copy-on-write: a rule defined while a line runs its actions applies from
  the next line. `%0` is the matched text.
- **Display copy.** Substitutes replace every match (an anchored pattern:
  the first). Replacement text starts in the style of the replaced text
  and its colour codes apply to the end of the replacement only — unlike
  tt++, where an ANSI code leaks into the rest of the line. A substituted
  copy has no XML tags. Gags test the substituted text. Highlights set
  only the fields they name (fg, bg, underline, blink, reverse, bold) on
  every match. Unknown code-shaped tags (`<900>`) vanish; other `<text>`
  stays.
- **Bus (small additions to the contract).** `text.display` carries
  `local: true` for `#showme` lines: the output pane puts them above a
  pending partial instead of treating them as the line that completes it.
  Partials go out as a separate event, `text.displayPartial` (same
  payload). A gagged line emits an empty `text.displayPartial`, so the
  partial it completes is cleared.
- **Guards.** Alias nesting 32; `#showme` → action → `#showme` nesting 8
  (then actions are skipped, one message); 10 000 commands per entry
  (typed line, received line, key, timer, event); `#N` repeats at most
  100; tickers at least 50 ms apart.
- **Hints.** Inert and unsupported commands give their `CommandEntry.hint`
  once per command per profile load, and every time when typed. Unknown
  words: `Unknown command: #x`; one-letter ambiguous words:
  `Ambiguous command: #s`.
- **#event** list: `SESSION CONNECTED` (%0 `mume`), `SESSION
  DISCONNECTED` (%0 `mume`, %1 the reason), `IAC SB GMCP <Package>` (%0
  the package as sent, %1 the JSON text; case-insensitive) and `IAC SB
  GMCP` (every message). Replays fire them too.
- **Macros.** Keys are normalised with `normalizeKey` and must pass
  `keyBindability` when defined (a profile cannot bind `a` or Ctrl+W).
  A user macro wins over a system one.
- **#class** supports open, close and kill (`clear` = kill); kill removes
  the class's rules, variables and timers. **#delay** takes `{seconds}
  {commands}` or `{name} {commands} {seconds}`. The rule commands,
  `#variable`, `#ticker` and `#delay` list what they hold when given no
  arguments (or only a pattern).
- **loadProfile.** Refuses unbalanced braces outright (`reason` names the
  line). Otherwise runs each non-blank document node in order into a new
  store; commands that would go to the game and client commands are not
  run while loading, and a top-level line that is not a command is
  ignored; each is a `line N: …` warning. The old store's timers stop at
  the swap. Runtime-created rules and variables vanish at the next load.
- **Echo.** The engine sends each command through `Session.sendCommand`,
  which emits `cmd.sent`, so every command is echoed as sent — an alias
  shows its expansion, not the typed word; `_send x` looks like typing
  `x`.
- **App.** `App.script` is the engine; `App.applyProfile(text)` as agreed
  (atomic; `{ ok: false, reason }` leaves the running profile). The
  selected profile loads at start-up (quietly) and at every live
  `connecting` (`Profile X loaded.`, or up to 10 warnings). While
  disconnected, the first command a typed line or a macro would send
  reconnects (offline: says how to connect) and is dropped; commands from
  rules and timers are dropped silently. Password mode never reaches the
  engine. `onMacroKey` in `InputPane` runs before the pane's own keys.
- **Write-back** (`src/app/writeback.ts`): user-store variable sets at
  run time are queued for the loaded profile, debounced 1 s, flushed on
  `pagehide` and disconnect. A flush reads the latest stored text, applies
  `setVariable` for each queued name (only top-level `#variable` entries
  change) and saves when the text changed. The target is set only after a
  successful load from the store (or by `applyProfile` when none was).
- **Uncertain tt++ details decided here** (revisit if the owner's habits
  disagree): the GMCP event arguments, `&var` = 1, `%+nX` = exactly n, and
  glob `*` only on the right-hand side of `==`.

### P3 — profile editor

- **Host shape.** `src/editor/` exports `ProfileEditor` (a Preact frame)
  and `openProfileEditor(nav, host)`, which pushes it on the chrome's frame
  stack (ADR 0013), so the editor inherits the surface, grid, services,
  focus trap and flash of whoever opened it: full screen on the start
  page, inside the 80 % box in the ESC menu (1 blank row above the title
  there, 2 on the start page, Inv §5.1). The host is
  `{ name, text, isLive(), save(text) → Promise, apply?(text) → ApplyResult | Promise }`
  with `ApplyResult = { ok: true; warnings } | { ok: false; reason }`.
  `src/chrome/frames/profile-edit.ts` builds it from `ProfileStore` for
  both entry points.
- **Close (ESC).** The text to save is the buffer (EDITOR) or the
  serialised document (LITE). Unchanged → pop silently (both hosts; we do
  not re-save an untouched profile from the start page). Not live → save,
  pop, flash `Saved <name>.`; on a failed save the editor stays open with
  `Save failed: <reason>` and a second ESC leaves without saving (edits are
  never lost silently). Live → `Apply changes to your profile?` modal:
  `Y` shows `Applying…` (keys swallowed; one task yielded so it paints),
  calls `apply`, then `save`; success flashes `Profile updated.` (plus the
  first warning), failure pops with `Profile not applied: <reason> The
  running profile is unchanged.` `N` discards, ESC keeps editing.
- **Live apply adapter.** `Shell` passes `liveApply: () => liveApplyOf(app)`
  to the ESC menu; `liveApplyOf` feature-detects `App.applyProfile` (P2)
  and returns null without it, in which case Apply only saves and flashes
  `Saved <name>. It loads on the next connect.` The menu reads the stored
  text of the selected profile as the live snapshot. To tighten at merge.
- **Key routing.** The frame stack stops every keydown at window capture
  (ADR 0013), so CodeMirror's own keydown listener never runs. The frame's
  handler runs the buffer's bindings with `runScopeHandlers(view, e,
  'editor')` (CodeMirror's public API for custom key dispatch) and returns
  its result; unhandled keys keep their default action (the stack does not
  prevent it inside a contenteditable), so typing reaches CodeMirror as
  native input, and paste, cut and copy are native events on its content.
  Lite text fields are native `<input>`/`<textarea>`: the handler takes
  only Tab, ESC and the fall-through keys (↑ from Pattern, ← at offset 0)
  and leaves the rest to the field.
- **Mouse.** The stack stops `mouseup` at its host (the game input
  refocuses on document mouseup). It now lets it through for targets
  inside `[data-wc-native-mouse]`, which CodeMirror's content carries, so
  its drag selection ends normally; the game input ignores editable
  targets.
- **CodeMirror set-up** (`cm.ts`): `@codemirror/state`, `view`, `commands`
  only (no language package; `commands` pulls `@codemirror/language` and
  Lezer transitively). tt++ highlighting is a ViewPlugin of mark
  decorations from our own lexer (`syntax.ts`, Inv §5.7 classes, colours
  from `--c-syn-*`). Brace matching, the balance count and `Ln, Col` come
  from one structural scan per document change (profiles are small).
  `history({ minDepth: 200 })` with CodeMirror's time-based grouping
  (Cockpit had no time boundary; accepted). Alt+↑/↓ is defaultKeymap's
  moveLineUp/Down, which also moves a selected block (Cockpit swapped one
  line only). Ctrl+C/X without a selection is CodeMirror's line-wise copy;
  `Copied`/`Cut` flash from copy/cut observers. Native selection (styled
  C_SELECTED) and caret; the scrollbar is a 1-cell `█`/`░` column drawn by
  the frame (track click pages; no hold-repeat). `EditorState.lineSeparator`
  is the document's dominant line ending, so a CRLF or mixed file
  round-trips byte for byte (a stray CR stays a character).
- **Auto-close.** An `inputHandler` turns a typed `{` into `{}` when the
  next character is the end, whitespace or `}`; a state field keeps the
  tentative `}` positions (innermost last). Typing `}` on one steps over
  it, Backspace right after the insert deletes both, and any selection
  move by the user, undo or redo ends the tracking. Paste never
  auto-closes.
- **Inert commands.** A `#word` token that resolves to an inert or
  unsupported command gets a wavy C_NOTE underline and its hint as a
  title; with the cursor on that line the footer shows the hint.
- **Lite model.** A lite edit is a P1 edit (`editEntry`, `addEntry`,
  `removeEntry`); bodies go through `storeBody(kind, shown, entry.body,
  doc.eol)`. The Commands box keeps a per-entry draft of what was typed,
  because `displayBody` trims trailing blank lines (a just-typed Enter
  would otherwise vanish). Entries created or edited in this lite session
  whose pattern is still empty are dropped on save and on a flip.
  New entries sit last in the list until the next flip. Highlight colours
  map to the settings' ANSI palette (`--ansi-1..7` dark, `--ansi-9..15`
  bright); `White` is ANSI 15, not Cockpit's grey. Bright colours are
  written Capitalised (`Red`); bodies with anything else (`bold`, RGB)
  stay verbatim until a swatch is touched.
- **Capture overlay.** Rejected keys show `bindability`'s reason (e.g.
  `The browser keeps that key.`) instead of Cockpit's fixed text; AltGr
  combinations are rejected. Keys are stored canonically (`F5`, `Ctrl+A`).
- **Chunks** (production build): the editor is its own chunk, 321 kB
  (105 kB gzip) + 2.9 kB CSS, fetched when EDIT / Profile is used, or when
  idle 2 s after the start page is up. The chrome chunk split into chrome
  (27.5 kB) and the kit shared with the editor (25.8 kB); together the
  same size as before (+1 request). Cold start (`vite preview`, Chromium,
  20 Mbit/s, 40 ms RTT, Playwright goto → menu row visible): median 418 ms,
  with no editor bytes before the menu.
