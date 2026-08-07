# Handover — edge-dns multi-zone

## Status

Project `edge-dns` with stacks per domain. Zone lifecycle only; product DNS/Pages stay in product repos.

| Stack | Zone |
|-------|------|
| `archlens.dev` | ArchLens |
| `matthewworthington.com` | Personal |
| `mzworthington.com` | Personal |
| `mzworthington.co.uk` | Personal |

## Ops

- Inventory: `zones.txt`
- CI: matrix preview/apply; Environment `pulumi-prod` with required reviewer
- Secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `PULUMI_ACCESS_TOKEN`
- `manageSettings` remains false until the token has Zone Settings Read/Write

## Deferred

- Enabling zone-setting baselines
- Further product-repo DNS doc updates beyond ArchLens `docs/dns.md`
