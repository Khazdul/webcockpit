# Stage 41 — The new start page

Status: **In progress** (night pass 2026-11-07, branch `stage-41-start-page`; see
`notes/research/start-menu-mockups/NIGHT-PASS.md` for the whole pass).

## Goal

Replace today's TUI start page (pixel banner, `<< >>` menu, key-hint row)
with the design the owner settled on after six mockup rounds on
2026-11-06/07. The reference is **`notes/research/start-menu-mockups/round6/logo-3.html`**
and the "Baseline" section of `notes/research/start-menu-mockups/README.md`
(read both first, then the briefs `BRIEF*.md` for the reasons behind each
rule). The mockup is throwaway code over a simplified DOM: never copy it as
is; re-derive the look in the app's own structure.

## What the owner approved (the baseline)

- **Wordmark: variant 3 "Inlagd metall"** (`round6/logo-3.html`; the
  owner first said 1, then changed to 3 on 2026-11-07): forged dark iron
  "MUME" (Cinzel-like) with a **flush, slightly domed metal inlay** in the
  channels of the thick strokes (the mockup has brass by day and
  moon-silver by night; **the colour is changed to cyan metal, below**). It
  **reflects, never glows**: a soft glint band follows the sun/moon light
  and the inlay dims when there is little light. **No lava, no sparks.**
  "COCKPIT" widely spaced between thin iron rules; the **rivets** match the inlay.
- **Inlay colour (owner, 2026-11-07, later):** not brass. The inlay and
  the rivets are a **bluish/cyan metal** so the mark visually echoes the
  early pixel logo (MUME `#00d0d0`, COCKPIT `#0a9a9c`, see
  `src/chrome/banner-data.ts`): think cold cyan steel / mithril, still
  metallic and reflective (glint band, brushed texture, darker at the
  edges), not glowing or neon. Day: brighter cyan-steel; night: cooler,
  more silvery cyan. First make this as a mockup tweak of
  `round6/logo-3.html` (`round6/logo-3-cyan.html`, 2–3 tint strengths side
  by side if useful), pick the one closest to the old logo's hue that
  still reads as metal, build that, and show the alternatives in the
  morning report.
- **Favicon**: an **"M"** in the same iron with the inlay (owner
  2026-11-07).
  Must read at 16 and 32 px. Today there is no new mark; the lantern mark
  of the mockups is not used anywhere.
- **Sky** driven by the **offline game clock** (`src/gmcp/clock.ts`; the
  saved `wc.clock`, else the almanac seed epoch): sun and moon enter from
  just off-screen left and climb a slow, shallow arc, set mirrored to the
  right; the sun clearly larger than the moon; they never overlap (the
  moon's drawn position is nudged). Soft clouds, sparse stars, shooting
  stars. **No Milky Way layer** (it caused "white specks" at night).
- **Calm weather director**: one state at a time, long calm stretches.
  Winter months (`seasonOf` in `src/gmcp/gametime.ts`: Afteryule, Solmath,
  Rethe) **always snow** (light ↔ steady); spring and autumn **rare, light
  rain**, a rare short autumn storm; **summer never rain**; fog only
  sometimes at dawn. Snow and rain fall over the whole screen and settle on
  nothing. **No flying leaves or petals**, no birds over a landscape.
- **Below the horizon**: no landscape. The sky continues all the way down
  as a **plain surface** (sky blue by day, near-black at night, dawn/dusk
  tints), no clouds/stars/reflections, no seam. A landscape is a parked
  idea for later.
- **Menu panel** in the Lykta family (ADR 0123): thin stone-like iron
  frame with riveted corners; the hood plate at the top centre is **glossy
  polished metal with two rivets and a fine engraved line, no lantern**.
  Items: Enter MUME (primary, separated by a rule), Profile, Scripts,
  History, Spotlights, Credits, About, each with a small line icon.
  `SCRIPTS (gibur)`: the profile name in small, dim italic.
- **Selection**: as `round2/07-falls.html`: the chosen row's text and icon
  brighten; **no glide, no glow, no sweep**.
- **Shortcuts** are marked **inside the label** (a fine lit underline under
  the letter; Enter MUME has E). **No shortcut letters at row ends, no ⏎,
  no key-hint rows anywhere.** Up/down needs no hint.
- **Quote**: style **A · Fri skrift**: no backing or dark halo; italic
  Cormorant with a crisp thin outline, a thin rule with an open diamond,
  the author in small caps; colour follows the sky (dark iron-brown on a
  bright sky, pale parchment otherwise). In the build, derive the colour
  from the sky colour model, not from reading canvas pixels.
- **Almanac** at the **bottom right**: date line ("Mersday, the 29th of
  Afterlithe"), "1:05pm · day · T.A. 3038" (**no moon text**), and the
  version ("WebCockpit 0.2.6"). No lantern icon.
- **No lanterns anywhere in the UI.**
- **Sub-pages** (the shared kit, used from stage 41 on): pages open in the
  same kind of box as the menu panel; **glass buttons** (frosted, lit top
  edge); a **Back button at the top left** of every sub-page (Esc still
  goes back); same restrained selection; shortcut letters marked in labels.
  Content-heavy pages use the largest possible box (see NIGHT-PASS.md
  part 2); that layout is designed in mockups first.
- Keyboard (↑↓, Enter/Space, letter shortcuts, Esc) and the phone stay
  first-class; the mouse gets hover. Respect `prefers-reduced-motion`;
  pause when hidden. No sound.

## Scope of stage 41

- 41a **Sky engine for the start page**: sky, sun/moon path, clouds,
  stars, shooting stars, calm director, plain lower surface. Decide in an
  ADR whether it shares code with the in-game weather (`src/weather/`,
  worker, ADRs 0093 and stage 28) or is its own module; performance target
  60 fps on an Iris Xe class laptop and a mid phone, cheap fallback for
  weak devices, no main-thread hitches > 16 ms during normal running.
- 41b **Wordmark and favicon**: wordmark 3 (cyan-metal inlay, light
  follows sun/moon),
  the "M" favicon (16/32/180 px, light and dark tabs).
- 41c **Start page layout**: panel, menu, selection, shortcuts, profile
  name on Scripts, quote A, almanac bottom right, phone layout, Enter MUME
  transition (keep it simple; the mockup's zoom is optional).
- 41d **First paint** (ADR 0083): today `src/boot/first-paint.ts` draws
  the pixel banner on the cell grid before the app chunk loads, so the
  hand-over changes no pixel. It must be redesigned for the new page (e.g.
  the sky gradient for the current game hour plus the wordmark, then the
  app takes over). Record the new contract in an ADR addendum.
- 41e **Shared sub-page kit**: the box, Back button, glass buttons,
  shortcut-letter marking, selection; used by the Profile list in this
  stage (the mockup's profile page is the reference) so the kit is proven.
  The other sub-pages keep working as today until their own stages.
- 41f **Cleanup and tests**: the pixel banner (`src/chrome/banner*.ts*`,
  `src/boot/banner-faces.ts`) goes from the start page; the phone's ESC
  menu (`src/chrome/frames/esc-main.tsx`) still uses `Banner` — keep it
  working (out of scope to redesign; a small new wordmark there is fine if
  trivial). Update unit and e2e tests (start page, menu, keys, phone),
  manual and About texts, Inv pointers.

## Rules for the night pass (owner, 2026-11-07)

- Build on branch **`stage-41-start-page`**. **Do not merge to main, do not
  tag or release.** The owner tests on the branch first.
- Decide technical details yourself and record them as ADRs (next number
  after 0123). Do not wait for the owner.
- Commit in small conventional commits; keep this checklist current.

## Tasks

- [ ] 41a: ADR for the start-page sky engine; implementation; perf check
- [ ] 41b: wordmark 3 (inlaid metal); "M" favicon
- [ ] 41c: layout, menu, selection, shortcuts, quote A, almanac, phone
- [ ] 41d: first paint redesign + ADR 0083 addendum
- [ ] 41e: sub-page kit + Profile list in the new look
- [ ] 41f: remove the pixel banner from the start page; ESC menu still OK;
      tests, manual, About, Inv pointers
- [ ] Test guide for the owner (below)

## Test guide

To be written when built: open the branch preview, check day/dusk/night
and a winter month (demo or `?` parameters if kept), keyboard and mouse,
phone, Profile list with Back and glass buttons, performance feel.

## Owner feedback

(none yet)
