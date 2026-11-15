# MUME warlords lists and player count: sources (research, 2026-11-15)

Question: can a WebCockpit Cloudflare Worker show MUME's warlords per side and
the current number of players online, fetched at most every few minutes?
Read-only research; nothing was logged into and the game was not connected to.

## 1. Warlords / war points

- **Web source: https://mume.org/news/war** ("State of the War"; served as
  `war.php` via Apache content negotiation). It is public, plain HTML and needs
  no login. Fetched 2026-11-15 20:28 UTC: 200, 7 279 bytes, no `Last-Modified`,
  `ETag` or `Cache-Control` headers.
  - `<h2>Warlords Hall of Fame</h2>` followed by `<table class="msg_body warlords">`.
    Two header rows ("Armies of the West" / "Forces of the Dark Lord", then
    Rank/Name/Race/Class twice), then 10 `<tr>` rows. Each row has 8 `<td>`s:
    a West rank, name, race and class, then the same for the Dark side. Names
    use HTML entities (`Z&ucirc;d`, `Black N&uacute;men&oacute;rean`).
  - **No war-point numbers.** Only rank order, name, race and class.
  - A "War status" paragraph in prose, for example "The armies of the West
    prevail…", "latest kill being 10 days ago".
  - The footer reads `Generated on Sun Nov 15 20:23:48 2026`. That is a
    pre-generated page. It had not changed on a refetch at 20:31 UTC. The
    regeneration interval is **unconfirmed**. A Wayback copy captured
    2022-12-10 06:21:55 said "Generated on … 06:18:04", which fits a
    regeneration every few minutes to an hour. The timezone is also
    unconfirmed.
  - Wayback has yearly snapshots from 2020 to 2026, so the URL and layout
    have been stable for years.
- Size: the warlords are the **top ten per side** (https://mume.org/help/warlords:
  "enough war points to rank you in the top ten players of your side").
  Minions and Zaugurz share one list (https://mume.org/news/game/1809).
- In game: `view warlords` and `view warshared` ("Shared list over all
  armies") (https://mume.org/help/warlords). The game also sends GMCP, but
  using it would mean logging a character in.
- War points themselves are "slightly secret" and are not published
  (https://mume.org/help/wps).
- No JSON, XML, RSS or API for the war data was found. The front page and
  news page link no feed.

## 2. Current player count

- **mume.org does not publish a live count.** The front page, /news/war and
  /play show none.
- In game: `who number` returns "just the total number of players"
  (https://mume.org/help/who). Players can be hidden from `who` by their
  incognito settings, so that count can be lower than the true number.
- **MSSP:** MUME's history page lists "GMCP/MCCP2/MNES/MSSP telnet
  extensions" (https://docs.mume.org/wiki/history). MSSP is telnet option 70:
  the server answers `IAC DO MSSP` with variables such as `NAME`, `PLAYERS`
  and `UPTIME` (https://www.last-outpost.com/LO/protocols/mh/p/mssp.html).
  The host is `mume.org`, port **4242** (plain telnet). TLS is offered on
  another port, documented at https://mume.org/help/tls (port number not
  checked). The protocol page https://mume.org/help/protocol does not list
  MSSP. **Unconfirmed** whether MSSP is still served and whether `PLAYERS`
  is filled in; this was not tested, because connecting was out of scope.
- **mudstats.com** (https://mudstats.com/World/MUME-MultiUsersInMiddleEarth)
  showed "Players Connected: 38 (22 minutes ago)", a 30-day max/avg of 44/21,
  "Version: MUME IX b5c264a1" and "Address: mume.org 4242". Several fields
  are footnoted as coming from MSSP. That strongly suggests MUME answers MSSP
  with a player count (inferred, not confirmed). Its refresh rate is about
  20+ minutes. No mudstats API or terms were checked.
- No "who" web page or status endpoint exists on mume.org.

## 3. Terms, robots.txt, contact

- https://mume.org/robots.txt (`User-agent: *`) disallows `/fire/`,
  `/forum/`, `/search`, parts of `/play/`, `/restricted/`, most of `/wiki/`
  and `/download/clients/powwow`. **`/news/war` is not disallowed.**
- No terms of use or scraping policy was found on mume.org.
  https://mume.org/rules/ rule 8 (ROBOTS), "The use of any kind of automation
  is forbidden", is a game-play rule for characters. A Worker that logs a
  character in to run `who`/`view warlords` would plainly break it. An
  anonymous MSSP probe does not log anyone in, but whether the rule covers it
  is a question for the staff, not something to assume.
- Contact: the rules say to "contact an Ainu" (an immortal). The community
  Discord is https://discord.gg/XkZN55am9a (via
  https://docs.mume.org/community/discord), and the website source is
  https://github.com/MUME/mume.github.io. No management email address is
  published. https://mume.org/help/credits lists only historical 1991
  designers.

## 4. How the old log site did it

- The site is **Elvenrunes** (https://elvenrunes.com, linked from
  https://mume.org/help/logs). Wayback snapshots of
  `elvenrunes.com/cgi-bin/logs/logs.m` from 2015 to 2022 show sidebar boxes
  titled "white lords" and "saurons minions", each a **top 5** with rank and
  name only. There were no WP figures; the "34 players currently online … (checked
  6s ago)" text was not found in the snapshots checked (2015, 2019, 2022).
  It may have been on another page or another period (**unconfirmed**).
- How it got the data is **not documented**. A comparison suggests it took
  them from mume.org's warlords page: the Elvenrunes list of 2022-11-27
  (Rísneth, Zhirinovsky, Glorizmaeg…) matches ranks 4–6 of mume.org/news/war
  on 2022-12-10, two weeks later, with the same order and names. It probably
  showed the first five rows of an older copy (inferred).
- Elvenrunes's logs app now redirects to the front page. The CDX index shows
  a 502 error in 2025. The site no longer shows the lists.

## Options for WebCockpit

1. **Fetch the /news/war HTML** (recommended, if any). The Worker GETs it at
   most every 5–15 minutes, parses the `table.warlords` rows and caches the
   result in KV. It shows the top 5 or 10 per side with race and class; war
   points do not exist publicly. Risk: low load, and robots.txt allows the
   page, but the parser breaks silently if the layout changes, so fail closed
   and hide the box. Leave needed: none technically, but courtesy says ask
   (see below). Use an honest User-Agent naming WebCockpit and a project URL,
   with no personal data.
2. **MSSP over telnet (mume.org:4242) for the player count.** Cloudflare
   Workers can open TCP through `connect()`. The Worker sends `IAC DO MSSP`,
   reads `PLAYERS` and closes without logging in. It is the only machine
   source of a live count, but unverified: it needs a one-off test, and
   frequent probes show up as connections in MUME's logs. Ask MUME staff
   before shipping. Polling every 5+ minutes is in line with crawlers like
   mudstats.
3. **mudstats.com as the player-count source.** This avoids touching MUME,
   but the data is about 20 minutes stale and depends on a third party whose
   terms were not checked. Not recommended.
4. **Nothing / link out.** Link to https://mume.org/news/war and leave the
   count out. There is zero risk.

Not acceptable: logging a character in to run `who` or `view warlords`, which
breaks rule 8.

**Leave:** ask the MUME staff on the MUME Discord
(https://discord.gg/XkZN55am9a), or ask an Ainu in game, for both items. The
message should cover one cached fetch of /news/war every N minutes and an
anonymous MSSP probe of 4242 every N minutes, with the User-Agent and contact
given. This is the owner's call to send.
