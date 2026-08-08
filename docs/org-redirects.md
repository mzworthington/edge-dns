# Org vanity redirects

Vanity zones that only forward to a canonical host are declared in [`org-redirects.ts`](../org-redirects.ts) and applied by `CanonicalRedirect` in the matching zone stack.

| Source zone | Canonical host |
|-------------|----------------|
| `mzworthington.com` | `mzworthington.co.uk` |
| `matthewworthington.com` | `mzworthington.co.uk` |

## What gets created

Per vanity stack:

1. Proxied `A` records for apex + `www` → `192.0.2.1` (sinkhole; traffic stays on Cloudflare)
2. Zone Single Redirect ruleset (`http_request_dynamic_redirect`) — 301 to `https://<canonical><path>` with query string preserved

Override with stack config if needed: `pulumi config set canonicalRedirectTo <host>`.

## Before first apply

1. In the Cloudflare dashboard, **remove custom domains** from any Pages projects on the vanity zones (the screenshot projects for `mzworthington.com` / `matthewworthington.com`). Otherwise DNS create will conflict with Pages-owned records.
2. API token needs **Zone DNS Edit** and **Zone Single Redirect Edit** (in addition to Zone Read/Write).

## Not in scope here

- Product site hosting stays on `mzworthington.co.uk` in the [mzworthington](https://github.com/mzworthington/mzworthington) repo (`_redirects` www → apex only).
- Do not attach Pages/Workers to vanity zones once redirects are live.
