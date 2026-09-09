#!/usr/bin/env bash
#MISE description="Measure source coverage with the full test suite"
#MISE dir="{{config_root}}"
set -euo pipefail

exec vitest run --coverage "$@"
