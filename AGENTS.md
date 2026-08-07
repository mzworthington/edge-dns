# Agent Handshake

Standards and lifecycle agents live in `~/.agents` ([agent-lifecycle-kit](https://github.com/mzworthington/agent-lifecycle-kit)).

Before starting work, read:

- `~/.agents/AGENTS.md` — bootstrap and lifecycle routing
- `~/.agents/CODING_PHILOSOPHY.md` — hexagonal architecture, DDD, vertical slices, clean code
- `~/.agents/skills/profile-iac/SKILL.md` — secure IaC
- `~/.agents/skills/framework-pulumi/SKILL.md` — Pulumi patterns

## Toolchain

- Declared in `mise.toml` (Node, pnpm).
- One Pulumi project at repo root (`edge-dns`); stack name = domain. Shared component: `components/zone`.

## Project notes

- This repo owns **zones and baselines** only — not product Pages/DNS.
- Before handover: `pnpm install && pnpm typecheck && pulumi preview` (with stack selected).
