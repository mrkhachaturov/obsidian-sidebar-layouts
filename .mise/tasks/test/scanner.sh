#!/usr/bin/env bash
#MISE description="The stylesheet, under the ruleset the community directory scans with"
#MISE dir="{{config_root}}"
set -euo pipefail

# Their scanner reports these as warnings and still passes the job, so the
# verdict lives in a log nobody reads. Here a warning is a failure.
exec stylelint styles.css --max-warnings 0
