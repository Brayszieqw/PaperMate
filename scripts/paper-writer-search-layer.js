const { asTrimmedString, asArray, createRuntimeId } = require('./paper-writer-utils');
const {
  searchArxivWithChromeDevtools,
  searchGoogleWithChromeDevtools,
  searchStackOverflowWithChromeDevtools,
  searchWebWithChromeDevtools,
} = require('./chrome-devtools-adapter');

const ENGLISH_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'these', 'those',
  'then', 'than', 'your', 'about', 'after', 'before', 'need', 'want', 'help',
  'paper', 'papers', 'write', 'writing', 'draft', 'continue', 'please', 'more',
  'using', 'used', 'study', 'research', 'chapter',
]);

const WORKFLOW_NOISE_PATTERNS = [
  /先筛论文/gi,
  /再起草/gi,
  /起草/gi,
  /帮我/gi,
  /继续/gi,
  /不需要现在停下来/gi,
  /把这些论文整理成/gi,
  /结构化笔记和文献库/gi,
  /先写/gi,
  /开题报告提纲/gi,
  /研究方案说明/gi,
];

function getDefaultSearchProviders() {
  return [
    { name: 'chrome_cdp_arxiv', tier: 'A', enabled: true, role: 'browser-backed' },
    { name: 'openalex', tier: 'A', enabled: true, role: 'primary' },
    { name: 'crossref', tier: 'B', enabled: true, role: 'supplemental' },
  ];
}

function createSearchProviderRegistry(providers = getDefaultSearchProviders()) {
  return Object.fromEntries(providers.map((provider) => [provider.name, { ...provider }]));
}

function createPaperCandidateItem(seed = {}) {
  return {
    provider_name: asTrimmedString(seed.provider_name, 'unknown_provider'),
    provider_record_id: asTrimmedString(seed.provider_record_id, 'unknown_record'),
    title: asTrimmedString(seed.title, '[untitled paper]'),
    authors: asArray(seed.authors),
    year: seed.year ?? null,
    venue: seed.venue ?? null,
    abstract_or_summary: seed.abstract_or_summary ?? null,
    doi: seed.doi ?? null,
    url: seed.url ?? null,
    citation_count: seed.citation_count ?? null,
    reference_count: seed.reference_count ?? null,
    source_type: seed.source_type ?? null,
    provider_score: seed.provider_score ?? null,
    selection_reason: seed.selection_reason || null,
    alternative_rejection_reason: seed.alternative_rejection_reason || null,
    claim_support_scope: seed.claim_support_scope || null,
    topic_tags: asArray(seed.topic_tags),
    method_tags: asArray(seed.method_tags),
    limitation_tags: asArray(seed.limitation_tags),
    defense_notes: seed.defense_notes || null,
    dedup_cluster_id: seed.dedup_cluster_id || null,
    canonical_preference: seed.canonical_preference || null,
  };
}

function createSearchArtifact(seed = {}) {
  return {
    artifact_id: asTrimmedString(seed.artifact_id, createRuntimeId('search-artifact')),
    artifact_type: asTrimmedString(seed.artifact_type, 'literature_candidate_set'),
    summary: asTrimmedString(seed.summary, '[pending search summary]'),
    items: asArray(seed.items),
    trace: {
      query_variants: asArray(seed.trace?.query_variants),
      providers_used: asArray(seed.trace?.providers_used),
      notes: seed.trace?.notes || null,
      variant_runs: asArray(seed.trace?.variant_runs),
      seed_expansion: asArray(seed.trace?.seed_expansion),
      errors: asArray(seed.trace?.errors),
    },
  };
}

function normalizeQueryText(query) {
  let text = asTrimmedString(query, '[pending search query]');
  for (const pattern of WORKFLOW_NOISE_PATTERNS) {
    text = text.replace(pattern, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function extractQueryTerms(query) {
  const normalized = normalizeQueryText(query).toLowerCase();
  const matches = normalized.match(/[\u4e00-\u9fff]{2,}|[a-z0-9][a-z0-9-]{2,}/g) || [];
  const seen = new Set();
  const terms = [];

  for (const match of matches) {
    const term = match.trim();
    if (!term || seen.has(term) || ENGLISH_STOPWORDS.has(term)) {
      continue;
    }
    seen.add(term);
    terms.push(term);
  }

  return terms;
}

function buildKeywordQuery(query, maxTerms = 8) {
  return extractQueryTerms(query).slice(0, maxTerms).join(' ');
}

function inferSearchIntent(query) {
  const text = normalizeQueryText(query).toLowerCase();

  if (/(related work|survey|review|综述|文献回顾)/i.test(text)) {
    return 'related_work';
  }

  if (/(method|approach|model|architecture|算法|方法|模型)/i.test(text)) {
    return 'method';
  }

  if (/(background|motivation|problem|question|背景|研究问题|选题)/i.test(text)) {
    return 'background';
  }

  return 'general';
}

function buildQueryVariants(query) {
  const raw = asTrimmedString(query, '[pending search query]');
  const cleaned = normalizeQueryText(query);
  const keywordQuery = buildKeywordQuery(query);
  const titleLikeQuery = extractQueryTerms(query).slice(0, 4).join(' ');
  const intent = inferSearchIntent(query);
  const variants = [];

  const pushVariant = (value) => {
    const text = asTrimmedString(value, '');
    if (!text) return;
    if (!variants.includes(text)) {
      variants.push(text);
    }
  };

  pushVariant(raw);
  if (cleaned && cleaned !== raw) {
    pushVariant(cleaned);
  }
  pushVariant(keywordQuery);
  pushVariant(titleLikeQuery);

  if (intent === 'related_work') {
    pushVariant(`${keywordQuery || cleaned || raw} survey`);
    pushVariant(`${keywordQuery || cleaned || raw} review`);
  } else if (intent === 'method') {
    pushVariant(`${keywordQuery || cleaned || raw} method`);
  } else if (intent === 'background') {
    pushVariant(`${keywordQuery || cleaned || raw} background`);
  } else if (keywordQuery || titleLikeQuery) {
    pushVariant(`${titleLikeQuery || keywordQuery} paper`);
  }

  return variants.slice(0, 5);
}

function createOpenAlexSearchUrl(query, perPage = 10) {
  const encoded = encodeURIComponent(asTrimmedString(query, '[pending search query]'));
  return `https://api.openalex.org/works?search=${encoded}&per-page=${perPage}`;
}

function createCrossrefSearchUrl(query, rows = 10) {
  const encoded = encodeURIComponent(asTrimmedString(query, '[pending search query]'));
  return `https://api.crossref.org/works?query=${encoded}&rows=${rows}`;
}

function createOpenAlexWorkUrl(workId) {
  return String(workId || '').startsWith('https://openalex.org/')
    ? String(workId)
    : `https://api.openalex.org/works/${String(workId || '').replace(/^https?:\/\/openalex\.org\//i, '')}`;
}

function flattenOpenAlexAbstract(index) {
  if (!index || typeof index !== 'object') {
    return null;
  }

  const pairs = Object.entries(index).flatMap(([word, positions]) =>
    asArray(positions).map((pos) => [pos, word])
  );
  pairs.sort((a, b) => Number(a[0]) - Number(b[0]));
  return pairs.map(([, word]) => word).join(' ');
}

function mapOpenAlexResultToCandidate(result = {}) {
  return createPaperCandidateItem({
    provider_name: 'openalex',
    provider_record_id: result.id || createRuntimeId('openalex-record'),
    title: result.display_name,
    authors: asArray(result.authorships).map((authorship) => authorship?.author?.display_name).filter(Boolean),
    year: result.publication_year ?? null,
    venue: result.primary_location?.source?.display_name ?? null,
    abstract_or_summary: flattenOpenAlexAbstract(result.abstract_inverted_index),
    doi: typeof result.doi === 'string' ? result.doi.replace(/^https?:\/\/doi\.org\//i, '') : null,
    url: result.id ?? null,
    citation_count: result.cited_by_count ?? null,
    reference_count: result.referenced_works_count ?? null,
    source_type: 'openalex',
    provider_score: result.relevance_score ?? null,
  });
}

function mapOpenAlexExpandedResultToCandidate(result = {}, context = {}) {
  const relationType = context.relation_type || 'seed_expansion';
  const seedTitle = context.seed_title || 'seed work';
  const providerName = context.provider_name || 'openalex_expansion';

  return createPaperCandidateItem({
    provider_name: providerName,
    provider_record_id: result.id || createRuntimeId('openalex-expansion-record'),
    title: result.display_name,
    authors: asArray(result.authorships).map((authorship) => authorship?.author?.display_name).filter(Boolean),
    year: result.publication_year ?? null,
    venue: result.primary_location?.source?.display_name ?? null,
    abstract_or_summary: flattenOpenAlexAbstract(result.abstract_inverted_index),
    doi: typeof result.doi === 'string' ? result.doi.replace(/^https?:\/\/doi\.org\//i, '') : null,
    url: result.id ?? null,
    citation_count: result.cited_by_count ?? null,
    reference_count: result.referenced_works_count ?? null,
    source_type: result.type || 'openalex',
    provider_score: null,
    selection_reason: relationType === 'related_work'
      ? `expanded from seed paper "${seedTitle}" via OpenAlex related_works`
      : `expanded from seed paper "${seedTitle}" via OpenAlex referenced_works`,
    claim_support_scope: relationType === 'related_work'
      ? 'supports neighboring methods, comparable systems, and related-work positioning'
      : 'supports source grounding and evidence-chain expansion from a strong seed paper',
    defense_notes: relationType === 'related_work'
      ? `若被问为什么纳入这篇，可回答：它和核心 seed paper "${seedTitle}" 在 OpenAlex 关系图中被标为 related work。`
      : `若被问为什么纳入这篇，可回答：它是核心 seed paper "${seedTitle}" 的参考文献之一，属于证据链上游。`,
    topic_tags: asArray(result.topics).map((topic) => topic?.display_name).filter(Boolean).slice(0, 5),
    canonical_preference: result.type === 'article' ? 'prefer_formal_publication' : null,
  });
}

function mapCrossrefResultToCandidate(result = {}) {
  return createPaperCandidateItem({
    provider_name: 'crossref',
    provider_record_id: result.DOI || createRuntimeId('crossref-record'),
    title: asArray(result.title)[0] || '[untitled paper]',
    authors: asArray(result.author).map((author) => [author?.given, author?.family].filter(Boolean).join(' ')).filter(Boolean),
    year: result.published?.['date-parts']?.[0]?.[0] ?? null,
    venue: asArray(result['container-title'])[0] ?? null,
    doi: result.DOI ?? null,
    url: result.URL ?? null,
    citation_count: result['is-referenced-by-count'] ?? null,
    source_type: asArray(result['container-title']).length > 0 ? 'journal' : 'crossref',
    provider_score: null,
  });
}

function mapChromeCdpArxivPaperToCandidate(result = {}) {
  return createPaperCandidateItem({
    provider_name: 'chrome_cdp_arxiv',
    provider_record_id: result.id || createRuntimeId('chrome-cdp-arxiv-record'),
    title: result.title,
    authors: asArray(result.authors),
    year: typeof result.published === 'string' ? Number(String(result.published).slice(0, 4)) || null : null,
    venue: 'arXiv',
    abstract_or_summary: result.abstract ?? null,
    url: result.url ?? null,
    source_type: 'preprint',
    provider_score: null,
    selection_reason: 'chrome devtools browser-backed arXiv adapter result',
    topic_tags: asArray(result.categories),
  });
}

async function searchOpenAlex({ query, count = 10, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('searchOpenAlex requires a fetch implementation');
  }

  const response = await fetchImpl(createOpenAlexSearchUrl(query, count));
  if (!response.ok) {
    throw new Error(`OpenAlex request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return asArray(payload.results).map(mapOpenAlexResultToCandidate);
}

async function searchCrossref({ query, count = 10, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('searchCrossref requires a fetch implementation');
  }

  const response = await fetchImpl(createCrossrefSearchUrl(query, count));
  if (!response.ok) {
    throw new Error(`Crossref request failed with status ${response.status}`);
  }

  const payload = await response.json();
  return asArray(payload.message?.items).map(mapCrossrefResultToCandidate);
}

async function fetchOpenAlexWorkById({ workId, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetchOpenAlexWorkById requires a fetch implementation');
  }

  const response = await fetchImpl(createOpenAlexWorkUrl(workId));
  if (!response.ok) {
    throw new Error(`OpenAlex work lookup failed with status ${response.status}`);
  }

  return response.json();
}

function createSearchRunEntry(item, providerName, queryVariant, rank) {
  return {
    ...item,
    _provider_name: providerName,
    _query_variant: queryVariant,
    _retrieval_rank: rank,
  };
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function runProviderQueryVariant({
  providerName,
  queryVariant,
  fetchImpl,
  chromeRunner,
  browserUrl,
  sitesDir,
} = {}) {
  if (providerName === 'chrome_cdp_arxiv') {
    const payload = await searchArxivWithChromeDevtools({
      query: queryVariant,
      count: 10,
      runner: chromeRunner,
      browserUrl,
      sitesDir,
    });

    return asArray(payload.papers).map((item, index) =>
      createSearchRunEntry(mapChromeCdpArxivPaperToCandidate(item), providerName, queryVariant, index + 1)
    );
  }

  if (providerName === 'openalex') {
    const mapped = await searchOpenAlex({ query: queryVariant, count: 10, fetchImpl });
    return mapped.map((item, index) => createSearchRunEntry(item, providerName, queryVariant, index + 1));
  }

  if (providerName === 'crossref') {
    const mapped = await searchCrossref({ query: queryVariant, count: 10, fetchImpl });
    return mapped.map((item, index) => createSearchRunEntry(item, providerName, queryVariant, index + 1));
  }

  return [];
}

async function searchWithRealProviders({
  query,
  queryVariants,
  registry = createSearchProviderRegistry(),
  providers = Object.keys(registry),
  fetchImpl = globalThis.fetch,
  chromeRunner,
  browserUrl,
  sitesDir,
} = {}) {
  const results = {};
  const providerErrors = [];
  const variantRuns = [];
  const effectiveVariants = Array.isArray(queryVariants) && queryVariants.length > 0
    ? queryVariants
    : buildQueryVariants(query);
  const tasks = [];

  for (const providerName of providers) {
    if (!registry[providerName] || registry[providerName].enabled !== true) {
      results[providerName] = [];
      continue;
    }

    results[providerName] = [];

    for (const queryVariant of effectiveVariants) {
      tasks.push((async () => {
        try {
          const items = await runProviderQueryVariant({
            providerName,
            queryVariant,
            fetchImpl,
            chromeRunner,
            browserUrl,
            sitesDir,
          });
          return { providerName, queryVariant, items };
        } catch (error) {
          return { providerName, queryVariant, items: [], error: toErrorMessage(error) };
        }
      })());
    }
  }

  const taskResults = await Promise.all(tasks);

  for (const taskResult of taskResults) {
    const { providerName, queryVariant, items, error } = taskResult;
    if (error) {
      providerErrors.push({
        provider: providerName,
        query_variant: queryVariant,
        error,
      });
      variantRuns.push({ provider: providerName, query_variant: queryVariant, count: 0, error });
      continue;
    }

    results[providerName].push(...items);
    variantRuns.push({ provider: providerName, query_variant: queryVariant, count: items.length });
  }

  Object.defineProperty(results, '__providerErrors', {
    value: providerErrors,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(results, '__queryVariants', {
    value: effectiveVariants,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(results, '__variantRuns', {
    value: variantRuns,
    enumerable: false,
    configurable: true,
  });
  return results;
}

function fuseRealSearchResults(resultMap = {}) {
  return Object.values(resultMap).flatMap((items) => asArray(items));
}

function normalizeTitle(title) {
  return asTrimmedString(title, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCanonicalScore(item = {}) {
  const sourceType = item.source_type || '';
  if (sourceType === 'journal') return 3;
  if (sourceType === 'conference') return 2;
  if (sourceType === 'preprint') return 1;
  return 0;
}

function deduplicateCandidateItems(items = []) {
  const byKey = new Map();

  for (const item of items) {
    const doiKey = item.doi ? `doi:${String(item.doi).toLowerCase()}` : null;
    const normalizedTitle = doiKey ? '' : normalizeTitle(item.title);
    const titleKey = normalizedTitle ? `title:${normalizedTitle}` : null;
    const key = doiKey || titleKey || `${item.provider_name}:${item.provider_record_id}`;
    const existing = byKey.get(key);

    if (!existing || getCanonicalScore(item) > getCanonicalScore(existing)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values());
}

function getCandidateDedupKey(item = {}) {
  if (item.doi) return `doi:${String(item.doi).toLowerCase()}`;
  const normalizedTitle = normalizeTitle(item.title);
  if (normalizedTitle) return `title:${normalizedTitle}`;
  return `${item.provider_name}:${item.provider_record_id}`;
}

function stripInternalCandidateFields(item = {}) {
  const cleaned = { ...item };
  delete cleaned._provider_name;
  delete cleaned._query_variant;
  delete cleaned._retrieval_rank;
  delete cleaned._providers;
  delete cleaned._query_variants;
  return cleaned;
}

function inferClaimSupportScope(query) {
  const intent = inferSearchIntent(query);
  if (intent === 'related_work') {
    return 'supports related-work positioning, comparison, and literature grounding';
  }
  if (intent === 'method') {
    return 'supports method design, implementation, and experimental setup claims';
  }
  if (intent === 'background') {
    return 'supports background framing, motivation, and problem-definition claims';
  }
  return 'supports background, method, and comparison screening for the current task';
}

function getProviderConfidenceBonus(providerName) {
  if (providerName === 'chrome_cdp_arxiv') return 0.25;
  if (providerName === 'openalex') return 0.22;
  if (providerName === 'crossref') return 0.18;
  return 0.1;
}

function getSourceConfidenceBonus(sourceType) {
  if (sourceType === 'journal') return 0.12;
  if (sourceType === 'conference') return 0.1;
  if (sourceType === 'preprint') return 0.06;
  return 0;
}

function computeQueryMatchScore(item, queryTerms) {
  if (queryTerms.length === 0) return 0;
  const haystack = `${item.title || ''} ${item.abstract_or_summary || ''}`.toLowerCase();
  const matchedTerms = queryTerms.filter((term) => haystack.includes(term.toLowerCase()));
  return {
    matchedTerms,
    score: matchedTerms.length / queryTerms.length,
  };
}

function fuseCandidateItems(resultMap = {}, userQuery = '') {
  const rawItems = Object.values(resultMap).flatMap((items) => asArray(items));
  const queryTerms = extractQueryTerms(userQuery).slice(0, 8);
  const groups = new Map();

  for (const item of rawItems) {
    const key = getCandidateDedupKey(item);
    const existing = groups.get(key) || {
      best: item,
      occurrences: [],
      providers: new Set(),
      queryVariants: new Set(),
      score: 0,
      bestCanonicalScore: getCanonicalScore(item),
    };

    const providerName = item._provider_name || item.provider_name;
    const queryVariant = item._query_variant || userQuery;
    const retrievalRank = item._retrieval_rank || 1;
    const rankScore = 1 / (60 + retrievalRank);
    const providerBonus = getProviderConfidenceBonus(providerName);
    const sourceBonus = getSourceConfidenceBonus(item.source_type);
    const citationBonus = Math.min(Math.log1p(item.citation_count ?? 0) / 20, 0.25);
    const match = computeQueryMatchScore(item, queryTerms);
    const matchBonus = match.score * 0.3;
    const occurrenceScore = rankScore + providerBonus + sourceBonus + citationBonus + matchBonus;

    existing.score += occurrenceScore;
    existing.occurrences.push({ item, occurrenceScore, matchedTerms: match.matchedTerms });
    existing.providers.add(providerName);
    existing.queryVariants.add(queryVariant);

    const canonicalScore = getCanonicalScore(item);
    if (canonicalScore > existing.bestCanonicalScore || occurrenceScore > (existing.bestOccurrenceScore || -1)) {
      existing.best = item;
      existing.bestCanonicalScore = canonicalScore;
      existing.bestOccurrenceScore = occurrenceScore;
      existing.bestMatchedTerms = match.matchedTerms;
    }

    groups.set(key, existing);
  }

  return Array.from(groups.values()).map((group) => {
    const best = stripInternalCandidateFields(group.best);
    const providers = Array.from(group.providers);
    const queryVariants = Array.from(group.queryVariants);
    const matchedTerms = Array.from(new Set(group.occurrences.flatMap((entry) => entry.matchedTerms || [])));
    const providerSummary = providers.join(', ');
    const variantSummary = queryVariants.slice(0, 2).join(' | ');

    best.provider_score = Number(group.score.toFixed(6));
    best.selection_reason = `matched ${matchedTerms.length || 0} key terms; surfaced by ${providerSummary} across ${queryVariants.length} query variants`;
    best.claim_support_scope = inferClaimSupportScope(userQuery);
    best.defense_notes = `优先保留原因：它同时被 ${providers.length} 个来源/视角命中，代表性查询包括 ${variantSummary || userQuery}。`;
    best.topic_tags = Array.from(new Set([...(best.topic_tags || []), ...matchedTerms])).slice(0, 6);
    best.dedup_cluster_id = getCandidateDedupKey(best);
    best.canonical_preference = providers.includes('crossref') && best.source_type === 'journal' ? 'prefer_formal_publication' : null;
    best._providers = providers;
    best._query_variants = queryVariants;
    return best;
  }).sort((left, right) => {
    const scoreDiff = (right.provider_score ?? 0) - (left.provider_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (right.citation_count ?? 0) - (left.citation_count ?? 0);
  });
}

function pickSeedOpenAlexCandidates(resultMap = {}, maxSeedWorks = 2) {
  return asArray(resultMap.openalex)
    .slice()
    .sort((left, right) => {
      const citationDiff = (right.citation_count ?? 0) - (left.citation_count ?? 0);
      if (citationDiff !== 0) return citationDiff;
      return (right._retrieval_rank || 0) - (left._retrieval_rank || 0);
    })
    .slice(0, maxSeedWorks);
}

async function expandSeedWorks({
  resultMap = {},
  fetchImpl = globalThis.fetch,
  maxSeedWorks = 2,
  maxRelatedPerSeed = 3,
  maxReferencesPerSeed = 2,
} = {}) {
  const seeds = pickSeedOpenAlexCandidates(resultMap, maxSeedWorks);
  if (seeds.length === 0) {
    return { items: [], trace: [] };
  }

  const seenIds = new Set(
    Object.values(resultMap)
      .flatMap((items) => asArray(items))
      .map((item) => item.provider_record_id)
      .filter(Boolean),
  );

  const expandedItems = [];
  const expansionTrace = [];
  const expansionErrors = [];
  const scheduledIds = new Set();

  const seedLookups = await Promise.allSettled(
    seeds.map((seed) =>
      fetchOpenAlexWorkById({ workId: seed.provider_record_id, fetchImpl }).then((work) => ({ seed, work }))
    )
  );

  const expansionTasks = [];

  for (const seedLookup of seedLookups) {
    if (seedLookup.status !== 'fulfilled') {
      expansionErrors.push(toErrorMessage(seedLookup.reason));
      continue;
    }

    const { seed, work } = seedLookup.value;
    const relatedIds = asArray(work.related_works).slice(0, maxRelatedPerSeed);
    const referencedIds = asArray(work.referenced_works).slice(0, maxReferencesPerSeed);

    for (const relatedId of relatedIds) {
      if (seenIds.has(relatedId) || scheduledIds.has(relatedId)) continue;
      scheduledIds.add(relatedId);
      expansionTasks.push({
        workId: relatedId,
        relation_type: 'related_work',
        seed_title: seed.title,
        provider_name: 'openalex_expansion',
      });
    }

    for (const referencedId of referencedIds) {
      if (seenIds.has(referencedId) || scheduledIds.has(referencedId)) continue;
      scheduledIds.add(referencedId);
      expansionTasks.push({
        workId: referencedId,
        relation_type: 'referenced_work',
        seed_title: seed.title,
        provider_name: 'openalex_expansion',
      });
    }
  }

  const expansionLookups = await Promise.allSettled(
    expansionTasks.map((task) =>
      fetchOpenAlexWorkById({ workId: task.workId, fetchImpl }).then((work) => ({ task, work }))
    )
  );

  for (const expansionLookup of expansionLookups) {
    if (expansionLookup.status !== 'fulfilled') {
      expansionErrors.push(toErrorMessage(expansionLookup.reason));
      continue;
    }

    const { task, work } = expansionLookup.value;
    const candidate = mapOpenAlexExpandedResultToCandidate(work, task);
    candidate._provider_name = task.provider_name;
    candidate._query_variant = task.seed_title;
    candidate._retrieval_rank = expandedItems.length + 1;
    expandedItems.push(candidate);
    seenIds.add(task.workId);
    expansionTrace.push({
      seed_title: task.seed_title,
      relation_type: task.relation_type,
      expanded_work_id: task.workId,
    });
  }

  return {
    items: expandedItems,
    trace: expansionTrace,
    errors: expansionErrors,
  };
}

async function buildRealCandidateSet({ query, providers, fetchImpl, chromeRunner, browserUrl, sitesDir } = {}) {
  const queryVariants = buildQueryVariants(query);
  const registry = createSearchProviderRegistry();
  const results = await searchWithRealProviders({
    query,
    queryVariants,
    registry,
    providers,
    fetchImpl,
    chromeRunner,
    browserUrl,
    sitesDir,
  });
  const seedExpansion = await expandSeedWorks({
    resultMap: results,
    fetchImpl,
  });
  if (seedExpansion.items.length > 0) {
    results.openalex_expansion = seedExpansion.items;
  }
  const fusedItems = fuseCandidateItems(results, query);
  const providerErrors = asArray(results.__providerErrors);
  const traceNotes = ['real provider flow with external-compatible adapters'];

  if ((providers || Object.keys(results)).includes('chrome_cdp_arxiv')) {
    traceNotes.push('optional chrome-devtools browser-backed provider enabled');
  }

  if (seedExpansion.items.length > 0) {
    traceNotes.push(`seed expansion added ${seedExpansion.items.length} items from OpenAlex related/reference graph`);
  }

  if (providerErrors.length > 0) {
    traceNotes.push(`provider warnings: ${providerErrors.map((item) => `${item.provider}: ${item.error}`).join(' | ')}`);
  }

  if (seedExpansion.errors && seedExpansion.errors.length > 0) {
    traceNotes.push(`seed expansion warnings: ${seedExpansion.errors.join(' | ')}`);
  }

  return createSearchArtifact({
    artifact_id: createRuntimeId('real-search-candidate-set'),
    artifact_type: 'literature_candidate_set',
    summary: `real candidate set for query: ${asTrimmedString(query, '[pending search query]')}`,
    items: fusedItems,
    trace: {
      query_variants: asArray(results.__queryVariants),
      providers_used: providers || Object.keys(results),
      notes: traceNotes.join('; '),
      variant_runs: asArray(results.__variantRuns),
      seed_expansion: seedExpansion.trace,
      errors: [...providerErrors.map((item) => `${item.provider}/${item.query_variant}: ${item.error}`), ...asArray(seedExpansion.errors)],
    },
  });
}

function buildMockProviderResult(providerName, query, index = 1) {
  return createPaperCandidateItem({
    provider_name: providerName,
    provider_record_id: `${providerName}:${index}`,
    title: `${query} - ${providerName} result ${index}`,
    year: 2024,
    selection_reason: `mock result from ${providerName} for query matching`,
    claim_support_scope: 'supports early-stage literature scouting',
    defense_notes: `selected from ${providerName} because it matches the current topic wording`,
    source_type: 'mock_search',
    provider_score: 1 / index,
  });
}

async function searchWithMockProviders({ query, registry = createSearchProviderRegistry(), providers = Object.keys(registry) } = {}) {
  const normalizedQuery = asTrimmedString(query, '[pending search query]');
  const results = {};

  for (const providerName of providers) {
    if (!registry[providerName] || registry[providerName].enabled !== true) {
      results[providerName] = [];
      continue;
    }

    results[providerName] = [
      buildMockProviderResult(providerName, normalizedQuery, 1),
      buildMockProviderResult(providerName, normalizedQuery, 2),
    ];
  }

  return results;
}

function fuseMockSearchResults(resultMap = {}) {
  return Object.values(resultMap).flatMap((items) => asArray(items));
}

async function buildMockCandidateSet({ query, providers } = {}) {
  const registry = createSearchProviderRegistry();
  const results = await searchWithMockProviders({ query, registry, providers });
  const fusedItems = fuseMockSearchResults(results);

  return createSearchArtifact({
    artifact_id: createRuntimeId('mock-search-candidate-set'),
    artifact_type: 'literature_candidate_set',
    summary: `mock candidate set for query: ${asTrimmedString(query, '[pending search query]')}`,
    items: fusedItems,
    trace: {
      query_variants: [asTrimmedString(query, '[pending search query]')],
      providers_used: providers || Object.keys(results),
      notes: 'mock provider flow without external APIs',
    },
  });
}

module.exports = {
  getDefaultSearchProviders,
  createSearchProviderRegistry,
  createPaperCandidateItem,
  createSearchArtifact,
  createOpenAlexSearchUrl,
  createCrossrefSearchUrl,
  createOpenAlexWorkUrl,
  mapChromeCdpArxivPaperToCandidate,
  mapOpenAlexExpandedResultToCandidate,
  normalizeQueryText,
  extractQueryTerms,
  buildKeywordQuery,
  inferSearchIntent,
  buildQueryVariants,
  searchOpenAlex,
  searchCrossref,
  fetchOpenAlexWorkById,
  searchWithRealProviders,
  fuseRealSearchResults,
  deduplicateCandidateItems,
  pickSeedOpenAlexCandidates,
  expandSeedWorks,
  fuseCandidateItems,
  buildRealCandidateSet,
  searchWithMockProviders,
  fuseMockSearchResults,
  buildMockCandidateSet,
  searchGoogleWithChromeDevtools,
  searchStackOverflowWithChromeDevtools,
  searchWebWithChromeDevtools,
};
