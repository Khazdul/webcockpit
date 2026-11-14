# The community page: the owner's reference

Owner, 2026-11-14 (the sync session): a picture of the front page of
the best known site where MUME players post logs, which the community
knows well and which is little tended today. The picture is not in the
repository (it is another site's page with players' names, and this
repository is public); this is what it shows. Source material for the
mockups of the community stage (spec §7.8), not a specification.

**The owner's wish:** take inspiration from it by function, not by
layout. Some recognition for players used to the old site, in our own
look, would be appreciated.

## What the page shows, top to bottom

- **A row of five small boxes**, five lines each, a number and a name:
  - *top log posters*: who has posted most logs (140, 136, …);
  - *most occurring*: the characters that appear most often in the
    logs;
  - *profile updates*: **not wanted** (owner);
  - *white lords* and *saurons minions*: the "warlords", the five
    characters on each side of the war with the most war points. This
    is MUME's own data.
- **A line of facts and links:** "34 players currently online on
  MUME (checked 6s ago)", a vote link, links to a forum and archives.
- **Random logs:** "Today's random log", "Yesterday's random log",
  each with title, character and date, and "show another random log".
- **The list of logs**, newest first, the main part of the page. Per
  log: the title in bold with the character in brackets; the date and
  time; the size in bytes; a small rating bar where the log is rated;
  "Viewed 153 times, last comment 4 days ago by <name>"; the number of
  comments. Rows alternate between two backgrounds.
- **At the foot, side by side:** *Random Runes*, a wide box of one-line
  notes, `<name>: text`, cut with "…" when long, some of them answers
  with `@name`; and *top rated logs*, a numbered list of eight titles.

## What it means for our plan

| On the old page | With us |
|---|---|
| The list of logs | Planned (spec §7.8): New, Top, Most watched |
| top rated logs | Planned: Hall of Fame |
| Random Runes | Decided 2026-11-14 (the notice board) |
| top log posters | New, cheap: a count per account |
| most occurring | **Not wanted** (owner, 2026-11-14: needlessly complicated and not that interesting) |
| Random log of the day | New, cheap |
| white lords / saurons minions | New, **to investigate**: where MUME publishes the war point lists, in what form, and whether MUME's management agrees to our Worker fetching them. No promise before that. |
| Players online on MUME | The same investigation (our own "N online" counts the client's users, not MUME's) |
| profile updates | Not wanted |
