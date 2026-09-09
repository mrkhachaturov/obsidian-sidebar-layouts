#!/usr/bin/env bash
#MISE description="Build and install into a vault: VAULT=/path mise run plugin:install"
#MISE dir="{{config_root}}"
#MISE depends=["build"]
set -euo pipefail

if [[ -z "${VAULT:-}" ]]; then
  echo "VAULT is unset" >&2
  exit 1
fi

plugin_id=$(node --input-type=module -e 'import fs from "node:fs"; console.log(JSON.parse(fs.readFileSync("manifest.json", "utf8")).id)')
target="${VAULT}/.obsidian/plugins/${plugin_id}"
mkdir -p "${target}"
cp main.js manifest.json styles.css "${target}/"
echo "Installed into ${target}"
