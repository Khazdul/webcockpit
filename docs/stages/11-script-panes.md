# Stage 11 — Script panes

> Status: Owner testing (built 2026-10-02).
> Source: intent Goal 10, spec §2.10 (panes, runs, mercenaries),
> ADR 0051.

## Goal

A script draws its own TUI pane that docks, floats and toggles like the
built-in panes: text, gauges, and clickable rows or single characters
with tooltips. The bundled mercenaries script shows the mercenaries'
state in such a pane, with clickable orders. Script panes appear in the
log player and the HTML replay as the player saw them.

## Scope

In:

- `createPane` and the pane methods in spec §2.10;
- placement remembered per script and pane id;
- run capture of pane content (ADR 0051);
- rendering in the log player and the HTML replay;
- the bundled mercenaries script.

Out: key manager (stage 12).

## Starting points

- Script API seam: add a `panes` entry to the host's per-script owner
  registry and release it in `release()` (ADR 0051, P1 notes).
- Behaviour reference for mercenaries (read only, never copy):
  `/home/ole/MUME/lua/scripts/mercenaries.lua` and
  `/home/ole/MUME/docs/scripts.md`.
- Every new API name goes into `src/editor/lua-api.ts` (params, returns,
  example). Completion, hover, signature help and the manual reference
  are generated from it, and a test checks it against `host.ts`.
- Carried over from stage 10:
  - the Scripts help view hides below about 70 columns;
  - the in-call hang marker is untested with a real hang in Firefox;
  - user scripts live only in IndexedDB. There is per-file export but
    no "export all" or backup; consider adding it to the runs backup
    archive or as an "export all scripts" action.

## Owner decisions

- 2026-10-01: panes have text, gauges, clickable rows and clickable
  single characters. TUI only.
- 2026-10-01: script panes are part of runs and replays.

## Plan

Four packages. P0 first; P2 and P3 run in parallel after it. Technical
decisions go into ADR 0053 (script panes), package notes per package.

- **P0 — Script panes and the API.** The docking engine, settings and
  Options learn dynamic pane ids; a `ScriptPane` draws a content model
  (styled lines, gauges, link ranges, tooltips) with the existing frame
  and cell-grid code; `createPane` and the pane methods in `host.ts`,
  owned per script and released on disable/reload; `lua-api.ts` entries
  and a manual section.
- **P1 — Runs.** A client record for script pane content (snapshots,
  coalesced per frame), the VIEW snapshot carrying script pane
  placement, and drawing in the log player and the HTML replay without
  Lua (links inert, tooltips kept).
- **P2 — Mercenaries.** Bundled `mercenaries.lua`: hire, label, group,
  contract timer, tap/pay/renew/leave, autopay, a pane with a row per
  mercenary (time gauge, state) and clickable orders. Behaviour from
  Cockpit's script and real logs, written fresh.
- **P3 — Verify.** Typecheck, unit, e2e in both browsers, bench; the
  carried-over "export all scripts"; test guide.

Main-session decisions (details in ADR 0053):

- A script pane's id is `<script>/<pane id>`. Its placement and on/off
  stay in the settings when the script stops, so it returns where it
  was; it is shown only while its script runs and has created it.
- First creation places it per `dock` (end of that dock, or an
  automatic float) with `rows`/`cols` as the wanted size.
- Running script panes appear in Options → Panes under the built-in
  panes (on/off, colour, border) and have the frame's close cross.
- API additions beyond spec §2.10: `:show()`, `:hide()`, `:visible()`
  (a script alias can toggle its pane), and `:setTitle(text)`.

## Tasks

- [x] Plan the packages (above).
- [x] P0. Script panes on the docking engine and the pane API
  (ADR 0053, package notes P0).
- [x] P1. Run capture, log player and HTML replay (ADR 0053,
  package notes P1).
- [x] P2. Bundled mercenaries (ADR 0053, package notes P2).
- [ ] P3. Verify; export all scripts; test guide; owner test.
  - [x] Export all scripts: EXPORT → *All scripts and their data
    (backup)*; IMPORT restores it (ADR 0053, package notes P3).
  - [x] Review across P0–P2: layout reset, reconnect, disable and
    reload during a run, mercenaries in the log player, light theme and
    tints, narrow window, Firefox. Fixed: script pane text on a dark tint
    over a light terminal was dark on dark; span colours on a light pane
    now follow ADR 0041's contrast rule.
  - [x] Verify: typecheck, unit, e2e (Chromium and Firefox), bench,
    build, production e2e.
  - [x] Test guide (below).
  - [ ] Owner test.

## Test guide

**Start:** `cd ~/proj/webcockpit && npm run dev` (restart it if it was
already running), then open http://localhost:5173/. Firefox and
Chromium. Log in to MUME with a character that has some silver.

1. **Turn mercenaries on:** Options → Scripts, select `mercenaries`
   (lock mark), read its help on the right, toggle it `[X]` (or type
   `#script enable mercenaries` in game). A *Mercenaries* pane appears at
   the bottom of the right dock: `Autopay [off]`, `No mercenaries hired.`
   and `Hire one: give 10 silver mercenary`. `merc` hides and shows it.
2. **Hire one (the key thing to confirm):** find a citizen mercenary
   and `give 10 silver mercenary`. The script expects MUME to answer
   `A citizen mercenary starts following you.`; it then sends `label
   mercenary <Name>` and, after `Ok.`, `group <Name>`. The pane gets a
   row `<Name> ● here $ a r p f s` and a green gauge counting down from
   `25:00 left`. **These lines and the 25 minutes per 10 silver are
   written from Cockpit's script, not from a real log.** Please check:
   - Does the hire line match exactly? Are label and group sent?
   - Near the end, does the mercenary *tap you on the shoulder*? The row
     should turn to a red `PAY DUE` gauge with a one-minute countdown.
     Click `$` (or `merc pay`): `give 10 silver <Name>`; MUME's thanks
     (`… says 'Thank you. I am at your service.'`) should reset the
     gauge to 25:00.
   - If you do not pay: does it leave, and does the row go away with a
     `▶ MERC:` line in the UI pane?
   - Is 25 minutes right? Compare the gauge with when it really taps.
   - If anything does not match, a copy of the real lines (or the run's
     log from History → RUN LOG) is the most useful feedback.
3. **Orders:** point at each letter for its tooltip, then click it:
   `a` assist, `r` rescue you, `p` protect you, `f` flee, `s` stand.
   Do `order <Name> flee` and `order <Name> stand` work on a mercenary
   (they do on charmed followers)? `merc autopay` turns autopay on
   (`[on]` in the header, also clickable); `merc list` prints the
   contracts; `merc label 2.mercenary` tracks one hired before the
   script was on.
4. **A pane of your own:** Options → Scripts → *NEW*, then for example:

   ```lua
   local pane = createPane{id = "hp", title = "HP", dock = "float", rows = 3, cols = 24}
   registerAnonymousEventHandler("gmcp.Char.Vitals", function()
     local v = gmcp.Char.Vitals
     pane:gauge(1, {value = v.hp or 0, max = v.maxhp or 1, label = "HP"})
     pane:setLine(2, "<yellow>[rest]<reset>  <cyan>[look]<reset>")
     pane:setLink(2, 1, 6, function() send("rest") end, "Sit down and rest")
     pane:setLink(2, 9, 6, function() send("look") end, "Look around")
   end)
   tempAlias("^hpp$", function() if pane:visible() then pane:hide() else pane:show() end end)
   ```

   Ctrl+S, turn it on. The pane floats at the top right of the game
   window; drag it, dock it into a side, resize it, close it with its
   cross, bring it back with `hpp` or Options → Panes → General (it is
   listed as `HP (yourscript)`, with colour and border). Disable the
   script and enable it again: it comes back where you left it, also
   after a reload. Type `pane:` in the editor for the pane methods.
5. **Runs:** play a few minutes with the Mercenaries pane (or your own)
   shown, then History → RUN LOG: the pane is in the log player with
   what it showed at each moment; tooltips work, clicks do nothing; the
   gear lists it. EXPORT that session as an HTML replay and open the
   file: the pane is there too.
6. **Export all scripts:** Options → Scripts → *EXPORT* now asks: *This
   script (name.lua)* or *All scripts and their data (backup)*. Take the
   backup (`webcockpit-scripts-<date>.json`), delete a script of your
   own, then *IMPORT* the backup: a page shows what it holds and a
   warning; `y` restores the missing script, turned off, with its
   settings. Scripts that are already there are left alone.

**Known limitations:**

- No tooltips on touch devices (no hover); a tap still clicks.
- A tooltip sits under its link and may cover the row below.
- In the editor, `x:` offers the pane methods only when the variable's
  name contains `pane` (`pane:` does, `p:` does not).
- Spotlights hide script panes.
- A pane with one row shows only `↑ N more rows` (the same rule as the
  built-in panes); give the Mercenaries pane a few rows.

**Feedback wanted:** above all whether the mercenary lines (hire, tap,
thanks, leave) and the contract time match real MUME, and whether
`stand` and `flee` orders work. Then: the pane's look in your theme and
colours, its default place, whether the orders are easy to hit, and
anything in the pane API that felt odd while writing your own.

## Owner feedback

### Round 1 (2026-10-02)

Overview tests: everything seems to work. Script panes in the menus,
working like ordinary panes, are liked.

- **Mercenary cost.** At a high level a mercenary costs 1 gold (20
  silver), not 10 silver. The script should switch to 10 silver when a
  mercenary says so, and a click somewhere in the pane should toggle
  the cost between 10 and 20 silver.
- **Orders.** The only commands wanted are `ask <name> lead`, `ask
  <name> ride` and `ask <name> flee`. The pane's buttons become these.
- **Temporary panes.** A script may want a short-lived pane (shown for
  a few seconds to make a choice, or similar). Such a pane should not
  appear in the menus like the ordinary ones.

Main-session decisions for round 1:

- The cost is a setting (`cost`, 10 or 20 silver), toggled by a click
  on the header and learnt from what a mercenary says about the price.
  20 silver is paid as `give 1 gold <name>`, 10 as `give 10 silver
  <name>`.
- The order row is `l r f` (lead, ride, flee). Paying moves to a click
  on the PAY DUE gauge (and `merc pay`), so it is there only when due.
- `createPane{…, temporary = true}`: never in Options → Panes or the
  viewer's gear, nothing persisted (placement, on/off, colour), floats
  centred over the game pane unless placed, `pane:close()` removes it,
  and its close cross closes it. Recorded in runs like other panes.
