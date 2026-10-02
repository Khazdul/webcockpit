# 0058 — Paper sets its own font colour and palette

- Status: Accepted
- Date: 2026-10-03
- Amends: ADR 0041 (light chrome)

## Context

On the `paper` background (`#f4ecd8`) only the `ink` font preset reads
well, and the DOS palette's white, bright white and bright yellow almost
vanish. The owner asked that choosing paper set these at once.

## Decision

`backgroundPatch` (`src/chrome/frames/options.tsx`), used by the
Background cycler in Options → Appearance:

- Landing on `paper` from another background also sets `fg` to ink
  (`#000000`) and `ansi` to `PAPER_PALETTE` (`src/theme/presets.ts`): the
  same hues in dark ink, all 16 at least 4.5:1 on paper; white is dark
  grey, bright white black.
- Leaving `paper` sets `fg` back to `DEFAULT_TERM_FG` and `ansi` to
  `DOS_PALETTE` (ink would be invisible on the dark backgrounds).
- Between other backgrounds only `bg` changes.

## Consequences

- Both can still be changed after; a custom palette or font colour made
  while on paper is replaced when leaving it.
- Other light (custom) backgrounds are untouched; the log player's Paper
  theme is untouched.
