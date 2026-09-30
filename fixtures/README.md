# Fixtures

Saved NHL API responses, mirroring the URL path: `/standings/now` is stored at `v1/standings/now.json`.

Create or refresh them with `npm run fixtures:capture` (add `-- --history` for every season since 1979-80). `REPORT.md` lists what succeeded. These files are committed so tests and `NHL_MODE=fixtures` work offline.
