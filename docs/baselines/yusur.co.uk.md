# Baseline — yusur.co.uk

Declared in [`zones.yaml`](../../zones.yaml). The zone already existed and was **active** on Cloudflare (registered there) before this stack tracked it. Import it; do not create a second zone.

| Field | Value |
|-------|--------|
| Zone ID | `8fa428280586fdd39a02330d36ae0727` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` |
| Name servers | `cass.ns.cloudflare.com`, `kyrie.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/yusur.co.uk` |
| Role | product |

```bash
pulumi stack select yusur.co.uk
pulumi import --yes --generate-code=false \
  'cloudflare:index/zone:Zone' yusur-co-uk-zone \
  8fa428280586fdd39a02330d36ae0727
```
