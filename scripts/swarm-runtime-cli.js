const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');
const { runSwarm } = require('./swarm-runtime');
const { adaptWriteSpec } = require('./adaptive-planner');
const { detectBackend } = require('./llm-client');
const { saveBlackboard, loadBlackboard, cleanupOldBlackboards } = require('./blackboard-store');
const { createCacheStore } = require('./cache-store');
const { scorePlan, getTierLabel } = require('./model-router');

function usage() {
  return [
    'Usage: node swarm-runtime-cli.js --plan <plan.json>',
    'Supported worker kinds: list_dir, read_file, grep, replace_text, insert_lines, create_file, delete_lines, write_batch, adaptive_write, assert_file_contains, run_command, synthesize',
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let planPath = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--plan' && args[i + 1]) {
      planPath = args[i + 1];
      i += 1;
    }
  }
  if (!planPath) throw new Error(usage());
  return { planPath: path.resolve(planPath) };
}

async function walk(dir, extensions, out = []) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, extensions, out);
      continue;
    }
    if (!extensions.length || extensions.includes(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function resolvePathMaybe(root, targetPath) {
  if (!targetPath) return undefined;
  if (!root) return path.resolve(targetPath);
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(root, targetPath);
}

function execCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    exec(command, {
      cwd: options.cwd,
      timeout: options.timeoutMs || 120000,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr, exitCode: 0 });
    });
  });
}

async function listDirWorker(spec) {
  const dirPath = path.resolve(spec.dirPath || spec.path || '.');
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  const names = entries.slice(0, spec.limit || 20).map((entry) => entry.name + (entry.isDirectory() ? '/' : ''));
  return {
    facts: [`listed ${names.length} entries in ${dirPath}`],
    evidenceRefs: names.map((name) => `${dirPath}:${name}`),
    decisions: spec.decision ? [spec.decision] : [],
  };
}

async function readFileWorker(spec, ctx) {
  const filePath = path.resolve(spec.filePath);
  const maxLines = spec.maxLines || 200;
  const startLine = 0;
  const endLine = -1;

  // Check cache first
  if (ctx && ctx.cache) {
    const cached = ctx.cache.getRead(filePath, startLine, endLine);
    if (cached) {
      const lines = cached.split(/\r?\n/).slice(0, maxLines);
      const facts = [`[CACHE HIT] read ${lines.length} line(s) from ${path.basename(filePath)}`];
      return {
        facts,
        evidenceRefs: [`${filePath}:1`],
        openQuestions: spec.openQuestion ? [spec.openQuestion] : [],
        decisions: spec.decision ? [spec.decision] : [],
      };
    }
  }

  // Cache miss: read from disk
  const text = await fs.promises.readFile(filePath, 'utf8');
  const allLines = text.split(/\r?\n/);
  const lines = allLines.slice(0, maxLines);
  const isTruncated = allLines.length > maxLines;

  // Store in cache
  if (ctx && ctx.cache) {
    ctx.cache.setRead(filePath, startLine, endLine, text);
  }

  const facts = [`read ${lines.length} line(s) from ${path.basename(filePath)}`];
  if (isTruncated) {
    facts.push(`(file has ${allLines.length} total lines, truncated to ${maxLines})`);
  }
  return {
    facts,
    evidenceRefs: [`${filePath}:1`],
    openQuestions: spec.openQuestion ? [spec.openQuestion] : [],
    decisions: spec.decision ? [spec.decision] : [],
  };
}

async function replaceTextWorker(spec) {
  const filePath = path.resolve(spec.filePath);
  const originalContent = await fs.promises.readFile(filePath, 'utf8');
  let text = originalContent;
  let replacementCount = 0;

  for (const item of spec.replacements || []) {
    const search = String(item.search || '');
    const replace = String(item.replace || '');
    if (!search) continue;
    const occurrences = text.split(search).length - 1;
    if (occurrences === 0) {
      throw new Error(`replace_text could not find target in ${filePath}`);
    }
    text = text.split(search).join(replace);
    replacementCount += occurrences;
  }

  if (replacementCount === 0) {
    throw new Error(`replace_text made no changes in ${filePath}`);
  }

  await fs.promises.writeFile(filePath, text, 'utf8');
  return {
    facts: [`updated ${path.basename(filePath)} with ${replacementCount} replacement(s)`],
    evidenceRefs: [`${filePath}:1`],
    decisions: spec.decision ? [spec.decision] : [],
    _rollback: { filePath, content: originalContent },
  };
}

async function insertLinesWorker(spec) {
  const filePath = path.resolve(spec.filePath);
  const originalContent = await fs.promises.readFile(filePath, 'utf8');
  const eol = originalContent.includes('\r\n') ? '\r\n' : '\n';
  const lines = originalContent.split(/\r?\n/);

  let insertAt = -1;
  if (typeof spec.afterLine === 'number') {
    if (spec.afterLine < 0 || spec.afterLine > lines.length) {
      throw new Error(`insert_lines: afterLine ${spec.afterLine} is out of range (file has ${lines.length} lines)`);
    }
    insertAt = spec.afterLine;
  } else if (spec.afterPattern) {
    const re = new RegExp(spec.afterPattern);
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) { insertAt = i + 1; break; }
    }
  }

  if (insertAt < 0) {
    throw new Error(`insert_lines could not find insertion point in ${filePath}`);
  }

  const newLines = String(spec.content || '').split(/\r?\n/);
  lines.splice(insertAt, 0, ...newLines);
  await fs.promises.writeFile(filePath, lines.join(eol), 'utf8');
  return {
    facts: [`inserted ${newLines.length} line(s) after line ${insertAt} in ${path.basename(filePath)}`],
    evidenceRefs: [`${filePath}:${insertAt + 1}`],
    decisions: spec.decision ? [spec.decision] : [],
    _rollback: { filePath, content: originalContent },
  };
}

async function createFileWorker(spec) {
  const filePath = path.resolve(spec.filePath);
  const alreadyExists = await fs.promises.access(filePath).then(() => true).catch(() => false);
  if (alreadyExists && !spec.overwrite) {
    throw new Error(`create_file: file already exists: ${filePath} (set overwrite: true to overwrite)`);
  }
  let previousContent;
  if (alreadyExists) {
    previousContent = await fs.promises.readFile(filePath, 'utf8');
  }
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const content = String(spec.content || '');
  await fs.promises.writeFile(filePath, content, 'utf8');
  return {
    facts: [`created ${path.basename(filePath)} (${content.length} chars)`],
    evidenceRefs: [`${filePath}:1`],
    decisions: spec.decision ? [spec.decision] : [],
    _rollback: alreadyExists
      ? { filePath, content: previousContent }
      : { filePath, created: true },
  };
}

async function deleteLinesWorker(spec) {
  const filePath = path.resolve(spec.filePath);
  const originalContent = await fs.promises.readFile(filePath, 'utf8');
  const eol = originalContent.includes('\r\n') ? '\r\n' : '\n';
  const lines = originalContent.split(/\r?\n/);
  const toDelete = new Set();

  if (typeof spec.fromLine === 'number' && typeof spec.toLine === 'number') {
    for (let i = spec.fromLine - 1; i < spec.toLine && i < lines.length; i += 1) {
      toDelete.add(i);
    }
  }
  if (spec.matchPattern) {
    const re = new RegExp(spec.matchPattern);
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) toDelete.add(i);
    }
  }

  if (toDelete.size === 0) {
    throw new Error(`delete_lines found no lines to delete in ${filePath}`);
  }

  const remaining = lines.filter((_, i) => !toDelete.has(i));
  await fs.promises.writeFile(filePath, remaining.join(eol), 'utf8');
  return {
    facts: [`deleted ${toDelete.size} line(s) from ${path.basename(filePath)}`],
    evidenceRefs: [`${filePath}:1`],
    decisions: spec.decision ? [spec.decision] : [],
    _rollback: { filePath, content: originalContent },
  };
}

async function assertFileContainsWorker(spec) {
  const filePath = path.resolve(spec.filePath);
  if (!spec.contains && !spec.regex) {
    throw new Error('assert_file_contains requires contains or regex');
  }
  const text = await fs.promises.readFile(filePath, 'utf8');
  if (spec.contains && !text.includes(spec.contains)) {
    throw new Error(`assert_file_contains did not find expected text in ${filePath}`);
  }
  if (spec.regex) {
    const regex = new RegExp(spec.regex, spec.flags || 'm');
    if (!regex.test(text)) {
      throw new Error(`assert_file_contains did not match regex in ${filePath}`);
    }
  }
  return {
    facts: [`verified expected content in ${path.basename(filePath)}`],
    evidenceRefs: [`${filePath}:1`],
    decisions: spec.decision ? [spec.decision] : [],
  };
}

async function execCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const timeout = options.timeoutMs || 120000;
    let settled = false;
    let timer = null;

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      handler(value);
    };

    const child = exec(command, { cwd: options.cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error && error.killed) {
        return finish(reject, new Error(`command timeout after ${timeout}ms`));
      }
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        return finish(reject, error);
      }
      finish(resolve, { stdout, stderr });
    });

    timer = setTimeout(() => {
      if (!settled && child && child.pid) child.kill();
    }, timeout);
    timer.unref?.();
  });
}

function isRetryableError(error) {
  const msg = (error.stderr || error.stdout || error.message || String(error)).toLowerCase();
  // Network errors, timeouts, and transient failures are retryable
  return /timeout|econnrefused|enotfound|ehostunreach|enetunreach|connection.*refused|temporary|temporarily|transient/i.test(msg);
}

async function runCommandWorker(spec) {
  const cwd = path.resolve(spec.cwd || '.');
  const retryAttempts = spec.retryAttempts || 1;
  const retryDelayMs = spec.retryDelayMs || 2000;

  let lastError;
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    try {
      const result = await execCommand(spec.command, { cwd, timeoutMs: spec.timeoutMs || 120000 });
      return {
        facts: [`command passed: ${spec.command}`],
        evidenceRefs: [`command:${spec.command}`],
        decisions: spec.decision ? [spec.decision] : [],
        command: {
          cwd,
          stdout: result.stdout.trim().slice(0, 1000),
          stderr: result.stderr.trim().slice(0, 1000),
          attempts: attempt,
        },
      };
    } catch (error) {
      lastError = error;
      // Only retry if error is retryable and we have attempts left
      if (isRetryableError(error) && attempt < retryAttempts) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // If not retryable or last attempt, throw error
      throw new Error(`run_command failed (${spec.command}): ${(lastError.stderr || lastError.stdout || lastError.message || String(lastError)).trim().slice(0, 400)}`);
    }
  }
}

async function grepWorker(spec, ctx) {
  const root = path.resolve(spec.path || '.');
  const regex = new RegExp(spec.regex, spec.flags || 'i');
  const extensions = (spec.extensions || []).map((ext) => String(ext).toLowerCase());

  // Check cache first
  if (ctx && ctx.cache) {
    const cached = ctx.cache.getSearch(spec.regex, extensions, root);
    if (cached) {
      const facts = [`[CACHE HIT] found ${cached.results.length} match(es) for ${spec.regex}`];
      return {
        facts,
        evidenceRefs: cached.results,
        decisions: cached.results.length && spec.decisionOnMatch ? [spec.decisionOnMatch] : [],
        openQuestions: cached.results.length ? [] : [spec.noMatchQuestion || `no matches for ${spec.regex}`],
      };
    }
  }

  // Cache miss: search files
  const files = await walk(root, extensions);
  const matches = [];
  for (const file of files) {
    regex.lastIndex = 0;
    const text = await fs.promises.readFile(file, 'utf8').catch(() => null);
    if (typeof text !== 'string') continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      if (!regex.test(lines[i])) continue;
      matches.push(`${file}:${i + 1}`);
      if (matches.length >= (spec.limit || 20)) break;
    }
    if (matches.length >= (spec.limit || 20)) break;
  }

  // Store in cache
  if (ctx && ctx.cache) {
    ctx.cache.setSearch(spec.regex, extensions, root, matches);
  }

  return {
    facts: [`found ${matches.length} match(es) for ${spec.regex}`],
    evidenceRefs: matches,
    decisions: matches.length && spec.decisionOnMatch ? [spec.decisionOnMatch] : [],
    openQuestions: matches.length ? [] : [spec.noMatchQuestion || `no matches for ${spec.regex}`],
  };
}

async function adaptiveWriteWorker(spec, ctx) {
  const backend = detectBackend();
  const blackboard = ctx.snapshot();

  // Adapt write spec based on read phase findings
  const originalWriteSpec = {
    kind: spec.kind || 'replace_text',
    filePath: spec.filePath,
    replacements: spec.replacements,
    content: spec.content,
    afterLine: spec.afterLine,
    afterPattern: spec.afterPattern,
    fromLine: spec.fromLine,
    toLine: spec.toLine,
    matchPattern: spec.matchPattern,
    overwrite: spec.overwrite,
  };

  let writeSpec = originalWriteSpec;
  if (backend && spec.adaptOnRead !== false) {
    try {
      writeSpec = await adaptWriteSpec(originalWriteSpec, blackboard, backend);
    } catch (error) {
      // Fall back to original spec on adaptation failure
      writeSpec = originalWriteSpec;
    }
  }

  // Execute the (possibly adapted) write spec
  let result;
  if (writeSpec.kind === 'replace_text') {
    result = await replaceTextWorker(writeSpec);
  } else if (writeSpec.kind === 'insert_lines') {
    result = await insertLinesWorker(writeSpec);
  } else if (writeSpec.kind === 'create_file') {
    result = await createFileWorker(writeSpec);
  } else if (writeSpec.kind === 'delete_lines') {
    result = await deleteLinesWorker(writeSpec);
  } else {
    throw new Error(`unsupported adaptive_write kind: ${writeSpec.kind}`);
  }

  return {
    ...result,
    adapted: writeSpec !== originalWriteSpec,
    originalSpec: originalWriteSpec,
    adaptedSpec: writeSpec,
  };
}

async function writeBatchWorker(spec) {
  const rollbackLog = [];

  try {
    for (const step of spec.steps || []) {
      let result;

      if (step.kind === 'replace_text') {
        result = await replaceTextWorker(step);
      } else if (step.kind === 'insert_lines') {
        result = await insertLinesWorker(step);
      } else if (step.kind === 'create_file') {
        result = await createFileWorker(step);
      } else if (step.kind === 'delete_lines') {
        result = await deleteLinesWorker(step);
      } else {
        throw new Error(`unsupported write_batch step kind: ${step.kind}`);
      }

      // Record rollback info
      if (result._rollback) {
        rollbackLog.push(result._rollback);
      }
    }

    return {
      facts: [`applied ${spec.steps.length} write step(s)`],
      evidenceRefs: spec.steps.map((s) => s.filePath || 'unknown').filter(Boolean),
      decisions: spec.steps.map((s) => s.decision).filter(Boolean),
      _rollback: { batch: true, steps: rollbackLog },
    };
  } catch (error) {
    // Rollback all steps in reverse order
    for (let i = rollbackLog.length - 1; i >= 0; i -= 1) {
      const rb = rollbackLog[i];
      try {
        if (rb.created) {
          await fs.promises.unlink(rb.filePath).catch(() => {});
        } else if (typeof rb.content === 'string') {
          await fs.promises.writeFile(rb.filePath, rb.content, 'utf8');
        }
      } catch (rollbackError) {
        // Ignore rollback errors
      }
    }
    throw error;
  }
}

async function synthesizeWorker(_spec, ctx) {
  const snapshot = ctx.snapshot();
  return {
    facts: [`writer merged ${snapshot.facts.length} fact(s)`],
    decisions: snapshot.decisions.length ? [] : ['merged-without-decision'],
    summary: {
      goal: snapshot.goal,
      factCount: snapshot.facts.length,
      evidenceCount: snapshot.evidenceRefs.length,
      decisionCount: snapshot.decisions.length,
      openQuestionCount: snapshot.openQuestions.length,
    },
  };
}

function createStopWhen(stopWhen) {
  if (!stopWhen || typeof stopWhen !== 'object') return undefined;
  return ({ blackboard }) => {
    if (stopWhen.decisionsAtLeast && blackboard.decisions.length >= stopWhen.decisionsAtLeast) {
      return 'decision threshold met';
    }
    if (stopWhen.evidenceRefsAtLeast && blackboard.evidenceRefs.length >= stopWhen.evidenceRefsAtLeast) {
      return 'evidence threshold met';
    }
    if (stopWhen.factsAtLeast && blackboard.facts.length >= stopWhen.factsAtLeast) {
      return 'fact threshold met';
    }
    return false;
  };
}

function createRuntimeWorker(spec) {
  const base = {
    id: spec.id,
    owner: spec.owner,
    roleHint: spec.roleHint || spec.role_hint || spec.kind,
    goal: spec.goal,
    deliverable: spec.deliverable || spec.kind,
    phase: spec.phase,
    writeAccess: spec.writeAccess === true || spec.write_access === true,
  };

  if (spec.kind === 'list_dir') {
    return { ...base, run: () => listDirWorker(spec) };
  }
  if (spec.kind === 'read_file') {
    return { ...base, run: (ctx) => readFileWorker(spec, ctx) };
  }
  if (spec.kind === 'grep') {
    return { ...base, run: (ctx) => grepWorker(spec, ctx) };
  }
  if (spec.kind === 'replace_text') {
    return { ...base, phase: spec.phase || 'write', writeAccess: true, run: () => replaceTextWorker(spec) };
  }
  if (spec.kind === 'insert_lines') {
    return { ...base, phase: spec.phase || 'write', writeAccess: true, run: () => insertLinesWorker(spec) };
  }
  if (spec.kind === 'create_file') {
    return { ...base, phase: spec.phase || 'write', writeAccess: true, run: () => createFileWorker(spec) };
  }
  if (spec.kind === 'delete_lines') {
    return { ...base, phase: spec.phase || 'write', writeAccess: true, run: () => deleteLinesWorker(spec) };
  }
  if (spec.kind === 'assert_file_contains') {
    return { ...base, phase: spec.phase || 'verify', run: () => assertFileContainsWorker(spec) };
  }
  if (spec.kind === 'run_command') {
    return { ...base, phase: spec.phase || 'verify', run: () => runCommandWorker(spec) };
  }
  if (spec.kind === 'synthesize') {
    return { ...base, phase: spec.phase || 'write', writeAccess: true, run: (ctx) => synthesizeWorker(spec, ctx) };
  }
  if (spec.kind === 'write_batch') {
    return { ...base, phase: spec.phase || 'write', writeAccess: true, run: () => writeBatchWorker(spec) };
  }
  if (spec.kind === 'adaptive_write') {
    return { ...base, phase: spec.phase || 'write', writeAccess: true, run: (ctx) => adaptiveWriteWorker(spec, ctx) };
  }

  throw new Error(`unsupported worker kind: ${spec.kind}`);
}

async function main() {
  const { planPath } = parseArgs(process.argv);
  const plan = JSON.parse(await fs.promises.readFile(planPath, 'utf8'));
  const planRoot = plan.root ? path.resolve(plan.root) : path.dirname(planPath);
  const workers = (plan.workers || []).map((spec) => {
    const next = { ...spec };
    next.path = resolvePathMaybe(planRoot, spec.path);
    next.dirPath = resolvePathMaybe(planRoot, spec.dirPath);
    next.filePath = resolvePathMaybe(planRoot, spec.filePath);
    next.cwd = resolvePathMaybe(planRoot, spec.cwd);
    return createRuntimeWorker(next);
  });
  const readWorkerCount = workers.filter((worker) => worker.phase !== 'write' && worker.phase !== 'verify').length;
  const computedMinReadWorkers = readWorkerCount > 0 ? Math.min(2, readWorkerCount) : 0;
  let computedParallelReadWorkers = readWorkerCount > 0 ? Math.min(2, readWorkerCount) : 1;

  // Dynamic parallelism: calculate plan complexity and adjust accordingly
  const planScore = scorePlan(plan);
  const tierLabel = getTierLabel(planScore);

  // Adjust parallelReadWorkers based on complexity tier
  if (planScore <= 3) {
    // trivial: max parallelism (4 workers, or fewer if not enough available)
    computedParallelReadWorkers = Math.min(4, readWorkerCount || 1);
  } else if (planScore <= 6) {
    // simple: 3 workers
    computedParallelReadWorkers = Math.min(3, readWorkerCount || 1);
  } else if (planScore <= 9) {
    // medium: 2 workers (default)
    computedParallelReadWorkers = Math.min(2, readWorkerCount || 1);
  } else {
    // complex/hard: 1 worker (serial, safer)
    computedParallelReadWorkers = 1;
  }

  // Create cache store for this session
  const cache = createCacheStore();

  const onEvent = (event) => {
    const { type, workerId, detail } = event;
    if (type === 'worker.started') {
      process.stderr.write(`[swarm] worker.started   ${workerId} (${detail.owner})\n`);
    } else if (type === 'worker.completed') {
      const facts = detail.facts || 0;
      process.stderr.write(`[swarm] worker.completed ${workerId}  facts=${facts}\n`);
    } else if (type === 'writer.started') {
      process.stderr.write(`[swarm] writer.started   ${workerId} (${detail.owner})\n`);
    } else if (type === 'writer.completed') {
      process.stderr.write(`[swarm] writer.completed ${workerId}\n`);
    } else if (type === 'verify.started') {
      process.stderr.write(`[swarm] verify.started   ${workerId} (${detail.owner})\n`);
    } else if (type === 'verify.completed') {
      const passed = detail.passed !== false ? 'true' : 'false';
      process.stderr.write(`[swarm] verify.completed ${workerId}  passed=${passed}\n`);
    }
  };

  // Log parallelism decision
  process.stderr.write(`[swarm] complexity: ${tierLabel} (score=${planScore}), parallelism=${computedParallelReadWorkers}\n`);

  // Session recovery: load previous blackboard if resuming
  let previousBlackboard = null;
  if (plan.sessionId && plan.resumeBlackboard) {
    try {
      previousBlackboard = await loadBlackboard(plan.sessionId);
      if (previousBlackboard) {
        process.stderr.write(`[session] Recovered blackboard from session ${plan.sessionId}\n`);
      }
    } catch (error) {
      process.stderr.write(`[session] Failed to load blackboard: ${error.message}\n`);
    }
  }

  const result = await runSwarm({
    goal: plan.goal,
    workers,
    minReadWorkers: plan.minReadWorkers ?? computedMinReadWorkers,
    maxReadWorkers: plan.maxReadWorkers || 4,
    parallelReadWorkers: plan.parallelReadWorkers ?? computedParallelReadWorkers,
    stopWhen: createStopWhen(plan.stopWhen),
    stopOnVerifyFailure: plan.stopOnVerifyFailure !== false,
    onEvent,
    cache,
  });

  // Session persistence: save blackboard for future resumption
  if (plan.sessionId) {
    try {
      await saveBlackboard(plan.sessionId, result.blackboard);
      process.stderr.write(`[session] Blackboard saved to session ${plan.sessionId}\n`);
    } catch (error) {
      process.stderr.write(`[session] Failed to save blackboard: ${error.message}\n`);
    }
  }

  // Cleanup old blackboards periodically
  try {
    await cleanupOldBlackboards(7 * 24 * 60 * 60 * 1000); // 7 days
  } catch (error) {
    // Ignore cleanup errors
  }

  // Rollback write if verification failed
  if (!result.verificationPassed && result.writerResult) {
    const rb = result.writerResult._rollback;
    if (rb) {
      try {
        if (rb.created) {
          await fs.promises.unlink(rb.filePath).catch(() => {});
        } else if (typeof rb.content === 'string') {
          await fs.promises.writeFile(rb.filePath, rb.content, 'utf8');
        }
        result.rolledBack = true;
        result.rollbackFile = rb.filePath;
      } catch (rollbackError) {
        result.rollbackError = rollbackError.message || String(rollbackError);
      }
    }
  }

  // Strip internal _rollback data from output (may contain full file contents)
  const output = { ...result };
  if (output.writerResult) {
    const { _rollback, ...cleanWriter } = output.writerResult;
    output.writerResult = cleanWriter;
  }

  // Print cache statistics
  const cacheStats = cache.getStats();
  process.stderr.write(`\n[cache] search: ${cacheStats.search.hits}/${cacheStats.search.total} hits (${cacheStats.search.hitRate})\n`);
  process.stderr.write(`[cache] read:   ${cacheStats.read.hits}/${cacheStats.read.total} hits (${cacheStats.read.hitRate})\n`);
  process.stderr.write(`[cache] llm:    ${cacheStats.llm.hits}/${cacheStats.llm.total} hits (${cacheStats.llm.hitRate})\n`);

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
