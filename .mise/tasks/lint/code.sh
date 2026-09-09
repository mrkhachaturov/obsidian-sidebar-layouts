#!/usr/bin/env bash
#MISE description="ESLint over src/ and tests/ — the Obsidian rules biome cannot express"
#MISE dir="{{config_root}}"
set -euo pipefail

exec eslint "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}" "$@"
