# Stage 23 — Remote editing

Owner request 2026-10-07: built-in support for MUME's remote editing.
When MUME asks the client to edit a text (mail, notes, board posts,
descriptions), a pane opens as a small text editor. Texts MUME sends to
be viewed are shown in a read-only pane.

Found by the GMCP audit of 2026-10-07: WebCockpit subscribes to
`MUME.Client 1` (`src/net/gmcp.ts`) but nothing handles
`MUME.Client.Edit`/`View`. A player with `change editor mume` set (for
example from MMapper) gets an edit session that never opens, and viewed
texts are shown to nobody. The recorder also stores these messages, so
mail and board text ends up in runs and shared replays.

Spec §2.1 (session), §5 (stage table); ADR 0013/0015 (key routing),
ADR 0055 (script pane text fields), ADR 0051 (scripts, gmcp table).

## Owner decisions

- 2026-10-07: **Edit is a floating, closable pane**, placed like a
  temporary script pane. The game stays visible; several edits can be
  open; on the phone it is a tab.
- 2026-10-07: **View is a read-only, scrollable pane**, also closable.
- 2026-10-07: **WebCockpit only explains** how to switch it on
  (`change editor mume`, `change viewer external`) in the manual and
  About. The client never sends these game commands itself.
- 2026-10-07: **Edit/View text is kept out of recordings and exports.**
  A replay shows only a marker such as `[viewed: <title>]`.

## Protocol (research 2026-10-07)

Sources: mume.org/help `gmcp_mume.client`, `change_editor`,
`change_pager`, `local_editor`; MMapper 26.06 `src/mpi/` read as a
behaviour reference only (clean room, no code).

Server → client:

- `MUME.Client.Edit {id, title?, text, max-size}`: open an editor. The
  client must answer with `Write` or `CancelEdit`.
- `MUME.Client.View {title?, text}`: show text. No id, no reply.
- `MUME.Client.Write` / `MUME.Client.CancelEdit {id?, result}`: reply to
  ours; `result` is `true` or an error text. MUME prints nothing itself,
  so an error must be shown.
- `MUME.Client.Error {message}`: protocol error; no Write reply follows.

Client → server:

- `MUME.Client.Write {id, text}`: ISO 8859-1 only, no NUL, at most
  `max-size` bytes.
- `MUME.Client.CancelEdit {id}`.

The player opts in with `change editor mume` and `change viewer
external`; the GMCP subscription alone is assumed not to be enough.

MMapper behaviour worth matching: one window per session, monospace,
about 80×24, no soft wrap; Ctrl+S submits; a 79-column guide and long
lines marked; justify to 79 (like MUME's `%j`); quote lines; closing an
edited buffer asks first, closing an unedited one cancels; on
disconnect the buffer is kept and offered for copy/save. MMapper ignores
`max-size`; we should not.

## Part 0 — live probe (owner)

Before building, one session on a test character to settle the open
protocol facts. Steps are in the test guide below (Probe). The capture
is then read from a runs backup.

Open facts the probe settles:

1. Without the change commands, does editing stay in the line editor?
   After them, do Edit/View arrive over GMCP? Does MUME keep the
   settings per character?
2. Real payloads: is `title` present, the `max-size` values, does the
   text end with a newline, any CRLF?
3. Does `Write` need a trailing newline?
4. What `max-size` counts (Latin-1 bytes assumed), and what happens to a
   character above U+00FF.
5. Two edits at once: different ids, both valid?
6. Disconnect during an edit: is the id dead after reconnect?
7. No reply at all: is the character stuck, is there a timeout?
8. Are ANSI colour codes accepted in submitted text?

The probe needs a small developer aid, since nothing answers Edit yet:
part A ships first (privacy) and a hidden debug path to send `Write`/
`CancelEdit` is added only if the probe cannot be done otherwise.

## Plan

### A. Privacy (ships first, independent of the editor)

- The recorder leaves out the body of `MUME.Client.Edit`, `View` and
  our outbound `Write`; it records a marker with the title and size.
- Exports and shared replays never contain the text; the replay shows
  `[viewed: <title>]` / `[edited: <title>]`.
- Replay and the log player never open an editor from GMCP.
- The script `gmcp` table does not hold Edit/View text (decide: drop the
  package, or keep only title/id). Record in the ADR.

### B. Session model

- A remote-edit service keyed by MUME's id: open, submitted, cancelled,
  disconnected. View sessions have no id.
- Sends `Write`/`CancelEdit` via `session.sendGmcp`, encoding the text
  as Latin-1 regardless of the negotiated charset.
- Shows `Write`/`CancelEdit` error results and `MUME.Client.Error` as
  system messages. An Edit without an integer id is ignored with a
  system message.
- On disconnect: open edits become "disconnected"; submit then offers
  copy to clipboard and download instead.

### C. Edit pane

- Floating, closable pane (temporary-pane placement, remembered per
  device), title = MUME's title. Phone: its own tab.
- Plain-text CodeMirror: monospace, no soft wrap, 79-column guide, long
  lines marked, characters outside Latin-1 marked.
- Status row: line/column, bytes used of `max-size` (submit blocked when
  over), checks (tabs, trailing spaces, long lines).
- Keys: Ctrl+S submits; ESC with changes asks (submit / discard /
  keep editing), without changes cancels. While the pane has focus ESC
  does not open the menu; a click on the game or the input line gives
  focus back.
- Helpers: justify paragraph/selection to 79, quote lines. Offer to
  replace smart quotes and similar with Latin-1 equivalents.

### D. View pane

- Floating, closable, read-only, scrollable; ANSI colours rendered.
  Several can be open. Phone: a tab.

### E. Docs

- Manual (profile manual intro or a new Basics topic, and the script
  manual's GMCP chapter): what remote editing is, how to switch it on,
  the keys. About: one line. Document `MUME.Client.*` in the GMCP
  reference as far as scripts can see it.

### F. Tests

- Unit: session model, Latin-1 encoding and byte count, justify,
  privacy filter in recorder/export.
- E2E with a fake socket: Edit opens a pane, Ctrl+S sends Write, ESC
  flow, View pane, disconnect handling, replay shows only a marker.

## Tasks

- [x] Research protocol and MMapper behaviour (2026-10-07)
- [x] Owner decisions (2026-10-07)
- [ ] Part 0 live probe (owner) and analysis
- [ ] ADR for remote editing (design + privacy)
- [ ] A. Privacy
- [ ] B. Session model
- [ ] C. Edit pane
- [ ] D. View pane
- [ ] E. Docs
- [ ] F. Tests
- [ ] Release and owner test

## Test guide

### Probe (before building)

On a test character, in WebCockpit:

1. Without changing anything, start a mail to yourself (`mail <name>`)
   and see whether the line editor appears. Abort it.
2. Type `change editor mume` and `change viewer external`.
3. `mail <name>` again: nothing should open yet (that is what we are
   building). Wait a minute, try to move and type, then disconnect.
   Use a test character: it may stay in "editing" until the link
   drops.
4. Reconnect. At a board: `view <n>` on a post. Then `help -v help`.
5. Start a mail and a description (`describe`) one after the other.
6. Download a runs backup (History → BACKUP on the start page, as before) and tell
   Claude where it is.
7. If you want the old behaviour back: `change editor line`,
   `change viewer off`.

### After building

To be written when the stage is built.

## Owner feedback

(none yet)
