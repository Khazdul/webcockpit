# Stage 16 — Readability script with adaptive colours

Owner request 2026-10-03: turn Cockpit's readability modules
(`/home/ole/MUME/ttpp/readability/modules/Directions.tin` and `Mobs.tin`,
docs in `/home/ole/MUME/docs/readability.md`) into a bundled WebCockpit
script, improved where the script engine allows it. Colours must adapt to
the background.

Readability was a non-goal as a built-in feature (inventory: "OUT OF
SCOPE"). As a bundled, opt-in script it falls under intent Goal 10; the
owner asked for it.

## Owner decisions

- 2026-10-03: **adaptive colours** in the host. A script names a colour
  (Cockpit's hues) and WebCockpit adjusts its lightness to the current
  background so it keeps enough contrast. Changing the background
  recolours existing scrollback too. Usable by every script, not only
  readability.
- 2026-10-03: the **446-mob list** (Lamia's, from Cockpit) comes along as
  data: same short names and tiers (plain, dangerous/named, roots/snare).
  Credit to Lamia is kept.

## Plan

### A. Host: adaptive colours (ADR 0068)

- A new `Color` kind beside palette, truecolor and shade: an adaptive
  colour that carries a base RGB (e.g. `ADAPTIVE_COLOR | 0xRRGGBB`, a flag
  bit that does not collide with `SHADE_COLOR` checks).
- Script syntax: a `~` prefix wherever a script names a colour —
  cecho/replaceLine/echo tags `<~#f0c850>`, `<~240,200,80>`, `<~gold>`
  (Mudlet name), background after a colon as usual; `highlight("~gold")`.
- Resolution: keep the hue, move lightness (OKLab or mix toward white on
  dark / black on light backgrounds) by the smallest step that reaches
  4.5:1 against the current terminal background (ADR 0061's rule). A
  colour that already passes is unchanged, so on black Cockpit's colours
  look as in Cockpit.
- Rendering: the output pane renders adaptive colours via a class per
  base colour (`wc-a-f0c850`) whose rule is (re)written when the theme
  applies, so a background change recolours scrollback with no re-render.
  Bounded registry; a fallback for overflow.
- Every `Color` consumer handles the new kind: output pane (both render
  paths, bg too), comm pane, script panes, palette/`colorToCss`, the
  export model, copy2cecho, run capture, replay and log player (the
  replay resolves against its own background), downloads (resolved
  truecolor).
- Script reference (`lua-api.ts`, manual) documents the `~` form.

### B. Bundled script `readability.lua`

- **Directions:** `X leaves north.` → name default, ` leaves ` dim grey,
  `north ▲` teal (glyphs as Cockpit: ▲ ▼ ► ◄ ⇑ ⇓, west arrow before the
  word). Arrival `X has arrived from the west.` / portal form. Exits line:
  label dim, directions teal **per word** (commas and period dim), doors
  `(north)` with the parens dim — the improvement tt++ could not do.
  Climb exits with backslashes untouched.
- **Mobs:** one trigger, lookup of the whole line (minus trailing flag
  parens) in a Lua table `{ line = {short, tier} }`; tiers plain (default
  colour name), danger (gold `#f0c850`), roots (pink `#ef6fa6`); body
  `is here.` dim grey `#6e6e6e`. Generic fallbacks for unlisted mobs
  (`is standing/sleeping/lying here`, fighting, `The shadow of …`).
- **Flags** `(glowing)` lilac `#da9bff`, `(hidden)` dim, parens in the
  default colour, on every line, also after a named mob (tt++ could not).
- Teal `#3fb0a0`, grey `#6e6e6e`, gold, pink, lilac — all as adaptive
  colours. Red stays the game's damage colour.
- Settings (`#script set readability …`): `directions`, `exits`, `mobs`,
  `flags` (booleans, default on), `arrows` (default on), `shortnames`
  (default on; off keeps MUME's own text but still colours the name by
  tier and dims the rest).
- `@help` with before/after examples; credit to Lamia.

### C. Tests and docs

- Unit: adaptive resolution (contrast ≥ 4.5:1 on every background preset,
  unchanged when it already passes, hue kept), cecho/highlight parsing of
  `~`, the readability script against real lines (Cockpit's `.meta`
  examples and session logs in `/home/ole/MUME`).
- E2E: an adaptive colour changes when the background changes (scrollback
  recoloured); the readability script turned on rewrites a mob line.
- Perf: the mob lookup costs one Lua call per candidate line; check
  `npm run bench` is not worse.

## Tasks

- [x] ADR 0068 adaptive colours
- [x] `Color` kind, parsing (`~`), resolution, live custom properties
  (instead of a class per colour: per themed root, ADR 0068)
- [x] All consumers (output, comm, script panes, export, replay/player, downloads)
- [x] Script reference and manual (also `lineTags()`)
- [x] `readability.lua`: directions, exits, mobs table, flags, settings, help
- [x] Unit tests
- [x] E2E tests (Chromium + Firefox)
- [ ] Release
- [ ] Owner test

## Build notes

- The mob list was converted from `Mobs.tin` by a script (446 entries:
  398 plain, 43 danger, 5 roots); the key is MUME's line without its
  final period. A third field, the words of MUME's line that name the
  mob, is computed by a heuristic (the short name's head noun, else the
  first verb) for `shortnames off`.
- MUME puts flags before the period (`... to stab (hidden).`); the
  script strips them before the lookup and also takes Cockpit's form
  after the period.
- Generic fallbacks also dim players fighting or riding (`is here
  fighting …`, `is here riding …`), common in the run logs.
- Lines in a `description`, `name` or speech element (XML) are left
  alone through the new `lineTags()`; a generic line must end in a
  period, so a say never matches.
- copy2cecho keeps the game's colours at the start of a line (a red
  `*enemy*` stays red); the exits line keeps the door names after it.
- Cost, measured over 147 112 lines of four Cockpit run logs (unit
  harness, Node): 0.7 µs/line without the script, 2.8 µs/line with it
  (+2.1 µs). The mob regex alone is ~0.2 µs/line; the rest is the Lua
  calls on the ~15 % of lines that are mobs, movement or exits. A scan
  of the same logs found no rewritten prose.

## Test guide

Open https://mumecockpit.com/ (after the release) and log in.

1. Profile → Scripts: turn on **readability**. Its help (on the
   Scripts page, or `#script help readability`) shows examples and the
   settings.
2. Walk around a busy area. Look at:
   - mobs: known mobs become short (`A squirrel is here.`), dangerous
     and named ones gold, roots pink, the rest of the line dim; unknown
     mobs keep their text with `is standing here …` dimmed;
   - movement: `X leaves north ▲`, `X has arrived from the west.` with
     the direction in teal; enemies stay red;
   - the Exits line: each direction teal, commas, doors and marks dim;
   - `(glowing)` in lilac and `(hidden)` dim.
3. Options → Appearance: cycle the background through the presets,
   including **paper**. The colours already on screen change with it
   and stay readable (darker on paper, a little lighter on the dark
   themes; on black they are Cockpit's).
4. Type `#script set readability shortnames off`: new mob lines keep
   MUME's text with the name coloured and the rest dimmed. Try
   `arrows off`, `exits off` and the others the same way.
5. Check that room descriptions and what players say are never changed.

Feedback wanted: are the colours and the dimming right on your usual
background and on paper? Any mob line that looks wrong (wrong name
split with shortnames off, a missed or wrong short name)? Do you want
other parts (e.g. arrows on arrivals, more flags)?

## Owner feedback
