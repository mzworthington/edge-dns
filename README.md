# edge-dns

Org Cloudflare **control plane**: zones, nameservers, DNSSEC, and shared zone baselines (TLS/WAF defaults).

Product repos own Pages/Workers/R2 and DNS for their hostnames (including apex when the product owns that domain). This repo does **not** create product Pages projects or product DNS records.

See [docs/ownership.md](docs/ownership.md), [docs/add-zone.md](docs/add-zone.md), [docs/add-product-dns.md](docs/add-product-dns.md), [docs/decisions.md](docs/decisions.md).

## Layout

```text
components/zone/     # ManagedZone ComponentResource
index.ts             # one program; stack name = domain
zones.txt            # inventory of managed zones
docs/baselines/      # per-zone snapshots
```

## Stacks (one per zone)

| Stack (domain) | Notes |
|----------------|--------|
| `archlens.dev` | ArchLens product zone |
| `matthewworthington.com` | Personal |
| `mzworthington.com` | Personal |
| `mzworthington.co.uk` | Personal / blog |

Fully qualified: `mzworthington/edge-dns/<domain>`.

## Local

```bash
pnpm install
pulumi stack select archlens.dev   # or init
pulumi config set accountId …
pulumi config set zoneName archlens.dev
pulumi config set --secret cloudflare:apiToken …
pulumi preview
```

Zone settings baselines are off by default (`manageSettings=false`) until the API token has Zone Settings Read/Write. See [docs/baselines/](docs/baselines/).

## CI

Single workflow [`.github/workflows/pulumi.yml`](.github/workflows/pulumi.yml):

1. **Preview** — every branch (PR + push), all stacks in the matrix
2. **Manual gate** — GitHub Environment `pulumi-prod` (required reviewers)
3. **Apply** — `main` only, after preview succeeds and the environment is approved

### Reusable: Pulumi rich report

[`.github/actions/pulumi-rich-report`](.github/actions/pulumi-rich-report) wraps `pulumi/actions` with per-resource diffs, job summary, optional PR comments, and Pulumi Cloud dashboard links.

Product repos can call it after their own setup step:

```yaml
- name: Pulumi preview
  uses: mzworthington/edge-dns/.github/actions/pulumi-rich-report@main
  with:
    command: preview          # or up
    stack-name: prod
    work-dir: infra/cloudflare
    comment-on-pr: ${{ github.event_name == 'pull_request' }}
  env:
    PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

Pin to a commit SHA instead of `@main` when you want a frozen consumer.
