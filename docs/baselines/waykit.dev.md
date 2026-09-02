# Baseline — waykit.dev

| Field | Value |
|-------|--------|
| Zone ID | `45dfea5a86a5b5834a913c13ae3a112d` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` (Cloudflare Registrar) |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/waykit.dev` |
| Origin | GitHub Pages (`githubPages: mzworthington.github.io`) |

Managed: `cloudflare.Zone` + GitHub Pages origin DNS + Web Analytics / RUM (`manageSettings=false`) + first-party beacon host on `insights.waykit.dev`. Site deploy and the grey-cloud RUM snippet stay in `agent-lifecycle-kit` GitHub Actions. Copy stack output `webAnalyticsSnippet` into `web/src/layouts/SiteLayout.astro` after the first apply.

Product custom domain: [github-pages-origin.md](../github-pages-origin.md). Import this existing registrar zone; do not create a second zone.

```bash
pulumi stack init waykit.dev
pulumi config set accountId fe0bb0a89551958509fe4d65883026cc
pulumi config set zoneName waykit.dev
pulumi stack select waykit.dev
pulumi import --yes --generate-code=false \
  'cloudflare:index/zone:Zone' waykit-dev-zone \
  45dfea5a86a5b5834a913c13ae3a112d
```
