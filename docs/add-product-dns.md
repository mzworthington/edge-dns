# Attach product DNS / Pages

Products own hostname DNS and app edge resources. `edge-dns` only ensures the **zone** exists.

## Prerequisites

1. Zone for the domain is managed in `edge-dns` and status is **Active**.
2. Product Cloudflare API token includes at least: Zone DNS Edit, Zone Read, Cloudflare Pages Edit (as needed). Prefer scoping the token to that zone.

## Steps (product repo)

1. Copy thin CI/bootstrap shims from [`examples/product-cloudflare/`](../examples/product-cloudflare/) (see [reusable-cloudflare-ci.md](reusable-cloudflare-ci.md)).
2. Run `bin/setup-cloudflare-hosting.sh` (shim → edge-dns script) to sync secrets/vars and Pulumi config — or set them manually.
3. Create the Pages (or Workers) project in the **product** stack.
4. Create `DnsRecord` CNAMEs (or equivalent) for those hostnames pointing at the Pages project subdomain.
5. Attach `PagesDomain` (or custom domain bindings) in the product stack.
6. Deploy the app from product CI (`wrangler pages deploy`, etc.).

## Do not

- Create a new Cloudflare zone from a product repo.
- Move product DNS into `edge-dns` unless ownership explicitly changes.
- Use an account-wide Zone Write token in product CI when a zone-scoped token suffices.
- Copy/paste Cloudflare Actions or the full bootstrap script — consume them from this repo.

## Example

ArchLens (`archlens.dev`): zone in `edge-dns`; Pages + apex/www DNS in blueprint `infra/cloudflare`.
