# Handover — edge-dns v1

## Status

`edge-dns` control plane is stood up for **`archlens.dev`**.

| Item | State |
|------|--------|
| Repo | [mzworthington/edge-dns](https://github.com/mzworthington/edge-dns) |
| Docs | README, ownership, add-zone, add-product-dns, decisions, baseline snapshot |
| Pulumi | `mzworthington/edge-dns-archlens-dev/prod` — zone imported; preview clean |
| CI | `preview.yml` + `apply.yml` (gated on `pulumi-prod`) |
| Secrets | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `PULUMI_ACCESS_TOKEN` |

## Ownership (locked)

- **edge-dns:** zone create/import, nameservers, optional zone settings
- **Product repos:** Pages/Workers/R2 + DNS (including apex when the product owns it)

## Deferred (intentionally)

- Enable `manageSettings` once a token has Zone Settings Read/Write
- `mzworthington.co.uk` as second zone
- Product-repo docs (`docs/dns.md` in ArchLens/template) noting zone ownership here
- Zero Trust / shared rulesets
- Narrow product tokens / Cloudflare OIDC

## Operator notes

- Local config: `zones/archlens.dev` + gitignored `.env`
- Baseline settings default off (`manageSettings=false`) because the current product Cloudflare token cannot read zone settings (API 9109)
- After first push to `main`, add required reviewers on Environment **pulumi-prod** if the API did not attach them
- Protect `main`: require PR + status checks for Pulumi preview
