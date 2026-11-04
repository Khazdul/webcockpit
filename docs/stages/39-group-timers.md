# Stage 39 — Group and Timers panes: modern look

Status: **In progress** (started 2026-11-04).

## Goal

The Group and Timers panes leave the cell-grid TUI look for the modern
one the owner chose in mockup 3c: line icons, thin bars or rings,
contextual tooltips, a fight zone in Group, a Sanctuary group in Timers,
free colours with Auto per background, flow or grid layouts. They become
the template for the other built-in panes. ADR 0122.

Mockups: https://claude.ai/artifact/14CWg5ad7j3Ut4rcywkBon (3c is the
choice; copies in `notes/research/group-timers-mockups/`, the reference is
`r2-P3c-revised.dc.html`). Round 1:
https://claude.ai/artifact/KQz9apKUpo9YMW5xhTscxf.

## Owner brief (2026-11-04)

- Improve the built-in panes visually, functionally and in content,
  starting with Group and Timers; leave the TUI feel, match the menu bar
  and its popups.
- Group: nicer HP/mana/moves bars, names that do not collide with the
  bars, players apart from NPCs, icons with hover info for sanctuary,
  poison, slept, blind, and for standing, resting, sleeping, riding; a
  better settings page; more of what GMCP gives.
- Timers: a modern look, icons per kind, a sign when a timer ends soon,
  things cast on others (charmies, blinds) told apart, sanctuary as a key
  spell.
- Rounds 2–4 decisions are in ADR 0122 "Context". Last words before the
  build: no bars/circles switch in the pane itself (gear only); "Börja nu
  bygga detta så ser vi om det blir bra i praktiken."

## Parts

- **39a Foundation** (model, settings, icons, sanctuary on others).
- **39b Group pane** and its gear and Options page.
- **39c Timers pane** and its gear and Options page.
- **39d** e2e, docs, test guide.

## Tasks

- [x] 39a: `GroupModel` keeps the GMCP member fields (position, ride,
      room, mapid, the status flags, type ally/neutral/enemy) and exposes
      the fight (opponent name and band word, the tank's member id) and
      "away" (mapid ≠ your room); `showPlayers` covers neutral and enemy;
      unit tests
- [x] 39a: Settings types, defaults and migration per ADR 0122; unit tests
- [x] 39a: `src/panes/icons.ts` (the 3c icon set) and a colour helper
      (Auto → dark/light default, custom as is)
- [x] 39a: Timers group `sanct`: own sanctuary moves there; others from
      GMCP flags, timed after your cast (cast queue + flag edge, 10 s);
      unit tests
- [x] 39b: Group pane DOM rendering: fight zone, member rows (two lines /
      one line), markers, statuses, position, away modes, overflow row,
      tooltips, dark and light; unit tests for the pure layout parts
- [x] 39b: Group gear popup and Options → Panes → Group: players, NPCs,
      away, vital colours (palette, free input, Auto)
- [x] 39c: Timers pane DOM rendering: groups and headers, bars and
      circles, flow and grid (per-group override), time text, ending-soon
      signal and threshold, soonest first, name shortening (blinds), herb
      add-view, charm ×, scrolling and indicator, log player read-only
- [x] 39c: Timers gear popup and Options → Panes → Timers: the new
      settings and the per-group table (shown, colour, layout)
- [ ] 39d: e2e for both panes (fight zone, away modes, tooltips, style,
      layout, headers, time text, colours, sanctuary on others), the
      script manual's `state.group` fields, Inv §2.3/§2.6 pointers to ADR
      0122, test guide, progress.md

## Test guide

(Written at the end of the stage.)

## Owner feedback

(After testing.)
