#!/usr/bin/env bash
# Area E (side panes, chrome, frame composition): every measurement of the
# 2026-09-30 review, in order. About 2.5 h on the owner's laptop.
#
#   perf/run-all.sh            (from the repository root or anywhere)
#
# Needs: node_modules (Playwright browsers installed), the owner's Cockpit
# log /home/ole/MUME/data/runs/Rasta/2026-09-18T18-11-42.log, ports
# 4241–4249 free. Headless only. Results: perf/results/*.json (+ .log);
# summarise a play/idle/latency/typing file with `node perf/report.ts <file>`.
set -euo pipefail
cd "$(dirname "$0")/.."
R=perf/results
mkdir -p "$R"
log() { echo "== $* (load $(cut -d' ' -f1-3 /proc/loadavg))"; }

log "build variants"
perf/build.sh

log "play log (owner log + synthesized GMCP)"
node perf/gen-play.ts /home/ole/MUME/data/runs/Rasta/2026-09-18T18-11-42.log 88000 3 perf/play-88000-3m.log 7

log "M1 play: base vs exp-rowdiff"
node perf/e-harness.ts play --browsers firefox,chromium --gpu --trace --builds base,exp-rowdiff --configs default --runs 5 --secs 45 --speed 2 --out $R/M1-play-rowdiff.json

log "M2 play: default vs nomap vs nopanes"
node perf/e-harness.ts play --browsers firefox,chromium --gpu --trace --builds base --configs default,nomap,nopanes --runs 5 --secs 45 --speed 2 --out $R/M2-play-configs.json

log "M3 idle with a visible caret: CSS blink vs JS blink vs none"
node perf/e-harness.ts idle --caret --ffprof --browsers firefox --builds base,exp-blinkjs --configs default,noblink,nopanesnoblink --runs 4 --secs 20 --warm 10 --out $R/M3-idle-ff.json
node perf/e-harness.ts idle --caret --browsers chromium --gpu --trace --builds base,exp-blinkjs --configs default,noblink,nopanesnoblink --runs 4 --secs 20 --warm 10 --out $R/M3-idle-cr.json

log "M3b idle, Firefox without the profiler"
node perf/e-harness.ts idle --caret --browsers firefox --builds base,exp-blinkjs --configs default,noblink --runs 4 --secs 20 --warm 10 --out $R/M3b-idle-ff-noprof.json

log "M4 text latency at idle with a visible caret"
node perf/e-harness.ts latency --caret --browsers firefox,chromium --gpu --builds base,exp-blinkjs --configs default,noblink --runs 3 --secs 30 --warm 10 --out $R/M4-latency.json

log "M10 the bench's frame -> paint scenario, blink on vs off"
node perf/e-harness.ts benchpaint --browsers firefox,chromium --gpu --builds base --configs default,noblink --runs 3 --secs 40 --out $R/M10-benchpaint.json

log "M5 typing"
node perf/e-harness.ts typing --ffprof --browsers firefox --builds base,exp-blinkjs --configs default --runs 3 --secs 15 --warm 10 --out $R/M5-typing-ff.json
node perf/e-harness.ts typing --browsers chromium --gpu --trace --builds base,exp-blinkjs --configs default --runs 3 --secs 15 --warm 10 --out $R/M5-typing-cr.json

log "M6 invalidation scope at 20 000 rows (base; drag with the shield)"
node perf/e-inval.ts --browsers chromium,firefox --build base --reps 5
node perf/e-inval.ts --browsers chromium,firefox --build exp-dragshield --reps 5 --actions drag,line,char
node perf/check-dragshield.ts exp-dragshield

log "M7 GMCP handler costs, map worker round trip"
node perf/e-gmcp.ts --build base-nomin --reps 300

log "M8 UI / Comm rings at 1000 entries"
node perf/e-rings.ts

log "M9 play in Firefox with the Gecko profiler: default vs nomap vs nopanes"
node perf/e-harness.ts play --ffprof --browsers firefox --builds base --configs default,mapright,nomap,nopanes --runs 3 --secs 30 --speed 2 --out $R/M9-play-ffprof.json

log "done"
