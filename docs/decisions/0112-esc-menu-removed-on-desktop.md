# 0112 — The ESC menu is removed on desktop and tablet

- Status: Accepted
- Date: 2026-11-01
- Related: stage 30 (`docs/stages/30-fixed-menu.md` S2, S10, "30f build
  plan"), ADR 0075 (phone access, `☰`, `#menu`), ADR 0097 (fullscreen
  button), ADR 0099 (menu bar), ADR 0100 (Disconnected notice), ADR 0103
  (windows), ADR 0107 (settings popups), ADR 0108 (popup focus), ADR 0109
  (Statistics pane), Inv §4 (ESC menu)

## Context

Stage 30 replaces the in-play ESC menu with the menu bar. Steps 30a–30d
gave every entry of the menu a replacement where the bar exists:
Continue → nothing (nothing blocks play); Reconnect → the Disconnected
notice (ADR 0100); Statistics → the Statistics pane (ADR 0109); Profile →
the Profile window (ADR 0103); Options → the Panes popup, the Settings
popup and the pane gears (ADR 0099, 0107), and Options → Scripts → the
Scripts window (ADR 0103); Exit → the Exit popup (ADR 0099). Until 30f
the menu still opened on Esc, `#menu` and a tablet's `☰`, beside the bar.
Step 30f removes it on desktop and tablet (S10). The phone keeps it until
its own stage; the start page's Options is unchanged.

## Decision

- **Where:** wherever the menu bar exists (`ui.bar`, i.e. not
  `device().phone`), nothing opens the ESC menu and the shell never mounts
  it. The shell hands the App `onEscape` and `ui.openMenuAt` only on the
  phone (`AppUi.openMenuAt` is optional now), and `Shell.openMenu` returns
  at once when the App has a bar.
- **Esc in the game input** (desktop, tablet): scrolled back → bottom;
  else the bar's open popup closes (its own or an adopted one); else the
  topmost window gets its close request; else, in the cockpit's
  fullscreen, the Exit popup opens (the owner's 30b request, ADR 0103);
  else nothing. A focused popup or window handles its own Esc first, as
  before (ADR 0108). On the phone Esc still opens the ESC menu.
- **`#menu`** with the bar prints one system line and opens nothing:
  `The ESC menu is gone: use the menu bar, or #profile, #scripts, #panes,
  #settings, #fullscreen, #exit.` (`MENU_GONE_HINT` in `src/app/app.ts`).
  On the phone it opens the menu, as before. The command stays a client
  command with its full name (ADR 0075), so macros that bind it keep
  working on the phone and say why they do nothing elsewhere. `#help
  menu` says both.
- **Menu button `☰`:** phone only (`device().phone`). A tablet uses the
  bar by touch; the bar's icons, popups and windows already work with a
  finger (ADR 0103 pointer events, ADR 0108).
- **Disconnect:** unchanged from ADR 0100: the Disconnected notice on bar
  devices, the ESC menu's auto-open with Reconnect selected on the phone.
- **Removed** because they only served the ESC menu beside the bar: the
  menu's way to the windows (`EscActions.openWindow`, `OpenWindowCtx`,
  `useOpenWindow`, `Shell.openWindow`), so the menu's Profile and Options →
  Scripts are plain frames again, as on the phone and the start page; the
  windows' `blur()` and the bar's popup `reset()` when the menu opened
  (`MenuBar.reset` is private, used when the cockpit hides); the
  "nothing while the ESC menu is open" checks in the shell's window and
  popup toggles. The ESC menu's frames (`EscMain`, `ProfileEntry`,
  `ExitConfirm`, `LiveStatsFrame`) and the menu targets stay for the
  phone; Options → Panes → Appearance stays phone only (ADR 0107).
- **Chrome loading:** unchanged in code. In `?bench` and the offline modes
  the chrome chunk now loads on the first window, popup or Statistics
  pane (or the phone's first Esc) instead of the first Esc; the prefetch
  rules stay.
- **Text:** the `#help` sections (`#menu`, `#exit`, Typing commands,
  Scripts), the script manual (Getting started; ESC among the keys that
  cannot be bound), README, spec §1, §2.1, §2.3, §2.6, §2.10 and §2.12,
  the `#script list` note with no scripts, and the code comments name the
  bar and its `#` commands where they named the ESC menu.

## Consequences

- Esc with nothing open is free on desktop and tablet: it never covers the
  game. It still cannot be bound by a macro (it closes popups and windows,
  and returns from the scroll-back).
- A user who looks for the menu by habit gets the `#menu` hint, and the
  bar's tooltips name each icon.
- The e2e specs that reached a frame through the ESC menu on desktop go
  through the bar, its popups and windows, or a `#` command; tests of the
  ESC menu itself run on the phone project. New checks: Esc with nothing
  open opens nothing, `#menu` prints the hint, a tablet has no `☰`, a
  disconnect on desktop opens no menu.
- The ESC menu's code stays in the chrome chunk for the phone; it goes
  with the phone stage.
