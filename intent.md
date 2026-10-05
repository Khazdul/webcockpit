# WebCockpit — Intent

> Status: APPROVED by owner 2026-09-27. Goal 10 (user scripts) approved
> 2026-10-01. Goal 11 (foreign profile import) approved 2026-10-04.
> Goal 12 (phone access) approved 2026-10-04. Mudlet added to Goal 11
> 2026-10-05.
> Source: `notes/grilling.md`, rounds 1–3 (2026-09-27).

## Vision

A MUME client that runs entirely in a desktop browser, opened from a link,
with no installation and no application server. It should feel as fast
as TinTin++ in a terminal and look and behave nearly identically to
Cockpit (`/home/ole/MUME`): the same start page, panes, menus, design and
TUI feel. It is a new codebase; Cockpit is a knowledge and visual
reference only.

## Users

- **Primary: MUME veterans**, including PvP players, who today use tt++,
  Cockpit or similar power clients, and who want the same speed and
  control without installing anything.
- One character per browser tab. Multi-login rules are the player's
  responsibility, not the client's.
- New players are welcome but are not the design target.

## Goals

1. **Latency on par with tt++ in a terminal.** Incoming text renders
   instantly, with no smooth scrolling, animation or perceived delay. A
   sent command leaves the browser as fast as possible. tt++ is the
   reference.
2. **tt++-level client features:** actions, aliases, substitutes,
   highlights, gags, hotkeys/macros, variables and scripting logic,
   GMCP, logging.
3. **A profile editor that mirrors Cockpit's:**
   - a *lite view* with forms for aliases, actions, hotkeys, highlights,
     substitutes, …;
   - an *editor view* where the whole profile is edited as text in tt++
     syntax.

   Both views edit the same profile.
4. **Cockpit's integrated features:**
   - Panes: character, timers, group, communication, UI messages.
   - Start page with profile picker.
   - ESC menu.
   - Runs.
   - Statistics.
   - History.
   - Log player.
   - Export editor with HTML replay.
   - Spotlights.

   The default layout looks like Cockpit. Panes can be docked and
   arranged freely, toggled on and off, and customised like in Cockpit.
5. **Full GMCP integration, under the hood** as in Cockpit. There are no
   user-facing GMCP tools (the earlier GMCP editor idea was dropped
   2026-09-27).
6. **Configurable look:** font, colours and cursor, like foot in
   Cockpit's Windows setup.
7. **Profile data in the browser,** with export and import of a profile
   as a local file.
8. **Hotkeys in a normal browser tab.** Every key combination the browser
   allows can be bound.
9. **An MMapper-based map,** built after the full client works. It will
   either integrate MMapper directly or be new work based on MMapper.
   Getting this integration right is critical. The integration path is
   researched and decided before the spec is approved, so that nothing
   built before then is incompatible with MMapper.
10. **User scripts** (added 2026-10-01, built before v1). A script library
    beside the profile, in Lua, with Mudlet-like names where that costs
    nothing:
    - Scripts trigger on incoming text, aliases, keys, timers and GMCP;
      they send to the game and echo locally.
    - Scripts can create their own TUI panes with text, gauges and
      clickable rows and characters, docked like the built-in panes.
    - Scripts run sandboxed: they reach only the script API, never
      stored data, the network or the password.
    - A Scripts page lists the scripts with enable/disable and shows
      each script's help; a full-screen editor edits the code.
    - Bundled scripts: key manager, coin looter and mercenaries.
    - Scripts are exported and imported as files, like profiles.

11. **Import of foreign client settings** (owner request 2026-10-04).
    A settings file from TinTin++, JMC or Powwow can be imported as a new
    profile. The format is detected automatically, everything that can
    be translated to the profile language is translated, and the rest is
    kept visibly in the profile, never silently lost. The user gets a
    report: the detected format, how many settings were translated, and
    how many were left untranslated and why.
    - **Mudlet** (added 2026-10-05): a Mudlet profile or package file
      becomes a plain profile too. Aliases, triggers, keys, highlights,
      substitutes and variables are translated to tt++ rules, including
      the common Lua forms in their bodies. A Mudlet import never
      creates scripts (Goal 10); what cannot become tt++ is kept in the
      profile as text. Installed third-party packages are not imported;
      the report names WebCockpit's built-in replacement where there is
      one.

12. **Phone access** (owner decision 2026-10-04). WebCockpit can be
    opened on a phone to log in, read and chat. Real play on a phone is
    not a goal. Menus work by touch, and a phone gets a simple layout
    that fits its screen.
    - **Desktop is not affected.** Everything for phones is switched on
      only when a phone (or touch screen) is detected. Desktop is 99 % of
      the use; any change that would also reach desktop is put to the
      owner first.
    - A session dies when the phone locks or switches app (the browser
      suspends it). This is accepted.

## Non-goals

- Generic MUD client: MUME only.
- Play on mobile and tablet. Desktop Firefox and Chrome are the target;
  phones get the limited access of Goal 12, tablets only its touch fixes.
- Import from zMUD/CMUD or other clients than those in Goal 11,
  and of Cockpit's Lua modules.
- Byte-for-byte tt++ compatibility. tt++ syntax is used in the editor
  view, but the exact supported command set is defined in `spec.md`.
- Porting Cockpit's scripts or readability modules. WebCockpit's
  scripts (Goal 10) are new code with a new API.
- Automation limits enforced by the client: following MUME's rules is
  the player's responsibility.
- Cross-device sync or user accounts (not in the first version).
- Pixel-identical copy of Cockpit: the target is "very close".

## Constraints

- **No application server.** Static files only; the browser connects
  directly to MUME's WebSocket endpoint. Verified 2026-09-27 (ADR 0002).
  If MUME later blocks us, the fallback is to contact MUME.
- **Private hobby project.** MUME management is not involved during
  development. The repository and deployment stay private until the
  owner judges the client mature. The Valar are contacted before
  WebCockpit is shared with other players (password-phishing concern
  raised in Play MUME's README).
- **Licence:** GPL when shared (ADR 0001).
- **New code only.** Nothing is copied or ported from Cockpit.
- **Build process:** Claude Code with subagents, in stages. Each stage
  ends with something the owner can test in the browser.

## Success criteria

- **v1 is done** when the owner, after live PvP use over several
  sessions, judges WebCockpit to be as good as Cockpit.
- **Latency:** in side-by-side use with tt++, the owner notices no
  difference in output or command send speed.
- **Look and feel:** Cockpit users recognise the start page, panes and
  menus immediately.
- **Profile round-trip:** a profile can be exported to a file and
  re-imported with nothing lost, in both lite view and editor view.

## Open questions

None blocking. The following are decided in `spec.md` or ADRs:

- The supported tt++ command subset.
- Stage order.
- Storage layout.
- Hosting while private.

MMapper integration path: decided in ADR 0003.
