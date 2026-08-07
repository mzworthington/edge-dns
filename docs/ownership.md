# Ownership

| Resource | Owner |
|----------|--------|
| Zone / nameservers / DNSSEC / zone-level settings | `edge-dns` |
| Shared org WAF / TLS defaults / org redirects | `edge-dns` |
| Apex or product host DNS (`@`, `www`, `api.…`, product subdomain) | **product repo** |
| Pages / Workers / R2 / product deploy | **product repo** |

## Rules

1. **Create zones only in `edge-dns`.** Product CI must not call zone create.
2. **Product hostnames** (including apex when the product owns the domain) are declared in the product Pulumi/Wrangler stack after the zone is Active here.
3. **Do not** import product `DnsRecord` / `PagesDomain` / Pages / R2 resources into `edge-dns` stacks — that fights product state.
4. Shared apex records on a multi-product org zone (blog, org MX, org redirects) belong in `edge-dns` when they are not owned by a single product. Product-owned zones (e.g. `archlens.dev`) keep all product DNS in the product repo.

## Example: ArchLens

- Zone `archlens.dev` lifecycle + baselines → `zones/archlens.dev` in this repo.
- Pages project, apex/www CNAMEs, Pages domains, catalog R2 → ArchLens/blueprint `infra/cloudflare`.
