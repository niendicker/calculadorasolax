#!/usr/bin/env bash
# Stages everything, shows what would be committed, and only commits + pushes
# after explicit confirmation. Deliberately not a silent one-shot: the
# confirmation step is the point, so it doesn't skip review even when run
# in a hurry.
#
# Usage:
#   scripts/commit-push.sh "mensagem do commit"
#   scripts/commit-push.sh "mensagem do commit" --yes   # pula a confirmação

set -euo pipefail

message="${1:-}"
auto_confirm="${2:-}"

if [ -z "$message" ]; then
  echo "Uso: scripts/commit-push.sh \"mensagem do commit\" [--yes]" >&2
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "Nada staged para commitar."
  exit 0
fi

echo "== git status =="
git status --short

echo
echo "== arquivos staged =="
git diff --cached --stat

branch="$(git rev-parse --abbrev-ref HEAD)"
echo
echo "Branch: $branch"
echo "Mensagem: $message"

if [ "$auto_confirm" != "--yes" ]; then
  read -r -p "Commitar e dar push? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Cancelado."; exit 1 ;;
  esac
fi

git commit -m "$message"
git push origin "$branch"
