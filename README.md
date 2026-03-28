<p align="center">
  <h1 align="center">PaperMate</h1>
  <p align="center">面向中国大学生的论文写作智能体 · Human-in-the-loop Thesis Copilot</p>
</p>

<p align="center">
  <a href="./README.md"><b>English</b></a> ·
  <a href="./README_CN.md"><b>简体中文</b></a>
</p>

<p align="center">
  <a href="https://github.com/Brayszieqw/PaperMate/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License" />
  </a>
  <a href="https://github.com/Brayszieqw/PaperMate/releases">
    <img src="https://img.shields.io/github/v/release/Brayszieqw/PaperMate?color=green" alt="Release" />
  </a>
  <a href="https://github.com/Brayszieqw/PaperMate/stargazers">
    <img src="https://img.shields.io/github/stars/Brayszieqw/PaperMate?style=social" alt="Stars" />
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
</p>

---

> PaperMate is an early-stage, human-in-the-loop research and thesis-writing copilot for Chinese university students.
>
> It is designed for students who do not yet know how to narrow a topic, search literature, organize evidence, and turn that material into a thesis structure. PaperMate assists the process — it does not replace the student.

> **Status**: Early open-source WIP. The runtime and search layer are usable. End-to-end LLM drafting is in progress.

---

## Positioning

PaperMate is not a "write my whole paper" agent.

The first public scope is deliberately narrow:

- Chinese undergraduate and master's thesis workflows
- Human-in-the-loop research and writing assistance
- Evidence-first search, note organization, and draft preparation

The long-term architecture supports other languages and academic workflows, but that is not the current focus.

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

- **Human-in-the-loop** — pauses before high-stakes actions
- **Evidence-first** — claims stay tied to sources
- **Workflow-aware** — topic framing, search, notes, drafting, review, and revision are distinct stages
- **Open and hackable** — the runtime, contracts, and prompts are all visible in the repo

This makes PaperMate a better fit for students who need support and structure, but still need to understand and defend what they write.

## Current limitations

- The search layer is the most mature part of the system
- End-to-end LLM drafting is not fully wired into the runtime yet
- Chinese thesis templates, school-specific rules, and citation formats are not standardized yet
- Browser-backed retrieval requires local Chrome DevTools setup

## Quick start

```bash
npm install
npm run test:paper-writer
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

For browser-backed arXiv retrieval, start Chrome with remote debugging enabled, then:

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
├── .claude-plugin/         # Claude Code plugin manifest
├── agents/                 # Agent prompts and role definitions
├── commands/               # Slash-command entry points
├── docs/                   # Design docs and runtime contracts
├── scripts/                # Runtime, search, session, and adapter code
├── skills/                 # Auto-activating skill definitions
├── README.md
└── ROADMAP.md
```

## Key files to read first

- `agents/paper-writer/paper-writer.md` — core workflow prompt
- `scripts/paper-writer-search-layer.js` — most mature implementation today
- `docs/paper-writer/paper-writer-runtime-contracts.md` — runtime contracts and data model
- `docs/paper-writer/progress-map.md` — implementation maturity and gaps

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for current priorities, limitations, and next milestones.

## Contributing

Issues and PRs are welcome. Please open an issue first to discuss what you would like to change.

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

This means:
- You can use, study, modify, and distribute this software
- If you deploy a modified version as a network service, you must release your source code under the same license
- Commercial use is permitted, but you cannot make it proprietary

See [LICENSE](./LICENSE) for the full text.
