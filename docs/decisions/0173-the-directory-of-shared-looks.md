# 0173 — The directory of shared looks

Date: 2026-11-27. Status: accepted (stage 80 part E). Related: ADR 0145
(accounts, the pepper and the attempt counters), ADR 0147 (the statistics'
device id), ADR 0150 (the spaces), ADR 0157 (the audit log), ADR 0169 (the
look model and its sources), ADR 0170 (the library and its ids), ADR 0172
(own images), spec §7.14, `docs/stages/80-character-tokens.md` §1, §9,
intent Goal 16 and "Privacy by construction".

## Context

MUME's GMCP gives a group member no race, class or sex (only id, type,
name, vitals and a few flags). The owner wants members who use the client
to get the right picture with the right sex automatically (decisions 3
and 12): every client reports its character's race, subrace, sex and
library token, by default, accounts or not, with a switch. Until now the
site knew no character name at all.

## Decision

### What is stored

One row per character name in `look_dir` (migration 0009, written with
part D so that staging and production get one migration):
`name` (lower case, 2–20 letters), `race` and `subrace` (the kinds of
`src/gmcp/race.ts`, `LOOK_RACES` and `LOOK_SUBRACES` in
`shared/cloud/api.ts`, a unit test keeps them equal), `sex` (`male`,
`female`, null), `token` (a library id, null for an automatic look and
for an own image, which is never sent), `owner`, `updated`. Every field is
checked against a closed list, the token against the library's ids as
built (`shared/cloud/look-tokens.ts`, written by `scripts/tokens.ts` with
the manifest; a unit test holds it equal to `tokens.json`). No free text
is stored, so the directory cannot carry a message or a link.

### The routes

- Logged out: `PUT /api/look` `{key, name, race, subrace, sex, token}`
  and `DELETE /api/look` `{key}`, sent with `credentials: 'omit'`; JSON,
  `X-WC: 1` and the site's Origin (the view route's rule, so another
  site's page cannot send one without a preflight that gets no CORS
  answer).
- Logged in: `PUT` and `DELETE /api/u/look` through `accountApi` (the
  session cookie travels only under `/api/u/`, and the client cannot read
  it), no key in the body.
- `POST /api/look/find` `{names}` (at most 40): anonymous, the answer has
  no owner and no time, and nothing is kept of who asked for whom.
- Admin: `GET` and `DELETE /api/admin/look/<name>`; the count of rows in
  `GET /api/admin/stats` (`looks`), shown on Flags and limits.

### The owner rule

- The owner is `HMAC(AUTH_PEPPER, "wc-look|d|" + key)` logged out and
  `HMAC(AUTH_PEPPER, "wc-look|a|" + account id)` logged in, base64url.
  Only the service's secret makes it; the row holds neither the key nor
  the account id. Without the pepper the writes answer 503
  `looks_not_configured` (find still answers).
- The first reporter owns a name. Another owner's report is refused (409
  `look_owned`) while the row is fresher than 30 days, so a name cannot be
  taken over to show a wrong picture; after 30 days without a refresh it
  may be (a player who stopped playing, a renamed character's name reused
  by MUME). The write is one statement (`INSERT … ON CONFLICT DO UPDATE …
  WHERE`), so two reports racing cannot both win.
- At most 20 names per owner (409 `too_many_names`); a name the owner
  holds can always be refreshed.
- The daily cron removes rows not refreshed for 180 days. Deleting an
  account (the player's and the admin's) deletes its rows in the same
  transaction (`deletionBatch`'s `lookOwner`).
- **Login takes the rows over without linking the two**: just before a
  login, a registration or a recovery the client sends `DELETE /api/look`
  with its key (unauthenticated, `credentials: 'omit'`), and afterwards
  reports through `/api/u/look`. The server never sees the key and the
  account in one request.
- **Removal is the only remedy for a never-reported name.** A stranger who
  reports a name its player never reported holds it for 30 days after
  every refresh; the player's own client is refused meanwhile (and says
  "shared from another device or account"). The admin removes the row by
  name, logged as `look.remove` (in the Log view's moderation filter);
  the player's next report then owns it. The abuse address on the privacy
  page is how a player asks for it.

### Limits

- Reports (PUT and DELETE): 30 an hour per owner and per address, as
  counters in the `attempt` table (`look-o|<owner>`, `look-a|<the
  address hashed under the day's pepper>`), pruned by the daily cron with
  the other counters. The rate limiting binding knows only 10 and 60
  seconds, so it does not fit an hour.
- Find: 60 a minute per address, the new binding `LOOK_LIMITER`
  (namespace 5909 production, 5910 staging), besides `API_LIMITER`.
- The numbers are constants in `shared/cloud/api.ts`, not in
  `/api/config`: the client needs none of them to behave.

### The client

- `src/looks/directory.ts` (pure, injected fetch, storage, clock and
  idle), `directory-feed.ts` (what the game changes), `directory-app.ts`
  (the page's: `apiAllowed()`, the flag, the space). The look store
  passes the directory's rows to the resolver (`LooksStore.dirFor`), so
  the Group pane, the map and the picker draw them without rules of their
  own.
- Report: when the name and the race are known, again when the race, the
  sex or the stored look changes; at most once per character, space and
  session otherwise. Bear form reports a Beorning (`dirKinds`), so a
  change of form sends nothing. A 409 is remembered for the session.
- Ask: the group's players (never an NPC, never yourself), gathered for
  300 ms, at most 40 a call; answers in memory and in `localStorage`
  (`wc.lookDir`), 24 hours for a row and 1 hour for a miss, at most 300
  names, the oldest dropped first.
- Everything on idle time; nothing on the game path awaits it. A failure
  is silent and tried once more after five minutes (a newer change sends
  at once anyway); a failed ask is not asked again for five minutes.
- Silent whenever the connection is a replay (the dev feed, a log),
  `apiAllowed()` is false (dev without `dev:cloud`, webdriver without
  `?cloudtest`) or the flag `looks` is off. The look key is made only
  when the first report is sent.

### Privacy (why this is acceptable)

What this changes, said plainly on the privacy page (its own section,
`src/chrome/frames/privacy-looks.ts`, shown with the flag) and in About:

- The service learns that a character name uses the client, and its race
  and sex. Until now it knew no character name; the heartbeat's sentence
  now speaks of the heartbeat only.
- Anyone who knows a name can ask for its race, and race tells the side
  in the war. A name is normally known only to those who met the
  character.
- The service sees which names a client asks for (who is in a group with
  whom) for the moment of the request; it is not stored or logged.
- A logged-in player's row is tied to the account by a hash only the
  service's secret makes; a logged-out player's to the look key, never to
  the statistics' device id, which is promised never to be tied to a
  character (ADR 0147).
- The switch off removes the owner's rows at once; Delete account removes
  the account's; a row left alone goes after 180 days.

The owner approved the directory as described (decisions 3 and 12);
intent Goal 16 and the constraint's wording have it since 2026-11-26.

## Consequences

- Production needs nothing new but the flag (off) and the binding
  `LOOK_LIMITER` (in `wrangler.jsonc`); AUTH_PEPPER is set there already.
- A second device of a logged-out player is refused its own name (the
  first device's key owns it): its switch removes nothing, and the picker
  says so. A login on either device fixes it for that device.
- An own image is never sent, so others see the drawing for the race and
  sex of a player who uses one.
