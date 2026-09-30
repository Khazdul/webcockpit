# 0024 — Bundled profile: khazdul

- Status: Accepted
- Date: 2026-09-28

## Context

The owner (2026-09-28) wants new users to find `khazdul` — the owner's
own PvP profile from Cockpit — among the selectable profiles. Until now
a first run seeded only `default` (ADR 0010).

## Decision

- The profile text is bundled as `src/profiles/khazdul.tin`, a verbatim
  copy of `/home/ole/MUME/ttpp/profiles/khazdul.tin`. It is the owner's
  profile data, not Cockpit code, so the no-port rule does not apply.
- `BUNDLED_PROFILES` in `src/profiles/store.ts` lists it. `init()`
  seeds the bundled profiles in the same transaction as `default`, and
  only when `default` is missing (a first run). An existing user does
  not get it; a user who deletes or renames it is not given it back. A
  name already taken is left alone.
- It is an ordinary profile: editable, renamable, deletable. `default`
  stays the selected profile on a first run.
- The engine and round-trip tests now read the bundled copy, so they
  always run instead of being skipped when `/home/ole/MUME` is absent.
- Updating the bundled text later changes only what future new users
  get; nobody's stored copy is touched.

Amended by 0036: the bundled text is now a curated reference profile,
not a verbatim copy.
