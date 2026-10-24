# Baseline — romini.party

Declared in [`zones.yaml`](../../zones.yaml). The zone already existed in Cloudflare (API error 1061) before this stack tracked it. Import it; do not create a second zone.

| Field | Value |
|-------|--------|
| Zone ID | `e43a02c996d7a2db2f382663b9a04be5` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/romini.party` |
| Role | product |
| Product site | RoMini `deploy/party` (static page on `romini.party` and `www`) |

```bash
pulumi stack select romini.party
pulumi import --yes --generate-code=false \
  'cloudflare:index/zone:Zone' romini-party-zone \
  e43a02c996d7a2db2f382663b9a04be5
```
