# Paper-writer Runtime Schema Skeleton Implementation Plan

> **For agentic workers:** REQUIRED: Use papermates:subagent-driven-development (if subagents available) or papermates:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal, implementation-ready runtime schema skeleton for paper-writer so later runtime code can build on stable contracts instead of ad-hoc prompt state.

**Architecture:** Keep the first implementation artifact-first and docs-adjacent: define focused JSON schema skeletons for route, phase, artifact, handoff, checkpoint, and session memory under `docs/paper-writer/runtime-schemas/`. Pair them with a small README index so prompt/config work and later code work both reference the same canonical contract set.

**Tech Stack:** JSON Schema draft-style JSON files, Markdown documentation, git

---

## Chunk 1: File structure

### Task 1: Add schema index and focused contract files

**Files:**
- Create: `docs/paper-writer/runtime-schemas/README.md`
- Create: `docs/paper-writer/runtime-schemas/route-packet.schema.json`
- Create: `docs/paper-writer/runtime-schemas/phase-state.schema.json`
- Create: `docs/paper-writer/runtime-schemas/artifact-ref.schema.json`
- Create: `docs/paper-writer/runtime-schemas/handoff-packet.schema.json`
- Create: `docs/paper-writer/runtime-schemas/checkpoint-packet.schema.json`
- Create: `docs/paper-writer/runtime-schemas/session-memory.schema.json`

- [ ] **Step 1: Create README index**

Document why the schema folder exists, what each schema file covers, and how these files relate to `docs/paper-writer/paper-writer-runtime-contracts.md`.

- [ ] **Step 2: Create route packet schema skeleton**

Define required top-level fields for goal, task kind, domain focus, current phase, risk level, evidence state, automation mode, strategy, next agent, and checkpoint need.

- [ ] **Step 3: Create phase state schema skeleton**

Define required top-level fields for phase identity, owner, status, input artifacts, and output artifacts.

- [ ] **Step 4: Create artifact ref schema skeleton**

Define required top-level fields for artifact type, version, producer, summary, source refs, and risk flags.

- [ ] **Step 5: Create handoff packet schema skeleton**

Define required top-level fields for sender, receiver, task goal, current phase, input artifacts, output expectation, and risk flags.

- [ ] **Step 6: Create checkpoint packet schema skeleton**

Define required top-level fields for checkpoint type, level, current phase, why pause, recommendation, alternatives, and resume condition.

- [ ] **Step 7: Create session memory schema skeleton**

Define required top-level fields for current goal, phase, active artifacts, evidence references, pending checkpoint, latest review verdict, and user preferences.

## Chunk 2: Verification

### Task 2: Validate schema files are coherent and parseable

**Files:**
- Verify: `docs/paper-writer/runtime-schemas/*.schema.json`
- Verify: `docs/paper-writer/runtime-schemas/README.md`

- [ ] **Step 1: Parse all schema JSON files**

Run a JSON parse command over all `*.schema.json` files.

- [ ] **Step 2: Read README plus one or two schema files for spot verification**

Check that naming, artifact types, and contract terms match `paper-writer-runtime-contracts.md`.

- [ ] **Step 3: Commit**

Create a commit that adds the runtime schema skeleton.
