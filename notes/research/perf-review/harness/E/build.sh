#!/usr/bin/env bash
# Area E harness: builds the variants the measurements compare, each into
# perf/builds/<name>/ (production bundle, vite build):
#
#   base            the checked-out tree (must be clean under src/)
#   base-nomin      the same, unminified (readable stacks in traces)
#   exp-<name>      base + <patch dir>/exp-<name>.patch
#
#   perf/build.sh [patch dir]     (default: the directory of this script)
set -euo pipefail
cd "$(dirname "$0")/.."
PATCHES="${1:-$(dirname "$0")}"
if ! git diff --quiet -- src; then
  echo "src/ has local changes; commit or revert them first" >&2
  exit 1
fi
npx vite build --outDir perf/builds/base --logLevel warn
npx vite build --outDir perf/builds/base-nomin --minify false --logLevel warn
for p in "$PATCHES"/exp-*.patch; do
  [ -e "$p" ] || continue
  name="$(basename "$p" .patch)"
  git apply "$p"
  npx vite build --outDir "perf/builds/$name" --logLevel warn || { git apply -R "$p"; exit 1; }
  git apply -R "$p"
  echo "built $name"
done
