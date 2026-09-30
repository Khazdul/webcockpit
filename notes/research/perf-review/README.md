# Performance review 2026-09-30: reviewer material

Source material for `notes/research/performance-review.md`, which holds the
summary, the ranked proposals and the owner's decisions (stage 8 part B).

- `A-render.md` … `E-panes.md`: the five reviewers' reports, verbatim.
  - Code references are to commit 20c4815 (0.1.19). `main` at the time of
    the review differs only in docs.
- `patches/<area>-<name>.patch`: the reviewers' experiment patches, as they
  applied to 20c4815. They were written to measure an idea, not reviewed
  as production code; the build part (stage 8 part C) reworks them into
  proper commits. Check with `git apply --check` first.
- `harness/<area>/`: the harness sources (TypeScript run with Node 26 and
  Playwright). Results, traces, profiles and generated logs are not kept.
  - The reports call them `perf/<file>`. To run an area's harness, copy
    its folder to `perf/` in a checkout that has `node_modules`, then use
    the commands in that report (section 2 or 7).
  - They read the owner's Cockpit logs from `/home/ole/MUME/data/runs` and
    use ports 4201–4249.
- `rerun.md`: the quiet-machine re-run of the key comparisons, made after
  the reviews (the reviewers measured concurrently on one laptop).

## Paths in the reports

| In the reports | Here |
|---|---|
| `…/scratchpad/perf/<X>-….md` | `<X>-….md` |
| `…/scratchpad/perf/<X>/exp-*.patch`, `harness-timing.patch` | `patches/<X>-….patch` |
| `…/scratchpad/perf/<X>/harness/` (area E: `…/scratchpad/perf/E/`) | `harness/<X>/` |
| Result files (`*.json`, traces, profiles, `*.log`) | Not kept |
| `.claude/worktrees/agent-…` (the reviewers' worktrees) | Not kept |
