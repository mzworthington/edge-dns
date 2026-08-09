#!/usr/bin/env bash
# Init Pulumi stacks + config for domains in zones.yaml (or CLI args).
# Optionally preview/up and print Cloudflare nameservers for GoDaddy NS cutover.
#
# Prerequisites:
#   - pulumi, pnpm (deps installed; js-yaml available for zones-matrix.cjs)
#   - CLOUDFLARE_ACCOUNT_ID
#   - CLOUDFLARE_API_TOKEN (Zone Read/Write; + DNS/Redirect Edit if vanity)
#   - PULUMI_ACCESS_TOKEN (when using Pulumi Cloud)
#
# Usage:
#   ./scripts/bootstrap-zones.sh --init-only
#   ./scripts/bootstrap-zones.sh --preview cloudymelon.com siliconpanda.com
#   ./scripts/bootstrap-zones.sh --up --only-new
#   ./scripts/bootstrap-zones.sh --up --print-ns
#
# Does not change GoDaddy nameservers — print NS and update the registrar yourself.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MODE="init" # init | preview | up
ONLY_NEW=0
PRINT_NS=0
DRY_RUN=0
DOMAINS=()

usage() {
  sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --init-only) MODE="init"; shift ;;
    --preview) MODE="preview"; shift ;;
    --up) MODE="up"; shift ;;
    --only-new) ONLY_NEW=1; shift ;;
    --print-ns) PRINT_NS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    -*)
      echo "Unknown flag: $1" >&2
      usage 1
      ;;
    *)
      DOMAINS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to read zones.yaml (or pass domain args)" >&2
    exit 1
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] && DOMAINS+=("$line")
  done < <(node scripts/zones-matrix.cjs | jq -r '.[]')
fi

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN" >&2
  exit 1
fi

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ $*"
  else
    "$@"
  fi
}

stack_exists() {
  local domain="$1"
  pulumi stack ls --json 2>/dev/null | jq -e --arg n "$domain" '
    map(select(.name == $n or (.name | endswith("/" + $n)))) | length > 0
  ' >/dev/null 2>&1
}

ensure_stack() {
  local domain="$1"
  if stack_exists "$domain"; then
    echo "==> stack exists: $domain"
    run pulumi stack select "$domain"
  else
    echo "==> stack init: $domain"
    run pulumi stack init "$domain"
  fi

  run pulumi config set accountId "$CLOUDFLARE_ACCOUNT_ID" --stack "$domain"
  run pulumi config set zoneName "$domain" --stack "$domain"
  run pulumi config set --secret cloudflare:apiToken "$CLOUDFLARE_API_TOKEN" --stack "$domain"
}

print_ns() {
  local domain="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "+ pulumi stack output nameServers --stack $domain"
    return
  fi
  echo "--- nameservers for $domain (set these at GoDaddy) ---"
  pulumi stack output nameServers --stack "$domain" 2>/dev/null || {
    echo "(no nameServers output yet — run --up first)" >&2
  }
}

for domain in "${DOMAINS[@]}"; do
  if [[ "$ONLY_NEW" -eq 1 ]] && stack_exists "$domain"; then
    echo "==> skip existing (--only-new): $domain"
    continue
  fi

  ensure_stack "$domain"

  case "$MODE" in
    init) ;;
    preview)
      run pulumi preview --stack "$domain" --non-interactive
      ;;
    up)
      run pulumi up --stack "$domain" --yes --non-interactive
      PRINT_NS=1
      ;;
  esac

  if [[ "$PRINT_NS" -eq 1 ]]; then
    print_ns "$domain"
  fi
done

echo
echo "Done ($MODE). Next:"
echo "  1. Set vanity redirectTo in zones.yaml where needed"
echo "  2. Mail domains: copy MX/SPF/DKIM/DMARC on Cloudflare before NS cutover"
echo "  3. At GoDaddy, replace nameservers with the printed Cloudflare NS"
echo "  4. Wait until zone status is Active, then docs/baselines/<domain>.md"
echo "  5. Product DNS/Pages stay in product repos (docs/add-product-dns.md)"
