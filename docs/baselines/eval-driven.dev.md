# Baseline — eval-driven.dev

| Field | Value |
|-------|--------|
| Zone ID | `8b3f72e434fbb497e2b1a22c0b2737ae` |
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Type / status | `full` / `active` (Cloudflare Registrar) |
| Name servers | `lauryn.ns.cloudflare.com`, `tosana.ns.cloudflare.com` |
| Pulumi | `mzworthington/edge-dns/eval-driven.dev` |
| Role | vanity → `waykit.dev` |

Managed: `cloudflare.Zone` (`manageSettings=false`) plus org vanity **CanonicalRedirect** → `waykit.dev` ([org-redirects.md](../org-redirects.md)).

Former GitHub Pages origin DNS, Web Analytics / RUM, and `insights.eval-driven.dev` lived on this zone. Vanity apply deletes them (CI unprotects the RUM site first). Apply this stack only after GitHub Pages is serving `waykit.dev` with a valid certificate.
