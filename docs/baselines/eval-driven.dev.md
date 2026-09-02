# Baseline — eval-driven.dev

| Field | Value |
|-------|--------|
| Zone ID | `8b3f72e434fbb497e2b1a22c0b2737ae` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` (Cloudflare Registrar) |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/eval-driven.dev` |
| Origin | GitHub Pages (`githubPages: mzworthington.github.io`) |

Managed: `cloudflare.Zone` + GitHub Pages origin DNS + Web Analytics / RUM (`manageSettings=false`) + first-party beacon host on `insights.eval-driven.dev`. Site deploy and the grey-cloud RUM snippet stay in `agent-lifecycle-kit` GitHub Actions. Copy stack output `webAnalyticsSnippet` into `web/index.html` after the first apply.

Product custom domain: [github-pages-origin.md](../github-pages-origin.md). Import this existing registrar zone; do not create a second zone.

```bash
pulumi stack init eval-driven.dev
pulumi config set accountId fe0bb0a89551958509fe4d65883026cc
pulumi config set zoneName eval-driven.dev
pulumi stack select eval-driven.dev
pulumi import --yes --generate-code=false \
  'cloudflare:index/zone:Zone' eval-driven-dev-zone \
  8b3f72e434fbb497e2b1a22c0b2737ae
```
