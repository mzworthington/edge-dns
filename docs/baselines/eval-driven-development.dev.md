# Baseline — eval-driven-development.dev

| Field | Value |
|-------|--------|
| Zone ID | `0698bb095bf39450daba2cc672ecb03a` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` (Cloudflare Registrar) |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/eval-driven-development.dev` |
| Role | vanity → `eval-driven.dev` |

Managed: `cloudflare.Zone` (`manageSettings=false`) plus org vanity **CanonicalRedirect** → `eval-driven.dev` ([org-redirects.md](../org-redirects.md)).

Former GitHub Pages origin DNS, Web Analytics site `ea7ffeb012004862add795dccbb3c211`, and `insights.eval-driven-development.dev` lived on this zone. Remove those resources when converting to vanity (unprotect the `WebAnalyticsSite` first). Apply this stack only after GitHub Pages is serving `eval-driven.dev` with a valid certificate.
