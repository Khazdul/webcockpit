#!/bin/sh
# Builds the current working tree into perf/dists/<name>/ under the base /<name>/.
#   sh perf/build-variant.sh <name>
set -e
cd "$(dirname "$0")/.."
npx vite build --base "/$1/" --outDir "perf/dists/$1" --emptyOutDir --logLevel warn
