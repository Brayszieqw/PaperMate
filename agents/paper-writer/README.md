# PaperMate

`PaperMate` is a Claude Code-friendly research and paper-writing agent. Internally it is powered by the `paper-writer` orchestrator path, which routes between topic framing, literature scouting, note organization, drafting, review, PDF deep reading, defense preparation, and revision tracking.

## What is in this folder

- `paper-writer.md`: the primary agent prompt and routing contract

The runtime helpers that support this agent live outside this folder:

- `commands/paper-writer-run.md`
- `scripts/paper-writer-*.js`
- `docs/paper-writer/`

## Current scope

- Single visible orchestrator: `paper-writer`
- Artifact-first workflow: candidate sets, note bundles, evidence packs, drafts, review verdicts
- Checkpoint-aware execution for higher-risk actions
- Session persistence for `new`, `resume`, and `pdf_ops`

## Search modes

- `real`: use implemented external-compatible providers (`openalex`, `crossref`)
- `browser`: prefer a Chrome DevTools-backed browser search path and fall back to `openalex` / `crossref`
- `mock`: offline/demo mode for UI and workflow validation only

`mock` mode is intentionally not a source of truth. If you plan to write, review, or defend a real paper, rerun the search flow in `real` mode and rebuild the evidence chain.

`browser` mode requires a working local Chrome DevTools endpoint plus the `bb-sites` community adapters. Local adapter execution is now opt-in: set `PAPERMATE_ALLOW_UNTRUSTED_BB_SITES=1` only if you trust the adapter files on disk. In this workspace the browser-backed adapter executes those site adapters through Chrome DevTools, then falls back to public providers when the browser chain is unavailable.

## Minimal usage

From the repository root:

```bash
echo '{"mode":"new","goal":"先筛论文，再起草 related work","searchMode":"real"}' | node ./scripts/paper-writer-host.js
```

## Verification

Run the paper-writer test suite:

```bash
npm run test:paper-writer
```

Run the smoke scenario:

```bash
npm run smoke:paper-writer
```

## Known limits

- Real search currently implements only `openalex` and `crossref`
- PDF parsing is text-oriented and not a full layout-aware parser
- The public prompt/runtime is stable enough for iteration, but still early-stage
