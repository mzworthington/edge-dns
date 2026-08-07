# Add a zone

1. Domain registered; nameservers can be pointed at Cloudflare.
2. Append the domain to [`zones.txt`](../zones.txt) and to the preview/apply workflow matrices.
3. `pulumi stack init <domain>` then set `accountId`, `zoneName` (= domain), `cloudflare:apiToken`.
4. **Existing zone:** `pulumi import 'cloudflare:index/zone:Zone' <slug>-zone <zone_id>` then `pulumi up` so the `ManagedZone` parent settles (preview must show no zone recreate/destroy).
5. Snapshot into `docs/baselines/<domain>.md`.
6. Hand off to the product team ([add-product-dns.md](add-product-dns.md)).

## Token scope (this repo)

- Zone Read + Write for managed zones
- Zone Settings Read/Write only if `manageSettings=true`
- Pages Edit is **not** required here
