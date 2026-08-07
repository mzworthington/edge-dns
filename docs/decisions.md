# Decisions

## IaC: Pulumi TypeScript + Pulumi Cloud

**Chosen:** Pulumi (TypeScript) with remote state in Pulumi Cloud.

**Why:** Product Cloudflare stacks already use `@pulumi/cloudflare` and Pulumi Cloud.

## Project + stack naming

**Chosen:** One Pulumi project `edge-dns`; **one stack per zone**, named after the domain (`archlens.dev`, `mzworthington.co.uk`, …).

**Why:** Scales to many zones without `edge-dns-<hyphenated-domain>/prod` project sprawl. Blast radius stays per-zone (separate state). CI matrices over stacks.

**Not chosen:** One stack managing all zones (shared blast radius); one Pulumi project per zone (redundant with the repo name).

## Ownership split

**Chosen:** `edge-dns` owns zone create/import, nameservers, DNSSEC, and shared zone settings. Product repos own Pages/Workers/R2 and DNS records for their hostnames (apex or subdomain).
