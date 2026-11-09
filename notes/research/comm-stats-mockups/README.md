# Comm and Statistics panes: mockups, round 1 (2026-11-09)

Five live mockups each for a reworked Comm pane and a "live" Statistics
pane, in the Lykta look (ADR 0123). Throwaway HTML; never copy as is.

- `comm.html` — Flikar, Samtal, Kanalräls, Tidslinje, Delad.
  Artifact: https://claude.ai/artifact/84j7tR8x44va4koo6ymvvR
- `stats.html` — Senaste fångst, XP-puls, Fördelning, Arkad, Översikt.
  Artifact: https://claude.ai/artifact/BSgHwmVYfkNPgG1sR6Jc4d

## Owner brief

- Comm: total rework. Channel filtering (e.g. the most recently active
  channels as tabs), search in history, copy by selecting text, own
  messages clearly apart, a stable colour per conversation partner.
- Statistics: inspired by the start page's Statistics, but live: the
  latest kills and their XP, a rating per kill (fantastisk, jättebra,
  bra, ganska dålig, dålig) on a scale relative to the session, not
  absolute XP.

## Open points for the owner

- Kill rating: ratio to the median of the last 30 mob kills (Poor < 0.45,
  Meh < 0.8, Good < 1.5, Great < 2.5, Superb). Re-rate old kills as the
  median moves, or freeze the rating at the kill?
- Comm message font: the mockups use a proportional sans; the app
  bundles only monospace fonts today.
