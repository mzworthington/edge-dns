# Baseline — eval-driven-development.dev

| Field | Value |
|-------|--------|
| Zone ID | _fill after import_ |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` (Cloudflare Registrar) |
| Name servers | Cloudflare (already authoritative) |
| Pulumi | `mzworthington/edge-dns/eval-driven-development.dev` |
| Origin | GitHub Pages (`githubPages: mzworthington.github.io`) |

Managed: `cloudflare.Zone` + GitHub Pages origin DNS (`manageSettings=false`). Site deploy stays in `agent-lifecycle-kit` GitHub Actions.

The zone already exists (domain purchased on Cloudflare). **Import** before the first `pulumi up` so Pulumi does not try to create a second zone:

```bash
pulumi stack select eval-driven-development.dev
# ZONE_ID from: Cloudflare dashboard, or
#   curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
#     "https://api.cloudflare.com/client/v4/zones?name=eval-driven-development.dev" \
#     | jq -r '.result[0].id'
pulumi import 'cloudflare:index/zone:Zone' eval-driven-development-dev-zone <ZONE_ID>
pulumi up
```

Then snapshot this file with the real Zone ID and name servers. Product custom domain: [github-pages-origin.md](../github-pages-origin.md).
