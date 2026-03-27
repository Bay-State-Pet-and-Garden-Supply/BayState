## 2026-03-26 - Task 2 issues

- Workspace-level pre-commit command `python -m pytest apps/scraper/tests/ -v` currently fails at collection in unrelated test `apps/scraper/tests/unit/test_antibot_config.py` due to `ModuleNotFoundError: No module named 'lib.antibot'`.
- LSP diagnostics tool is unavailable in this environment because `basedpyright-langserver` is not discoverable by the LSP runtime, even though `basedpyright` is installed for the shell user.

## 2026-03-26 - Task 6 issues

- `bun run web build` is currently blocked by a pre-existing repo-wide type error in `apps/web/app/api/admin/pipeline/export-zip/route.ts:4` (`archiver` missing declaration file), so Task 6 verification relies on clean LSP diagnostics for changed files plus targeted retry-processor tests.

## 2026-03-26 - Task 7 issues

- `bun run build` is still blocked by the same unrelated `archiver` typing failure in `apps/web/app/api/admin/pipeline/export-zip/route.ts:4`, so Task 7 verification uses clean diagnostics, targeted Jest coverage, and a focused Playwright smoke test instead of a full production build.

## 2026-03-26 - Task 8 issues

- `bun run web build` remains blocked by the same pre-existing `archiver` declaration/type failure in `apps/web/app/api/admin/pipeline/export-zip/route.ts:4`; this is unrelated to Task 8 files.
- Workspace `bun run test -- <path>` currently ignores the path argument and executes a broad suite in this environment; targeted verification was run via direct Jest `--runTestsByPath` invocation.
