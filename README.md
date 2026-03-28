# PaperMate

A human-in-the-loop research and paper-writing agent.

PaperMate helps you research and write academic papers — with you, not instead of you. It scouts literature, organizes notes, drafts sections, checks evidence, and prepares you for thesis defense, while pausing at every high-stakes decision for your approval.

> **Status: Early experimental.** Core runtime and search layer are stable. End-to-end LLM execution is in progress. Feedback welcome.

---

## What it does

| Stage | What PaperMate does |
|-------|---------------------|
| Topic framing | Helps narrow and clarify your research question |
| Literature scouting | Multi-source search (OpenAlex, Crossref, arXiv) with fusion and reranking |
| Note organization | Structures candidate papers into annotated, defense-ready notes |
| Drafting | Outlines and drafts sections based on collected evidence |
| Claim review | Flags unsupported claims and weak evidence links |
| Defense prep | Anticipates advisor questions and prepares reasoned answers |
| Revision tracking | Tracks what has changed, what is pending, and what still needs evidence |

---

## Why PaperMate

Most paper-writing agents try to do everything automatically. PaperMate takes a different approach:

- **Checkpoint-first**: pauses before overwriting anything or making irreversible decisions
- **Evidence-first**: every claim traces back to a source you approved
- **Transparent routing**: you see which stage is active and why
- **Defense-ready notes**: every selected paper comes with a rationale you can explain to your advisor

---

## Search layer

The search layer is the most mature part of PaperMate:

- Multi-query rewrite (up to 5 variants per goal)
- Multi-source recall: OpenAlex + Crossref + arXiv (via Chrome DevTools)
- Reciprocal rank fusion with citation-count and query-match scoring
- Seed-paper expansion via OpenAlex related/reference graph
- DOI-level deduplication with canonical preference (journal > conference > preprint)
- Structured `selection_reason` and `defense_notes` for every candidate

---

## Quick start

```bash
npm install
npm test
```

Run the smoke scenario (no external APIs needed):

```bash
npm run smoke:paper-writer
```

Try with real search (requires internet):

```js
const { runPaperWriterEntry } = require('./scripts/paper-writer-entry');

const result = await runPaperWriterEntry({
  goal: 'survey retrieval-augmented generation for biomedical QA',
  searchMode: 'real',
});

console.log(result.ui.guidance);
console.log(result.runtime.searchArtifact.items.length, 'candidates found');
```

With browser-backed arXiv retrieval (requires Chrome with remote debugging):

```js
const result = await runPaperWriterEntry({
  goal: 'survey retrieval-augmented generation for biomedical QA',
  searchMode: 'browser',
  browserUrl: 'http://127.0.0.1:9222',
});
```

---

## Repository layout

```
PaperMate/
├── agents/
│   ├── paper-writer/       # Core agent definition and prompts
│   └── papermate-*.md      # Supporting agent roles
├── commands/               # Slash command entry points
├── scripts/
│   ├── paper-writer-*.js   # Runtime, search, session, host
│   ├── chrome-devtools-*.js # Browser-backed search adapter
│   ├── bb-browser-*.js     # Alternative browser adapter
│   └── swarm-runtime*.js   # Multi-agent orchestration layer
├── docs/
│   ├── paper-writer/       # Design docs and runtime contracts
│   └── codex-papermate.md  # Codex/Claude Code integration guide
└── plugins/                # Audit plugin
```

---

## Requirements

- Node.js 18+
- For real search: internet access (OpenAlex and Crossref are free, no API key needed)
- For browser search: Chrome with `--remote-debugging-port=9222`

---

## Roadmap

See [ROADMAP.md](ROADMAP.md).

---

## License

MIT
