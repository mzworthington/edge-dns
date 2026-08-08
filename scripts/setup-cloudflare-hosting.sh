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
#   CATALOG_BUCKET_NAME, CATALOG_DOMAIN  # R2 catalog (ArchLens-style)
#   WORK_DIR=infra/cloudflare
#
# Usage (from a product repo root, via shim or direct clone):
#   cp .env.example .env   # edit hostnames (+ BWS_* or CLOUDFLARE_API_TOKEN)
#   bin/setup-cloudflare-hosting.sh
set -euo pipefail

# When sourced via process substitution / curl, BASH_SOURCE may not point at a
# product repo. Prefer PWD when it looks like a product root; allow PRODUCT_ROOT.
if [[ -n "${PRODUCT_ROOT:-}" ]]; then
  ROOT="$PRODUCT_ROOT"
elif [[ -f "${PWD}/package.json" || -d "${PWD}/infra/cloudflare" ]]; then
  ROOT="$PWD"
else
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

: "${PULUMI_STACK:?Set PULUMI_STACK (Pulumi stack name); see .env.example}"
: "${DOMAIN:?Set DOMAIN (existing Cloudflare zone name, e.g. example.com)}"
: "${PAGES_PROJECT_NAME:?Set PAGES_PROJECT_NAME}"

WORK_DIR="${WORK_DIR:-infra/cloudflare}"
STACK="${PULUMI_STACK}"

# Hostname modes:
# 1) PAGES_HOSTNAMES — modern JSON array config (react-cloudflare-template)
# 2) WWW_DOMAIN — legacy apex + www (ArchLens); also implies apexDomain/wwwDomain
if [[ -z "${PAGES_HOSTNAMES:-}" && -n "${WWW_DOMAIN:-}" ]]; then
  PAGES_HOSTNAMES="${DOMAIN},${WWW_DOMAIN}"
fi
: "${PAGES_HOSTNAMES:?Set PAGES_HOSTNAMES (subdomains) or WWW_DOMAIN (legacy apex+www)}"

IFS=',' read -r -a HOSTNAME_ARRAY <<< "$PAGES_HOSTNAMES"

PAGES_HOSTNAMES_JSON='['
for i in "${!HOSTNAME_ARRAY[@]}"; do
  h="$(echo "${HOSTNAME_ARRAY[$i]}" | sed -E 's/^[[:space:]]+|[[:space:]]+$//g')"
  [[ -n "$h" ]] || continue
  if [[ "$PAGES_HOSTNAMES_JSON" != '[' ]]; then
    PAGES_HOSTNAMES_JSON+=', '
  fi
  PAGES_HOSTNAMES_JSON+="\"${h}\""
done
PAGES_HOSTNAMES_JSON+=']'
if [[ "$PAGES_HOSTNAMES_JSON" == '[]' ]]; then
  echo "PAGES_HOSTNAMES produced an empty hostname list" >&2
  exit 1
fi

USE_CATALOG=0
if [[ -n "${CATALOG_BUCKET_NAME:-}" || -n "${CATALOG_DOMAIN:-}" ]]; then
  : "${CATALOG_BUCKET_NAME:?Set CATALOG_BUCKET_NAME when using catalog mode}"
  : "${CATALOG_DOMAIN:?Set CATALOG_DOMAIN when using catalog mode}"
  USE_CATALOG=1
fi

for c in gh pulumi jq curl pnpm; do
  command -v "$c" >/dev/null || { echo "Missing: $c"; exit 1; }
done
if [[ "$USE_CATALOG" == "1" ]]; then
  command -v openssl >/dev/null || { echo "Missing: openssl (needed for R2 catalog mint)"; exit 1; }
fi
gh auth status >/dev/null 2>&1 || { echo "Run: gh auth login"; exit 1; }

USE_BWS=0
if [[ -n "${BWS_ACCESS_TOKEN:-}" && -n "${BWS_PROJECT_ID:-}" ]]; then
  command -v bws >/dev/null || { echo "Missing: bws (or unset BWS_* to use env secrets)"; exit 1; }
  USE_BWS=1
fi

export ROOT DOMAIN STACK PAGES_PROJECT_NAME PAGES_HOSTNAMES_JSON USE_BWS USE_CATALOG WORK_DIR
export PAGES_HOSTNAMES="${PAGES_HOSTNAMES:-}"
export WWW_DOMAIN="${WWW_DOMAIN:-}"
export CATALOG_BUCKET_NAME="${CATALOG_BUCKET_NAME:-}"
export CATALOG_DOMAIN="${CATALOG_DOMAIN:-}"
export BWS_PROJECT_ID="${BWS_PROJECT_ID:-}"

# Body runs under `bash` with stdin from the heredoc.
# Do not use `bash -c "$(declare -f …)"`; `bws run` mangles that.
if [[ "$USE_BWS" == "1" ]]; then
  bws run --project-id "$BWS_PROJECT_ID" -- \
    env BWS_ACCESS_TOKEN="${BWS_ACCESS_TOKEN}" USE_BWS=1 \
    bash
else
  env USE_BWS=0 bash
fi <<'EOF'
set -euo pipefail

die() { echo "✗ $*" >&2; exit 1; }

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

# Cloudflare platform permission group id (not account-specific).
# Workers R2 Storage Bucket Item Write — see Cloudflare API permission_groups docs.
R2_BUCKET_ITEM_WRITE_PERMISSION_GROUP_ID="2efd5506f9c8494dacb1fa10a3e7d5b6"

mint_r2_catalog_credentials() {
  echo "→ Minting R2 catalog S3 credentials (scoped to ${CATALOG_BUCKET_NAME})"
  local resource payload resp token_id token_value secret_key
  resource="com.cloudflare.edge.r2.bucket.${CLOUDFLARE_ACCOUNT_ID}_default_${CATALOG_BUCKET_NAME}"
  payload=$(jq -n \
    --arg name "r2-catalog-publish-${CATALOG_BUCKET_NAME}" \
    --arg pg "$R2_BUCKET_ITEM_WRITE_PERMISSION_GROUP_ID" \
    --arg resource "$resource" \
    '{
      name: $name,
      policies: [{
        effect: "allow",
        resources: {($resource): "*"},
        permission_groups: [{id: $pg}]
      }]
    }')

  resp=$(cf_api -X POST "https://api.cloudflare.com/client/v4/user/tokens" --data "$payload")
  if [[ "$(jq -r '.success // false' <<<"$resp")" != "true" ]]; then
    echo "$resp" | jq -r '.errors[]? | "  Cloudflare: \(.message // .)"' >&2 || true
    cat >&2 <<HINT

Could not create an R2-scoped API token automatically.
Your CLOUDFLARE_API_TOKEN likely lacks "User API Tokens: Edit" (or Account API Tokens).

Create an R2 API token in the dashboard (Object Read & Write on bucket ${CATALOG_BUCKET_NAME}),
then store in bws (or env) and re-run:

  R2_BLUEPRINT_CATALOG_BUCKET='${CATALOG_BUCKET_NAME}'
  R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID='<access-key-id>'
  R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY='<secret-access-key>'

HINT
    die "R2 catalog credentials missing"
  fi

  token_id=$(jq -r '.result.id // empty' <<<"$resp")
  token_value=$(jq -r '.result.value // empty' <<<"$resp")
  [[ -n "$token_id" && -n "$token_value" ]] || die "Cloudflare token create returned no id/value"

  # S3 Secret Access Key = SHA-256 hex of the API token value (Cloudflare R2 docs).
  secret_key=$(printf '%s' "$token_value" | openssl dgst -sha256 -hex | awk '{print $NF}')

  R2_BLUEPRINT_CATALOG_BUCKET="$CATALOG_BUCKET_NAME"
  R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID="$token_id"
  R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY="$secret_key"
  export R2_BLUEPRINT_CATALOG_BUCKET R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY

  echo "→ Saving R2 catalog credentials to bws (if enabled)"
  bws_put R2_BLUEPRINT_CATALOG_BUCKET "$R2_BLUEPRINT_CATALOG_BUCKET"
  bws_put R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID "$R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID"
  bws_put R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY "$R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY"
}

ensure_r2_catalog_credentials() {
  [[ "${USE_CATALOG:-0}" == "1" ]] || return 0
  if [[ -n "${R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID:-}" && -n "${R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY:-}" ]]; then
    R2_BLUEPRINT_CATALOG_BUCKET="${R2_BLUEPRINT_CATALOG_BUCKET:-$CATALOG_BUCKET_NAME}"
    export R2_BLUEPRINT_CATALOG_BUCKET
    if [[ "$R2_BLUEPRINT_CATALOG_BUCKET" != "$CATALOG_BUCKET_NAME" ]]; then
      echo "→ Updating R2_BLUEPRINT_CATALOG_BUCKET to match CATALOG_BUCKET_NAME"
      R2_BLUEPRINT_CATALOG_BUCKET="$CATALOG_BUCKET_NAME"
      export R2_BLUEPRINT_CATALOG_BUCKET
      bws_put R2_BLUEPRINT_CATALOG_BUCKET "$R2_BLUEPRINT_CATALOG_BUCKET"
    fi
    echo "→ R2 catalog credentials ok"
    return 0
  fi
  mint_r2_catalog_credentials
}

require_secret CLOUDFLARE_API_TOKEN

echo "→ Cloudflare account"
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  mapfile -t ACCOUNTS < <(cf_api "https://api.cloudflare.com/client/v4/accounts" \
    | jq -r '.result[]? | "\(.id)\t\(.name)"')
  if [[ ${#ACCOUNTS[@]} -eq 1 ]]; then
    CLOUDFLARE_ACCOUNT_ID="${ACCOUNTS[0]%%$'\t'*}"
    bws_put CLOUDFLARE_ACCOUNT_ID "$CLOUDFLARE_ACCOUNT_ID"
  elif [[ ${#ACCOUNTS[@]} -eq 0 ]]; then
    die "No Cloudflare accounts visible for this API token"
  else
    printf '%s\n' "${ACCOUNTS[@]}" | sed 's/^/  /'
    die "CLOUDFLARE_ACCOUNT_ID required when more than one account is visible"
  fi
fi
require_secret CLOUDFLARE_ACCOUNT_ID

echo "→ Zone ${DOMAIN}"
# Always resolve by DOMAIN name. A shared BWS project may already have
# CLOUDFLARE_ZONE_ID for a different product; do not trust it blindly.
RESOLVED_ZONE_ID=$(cf_api "https://api.cloudflare.com/client/v4/zones?name=${DOMAIN}" \
  | jq -r '.result[0].id // empty')
[[ -n "$RESOLVED_ZONE_ID" ]] || die "No Cloudflare zone named ${DOMAIN} visible to this API token (create it in edge-dns first)"

if [[ -n "${CLOUDFLARE_ZONE_ID:-}" && "$CLOUDFLARE_ZONE_ID" != "$RESOLVED_ZONE_ID" ]]; then
  echo "  ⚠ CLOUDFLARE_ZONE_ID from env/bws does not match zone ${DOMAIN}"
  echo "    using zone id for ${DOMAIN} instead (not overwriting shared bws secret)"
fi
CLOUDFLARE_ZONE_ID="$RESOLVED_ZONE_ID"

ZONE_NAME=$(cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
  | jq -r '.result.name // empty')
ZONE_STATUS=$(cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
  | jq -r '.result.status // empty')
echo "  ${ZONE_NAME} (${ZONE_STATUS})"
if [[ "$ZONE_STATUS" != "active" ]]; then
  echo "  Zone status: ${ZONE_STATUS} — update registrar nameservers if pending:"
  cf_api "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}" \
    | jq -r '.result.name_servers[]?' | sed 's/^/  NS: /'
  die "Zone ${DOMAIN} must already be active on Cloudflare (managed by edge-dns)"
fi

if [[ -z "${PULUMI_ACCESS_TOKEN:-}" ]]; then
  mint_pulumi_token
elif pulumi_token_valid; then
  echo "→ Pulumi access token ok"
else
  echo "→ Pulumi access token invalid; minting a new one"
  mint_pulumi_token
fi

ensure_r2_catalog_credentials

echo "→ GitHub Actions secrets + vars"
printf '%s' "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN
printf '%s' "$CLOUDFLARE_ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID
printf '%s' "$CLOUDFLARE_ZONE_ID" | gh secret set CLOUDFLARE_ZONE_ID
printf '%s' "$PULUMI_ACCESS_TOKEN" | gh secret set PULUMI_ACCESS_TOKEN
gh variable set PULUMI_PAGES_PROJECT_NAME --body "$PAGES_PROJECT_NAME"
gh variable set PULUMI_PAGES_HOSTNAMES --body "$PAGES_HOSTNAMES_JSON"

if [[ -n "${WWW_DOMAIN:-}" ]]; then
  gh variable set PULUMI_APEX_DOMAIN --body "$DOMAIN"
  gh variable set PULUMI_WWW_DOMAIN --body "$WWW_DOMAIN"
fi

if [[ "${USE_CATALOG:-0}" == "1" ]]; then
  printf '%s' "$R2_BLUEPRINT_CATALOG_BUCKET" | gh secret set R2_BLUEPRINT_CATALOG_BUCKET
  printf '%s' "$R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID" | gh secret set R2_BLUEPRINT_CATALOG_ACCESS_KEY_ID
  printf '%s' "$R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY" | gh secret set R2_BLUEPRINT_CATALOG_SECRET_ACCESS_KEY
  gh variable set PULUMI_CATALOG_BUCKET_NAME --body "$CATALOG_BUCKET_NAME"
  gh variable set PULUMI_CATALOG_DOMAIN --body "$CATALOG_DOMAIN"
fi

echo "→ Pulumi stack ${STACK} (${WORK_DIR})"
cd "${ROOT}/${WORK_DIR}"
pnpm install --frozen-lockfile
pulumi stack select "${STACK}" 2>/dev/null || pulumi stack init "${STACK}"
pulumi config set accountId "$CLOUDFLARE_ACCOUNT_ID"
pulumi config set zoneId "$CLOUDFLARE_ZONE_ID"
pulumi config set pagesProjectName "$PAGES_PROJECT_NAME"
pulumi config set pagesHostnames "$PAGES_HOSTNAMES_JSON" --plaintext
pulumi config set --secret cloudflare:apiToken "$CLOUDFLARE_API_TOKEN"

# Legacy ArchLens-shaped stacks still read apex/www/catalog keys.
if [[ -n "${WWW_DOMAIN:-}" ]]; then
  pulumi config set apexDomain "$DOMAIN"
  pulumi config set wwwDomain "$WWW_DOMAIN"
fi
if [[ "${USE_CATALOG:-0}" == "1" ]]; then
  pulumi config set catalogBucketName "$CATALOG_BUCKET_NAME"
  pulumi config set catalogDomain "$CATALOG_DOMAIN"
fi

echo "Done. Run 'cd ${WORK_DIR} && pulumi up' or merge to main (CI runs pulumi + deploy)."
echo "Pages project: ${PAGES_PROJECT_NAME}"
echo "Hostnames:     ${PAGES_HOSTNAMES_JSON}"
echo "Also:          https://${PAGES_PROJECT_NAME}.pages.dev after first Pages deploy."
echo "Zone owner:    mzworthington/edge-dns (do not create zones from product CI)."
EOF
