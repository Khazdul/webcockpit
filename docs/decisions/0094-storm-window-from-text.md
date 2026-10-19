# 0094 — Thunderstorm strikes from the flash line

- Status: Accepted (stage 28 item 90, owner-revised 2026-10-19)
- Date: 2026-10-19
- Changes: ADR 0091 "Lightning" (a bolt only on the flash line)

## Context

In real play (2026-10-19, snow with lightning in the Redhorn Pass) a bolt
came only with the line "A bright streak of lightning flashes over the
snow-covered mountains.", which MUME prints as part of a room's text on
entering it, and not every time (3 of 6 entries in the owner's log; never
while staying, 65 s without one). The owner wanted more strikes while in
the storm.

GMCP has no lightning: in that room the only weather GMCP is
`Char.Vitals {"weather":"*"}`; Room.Info has area, environment, exits, id
and name. The replay payload shows the order of one entry: the room's text
with the flash line first, then `Event.Moved`, `Room.Info` and
`Char.Vitals {"weather":"*"}`, all with the same timestamp.

## Decision

- The flash line strikes at once, as before, and opens a **storm window**
  of 30 s (`STORM_WINDOW_S`). A new flash line opens a new window.
- The window brings 2–3 more strikes (`STORM_EXTRA`), none in its first
  5 s (`STORM_QUIET_S`): 5–30 s is cut into equal parts, one strike at a
  random time in each, so they are spread out.
- They fall only while the **raw** `Char.Vitals.weather` (no 3 s dwell) is
  rain, heavy rain or snow (`'`, `"`, `*`). Moving on through rain or snow
  keeps the window; a room without rain or snow ends it at once, and it
  does not come back until a new flash line. The weather is not checked in
  the first 1.5 s (`STORM_GRACE_MS`), since the room's vitals come just
  after its text.
- A new connection or character (the character model's name changes or is
  reset) ends the window (`storm.off`), and so does a pin (the demo, a dev
  `jump`, a bench); flash lines are dropped while a pin holds, as before.
- The Lightning category off: no strikes (the window still runs out).

Where: the bridge (`signals.ts`) sends a game flash as
`emit('strike', { storm: true })` (`GAME_FLASH`) and `storm.off`; the
worker's director (`stormFlash`, `stormStrike`, `stormOff`) plans and times
the strikes, and the engine asks it once per tick (also in the idle 4 Hz
tick, which a strike wakes) and emits 'strike' to the modules. The main
thread has no timer and no per-frame work for it. Dev:
`__weather.set({ weather: '*' })` then a flash line, or
`__weather.emit('strike', { storm: true })` (the raw weather must be rain
or snow).

## Alternatives

- A storm state with its own rules (on from the flash or the `weather`
  command's "lit by some flashes of lightning"; off on "The lightning has
  stopped.", a change of the settled weather symbol, 60 s indoors, a new
  area, a 10 min cap) and sporadic strikes every 20–60 s. Built first, then
  dropped at the owner's request: the `weather` command is something the
  player types, and a short window tied to the flash and to rain or snow
  covers the case with far fewer rules.
- Ending the window on any room change: briefly asked for, then withdrawn
  by the owner; moving through the storm keeps it.
- The XML `<weather>` tag: still unverified live; the text fallback is
  what works (ADR 0091).

## Consequences

- Up to four bolts in the 30 s after entering a storm room, then quiet
  until the game prints the flash again (MUME prints it on some entries).
- A strike that falls due while the tab is hidden is dropped (one at most
  when it comes back).
