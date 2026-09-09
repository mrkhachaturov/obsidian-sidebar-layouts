#!/usr/bin/env bash
#MISE description="Watch src and rebuild the development plugin"
#MISE dir="{{config_root}}"
set -euo pipefail

exec node esbuild.config.mjs
