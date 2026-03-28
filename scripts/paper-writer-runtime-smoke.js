const {
  startRun,
  advancePaperWriterPhase,
  attachArtifactToState,
  reroutePaperWriterState,
  applyReviewVerdictToState,
  pauseRun,
  summarizeRun,
  shouldPauseRun,
  buildUserCheckpointView,
  createNextActionPlan,
  buildRunUiPayload,
} = require('./paper-writer-runtime-state');

async function runPaperWriterSmoke() {
  let state = startRun({
    task_id: `pw-smoke-${Date.now()}`,
    user_goal: 'screen papers, draft related work, then review before finalization',
    domain_focus: 'scout',
    recommended_next_agent: 'paper-scout',
    route_strategy: 'staged',
  });

  state = advancePaperWriterPhase(state, 'scout', {
    owner: 'paper-scout',
    inputArtifacts: ['goal'],
  });

  state = attachArtifactToState(state, {
    artifact_id: 'candidate-set-1',
    artifact_type: 'literature_candidate_set',
    producer: 'paper-scout',
    summary: 'initial candidate paper set for related work drafting',
    source_refs: ['search://seed-query'],
  });

  state = reroutePaperWriterState(state, {
    domain_focus: 'draft',
    recommended_next_agent: 'paper-drafter',
  });

  state = advancePaperWriterPhase(state, 'draft', {
    owner: 'paper-drafter',
    inputArtifacts: ['candidate-set-1'],
  });

  state = attachArtifactToState(state, {
    artifact_id: 'draft-1',
    artifact_type: 'chapter_draft',
    producer: 'paper-drafter',
    summary: 'drafted related work section using screened literature',
    source_refs: ['candidate-set-1'],
    risk_flags: ['needs_review'],
  });

  state = reroutePaperWriterState(state, {
    domain_focus: 'review',
    recommended_next_agent: 'paper-reviewer',
    checkpoint_needed: 'hard',
  });

  state = advancePaperWriterPhase(state, 'review', {
    owner: 'paper-reviewer',
    inputArtifacts: ['draft-1'],
  });

  state = applyReviewVerdictToState(state, {
    verdict: 'pass_with_risks',
    risk_summary: 'two claims need weaker wording before finalization',
    recommended_action: 'revise draft',
    alternative_actions: ['accept risks', 'pause'],
  });

  state = pauseRun(state, state.pendingCheckpoint);

  const summary = summarizeRun(state);
  const pauseDecision = shouldPauseRun(state);
  const checkpointView = buildUserCheckpointView(state);
  const nextPlan = createNextActionPlan(state);
  const uiPayload = buildRunUiPayload(state);

  return {
    runtime: {
      taskId: state.task_id,
      runStatus: state.runStatus,
      activeArtifactIds: state.activeArtifacts.map((artifact) => artifact.artifact_id),
      summary,
      pauseDecision,
      checkpointView,
      nextPlan,
    },
    ui: uiPayload,
  };
}

async function runPaperWriterActiveSmoke() {
  let state = startRun({
    task_id: `pw-active-${Date.now()}`,
    user_goal: 'screen papers and continue drafting without pausing',
    domain_focus: 'scout',
    recommended_next_agent: 'paper-scout',
    route_strategy: 'staged',
  });

  state = advancePaperWriterPhase(state, 'scout', {
    owner: 'paper-scout',
    inputArtifacts: ['goal'],
  });

  state = attachArtifactToState(state, {
    artifact_id: 'candidate-set-active-1',
    artifact_type: 'literature_candidate_set',
    producer: 'paper-scout',
    summary: 'candidate set ready for drafting',
    source_refs: ['search://active-seed-query'],
  });

  state = reroutePaperWriterState(state, {
    domain_focus: 'draft',
    recommended_next_agent: 'paper-drafter',
    checkpoint_needed: 'none',
  });

  state = advancePaperWriterPhase(state, 'draft', {
    owner: 'paper-drafter',
    inputArtifacts: ['candidate-set-active-1'],
  });

  state = attachArtifactToState(state, {
    artifact_id: 'draft-active-1',
    artifact_type: 'chapter_draft',
    producer: 'paper-drafter',
    summary: 'draft section ready for the next internal step',
    source_refs: ['candidate-set-active-1'],
  });

  const summary = summarizeRun(state);
  const pauseDecision = shouldPauseRun(state);
  const checkpointView = buildUserCheckpointView(state);
  const nextPlan = createNextActionPlan(state);
  const uiPayload = buildRunUiPayload(state);

  return {
    runtime: {
      taskId: state.task_id,
      runStatus: state.runStatus,
      activeArtifactIds: state.activeArtifacts.map((artifact) => artifact.artifact_id),
      summary,
      pauseDecision,
      checkpointView,
      nextPlan,
    },
    ui: uiPayload,
  };
}

async function main() {
  const result = await runPaperWriterSmoke();
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  runPaperWriterSmoke,
  runPaperWriterActiveSmoke,
};
