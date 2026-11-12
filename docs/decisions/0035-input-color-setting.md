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

## Addendum: Amber is the default (2026-11-12)

The owner: "We now have the light blue default colour on the input
text. Change this to the golden colour instead. Gold is to be the
default", and, asked about computers and tablets: "Yes, make gold the
default everywhere."

- `DEFAULT_INPUT_COLOR` is `amber` (15 % of the text colour mixed with
  `#ffaf00` on a dark ground, `#9a5a00` on a light one): on black with
  the default text colour `rgb(246, 179, 69)`, 11.4 : 1; on Paper
  `rgb(123, 71, 0)`, 6.5 : 1 (7.5 : 1 on the phone's command field). Of
  the two warm options Amber is the gold; Sand is a pale tan.
- It applies to new installs on a computer, a tablet and a phone, and to
  stored settings that hold no input colour (never chosen).
- **A stored colour is kept, Steel too.** The appearance is stored whole,
  defaults included, so a stored Steel cannot be told from a choice of
  Steel, and a stored look never changes with the new-user defaults (ADR
  0078, `LEGACY_APPEARANCE`). An existing install therefore stays Steel
  until its user picks Amber (Settings → Appearance → Input colour; on a
  phone the setting has no row yet).
- Recordings: a VIEW without the setting, or no VIEW, still plays with
  Steel (`LEGACY_INPUT_COLOR`), as when it was recorded.
- Checked against gold: the selection after a send is the text colour's
  inverse and does not depend on it; the suggestion stays the muted
  grey; the phone's kept line and placeholder stay the field's dim
  text; the password's bullets are gold, 3.1 : 1 on the tint of a
  selected password on Paper (marks, not letters) and about 6 : 1 on dark.

## Addendum: the one-time switch for existing installs (2026-11-12)

This replaces "A stored colour is kept, Steel too" in the addendum above.
Left as it was, the new default reached nobody who already used the
client, the owner included: every stored appearance says Steel. Decided
by the main session the same day: existing installs move to Amber, once.

- **Why a version step.** The appearance is stored whole, so a stored
  Steel cannot be told from a choice of Steel by looking at it. The
  settings version can tell *when* it was stored. `SETTINGS_VERSION` is
  now 6. Settings stored at version 5 or older (or with no version)
  whose input colour is Steel load with Amber (`migrateAppearance` with
  the stored version, as `migrateComm` and `migrateMapper` take theirs).
  Any other stored colour is a choice and is kept. A user who had
  chosen Steel before the change is switched too and picks it again;
  that is the price of not being able to tell the two apart.
- **Once.** The loaded settings carry version 6 and are saved with it on
  the next change of any setting. Steel stored at version 6 or newer is
  a choice and stays. Until that first save the stored record is still
  the old one and each load switches it the same way, which shows the
  same thing. The version step changes nothing else: the other steps
  (`RETIRED_PANES`, the hover default, Comm's filters) compare with
  their own versions.
- **What stays Steel.**
  - Recordings. A VIEW record's appearance has no settings version and
    is never switched: a recorded Steel plays Steel, and a VIEW without
    the setting, or no VIEW, plays Steel (`LEGACY_INPUT_COLOR`) as
    before. An HTML replay's embedded settings are migrated as
    `recorded` and are not switched either (the player takes the input
    colour from the VIEW records in any case).
  - A choice of Steel made after the switch.
- **The first paint.** The localStorage appearance mirror has no version
  and is not switched on reading. On the first start after the update
  the page is painted from it with Steel until the settings have loaded
  (a moment, before anything is typed); the load rewrites the mirror.
  Where IndexedDB is unavailable there is nothing stored to migrate and
  the mirror's colour stays.
- **Export and import.** There is none for settings: a profile export
  holds the profile's script text only, and the settings are one global
  record, not one per profile. Nothing else carries a stored appearance.
- **A row on the phone.** The phone's settings page now has Text →
  Input colour: the same seven options as the desktop's Appearance
  dropdown, each with a chip of its colour on the terminal background
  (the values come through the phone kit, as the fonts do).
