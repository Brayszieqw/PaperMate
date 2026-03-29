const { createEntryRoutePacket, selectScenarioFromGoal, runPaperWriterEntry } = require('./paper-writer-entry');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    testsFailed += 1;
    throw new Error(message);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    testsPassed += 1;
  } catch (error) {
    console.error(`  ${error.message}`);
  }
}

(async () => {
  await test('createEntryRoutePacket builds a review-first route packet from review goals', async () => {
    const route = createEntryRoutePacket({
      goal: '检查这一章有没有过度结论，并决定下一步',
    });

    assert(route.domain_focus === 'review', 'review goal should map to review domain focus');
    assert(route.route_strategy === 'review_first', 'review goal should prefer review_first strategy');
    assert(route.recommended_next_agent === 'paper-reviewer', 'review goal should target paper-reviewer');
    assert(route.checkpoint_needed === 'hard', 'review goal should prepare for a hard checkpoint');
  });

  await test('createEntryRoutePacket prefers review over revision for mixed wording', async () => {
    const route = createEntryRoutePacket({
      goal: '帮我审一下按导师意见改的那一章',
    });

    assert(route.domain_focus === 'review', 'mixed review/revision wording should prefer review');
  });

  await test('createEntryRoutePacket builds a staged draft route packet from drafting goals', async () => {
    const route = createEntryRoutePacket({
      goal: '先筛论文，再起草 related work',
    });

    assert(route.domain_focus === 'draft', 'draft goal should map to draft domain focus');
    assert(route.route_strategy === 'staged', 'draft goal should prefer staged strategy');
    assert(route.recommended_next_agent === 'paper-drafter', 'draft goal should target paper-drafter');
    assert(route.checkpoint_needed === 'none', 'draft goal should not force a checkpoint at entry');
  });

  await test('createEntryRoutePacket marks overwrite-target draft goals as hard checkpoint', async () => {
    const route = createEntryRoutePacket({
      goal: '继续改写这一章',
      overwrite_target: 'chapter-1',
    });

    assert(route.domain_focus === 'draft', 'overwrite draft goal should still map to draft');
    assert(route.checkpoint_needed === 'hard', 'overwrite-target draft should require a hard checkpoint');
  });

  await test('createEntryRoutePacket builds a library route packet from note-library goals', async () => {
    const route = createEntryRoutePacket({
      goal: '把这些论文整理成结构化笔记和文献库',
    });

    assert(route.domain_focus === 'library', 'library goal should map to library domain focus');
    assert(route.recommended_next_agent === 'paper-library', 'library goal should target paper-library');
    assert(route.route_strategy === 'staged', 'library goal should use staged strategy');
  });

  await test('createEntryRoutePacket builds an ops route packet from PDF/deep-read goals', async () => {
    const route = createEntryRoutePacket({
      goal: '精读这篇论文并提取实验设置和指标',
    });

    assert(route.domain_focus === 'ops', 'ops goal should map to ops domain focus');
    assert(route.recommended_next_agent === 'paper-research-ops', 'ops goal should target paper-research-ops');
    assert(route.task_kind === 'single_step', 'ops goal should remain single-step at entry');
  });

  await test('createEntryRoutePacket builds a topic-framing route packet for scope-narrowing goals', async () => {
    const route = createEntryRoutePacket({
      goal: '帮我缩小题目范围，并收束研究问题',
    });

    assert(route.domain_focus === 'topic-framing', 'topic-framing goal should map to topic-framing domain focus');
    assert(route.recommended_next_agent === 'paper-writer', 'topic-framing should stay in the single visible agent');
    assert(route.route_strategy === 'evidence_first', 'topic-framing should prefer evidence-first strategy');
  });

  await test('createEntryRoutePacket builds a defense-prep route packet for defense-oriented goals', async () => {
    const route = createEntryRoutePacket({
      goal: '帮我准备答辩，并预测老师可能会问什么',
    });

    assert(route.domain_focus === 'defense-prep', 'defense-oriented goal should map to defense-prep');
    assert(route.recommended_next_agent === 'paper-reviewer', 'defense-prep should initially lean on reviewer-style scrutiny');
    assert(route.checkpoint_needed === 'hard', 'defense-prep should preserve a hard checkpoint mindset');
  });

  await test('createEntryRoutePacket builds a proposal-outline route packet for outline/opening-report goals', async () => {
    const route = createEntryRoutePacket({
      goal: '帮我先写开题报告提纲和研究方案说明',
    });

    assert(route.domain_focus === 'proposal-outline', 'proposal goal should map to proposal-outline');
    assert(route.recommended_next_agent === 'paper-drafter', 'proposal-outline should lean on drafting capability');
    assert(route.route_strategy === 'staged', 'proposal-outline should prefer staged strategy');
  });

  await test('createEntryRoutePacket builds a revision-loop route packet for advisor feedback goals', async () => {
    const route = createEntryRoutePacket({
      goal: '老师给了我一版修改意见，帮我整理并跟踪哪些地方已经改了',
    });

    assert(route.domain_focus === 'revision-loop', 'revision feedback goal should map to revision-loop');
    assert(route.recommended_next_agent === 'paper-reviewer', 'revision-loop should start from review-style issue parsing');
    assert(route.route_strategy === 'staged', 'revision-loop should prefer staged handling');
  });

  await test('createEntryRoutePacket falls back to a mixed evidence-first route for broad goals', async () => {
    const route = createEntryRoutePacket({
      goal: '帮我从头梳理这个方向应该怎么做论文',
    });

    assert(route.domain_focus === 'mixed', 'broad goal should fall back to mixed domain focus');
    assert(route.route_strategy === 'evidence_first', 'broad goal should prefer evidence-first strategy');
  });

  await test('selectScenarioFromGoal can consume a route packet directly', async () => {
    const scenario = selectScenarioFromGoal({
      domain_focus: 'review',
      route_strategy: 'review_first',
      recommended_next_agent: 'paper-reviewer',
    });

    assert(scenario === 'paused-review', 'review route packet should map to paused-review scenario');
  });

  await test('runPaperWriterEntry exposes the derived route packet in meta', async () => {
    const result = await runPaperWriterEntry({
      goal: '先筛论文，然后继续起草 related work，不需要现在停下来',
    });

    assert(result.meta.entryMode === 'route', 'entry mode should be route');
    assert(result.meta.selectedScenario === null, 'route mode should not report a demo scenario');
    assert(result.meta.routePacket.domain_focus === 'draft', 'meta should expose derived route packet');
    assert(result.meta.routePacket.recommended_next_agent === 'paper-drafter', 'derived route packet should preserve next agent');
    assert(result.meta.defenseReady.mode === 'lite', 'entry meta should expose defense-ready lite mode');
    assert(Array.isArray(result.meta.defenseReady.prompts) && result.meta.defenseReady.prompts.length >= 4, 'defense-ready lite prompts should be exposed');
    assert(Array.isArray(result.meta.internalStages) && result.meta.internalStages.includes('topic-framing'), 'entry meta should expose supported internal stages');
  });

  await test('runPaperWriterEntry attaches a mock search artifact for draft-oriented routes', async () => {
    const result = await runPaperWriterEntry({
      goal: '先筛论文，然后继续起草 related work，不需要现在停下来',
    });

    assert(result.runtime.searchArtifact.artifact_type === 'literature_candidate_set', 'draft entry should include a literature candidate set');
    assert(Array.isArray(result.runtime.searchArtifact.items) && result.runtime.searchArtifact.items.length > 0, 'search artifact should contain items');
    assert(result.runtime.activeArtifactIds.includes(result.runtime.searchArtifact.artifact_id), 'search artifact id should be reflected in runtime active artifacts');
    assert(result.ui.stageLabel === '正文起草', 'draft entry should expose a human-readable stage label');
    assert(result.ui.searchSummary.itemCount === result.runtime.searchArtifact.items.length, 'ui should expose search item count');
    assert(Array.isArray(result.ui.searchSummary.providersUsed) && result.ui.searchSummary.providersUsed.length > 0, 'ui should expose providers used');
    assert(result.ui.searchSummary.mode === 'mock', 'default draft entry should surface mock mode explicitly');
    assert(typeof result.ui.searchSummary.warning === 'string' && result.ui.searchSummary.warning.length > 0, 'mock search should carry a user-facing warning');
    assert(typeof result.ui.searchSummary.selectionRationale === 'string' && result.ui.searchSummary.selectionRationale.length > 0, 'ui should expose why current results are prioritized');
    assert(Array.isArray(result.ui.searchSummary.supportFocus) && result.ui.searchSummary.supportFocus.length > 0, 'ui should expose support focus tags');
    assert(result.ui.guidance.stage === '正文起草', 'ui guidance should include stage');
    assert(typeof result.ui.guidance.nextFocus === 'string' && result.ui.guidance.nextFocus.length > 0, 'ui guidance should include next focus');
    assert(Array.isArray(result.ui.guidance.defensePrompts) && result.ui.guidance.defensePrompts.length > 0, 'ui guidance should include defense prompts');
  });

  await test('runPaperWriterEntry can opt into real-provider search mode with injected fetch', async () => {
    const fakeFetch = async (url) => {
      if (url.includes('openalex')) {
        return {
          ok: true,
          json: async () => ({ results: [{ id: 'oa:1', display_name: 'OpenAlex Result' }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ message: { items: [{ DOI: '10.1/test', title: ['Crossref Result'] }] } }),
      };
    };

    const result = await runPaperWriterEntry({
      goal: '先筛论文，然后继续起草 related work，不需要现在停下来',
      searchMode: 'real',
      searchProviders: ['openalex', 'crossref'],
      fetchImpl: fakeFetch,
    });

    assert(result.runtime.searchArtifact.trace.notes.includes('real provider'), 'entry should expose a real-provider trace note');
    assert(result.runtime.searchArtifact.items.length === 2, 'entry should surface fused real-provider results');
    assert(result.ui.searchSummary.mode === 'real', 'real-provider entry should surface real mode explicitly');
    assert(typeof result.ui.searchSummary.dedupNote === 'string' && result.ui.searchSummary.dedupNote.length > 0, 'real search summary should explain deduplication');
    assert(typeof result.ui.searchSummary.canonicalPreferenceNote === 'string' && result.ui.searchSummary.canonicalPreferenceNote.length > 0, 'real search summary should explain canonical preference');
  });

  await test('runPaperWriterEntry supports browser-backed search mode with chrome-devtools runner injection', async () => {
    const fakeRunner = async ({ siteName }) => {
      if (siteName === 'arxiv/search') {
        return {
          query: 'rag',
          count: 1,
          papers: [
            {
              id: '2501.00001',
              title: 'RAG for Everything',
              abstract: 'A paper about retrieval-augmented generation.',
              authors: ['A. Author'],
              published: '2025-01-01',
              categories: ['cs.CL'],
              url: 'https://arxiv.org/abs/2501.00001',
            },
          ],
        };
      }

      throw new Error(`unhandled fake site: ${siteName}`);
    };

    const fakeFetch = async (url) => {
      if (url.includes('openalex')) {
        return {
          ok: true,
          json: async () => ({ results: [{ id: 'oa:1', display_name: 'OpenAlex Result' }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ message: { items: [{ DOI: '10.1/test', title: ['Crossref Result'] }] } }),
      };
    };

    const result = await runPaperWriterEntry({
      goal: '先筛论文，然后继续起草 related work，不需要现在停下来',
      searchMode: 'browser',
      chromeRunner: fakeRunner,
      fetchImpl: fakeFetch,
    });

    assert(result.ui.searchSummary.mode === 'browser', 'browser-backed search should surface browser mode explicitly');
    assert(typeof result.ui.searchSummary.browserBackedNote === 'string' && result.ui.searchSummary.browserBackedNote.length > 0, 'browser-backed search should explain the chrome-devtools provider path');
    assert(result.runtime.searchArtifact.items.length === 3, 'browser-backed mode should merge chrome-devtools with public API providers');
    assert(result.runtime.searchArtifact.trace.providers_used.includes('chrome_cdp_arxiv'), 'browser-backed mode should record the browser provider in trace');
  });

  await test('runPaperWriterEntry can execute a minimal thesis-scout swarm path', async () => {
    const result = await runPaperWriterEntry({
      goal: '鍏堢瓫璁烘枃锛岀劧鍚庣户缁捣鑽?related work',
      executionMode: 'swarm',
      searchMode: 'mock',
    });

    assert(result.meta.executionMode === 'swarm', 'meta should expose swarm execution mode');
    assert(result.runtime.executionMode === 'swarm', 'runtime should expose swarm execution mode');
    assert(result.runtime.swarmExecution !== null, 'runtime should include swarm execution details');
    assert(result.runtime.swarmExecution.mode === 'swarm', 'swarm execution should report swarm mode');
    assert(Array.isArray(result.runtime.swarmExecution.startedReadWorkers) && result.runtime.swarmExecution.startedReadWorkers.length >= 2, 'swarm path should start multiple read workers');
    assert(result.runtime.searchArtifact.artifact_type === 'literature_candidate_set', 'swarm path should still attach a candidate set');
    assert(result.runtime.activeArtifactIds.includes(result.runtime.searchArtifact.artifact_id), 'swarm candidate set should be reflected in active artifacts');
    assert(result.ui.swarmSummary !== null, 'ui should expose a swarm summary');
    assert(result.ui.swarmSummary.itemCount === result.runtime.searchArtifact.items.length, 'swarm summary should reflect candidate-set size');
  });

  await test('runPaperWriterEntry keeps non-search routes out of swarm scout mode', async () => {
    const result = await runPaperWriterEntry({
      goal: 'pdf deep-read extract experiment metrics and setup',
      executionMode: 'swarm',
    });

    assert(result.meta.routePacket.domain_focus === 'ops', 'ops-focused goal should still map to ops');
    assert(result.meta.executionMode === 'route', 'ops route should stay on normal route mode');
    assert(result.runtime.swarmExecution === undefined, 'ops route should not attach swarm execution details');
  });

  await test('runPaperWriterEntry attaches a mock search artifact for library-oriented routes', async () => {
    const result = await runPaperWriterEntry({
      goal: '把这些论文整理成结构化笔记和文献库',
    });

    assert(result.meta.routePacket.domain_focus === 'library', 'library route should be selected');
    assert(result.runtime.searchArtifact.artifact_type === 'literature_candidate_set', 'library entry should still surface a candidate set');
    assert(result.runtime.searchArtifact.trace.providers_used.length > 0, 'library search artifact should carry trace info');
    assert(typeof result.ui.guidance.deliverableHint === 'string' && result.ui.guidance.deliverableHint.includes('structured_note_bundle'), 'library guidance should suggest a structured note deliverable');
    assert(typeof result.ui.searchSummary.summary === 'string' && result.ui.searchSummary.summary.length > 0, 'ui should expose a readable search summary');
    assert(typeof result.ui.searchSummary.defenseHint === 'string' && result.ui.searchSummary.defenseHint.length > 0, 'ui should expose a defense-friendly hint');
  });

  await test('runPaperWriterEntry gives an evidence-pack deliverable hint for ops goals', async () => {
    const result = await runPaperWriterEntry({
      goal: '精读这篇论文并提取实验设置和指标',
    });

    assert(result.ui.stageLabel === '论文精读', 'ops should expose the right stage label');
    assert(typeof result.ui.guidance.deliverableHint === 'string' && result.ui.guidance.deliverableHint.includes('evidence_pack'), 'ops guidance should suggest an evidence pack deliverable');
  });

  await test('runPaperWriterEntry gives topic-framing guidance for scope-narrowing goals', async () => {
    const result = await runPaperWriterEntry({
      goal: '帮我缩小题目范围，并收束研究问题',
    });

    assert(result.ui.stageLabel === '选题收束', 'topic-framing should expose the right stage label');
    assert(result.ui.guidance.nextFocus.includes('研究问题'), 'topic-framing guidance should mention research question scoping');
  });

  await test('runPaperWriterEntry gives a deliverable hint for proposal-outline goals', async () => {
    const result = await runPaperWriterEntry({
      goal: '帮我先写开题报告提纲和研究方案说明',
    });

    assert(result.ui.stageLabel === '开题提纲', 'proposal-outline should expose the right stage label');
    assert(result.ui.title === '开题提纲建议', 'proposal-outline should use a stage-specific card title');
    assert(result.meta.workflowIntent === 'proposal', 'proposal-outline should expose proposal workflow intent');
    assert(result.meta.recommendedDeliverableType === 'proposal_outline', 'proposal-outline should expose a recommended deliverable type');
    assert(result.runtime.deliverableArtifact.artifact_type === 'proposal_outline', 'proposal-outline should attach a deliverable artifact skeleton');
    assert(typeof result.ui.guidance.deliverableHint === 'string' && result.ui.guidance.deliverableHint.includes('开题'), 'proposal-outline should suggest an opening-report style deliverable');
  });

  await test('runPaperWriterEntry gives defense-prep guidance for defense-oriented goals', async () => {
    const result = await runPaperWriterEntry({
      goal: '帮我准备答辩，并预测老师可能会问什么',
    });

    assert(result.ui.stageLabel === '答辩准备', 'defense-prep should expose the right stage label');
    assert(result.ui.title === '答辩准备建议', 'defense-prep should use a stage-specific card title');
    assert(result.meta.workflowIntent === 'defense', 'defense-prep should expose defense workflow intent');
    assert(result.meta.recommendedDeliverableType === 'defense_qa_pack', 'defense-prep should expose a defense deliverable type');
    assert(result.runtime.deliverableArtifact.artifact_type === 'defense_qa_pack', 'defense-prep should attach a deliverable artifact skeleton');
    assert(result.ui.guidance.nextFocus.includes('追问'), 'defense-prep guidance should mention likely questioning');
  });

  await test('runPaperWriterEntry gives a deliverable hint for revision-loop goals', async () => {
    const result = await runPaperWriterEntry({
      goal: '老师给了我一版修改意见，帮我整理并跟踪哪些地方已经改了',
    });

    assert(result.ui.stageLabel === '修改闭环', 'revision-loop should expose the right stage label');
    assert(result.ui.title === '修改闭环建议', 'revision-loop should use a stage-specific card title');
    assert(result.meta.recommendedDeliverableType === 'revision_tracker', 'revision-loop should expose a revision deliverable type');
    assert(result.runtime.deliverableArtifact.artifact_type === 'revision_tracker', 'revision-loop should attach a deliverable artifact skeleton');
    assert(typeof result.ui.guidance.deliverableHint === 'string' && result.ui.guidance.deliverableHint.includes('修改'), 'revision-loop should suggest a revision-tracking deliverable');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
