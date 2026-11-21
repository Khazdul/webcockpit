# Balloon notices: the brief for round 5

Written 2026-11-21 after the owner's verdict on round 4. This file is
the starting point for the next session. It replaces nothing in ADR 0159
yet: the product code under `src/weather/balloons/` is unchanged since
stage 69, and nothing is built until the owner has approved the looks.

## The plan

1. **Next session (round 5): design only.** One revised proposal for
   each passenger in the table below, on the round 4 stage, so the owner
   can try them in the browser. The goal is finished looks he is happy
   with. Expect more than one pass inside the session.
2. **The session after: build.** The approved looks go into the
   application behind the skin seam (`src/weather/balloons/skin.ts`),
   with an addendum to ADR 0159.

## What the direction is now

The concept is settled: **a passenger in a hot-air balloon, with a sign
hung under the basket**. What varies is who rides in it. The player gets
the passenger of the race they play, chosen automatically.

| The player's race | Passenger | State after round 4 |
|---|---|---|
| Elf, half-elf | An elf woman | No sketch |
| Dwarf | A dwarf | `round4/skins/4-dwarf.js`, to revise |
| Man | A human woman | No sketch |
| Hobbit | A hobbit | `round4/skins/5-hobbit.js`, to revise |
| Troll | A troll | `round4/skins/7-troll.js`, to revise |
| Orc, Tarkhnarb | The goblin | `round4/skins/2-goblin-envelope.js`, to revise |
| Orc, Zaugurz | The orc | `round4/skins/6-orc.js`, to revise |
| Black Númenórean | An evil man of Tolkien's kind, who can do magic | No sketch |

The race comes from GMCP at login: `Char.StatusVars` carries `race` and
`subrace` (the client already keeps them, `state.char.status.race`). The
exact strings for every race and subrace are not collected yet; the one
recorded value is `"Man"`. Collect them before the build (the owner can
tell, or MUME's help files can).

That makes eight passengers. Which one flies when the race is not known
(before login, in the demo) is not decided; the goblin is the natural
choice, as the original.

## The owner's verdict on round 4

Round 4 is at `round4/` (open `local.html` from disk, or the published
artifact noted in `progress.md`).

**Liked**

- Skin 2, where the balloon itself shows the rating. He wants this in
  every passenger: the balloons vary in colour and ornament, with a
  strong contrast between low and high ratings. A low rating is a saggy
  balloon mended with patches. Each step up is a better balloon. The
  best one looks brand new, with gold ornament or the like.
- The ornament follows the passenger's people. Orcs and trolls have
  skulls and the like, not gold filigree. Hobbits, elves and dwarves
  each have their own kind of ornament too.
- The dwarf's head ("fantastic"), from round 3 onwards: the drawing, the
  living eyes, the blinking and small movements.
- The hobbit's pipe and the hobbit's fireworks.
- A party hat on superb is acceptable.

**Disliked**

- The flame is drawn in front of the balloon, and the thing that holds
  the flame (the burner) is hard to see in most variants.
- The goblin with a wand. Give it something that fits better.
- Party blowers. A hat and a blower together is too much, and a blower
  is not Tolkien. Find another way.
- Skin 3, "Goblin, dressed for it", as an idea: costumes do not fit the
  theme. Clothes must be what that Tolkien people would really wear.
- The dwarf's head is too large against the basket. Keep the head, make
  it smaller, and show his upper body in armour.
- The orc's pointed ears: make them not pointed, yet still an orc's.
  The orc's two large teeth: remove them.
- The orc's balloons do not differ enough between good and bad ratings.
- Effects around the passenger, such as confetti and the rain cloud.

**General changes he asked for**

- The balloon sits higher above the basket: longer ropes between
  envelope and basket. The envelope may grow, but only by 15 to 20 %.
- The passenger must never hide the flame.
- The flame follows the flight like a real burner. It burns harder just
  before the balloon moves up. On arrival it dies down shortly before
  the balloon stops at the readable spot.

## Rules for round 5 (drawn from the above)

1. **The envelope carries the rating.** A ladder per passenger from
   poor to superb: patched and sagging, then plain, then sound, then
   fine, then new and ornate. The silhouette and the colour must tell
   the steps apart at a distance, not only close up. The special
   notices (unrated, player kill, level up, death, achievement) each
   need an envelope that is not mistaken for a rating step.
2. **Ornament by people.** Decide a vocabulary per passenger before
   drawing: materials, colours, motifs, what "the best" means to them.
3. **The passenger is in character.** Clothes and gear that the people
   would really have. No costumes, no party blowers, no wands in a
   goblin's hand. A party hat on superb is the limit of that humour.
4. **No effects floating around the passenger.** No confetti, no
   weather. Things the passenger holds or does are fine (a pipe, a
   firework he has lit).
5. **Proportions.** The head is not larger than the basket allows; the
   upper body shows. Longer ropes, envelope at most 20 % larger. The
   whole rig is at most 10 % taller than the product's 330 px; the room
   comes from drawing everything 10 to 20 % smaller. Check that the
   sign's text is still readable at that scale.
6. **The burner is a visible object** between basket and envelope, with
   the flame behind the envelope's mouth and in front of nothing else.
   The passenger stands clear of it.
7. **The flame leads the motion.** It rises before a climb and falls
   before a stop. The round 4 stage gives each frame `vy` and `burn`;
   `burn` must be driven ahead of the velocity, not from it.
8. **Keep from round 4:** the sign hung on two ropes or chains from
   fixed points on the basket and redrawn each frame; the living face;
   3 seconds at the readable spot.
9. **One drawing style for all eight**, so they read as one family.
   The dwarf's tinted engraving is the candidate, since it is the one
   the owner praised (see the open questions).

## The owner's answers (2026-11-21)

1. **The goblin stays**, as the Tarkhnarb orc's passenger. The Zaugurz
   orc gets the orc.
2. **Style** (one drawing manner for all, or several): he asked what
   was meant. Explained in the session; no answer yet. Proposed: the
   dwarf's tinted engraving for all eight.
3. **A sign per people**, matching its character. As craft he likes the
   signs of round 4 skins 1, 2 and 5 best (the plank on two ropes from
   a spreader bar, the banner laced to a pole, the hobbit's board on
   cords), because they look the most real. That is a verdict on how
   they are made and hung, not on which people they suit.
4. **The human and the elf are always women.**
5. **Height:** the rig may take at most 10 % more height than today
   (330 px, so about 363 px). To gain room, the whole drawing may be
   scaled down by 10 to 20 % instead.

Still open: the style (2), and the passenger for an unknown race.

## How to work in round 5

- Copy the round 4 stage (`index.html`, `harness.js`, `shot.mjs`) to
  `round5/`. Raise the sheet cell height for the taller rig. Change
  `fly` so `burn` leads the motion.
- Settle the shared parts first, in one skin, and show it to the owner
  before drawing all eight: the rig proportions, the burner, the flame
  timing, the sign. The dwarf is the natural first one.
- Then one subagent per passenger, each given the shared rig as code to
  build on, not as a description to redo. In round 4 every agent drew
  its own rig, and the same faults (flame in front, squat envelope)
  came back seven times.
- Judge motion in the browser, not from stills. Rounds 2 to 4 were
  checked from screenshots only, and the round 2 balloon's poor
  animation was found by the owner.
- Known and unsolved on the stage: three balloons at once overlap in
  the lane; `shot.mjs` timings drift by the time a screenshot takes.

## For the build session afterwards

- The skin seam takes one skin today. It needs a choice by race, with a
  fallback for an unknown race.
- The shared plank (`sign.ts`, `sign.css`) gives way to a sign hung on
  two ropes, drawn per frame.
- The readable time halves in `flight.ts`.
- The rig grows taller than 330 px; check the lane and the reduced
  motion form.
- All of it is an addendum to ADR 0159.
