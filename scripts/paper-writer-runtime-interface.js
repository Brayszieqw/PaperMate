const { loadRuntimeSchemas, RUNTIME_SCHEMA_DIR, SCHEMA_FILE_MAP } = require('./paper-writer-runtime-schema-loader');
const { asTrimmedString, asArray, createRuntimeId } = require('./paper-writer-utils');

function asStringArray(value) {
  return asArray(value)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function createRoutePacket(seed = {}) {
  return {
    task_id: asTrimmedString(seed.task_id, createRuntimeId('task')),
    user_goal: asTrimmedString(seed.user_goal || seed.goal, '[pending goal]'),
    task_kind: seed.task_kind || 'single_step',
    domain_focus: seed.domain_focus || 'mixed',
    current_phase: seed.current_phase || 'intake',
    risk_level: seed.risk_level || 'low',
    evidence_state: seed.evidence_state || 'empty',
    automation_mode: seed.automation_mode || 'balanced',
    route_strategy: seed.route_strategy || 'direct',
    recommended_next_agent: seed.recommended_next_agent || 'paper-writer',
    checkpoint_needed: seed.checkpoint_needed || 'none',
  };
}

function createPhaseState(seed = {}) {
  return {
    phase_id: asTrimmedString(seed.phase_id, createRuntimeId('phase')),
    phase_name: seed.phase_name || 'intake',
    status: seed.status || 'pending',
    started_at: seed.started_at || null,
    completed_at: seed.completed_at || null,
    owner: seed.owner || 'paper-writer',
    input_artifacts: asStringArray(seed.input_artifacts),
    output_artifacts: asStringArray(seed.output_artifacts),
    notes: seed.notes || null,
  };
}

function createArtifactRef(seed = {}) {
  return {
    artifact_id: asTrimmedString(seed.artifact_id, createRuntimeId('artifact')),
    artifact_type: seed.artifact_type || 'evidence_pack',
    version: asTrimmedString(seed.version, 'v1'),
    producer: seed.producer || 'paper-writer',
    summary: asTrimmedString(seed.summary, '[pending summary]'),
    source_refs: asStringArray(seed.source_refs),
    risk_flags: asStringArray(seed.risk_flags),
    supersedes: seed.supersedes || null,
  };
}

function createHandoffPacket(seed = {}) {
  return {
    handoff_id: asTrimmedString(seed.handoff_id, createRuntimeId('handoff')),
    handoff_from: seed.handoff_from || 'paper-writer',
    handoff_to: seed.handoff_to || 'paper-writer',
    task_goal: asTrimmedString(seed.task_goal, '[pending handoff goal]'),
    current_phase: asTrimmedString(seed.current_phase, 'intake'),
    input_artifacts: asStringArray(seed.input_artifacts),
    expected_output_type: seed.expected_output_type || null,
    risk_flags: asStringArray(seed.risk_flags),
    recommended_next_step: seed.recommended_next_step || null,
    notes_for_receiver: seed.notes_for_receiver || null,
  };
}

function createCheckpointPacket(seed = {}) {
  return {
    checkpoint_id: asTrimmedString(seed.checkpoint_id, createRuntimeId('checkpoint')),
    checkpoint_type: seed.checkpoint_type || 'route',
    checkpoint_level: seed.checkpoint_level || 'soft',
    current_phase: asTrimmedString(seed.current_phase, 'paused'),
    why_pause: asTrimmedString(seed.why_pause, '[pending pause reason]'),
    current_result_summary: asTrimmedString(seed.current_result_summary, '[pending result summary]'),
    risk_summary: seed.risk_summary || null,
    recommended_action: asTrimmedString(seed.recommended_action, '[pending recommended action]'),
    alternative_actions: asStringArray(seed.alternative_actions),
    resume_condition: seed.resume_condition || null,
    ui_policy: 'button_first_text_fallback',
  };
}

function createSessionMemory(seed = {}) {
  const userPreferences = seed.user_preferences || {};

  return {
    task_id: asTrimmedString(seed.task_id, createRuntimeId('task')),
    current_goal: asTrimmedString(seed.current_goal || seed.goal, '[pending goal]'),
    current_phase: asTrimmedString(seed.current_phase, 'intake'),
    active_artifacts: asStringArray(seed.active_artifacts),
    evidence_pack_ids: asStringArray(seed.evidence_pack_ids),
    pending_checkpoint_id: seed.pending_checkpoint_id || null,
    latest_review_verdict: seed.latest_review_verdict || null,
    user_preferences: {
      automation_mode: userPreferences.automation_mode || 'balanced',
      writing_style: userPreferences.writing_style || null,
      review_strictness: userPreferences.review_strictness || null,
    },
    stale_state_flag: seed.stale_state_flag === true,
  };
}

module.exports = {
  RUNTIME_SCHEMA_DIR,
  SCHEMA_FILE_MAP,
  loadRuntimeSchemas,
  createRoutePacket,
  createPhaseState,
  createArtifactRef,
  createHandoffPacket,
  createCheckpointPacket,
  createSessionMemory,
};
