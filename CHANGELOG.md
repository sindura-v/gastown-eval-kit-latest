# Changelog

All notable changes to this project are documented in this file.

## 2026-05-20

### Changed
- Eval runner now supports skills-only operation when no agent file is configured or found.
- `auto_eval.ts` now avoids failing when `agent.agent_file` is absent/missing and continues with skill content.
- Startup banner now clearly reports `skills-only` mode and `(none)` for agent file when applicable.
- `config.yaml` comments now document that `agent.agent_file` is optional.
- README updated to document the skills-only workflow and optional agent usage.
