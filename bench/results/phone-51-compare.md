# Phone text speed: `main` against the stage 51 branch

- Date: 2026-11-11 15:57 UTC
- Commits: `main` fb744906; branch 9c590d54 (with uncommitted changes) (stage 51g's working tree)
- Script: `node bench/phone-bench.ts --no-build --rounds 3` (the same script, copied into a `main` worktree), production builds, the same fixture; the branch with the lens off adds `--set phone.lens.show=false`
- Order: main, branch, branch with the lens off; then the same again. Load average under 2 before each run (the row below)
- Page: `?bench&phone=1`, 390 × 844 at ratio 3, mobile + touch. `main` has the tab-strip layout (output 384 × 812 CSS px); the branch has the phone's game layout (output 384 × 784)

| measure | main 1 | branch 1 | branch, lens off 1 | main 2 | branch 2 | branch, lens off 2 |
|---|---|---|---|---|---|---|
| burst total ms, median of 3 (each round; 79 447 lines) | 1277 (1277, 1262, 1280) | 1280 (1272, 1280, 1310) | 1287 (1287, 1287, 1328) | 1265 (1262, 1286, 1265) | 1306 (1379, 1288, 1306) | 1280 (1271, 1280, 1327) |
| burst longest frame ms (max of 3; median p95) | 29.9; 22.8 | 35.3; 21.0 | 32.7; 23.9 | 26.6; 21.9 | 31.4; 22.7 | 30.3; 22.7 |
| frame → paint ms, median / p95 | 3.9 / 18.0 | 4.0 / 17.9 | 3.9 / 17.9 | 3.8 / 18.9 | 3.9 / 17.1 | 3.8 / 16.8 |
| flush script ms, median / p95 | 0.9 / 1.9 | 1.0 / 1.8 | 0.9 / 1.8 | 0.9 / 1.7 | 0.9 / 1.7 | 0.9 / 1.6 |
| key → send ms, median / p95 | 0.060 / 0.095 | 0.060 / 0.100 | 0.060 / 0.095 | 0.055 / 0.090 | 0.055 / 0.085 | 0.060 / 0.090 |
| load average (1 min) at the start | 1.24 | 1.28 | 1.24 | 1.54 | 0.94 | 1.41 |

Burst, median of the six rounds of each: `main` 1271 ms, branch 1297 ms (+2.1 %), branch with the lens off 1287 ms (+1.3 %).

## What the numbers mean

The branch is at `main`'s text speed: frame → paint, the flush script and key → send are equal, and the burst is within the spread of the rounds, with the lens shown and with it off. The one row that is not equal is the burst's longest single frame: 31–35 ms on the branch (30–33 ms with the lens off) against 27–30 ms on `main`, while the p95 frame is the same (21–24 ms); with three rounds a side that is a difference of a few milliseconds in one frame, not attributed further.

An earlier comparison (stage 51g, before the fix below) had the branch's burst 10–15 % slower and its longest frame longer. That was not the phone layer and not a steady cost of the lens. Attribution, each variant measured twice in alternation with the plain branch (burst total, median, against `main` in the same session):

| variant | burst vs `main` |
|---|---|
| branch, default | +11 … +15 % |
| lens off (`phone.lens.show=false`) | −1 … +3 % |
| phone layer hidden (`display: none`) | +15 % |
| hot key column closed | +16 % |
| map pane hidden by CSS; lens dressing hidden; lens un-placed after load | +11 … +16 % |
| events to the map worker dropped | +10 … +14 % (no change) |
| map worker terminated | +1 % |
| lens with the default (not alternating) tiles | +0 … +4 % |
| lens with its season swap suppressed | at the lens-off level (1281 ms against 1470 ms for the plain branch in the same run) |

The cause: the lens draws Shimrod, a tileset that alternates with MUME's season. The bench opens a fresh profile for every page, so the game clock starts at an estimate; the replayed log then syncs the clock, the season comes out as another one, and the map pane swapped the whole tileset at once: about 120 tile files fetched, decoded and uploaded while the burst was running (seen as 120 requests during the burst, ~180 ms of map worker CPU, and more work on the IO and decode threads). Nothing in `src/phone` runs per line or per frame during a burst (counted: no cockpit layout, no fight card change, no DOM change in the layer).

The fix: on the phone's lens, a season swap after a clock change waits five seconds (`LENS_SEASON_DELAY_MS`, src/panes/map.ts; a computer's Map pane swaps at once, as before). The work itself is not smaller: it happens once, five seconds after the first clock sync on a new device and at each change of season, instead of in the middle of the login text. A returning player has the clock saved and gets no swap at login.

The bench now waits for the phone layer and the lens's map before it measures (`--no-settle` gives the old timing, 300 ms after the first frames); the lens's own start-up (map file and tiles, about 1.3 s of worker time) is therefore not in these numbers, on purpose: it is a one-time cost after Enter MUME, not text speed. `phone-51-before.md` is the baseline taken before stage 51 on a loaded machine; its burst (938 ms) is not comparable with this table's.
