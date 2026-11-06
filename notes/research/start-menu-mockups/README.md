# Start menu redesign — mockups and owner decisions

Research for the coming start-menu stages (not yet started). Brief for the
mockup agents: `BRIEF.md`.

## Owner request (2026-11-06)

Pleased with the Lykta panes and the menu bar. Next: the start menu and all
its sub-pages (Spotlights and the run players excluded). Leave the TUI look
for a "wow" feeling, more alive. Includes the Profile editor and Scripts
editor pages. The old pixel banner is replaced by a new one with
recognition value. The background gets weather effects following MUME's
day/night cycle (offline, as in the almanac); everything else runs for
visual effect; snow in winter months. Mockups before building, with
drastically different directions.

## Owner decisions (2026-11-06)

1. Banner: explore all kinds (wordmark, emblem, landscape + logo).
2. Background: a full scene (sky, weather, layered landscape).
3. Menu form: explore (lantern panel, free on the sky, cards/boards …).
4. Keyboard and phone both stay first-class; the mouse gets hover.
5. Mood: a broad mix (dark epic, storybook, cool minimal …).
6. Keep the random quote. The key-hint row and the pixel banner go.
7. The new mark becomes the favicon and appears in About; the in-game
   menu bar is not changed.
8. No sound.

## Proposed order

1. Start page (banner, scene, menu) — round 1 mockups, then refinement.
2. Shared sub-page language: History, Credits, About, Profile list.
3. Profile editor.
4. Scripts editor (the code surface stays monospace).

## Round 1 (2026-11-06)

Four directions, one file each in `round1/`, shots in `round1/shots/`:

- 01 Lyktans väg — dark epic: forged Cinzel wordmark, mountain parallax,
  menu in a Lykta panel.
- 02 Kartboken — storybook: wax-seal sigil, painterly hills, signpost menu.
- 03 Stjärnvalvet — cool minimal: tower-and-star mark on the horizon,
  vast sky, free typography.
- 04 Stenporten — carved/magic: stone arch with moon-silver tracery that
  follows the moon phase, menu inscribed in the arch.

Review page (tabs over the four live mockups): `round1/index.html`.
Artifact: https://claude.ai/artifact/XfUWn5qX7yLa3SSAhRXD7X

## Owner feedback on round 1 (2026-11-06)

Chose **01 Lyktans väg**. Detailed feedback, turned into rules, in
`BRIEF-round2.md`: subtler sparks in the wordmark (3–4 logo alternatives);
menu panel kept but without the big lantern, the server line, the
choose/go hint and the travelling glow; `SCRIPTS (gibur)` in dim small
type; no moon text bottom right; sun larger than the moon and never in the
same place; much calmer weather (winter always snow, rare light rain in
spring/autumn, never rain in summer); no road, inn or lamp posts; better
mountains and trees swaying; explore a valley with a distant mountain and
a subtle, original magic gate into it. Ten scene variants asked for.

## Round 2 (2026-11-06)

- `round2/base.html` — 01 with every common rule applied, modular so the
  variants only swap the scene, life and selection style.
- `round2/logo.html` — wordmark alternatives A–D.
- `round2/NN-*.html` — ten variants on the base, specified in `VARIANTS-round2.md`.

Review page: `round2/index.html`. Artifact: https://claude.ai/artifact/PaG8kZshVVb5z3u1vUXsw8
Round 2 screenshots (`round2/shots/`, ~110 MB) are kept local, not committed.

## Owner feedback on round 2 → round 3 (2026-11-06)

Logo A, with subtler lava sunk into the letters. Mountains dropped: they
looked pixelated by day and clashed with the crisp vector trees. Only
clumped tree tops, never lone or full-height trees. New scene: a wooded
hill looking out over the sea, a slow distant elven ship, a simple cottage
roof with smoke. Glossy hood plate. Menu selection as round-2 07 (text
brightens only), no shortcut letters at row ends (marked in the label),
glass buttons, no hint rows, Back on every sub-page, only one lantern (the
hood). Rules in `BRIEF-round3.md`, proposals in `VARIANTS-round3.md`.

## Round 3 (2026-11-06)

`round3/base.html` plus five proposals `round3/01…05-*.html`. Review page:
`round3/index.html`. Artifact: https://claude.ai/artifact/YUzcPCBgoDyDbgKq4GgQ6B
Shots kept local (gitignored). The proposals cache tree tops as sprites and
reach 60 fps on an Iris Xe GPU (the base gets 15–30).
