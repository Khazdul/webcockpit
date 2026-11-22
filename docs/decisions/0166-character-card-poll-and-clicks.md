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
