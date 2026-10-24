# Baseline — romini.party

Declared in [`zones.yaml`](../../zones.yaml). Zone ID and nameservers are filled in after the first `pulumi up` on stack `romini.party` (CI creates the stack from `zones.yaml`).

| Field | Value |
|-------|--------|
| Account ID | `fe0bb0a89551958509fe4d65883026cc` |
| Role | product |
| Product DNS | RoMini `deploy/party` (Worker custom domains for `romini.party`, `www`, and `demo`) |

Point the registrar nameservers at the Cloudflare set printed by that apply. The zone has to exist in this account before `wrangler deploy` can attach those hostnames.
