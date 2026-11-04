# Stage 39 — Group and Timers panes: modern look

Status: **Owner testing** (built 2026-11-04).

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
- [x] 39d: e2e for both panes (fight zone, away modes, tooltips, style,
      layout, headers, time text, colours, sanctuary on others), the
      script manual's `state.group` fields, Inv §2.3/§2.6 pointers to ADR
      0122, test guide, progress.md

## Test guide

Dev server (`npm run dev`, http://localhost:5173/) on the branch
`stage-39-group-timers`. Play in MUME with a group if you can; the offline
demo (`/?fixture=gmcp-demo.log&speed=0`) shows the panes with little data.
Make the Group and Timers panes large enough to see everything (drag them
taller, or float them) and also try them small.

1. **Group, members:** players have a person icon (ally blue, other race
   amber or a red horned helm), NPCs a grey diamond and their label as a
   tag. Two lines per member when there is room, one line when it is
   crowded. Hover a bar (`HP 37/158 · 23%`), an icon (poison, sanctuary,
   blind …), the position icon and a name: each has its own tooltip.
2. **Group, fight:** start a fight. The zone on top shows the tank (shield,
   HP, numbers) against your opponent (axe, its HP word, a red bar from
   the right); the tank also has a shield in the list. The zone goes away
   when the fight ends.
3. **Group, away:** a group mate in another room shows the room name and
   is dimmed. Gear → Away members → Dim only: just dimmed (the room is in
   the name's tooltip).
4. **Sanctuary:** cast sanctuary on a group mate. Timers → Sanctuary shows
   them with `~4m` (an estimate, the tooltip says "about"), and the Group
   pane rings their sanctuary icon. Someone else's sanctuary shows as `?`.
   Your own sanctuary is in Sanctuary now, not in Spells.
5. **Timers, look:** gear → Style Bars / Circles, Layout Flow / Grid
   (Columns Auto or 1–6), Group headers off (groups stack tightly), Time
   text off (bars and rings only). In the group table, give a group its
   own layout and its own colour (palette, free colour, Auto).
6. **Ending soon:** a timer keeps its colour to the end; with Signal Text
   its time turns red and bold under the threshold (Warn at), with Pulse
   the fill pulses. Soonest first puts it on top of its group.
7. **Blinds:** blind several mobs with long names. Names lose `a/an/the`
   and are shortened in the middle only when they do not fit; the full
   name is in the tooltip.
8. **Paper:** Options → Appearance → background Paper. Both panes and
   their tooltips and gears follow the light side.
9. **Kept:** the gold `+` (herblore add-view), the charmie `×`, and the
   Options → Panes → Group and Timers pages.

Feedback wanted: how does it feel in a real fight and with many blinds?
Is the one-line Group mode (small pane) readable, and is the fight row
without names enough there? Are the default colours right on black and on
Paper? Is "Auto" grid in circles mode too eager to use two columns with
short names? Anything you miss from the old panes?

Known: in the smallest default pane sizes the one-line Group fight row
shows only bars and icons (names in the tooltips); a Timers pane two rows
high can hide its first item under the indicator when headers are on;
recasting sanctuary on someone who is already glowing does not restart
the estimate (their flag never turns off).

## Owner feedback

(After testing.)
