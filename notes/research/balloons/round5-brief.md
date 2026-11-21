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
| Elf, half-elf | An elf girl | No sketch |
| Dwarf | A dwarf | `round4/skins/4-dwarf.js`, to revise |
| Man | A human | No sketch |
| Hobbit | A hobbit | `round4/skins/5-hobbit.js`, to revise |
| Troll | A troll | `round4/skins/7-troll.js`, to revise |
| Orc (Tarkhnarb or Zaugurz) | An orc | `round4/skins/6-orc.js`, to revise |
| Black Númenórean | An evil man of Tolkien's kind, who can do magic | No sketch |

The race comes from GMCP at login: `Char.StatusVars` carries `race` and
`subrace` (the client already keeps them, `state.char.status.race`). The
exact strings for every race and subrace are not collected yet; the one
recorded value is `"Man"`. Collect them before the build (the owner can
tell, or MUME's help files can).

The goblin has no race in this table. Whether it stays (as the passenger
when the race is unknown, before login or in the demo) is an open
question, see below.

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
   whole rig must still fit: say what height it needs, since the product
   rig is 330 px today.
6. **The burner is a visible object** between basket and envelope, with
   the flame behind the envelope's mouth and in front of nothing else.
   The passenger stands clear of it.
7. **The flame leads the motion.** It rises before a climb and falls
   before a stop. The round 4 stage gives each frame `vy` and `burn`;
   `burn` must be driven ahead of the velocity, not from it.
8. **Keep from round 4:** the sign hung on two ropes or chains from
   fixed points on the basket and redrawn each frame; the living face;
   3 seconds at the readable spot.
9. **One drawing style for all seven**, so they read as one family.
   The dwarf's tinted engraving is the candidate, since it is the one
   the owner praised (see the open questions).

## Open questions for the owner

Asked at the end of the 2026-11-21 session; answers go here.

1. Does the goblin stay, as the passenger when the race is not known
   (before login, in the demo), or does it go?
2. One style for all (the dwarf's engraving), or may they differ?
3. The sign: one kind for everybody, or a sign in each people's own
   material (the dwarf's metal plate, the orc's nailed plank)?
4. The human: a man, a woman, or either at random? And is the elf
   always a girl?
5. Whose passenger shows for a kill by somebody else in the group, if
   that ever applies? (Today only the player's own events fly.)

## How to work in round 5

- Copy the round 4 stage (`index.html`, `harness.js`, `shot.mjs`) to
  `round5/`. Raise the sheet cell height for the taller rig. Change
  `fly` so `burn` leads the motion.
- Settle the shared parts first, in one skin, and show it to the owner
  before drawing all seven: the rig proportions, the burner, the flame
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
