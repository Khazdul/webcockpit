# Build pass plan: every start-menu page (planned 2026-11-07)

One long, broad session that builds all remaining start-menu pages in the
new look with many subagents. Read, in order: `CLAUDE.md`, `progress.md`
(top and the last two session-log entries), this file, the README in this
folder ("Baseline", round 7, "Round 7 decisions"), then the stage files
`docs/stages/41-start-page.md` and `42-…` to `47-…`.

The owner may be away: **do not ask questions**. Every stage file states
the default to build when an owner question is open; follow it and list
the question in the final report. Decide technical matters yourself and
record them in the ADRs assigned below.

## Goal

Every page reachable from the start menu in the new look (owner's goal of
2026-11-06, NIGHT-PASS.md), built from the round 7 directions the owner
chose on 2026-11-07, on top of stage 41 (new start page, sky, mithril
wordmark, lantern kit, Profile list with row actions, Enter MUME
transition). Keyboard and phone stay first-class; no sound; every current
function keeps working.

| stage | file | what | ADR |
|---|---|---|---|
| 42 | `docs/stages/42-look-pages-base.md` | shared base: big box "B Rummet växer", kit controls, dialogs, window frames, CodeMirror look, manual, player core | 0127 |
| 43 | `docs/stages/43-profile-pages.md` | Profile editor (B Ryggen), Import (C), Export (B with toggle + EXPORT) | 0128 |
| 44 | `docs/stages/44-script-pages.md` | Scripts page (C), script editor (C Fokus), manual (A Boken) | 0129 |
| 45 | `docs/stages/45-history-player.md` | History (A, width cap), run log player (today's + Back) | 0130 |
| 46 | `docs/stages/46-spotlights.md` | Spotlights (B Galleriet) | 0131 |
| 47 | `docs/stages/47-credits-about.md` | Credits (B Krönikeboken, no Opening tab), About (A Bladet) | 0132 |

## Rules

- **Integration branch: `stage-41-start-page`** (everything lands there;
  the owner merges and releases only after testing the whole). Do not
  merge to main, do not tag, do not deploy.
- **Worktrees are created from `main`, not from the current branch.** Every
  subagent that works in a worktree must first run
  `git merge-base --is-ancestor stage-41-start-page HEAD || git reset --hard stage-41-start-page`
  (its tree is fresh) and, in wave 2, reset to the integration branch tip
  that already contains stage 42. Say this in every brief.
- Each subagent uses its **own e2e port** (`WC_E2E_PORT`, e.g. 5300 + n)
  and never kills processes by pattern (`pkill -f` can kill the session's
  own shell); stop a dev server by its pid (`ss -ltnp`).
- Worktrees carry an untracked `node_modules` symlink: never commit it.
- Parallel packages own disjoint files (each stage file lists them).
  Shared files (kit, shell, player core, `cm.ts`, `search.ts`, manual)
  change only in stage 42. If a wave-2 package needs a shared change, it
  reports it; the main session makes it on the integration branch and
  tells the others to rebase.
- Conventional commits, English, ending with the session's attribution
  lines. Never touch `/home/ole/MUME`.
- Keep each stage file's checklist current; ADR numbers as in the table.

## Wave 1 — stage 42 (the base)

Order (the 42 file has the details and owned files):

1. **42-0 Scaffold** alone: splits `look.tsx` into modules, stubs the
   whole API, the `?kit` gallery shell, e2e helpers, the ADR skeleton.
2. **42a–42f in parallel** (big box and layout B; controls; overlays and
   keys; window frames; CodeMirror look, find panel and `LookManual`;
   player core). Soft dependencies are covered by the 42-0 stubs.
3. **42-Z** integrates, fills the gallery, runs everything.

The main session merges each package into the integration branch, runs
`npx tsc --noEmit`, `npx vitest run` and the full e2e suite, and looks at
the kit gallery (screenshots) before wave 2 starts. Wave 2 does not start
until 42 is merged and green. The 42 file's "Wave-2 file ownership" table
is binding for wave 2.

## Wave 2 — stages 43 to 47 in parallel

One subagent per work package (the stage files split them; large ones such
as 43a may split again). Each starts from the integration tip with 42 in
it. Brief each with: its stage file and package, the files it owns, the
mockup files to match, the "must keep working" list, its port, the
worktree rule above, and "report: what you built, files, commits, tests,
screenshots (paths)". Merge each package as it lands; rerun tsc and unit
tests after each merge; resolve conflicts in the main session.

Keep the workflow size reasonable: about 5–8 agents at a time. A package
that finishes early can be followed by its stage's next package.

## Wave 3 — integration, review, polish

1. Full checks on the integration branch: tsc, vitest, full e2e (three
   projects), `npm run build`. Rerun failures alone to tell flakes from
   breakage; fix breakage.
2. **Visual check**: screenshots of every page (start page box and
   in-game window where it has one; dark and Paper; desktop 1440×900 and
   phone 390×844) side by side with the chosen mockup. Fix drift.
3. **Independent review** per stage (a fresh agent given the diff, not the
   builder's conclusions): correctness, keyboard, phone, lost functions.
   Fix confirmed findings.
4. **Performance**: start page and big boxes in Chromium and Firefox
   (built version, real window if possible); the editors' typing cost; no
   main-thread hitches over 16 ms; record numbers in the ADRs.
5. Expect merge conflicts in shared test files (the 42 file lists them:
   `chrome-frames.test.tsx`, `chrome.spec.ts`, `phone-frames.spec.ts`
   and others); the hunks are disjoint, resolve them in the main session.
6. Clean-up the stage files list for wave 3 (dead code such as
   `EmptyStateFrame`/`FilteredFrame`, leftover `.wc-ped*` rules, the phone
   Export gate), docs (About, README, help, Inv notes, spec notes).

## Final report (in Swedish, to the owner)

- What was built per stage, the branch and commit range, test results
  (unit, e2e with flakes named, build), performance numbers.
- One combined test guide (or pointers to each stage file's guide) in
  the order the owner should try things.
- Screenshots or an artifact comparing each page with its mockup.
- Open questions with the default that was built (each stage file has
  its list; 42's "Open questions" gathers the cross-cutting ones).
- Session log in `progress.md`, stage table rows 42–47 updated (Owner
  testing), commit.
