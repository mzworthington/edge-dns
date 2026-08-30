# Ownership

| Resource / concern | Owner |
|--------------------|--------|
| Zone / nameservers / DNSSEC / zone-level settings | `edge-dns` |
| Shared org WAF / TLS defaults / **org vanity redirects** (DNS stubs + Single Redirects) | `edge-dns` |
| Shared Cloudflare GitHub Actions + product bootstrap scripts | `edge-dns` |
| Apex or product host DNS (`@`, `www`, `api.…`, product subdomain) | **product repo** (Cloudflare Pages/Workers) |
| GitHub Pages origin DNS (apex A/AAAA + www CNAME to `*.github.io`) | `edge-dns` when `githubPages` is set in [`zones.yaml`](zones.yaml) |
| Pages / Workers / R2 / product deploy | **product repo** (or GitHub Actions → GitHub Pages) |

## Rules

1. **Create zones only in `edge-dns`.** Product CI must not call zone create.
2. **Product hostnames** (including apex when the product owns the domain) are declared in the product Pulumi/Wrangler stack after the zone is Active here.
3. **Do not** import product `DnsRecord` / `PagesDomain` / Pages / R2 resources into `edge-dns` stacks — that fights product state. **Exception:** GitHub Pages origin records declared via `githubPages` in [`zones.yaml`](zones.yaml) ([github-pages-origin.md](github-pages-origin.md)).
4. Shared apex records on a multi-product org zone (blog, org MX, org redirects) belong in `edge-dns` when they are not owned by a single product. **Vanity zones** that only 301 to a canonical host use `role: vanity` in [`zones.yaml`](../zones.yaml) + `CanonicalRedirect` here ([org-redirects.md](org-redirects.md)). Product-owned zones (e.g. `archlens.dev`) keep all product DNS in the product repo.
5. **Do not vendor** full Cloudflare Actions or bootstrap scripts into product repos. Use `uses: mzworthington/edge-dns/...` and the thin shims under [`examples/product-cloudflare/`](../examples/product-cloudflare/). See [reusable-cloudflare-ci.md](reusable-cloudflare-ci.md).

## Example: ArchLens

- Zone `archlens.dev` lifecycle + baselines → `zones/archlens.dev` in this repo.
- Pages project, apex/www CNAMEs, Pages domains, catalog R2 → ArchLens/blueprint `infra/cloudflare`.

## Example: Agent Lifecycle Kit

- Zone `eval-driven-development.dev` + GitHub Pages origin DNS (`githubPages: mzworthington.github.io`) → this repo ([github-pages-origin.md](github-pages-origin.md)).
- Static site deploy → `agent-lifecycle-kit` GitHub Actions (`actions/deploy-pages`). No product Cloudflare stack.
