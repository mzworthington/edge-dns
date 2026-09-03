# Agent Handshake

Standards and lifecycle agents live in `~/.agents` ([Waykit](https://github.com/mzworthington/waykit)).

Start from `~/.agents/AGENTS.md` (thin index). **Do not** bulk-read philosophy, SOPs, or skills up front.

| Situation | Load |
|-----------|------|
| Any task | `~/.agents/AGENTS.md` invariants + phase table |
| Architecture / new structure | `CODING_PHILOSOPHY.md` (or kit-knowledge `get_philosophy_section`) |
| Feature lifecycle | `skills/agent-orchestrator` |
| Bug / CI / live symptom | `skills/agent-debug` |
| Cloudflare DNS / RUM / beacon Worker | `skills/agent-cloudflare-ops` (`wk mcp cloudflare-ops --project`) |
| Pulumi / zones | `skills/profile-iac` then `skills/framework-pulumi` |
| Handshake / kit bootstrap | `wk align .`. Community files: `wk doctor .` |
| SOP / handover lookup | kit-knowledge MCP |
| Durable project facts | memory MCP (glossary, SLOs, prefs — never secrets) |

Phase handovers: `~/.agents/handover/edge-dns/`.

For bugs and failed jobs, use `agent-debug`. Do not open the full feature lifecycle unless RCA needs a new capability.

## Project notes

- This repo owns **zones and baselines**, **org vanity redirects** ([docs/org-redirects.md](docs/org-redirects.md)), **GitHub Pages origin DNS** when `githubPages` is set ([docs/github-pages-origin.md](docs/github-pages-origin.md)), plus **shared Cloudflare CI/bootstrap tooling** for product repos. It does **not** own Cloudflare Pages/Workers/R2 product resources. **Exception:** the first-party Web Analytics beacon Worker on `insights.<zone>` for `githubPages` origins.
- Product consumers: [docs/reusable-cloudflare-ci.md](docs/reusable-cloudflare-ci.md), [examples/product-cloudflare/](examples/product-cloudflare/).
- Conventional commit-msg: `.githooks/commit-msg` (`git config core.hooksPath .githooks` once per clone).

## Toolchain

Declared in `mise.toml` (Node, pnpm). One Pulumi project at repo root (`edge-dns`); stack name = domain. Shared component: `components/zone`.

MCP: kit `default` in `.cursor/mcp.json`. Do not stack Cloudflare onto that file. For live CF work, `wk mcp cloudflare-ops --project`, then restore `wk mcp default --project`.

Before handover: `pnpm install && pnpm typecheck && pulumi preview` (with stack selected).
