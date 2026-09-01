# Attach product DNS / Pages

Products that publish on **Cloudflare** own hostname DNS and app edge resources. `edge-dns` ensures the **zone** exists. Sites that publish on **GitHub Pages** declare `githubPages` in [`zones.yaml`](../zones.yaml) so origin DNS lives here instead ([github-pages-origin.md](github-pages-origin.md)).

## Prerequisites

1. Zone for the domain is managed in `edge-dns` and status is **Active**.
2. Product Cloudflare API token includes at least: Zone DNS Edit, Zone Read, Cloudflare Pages Edit (as needed). Prefer scoping the token to that zone. For Cloudflare Tunnel product stacks (e.g. gpio-build-monitor), also grant **Account → Cloudflare Tunnel → Edit**.

## Steps (product repo)

1. Copy thin CI/bootstrap shims from [`examples/product-cloudflare/`](../examples/product-cloudflare/) (see [reusable-cloudflare-ci.md](reusable-cloudflare-ci.md)).
2. Run `bin/setup-cloudflare-hosting.sh` (shim → edge-dns script) to sync secrets/vars and Pulumi config — or set them manually.
3. Create the Pages (or Workers) project in the **product** stack.
4. Create `DnsRecord` CNAMEs (or equivalent) for those hostnames pointing at the Pages project subdomain.
5. Attach `PagesDomain` (or custom domain bindings) in the product stack.
6. Deploy the app from product CI (`wrangler pages deploy`, etc.).

## Do not

- Create a new Cloudflare zone from a product repo.
- Move product Cloudflare DNS into `edge-dns` unless ownership explicitly changes (GitHub Pages origin DNS is the documented exception).
- Use an account-wide Zone Write token in product CI when a zone-scoped token suffices.
- Copy/paste Cloudflare Actions or the full bootstrap script — consume them from this repo.

## Example

ArchLens (`archlens.dev`): zone in `edge-dns`; Pages + apex/www DNS in blueprint `infra/cloudflare`.

Agent Lifecycle Kit (`eval-driven-development.dev`): zone + GitHub Pages origin DNS + Web Analytics + `insights.` beacon host in `edge-dns` (`githubPages` in [`zones.yaml`](../zones.yaml)). The kit repo runs GitHub Actions Pages deploy and embeds the grey-cloud RUM snippet — see [github-pages-origin.md](github-pages-origin.md).
