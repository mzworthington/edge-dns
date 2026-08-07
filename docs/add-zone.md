# Add a zone

Checklist for onboarding a domain into `edge-dns`.

1. **Registrar** — Domain registered; you can change nameservers.
2. **Scaffold** — Copy `zones/archlens.dev` → `zones/<domain>/`. Update `Pulumi.yaml` name/description and `index.ts` config keys as needed.
3. **Create or import**
   - New domain: `pulumi up` creates the zone; set registrar NS to the exported nameservers; wait until status is `active`.
   - Existing Cloudflare zone: set `zoneId` / `accountId` / `zoneName`, then `pulumi import` the `Zone` (and baseline `ZoneSetting` resources) so preview is clean — do **not** recreate live DNS.
4. **Baselines** — Confirm SSL / HTTPS / TLS settings match the live zone (or intentionally converge). Snapshot settings into `docs/baselines/<domain>.md`.
5. **CI** — Ensure path filters cover the new zone folder; set GitHub secrets if this is a new account/token scope.
6. **Hand off** — Tell the product team the zone is Active and they may attach Pages/DNS (see [add-product-dns.md](add-product-dns.md)).
7. **Apply gate** — Merge only after `pulumi preview` shows no unexpected destroys/replaces.

## Token scope (this repo)

- Zone: Read + Write (or Zone Settings Write) for managed zones
- Account: Read if required to list/create zones
- **Not required here:** Cloudflare Pages Edit (product repos hold that)
