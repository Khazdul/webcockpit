#!/bin/sh
# Runs the browser profiles of area B one after the other (see perf/browser-profile.ts).
#   perf/run-profiles.sh dist-prof-base "big big-gmcp" "chromium firefox"
cd "$(dirname "$0")/.."
build="${1:-dist-prof-base}"
scens="${2:-big big-gmcp}"
browsers="${3:-chromium firefox}"
out=/tmp/claude-1000/-home-ole-proj-webcockpit/839d0ad2-3f20-4e68-a808-1e236720a92c/scratchpad/perf/B
for s in $scens; do
  for b in $browsers; do
    echo "== $b $s $build; load $(cat /proc/loadavg)"
    node perf/browser-profile.ts --build "$build" --browser "$b" --scenario "$s" > "$out/prof-$b-$s-$build.txt" 2>&1
    rm -f "$out/$b-$s-$build.gecko.json"
  done
done
echo "done; load $(cat /proc/loadavg)"
