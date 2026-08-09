#!/usr/bin/env bash
# Rotate CLOUDFLARE_API_TOKEN into Bitwarden Secrets Manager + GitHub Actions.
#
# Canonical home: mzworthington/edge-dns.
#
# Prerequisites:
#   - bws, gh, jq, curl
#   - BWS_ACCESS_TOKEN in the environment
#   - gh auth login (repo admin on target repos)
#
# Token input (first match wins):
#   1) CLOUDFLARE_API_TOKEN env
#   2) --token-file PATH  (use - for stdin)
#   3) interactive prompt (hidden)
#
# Targets:
#   BWS  — every project that already has key CLOUDFLARE_API_TOKEN
#          (override with BWS_PROJECT_IDS=id1,id2)
#   GitHub — GH_REPOS (default below)
#
# Usage:
#   export BWS_ACCESS_TOKEN=...
#   export CLOUDFLARE_API_TOKEN=...   # new token
#   ./scripts/sync-cloudflare-api-token.sh
#
#   ./scripts/sync-cloudflare-api-token.sh --dry-run
#   ./scripts/sync-cloudflare-api-token.sh --token-file - <<<"$NEW_TOKEN"
#   GH_REPOS='mzworthington/edge-dns,mzworthington/archlens' ./scripts/sync-cloudflare-api-token.sh
#
set -euo pipefail

SECRET_KEY="${SECRET_KEY:-CLOUDFLARE_API_TOKEN}"
DRY_RUN=0
SKIP_GITHUB=0
TOKEN_FILE=""

# Product + control-plane repos that use Cloudflare CI today.
DEFAULT_GH_REPOS=(
  mzworthington/edge-dns
  mzworthington/archlens
  mzworthington/mzworthington
  mzworthington/gpio-build-monitor
)

usage() {
  sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

die() { echo "✗ $*" >&2; exit 1; }
info() { echo "→ $*"; }
ok() { echo "✓ $*"; }
warn() { echo "⚠ $*" >&2; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-github) SKIP_GITHUB=1; shift ;;
    --token-file)
      TOKEN_FILE="${2:-}"
      [[ -n "$TOKEN_FILE" ]] || die "--token-file requires a path (or -)"
      shift 2
      ;;
    *) die "Unknown arg: $1 (try --help)" ;;
  esac
done

for c in jq curl bws; do
  command -v "$c" >/dev/null || die "Missing: $c"
done
[[ -n "${BWS_ACCESS_TOKEN:-}" ]] || die "Set BWS_ACCESS_TOKEN"
if [[ "$SKIP_GITHUB" != "1" ]]; then
  command -v gh >/dev/null || die "Missing: gh (or pass --skip-github)"
  gh auth status >/dev/null 2>&1 || die "Run: gh auth login"
fi

read_token() {
  local t=""
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    t="$CLOUDFLARE_API_TOKEN"
  elif [[ -n "$TOKEN_FILE" ]]; then
    if [[ "$TOKEN_FILE" == "-" ]]; then
      IFS= read -r t || true
    else
      [[ -f "$TOKEN_FILE" ]] || die "Token file not found: $TOKEN_FILE"
      IFS= read -r t <"$TOKEN_FILE" || true
    fi
  elif [[ -t 0 ]]; then
    printf 'New Cloudflare API token: ' >&2
    IFS= read -rs t
    printf '\n' >&2
  else
    die "Set CLOUDFLARE_API_TOKEN, pass --token-file, or run interactively"
  fi
  t="${t#"${t%%[![:space:]]*}"}"
  t="${t%"${t##*[![:space:]]}"}"
  [[ -n "$t" ]] || die "Empty token"
  printf '%s' "$t"
}

validate_token() {
  local token=$1 body success
  body=$(curl -sS -H "Authorization: Bearer ${token}" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify" || true)
  success=$(jq -r '.success // false' <<<"$body")
  if [[ "$success" != "true" ]]; then
    # Some account-owned tokens cannot hit /user/tokens/verify; fall back.
    body=$(curl -sS -H "Authorization: Bearer ${token}" \
      "https://api.cloudflare.com/client/v4/accounts?per_page=1" || true)
    success=$(jq -r '.success // false' <<<"$body")
  fi
  [[ "$success" == "true" ]] || die "Cloudflare rejected the token (verify failed)"
  ok "Cloudflare token verifies"
}

bws_put() {
  local project_id=$1 key=$2 val=$3 id
  id=$(bws -t "$BWS_ACCESS_TOKEN" secret list "$project_id" -o json \
    | jq -r --arg k "$key" '.[]?|select(.key==$k)|.id' | head -1)
  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ -n "$id" && "$id" != "null" ]]; then
      info "[dry-run] bws edit $key in project $project_id (id=$id)"
    else
      info "[dry-run] bws create $key in project $project_id"
    fi
    return 0
  fi
  if [[ -n "$id" && "$id" != "null" ]]; then
    bws -t "$BWS_ACCESS_TOKEN" secret edit --key "$key" --value "$val" "$id" >/dev/null
    ok "bws updated $key ($project_id)"
  else
    bws -t "$BWS_ACCESS_TOKEN" secret create "$key" "$val" "$project_id" >/dev/null
    ok "bws created $key ($project_id)"
  fi
}

discover_bws_projects() {
  local projects json pid has
  if [[ -n "${BWS_PROJECT_IDS:-}" ]]; then
    IFS=',' read -r -a projects <<<"$BWS_PROJECT_IDS"
    for pid in "${projects[@]}"; do
      pid="$(echo "$pid" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
      [[ -n "$pid" ]] && printf '%s\n' "$pid"
    done
    return 0
  fi

  json=$(bws -t "$BWS_ACCESS_TOKEN" project list -o json)
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    has=$(bws -t "$BWS_ACCESS_TOKEN" secret list "$pid" -o json \
      | jq -r --arg k "$SECRET_KEY" 'any(.[]?; .key==$k)')
    if [[ "$has" == "true" ]]; then
      printf '%s\n' "$pid"
    fi
  done < <(jq -r '.[].id // empty' <<<"$json")
}

gh_repos() {
  local repos r
  if [[ -n "${GH_REPOS:-}" ]]; then
    IFS=',' read -r -a repos <<<"$GH_REPOS"
  else
    repos=("${DEFAULT_GH_REPOS[@]}")
  fi
  for r in "${repos[@]}"; do
    r="$(echo "$r" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    [[ -n "$r" ]] && printf '%s\n' "$r"
  done
}

sync_github() {
  local token=$1 repo
  while IFS= read -r repo; do
    [[ -n "$repo" ]] || continue
    if [[ "$DRY_RUN" == "1" ]]; then
      info "[dry-run] gh secret set $SECRET_KEY -R $repo"
      continue
    fi
    if printf '%s' "$token" | gh secret set "$SECRET_KEY" -R "$repo"; then
      ok "GitHub secret $SECRET_KEY → $repo"
    else
      warn "Failed to set $SECRET_KEY on $repo"
    fi
  done < <(gh_repos)
}

main() {
  local token project count

  token=$(read_token)
  validate_token "$token"

  count=0
  while IFS= read -r project; do
    [[ -n "$project" ]] || continue
    bws_put "$project" "$SECRET_KEY" "$token"
    count=$((count + 1))
  done < <(discover_bws_projects)
  if [[ "$count" -eq 0 ]]; then
    warn "No BWS projects targeted. Set BWS_PROJECT_IDS=id1,id2 or ensure projects already contain $SECRET_KEY"
  else
    ok "BWS: $count project(s)"
  fi

  if [[ "$SKIP_GITHUB" != "1" ]]; then
    sync_github "$token"
  fi

  echo
  ok "Done. CI picks up the new token on the next workflow run."
  info "Re-run failed edge-dns applies with: gh run rerun <run-id> --failed -R mzworthington/edge-dns"
}

main
