# Cloud: what the client stores today

Research for spec §7 (accounts, sync, sharing). Read from the code at
v0.9.1 (commit 9a7f304d), 2026-11-13. Not authoritative: the code is.

## IndexedDB `webcockpit`, version 8

`src/core/db.ts`: `DB_VERSION` :55, stores :58-71, upgrade chain
:137-168 ("never edit an old step"). A newer tab's upgrade makes this
tab fall back to memory with a notice (:44-52). No store has a
revision, an ETag or a tombstone.

| Store | Key | Record | Owner |
|---|---|---|---|
| `runs` | `runId` = `<Character>/<local start>` | `RunMeta` (`src/capture/store.ts:24-43`): character, startedUs, endedUs, sealed, bytes, lines, saved?, rating?, savedUs?, summary? | `src/capture/store.ts`, `src/runs/store.ts` |
| `runChunks` | `[runId, seq]` | `{runId, seq, firstUs, lastUs, text}`, ≤ 256 KB each | same |
| `runEvents` | `[runId, seq]` | `{runId, seq, event}` | `src/runs/store.ts` |
| `exports` | `sessionId` (the chain's first runId) | `ExportDoc` (`src/share/edits.ts:41-51`) | `src/runs/library.ts` |
| `settings` | `'main'` | `Settings` (`src/settings/types.ts:623-642`), own `version` (6) | `src/settings/store.ts` |
| `profiles` | `name` | `{name, text, created, modified}` | `src/profiles/store.ts` |
| `scripts` | `id` (uuid) | `{id, name, source, enabled, created, updated}` | `src/scripts/library.ts` |
| `scriptData` | `name` | `{name, enabled?, settings, store}` | same |
| `comm` | `seq` (auto) | `CommRecord`, 7 days | `src/gmcp/comm-archive.ts` |
| `timers` | `character` | `{character, savedAt, state}` | `src/timers/archive.ts` |
| `maps` | `'current'` | one imported `.mm2` | `src/map/store.ts` |
| `mapIds` | `[mapHash, serverId]` | locator's learned ids | map worker |

## Other browser storage

- `localStorage`: `webcockpit.appearance` (first-paint copy of
  `settings.appearance`), `webcockpit.tempPanes`, `wc.clock`,
  `wc.scripts.running`.
- `sessionStorage`: `wc.ui.messages`, `wc.perfOverlay`.
- No Cache API, no service worker, no manifest.
- Web Locks: `webcockpit-run-<character>` (one writer per character),
  `webcockpit-sweep` (one tab runs retention).

## Facts that shape sync

- **Profiles are keyed by name.** A rename is put-new then delete-old
  (`src/profiles/store.ts:145-156`). There is no id. `default` cannot
  be renamed or deleted; first run seeds `default` and `khazdul`.
  Typed settings and script `#variable` changes are written back into
  the profile text (`src/app/writeback.ts`), so a profile changes
  during play.
- **Scripts** have a uuid, but the name is the identity everywhere
  else (unique over bundled and user scripts; the uuid is not in the
  backup file). Bundled scripts are not stored, only their
  `scriptData`.
- **`scriptData`** has no timestamp. It holds valuable game data (the
  key manager's port keys per character, almanac events, mercenaries).
  Written behind, about 1 s.
- **Settings are one record per origin.** It holds appearance, panes,
  the desktop/tablet docking `layout`, `windows`, the selected
  `profile`, group, comm, timers, spotlights (character names),
  output, input, mapper, weather, and the whole `phone` section
  (`src/settings/types.ts:463-511`). Desktop, tablet and phone share
  the record; device detection only picks the defaults a new record
  starts with (`phoneDefaultSettings` :755; `src/settings/store.ts`
  :57-64). Writes are debounced 200 ms.
- **Runs.** A session is a chain of runs of one character with gaps
  under 1 h (`src/runs/stitch.ts:15`), named by its first runId.
  `saved`, `rating`, `savedUs`, `summary` change after sealing. Raw
  log about 1 MB per played hour (4.7 MB for 5.4 h in ADR 0019).
  Unsaved sealed runs are deleted after 14 days
  (`src/runs/library.ts:221-250`).
- **Saving a run** happens in the Exit popup ("Rate & save this run",
  0–5 stars; `src/menubar/exit-popup.ts`, `src/phone/exit-sheet.tsx`)
  through `LiveRuns.saveChain` (`src/runs/live.ts:133-139`), or later
  in History (`src/chrome/frames/history.tsx:300`). `exitSession`
  (`src/app/shell.ts:418-434`) seals the run and shows the start
  page.
- **Runs backup format**: `webcockpit-runs-<date>.jsonl.gz`, header
  `{"type":"webcockpit-runs","schema":1}`, then per run its meta,
  events and chunks, then the export docs
  (`src/runs/library.ts:265-361`). Restore adds only unknown runIds.
- **Scripts backup format**: `webcockpit-scripts-<date>.json`,
  `schema: 1` (`src/scripts/backup.ts`).
- **A shared run** is a `ReplayPayload` (`src/share/payload.ts:86-117`,
  schema 1): title, character, level, the exporter's settings without
  `phone`, the edited run texts with excluded content already removed,
  comments, cuts, markers, an optional map subset. In the HTML file it
  is gzip + base64 JSON beside the fonts and the replay runtime
  (`src/replay/export.ts`). The runtime (`dist/replay/replay.js`,
  1.4 MB) touches no IndexedDB, localStorage, fetch or WebSocket
  (`src/replay/page.ts:17-24`).
- **MUME credentials are never stored** (`src/phone/login-vault.ts`;
  secret commands are blanked in `src/net/session.ts:395-407` and
  skipped by the recorder).
- **Network today:** the game WebSocket, `release.json` polling
  (`src/app/update-check.ts`), same-origin assets. No telemetry.
- **Hard-coded site references:** `scripts/pages-build.ts:29` (live
  URL), comments in `vite.config.ts`, `update-check.ts`, `pages.yml`,
  `playwright.prod.config.ts`.

## Not synced by the plan (stays per device)

Comm history, timers state, the imported map and `mapIds`, unsaved
runs, everything in `localStorage` and `sessionStorage`, the profile
editor's place (ADR 0143), the login vault.

## Not measured

The size of the settings record and of a current HTML replay export.
