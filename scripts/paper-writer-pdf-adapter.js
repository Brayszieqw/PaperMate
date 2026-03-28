const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { asTrimmedString, asArray, createRuntimeId } = require('./paper-writer-utils');

// ── text extraction ───────────────────────────────────────────────────────────

/**
 * Extract plain text from a PDF file path using pdftotext (poppler).
 * Returns null if pdftotext is not available.
 */
function extractTextWithPdftotext(filePath) {
  try {
    const text = execFileSync('pdftotext', ['-layout', filePath, '-'], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return text;
  } catch {
    return null;
  }
}

/**
 * Read text from a file path.
 * Supports: .txt, .md (direct read), .pdf (via pdftotext).
 * Returns null if extraction fails.
 */
function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt' || ext === '.md') {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }

  if (ext === '.pdf') {
    return extractTextWithPdftotext(filePath);
  }

  return null;
}

// ── text parsing helpers ──────────────────────────────────────────────────────

const CLAIM_SIGNALS = [
  'we propose', 'we present', 'we introduce', 'we show', 'we argue', 'we demonstrate',
  'we find', 'we observe', 'we conclude', 'results show', 'results suggest',
  'our approach', 'our method', 'our model', 'our framework',
  'outperforms', 'achieves', 'improves', 'significantly', 'state-of-the-art',
  '我们提出', '我们认为', '实验表明', '结果显示', '本文提出', '本文介绍',
  '显著提升', '优于', '基于此',
];

const SECTION_SIGNALS = [
  /^(abstract|introduction|related\s+work|background|method(?:ology)?|experiment(?:s)?|evaluation|result(?:s)?|discussion|conclusion|reference(?:s)?|appendix)/i,
  /^\d+\.?\s+(introduction|related|background|method|experiment|result|discussion|conclusion)/i,
  /^[一二三四五六七八九十]+[、.．]\s*\S/,
  /^(摘要|引言|相关工作|背景|方法|实验|结果|讨论|结论|参考文献|附录)/,
];

function looksLikeSectionHeader(line) {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  return SECTION_SIGNALS.some((pattern) => pattern.test(trimmed));
}

function looksLikeClaimSentence(sentence) {
  const lower = sentence.toLowerCase();
  return CLAIM_SIGNALS.some((signal) => lower.includes(signal));
}

function splitIntoSentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

// ── paper structure extraction ────────────────────────────────────────────────

function extractTitle(lines) {
  const candidates = lines
    .slice(0, 30)
    .map((l) => l.trim())
    .filter((l) => l.length > 10 && l.length < 220 && !looksLikeSectionHeader(l));

  return candidates[0] || null;
}

function extractAbstract(text) {
  const lower = text.toLowerCase();
  const start = lower.search(/\babstract\b|摘要/);
  if (start === -1) return null;

  const fromAbstract = text.slice(start);
  const lines = fromAbstract.split('\n');
  const bodyLines = [];

  for (let i = 1; i < lines.length; i++) {
    if (looksLikeSectionHeader(lines[i]) && i > 2) break;
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) bodyLines.push(trimmed);
    if (bodyLines.join(' ').length > 1200) break;
  }

  const body = bodyLines.join(' ').trim();
  return body.length > 20 ? body.slice(0, 1200) : null;
}

function extractSections(lines) {
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (looksLikeSectionHeader(line)) {
      if (current) {
        current.text = current.lines.join(' ').trim();
        delete current.lines;
        sections.push(current);
      }
      current = { header: line.trim(), lines: [] };
    } else if (current) {
      const trimmed = line.trim();
      if (trimmed.length > 0) current.lines.push(trimmed);
    }
  }

  if (current) {
    current.text = current.lines.join(' ').trim();
    delete current.lines;
    sections.push(current);
  }

  return sections.filter((s) => s.text.length > 20).slice(0, 12);
}

function extractKeyClaims(text, limit = 8) {
  return splitIntoSentences(text)
    .filter(looksLikeClaimSentence)
    .slice(0, limit);
}

// ── evidence_pack builder ─────────────────────────────────────────────────────

function buildEvidencePack({ title, abstract, sections, keyClaims, sourceLabel, riskFlags = [] }) {
  const claimCount = keyClaims.length;
  const sectionCount = sections.length;

  return {
    artifact_id: createRuntimeId('evidence-pack'),
    artifact_type: 'evidence_pack',
    version: 'v1',
    producer: 'paper-research-ops',
    summary: title
      ? `精读：${title.slice(0, 80)}${title.length > 80 ? '…' : ''}（${claimCount} 条关键声明，${sectionCount} 个章节）`
      : `精读产出（${claimCount} 条关键声明，${sectionCount} 个章节）`,
    source_refs: sourceLabel ? [sourceLabel] : [],
    risk_flags: riskFlags,
    content: {
      title: title || null,
      abstract: abstract || null,
      sections,
      key_claims: keyClaims,
    },
  };
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Read a PDF or text file and return an evidence_pack artifact.
 *
 * Options:
 *   filePath  – path to .pdf / .txt / .md file
 *   text      – pre-extracted plain text (skips file IO)
 *   label     – human-readable source label for source_refs
 *   riskFlags – additional risk flags to attach
 *
 * Returns { artifact, warnings } where warnings is an array of strings.
 */
function readPdfToEvidencePack(options = {}) {
  const warnings = [];
  let rawText = null;

  if (typeof options.text === 'string' && options.text.trim().length > 0) {
    rawText = options.text;
  } else if (typeof options.filePath === 'string') {
    if (!fs.existsSync(options.filePath)) {
      return { artifact: null, warnings: [`file not found: ${options.filePath}`] };
    }
    rawText = extractTextFromFile(options.filePath);

    if (rawText === null) {
      const ext = path.extname(options.filePath).toLowerCase();
      if (ext === '.pdf') {
        warnings.push('pdftotext not available or failed; provide extracted text via options.text');
      } else {
        warnings.push(`could not read file: ${options.filePath}`);
      }
      return { artifact: null, warnings };
    }
  } else {
    return { artifact: null, warnings: ['readPdfToEvidencePack: provide filePath or text'] };
  }

  const lines = rawText.split('\n');
  const title = extractTitle(lines);
  const abstract = extractAbstract(rawText);
  const sections = extractSections(lines);
  const keyClaims = extractKeyClaims(rawText);
  const sourceLabel = options.label
    || (options.filePath ? path.basename(options.filePath) : null);

  const riskFlags = asArray(options.riskFlags);
  if (keyClaims.length === 0) {
    riskFlags.push('no_claims_detected');
    warnings.push('no claim sentences detected; text may be non-English or poorly extracted');
  }
  if (!abstract) {
    warnings.push('abstract not detected');
  }

  const artifact = buildEvidencePack({ title, abstract, sections, keyClaims, sourceLabel, riskFlags });
  return { artifact, warnings };
}

module.exports = {
  extractTextWithPdftotext,
  extractTextFromFile,
  extractTitle,
  extractAbstract,
  extractSections,
  extractKeyClaims,
  buildEvidencePack,
  readPdfToEvidencePack,
};
