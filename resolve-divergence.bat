@echo off
echo ==========================================
echo Git Divergence Resolution - Windows Batch
echo ==========================================
echo.
echo Step 1: Check current status
git branch --show-current
git branch -vv
git status
echo.
echo Step 2: Check for conflicts
git ls-files --unmerged
git diff --check
echo.
echo Step 3: Show local commits (89 ahead)
git log origin/master..HEAD --oneline
echo.
echo ==========================================
echo Review the commits above.
echo Then run: git rebase -i origin/master
echo Then: git fetch origin && git merge origin/master
echo Then: git push origin master
echo ==========================================
pause
