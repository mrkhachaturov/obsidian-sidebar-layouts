#!/usr/bin/env bash
#MISE description="Files and exports nothing reaches — knip, as an error rather than a report"
#MISE dir="{{config_root}}"
set -euo pipefail

exec knip "$@"
