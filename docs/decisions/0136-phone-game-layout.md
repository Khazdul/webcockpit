# 0136 — The phone's layout in the game

- Status: Accepted (design by the owner, 2026-11-10; build in stage 51)
- Date: 2026-11-10
- Related: intent Goal 12 (widened to light play 2026-11-10), spec §2.12
  and §2.6. Replaces, for the live game on a phone, ADR 0075 §3 (the tab
  strip layout) and §3.4 (no automatic reconnect), ADR 0097 (the
  fullscreen corner button while in the game), ADR 0098 (tab keys) and
  the phone part of ADR 0112 (the ESC menu). ADR 0081 and 0086 stay.
  Builds on ADR 0123 (Lykta), ADR 0134 (Comm), ADR 0109 (Statistics),
  ADR 0116 (surface tokens), ADR 0092 (weather).
- Mockups and the owner's decisions round by round:
  `notes/research/phone-makeover/README.md`; the final screens are
  `notes/research/phone-makeover/final/canvas/` (canvas
  "WebCockpit phone layout, final mockups"). They are throwaway HTML
  written without rendering: take sizes, colours and structure from them,
  re-derive the look from the real code and tokens.

## Context

The phone's tab strip and ESC menu (stage 19) felt dated and never suited
a phone. Over four mockup rounds on 2026-11-10 the owner settled a new
layout for the live game on a phone, and widened Goal 12 from "log in,
read and chat" to light play.

## Decision

### 1. Scope and gating

- Only the **live game on a phone** (`device().phone`) changes. Desktop
  and tablet are not touched: with the phone flag off no new code path
  runs and no new CSS matches; the desktop e2e projects stay green
  without edits.
- The **run log player and the Spotlights viewer keep today's tab strip
  layout** on a phone (they share the cockpit through
  `src/app/player-host.ts`). The new layout is an option of the cockpit
  that only the live game's shell turns on; `allocatePhone` and the
  strip stay for the player.
- Portrait is the design. Landscape uses the same layout as it is, with
  no special arrangement.
- The start page and its pages are not changed.

### 2. Structure

One cockpit, as today. The cockpit keeps owning every pane shell and
places them in whole cells; the new chrome is plain DOM in a new layer
(`src/phone/`) over the cockpit, laid out in pixels and reading the
cockpit's rectangles. Nothing is re-parented.

A new pure allocator beside `allocatePhone` (`allocatePhoneGame`, in
`src/layout/phone-game.ts`) returns, top to bottom:

1. the **pane strip** (0 rows closed; when open about 20 % of the rows,
   clamped to 15–25 %), holding one pane;
2. the **fight card** (2 rows while fighting, else 0);
3. **Comm** (0 rows closed; when open its stored height, default 40 % of
   the rows, between 6 rows and what leaves the game 8 rows);
4. the **game pane**, everything left down to the command row, full
   width;
5. the **command row** (1 input row), whose field ends left of the
   compass.

The game pane keeps reporting at least 80 columns to MUME
(`phoneNawsCols`), as today.

**Known limit, accepted:** the lens, the hot keys and the compass float
over the game text and cover the ends of the lines they pass (the
mockups wrapped the text by hand; the client does not). The keys are
partly see-through. No per-line wrapping is built.

### 3. Fight card

Shown only while fighting (an opponent in `game.group.fight()`), whatever
the Group pane's own `group.fight` setting says. It shows two names and
two bars and nothing else: no percent, no condition word.

- Left: `You`, or the tank's name when someone else tanks; the bar is
  that character's HP share (yours from `Char.Vitals` `hp`/`maxhp`, a
  group member's from the group model).
- Right: the opponent's name; the bar goes in steps from MUME's
  condition word (healthy 100, fine 85, hurt 65, wounded 45, bad 25,
  awful 10; an unknown word keeps the last step).
- Reuses `fightView` / `GroupModel.fight()`; no new GMCP parsing.

### 4. Map lens

- The map is a round lens, 150 px, top right under the fight card: a
  cast-iron ring (fine grain) and a glass with a four-pane window
  reflection, edge darkening and an outer shadow. Paper: pewter ring,
  brass hairline, no glow.
- It is the **one** `MapPane` / `MapClient` (no second worker, no second
  map load): the cockpit places the map pane borderless in a square of
  whole cells at the lens's place and the phone layer clips and dresses
  it. The map is not a pane in the strip.
- Locked on the phone: tileset Shimrod (alternating), black background,
  no hover box, no pan and no pinch. A **tap** steps three fixed zoom
  levels: near (about 3 rooms across), middle (about 5, the default) and
  far (about 10); three pips show which. The worker gets an additive
  absolute-zoom message (`zoomTo`); the relative zoom stays for desktop.
- Three round keys sit on the lens's corners: top left **panes** (opens
  and closes the pane strip), top right **fullscreen** (only where
  `canFullscreen`; else no key), bottom right **Comm** with the unread
  count.
- **The lens hides when it would collide** with Comm or with the hot key
  box, and returns when there is room. Its keys then stay as a row at
  the top right. With the pane strip open the lens moves down under the
  fight card as long as it fits above the hot keys; otherwise it hides
  too.
- The fixed fullscreen corner button (ADR 0097) is not shown while the
  phone's game layout is up; it stays on the start page.

### 5. Pane strip

- Opened and closed by the lens's panes key. One pane at a time, from
  the top edge, borderless, with the pane's name in a small hood and
  page dots. A sideways swipe (or Ctrl/Alt+1…9 on a physical keyboard,
  by position) changes pane. No tabs, no handle.
- Pages, in the order of a phone-only setting: Timers, Group, Character,
  Statistics, then the script panes that are present. Statistics is no
  longer excluded on the phone (`NOT_ON_PHONE` applies to the old strip
  only), and the phone shell supplies `statsView`.
- The open page is kept in memory only; which panes take part and their
  order are stored.

### 6. Comm

- The existing `CommPane`, placed full width under the fight card, in
  its rail mode. Its own reply line is the compose field: placeholder
  "Type a message", a one-row textarea on the phone (no autofill bar).
  A private chat sends `tell <name> …`, Group sends `tell group …`,
  Public has no reply line (as on desktop).
- The lower edge is an iron band that is dragged to resize, in whole
  rows; the height is a phone-only setting.
- On the phone Comm does not write `comm.folded` or `comm.listWidth`
  (those are the desktop's).
- **No incoming message cards.** Unread shows only as a count on the
  lens's Comm key: private chats by default, or all (private, Group,
  Public) by a phone setting. `CommChats` gets a change notification for
  unread counts (additive).

### 7. Compass

- Bottom right, starting at the bottom edge: a 3×3 grid of 40 px keys
  (S 36, L 44 by a phone setting): N, W, the eye, E, S, U, D and F.
  The cell left of N is the K key (§8).
- They send `north`, `west`, `east`, `south`, `up`, `down`, `look` and
  `flee` as typed commands (`App.onCommand`: aliases apply, the echo
  shows). **Every direction is always live**; the room's exits do not
  dim or disable keys.
- A tap never moves focus to the command field (no keyboard). An
  optional short vibration on a tap (`navigator.vibrate`, where it
  exists).

### 8. Hot keys

- Up to three round, see-through keys in one column along the right
  edge above the compass, K1 lowest. Each shows its label (at most four
  characters). The **K** key left of N shows and hides the column.
- A tap sends the key's command as a typed command. A hold (500 ms)
  opens a box left of the column: Shown (switch), Label, Command, quick
  picks `assist`, `bash`, `rescue`, `shoot`, `recover`, **Custom** (puts
  the cursor in the Command field), and two specials: **wimpy 50 % of
  current HP** and **wimpy 25 % of current HP**. Cancel and Save.
- A special reads the character's current hit points at the press
  (`Char.Vitals` `hp`; not the maximum) and sends
  `change wimpy <floor(hp × share)>`. With no known HP it sends nothing
  and prints a client notice.
- Defaults: K1 `asst` → `assist`, K2 `bash` → `bash`, K3 `wimp` → wimpy
  50 % of current HP.
- Stored in the phone's own settings (not in the profile), so the
  profile language and the desktop are untouched and they do not travel
  with a profile export.

### 9. Command row and keyboard

- Bottom left: the menu key, then the command field, ending left of the
  compass. No history key, no clock strip on the phone's game layout.
- With the on-screen keyboard up (`html.wc-kbd`): the compass, the hot
  keys and the K key are hidden and the field takes the full width; the
  lens stays.

### 10. Menu and settings

- The menu key (and Esc, `#menu`) opens a **bottom sheet**: a status
  line (character or profile, link time, Recording), Reconnect, Profile
  (what `#profile` opens on a phone today), Scripts (the Scripts page),
  Settings (the new phone page), a text size stepper, Black / Paper, and
  Exit session (the rating dialog, as today).
- A dropped link, also one found on resume, opens the sheet with
  Reconnect first, as the ESC menu did. `#profile`, `#scripts`,
  `#settings`, `#panes` and `#exit` open the matching entry.
- **Phone settings page** (a small selection; everything else keeps its
  stored value and is edited on a computer): Text (size, theme, font);
  Compass (key size, vibrate on tap); Map lens (show, size, opens at);
  Panes (which panes are in the strip, and their order); Comm (count
  unread: private or all; show NPCs in Public); Connection (keep the
  screen on while connected, reconnect automatically, weather effects).
- **Keep the screen on:** Screen Wake Lock while connected and visible,
  where the browser has it.
- **Reconnect automatically** (off by default): a dead link found on
  resume reconnects once, with no saved login (MUME asks as usual).
  Never after the user's own disconnect or exit. This replaces ADR 0075
  §3.4 only when the setting is on.

### 11. Weather

Off by default on a phone, as before. When on, the effects use the whole
width: the left band that desktop keeps free of weather is not applied
on the phone's game layout; the mask over the prompt and input rows
stays. The text in the upper part is harder to read with weather on; the
owner accepts that.

### 12. Look

Lykta on the phone: iron, lamp, frosted cards, Cinzel hoods, from the
existing tokens (`--sf-*`, the kit's `--lk-*`, the pane tokens copied to
the phone layer's scope where a pane element is not at hand). Every new
surface has its Paper counterpart and reaches 4.5:1 for text.

### 13. Settings keys (all additive, under `phone`)

`phone.hotkeys` (three of `{label, command, special, shown}`),
`phone.hotkeysOpen`, `phone.commRows`, `phone.strip` (`panes` with on and
order), `phone.lens` (`show`, `size`, `opensAt`), `phone.compassSize`,
`phone.vibrate`, `phone.unread` (`private` | `all`), `phone.wakeLock`,
`phone.autoReconnect`. Desktop ignores the section; a settings file
moved between a phone and a computer behaves on the computer as before.
No settings version bump.

## Consequences

- The phone's ESC menu frame (`EscMain`) and Options hub are no longer
  reached from the live game on a phone. They are not deleted in stage
  51 (the player may still reach parts of them); a later cleanup removes
  what is dead.
- Most `tests/e2e/phone-*.spec.ts` that assert the tab strip or the ESC
  menu in the live game are rewritten for the new layout; the player's
  and the start page's phone specs stay.
- The clock is not shown in the phone's game layout.
- Hot keys make three one-tap commands possible on a phone. Following
  MUME's rules on automation stays the player's responsibility (intent
  non-goal); a key sends exactly one command per tap.

## To verify in the build

- `Char.Vitals` `hp` is numeric and current on the live game (the
  fixture `tests/fixtures/gmcp-demo.log` has it).
- The exact text of MUME's opponent condition words in `opponent-hits`.
- That one `MapPane` can be clipped to a circle without a second
  canvas, and what the three zoom values are in the worker's units.
