# AI Scraper Prompts

This directory contains versioned prompt templates for the AI scraping framework. Prompts are externalized from hardcoded Python strings to enable iteration, testing, and finetuning.

## Purpose

- Store LLM prompts as versioned text files
- Enable A/B testing of different prompt versions
- Support prompt iteration without code changes
- Provide audit trail for prompt changes via git

## Versioning Scheme

Prompts use semantic versioning: `v1/`, `v2/`, etc.

- **v1/** - Initial prompt version (baseline)
- **v2/** - Improvements based on testing
 versions indicate iterative refinement

Each version directory- Higher contains:
- `system.txt` - System prompt for the LLM
- `user.txt` - User prompt template (may include templating variables)

## Adding New Prompt Versions

1. Create new version directory: `v{N}/` where N is next sequential number
2. Copy prompts from previous version
3. Modify prompt text for the new version
4. Update this README to document changes
5. Test the new prompts before deploying
6. Commit with descriptive message: `feat(prompts): add v{N} prompt version`

## Finetuning

For prompt finetuning guidance and experimentation, see the [Finetuning Playbook](../docs/finetuning-playbook.md).

## Directory Structure

```
prompts/
├── README.md           # This file
├── v1/
│   ├── system.txt     # System prompt
.txt       # User prompt
├── v│   └── user2/
│   ├── system.txt
│   └── user.txt
└── ...
```
