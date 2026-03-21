# CONDUCTOR (AI Workflow Engine)

**Context:** Development workflow engine for AI-assisted programming with TDD, tracks, and checkpoints.

## OVERVIEW
Structured approach to AI-assisted development: plan → execute → verify. Enforces TDD, tracks progress across sessions, maintains context through checkpoints.

## STRUCTURE
```
conductor/
├── workflow.md       # MAIN: Complete workflow documentation
├── tracks.md         # Active development tracks
├── index.md          # Entry point
├── tech-stack.md     # Technology decisions
├── product.md        # Product guidelines
├── product-guidelines.md  # Detailed guidelines
└── code_styleguides/ # Language-specific guides
    ├── typescript.md
    └── python.md
```

## WORKFLOW
See `workflow.md` for complete process. Summary:

1. **Discovery** - Understand requirements, explore codebase
2. **Planning** - Create todos, define approach
3. **Execution** - TDD cycle: Red → Green → Refactor
4. **Verification** - Tests pass, lint clean, manual verify
5. **Checkpoint** - Save state for session continuity

## TRACKS
Active development tracks for parallel work:
- Defined in `tracks.md`
- Each track has: goal, status, blockers
- Can pause/resume across sessions

## CHECKPOINTS
Session state preservation:
- Git commit with summary
- Todo list snapshot
- Context notes in `tracks.md`

## CONVENTIONS
- **TDD Required**: Tests before implementation
- **Red → Green → Refactor**: Strict cycle
- **80% Coverage**: Minimum test coverage
- **No commits without tests**: Violation of workflow

## ANTI-PATTERNS
- **NO** code before failing tests
- **NO** skipping verification steps
- **NO** long-running branches without checkpoints
- **NO** mixing multiple tracks without clear separation

## COMMANDS
```bash
# Workflow adherence check
cat conductor/workflow.md | grep -A5 "Phase"

# Track status
cat conductor/tracks.md
```

## RELATED
- Parent: `../AGENTS.md` (workspace root)
- Workflow: `./workflow.md` (read this first)
