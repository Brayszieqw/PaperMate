const {
  createRoutePacket,
  createPhaseState,
  createArtifactRef,
  createCheckpointPacket,
  createSessionMemory,
} = require('./paper-writer-runtime-interface');

function normalizeChoiceId(value, fallback) {
  const text = String(value || '').trim().toLowerCase();
  const normalized = text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function createPaperWriterRuntimeState(seed = {}) {
  const routePacket = createRoutePacket(seed);
  const sessionMemory = createSessionMemory({
    task_id: routePacket.task_id,
    current_goal: routePacket.user_goal,
    current_phase: routePacket.current_phase,
    active_artifacts: seed.active_artifacts,
    evidence_pack_ids: seed.evidence_pack_ids,
    pending_checkpoint_id: seed.pending_checkpoint_id,
    latest_review_verdict: seed.latest_review_verdict,
    user_preferences: seed.user_preferences,
    stale_state_flag: seed.stale_state_flag,
  });

  return {
    task_id: routePacket.task_id,
    runStatus: seed.runStatus || 'idle',
    routePacket,
    phaseHistory: Array.isArray(seed.phaseHistory) ? [...seed.phaseHistory] : [],
    activeArtifacts: Array.isArray(seed.activeArtifacts) ? [...seed.activeArtifacts] : [],
    pendingCheckpoint: seed.pendingCheckpoint || null,
    lifecycle: {
      startedAt: seed.lifecycle?.startedAt || null,
      pausedAt: seed.lifecycle?.pausedAt || null,
      resumedAt: seed.lifecycle?.resumedAt || null,
      finalizedAt: seed.lifecycle?.finalizedAt || null,
      finalSummary: seed.lifecycle?.finalSummary || null,
      finalArtifactIds: Array.isArray(seed.lifecycle?.finalArtifactIds) ? [...seed.lifecycle.finalArtifactIds] : [],
    },
    sessionMemory,
  };
}

function advancePaperWriterPhase(state, nextPhase, options = {}) {
  const phaseState = createPhaseState({
    phase_id: options.phaseId || `${nextPhase}-${state.phaseHistory.length + 1}`,
    phase_name: nextPhase,
    status: options.status || 'in_progress',
    owner: options.owner || 'paper-writer',
    input_artifacts: options.inputArtifacts || [],
    output_artifacts: options.outputArtifacts || [],
    notes: options.notes || null,
  });

  return {
    ...state,
    routePacket: {
      ...state.routePacket,
      current_phase: nextPhase,
    },
    phaseHistory: [...state.phaseHistory, phaseState],
    sessionMemory: {
      ...state.sessionMemory,
      current_phase: nextPhase,
    },
  };
}

function buildCheckpointChoices(packet = {}) {
  const checkpointPacket = createCheckpointPacket(packet);
  const actions = [checkpointPacket.recommended_action, ...checkpointPacket.alternative_actions];

  return actions.map((action, index) => ({
    id: normalizeChoiceId(action, `choice_${index + 1}`),
    label: action,
    description: index === 0 ? 'recommended next step' : 'alternative path',
    recommended: index === 0,
  }));
}

function createArtifactRefFromResult(result = {}) {
  return createArtifactRef(result);
}

function reroutePaperWriterState(state, patch = {}) {
  return {
    ...state,
    routePacket: {
      ...state.routePacket,
      ...patch,
    },
  };
}

function attachArtifactToState(state, artifact) {
  const nextArtifact = createArtifactRef(artifact);
  const nextActiveArtifacts = [...state.activeArtifacts, nextArtifact];
  const nextArtifactIds = [...state.sessionMemory.active_artifacts, nextArtifact.artifact_id];
  const nextEvidencePackIds = nextArtifact.artifact_type === 'evidence_pack'
    ? [...state.sessionMemory.evidence_pack_ids, nextArtifact.artifact_id]
    : [...state.sessionMemory.evidence_pack_ids];

  return {
    ...state,
    activeArtifacts: nextActiveArtifacts,
    sessionMemory: {
      ...state.sessionMemory,
      active_artifacts: nextArtifactIds,
      evidence_pack_ids: nextEvidencePackIds,
    },
  };
}

function applyReviewVerdictToState(state, review = {}) {
  const verdict = review.verdict || null;
  let pendingCheckpoint = null;

  if (verdict === 'pass_with_risks' || verdict === 'block') {
    pendingCheckpoint = createCheckpointPacket({
      checkpoint_id: review.checkpoint_id || `review-${state.task_id}`,
      checkpoint_type: 'review',
      checkpoint_level: verdict === 'block' ? 'block' : 'hard',
      current_phase: state.routePacket.current_phase,
      why_pause: review.risk_summary || 'review requires user-visible follow-up',
      current_result_summary: review.current_result_summary || `review verdict: ${verdict}`,
      risk_summary: review.risk_summary || null,
      recommended_action: review.recommended_action || (verdict === 'block' ? 'fix blocking issues' : 'revise draft'),
      alternative_actions: review.alternative_actions || [],
      resume_condition: review.resume_condition || null,
    });
  }

  return {
    ...state,
    pendingCheckpoint,
    sessionMemory: {
      ...state.sessionMemory,
      latest_review_verdict: verdict,
      pending_checkpoint_id: pendingCheckpoint ? pendingCheckpoint.checkpoint_id : null,
    },
  };
}

function startRun(seed = {}) {
  return createPaperWriterRuntimeState({
    ...seed,
    runStatus: 'running',
    lifecycle: {
      ...(seed.lifecycle || {}),
      startedAt: seed.lifecycle?.startedAt || new Date().toISOString(),
      pausedAt: null,
      resumedAt: null,
      finalizedAt: null,
      finalSummary: null,
      finalArtifactIds: [],
    },
  });
}

function pauseRun(state, checkpoint = {}) {
  const pendingCheckpoint = createCheckpointPacket(checkpoint);

  return {
    ...state,
    runStatus: 'paused',
    pendingCheckpoint,
    lifecycle: {
      ...state.lifecycle,
      pausedAt: new Date().toISOString(),
    },
    sessionMemory: {
      ...state.sessionMemory,
      pending_checkpoint_id: pendingCheckpoint.checkpoint_id,
    },
  };
}

function resumeRun(state, routePatch = null) {
  const rerouted = routePatch ? reroutePaperWriterState(state, routePatch) : { ...state };

  return {
    ...rerouted,
    runStatus: 'running',
    pendingCheckpoint: null,
    lifecycle: {
      ...rerouted.lifecycle,
      resumedAt: new Date().toISOString(),
    },
    sessionMemory: {
      ...rerouted.sessionMemory,
      pending_checkpoint_id: null,
    },
  };
}

function finalizeRun(state, options = {}) {
  return {
    ...state,
    runStatus: 'finalized',
    pendingCheckpoint: null,
    lifecycle: {
      ...state.lifecycle,
      finalizedAt: new Date().toISOString(),
      finalSummary: options.finalSummary || null,
      finalArtifactIds: Array.isArray(options.finalArtifactIds) ? [...options.finalArtifactIds] : [],
    },
    sessionMemory: {
      ...state.sessionMemory,
      pending_checkpoint_id: null,
    },
  };
}

function shouldPauseRun(state) {
  if (state.pendingCheckpoint) {
    return {
      shouldPause: true,
      reason: 'pending_checkpoint',
      level: state.pendingCheckpoint.checkpoint_level || 'soft',
      checkpoint: state.pendingCheckpoint,
    };
  }

  const checkpointNeed = state.routePacket?.checkpoint_needed;
  if (checkpointNeed && checkpointNeed !== 'none') {
    return {
      shouldPause: true,
      reason: 'route_checkpoint_needed',
      level: checkpointNeed,
      checkpoint: null,
    };
  }

  return {
    shouldPause: false,
    reason: 'continue',
    level: 'none',
    checkpoint: null,
  };
}

function selectNextAgent(state) {
  const recommended = state.routePacket?.recommended_next_agent;
  if (recommended && recommended !== 'paper-writer') {
    return recommended;
  }

  const focus = state.routePacket?.domain_focus;
  switch (focus) {
    case 'scout':
      return 'paper-scout';
    case 'library':
      return 'paper-library';
    case 'draft':
      return 'paper-drafter';
    case 'ops':
      return 'paper-research-ops';
    case 'review':
      return 'paper-reviewer';
    default:
      return 'paper-writer';
  }
}

function summarizeRun(state) {
  return {
    taskId: state.task_id,
    runStatus: state.runStatus,
    currentPhase: state.routePacket?.current_phase || state.sessionMemory?.current_phase || 'unknown',
    activeArtifactIds: state.activeArtifacts.map((artifact) => artifact.artifact_id),
    latestReviewVerdict: state.sessionMemory?.latest_review_verdict || null,
    nextAgent: selectNextAgent(state),
    pauseDecision: shouldPauseRun(state),
  };
}

function buildUserCheckpointView(state) {
  if (!state.pendingCheckpoint) {
    return null;
  }

  const checkpoint = state.pendingCheckpoint;
  const choices = buildCheckpointChoices(checkpoint);

  return {
    mode: 'button-first',
    textFallback: true,
    checkpointType: checkpoint.checkpoint_type,
    checkpointLevel: checkpoint.checkpoint_level,
    currentPhase: checkpoint.current_phase,
    whyPause: checkpoint.why_pause,
    summary: checkpoint.current_result_summary,
    riskSummary: checkpoint.risk_summary || null,
    recommendedAction: checkpoint.recommended_action,
    choices,
  };
}

function createNextActionPlan(state) {
  const pauseDecision = shouldPauseRun(state);
  const nextAgent = selectNextAgent(state);
  const activeArtifactIds = state.activeArtifacts.map((artifact) => artifact.artifact_id);
  const currentPhase = state.routePacket?.current_phase || state.sessionMemory?.current_phase || 'unknown';

  return {
    taskId: state.task_id,
    currentPhase,
    shouldPause: pauseDecision.shouldPause,
    pauseDecision,
    nextAgent,
    activeArtifactIds,
    summary: pauseDecision.shouldPause
      ? `pause at ${currentPhase} and resolve ${pauseDecision.reason}`
      : `continue from ${currentPhase} with ${nextAgent}`,
  };
}

function buildRunUiPayload(state) {
  const checkpointView = buildUserCheckpointView(state);
  if (checkpointView) {
    const humanMessage = checkpointView.riskSummary
      ? `当前在 ${checkpointView.currentPhase} 阶段，需要你确认下一步。主要风险：${checkpointView.riskSummary}`
      : `当前在 ${checkpointView.currentPhase} 阶段，需要你确认下一步。`;

    return {
      type: 'checkpoint-card',
      mode: checkpointView.mode,
      title: '需要你确认下一步',
      message: humanMessage,
      summary: checkpointView.summary,
      riskSummary: checkpointView.riskSummary,
      choices: checkpointView.choices,
      fallbackPrompt: `可回复：${checkpointView.choices.map((choice) => choice.label).join(' / ')}`,
    };
  }

  const nextPlan = createNextActionPlan(state);
  return {
    type: 'status-card',
    mode: 'text-fallback',
    title: 'paper-writer 正在推进',
    message: `当前在 ${nextPlan.currentPhase} 阶段，下一步建议进入 ${nextPlan.nextAgent}。`,
    summary: nextPlan.summary,
    nextAgent: nextPlan.nextAgent,
    shouldPause: nextPlan.shouldPause,
    activeArtifactIds: nextPlan.activeArtifactIds,
  };
}

module.exports = {
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
};
