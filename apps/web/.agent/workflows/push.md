---
description: Review commits, fix issues, and push to remote
---

1. Review the list of commits that are waiting to be pushed.
   Command: `git log --oneline origin/main..HEAD`

2. Run type checking to ensure there are no TypeScript errors.
   Command: `npx tsc --noEmit`

3. Run linting to check for code quality issues.
   Command: `bun run lint`
   
   If linting fails, attempt to automatically fix issues:
   Command: `npx eslint --fix src`

4. Run unit tests to ensure no regressions.
   Command: `bun run test`

5. If any changes were made (e.g. lint fixes, test fixes), commit them.
   Command: `git status` 
   
   If there are modified files, add and commit them:
   Command: `git add . && git commit -m "chore: fixes from push workflow checks"`

6. If all checks pass, push the changes to the remote repository.
   Command: `git push`
