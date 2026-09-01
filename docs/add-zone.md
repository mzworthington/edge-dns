# Add a zone

1. Domain registered; nameservers can be pointed at Cloudflare.
2. Add the domain to [`zones.yaml`](../zones.yaml) (`role: product`, optional `githubPages`, or `role: vanity` + `redirectTo`). CI preview/apply matrices are generated from this file.
3. `pulumi stack init <domain>` then set `accountId`, `zoneName` (= domain), `cloudflare:apiToken`.
4. **Existing zone:** select **that domain's stack first**, then `pulumi import 'cloudflare:index/zone:Zone' <slug>-zone <zone_id>` then `pulumi up` so the `ManagedZone` parent settles (preview must show no zone recreate/destroy). Importing into another stack leaves a protected zone in the wrong state and CI preview fails.

### Stray zone in the wrong stack

If preview fails with `cannot be deleted because it is protected` for a `cloudflare:index/zone:Zone` whose name is **not** this stack's `<slug>-zone`, the live Cloudflare zone is almost certainly owned by a different stack. Do **not** unprotect and destroy.

```bash
pulumi stack select <wrong-stack>
pulumi state delete --yes 'urn:pulumi:<wrong-stack>::edge-dns::cloudflare:index/zone:Zone::<other-slug>-zone'
```

That untracks the resource from this stack only. CI runs `scripts/assert-stack-zone-state.cjs` after stack select so this fails with those commands instead of a generic protect error.
5. Snapshot into `docs/baselines/<domain>.md`.
6. Hand off to the product team ([add-product-dns.md](add-product-dns.md)).

## Bulk onboarding (e.g. GoDaddy → Cloudflare DNS)

Registrar can stay at GoDaddy. This repo only creates Cloudflare zones.

1. Add domains to [`zones.yaml`](../zones.yaml) (`role: product`, or `role: vanity` + `redirectTo`). CI matrix is generated from this file.
2. For mail domains (e.g. Google Workspace on `siliconpanda.com`): copy MX/SPF/DKIM/DMARC into Cloudflare **before** changing nameservers.
3. Bootstrap stacks (init + config; optional preview/up + print NS):

```bash
export CLOUDFLARE_ACCOUNT_ID=…
export CLOUDFLARE_API_TOKEN=…
export PULUMI_ACCESS_TOKEN=…   # if using Pulumi Cloud
./scripts/bootstrap-zones.sh --init-only --only-new
./scripts/bootstrap-zones.sh --preview cloudymelon.com   # smoke one first
./scripts/bootstrap-zones.sh --up --only-new --print-ns
```

4. At the registrar, set each domain’s nameservers to the printed Cloudflare `nameServers`.
5. Wait until status is **Active**, then baselines + product DNS as above.

`bootstrap-zones.sh` does **not** change GoDaddy or transfer registration.

## Token scope (this repo)

- Zone Read + Write for managed zones
- Zone Settings Read/Write only if `manageSettings=true`
- Zone DNS Edit + Zone Single Redirect Edit when the zone has `role: vanity` in [`zones.yaml`](../zones.yaml) (see [org-redirects.md](org-redirects.md))
- Zone DNS Edit when the zone has `githubPages` (GitHub Pages origin A/AAAA/CNAME)
- Account Settings Read/Write when the zone has `githubPages` (Web Analytics / RUM site)
- Workers Scripts Write when the zone has `githubPages` (first-party RUM proxy on `insights.<zone>`)
- Pages Edit is **not** required here
