# Start menu — round 2 brief (builds on round 1, 01 "Lyktans väg")

The owner chose **01 Lyktans väg** (`round1/01-lantern-road.html`) as the
direction. Round 2 refines it. The rules of `BRIEF.md` still apply (game
time offline, demo panel, Profile sub-page, sizes 1440×900 / 1920×1080 /
390×844, Playwright screenshots with self-review, reduced motion, pause when
hidden, nothing outside `notes/research/start-menu-mockups/`, no commits).

## Owner feedback on 01 (2026-11-06) → rules for round 2

Wordmark
- The direction of the logo is liked. **Fewer, less prominent sparks.**
  (Logo alternatives are explored separately in `round2/logo.html`.)

Menu panel (liked in general)
- **No big lantern** beside Enter MUME.
- **Remove the "Gibur · mume.org:4242" line.** Instead the Scripts row reads
  `SCRIPTS (gibur)`: the parenthesis and profile name much smaller and much
  dimmer than the item.
- The light sweep / glow that travels when moving up and down is **too
  prominent**: make it far more subtle, remove it, or change it.
- **Remove the "choose · go" hint** in the panel.
- Keep the quote under the panel.

Corners
- **Remove the almanac/moon text bottom right.** (The demo panel bottom left
  stays; it is a mockup tool.)

Sky
- **The sun is clearly larger than the moon.**
- **Sun and moon never sit in the same spot** (nudge the moon's drawn path
  or position when they would overlap; game-time correctness of *which* is
  up and the moon phase stays).

Weather: **too much happens at once.** New director:
- One weather state at a time, long calm stretches between changes.
- **Winter: always snow** (varying gently between light and steady).
  Winter months = `seasonOf` in `src/gmcp/gametime.ts` (Afteryule, Solmath,
  Rethe), so the start page agrees with the game's own season names.
- **Spring and autumn: rain only now and then** (say ≤ 20 % of the time),
  and **lighter / less prominent** than in round 1. A rare short storm in
  autumn is fine.
- **Summer: never rain.** Clear or light clouds.
- Shooting stars sparse. Fog only occasionally, at dawn.
- Seasonal life stays (birds by day, fireflies on summer nights, leaves in
  autumn, blossom in spring), but never several loud effects at once.

Leaves (the owner likes them; explore): slower, tumbling/fluttering, more
detailed shapes, varied sizes, other colours.

Landscape
- **Remove the road, the house/inn and the lamp posts** (they do not fit).
- The background **mountain does not look good** — needs real work:
  convincing ridges, light and shadow faces, snow gullies, atmospheric depth.
- Trees are OK but can improve: **tree tops sway in the wind**, other
  layouts.
- Explore: **a valley, a distant mountain, and a magic gate into the
  mountain** (Tolkien feel, think of the hidden gate into Moria) — far away
  and subtle. It must be an **original** gate design (no film/Doors of Durin
  replica): e.g. a faint arch of moon-silver lines at the mountain's foot
  that glows a little at night, more with a bright moon, invisible by day
  or only a hint.
