const { searchArxivWithChromeDevtools } = require('./chrome-devtools-adapter');

async function main() {
  const browserUrl = process.env.CHROME_DEVTOOLS_BROWSER_URL || 'http://127.0.0.1:19825';
  const report = {
    browserUrl,
    ok: false,
    count: 0,
    sampleTitle: null,
    error: null,
  };

  try {
    const payload = await searchArxivWithChromeDevtools({
      query: 'transformer',
      count: 3,
      browserUrl,
    });
    report.ok = true;
    report.count = payload.count || 0;
    report.sampleTitle = Array.isArray(payload.papers) && payload.papers[0] ? payload.papers[0].title : null;
  } catch (error) {
    report.error = error.message;
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
