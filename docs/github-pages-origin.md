# GitHub Pages origin DNS

Some product sites publish from **GitHub Actions → GitHub Pages**, not Cloudflare Pages. The zone still lives here. Apex/www DNS that points at GitHub Pages also lives here so the product repo does not need a Cloudflare stack.

## Inventory

In [`zones.yaml`](../zones.yaml):

```yaml
eval-driven-development.dev:
  role: product
  githubPages: mzworthington.github.io
```

That creates (DNS-only, not orange-clouded):

- Four `A` + four `AAAA` at the apex → [GitHub Pages addresses](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- `www` `CNAME` → `mzworthington.github.io`
- `WebAnalyticsSite` for the zone (`zoneTag` + `autoInstall: true`)

Records are unproxied so GitHub can verify the domain and issue the Pages certificate. Auto-inject therefore does not run. Copy the stack output `webAnalyticsSnippet` into the product HTML (`index.html`, `404.html`) before `</body>`.

If the site already exists in the dashboard, import it instead of creating a second one:

```bash
pulumi stack select eval-driven-development.dev
pulumi import --yes --generate-code=false \
  'cloudflare:index/webAnalyticsSite:WebAnalyticsSite' \
  eval-driven-development-dev-github-pages-web-analytics \
  '<account_id>/<site_id>' \
  --parent 'urn:pulumi:eval-driven-development.dev::edge-dns::edge-dns:zone:ManagedZone$edge-dns:zone:GitHubPagesOrigin::eval-driven-development-dev-github-pages'
```

`site_id` is `site_tag` from `GET /accounts/{account_id}/rum/site_info/list`.

## Product repo

Keep the existing GitHub Pages workflow (`actions/deploy-pages`). Do not add Wrangler, Pulumi, or Cloudflare Pages.

Set the custom domain on the repo (publishing from a workflow ignores a `CNAME` file):

```bash
gh api --method PUT repos/<owner>/<repo>/pages \
  --input - <<'EOF'
{
  "build_type": "workflow",
  "cname": "eval-driven-development.dev"
}
EOF
```

After DNS is live and GitHub has issued the cert:

```bash
gh api --method PUT repos/<owner>/<repo>/pages \
  --raw-field cname=eval-driven-development.dev \
  --raw-field https_enforced=true
```

If GitHub shows a domain verification TXT, set it on the zone stack:

```bash
pulumi stack select eval-driven-development.dev
pulumi config set githubPagesChallenge '<token from Pages settings>'
pulumi up
```

## Token scope

Zone DNS Edit on this zone (already required for vanity redirects). Account Settings Read/Write for the Web Analytics site. Cloudflare Pages Edit is not required.
