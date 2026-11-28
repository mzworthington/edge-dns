#!/usr/bin/env bash
# Bootstrap product Cloudflare Pages secrets + Pulumi stack config.
# Validates bws secrets (optional), syncs to GitHub Actions, configures Pulumi.
# Does not run pulumi preview/up. Does not create zones (edge-dns owns zones).
#
# Canonical home: mzworthington/edge-dns. Product repos should call this via the
# thin shim under examples/product-cloudflare/bin/setup-cloudflare-hosting.sh
# (or copy that shim into their repo).
#
# Prefers values from the product repo-root `.env` (gitignored).
# Shell-exported vars override `.env`. CI uses GitHub secrets/vars instead.
#
# Requires (env or .env):
#   PULUMI_STACK, DOMAIN (existing Cloudflare zone name), PAGES_PROJECT_NAME
#   Hostnames — one of:
#     PAGES_HOSTNAMES=app.example.com[,staging.example.com]
#     WWW_DOMAIN=www.example.com   # legacy apex+www shape (also sets apexDomain)
# Optional:
#   BWS_ACCESS_TOKEN, BWS_PROJECT_ID
#   WORK_DIR=infra/cloudflare
#
# Usage (from a product repo root, via shim or direct clone):
#   cp .env.example .env   # edit hostnames (+ BWS_* or CLOUDFLARE_API_TOKEN)
#   bin/setup-cloudflare-hosting.sh

die() { echo "✗ $*" >&2; exit 1; }

pages_hostnames_json() {
  local raw=$1
  local json='['
  local h
  local -a hostnames
  IFS=',' read -r -a hostnames <<< "$raw"
  for h in "${hostnames[@]}"; do
    h="$(echo "$h" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
    [[ -n "$h" ]] || continue
    if [[ "$json" != '[' ]]; then
      json+=', '
    fi
    json+="\"${h}\""
  done
  json+=']'
  if [[ "$json" == '[]' ]]; then
    echo "PAGES_HOSTNAMES produced an empty hostname list" >&2
    return 1
  fi
  printf '%s\n' "$json"
}

prefer_resolved_zone_id() {
  local domain=$1 resolved=$2 existing=${3:-}
  if [[ -n "$existing" && "$existing" != "$resolved" ]]; then
    echo "  ⚠ CLOUDFLARE_ZONE_ID from env/bws does not match zone ${domain}" >&2
    echo "    using zone id for ${domain} instead (not overwriting shared bws secret)" >&2
  fi
  printf '%s\n' "$resolved"
}

select_cloudflare_account_id() {
  local existing=${1:-}
  if [[ -n "$existing" ]]; then
    printf '%s\n' "$existing"
    return 0
  fi
  local -a accounts=()
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && accounts+=("$line")
  done
  if [[ ${#accounts[@]} -eq 1 ]]; then
    printf '%s\n' "${accounts[0]%%$'\t'*}"
    return 0
  fi
  if [[ ${#accounts[@]} -eq 0 ]]; then
    echo "No Cloudflare accounts visible for this API token" >&2
    return 1
  fi
  printf '%s\n' "${accounts[@]}" | sed 's/^/  /' >&2
  echo "CLOUDFLARE_ACCOUNT_ID required when more than one account is visible" >&2
  return 1
}

require_secret() {
  local name=$1
  if [[ "${USE_BWS:-0}" == "1" ]]; then
    [[ -n "${!name:-}" ]] || die "${name} not set; add it to bws project ${BWS_PROJECT_ID}"
  else
    [[ -n "${!name:-}" ]] || die "${name} not set"
  fi
}

bws_put() {
  local key=$1 val=$2 id
  [[ "${USE_BWS:-0}" == "1" ]] || return 0
  : "${BWS_ACCESS_TOKEN:?Missing BWS_ACCESS_TOKEN}"
  id=$(bws -t "$BWS_ACCESS_TOKEN" secret list "$BWS_PROJECT_ID" -o json \
    | jq -r --arg k "$key" '.[]?|select(.key==$k)|.id' | head -1)
  if [[ -n "$id" && "$id" != "null" ]]; then
    bws -t "$BWS_ACCESS_TOKEN" secret edit --key "$key" --value "$val" "$id" >/dev/null
  else
    bws -t "$BWS_ACCESS_TOKEN" secret create "$key" "$val" "$BWS_PROJECT_ID" >/dev/null
  fi
}

cf_api() {
  curl -sS -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" "$@"
}

pulumi_token_valid() {
  [[ -n "${PULUMI_ACCESS_TOKEN:-}" ]] \
    && PULUMI_ACCESS_TOKEN="$PULUMI_ACCESS_TOKEN" pulumi whoami >/dev/null 2>&1
}

mint_pulumi_token() {
  echo "→ Creating Pulumi access token (pulumi login required)"
  local token
  token=$( ( unset PULUMI_ACCESS_TOKEN
    pulumi whoami >/dev/null 2>&1 || pulumi login
    pulumi api CreatePersonalToken -F description="cloudflare-hosting-ci-${DOMAIN}" -F expires=0 --output json
  ) | jq -r '.tokenValue // empty')
  [[ -n "$token" ]] || die "pulumi api CreatePersonalToken failed; run: pulumi login"
  PULUMI_ACCESS_TOKEN="$token"
  export PULUMI_ACCESS_TOKEN
  bws_put PULUMI_ACCESS_TOKEN "$PULUMI_ACCESS_TOKEN"
}

resolve_cloudflare_account() {
  echo "→ Cloudflare account"
  if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
    local lines id
    lines=$(cf_api "https://api.cloudflare.com/client/v4/accounts" \
      | jq -r '.result[]? | "\(.id)\t\(.name)"')
    id=$(printf '%s\n' "$lines" | select_cloudflare_account_id) || exit 1
    CLOUDFLARE_ACCOUNT_ID=$id
    export CLOUDFLARE_ACCOUNT_ID
    bws_put CLOUDFLARE_ACCOUNT_ID "$CLOUDFLARE_ACCOUNT_ID"
  fi
  require_secret CLOUDFLARE_ACCOUNT_ID
}

resolve_zone() {
  local resolved name status
  echo "→ Zone ${DOMAIN}"
  resolved=$(cf_api "https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}" \
    | jq -r '.result[0].id // empty')
  [[ -n "$resolved" ]] || die "No Cloudflare zone named ${DOMAIN} visible to this API token (create it in edge-dns first)"
  CLOUDFLARE_ZONE_ID=$(prefer_resolved_zone_id "$DOMAIN" "$resolved" "${CLOUDFLARE_ZONE_ID:-}")
  export CLOUDFLARE_ZONE_ID

  name=$(cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
    | jq -r '.result.name // empty')
  status=$(cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
    | jq -r '.result.status // empty')
  echo "  ${name} (${status})"
  if [[ "$status" != "active" ]]; then
    echo "  Zone status: ${status} — update registrar nameservers if pending:"
    cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
      | jq -r '.result.name_servers[]?' | sed 's/^/  NS: /'
    die "Zone ${DOMAIN} must already be active on Cloudflare (managed by edge-dns)"
  fi
}

ensure_pulumi_token() {
  if [[ -z "${PULUMI_ACCESS_TOKEN:-}" ]]; then
    mint_pulumi_token
  elif pulumi_token_valid; then
    echo "→ Pulumi access token ok"
  else
    echo "→ Pulumi access token invalid; minting a new one"
    mint_pulumi_token
  fi
}

publish_github_config() {
  echo "→ GitHub Actions secrets + vars"
  printf '%s' "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN
  printf '%s' "$PULUMI_ACCESS_TOKEN" | gh secret set PULUMI_ACCESS_TOKEN
  if [[ -f "$HOSTING_FILE" ]]; then
    echo "→ Pages project and hostnames stay in ${WORK_DIR}/hosting.yaml"
  else
    gh variable set PULUMI_PAGES_PROJECT_NAME --body "$PAGES_PROJECT_NAME"
    gh variable set PULUMI_PAGES_HOSTNAMES --body "$PAGES_HOSTNAMES_JSON"
  fi

  if [[ -n "${WWW_DOMAIN:-}" ]]; then
    gh variable set PULUMI_APEX_DOMAIN --body "$DOMAIN"
    gh variable set PULUMI_WWW_DOMAIN --body "$WWW_DOMAIN"
  fi
}

write_pulumi_stack() {
  echo "→ Pulumi stack ${STACK} (${WORK_DIR})"
  cd "${ROOT}/${WORK_DIR}"
  pnpm install --frozen-lockfile
  pulumi stack select "${STACK}" 2>/dev/null || pulumi stack init "${STACK}"
  pulumi config set accountId "$CLOUDFLARE_ACCOUNT_ID"
  pulumi config set zoneId "$CLOUDFLARE_ZONE_ID"
  if [[ ! -f hosting.yaml ]]; then
    pulumi config set pagesProjectName "$PAGES_PROJECT_NAME"
    pulumi config set pagesHostnames "$PAGES_HOSTNAMES_JSON" --plaintext
  fi
  pulumi config set --secret cloudflare:apiToken "$CLOUDFLARE_API_TOKEN"

  if [[ -n "${WWW_DOMAIN:-}" ]]; then
    pulumi config set apexDomain "$DOMAIN"
    pulumi config set wwwDomain "$WWW_DOMAIN"
  fi
}

print_done() {
  echo "Done. Run 'cd ${WORK_DIR} && pulumi up' or merge to main (CI runs pulumi + deploy)."
  if [[ -f "$HOSTING_FILE" ]]; then
    echo "Pages project and hostnames: ${WORK_DIR}/hosting.yaml"
  else
    echo "Pages project: ${PAGES_PROJECT_NAME}"
    echo "Hostnames:     ${PAGES_HOSTNAMES_JSON}"
    echo "Also:          https://${PAGES_PROJECT_NAME}.pages.dev after first Pages deploy."
  fi
  echo "Zone owner:    mzworthington/edge-dns (do not create zones from product CI)."
}

apply_hosting() {
  require_secret CLOUDFLARE_API_TOKEN
  resolve_cloudflare_account
  resolve_zone
  ensure_pulumi_token
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

load_dotenv() {
  if [[ -f "${ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT}/.env"
    set +a
  fi
}

configure_pages_inputs() {
  WORK_DIR="${WORK_DIR:-infra/cloudflare}"
  STACK="${PULUMI_STACK}"
  HOSTING_FILE="${ROOT}/${WORK_DIR}/hosting.yaml"
  PAGES_HOSTNAMES_JSON='[]'
  if [[ -f "$HOSTING_FILE" ]]; then
    return 0
  fi
  : "${PAGES_PROJECT_NAME:?Set PAGES_PROJECT_NAME}"
  if [[ -z "${PAGES_HOSTNAMES:-}" && -n "${WWW_DOMAIN:-}" ]]; then
    PAGES_HOSTNAMES="${DOMAIN},${WWW_DOMAIN}"
  fi
  : "${PAGES_HOSTNAMES:?Set PAGES_HOSTNAMES (subdomains) or WWW_DOMAIN (legacy apex+www)}"
  PAGES_HOSTNAMES_JSON=$(pages_hostnames_json "$PAGES_HOSTNAMES")
}

require_tools() {
  local c
  for c in gh pulumi jq curl pnpm; do
    command -v "$c" >/dev/null || { echo "Missing: $c"; exit 1; }
  done
  gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }
  USE_BWS=0
  if [[ -n "${BWS_ACCESS_TOKEN:-}" && -n "${BWS_PROJECT_ID:-}" ]]; then
    command -v bws >/dev/null || { echo "Missing: bws (or unset BWS_* to use env secrets)"; exit 1; }
    USE_BWS=1
  fi
}

export_bootstrap_env() {
  export ROOT DOMAIN STACK PAGES_HOSTNAMES_JSON USE_BWS WORK_DIR HOSTING_FILE
  export PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-}"
  export PAGES_HOSTNAMES="${PAGES_HOSTNAMES:-}"
  export WWW_DOMAIN="${WWW_DOMAIN:-}"
  export BWS_PROJECT_ID="${BWS_PROJECT_ID:-}"
}

launch_apply() {
  if [[ "$USE_BWS" == "1" ]]; then
    bws run --project-id "$BWS_PROJECT_ID" -- \
      env BWS_ACCESS_TOKEN="${BWS_ACCESS_TOKEN}" USE_BWS=1 SETUP_CLOUDFLARE_HOSTING_PHASE=apply \
      bash "$0"
  else
    env USE_BWS=0 SETUP_CLOUDFLARE_HOSTING_PHASE=apply bash "$0"
  fi
}

prepare_bootstrap() {
  load_product_root
  load_dotenv
  : "${PULUMI_STACK:?Set PULUMI_STACK (Pulumi stack name); see .env.example}"
  : "${DOMAIN:?Set DOMAIN (existing Cloudflare zone name, e.g. example.com)}"
  configure_pages_inputs
  require_tools
  export_bootstrap_env
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
launch_apply
