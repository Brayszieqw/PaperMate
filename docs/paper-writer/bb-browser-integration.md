# bb-browser integration

This workspace vendors `bb-browser` under `third_party/bb-browser` and uses it as an optional browser-backed search layer for `paper-writer`.

## What is integrated

- Browser-backed paper search via `arxiv/search`
- General web lookup wrappers for:
  - `google/search`
  - `stackoverflow/search`
  - `wikipedia/summary`
- Automatic fallback from browser-backed search to public providers (`openalex`, `crossref`)

## Local assets

- Vendored source: `third_party/bb-browser`
- Community adapters: `%USERPROFILE%\.bb-browser\bb-sites`
- Managed browser profile: `%USERPROFILE%\.bb-browser\browser\user-data`

## Start the local runtime

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bb-browser-start.ps1
```

This script:

- starts the local bb-browser daemon on `http://127.0.0.1:19824` if needed
- launches Chrome/Edge with:
  - a dedicated user data dir
  - remote debugging on port `19825`
  - the unpacked bb-browser extension loaded from `third_party/bb-browser/packages/extension/dist`
- opens:
  - `chrome://extensions/`
  - `https://arxiv.org/`
  - `https://www.google.com/`

## Check readiness

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bb-browser-status.ps1
```

The most important field is:

- `daemon_extension_connected`

When it is `true`, the extension has connected to the daemon and browser-backed commands should be able to run.

## Smoke test

```bash
node ./scripts/bb-browser-runtime-smoke.js
```

Expected behavior:

- if the browser chain is fully ready, the script performs a real `arxiv/search`
- if not, it returns a diagnostic JSON object showing which part is missing

## paper-writer usage

Use browser-backed search mode:

```json
{
  "mode": "new",
  "goal": "先筛论文，再起草 related work",
  "searchMode": "browser"
}
```

## Notes

- `paper-writer` does not require bb-browser. It only uses it when `searchMode` is `browser`.
- Browser-backed search is more flexible, but it depends on a live local Chrome/extension/daemon chain.
- If the chain is unavailable, the search layer falls back to public providers and records provider warnings in trace notes.
