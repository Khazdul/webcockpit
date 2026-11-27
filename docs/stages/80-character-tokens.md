# Stage 80 — Looks: portraits you choose, tokens on the map and in Group

This stage is not a spec §5 row. The owner asked for it (2026-11-26): a
player picks the picture of their character, the picture shows as a small
token on the map and in the Group pane, and group members get tokens too.
The creator of a set of MUME token pictures asked for them to be
integrated. This file is the spec and the brief for the build.

**Status: approved for building** (2026-11-26). The brainstorm and two
mockup rounds are held and every point is decided (below). It is built in
one unattended night run (the owner's wish), parts A–F in order, without
stopping for the owner between parts. Nothing is built yet.

## How to read this file (for the session that builds it)

1. "Night run" says what you may and may not do, and what must exist in
   the morning. Read it first.
2. "The owner's decisions" are fixed. Do not reopen them.
3. "The design" is what to build. Where it gives numbers, they are the
   numbers. Where it says "your call", decide and write an ADR.
4. "Parts" gives the order, and for each part what must be true and
   tested before the next part starts.
5. The mockup `notes/research/token-mockups/round2.html` is the source
   for the look
   (<https://claude.ai/artifact/JFxTxh2v35UDhktAcJMye7>). It is a test
   page with inline scripts: port the look and do not link the page. Where
   the mockup and this file differ, this file wins (the differences are
   listed under "Where the mockup is not the truth").

## Night run

### The goal in the morning

The owner opens the client, picks a look, sees tokens on the map and in
Group, and can test shared looks with two browsers on staging. A test
guide in this file tells him what to open and try. If not everything got
done, what is done works, and the log says plainly what is missing.

### What you may do

- Commit to `main` in small conventional commits and push `main`.
- Deploy to **staging** (the owner, 2026-11-26):
  `gh workflow run deploy.yml -f environment=staging -f action=deploy`.
  It applies staging's D1 migrations. Then `npm run test:prod` against
  staging as earlier stages did (stage 66, part E, shows how).
- Run the unit tests, the e2e, the worker tests and the benches as often
  as needed.
- Download the token set from GitHub (see §2) into the scratchpad.
- Decide technical details and record them as ADRs. Improvise the phone
  and tablet look (§10).

### What you must not do

- **No production.** No version tag, no production deploy, no production
  migration, no change of a production flag to on. The release is the
  owner's, after his test.
- **No login to MUME** and no connection to the real game. Test with
  the fixtures the tests already use (see "Test material").
- Nothing under `/home/ole/MUME` is changed (CLAUDE.md).
- Do not touch the owner's dev server on port 5173, and do not run e2e
  against it: use a port of your own (`WC_E2E_PORT`).
- Do not reopen the owner's decisions, and do not add features that are
  under "Not in this stage".
- No question to the owner stops the work: he is asleep. Take the choice
  that is easiest to change later, write it under "Decided in the night"
  at the end of this file, and go on.

### How to work

- The main session plans, delegates to subagents and verifies
  (CLAUDE.md). One part at a time. A part is done when its "Done when"
  list is true, its tests are green and it is committed. Only then the
  next part starts.
- Building agents do not run the full e2e at the same time as each
  other or as the main session (CLAUDE.md, "Tests and worktrees"). A
  building agent runs the unit tests and the e2e files of its own area.
  The main session runs the full e2e alone, at 5 workers, after each part.
  A failing file is rerun alone before it is called a regression.
- A full e2e run rewrites screenshots under `docs/stages/img/`: restore
  them (`git checkout -- docs/stages/img`).
- If Chromium starts crashing, look at `df -h /tmp` first.
- Verify what an agent reports before building on it: read the diff, run
  the tests yourself, look at a screenshot of the real client. An agent's
  "done" is a claim.
- Look at the result as the owner will: after parts A, B, C and F take
  screenshots of the real client (Playwright, "Test material") and
  compare them with the mockup. Fix what does not match before going on.
- `main` is never left red. If a part cannot be finished, back it out or
  leave it behind its setting turned off by default, and say so in the
  log.
- Keep this file's task list current as you go, so that an interrupted
  night can be continued from it.

### If time or trouble stops you

The parts are ordered so that each is worth having alone. Do not start a
part you cannot finish and test. Stopping after any part is acceptable;
half a part on `main` is not.

### What must exist at the end

- The test guide in this file, filled in for what was built.
- "Decided in the night" in this file, with every choice the owner
  should know of.
- The ADRs (see "Documents").
- The session log entry and the stage table in `progress.md`
  (CLAUDE.md, "Sessions and traceability").
- A note in the log: the owner's dev server on 5173 must be restarted to
  show the new version.
- No release and no version bump. The project has no changelog file:
  draft the release notes for the next version in this file, under
  "Release notes (draft)".

## Words

- **Look**: which picture a character has. One look gives both sizes.
- **Portrait**: the look, large, in the Character pane's frame.
- **Token**: the look, small and round, on the map and in the Group pane.
- **Library**: the token pictures shipped with the client.
- **Directory**: the server's public table of name → race, subrace, sex
  and library token.

## The owner's decisions (2026-11-26)

From the brainstorm:

1. **Our engraved drawings stay the default** (ADR 0166 addendum 12),
   chosen by race, subrace and sex. The library and own images are
   choices on top.
2. **The library works for everyone. Own images need an account.**
3. **Looks are shared from the start.** Every client reports its
   character's race, subrace and sex to the service, also when the player
   chose nothing, so that group members who use WebCockpit get the right
   picture with the right sex automatically.
4. **An HP arc round the map token.**
5. **Tokens for group members can be switched off.**
6. A click on a group member's token changes that member's look, from
   the library or from the player's own images.

From mockup round 1:

7. **The HP arc is variant C**: outside the ring, only when the member
   is hurt, in Group's colours (green, orange from 45 %, red from 25 %).
8. **Several in one room: the fan.** Your token whole in the centre, the
   others small along the room's lower edge, at most three and then `+n`.
9. **One-line Group rows get the small token.**
10. **Group tokens are round.**
11. **Group rows follow the pane's height**, so that the pane is filled
    and tokens grow when there is room.
12. **The directory is approved as §9 describes it**: reporting is the
    default with a switch, and players without an account report too.
13. **The permission for the token set**: the creator's Discord message
    asking the owner to add the set is the written permission. The owner
    keeps a copy of it.
14. **50 own images per account**, each with a size limit (§3).
15. **Tokens are on by default**, in Group and on the map, each with its
    switch in the pane's gear.

From mockup round 2:

16. **The ring is R3**: 1 px, the member's hue muted 25 % toward grey,
    with the dark outline kept. In Group and on the map, and for your own
    yellow ring.
17. **Free scaling of Group rows** (not fixed modes), with the bars as
    three full lines with numbers at the larger sizes. "Det ser bra ut."
18. **The largest token is 68 px.**
19. **No red dot for a member of an enemy race.** The NPC tag stays.
    Nothing else replaces the marker icon.
20. The Automatic tab has no hint line under the card for your own
    character ("This is the default…" was removed).

For the night run:

21. **Staging may be deployed by the night run. Production may not.**
22. **Phone and tablet are in**: the basics, and the session may
    improvise a design that fits the phone's and the tablet's look, for
    the owner to judge afterwards (§10).
23. **No login to MUME in the night.** Test data only.
24. **One-line rows grow with the height too** (§8), so that the pane
    is filled at every height. Confirmed by the owner.

## What exists today (checked 2026-11-26)

- The Character pane shows a portrait: an `<img class="wc-cc-photo">`
  baked from an SVG drawing to a PNG `data:` URL, picked by
  `portraitOf(race, subrace)` and `game.sex` (`src/panes/portrait.ts`,
  `portraits/`, `character-dom.ts`, `character.ts` near line 396). A
  raster override path exists (`public/portraits/<id>-<sex>.webp`) and no
  file uses it. The portrait has no click today. Portraits are off only
  in the `__WC_REPLAY__` bundle (the exported HTML and the share frame);
  the in-app log player and the `?fixture=` feed show them.
- The player's race and subrace come from `Char.StatusVars`
  (`src/gmcp/char.ts`, kinds in `src/gmcp/race.ts`). The sex comes from
  the `info` line and is remembered per character in `localStorage`
  (`src/gmcp/sex.ts`); it is `game.sex`.
- **A group member has no race, class, level or sex in GMCP**
  (`notes/research/gmcp-group.md`): only id, type, name, label, vitals
  (`{value, max, word}`), position, ride, room, mapid and flags
  (`src/gmcp/group.ts`). The directory is the only source for race and
  sex. Yourself is not a row in Group.
- The Group pane: `src/panes/group.ts`, `group-model.ts`, `group.css`
  (ADR 0122, ADR 0120). `groupLayout` picks two lines per member when
  they fit beside the fight card, else one line, else one line and
  `↓ n more`. The fight card has two forms tied to that: a card of 4
  rows with two-line rows, a strip of 1 row with one-line rows. The pane
  is sized in whole terminal cells (`PaneShell` gives `cols` and `rows`;
  a row is `--cell-h`, 17 px at the default font only). Rows are keyed
  DOM elements patched in place. No click listeners. On the phone and
  the tablet the Group and Character views are these same panes in the
  strip, and the lens is the same Map pane.
- The map: WebGL2 on an OffscreenCanvas in a worker (ADR 0020).
  `src/map/render/characters.ts` draws the player and each group member
  as a quad tinted with a hue (`src/map/group.ts`, MMapper's golden
  angle). `pxPerRoom(zoom, z)` is 44 CSS px at zoom 1, layer 0. The far
  style starts at zoom 0.4 (17.6 px). Textures load through an
  `AssetSource` and `createImageBitmap`.
- Settings: `src/settings/types.ts`, `migrate.ts`, setters in
  `src/chrome/pane-options-model.ts`, gear popups in
  `src/chrome/popups/pane-settings.tsx`, the phone's copy in
  `src/phone/settings-page.tsx`. The tileset picker
  (`popups/mapper-settings.tsx`, ADR 0118) is the nearest thing to an
  image picker. Dialogs: the look kit (`src/chrome/kit/look-overlay.tsx`).
  Pane popups: `src/panes/popup-menu.ts`.
- The app's CSP has `img-src 'self' data:` and `connect-src 'self'
  wss://mume.org https://mume.org` (`scripts/csp.ts`, `public/_headers`).
  `blob:` image URLs are not allowed. There is no service worker.
- The hue of a group member is state, not a function: the map worker's
  `GroupTable` hands out golden-angle hues in arrival order and reuses
  released ones, and it gets Group events only while the Map pane is
  shown. Nothing about the group flows from the worker to the main
  thread, and the worker does not get `Char.Vitals`.
- A pane is plain DOM and cannot open a dialog of the look kit (Preact)
  today: `PaneContext` has no port for it.
- The cloud: one Worker with D1 and R2 (`worker/`, `wrangler.jsonc`,
  spec §7). Sync items are encrypted, at most 1 MB each, 2 MB and 2 000
  items per account; the kinds are a closed list (`SYNC_KINDS`,
  `shared/cloud/api.ts`); the limits are `DEFAULT_ACCOUNT_LIMITS` and a
  per-account column. The heartbeat (`src/cloud/beat.ts`) shows how an
  anonymous call with the device id is made. Flags are `FLAG_*` vars
  served by `GET /api/config`.

## The design

### 1. A look and where it comes from

```ts
type LookRef =
  | { src: 'auto' }                 // the engraved drawing for race, subrace, sex
  | { src: 'lib'; id: string }      // a library token, e.g. "elf-f-noldor"
  | { src: 'own'; id: string };     // one of the player's own images
```

Which look a character gets, the first that applies:

| # | For yourself | For a group member |
|---|---|---|
| 1 | Your choice for this character | Your assignment for that name |
| 2 | — | The directory's library token for the name |
| 3 | The engraved drawing for your race, subrace, sex | The engraved drawing for the directory's race, subrace, sex |
| 4 | The neutral silhouette (race unknown yet) | An NPC: the library picture its name matches (mounts, mobs) |
| 5 | — | The neutral silhouette (a player), the type icon (an NPC with no match) |

- The resolver is one pure module with unit tests for every row and
  every fallback. The Character pane, the Group pane and the map all ask
  it; none of them has rules of its own.
- An unknown sex is male, as today.
- **Bear form has a look of its own** (the owner, 2026-11-26). What
  MUME sends, from the owner's run with Dubb, a Beorning (2026-11-26):
  at login `Char.StatusVars {…"race":"Man","subrace":"Beorning"}`; at
  the change ("You growl loudly, as you shapechange into a bear.")
  `Char.StatusVars {"race":"Bear","subrace":null}`; back again
  `{"race":"Man","subrace":"Beorning"}`. A typed `info` in bear form
  says `You are a male Bear.`
  - Two engraved bears, male and female, are drawn
    (`src/panes/portraits/bears.ts`; preview
    `notes/research/portraits/bears.html`,
    <https://claude.ai/artifact/CYwoWxZukcP8Khr5d5nLQh>), not wired.
    The module exports `portraits.bear({sex, size, uid})` under a type
    of its own, because `bear` is not a `PortraitId`. To wire it: add
    `bear` to the id union, to `PORTRAIT_GROUP` and to `CHUNKS` in
    `index.ts`, and type the export as a `PortraitSet`. The female in
    the module wears the heather band; `alternatives.cord` exists only
    for the preview page: remove it when wiring (the owner approved
    the heather band). Wiring them is
    part A: `raceKind` keeps giving `beorning` for a bear (the age
    factor, the balloon and the race line depend on it); the portrait's
    choice gets the form from the race word itself (`race` is "Bear").
  - The automatic look shows the bear while in bear form, in the
    Character pane and as your token, by your sex. The sex is the
    character's (remembered per name); make sure the `info` line in
    bear form is read as the same sex and never clears it.
  - A chosen look (library or own) does not change with the form.
  - The directory always stores `beorning` for this character, in
    either form, and a change of form sends no report: others see the
    Beorning drawing. (A member's form is not in GMCP.)
  - Unit tests with the three `StatusVars` messages above; an e2e that
    emits them and sees the portrait and the token change and change
    back.
- A missing or broken image falls back one row down, silently.
- **Where looks are drawn.** There are three kinds of replay:
  1. the `__WC_REPLAY__` bundle (exported HTML, the share frame): no
     looks. It has no network and inlines every import, so the resolver
     is a stub there that never fetches `tokens.json` (as
     `src/panes/portraits/index.ts` does with `IN_REPLAY`);
  2. the in-app log player (`PaneContext.player`): no looks;
  3. the dev feed through the live app (`/?fixture=…`, `/?replay`,
     where `conn.state` has `replay: true`): looks are drawn, rows 1, 3,
     4 and 5 only. The tests and the screenshots use this.
  The directory is silent whenever `conn.replay` is true or
  `apiAllowed()` is false (`src/cloud/config.ts`).
- Logged out, the device's own `looks` apply; the account's are in the
  account (§7.0 rule 7). An `own` reference whose image is missing (not
  pulled yet, or removed on another device) falls to row 3 and is left
  as it is.

### 2. The library

- Source: <https://github.com/Sunnyl75/Character-Tokens-v3.0>, folder
  `Tokens/`, 125 PNG files of 256×256 with alpha (counted 2026-11-26:
  Men 20, Elves 13, Dwarves 4, Hobbits 15, Orcs 15, Trolls 8, other 13,
  mounts 15, mobs 22). Names: `Race-Sex-Class-Variant`, `Mount-…`,
  `Mob-…`, and a few singles (`Eye-of-Sauron`, `Gondor-Shield`, …). `BN`
  is Black Númenórean. One name has a space, one has underscores. Made by
  prompting ChatGPT (the README says so).
- **Permission** (decision 13): the repository has no licence file. The
  creator asked the owner on Discord to add the set, and the owner takes
  that message as the written permission. It covers use in WebCockpit.
  Credit the set in About's CREDITS section
  (`src/chrome/frames/about.tsx`) and in `THIRD_PARTY_NOTICES.md`, which
  says that these pictures are not under the client's GPL and names the
  source and the creator's GitHub name.
- The downloaded files are untrusted data: keep them in a directory of
  their own in the scratchpad, and read them only with the image tool.
- `scripts/tokens.ts` builds `public/tokens/` from a checkout of the set
  (ImageMagick is installed as `magick`; `cwebp` is not; `sharp` is not
  a dependency: add nothing heavy for a script that runs by hand):
  - `p/<id>.webp`, 256 px, for the portrait frame;
  - `t/<id>.webp`, 128 px, for tokens (the atlas cell's size) and the
    picker's grid;
  - `tokens.json`: id, label, group (`character`, `mount`, `mob`,
    `other`), race (a `RaceKind` or null), sex, tags, and for mounts and
    mobs the name words they match.
  The built files are committed; the script and a short README beside it
  say how to rebuild. Ids are lower case with hyphens and never change
  once shipped: the directory stores them. A unit test checks that every
  manifest entry has both files and that ids are unique and well formed.
- Nothing of it is in the start bundle. The manifest loads when the
  picker opens or when a look needs it. A picture loads when it is shown.
  Because of the CSP, pictures are `'self'` URLs or `data:`, never
  `blob:`.
- Budget: `public/tokens/` under 4 MB, the manifest under 25 KB.
- Ids never change, so `/tokens/*` gets a long cache rule in
  `public/_headers` (it is `max-age=0` by default).
- No unit test may need ImageMagick, the network or a GPU: CI runs all
  of vitest before a deploy. The manifest test reads the committed
  files only.
- Dwarves are the thin side (4 pictures). A new file is a new id.
- A library token is a cut-out bust on transparency. In the portrait
  frame and in a token it sits on the backing the mockup uses (a
  grey-brown, so that dark figures like the horse and the black wolf
  hold).

### 3. Own images

- Account only (decision 2). Logged out, the "My images" tab says so and
  links to the login.
- The player picks a file. The browser shows a square crop with pan and
  zoom and a circle that marks the token's cut. The result is encoded to
  WebP 256×256, the quality stepped down until it is at most 30 KB (if
  the browser cannot encode WebP, JPEG on a dark ground). The original
  never leaves the browser. Formats: what the browser decodes; an
  animated file gives its first frame. A file that cannot be decoded
  gives a plain message in the dialog.
- **One shelf of at most 50 images per account** (decision 14), as
  account limits so the owner can change them per account and in
  general: `lookImages` = 50, `lookImageMaxBytes`, `lookBytes`.
- **The server's numbers are blob bytes, not WebP bytes.** A sync body
  is canonical JSON, so the image travels as base64 inside it, and the
  server sees only the encrypted blob. Give the `lookImage` kind
  `compress: true` (the gzip path Comm uses), which should bring the
  blob back to within a few percent of the WebP. Then: the client aims
  at 30 720 bytes of WebP, `lookImageMaxBytes` = 32 768, `lookBytes` =
  1 638 400. **Measure it** with a real 30 720-byte image through the
  worker test. If the blob is larger than 32 768, drop the gzip and use
  42 000 and 2 100 000, and write which it became in the ADR.
- An image on the shelf can be the look of your own character or of any
  group member. A full shelf asks the player to remove an image first.
  Removing an image that is in use puts those characters back on
  automatic, after the dialog has said how many use it.
- Fifty images would eat the account's 2 MB for small items, so own
  images get **a budget of their own** and do not count against the
  2 MB or the 2 000 items. Usage is two counters on the account today
  (`item_count`, `item_bytes`), checked in `write()` for every kind, so
  this needs new counters and a D1 migration ("Build notes", N1). The
  server checks the count, the size of each and the budget (413
  `too_many_items`, `item_too_large`, `storage_full`), and the client
  says which it was.
- **An own image is never shown to anyone else.** No moderation is
  needed. Others see row 3 of the table.
- An own image is shown from a `data:` URL made from the decrypted bytes
  (the CSP), cached in memory per session.

### 4. Storage and sync

Two new sync kinds (the server treats them like the others, encrypted;
both are added to `SYNC_KINDS`):

| Kind | Items | Content |
|---|---|---|
| `lookImage` | one per own image | `{id, label, webp (base64), created}` |
| `looks` | one per account | `{ names: { [name]: { look: LookRef, at: number, own?: true } } }` |

- `looks` holds your own characters and the members you assigned, all by
  character name (lower case). `own` is set when the choice was made for
  the character being played. Local key: the constant `looks`. Policy:
  `merge` (as Comm), per name, the newest `at` wins; a reset to
  automatic is an entry too (so that it wins over an older choice on
  another device). At most 500 names. The prune must be the same on
  every device, or two devices push at each other for ever: entries
  without `own`, by `at` ascending and then by name, go first; `own`
  entries never.
- `lookImage`: the local key is a random image id; policy last writer.
- A pulled `looks` or `lookImage` is applied at once, also during play
  (as Comm is), so that a second device shows the change without a
  visit to the start page.
- Creating an account moves the device's `looks` in (`COPIED`,
  `src/cloud/space/spaces.ts`). A login copies nothing.
- Logged out, `looks` lives in the device's space (ADR 0150) with library
  and automatic looks only. The two spaces never mix (§7.0 rule 7).
- The sync engine's rules hold (ADR 0146, 0151, 0152): follow how
  `timers` and `scriptData` were added in stage 62.
- New settings, each added to the type, the defaults and `migrate.ts`:
  `character.shareLook` (on), `group.tokens` (on), `mapper.tokens` (on),
  `mapper.tokenHp` (on). **Do not bump `SETTINGS_VERSION`**: these are
  additive fields, and a bump makes older clients refuse the synced
  settings. (`group` is part of `ViewSnapshot`, so `group.tokens` lands
  in run captures; harmless, replays draw no looks.)

### 5. The picker

One dialog (the look kit's `Dialog`), opened by a click on the portrait in
the Character pane or on a token in the Group pane. A pane cannot open
one today: add `openLook?: (who: {name: string, self: boolean}) => void`
to `PaneContext`, absent in the player and in tests (like `statsView`
and `openInfo`), and give the focus back with `focusGame`.

**Naming**: "look" is already the design kit's word in the code
(`src/chrome/kit/look*.tsx`, `look-tokens.css`, `tests/e2e/look.ts`).
Put the feature in `src/looks/`, with a CSS prefix of its own
(`wc-lk-`), and name its e2e files `looks-*.spec.ts`.

- Title `Look for <Name>`.
- A preview column: the portrait in its frame, the token on a piece of
  map, the token in a Group row. It follows the selection live.
- Tabs: **Automatic** (one card with the engraved drawing and "Follows
  your race and sex (<race line>, <sex>)"; no hint line under it for
  your own character, decision 20), **Library** (chips for people, sex,
  mounts, mobs, with counts; a search field), **My images** (the shelf
  as a scrolling grid, `n of 50`, Add image, the crop step, remove).
- For your own character: the switch "Show my look to other MUME
  Cockpit players" (the owner: every text a player reads says MUME
  Cockpit, the client's name in its UI, never WebCockpit), with the note that an own image is never sent.
- For a member: "Reset to automatic", a line that says where the current
  look comes from (your choice, shared by the player, automatic from the
  player's race, unknown player, matched by name), and under the
  Automatic card the hint the mockup has for members.
- Cancel puts back the look the dialog opened with; "Use this look"
  keeps the selection. The selection shows live in the pane meanwhile.
- The dialog is usable by keyboard (tabs, grid by arrows, Esc closes),
  and the game input has the focus again after it closes.
- The click on the portrait is new: the portrait gets a pointer cursor
  and a tooltip line "Click to choose a look".

### 6. The Character pane

The portrait frame shows the chosen look. A library or own image is drawn
with `object-fit: cover` in the frame, a library token on its backing.
Nothing else in the card changes. The compact card (no portrait) has no
portrait to click: the gear's popup gets a "Look…" row that opens the
picker, in every size.

### 7. The map

- With `mapper.tokens` on and a room at least 20 CSS px wide, the player
  and each group member are drawn as a round token of 0.8 room, with the
  R3 ring (decision 16): 1 px, the member's hue muted 25 % toward grey,
  and the dark outline outside it as in the mockup. Your own ring is
  today's marker colour, muted the same way. Below 20 px and in the far
  style, today's boxes are drawn, unchanged.
- The off-screen arrows, the layer arrows, the prespam line and the name
  labels of away members stay as they are.
- **HP arc** (`mapper.tokenHp`, decision 7): a thin arc outside the ring
  that follows the member's HP, starting at 12 o'clock, in Group's
  colours and thresholds (one shared function with the Group pane, so
  they cannot drift). About 3.5 % of the picture wide, at least 1 px.
  Drawn only below full HP, and not when the HP is unknown. Your own HP
  comes from `Char.Vitals`.
- **Several in one room** (decision 8): the fan. Your own token is whole
  and on top; the others are small discs along the lower edge in group
  order, at most three, then a `+n` disc. A room without you shows its
  first member whole and the others the same way. Sizes as the mockup.
- **Who owns what.** The main thread owns the hues and the looks: one
  `GroupTable` in `GameState` (`src/gmcp/state.ts`), fed every
  `Group.*`, so that the Group pane has hues with the map hidden too. A
  new message to the worker, sent only on change (a new `t`, never a
  changed field: `src/map/protocol.ts`):
  `{t:'tokens', on, hp, self:{look, hp}, members:[{id, color, look, hp}], colors}`.
  `hp` is a fraction or null. `colors` are Group's HP colours resolved
  for the theme (`groupVitals`, `vitalColor`, `signalColors` in
  `group-model.ts`; the base colour is a setting, not a fixed green).
  The worker uses the given colour for a member id when it has one, and
  its own table otherwise, so that tokens off draws exactly what it
  drew before.
- **Renderer** (your call in the details; these are the rules): one
  token texture, either an atlas (1024×1024 with 128 px cells) or, as
  the tiles already are, a `TEXTURE_2D_ARRAY` of 64 layers of 128 px
  with mipmaps, which avoids bleeding between cells. The least recently
  used look leaves. All tokens of a frame are drawn in one instanced
  draw call (`drawArraysInstanced` is already used); the circle, the
  ring, the outline and the arc are made in the fragment shader, with
  edges smoothed by the pixel's size so that they hold at every zoom
  and device scale. A 256 px picture shown at 20 px must not shimmer
  when the map moves. The `+n` disc needs glyphs: the names' font batch
  or cells drawn once.
- **Getting pictures to the worker.** Library tokens: the worker
  fetches `${BASE_URL}tokens/t/<id>.webp` itself (outside the map's
  asset root; `connect-src 'self'` allows it) and decodes with
  `createImageBitmap`. Own images: the bytes, sent once. Engraved
  drawings need the DOM: bake once per (id, sex) at 128 px on the main
  thread, off the game path and one at a time (each bake runs SVG
  filters), and send `createImageBitmap(canvas)` as a transferable.
  Never `fetch` a `data:` URL in the worker (`src/map/assets.ts` says
  why). Nothing is sent per frame.
- **Context loss**: `webglcontextrestored` builds a new renderer. The
  worker keeps the decoded sources or asks the main thread for them
  again.
- An unlocated player keeps today's far marker. The 20 px rule is
  `pxPerRoom(zoom, view.layer) >= 20`.
- **Cost rule** (intent Goal 1, spec §1.3): frames are drawn on demand
  and the scene's geometry is rebuilt when the scene or the view
  changes. With tokens on: at most one more draw call than today, and
  no allocation on a frame whose scene and view are unchanged. Prove
  the draw count in a unit test with a wrapped GL. Add a token scene
  (you and eight members, five in one room) to the `map` section of
  `bench/browser-bench.ts` (its feed is generated by
  `tests/fixtures/map-demo.gen.ts`), run it before and after, and write
  both numbers in the ADR with the laptop's power state
  (`cat /sys/class/power_supply/BAT*/status`): never compare a run on
  battery with one on mains (CLAUDE.md). The existing benches must not
  move beyond their noise.
- **Tokens off is today's map.** No e2e stores a baseline picture, so:
  before part B, on the commit before it, save reference PNGs of fixed
  `debugScene` scenes with members into the scratchpad
  (`WC_MAP_SHOT_DIR`, `tests/e2e/map-render.spec.ts`); after B, compare
  them with tokens off. Add a unit test that `buildScene` gives the
  same geometry with tokens off (`tests/unit/map-render.test.ts`).
- The phone lens follows the same pixel rule.

### 8. The Group pane

- With `group.tokens` on, the token takes the marker icon's place at the
  start of a row, round, with the R3 ring in the member's hue. The hue
  comes from the `GroupTable` in `GameState` (§7), the same the map is
  sent.
- **Rows follow the pane's height** (decisions 11, 17, 18, 24). Every
  row has the same height `h`: the pane's free height shared between
  the members, held to the steps below. What is left over stays empty at
  the bottom. The text keeps the terminal's font size.
- **The steps are in cells, not in fixed pixels.** The pane's free
  height is `rows × cell.h` (`ctx.cells.get().h`). The mockup's numbers
  are for a 17 px cell; with a larger font every step grows with it, or
  text would be cut. With `c` = the cell's height:

  | Row height `h` | At 17 px | Layout | Token |
  |---|---|---|---|
  | members do not fit at `c` each | | one-line rows of `c`, then `↓ n more` (today's rule) | `c` − 4 px |
  | `c` ≤ h < 2`c` | 17–33 px | one line, growing: name, icons, mini bars | `h` − 4 px |
  | 2`c` ≤ h < 3.3`c` | 34–55 px | two lines: the name line, then the three bars side by side (today's two-line row), the bars growing from 5 to 8 px | `h` − 8 px |
  | 3.3`c` ≤ h ≤ 4.5`c` | 56–76 px | the name line, then HP, mana and moves as three full lines with `value/max` to the right; a member with no mana has two lines | `h` − 8 px, at most 68 px |
  | above 4.5`c` | | the row stops at 4.5`c` | 68 px |

  Only the token's cap of 68 px is absolute (decision 18). The pure
  function is `groupRows(n, fight, heightPx, cellH)`.
- **The fight card and the overflow row**: take the card (4 cells) off
  the height first. If the rows then get less than 2 cells each, use the
  strip (1 cell) instead and compute again. The overflow row is 1 cell.
  The phone's own fight card (`src/phone/fight-card.ts`) is not touched.
- **Numbers**: players carry numbers, NPCs only band words, and a
  word-only update can clear `value` while `max` stays. Show `value/max`
  only when both are known; otherwise the band word in the same place,
  so that the row's width does not change.
- **The HP arc and the bar agree**: use `vitalPct`
  (`src/gmcp/group.ts`). The arc is drawn when `pct !== null && pct <
  1`; an estimate from a band word counts as known, as for the bar.
- The rows no longer sit on the cell grid; the frame and the text size
  still do. This replaces `groupLayout`'s two fixed layouts. Write an
  addendum to ADR 0122. With `group.tokens` off the rows scale the same
  way, with the marker icon at its normal size.
- No layout shift while playing: a row's height changes only when the
  member count or the pane's size changes, never with a vitals update.
- A click on a token opens the picker for that member. The token is a
  button (focusable, with a label). The row's tooltip stays. Nothing else
  in a row becomes clickable. Where the token is smaller than a finger
  (one-line rows on the phone), the row's leading area is the target.
- The NPC tag stays where two lines or more are shown (decision 19). No
  other mark replaces the marker icon.
- NPC members match the library by name words (`tokens.json`): "a
  trained horse" → `mount-trained-horse`. The match with the most words
  wins; a tie goes to the first in the manifest. Unit tests with the NPC
  names in `tests/fixtures` and `notes/research/gmcp-group.md`.

### 9. The directory (shared looks)

The only part where something readable leaves the browser.

**What is stored**, one row per character name:

```
look_dir(name PK,            -- lower case, as MUME writes it
         race, subrace, sex, -- kinds from src/gmcp/race.ts; 'male'|'female'|null
         token,              -- a library id or null
         owner,              -- a keyed hash of the account id, or of the look key when logged out
         updated)
```

- **Two route families**, because the session cookie only travels to
  `/api/u/*` and the client cannot read it:
  - logged out: `PUT /api/look` and `DELETE /api/look`, body
    `{key, name, race, subrace, sex, token}`, `credentials: 'omit'`,
    `X-WC: 1`, same Origin (copy the view route in `worker/pub.ts`);
  - logged in: `PUT /api/u/look` and `DELETE /api/u/look` through
    `accountApi`, with no key in the body;
  - `POST /api/look/find` `{names: [...]}` is anonymous,
    `credentials: 'omit'`.
- **The key is not the statistics' device id.** The heartbeat's id is
  promised never to be tied to a character or an account
  (`src/cloud/beat.ts`, the privacy text). Reports use a random id of
  their own (`localStorage` `wc.lookKey`), made when first needed and
  used for nothing else.
- **The owner** of a row is `HMAC(AUTH_PEPPER, "wc-look|d|" + key)`
  logged out and `HMAC(AUTH_PEPPER, "wc-look|a|" + account.id)` logged
  in (`hmac`, `toB64url` in `worker/bytes.ts`; the pattern of
  `worker/attempts.ts`). No pepper: 503. The first reporter owns a name.
  Another owner's report is refused (409) while the row is fresher than
  30 days, so a name cannot be taken over to show a wrong picture. A row
  not refreshed for 180 days is removed by the daily Cron (`runCron`,
  `worker/stats.ts`).
- **Login takes the rows over without linking the two**: just before a
  login the logged-out client sends `DELETE /api/look` with its key,
  and after it the client reports through `/api/u/look`. Deleting an
  account deletes its rows (`worker/deletion.ts`, `deletionBatch`).
- **A 409 is remembered for the session** and not retried. It happens
  to the second device of a logged-out player, whose switch then
  removes nothing: the picker says "shared from another device or
  account" there.
- **Report** is sent when the character's name and race are known after
  login to the game, and again when the race, the sex or the look
  changes (the sex may come later, from the info poll). At most once
  per character and session unless something changed. The token is
  sent only for a library look; automatic and own images send `null`.
  Race and subrace are sent as kinds, never as MUME's text.
- **Everyone reports, accounts or not** (decision 12), unless
  `character.shareLook` is off. Turning it off sends the `DELETE`,
  which removes the owner's rows. Never in dev, e2e, replays or under
  webdriver (`apiAllowed()`).
- **Ask** is sent when the group gets a name the client has no fresh
  answer for, gathered for a moment so that a `Group.Set` is one call,
  at most 40 names. Answers are cached in memory and in `localStorage`
  for 24 hours, a miss for 1 hour, at most 300 names. NPC members are
  never asked for. The server keeps no log of who asked for whom, and
  the answer has no `owner`.
- **Validation**: the name is 2–20 letters; every other field is checked
  against the known kinds and the manifest's ids (the worker has the id
  list from the build). Free text is never stored, so the directory
  cannot carry a message or a link.
- **Limits**: report, 30 an hour per owner and per hashed address, as
  counters in the `attempt` table (`worker/attempts.ts`; the rate
  limiting binding only knows 10 and 60 seconds); at most 20 names per
  owner. Find, 60 a minute per address with a new binding
  `LOOK_LIMITER` (namespace ids 5909 production, 5910 staging; also in
  `worker/test/wrangler.jsonc`, `worker/env.d.ts`, `worker/runtime.ts`).
  The numbers are constants in `shared/cloud/api.ts`, not in
  `/api/config`.
- **Admin**: the count of rows on `/admin`, and removal of a row by name
  (audit log, ADR 0157: log it as `look.remove` and add `look` to the
  moderation pattern in `kindOf`, `worker/auditlog.ts`). Removal is the
  only remedy when a stranger holds a name that was never reported;
  say so in the ADR.
- **Flag**: `FLAG_LOOKS` (§7.0 rule 5): on in staging, **off in
  production** until the owner opens it. Off: no report, no ask, and
  members follow rows 1, 4 and 5 of the table. Everything else in this
  stage works with the flag off and with the service down (§7.0 rule 2).
- **Never in the game path** (§7.0 rule 1): both calls run on idle time,
  and a failure is silent and retried later, not in a loop.

**What this changes, to be said plainly** (intent: "Privacy by
construction"):

- The service learns that a character name uses WebCockpit, and its race
  and sex. Until now it knew no character name.
- Anyone who knows a name can ask for its race. Race tells the side in
  the war. A name is normally known only to those who met the character.
- The service sees which names a client asks for, that is, who is in a
  group with whom, for the moment of the request. It is not stored.
- A logged-in player's row is tied to the account by a hash that only
  the service's secret can make. A logged-out player's row is tied to
  the look key, not to the statistics' device id.
- The owner approved this (decisions 3 and 12). `intent.md` has the goal
  (Goal 16) and the constraint's wording since 2026-11-26. The privacy
  text gets a section of its own, shown with the flag
  (`src/chrome/frames/privacy-looks.ts`, beside `privacy-accounts.ts`;
  bump `PRIVACY_UPDATED`), and "no character name is ever sent" in the
  existing text is reworded to be true. It and "WHAT THE SITE KNOWS" in
  About say what is sent, what is stored, for how long, and how to turn
  it off and remove it. The switch is in the picker and in Settings.

### 10. Phone and tablet

Decision 22: the basics are in, and the design is yours to propose.

- The Group and Character views on the phone and the tablet are the
  cockpit's own panes in the strip, and the lens is the same Map pane:
  tokens, the arc and the scaling rows come with parts B and C. Of the
  lens's four zoom levels only the closest (about 30 px a room) passes
  the 20 px rule.
- New on the phone: the picker page, the switches in
  `src/phone/settings-page.tsx`, and a tap target for small tokens (§8).
- There is no tablet e2e project: the projects are `firefox`,
  `chromium` and `phone`, and the tablet tests are
  `tests/e2e/phone-tablet*.spec.ts` in the phone project.
- The picker on the phone is a page in the phone's look, not the desktop
  dialog made small: read how the phone's settings pages and the phone
  Character card are built (`src/phone/`, stages 51–56, ADR 0166's phone
  addenda) and make it belong there. Touch targets of at least 44 px,
  the library as a grid that scrolls, the crop step by touch (drag and
  pinch).
- Intent Goal 12 asks that phone changes are put to the owner: take
  screenshots of every new phone and tablet view (`scripts/phone-shots.ts`
  and `tablet-shots.ts` show how), put them in the test guide, and say
  under "Decided in the night" what you chose and why. The owner judges
  them in the morning; do them well enough that he can say yes at once.
- If the phone work threatens the rest of the night, it is part F and
  comes last.

### 11. Not in this stage

- Sharing own images with others (needs moderation).
- A chosen look of its own for bear form, looks from Lua, looks in
  replays.
- Tokens for enemies or for characters outside the group.
- Class in the automatic choice (`subclass` in `Char.StatusVars` is not
  read today).
- New engraved drawings, other than the two bears.

### Where the mockup is not the truth

- The three-line bar step is at 56 px, not 52 (§8).
- One-line rows grow from 17 to 33 px (§8); the mockup keeps them at
  17 px.
- The red dot for an enemy race is not built (decision 19).
- The mockup's map is a canvas stand-in, its Character card is static,
  and its numbers in the bars are invented.
- The mockup offers R1–R4 and the three fixed row modes for comparison:
  only R3 and free scaling are built.
- Round 1 (`round1.html`) is history: arcs A and B, the grid and the
  rounded square lost.

## Parts

In this order. Each part is finished, tested and committed before the
next starts.

### A. The library, the look model, the picker, the Character pane

- `scripts/tokens.ts`, `public/tokens/`, the manifest and its test; the
  notices and the credit.
- `LookRef`, the resolver, the store for looks in the device's space.
- Bear form wired to the two bear drawings (§1).
- The picker with Automatic and Library (My images shows the logged-out
  card for now), the click on the portrait, the gear's "Look…" row.
- The new settings with migration.

Done when: a library look chosen logged out shows in the Character pane
and is still there after a reload; Cancel puts the old look back; the
compact card reaches the picker through the gear; nothing loads from
`public/tokens/` before a look or the picker needs it (a test checks the
requests of a normal start); unit tests for the resolver and the
manifest; an e2e file for the picker (open, filter, search, pick,
cancel, keyboard, focus back in the input); the existing Character e2e
is green.

### B. Map tokens

- The atlas, the shader, the token draw, the fan, the HP arc, the 20 px
  rule, the switches in the map's gear and in Settings → Mapper.
- The hue shared between the worker and the main thread.
- The bench scene and its numbers.

Done when: with the group fixture, you and the members are tokens at
zoom 1 and boxes below 20 px a room; five in one room is a fan with
`+1`; a hurt member has an arc and a healthy one none; the switch turns
both off and the map is pixel-equal to before the stage with tokens off
(compare against the existing map screenshots/tests); the bench numbers
are in the ADR and within the rule; `map-render.spec` and the other map
e2e are green, with a new file for tokens.

### C. Group tokens and the scaling rows

- Tokens in the rows, the R3 ring, the click to the picker for a member,
  member assignments, NPC matching.
- The row scaling of §8 and the ADR 0122 addendum.

Done when: for 1, 3, 6, 10 and 20 members and pane heights from the
smallest to a tall one, the rows follow the table in §8 (unit tests on
the pure layout function for every step and its edges; e2e screenshots
at a few sizes); no row height changes on a vitals update; a click on a
token opens the picker for that name and the assignment shows in the
pane and on the map; "a trained horse" gets the horse; with
`group.tokens` off the pane has marker icons and scaled rows;
`group-pane.spec` is green or updated where the layout rule changed on
purpose (say which tests changed and why).

### D. Own images

- The crop step, the encode, the shelf, the two sync kinds, the limits
  in the worker, the migration if the limits need one.

Done when: with the local worker (`scripts/dev-cloud.ts`,
`test:sync-worker`), an image added in one browser context shows in a
second one logged in to the same account, as the portrait and as a
token; the 51st image and an image over the size are refused with a
plain message; removing an image in use resets the looks that used it;
logged out the tab shows the login card and no own image is shown; the
worker's tests cover the count, the size and the budget; the sync tests
are green.

### E. The directory

- The table and its migration, the three routes, validation, the owner
  rule, limits, the Cron's pruning, the admin count and removal, the
  flag.
- The client: report, ask, the cache, the switch, the take-over at
  login.
- The privacy text, "What the site knows", the spec §7 section.
- Deploy to staging:
  1. `git push origin main` (the workflow builds the pushed branch);
  2. `gh workflow run deploy.yml -f environment=staging -f action=deploy`,
     then `gh run watch <id> --exit-status`. CI runs the typecheck, all
     of vitest with the worker tests, the build and the smoke test
     first; a slow worker test stopped a deploy once (stage 66);
  3. `WC_PROD_URL=https://staging.mumecockpit.com npm run test:prod`.
     It runs under webdriver, where the client makes no API call, so it
     proves the site and not the looks;
  4. check the three routes on staging with `curl` (report, find,
     delete, a refused takeover), with a made-up name that is removed
     again. The owner's own two-browser test is in the test guide.

Done when: worker tests for every route, the owner rule (first owner,
refusal, the 30 days, the take-over), validation of every field,
the limits and the pruning; an e2e with two browser contexts and two
characters in one group in which each sees the other's reported look
and library token, and sees the neutral silhouette for a third name;
with the flag off no call is made (a test checks the requests); with
`shareLook` off nothing is reported and the rows are removed; nothing
is awaited in the game path; staging is deployed with the migration
applied, `test:prod` is green there and the `curl` checks passed;
production's flag is off in `wrangler.jsonc`. The two-character e2e
drives a live connection without MUME (`tests/e2e/mume-login-mock.ts`)
against the local worker; a fixture replay must never report.

### F. Phone and tablet

§10. Done when: tokens show in the lens at its closest level and in the
phone's and tablet's group views; the picker page works by touch in the
phone project, with a tablet test beside the other tablet tests; the
screenshots are in the test guide; the existing phone and tablet e2e are
green.

### At the end

- The full unit, e2e (5 workers, alone), worker and `test:prod` runs,
  and `npm run typecheck`, all green; the benches run and compared.
- `npm run build:site -- --target staging` passes (it has the checks
  and the smoke test). A plain `build:site` refuses, rightly: 0.23.2 is
  live with another commit, and the version is not bumped tonight.
- A last look at the real client against the mockup, on desktop, phone
  and tablet sizes, in Chromium and in Firefox.
- The documents below, the test guide, the log.

## Documents

- **ADRs** (new numbers from 0169): the look model and the order of its
  sources; the library (the build, the ids, the permission); own images
  and the shelf (the limits, the budget of their own); map tokens in the
  renderer (the atlas, the shader, the bench numbers); the directory
  (what it stores, the owner rule, the privacy reasoning above). An
  addendum to ADR 0122 for the scaling rows.
- **`spec.md`**: a section §7.14 "Shared looks" (the routes, the table
  in §7.11, the limits in §7.10, the flag), the two sync kinds in §7.4,
  and a short section for looks and tokens where the panes are specified.
- **`intent.md`**: Goal 16 and the constraint's sentence are already in
  (2026-11-26). Do not change the intent further.
- **The privacy text and About** (`src/chrome/frames/privacy-text.ts`,
  `privacy-looks.ts`, `about.tsx`: "WHAT IS INSIDE" for the panes,
  "WHAT THE SITE KNOWS", "CREDITS"). There are no help pages for the
  panes. Tests read these texts (`tests/unit/about-leaf.test.tsx`,
  `chrome-frames.test.tsx`, `public-text.test.ts`,
  `tests/e2e/about.spec.ts`, `phone-credits-about.spec.ts`).
  `README.md` only if a sentence there became wrong (its pictures are
  the owner's to renew).
- **`THIRD_PARTY_NOTICES.md`**.
- **`progress.md`**: the stage table and the session log.

## Test material

There is no test server with a group. The tests drive the panes like
this:

- **Panes**: the dev feed through the live app,
  `/?fixture=gmcp-demo.log&speed=0`, plus
  `window.__wc.app.bus.emit('gmcp', …)` (the `emit()` helper in
  `tests/e2e/group-pane.spec.ts`; `tests/e2e/map-render.spec.ts` for the
  map and `debugScene`). Looks are drawn here (§1, kind 3).
- **A live connection without MUME**: `tests/e2e/mume-login-mock.ts`
  (e2e) and `scripts/lib/mume-feed.ts` (screenshots).
- **The bench**: `bench/ws-server.ts`.
- **The local worker and two contexts**: `scripts/dev-cloud.ts`,
  `playwright.sync-worker.config.ts` (add `looks` to `WC_DEV_FLAGS`),
  the helpers in `tests/e2e/sync-pages.ts` (`syncNow`, `logIn`,
  `getIdb`). The second Playwright project shares the first one's local
  D1: character names in the looks e2e are unique per project and
  letters only, and each context gets its own `CF-Connecting-IP` (as
  `tests/e2e-worker/sync-worker.spec.ts` does).
- **A stubbed API in the normal e2e**: `?cloudtest` and `page.route`
  (`tests/e2e/cloud-stats.spec.ts`).

## Build notes (from a review against the code, 2026-11-26)

Read-only findings of a review of this spec. They were not run; check
each against the code as you reach it.

**N1. What two new sync kinds touch** (part D; follow how stage 62
added `timers`):

- Worker and contract: migration `worker/migrations/0009_looks.sql`
  (additive, as spec §7.11 asks: `look_count` and `look_bytes` on
  `account`, and `look_dir` for part E, so that staging gets one
  migration); `worker/sync.ts` (`put` caps the body by kind, `write()`
  picks the counters and limits by kind, `UsageRow` and its SELECTs);
  `worker/accounts.ts` `usageOf`; `AccountUsage`, `SyncUsage`,
  `AccountLimits`, `DEFAULT_ACCOUNT_LIMITS`, `SYNC_KINDS` and
  `SYNC_KINDS_OPEN` in `shared/cloud/api.ts`; `worker/limits.ts`
  `BYTE_LIMITS`; `worker/admin/limits.ts` labels; `worker/panel.ts`.
- Client: `src/cloud/config.ts` (the new limit keys go in an optional
  list like `COMMUNITY_LIMIT_KEYS`, never in `LIMIT_KEYS`);
  `src/cloud/sync/types.ts` `ItemRecords`; `src/cloud/sync/items.ts`
  (two `KindSpec`s, `ITEM_SPECS`, `SYNC_SPECS` with `lookImage` before
  `looks`); `src/cloud/space/local.ts` (list, put and remove for both:
  an adapter that lists none of a kind makes the engine delete every
  pulled item of it); `src/core/db.ts` (`DB_VERSION` 11 with stores
  `looks` and `lookImages`; never edit an old upgrade step);
  `src/cloud/space/notify.ts` `WRITTEN_KINDS`; `unsynced-words.ts`;
  `spaces.ts` `COPIED` and `LOCKING_SPECS`; `runtime.ts` `inUse`.
- Tests and fakes that list the kinds: `tests/unit/cloud-sync-model.ts`,
  `cloud-sync-items.test.ts`, `cloud-space-kinds.test.ts`,
  `cloud-contract.test.ts`, `admin-page-accounts.test.ts`,
  `map-db.test.ts`, `spaces.test.ts`; `worker/test/sync.test.ts`;
  `tests/e2e/cloud-account-fake.ts`; `scripts/lib/cloud-fakes.ts`.
- The 4 MB page of `changes` is no problem: a full pull becomes two
  answers.

**N2. What the flag `looks` touches**: `FlagName` and `FLAG_NAMES`
(`shared/cloud/api.ts`); `flagDefault` (`worker/flags.ts`);
`worker/runtime.ts` `Env`; `worker/env.d.ts`; `wrangler.jsonc`
(`"FLAG_LOOKS": false` at the top level, `true` under `env.staging`);
`worker/test/wrangler.jsonc`; `WC_DEV_FLAGS`; the tests that list
flags (`worker/test/admin.test.ts`, `worker/test/helpers.ts`,
`tests/unit/admin-page-flags.test.ts`, `cloud-config.test.ts`).

**N3. Tests that will break on purpose** (update them and say why):

- Part A: `tests/unit/character-portrait.test.ts`, `pane-gear.test.tsx`,
  `phone-settings.test.ts`, `settings.test.ts`,
  `new-user-defaults.test.ts`; `tests/e2e/character-gear-fit.spec.ts`
  (the gear popup must still fit with one more row).
- Part C: `tests/unit/group-pane.test.ts`, `panes-gmcp.test.ts`,
  `panes-rowdiff.test.ts`, `group-no-mana.test.ts`;
  `tests/e2e/group-pane.spec.ts`, `gmcp-panes.spec.ts`.
- Parts B, D, E: `tests/unit/panes-map.test.ts` and `map-worker.test.ts`
  if the protocol or the scene types change; the lists in N1 and N2.

**N4. Patterns to copy**: an anonymous route with a client id,
`worker/pub.ts` (the view route) and the UUID check in
`worker/stats.ts`; the Cron's pruning, `runCron` in `worker/stats.ts`
with its test; admin routes in `worker/panel.ts`, `sealedBatch` in
`worker/auditlog.ts`, the page code in `worker/admin/`, the harness
`tests/unit/admin-page-harness.ts`. `magick` reads and writes WebP.
The next ADR number is 0169.

**N5. Old tabs**: a tab still on 0.23.2 treats the new kinds as newer
and leaves them, and loses its stores when a new tab upgrades
IndexedDB (both are existing, intended behaviour). An old client that
rewrites the settings drops `character.shareLook`. Note it under
"Decided in the night".

**N6. A removal race**: one device removes an image while another
assigns it. The resolver's silent fallback covers it.

## Tasks

- [x] Brainstorm, mockup rounds 1 and 2, the owner's decisions 1–24.
- [x] A. The library, the look model, the picker, the Character pane
  (2026-11-27 night: `f17cbcec`…`c518830f`; unit 6283, full e2e 2150 passed)
- [ ] B. Map tokens
- [ ] C. Group tokens and the scaling rows
- [ ] D. Own images
- [ ] E. The directory, staging
- [ ] F. Phone and tablet
- [ ] The end checks, the documents, the test guide, the log

## Test guide

Written by the night run for what was built. It must say: what to
restart (the dev server on 5173), what to open, the steps for each part,
how to test shared looks with two browsers on staging, the phone and
tablet screenshots, and what feedback is wanted.

## Release notes (draft)

(the night run writes here)

## Decided in the night

- A: The picker's CSS prefix is `wc-looks-`, not `wc-lk-`: `wc-lk-` is
  already the look kit's own prefix (hundreds of classes), and the spec
  wanted one of the feature's own (ADR 0169).
- A: The library's "All" chip shows the whole library, mounts and mobs
  too (125, as the mockup's); the grid is ordered Men, Elves, Dwarves,
  Hobbits, Orcs, Trolls, the rest, mounts, mobs. The search matches the
  start of a word of the id or a tag ("elf f noldor", "hors").
- A: The four named pictures (Bladorfat, Newman, Sunny, Tarannon) are in
  "Other" with no race or sex; Black Númenóreans and the two bears are
  characters (race `numenorean`, `beorning`) and also show under "Other".
- A: The manifest is fetched as `tokens.json?v=<release>`, and all of
  `/tokens/*` is cached a year as immutable: a changed picture must get a
  new id (ADR 0170).
- A: DB_VERSION is 11 now, with the stores `looks` and `lookImages` (the
  latter empty until part D), so staging and production get one upgrade.
  A 0.23.2 tab loses its stores when a new tab upgrades (N5, intended).
- A: The picker's map bit is the player's tileset preview scene (Shimrod
  shows its summer one) with the token on it; the Group row is a static
  two-line row with your current vitals.
- A: The Character gear has the "Look…" row (every card size) and the
  switch "Show my look to other MUME Cockpit players" too, so it is not
  only inside the picker. Settings → panes and the phone's settings page
  get theirs with parts E and F.
- A: Keys in the picker: Tab and Shift+Tab walk everything in it, ← → move
  between the tabs, the arrows walk the grid by its columns, ↓ or Enter
  in the search goes into the grid, Enter or Space picks, Enter on the
  picture already picked uses it, Esc cancels. No letter keys.
- A: Without the pane's border, the name over the portrait stays the
  pane's grip: only the frame below the name opens the picker there.
- A: The phone has no picker yet (no `openLook` on the phone): the
  portrait there has no click until part F.
- A: The `info` line in bear form ("You are a male Bear.") sets the sex
  whichever form GMCP reported last; nothing clears it.
- B: A lone token fills 0.8 room (the spec), not the mockup's 0.84; the
  fan keeps the mockup's sizes. With the HP arc on, the arc's room is
  kept round every token (as the mockup does), so a token does not grow or
  shrink when its HP changes; with the arc off the pictures are a little
  larger.
- B: In the fan your token is drawn last, over the small ones (the spec's
  "whole and on top"); the mockup drew the small ones over it.
- B: The texture is a `TEXTURE_2D_ARRAY` of 64 layers of 128 px with
  mipmaps (no bleeding between cells), made with the first token, so
  tokens off costs nothing on the GPU (ADR 0171).
- B: The arc's colours are Group's HP colours for the side of the map's
  background (dark on the default map: the Group pane's dark side), not
  the Group pane's own side: the arc is drawn on the map.
- B: The main thread's hues win on the map also with tokens off (the same
  hues as before when the map was shown from the start; better ones when
  it was turned on mid-session). Without looks (the log player, the
  replay bundle) the worker gets no tokens message and draws exactly as
  before.
- B: An NPC whose name matches no library picture is a token with the
  disc and the ring only (no type icon on the map). The manifest is loaded
  once there is an NPC member to match and tokens are on.
- B: The worker reports what it drew as `data-map-tokens` (tokens / +n
  discs / arcs) and the pane `data-map-self-look`, for the tests.
- B: `map-render.spec.ts` now sets `mapper.tokens` off: it is the box
  renderer's reference. With tokens off its 14 screenshots are
  pixel-equal to the commit before the stage (726af9d7, rerun in a
  worktree; the first baseline's `far-chromium` was taken before the
  worker had redrawn and differed from a rerun of the same commit).

## Owner feedback

- 2026-11-26: the two bears are approved as drawn ("Kör på dessa"). The
  female keeps the heather band: remove `alternatives.cord` when
  wiring.

## The kickoff prompt

Paste this into a new session (Opus 5.5) in `/home/ole/proj/webcockpit`:

> Bygg steg 80 i natt, utan att stanna för mig. Läs `CLAUDE.md`,
> `progress.md` och `docs/stages/80-character-tokens.md`: stegfilen är
> specen och dina regler för natten ("Night run"). Bygg delarna A–F i
> ordning med subagenter, verifiera varje del själv (tester, skärmbilder
> av den riktiga klienten mot mockupen) innan nästa börjar, och håll
> stegfilens uppgiftslista aktuell. Du får pusha `main` och driftsätta
> till staging, aldrig produktion, och du loggar inte in i MUME. Fråga
> mig ingenting: välj det som är lättast att ändra, skriv det under
> "Decided in the night" och fortsätt. Sluta med testguiden, ADR:erna och
> sessionsloggen, så att jag kan testa när jag vaknar.
