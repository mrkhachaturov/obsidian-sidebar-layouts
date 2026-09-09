#!/usr/bin/env bash
#MISE description="Typecheck, then bundle the production plugin"
#MISE dir="{{config_root}}"
set -euo pipefail

# package.json owns the command: the plugin directory builds with plain npm, in
# an environment where mise does not exist.
exec npm run --silent build
