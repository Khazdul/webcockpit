#!/bin/sh
# Re-runs the area-A (output rendering) measurements of the performance
# review of 2026-09-30 with one command, for a quiet machine.
#
#   sh perf/run-all.sh            (from the repository root)
#
# Needs: a clean checkout of the reviewed commit (src/ unmodified) with
# node_modules, this perf/ directory, Playwright's firefox and chromium, the
# owner's logs under /home/ole/MUME/data/runs, and the patches in $P.
# Ports 4201–4209. Headless only. Results (JSON) go to $OUT; each harness
# also prints its table. See A-render.md §2 for what each one measures.
set -e
cd "$(dirname "$0")/.."
P=${P:-/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/A}
OUT=${OUT:-$P/rerun}
mkdir -p "$OUT"
cat /proc/loadavg

# Builds: dist = the production bundle as reviewed; perf/dists/<v> = variants
# with the harness timing patch (flush phases, row-cap knob; harness only).
npm run build
git apply "$P/harness-timing.patch"
npx vite build --base /base/ --outDir perf/dists/base --emptyOutDir --logLevel warn
git apply "$P/exp-background-rows.patch"
npx vite build --base /bgclean/ --outDir perf/dists/bgclean --emptyOutDir --logLevel warn
git apply -R "$P/exp-background-rows.patch"
git apply -R "$P/harness-timing.patch"

python3 perf/scan-logs.py > "$OUT/scan-logs.txt"
python3 perf/frames-stats.py >> "$OUT/scan-logs.txt"

# Q1: the owner's repro and comparison payloads, before / after background rows.
node perf/repro.ts --runs 7 --timed --out "$OUT/repro-base.json"
node perf/repro.ts --variant bgclean --runs 7 --timed --only p24a,p24b,p24s,ansi,info,room,combat --out "$OUT/repro-bgclean.json"
node perf/ab.ts --variants base,bgclean --payloads p24a,p24b,ansi,info,combat --rounds 7 --reps 2 --next --out "$OUT/ab-bg.json"
node perf/lab-report.ts "$OUT/ab-bg.json" --keys script,build,read,post,frame,toPaint
node perf/trace-chromium.ts --variant base --reps 5 --only p24a,p24b,p24s,combat --out "$OUT/trace-base.json"
node perf/trace-chromium.ts --variant bgclean --reps 5 --only p24a,p24b,p24s,combat --out "$OUT/trace-bgclean.json"
node perf/gecko-profile.ts --variant base --reps 4 --only p24a,p24b,p24s,combat --profile "$OUT/gecko-base.json"
node perf/gecko-profile.ts --variant bgclean --reps 4 --only p24a,p24b,p24s,combat --profile "$OUT/gecko-bgclean.json"
node perf/gecko-pipeline.ts "$OUT/gecko-bgclean.json" combat 3

# Q2/Q3/Q4: same-page lab (row builders, CSS toggles, scroll modes).
node perf/lab.ts --set span --rounds 8 --out "$OUT/lab-span.json"
node perf/lab.ts --set css --rounds 8 --payloads p24a,p24s,info,combat --out "$OUT/lab-css.json"
node perf/lab.ts --set scroll --rounds 8 --payloads p24a,p24s,info,combat --out "$OUT/lab-scroll.json"
node perf/nextframe.ts --reps 3 --steps 100 --out "$OUT/nextframe.json"
node perf/nextframe.ts --reps 3 --steps 60 --blocks plain,spans --css ,cv,wc,strict --out "$OUT/nextframe-css.json"

# Q5: catch-up, row caps and content-visibility.
node perf/catchup.ts --variants base,base@500,base@300,base@1000cv,base@500cv --sizes 300,1000,2000,5000 --reps 3 --out "$OUT/catchup.json"

# Long sessions: 20 000 rows, trims, width changes, content-visibility per frame.
node perf/fullback.ts --n 400 --out "$OUT/fullback.json"
node perf/resize.ts --n 10 --out "$OUT/resize.json"
node perf/cvframes.ts --blocks 12 --out "$OUT/cvframes.json"

# Q6: canvas spike.
node perf/canvas.ts --rounds 8 --out "$OUT/canvas.json"
cat /proc/loadavg
