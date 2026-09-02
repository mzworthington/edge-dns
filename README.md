# edge-dns

Org Cloudflare **control plane**: zones, nameservers, DNSSEC, and shared zone baselines (TLS/WAF defaults). Also the **home** for shared Cloudflare GitHub Actions and product bootstrap scripts.

Product repos that publish on Cloudflare own Pages/Workers/R2 and DNS for their hostnames. This repo does **not** create Cloudflare Pages projects. **Exception:** when `githubPages` is set in [`zones.yaml`](zones.yaml), this repo owns apex/www DNS pointing at GitHub Pages, the zone Web Analytics / RUM site, and a first-party RUM proxy Worker on `insights.<zone>` ([github-pages-origin.md](docs/github-pages-origin.md)).

See [docs/ownership.md](docs/ownership.md), [docs/org-redirects.md](docs/org-redirects.md), [docs/github-pages-origin.md](docs/github-pages-origin.md), [docs/reusable-cloudflare-ci.md](docs/reusable-cloudflare-ci.md), [docs/add-zone.md](docs/add-zone.md), [docs/add-product-dns.md](docs/add-product-dns.md), [docs/decisions.md](docs/decisions.md).

## Layout

```text
components/zone/              # ManagedZone + CanonicalRedirect + GitHubPagesOrigin
index.ts                      # one program; stack name = domain
zones.yaml                    # inventory: zones, roles, vanity redirects (CI matrix)
zones.ts                      # load/validate zones.yaml for Pulumi
docs/baselines/               # per-zone snapshots
.github/actions/              # reusable composite actions (zones + products)
.github/workflows/            # edge-dns CI + reusable product Pulumi workflow
scripts/setup-cloudflare-hosting.sh
scripts/zones-matrix.cjs      # emit stack list JSON from zones.yaml
examples/product-cloudflare/  # thin shims to copy into product repos
```

## Stacks (one per zone)

Declared in [`zones.yaml`](zones.yaml) (source of truth; CI matrix + vanity redirects). Bulk onboard: [`scripts/bootstrap-zones.sh`](scripts/bootstrap-zones.sh) ([add-zone.md](docs/add-zone.md)).

| Stack (domain) | Role |
|----------------|------|
| `archlens.dev` | product — ArchLens |
| `waykit.dev` | product — Agent Lifecycle Kit (GitHub Pages origin DNS here) |
| `eval-driven.dev` | vanity → `waykit.dev` ([org-redirects](docs/org-redirects.md)) |
| `eval-driven-development.dev` | vanity → `waykit.dev` ([org-redirects](docs/org-redirects.md)) |
| `matthewworthington.com` | vanity → `mzworthington.co.uk` ([org-redirects](docs/org-redirects.md)) |
| `mzworthington.com` | vanity → `mzworthington.co.uk` ([org-redirects](docs/org-redirects.md)) |
| `mzworthington.co.uk` | product — personal / blog (DNS/Pages in mzworthington repo) |
| *(GoDaddy onboard)* | see `zones.yaml` (`siliconpanda.*` deferred — Workspace mail) |

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

## CI (this repo)

Single workflow [`.github/workflows/pulumi.yml`](.github/workflows/pulumi.yml):

1. **Matrix** — stack list from [`zones.yaml`](zones.yaml) via `scripts/zones-matrix.cjs`
2. **Preview** — every branch (PR + push), all stacks in that matrix
3. **Manual gate** — GitHub Environment `pulumi-prod` (required reviewers)
4. **Apply** — `main` only, after preview succeeds and the environment is approved

## Shared Cloudflare tooling (product repos)

Prefer the reusable workflow + bootstrap shim. Details: [docs/reusable-cloudflare-ci.md](docs/reusable-cloudflare-ci.md). Copy-paste starters: [examples/product-cloudflare/](examples/product-cloudflare/).

```yaml
# product repo: .github/workflows/pulumi-cloudflare.yml
jobs:
  pulumi:
    uses: mzworthington/edge-dns/.github/workflows/product-pulumi-cloudflare.yml@main
    with:
      work-dir: infra/cloudflare
      stack-name: prod
      tooling-ref: main
    secrets: inherit
```

Or call the composite actions directly:

| Action | Use |
|--------|-----|
| [`setup-pulumi-cloudflare`](.github/actions/setup-pulumi-cloudflare) | Node/pnpm + product stack config |
| [`pulumi-rich-report`](.github/actions/pulumi-rich-report) | preview/up with diffs + Pulumi Cloud links |

```yaml
- uses: mzworthington/edge-dns/.github/actions/setup-pulumi-cloudflare@main
  with:
    work-dir: infra/cloudflare
    stack-name: prod
  env:
    PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    CLOUDFLARE_ZONE_ID: ${{ secrets.CLOUDFLARE_ZONE_ID }}
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    PULUMI_PAGES_PROJECT_NAME: ${{ vars.PULUMI_PAGES_PROJECT_NAME }}
    PULUMI_PAGES_HOSTNAMES: ${{ vars.PULUMI_PAGES_HOSTNAMES }}

- uses: mzworthington/edge-dns/.github/actions/pulumi-rich-report@main
  with:
    command: preview
    stack-name: prod
    work-dir: infra/cloudflare
    comment-on-pr: ${{ github.event_name == 'pull_request' }}
  env:
    PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

Pin workflow/`tooling-ref` (or action refs) to a commit SHA for a frozen consumer.
