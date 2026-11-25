# 0166 — The Character card: the hidden info poll, clicks as commands

Date: 2026-11-22. Status: accepted, not built (stage 77, decided after
part A; parts B–G build it and add addenda). Related: ADR 0052 (exact or
band), ADR 0122 (the Lykta panes), ADR 0006 and 0016 (the run log).

## Context

The Character pane becomes a card (stage 77). Status comes from GMCP.
Stats and Lore need values that only `info <format>` gives, so the client
sends it and hides the answer. Some fields send commands when clicked.
Part A measured MUME live (`docs/stages/77-character-pane.md`, "Live
results"):

- `info` keeps its place in the command queue but takes no 250 ms slot.
  After a cast it is answered when the cast is over.
- The answer wraps at the window's width, at spaces as far as seen.
- One prompt closes everything a pulse printed.
- GMCP sends a pulse's last state, and only when it changed.

## Decision

The poll:

1. The sentinels are ASCII with a nonce per poll, so a connection without
   UTF-8 works and nobody can fake one in a say or tell.
2. The fields are separated by ` | `. The reader joins the lines with a
   space, removes SGR, splits at `|` and trims.
3. One poll is outstanding at a time. Nothing is hidden before its start
   sentinel, however late that comes. Hiding ends at the end sentinel or
   2 s after the start sentinel.
4. The answer's own blank lines go with it. The prompt goes only when the
   answer was all that pulse showed. The partial line is covered too.
5. The poll's command and answer are kept out of the run log by a mark of
   their own. A display gag and `echo: false` do not do it, since the
   recorder takes `cmd.sent` and `text.line` before the display pipeline.
6. No poll without a key or click from the player in the last 5 minutes
   (the owner), so that an open tab does not defeat MUME's idle timeout.

Clicks:

7. A click sends with `sendCommand`, so no alias can change it (Khazdul
   has `sleep`, `normal` and `quick`). It is echoed and logged like a
   typed command (the owner).
8. The value changes only from GMCP. The pending mark ends at the change
   or after 3 s. A later change still shows.

Race:

9. Race and subrace are matched on words and stems, never whole strings,
   as only one real pair is confirmed. An unknown race gets the neutral
   portrait and no age track or modifiers, never a guessed factor.

## Consequences

- The poll does not delay the player's commands.
- A shared or replayed run has no trace of the poll, so a replay cannot
  fill Stats and Lore.
- A prompt shared with other output stays.
- The wrap below one word's width is unverified until part C's test on a
  phone.

## Addendum (part B, 2026-11-22): the model

A correction first: "ADR 0052 (exact or band)" in the heading above means
Cockpit's ADR 0052 (`src/gmcp/bands.ts`), not this project's ADR 0052
(pixel scrolling in panes).

Exact or band:

10. Each bar keeps whether its last update was a number. A numeric `hp`
    is exact, also with `hp-string` beside it. Only `hp-string` is band.
    A message with neither leaves it. A null number is not exact. The
    merged values cannot tell this, so `CharModel` keeps it as state of
    its own and counts a flip as a change.
11. Excluded state folding (ADR 0019) keeps it: after the merged
    `Char.Vitals` the block has one word-only record with the bars that
    ended as band though a number is in the merged one. The fold's check
    compares the state. Replays shared before this stay as folded: a bar
    that ended a cut as band shows as exact there until its next update.
12. Spell effort and `carrying` words that are not in the lists are kept
    as sent, `carrying` without a step.

Race and age:

13. A factor needs a known kind. An Elf, and also a Man, of unknown or no
    kind has none. A bare "Black" draws the Númenórean passenger but
    gives no factor.
14. The brackets are help's printed years, not a product. The age is
    fractional (12 months of 30 days) for the modifiers and the track, as
    help calls the change linear and gradual. The brackets are whole
    years, so the age shown is the same either way. Below the 1st bracket
    and from the 7th on nothing changes. Values are rounded only where
    shown.
15. The birthday counts a started month whole ("in 5 months" from 7
    months 7 days), and is "today" at 0 and 0.

The answer's reader (`src/gmcp/info-answer.ts`):

16. The field list lives there only, and part C builds the format from
    it. The text is split at `|` alone, so ` | ` and a bare `|` both read.
17. A wrong field count is no answer. An unreadable or empty field is
    null and the others are kept. `%G` is one field: all seven values or
    none.
18. Tolerated beyond the one sample: singular forms, a part left out of
    the height, weight or money, "and" and commas in number words, a
    break after a hyphen, thousands separators (commas), a sign on a
    number. Their wording is inferred. Other shapes are unreadable and
    never guessed, war fame without its number and a purse that names no
    coin included.

## Addendum 2 (2026-11-22): wimpy

19. Wimpy is not in GMCP. The poll gets `%y` and is sent once at login
    also with no tab open (the owner). Part C adds the field and the
    trigger.
20. Between polls it follows the two text lines. A mood that becomes
    berserk sets it to 0 in `CharModel`, since MUME does so without a
    line (`help mood`, not seen live). In a shared run a berserk inside
    an excluded range can make the fold keep that segment's records: its
    check sees the difference, and nothing replays wrong.

## Addendum 3 (2026-11-22): part C's design

The point 5 mark is replaced by something stronger:

21. The answer is taken out between the line assembler and the bus, so no
    listener sees it: not the display, the recorder, the user's actions,
    the scripts or the map. The command is written with a send of the
    session that emits no `cmd.sent`. There is then no flag for each
    listener to honour.
22. When hiding ends without an end sentinel (2 s, a prompt, a line limit,
    a disconnect) the held lines are put back in order. Hiding can thus
    delay game text and cannot lose it. Two such failures on one
    connection stop the polling until the next connection.

When it is safe to send:

23. A command sent into MUME's pager or line editor is read by them, so a
    poll could end up in a note the player writes. The poll is sent only
    when the last thing MUME printed is a game prompt (XML `prompt`) and
    the player has sent nothing since it. Otherwise it waits for such a
    prompt. The login poll follows the same rule, after `Char.Vitals`.
    Without XML there is no such mark, so no poll.
24. Never in a replay, the log player or a watched run, in password mode,
    while fighting, or with the setting off. Off means no hidden command
    at all, the login poll included.
25. A poll never answered does not block for ever: after 2 minutes
    another may be sent. Its sentinel is still recognised and hidden if
    it comes later.

## Addendum 4 (2026-11-22): part C as built

26. Point 23 is stricter. Also 2 s of quiet after the last command sent:
    MUME answers queued commands a pulse each, so the first one's prompt
    does not say that a `write` behind it has been read. A command sent
    while a frame is read counts as later than that whole frame. This
    narrows the hole and does not close it (a command held longer than
    2 s, behind a cast). The login poll thus goes some 2 s after the
    width commands.
27. A game prompt is an XML prompt that begins its line, has nothing after
    it and is not the pager. Only such a line is hidden as the answer's
    prompt. That the line editor's prompt is not one is **assumed until
    the live check**.
28. `Char.Vitals` is required before every poll. The idle rule covers the
    login poll too, and entering the game counts as activity. An answer
    to an earlier character's poll is hidden and not applied.
29. An answer with both sentinels that cannot be read is a failure (put
    back, counted). A poll never answered is none. At most 80 lines are
    held and 8 unanswered sentinels known.
30. `character.fetchInfo` is additive, with no settings version. An older
    client that saves synced settings drops it, and it returns to on.
31. The Gear on Character makes its title follow ADR 0123's hood rule: in
    a 33-cell lane it moves 7 px left of centre. At the new player's
    width it stays centred.

## Addendum 5 (2026-11-22): the line editor

32. Point 27's assumption was **wrong**: the live test sent a poll into
    the line editor (`write test`, its `: ` prompt). The XML tag is not
    enough. A game prompt must also end with `>`: MUME's prompts do
    (`change prompt` switches fields and has no free text; every prompt
    looked at in the owner's logs does). This is a list of what is
    allowed, so an unknown input state (a question, a menu) gets no poll.
    The editor's `==>` marker is not one either. A prompt that does not
    end so, by the twiddlers say, costs a later poll and nothing else.
    A partial is still held back by the tag alone, as it has no end yet.
33. What remains of point 26's hole: an editor command that waits in
    MUME's queue more than 2 s (behind a cast) while a game prompt is
    shown. A poll sent then lands behind it.

## Addendum 6 (2026-11-22): part D's design

The owner: a switch for the poll also on the phone's settings page, and
the moved title (point 31) is fine.

What part C's live test means for the card:

34. The repeated poll (every 5 minutes) waits for 10 s of quiet after the
    last command, not 2 s. It is in no hurry, and this covers a command
    held behind a cast (point 33). Opening a tab and the login poll keep
    the 2 s: there the player waits for the value.
35. A click on the card sends nothing while MUME reads input of its own:
    the last thing printed is a prompt and not a game prompt (the line
    editor, the pager, a question), or in password mode. The line editor
    would take `change mood brave` as text. Otherwise a click needs no
    gate: it is the player's command and may queue.
36. A click sends nothing in a replay, the log player, a watched run or
    out of the game. A pending element takes no second click.
37. No click where the next value is not known: an unknown word, a
    berserk mood, a position other than standing, resting, sitting and
    sleeping.

The card:

38. The height mode is chosen from the content box in pixels, not from
    the tab, so a tab change moves nothing in the left column or the
    vitals. The default layout and the pane's heights are not changed.
    Status never scrolls; Stats and Lore scroll inside the right area
    when they do not fit.
39. Portraits are part E. Part D draws the round frame with one neutral
    figure.

## Addendum 7 (2026-11-22): part D as built

40. Auto is Large from 400 × 160 px of content, Medium from 210 × 106. A
    lock scales down and may lose the portrait. The portrait also hides
    in Medium with under 30 px for it. The left column is left out only
    in floats of about 110 px and narrower (decision 7's exception).
41. After a fight the tab from before it returns, also when another was
    picked during the fight (decision 13).
42. Point 35 reads the last prompt and not the last line: text arriving in
    the editor does not reopen clicks. Without XML the prompt's text
    decides. A prompt line with game text after it blocks until the next
    prompt, the safe side. Remaining hole, as point 33's: a click in the
    moment between a typed `write` and the editor's first prompt is taken
    as the editor's text.
43. A blocked click shows nothing. In a replay and before the first
    vitals the fields are drawn unclickable. The position takes no click
    in a fight. A press in the pane never takes the focus, so the card's
    text cannot be selected.
44. The card uses the player's font. Status goes to 2 × 2 before it loses
    its words. Stats and Lore give a row's height to the data's age.
    Alignment wraps. Band bars take the low and critical colours by the
    band's middle, as Group. The bars have no transition (about three
    times the style cost of each prompt in Firefox).
45. Nothing to press lies under the pane's close cross or the phone's
    resize grip: the tabs begin below the one and beside the other.

## Addendum 8 (2026-11-22): the owner's look at part D

46. Stats and Lore scroll at the default height ("Scroll känns rätt"):
    the default pane is not made taller. The look's details are still
    open (stage 77 part H).

## Addendum 9 (2026-11-22): Character on a phone

47. The owner, after trying the card on a phone: Character is on and the
    strip's first page by default, so the panes key opens on it. It
    reverses stage 52's "Character off" (ADR 0137). A new phone starts so.
    A stored phone gets it once (`phone.defaults` mark 2,
    `src/phone/phone-defaults.ts`), only where the strip is still in the
    old default order (Timers, Group, Character, Statistics); an order the
    player made is kept, and switching Character off later is never
    undone. A tablet with no mark keeps the desktop cockpit's settings as
    ADR 0140 says; a marked one follows. The strip still opens on the page
    it last had, until the app is loaded again.

## Addendum 10 (2026-11-22): part E, portraits

48. **One classifier.** `raceKind(race, subrace)` in `src/gmcp/race.ts`
    (words and stems over both fields, as before) gives numenorean,
    halfelf, elf, dwarf, hobbit, troll, beorning, orc, human or none.
    `passengerOf` now maps that kind to a passenger. Its results and
    tests are unchanged: half-elves fly the elf, Beornings the human,
    and only an orc with a "zaug…" word is the orc.
49. **Portraits.** `portraitOf` is the kind, or `neutral` for none. Orcs
    share one portrait (Tarkhnarb and Zaugurz). The mockup's nine figures
    are data in `src/panes/portrait-figures.ts`. They keep their own
    fills and have a transparent background. The neutral figure moved
    there and keeps the pane's colours. All are built with
    createElementNS in the neutral figure's 60 × 75 box and placement
    (`.wc-cc-fig`: top 5 %, where round 9 had 8 %). The figure is built
    only when the race text changes and the id with it, never per
    render. The figures are bundled with the card, about 7 kB raw.
50. **Raster.** `public/portraits/<id>.webp` (the README holds the
    contract: 1024 × 1024, transparent, the inscribed circle shown, head
    centre about (512, 480)). `import.meta.glob` over the webp keys only
    tells the build which files exist. The built app holds only an
    object of keys, and the images are copied as public files and never
    bundled (checked with a test file). An `<img>` (async decoding, empty
    alt, not draggable) is added hidden. It replaces the SVG when it has
    loaded, so a failed load keeps the placeholder. A race without its
    file keeps its own placeholder and never shows `neutral.webp`.
51. **Replays.** The replay runtime (`__WC_REPLAY__`, the same flag
    `map.ts` reads) has an empty file set, so the exported HTML file and
    the share frame (`img-src data: blob:`) draw placeholders only and
    request nothing. The glob is dead code there.
52. **Dev only:** `?portrait=<id or race words>` forces a portrait (the
    test guide's way to see all nine). It is read once, under
    `import.meta.env.DEV`.

## Addendum 11 (2026-11-22): portraits per subrace

The owner asked for a portrait of its own for every subrace: crude SVG
placeholders now, and the owner's WebP images later.

53. **Two levels, two classifiers.** `raceKind` again gives one kind per
    race: numenorean, halfelf, elf, dwarf, hobbit, troll, beorning, orc,
    human or none. The `zaugurz` kind of commit 785098c6 is gone, and the
    Zaugurz is a subrace. An orc house word (`tarkh…`, `morru…`,
    `zaug…`) also makes the race an orc when no "orc" is sent, so a lone
    "Zaugurz" still counts as an orc. `subraceKind(race, subrace)`
    (`src/gmcp/race.ts`) uses the same `raceWords` stems and is read only
    within the race kind: dunadan, eriadorian and rohirrim (Man); noldo,
    sinda and silvan (Elf); fallohide, harfoot and stoor (Hobbit);
    longbeard, firebeard and broadbeam (Dwarf); tarkhnarb, morruhk and
    zaugurz (Orc); cavetroll, hilltroll and mountaintroll (Troll). A word
    without its race counts for nothing ("Cave" alone, or a "Noldorin"
    dwarf). Half-elves, Beornings and Black Númenóreans have no
    subraces. `passengerOf` reads `subraceKind` for the Zaugurz, and its
    results and tests are unchanged.
54. **Lookup.** `portraitOf` is the subrace's id, else the race's (the
    ten figures of addendum 10, now the fallbacks), else `neutral`. There
    are 28 ids: 9 races, 18 subraces and neutral. The Tarkhnarb shares
    the generic orc's shape data. A unit test asserts that every other
    pair of figures differs. The 16 new figures (and the Zaugurz's added
    snow-fur collar) differ mainly by colour and silhouette: hair, beard,
    hood and one feature each. They were checked on a contact sheet at
    Large and Medium.
55. **Raster.** For a subrace, `<subrace>.webp` is used, else its race's
    `<race>.webp`, else the subrace's own SVG placeholder: a real image
    beats a placeholder. `neutral.webp` is still the neutral figure's
    only. The glob keys and the replays work as before.
56. **Dev only:** `?portrait=` takes any of the 28 ids or race words
    (`Cave Troll` gives cavetroll).

## Addendum 12 (2026-11-23): the portrait pass

The night pass of `notes/research/portraits/brief.md`: the crude
placeholders give way to drawn portraits in the balloon dwarf's tinted
engraving (stage 75), one per id and sex. The main session judged every
step (the owner asleep); the style guide is
`notes/research/portraits/style.md`.

57. **The drawings.** 28 ids, each a man and a woman, and one sexless
    neutral figure: 55 drawings. Each race has a base figure (also the
    fallback); its subraces are that figure with their own marks
    exaggerated. A drawing is a pure function (`src/panes/portraits/
    types.ts` `Draw`) that returns one standalone SVG string in a 200
    square, of which the frame shows the inscribed disc, as a raster
    file does. It is drawn for one of two sizes: `large` (from 72 CSS px
    across) and `medium` (thicker lines, hatching as flat tone, no fine
    strokes). Still images only: no animation, no transitions, no CSS.
58. **The kit.** The engraving filter, hatching and colour helpers moved
    out of the balloon rig into `src/art/engrave.ts`, which the rig and
    the portraits share. The portraits' own shared parts (the frame, the
    living eye, brows, strands, the soft pen for skin) are
    `src/panes/portraits/parts.ts`.
59. **Sex.** `setPortrait(id, sex)` and `portraitImage(id, sex)` take
    `male | female`. The card passes `male` until the client can tell a
    character's sex (`PORTRAIT_SEX`; the dev server's `?sex=female`
    shows the women). The disc carries `data-portrait`, `data-sex` and
    `data-art` (`drawn` or `raster` once an image shows).
60. **Raster names.** `public/portraits/<id>-male.webp` and
    `<id>-female.webp`, and the one `neutral.webp`. The lookup is the
    subrace's file of that sex, else its race's of that sex, else the
    drawing. Never the other sex's file: both are drawn. A file that
    fails to load falls back to the drawing.
61. **Cost: baked once.** The drawings use SVG filters (turbulence and
    displacement), which must not run on the card's repaints. Each is
    baked once: the SVG string as a `data:` image, drawn to a canvas at
    the disc's device pixels and read back as a PNG `data:` URL
    (`src/panes/portraits/bake.ts`). The card then shows a plain
    decoded bitmap, which costs a repaint what any `<img>` costs. A
    `data:` URL is allowed by every CSP the card runs under (the app's,
    the exported replay's, the share frame's `img-src data: blob:`) and
    needs no revoking. The pixel size is rounded up a 1.25 × ladder
    (`bucketPx`), and the card rebakes only to grow, so dragging a pane
    larger bakes a handful of times. A small most-recent cache keeps six
    bakes. Measured headless, one at a time: 5 ms at 80 px, 8–9 ms at 200
    px, about 20 ms (at most 30) at 360 px, in Firefox and Chromium
    alike; building the SVG string is under 0.5 ms.
62. **Loading.** One lazy chunk per people (men, elves, dwarves,
    hobbits, orcs, trolls, dark: the Númenórean and the neutral figure),
    as the balloon passengers. Only the player's race is fetched. A
    shared `parts` chunk goes with any of them. Built sizes: 13–29 kB
    raw and 4–10 kB gzip per chunk, and 8 kB (3 kB gzip) for the parts.
    Until the first image is ready, the old neutral silhouette in the
    pane's colours stands in. After that, a new portrait replaces the old
    one only once it has loaded, so nothing flashes. The old placeholder
    figures are gone. The replays show no Character pane (a shared run's
    panes are Timers, Group and Map, `src/share/shared-panes.ts`), so the
    replay runtime (`__WC_REPLAY__`, one IIFE, which would inline every
    chunk) carries no drawings: `loadDraw` is null there and the build
    drops the chunks (the exported file's runtime 1,917 → 1,754 kB). If a
    replay ever shows Character, the drawings work there as they are: a
    `data:` image is allowed by both replay CSPs.
63. **The stage.** `notes/research/portraits/stage/` holds the mockup
    page (every id in the card's real frame and ring, baked as the app
    bakes), `shot.mjs` (the contact sheets in `../sheets/`:
    `contact.png` and `all-medium.png` for every id, one pair per
    people) and `mockup.mjs` (the standalone
    `notes/research/portraits/mockup.html`). The drawings were made
    there and then moved into `src/panes/portraits/`; the stage's draw
    files now re-export the app's, so there is one source.
64. **Judged, not owner-approved yet.** Decisions the main session took
    for the owner: dwarf and Stoor women beardless (a light chin-braid
    is easy to add); the Rohirrim woman in a gold circlet instead of the
    helm; the Eriadorian woman bareheaded with a linen band (the dotted
    kerchief is the Stoor woman's); the neutral figure a grey-brown wool
    hood with an empty opening.
65. **The Tarkhnarb redrawn (the owner, 2026-11-23).** Orcs and goblins
    are not the same: the goblin is only the Tarkhnarb's balloon
    passenger, the portrait is an orc. It is now the balloon orc's face
    (notched ears, slanting eyes under the heavy brow, the broad flat
    nose, the tusks), not the goblin's bat ears, round night eyes and
    hooked nose. Its house mark, so it reads apart from the iron-capped
    base orc: a hood of black laced leather (a thong down the seam, a
    stitched rolled edge over the brow), a sunless grey skin, pale yellow
    eyes squinting against the light, soot on the brow and cheek; the
    stolen sacking and ragged collar stay. The woman: the same hood, lank
    black hair loose from under it, small tusks.
66. **Approved (the owner, 2026-11-23).** The portrait pass with the
    redrawn Tarkhnarb, and the four choices of item 64, are approved; the
    branch is merged into main. The Firefox `#perf` cost is left for the
    owner to look at later. Next: the player's own sex on the card (the
    stage file, E2).

## Addendum 13 (2026-11-23): part E2, the card's sex

67. **The source.** `help info_format` has no code for the sex and GMCP
    sends none. Only a plain `info` prints it, as its first line: `You
    are a male Tarkhnarb Orc.` (the race text is GMCP's `subrace`).
    Nothing at login prints it.
68. **The owner's choice: one probe per character.** A hidden plain
    `info` is sent once per character, only while its sex is not
    remembered, and never again after that (the owner, 2026-11-23; a
    second exception to "Only Stats and Lore send commands", beside the
    login poll for the wimpy). `info` takes no slot in MUME's queue, so
    it costs the player nothing.
69. **The probe.** Three `info`s, written in the same write as the
    login poll so that MUME answers all four in one pulse:
    `info WC<n>{`, `info`, `info }WC<n>` (`sexProbeCommand`,
    `src/gmcp/info-filter.ts`). The braces keep its sentinels apart from
    the fields poll's `[`/`]`, and it has a nonce of its own. The filter
    holds and hides everything between the sentinels by the fields
    poll's rules (2 s from the start, `MAX_LINES`, a prompt inside fails
    it, a failure shows the held lines unchanged, the blank line and the
    prompt after it). The first sex line inside is read; none is a
    failure. A failed probe counts toward `MAX_FAILURES` like a failed
    poll: the risk is the same, held text shown late. At most one probe
    per character and connection, whatever came of it.
70. **The parser and the memory** (`src/gmcp/sex.ts`).
    `parseSexLine` strips SGR and reads `^You are a (male|female) (.+)\.`.
    `SexMemory` keeps lower-case name → sex in local storage
    (`wc.charSex.v1`, 64 names, the oldest written dropped). It is per
    device and not synced: with an account the probe runs once on each
    device.
71. **The model.** `game.sex` is loaded from the memory at Char.Name, so
    a known character shows the right portrait at once. It resets with
    the character, like `game.info`. An unknown character shows the man
    until the probe answers; `setPortrait` swaps only once the new image
    is ready, so nothing flashes.
72. **The player's own `info`.** A typed plain `info` also sets the sex,
    but only when its race text equals GMCP's race or subrace (case and
    diacritics ignored), so a say or an emote cannot set it. The game
    wins over the memory. In a replay it sets the card but is not
    remembered.
73. **The card.** `PORTRAIT_SEX ?? game.sex ?? 'male'`. The dev server's
    `?sex=male|female` still wins (the test guide's way to see both).
74. **To see live** (the owner's first login with a new character, or
    after clearing `wc.charSex.v1`): that the four answers come in one
    pulse with one prompt; that `{` and `}` come back as sent; a woman's
    exact line; and whether a short page length makes MUME page a plain
    `info` (about 25 lines). A pager fails the hold, so the text shows,
    and the pager would read the last `info }WC<n>` as its input.
75. **Seen live (the owner, 2026-11-23, Gittan).** The probe works on
    the desktop and on a phone upright: the woman came after a short
    delay, at once on the next login, and again after the key was
    removed. A woman's line is `You are a female Fallohide.` (GMCP's
    `subrace` is `Fallohide`). On a phone in landscape MUME paged the
    plain `info`: the filter showed what it held, the pager took the
    probe's last `info }WC<n>` as its input and stayed open.
76. **The probe only in a tall window.** MUME's pager follows the
    window's height (NAWS), so the probe is sent only when `view.size`
    has at least `PROBE_MIN_ROWS` (30) rows; a plain `info` is about 20
    lines. A short window shows the man until a login in a taller one
    or a typed `info` (whose first line is read even when paged).
77. **A failed probe is remembered.** The name gets `unknown` in
    `wc.charSex.v1` (never over a known sex), so it is not probed
    again; a page length set by hand fails it once at most. A probe
    still unanswered at a disconnect is not a failure.
78. **The width commands' `Ok.`** (the owner: "dölj dessa två direkt
    efter inloggning"). Entering the game (not a replay) arms the same
    filter for `PLAYING_COMMANDS.length` lines that are exactly `Ok.`,
    for 5 s (`OK_MS`). Each is hidden like an answer, with its blank
    line and the pulse's prompt when nothing else of the pulse showed.
    Other lines pass. They are gone from the run log too.
79. **The window MUME is told.** In an incognito tab in landscape even
    the fields poll was paged (its answer wraps to 7 lines at that
    width), and the width commands went to the pager of the unread
    messages. A phone and a tablet now report at least 40 rows (ADR 0136
    addendum of 2026-11-23). The poll and the probe read the size MUME is
    told (`session.windowSize`), not the pane's: the probe needs 30 rows,
    and a poll is sent only when about 600 characters wrapped at the
    width, and 4 rows more, fit (`answerFits`); an unknown size allows a
    poll but no probe.
80. **Item 74 seen.** The owner's tests (desktop, phone upright and, with
    the 40 rows, in landscape) answered the probe in one pulse with
    nothing shown: the four answers come together, and `{` and `}` come
    back as sent. A woman's line is item 75's.

## Addendum 14 (2026-11-23): the direction pass, the fight card moves in

The owner's direction pass for Group and Character (stage 77, "Direction
pass"). It decides what goes where. The card's look is chosen from the
round 10 mockups, and a later addendum records it.

81. **The fight card belongs to Character**, at the bottom of the pane.
    You tank: the enemy's HP alone, marked as against you. Someone else
    tanks: the tank's HP and the enemy's. It replaces Group's card (ADR
    0122 addendum of 2026-11-23) and the phone's own card (ADR 0136 §3,
    ADR 0137 "The fight card's place"), so the desktop, the phone and the
    tablet show the same card. `phone.fightCard` goes with it.
82. **No card without Character.** When the Character pane is not on
    screen (closed on the desktop, another strip page or a closed strip
    on a phone), no card is shown anywhere, and nothing switches page or
    opens by itself. The prompt still shows the fight.
83. **Your own statuses go into Character** (sanctuary, poison, blind,
    slept, bashed and the rest of Group's flags, from your own
    `Group.*` entry). This revises decision 10's "no affects" for these
    flags. Timed affects stay in Timers.
84. **Open until round 10:** where the room for the card comes from (the
    owner's idea: smaller bars in a fight), whether the enemy's condition
    word is written, what is left of decision 13's fight mode, and where
    the statuses sit.

## Addendum 15 (2026-11-23): addendum 14 reversed, Timers into Character

After the round 10 mockups the owner reversed addendum 14 the same day:
the fight card does not fit in Character. Group and the phone's own card
stay as they are, and Character gets no fight card. Items 81–84 are void.

The new direction, to be explored in round 11 mockups before anything is
decided on the look (stage 77, "Direction pass"): the left column
becomes the portrait part (the portrait and the level ring only, as
large as the height allows); the Status tab gets a top row of letter
circles for Mood, Casts, Alertness and Weight (a ring segment per step,
green, orange or red by step) and the toggle icons, and under it the
Timers pane's whole content with its own settings in Character's gear;
red swords and a red rim in a fight, each a switch. This revises
decisions 2, 8 and 10 when it is built. The Timers pane stays for now.

## Addendum 16 (2026-11-24): the round 12 look, decided

The owner chose from the round 12 mockups (`round12.html`; stage 77,
"Round 12 decisions"). When part F builds it, it replaces decisions 2
and 3 (the portrait column and the ring), 8 (Status as four big values),
10 (affects now show: buffs, debuffs, herblores, your GMCP flags and
your sanctuary, as small stones at the bottom of the status area), 12's
bigger bars and 13 (the fight mode is only the red swords) of this ADR,
and points 39 and 41 of addendum 7.

85. Square iron portrait, the level ring at its bottom right, the name in
    a glass band inside the frame's top edge; the five icons under it.
86. Status: a row of four cells (Mood, Casts, Alertness, Weight) with a
    one-colour meter that lights only the current step; under it the
    D&D shields OB, DB, PB, ABS, as large as fit; at the bottom the
    stones, left-aligned, as many rows as fit, then `+n`.
87. The shields leave Stats. No purse on Status.
88. The portrait shows no state (resting, asleep, sanctuary).
89. The info poll also runs while Status is shown, under the same rules
    (decision 6, points 33–34). The shields show `⋯` until it answers.
90. Your own GMCP flags come from your `Group.*` entry (`type: "you"`),
    which the group model keeps only for `bashed` today; part F keeps
    the flags too. That MUME sends them for you is to be checked live.

## Addendum 17 (2026-11-24): the info poll, round 2 (decided, not built)

The owner: the card goes stale when the player sees other values (a
typed `stat` or `info`), and 5 minutes is too seldom. Part F builds the
following as settings to try while playing (stage 77, "The info poll,
round 2"):

91. The answer to the player's own `stat`, `info` and similar is read
    and updates the card, with no extra command (measured live first).
92. A typed `change …` (above all `change mood`) triggers a poll.
93. The repeat interval is a setting: 15 s, 30 s, 1, 2 or 5 min.
    Decision 6 (no poll without input in the last 5 minutes) stays.
94. Event triggers, each a switch: equipment commands, and an affect
    starting or ending.

## Addendum 18 (2026-11-24): F1, the poll's triggers and your flags

The owner's choices after the live findings (stage 77, "Part F1: live
findings") and rounds 13–15. This revises points 92–94 and the repeat
rules of points 6, 34 and the 10 s minimum gap. Rounds 14–15 (the purse
in the stones row, the compact card) are part F2's look and get their
own addendum when it is built.

95. **Your flags.** The group model keeps your own entry's status flags
    (`STATUS_FLAGS`, from `type: "you"`), not only `bashed`. MUME sends
    them at login in `Group.Set` and changes in `Group.Update`.
96. **Reading what the player sees.** The answer to a typed `stat`,
    `info`/`inf`, or `info <own format>` updates the card with no extra
    command. `stat` gives OB, DB, PB, armour and the gold coins only
    (silver and copper stay). A format is matched against its literal
    text, and only the codes the card uses are read. A read counts as a
    poll: the repeat waits from it.
97. **The repeat** is a setting: 10 s, 20 s (default), 30 s, 1 min,
    5 min. It runs while the card shows Status, Stats or Lore. Decision
    6 (no poll without a key or click in 5 minutes) stays.
98. **Quiet before a poll:** 3 s after the last command, 10 s after a
    burst (a command sent less than 2 s after the one before it), and no
    poll while a cast is pending. The gate of points 22–25, 32 and 35
    stays: a game prompt with nothing after it and no command since.
    A command held by a delay (a cast, a stun, a door) prints no prompt
    until MUME runs it, so the gate stays shut. A poll that does go
    behind a held command answers late, never wrong: one is outstanding
    at a time and the sentinels mark its answer.
99. **Events**, each a switch in the gear, all on by default:
    - the mood changes (GMCP `Char.Vitals` `mood`; this covers a click,
      `change mood`, `cha mood` and aliases, with no input matching);
    - equipment: MUME's own lines (`You stop using …`, `You wield …`,
      `You awkwardly wield …`, `You wear …`, `You put … on/over/around
      …`, `You fasten … on …`, `You cover …`, `You hold …`; not `You
      light …` and not `You put … in …`), so `wear all` and aliases
      count;
    - any affect the Timers trackers know starting or ending (the
      owner: all of them, not a short list);
    - a herblore started.
100. **One poll for a cluster:** events within 1.5 s give one poll. At
    least 3 s between polls (was 10 s), one outstanding. In a fight the
    poll waits for the fight's end, as before.
101. **Cost:** one anchored test on each game line beginning `You `, and
    the trackers' own start/end events. No matching on input.

## Addendum 19 (2026-11-24): F1 as built

The technical choices made when building addendum 18 (stage 77, "Part
F1: what was built").

102. **Which commands are read.** The first word `stat` (alone), `info`
    or `inf`, any case, after aliases. No other abbreviation: `sta` is
    `stand`, and nothing else is known safe. A replay, a secret and a
    command sent in a replay connection arm nothing.
103. **Tying the answer.** A command arms a reader for 10 s (it can wait
    behind a cast); at most 4 wait. The answer is a paragraph: the lines
    up to an empty line or a prompt, joined with spaces (the wrap), read
    from the line where it starts (`OB: `, `You are a male|female …`), so
    a line from someone else before it does no harm. Each paragraph
    answers at most one reader, in the order sent. This is point 96's
    "what comes before the next game prompt" with MUME's queue in mind: a
    queued command's answer comes after other prompts, and several `info`
    answers share one prompt.
104. **The plain `info`.** Read: level, age, height and weight, the
    senses, the alignment (the sentence after the perception's, never one
    beginning `You are welcome`), the pounds carried and the load
    sentence, the abilities (`Str:18(16)` is current 18, unaffected 16,
    as part A's table says), OB, DB, PB, armour, wimpy and the purse. Not
    read: the citizen (`You are welcome in Goblin-town.` against `%c`'s
    `GoblinTown`) and the war fame (a sentence against `%K`'s word): the
    card would show another form than the poll's.
105. **A format.** `%%` is `%`, `%.` a space (the line break), `%(`, `%)`
    and `%,` nothing; an unknown code is matched and ignored. A format
    with no code the card uses, or two codes with nothing between them,
    arms nothing. The match is anchored on the whole answer (after any
    lines before it); one unreadable value reads nothing.
106. **A merge.** Only what was read changes; each merge is a new answer
    object (the card compares by identity). `stat`'s gold needs a known
    purse: with none it is not shown. A read moves `game.info.at`, so the
    repeat and an event wait from it (an event is served by data strictly
    newer than it). An opened view still polls while no poll has answered
    (`InfoModel.complete`): a `stat` alone leaves Lore empty.
107. **Events need a shown card.** An event polls only while a view is
    open (the card is shown); with the card hidden, opening it polls when
    the data is older than 30 s, as before.
108. **One poll for what came before it.** A poll sent clears the event
    window, and an answer that arrives after an event's line serves it:
    MUME answers in order, so the answer behind that line has the change.
    An event while a poll is outstanding thus gives no second poll.
109. **The burst** is two commands less than 2 s apart, whoever sent them:
    the login's width commands count, so the first repeat or event after
    a login waits 10 s from it. The quiet is not per command kind.
110. **A pending cast** is any command `parseCast` takes (`c`…`cast` and a
    quoted spell), from its sending, restarted by `You start to
    concentrate...`, and over at a shared failure line, `Nobody here by
    that name.`, an empty Enter, an affect landing or refreshed, or 8 s
    (`CAST_PENDING_MS`) with no end seen (a spell with no affect on you,
    say). The cast queue for blindness and charm is unchanged.
111. **The trackers' events.** `TrackerHost.effect` (optional): the
    affects tracker on a start, a refresh, a drop and an expiry it
    announces; the herblore tracker when one is added (not its phases).
    Restores and the `stat`/`info` reconcile are silent. A refresh polls
    nothing (no change), but ends a pending cast.
112. **Equipment lines.** `isEquipmentLine`: a lookup on the second word,
    then one anchored regex: `stop using`, `wield`, `awkwardly wield`,
    `wear`, `put … on|over|around …` with no ` in `/` into ` before it,
    `fasten … on …`, `cover`, `hold`. `You remove …` (seen for a sheathed
    weapon and keys) is not one: the remove of a worn thing is `You stop
    using …`.
113. **Settings.** `character.pollEvery` (seconds: 10, 20, 30, 60, 300)
    and `character.pollOn` (`mood`, `equipment`, `affects`, `herblore`),
    additive like `fetchInfo` (point 30). On a phone they are a sub-page,
    "Character fetching", from the Panes group, beside the poll switch.

## Addendum 20 (2026-11-24): F1b, quicker, and the position

After the owner's live test of F1 (all of its test guide worked): it is
to feel as responsive as possible. This replaces the numbers of points
97, 98 and 100, of point 34's 2 s, and of points 109 and 113 where they
differ.

114. **The timings.** The quiet after a lone command (the repeat and the
    events) is 1 s (was 3 s). The login poll and an opened view also wait
    1 s (was 2 s): the gate already needs a game prompt after the last
    command, so the quiet only covers a prompt that was on its way when
    the command went, which 1 s far exceeds. Events within 0.5 s are one
    poll (was 1.5 s); at least 2 s between polls (was 3 s). The burst
    (2 s, then 10 s of quiet) and no poll while a cast is pending are
    unchanged.
115. **The repeat** offers 10 s, 30 s, 1 min and 5 min; 10 s is the
    default. A stored value not in the list (20 s, F1's default) loads as
    the default, 10 s.
116. **The position** is the fifth event, a switch on by default
    (`character.pollOn.position`, "Position changes"): your `position`
    changing in GMCP `Char.Vitals` (seen: `standing`, `sitting`,
    `sleeping`; sitting and sleeping change the bonuses, the owner). It
    takes the mood's path: the first value seen is no event, and it is
    coalesced like the others.
117. **The gear fits.** The Character gear's rows wrap: a control that
    does not fit beside its label goes under it, at the right. The
    owner's sideways scroll came from a short window, whose vertical
    scroll bar left the repeat's five segments too little room.

## Addendum 21 (2026-11-24): F1c, the burst

The owner's live test of F1b: the shields did not follow every position
change, and a MUME alias for the mood seemed not to update them. Replayed
with the session's commands and timings through the real session, filter
and poll (unit tests `info-poll` and `info-poll-app`, "the owner's live
session"):

118. **A burst** is a command sent less than `BURST_MS` (2 s) after the one
    before it **with no game prompt between them**: MUME had not answered
    the first. Point 98's burst was the time alone, so normal typing (each
    command answered in 0.1–0.25 s, the next 0.2–2 s later: `r` 1.9 s after
    `sit`, `st` 0.18 s after `wa`) waited 10 s, and the next command
    started it again: five of the session's lasting positions were never
    fetched before the next command. What point 98 guards is kept: a
    command held behind a delay (a cast, a stun, a door) prints no prompt
    until MUME runs it, so the next command within 2 s is still a burst,
    and a `write` behind it still waits 10 s. A prompt in the frame a
    command was sent in does not answer it (the frame was printed before
    MUME saw the command). Any game prompt counts, the hidden poll's too.
119. **The alias.** MUME's echo `[cha mood wimpy]`, `Ok.`, the GMCP mood and
    the prompt poll 1 s after the command, as a typed `cha mood` does,
    also when the alias follows a repeat poll at once (the answer comes
    first, so it does not serve the event). Nothing in the client treats
    the echo line otherwise. Not reproduced: the session's aliases were
    each answered and more than 2 s apart; the likeliest cause of what the
    owner saw is point 118 (an alias typed within 2 s of another command
    waited 10 s).

## Addendum 22 (2026-11-24): the rounds 13–15 look, decided (for F2)

The owner's decisions after rounds 13–15 (stage 77, "Round 13 feedback →
round 14" and the answers after it). They add to addendum 16 (round 12)
and are what F2 builds. The numbers are the mockups' (`round14.html`,
`round15.html`, functions `solve`, `stonesFit`, `purseFit`, `compact`,
`cutV`); they are starting values, to be checked in the real pane.

120. **The stones** sit at the bottom of the status area, left-aligned,
     the herblore `+` first. More rows while the shields stay at least
     30 px; then `+n` (a click lists the rest; the most urgent stay:
     ending soon, flags, debuffs, herblores, buffs).
121. **The purse** comes back, right-aligned in the stones' last row, in
     the room the stones leave: gold, silver and copper, then gold and
     silver, then gold only, then none. The stones always win; the purse
     never gets a row of its own. The tooltip gives the whole purse.
     Purse stays in Lore.
122. **Stats** shows the same stones row at the bottom, with as many rows
     as Status (no jump on a tab switch), never the purse.
123. **Lore:** War fame (the word) and War points (the number) get a box
     each (`info %K`, `warlord (19)`).
124. **Low panes, with the portrait:** the first step that fits: 0 whole;
     1 the stones on one row and the shields down to 22 px (no icon under
     30 px); 2 the status cells on one line (label beside the value when
     the cell is at least 64 px, else the value only); 3 the shields as
     small chips (shape, label, value); 4 the status values without
     cells, stones 11 px. The portrait stays while it is at least 44 px.
     The vitals bars are 14 px under a 150 px pane, 12 px under 110 px,
     10 px under 90 px.
125. **The tabs** show only when the content is at least 80 px high. Below
     that only Status; to reach Stats or Lore the player drags the pane
     taller (the owner: no other way).
126. **The compact card**, when the portrait would be under 44 px: no
     portrait, no level ring, no name, no tabs; the full width.
     - Line 1: Mood, Casts, Alertness, Weight on the left 55 %, the
       shields on the right as icon + value (the label in the tooltip).
       The status cells have no step meter; the letter (M, C, A, W) is
       in the shields' icon colour (`--lamp`), then the value: the whole
       word when it fits, else a hand-made short form of at most four
       characters (wimpy `wmpy`, prudent `prud`, normal `norm`, brave
       `brav`, aggressive `aggr`, berserk `bsrk`; quick `qck`, careful
       `care`, thorough `thor`; attentive `attn`, vigilant `vigl`,
       paranoid `para`; peanuts `pnts`, uncomfortable `unc` / `uncomf`,
       heavy `hvy`, really heavy `rhvy` / `r.hvy` / `r.heavy`, painful
       `pain`, torture `trtr`). The tooltip gives the whole word.
     - Line 2: the five icons (sneak, ride, climb, swim, position) first
       (the owner: they stay), then the stones (more rows if they fit),
       the purse right-aligned.
     - Cells 18 px while line 1 + line 2 fit, else flat 13 px rows and
       10 px stones. It fits down to about a 72 px pane.
127. **Open:** the owner has not confirmed `trtr`, `pnts` and `vigl`.
     Medium's Stats is cramped with the stones row (labels overlap): H.

## Addendum 23 (2026-11-24): F2a as built

The stones' data, no change to the card's look (stage 77, "Part F2a: what
was built"). `src/panes/character-stones.ts`, pure.

128. **What is a stone.** The Timers' Buffs, Debuffs and Herblores cells,
     your own sanctuary (the Sanctuary cell with no `target`; a member's
     is never one) and your GMCP flags poison, blind, snared, wound,
     hungry and thirsty (`selfFlags`; not slept, bashed or waiting). With
     no sanctuary cell of yours, the GMCP `sanctuary` flag alone is an
     untimed stone (`flag:sanctuary`). A flag whose twin affect is in
     Debuffs (blind → blindness, hungry → hunger, thirsty → thirst) is
     one stone, the affect's (it may have a time); with Debuffs switched
     off the flag shows. Spells, Stored, Blinds and Charmies are not
     stones.
129. **The order.** Herblores, buffs, debuffs, your sanctuary, the flags;
     within each, timed by expiry (soonest first), then no end, then
     untimed, name as tie-break. The order needs no clock, so the list is
     rebuilt only after a Timers or a group change (or the switches), and
     a tick reads only each stone's `stoneTime` (fill, countdown, ending
     soon). Ending soon is the Timers' `timers.warnAt` (20 s by default,
     the mockups' 20 s).
130. **Icons and colour.** The Timers pane's: a herblore's leaf, in a
     debuff phase the debuff arrow; buff and debuff arrows; the sanctuary
     figure; a flag its Group icon (`STATUS_ICON`). The tone is the Timers
     group's colour key; flags take the debuffs' (the mockups).
131. **The `+n`** (point 120): rank ending soon 0, flags and your
     sanctuary 1, debuffs 2, herblores 3, buffs 4; then time left
     (untimed last), then the display order. What stays and what goes
     into `+n` are both listed in the display order. `stoneRows` is the
     mockups' `stonesFit` with the sizes as inputs (width, stone size,
     gap, bar, rows allowed): the `+` first when herblores can be started,
     at least two places a row, `+n` takes the last place, and the width
     the last row leaves is the purse's room.
132. **The herblore `+` and ×** follow the Timers pane: none in a log
     player (`ctx.player`); the `+` needs the Herblores switch on. The
     Timers pane's own group switches do not hide stones: the card has
     its own.
133. **The purse** (point 121): `purseFit` gives 3, 2, 1 or 0 coins for
     the free width and `PurseMetrics` (coin, digit width, gaps, the
     margin to the stones), `purseMetrics(size)` the mockups' numbers. No
     known purse: 0. `purseTip` gives the whole purse.
134. **The short forms** (point 126): `shortForm(word, n)` — the whole word
     when it fits, `r.heavy`/`r.hvy` and `uncomf` when there is room for
     them, the four-character table (with `fast` itself), else the start
     of the form. It covers every word of `MOOD_STEPS`,
     `SPELL_EFFORT_STEPS`, `ALERTNESS_STEPS` and `CARRYING_STEPS` (a unit
     test). The mockups' one- and two-letter codes are not used.
135. **The setting** `character.stones` (`buffs`, `debuffs`, `herblores`,
     `flags`, `sanctuary`, all on), additive like `pollOn`. A "Stones"
     section in the Character gear; on a phone a "Stones" group on the
     Panes group's sub-page, which is now called "Character" (was
     "Character fetching").
136. **The pane** reads the list as `CharacterPane.stones` (rebuilt when
     read after a change); nothing is drawn and no timer runs for it
     until F2b. War fame and War points already have `loreView`'s
     `warFame`/`warPoints`.

## Addendum 24 (2026-11-24): F2b as built

The round 12–14 look at normal pane sizes (stage 77, "Part F2b: what was
built"), the mockups' step 0. The low panes' steps 1–4 and the compact
card are F2c.

137. **The portrait** (point 85) is the mockups' `attempt`, pure in
     `character-layout.ts` `leftLayout`: its side follows the room the
     mode's least status width leaves (Medium 150, Large 250, × the
     scale), at most 150; the ring is 0.3 of it (20–34), 0.72 of it on
     the frame; the iron 2–3 px, the corners 0.11, the name band 0.15
     (12–19) inside the top edge. The image inside the iron is what is
     baked. Under `PORTRAIT_MIN` (44 px) part D's ring column or row
     stays until F2c's compact card. Nothing on it shows a state.
138. **The status cells** (point 86): four in a row, else two, the value
     at the mode's size (Medium 9.5, Large 11.5, × the scale) and at
     least four characters (`fitWord`: `agg.`, `nor…`); `Alert.` where
     `ALERTNESS` does not fit. The meter has one lamp per step of the
     field (`StatusFieldView.steps`, `step`). Part D's forms (full, text,
     inline, value) fill the area only where the cells do not fit, and
     then nothing else shows.
139. **The area** (`areaLayout`, the mockups' `solve` step 0): the stone
     count and the `+` are in `CardBox`, so the layout is recomputed when
     they change, never per tick. The stones get the rows they need while
     the shields stay at least `SHIELD_MIN` (30), else fewer; the shields'
     cap grows in a tall pane (0.3 of the area's height, 54 or 64 up to
     72, the mockups' `shMax`). Below step 0: one row and the shields as
     they come, none under 16 px, no stones where a row does not fit. A
     row is always kept while it fits, empty or not: the purse may stand
     in it, and the first stone moves nothing. Stats' room is the area
     less the stones; Lore has none. F2c's steps go in `areaLayout`.
140. **The stones' DOM** is a pool that only grows, each placed by a
     transform. Which stay beside the `+n` is read at each render
     (ending soon moves a stone up); the slots are rewritten only when the
     entries change. A tick writes each bar's `scaleX` in half-percent
     steps and the ending-soon mark, nothing else. The card has one timer:
     the next wall-clock second while a shown stone counts down, merged
     with the pending mark's and the data age's. The colours are the
     Timers groups' (`timerGroupColor`), as CSS variables; the tooltips
     are live (read when shown).
141. **The menus.** The herblore menu's popup logic is `PopupMenu`
     (`src/panes/popup-menu.ts`), shared by the Timers pane's `HerbMenu`
     (which the card's `+` opens) and the card's `StoneList` (the `+n`'s
     rows: icon, name, time, a herblore's ×). A tab change, hiding and
     inactivity close them. A herblore stone's × shows on hover, as in
     Timers; none in a log player.
142. **The purse** (point 121): `purseFit` with sizes from the stone's
     (coin 0.92, digits 0.8 in the terminal font). The coins are CSS (a
     rim, a highlight ring), not the mockups' SVG gradients, whose ids
     could clash between two cards in one document; Lore uses the same.
143. **The fight** (round 12 decision 8): `TabState` no longer changes the
     tab; the fight bar height is gone; only the position icon's swords.
144. **The size modes.** Auto and the Height lock keep choosing the mode
     (Large from 400 × 160, Medium from 210 × 106, as before); a mode now
     means its sizes (icons 14/12, stones 13/12, values, the shields' cap,
     the least status width) and its scale's design box. Small has no
     portrait. Stats' dense form starts lower (170/250 × the scale, was
     226/310), as the shields left it.
145. **Deviations from the mockups.** No `backdrop-filter` on the name
     band (its blur would repaint with the card); `nor…` where the mockup
     cut `nor.` (part D's `fitWord`); the stones' tooltips are F2a's
     `stoneTip`; the Status cells keep part D's tooltips.

## Addendum 25 (2026-11-24): F2c as built

The low panes: the portrait steps 1–4, the tabs from 80 px, the vitals'
heights and the compact card (stage 77, "Part F2c: what was built"). It
closes the starting values of points 124–126 with what is used.
`src/panes/character-layout.ts` (pure), `character-dom.ts`, `character.css`.

146. **The measures.** The mockups' pane is the window with 28 px of
     padding (20 above, 8 below) around the content; the real one is the
     card's content box (`CardBox.h`). So a mockup pane of `h` is a real
     box of `h − 28`; the content above the vitals (the mockups' `cwH`) is
     the card's `body`, and the portrait's side is the same in both.
147. **The vitals** (point 124): at most 14 px under a 122 px box, 12 under
     82, 10 under 62 (`barCap`; the mockups' 150, 110 and 90), not scaled;
     above 122 F2b's bars. The bars' words follow as before (`footLayout`).
148. **The tabs** (point 125) show where `body` is at least `TAB_MIN` (80 px,
     not scaled). Below that the area takes their room and Status shows;
     `TabState` keeps the chosen tab (`choice`) and shows it again when the
     pane is tall (`setLow`); the open menus close. No other way to them.
     Their words stand vertically down to 5.4 px (5.5 px at 80 px of
     content); the `stacked` form (the words across, about 40 px wide) is
     gone, as its width took a low portrait's room (a taller pane lost its
     portrait). The tabs' `row` form and the tabs beside the bars are gone
     with them (no tabs that low).
149. **The steps** (point 124, `areaLayout`), the first that fits, the
     portrait while it is at least `PORTRAIT_MIN` (44 px): 0 as F2b (the
     rows the stones need while the shields stay 30 px); 1 one row, the
     shields down to `SHIELD_LOW` (22 px; the icon only from 30 px); 2 the
     cells on one line (`value + 8.5 × k` high, the meter kept, the label
     beside the value where a cell is at least 64 × k px and four
     characters stay, the long label, else the short); 3 the shields as
     chips 15 × k high, 4 × k gaps, the rows sharing what is left
     (`space-evenly`); the chips' form by their width: shape, label and
     value, else label and value, else the value; 4 the values without
     cells (`value + 4.5 × k`, at least 7 px), the chips, stones of 11 × k,
     2 × k gaps; where not even that fits its stones go, then its chips.
     Status' forms are now `cells`, `line`, `plain` and `compact`.
150. **The compact card** (point 126, `compactLayout`) where the portrait
     would be under 44 px: no portrait, ring, name; the full width. Sized
     by the font alone (`px / 15`, 0.8–1.8), as the box's limit is its low
     form. Line 1 18 px, line 2 after 3 px, the mode's stones, the value
     at most 10 px, while both lines fit; else flat 13 px rows (no cell
     ground, thin dividers), 2 px, 10 px stones, 9 px values; where not
     even that fits line 2 goes, and line 1 takes the height there is. The
     two lines stand in the middle of the area.
     - Line 1: the status on 55 % (less 8 px between), wider where the
       letter and four characters need it at 0.8 of the size and the
       shields still fit, else where three do, else the shields go and the
       status takes the line. The value is `shortForm` (F2a) in the
       characters there are, four a little smaller rather than three; none
       where not even one fits (the letter stays). The letter in `--lamp`.
       The shields as icon (11/10 px) and value, else the value; the label
       and the whole word in the tooltips; `⋯` until the poll.
     - Line 2: the five icons (the mode's size, at most 60 % of the width)
       with their clicks, 6 px, then the stones in the rows that fit (at
       least one, at least two places), `+n`, the herblore `+`, the purse
       in the last row. Where two stones do not fit beside the icons the
       icons get smaller, else they stand alone.
     - The icons' row is moved into the stones' box (reparented only on a
       layout change); Weight stays a `div` (no click).
151. **Small** (Auto below Medium's box) has no forms of its own any more:
     it tries the portrait (Medium's sizes, its own scale box), so it is
     mostly the compact card; a wide pane about 95–105 px high gets steps
     2–3. Part D's ring column and row and its Status forms (`full`,
     `text`, `inline`, `value`) are removed.
152. **The locks** (point 144) keep picking the mode, which means its sizes;
     the steps and the compact card follow the box as in Auto. A low box
     scales the chrome down only to `LOW_SCALE` (0.85; before, a lock in a
     low pane went to 0.6 and 5.7 px values); no normal size changes
     (Medium from 106 px gives 0.855). The margin over the area grows in
     between 86 and 94 px (it was 3 px at once from 90, which made a low
     portrait come and go).
153. **A narrow pane** (the portrait has no width, at any height) is the
     compact card too, and keeps the tabs where the content is 80 px: a
     taller pane would not bring the portrait, so point 126's "no tabs" is
     read as "no tabs in a low pane".
154. **The phone**: the same rules. The strip can be one row high
     (`phone.stripRows`), so a low strip steps down and becomes the
     compact card; the landscape column is tall.
155. **When.** The layout is recomputed only when the box or the stone
     count changes (the `layout` key, F2b), never per tick; the compact
     values' key includes the form.
156. **Deviations from round 15.** The portrait's own height (44 px, the
     ring's overhang and the icons: about 68 px of content) leaves room for
     step 3, so step 4 shows only where the one-line cells do not fit
     sideways (a narrow locked pane, a large font), and with the default
     font's 18 px rows steps 1–3 fall between two row counts (a Height
     lock or another font size shows them). The steps' cells keep F2b's
     `fitWord` (`agg.`, `nor…`); the hand-made short forms are the compact
     card's. Four characters a little smaller instead of three (the
     mockup's 0.6 advance gave four; Chrome's hinting rounds wider).
157. **Open.** Medium's scale at its least box (106 px: 0.855, F2b's design
     box) is smaller than Small's just below it (up to 1.1), so the words
     get a little smaller as a pane grows past 106 px. Point 127's `trtr`,
     `pnts` and `vigl` are still unconfirmed.

## Addendum 26 (2026-11-24): G7b, the herblore × on touch

Found by the G7 e2e (stage 77 part G): on touch the first tap on a
herblore stone stopped the herblore. The tap gave the stone `:hover`,
which showed the × (`display: grid` only on hover), and the tap's click
then landed on the ×. Decided by the owner: on touch the first tap shows
the × and stops nothing, a tap on the × stops the herblore, and an
untapped × goes by itself (3 s, the main session's pick). The mouse is
unchanged.

158. **Touch or mouse** is the pointer's type (`pointerType`), not the
     phone layout, so a touch-screen laptop's tap is a tap and its mouse
     is a mouse. The stones box records the type on `pointerover` and
     `pointerdown` (a tap fires both before its click) and marks the box
     `data-touch` for anything but `mouse` (a pen counts as touch). The
     click reads the recorded type, else its own `pointerType`; a click
     with neither (the keyboard, a script) is the mouse's path.
159. **The ×'s CSS.** The hover rule holds only while the box has no
     `data-touch`; an armed stone (`data-armed`) shows its × whatever the
     hover. A mouse's `pointerover` takes `data-touch` away again, so a
     touch-screen laptop goes back to hover as soon as the mouse moves in.
160. **The taps.** A touch click on a herblore stone (one whose × is
     shown for it, so never in a log player) arms it if it is not armed,
     wherever on the stone it lands (on the × too: hover may have drawn it
     a moment earlier); on an armed stone it stops the herblore. A touch
     click elsewhere in the stones box (another stone, the `+`, the `+n`)
     disarms and then does its own thing. A tap outside the stones leaves
     the × to its 3 s (kept simple). The `+n` list's rows need nothing:
     their × is a button that is always shown.
161. **The cost** (point 140). The armed stone is the pane's
     `{ id, until }`, `ARMED_MS` (3000) after the tap. `until` joins the
     card's one timer's wake (with the pending mark, the data age and the
     countdown second); no timer of its own. The slots' `data-armed` is
     written by `setArmed(id)` only when the armed id or the slots changed
     (`changed('armed')` or a `set` that wrote), never by the tick. A
     stone that is no longer shown (stopped, gone, moved behind the `+n`)
     takes the arming with it; a stop, `blank` and the expiry clear it.
162. **The Timers pane's own herblore ×** has the same problem on touch,
     by another path: the × (`visibility: hidden` until the row's
     `:hover`) is taken on `mousedown`, and a tap where the × stands stops
     the herblore at once (checked with a Pixel 7 tap in Playwright). A
     tap elsewhere on the row only shows it. Not changed here (other code,
     other CSS); left for a decision.

## Addendum 27 (2026-11-24): G7c, the Timers pane's × on touch

Decided by the owner after G7b (point 162): the Timers pane's herblore ×
and charm × work as the card's stones do on touch. The first tap on such
a row shows its × and removes nothing, a tap on the shown × removes, an
untapped × goes after 3 s. The mouse is unchanged.

163. **Touch or mouse** as in point 158: the pane's root records the
     pointer's type on `pointerover` and `pointerdown` and is marked
     `data-touch` for anything but `mouse` (a pen is touch). A device
     without hover (`(hover: none)`) starts marked, so a phone hides the
     charm × before its first tap; the pointer corrects it from then on.
     `ARMED_MS` (3000) and `isTouchType` live in `src/panes/dom.ts`,
     shared with the card.
164. **The press stays on `mousedown`** (ADR 0017: the pane keeps the
     focus in the input). A tap's emulated `mousedown` follows its
     `pointerdown`, so it reads the recorded type and clears it; a
     `mousedown` with none (a script) takes the mouse's path. On touch, a
     press anywhere on a row with an × (on the × too: the tap's :hover
     may have drawn it) arms the row if it is not armed and removes if it
     is (`removeHerb` / `dropCharm`, as the × did). A touch press elsewhere
     in the pane disarms, then does its own thing (the `+`); the
     indicator row's scroll leaves the arming alone.
165. **The CSS.** The herblore hover rule holds only without `data-touch`;
     an armed row (`data-armed`) shows its × in place of its time
     whatever the hover. The charm ×, always shown to a mouse, is
     `visibility: hidden` under `data-touch` (its room kept, so nothing
     moves) and shown on an armed row.
166. **The cost** (ADR 0122). The armed row is the pane's
     `{ id, until }`; no timer of its own: the render drops it at the
     first tick at or after `until`, and the pane's 1 Hz tick is kept
     armed while a row is (a charm counts anyway). So an untapped × goes
     after 3–4 s. `data-armed` is written by the item's update through
     `setAttr` (no write when unchanged). A row that goes (stopped,
     forgotten, its group off), `blank`, inactivity and a log player
     clear the arming.
167. **Log player**: read-only, no × at all, nothing to arm (unchanged).

## Addendum 28 (2026-11-24): part H, the owner's picks

From the H list (stage 77, "H. Polish"). The owner: 1A, 2A, 3A, 4A, 5A,
6B, 7A, and stone icons (8).

168. **Stats and the stones.** Stats shows the stones row only where its
     own content fits above it; else the row goes from Stats (the stones
     are always in Status). Replaces round 14's "Stats shows the stones
     row too" where it does not fit.
169. **One scale.** The modes' scales meet: no smaller words as a pane
     grows past Medium's 106 px (closes point 157).
170. **Tab icons.** Where the tab words would be under a readable size, the
     tabs show icons (Status a shield, Stats a die, Lore a scroll), the
     word in the tooltip and the accessible name.
171. **Short forms everywhere.** The status cells use the compact card's
     hand-made short forms (point 126) instead of `fitWord`'s `…`
     (replaces point 156's "the steps' cells keep `fitWord`"). Point 127's
     forms are kept (7A).
172. **Timers is Spells** (6B). The pane's title, its settings page and the
     phone strip's label say Spells; the pane's id stays `timers` (stored
     layouts, sync, scripts). Herblores, Buffs and Debuffs stay in it,
     off by default: the Character card shows them. The groups' switch is
     display only; the card's stones do not depend on it. Existing
     settings: switched off once (a settings version step) where the
     Character pane is on, so nobody loses them from view; a player who
     turns them on again keeps them on. The main session's pick.
173. **Cells and icons** (5A, 8) are mockups first; their decisions follow.

## Addendum 29 (2026-11-24): part H as built

H1–H4 and H6 of addendum 28 (stage 77, "Part H: what was built"). H5,
H7 (decided, nothing to build) and H8 are not in it.

174. **Stats' stones row (H1, point 168)** is decided in the DOM, not in
     the pure layout: Stats' height follows its text (wrapping, the age
     box's table), which the layout does not model. After a change of the
     layout, the tab or the data (the moments `markMore` already reads the
     scroll box) `CardDom.fitStats` shows the row, and where Stats' scroll
     box then overflows the row goes from Stats (`data-stats-stones="off"`
     on the area) and the scroll box takes its room. The choice holds
     until the next such change, so the age line's ticks do not bring the
     row back. The compact card's line 2 is not dropped: it holds the five
     icons. At the default font Stats keeps the row at 62 × 11, drops it
     at 62 × 7.
175. **One scale (H2, points 157 and 169).** Every mode is drawn for one box,
     170 × 64 (Small's): the scale is the font's (`px / 15`, 0.8–1.8),
     limited by `w / 170` and `max(h / 64, 0.85)` (`cardScale`). So it
     never gets smaller in a larger box, in either direction, and at a
     mode's least box it is what the mode below had. Medium (270 × 124)
     and Large (420 × 164) had their own boxes: Medium from 106 px fell
     from about 1.0 to 0.855, and the same happened at 210 px wide
     (Small → Medium) and at Large's 400 × 160. The modes keep their own
     sizes (values, icons, stones, shields, the portrait's least status
     width). What this costs: a narrow pane no longer shrinks the chrome
     to keep a portrait, so a Medium pane under about 235 px wide (255 at a
     16.6 px font) is the compact card, and a Large lock in a 330 px pane
     is too.
176. **The bars' caps grow in (H2).** `barCap`'s steps (10, 12, 14, then
     34 px) now rise by half a px per px from each threshold (62, 82,
     122), floored to whole px: at 122 px the bars grew by 6 px at once,
     which took a growing pane's content back down a step. Still at most
     14 px under 122, 12 under 82, 10 under 62. Unit tests: the scale is
     non-decreasing over a height sweep (21–300 px) and a width sweep,
     every lock and seven fonts; Medium at 106 px keeps Small's scale at
     105; the steps never go back up as a pane grows (now also across
     Medium's least box).
177. **Tab icons (H3, point 170).** The words stand where they are at least
     `TAB_WORD_MIN` (8 px; they were down to 5.4) and the pane is 120 px
     wide; else the tabs are `icons`: a shield with a chevron (Status), a
     die with three pips (Stats), a scroll with two rolls (Lore), new
     paths in `icons.ts` (`tabStatus`, `tabStats`, `tabLore`) in the set's
     style (24 × 24, stroke 2). The icon is at most 11 × k px, the tab
     `min(16 × k, 0.14 × w)` wide (the 5.5 px words' width was 15). The
     word is the tooltip (`data-tip`) in the icon form only, and always
     the accessible name. The old `marks` form (empty tabs) is gone. At
     the default font the words come from about 110 px of content (62 × 9
     and up); 62 × 7 has icons.
178. **Short forms everywhere (H4, point 171).** `statusView` always uses
     `shortForm` (`brav`, `norm`, `rhvy`, `aggr`, `vigl`), at every step
     and in the compact card; `fitWord` and its list (`agg.`, `nor…`) are
     removed. The whole word is the tooltip and the name, as before.
179. **Spells (H6, point 172).** The user-facing name is Spells: the frame
     label (`PANE_LABELS`, so the Panes menu, the close cross's "Hide
     Spells", the gear's "Spells settings" and `getPanes()`' `title`), the
     gear popup, the phone strip's label and its Settings page ("Spells and
     Group"), the privacy text and the Mudlet import note. The id stays
     `timers`, and so do `getPanes()`' `short` (`TIME`, the script API),
     the settings key and the code's names. "Timer groups" stays (one of
     them is called Spells). The script manual's "Timers" is about Lua
     timers, not the pane.
180. **The groups off (H6).** `defaultTimersSettings` has Herblores, Buffs
     and Debuffs off (`TIMER_GROUPS_ON_CARD`). The card's stones read
     `game.timers.view()` and `character.stones`, never the groups'
     `enabled` (only `timersModel` does), so nothing was decoupled.
     **Settings version 8**: a stored v7 or older turns the three off
     once where the Character pane shows (a computer: `panes.character.on`;
     a phone: Character on in `phone.strip`); elsewhere they keep what is
     stored, an absent switch its old default (on). A recording
     (`recorded`) keeps its groups as recorded, an absent one the default
     of its version. **The phone's one-time defaults set 3**
     (`PHONE_DEFAULTS_MARK` 3): the same three off where Character is on in
     the strip after set 2 (which can turn it on after the load's
     migration has run). Both run once; a later turn-on stays. A record
     synced from a device still on an old client (v7) would take the step
     again, as with the earlier version steps.
181. **New desktop users** have Character off by default (ADR 0092), so a
     new desktop user sees no herblores, buffs or debuffs anywhere until
     Character or the groups are turned on. Left as decided; for the
     owner.

## Addendum 30 (2026-11-24): H2, the Spells groups' switch by its mark; the status cells in heat

The owner's test of part H (stage 77, "H test and round 2", point 5) and
round 16 variant C, his pick ("Part H2: what was built").

182. **Why Herblores, Buffs and Debuffs stayed SHOWN (the bug).** The
     straight path worked: an e2e that seeds a stored v7 record the way the
     app stores it (IndexedDB `webcockpit` / `settings` / `main` and the
     appearance mirror, Character docked, Spells on) had the three off with
     the code of part H. The flaw was what the step was keyed by: point
     180's switch ran only where the stored `version` was below 8, judged on
     the Character pane as it was at that load. The migrated record is not
     written back until the next change, but any change writes it as
     version 8, and from then on the step never runs again. So every v8
     record that had the three on stayed so, though Character was on later:
     one written while Character was off at the first load of the new code
     (the rule "elsewhere they keep what is stored"), one written by a page
     of the origin that did not run the step (the merge of 19:54 changed the
     main checkout's files under the owner's open tabs on the test server,
     which reload one by one as Vite sees them), and one pulled by the sync
     (ADR 0152) from his other browser of the same device type (Chromium
     and Firefox share the desktop record), where Character was off. His
     IndexedDB is not at hand, so which of these it was is not known; all
     three end in a v8 record with the three on and Character on, which the
     code of part H never switched (for a v8 record its `before` is false,
     so the stored `enabled: true` stood).
     The Panes menu, the dock, a float and the gear all read and write
     `panes.character.on` and `groups[id].enabled`; the mirror holds only
     the appearance; `reload` and `takeRecord` migrate what they read.
183. **The fix: a mark of its own, settings version 9.** `timers.stonesOff`
     says the switch has run. `migrateTimers` turns the three off and sets
     the mark wherever Character shows (a computer: `panes.character.on`; a
     phone: on in the strip) and the mark is not set, whatever the version;
     where Character is off nothing changes and the mark stays unset. As
     every update goes through `migrateSettings`, Character turned on later
     takes the three off at that change, once; a group turned on again
     after that stays on. A record from before version 9 without the mark
     has not had it (so the owner's v8 record gets it; any group he had
     turned on again on the test server goes off once more, as only the
     test server ever wrote v8); a v9 record without it (a damaged one)
     counts as marked. New settings have the mark (their three are off
     already). A recording (`recorded`) keeps its groups as recorded and is
     marked, so the player's own updates over it (the player host's
     `compose`) never switch them. The phone's one-time defaults set 3 stays
     as a second hand (the mark does the same when set 2 turns Character
     on). Tests: unit `settings` (v7 and v8 without the mark, Character
     turned on later, the store through IndexedDB with a pulled v7 and
     `reload`, a recording), e2e `spells-groups-off.spec.ts` (a seeded v7
     and v8 record and the gear's Shown switches, Character off then on,
     the sync's path: a v7 record written and `reload`).
184. **Heat (round 16 C).** The Mood, Casts, Alertness and Weight cells are
     coloured by step from calm to hot (`character-heat.ts`, one table per
     side): Mood blue (wimpy) to red (berserk), Casts warm (quick) to cool
     (thorough), Alertness grey (normal, its first step) to hot (paranoid),
     Weight green (peanuts) to red. The middle of each is the card's
     parchment (`#d9cfb4`; Paper `#6e5220`). The value, a fill track at the
     cell's foot (every step in its own colour, those below the current at
     55 %, the current full with a glow on the Lykta) and the cell's ground
     (a gradient to 13 % of the colour at the foot; Paper 9 % on its
     `#fffdf8`) take the step's colour; the hovered clickable cell's frame
     takes it too. A small corner mark (a 6 px triangle, the lamp at 55 %,
     hot on hover) is on Mood, Casts and Alertness, not on Weight. No step
     (an unknown word, no value): the plain colour, no warming, no step lit.
     It replaces the vertical step meter (`.wc-cc-lamp`).
185. **Weight keeps today's signal.** Really heavy is the vitals' low
     orange, painful and torture their critical red (`DARK_SIGNALS`), so the
     hot end means what it meant; `data-signal` stays as the state. On Paper
     the low orange is a deeper `#a04a00`: the vitals' `#b85400` reads at
     4.3 : 1 on the warmed ground. Every value of both tables reads at 4.5 : 1
     or more on its cell's warmed foot, over every dark pane tint and
     terminal background (the Lykta table) and on Paper's cell ground (unit
     `character-heat`; e2e checks the drawn colours on Paper).
186. **Every step of the layout.** The cells and the line: the value, the
     track (2 px at scale 1, in the cell's foot padding, so no row grows),
     the warming and the corner mark. The plain values (step 4): the value
     and a thin 1.2 px track, no ground and no mark (they have no cells).
     The compact card: the letters M/C/A/W stay the lamp's (they are
     labels), the value takes its colour; its cells (the 18 px form) have
     the thin track, the warming and a 4 px mark; its flat 13 px rows only
     the value's colour. The phone strip is the same card. The meter's 7 px
     of room beside the value went (`CELL_METER` is now `CELL_MARK`, 3 px
     kept clear of the corner mark), so the values have more room: "really
     heavy" whole at 62 × 7.
187. **Cost.** The track's steps are built once with their two colours
     (`--sd`, `--sl`); a field gets its step's two colours (`--hd`, `--hl`)
     and `data-heat` only through `setProp` / `setAttr`, which write on a
     change only, at the moments the status cells were already set. The
     side (Lykta or Paper) is chosen in the CSS by `data-light`, so a theme
     change writes nothing per cell. No per-tick work.

## Addendum 31 (2026-11-24): H9, the poll pass

Stage 77 H9 ("Part H9: what was built"): the owner's "Affects from the
poll", "Vitals from the poll", "Trolls have no mana" and "Round 20 and the
troll's mana" (stage file, Owner feedback).

188. **One format, `%f` last.** The poll's format is the card's fields,
     then `%z | %Z | %e | %E | %j | %J`, then `%f` (`pollFormat`), in one
     `info`. Not a second `info` in the same write: one sentinel pair, one
     outstanding poll, one failure count and one fit check, and the filter
     needed nothing new: it already held every line from the start sentinel
     to the end one (the answer wraps), and the end on a line of its own is
     the same end. `%f` prints nothing when no affect is on; else `Affected
     by:` right after the separator, a `- <name>` line each and a line
     break before the end sentinel (the owner's live measure).
     `parsePollAnswer` splits at the last `|`: the fields before it as
     before, the affects after it (`affectsOf`): none, or the header and
     its items, a line not starting `- ` after an item being that item
     wrapped. Another shape is an unreadable list (null): the fields and
     vitals are kept, no reconcile. `MAX_LINES` 80 → 120.
189. **The fit.** The affects take a row each whatever the width, so
     `answerFits` counts the fields' wrapped rows (`ANSWER_CHARS` stays 600:
     the sample is about 420 characters, the vitals add about 40), the
     affects known to be on (`TimersHub.affectCount`: spells, buffs,
     debuffs, stored spells and your own sanctuary) plus 3 to spare and the
     list's 2 lines, and the 4 spare rows. At 80 columns a poll needs 17
     rows with no affect known (12 before). A window too low waits, as
     before; a list longer than counted at worst meets MUME's pager, which
     ends the hiding and counts as a failure (two stop the polls).
190. **Affects from the list.** The poll's list goes through the same
     reconcile as a `stat` block's (`StatReconcile.apply`, through
     `TimersHub.reconcileAffects` and the trackers' `reconcileList`): seen
     and not on → added (timed ones untracked), on and not seen → removed,
     silent, no effect event (so it starts no poll). Lines still lead: a
     start line times an affect, the list keeps the timer; a drop line ends
     it at once. The delay is one poll at most, as the owner accepted.
     Herblores are never touched.
191. **Stored spells only when listed.** That `%f` lists `stored spell <x>`
     as `stat` does is not measured. The poll reconciles the stored spells
     only when its list names one; else a poll that does not list them
     would forget every stored spell each time it answers.
192. **The affects with no lines** (bloodlust, some pipe-weed, potion,
     panic, sunlight, unable to quit, unable to void, unable to sneak; the
     inventory's "not yet") join the table with their group and nothing
     else. An affect with no line of its own (these, and `growth`) is
     added **untracked** by a list: an untimed stone, dashed, no time bar
     ("Seen in stat, info or the poll only"). An indefinite affect with
     lines (hunger, comfortable) stays as before: no end, a full bar. Panic
     and sunlight have candidate lines in the inventory; not taken until
     confirmed in the game.
193. **An affect the table does not know** is kept as listed, untracked, in
     the Debuffs group (`UNLISTED_TYPE`): a stone with the group's generic
     icon. A debuff, not a buff: what is on you and not known is worth
     seeing, and debuffs stay before buffs when the stones overflow. Its key
     is apart from the table's names (`affect:?<name>`). A GMCP flag's
     `stat` form (`poison (type: …)`, `a … wound at the …`) is none
     (`isFlagForm`): the flag's stone shows it. Spells stay in the Spells
     group (no stone), and the flags' twins (blindness, hunger, thirst)
     stay one stone with their flag (`FLAG_TWIN`), as before.
194. **`potion` while a herblore runs.** MUME lists a herblore's draught as
     `- potion` (which one is not said). The card shows no `potion` stone
     while any herblore cell exists (`stoneView`), whether the card shows
     Herblores or not; the Spells pane's Buffs group still lists it.
195. **Vitals into the one store.** The poll's vitals are merged into the
     character's `Char.Vitals` map (`CharModel.applyPolled`), not a store of
     their own, so every reader moves with them while GMCP is silent: the
     card's bars and numbers, the phone's HP hotkeys and fight card (`You`'s
     HP), the scripts' `state.char.vitals`, the weather's signals. The
     scripts' `gmcp` table (`GmcpCache`) stays what MUME sent, and the run
     log records no polled value (the poll is not in it). A bar is taken
     only with both its numbers (`xxx` in a fight is no value) and is then
     exact (the number drawn; a later band word makes it a band again, as
     ever). A troll's `0 0` is a value.
196. **A newer `Char.Vitals` wins.** `CharModel` counts its `Char.Vitals`
     messages and notes per bar the last that touched it (its number, its
     word or its maximum); the poll takes the count when it is sent
     (`vitalsMark`) and a bar touched after that keeps GMCP's value. By
     message order, not the clock, so two in one millisecond are told
     apart. A new character starts the count over.
197. **No mana.** `CharModel.hasMana` is false when the race (`Char.
     StatusVars`) is Troll, or when no mana key (`mana`, `maxmana`,
     `mana-string`) has come in `Char.Vitals` for this character and the
     poll's `%E` was 0. `CharView.mana` carries it. The card (`CardBox.mana`
     → `CardLayout.mana`) then has two bars in the foot (`data-bars="2"`,
     each column `(w − 2 pad − gap) / 2`) and three status cells (Mood,
     Alertness, Weight): the cells, the line and the plain values divide
     their width by three, the compact card's line 1 too, at every step and
     on the phone strip (the same card). The Casts cell and the mana bar are
     `hidden`; `data-mana="none"` on the card. The Stats tab's modifiers
     keep their mana column.
198. **Group: a troll member.** The run exports (2026-09-28 to 11-17): four
     troll allies (Grugg, Burpy, Dig, Soug, each "… the Troll" in the room
     text) came in 8 `Group.Add`s with `"mana-string": 0` (a number, not a
     word) and no `mana` or `maxmana`, and none of their 4 624
     `Group.Update`s carried a mana key. Every other ally carried a word or
     a `maxmana` (Arvegil and Murkla out of the room: a word and a maximum,
     no number), so absence of the number alone is not "no mana". The
     rule: a Set/Add with a `mana-string` that is not a string and no mana
     number is `noMana`; a later mana number or word clears it. A player
     member so has no mana bar (HP and moves take the width, both row
     forms); `memberSig` includes the bars, so the row is rebuilt when it
     changes. NPCs come the same way (`0`) and keep their three bars: not
     asked for, left to the owner.
199. **The six herblores** of the player's guide in the catalogue, after the
     six there: Seeing (600, 900, 2400 s, buffs), Shadows (600 s debuff,
     3600 and 1800 s buffs), Skillful oil (480 s buff, 240 s debuff),
     Soothing draught (240 and 300 s buffs), Strength (7200 s buff), Orc
     balm (180, 360, 180 s buffs). The guide's times are MUME hours, a real
     minute each (Clearthought's 2, 4 and 6 hours are the catalogue's 120,
     240 and 360 s). Names in the catalogue's style (`Dark aura`): words
     with spaces, phases `(med)`/`(min)`, `(low)`, `(neg)` for a debuff
     phase. Keys `Seeing`, `Shadows`, `SkillfulOil`, `SoothingDraught`,
     `Strength`, `OrcBalm`. Manual only (no lines known).
200. **Cost.** The poll's answer adds one split and a short loop; the
     reconcile runs once a poll (10 s by default). `affectCount` builds the
     timers' view only when a poll is due and time allows it. The card's
     layout key gains `mana`; hiding writes only on a change (`setHidden`,
     `setAttr`). No per-tick work.

## Addendum 32 (2026-11-25): H10, the folder tabs of round 20 G8

Stage 77 H10 ("Part H10: what was built"): the owner's pick of round 20,
**G8** ("Järnark, bara skifferkanten"; stage file, "Round 20 and the
troll's mana"). Replaces H3's icon tabs (points 170, 177), which the owner
found "för moderna och ai-genererade" ("H test and round 2").

201. **The shape.** Folder tabs under the pane's hood: a strip over the
     status area, the tabs from 6 px in, each as wide as its word with a
     4 px slant each side, 3 px over the next (round 20 `GSHAPE`), 15 px
     high (18 on a phone). The chosen tab and the sheet the area's content
     lies on are one outline (`folioPaths`: the sheet's corners and the
     tab's four points, rounded 3 and 2.5 px), so the tab shares its
     ground with what it shows; the other two lie behind it at 0.78 of its
     depth, their foot 3 px under the sheet. The sheet holds the cells and
     the shields (Status), Stats or Lore, 5 px inside its edge
     (`SHEET_PAD`); the stones' row lies under it, 4 px below
     (`SHEET_GAP`), as wide as the sheet, so on Lore and on Stats without
     the row (point 174) the sheet reaches the area's foot.
202. **The right edge.** Below `TAB_SWITCH` (110 px of content above the
     vitals, round 20's `SWITCH_H`) the tabs stand on the sheet's right
     edge: a column 18 px wide (22, and a finger's 26, on a phone), three
     equal tabs down the sheet as high as it is above the stones' row,
     from 3 px (or below the cross) to 3 px from its foot, 2 px apart.
     Below `TAB_MIN` (80 px, point 125) there are no tabs and no sheet: the
     low card and the compact card of F2c are as before. The compact card
     of a narrow tall pane (point 126) has the tabs, so the sheet too.
203. **The edge (G3's on G1's iron).** A near-black line on the outline
     (`rgb(10 12 15 / 0.95)`) and one light line 1 px inside it
     (`rgb(205 215 228 / 0.16)`, the outline moved in, `insetPoly`); no
     G1 inner line. The tabs behind: a faint light edge (0.10). A drop
     shadow under the sheet (0 1px 2px, 0.85). On Paper: the edge
     `#857759`'s mix of the pane's ground, the white line at 0.8, the
     shadow warm and light (round 20's Paper G8).
204. **The iron and the tints.** Round 20's colours are the Lykta pane's
     (`#12161f`). The card takes them from the pane's own ground
     (`--window-base`): the sheet the ground mixed 7–3 % toward cold steel
     (`#a0b2cd`), top to foot, with G1's grain; the tabs behind the ground
     darkened. Each has a least OKLCH lightness (the sheet 0.245 → 0.205,
     the tabs behind 0.20 → 0.17, round 20's own), so a black (Plain) pane
     under the lamp still shows a sheet and not a hole, and a tinted one
     keeps its hue. On Paper: the ground toward white (60 → 30 %, round
     20's `#faf6ec` → `#f5efe1` on `#f1e8d4`), the tabs behind toward a warm
     brown (12 → 20 %). The words: behind, the label shade toward round
     20's `#7f8592` (Paper `#85775a`); the chosen one the lamp's hot light
     with a glow (Paper `#3b2b10`, no glow); hover lights them.
205. **Words, or I, II, III.** The words (STATUS, STATS, LORE in Cinzel
     Bold, 0.14em tracking, at most 9 px × the card's scale, 10 on a phone)
     stand where they are at least `TAB_WORD_MIN` (8 px, kept); else the
     tabs show **I, II, III** (round 20 shows the numerals at every size
     where the words do not fit, never icons), each tab a third of the
     strip. On the right edge the words stand upright, which needs a tab
     52 px long: in practice the column has the numerals. The numerals
     are `depth − 7 px` (6 px at least, 11 × scale at most), the tabs
     behind smaller. The word is the tooltip (`data-tip`) only where the
     numerals show, and always the accessible name (`aria-label`). H3's
     three paths (`tabStatus`, `tabStats`, `tabLore`) are removed from
     `icons.ts`: no icon survives anywhere.
206. **The cross.** The strip under the hood ends clear of the pane's close
     cross: four cells from the card's right edge on a framed pane (its
     glyph reaches 8 px in), eleven with no border (the cross's row and
     the pane's buttons are over the content's top row). Where the words
     would not fit beside the cross but would in the whole width, or not
     even three numerals fit there, the strip goes under the cross's row
     (the sheet's top with it), as the right column's first tab does.
     Where a borderless cross's row leaves the column's tabs under 10 px
     (a large font), the sheet starts below that row (`placed`); where the
     sheet above the stones is still too short for three tabs, the stones'
     row lies on the sheet (`sheet.whole`) and the tabs run its whole
     height.
207. **The room it takes, in the layout model.** The strip takes 15 px of
     height (× scale) and the sheet's padding 10 px each way; the column
     18 px of width. `cardLayout` gives `main` (the sheet and the stones'
     row), `content` (inside the padding: what the steps, the cells, the
     shields, the compact card and Stats' and Lore's columns are sized
     for), `tabs` (the strip or column, each tab's box) and `sheet`; the
     portrait's room counts the padding and the column. So nothing
     overflows: unit tests (`character-layout`) for every size, font, lock
     and phone place, and e2e `character-card`'s "nothing overflows"
     (which skips the drawing, `.wc-cc-folio`, as a box).
208. **A growing pane never takes a step back where the tabs move.** The
     strip costs height the column does not: at 110 px a pane would go
     from step 0 to step 2. So the tabs go under the hood from
     `TAB_SWITCH` only where that costs the area no step against the right
     edge (both laid out, the better kept, a tie to the hood): at the
     default font from about 126 px of content instead of 110 (62 × 9 and
     up). Where the tabs come (80 px), the sheet with the round's 5 px
     padding cost a step too, so a low pane's sheet (the column) is padded
     2 px (`SHEET_PAD_LOW`); with the column on, the stones keep three
     tabs' height (46 px) above them (`TAB_LEAST`). Large's sizes (a Large
     lock in a low pane) may still lose one step for a few px where the
     tabs come (the unit test allows that one, never more, never Medium).
     The shields shrink where the strip comes at the same step (52 → 31 px
     at 520 × 158): the price of the strip the owner picked (round 20
     notes "under huven hade gett").
209. **What it costs elsewhere.** At the default font Stats keeps the
     stones' row from 62 × 12 (was 62 × 11, point 174); the new player's
     480 × 171 pane has shields of 41 px (was over 60). The phone strip at
     its default height has the column (I, II, III); about 12 rows high,
     the strip under the hood.
210. **Drawn once per change.** `folioPaths` is pure; the card draws it on
     a change of the layout, the tab, or the stones' row being shown
     (`CardDom.drawFolio`): three clipped boxes (the tabs behind, the
     sheet's ground) and two SVG paths, `clip-path: path()` (seen in
     Chromium and Firefox; WebKit has it too, not tried here). Each tab button is placed by the layout and is
     its tab's whole box (the chosen one on top where they overlap); the
     keyboard (Tab, Enter, Space), clicks and taps are the buttons' as
     before. The tablist's `aria-orientation` follows the side. No
     per-tick work.

## Addendum 33 (2026-11-25): H11, the poll in a fight

Stage 77 H11 ("Part H11: what was built"): the owner's "The poll in a
fight" (stage file, Owner feedback). Measured live: in a fight `info [%O
%D %k %Y %z]` answers `[80 49 30 aggressive xxx]`, whole, with no fight
line inside. Replaces point 24's "while fighting" and point 100's last
sentence ("In a fight the poll waits for the fight's end").

211. **In a fight as out of one.** The login poll, an opened view, the
     repeat and the events all poll in a fight, with the same gate (a
     clean XML game prompt with nothing after it, no command since it,
     the quiet after a command, the burst rule, no cast pending, one
     outstanding, 2 s between polls, the fit). The vitals' `xxx` is no
     value and writes nothing (point 195, unchanged); OB, DB, PB, the
     mood and the rest are taken as ever. A `Char.Vitals` keeps moving
     the bars in the fight.
212. **The repeat too, not only the events.** The owner wants both ("the
     poll going and it firing when I change mood"), and nothing found
     speaks against it: the answer comes in one piece, the filter shows
     a round's lines before and after it in order (point 218), and a
     poll that fails is put back and counted as anywhere (two stop the
     polls for the connection). Its cost is one hidden `info` per 10 s
     while a view is open, as out of a fight.
213. **Why a fight does not weaken the gate.** A round prints a prompt
     that answers none of your commands, so in a fight "a game prompt
     after the command" no longer means MUME has read it. But that was
     already so out of your own fight: in the run exports a fight in
     your room (a groupmate's) prints a prompt every 0.25–1.25 s whether
     you fight or not. What makes a command wait unread is MUME holding
     your input (a cast, a skill's delay, mixing), and the poll now
     knows that from GMCP (point 214) instead of from the prompts. A
     command not held is read within a pulse, well inside the 1 s quiet.
214. **No poll while MUME holds your commands** (new, everywhere, not
     only in a fight). Your own `waiting` status flag (`Group.Set` /
     `Group.Update` for `type: "you"`, kept in `GroupModel.selfFlags`
     since point 95) is on while MUME holds your input: in five run
     exports (2026-09-28 to 11-17) 1 483 waits, from `cast` (most),
     `shoot`, `track`, `scout`, `pick`, `mix`, `drain`, `recover`, an
     item's power, an order to a mount; 43 of them in a fight. 55 of the
     1 483 had a game prompt inside the wait (a mix's steps, a fight's
     rounds), so the prompt alone does not close the gate there. The
     rule: no poll while `waiting` (`InfoPollOptions.waiting`; the reason
     "MUME holds your commands (waiting)"), and none until `SETTLE_MS`
     (1 s) after it ends, as the commands held come out then, a pulse
     each, and a pager or other output of theirs closes the gate
     (not a game prompt). Only stricter: no poll goes sooner than
     before. Assumed, not seen: that the lag after your own bash or kick
     sets `waiting` too (no basher's own wait in the exports); if not,
     point 98's burst and the quiet cover it as before. A stale flag
     cannot block for ever: `Group.Set` at login and a new connection
     clear it.
215. **The burst rule stays as it is in a fight.** Point 118's burst (a
     command less than 2 s after the one before it, with no game prompt
     between) does not make the mood event useless in a fight: in the
     run exports' own fights (`opponent` set) 1 917 commands were lone
     and 264 bursts (12 %). Replaying the mood changes in those fights
     with the gate's rules (the exports overlap, so some are counted
     twice; 21 in all) the poll would have gone 0.5–7 s after the
     change, 4 s the median, and about 25 s in two (a burst kept up). A
     narrower rule for the mood would need input matching (point 101)
     or a proof that MUME read the commands after the mood's, and the
     burst is what guards a command held behind another: kept.
216. **A fight's start and end are no position event.** `position`
     `fighting` counts as `standing` for the event (point 116): the
     bonuses do not change when a fight starts or ends, and before H11
     the end released the waited poll anyway. Being knocked to `sitting`
     in a fight (or standing up from it) still polls.
217. **The `fighting` option is gone** from `InfoPoll`: nothing in the
     poll waits for a fight any more. `GameState.fighting()` stays for
     the card's red swords (point 143). Nothing else keyed on the fight
     changes: the tab does not change in a fight (point 143, so there is
     no "tab return" to touch), the filter (`InfoFilter`) never knew of
     fights, and the typed `info`/`stat` reader (point 96) reads in a
     fight as before.
218. **The filter round a fight.** Nothing new was needed; unit tests
     (`info-filter`, "a fight round the answer") cut at every byte: a
     round and its prompt before the answer, after it, a round's line in
     the same pulse before and after, rounds on both sides, and a round
     in a frame of its own between the answer and its prompt. Each
     round's lines show, in order, never swallowed; the answer's own
     prompt is hidden with it where its pulse showed nothing else, a
     prompt shared with a round's lines stays (point 27). The answer's
     `xxx` gives null vitals.
219. **Cost.** One flag read per check and per frame end; no new
     listener, no per-line work.

## Addendum 34 (2026-11-25): H8, the stones' own icons

Stage 77 H8 build ("Part H8: what was built"): the owner's picks of
`notes/research/stone-icons/picks.md` (rounds 1–2, confirmed 2026-11-24)
and "H9 test" (unable to quit seen live). Replaces point 130's icons; its
colours stand, but for a herblore's debuff phase (point 223).

220. **Where the icons live.** `src/panes/stone-icons.ts`: the picked paths
     (`STONE_ICONS`, named `st-<round page id>`), taken from the round
     pages' own data (`round1.html`, `round2.html`, the shape helpers
     evaluated, nothing redrawn; Clearthought's star point
     `1.2000000000000002` written `1.2`), 24 × 24, one stroked path as the
     rest of `icons.ts`, which takes them into `ICONS` and `IconName`.
     The tables: `AFFECT_STONE` (every buff and debuff of the affect table
     by its name in lower case), `HERB_STONE` (all twelve herblores by
     catalogue key), `FLAG_STONE` (the six flag stones), `SANCT_STONE`.
     A pick that is today's icon keeps its old name: poison, blind,
     hungry, thirsty (flags 1) and sanctuary 1 (`sanct`).
221. **The generic icons** (`GENERIC_STONE`, the "Generic" picks): a buff
     the up arrow (buff 1), a debuff the down arrow (debuff 1), both as
     before; a herblore the flask and leaf (herblore 4, new; only a
     herblore missing from `HERB_STONE` gets it, none today); a flag the
     question mark (flag 4; no flag reaches it today, as round 2's note
     said, kept as the fallback of `flagStoneIcon`). An affect the table
     does not know is a debuff (`UNLISTED_TYPE`, point 193),
     so the down arrow; a spell shown as a buff (no pick) the up arrow.
222. **Not recognised yet.** A pick marked `confirmed: false` keeps the
     group's generic icon until the owner has seen the affect in the
     game; turning it on is deleting that mark (one line). Unconfirmed:
     bloodlust (pick bloodlust 1), some pipe-weed (5), potion (1), panic
     (2), sunlight (1), unable to void (1), unable to sneak (2).
     **Unable to quit** is confirmed ("H9 test": it came from the poll)
     and has its pick (4, power off, slashed).
223. **A herblore's phases.** One icon per herblore in every phase (the
     picks give no phase its own). Haste is haste 6, haste (recovery) 1's
     broken bolt (`st-haste-recovery`): for the herblore, all its phases,
     as round 2's wish says ("så att herbloren och dess efterverkan hör
     ihop"); the affect haste (active) keeps its own lightning (1). With
     the debuff arrow gone, a herblore's debuff phase is drawn in the
     debuffs' colour (`tone: 'debuff'`, the round pages' small red stone
     beside each such herblore); the tooltip still says "a debuff phase".
     It stays a herblore for the order, the `+n` rank and its ×.
224. **The flags' twins and the Group pane.** Blindness, hunger and thirst
     (the Debuffs twins of blind, hungry, thirsty, point 128) take the
     flag's pick: one stone, one icon, whichever draws it. Snared (4, a
     lasso) and wound (4, a cut and a drop) are new on the stones only:
     the Group pane's member flags are not stones and keep `STATUS_ICON`
     (the chain link, the bandage); to align them is the owner's call.
225. **The Spells pane** shows the same icon for the same cell: its Buffs,
     Debuffs and Herblores items take `affectStoneIcon` / `herbStoneIcon`
     (`timers-model.ts`), which the card's stones use. Structurally free:
     the item already carried an icon name. The group headers keep the
     group icons (the arrows, the leaf), and the other groups (Spells,
     Sanctuary, Stored, Blinds, Charmies) are unchanged. A herblore's debuff
     phase in Spells keeps the group's colour (the pane colours by group,
     the owner's setting); its name says the phase (`Haste (recovery)`).
226. **Sizes.** The stones are 13 px (Large), 12 (Medium), 10 in a low or
     compact card, at least 8 at the smallest scale; the icon is drawn at
     74 % with stroke 2.3, as before. The owner judged the picks at 13 and
     10 px on Lykta and Paper on round 2's page, in the same stone style.
     In Spells the icon is the bars' chip icon (0.95 em) or the ring's
     centre (40 %), as the group icons before.
227. **No per-tick work.** A stone's icon is chosen when the stone list is
     built (`stoneView`, on a Timers or group change); the DOM sets the
     path only when the stone in a slot changes. The Spells model is
     rebuilt on its tick, so `affectStoneIcon` keeps a memo per group by
     the name as given (one map read per item, no string work after the
     first); a herblore is a record read.

## Addendum 35 (2026-11-25): the owner's picks after H8 and H11

228. **Group's snared and wound** take the stones' picks (`st-snared`,
     the lasso; `st-wound`, the cut and drop) in `STATUS_ICON`, so a flag
     looks the same in Group as on the card. The other member flags keep
     their icons (they were the picks already, or are not stones).
229. **NPCs without mana.** An NPC member sent as point 198's troll
     (`"mana-string": 0`, no mana number) shows no mana bar either; point
     198's "an NPC keeps three bars" is reversed. A later mana number or
     word brings the bar back, as for a troll.
230. **Kept:** a herblore's debuff phase drawn in the debuff colour on the
     card (point 223), and the `waiting` rule outside a fight too (point
     214), both by the owner's word.

## Addendum 36 (2026-11-25): the list leads over a stale wound

The owner's Stewash run (`Stewash-2026-11-25T09-14-32.log`): GMCP set
your own `wound` (`Group.Update {"id":1,"wound":true}`), `stat` listed
`- a serious wound at the left hand (clean)`, later `- a deep wound at
…`; the character died ("You are dead! Sorry..."), and the next `stat`
listed only `- comfortable`. MUME never sent `wound: false`, so the
card's wound stone stayed whatever the player waited or typed.

231. **The list clears a stale flag.** A whole affects list of yours, the
     player's own `stat` block (`Affected by:`) or `info` block (`You are
     subjected to the following temporary effects:`), that has no
     `… wound at …` line turns your `wound` flag off; one with no
     `poison …` line your `poison` (`GroupModel.noteSelfList`). The
     version is bumped and GameState tells `group`, as for a
     `Group.Update {"wound": false}`. It only clears: a list with a wound
     or poison line while the flag is off changes nothing (GMCP says when
     one comes), and a later GMCP `wound: true` sets it again as usual.
     The other flags are not touched (their list forms are not the
     flag's: hunger and the rest are affects of their own).
232. **The wiring.** `StatReconcile.apply` (both the typed blocks and the
     poll's `%f`) hands each whole list's flag forms (`FlagLines`: the
     wound lines, a poison line, `poll`) to the hub's host
     (`TrackerHost.flagList`, recognised by `isWoundForm` /
     `isPoisonForm`, the two halves of `isFlagForm`); the hub passes them
     to its `onFlagList` listeners; GameState, which owns both the hub and
     the group model, listens. One call per list, no per-tick work.
233. **Not the poll.** That `%f` lists `… wound at …` and `poison …` as
     `stat` does is not measured: no `%f` answer is in any log at hand
     (the poll is hidden from the run logs, `~/Downloads/*.log` to
     2026-11-25; the run exports end 2026-11-17, before the poll; the
     owner's hand-typed `info` formats in `Rasta-2026-11-22` hold no
     `%f`). The header is the same (`Affected by:`), so it is likely, but
     a poll that left wounds out would clear a real wound every time it
     answers. GameState skips a list with `poll: true`; the owner's report
     (the stone stayed after a typed `stat`) is fixed by the typed path.
     To measure: `info [%f]` with a wound on, live; if it lists the wound,
     dropping the `if (l.poll) return;` line in `GameState` extends the
     rule to the poll.
234. **Death sends no flags.** After "You are dead! Sorry..." the log has
     `Event.Moved`, `Char.Vitals` (`position: resting`, the opponent
     null), `Room.Chars.Set []` and no `Group.*` message for the rest of
     the run (35 s, the `stat` that listed only `comfortable` included).
     The flags go stale at a death, but the list rule fixes the wound the
     next time a list is read; nothing is built on the death line. (One
     death in the logs at hand; the run exports have none.)
235. **One wound stone, its lines in the tooltip.** Several wounds stay
     one stone. While `wound` is on, the wound lines of the latest list
     that had them are kept (`GroupModel.selfWounds`; a GMCP `wound:
     false`, a new self entry without one, or a reset forget them) and the
     stone's tooltip lists them under "Bleeding." (`stoneView` input
     `wounds`, capitalised: "A deep wound at the left hand (clean)"). A
     flag stone's text is part of the stone list's key and the card's
     slot key, so a changed line redraws the tooltip.

## Addendum 37 (2026-11-25): the poll clears a flag once it has listed it

236. **The poll learns that `%f` lists the flag forms.** The owner: `%f`
     should list wounds as `stat` does; not measured. A poll that did not
     would clear a real wound at every answer, and MUME would not set it
     again (no new `wound: true` while the wound lasts). So `GameState`
     lets a poll's list clear your `wound` only once a poll answer of the
     same connection has listed a `… wound at …` line, and your `poison`
     only once one has listed a `poison …` line (`noteSelfList`'s `clear`).
     A poll's wound lines are always taken for the tooltip. A new
     connection (`resetCharacter`) forgets it. Replaces point 233's "the
     poll never clears"; the typed `stat` / `info` clears as before.

## Addendum 38 (2026-11-25): light wounds

237. **What the GMCP flag means.** The owner got a light wound and no stone
     (Stewash, 09-41: `wound` false all through, `stat` listing "a light
     wound at the right leg (clean)"). The run exports: the flag comes with
     "You feel a sharp pain there!" and "You bleed from open wounds.", and
     MUME sends `wound: false` when the wound heals down to light, by itself
     (Rasta 2026-09-29: 147 s, then `stat` lists three light wounds) or
     tended (Rasta 2026-11-03). So the flag is a bleeding wound, worse than
     light; a light wound (no malus, but it can worsen unbandaged) has no
     flag. Only a death left it on (addendum 36).
238. **The full stone stays GMCP's alone.** No list ever sets the flag.
239. **The light-wound stone** (`flag:wound-light`, the wound icon at 50 %,
     `dim`): your wound lines from the latest list while GMCP has no wound
     on (`GroupModel.selfLightWounds`). Set by any list (`stat`, `info`, the
     poll); cleared by a typed list without wound lines, and by a poll's
     once a poll has listed a wound (addendum 37). Any GMCP change of
     `wound` forgets them until the next list, so a bleeding wound that
     heals to light shows nothing until the next list (a poll, 10 s, with
     Character open). The tooltip: "No malus yet; bandage it before it gets
     worse." and the lines. Shown with the flags (`character.stones.flags`).
     Kept apart from the flag, so it cannot change when the full stone shows.

## Addendum 39 (2026-11-25): no blink at heal-down; shorter stone tips; no fibres

240. **GMCP's `wound: false` dims, it does not remove.** The owner's test:
     a deep wound healed to light, GMCP sent `wound: false`, the stone went,
     and the next poll brought the light one back (a blink per wound). Now
     a `wound` that GMCP ends hands its last listed lines over as the light
     wounds, so the full stone turns into the dimmed one at once and the
     next list says what is left (or clears it). Replaces point 239's "any
     GMCP change forgets them". A `wound: true` still takes the light ones
     over.
241. **The stone tooltips lose their source and kind lines** (the owner:
     the colour says buff or debuff; the rest was noise): no "Seen in stat,
     info or the poll only, no time.", "On while GMCP says so (no time).",
     "Buff" / "Debuff" / "Herblore" / "GMCP flag" / "Sanctuary", "· a
     debuff phase"; the wound stones list their wounds alone ("Bleeding."
     and the light wound's advice went). The time, the flag's effect, the ×
     hint and "Ending soon" stay, pending the owner's review of every
     tooltip in the card.
242. **The bars' track has no fibres.** The round 12 parchment's 1 px
     stripes every 5 px (`--trk-bg`) read as bars behind the bars, most on
     Paper; the tint alone stays, on both themes.

## Addendum 40 (2026-11-25): the tooltips, the owner's review

243. **The tooltips per `notes/research/character-tooltips.md`, T1–T47 but
     T31**, the owner's word ("Allt ok utom T31"). T31, the herblore `+`,
     keeps `Herblores` / `Click: start a herblore.`. Replaces point 241's
     "the time, the flag's effect, the × hint and Ending soon stay".
244. **Implementation choices.** A one-line tooltip is the body with no
     title (`tipOf` in `character-model.ts`: a title with no lines becomes
     the body). The status cells and the position now have a tooltip also
     without a click (a replay, the log player, berserk, an unknown value,
     a fight, stunned): the whole word alone. A pending click (T5) shows
     the bold title alone (the body set equal to it, which the tooltip
     leaves out). An unknown weight still has no tooltip. A stat's
     `Unaffected 16` needs a delta other than 0 and a known unaffected
     value. `LOAD_SENTENCES` went (nothing else read it); `STONE_FLAG_TEXT`
     became `STONE_FLAG_LABEL`, the names alone; `ShieldView` and
     `AbilityView` lost their `title`.

## Addendum 41 (2026-11-25): the shields in a log

The owner: in a log (the run log player, a replay, a shared run,
Spotlights) the Status tab's OB / DB / PB / ABS were empty, as the poll's
answer leaves no trace in the run log (point 1, addenda 31 and 33). He
wants the shields there; Stats and Lore stay empty in a log (decided).

245. **The record.** The live App writes the four shields into the run
     log as `<ts> ESC GMCP WebCockpit.Shields {"ob":81,"db":13,"pb":85,"abs":70}`
     (a value not read: `null`), and nothing else of the poll. App emits
     `info.shields` on every `info` change of a live connection (a poll
     answer, or a read of the player's own `info` / `stat`, which already
     counts as a poll); the recorder writes it when it differs from the
     run's last shields record, so not every 10 s. A new connection forgets
     it, so each run has its own first record.
246. **A private GMCP package, not a new record type.** It is how the
     exported replay already carries the timers state at a cut
     (`WebCockpit.Timers`, ADR 0033), and every reader already carries GMCP
     records through: the timeline (`ENTRY_GMCP`) and the engine's frames
     (History, the shared run viewer, the HTML replay, Spotlights), the
     ReplaySocket (`#replay`), the share capture and the fold (a
     `WebCockpit.*` record is a barrier and is kept inside an excluded
     range), the payload. A new `ESC SHIELDS` type would have been skipped
     by the timeline, the reel and the fold until each learnt it. An older
     client reading a new log treats it as any unknown GMCP: its game
     state ignores the package, and no reader prints GMCP as text (only
     bad JSON prints a line, and the JSON is the recorder's own).
247. **Applied in a replay only.** `GameState` takes `WebCockpit.Shields`
     only on a replay connection (`InfoModel.applyShields`); a live
     connection ignores it. Only the shields change: `at` stays null and
     `complete` false, so the Status tab's shields (which read
     `game.info.answer`) show from the record on, and Stats and Lore keep
     their quiet text. A record is read defensively (a shared run is
     anyone's file): integers up to ±100 000 or null, other keys ignored,
     a record with no shield ignored.
248. **No script sees it.** The scripts' `gmcp` table (`GmcpCache`) and the
     `#event {IAC SB GMCP…}` events skip `WebCockpit.*` packages
     (`isPrivateGmcp`, src/core/types.ts); the game state still gets them
     first. This also keeps `WebCockpit.Timers` from scripts, which never
     needed it. Accepted: an older client's scripts would see the record in
     a `#replay` of a new log (no text, no command).
249. **Privacy.** A shared run is published: the four numbers go with it
     (the owner's wish), nothing else from the poll. An excluded range
     keeps its shields records (point 246's barrier), the values alone.
250. **Paths checked.** Recording (`src/capture/recorder.ts`), the `.log`
     download and cloud sync of runs (the chunk text as is), History's
     player and the shared run viewer and the HTML replay (timeline →
     engine → player App), `#replay` (ReplaySocket → live App), the export
     editor's text and the text export (`share/text.ts`, `in` / `out` /
     system lines only), the replay payload and its fold, Spotlights' text
     (`spotStill`, lines only). Limit: a Spotlight reads at most 10 minutes
     before its window plus the login stretch, so a change of shields older
     than that shows the login stretch's values (or none).

## Addendum 42 (2026-11-25): the HP tooltip is the wimpy; the herblore `+` a button

251. **HP's tooltip** is `Wimpy n` alone, none without a wimpy: the bar
     shows the value, the band and the max (the owner). Replaces T33–T35.
252. **The herblore `+`** is a filled disc in the herblore green
     (a gradient, a light inner edge, a soft drop), round where the stones
     are square, with a light plus (`#f4fbe8`, Paper `#fbfff4`) at 0.8 of
     the stone, weight 900; hover lightens it. It no longer reads as a rune.
     Its tooltip (T31) is unchanged.
253. **The `+` only on hover** (the owner): hidden (opacity 0, its slot
     kept, so no stone moves) until the pointer is over the stones row or
     focus is in it; shown always on a device without hover and after a
     touch (`data-touch`), where there is no hover to find it by.

## Addendum 43 (2026-11-25): panic confirmed; the six others on

254. **Panic has its pick.** The owner saw panic in the game in the
     closing test (a short malus to OB) with the generic debuff arrow:
     point 222's rule, so `confirmed: false` is deleted and panic draws
     its pick (panic 2, a fleeing figure, `st-panic`).
255. **The six others on, unseen** (the owner, before 0.23.0): bloodlust,
     some pipe-weed, potion, sunlight, unable to void and unable to sneak
     draw their picks now. Panic showed that a listed affect is
     recognised; a name MUME writes otherwise is unknown and keeps the
     generic arrow, as before, so nothing can draw wrong. The owner
     watches for an arrow on any of them. `confirmed: false` stays as the
     mechanism for a later pick; no entry uses it.
