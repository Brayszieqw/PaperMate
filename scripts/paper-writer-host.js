const { runPaperWriterEntry } = require('./paper-writer-entry');
const { resumeRun, attachArtifactToState } = require('./paper-writer-runtime-state');
const { saveSession, loadSession } = require('./paper-writer-session-store');
const { readPdfToEvidencePack } = require('./paper-writer-pdf-adapter');

// ── helpers ───────────────────────────────────────────────────────────────────

function buildOkResponse(taskId, entryResult, sessionRecord) {
  const runtime = entryResult.runtime
    ? {
      ...entryResult.runtime,
      runSummary: entryResult.runtime.runSummary || entryResult.runtime.summary || null,
    }
    : entryResult.runtime;

  return {
    ok: true,
    taskId,
    runtime,
    ui: entryResult.ui,
    meta: entryResult.meta || null,
    session: sessionRecord,
  };
}

function buildErrorResponse(error, taskId = null) {
  return {
    ok: false,
    taskId,
    error: typeof error === 'string' ? error : (error.message || String(error)),
  };
}

// ── mode: new ─────────────────────────────────────────────────────────────────

async function handleNew(input, storeOptions) {
  const entryResult = await runPaperWriterEntry({
    goal: input.goal,
    searchMode: input.searchMode || 'mock',
    searchProviders: input.searchProviders,
    chromeRunner: input.chromeRunner || input.bbBrowserRunner,
    browserUrl: input.browserUrl,
    sitesDir: input.sitesDir,
    automationMode: input.automationMode,
    overwrite_target: input.overwriteTarget || null,
  });

  const state = entryResult.runtime?.runSummary || entryResult.runtime?.summary
    ? rebuildStateFromEntryResult(entryResult)
    : null;

  const taskId = entryResult.meta?.routePacket?.task_id || null;

  let sessionRecord = null;
  if (state && taskId) {
    sessionRecord = saveSession(state, storeOptions);
  }

  return buildOkResponse(taskId, entryResult, sessionRecord);
}

// ── mode: resume ──────────────────────────────────────────────────────────────

async function handleResume(input, storeOptions) {
  const { taskId, routePatch } = input;
  if (!taskId) {
    return buildErrorResponse('resume mode requires taskId');
  }

  const state = loadSession(taskId, storeOptions);
  if (!state) {
    return buildErrorResponse(`session not found: ${taskId}`, taskId);
  }

  const resumed = resumeRun(state, routePatch || null);
  const sessionRecord = saveSession(resumed, storeOptions);

  // build a minimal entry-compatible result from resumed state
  const { buildRunUiPayload, summarizeRun, shouldPauseRun, buildUserCheckpointView, createNextActionPlan } = require('./paper-writer-runtime-state');
  const pauseDecision = shouldPauseRun(resumed);

  const entryResult = {
    runtime: {
      taskId: resumed.task_id,
      runStatus: resumed.runStatus,
      activeArtifactIds: resumed.activeArtifacts.map((a) => a.artifact_id),
      summary: summarizeRun(resumed),
      runSummary: summarizeRun(resumed),
      pauseDecision,
      checkpointView: buildUserCheckpointView(resumed),
      nextPlan: createNextActionPlan(resumed),
    },
    ui: buildRunUiPayload(resumed),
    meta: { entryMode: 'resume', goal: resumed.routePacket?.user_goal || null },
  };

  return buildOkResponse(taskId, entryResult, sessionRecord);
}

// ── mode: pdf_ops ─────────────────────────────────────────────────────────────

async function handlePdfOps(input, storeOptions) {
  const { pdfPath, pdfText, label, taskId } = input;

  if (!pdfPath && !pdfText) {
    return buildErrorResponse('pdf_ops mode requires pdfPath or pdfText');
  }

  // read and parse PDF
  const { artifact: pdfArtifact, warnings } = readPdfToEvidencePack({
    filePath: pdfPath,
    text: pdfText,
    label: label || (pdfPath ? require('path').basename(pdfPath) : 'inline-text'),
    riskFlags: input.riskFlags || [],
  });

  if (!pdfArtifact) {
    return buildErrorResponse(`pdf extraction failed: ${warnings.join('; ')}`, taskId || null);
  }

  // load or create session
  let state;
  if (taskId) {
    state = loadSession(taskId, storeOptions);
    if (!state) {
      return buildErrorResponse(`session not found: ${taskId}`, taskId);
    }
  } else {
    // start a new ops-focused session
    const entryResult = await runPaperWriterEntry({
      goal: input.goal || `精读: ${label || pdfPath || 'pdf'}`,
      searchMode: input.searchMode || 'mock',
      chromeRunner: input.chromeRunner || input.bbBrowserRunner,
      browserUrl: input.browserUrl,
      sitesDir: input.sitesDir,
    });
    state = rebuildStateFromEntryResult(entryResult);
    if (!state) {
      return buildErrorResponse('failed to create ops session');
    }
  }

  const withPdf = attachArtifactToState(state, pdfArtifact);
  const sessionRecord = saveSession(withPdf, storeOptions);

  const { buildRunUiPayload, summarizeRun, shouldPauseRun, buildUserCheckpointView, createNextActionPlan } = require('./paper-writer-runtime-state');
  const pauseDecision = shouldPauseRun(withPdf);

  const entryResult = {
    runtime: {
      taskId: withPdf.task_id,
      runStatus: withPdf.runStatus,
      activeArtifactIds: withPdf.activeArtifacts.map((a) => a.artifact_id),
      summary: summarizeRun(withPdf),
      runSummary: summarizeRun(withPdf),
      pauseDecision,
      checkpointView: buildUserCheckpointView(withPdf),
      nextPlan: createNextActionPlan(withPdf),
      pdfArtifact,
      pdfWarnings: warnings,
    },
    ui: buildRunUiPayload(withPdf),
    meta: { entryMode: 'pdf_ops', goal: withPdf.routePacket?.user_goal || null, pdfWarnings: warnings },
  };

  return buildOkResponse(withPdf.task_id, entryResult, sessionRecord);
}

// ── state reconstruction ──────────────────────────────────────────────────────

/**
 * Reconstruct a minimal saveable state from runPaperWriterEntry output.
 * entry.js builds state internally but doesn't expose it directly;
 * we pull what we need from runtime.summary and meta.
 */
function rebuildStateFromEntryResult(entryResult) {
  const { startRun, advancePaperWriterPhase, pauseRun } = require('./paper-writer-runtime-state');
  const routePacket = entryResult.meta?.routePacket;
  if (!routePacket) return null;
  const runtimeSummary = entryResult.runtime?.runSummary || entryResult.runtime?.summary || null;

  let state = startRun({
    task_id: routePacket.task_id,
    user_goal: routePacket.user_goal,
    task_kind: routePacket.task_kind,
    domain_focus: routePacket.domain_focus,
    current_phase: routePacket.current_phase,
    risk_level: routePacket.risk_level,
    evidence_state: routePacket.evidence_state,
    automation_mode: routePacket.automation_mode,
    route_strategy: routePacket.route_strategy,
    recommended_next_agent: routePacket.recommended_next_agent,
    checkpoint_needed: routePacket.checkpoint_needed,
  });

  const phase = runtimeSummary?.currentPhase;
  if (phase && phase !== 'intake') {
    state = advancePaperWriterPhase(state, phase, {
      owner: routePacket.recommended_next_agent || 'paper-writer',
    });
  }

  const checkpointView = entryResult.runtime?.checkpointView;
  if (checkpointView && entryResult.runtime?.runStatus === 'paused') {
    state = pauseRun(state, {
      checkpoint_type: checkpointView.checkpointType || 'route',
      checkpoint_level: checkpointView.checkpointLevel || 'hard',
      current_phase: checkpointView.currentPhase || phase,
      why_pause: checkpointView.whyPause || '',
      current_result_summary: checkpointView.summary || '',
      risk_summary: checkpointView.riskSummary || null,
      recommended_action: checkpointView.recommendedAction || '',
      alternative_actions: (checkpointView.choices || []).slice(1).map((c) => c.label),
    });
  }

  // attach any artifacts from search / deliverable
  const { attachArtifactToState: attach } = require('./paper-writer-runtime-state');
  const searchArtifact = entryResult.runtime?.searchArtifact;
  if (searchArtifact?.artifact_id) {
    state = attach(state, searchArtifact);
  }
  const deliverableArtifact = entryResult.runtime?.deliverableArtifact;
  if (deliverableArtifact?.artifact_id) {
    state = attach(state, deliverableArtifact);
  }

  return state;
}

// ── dispatch ──────────────────────────────────────────────────────────────────

async function dispatch(input, storeOptions = {}) {
  const mode = input.mode || 'new';

  try {
    if (mode === 'new') return await handleNew(input, storeOptions);
    if (mode === 'resume') return await handleResume(input, storeOptions);
    if (mode === 'pdf_ops') return await handlePdfOps(input, storeOptions);
    return buildErrorResponse(`unknown mode: ${mode}`);
  } catch (err) {
    return buildErrorResponse(err, input.taskId || null);
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const MAX_STDIN_BYTES = 10 * 1024 * 1024; // 10 MB
  let raw = '';
  let byteCount = 0;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    byteCount += Buffer.byteLength(chunk, 'utf8');
    if (byteCount > MAX_STDIN_BYTES) {
      process.stdout.write(JSON.stringify(buildErrorResponse(`input exceeds ${MAX_STDIN_BYTES} bytes`)) + '\n');
      process.exit(1);
    }
    raw += chunk;
  });
  process.stdin.on('end', async () => {
    let input;
    try {
      input = JSON.parse(raw.trim() || '{}');
    } catch {
      process.stdout.write(JSON.stringify(buildErrorResponse('invalid JSON input')) + '\n');
      process.exit(1);
    }

    const result = await dispatch(input);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}

module.exports = { dispatch, rebuildStateFromEntryResult };
