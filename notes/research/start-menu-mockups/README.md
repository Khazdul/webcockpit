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

## Round 4 (2026-11-06/07)

Owner chose round 3 proposal **2 Mjukt kvällsljus**. Refinements in
`BRIEF-round4.md` (almanac top right without moon text, the night specks
removed — they were a low-res Milky Way layer, smaller leaves low by the
forest, conifers only with a blurred glade by the cottage, slow sunrise
entering from the left, near sharp trees only lower left, shoreline rising
to the right, the cottage on land with a lit window and smoke only at
night, no lantern anywhere in the UI). Result: `round4/soft-evening.html`.
Artifact: https://claude.ai/artifact/M1LYUxBAVEUFdcXQdbNqEo

## Round 5 (2026-11-07)

Owner: the sea and forest do not give the right feeling for the game. Keep
the sky (everything above the horizon) and let it continue all the way
down as a plain surface (sky blue by day, near-black at night), no
landscape for now (maybe later), no flying leaves. Result:
`round5/sky.html` (landscape and LIFE code removed, about twice as fast).

Round 5b (2026-11-07): almanac moved to the bottom right; the dark halo
around the quote disliked → three quote treatments `round5/quote-{a,b,c}.html`
(A free type with a sky-aware colour, B an engraved iron plate under the
panel, C small sky lettering that assembles word by word and changes every
3 min). Review page `round5/quotes.html`,
artifact https://claude.ai/artifact/QuU2VwAmdyMXvYxCK8hLMm
Owner chose quote style **A · Fri skrift** (2026-11-07).

## Round 6 (2026-11-07)

Three lava-free wordmarks on quote style A: `round6/logo-1.html` engraved
groove (empty channels), `logo-2.html` polished iron with a light-following
sheen, `logo-3.html` inlaid brass by day / moon-silver by night. Review page
`round6/index.html`, artifact https://claude.ai/artifact/YB8acR87tdaeJwqH78NcCw

## Baseline (owner, 2026-11-07)

**`round6/logo-3.html` is the agreed starting point for the new start page.**
Owner: "1 blir perfekt. Nu känns det som vi har grunden." — then changed
the wordmark to **3 Inlagd metall** (2026-11-07); everything else in
`logo-1.html` and `logo-3.html` is identical.

It is: wordmark 3 (forged iron "MUME" with a flush metal inlay in the
channels: brushed antique brass by day, moon-silver by night, blending
through twilight; reflective, never glowing; rivets switch metal with the
inlay; no lava, no sparks); the sky from round 4
driven by the offline game clock (sun and moon enter from the left on a
slow arc, sun larger than the moon, never overlapping; clouds; sparse
stars; shooting stars; calm weather director: winter always snow, rare
light rain in spring/autumn, none in summer) continuing below the horizon
as a plain surface (sky blue by day, near-black at night), no landscape,
no flying leaves; the Lykta menu panel with a glossy plate without
lantern, the round-2 07 selection (text and icon brighten only), shortcut
letters marked inside the labels, `SCRIPTS (gibur)` dim; quote style
A · Fri skrift (no backing, sky-aware colour); almanac at the bottom right
(date, time · period · T.A. year, version; no moon text, no lantern);
sub-pages with glass buttons, a Back button top left, no hint rows, no
lanterns anywhere in the UI.

Ideas parked for later: a landscape below the horizon.
Inlay and rivets: **bluish/cyan metal** like the early pixel logo, not
brass (owner, 2026-11-07); to be tuned at the start of the night pass.
Favicon: an "M" in the wordmark's iron and inlay (owner, 2026-11-07).
Next session: `NIGHT-PASS.md` and `docs/stages/41-start-page.md`.

## Night pass (2026-11-07): stage 41 built, round 7 mockups

Stage 41 (the start page on this baseline) is built on branch
`stage-41-start-page` (not merged): `docs/stages/41-start-page.md`, ADRs
0124 (sky), 0125 (start surface and lantern kit), 0126 (wordmark and
favicon), 0083 addendum (first paint). Inlay tint: **c "Turkos"**; the
alternatives are `round6/logo-3-cyan.html?tint=a|b|c` and
`round6/logo-3-cyan-compare.html`.

Round 7 (`round7/`) mocks every other page reached from the start menu,
2–3 directions each, on a shared base (`round7/base/`, README there; the
in-game backdrops are real app screenshots). Each folder has a
`CONTENT.md` (the page's real content, states and keys) and an
`index.html` review page; shots in `round7/shots/` (gitignored).

| Review page | Folder | Artifact |
|---|---|---|
| Stora sidor (how big pages open; A corner mark, B room grows, C name plate) | `layout/` | https://claude.ai/artifact/YEVy5cZFg7gCswmWEeV7fQ |
| Profiler (editor incl. in-game window, Import, Export) | `profiles/` | https://claude.ai/artifact/VZZwDHYmtsAaa9iA8FN9JE |
| Skript (page, editor, manual; start and in-game) | `scripts/` | https://claude.ai/artifact/RLPnZSmFqpxKunvdnwyiD4 |
| Historik och spelare (History, run log player, HTML replay) | `history/` | https://claude.ai/artifact/MQCZKacGEKmr8SAAovDSHn |
| Spotlights | `spotlights/` | https://claude.ai/artifact/SeywEXWYkuJmTVFYpdyKmV |
| Credits och About | `about/` | https://claude.ai/artifact/1EhXMPb5hkUXk8MbmkS4oW |

Nothing in round 7 is built; the owner chooses first.

### Open questions for the owner (night pass)

Stage 41 (built):
1. Wordmark tint: c "Turkos" built; a (steel) and b (mithril) are the
   alternatives.
2. Shortcut letters: menu E P S H L C A, Profile list S N E R D I X (the
   old menu had none). OK?
3. Profile list: the new "Changed" column — keep?
4. Enter MUME: a 280 ms fade; or the mockup's zoom?
5. The quote stays pale with a stronger outline on bright days (the sky
   is never bright enough for the 0.54 dark-ink threshold); dark ink
   instead (threshold ~0.47)?
6. The wordmark's faint sheen may cost 2–4 fps: keep, run occasionally,
   or drop?
7. Names that differ only in case (gibur / Gibur) look identical in
   Cinzel capitals: show them differently?

Round 7 (choose a direction per page; details on each review page):
- Big pages: A corner mark, B room grows, C name plate.
- Profile editor: letters for views/kinds; "All saved" status and the
  in-game "Connected" line; Esc in a field blurs first or leaves; same or
  different window frame for the two editors; export on the phone?
  Import: its own page with a drop zone (C) or the file picker at once?
  Export: TEXT FILE renamed "Plain text"?
- Scripts: tooltips enough for Ctrl+S/F/F1; settings controls on the
  phone (new); in-game sub-pages with their own small Back; shorten "on ·
  runs when you enter MUME"; B's inspector rail instead of the signature
  popup.
- History and players: key row removed (tooltips only, or a "?" help);
  hide the player controls (as today) or fixed in the box; replay title
  card, note cards, sky in the exported file; cyan rivet playhead; h:mm:ss
  times; History B/C new structures; a clearer error when a log cannot
  open.
- Spotlights: play at once (A, C) or a wall of cards (B); hide controls;
  keep the filtered start page; letters F D P S (F is fullscreen in the
  replay today); an end card; a brighter dark red on black.
- Credits and About: auto-roll or a book; a Settings… button with the
  chronicle; the full third-party notices in About; where the wordmark
  goes in About; normal or large box for text pages.

### Round 7 decisions (owner, 2026-11-07)

- **Wordmark tint: mithril** (`round6/logo-3-cyan.html?tint=b`, possibly a
  subtler variant). Everything derived from the old logo cyan (rivets,
  playhead rivets, initials, accents) follows, in the app and in the
  mockups.
- **Big pages: B Rummet växer** (`layout/b-room.html`).
- **Profile list (built in stage 41):** Edit, Rename, Delete on each
  profile row, plus Select when not active; shown only on the highlighted
  row.
- **Profile editor: B Ryggen.**
- **Import: C Importsidan**, but the receipt after an import has no Edit
  button.
- **Export: B Verktygsraden**, changed: a toggle between HTML replay and
  Plain text, and an explicit EXPORT button (the format buttons no longer
  export at once).
- **Scripts page: C Instrumentbrädan. Script editor: C Fokus. Manual: A
  Boken.** In-game window frame: each direction's own ("Riktningens").
- **History: A Tabell och kort**, but the box must not grow wider than its
  content needs on a very wide screen; past that width it stays put and
  more of the sky shows around it.
- **Run log player: none of A/B/C.** Keep today's player almost unchanged,
  filling the whole player window; the only addition is a Back button.
  The exported HTML replay therefore stays as it is today.
- **Spotlights: B Galleriet.**
- **Credits: B Krönikeboken**, without a separate "Opening" tab.
- **About: A Bladet.**
