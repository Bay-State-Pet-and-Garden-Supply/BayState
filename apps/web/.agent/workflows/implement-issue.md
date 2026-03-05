---
description: How to use GitHub CLI to fetch and resolve project issues
---

# GitHub Issue Resolution Workflow

Follow these steps to triage and resolve issues using the GitHub CLI (`gh`).

## 1. Issue Identification
Fetch the list of open issues. Then, **ASK THE USER** to select an issue ID before proceeding.
// turbo
```bash
gh issue list --limit 10
```

## 2. Issue Analysis
Select an issue ID and retrieve its full context, including labels and comments.
```bash
gh issue view <issue_number>
```

## 3. Triage & Reproduction
- Search the codebase for keywords mentioned in the issue.
- If it's a bug, attempt to reproduce it with a unit test (`vitest`) or by examining the code logic.
- Reference `GEMINI.md` for project architecture and styling rules.

## 4. Implementation
Apply the necessary code changes. Ensure you:
- Follow the "Constructed Cyber-Dark" design system.
- Maintain strict TypeScript safety.
- Keep components focused and reusable.

## 5. Verification
Before submitting, you MUST ensure the project still builds and passes all checks.
// turbo
```bash
bun --bun next build && npm run lint && vitest run
```

## 6. Submission
Commit the changes using Conventional Commits. You may also create a Pull Request if the project structure requires it.
```bash
git add .
git commit -m "fix: resolve issue #<issue_number> - <short_description>"
# Optional: gh pr create --title "fix: #<issue_number> <issue_title>" --body "Closes #<issue_number>. <detailed_summary>"
```

## 7. Issue Resolution
After submitting the changes, close the issue using the GitHub CLI.
```bash
gh issue close <issue_number> --comment "Resolved in commit <commit_hash>"
```

