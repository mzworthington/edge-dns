# Product Cloudflare shims

Copy these into a product repo so CI and bootstrap stay thin while logic lives in `edge-dns`.

| Copy from | Copy to (product repo) |
|-----------|------------------------|
| `.github/workflows/pulumi-cloudflare.yml` | `.github/workflows/pulumi-cloudflare.yml` |
| `.env.example` | `.env.example` (merge as needed) |

Bootstrap is `setup-cloudflare-hosting` from the edge-dns checkout (`cmd` on `PATH`), not a copied script.

Full guide: [docs/reusable-cloudflare-ci.md](../../docs/reusable-cloudflare-ci.md).
