# Stage 38 — Scripts page: framed detail, editable settings, readable help

Status: **Done** (2026-11-04). Released in 0.2.5.

## Goal

The Scripts page (start menu → Profile → Scripts, and the in-game Scripts
window) gets the layout the owner chose from four mockups (direction A,
pure TUI): the selected script joins a framed detail panel, settings are
edited in place with real controls and saved at once, and the help is
typeset and scrolls in its own box so the settings are always in view.
ADR 0121.

Mockups: https://claude.ai/artifact/AnegkBudftdxxgbKjL9ZiZ (A, full width
and small window).

## Owner brief (2026-11-04)

- The help takes too much room and is hard to read in a small window
  (smaller text or its own scrolling box were ideas).
- Settings must be editable in a nice way, like a control panel: numbers
  with the arrow keys or typed, booleans as switches, strings as text
  fields. They must be visible without scrolling past the help.
- The right side must visibly belong to the script picked on the left:
  a frame or a fill, and the script's name clearly as a heading.
- Answers to the follow-up questions: one mockup per level; the page must
  still blend into the pure-TUI start menu; save on change where possible;
  one "reset to defaults" for all; drop `#script set` from the page (the
  manual has it); changes to the script API are fine; full width and the
  in-game window first, phone and tablet must keep working but are not
  the priority; the list and button row may change too, the padlock stays,
  no "mine / bundled" headings; full keyboard control stays.
- Choice after the mockups: **A** for the layout, A's help (same view,
  own scroll box). Not D's accordion.

## Tasks

- [x] Header: keep `@help` indentation (relative to the least-indented
      line); `@setting` options `min..max`, `step`, `unit`; type `choice`
      with `|` options; header problems for bad options; unit tests
- [x] `convertSetting` / `setSetting`: range and option checks with clear
      reasons; `ScriptLibrary.resetSettings(name)` with
      `sysSettingChanged` for changed values; unit tests
- [x] Help typesetting (paragraphs, `- ` items, tables, preformatted runs,
      `## ` headings), width-aware, shared by the page and `#script help`;
      unit tests against every bundled script's help
- [x] Page layout: buttons `NEW IMPORT MANUAL`; list without EDIT; the
      selected row joined to the framed detail; the frame's top border with
      `┤ name ├` and `EDIT EXPORT RENAME DELETE`; status and problems;
      Settings, Commands, Help (fold, own box and scrollbar); narrow layout;
      new derived panel fill role (dark, light, paper)
- [x] Settings controls (boolean, number, choice, string) with mouse and
      keys; changed `*`; RESET ALL; flashes; saved at once
- [x] Keys: zones buttons / list / detail, Tab cycle, Esc from detail to
      list, PgUp/PgDn and wheel for the help; footer hints per zone
- [x] Bundled scripts: mercenaries `cost` as choice; ranges and units on
      the numbers; `##` headings in the long helps
- [x] Docs: script manual and API reference (`@setting` options, help
      markup and typesetting, the Scripts page), page header comment;
      Inv/spec references if any point at the old page
- [x] e2e: selection and frame, edit each control type by keys and mouse
      (value saved, running script sees it), RESET ALL, help scroll with
      PgUp/PgDn, narrow window, phone width still usable
- [x] Owner test guide (below), progress.md

## Test guide

Dev server (`npm run dev`, http://localhost:5173/) on the branch
`stage-38-scripts-page`.

1. **Start menu → Profile → Scripts** (full width). Pick almanac: the row
   turns into a tab that runs into the frame, `┤ almanac ├` sits in the
   frame's top border, EDIT EXPORT RENAME DELETE on the right (RENAME and
   DELETE dim for bundled scripts). Settings and Commands are at the top;
   the help is in its own box below with a scrollbar.
2. **Help readability:** scroll almanac's and keymanager's help with
   PgUp/PgDn or the wheel. Paragraphs flow without odd breaks, the command
   lists are two-column tables, headings ("Three tabs" …) stand out.
   readability's "becomes:" examples keep their lines. `▾ Help` folds it.
3. **Settings by mouse:** mercenaries: click `[ON|OFF]` on autopay, pick
   `(•) 20` on cost, click `◂ ▸` on minutes, click the value of warn and
   type 7. A changed value gets an amber `*`. RESET ALL brings everything
   back to the defaults.
4. **Settings by keys:** from the list press → (lands on the first
   setting), ↑↓ between rows, ←→ change the value (flip, step, pick),
   Enter on a number to type one, Esc back to the list. Tab cycles
   buttons → list → detail. Try a string setting on a script of your own
   (NEW, add `-- @setting food string bread "What to eat"`).
5. **In game:** open the Scripts window from the menu bar, make it small.
   Labels move under the controls and the help tables stack. Turn
   coinlooter's `delay` up while you play: it takes effect at once.
6. **Phone width** (optional): the page still works as before (no frame).

Feedback wanted: does the frame make it clear which script you are
looking at? Are the controls easy to use with keys and with the mouse?
Is the help readable now, also in the small window? Are the ranges and
units on the bundled settings sensible (remind 0–24 h, coinlooter delay
0–10 s in 0.5 s steps, keymanager hours 0.5–24 h and tvclose 0–120 s,
mercenaries minutes 5–60 and warn 0–30 min)?

Known: at the smallest window size the frame content scrolls as a whole
and the help box is only a few rows; error lines under a script in the
narrow list are cut short (full text in the tooltip and the frame).

## Owner feedback

2026-11-04, after the first build: drop the join between the selected row
and the frame (the open edge that moved with the selection), and the
`┤ ├` round the name in the top border; the line stops at the name.
Done (ADR 0121 addendum, 650d036).

2026-11-04: "Det här blir bra. Låt oss spara detta. Vi behöver inte
publicera än." Approved; merged to main, release held back while the
owner makes more changes.
