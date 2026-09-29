# 0035 — Input color setting

- Status: Accepted
- Date: 2026-09-30
- Amends: ADR 0034

## Context

Owner request: the text typed in the input line, `>` included, should use
the steel colour of the command echo (ADR 0034), and the colour should be
a choice in Appearance. Logs must replay with the colour the player had
while playing, not the viewer's.

## Decision

- `appearance.inputColor` (src/settings/types.ts), one of `none`, `steel`,
  `bright`, `sand`, `sage`, `cyan`, `amber` (cycle order). Default
  `steel`; `migrateAppearance` gives `steel` to a missing or unknown value,
  so existing users get Steel. Additive: `SETTINGS_VERSION` unchanged.
- Options → Appearance: `Input color: <Label>` below Background, cycled
  with ←→ like the other colour rows. The preview box gets a last line, a
  prompt and an echoed command in the chosen colour.
- Formula (`INPUT_COLORS` in src/theme/presets.ts, `inputColor` in
  src/theme/apply.ts): `color-mix(in oklab, var(--term-fg) P%, TINT)`,
  the tint picked by `isLight(termBg)`; `none` is `var(--term-fg)`.

  | id     | P  | dark bg | light bg |
  | ------ | -- | ------- | -------- |
  | steel  | 55 | #7fb2e6 | #1f5f9e  |
  | bright | 55 | #ffffff | #000000  |
  | sand   | 55 | #e2bf7e | #8a5a12  |
  | sage   | 50 | #9fd08c | #2f6e25  |
  | cyan   | 15 | #00d7d7 | #007a8a  |
  | amber  | 15 | #ffaf00 | #9a5a00  |

  Cyan and Amber are the two drastic ones.
- The root token keeps its name, `--term-echo`, and now follows the
  setting. `.wc-echo`, `.wc-input-prompt`, `.wc-input-field` and
  `.wc-input-mask` (password bullets) use it. The input line has no
  syntax highlighting (the `syn-*` colours are the editor's), so nothing
  else changes there. The caret keeps the terminal fg.
- Recordings: the setting is part of the appearance, so every VIEW record
  (ADR 0016) carries it; no capture or payload format change. The player
  (`PlayerHost`, used by RUN LOG, Spotlights and the HTML replay) sets the
  input colour of its base settings to `steel` before the recorded VIEWs
  are overlaid, so the viewer's own choice never shows: a log with a VIEW
  that has `inputColor` plays with it, and a log recorded before this ADR
  (VIEW without it, or no VIEW) plays with Steel. The viewer's colour
  theme still changes fg/bg, and the recorded choice is resolved against
  them.

## Consequences

- Changing the setting mid-session writes a new VIEW record, so a log
  shows the change where it happened.
- HTML replays exported before this change keep their embedded bundle and
  look as before.
