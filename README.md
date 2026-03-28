# PaperMate

`PaperMate` is a human-in-the-loop research and paper-writing agent built inside an OpenCode-style workspace.

It is designed for real paper-writing workflows rather than fully autonomous "idea to paper" automation. The current focus is:

- topic framing
- literature scouting
- note organization
- drafting
- claim/evidence review
- defense preparation
- revision tracking

## Positioning

This project is best understood as a control layer for research and paper work:

- one visible orchestrator
- artifact-first workflow
- checkpoint-aware editing and review
- evidence-first search and writing

It is especially suitable for thesis-style and paper-writing workflows where the user wants an agent that can research and write with them, without silently taking over high-risk decisions.

## Current search layer

The search layer currently includes:

- multi-query rewrite
- multi-source recall
- fusion and reranking
- seed-paper expansion via OpenAlex related/reference graph
- browser-backed search path through Chrome DevTools
- structured selection reasons and defense-ready notes

## Codex and Claude Code

PaperMate is named to work well across:

- OpenCode
- Codex
- Claude Code

The public name is `PaperMate`.
The internal orchestrator/runtime path remains `paper-writer`.

For Codex-specific setup, see:

- [docs/codex-papermate.md](docs/codex-papermate.md)
- [agents/paper-writer/PAPERMATE-CODEX-PROMPT.md](agents/paper-writer/PAPERMATE-CODEX-PROMPT.md)

## Repository layout

- [agents/paper-writer](agents/paper-writer)
- [commands](commands)
- [scripts](scripts)
- [docs/paper-writer](docs/paper-writer)

## Quick start

Run tests:

```bash
npm run test:paper-writer
```

Run the smoke scenario:

```bash
npm run smoke:paper-writer
```

Browser-backed status:

```bash
npm run status:chrome-devtools
```

Browser-backed smoke:

```bash
npm run smoke:chrome-devtools
```

## Usage example

```json
{
  "mode": "new",
  "goal": "先筛论文，再起草 related work",
  "searchMode": "real"
}
```

For browser-backed retrieval:

```json
{
  "mode": "new",
  "goal": "先筛论文，再起草 related work",
  "searchMode": "browser",
  "browserUrl": "http://127.0.0.1:19825"
}
```

## Status

PaperMate is ready for an early public release.

What is stable now:

- orchestrator/runtime skeleton
- session lifecycle
- paper workflow routing
- search-layer core logic
- tests for the current `paper-writer` runtime path

What is still evolving:

- browser-backed retrieval quality
- post-filtering of broad search results
- citation/reference expansion depth
- top-level product polish

## License

MIT
