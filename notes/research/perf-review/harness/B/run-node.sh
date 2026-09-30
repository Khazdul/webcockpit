#!/bin/sh
# Builds and runs one Node perf harness of area B.
#   perf/run-node.sh node-ingest [args…]
#   NODE_FLAGS="--cpu-prof --cpu-prof-dir=/tmp/x" perf/run-node.sh node-profile …
set -e
cd "$(dirname "$0")/.."
name="$1"
shift
node perf/build-node.mjs "$name" >/dev/null
exec node $NODE_FLAGS "perf/out/$name.mjs" "$@"
