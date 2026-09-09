#!/usr/bin/env bash
#MISE description="Typecheck without emitting — the gate esbuild does not give you"
#MISE dir="{{config_root}}"
set -euo pipefail

exec tsc -noEmit -skipLibCheck
