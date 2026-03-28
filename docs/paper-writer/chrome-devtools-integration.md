# Chrome DevTools browser integration

`paper-writer` now prefers a Chrome DevTools-backed browser path for `searchMode: "browser"`.

## What it uses

- a local Chrome/Edge instance with remote debugging enabled
- community site adapters from `%USERPROFILE%\.bb-browser\bb-sites`
- direct CDP evaluation instead of the previous extension/daemon execution path

## Start a local browser endpoint

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\chrome-devtools-start.ps1
```

By default this:

- resolves the Chrome executable from `D:\Users\ljx\Desktop\Phú - Chrome.lnk` when available
- launches a dedicated debug profile
- exposes CDP on `http://127.0.0.1:19825`

## Check readiness

```bash
node .\scripts\chrome-devtools-status.js
```

## Run a real smoke test

```bash
node .\scripts\chrome-devtools-runtime-smoke.js
```

The smoke test runs a real `arxiv/search` adapter through Chrome DevTools. If it fails, the JSON output shows the exact browser-side error.

## paper-writer usage

```json
{
  "mode": "new",
  "goal": "先筛论文，再起草 related work",
  "searchMode": "browser",
  "browserUrl": "http://127.0.0.1:19825"
}
```

## Notes

- `searchMode: "real"` still works without any browser dependency
- `searchMode: "browser"` is now Chrome DevTools-first
- the old `bb-browser` artifacts remain in the repo, but they are no longer the preferred execution path
