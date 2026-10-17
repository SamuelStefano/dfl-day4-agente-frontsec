#!/usr/bin/env bash
# Runs the deterministic solver on a task folder WITHOUT any model, then the task's tests.
# Usage: evals/run-solver.sh <task-folder>
# The task folder has environment/ and tests/ (public, and hidden if you have it).
set -euo pipefail
TASK="$(cd "$1" && pwd)"
AGENT="$(cd "$(dirname "$0")/.." && pwd)"
WS="$(mktemp -d)"
cp -r "$TASK/environment/." "$WS/"
mkdir -p "$WS/.opencode"
cp -r "$TASK/tests" "$WS/tests"
cp -r "$AGENT/skills" "$WS/.opencode/skills"
cd "$WS"
npm ci --ignore-scripts --no-audit --no-fund >/dev/null
node .opencode/skills/frontsec/solve.mjs
node .opencode/skills/checar-saida/check.mjs
npx vitest run tests
echo "workspace: $WS"
