# WebCockpit — Intent

> Status: APPROVED by owner 2026-09-27. Goal 10 (user scripts) approved
> 2026-10-01. Goal 11 (foreign profile import) approved 2026-10-04.
> Goal 12 (phone access) approved 2026-10-04. Mudlet added to Goal 11
> 2026-10-05. Goal 12 widened to light play on a phone 2026-11-10;
> automatic login for the session on phone and tablet added 2026-11-13.
> Goals 13–15 (accounts and sync, usage statistics, public sharing)
> added 2026-11-13; with them the "no application server" constraint
> and the "no accounts" non-goal were replaced. Approved by the owner
> the same day.
> Source: `notes/grilling.md`, rounds 1–3 (2026-09-27).

## Vision

A MUME client that runs entirely in a desktop browser, opened from a link,
with no installation. The game connection goes straight from the browser
to MUME; a small service of our own beside it only keeps accounts in
step, counts use and hosts shared runs (Goals 13–15). It should feel as fast
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

12. **Phone access** (owner decision 2026-10-04, widened 2026-11-10;
    wording 2026-11-12).
    WebCockpit can be opened on a phone to log in, read, chat and play
    lightly: walk in every direction, look, flee, and send up to six
    commands of the player's choice from on-screen keys, without a
    keyboard up. Typing uses a keyboard of the client's own, not the
    device's. The phone is mostly for communication; full play (real
    fights, PvP) on a phone is still not a goal. A phone gets its own
    layout in the game, made for the thumb, in the same look as the
    desktop.
    - **Desktop is not affected.** Everything for phones is switched on
      only when a phone (or touch screen) is detected. Desktop is 99 % of
      the use; any change that would also reach desktop is put to the
      owner first.
    - A session dies when the phone locks or switches app (the browser
      suspends it). This is accepted.
    - **Automatic login for the session** (owner decision 2026-11-13;
      phone and tablet only). Because the link dies so often, the
      client asks after every login by hand whether to log the
      character in again by itself. On Yes, the name and the account
      password are kept in the page's memory only, never in storage,
      and are gone when the page is closed or reloaded, when the
      player leaves to the start menu, or after three hours without a
      connection. Until then a lost link is followed by a new
      connection and the login typed by the client. The owner
      evaluates this over time.

13. **Accounts and sync** (owner decision 2026-11-13). A player can
    create an account and get the same profiles, scripts, settings and
    saved runs on every device, kept in step, with no export and
    import between them.
    - **An account is optional.** Playing without one stays possible
      and loses nothing it has today.
    - **User name and password, no e-mail.** No personal data is asked
      for. MUME names and passwords are never stored.
    - **The data is encrypted in the browser** before it is sent; the
      service cannot read it. Registration says plainly how it works
      and what the risks are, and the player chooses.
    - Settings follow per device type (desktop, tablet, phone).
    - Saved runs follow too, within a storage limit per account. When
      a run does not fit, the player is offered to download it.
    - Accounts are not deleted for inactivity: what a player made
      stays. The owner can remove accounts by hand.
14. **Usage statistics** (owner decision 2026-11-13). The owner can see
    how many use the client, how many are online now, and how that
    develops, on an admin page with graphs. Counting is anonymous, per
    device, for every user. Who is online is never shown.
15. **Public sharing of cut runs** (owner decision 2026-11-13). A run
    cut in the export editor can be shared as a link instead of a
    file, and published to a public page reached from the start page,
    where others watch it, rate it with 1–5 stars and comment, and
    where the best rated runs form a top list. A logged-in player gets
    a notice when a new run has been published. Content shows at once;
    it can be reported, and the owner removes content and blocks
    accounts.

## Non-goals

- Generic MUD client: MUME only.
- Full play on mobile and tablet. Desktop Firefox and Chrome are the
  target; phones get the light play of Goal 12. Tablets get play in
  between (owner decision 2026-11-12): better than the phone and clearly
  below desktop, good enough for an XP session, probably not for PvP,
  in portrait and landscape alike, with no physical keyboard assumed.
  iPad is the device it is tested on; Android tablets should work but
  are not tested by the owner.
- Import from zMUD/CMUD or other clients than those in Goal 11,
  and of Cockpit's Lua modules.
- Byte-for-byte tt++ compatibility. tt++ syntax is used in the editor
  view, but the exact supported command set is defined in `spec.md`.
- Porting Cockpit's scripts or readability modules. WebCockpit's
  scripts (Goal 10) are new code with a new API.
- Automation limits enforced by the client: following MUME's rules is
  the player's responsibility.
- Showing who is online, or any character or account name in the
  statistics.
- Version history of profiles and scripts in the cloud, a shared
  library of scripts and tilesets, error reports from the client,
  test versions per branch. Possible later, not planned.
- Storing e-mail addresses or other personal data.
- Pixel-identical copy of Cockpit: the target is "very close".

## Constraints

- **The game connection never passes through us.** The browser
  connects directly to MUME's WebSocket endpoint. Verified 2026-09-27
  (ADR 0002). If MUME later blocks us, the fallback is to contact MUME.
- **A small service of our own, only beside the game** (2026-11-13,
  replaces "No application server"; ADR 0144). It serves the files,
  keeps accounts and their encrypted data, counts use and hosts shared
  runs. Nothing it does may be in the path of a key press or a line of
  game text (Goal 1), and the client must work in full when the
  service is down or the player is logged out.
- **Privacy by construction.** As little as possible is collected; the
  GDPR is handled as well as a hobby project can: no e-mail, a plain
  privacy text, deletion by the player.
- **Private hobby project.** MUME management is not involved during
  development. The repository and deployment stay private until the
  owner judges the client mature. (The earlier line about contacting
  the Valar before sharing was dropped by the owner 2026-11-13.)
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
- **Sync:** the owner edits a profile on the desktop, opens the phone,
  and it is there; nothing is ever lost without a notice.
- **Profile round-trip:** a profile can be exported to a file and
  re-imported with nothing lost, in both lite view and editor view.

## Open questions

None blocking. The following are decided in `spec.md` or ADRs:

- The supported tt++ command subset.
- Stage order.
- Storage layout.
- Hosting while private.

MMapper integration path: decided in ADR 0003.
