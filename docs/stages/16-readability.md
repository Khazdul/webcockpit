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

- [ ] ADR 0068 adaptive colours
- [ ] `Color` kind, parsing (`~`), resolution, CSS class registry
- [ ] All consumers (output, comm, script panes, export, replay/player, downloads)
- [ ] Script reference and manual
- [ ] `readability.lua`: directions, exits, mobs table, flags, settings, help
- [ ] Unit tests
- [ ] E2E tests (Chromium + Firefox)
- [ ] Release
- [ ] Owner test

## Test guide

(Written when the stage is built.)

## Owner feedback
