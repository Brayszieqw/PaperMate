const {
  createPaperWriterRuntimeState,
  advancePaperWriterPhase,
  buildCheckpointChoices,
  createArtifactRefFromResult,
  reroutePaperWriterState,
  attachArtifactToState,
  applyReviewVerdictToState,
  startRun,
  pauseRun,
  resumeRun,
  finalizeRun,
  shouldPauseRun,
  selectNextAgent,
  summarizeRun,
  buildUserCheckpointView,
  createNextActionPlan,
  buildRunUiPayload,
} = require('./paper-writer-runtime-state');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ ${message}`);
    testsFailed += 1;
    throw new Error(message);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed += 1;
  } catch (error) {
    console.error(`  ${error.message}`);
  }
}

test('createPaperWriterRuntimeState creates a normalized runtime state shell', () => {
  const state = createPaperWriterRuntimeState({
    task_id: 'pw-1',
    user_goal: 'write related work',
    recommended_next_agent: 'paper-scout',
  });

  assert(state.task_id === 'pw-1', 'task id should be preserved');
  assert(state.routePacket.user_goal === 'write related work', 'route packet should carry goal');
  assert(state.routePacket.recommended_next_agent === 'paper-scout', 'route packet should carry next agent');
  assert(Array.isArray(state.phaseHistory), 'phase history should be an array');
  assert(state.sessionMemory.current_phase === 'intake', 'session memory should start at intake');
});

test('advancePaperWriterPhase appends phase state and syncs route/session phase', () => {
  const state = createPaperWriterRuntimeState({ task_id: 'pw-2', user_goal: 'screen papers' });
  const next = advancePaperWriterPhase(state, 'scout', {
    owner: 'paper-scout',
    inputArtifacts: ['seed-goal'],
  });

  assert(next !== state, 'phase advancement should return a new state object');
  assert(next.routePacket.current_phase === 'scout', 'route phase should update');
  assert(next.sessionMemory.current_phase === 'scout', 'session phase should update');
  assert(next.phaseHistory.length === 1, 'phase history should gain one entry');
  assert(next.phaseHistory[0].owner === 'paper-scout', 'phase owner should be preserved');
});

test('buildCheckpointChoices marks one recommended choice for hard review checkpoints', () => {
  const choices = buildCheckpointChoices({
    checkpoint_type: 'review',
    checkpoint_level: 'hard',
    recommended_action: 'revise draft',
    alternative_actions: ['pause', 'accept risks'],
  });

  assert(Array.isArray(choices), 'choices should be an array');
  assert(choices.length === 3, 'choices should include recommended plus alternatives');
  assert(choices.filter((choice) => choice.recommended === true).length === 1, 'there should be exactly one recommended choice');
  assert(choices[0].id === 'revise_draft', 'recommended choice id should be normalized');
});

test('createArtifactRefFromResult builds artifact ref from summarized result input', () => {
  const artifact = createArtifactRefFromResult({
    artifact_type: 'chapter_draft',
    producer: 'paper-drafter',
    summary: 'related work draft for multimodal education feedback',
    source_refs: ['paper-a', 'paper-b'],
    risk_flags: ['needs_review'],
  });

  assert(artifact.artifact_type === 'chapter_draft', 'artifact type should be preserved');
  assert(artifact.producer === 'paper-drafter', 'producer should be preserved');
  assert(artifact.summary.includes('related work draft'), 'summary should be preserved');
  assert(Array.isArray(artifact.source_refs) && artifact.source_refs.length === 2, 'source refs should be copied');
  assert(Array.isArray(artifact.risk_flags) && artifact.risk_flags[0] === 'needs_review', 'risk flags should be copied');
});

test('reroutePaperWriterState updates strategy, next agent, and checkpoint need', () => {
  const state = createPaperWriterRuntimeState({
    task_id: 'pw-3',
    user_goal: 'improve evidence before drafting',
    route_strategy: 'direct',
  });

  const next = reroutePaperWriterState(state, {
    route_strategy: 'evidence_first',
    recommended_next_agent: 'paper-research-ops',
    checkpoint_needed: 'soft',
    risk_level: 'medium',
  });

  assert(next !== state, 'reroute should return a new state object');
  assert(next.routePacket.route_strategy === 'evidence_first', 'route strategy should update');
  assert(next.routePacket.recommended_next_agent === 'paper-research-ops', 'next agent should update');
  assert(next.routePacket.checkpoint_needed === 'soft', 'checkpoint need should update');
  assert(next.routePacket.risk_level === 'medium', 'risk level should update');
});

test('attachArtifactToState appends artifact ids to runtime state and session memory', () => {
  const state = createPaperWriterRuntimeState({ task_id: 'pw-4', user_goal: 'draft introduction' });
  const artifact = createArtifactRefFromResult({
    artifact_id: 'draft-1',
    artifact_type: 'chapter_draft',
    producer: 'paper-drafter',
    summary: 'introduction draft',
  });

  const next = attachArtifactToState(state, artifact);

  assert(next.activeArtifacts.length === 1, 'active artifacts should gain one item');
  assert(next.activeArtifacts[0].artifact_id === 'draft-1', 'artifact id should be preserved');
  assert(next.sessionMemory.active_artifacts.length === 1, 'session memory should track artifact ids');
  assert(next.sessionMemory.active_artifacts[0] === 'draft-1', 'session memory should store artifact id');
});

test('applyReviewVerdictToState records verdict and triggers checkpoint on risky review result', () => {
  const state = createPaperWriterRuntimeState({ task_id: 'pw-5', user_goal: 'finalize related work' });
  const next = applyReviewVerdictToState(state, {
    verdict: 'pass_with_risks',
    risk_summary: 'two claims need weaker wording',
    recommended_action: 'revise draft',
  });

  assert(next.sessionMemory.latest_review_verdict === 'pass_with_risks', 'latest review verdict should be recorded');
  assert(next.pendingCheckpoint !== null, 'risky review should create a pending checkpoint');
  assert(next.pendingCheckpoint.checkpoint_type === 'review', 'checkpoint type should be review');
  assert(next.pendingCheckpoint.recommended_action === 'revise draft', 'recommended action should be preserved');
});

test('startRun wraps runtime state with running lifecycle metadata', () => {
  const state = startRun({
    task_id: 'pw-6',
    user_goal: 'survey papers and draft related work',
    recommended_next_agent: 'paper-scout',
  });

  assert(state.runStatus === 'running', 'run status should start as running');
  assert(state.lifecycle.startedAt !== null, 'startedAt should be recorded');
  assert(state.lifecycle.finalizedAt === null, 'finalizedAt should start null');
  assert(state.routePacket.recommended_next_agent === 'paper-scout', 'route packet should be preserved');
});

test('pauseRun stores checkpoint and marks run as paused', () => {
  const started = startRun({ task_id: 'pw-7', user_goal: 'review current chapter' });
  const paused = pauseRun(started, {
    checkpoint_type: 'review',
    checkpoint_level: 'hard',
    current_phase: 'review',
    why_pause: 'review requires confirmation',
    current_result_summary: 'review found risky claims',
    recommended_action: 'revise draft',
  });

  assert(paused.runStatus === 'paused', 'run status should become paused');
  assert(paused.pendingCheckpoint !== null, 'pending checkpoint should be stored');
  assert(paused.pendingCheckpoint.checkpoint_type === 'review', 'checkpoint type should be preserved');
  assert(paused.lifecycle.pausedAt !== null, 'pausedAt should be recorded');
});

test('resumeRun clears checkpoint and optionally reroutes before continuing', () => {
  const started = startRun({ task_id: 'pw-8', user_goal: 'draft chapter' });
  const paused = pauseRun(started, {
    checkpoint_type: 'route',
    current_phase: 'draft',
    why_pause: 'need stronger evidence',
    current_result_summary: 'draft path paused',
    recommended_action: 'reroute to ops',
  });
  const resumed = resumeRun(paused, {
    route_strategy: 'evidence_first',
    recommended_next_agent: 'paper-research-ops',
    checkpoint_needed: 'none',
  });

  assert(resumed.runStatus === 'running', 'run status should become running again');
  assert(resumed.pendingCheckpoint === null, 'pending checkpoint should be cleared');
  assert(resumed.routePacket.route_strategy === 'evidence_first', 'route strategy should update on resume');
  assert(resumed.routePacket.recommended_next_agent === 'paper-research-ops', 'next agent should update on resume');
  assert(resumed.lifecycle.resumedAt !== null, 'resumedAt should be recorded');
});

test('finalizeRun marks run finalized and captures final artifact ids', () => {
  const started = startRun({ task_id: 'pw-9', user_goal: 'finalize related work' });
  const artifact = createArtifactRefFromResult({
    artifact_id: 'draft-final',
    artifact_type: 'chapter_draft',
    producer: 'paper-drafter',
    summary: 'final candidate draft',
  });
  const withArtifact = attachArtifactToState(started, artifact);
  const finalized = finalizeRun(withArtifact, {
    finalSummary: 'ready for user delivery',
    finalArtifactIds: ['draft-final'],
  });

  assert(finalized.runStatus === 'finalized', 'run status should become finalized');
  assert(finalized.lifecycle.finalizedAt !== null, 'finalizedAt should be recorded');
  assert(finalized.lifecycle.finalSummary === 'ready for user delivery', 'final summary should be preserved');
  assert(Array.isArray(finalized.lifecycle.finalArtifactIds), 'final artifact ids should be tracked');
  assert(finalized.lifecycle.finalArtifactIds[0] === 'draft-final', 'final artifact id should be preserved');
});

test('shouldPauseRun reports pause when a pending checkpoint exists', () => {
  const started = startRun({ task_id: 'pw-10', user_goal: 'review chapter' });
  const paused = pauseRun(started, {
    checkpoint_id: 'cp-10',
    checkpoint_type: 'review',
    checkpoint_level: 'hard',
    current_phase: 'review',
    why_pause: 'review requires confirmation',
    current_result_summary: 'review found risky claims',
    recommended_action: 'revise draft',
  });

  const decision = shouldPauseRun(paused);

  assert(decision.shouldPause === true, 'shouldPause should be true');
  assert(decision.reason === 'pending_checkpoint', 'reason should point to pending checkpoint');
  assert(decision.level === 'hard', 'level should come from checkpoint');
});

test('selectNextAgent prefers explicit route recommendation and falls back to domain focus', () => {
  const state = startRun({
    task_id: 'pw-11',
    user_goal: 'collect evidence',
    recommended_next_agent: 'paper-research-ops',
    domain_focus: 'ops',
  });
  const selected = selectNextAgent(state);

  assert(selected === 'paper-research-ops', 'explicit route recommendation should win');

  const fallbackState = startRun({
    task_id: 'pw-12',
    user_goal: 'draft section',
    recommended_next_agent: 'paper-writer',
    domain_focus: 'draft',
  });
  const fallbackSelected = selectNextAgent(fallbackState);

  assert(fallbackSelected === 'paper-drafter', 'domain focus should drive fallback agent selection');
});

test('summarizeRun returns a compact orchestrator-facing summary object', () => {
  const started = startRun({
    task_id: 'pw-13',
    user_goal: 'draft related work',
    recommended_next_agent: 'paper-drafter',
  });
  const withPhase = advancePaperWriterPhase(started, 'draft', { owner: 'paper-drafter' });
  const withArtifact = attachArtifactToState(withPhase, {
    artifact_id: 'draft-13',
    artifact_type: 'chapter_draft',
    producer: 'paper-drafter',
    summary: 'draft section ready for review',
  });
  const summary = summarizeRun(withArtifact);

  assert(summary.taskId === 'pw-13', 'summary should include task id');
  assert(summary.runStatus === 'running', 'summary should include run status');
  assert(summary.currentPhase === 'draft', 'summary should include current phase');
  assert(summary.activeArtifactIds.includes('draft-13'), 'summary should expose active artifact ids');
  assert(summary.nextAgent === 'paper-drafter', 'summary should expose next selected agent');
});

test('buildUserCheckpointView creates a button-first checkpoint view for users', () => {
  const started = startRun({ task_id: 'pw-14', user_goal: 'finalize related work' });
  const paused = pauseRun(started, {
    checkpoint_id: 'cp-14',
    checkpoint_type: 'review',
    checkpoint_level: 'hard',
    current_phase: 'review',
    why_pause: 'review found risky claims',
    current_result_summary: 'draft is usable but needs weaker wording in two claims',
    risk_summary: 'two claims overstate evidence',
    recommended_action: 'revise draft',
    alternative_actions: ['accept risks', 'pause'],
  });

  const view = buildUserCheckpointView(paused);

  assert(view.mode === 'button-first', 'checkpoint view should prefer button-first mode');
  assert(view.textFallback === true, 'checkpoint view should advertise text fallback');
  assert(view.checkpointType === 'review', 'checkpoint type should be exposed');
  assert(view.currentPhase === 'review', 'current phase should be exposed');
  assert(Array.isArray(view.choices) && view.choices.length === 3, 'choices should be exposed for the user');
  assert(view.choices.filter((choice) => choice.recommended === true).length === 1, 'exactly one user choice should be recommended');
  assert(view.summary.includes('usable'), 'current result summary should be included');
});

test('createNextActionPlan summarizes next orchestrator move from route, pause, and artifacts', () => {
  const started = startRun({
    task_id: 'pw-15',
    user_goal: 'write related work from screened papers',
    recommended_next_agent: 'paper-drafter',
    domain_focus: 'draft',
  });
  const withArtifact = attachArtifactToState(started, {
    artifact_id: 'notes-15',
    artifact_type: 'structured_note_bundle',
    producer: 'paper-library',
    summary: 'screened notes ready for drafting',
  });

  const plan = createNextActionPlan(withArtifact);

  assert(plan.taskId === 'pw-15', 'plan should include task id');
  assert(plan.shouldPause === false, 'plan should not pause without checkpoint');
  assert(plan.nextAgent === 'paper-drafter', 'plan should expose selected next agent');
  assert(Array.isArray(plan.activeArtifactIds) && plan.activeArtifactIds.includes('notes-15'), 'plan should include active artifact ids');
  assert(typeof plan.summary === 'string' && plan.summary.length > 0, 'plan should include a compact summary');
});

test('buildRunUiPayload returns a checkpoint card when run is paused', () => {
  const started = startRun({
    task_id: 'pw-16',
    user_goal: 'finalize related work',
    recommended_next_agent: 'paper-reviewer',
    domain_focus: 'review',
  });
  const paused = pauseRun(started, {
    checkpoint_id: 'cp-16',
    checkpoint_type: 'review',
    checkpoint_level: 'hard',
    current_phase: 'review',
    why_pause: 'review requires confirmation',
    current_result_summary: 'draft has risky claims',
    risk_summary: 'evidence is overstated',
    recommended_action: 'revise draft',
    alternative_actions: ['accept risks'],
  });

  const payload = buildRunUiPayload(paused);

  assert(payload.type === 'checkpoint-card', 'paused run should map to checkpoint card');
  assert(payload.mode === 'button-first', 'payload should preserve button-first mode');
  assert(Array.isArray(payload.choices) && payload.choices.length === 2, 'payload should include choices');
  assert(payload.title === '需要你确认下一步', 'paused payload should use a human-friendly title');
  assert(typeof payload.message === 'string' && payload.message.length > 0, 'paused payload should include a human-facing message');
  assert(typeof payload.fallbackPrompt === 'string' && payload.fallbackPrompt.length > 0, 'payload should include fallback prompt');
});

test('buildRunUiPayload returns a status card when run is active', () => {
  const started = startRun({
    task_id: 'pw-17',
    user_goal: 'draft chapter',
    recommended_next_agent: 'paper-drafter',
    domain_focus: 'draft',
  });
  const payload = buildRunUiPayload(started);

  assert(payload.type === 'status-card', 'active run should map to status card');
  assert(payload.nextAgent === 'paper-drafter', 'status card should include next agent');
  assert(payload.shouldPause === false, 'status card should reflect no pause');
  assert(payload.title === 'paper-writer 正在推进', 'active payload should use a human-friendly title');
  assert(typeof payload.message === 'string' && payload.message.length > 0, 'active payload should include a human-facing message');
});

console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
process.exit(testsFailed > 0 ? 1 : 0);
