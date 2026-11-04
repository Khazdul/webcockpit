# Stage 38 — Scripts page: framed detail, editable settings, readable help

Status: **In progress** (2026-11-04).

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
- [ ] Owner test guide (below), progress.md

## Test guide

(Written when the build is done.)

## Owner feedback

(Pending.)
