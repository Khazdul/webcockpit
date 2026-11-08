# Round 7 · Credits and About · content inventory

What the real pages hold today (read from the code on 2026-11-07), so the mockups show real content and
keep every action reachable. Mockup choices that go beyond today are marked **(new)**.

## Credits — `src/chrome/frames/credits.tsx`, `credits.css`, `src/share/chronicle.ts`

Opened from the start menu (`C`). ADR 0019, Inv §7.6, filters ADR 0110.

**Content: the chronicle**, built from every stored run's events (no log needed), filtered by the
Spotlights settings (kinds × characters × period). Pure and deterministic:

- Opening line: *Here the scribes have set down, as well as memory allows, the deeds of your companions.*
- One chapter per character, the character whose first deed is oldest first. The header is picked by a
  stable FNV-1a hash of the name from 7 templates: *The Tale of {name}*, *Concerning {name}*, *Of {name}
  and the Long Road*, *How {name} Went Out Into the World*, *The Lay of {name}, Mostly True*, *The Deeds of
  {name}, As Far As They Are Known*, *Of {name}, and Things Better Left Unsung*.
- One sentence per death, level-up, PvP kill and achievement, oldest first; 5 templates per kind, picked
  by a hash of (character, run, time, kind). `{date}` = *On the first of May, 2026* (local date); PvP
  victims as `*Name the Race*` (with the asterisks); achievements lose a trailing `.`/`!`; deaths get
  *at level N* when known.
- Ends with *The End.*
- Today: word-wrapped to a centred column `min(60, max(40, cols − 8))` cells (phone: fits the grid).

The mockups compute the chronicle with the real templates and hash (`common.js`) from a made-up run
history: Gibur (levels 28→41, 2 PvP kills, 2 deaths, 2 achievements), Rasta (73→74, PvP, an
achievement, a death), Gittan, Taube, Melker. Every sentence is what the app would print for those events.

**Behaviour today**

- Rolls bottom → top at 1 row/s (Web Animations, linear). The first line starts on the bottom row; when
  *The End.* has left the top the page **returns to the start menu by itself**. A resize keeps the time.
- Fade bands: the top and bottom 35 % fade to the canvas (mask).
- Only Esc is bound (→ back); every other key does nothing. Hint *Escape to exit* top right (#555) — goes
  (no hint rows); Back top left replaces it.
- No pause, no scrubbing, no speed control.

**States**

| State | Today | Text |
|---|---|---|
| Loading | blank page (keys except Esc ignored) | — |
| Error (storage) | EmptyStateFrame "Credits", *Any key to return* | *The chronicle could not be read from this browser's storage.* |
| No data | EmptyStateFrame, any key or a click returns | *No chronicle yet. Your tale is written as you play: kills, deaths, level-ups and achievements each earn a line. Come back once you have made some history.* |
| Filtered (nothing passes, but something would with open filters) | FilteredFrame: body a third down, a `Settings…` row (Enter/Space/click) that opens the **Spotlights settings popup** next to it; Esc closes the popup, then goes back | *No chronicle entries match your settings.* |

**Spotlights settings popup** (`src/chrome/popups/spotlights-settings.tsx`): title *Spotlights*; KINDS:
Achievements, Deaths, Level-ups, PvP kills (toggles); CHARACTERS: All characters (toggle), then one
check per recorded character, alphabetical (dim and disabled while All is on); Period: All time / Last
year / Last 3 months / Last month / Last week. Every change is stored at once; when the popup closes
after a change the chronicle is rebuilt (and rolls if anything passes now).

**Phone today**: same roll, narrower column; the hint is a tappable Esc token.

## About — `src/chrome/frames/about.tsx`

Opened from the start menu (`A`). Inv §3.11.

**Title row**: *About*, and at the right the version and build commit: `0.2.6 (1544265)`.

**Text** (`ABOUT_TEXT`, kept verbatim in `common.js`): an untitled intro paragraph, then sections with
ALL-CAPS headings; indented `key  description` lines are key/value rows.

1. Intro — *WebCockpit is a MUD client for MUME, built for fast PvP. …*
2. MUME — MULTI-USERS IN MIDDLE-EARTH — 3 paragraphs (the game, the sides, the world).
3. BUILT FOR PVP — 3 paragraphs, then Website `mume.org`, Discord `discord.gg/XkZN55am9a`.
4. GETTING STARTED — 2 paragraphs (Enter MUME, menu bar, ☰ on phone; Profile → EDIT, HELP, #help, Profile → IMPORT).
5. WHAT IS INSIDE — Panes, Map, Weather, Runs, Export, Phone.
6. SETTINGS — 1 paragraph (`?safe`).
7. LUA SCRIPTS — 1 paragraph (Scripts, MANUAL, F1).
8. CREDITS — MMapper, Tilesets, Cockpit, MUME, Fonts, Libraries, TinTin++.
9. LICENCE — GPL-2.0-or-later, MMapper notice, LICENSE.txt, source code; *MUME is run by its own team; …*

**Links** (open in a new tab): mume.org, discord.gg/XkZN55am9a, github.com/MUME/MMapper,
tintin.mudhalla.net, github.com/Khazdul/webcockpit, and the site's own files LICENSE.txt and
fonts/README.md.

**Keys today**: ↑↓ scroll a line, PgUp/PgDn a page, Enter/Space a page down, Home/End, Esc back. Footer
hints (*↑↓ Scroll · PgUp/PgDn Page · ESC Back*) — go. Text wraps at most 110 cells, centred; TUI
scrollbar. No sections navigation, no states (static text, no loading/empty/error).

**Not in About today, asked for in round 7**

- **The new wordmark and the "M" favicon** (owner decision 7: "the new mark … appears in About").
- **Third-party notices** (`THIRD_PARTY_NOTICES.md`: MMapper-derived files table, fonts, JS libraries,
  map assets with the two MIT texts). Today the About text only points at `fonts/README.md` and
  `LICENSE.txt`. The mockups show the whole file as a section/tab **(new)**.

**Stale facts in the text** (for the build, not changed in the mockups): *the menu bar along the top*
(the in-game bar is at the bottom since stage 30); the Fonts credit lists Cinzel only "for the pane
titles" — the new start page also uses Cormorant Garamond (and maybe Cormorant SC), which then need a
credit and a notice.

## Phone (390 × 844)

Both pages are full-screen TUI frames today. In the mockups: the large box at 6 px margins, the normal box
under the wordmark; About's contents become a strip of section pills; the book in Credits B shows one page
at a time.
