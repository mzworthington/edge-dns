#!/usr/bin/env bash
# Copy Bitwarden secrets into GitHub Actions and the product Pulumi stack.
# Does not create Cloudflare resources and does not run pulumi up.
#
# Bitwarden project (injected by `bws run`):
#   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID, PULUMI_ACCESS_TOKEN
# Shell, not secrets:
#   BWS_ACCESS_TOKEN, BWS_PROJECT_ID, PULUMI_STACK, DOMAIN
# Pages project and hostnames stay in infra/cloudflare/hosting.yaml.
#
#   export BWS_ACCESS_TOKEN=... BWS_PROJECT_ID=...
#   export PULUMI_STACK=prod DOMAIN=example.com
#   setup-cloudflare-hosting

die() { echo "✗ $*" >&2; exit 1; }

cf_api() {
  curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" "$@"
}

require_bws_secrets() {
  : "${CLOUDFLARE_API_TOKEN:?Add CLOUDFLARE_API_TOKEN to the bws project}"
  : "${CLOUDFLARE_ACCOUNT_ID:?Add CLOUDFLARE_ACCOUNT_ID to the bws project}"
  : "${CLOUDFLARE_ZONE_ID:?Add CLOUDFLARE_ZONE_ID to the bws project}"
  : "${PULUMI_ACCESS_TOKEN:?Add PULUMI_ACCESS_TOKEN to the bws project}"
}

require_matching_zone_id() {
  local domain=$1 resolved=$2 stored=$3
  if [[ -z "$stored" || "$stored" != "$resolved" ]]; then
    echo "CLOUDFLARE_ZONE_ID in bws does not match zone ${domain}" >&2
    return 1
  fi
  printf '%s\n' "$stored"
}

confirm_zone() {
  local resolved name status
  echo "→ Zone ${DOMAIN}"
  resolved=$(cf_api "https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}" \
    | jq -r '.result[0].id // empty')
  [[ -n "$resolved" ]] || die "No Cloudflare zone named ${DOMAIN} (create it in edge-dns first)"
  require_matching_zone_id "$DOMAIN" "$resolved" "$CLOUDFLARE_ZONE_ID" >/dev/null
  name=$(cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
    | jq -r '.result.name // empty')
  status=$(cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
    | jq -r '.result.status // empty')
  echo "  ${name} (${status})"
  [[ "$status" == "active" ]] || die "Zone ${DOMAIN} must already be active on Cloudflare (managed by edge-dns)"
}

publish_github_config() {
  echo "→ GitHub Actions secrets"
  printf '%s' "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN
  printf '%s' "$PULUMI_ACCESS_TOKEN" | gh secret set PULUMI_ACCESS_TOKEN
  echo "→ Pages project and hostnames stay in ${WORK_DIR}/hosting.yaml"
}

write_pulumi_stack() {
  echo "→ Pulumi stack ${STACK} (${WORK_DIR})"
  cd "${ROOT}/${WORK_DIR}"
  pnpm install --frozen-lockfile
  pulumi stack select "${STACK}" 2>/dev/null || pulumi stack init "${STACK}"
  pulumi config set accountId "$CLOUDFLARE_ACCOUNT_ID"
  pulumi config set zoneId "$CLOUDFLARE_ZONE_ID"
  pulumi config set --secret cloudflare:apiToken "$CLOUDFLARE_API_TOKEN"
}

print_done() {
  echo "Done. Run 'cd ${WORK_DIR} && pulumi up' or merge to main (CI runs pulumi + deploy)."
  echo "Pages project and hostnames: ${WORK_DIR}/hosting.yaml"
  echo "Zone owner:    mzworthington/edge-dns (do not create zones from product CI)."
}

apply_hosting() {
  require_bws_secrets
  confirm_zone
  publish_github_config
  write_pulumi_stack
  print_done
}

load_product_root() {
  if [[ -n "${PRODUCT_ROOT:-}" ]]; then
    ROOT="$PRODUCT_ROOT"
  elif [[ -f "${PWD}/package.json" || -d "${PWD}/infra/cloudflare" ]]; then
    ROOT="$PWD"
  else
    ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  fi
}

prepare_bootstrap() {
  local c
  load_product_root
  : "${BWS_ACCESS_TOKEN:?Set BWS_ACCESS_TOKEN}"
  : "${BWS_PROJECT_ID:?Set BWS_PROJECT_ID}"
  : "${PULUMI_STACK:?Set PULUMI_STACK}"
  : "${DOMAIN:?Set DOMAIN (existing Cloudflare zone name)}"
  WORK_DIR="${WORK_DIR:-infra/cloudflare}"
  STACK="${PULUMI_STACK}"
  HOSTING_FILE="${ROOT}/${WORK_DIR}/hosting.yaml"
  [[ -f "$HOSTING_FILE" ]] || die "Missing ${WORK_DIR}/hosting.yaml"
  for c in gh pulumi jq curl pnpm bws; do
    command -v "$c" >/dev/null || die "Missing: $c"
  done
  gh auth status >/dev/null 2>&1 || die "Run: gh auth login"
  export ROOT DOMAIN STACK WORK_DIR HOSTING_FILE BWS_ACCESS_TOKEN BWS_PROJECT_ID
}

if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
  return 0
fi

set -euo pipefail

if [[ "${SETUP_CLOUDFLARE_HOSTING_PHASE:-}" == "apply" ]]; then
  apply_hosting
  exit 0
fi

prepare_bootstrap
bws run --project-id "$BWS_PROJECT_ID" -- \
  env BWS_ACCESS_TOKEN="${BWS_ACCESS_TOKEN}" BWS_PROJECT_ID="${BWS_PROJECT_ID}" \
  SETUP_CLOUDFLARE_HOSTING_PHASE=apply \
  bash "$0"
