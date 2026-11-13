# Stage 55 — Scrap the old phone layout

Status: **In progress** (started 2026-11-13).

## Goal

One phone layout in the code. The old one (ADR 0075: tab strip, `☰`,
ESC menu, the Options hub in the cell-grid look) goes, with the
device-keyboard code kept from before stage 53. This is stage 52's
pass C (`docs/stages/52-phone-round-2.md`, C) and the first of the two
stages that finish phone and tablet (handoff of 2026-11-13 in
`progress.md`).

The old layout still serves four things; each gets a replacement first:

1. The run log player and Spotlights on a phone or tablet.
2. `?phone=1` in a desktop-size window (desktop e2e specs).
3. A phone in the browser's "Desktop site" mode.
4. The fallback when the phone chunk fails to load.

## The order agreed with the owner (2026-11-13)

1. Test baseline: the full e2e, the flaky cases, the bundle size.
2. **Stage 55** (this file): scrap the old phone layout.
3. **Stage 56**: loose ends (stage 52 D) and the menu pages at tablet
   width.
4. One test guide for phone and iPad together, then a release.

## Owner decisions (2026-11-13)

- **Player and Spotlights on a phone or tablet:** reuse the game's
  phone layout. No mockup. Keep the theme; phone mode does not need
  needlessly many options. "Fairly like today, but freshened up from
  our phone / tablet layout."
- **"Desktop site" chosen on a phone:** the player asked for the
  desktop version and gets the desktop cockpit; they manage as best
  they can.
- **Comm gets no send button** (stage 52 D6: closed).
- **No compact Statistics for the strip** (stage 52 D5: closed; the
  owner comes back to it if needed).
- **Old-look pages:** the profile prompts were moved to the look kit
  in stage 53 (checked: `docs/stages/53-own-keyboard.md`, "Profile
  prompts in the new look"). What is left in the old look on a phone
  (the ESC menu, its Options, Statistics, Exit) is reached only in the
  old layout and goes with this stage.
- **Old owner device tests are struck** (30e; 30f items 5, 9, 10; the
  stage 52 and 53 guides; stage 52 B3 and B4). The closing test guide
  replaces them. Only the owner can see: the iPad taking the tablet
  path with no flag on the live site, and the screen staying on while
  connected. A real Android tablet stays untested.
- Fullscreen on iPhone and iPad is not touched (decided in stage 54).

Decided by the session (technical): the chunk-failed fallback becomes a
plain notice with a reload; stage 52 D1–D4, D8, D11, D12 are closed as
accepted limits; D7 and D9 are fixed in stage 56; D10 goes with this
stage.

## Risks looked at: "Desktop site" gives the desktop cockpit

- Detection is "a phone's screen, but a window that is not a phone's"
  (`phoneGameWanted` in `src/app/shell.ts`). A phone in its normal mode
  never has such a window, and a split screen only makes it smaller, so
  a phone should not land on the desktop by mistake.
- On the desktop cockpit a phone has the device's keyboard, small text
  and no automatic login. Taken as the player's own choice.
- A tablet is not affected: iPadOS asks for the desktop site by
  default, so there the request says nothing; `?tablet=desktop` stays
  the way to the desktop cockpit (ADR 0140).

## Test baseline (2026-11-13)

- Bundle (production build, `main` at 0.8.3): phone chunk 125.1 kB
  (gzip 40.5), phone CSS about 59 kB. For comparison, built from the
  tags: 0.7.0 112.7 kB, 0.8.0 124.7 kB. Stage 54 added 12 kB; the
  0.8.1–0.8.3 fixes 0.4 kB. `app` chunk unchanged at 228.6 kB.
- Full e2e at 5 workers (2026-11-13, `main` at 0.8.3): the run was cut
  off at 1249 of about 1370 with one failure, the known
  `scripts-settings.spec.ts:411` on Chromium. The phone project was run
  again whole: 465 passed, 5 failed in one clump, at the moment a
  source file was edited under the running dev server; the two files
  alone afterwards 42/42. So: nothing failing but the known case.
- `scripts-settings.spec.ts:411` (stage 52 E1) was a real defect: two
  fast clicks on a script's switch flipped it once, because the second
  click read the row's stale state. Fixed (abb9d15e).
- `script-panes.spec.ts:177` (E2) was not order-dependent: alone on
  Chromium it failed about two times in five, clicking the temporary
  pane's link before the pane had drawn its row. The spec waits for
  the row now; 10/10 (d091a44f).
- `phone-auto-login.spec.ts` six times over at 5 workers: 132/132. The
  single failure at 0.8.3 did not come back; left.
- Unit: 4221 passed.
- Not done: E3 (load-sensitive desktop cases in full parallel runs).
  The rule that holds: full runs at 5 workers, and no source edits
  under the dev server while one runs.

## Plan

The investigation is `notes/research/stage-55-plan.md` (file and line
references, the dead code list, the specs affected). In short:

- The old layout lives in `src/layout/cockpit.ts` and
  `src/layout/phone.ts`; the player gets it because `src/app/app.ts`
  drops `phoneGame` for player Apps. The exported HTML replay never
  runs phone code and is not affected, but `player-host.ts` is bundled
  into it and must never value-import `src/phone`.
- The player on a phone or tablet: the same `PhoneLayer` with a
  `replay` dependency (no compass, hot keys, keyboard, menu, wake lock,
  automatic login or defaults patch; Comm read-only without search;
  no Statistics page). The host keeps the layer's state over the
  rebuild a backward seek makes. Nothing is written to the viewer's
  settings.
- Spotlights' viewer stays text only, as on desktop, without the two
  empty rows of today.

Decided by the session, in the owner's direction ("fairly like today,
freshened up"; he sees them in the test and can turn them):

- **Transport:** today's control row, docked where the command row is
  in the game, always shown; the rail stays at the right edge.
- **The way out:** the bar's first key, where the menu key is in the
  game; no Back at the top left on a phone (it would lie on an open
  strip or Comm).
- In the phone player the Panes popup goes; Display (text size, theme)
  stays. Band heights and a moved lens last while the player is open.
- `?phone=1` stays and means "a phone at any window size" (the phone
  specs, shot scripts and benches use it); it never makes a tablet.
- Desktop site: a touch device found on a phone's screen in a window
  that is not a phone's is `touch` only. New-user defaults follow the
  device, not the mode.
- Chunk failed: one plain cover with a Reload button.

### Rounds

| Round | What | Ends in |
|---|---|---|
| 55a | Replay plumbing, nothing switched: allocator without a command row, `Cockpit.phoneReplay`, the layer's `replay` mode and state hand-over, Comm read-only, the theme mark on the cockpit, the player's font minimum | unit green, e2e unchanged |
| 55b | Device and shell: Desktop site, `?phone=1`, defaults, the chunk-failed cover; the desktop specs on the old ESC Options deleted | Desktop site gives the desktop cockpit |
| 55c | The player switched over: docked transport, exit key, Spotlights, new phone player specs | run log and Spotlights in the new layout |
| 55d | Deletion, eager side (layout, shell, viewport, CSS) | full e2e green, bundle measured |
| 55e | Deletion, chrome side (ESC main, Options frames, old Statistics page) | the same |
| 55f | ADR, test guide, session log | owner test |

55a and 55b run side by side; 55c after both; 55d and 55e side by
side after 55c. The password field swap in `src/ui/input-pane.ts` is
the riskiest deletion and goes last or to stage 56.

To verify on a device (the owner's test): Android Chrome's Desktop
site keeps `screen.width` at the phone's width while the window grows
to about 980 px; iPhone Safari's desktop request; page zoom below
100 % on a phone.

## Tasks

- [x] Owner decisions taken in; stage file
- [x] Test baseline: full e2e, flaky cases
- [x] Investigation and plan
- [ ] 55a replay plumbing
- [ ] 55b device and shell switch-over
- [ ] 55c the player switched over
- [ ] 55d deletion, eager side
- [ ] 55e deletion, chrome side
- [ ] ADR, test guide, session log

## Built

## Test guide (for the owner)

## Owner feedback
