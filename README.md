# PaperMate

PaperMate is an early-stage research and thesis-writing copilot for Chinese university students.

It is designed for students who do not yet know how to narrow a topic, search literature, organize evidence, and turn that material into a thesis structure. PaperMate is meant to assist the process, not replace the student.

> Status: early open-source WIP. The runtime and search layer are usable. End-to-end LLM drafting is still in progress.

## Positioning

PaperMate is not trying to be a general-purpose "write my whole paper" agent.

The first public scope is narrower:

- Chinese undergraduate and master's thesis workflows
- Human-in-the-loop research and writing assistance
- Evidence-first search, notes, and draft preparation

The long-term architecture can support other languages and academic workflows, but that is not the current focus.

## Who it is for

- Chinese university students who need help learning the paper-writing workflow
- Builders who want an open, inspectable paper-writing runtime
- Researchers exploring controlled, checkpoint-based writing assistance

## What it is not

- A fully autonomous ghostwriting tool
- A polished end-to-end thesis product
- A universal solution for every school, field, or citation style

## What it does today

- Routes a paper-related goal into a workflow stage
- Runs multi-source literature search across OpenAlex, Crossref, and arXiv
- Fuses, reranks, and deduplicates candidate papers
- Produces structured candidate sets with explicit selection reasons
- Keeps runtime state, checkpoints, and session artifacts organized

## Why this project exists

Most writing agents optimize for maximum automation. PaperMate takes a different path:

- Human-in-the-loop: pauses before high-stakes actions
- Evidence-first: claims should stay tied to sources
- Workflow-aware: topic framing, search, notes, drafting, review, and revision are different stages
- Open and hackable: the runtime, contracts, and prompts are visible in the repo

This makes it a better fit for students who need support and structure, but still need to understand and defend what they write.

## Current limitations

- The search layer is the most mature part of the system
- End-to-end LLM drafting is not fully wired into the runtime yet
- Chinese thesis templates, school-specific rules, and citation formats are not standardized yet
- Browser-backed retrieval requires local Chrome DevTools setup

## Quick start

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm run test:paper-writer
```

Run the smoke scenario:

```bash
npm run smoke:paper-writer
```

Try the runtime in code:

```js
const { runPaperWriterEntry } = require('./scripts/paper-writer-entry');

const result = await runPaperWriterEntry({
  goal: 'review retrieval-augmented generation for biomedical question answering',
  searchMode: 'real',
});

console.log(result.ui.guidance);
console.log(result.runtime.searchArtifact.items.length, 'candidates found');
```

For browser-backed arXiv retrieval, start Chrome with remote debugging and use:

```js
const result = await runPaperWriterEntry({
  goal: 'review retrieval-augmented generation for biomedical question answering',
  searchMode: 'browser',
  browserUrl: 'http://127.0.0.1:9222',
});
```

## Repository layout

```text
PaperMate/
|- agents/                  # agent prompts and role definitions
|- commands/                # slash-command entry points
|- docs/                    # design docs and runtime contracts
|- plugins/                 # plugin integrations
|- scripts/                 # runtime, search, session, and adapter code
|- README.md
|- ROADMAP.md
```

## Key files to read first

- `agents/paper-writer/paper-writer.md`: core workflow prompt
- `scripts/paper-writer-search-layer.js`: most mature implementation today
- `docs/paper-writer/paper-writer-runtime-contracts.md`: runtime contracts and data model
- `docs/paper-writer/progress-map.md`: implementation maturity and gaps

## Roadmap

See `ROADMAP.md` for current priorities, limitations, and next milestones.

## License

MIT
