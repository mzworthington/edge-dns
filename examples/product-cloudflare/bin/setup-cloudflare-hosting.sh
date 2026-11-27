#!/usr/bin/env bash
# Thin product-repo shim — runs the canonical bootstrap from edge-dns.
# Copy this file to your product repo as `bin/setup-cloudflare-hosting.sh`.
#
# Override the ref when pinning:
#   EDGE_DNS_REF=<sha> bin/setup-cloudflare-hosting.sh
set -euo pipefail

EDGE_DNS_REF="${EDGE_DNS_REF:-main}"
BASE_URL="https://raw.githubusercontent.com/mzworthington/edge-dns/${EDGE_DNS_REF}"

export PRODUCT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PRODUCT_ROOT"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
curl --proto '=https' --tlsv1.2 -fsSL "${BASE_URL}/scripts/setup-cloudflare-hosting.sh" -o "${tmpdir}/setup-cloudflare-hosting.sh"
# Older edge-dns refs have no helper. The script requires it once hosting.yaml exists.
if ! curl --proto '=https' --tlsv1.2 -fsSL "${BASE_URL}/scripts/upsert-hosting-ids.cjs" -o "${tmpdir}/upsert-hosting-ids.cjs"; then
  rm -f "${tmpdir}/upsert-hosting-ids.cjs"
fi
bash "${tmpdir}/setup-cloudflare-hosting.sh" "$@"
