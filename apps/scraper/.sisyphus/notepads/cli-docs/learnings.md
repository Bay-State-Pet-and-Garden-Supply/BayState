# CLI Documentation - Learnings

## Task: CLI Documentation and Help

**Completed:** April 2026

### Files Created

1. **apps/scraper/docs/cli.md** (514 lines)
   - Complete CLI command reference
   - Installation instructions
   - All commands documented with flags and examples
   - Environment variables reference
   - Troubleshooting guide

2. **apps/scraper/docs/cli-examples.md** (869 lines)
   - 26 practical usage examples
   - Copy-paste ready commands
   - Configuration examples
   - Advanced scenarios (CI/CD, profiling, etc.)

### Key Findings

#### CLI Structure
- Main CLI: `bsr` command with subcommands
  - `bsr batch` - Test product batches locally
  - `bsr cohort` - Visualize and manage cohorts
  - `bsr benchmark` - Benchmark extraction strategies
- Runner CLI: Direct Python runner execution
  - Modes: full, chunk_worker, realtime
  - Local mode for testing without API

#### Documentation Patterns Used
- Clear section hierarchy with table of contents
- Tables for flag/option reference
- Code blocks with syntax highlighting
- Copy-paste friendly examples
- Troubleshooting with symptoms and solutions

#### Coverage
- All major CLI commands documented
- Environment variables fully listed
- Configuration options explained
- 26 real-world examples provided
- Error scenarios covered in troubleshooting

### Validation
- All required sections present
- 26 examples covering diverse use cases
- No duplicate content (cross-references to existing docs)
- Examples match actual CLI behavior from codebase
