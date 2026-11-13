# WebCockpit — Notes for Claude

A MUD client for MUME that runs entirely in the user's browser. Loaded from
a link, no application server. Target: hundreds of users, tt++-level
feature parity, minimal latency, TUI look and feel.

## Project phase

**Current phase: Build.** `intent.md` and `spec.md` approved 2026-09-27.
See `progress.md` for the current stage and the last session's handoff.

1. `intent.md` — what and why. Written through a grilling session with the
   owner. Nothing else starts until it is approved.
2. `spec.md` — how. Derived from `intent.md`. Approved by the owner.
3. Build in stages (etapper). Each stage ends with something the owner can
   test in the browser and give direction on.

## Authoritative documents

- `intent.md` — goals, non-goals, users, success criteria. Wins over
  everything else.
- `spec.md` — architecture, requirements and stage plan.
- `docs/decisions/` — Architecture Decision Records, append-only,
  numbered `NNNN-title.md`.
- `progress.md` — stage status table and session log. Start here.
- `docs/stages/NN-name.md` — one file per stage: plan, task checklist,
  test guide, owner feedback.
- `notes/grilling.md` — raw Q&A log from the intent sessions. Source
  material, not authoritative.
- `notes/research/` — research notes. `cockpit-inventory.md` is the
  normative appendix to `spec.md` ("Inv §n").

## Reference project (read-only)

`/home/ole/MUME` is Cockpit, the owner's terminal client (TinTin++ + Lua +
tmux). Use it as a **knowledge reference**: how MUME's GMCP works
(`docs/gmcp.md`), how panes look and behave (`docs/*-pane.md`), lessons
learned (`docs/decisions/`), and real session logs as test material.

- Never copy or port code from it. WebCockpit is a new codebase.
- Never modify anything under `/home/ole/MUME`.
- The visual target is "very close to Cockpit", not pixel-identical.

## Working mode

- The owner wants minimal involvement: ask only for decisions that are
  genuinely theirs (direction, scope, UX taste, trade-offs with user
  impact). Decide technical details yourself and record them as ADRs.
- Subagents do the building. The main session plans, delegates, verifies.
- Every stage ends with a short test guide for the owner: what to open,
  what to try, what feedback is wanted.

## Tests and worktrees (lessons of 2026-11-13)

- Full e2e at 5 workers, alone on the machine: building agents that
  run their own e2e at the same time make it fail under load. Rerun a
  failing file alone before calling it a regression.
- No source edits under a running dev server while an e2e run uses it
  (the pages reload and tests fail in a clump).
- A worktree agent gets its own dev server port (`WC_E2E_PORT`), never
  5173 (the owner's test server), and links `node_modules` from the
  main checkout. It must never `git add` that link: a committed link
  once replaced the real directory at the merge.
- A worktree may start at an old commit: branch from `main` by name.
- `/tmp` is a tmpfs. If Chromium starts crashing in tests ("Page
  crashed", "Target crashed"), look at `df -h /tmp` first
  (`tests/setup/clean-tmp.ts`).

## Language

- Conversation with the owner: Swedish.
- Code, comments, commit messages, docs: English.
- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.

## Sessions and traceability

Work happens in separate sessions, normally one stage (or one part of a
stage) per session. The repository is the only memory between sessions.

At session start:

1. Read `CLAUDE.md`, `progress.md`, and the current stage file.
2. Read `spec.md` sections and ADRs the stage touches. Read the inventory
   only for the sections you need (it is long).

During the session:

- Keep the stage file's task checklist current.
- Record technical decisions as ADRs.
- Commit in small conventional commits.

At session end (always, even if interrupted work remains):

- Append an entry to the session log in `progress.md`: date, stage, what
  was done, what is next, open issues, and commits.
- Keep it to about 5–10 lines. The details live in git, the stage file
  and the ADRs.
- Update the stage status table.
- Commit.

A new stage starts by writing `docs/stages/NN-name.md` from spec §5. The
file holds the plan, the tasks and the test guide. The owner's feedback
after testing goes in the same file.
