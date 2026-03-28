const DEFAULT_MIN_READ_WORKERS = 2;
const DEFAULT_MAX_READ_WORKERS = 4;

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function dedupePush(target, items) {
  for (const item of asArray(items)) {
    const text = String(item || '').trim();
    if (!text || target.includes(text)) continue;
    target.push(text);
  }
}

function createBlackboard(seed = {}) {
  const state = {
    goal: String(seed.goal || '').trim(),
    facts: [],
    evidenceRefs: [],
    decisions: [],
    openQuestions: [],
  };

  dedupePush(state.facts, seed.facts);
  dedupePush(state.evidenceRefs, seed.evidenceRefs || seed.evidence_refs);
  dedupePush(state.decisions, seed.decisions);
  dedupePush(state.openQuestions, seed.openQuestions || seed.open_questions);

  return {
    setGoal(goal) {
      state.goal = String(goal || '').trim();
    },
    mergePatch(patch = {}) {
      if (patch.goal && !state.goal) state.goal = String(patch.goal).trim();
      dedupePush(state.facts, patch.facts);
      dedupePush(state.evidenceRefs, patch.evidenceRefs || patch.evidence_refs);
      dedupePush(state.decisions, patch.decisions);
      dedupePush(state.openQuestions, patch.openQuestions || patch.open_questions);
      dedupePush(state.facts, patch.fact);
      dedupePush(state.evidenceRefs, patch.evidenceRef || patch.evidence_ref);
      dedupePush(state.decisions, patch.decision);
      dedupePush(state.openQuestions, patch.openQuestion || patch.open_question);
      return this.snapshot();
    },
    snapshot() {
      return {
        goal: state.goal,
        facts: [...state.facts],
        evidenceRefs: [...state.evidenceRefs],
        decisions: [...state.decisions],
        openQuestions: [...state.openQuestions],
      };
    },
  };
}

class SwarmAbortError extends Error {
  constructor(message = 'swarm branch aborted') {
    super(message);
    this.name = 'SwarmAbortError';
  }
}

function normalizeWorkers(workers) {
  return asArray(workers).map((worker, index) => ({
    id: worker.id || `worker-${index + 1}`,
    owner: worker.owner || 'unknown',
    roleHint: worker.roleHint || worker.role_hint || 'worker',
    goal: worker.goal || '',
    deliverable: worker.deliverable || 'result',
    phase: worker.phase || (worker.writeAccess === true || worker.write_access === 'yes' ? 'write' : 'read'),
    writeAccess: worker.writeAccess === true || worker.write_access === 'yes',
    run: worker.run,
  }));
}

function validateWorkers(workers, minReadWorkers, maxReadWorkers) {
  const readWorkers = workers.filter((worker) => worker.phase === 'read');
  const writeWorkers = workers.filter((worker) => worker.phase === 'write');
  const verifyWorkers = workers.filter((worker) => worker.phase === 'verify');

  if (readWorkers.length < minReadWorkers) {
    throw new Error(`swarm requires at least ${minReadWorkers} read workers`);
  }
  if (readWorkers.length > maxReadWorkers) {
    throw new Error(`swarm allows at most ${maxReadWorkers} read workers`);
  }
  if (writeWorkers.length > 1) {
    throw new Error('swarm allows at most 1 writer worker');
  }
  if (verifyWorkers.some((worker) => worker.writeAccess)) {
    throw new Error('verify workers cannot have write access');
  }
  for (const worker of workers) {
    if (typeof worker.run !== 'function') {
      throw new Error(`worker ${worker.id} is missing a run() function`);
    }
  }

  return {
    readWorkers,
    writeWorker: writeWorkers[0] || null,
    verifyWorkers,
  };
}

function createWorkerContext({ blackboard, worker, signal, events, onEvent, cache }) {
  return {
    worker,
    signal,
    blackboard,
    cache,  // Added for caching search/read results
    snapshot() {
      return blackboard.snapshot();
    },
    add(resultPatch) {
      blackboard.mergePatch(resultPatch);
    },
    emit(type, detail = {}) {
      const event = { type, workerId: worker.id, detail };
      events.push(event);
      if (onEvent) onEvent(event);
    },
    checkCancelled() {
      if (signal.aborted) throw new SwarmAbortError(signal.reason || 'aborted');
    },
  };
}

function mergeWorkerResult(blackboard, result) {
  if (!result || typeof result !== 'object') return blackboard.snapshot();
  blackboard.mergePatch(result);
  return blackboard.snapshot();
}

async function runSwarm(options) {
  const {
    goal,
    workers,
    minReadWorkers = DEFAULT_MIN_READ_WORKERS,
    maxReadWorkers = DEFAULT_MAX_READ_WORKERS,
    parallelReadWorkers = 2,
    stopWhen,
    stopOnVerifyFailure = true,
    onEvent,
    cache,  // Added for caching search/read results
  } = options || {};

  if (minReadWorkers > maxReadWorkers) {
    throw new Error('minReadWorkers cannot exceed maxReadWorkers');
  }
  if (parallelReadWorkers < 1 || parallelReadWorkers > maxReadWorkers) {
    throw new Error(`parallelReadWorkers must be between 1 and ${maxReadWorkers}`);
  }

  const blackboard = createBlackboard({ goal });
  const allWorkers = normalizeWorkers(workers);
  const { readWorkers, writeWorker, verifyWorkers } = validateWorkers(allWorkers, minReadWorkers, maxReadWorkers);
  const events = [];
  const readResults = [];
  const verifyResults = [];
  const startedReadWorkers = [];
  const skippedReadWorkers = [];
  const abortedReadWorkers = [];
  const controllers = new Map();
  let stopReason = null;

  const markStop = (reason) => {
    if (stopReason) return;
    stopReason = typeof reason === 'string' && reason ? reason : 'stop condition met';
    for (const [workerId, controller] of controllers.entries()) {
      if (!controller.signal.aborted) {
        controller.abort(`early-stop:${workerId}`);
      }
    }
  };

  const running = new Set();
  let nextIndex = 0;

  const startWorker = (worker) => {
    const controller = new AbortController();
    controllers.set(worker.id, controller);
    startedReadWorkers.push(worker.id);
    const promise = (async () => {
      const ctx = createWorkerContext({
        blackboard,
        worker,
        signal: controller.signal,
        events,
        onEvent,
        cache,
      });
      ctx.emit('worker.started', { owner: worker.owner, roleHint: worker.roleHint });
      try {
        const result = await worker.run(ctx);
        if (controller.signal.aborted) {
          mergeWorkerResult(blackboard, result);
          readResults.push({ workerId: worker.id, status: 'aborted-after-complete', result: result || {} });
          abortedReadWorkers.push(worker.id);
          ctx.emit('worker.aborted', { reason: controller.signal.reason || 'aborted' });
          return;
        }
        const snapshot = mergeWorkerResult(blackboard, result);
        readResults.push({ workerId: worker.id, status: 'success', result: result || {} });
        ctx.emit('worker.completed', { facts: snapshot.facts.length, decisions: snapshot.decisions.length });
        if (typeof stopWhen === 'function') {
          const decision = stopWhen({ blackboard: snapshot, readResults: [...readResults] });
          if (decision) markStop(decision === true ? 'stopWhen=true' : decision);
        }
      } catch (error) {
        if (error instanceof SwarmAbortError || controller.signal.aborted) {
          abortedReadWorkers.push(worker.id);
          ctx.emit('worker.aborted', { reason: controller.signal.reason || error.message });
          return;
        }
        readResults.push({ workerId: worker.id, status: 'error', error: error.message || String(error) });
        ctx.emit('worker.failed', { error: error.message || String(error) });
      } finally {
        controllers.delete(worker.id);
      }
    })();

    running.add(promise);
    promise.finally(() => running.delete(promise));
  };

  while (nextIndex < readWorkers.length || running.size > 0) {
    while (!stopReason && running.size < parallelReadWorkers && nextIndex < readWorkers.length) {
      startWorker(readWorkers[nextIndex]);
      nextIndex += 1;
    }

    if (stopReason && nextIndex < readWorkers.length) {
      for (const worker of readWorkers.slice(nextIndex)) skippedReadWorkers.push(worker.id);
      nextIndex = readWorkers.length;
    }

    if (running.size > 0) await Promise.race(running);
  }

  let writerResult = null;
  if (writeWorker) {
    // The writer is intentionally non-cancellable once selected so a single
    // merge/write phase can finish deterministically after read branches stop.
    const ctx = createWorkerContext({
      blackboard,
      worker: writeWorker,
      signal: new AbortController().signal,
      events,
      onEvent,
      cache,
    });
    ctx.emit('writer.started', { owner: writeWorker.owner, roleHint: writeWorker.roleHint });
    writerResult = await writeWorker.run({
      ...ctx,
      readResults: [...readResults],
    });
    mergeWorkerResult(blackboard, writerResult);
    ctx.emit('writer.completed', { decisions: blackboard.snapshot().decisions.length });
  }

  let verificationPassed = true;
  for (const worker of verifyWorkers) {
    const ctx = createWorkerContext({
      blackboard,
      worker,
      signal: new AbortController().signal,
      events,
      onEvent,
      cache,
    });
    ctx.emit('verify.started', { owner: worker.owner, roleHint: worker.roleHint });
    try {
      const result = await worker.run({
        ...ctx,
        readResults: [...readResults],
        writerResult,
      });
      const snapshot = mergeWorkerResult(blackboard, result);
      verifyResults.push({ workerId: worker.id, status: 'success', result: result || {} });
      ctx.emit('verify.completed', { facts: snapshot.facts.length, decisions: snapshot.decisions.length });
    } catch (error) {
      verificationPassed = false;
      verifyResults.push({ workerId: worker.id, status: 'error', error: error.message || String(error) });
      ctx.emit('verify.failed', { error: error.message || String(error) });
      if (stopOnVerifyFailure) break;
    }
  }

  return {
    goal: String(goal || ''),
    mode: 'swarm',
    finalStatus: verificationPassed ? 'success' : 'verification_failed',
    stopReason,
    startedReadWorkers,
    skippedReadWorkers,
    abortedReadWorkers,
    readResults,
    writerUsed: !!writeWorker,
    writerResult,
    verifyResults,
    verificationPassed,
    blackboard: blackboard.snapshot(),
    events,
  };
}

module.exports = {
  DEFAULT_MIN_READ_WORKERS,
  DEFAULT_MAX_READ_WORKERS,
  SwarmAbortError,
  createBlackboard,
  runSwarm,
};
