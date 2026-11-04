#!/usr/bin/env bash
# Local preview convenience launcher; reuses the existing PostgreSQL/Compose application.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
website_port=""
website_setup_only=false
website_no_build=false
while (($#)); do
  case "$1" in
    --port) [[ $# -ge 2 ]] || { echo 'Provide a port after --port.' >&2; exit 1; }; website_port="$2"; shift 2 ;;
    --setup-only) website_setup_only=true; shift ;;
    --no-build) website_no_build=true; shift ;;
    --help) echo 'Usage: bash scripts/start-website.sh [--port 18081] [--setup-only] [--no-build]'; exit 0 ;;
    *) echo 'Unknown argument. Use --help.' >&2; exit 1 ;;
  esac
done
command -v node >/dev/null || { echo 'Install Node.js 24+ first.' >&2; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' || { echo 'Node.js 24+ is required.' >&2; exit 1; }
if [[ -z "$website_port" ]]; then
  website_port="$(node --input-type=module -e 'import {existsSync,readFileSync} from "node:fs"; console.log(existsSync(".env.lab") ? readFileSync(".env.lab","utf8").match(/^FRONTEND_PORT=(\d+)$/m)?.[1] || "8081" : "8081")')"
fi
[[ "$website_port" =~ ^[0-9]{4,5}$ ]] || { echo 'Choose a valid local port (1024–65535).' >&2; exit 1; }
website_port="$((10#$website_port))"
((website_port>=1024 && website_port<=65535 && website_port!=8080 && website_port!=8090)) || { echo 'Choose an available port; preserve 8080 and 8090.' >&2; exit 1; }
if [[ "$website_setup_only" == false ]]; then
  command -v docker >/dev/null || { echo 'Install Docker Engine and Docker Compose first.' >&2; exit 1; }
fi
if [[ ! -e .env.lab ]]; then
  printf 'Choose a local owner password (14–256 characters; hidden): ' >&2
  IFS= read -r -s website_password || { printf '\nPassword input required.\n' >&2; exit 1; }
  printf '\n' >&2
  trap 'unset website_password' EXIT
  printf '%s' "$website_password" | FRONTEND_PORT="$website_port" node scripts/init-lab-env.mjs
  unset website_password
else
  echo 'Using existing private configuration; it will not be overwritten.'
fi
if [[ "$website_setup_only" == true ]]; then
  echo 'Private configuration ready. Run this script again without --setup-only to start.'
  exit 0
fi
website_args=(up)
if [[ "$website_no_build" == true ]]; then website_args+=(--no-build); fi
FRONTEND_PORT="$website_port" node scripts/website.mjs "${website_args[@]}"
