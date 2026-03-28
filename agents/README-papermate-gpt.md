# PaperMate GPT Family for Claude Code

This folder defines the `papermate-*` agent family used by PaperMate.

The current recommended entrypoint is `papermate-gpt`. It acts as the router, keeps scope under control, and decides when work should stay direct versus move into a short planned flow.

## Current position

- `papermate-gpt` is the default public entrypoint
- `papermate-coder` is the single writer for implementation work
- `papermate-reviewer` is the read-only final review path
- `papermate-validator` is the safety gate for risky commands and mutations
- `papermate-planner`, `papermate-explorer`, `papermate-librarian`, and `papermate-oracle` are escalation roles, not the default path

## Design rules

- Prefer direct execution for small, low-risk tasks
- Escalate only when the task is ambiguous, multi-step, or high-risk
- Keep implementation serial: explore, write once, verify, review
- Do not depend on plugin telemetry for task completion
- Prefer repo-local runtime code and docs over machine-specific external configs

## Claude Code orientation

PaperMate is now oriented around Claude Code style usage rather than the earlier OpenCode-specific setup.

Recommended local references:

- core orchestrator prompt: `agents/paper-writer/paper-writer.md`
- core runtime: `scripts/paper-writer-*.js`
- command entry: `commands/paper-writer-run.md`
- runtime contracts: `docs/paper-writer/paper-writer-runtime-contracts.md`

## Notes

- Some historical design documents in `docs/paper-writer/` still describe earlier OpenCode-era decisions. They are archival context, not the current recommended integration target.
- Browser-backed retrieval remains optional and now requires explicit trust opt-in for local `bb-sites` adapters.
