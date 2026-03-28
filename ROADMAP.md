# Roadmap

## Current status

Core runtime, session lifecycle, workflow routing, and search layer are stable with 128 passing tests.

The system can classify a research goal, route it to the right workflow stage, run multi-source literature search, fuse and rerank results, and return a structured candidate set with defense-ready notes — all without requiring an LLM call for the search path itself.

End-to-end LLM execution (where the agent actually drafts text based on the search results) is the next major milestone.

---

## P0 — End-to-end execution

- [ ] Connect `runPaperWriterEntry` output to an LLM call
- [ ] Use search results as context for query rewriting
- [ ] Generate a `related work` section draft from a candidate set
- [ ] Emit a checkpoint asking the user to review before writing to disk

**Target**: one complete flow from goal → search → draft → checkpoint

---

## P1 — LLM integration

- [ ] Use LLM to rewrite search queries (replace rule-based `buildQueryVariants`)
- [ ] LLM-based reranking of search results
- [ ] Evidence gap detection: flag claims that lack source support
- [ ] Summarize each candidate paper in 2-3 sentences

---

## P2 — Stability and usability

- [ ] Retry with backoff for OpenAlex / Crossref (handle 429 / 503)
- [ ] Per-provider timeout (prevent one slow provider from blocking the pipeline)
- [ ] Atomic session writes (write-to-temp + rename)
- [ ] CLI wrapper: `papermate --goal "..." --mode real`
- [ ] Rewrite README for users who do not use Claude Code or Codex

---

## P3 — Polish and safety

- [ ] Chrome DevTools adapter: sandbox or sign community adapters before execution
- [ ] Rate limiting for OpenAlex (max 10 req/s per their policy)
- [ ] Session encryption option for sensitive research topics
- [ ] `papermate init` wizard to configure search providers and browser path

---

## Not planned (by design)

- Fully autonomous "write the whole paper" mode — PaperMate is intentionally human-in-the-loop
- GUI / web interface — staying CLI and agent-native
- Paid API search providers — OpenAlex and Crossref are free and sufficient for most cases
