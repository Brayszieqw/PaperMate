const {
  getDefaultBrowserUrl,
  normalizeBrowserUrl,
  resolveSiteAdapterPath,
  loadSiteAdapter,
  runChromeSiteAdapter,
  searchArxivWithChromeDevtools,
  searchGoogleWithChromeDevtools,
  searchStackOverflowWithChromeDevtools,
  getWikipediaSummaryWithChromeDevtools,
  searchWebWithChromeDevtools,
} = require('./chrome-devtools-adapter');
const {
  getDefaultSearchProviders,
  searchWithRealProviders,
  buildRealCandidateSet,
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

function createFakeRunner() {
  return async ({ siteName }) => {
    if (siteName === 'arxiv/search') {
      return {
        query: 'rag',
        count: 1,
        papers: [
          {
            id: '2501.00001',
            title: 'RAG for Everything',
            abstract: 'A paper about retrieval-augmented generation.',
            authors: ['A. Author'],
            published: '2025-01-01',
            categories: ['cs.CL'],
            url: 'https://arxiv.org/abs/2501.00001',
          },
        ],
      };
    }

    if (siteName === 'google/search') {
      return {
        query: 'rag frameworks',
        count: 1,
        results: [
          {
            title: 'RAG framework roundup',
            url: 'https://example.com/rag',
            snippet: 'A summary of retrieval-augmented generation frameworks.',
          },
        ],
      };
    }

    if (siteName === 'stackoverflow/search') {
      return {
        query: 'python async',
        count: 1,
        questions: [
          {
            id: 1,
            title: 'How does async work in Python?',
            url: 'https://stackoverflow.com/questions/1',
          },
        ],
      };
    }

    if (siteName === 'wikipedia/summary') {
      return {
        title: 'Python (programming language)',
        extract: 'Python is an interpreted high-level programming language.',
        url: 'https://en.wikipedia.org/wiki/Python_(programming_language)',
      };
    }

    throw new Error(`unhandled fake site: ${siteName}`);
  };
}

(async () => {
  await test('chrome-devtools adapter normalizes the default browser URL', async () => {
    const browserUrl = normalizeBrowserUrl(getDefaultBrowserUrl());

    assert(browserUrl.startsWith('http://127.0.0.1:'), 'default browser url should target a local devtools endpoint');
  });

  await test('resolveSiteAdapterPath locates the community adapter file', async () => {
    const adapterPath = resolveSiteAdapterPath('google/search');

    assert(adapterPath.endsWith('bb-sites\\google\\search.js'), 'google adapter path should resolve under the bb-sites directory');
  });

  await test('loadSiteAdapter reads metadata and adapter body', async () => {
    const adapter = loadSiteAdapter('arxiv/search');

    assert(adapter.meta.name === 'arxiv/search', 'adapter metadata should preserve the adapter name');
    assert(adapter.body.includes('async function'), 'adapter body should preserve the executable function source');
  });

  await test('runChromeSiteAdapter executes a fake runner and returns the payload', async () => {
    const payload = await runChromeSiteAdapter({
      siteName: 'google/search',
      args: { query: 'rag frameworks', count: 5 },
      runner: createFakeRunner(),
    });

    assert(payload.count === 1, 'site adapter should return the fake runner payload');
    assert(payload.results[0].title.includes('RAG'), 'site adapter should preserve result data');
  });

  await test('searchGoogleWithChromeDevtools returns google search data from the adapter', async () => {
    const result = await searchGoogleWithChromeDevtools({
      query: 'rag frameworks',
      runner: createFakeRunner(),
    });

    assert(result.results[0].url === 'https://example.com/rag', 'google wrapper should surface search result URLs');
  });

  await test('searchWebWithChromeDevtools routes generic searches through the adapter', async () => {
    const result = await searchWebWithChromeDevtools({
      query: 'rag frameworks',
      runner: createFakeRunner(),
    });

    assert(result.results.length === 1, 'generic web search should reuse the google adapter by default');
  });

  await test('searchArxivWithChromeDevtools returns paper data from the adapter', async () => {
    const payload = await searchArxivWithChromeDevtools({
      query: 'rag',
      runner: createFakeRunner(),
    });

    assert(payload.papers.length === 1, 'arxiv adapter should return papers');
    assert(payload.papers[0].id === '2501.00001', 'arxiv adapter should preserve paper ids');
  });

  await test('searchStackOverflowWithChromeDevtools returns question data from the adapter', async () => {
    const payload = await searchStackOverflowWithChromeDevtools({
      query: 'python async',
      runner: createFakeRunner(),
    });

    assert(payload.questions.length === 1, 'stackoverflow adapter should return question data');
    assert(payload.questions[0].url.includes('stackoverflow.com'), 'stackoverflow adapter should preserve URLs');
  });

  await test('getWikipediaSummaryWithChromeDevtools returns the article summary payload', async () => {
    const payload = await getWikipediaSummaryWithChromeDevtools({
      title: 'Python_(programming_language)',
      runner: createFakeRunner(),
    });

    assert(payload.title.includes('Python'), 'wikipedia summary should preserve the title');
    assert(payload.extract.includes('programming language'), 'wikipedia summary should preserve the extract');
  });

  await test('getDefaultSearchProviders includes a chrome-devtools browser-backed arXiv provider', async () => {
    const providers = getDefaultSearchProviders();

    assert(providers[0].name === 'chrome_cdp_arxiv', 'browser-backed arXiv should be first in the provider list');
  });

  await test('searchWithRealProviders can merge a chrome-devtools arXiv provider with public API providers', async () => {
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

    const resultMap = await searchWithRealProviders({
      query: 'rag',
      providers: ['chrome_cdp_arxiv', 'openalex', 'crossref'],
      fetchImpl: fakeFetch,
      chromeRunner: createFakeRunner(),
    });

    assert(Array.isArray(resultMap.chrome_cdp_arxiv), 'result map should include browser-backed arXiv results');
    assert(resultMap.chrome_cdp_arxiv[0].provider_name === 'chrome_cdp_arxiv', 'browser-backed results should be mapped into paper candidates');
    assert(resultMap.openalex.length >= 1, 'openalex should still run alongside the chrome adapter');
  });

  await test('buildRealCandidateSet records browser-backed search usage in trace notes', async () => {
    const artifact = await buildRealCandidateSet({
      query: 'rag',
      providers: ['chrome_cdp_arxiv'],
      chromeRunner: createFakeRunner(),
    });

    assert(artifact.items.length === 1, 'browser-backed candidate set should produce one item from the fake adapter');
    assert(artifact.trace.notes.includes('chrome-devtools'), 'trace notes should mention chrome-devtools-backed search');
  });

  console.log(`\n${testsPassed} tests passed${testsFailed > 0 ? `, ${testsFailed} failed` : ''}!`);
  process.exit(testsFailed > 0 ? 1 : 0);
})();
