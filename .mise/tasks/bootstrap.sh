#!/usr/bin/env bash
#MISE description="Install the exact npm dependency tree from package-lock.json"
#MISE dir="{{config_root}}"
set -euo pipefail

exec npm ci
