# Baseline — eval-driven-development.dev

| Field | Value |
|-------|--------|
| Zone ID | `0698bb095bf39450daba2cc672ecb03a` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` (Cloudflare Registrar) |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/eval-driven-development.dev` |
| Origin | GitHub Pages (`githubPages: mzworthington.github.io`) |

Managed: `cloudflare.Zone` + GitHub Pages origin DNS + Web Analytics site `ea7ffeb012004862add795dccbb3c211` (`manageSettings=false`). Site deploy and the RUM JS snippet stay in `agent-lifecycle-kit` GitHub Actions.

Product custom domain: [github-pages-origin.md](../github-pages-origin.md).
