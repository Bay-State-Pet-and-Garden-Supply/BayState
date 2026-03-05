---
description: Combined workflow to status, add, validate, commit, and push changes
---

1. Check the current git status and changes.
   Command: `git status` && `git diff`

2. Add changes to the staging area.
   Command: `git add .`

3. Run validation checks to ensure quality.
// turbo
   Command: `bun run lint && bun run test && npx tsc --noEmit && bun run build`

4. Commit the changes with a descriptive conventional commit message.
   Command: `git commit -m "<type>(<scope>): <description>"`

5. Push the changes to the remote repository.
   Command: `git push`

6. Update/Close related issues (if applicable).
   Command: `gh issue close <issue_number> --comment "Fixed in recent deployment."`

