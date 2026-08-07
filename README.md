# edge-dns

Org Cloudflare **control plane**: zones, nameservers, DNSSEC, and shared zone baselines (TLS/WAF defaults).

Product repos (ArchLens, templates, etc.) own Pages/Workers/R2 and the DNS records for their hostnames — including apex when the product owns that domain (for example `archlens.dev` + `www.archlens.dev` in the ArchLens/blueprint stack). This repo does **not** create product Pages projects or product DNS records.

Zones must exist here (Active) before a product attaches hostnames. See [docs/ownership.md](docs/ownership.md), [docs/add-zone.md](docs/add-zone.md), and [docs/add-product-dns.md](docs/add-product-dns.md). Stack choice: [docs/decisions.md](docs/decisions.md).

## Layout

```text
components/zone/     # reusable Zone + baseline settings
zones/<domain>/      # one Pulumi project per zone
docs/                # ownership and runbooks
```

## First zone

`zones/archlens.dev` — zone lifecycle and baselines only. Product DNS/Pages stay in the ArchLens repo.

## Local

```bash
cd zones/archlens.dev
pnpm install
pulumi stack select prod   # or init
# set accountId, zoneName, zoneId, cloudflare:apiToken (see Pulumi.prod.yaml.example)
pulumi preview
```

## CI

- PR / push: Pulumi preview
- `main`: gated `pulumi up` via GitHub Environment `pulumi-prod`
