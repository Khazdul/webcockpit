# Stage 68 — The owner's four points after 0.15.0

Not a spec §5 row: the owner's list of 2026-11-16 (sun timing, Comm
scroll and private chats, the tablet's landscape keyboard, link previews).

## Plan and tasks

- [x] **1. Sunlight dawn+1 ≤ hour < dusk** everywhere: clock, weather sky,
      start page sky, almanac, scripts (ADR 0093 addendum 2026-11-16, on
      the owner's in-game check).
- [x] **2a. Comm keeps to the newest message**; scrolled back it holds still
      (the time separator after the 200-item trim; ADR 0052 addendum).
- [x] **2b. Private chats hold only talk to you**: tells (not group tells),
      whispers, asks and emotes at you, and your own to them (ADR 0134
      addendum). Questions and socials on in Public by default, settings v7
      turns them on once for stored settings.
- [x] **3. Tablet landscape keyboard**: K keys right of the command field,
      K1 at the edge; full-height compass; letter keys up to 84 px (ADR 0140
      addendum).
- [x] **4. Link previews** of shared logs and Hall of Fame entries:
      og/twitter tags from the Worker, a 1200×900 image drawn in the browser
      at share time (first lines, play button, the logo bottom right), a
      generic image for older shares (ADR 0158).
- [x] Full e2e alone at 5 workers: 1915 passed, 51 skipped.
- [x] Staging deploy; `test:prod` 36/36 on staging.
- [x] Release 0.16.0 on the owner's word, before his test (tag `v0.16.0`);
      `test:prod` 36/36 on mumecockpit.com.
- [x] The owner's test (in production), 2026-11-17; his three points in 0.16.1.

## Test guide (production: https://mumecockpit.com)

1. **Sun:** in Wedmath (or any month) the clock shows the sun from dawn+1
   (5:00 am) and the moon from dusk (10:00 pm); the sunrise ends at 5:00,
   the sunset at 10:00 pm; the start page's sky follows; the almanac says
   17 h light in Wedmath.
2. **Comm:** a busy Public and Group keep showing the newest line for a long
   session; scroll up and it stays put, "N new" or scrolling down follows
   again. Private chats show only tells, whispers, asks and emotes at you.
   Socials and questions show in Public.
3. **iPad landscape:** typing on the wider keys, the large compass, the K keys
   beside the field; portrait and the phone unchanged.
4. **Link previews:** share a new log (Link and Hall of Fame), paste the
   `/r/<id>` link in Discord: "MUME Cockpit", "title (character)", the
   thumbnail with play button and logo. An old link shows the generic image.
   Staging sends `X-Robots-Tag: noindex`; if Discord shows nothing there,
   say so and we check before the release.

## Owner feedback

- 2026-11-17: all fine. Random Runes to stay forever (built, ADR 0155
  addendum); the iPad's "Command" clipped after typing and erasing (built:
  our own placeholder, a30a1464; to check on the iPad); Discord's image
  click enlarges it (Discord's behaviour, cannot be changed; left as is).
