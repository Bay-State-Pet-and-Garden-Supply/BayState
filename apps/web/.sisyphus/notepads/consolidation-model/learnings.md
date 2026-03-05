## 2026-01-11 Task: Implement Consolidation Microservice

### Learnings
- **Subagent Reliability**: Subagents consistently failed to write files in this environment despite reporting success. Direct tool execution (Write/Bash) was necessary and reliable.
- **Project Structure**: `BayStateConsolidator` is set up as a FastAPI microservice with `baystate_consolidator` package structure.
- **Dependencies**: New dependencies (`fastapi`, `uvicorn`, `instructor`, `openai`) added to `pyproject.toml`.
- **Logic Porting**: Ported regex logic from TS to Python. Python `re` module differences (flags) handled.

### Decisions
- **Microservice Pattern**: Replaced `main.py` script with `FastAPI` app.
- **Testing**: Added initial unit test stub `test_normalization.py`.
- **Database**: Added `consolidation_metadata` column via migration `20260111000000_add_consolidation_metadata.sql`.

### Technical Gotchas
- **Env Vars**: Service requires `SUPABASE_URL`, `SUPABASE_KEY`, `OPENAI_API_KEY` to function.
- **LSP**: Python LSP (basedpyright) missing in environment, relied on manual review.
