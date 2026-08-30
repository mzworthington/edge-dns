# Decisions

## IaC: Pulumi TypeScript + Pulumi Cloud

**Chosen:** Pulumi (TypeScript) with remote state in Pulumi Cloud.

**Why:** Product Cloudflare stacks already use `@pulumi/cloudflare` and Pulumi Cloud.

## Project + stack naming

**Chosen:** One Pulumi project `edge-dns`; **one stack per zone**, named after the domain (`archlens.dev`, `mzworthington.co.uk`, …).

**Why:** Scales to many zones without `edge-dns-<hyphenated-domain>/prod` project sprawl. Blast radius stays per-zone (separate state). CI matrices over stacks.

**Not chosen:** One stack managing all zones (shared blast radius); one Pulumi project per zone (redundant with the repo name).

## Ownership split

**Chosen:** `edge-dns` owns zone create/import, nameservers, DNSSEC, shared zone settings, **org vanity redirects**, and **GitHub Pages origin DNS** when `githubPages` is set in [`zones.yaml`](../zones.yaml). Product repos that publish on Cloudflare own Pages/Workers/R2 and their hostname DNS.

**Why:** Keeps zone blast radius and org baselines in one place; product deploys stay with the product. Vanity aliases are not product apps — they belong with zone control plane. GitHub Pages sites have no Cloudflare product stack, so origin DNS would otherwise have nowhere to live.

## Zone inventory: `zones.yaml`

**Chosen:** One YAML inventory ([`zones.yaml`](../zones.yaml)) lists every managed zone, its role (`product` | `vanity`), vanity `redirectTo`, and optional `githubPages` origin. Pulumi reads redirects and GitHub Pages DNS from it; CI builds the stack matrix from it (`scripts/zones-matrix.cjs`).

**Why:** Replaces a flat `zones.txt`, a separate `org-redirects.ts` map, and duplicated workflow matrices — one file describes what the repo manages.

**Not chosen:** Encoding inventory only in TypeScript (harder to scan); putting org inventory in per-stack `Pulumi.<stack>.yaml` (secrets/config, wrong layer).

## Shared Cloudflare CI / bootstrap home

**Chosen:** Reusable GitHub Actions, the product Pulumi workflow, and `scripts/setup-cloudflare-hosting.sh` live in `edge-dns`. Product repos keep thin callers/shims only ([examples/product-cloudflare/](../examples/product-cloudflare/)).

**Why:** ArchLens and `react-cloudflare-template` already duplicated setup actions, workflows, and bootstrap scripts. One home avoids drift; resource ownership stays split as above.

**Not chosen:** A separate `cloudflare-tooling` repo (extra indirection for the same consumers); vendoring full copies into every product repo.
