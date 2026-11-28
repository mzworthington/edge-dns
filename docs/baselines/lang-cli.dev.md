# Baseline — lang-cli.dev

Declared in [`zones.yaml`](../../zones.yaml). The zone already existed and was **active** on Cloudflare before this stack tracked it. Import it; do not create a second zone.

| Field | Value |
|-------|--------|
| Zone ID | `cf50e669263e84bd4d3199f8db3492c1` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/lang-cli.dev` |
| Role | vanity → `waykit.dev` |

Managed: `cloudflare.Zone` (`manageSettings=false`) plus org vanity **CanonicalRedirect** → `waykit.dev` ([org-redirects.md](../org-redirects.md)).

```bash
pulumi stack select lang-cli.dev
pulumi import --yes --generate-code=false \
  'cloudflare:index/zone:Zone' lang-cli-dev-zone \
  cf50e669263e84bd4d3199f8db3492c1
```
