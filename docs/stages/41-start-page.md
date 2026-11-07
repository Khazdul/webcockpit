# Stage 41 — The new start page

Status: **Owner testing** (night pass 2026-11-07, branch `stage-41-start-page`; see
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

- [x] 41a: ADR 0124 (own module, not `src/weather/`); sky engine in
      `src/start/sky/`; perf: 56–60 fps on the Iris Xe in Chromium and
      Firefox, sky work < 1 ms median (`bench/results/start-sky*.md`,
      `bench/results/start-page-headed.md`)
- [x] 41b: ADR 0126; wordmark 3 with the cyan inlay (tint c "Turkos",
      alternatives in `round6/logo-3-cyan.html?tint=a|b|c` and
      `round6/logo-3-cyan-compare.html`); "M" favicon (svg, ico, 180 px)
- [x] 41c: layout, menu, selection, shortcuts (E P S H L C A), quote A,
      almanac, phone; Enter MUME folds the page away, zooms the sky and
      fades into the game (1.5 s, `src/chrome/enter-transition.ts`)
- [x] Owner feedback 2026-11-07: mithril inlay (subtle tint d), row
      actions in the Profile list, profile name on Profile, the Enter
      MUME transition
- [x] 41d: first paint paints the sky and the wordmark where the app
      will; ADR 0083 addendum; e2e hand-over check (no movement)
- [x] 41e: ADR 0125; lantern kit (`src/chrome/kit/look.tsx`): box, Back,
      glass buttons, key letters; Profile list in the new look (S N E R D
      I X, a Changed column); other sub-pages unchanged on the cell grid
- [x] 41f: pixel banner gone from the start page and first paint (the
      phone ESC menu keeps `Banner`); tests, About, README, notices, spec
      and Inv notes
- [x] Test guide for the owner (below)

## Test guide

Branch only (not merged, not deployed): `git checkout stage-41-start-page`,
`npm run dev`, open http://localhost:5173/. For a true first paint use a
build: `npm run build && npm run preview`. Try Chromium and Firefox.

The sky follows the offline game clock. To see other hours and months add
URL parameters (ADR 0124): `?skyHour=6` (dawn), `?skyHour=13`,
`?skyHour=20` (dusk), `?skyHour=23`; `&skyMonth=0` (Afteryule, snow),
`&skyMonth=3` (spring), `&skyWeather=rain|snow|storm|fog|clear`;
`&skyFast` runs the clock 600× to watch sunrise and sunset; `&skyStats`
shows fps.

1. **First paint.** Reload a few times (once with a cold cache): the sky
   and the wordmark appear at once, in place; a thin cyan line in an empty
   panel shows loading only if it takes a moment; then the menu, quote and
   almanac fade in. Nothing should jump.
2. **Wordmark.** Forged iron with the mithril inlay (subtle tint d). Still
   metal, not neon, and blends with the iron? The glint leans toward the
   sun or moon. Tints b and d side by side:
   `notes/research/start-menu-mockups/round6/logo-3-cyan-compare.html`.
3. **Sky.** Day, dusk, night, dawn; winter snow; a spring rain. Calm, the
   sun larger than the moon, never overlapping, no white specks at night.
4. **Menu.** ↑↓, Enter/Space, the letters E P S H L C A, mouse hover and
   click; the selection only brightens the row. Profile shows the selected
   profile's name in dim italic. No hint rows.
5. **Quote and almanac.** Legible at every hour? (On bright days the quote
   stays pale with a crisp outline; see the open questions.)
6. **Profile list** (P). Back top left and Esc. The highlighted row shows
   Select (unless active), Edit, Rename, Delete (S E R D); New, Import,
   Export (N I X) at the foot; Enter selects (on the active profile it
   opens the editor); Tab and ←/→ walk the buttons; on the phone the first
   tap shows the buttons; the Changed column; Import and Export work.
   The editor, prompts and the import report still open in the old look.
7. **Other pages** (Scripts, History, Credits, About, Spotlights) open in
   the old look over an opaque background as before; Back returns to the
   new menu; the log player returns to History.
8. **Phone** (or a narrow window): the layout fits; taps work.
9. **Enter MUME.** The panel folds into its hood, the rest fades, the sky
   zooms a little, then a slower fade into the game (1.5 s); typing at
   once goes to the game; reduced motion gives a short plain fade.
10. **Performance feel.** Smooth, no stutter; the fan stays quiet.

Feedback wanted: the wordmark tint, the feel of the sky and the panel, the
shortcut letters, and the open questions in the session log.

## Owner feedback

### 2026-11-07 (after the night pass)

- **Wordmark tint: mithril** (tint b), not c "Turkos". Everything made
  from the old logo cyan follows (inlay, rivets, COCKPIT ink, favicon, the
  first-paint loading line, accents in the kit and the mockups); make the
  mithril more subtle if it does not blend in.
- **Profile list:** choosing a profile and then an action is awkward. Each
  profile row gets its own Edit, Rename and Delete buttons, plus Select
  when it is not the active profile; the buttons show only on the
  highlighted row.
- **Enter MUME:** everything folds away until only the sky is left, the
  sky zooms in a little, then a somewhat slower fade into the game
  (replaces the 280 ms fade).
- **The profile name** belongs on Profile, not Scripts: "PROFILE
  (khazdul)".
- The in-game window kit's thin cyan border stays as it is for now.
- Round 7 directions chosen for the later stages: see "Round 7 decisions"
  in `notes/research/start-menu-mockups/README.md`.
