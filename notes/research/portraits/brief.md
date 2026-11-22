# Character portraits: the brief for the night pass

Written 2026-11-23 with the owner, for one long session whose only goal
is the best portraits we can draw. They replace the crude placeholders of
stage 77 part E (`src/panes/portrait-figures.ts`) and will be the
portraits for a long time, until the owner has generated raster images.

## What the owner wants

- **One style through all of them.** The style guide is the **balloon
  dwarf** of stage 75 (`src/weather/balloons/passengers/dwarf.ts`, its
  mockup `notes/research/balloons/round5/skins/dwarf.js`): the tinted
  engraving — wobbly pen line, hatched shadows, muted tints, paper grain,
  living eyes drawn with lids, lashes lines and a catch light. The
  owner: the balloon passengers turned out "very good", the dwarf
  "especially good".
- **A subrace is a variation on its race, never a new style or a new
  creature.** Each race first gets a **base figure** (also the fallback
  when the subrace is unknown); its subraces are that figure with their
  own marks. **Exaggerate each subrace's most obvious marks** (a
  Longbeard's beard, a Firebeard's red, a Broadbeam's width).
- **Both sexes for everything.** Every id is drawn as a man and as a
  woman. The app shows the men for now; later the owner will find out how
  to tell a character's sex, and then the women are ready. The neutral
  figure is one, hooded and sexless.
- **Still images.** No blinking, no motion, ever (the owner).
- **Large first, readable in Medium.** Detail and shading for Large
  (about 100 px across docked, up to about 180 px with a large font);
  in Medium (about 40 px) silhouette and colour must still tell them
  apart. The level ring covers the bottom centre (about the lowest fifth
  of the circle, a third of its width, more in Medium): keep the chin and
  mouth above it. The rim is darkened by the frame's inner shadow.
- **Done when the owner wakes:** built into the app on a branch, plus a
  contact sheet and a mockup page with every portrait in Large and
  Medium, dark and Paper, man and woman. The owner looks and merges.

## The ids (28; 27 drawn twice, neutral once: 55 drawings)

Look notes: MUME's help where it says anything (mume.org/help/<name>,
docs.mume.org "Guide Race and Subraces"), else Tolkien (marked T). The
research is in `notes/research/portraits/subraces.md`.

| Race (base id) | Subraces | Marks to exaggerate |
|---|---|---|
| Men (`human`) | `dunadan`, `eriadorian`, `rohirrim` | Dúnadan (T): tall, weathered ranger, dark hair, keen grey eyes, dark green hood, the star brooch. Eriadorian: the common folk of Eriador and Bree — plain, ruddy, homespun, an everyday face. Rohirrim: "tall, blond-haired, often blue-eyed", long braids, green and gold, a horse motif |
| `beorning` (a Man, no subraces; also a Bear) | — | fierce, huge, shaggy; bear-fur on the shoulders, bear-ear hood or the like |
| Elves (`elf`) | `noldo`, `sinda`, `silvan` | Noldo (T): dark hair, bright grey eyes, a jewelled circlet (the gem-smiths), deep blue. Sinda (T): the Grey Elves, silver hair, grey mantle, pale. Silvan (T): wood-elves, auburn/brown, green hood, leaves, a bowstring across the chest |
| `halfelf` (no subraces) | — | "resemble Men more than Elves": a Man's face, ears only slightly pointed |
| Dwarves (`dwarf`) | `longbeard`, `firebeard`, `broadbeam` | (houses, MUME gives only their bonuses; the names lead) Longbeard: a beard to the belt, braided, grey-white, Durin's blue. Firebeard: flame-red beard and brows, braids, a temper. Broadbeam: enormously broad shoulders and jaw, black beard, heavy plate — calm and immovable |
| Hobbits (`hobbit`) | `fallohide`, `harfoot`, `stoor` | about half a man's size, curly hair. Fallohide: "taller, slimmer, fairer", fair hair, pale. Harfoot: "shorter, smaller, browner skin", no beard, dark curls. Stoor: "heftiest", round face, the only hobbits with facial hair (sideburns or a beard) |
| Orcs (`orc`) | `tarkhnarb`, `morruhk`, `zaugurz` | Tarkhnarb: Goblin-town, tunnel-born, smaller and goblin-like (as the balloon goblin). Morruhk: "ritualistic scarification marks", "snufflers" — a big snuffling nose, warg fur. Zaugurz: the snowy far north, fearless, the roughest — blood on the cheeks (the owner), snow fur, as the balloon orc |
| Trolls (`troll`) | `cavetroll`, `hilltroll`, `mountaintroll` | huge, bulky, natural hide armour. Cave: "covered in dark green scales". Hill: "hard scales", a great hammer. Mountain: "the tallest and wildest", wild hair |
| `numenorean` (Black Númenórean, no subraces) | — | "imposing in their height, with angular features", proud, a sorcerer's dark (as the balloon numenorean) |
| `neutral` | — | no race known: a hooded figure, no face |

The eight balloon passengers already show how each people looks in this
style (`src/weather/balloons/passengers/<id>.ts`; the human and the elf
there are women). Start each race from its passenger's head where one
exists, so the portraits and the balloons are the same peoples.

## How to work (recommended)

1. **Main session sets up the stage**: a mockup page
   `notes/research/portraits/stage/` that draws every id in the real disc
   (the card's `.wc-cc-disc`, its size and inner shadow, the level ring
   on top) at Large and Medium, dark and Paper, man and woman, and a
   `shot.mjs` (Playwright, as `notes/research/balloons/round5/shot.mjs`)
   that writes contact sheets. Share the engraving kit (`filt`, `hatch`,
   `INK` from `src/weather/balloons/rig.ts`) rather than copying it.
2. **The style lead (one agent) draws the dwarves first**: the base
   dwarf and the three houses, man and woman, from the balloon dwarf's
   head. It writes `notes/research/portraits/style.md`: the frame box and
   head placement, line weights at both sizes, light from one side,
   palette rules, how eyes, hair and hatching are drawn, what a female
   variant changes and what it keeps. The main session judges it against
   the sheets before anything else is drawn (the owner is asleep: the
   main session is the judge).
3. **One agent per race** (in parallel, each given the style guide and
   the dwarves as code to build on): men with the Beorning, elves with
   the half-elf, hobbits, orcs, trolls, and the Black Númenórean with the
   neutral figure. Each draws its base first, then the subraces as
   variations, man and woman, and checks its own sheet.
4. **A consistency review** by a fresh agent given only the sheets and
   the style guide: what breaks the common thread, which pair cannot be
   told apart in Medium, which face is under the ring. Fixes go back to
   the race agents.
5. **Build** (one agent or the main session): the drawings into the
   app on the branch `stage-77-portraits` from main.

## Rules for the build

- Today's code: `src/panes/portrait.ts` (`portraitOf`, the raster
  fallback chain), `portrait-figures.ts` (the shapes), `character-dom.ts`
  `setPortrait`, `src/gmcp/race.ts` (`raceKind`, `subraceKind`), ADR 0166
  addenda 10–11, `public/portraits/README.md`. The ids and the fallback
  chain stay.
- **A sex parameter** (`male` | `female`, `male` for now with no way to
  set it yet) reaches the drawing and the raster names. The raster files
  become `<id>-male.webp` / `<id>-female.webp` (and `neutral.webp`),
  falling back as today; README and ADR say so.
- **Cost.** The drawings use SVG filters (turbulence and displacement).
  The card repaints on every prompt; a filter must not be re-run then.
  Measure in Firefox with `#perf` (ADR 0135) and, if needed, bake each
  portrait once into an image (for example draw it to a canvas and use a
  `data:` or `blob:` URL, both allowed by the CSPs, the share frame's
  `img-src data: blob:` too). The exported HTML replay must still work
  with no files beside it.
- **Size.** 55 drawings will not belong in the main bundle: one lazy
  chunk per race (as the balloon passengers, `passenger.ts`
  `loadPassenger`), only the player's race fetched; the placeholder or
  the neutral figure while it loads.
- Still images only: no animation, no CSS transitions on them.
- Tests: unit for the lookup with sex, the Character e2e files, then the
  full e2e at 5 workers **alone on the machine** at the end (CLAUDE.md:
  rerun a failing file alone before calling it a regression; restore
  `docs/stages/img` if a run overwrote it). Agents never use port 5173;
  each its own `WC_E2E_PORT`. Drawing agents work on the stage page, not
  under `src/`, so they never run e2e at the same time.
- Record the decisions as ADR 0166 addendum 12; the stage file
  (`docs/stages/77-character-pane.md`) gets a "Portrait pass" section with
  a short test guide; `progress.md` gets the session log entry.

## Not in this pass

- Stage 77 F (Group) is stopped for a direction pass with the owner:
  what Group and Character each show, where the fight card belongs. Do
  not touch Group or the card's layout.
- The framing may be tuned later with the layout (part H).
- Detecting the character's sex.
