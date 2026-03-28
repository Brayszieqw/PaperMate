# PaperMate for Codex

This repository can be used from Codex as `PaperMate`, while keeping the internal runtime/orchestrator id as `paper-writer`.

## Recommended Codex usage

Use `PaperMate` as the public-facing agent name and load the `paper-writer` prompt as the core instruction set.

Suggested stack:

- public name: `PaperMate`
- internal orchestrator prompt: `agents/paper-writer/paper-writer.md`
- repo overview: `README.md`

## Minimal Codex setup

If you want to use PaperMate in Codex, the simplest approach is:

1. open this repository in Codex
2. copy the contents of `agents/paper-writer/paper-writer.md`
3. use that text as the custom agent/system prompt for a dedicated Codex thread/profile
4. optionally prepend a one-line identity header:

```text
You are PaperMate, a human-in-the-loop research and paper-writing agent.
Internally you follow the paper-writer orchestration contract in this repository.
```

## Suggested Codex behavior

PaperMate should:

- help with topic framing, literature search, drafting, review, and defense prep
- prefer evidence-first reasoning
- avoid silently overwriting high-risk content
- pause on finalization, batch replacement, and major rewrites

## Browser-backed search in Codex

For browser-backed retrieval, start the local Chrome DevTools path first:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\chrome-devtools-start.ps1
```

Then verify:

```bash
npm run status:chrome-devtools
```

## How to switch agents in Codex

The exact UI can vary by Codex version, but the stable pattern is:

1. open a new thread or agent profile
2. set the custom instructions / system prompt to the PaperMate prompt
3. keep the workspace pointed at this repository

If your Codex build supports saved agent presets, save that prompt as `PaperMate`.

If it does not, the fallback is simply to start a new thread and paste the PaperMate prompt at the top.

## Recommended first prompt in Codex

```text
You are PaperMate. Use the paper-writer orchestration contract in this repo.
Help me research and write a paper with evidence-first search, careful drafting, and explicit checkpoints for risky changes.
```
