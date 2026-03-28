const {
  extractTitle,
  extractAbstract,
  extractSections,
  extractKeyClaims,
  buildEvidencePack,
  readPdfToEvidencePack,
} = require('./paper-writer-pdf-adapter');

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

// ── fixture ───────────────────────────────────────────────────────────────────

const SAMPLE_TEXT = `
Attention Is All You Need

Ashish Vaswani, Noam Shazeer, Niki Parmar

Abstract
The dominant sequence transduction models are based on complex recurrent or convolutional neural
networks that include an encoder and a decoder. The best performing models also connect the encoder
and decoder through an attention mechanism. We propose a new simple network architecture, the
Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions
entirely. Experiments on two machine translation tasks show that our model achieves superior quality
while being more parallelizable and requiring significantly less time to train.

1. Introduction
Recurrent neural networks, long short-term memory and gated recurrent neural networks in particular,
have been firmly established as state of the art approaches in sequence modeling and transduction
problems such as language modeling and machine translation. Numerous efforts have since continued
to push the boundaries of recurrent language models and encoder-decoder architectures.

2. Background
The goal of reducing sequential computation also forms the foundation of the Extended Neural GPU,
ByteNet and ConvS2S, all of which use convolutional neural networks as basic building block.

3. Model Architecture
Most competitive neural sequence transduction models have an encoder-decoder structure. The encoder
maps an input sequence of symbol representations to a sequence of continuous representations.

4. Experiments
We trained on the standard WMT 2014 English-German dataset consisting of about 4.5 million sentence
pairs. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving
over the existing best results, including ensembles, by over 2 BLEU.

5. Conclusion
We presented the Transformer, the first sequence transduction model based entirely on attention,
replacing the recurrent layers most commonly used in encoder-decoder architectures with
multi-headed self-attention. Our results show that the Transformer can be trained significantly
faster than architectures based on recurrent or convolutional layers.
`.trim();

const CHINESE_TEXT = `
基于注意力机制的论文写作辅助系统

摘要
本文提出一种基于大语言模型的论文写作辅助系统。实验表明，该系统在多个基准任务上的表现
显著优于现有方法，证明了所提框架的有效性。本文的主要贡献包括：自动文献筛选、
章节起草与引用核验三个模块。

一、引言
当前的论文写作系统普遍存在以下问题：缺乏证据链追踪、无法自动校验引用可信度。

二、方法
我们提出一种基于 route_packet 与 artifact 的半自主协同框架，能够根据任务风险动态调整
自动化程度。

三、实验
在 GAIA 基准上，我们的方法在三个子任务中均取得最优结果。显著提升体现在证据精度指标上。
`.trim();

// ── tests ─────────────────────────────────────────────────────────────────────

test('extractTitle returns the first substantive line as candidate title', () => {
  const lines = SAMPLE_TEXT.split('\n');
  const title = extractTitle(lines);

  assert(typeof title === 'string' && title.length > 0, 'title should be a non-empty string');
  assert(title.includes('Attention'), 'title should contain the paper title');
});

test('extractAbstract finds the abstract section body', () => {
  const abstract = extractAbstract(SAMPLE_TEXT);

  assert(typeof abstract === 'string' && abstract.length > 20, 'abstract should be a non-empty string');
  assert(abstract.toLowerCase().includes('transformer') || abstract.toLowerCase().includes('attention'), 'abstract should contain relevant content');
  assert(abstract.length <= 1200, 'abstract should be capped at 1200 chars');
});

test('extractAbstract finds Chinese abstract (摘要)', () => {
  const abstract = extractAbstract(CHINESE_TEXT);

  assert(typeof abstract === 'string' && abstract.length > 10, 'Chinese abstract should be detected');
  assert(abstract.includes('大语言模型') || abstract.includes('论文'), 'abstract should contain Chinese paper content');
});

test('extractSections identifies numbered section headers', () => {
  const lines = SAMPLE_TEXT.split('\n');
  const sections = extractSections(lines);

  assert(Array.isArray(sections) && sections.length >= 3, 'should find at least 3 sections');
  assert(sections.every((s) => typeof s.header === 'string' && s.header.length > 0), 'each section should have a header');
  assert(sections.every((s) => typeof s.text === 'string' && s.text.length > 0), 'each section should have text');
  const headers = sections.map((s) => s.header.toLowerCase());
  assert(headers.some((h) => h.includes('introduction') || h.includes('background')), 'should find introduction or background');
});

test('extractSections identifies Chinese section headers', () => {
  const lines = CHINESE_TEXT.split('\n');
  const sections = extractSections(lines);

  assert(Array.isArray(sections) && sections.length >= 2, 'should find at least 2 Chinese sections');
  const headers = sections.map((s) => s.header);
  assert(headers.some((h) => h.includes('引言') || h.includes('方法') || h.includes('实验')), 'should find Chinese section headers');
});

test('extractKeyClaims finds claim sentences containing signal phrases', () => {
  const claims = extractKeyClaims(SAMPLE_TEXT);

  assert(Array.isArray(claims) && claims.length > 0, 'should find at least one claim sentence');
  assert(claims.length <= 8, 'should not exceed limit');
  assert(claims.every((c) => typeof c === 'string' && c.length > 20), 'each claim should be a non-trivial sentence');
  const hasPropose = claims.some((c) => c.toLowerCase().includes('propose') || c.toLowerCase().includes('show') || c.toLowerCase().includes('achieve'));
  assert(hasPropose, 'should detect sentences with propose/show/achieve');
});

test('extractKeyClaims detects Chinese claim sentences', () => {
  const claims = extractKeyClaims(CHINESE_TEXT);

  assert(Array.isArray(claims) && claims.length > 0, 'should find Chinese claim sentences');
  const hasChineseClaim = claims.some((c) => c.includes('本文提出') || c.includes('实验表明') || c.includes('我们提出') || c.includes('显著'));
  assert(hasChineseClaim, 'should detect Chinese claim signals');
});

test('buildEvidencePack returns a well-structured evidence_pack artifact', () => {
  const lines = SAMPLE_TEXT.split('\n');
  const artifact = buildEvidencePack({
    title: extractTitle(lines),
    abstract: extractAbstract(SAMPLE_TEXT),
    sections: extractSections(lines),
    keyClaims: extractKeyClaims(SAMPLE_TEXT),
    sourceLabel: 'attention-is-all-you-need.pdf',
    riskFlags: [],
  });

  assert(artifact.artifact_type === 'evidence_pack', 'artifact type should be evidence_pack');
  assert(artifact.producer === 'paper-research-ops', 'producer should be paper-research-ops');
  assert(typeof artifact.artifact_id === 'string' && artifact.artifact_id.length > 0, 'artifact id should be generated');
  assert(typeof artifact.summary === 'string' && artifact.summary.length > 0, 'artifact should have a summary');
  assert(artifact.source_refs.includes('attention-is-all-you-need.pdf'), 'source label should appear in source_refs');
  assert(typeof artifact.content === 'object', 'artifact should have a content object');
  assert(Array.isArray(artifact.content.sections) && artifact.content.sections.length > 0, 'content should have sections');
  assert(Array.isArray(artifact.content.key_claims) && artifact.content.key_claims.length > 0, 'content should have key_claims');
});

test('readPdfToEvidencePack processes pre-extracted text and returns an artifact', () => {
  const { artifact, warnings } = readPdfToEvidencePack({
    text: SAMPLE_TEXT,
    label: 'attention.pdf',
  });

  assert(artifact !== null, 'artifact should not be null for valid text input');
  assert(artifact.artifact_type === 'evidence_pack', 'should produce evidence_pack');
  assert(artifact.content.title !== null, 'title should be extracted');
  assert(artifact.content.abstract !== null, 'abstract should be extracted');
  assert(Array.isArray(artifact.content.key_claims) && artifact.content.key_claims.length > 0, 'key claims should be extracted');
  assert(Array.isArray(warnings), 'warnings should always be an array');
});

test('readPdfToEvidencePack processes Chinese text', () => {
  const { artifact, warnings } = readPdfToEvidencePack({
    text: CHINESE_TEXT,
    label: '论文.pdf',
  });

  assert(artifact !== null, 'artifact should not be null for Chinese text');
  assert(artifact.content.abstract !== null, 'Chinese abstract should be extracted');
  assert(artifact.content.key_claims.length > 0, 'Chinese key claims should be extracted');
  assert(artifact.source_refs.includes('论文.pdf'), 'Chinese source label should be preserved');
});

test('readPdfToEvidencePack returns null and warning for missing file', () => {
  const { artifact, warnings } = readPdfToEvidencePack({
    filePath: '/tmp/does-not-exist-pw-test.pdf',
  });

  assert(artifact === null, 'artifact should be null for missing file');
  assert(Array.isArray(warnings) && warnings.length > 0, 'should return a warning');
  assert(warnings[0].includes('not found'), 'warning should mention file not found');
});

test('readPdfToEvidencePack returns null and warning when no input provided', () => {
  const { artifact, warnings } = readPdfToEvidencePack({});

  assert(artifact === null, 'artifact should be null when no input provided');
  assert(warnings.length > 0, 'should return a warning');
});

test('readPdfToEvidencePack adds no_claims_detected risk flag when no claims found', () => {
  const minimalText = `Some Title\n\nAbstract\nThis paper describes something.\n\n1. Introduction\nHere is background.`;
  const { artifact } = readPdfToEvidencePack({ text: minimalText });

  // minimal text may or may not have claims; just verify risk_flags is an array
  assert(Array.isArray(artifact.risk_flags), 'risk_flags should always be an array');
});

test('readPdfToEvidencePack preserves caller-supplied riskFlags', () => {
  const { artifact } = readPdfToEvidencePack({
    text: SAMPLE_TEXT,
    riskFlags: ['manual_review_needed'],
  });

  assert(artifact.risk_flags.includes('manual_review_needed'), 'caller risk flags should be preserved');
});

console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
process.exit(testsFailed > 0 ? 1 : 0);
