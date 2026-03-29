# Example: CS Master's Related Work Flow

Scenario: a computer science master's student is preparing a proposal on "retrieval-augmented generation for biomedical question answering" and wants a related-work section draft grounded in evidence.

## User goal

Build a literature candidate set, narrow it to a defensible shortlist, and draft a related-work section without pretending the draft is final.

## Example input

```text
I am a computer science master's student preparing a proposal.
My topic is a biomedical QA system based on retrieval-augmented generation.
First help me scout papers, then organize a shortlist, then draft a related work section.
Keep the process evidence-first and pause before any high-risk finalization.
```

## Expected route

1. `papermate-router` recognizes this as a thesis workflow task and routes to `paper-writer`.
2. `paper-writer` starts with `paper-scout` to build a candidate set.
3. The search layer generates query variants around:
   - retrieval augmented generation biomedical question answering
   - RAG biomedical QA survey
   - literature review biomedical QA retrieval generation
4. The runtime searches OpenAlex and Crossref, optionally using browser-backed arXiv retrieval if enabled.
5. The candidate set is fused, reranked, deduplicated, and annotated with:
   - `selection_reason`
   - `claim_support_scope`
   - `defense_notes`
6. `paper-library` or an equivalent note pass structures the shortlisted papers.
7. `paper-drafter` writes a related-work draft from the evidence set.
8. A checkpoint is shown before treating the draft as finalized output.

## Example candidate-set summary

```text
Candidate set built for query: retrieval-augmented generation for biomedical question answering

Top shortlist:
1. A survey on retrieval-augmented generation in domain QA
   - selection_reason: covers survey-style framing and comparison baselines
   - defense_notes: useful for positioning the work against general RAG pipelines

2. A biomedical question answering benchmark paper
   - selection_reason: grounds task definition, datasets, and evaluation setup
   - defense_notes: useful when defending why biomedical QA needs domain-specific evidence handling

3. A paper on retrieval quality and hallucination reduction in medical QA
   - selection_reason: supports claims about evidence grounding and answer reliability
   - defense_notes: useful for explaining why retrieval matters beyond generation quality
```

## Example draft shape

```text
Related work in this area can be grouped into three strands.

First, general retrieval-augmented generation research provides the architectural basis for combining retrieval with large language model generation. These studies establish the core pipeline of query formulation, document retrieval, context construction, and answer synthesis, and they offer the baseline vocabulary for discussing RAG systems in a broader NLP setting.

Second, biomedical question answering research highlights the domain-specific constraints that make the task different from open-domain QA. Existing work emphasizes terminology variation, evidence sensitivity, and the need for answers that remain consistent with source material rather than merely fluent.

Third, recent work on hallucination reduction and evidence-grounded generation connects the previous two strands. These papers are especially relevant because they explain why retrieval quality, citation grounding, and source selection directly affect the reliability of generated biomedical answers.

Taken together, the literature suggests that a biomedical QA system based on retrieval-augmented generation should not be evaluated only by answer quality, but also by evidence quality, retrieval relevance, and support transparency.
```

## What this example demonstrates

- `papermate-router` stays the single primary router
- `paper-writer` handles the thesis workflow as a specialized subagent
- the search layer builds an evidence-backed candidate set before drafting
- the output remains human-in-the-loop rather than silently finalizing the text
