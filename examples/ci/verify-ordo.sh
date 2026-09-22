#!/usr/bin/env bash

set -euo pipefail

project_root="${1:-.}"
content_root="${2:-}"

if [[ -n "${content_root}" ]]; then
  ordo doctor "${project_root}" --json
  ordo install "${project_root}" --content-root "${content_root}" --dry-run --json
else
  ordo doctor "${project_root}" --json
  ordo install "${project_root}" --dry-run --json
fi
