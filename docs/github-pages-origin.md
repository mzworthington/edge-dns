# GitHub Pages origin DNS

Some product sites publish from **GitHub Actions → GitHub Pages**, not Cloudflare Pages. The zone still lives here. Apex/www DNS that points at GitHub Pages also lives here so the product repo does not need a Cloudflare stack.

## Inventory

In [`zones.yaml`](../zones.yaml):

```yaml
eval-driven.dev:
  role: product
  githubPages: mzworthington.github.io
```

That creates:

- Four `A` + four `AAAA` at the apex → [GitHub Pages addresses](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) (**DNS-only**)
- `www` `CNAME` → `mzworthington.github.io` (**DNS-only**)
- `WebAnalyticsSite` for the zone (`zoneTag`, `autoInstall: false` — grey-cloud cannot use auto-inject)
- Worker `insights.<zone>` that serves `beacon.min.js` (orange-clouded custom domain)

Apex/www stay unproxied so GitHub can verify the domain and issue the Pages certificate. Copy the stack output `webAnalyticsSnippet` into the product HTML (`web/index.html`) before `</body>`. It loads the beacon from `https://insights.<zone>/beacon.min.js` and leaves ingest on `cloudflareinsights.com` (Worker-proxied `send.to` 404s).

Stack output `rumProxyHostnameOut` is the beacon hostname (`insights.eval-driven.dev`).

If the site already exists in the dashboard, import it instead of creating a second one:

```bash
pulumi stack select eval-driven.dev
pulumi import --yes --generate-code=false \
  'cloudflare:index/webAnalyticsSite:WebAnalyticsSite' \
  eval-driven-dev-github-pages-web-analytics \
  '<account_id>/<site_id>' \
  --parent 'urn:pulumi:eval-driven.dev::edge-dns::edge-dns:zone:ManagedZone$edge-dns:zone:GitHubPagesOrigin::eval-driven-dev-github-pages'
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
  "cname": "eval-driven.dev"
}
EOF
```

After DNS is live and GitHub has issued the cert:

```bash
gh api --method PUT repos/<owner>/<repo>/pages \
  --raw-field cname=eval-driven.dev \
  --raw-field https_enforced=true
```

If GitHub shows a domain verification TXT, set it on the zone stack:

```bash
pulumi stack select eval-driven.dev
pulumi config set githubPagesChallenge '<token from Pages settings>'
pulumi up
```

## Canonical host cutover

Apply **in this order**. Do not convert the old hostname to vanity in the same apply as the first `eval-driven.dev` up, or GitHub will 301/DNS-fail until the new Pages certificate exists.

1. Import + apply stack `eval-driven.dev` (`githubPages`). Zone ID `8b3f72e434fbb497e2b1a22c0b2737ae` already exists (Cloudflare Registrar).
2. Copy `webAnalyticsSnippet` into the kit `web/index.html` beacon script.
3. Set GitHub Pages `cname` to `eval-driven.dev` and wait until GitHub shows a valid HTTPS certificate.
4. Convert the former host to vanity (`role: vanity`, `redirectTo: eval-driven.dev`). Apply the stack (CI unprotects leftover `WebAnalyticsSite` via `scripts/vanity-cutover.cjs`). CanonicalRedirect www aliases the former GitHub Pages www CNAME so Cloudflare does not see A+CNAME on `www`.

Locally:

```bash
pulumi stack select eval-driven-development.dev
pulumi stack export | node scripts/vanity-cutover.cjs eval-driven-development.dev | while read -r urn; do
  pulumi state unprotect --yes "$urn"
done
pulumi up
```

CI can target one stack: workflow_dispatch `stack=eval-driven.dev`, then later `stack=eval-driven-development.dev`.

## Token scope

Zone DNS Edit on this zone (already required for vanity redirects). Account Settings Read/Write for the Web Analytics site. **Workers Scripts Write** for the first-party beacon Worker. Cloudflare Pages Edit is not required.
