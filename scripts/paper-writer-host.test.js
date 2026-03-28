const os = require('os');
const path = require('path');
const fs = require('fs');
const { dispatch } = require('./paper-writer-host');

const TEST_STORE_DIR = path.join(os.tmpdir(), `pw-host-test-${Date.now()}`);
const storeOptions = { storeDir: TEST_STORE_DIR };

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
    testsFailed += 1;
  }
}

function cleanup() {
  if (fs.existsSync(TEST_STORE_DIR)) {
    fs.rmSync(TEST_STORE_DIR, { recursive: true, force: true });
  }
}

const SAMPLE_PDF_TEXT = `
Attention Is All You Need

Abstract
We propose a new simple network architecture, the Transformer, based solely on
attention mechanisms. Experiments show that our model achieves superior quality.

1. Introduction
Recurrent neural networks have been firmly established as state of the art.

2. Experiments
Our model achieves 28.4 BLEU on WMT 2014 English-to-German translation task,
outperforms existing best results by over 2 BLEU.

3. Conclusion
We presented the Transformer, the first sequence transduction model based entirely
on attention. Our results show significant improvement over recurrent architectures.
`.trim();

(async () => {
  // ── mode: new ───────────────────────────────────────────────────────────────

  await test('dispatch new: returns ok response with runtime, ui, meta, session', async () => {
    const result = await dispatch({
      mode: 'new',
      goal: '先筛论文，再起草 related work',
    }, storeOptions);

    assert(result.ok === true, 'response should be ok');
    assert(typeof result.taskId === 'string' && result.taskId.length > 0, 'should return a taskId');
    assert(result.runtime !== undefined, 'response should include runtime');
    assert(result.ui !== undefined, 'response should include ui');
    assert(result.session !== null, 'response should include session record');
    assert(result.session.task_id === result.taskId, 'session task_id should match response taskId');
    assert(typeof result.session.saved_at === 'string', 'session should have saved_at');
  });

  await test('dispatch new: session file is written to store dir', async () => {
    const result = await dispatch({
      mode: 'new',
      goal: '帮我整理文献库',
    }, storeOptions);

    assert(result.ok === true, 'response should be ok');
    assert(fs.existsSync(result.session.file_path), 'session file should exist on disk');
  });

  await test('dispatch new: draft goal produces draft-focused runtime', async () => {
    const result = await dispatch({
      mode: 'new',
      goal: '起草 related work 章节',
    }, storeOptions);

    assert(result.ok === true, 'response should be ok');
    assert(result.meta.routePacket.domain_focus === 'draft', 'draft goal should produce draft route');
    assert(result.meta.routePacket.recommended_next_agent === 'paper-drafter', 'should recommend paper-drafter');
  });

  await test('dispatch new: defense-prep goal produces paused run with checkpoint', async () => {
    const result = await dispatch({
      mode: 'new',
      goal: '帮我准备答辩，预测老师会问什么',
    }, storeOptions);

    assert(result.ok === true, 'response should be ok');
    assert(result.meta.routePacket.domain_focus === 'defense-prep', 'should be defense-prep focus');
    assert(result.ui.type === 'checkpoint-card', 'paused defense-prep should produce a checkpoint card');
  });

  await test('dispatch new: returns error for unknown mode', async () => {
    const result = await dispatch({ mode: 'unsupported-mode' }, storeOptions);

    assert(result.ok === false, 'unknown mode should return error');
    assert(typeof result.error === 'string' && result.error.includes('unknown mode'), 'error should mention unknown mode');
  });

  // ── mode: resume ─────────────────────────────────────────────────────────────

  await test('dispatch resume: loads saved session and resumes run', async () => {
    const newResult = await dispatch({
      mode: 'new',
      goal: '先筛论文再写 related work',
    }, storeOptions);

    const taskId = newResult.taskId;
    const resumeResult = await dispatch({ mode: 'resume', taskId }, storeOptions);

    assert(resumeResult.ok === true, 'resume should succeed');
    assert(resumeResult.taskId === taskId, 'resumed task id should match original');
    assert(resumeResult.runtime.runStatus === 'running', 'resumed run should have running status');
    assert(resumeResult.session !== null, 'resumed session should be saved again');
  });

  await test('dispatch resume: applies routePatch when provided', async () => {
    const newResult = await dispatch({
      mode: 'new',
      goal: '先筛论文再写 related work',
    }, storeOptions);

    const taskId = newResult.taskId;
    const resumeResult = await dispatch({
      mode: 'resume',
      taskId,
      routePatch: {
        domain_focus: 'review',
        recommended_next_agent: 'paper-reviewer',
      },
    }, storeOptions);

    assert(resumeResult.ok === true, 'resume with patch should succeed');
    assert(resumeResult.runtime.runSummary.nextAgent === 'paper-reviewer', 'route patch should take effect');
  });

  await test('dispatch resume: returns error for unknown taskId', async () => {
    const result = await dispatch({
      mode: 'resume',
      taskId: 'task-that-does-not-exist',
    }, storeOptions);

    assert(result.ok === false, 'resume with unknown taskId should fail');
    assert(result.error.includes('not found'), 'error should mention session not found');
  });

  await test('dispatch resume: returns error when taskId is missing', async () => {
    const result = await dispatch({ mode: 'resume' }, storeOptions);

    assert(result.ok === false, 'resume without taskId should fail');
    assert(result.error.includes('taskId'), 'error should mention taskId');
  });

  // ── mode: pdf_ops ─────────────────────────────────────────────────────────────

  await test('dispatch pdf_ops: processes inline text and attaches evidence_pack', async () => {
    const result = await dispatch({
      mode: 'pdf_ops',
      pdfText: SAMPLE_PDF_TEXT,
      label: 'attention.pdf',
      goal: '精读这篇论文并提取关键证据',
    }, storeOptions);

    assert(result.ok === true, 'pdf_ops should succeed for valid text');
    assert(result.runtime.pdfArtifact !== undefined, 'runtime should include pdfArtifact');
    assert(result.runtime.pdfArtifact.artifact_type === 'evidence_pack', 'pdf artifact should be evidence_pack');
    assert(result.runtime.activeArtifactIds.includes(result.runtime.pdfArtifact.artifact_id), 'pdf artifact id should appear in activeArtifactIds');
    assert(result.session !== null, 'session should be saved after pdf_ops');
  });

  await test('dispatch pdf_ops: attaches PDF to an existing session by taskId', async () => {
    const newResult = await dispatch({
      mode: 'new',
      goal: '先筛论文再起草',
    }, storeOptions);

    const taskId = newResult.taskId;
    const prevCount = newResult.runtime.activeArtifactIds.length;

    const pdfResult = await dispatch({
      mode: 'pdf_ops',
      taskId,
      pdfText: SAMPLE_PDF_TEXT,
      label: 'background-paper.pdf',
    }, storeOptions);

    assert(pdfResult.ok === true, 'pdf_ops on existing session should succeed');
    assert(pdfResult.taskId === taskId, 'task id should remain the same');
    assert(pdfResult.runtime.activeArtifactIds.length > prevCount, 'artifact count should increase after pdf attach');
  });

  await test('dispatch pdf_ops: returns error when no pdfPath or pdfText provided', async () => {
    const result = await dispatch({ mode: 'pdf_ops', label: 'test.pdf' }, storeOptions);

    assert(result.ok === false, 'pdf_ops without input should fail');
    assert(result.error.includes('pdfPath or pdfText'), 'error should explain missing input');
  });

  await test('dispatch pdf_ops: returns error for missing pdf file', async () => {
    const result = await dispatch({
      mode: 'pdf_ops',
      pdfPath: '/tmp/no-such-file-pw-test.pdf',
    }, storeOptions);

    assert(result.ok === false, 'pdf_ops with missing file should fail');
    assert(typeof result.error === 'string' && result.error.length > 0, 'should return an error message');
  });

  // ── round-trip ────────────────────────────────────────────────────────────────

  await test('full round-trip: new → pdf_ops → resume produces consistent taskId', async () => {
    const step1 = await dispatch({
      mode: 'new',
      goal: '精读一篇论文并整理证据包',
    }, storeOptions);
    const taskId = step1.taskId;

    const step2 = await dispatch({
      mode: 'pdf_ops',
      taskId,
      pdfText: SAMPLE_PDF_TEXT,
      label: 'key-paper.pdf',
    }, storeOptions);

    const step3 = await dispatch({
      mode: 'resume',
      taskId,
    }, storeOptions);

    assert(step1.ok && step2.ok && step3.ok, 'all three steps should succeed');
    assert(step2.taskId === taskId && step3.taskId === taskId, 'taskId should be stable across all steps');
    assert(step3.runtime.activeArtifactIds.length >= 1, 'resumed session should carry attached artifacts');
  });

  // ── teardown ──────────────────────────────────────────────────────────────────

  cleanup();
  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
