# Agent Handshake

Standards and lifecycle agents live in `~/.agents` ([agent-lifecycle-kit](https://github.com/mzworthington/agent-lifecycle-kit)).

Before starting work, read:

- `~/.agents/AGENTS.md` — bootstrap and lifecycle routing
- `~/.agents/CODING_PHILOSOPHY.md` — hexagonal architecture, DDD, vertical slices, clean code
- `~/.agents/skills/profile-iac/SKILL.md` — secure IaC
- `~/.agents/skills/framework-pulumi/SKILL.md` — Pulumi patterns

## Toolchain

- Declared in `mise.toml` (Node, pnpm).
- Pulumi programs live under `zones/<domain>/`; shared components under `components/`.

## Project notes

- This repo owns **zones and baselines** only — not product Pages/DNS.
- Before handover: `cd zones/archlens.dev && pnpm install && pnpm typecheck && pulumi preview` (with stack config).
