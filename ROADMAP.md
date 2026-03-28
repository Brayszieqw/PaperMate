# Roadmap

## Release framing

PaperMate is being released as an early open-source WIP.

The first public scope is deliberately narrow:

- Chinese undergraduate and master's thesis workflows
- Human-in-the-loop assistance instead of full automation
- Search, evidence organization, and draft preparation first

International and multilingual support may come later, but they are not the current release target.

## Current status

The core runtime shape already exists:

- workflow routing
- checkpoint-oriented execution
- session and runtime state handling
- multi-source literature search and reranking

The search layer is currently the strongest part of the project. It can already gather, fuse, and structure candidate papers without depending on an LLM for the main retrieval path.

## What works today

- Route a research goal into a paper-writing workflow stage
- Search OpenAlex and Crossref directly
- Extend search with browser-backed arXiv retrieval
- Fuse, rerank, and deduplicate results
- Return structured candidate sets with selection reasons and defense notes
- Run local smoke flows for the paper-writer runtime

## What is not done yet

- End-to-end search -> draft -> review -> revision flow
- Production LLM integration for assisted drafting
- Stable CLI for non-agent users
- School-specific Chinese thesis templates and formatting rules
- Strong citation checking and evidence-gap review across full drafts

## P0: Public release baseline

- [ ] Keep the repo publishable and easy to understand
- [ ] Make the README clearly state scope, limits, and intended users
- [ ] Keep one reproducible smoke path working locally
- [ ] Keep the search layer stable enough for external evaluation
- [ ] Document setup for browser-backed retrieval

Target: a public repo that is honest, runnable, and understandable.

## P1: End-to-end assisted writing

- [ ] Connect `runPaperWriterEntry` to an LLM-backed drafting path
- [ ] Use search artifacts as drafting context
- [ ] Generate outline and related-work style drafts from evidence
- [ ] Emit a review checkpoint before any write-to-disk action

Target: one full assisted flow from goal -> search -> draft -> checkpoint.

## P2: Chinese thesis workflow support

- [ ] Add support for common Chinese thesis stages: topic framing, outline, chapter drafting, revision
- [ ] Add thesis-oriented section planning
- [ ] Add evidence checks for literature review claims
- [ ] Add revision support for advisor feedback loops
- [ ] Add clearer support for Chinese academic writing style guidance

Target: become genuinely useful for Chinese students, not just technically interesting.

## P3: Reliability and usability

- [ ] Add retries and backoff for OpenAlex and Crossref
- [ ] Add per-provider timeouts
- [ ] Improve session persistence safety
- [ ] Add a CLI entry point for easier local use
- [ ] Improve setup instructions for users outside Codex-style environments

Target: reduce operational friction and make testing easier.

## P4: Broader support

- [ ] Evaluate multilingual workflows after the Chinese-first path is stable
- [ ] Explore support for non-Chinese university writing workflows
- [ ] Revisit model routing and richer provider integration

Target: expand only after the first workflow is coherent and validated.

## Non-goals

- Fully autonomous "write the whole thesis for me"
- Silent overwriting of user drafts
- Paid-provider lock-in as a requirement for core functionality
- Pretending the project already solves every academic writing use case
