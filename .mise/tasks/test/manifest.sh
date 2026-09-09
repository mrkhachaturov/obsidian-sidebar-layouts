#!/usr/bin/env bash
#MISE description="The manifest and the release files, under the directory's own rules"
#MISE dir="{{config_root}}"
set -euo pipefail

exec node scripts/check-manifest.mjs
