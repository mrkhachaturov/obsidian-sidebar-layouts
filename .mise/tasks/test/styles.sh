#!/usr/bin/env bash
#MISE description="Check that styles.css and the code agree about class names"
#MISE dir="{{config_root}}"
set -euo pipefail

exec node scripts/check-styles.mjs
