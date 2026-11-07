# Night pass plan (next session, planned 2026-11-07)

The owner wants one very long, autonomous session overnight with many
subagents. Read, in order: `CLAUDE.md`, `progress.md` (top and the last
session-log entry), this file, `README.md` in this folder (rounds 1–6 and
the **Baseline**), `docs/stages/41-start-page.md`.

The owner is asleep: **do not ask questions**. Decide technical matters and
record them (ADRs). Owner decisions that cannot be made now go to an
"Open questions for the owner" list in the morning report.

## Original goal of the whole effort (owner, 2026-11-06)

Leave the TUI look for the start menu and every page reached from it, and
give it a "wow", living feel; a new banner with recognition value; a
background with weather that follows MUME's day/night and season offline
(snow in winter). Includes the Profile editor and the Scripts editor.
Mockups with clearly different directions before anything is built; the
start menu first so the rest can follow it. Keyboard and phone stay
first-class; no sound; the quote stays.

## Owner decisions on 2026-11-07 that widen the scope

0. **Wordmark: variant 3 "Inlagd metall"** (`round6/logo-3.html`), not 1.
   **The inlay and rivets become a bluish/cyan metal** echoing the early
   pixel logo (`#00d0d0` / `#0a9a9c`), not brass; see the stage 41 file.
1. **Favicon: an "M"** in the wordmark's iron with the inlay.
2. **Spotlights and the run player are now in scope** too (they were
   excluded on 2026-11-06). They must fit the new aesthetic.
3. **Every page reached from the start menu is shown in a box** of the same
   kind as the start menu panel and the mockup's Profile page.
4. **Content-heavy pages** (e.g. Spotlights, the run player, the Profile
   editor, the Scripts page/editor, History, the Export editor) use the
   **largest possible box, nearly filling the window**. The wordmark then
   **hides or becomes very small up in a corner** to make room — explore in
   mockups.
5. **Scope = everything reachable from the start menu, also in several
   steps**: Profile list, Profile editor (`src/editor/frame.tsx`), Import
   (`import-load.ts`, `import-report.tsx`), Export editor and its input
   (`export-editor.tsx`, `export-input.tsx`), Scripts page
   (`scripts.tsx`), the script editor (`src/editor/script-frame.tsx`) and
   the script manual (`script-manual-frame.tsx`, `manual-view.tsx`),
   History (`history.tsx`) and the run log player and HTML replay player
   (`src/player/`, ADR 0114 "ghost look"), Spotlights (`spotlights.tsx`),
   Credits, About. Not the in-game popups, not the phone's ESC menu and
   its Options pages.
6. **In-game, the Scripts and Profile editors stay windows** that can be
   moved and resized as today (stage 30b, `src/chrome/windows.tsx`). They
   get **new borders matching the new layout**, and their **content** goes
   from TUI to the new aesthetic. They must **work visually together with
   the in-game panes (Lykta, ADR 0123) and the menu bar** (stage 30).
7. Release: **branch only** — nothing merged to main, no tag, no deploy.

## Part 1 — Build the start page (stage 41)

Follow `docs/stages/41-start-page.md`. Branch `stage-41-start-page`. Use
subagents for the parts (sky engine, wordmark/favicon, layout, first paint,
kit + Profile list, cleanup/tests); the main session plans, reviews
screenshots and verifies (unit tests, e2e, typecheck, lint, bench where
relevant). Not merged.

## Part 2 — Mockups for every other page

For each page in decision 5 (except the Profile list, built in part 1, and
note the start page itself is done):

- Read the page's real code first and list its real content, states and
  actions (fields, lists, buttons, keys, empty and error states, phone
  layout). Mockups must show real content, not placeholders.
- Make **2–3 clearly different directions per page** within the approved
  aesthetic (the box, the Lykta iron, glass buttons, Back top left, the
  restrained selection, shortcut letters in labels, Cormorant/Cinzel type,
  the sky behind). Same structure as the earlier rounds: a shared base and
  variants, one self-contained HTML per variant, Playwright screenshots
  (gitignored), self-review and iteration.
- Explore decision 4 explicitly: the largest box and what happens to the
  wordmark (hidden, tiny in a corner, moves up as the box opens, …), with
  the transition between the start menu and a big page.
- Group the pages into a few review pages (artifacts) with tabs, e.g.
  "Profiles (editor, import, export)", "Scripts (page, editor, manual)",
  "History and players", "Spotlights", "Credits and About". Put the links
  in the morning report.
- **Do not build any of these.** The owner chooses first.

## Part 3 — The editors inside the game

For the Profile editor and the Scripts page/editor, the mockups in part 2
also show the **in-game window** version (decision 6): a movable,
resizable window over the game with the new border, next to Lykta panes
and the menu bar, on the dark and the Paper background. The content is
the same as from the start page; only the frame and context differ. Show
both contexts side by side for each direction.

## Morning report (end of the pass)

- What was built (stage 41 checklist state, branch, commits, test results,
  perf numbers), the test guide.
- Links to all mockup review pages, with a one-line summary per direction.
- Open questions for the owner.
- Session log entry in `progress.md` and the stage table updated, as
  CLAUDE.md requires.
