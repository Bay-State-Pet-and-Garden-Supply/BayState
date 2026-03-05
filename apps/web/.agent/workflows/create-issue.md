---
description: Create a new GitHub issue using the gh CLI
---

1. Run `gh --version` to ensure the GitHub CLI is installed.
2. Run `gh auth status` to ensure the user is logged in.
3. Ask the user to describe the issue they want to create (if they haven't already).
4. Based on the user's input and context, generate a clear and concise title and a detailed body for the issue.
5. Propose the `gh issue create` command to the user.
   - Use `--title "Your Generated Title"`
   - Use `--body "Your Generated Body"`
   - Add `--label "bug"`, `--label "feature"`, etc., if valid/appropriate.
