#!/usr/bin/env bash
set -euo pipefail
# Pinned upstream release; verify bytes before executing. No repository/npm dependency.
umask 077
lint_tmp="$(mktemp -d)"
trap 'rm -rf "$lint_tmp"' EXIT
curl --fail --silent --show-error --location \
  https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz \
  --output "$lint_tmp/actionlint.tar.gz"
printf '%s  %s\n' '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8' "$lint_tmp/actionlint.tar.gz" | sha256sum --check --status
tar -xzf "$lint_tmp/actionlint.tar.gz" -C "$lint_tmp" actionlint
"$lint_tmp/actionlint" -color -shellcheck=""
