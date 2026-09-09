#!/usr/bin/env bash
#MISE description="Regenerate the tables of contents in the documents that carry one"
#MISE dir="{{config_root}}"
set -euo pipefail

main() {
  doctoc --title '## Contents' README.md > /dev/null
  doctoc --title '# Contributing' CONTRIBUTING.md > /dev/null
  doctoc --title '# Releasing' .github/RELEASING.md > /dev/null

  if [[ ${CI-} && $(git ls-files --other --modified --exclude-standard -- README.md CONTRIBUTING.md .github/RELEASING.md) ]]; then
    echo "A table of contents is out of date:"
    git -c color.ui=always status -- README.md CONTRIBUTING.md .github/RELEASING.md | grep --color=no '\[31m'
    echo "Please run the following locally:"
    echo "  mise run lint:docs"
    exit 1
  fi
}

main "$@"
