# Character portraits (raster)

The Character pane's round portrait (stage 77 decision 22, ADR 0166
addenda 10–12) shows a portrait per subrace and sex, and the race's
portrait when the subrace is unknown. A drawn portrait (the tinted
engraving of the portrait pass, `src/panes/portraits/`) is shown unless a
file is here. Which files exist is read at build time, so add them and
rebuild: a deploy is a rebuild. Code: `src/panes/portrait.ts` (which
file), `src/panes/portraits/` (the drawings), `src/gmcp/race.ts`
(`raceKind`, `subraceKind`: which race and subrace).

The client cannot tell a character's sex yet, so it shows the men's
portraits (`-male`) for now; the women's are drawn and ready.

## Files: `public/portraits/<id>-male.webp` and `<id>-female.webp`

Each id below has two files, `<id>-male.webp` and `<id>-female.webp`
(`human-male.webp`, `human-female.webp`), except the neutral figure, which
is one sexless `neutral.webp`. The look notes are what the drawings show:
MUME's help text where it says something, else Tolkien.

| File | Shown for | Look |
| --- | --- | --- |
| `human-*.webp` | A Man of no known kind; the fallback for the three below | an ordinary man |
| `dunadan-*.webp` | Dúnadan (Dúnedain) | tall, dark hair, grey eyes, stern; a ranger's dark green hood and cloak, a silver star brooch |
| `eriadorian-*.webp` | Eriadorian (Eriadoran: the villagers of Eriador, Bree) | ordinary, brown hair, ruddy, a short beard, a homespun brown tunic |
| `rohirrim-*.webp` | Rohirrim | tall, long blond hair in braids, blue eyes, stern; a green-and-gold cloak |
| `elf-*.webp` | An Elf of no known kind; the fallback for the three below | fair hair, pointed ears, green |
| `noldo-*.webp` | Noldo (Noldor, Noldorin) | long dark hair, grey eyes, a silver circlet with a gem, deep blue |
| `sinda-*.webp` | Sinda (Sindar, Sindarin: the Grey Elves) | silver-grey hair, pale, a grey cloak |
| `silvan-*.webp` | Silvan (wood-elves) | brown or auburn hair, a green hood, a bow and its string across the chest |
| `halfelf-*.webp` | Half-elves (no subraces: they look more like Men than Elves) | auburn hair, half-pointed ears |
| `dwarf-*.webp` | A Dwarf of no known house; the fallback for the three below | a brown beard, a helmet |
| `longbeard-*.webp` | Longbeard (Durin's folk) | a very long grey-white beard, a blue hood |
| `firebeard-*.webp` | Firebeard | a red-orange braided beard, a helmet |
| `broadbeam-*.webp` | Broadbeam | very broad, a black beard, heavy armoured shoulders |
| `hobbit-*.webp` | A Hobbit of no known kind; the fallback for the three below | brown curls, a green coat |
| `fallohide-*.webp` | Fallohide | taller and slimmer, fair hair, pale skin |
| `harfoot-*.webp` | Harfoot | the smallest, browner skin, dark curls, no beard |
| `stoor-*.webp` | Stoor | the heftiest, a round face, the only hobbits with sideburns or a beard |
| `beorning-*.webp` | Beornings, and a Bear (their changed shape) | a bear-ear hood, a dark beard |
| `orc-*.webp` | An orc of no known kind; the fallback for the three below | green hide, yellow eyes, tusks, a topknot |
| `tarkhnarb-*.webp` | Tarkhnarb (Uruk-Tarkhnarb, Goblin-town) | smaller and goblin-like: big ears, sallow, night eyes |
| `morruhk-*.webp` | Morruhk (Uruk-Morruhk, also written Morrukh) | ritual scarification, a "snuffler's" big snout-like nose, a warg-fur collar |
| `zaugurz-*.webp` | Zaugurz (Uruk-Zaugurz, the snowy far north) | rougher than a Tarkhnarb, blood on the cheeks, a pale snow-fur collar |
| `troll-*.webp` | A troll of no known kind; the fallback for the three below | grey-green stony hide |
| `cavetroll-*.webp` | Cave Troll | covered in dark green scales |
| `hilltroll-*.webp` | Hill Troll | hard scales, brownish grey, a great hammer's haft over the shoulder |
| `mountaintroll-*.webp` | Mountain Troll | the tallest and wildest, wild hair, grey-blue stony hide |
| `numenorean-*.webp` | Black Númenóreans (no subraces) | a black hood, a silver circlet with a red gem, pale |
| `neutral.webp` | No race yet, or one the client does not know | a hooded figure with no face |

Every file: **1024 × 1024, transparent WebP**.

## Framing

- The pane shows the file clipped to a circle: only the inscribed circle
  (centre 512, 512, radius 512) is ever seen. The corners can hold
  anything.
- Head and shoulders, as the placeholders: the head's centre at about
  (512, 480), a little above the middle; the head about 300–340 px wide;
  the shoulders run out of the picture at the circle's bottom (from about
  y 760 down), so no body edge is seen.
- The level ring covers the bottom centre (about the lowest fifth of the
  circle, a third of its width, more in the smaller Medium size): put
  nothing there that must be seen, such as the chin.
- The rim is darkened by the frame's inner shadow (about the outer 10 %
  of the radius): keep the face clear of it.
- The drawings follow the same framing (notes/research/portraits/style.md,
  in a 200 square: scale the numbers by 5.12).
- Through the transparent parts the frame's own background shows: a dark,
  warm glow in the dark themes and pale parchment in Paper. A figure has to
  read on both; a background of its own is allowed but not needed.

## Size on screen

The circle is about 100 CSS px across in a docked pane at the default font,
up to about 180 px with a large font, and grows with a very wide floating
pane (about 340 px at the most in practice). 1024 px is about 3× that
largest size, so the files stay sharp on high-density screens.

## Fallback

The first one that exists is used:

1. the subrace's file of that sex (`cavetroll-male.webp`);
2. its race's file of that sex (`troll-male.webp`): a real image beats a
   drawing;
3. the subrace's own drawing of that sex (or the race's, when the subrace
   is unknown).

- Never the other sex's file: both sexes are drawn, so a missing
  `-female` file shows the woman's drawing, not the man's image.

- Nothing falls back to `neutral.webp`, which is used only for the
  neutral case.
- A file that fails to load falls back to the drawing.
- The replays have no portrait files: the exported HTML replay (no files
  beside it) and the shared replay's frame (its policy allows no image
  from the site) request none. They show no Character pane today.
