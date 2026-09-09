#!/usr/bin/env bash
#MISE description="Check that the tag, manifest, versions and changelog carry one version"
#MISE dir="{{config_root}}"
set -euo pipefail

exec node scripts/check-release.mjs "$@"
