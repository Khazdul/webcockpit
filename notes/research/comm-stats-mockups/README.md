# Comm and Statistics panes: mockups, round 1 (2026-11-09)

Five live mockups each for a reworked Comm pane and a "live" Statistics
pane, in the Lykta look (ADR 0123). Throwaway HTML; never copy as is.

- `comm.html` — Flikar, Samtal, Kanalräls, Tidslinje, Delad.
  Artifact: https://claude.ai/artifact/84j7tR8x44va4koo6ymvvR
- `stats.html` — Senaste fångst, XP-puls, Fördelning, Arkad, Översikt.
  Artifact: https://claude.ai/artifact/BSgHwmVYfkNPgG1sR6Jc4d

## Round 2 (2026-11-09)

The owner chose Comm 2 "Samtal" and Statistics 1 "Senaste fångst" and
asked for three variants of each (feedback in the session; summary in
progress.md).

- `comm-r2.html` — A Ikonräls, B Namnlista, C Kompakt.
  Artifact: https://claude.ai/artifact/CTndfrR6ijfqyd2xivKmBG
- `stats-r2.html` — A Ringar, B Rör, C Fångstbalk.
  Artifact: https://claude.ai/artifact/7EDecVtXnobQDn3yATqXUb

## Round 3 (2026-11-09)

One design each after the owner's round-2 feedback.

- `comm-r3.html` — rail when narrow, name list when wide (380 px pane
  width), gear with Public channels and "chats active in the last
  10/30/60 min/All", reply without "tell", newest chat at the bottom.
  Artifact: https://claude.ai/artifact/S4GteiCXAbWggZToSivVgz
- `stats-r3.html` — round-1 header, four tiles, all session kills in a
  bottom-anchored list, the latest-kill card at the bottom, no level bars.
  Artifact: https://claude.ai/artifact/UMoRDL27oAuhrSjpP8WKcT

## Round 4 (2026-11-09)

- `comm-r4.html` — tint/Paper/border/clear theming like Timers and Group
  (reference Timers pane beside it), gear in the pane's hover buttons,
  pinned Group entry (all channels from GMCP group players), round search
  button that expands, edge fade + chevron instead of "N older".
  Artifact: https://claude.ai/artifact/UhpAQVpAvtGsse4HySCWcM
- `stats-r4.html` — no "× median", exact XP under 1000, no grade letters,
  the same theming controls and reference Timers pane.
  Artifact: https://claude.ai/artifact/1b8xKqp9seEVe6A3KTuTed

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
