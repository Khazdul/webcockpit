# 0025 — Versioning and update notices

- Status: Accepted
- Date: 2026-09-28

## Context

The client is about to be shared publicly (Discord). A tab stays open for
hours, and reloading it disconnects from the game, so a tab keeps running
the build it was loaded with while new releases are published (ADR 0022).
Until now the version was always `0.0.0`, the client never looked for a
newer release, a lazy chunk removed by a later publish failed without a
word, and a tab whose database had been upgraded by a newer tab silently
kept its changes in memory only.

## Decision

### Versioning

- Semantic versioning in `package.json`; `0.1.0` is the first public
  release. **Every publish bumps the version** (normally
  `npm version patch --no-git-tag-version`, committed before publishing).
  `npm run publish` refuses a version equal to the live release's
  (`scripts/publish-guard.ts`); `--dry-run` only warns; `--rollback` is
  unaffected. So "another version on the site" always means "another
  release".
- The build also embeds the git short commit: `__WC_COMMIT__` (Vite
  `define`, `git rev-parse --short HEAD` at `vite build`; `dev` in the dev
  server, in Vitest and when git is unavailable). `src/core/build-info.ts`
  exports `CLIENT_VERSION` and `CLIENT_COMMIT`. About shows
  `0.1.0 (abc1234)`; GMCP `Core.Hello` still sends the version only.
- `vite build` emits `release.json` = `{ version, commit }` at the site
  root, so every build (the smoke test's, `vite preview`'s) has one.
  `npm run publish` overwrites it with the full manifest (ADR 0022).

### Update check

- `src/app/update-check.ts` (pure; fetch and clock injected):
  `UpdateChecker.check()` fetches `/release.json` with
  `cache: 'no-store'`, at most once a minute unless forced; a check in
  flight is shared. The served release is "newer" when its version
  differs, or its commit differs and both commits are known. Each such
  release is reported once. Every failure (offline, 404, bad JSON) is
  silent.
- `src/app/notices-wiring.ts` checks when the page becomes visible, when
  the window gains focus, and every 10 minutes. Not at start-up: the page
  was just loaded and `index.html` is `no-cache`.
- Only in production builds (`!import.meta.env.DEV`) and not in `?bench`
  (`src/main.ts`). The log player and the exported HTML replay are other
  entry points and have no check.

### Notices

`src/app/notices.ts` holds the state and says each notice once:

| Notice | Indicator (tooltip) | Output line (`[SYSTEM] …`) |
|---|---|---|
| newer version | `Update: 0.1.3` in C_YELLOW ("WebCockpit 0.1.3 is available (this tab runs 0.1.0). Reload (F5) when convenient – reloading disconnects from the game.") | `WebCockpit 0.1.3 is available – reload (F5) when you are somewhere safe.` |
| lazy chunk failed | (forces an update check, which sets the indicator above) | `A newer version of WebCockpit was published; this part of it could not be loaded. Reload (F5) to use it.` |
| storage superseded | `Storage: not saved` in C_ERR ("Storage upgraded by a newer version in another tab – changes here are no longer saved. Reload (F5).") | the tooltip text |

- The indicator sits in the cockpit's input row, left of the clock strip
  (the cockpit has no status bar; this is its one always-visible status
  row). The ESC menu's status header and the start page's footer show the
  same indicators.
- The output line is a `sys.message` (the client's own `[SYSTEM]` lines),
  plus a short UI pane line (`⚠ WARN:` / `✖ ERROR:`). Notices raised
  before the cockpit exists are replayed into it when it is built.
- **Never an automatic reload.** The cockpit indicator is informational;
  clicking it does nothing, because an accidental click while playing
  would disconnect. The start page footer's `Update 0.1.3: reload` is
  clickable: no game is connected there, and a click is an explicit
  action.

### Failing loudly

- **Lazy chunks.** Vite dispatches `vite:preloadError` when a dynamic
  import (or its preloads) fails. The listener does **not** call
  `preventDefault()`: with it, Vite's helper would resolve the import to
  `undefined` instead of rejecting it, and the existing call sites (the
  chrome retries its import, the player reports that it could not open)
  rely on the rejection. A failed dynamic import that nobody handles
  reaches `unhandledrejection`; the listener recognises it by the browser
  messages ("…dynamically imported module…", "Importing a module script
  failed", "Unable to preload CSS") and marks it handled after logging a
  warning. Either path shows the chunk notice once and forces an update
  check.
- **Superseded database.** `src/core/db.ts` reports it through
  `onDbSuperseded(fn)`: a `versionchange` whose `newVersion` is higher
  than `DB_VERSION`, or an open that fails with `VersionError`. A
  deletion (`newVersion` null), a missing IndexedDB (private mode) and any
  other open failure are not reported. The stores are unchanged: they
  still fall back to memory; the notice only makes that visible. The
  settings store keeps a main-thread connection open, so the
  `versionchange` is seen even if nothing is being saved; a report from
  the map worker's own connection stays in the worker (harmless).

### No service worker

A service worker would add a second cache with its own update life cycle
to a site that already has correct HTTP caching (ADR 0022: `index.html`
`no-cache`, hashed assets immutable, one carried generation). Its usual
benefits (offline start, instant updates via `skipWaiting` + reload) do
not apply: the client is useless offline, and an update that takes over a
running tab or reloads it is exactly what must not happen mid-game. A
manifest fetch on focus gives the user the information; the user decides
when to reload.

## Consequences

- Every publish needs a version bump commit; forgetting it stops the
  publish with instructions.
- A tab learns about a new release within about ten minutes, or at once
  when the user comes back to it.
- After a rollback the live version differs from what newer tabs run, so
  they are told that the (older) live version "is available". Reloading is
  what they should do then too.
- A map worker script that fails to load (a module worker, not a dynamic
  import) is not covered by the chunk notice; the Map pane reports its own
  load failure.

## Amendment 2026-09-29 — one release path (ADR 0029)

`npm run publish` and `scripts/publish-guard.ts` are gone. The version
rule is `versionGuard` in `scripts/release.ts`, applied by
`npm run build:pages` against the live `release.json` (ADR 0028), and
that build writes the full manifest. `--dry-run` and `--rollback`
belonged to `npm run publish` and are gone with it.

## Amendment 2026-09-29 — start surface notices on every frame

The start page footer token (C_HINT, main frame only) went unnoticed: in
Profile, Options, History and the other sub-frames nothing showed a newer
version until the user entered the game. The notices now sit on the start
surface's top row, right-aligned, above whichever start frame is shown
(every start frame leaves that row blank): `Update 0.1.3 available:
reload` in C_YELLOW, clickable (reloads; no game is connected there), and
`Storage: not saved` in C_ERR (`StartNotices` in `src/chrome/index.tsx`).
The footer token is gone. The cockpit indicator and the ESC menu header
are unchanged.
