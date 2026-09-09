#!/usr/bin/env bash
#MISE description="Run the vitest suite"
#MISE dir="{{config_root}}"
set -euo pipefail

exec vitest run "$@"
