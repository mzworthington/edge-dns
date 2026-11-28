# Baseline — lan-cli.dev

Declared in [`zones.yaml`](../../zones.yaml). The zone already existed and was **active** on Cloudflare before this stack tracked it. Import it; do not create a second zone.

| Field | Value |
|-------|--------|
| Zone ID | `d145b42c5db1cbd214ffc731ebd5e0b8` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/lan-cli.dev` |
| Role | vanity → `waykit.dev` |

Managed: `cloudflare.Zone` (`manageSettings=false`) plus org vanity **CanonicalRedirect** → `waykit.dev` ([org-redirects.md](../org-redirects.md)).

```bash
pulumi stack select lan-cli.dev
pulumi import --yes --generate-code=false \
  'cloudflare:index/zone:Zone' lan-cli-dev-zone \
  d145b42c5db1cbd214ffc731ebd5e0b8
```
