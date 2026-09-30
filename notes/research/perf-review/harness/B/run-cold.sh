#!/bin/sh
# Cold single pass of the owner's repro (help 24-bit colours once, no warm-up),
# fresh browser each repetition, base vs prototype. Area B.
#   perf/run-cold.sh [reps] [builds]
cd "$(dirname "$0")/.."
reps="${1:-5}"
builds="${2:-dist-base,dist-exp5}"
out=/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B
for b in chromium firefox; do
  for r in $(seq 1 "$reps"); do
    echo "== $b rep $r; load $(cat /proc/loadavg)"
    node perf/browser-ingest.ts --builds "$builds" --browsers "$b" --scenarios repro1 --rounds 1 --warm 0 --out "$out/cold-$b-$r.json" 2>&1 | grep -E "dist-" | grep -v page
  done
done
