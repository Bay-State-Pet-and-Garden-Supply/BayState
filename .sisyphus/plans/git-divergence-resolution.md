# Work Plan: Resolve Git Divergence (144 Behind, 89 Ahead)

## TL;DR

> **Objective**: Synchronize local branch with remote (144 commits behind, 89 commits ahead)
>
> **Strategy**: Merge approach with commit cleanup
>
> **Key Insight**: The 144/89 numbers show **divergence**, not necessarily **conflicts**. Conflicts only occur if the same files were modified in both sets of commits.
>
> **Estimated Effort**: Medium (30-60 minutes depending on conflicts)
>
> **Parallel Execution**: NO — Git operations must be sequential
>
> **Critical Path**: Identify branch → Set upstream → Review commits → Merge → Resolve conflicts (if any) → Push

---

## Context

### Current State
- **Repository**: `C:\Users\thoma\OneDrive\Desktop\scripts\BayState`
- **Divergence**: 144 commits behind remote, 89 commits ahead
- **Upstream**: NOT set (`NO_UPSTREAM`)
- **Branch Type**: Feature branch (not main/master)
- **Working Directory**: Clean (no uncommitted changes)
- **Collaboration**: Solo work (no one else on this branch)

### User Decisions
1. **Strategy**: MERGE (safer, creates merge commit)
2. **Local commits**: Mixed importance — review and squash WIP commits
3. **Collaboration**: Solo — safe to rewrite history

### The Core Issue
The branch lacks upstream tracking. VS Code detects divergence (144 behind, 89 ahead) but git can't resolve the remote branch because the tracking relationship isn't configured. This is a configuration issue, not a code issue.

---

## Work Objectives

### Core Objective
Synchronize the local branch with remote by merging 144 remote commits and cleaning up 89 local commits, resulting in a clean merge commit pushed to remote.

### Concrete Deliverables
1. Upstream tracking properly configured
2. Local commits reviewed and WIP commits squashed (89 → ~10-20 meaningful commits)
3. Clean merge commit combining local and remote history
4. Zero conflicts remaining
5. Branch synchronized (0 ahead, 0 behind)

### Definition of Done
- [ ] `git branch -vv` shows upstream with `[ahead 0, behind 0]`
- [ ] All commits are on remote
- [ ] No merge conflicts present
- [ ] Working directory clean

### Must Have
- [ ] Identify current branch name
- [ ] Set upstream tracking
- [ ] Review 89 local commits
- [ ] Execute merge
- [ ] Push to remote

### Must NOT Have (Guardrails)
- **NO force push without explicit confirmation** — even though solo, safer to verify
- **NO deletion of meaningful commits** — review before squashing
- **NO merge if >50 conflicts** — stop and reassess strategy
- **NO automatic resolution of conflicts** — user review required for complex conflicts

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (this is git operations, not code testing)
- **Automated tests**: N/A
- **Agent-Executed QA**: YES — every task includes verification commands

### QA Policy
Every task includes specific git commands to verify state. No human intervention required for verification.

---

## Execution Strategy

### Sequential Execution (Git operations cannot be parallelized)

```
Wave 1 (Foundation — must complete first):
├── Task 1: Identify current branch and set upstream
└── Task 2: Analyze potential merge conflicts

Wave 2 (History cleanup — depends on Wave 1):
├── Task 3: Review and categorize 89 local commits
└── Task 4: Squash WIP commits (interactive rebase)

Wave 3 (Merge execution — depends on Wave 2):
├── Task 5: Fetch and merge 144 remote commits
└── Task 6: Resolve any merge conflicts

Wave 4 (Finalization — depends on Wave 3):
├── Task 7: Push merged result to remote
└── Task 8: Verify synchronization
```

### Dependency Matrix

- **T1**: — → T2, T3
- **T2**: T1 → T5
- **T3**: T1 → T4
- **T4**: T3 → T5
- **T5**: T2, T4 → T6
- **T6**: T5 → T7
- **T7**: T6 → T8
- **T8**: T7 → —

### Critical Path
T1 → T3 → T4 → T5 → T6 → T7 → T8

---

## TODOs


- [ ] **Task 1: Identify Current Branch and Set Upstream Tracking**

  **What to do**:
  1. Run `git branch --show-current` to identify the current branch name
  2. Run `git remote -v` to confirm remote is `origin`
  3. Set upstream tracking: `git branch --set-upstream-to origin/<branch-name>`
  4. Verify: `git branch -vv` should show `[ahead 89, behind 144]` next to current branch

  **Must NOT do**:
  - Do not guess the branch name — must confirm first
  - Do not proceed if upstream already set to different remote

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Required for git operations and upstream configuration

  **Parallelization**:
  - **Can Run In Parallel**: NO — must complete before any other git operations
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] Current branch name identified
  - [ ] Upstream set to `origin/<branch-name>`
  - [ ] `git branch -vv` shows `[ahead 89, behind 144]`
  - [ ] No errors in command output

  **QA Scenarios**:
  ```
  Scenario: Verify upstream is set correctly
    Tool: Bash
    Steps:
      1. Run: git branch -vv
      2. Look for pattern: * <branch-name> [origin/<branch-name>: ahead 89, behind 144]
    Expected Result: Output contains the branch with ahead/behind count
    Evidence: .sisyphus/evidence/task-1-upstream-verified.txt
  ```

  **Evidence to Capture**:
  - [ ] Output of `git branch -vv`
  - [ ] Output of `git remote -v`

  **Commit**: NO (no code changes)

- [ ] **Task 2: Analyze Potential Merge Conflicts**

  **What to do**:
  1. Fetch remote without merging: `git fetch origin`
  2. Check if any files are in unmerged state: `git ls-files --unmerged`
  3. Check for existing conflict markers: `git diff --check`
  4. Preview what would conflict: `git merge-tree $(git merge-base HEAD origin/<branch-name>) HEAD origin/<branch-name>`
  5. If conflicts detected, list the conflicting files

  **Must NOT do**:
  - Do not actually merge yet
  - Do not modify any files during analysis

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Expertise in merge analysis and conflict detection

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 1
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] Fetch completed successfully
  - [ ] `git ls-files --unmerged` returns empty (no current conflicts)
  - [ ] List of potentially conflicting files identified (if any)
  - [ ] Decision documented: CONFLICTS EXPECTED / NO CONFLICTS EXPECTED

  **QA Scenarios**:
  ```
  Scenario: Check for existing conflicts
    Tool: Bash
    Steps:
      1. Run: git ls-files --unmerged
      2. Run: git diff --check
    Expected Result: Both commands return empty/no output
    Failure Indicators: Any file paths listed = existing conflicts
    Evidence: .sisyphus/evidence/task-2-conflict-analysis.txt
  ```

  **Evidence to Capture**:
  - [ ] Output of `git ls-files --unmerged`
  - [ ] Output of merge-tree analysis (conflict preview)
  - [ ] List of files that would conflict (if any)

  **Commit**: NO (analysis only)

- [ ] **Task 3: Review and Categorize 89 Local Commits**

  **What to do**:
  1. List all 89 local commits: `git log origin/<branch-name>..HEAD --oneline`
  2. Categorize each commit:
     - **KEEP**: Meaningful, standalone work
     - **SQUASH**: WIP, fixup, "temp", "debug" commits
     - **REVIEW**: Unclear purpose, need user input
  3. Create a list of commits to squash together (logical groups)
  4. Count: KEEP (target ~10-20), SQUASH (will combine), REVIEW (flag for user)

  **Must NOT do**:
  - Do not squash yet — just categorize
  - Do not delete any commits — only mark for squashing
  - Do not reorganize history — only identify what needs squashing

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Expertise in git log analysis and commit history review

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 1
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **Acceptance Criteria**:
  - [ ] All 89 commits reviewed and categorized
  - [ ] List of commits to KEEP documented
  - [ ] Groups of commits to SQUASH together identified
  - [ ] Any REVIEW items flagged for user

  **QA Scenarios**:
  ```
  Scenario: Count local commits
    Tool: Bash
    Steps:
      1. Run: git log origin/<branch-name>..HEAD --oneline | wc -l
    Expected Result: Returns 89
    Evidence: .sisyphus/evidence/task-3-commit-count.txt
  
  Scenario: Review commit messages
    Tool: Bash
    Steps:
      1. Run: git log origin/<branch-name>..HEAD --oneline
      2. Identify WIP/fixup/temp/debug commits
    Expected Result: List of commits with categories
    Evidence: .sisyphus/evidence/task-3-commit-categories.txt
  ```

  **Evidence to Capture**:
  - [ ] Full list of 89 commits
  - [ ] Categorization (KEEP/SQUASH/REVIEW)
  - [ ] Squash groups identified

  **Commit**: NO (analysis only)

- [ ] **Task 4: Squash WIP Commits via Interactive Rebase**

  **What to do**:
  1. Identify merge base: `git merge-base HEAD origin/<branch-name>`
  2. Start interactive rebase from merge base: `git rebase -i <merge-base>`
  3. Mark commits for squashing:
     - Change `pick` to `squash` (or `s`) for WIP commits
     - Keep `pick` for meaningful commits
     - Group related WIP commits together
  4. Edit commit messages for squashed commits (combine meaningfully)
  5. Handle any rebase conflicts if they occur

  **Must NOT do**:
  - Do not squash meaningful commits — only WIP/temp/debug
  - Do not reorder commits unnecessarily
  - Do not force push yet — wait until after merge

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Essential for interactive rebase operations

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 3
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **Acceptance Criteria**:
  - [ ] Rebase completed successfully
  - [ ] 89 commits reduced to ~10-20 meaningful commits
  - [ ] No WIP/temp/debug commits remaining as separate commits
  - [ ] Clean history with logical commit messages

  **QA Scenarios**:
  ```
  Scenario: Verify commit count after squash
    Tool: Bash
    Steps:
      1. Run: git log origin/<branch-name>..HEAD --oneline | wc -l
    Expected Result: Returns ~10-20 (significantly less than 89)
    Evidence: .sisyphus/evidence/task-4-post-squash-count.txt
  
  Scenario: Check no WIP commits remain
    Tool: Bash
    Steps:
      1. Run: git log origin/<branch-name>..HEAD --oneline | grep -i "wip\|temp\|debug\|fixup"
    Expected Result: Returns empty (no WIP commits)
    Evidence: .sisyphus/evidence/task-4-no-wip.txt
  ```

  **Evidence to Capture**:
  - [ ] Pre-rebase commit count (89)
  - [ ] Post-rebase commit count (~10-20)
  - [ ] New commit history

  **Commit**: NO (history rewrite, no new commit)

---
- [ ] **Task 5: Fetch and Merge 144 Remote Commits**

  **What to do**:
  1. Ensure working directory is clean: `git status`
  2. Fetch latest from remote: `git fetch origin`
  3. Merge remote branch into local: `git merge origin/<branch-name>`
  4. If merge succeeds without conflicts: done
  5. If conflicts occur: document them and proceed to Task 6

  **Must NOT do**:
  - Do not use `--no-ff` unless you want to force a merge commit (git may fast-forward)
  - Do not use rebase here — user chose merge strategy
  - Do not resolve conflicts blindly — document first

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Required for merge operations

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 2 and Task 4
  - **Blocks**: Task 6
  - **Blocked By**: Task 2, Task 4

  **Acceptance Criteria**:
  - [ ] Fetch completed successfully
  - [ ] Merge initiated
  - [ ] Either: Clean merge OR Conflicts documented

  **QA Scenarios**:
  ```
  Scenario: Verify merge in progress
    Tool: Bash
    Steps:
      1. Run: git status
    Expected Result: Shows "merge in progress" OR "nothing to commit"
    Evidence: .sisyphus/evidence/task-5-merge-status.txt
  ```

  **Evidence to Capture**:
  - [ ] Output of `git status` after merge
  - [ ] List of conflicting files (if any)

  **Commit**: NO (merge creates its own commit)

- [ ] **Task 6: Resolve Merge Conflicts (If Any)**

  **What to do**:
  1. List conflicting files: `git status`
  2. For each conflicting file:
     - Open file and identify conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
     - Understand both versions (HEAD vs incoming)
     - Decide correct resolution (keep one, combine, or rewrite)
     - Remove conflict markers
     - Stage resolved file: `git add <file>`
  3. After all conflicts resolved, complete merge: `git commit`
  4. Verify: `git status` shows clean working directory

  **Must NOT do**:
  - Do not use `git checkout --theirs` or `--ours` blindly — understand the change
  - Do not resolve binary conflicts without user input
  - Do not proceed if >50 conflicts — stop and reassess

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Essential for conflict resolution

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 5
  - **Blocks**: Task 7
  - **Blocked By**: Task 5

  **Acceptance Criteria**:
  - [ ] All conflict files identified
  - [ ] Each conflict resolved and staged
  - [ ] Merge completed with commit
  - [ ] `git status` shows clean working directory

  **QA Scenarios**:
  ```
  Scenario: Verify no conflicts remain
    Tool: Bash
    Steps:
      1. Run: git ls-files --unmerged
      2. Run: git diff --check
    Expected Result: Both return empty
    Evidence: .sisyphus/evidence/task-6-conflicts-resolved.txt
  
  Scenario: Verify merge completed
    Tool: Bash
    Steps:
      1. Run: git log --oneline -1
      2. Check for "Merge" in message
    Expected Result: Shows merge commit at top
    Evidence: .sisyphus/evidence/task-6-merge-commit.txt
  ```

  **Evidence to Capture**:
  - [ ] List of resolved conflicts
  - [ ] Output of `git status` after resolution
  - [ ] Merge commit hash

  **Commit**: YES — merge commit (automatically created)

- [ ] **Task 7: Push Merged Result to Remote**

  **What to do**:
  1. Verify local state: `git branch -vv`
  2. Push to remote: `git push origin <branch-name>`
  3. Verify push succeeded
  4. Check status: `git branch -vv` should show `[ahead 0, behind 0]`

  **Must NOT do**:
  - Do not use `--force` or `--force-with-lease` unless necessary
  - Do not push if `git status` shows uncommitted changes

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Required for push operations

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 6
  - **Blocks**: Task 8
  - **Blocked By**: Task 6

  **Acceptance Criteria**:
  - [ ] Push command executed successfully
  - [ ] No errors in output
  - [ ] Local commits are now on remote

  **QA Scenarios**:
  ```
  Scenario: Verify push succeeded
    Tool: Bash
    Steps:
      1. Run: git branch -vv
    Expected Result: Shows [ahead 0] (no longer ahead)
    Evidence: .sisyphus/evidence/task-7-push-verified.txt
  ```

  **Evidence to Capture**:
  - [ ] Push command output
  - [ ] `git branch -vv` after push

  **Commit**: NO (push only, no new commit)

- [ ] **Task 8: Verify Full Synchronization**

  **What to do**:
  1. Fetch latest: `git fetch origin`
  2. Check branch status: `git branch -vv`
  3. Verify: `[ahead 0, behind 0]`
  4. Check log: `git log --oneline --graph -5`
  5. Verify merge commit is present

  **Must NOT do**:
  - Skip verification — this confirms everything worked

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]
    - `git-master`: Required for verification

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 7
  - **Blocks**: —
  - **Blocked By**: Task 7

  **Acceptance Criteria**:
  - [ ] `git branch -vv` shows `[ahead 0, behind 0]`
  - [ ] `git status` shows clean working directory
  - [ ] Merge commit visible in log
  - [ ] Local and remote are synchronized

  **QA Scenarios**:
  ```
  Scenario: Final synchronization check
    Tool: Bash
    Steps:
      1. Run: git fetch origin
      2. Run: git branch -vv
    Expected Result: Shows [ahead 0, behind 0]
    Evidence: .sisyphus/evidence/task-8-final-sync.txt
  
  Scenario: Verify clean state
    Tool: Bash
    Steps:
      1. Run: git status
    Expected Result: "nothing to commit, working tree clean"
    Evidence: .sisyphus/evidence/task-8-clean-state.txt
  ```

  **Evidence to Capture**:
  - [ ] Final `git branch -vv` output
  - [ ] Final `git status` output
  - [ ] `git log --oneline --graph -5` output

  **Commit**: NO (verification only)

---

## Final Verification Wave

> Run after ALL implementation tasks complete

- [ ] **F1. Plan Compliance Audit** — `oracle`
  Verify all TODOs completed: upstream set, commits cleaned, merge done, conflicts resolved, pushed. Check evidence files exist.
  Output: `Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] **F2. Git State Verification** — `quick` (+ `git-master` skill)
  Run `git status`, `git branch -vv`, `git log --oneline -3`. Verify: clean working directory, [ahead 0, behind 0], merge commit present.
  Output: `Git State [VERIFIED/ISSUES]`

- [ ] **F3. Remote Synchronization Check** — `quick` (+ `git-master` skill)
  Run `git fetch origin` then `git branch -vv`. Verify remote and local are synchronized.
  Output: `Sync [YES/NO]`

---

## Commit Strategy

- **Commits per task**: N/A (this is git operations, not code commits)
- **Final merge commit**: Will be created automatically by git merge

---

## Success Criteria

### Verification Commands
```bash
git branch -vv  # Expected: [ahead 0, behind 0]
git status      # Expected: "nothing to commit, working tree clean"
git log --oneline --graph -5  # Expected: Shows merge commit at top
```

### Final Checklist
- [ ] All tasks completed
- [ ] Upstream properly configured
- [ ] 89 local commits cleaned up (squashed WIP commits)
- [ ] 144 remote commits merged
- [ ] Zero merge conflicts remaining
- [ ] Branch synchronized (0 ahead, 0 behind)
- [ ] Evidence files captured for all QA scenarios
