# Cloudflare zone baseline snapshot — archlens.dev

Captured during edge-dns import. Use this as a rollback reference; live truth is Cloudflare + Pulumi state.

| Field | Value |
|-------|--------|
| Zone name | `archlens.dev` |
| Zone ID | `a60606cf6d3627b9100e2b430dbe0870` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type | `full` |
| Status | `active` |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi stack | `mzworthington/edge-dns-archlens-dev/prod` |

## Managed in Pulumi (v1)

| Resource | Notes |
|----------|--------|
| `cloudflare.Zone` (`archlens-zone`) | Imported; `protect` + `retainOnDelete` |

## Baseline settings (optional)

Set `pulumi config set manageSettings true` **only** when the API token has **Zone Settings Read/Write**. Product DNS/Pages tokens typically lack this and will get Cloudflare `9109 Unauthorized`.

Intended defaults when enabled:

| Setting ID | Value |
|------------|--------|
| `ssl` | `full` |
| `always_use_https` | `on` |
| `min_tls_version` | `1.2` |
| `automatic_https_rewrites` | `on` |
| `tls_1_3` | `on` |

## Not managed here

Product DNS (apex/www CNAMEs), Pages project, Pages domains, R2 catalog — owned by ArchLens/blueprint.
