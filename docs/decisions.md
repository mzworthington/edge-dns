# Decisions

## IaC: Pulumi TypeScript + Pulumi Cloud

**Chosen:** Pulumi (TypeScript) with remote state in Pulumi Cloud.

**Why:** Product Cloudflare stacks (ArchLens/blueprint, react-cloudflare-template) already use `@pulumi/cloudflare` and Pulumi Cloud. Matching that stack keeps auth, CI, and operator muscle memory consistent.

**Not chosen:** Terraform / OpenTofu — common for Cloudflare zones, but would diverge from the org’s existing Cloudflare IaC and dual-tool state/CI.

## Ownership split

**Chosen:** `edge-dns` owns zone create/import, nameservers, DNSSEC, and shared zone settings. Product repos own Pages/Workers/R2 and DNS records for their hostnames (apex or subdomain).

**Why:** Products already manage DNS + Pages in-repo (e.g. ArchLens apex/www). Centralizing only the zone control plane avoids fighting product Pulumi state while still making zone lifecycle reviewable in one place.

## First zone

**Chosen:** `archlens.dev` as the first managed zone.

**Deferred:** `mzworthington.co.uk` and multi-zone abstractions until the first zone preview/apply path is green.
