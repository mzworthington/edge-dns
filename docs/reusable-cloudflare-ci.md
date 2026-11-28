# Reusable Cloudflare CI + bootstrap

`edge-dns` is the **home** for shared Cloudflare GitHub Actions and product bootstrap scripts. Product repos own Pages/Workers/R2 **resources** and hostname DNS; they should **not** copy/paste Actions or setup scripts.

Zone lifecycle stays in this repo ([ownership.md](ownership.md)). This page covers shared **tooling** only.

## What lives here

| Path | Purpose |
|------|---------|
| [`.github/actions/pulumi-rich-report`](../.github/actions/pulumi-rich-report) | Preview/up with diffs, job summary, PR comments, Pulumi Cloud links |
| [`.github/actions/setup-pulumi-cloudflare`](../.github/actions/setup-pulumi-cloudflare) | Product stack: Node/pnpm + `accountId` / `zoneId` / Pages config |
| [`.github/actions/setup-edge-dns-pulumi`](../.github/actions/setup-edge-dns-pulumi) | This repo only: zone stack config |
| [`.github/workflows/product-pulumi-cloudflare.yml`](../.github/workflows/product-pulumi-cloudflare.yml) | Reusable preview → **Approval** (Environment) → apply |
| [`cmd/setup-cloudflare-hosting`](../cmd/setup-cloudflare-hosting) | Local bootstrap on `PATH`: secrets → GitHub → Pulumi config |
| [`examples/product-cloudflare/`](../examples/product-cloudflare/) | Thin CI workflow to copy into product repos |

## Product repo: CI

1. Copy [`examples/product-cloudflare/.github/workflows/pulumi-cloudflare.yml`](../examples/product-cloudflare/.github/workflows/pulumi-cloudflare.yml).
2. Create Environment **`pulumi-prod`** with required reviewers.
3. Ensure secrets/vars exist (or run the bootstrap script below).

### Dependabot / fork PRs

GitHub does **not** pass Actions secrets to Dependabot or fork `pull_request` runs. The reusable workflow therefore keeps secrets optional: preview/apply **skip** when secrets are missing (so Dependabot infra bumps stay green), and **fail** on `main` push/dispatch if secrets are absent.

To run real Pulumi previews on Dependabot PRs, mirror the same four values as [Dependabot secrets](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/managing-encrypted-secrets-for-dependabot) (`PULUMI_ACCESS_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`).

Pin both the workflow and `tooling-ref` to the same commit SHA when you want a frozen consumer:

```yaml
jobs:
  pulumi:
    uses: mzworthington/edge-dns/.github/workflows/product-pulumi-cloudflare.yml@<sha>
    with:
      tooling-ref: <sha>
    secrets: inherit
```

### Call composite actions directly

If you keep a custom workflow, still reuse the actions:

```yaml
- uses: actions/checkout@v7

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

### Web Analytics (RUM)

Orange-clouded product hosts (Cloudflare Pages / Workers): the zone-owner stack creates `WebAnalyticsSite` with `autoInstall: true` and `enabled: true`. Do not paste snippets or inject at deploy. Shared-apex products (SteerCo, the build monitor, template forks) must **not** create a second site.

Grey-cloud GitHub Pages origins cannot use auto-install. They keep a first-party `insights.<zone>` beacon host and paste `webAnalyticsSnippet` — see [github-pages-origin.md](github-pages-origin.md).

### Env vars understood by `setup-pulumi-cloudflare`

| Env | Pulumi config key |
|-----|-------------------|
| `CLOUDFLARE_ACCOUNT_ID` | `accountId` (required) |
| `CLOUDFLARE_ZONE_ID` | `zoneId` (required) |
| `CLOUDFLARE_API_TOKEN` | `cloudflare:apiToken` secret (required) |
| `PULUMI_PAGES_PROJECT_NAME` | `pagesProjectName` |
| `PULUMI_PAGES_HOSTNAMES` | `pagesHostnames` (JSON array, plaintext) |
| `PULUMI_APEX_DOMAIN` | `apexDomain` (legacy) |
| `PULUMI_WWW_DOMAIN` | `wwwDomain` (legacy) |

Extra keys: pass `extra-config` as multiline `KEY=VALUE`.

## Product repo: bootstrap script

Put this checkout's `cmd` on `PATH`:

```bash
export PATH="$HOME/Documents/dev/edge-dns/cmd:$PATH"
```

Export `BWS_ACCESS_TOKEN`, `BWS_PROJECT_ID`, `PULUMI_STACK`, and `DOMAIN` (see [`.env.example`](../examples/product-cloudflare/.env.example)), then from the product repo:

```bash
gh auth login
pulumi login
setup-cloudflare-hosting
```

`setup-cloudflare-hosting` runs [`scripts/setup-cloudflare-hosting.sh`](../scripts/setup-cloudflare-hosting.sh) from this checkout. Product repos do not copy it. Keep a local `bin/setup-cloudflare-hosting.sh` only when that repo adds defaults or a follow-up step.

Pages project name and hostnames come from `infra/cloudflare/hosting.yaml`. The bootstrap script copies the Bitwarden secrets into GitHub and the Pulumi stack. It does not read a `.env` file.

## Migration checklist (from a duplicated product copy)

1. Replace local `.github/actions/setup-pulumi-cloudflare` with the edge-dns action (or the reusable workflow).
2. Replace inline `pulumi/actions` + dashboard glue with `pulumi-rich-report` (or the reusable workflow).
3. Delete the local downloader and run `setup-cloudflare-hosting` from this checkout (`cmd` on `PATH`).
4. Delete the old composite action directory from the product repo.
5. Point docs at [this page](reusable-cloudflare-ci.md) and [add-product-dns.md](add-product-dns.md).

## Do not

- Create Cloudflare zones from product CI or bootstrap scripts.
- Vendor copies of these Actions/scripts into product repos (shims + `uses:` only).
- Put product `DnsRecord` / Pages / R2 resources into `edge-dns` stacks.
