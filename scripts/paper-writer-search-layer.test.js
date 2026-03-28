const {
  getDefaultSearchProviders,
  createSearchProviderRegistry,
  createPaperCandidateItem,
  createSearchArtifact,
  createOpenAlexSearchUrl,
  createCrossrefSearchUrl,
  createOpenAlexWorkUrl,
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
  buildRealCandidateSet,
  deduplicateCandidateItems,
  pickSeedOpenAlexCandidates,
  expandSeedWorks,
  fuseCandidateItems,
  searchWithMockProviders,
  fuseMockSearchResults,
  buildMockCandidateSet,
} = require('./paper-writer-search-layer');

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
  }
}

(async () => {
  await test('getDefaultSearchProviders returns the expected provider order', async () => {
    const providers = getDefaultSearchProviders();

    assert(Array.isArray(providers), 'providers should be an array');
    assert(providers.length === 3, 'should expose browser-backed plus public default providers');
    assert(providers[0].name === 'chrome_cdp_arxiv', 'chrome-devtools arxiv should be first');
    assert(providers[1].name === 'openalex', 'openalex should be second');
    assert(providers[2].name === 'crossref', 'crossref should be third');
  });

  await test('createSearchProviderRegistry builds a keyed provider map with tier info', async () => {
    const registry = createSearchProviderRegistry();

    assert(registry.chrome_cdp_arxiv.tier === 'A', 'chrome-devtools arxiv should be tier A');
    assert(registry.openalex.tier === 'A', 'openalex should be tier A');
    assert(registry.crossref.tier === 'B', 'crossref should be tier B');
    assert(registry.crossref.enabled === true, 'crossref should be enabled by default');
  });

  await test('createPaperCandidateItem preserves defense-ready search fields', async () => {
    const item = createPaperCandidateItem({
      provider_name: 'openalex',
      provider_record_id: 'oa:123',
      title: 'Multimodal Feedback in Education',
      year: 2024,
      selection_reason: 'directly studies multimodal educational feedback',
      claim_support_scope: 'supports multimodal feedback quality claims',
      defense_notes: 'close match to current task domain',
    });

    assert(item.provider_name === 'openalex', 'provider name should be preserved');
    assert(item.selection_reason.includes('multimodal'), 'selection reason should be preserved');
    assert(item.claim_support_scope.includes('supports'), 'claim support scope should be preserved');
    assert(item.defense_notes.includes('domain'), 'defense notes should be preserved');
  });

  await test('createSearchArtifact builds a literature_candidate_set artifact with items and trace', async () => {
    const artifact = createSearchArtifact({
      artifact_id: 'search-1',
      artifact_type: 'literature_candidate_set',
      summary: 'candidate literature set for related work',
      items: [
        createPaperCandidateItem({
          provider_name: 'semantic_scholar',
          provider_record_id: 's2:1',
          title: 'Feedback Generation',
        }),
      ],
      trace: {
        query_variants: ['multimodal feedback education'],
        providers_used: ['openalex', 'semantic_scholar'],
      },
    });

    assert(artifact.artifact_type === 'literature_candidate_set', 'artifact type should be preserved');
    assert(Array.isArray(artifact.items) && artifact.items.length === 1, 'artifact should carry candidate items');
    assert(Array.isArray(artifact.trace.providers_used), 'artifact trace should preserve providers used');
  });

  await test('normalizeQueryText strips workflow noise from paper-writer style requests', async () => {
    const normalized = normalizeQueryText('先筛论文，再起草 related work，不需要现在停下来');

    assert(!normalized.includes('先筛论文'), 'workflow noise should be removed');
    assert(normalized.includes('related work'), 'task-bearing text should remain');
  });

  await test('extractQueryTerms keeps meaningful topic terms from mixed Chinese-English goals', async () => {
    const terms = extractQueryTerms('先筛论文，再起草 related work，研究 retrieval augmented generation');

    assert(terms.includes('related'), 'english topic terms should be retained');
    assert(terms.includes('retrieval'), 'retrieval should be retained');
    assert(terms.includes('generation'), 'generation should be retained');
  });

  await test('buildKeywordQuery condenses a broad query into searchable keywords', async () => {
    const keywordQuery = buildKeywordQuery('帮我先筛论文，再起草 related work，主题是 retrieval augmented generation');

    assert(typeof keywordQuery === 'string' && keywordQuery.length > 0, 'keyword query should be non-empty');
    assert(keywordQuery.includes('retrieval'), 'keyword query should keep core technical terms');
  });

  await test('inferSearchIntent detects related-work oriented goals', async () => {
    const intent = inferSearchIntent('先筛论文，再起草 related work');

    assert(intent === 'related_work', 'related-work wording should map to related_work intent');
  });

  await test('buildQueryVariants creates multiple search views for related-work tasks', async () => {
    const variants = buildQueryVariants('先筛论文，再起草 related work，主题是 retrieval augmented generation');

    assert(Array.isArray(variants) && variants.length >= 3, 'query rewrite should generate multiple variants');
    assert(variants.some((variant) => variant.includes('survey')), 'related-work queries should include a survey-oriented variant');
  });

  await test('createOpenAlexSearchUrl encodes the query into the API URL', async () => {
    const url = createOpenAlexSearchUrl('multimodal feedback in education');

    assert(url.includes('api.openalex.org/works'), 'openalex URL should target works endpoint');
    assert(url.includes('multimodal%20feedback%20in%20education'), 'openalex URL should encode the query');
  });

  await test('createCrossrefSearchUrl encodes the query into the API URL', async () => {
    const url = createCrossrefSearchUrl('multimodal feedback in education');

    assert(url.includes('api.crossref.org/works'), 'crossref URL should target works endpoint');
    assert(url.includes('multimodal%20feedback%20in%20education'), 'crossref URL should encode the query');
  });

  await test('createOpenAlexWorkUrl supports full URLs and bare work ids', async () => {
    const fullUrl = createOpenAlexWorkUrl('https://openalex.org/W123');
    const bareIdUrl = createOpenAlexWorkUrl('W123');

    assert(fullUrl === 'https://openalex.org/W123', 'full OpenAlex URLs should pass through unchanged');
    assert(bareIdUrl.endsWith('/works/W123'), 'bare ids should be expanded to the works endpoint');
  });

  await test('searchOpenAlex maps API results into candidate items', async () => {
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'https://openalex.org/W123',
            display_name: 'OpenAlex Paper',
            publication_year: 2024,
            primary_location: { source: { display_name: 'ACL' } },
            doi: 'https://doi.org/10.1000/test',
            cited_by_count: 12,
            abstract_inverted_index: { feedback: [0], quality: [1] },
            authorships: [{ author: { display_name: 'Author A' } }],
          },
        ],
      }),
    });

    const items = await searchOpenAlex({ query: 'multimodal feedback', fetchImpl: fakeFetch });

    assert(Array.isArray(items), 'OpenAlex search should return an array');
    assert(items.length === 1, 'OpenAlex search should map one item');
    assert(items[0].provider_name === 'openalex', 'OpenAlex item should preserve provider');
    assert(items[0].title === 'OpenAlex Paper', 'OpenAlex item should preserve title');
  });

  await test('searchCrossref maps API results into candidate items', async () => {
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({
        message: {
          items: [
            {
              DOI: '10.1000/crossref-test',
              title: ['Crossref Paper'],
              published: { 'date-parts': [[2023]] },
              'container-title': ['Journal of Testing'],
              author: [{ given: 'A', family: 'Author' }],
              URL: 'https://doi.org/10.1000/crossref-test',
              'is-referenced-by-count': 7,
            },
          ],
        },
      }),
    });

    const items = await searchCrossref({ query: 'multimodal feedback', fetchImpl: fakeFetch });

    assert(Array.isArray(items), 'Crossref search should return an array');
    assert(items.length === 1, 'Crossref search should map one item');
    assert(items[0].provider_name === 'crossref', 'Crossref item should preserve provider');
    assert(items[0].title === 'Crossref Paper', 'Crossref item should preserve title');
  });

  await test('fetchOpenAlexWorkById requests a single OpenAlex work object', async () => {
    const fakeFetch = async (url) => ({
      ok: true,
      json: async () => ({ id: url, display_name: 'Expanded OpenAlex Paper' }),
    });

    const payload = await fetchOpenAlexWorkById({
      workId: 'W123',
      fetchImpl: fakeFetch,
    });

    assert(payload.display_name === 'Expanded OpenAlex Paper', 'single-work lookup should return the fetched work object');
  });

  await test('mapOpenAlexExpandedResultToCandidate preserves expansion context', async () => {
    const item = mapOpenAlexExpandedResultToCandidate({
      id: 'https://openalex.org/W999',
      display_name: 'Expanded Work',
      publication_year: 2024,
      abstract_inverted_index: { expanded: [0], work: [1] },
      authorships: [{ author: { display_name: 'Author X' } }],
      primary_location: { source: { display_name: 'ACL' } },
      type: 'article',
    }, {
      relation_type: 'related_work',
      seed_title: 'Seed Paper',
    });

    assert(item.provider_name === 'openalex_expansion', 'expanded candidates should use the expansion provider');
    assert(item.selection_reason.includes('Seed Paper'), 'expanded candidates should record the seed title');
    assert(item.claim_support_scope.includes('related-work'), 'expanded candidates should explain their support scope');
  });

  await test('searchWithRealProviders runs enabled provider adapters and returns provider-keyed results', async () => {
    const fakeFetch = async (url) => {
      if (url.includes('openalex')) {
        return {
          ok: true,
          json: async () => ({ results: [{ id: 'oa:1', display_name: 'OpenAlex Result' }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ message: { items: [{ DOI: '10.1/test', title: ['Crossref Result'] }] } }),
      };
    };

    const results = await searchWithRealProviders({
      query: 'multimodal feedback',
      providers: ['openalex', 'crossref'],
      fetchImpl: fakeFetch,
    });

    assert(Array.isArray(results.openalex), 'real provider search should include openalex array');
    assert(Array.isArray(results.crossref), 'real provider search should include crossref array');
  });

  await test('buildRealCandidateSet creates a literature candidate artifact from real-provider results', async () => {
    const fakeFetch = async (url) => {
      if (url.includes('openalex')) {
        return {
          ok: true,
          json: async () => ({ results: [{ id: 'oa:1', display_name: 'OpenAlex Result' }] }),
        };
      }
      return {
        ok: true,
        json: async () => ({ message: { items: [{ DOI: '10.1/test', title: ['Crossref Result'] }] } }),
      };
    };

    const artifact = await buildRealCandidateSet({
      query: 'multimodal feedback',
      providers: ['openalex', 'crossref'],
      fetchImpl: fakeFetch,
    });

    assert(artifact.artifact_type === 'literature_candidate_set', 'real candidate set artifact type should be correct');
    assert(Array.isArray(artifact.items) && artifact.items.length === 2, 'real candidate set should include fused provider results');
    assert(Array.isArray(artifact.trace.providers_used) && artifact.trace.providers_used.includes('crossref'), 'real candidate set trace should include providers');
    assert(Array.isArray(artifact.trace.query_variants) && artifact.trace.query_variants.length > 1, 'real candidate set should preserve rewritten query variants');
  });

  await test('deduplicateCandidateItems merges records with the same DOI', async () => {
    const deduped = deduplicateCandidateItems([
      createPaperCandidateItem({ provider_name: 'openalex', provider_record_id: 'oa:1', title: 'Paper A', doi: '10.1000/test' }),
      createPaperCandidateItem({ provider_name: 'crossref', provider_record_id: 'cr:1', title: 'Paper A', doi: '10.1000/test' }),
    ]);

    assert(Array.isArray(deduped), 'deduped results should be an array');
    assert(deduped.length === 1, 'same DOI records should collapse to one item');
  });

  await test('deduplicateCandidateItems prefers the more canonical record when titles match', async () => {
    const deduped = deduplicateCandidateItems([
      createPaperCandidateItem({ provider_name: 'arxiv', provider_record_id: 'ax:1', title: 'Paper B', source_type: 'preprint' }),
      createPaperCandidateItem({ provider_name: 'crossref', provider_record_id: 'cr:2', title: 'Paper B', source_type: 'journal' }),
    ]);

    assert(deduped.length === 1, 'same-title records should collapse to one item');
    assert(deduped[0].provider_name === 'crossref', 'canonical preference should keep the journal-like record');
  });

  await test('fuseCandidateItems merges repeated hits and writes selection metadata', async () => {
    const fused = fuseCandidateItems({
      openalex: [
        {
          ...createPaperCandidateItem({
            provider_name: 'openalex',
            provider_record_id: 'oa:1',
            title: 'Retrieval Augmented Generation for Education',
            abstract_or_summary: 'Retrieval augmented generation improves educational feedback.',
            citation_count: 20,
            source_type: 'openalex',
          }),
          _provider_name: 'openalex',
          _query_variant: 'retrieval augmented generation',
          _retrieval_rank: 1,
        },
      ],
      crossref: [
        {
          ...createPaperCandidateItem({
            provider_name: 'crossref',
            provider_record_id: '10.1/test',
            title: 'Retrieval Augmented Generation for Education',
            abstract_or_summary: 'A journal version about retrieval augmented generation.',
            citation_count: 5,
            source_type: 'journal',
          }),
          _provider_name: 'crossref',
          _query_variant: 'retrieval augmented generation survey',
          _retrieval_rank: 2,
        },
      ],
    }, '先筛论文，再起草 related work，主题是 retrieval augmented generation');

    assert(Array.isArray(fused) && fused.length === 1, 'fusion should merge duplicate hits across providers');
    assert(typeof fused[0].selection_reason === 'string' && fused[0].selection_reason.length > 0, 'fusion should write selection reasons');
    assert(typeof fused[0].defense_notes === 'string' && fused[0].defense_notes.length > 0, 'fusion should write defense notes');
    assert(typeof fused[0].claim_support_scope === 'string' && fused[0].claim_support_scope.length > 0, 'fusion should write claim support scope');
  });

  await test('pickSeedOpenAlexCandidates selects the strongest OpenAlex seeds first', async () => {
    const seeds = pickSeedOpenAlexCandidates({
      openalex: [
        { ...createPaperCandidateItem({ provider_name: 'openalex', provider_record_id: 'oa:1', title: 'Seed A', citation_count: 10 }), _retrieval_rank: 3 },
        { ...createPaperCandidateItem({ provider_name: 'openalex', provider_record_id: 'oa:2', title: 'Seed B', citation_count: 50 }), _retrieval_rank: 5 },
        { ...createPaperCandidateItem({ provider_name: 'openalex', provider_record_id: 'oa:3', title: 'Seed C', citation_count: 30 }), _retrieval_rank: 1 },
      ],
    }, 2);

    assert(seeds.length === 2, 'seed selection should respect the requested limit');
    assert(seeds[0].title === 'Seed B', 'highest-citation OpenAlex candidate should be selected first');
  });

  await test('expandSeedWorks adds related and referenced OpenAlex works from strong seeds', async () => {
    const fakeFetch = async (url) => {
      if (url.includes('/works/oa:seed')) {
        return {
          ok: true,
          json: async () => ({
            id: 'https://openalex.org/WSEED',
            display_name: 'Seed Work',
            related_works: ['https://openalex.org/WREL1'],
            referenced_works: ['https://openalex.org/WREF1'],
          }),
        };
      }

      if (url.includes('/WREL1')) {
        return {
          ok: true,
          json: async () => ({
            id: 'https://openalex.org/WREL1',
            display_name: 'Related Work',
            publication_year: 2023,
            abstract_inverted_index: { related: [0], work: [1] },
            authorships: [{ author: { display_name: 'Author R' } }],
          }),
        };
      }

      if (url.includes('/WREF1')) {
        return {
          ok: true,
          json: async () => ({
            id: 'https://openalex.org/WREF1',
            display_name: 'Referenced Work',
            publication_year: 2021,
            abstract_inverted_index: { referenced: [0], work: [1] },
            authorships: [{ author: { display_name: 'Author Ref' } }],
          }),
        };
      }

      throw new Error(`unexpected url: ${url}`);
    };

    const expansion = await expandSeedWorks({
      resultMap: {
        openalex: [
          {
            ...createPaperCandidateItem({
              provider_name: 'openalex',
              provider_record_id: 'oa:seed',
              title: 'Seed Work',
              citation_count: 100,
            }),
            _retrieval_rank: 1,
          },
        ],
      },
      fetchImpl: fakeFetch,
      maxSeedWorks: 1,
      maxRelatedPerSeed: 1,
      maxReferencesPerSeed: 1,
    });

    assert(expansion.items.length === 2, 'seed expansion should add both related and referenced works');
    assert(expansion.trace.length === 2, 'seed expansion should preserve expansion trace entries');
  });

  await test('searchWithMockProviders returns provider-keyed result lists without real APIs', async () => {
    const registry = createSearchProviderRegistry();
    const results = await searchWithMockProviders({
      query: 'multimodal feedback in education',
      registry,
      providers: ['openalex', 'semantic_scholar'],
    });

    assert(Array.isArray(results.openalex), 'openalex results should be an array');
    assert(Array.isArray(results.semantic_scholar), 'semantic scholar results should be an array');
    assert(results.openalex.length > 0, 'openalex mock results should not be empty');
  });

  await test('fuseMockSearchResults merges provider results into a dedup-ready flat list', async () => {
    const fused = fuseMockSearchResults({
      openalex: [
        createPaperCandidateItem({ provider_name: 'openalex', provider_record_id: 'oa:1', title: 'Paper A' }),
      ],
      semantic_scholar: [
        createPaperCandidateItem({ provider_name: 'semantic_scholar', provider_record_id: 's2:1', title: 'Paper B' }),
      ],
    });

    assert(Array.isArray(fused), 'fused results should be an array');
    assert(fused.length === 2, 'fused results should preserve both provider records');
  });

  await test('buildMockCandidateSet creates a literature candidate artifact from mock providers', async () => {
    const artifact = await buildMockCandidateSet({
      query: 'multimodal feedback in education',
      providers: ['openalex', 'semantic_scholar', 'arxiv'],
    });

    assert(artifact.artifact_type === 'literature_candidate_set', 'candidate set artifact type should be correct');
    assert(Array.isArray(artifact.items) && artifact.items.length >= 2, 'candidate set should contain mock items from implemented providers');
    assert(Array.isArray(artifact.trace.providers_used) && artifact.trace.providers_used.includes('openalex'), 'trace should include used providers');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
