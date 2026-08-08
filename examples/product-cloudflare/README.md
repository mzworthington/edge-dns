# Product Cloudflare shims

Copy these into a product repo so CI and bootstrap stay thin while logic lives in `edge-dns`.

| Copy from | Copy to (product repo) |
|-----------|------------------------|
| `.github/workflows/pulumi-cloudflare.yml` | `.github/workflows/pulumi-cloudflare.yml` |
| `bin/setup-cloudflare-hosting.sh` (shim) | `bin/setup-cloudflare-hosting.sh` |
| `.env.example` | `.env.example` (merge as needed) |

Full guide: [docs/reusable-cloudflare-ci.md](../../docs/reusable-cloudflare-ci.md).
