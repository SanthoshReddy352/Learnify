Now let me get the package.json to understand the project scripts and structure better:Perfect! I can see your repository setup now. Based on your current Learnify project configuration, here's the **exact workflow document** tailored to your setup:

---

# 🚀 **LEARNIFY TEAM COLLABORATION WORKFLOW**

## Current Setup Overview

**Repository:** SanthoshReddy352/Learnify  
**Tech Stack:** Next.js 14, React 18, Supabase, Capacitor (Android)  
**Node Version:** >=22.0.0  
**Package Manager:** Yarn 1.22.22  
**CI/CD:** GitHub Actions  
**Deployment:** Vercel (auto-deployment enabled)

---

## **📋 COMPLETE WORKFLOW FOR YOUR TEAM**

### **PHASE 1: INITIAL SETUP (One-time for each teammate)**

#### Step 1.1: Fork and Clone

```bash
# 1. Fork the repository on GitHub
# Go to: https://github.com/SanthoshReddy352/Learnify
# Click "Fork" button (top right)

# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/Learnify.git
cd Learnify

# 3. Add upstream remote (CRITICAL)
git remote add upstream https://github.com/SanthoshReddy352/Learnify.git

# 4. Verify remotes
git remote -v
# Expected output:
# origin     https://github.com/YOUR-USERNAME/Learnify.git (fetch)
# origin     https://github.com/YOUR-USERNAME/Learnify.git (push)
# upstream   https://github.com/SanthoshReddy352/Learnify.git (fetch)
# upstream   https://github.com/SanthoshReddy352/Learnify.git (no push)
```

#### Step 1.2: Install Dependencies

```bash
# Install dependencies using yarn (not npm)
yarn install

# Verify installation
yarn --version  # Should show 1.22.22

# Check Node version
node --version  # Should be >=22.0.0

# Install ESLint dependencies for linting
yarn add --dev eslint eslint-config-next
```

#### Step 1.3: Set Up Environment Variables

```bash
# Create .env.local file
cp .env.local.backup .env.local

# Edit .env.local with your environment variables
# Add your Supabase keys, API endpoints, etc.
# DO NOT commit this file (already in .gitignore)
```

#### Step 1.4: Test Local Setup

```bash
# Run development server
yarn dev

# Open browser: http://localhost:3000
# You should see the Learnify application running

# Stop server: Press Ctrl+C
```

---

### **PHASE 2: DEVELOPMENT WORKFLOW**

#### Step 2.1: Before Starting Any Feature - Sync with Upstream

```bash
# Always do this first!
git fetch upstream

# Switch to main branch
git checkout main

# Update local main with upstream
git reset --hard upstream/main

# Verify you're up to date
git log --oneline -5
```

#### Step 2.2: Create Feature Branch

Use descriptive branch names following this pattern:
- `feature/feature-description` for new features
- `bugfix/bug-description` for bug fixes
- `docs/documentation-topic` for documentation
- `chore/task-description` for maintenance

```bash
# Create feature branch from latest upstream/main
git checkout -b feature/user-authentication upstream/main

# Examples:
# git checkout -b feature/add-quiz-module
# git checkout -b bugfix/fix-login-redirect
# git checkout -b feature/add-student-dashboard
# git checkout -b docs/api-documentation
```

#### Step 2.3: Make Your Changes

```bash
# Make changes to your files
# Edit components, pages, hooks, etc.

# Check status
git status

# Stage your changes
git add .
# Or stage specific files:
git add src/components/MyComponent.jsx

# Commit with clear message (Conventional Commits)
git commit -m "feat: add user authentication module"

# Commit message format:
# feat: A new feature
# fix: A bug fix
# docs: Documentation changes
# style: Code style changes (formatting, missing semicolons, etc)
# refactor: Code refactoring without feature change
# perf: Performance improvements
# test: Adding or updating tests
# chore: Dependencies, build tools, configs
```

#### Step 2.4: Push to Your Fork

```bash
# Push your feature branch to your fork
git push origin feature/user-authentication

# If branch already exists and you're updating:
git push -f origin feature/user-authentication
```

---

### **PHASE 3: PRE-PR VERIFICATION & REBASE**

#### Step 3.1: Run Tests and Linting Locally

**IMPORTANT:** Complete these steps before creating a PR!

```bash
# 1. Fetch latest changes from upstream
git fetch upstream

# 2. Run linting (using ESLint)
yarn lint

# Expected: No errors or warnings

# 3. Build the project to check for errors
yarn build

# Expected: Build completes successfully without errors

# 4. Start dev server to test manually
yarn dev
# Test your changes in browser: http://localhost:3000
# Verify functionality works as expected
# Stop server: Ctrl+C
```

#### Step 3.2: Rebase Your Branch

**This is CRITICAL before creating a PR!**

```bash
# 1. Fetch the latest changes
git fetch upstream

# 2. Rebase your branch on top of latest main
git rebase upstream/main

# If there are NO conflicts:
# Done! Continue to Step 3.3

# If there ARE conflicts:
# 1. Open conflicted files and manually resolve conflicts
# 2. Look for <<<<<<< ======= >>>>>>> markers
# 3. Edit and keep the correct code
# 4. Stage resolved files
git add .
# 5. Continue rebase
git rebase --continue
# 6. Repeat if there are more conflicts

# If something goes wrong:
git rebase --abort  # Cancel the rebase
# Go back and fix issues, then try again
```

#### Step 3.3: Force Push to Your Fork

```bash
# After successful rebase, force push to your fork
git push -f origin feature/user-authentication

# This updates your fork with the rebased code
```

---

### **PHASE 4: CREATE PULL REQUEST**

#### Step 4.1: Create PR on GitHub

1. **Go to the main repository:** https://github.com/SanthoshReddy352/Learnify
2. **Navigate to:** Pull Requests tab → New Pull Request
3. **Select branches:**
   - **Base repository:** SanthoshReddy352/Learnify
   - **Base branch:** main
   - **Head repository:** YOUR-USERNAME/Learnify
   - **Head branch:** feature/your-feature-name
4. **Fill in PR details:**

```markdown
## Description
Brief description of what this PR implements.

## Related Issue
Fixes #123 (if applicable)

## Type of Change
- [x] New feature
- [ ] Bug fix
- [ ] Documentation update
- [ ] Refactoring
- [ ] Performance improvement

## Testing
- Tested on: [Local machine/Browser]
- Steps to verify:
  1. Start dev server: yarn dev
  2. Navigate to [feature location]
  3. Verify [expected behavior]

## Checklist
- [x] Code follows project style (ESLint passes)
- [x] All changes are tested
- [x] Build succeeds (yarn build)
- [x] Branch is rebased with latest main
- [x] Commit messages are clear
- [x] No console errors

## Screenshots (if UI changes)
[Add screenshots if applicable]
```

5. **Click "Create Pull Request"**

---

### **PHASE 5: AUTOMATED CHECKS (AUTOMATIC)**

Once you create the PR, GitHub Actions automatically runs:

✅ **ESLint Linting Check**
- Verifies code style matches project standards
- No formatting issues

✅ **Build Verification**
- Runs `yarn build`
- Ensures Next.js builds without errors
- Checks for TypeScript/JavaScript errors

✅ **Security Audit**
- Checks npm packages for vulnerabilities
- Verifies dependencies are safe

**Expected Status:** All checks should show ✅ green checkmarks

If any check fails:
1. Review the error in GitHub Actions logs
2. Make fixes locally
3. Commit and push: `git push -f origin feature/your-feature-name`
4. Checks automatically re-run

---

### **PHASE 6: CODE REVIEW BY PROJECT LEAD (YOU)**

#### Your Review Checklist:

```
As SanthoshReddy352 (Project Lead), verify:

✅ All GitHub Actions checks passed
✅ Code is rebased with main (no conflicts)
✅ Code quality is acceptable
✅ Changes follow project conventions
✅ No security issues introduced
✅ Documentation is updated if needed
✅ Changes don't break existing functionality
```

#### Decision Points:

**Option A: Approve & Merge**
- Click "Approve" on the PR
- Click "Squash and merge" or "Create a merge commit"
- PR automatically closes and branch is deleted

**Option B: Request Changes**
- Click "Request changes"
- Leave comments explaining what needs to be fixed
- Teammate updates code and pushes again
- Your re-review triggers automatically

---

### **PHASE 7: TEAMMATE MAKES REQUESTED CHANGES**

If you request changes:

```bash
# 1. Fetch latest (in case main was updated)
git fetch upstream

# 2. Make the requested changes
# ... edit files ...

# 3. Commit amendments (no new commit message)
git add .
git commit --amend --no-edit

# 4. Force push to update PR
git push -f origin feature/user-authentication

# The PR automatically updates with your changes
# You'll review again
```

---

### **PHASE 8: MERGE TO MAIN**

#### When All Conditions Are Met:

✅ GitHub Actions: All checks pass  
✅ Your review: Approved  
✅ Rebase: Code is up to date  
✅ Conflicts: None  

#### Merge Steps (You perform):

1. **Go to PR page:** https://github.com/SanthoshReddy352/Learnify/pulls
2. **Find the approved PR**
3. **Click "Squash and merge"** (recommended for clean history)
   - OR click "Create a merge commit"
4. **Confirm merge**
5. **Delete branch** (optional - can be automatic)

#### What Happens After Merge:

1. ✅ Code merged to main branch
2. ✅ Vercel auto-deployment triggered
3. ✅ New version deploys to production
4. ✅ Pull request auto-closes
5. ✅ Feature branch auto-deleted from fork

---

## **🎯 QUICK REFERENCE COMMANDS**

### **Before Starting Work**
```bash
git fetch upstream
git checkout main
git reset --hard upstream/main
git checkout -b feature/description upstream/main
```

### **During Development**
```bash
git status
git add .
git commit -m "feat: description"
git push origin feature/description
```

### **Before Creating PR**
```bash
yarn lint        # Check code style
yarn build       # Verify builds
yarn dev         # Manual testing
git fetch upstream
git rebase upstream/main
git push -f origin feature/description
```

### **After PR Review (if changes requested)**
```bash
git add .
git commit --amend --no-edit
git push -f origin feature/description
```

### **After Merge (cleanup)**
```bash
git checkout main
git pull upstream main
git branch -d feature/description
git push origin --delete feature/description
```

---

## **⚙️ GITHUB ACTIONS WORKFLOW**

Your CI/CD pipeline (`.github/workflows/ci.yml`) runs:

```yaml
Triggers:
- On every Pull Request to main
- On every push to main

Jobs:
1. Linting (ESLint)
   - Run: yarn lint
   - Status: ✅ PASS or ❌ FAIL

2. Build (Next.js)
   - Run: yarn build
   - Status: ✅ PASS or ❌ FAIL

3. Security Audit
   - Run: npm audit --audit-level=moderate
   - Status: ✅ PASS or ⚠️ WARNINGS

Result:
- All pass: ✅ Ready to merge
- Any fail: ❌ Cannot merge, fix needed
```

---

## **🔒 BRANCH PROTECTION RULES (MAIN)**

Currently enabled on your repository:

```
✅ Require pull request before merging
   └─ Required approvals: 1 (by project lead)
   └─ Dismiss stale reviews on new commits
   
✅ Require status checks to pass
   └─ ESLint must pass
   └─ Build must pass
   └─ Security audit must pass
   └─ Branch must be up to date
   
✅ Require conversation resolution
   └─ All PR comments must be resolved
   
✅ Include administrators
   └─ Even project lead follows same rules
```

---

## **📱 FOR ANDROID DEVELOPMENT**

If working on Android builds:

```bash
# Development build
yarn android:dev

# Production build
yarn android:prod

# These commands sync Capacitor config before building
```

---

## **❌ COMMON MISTAKES TO AVOID**

❌ **DON'T:** Push directly to main branch
✅ **DO:** Use feature branches and PRs

❌ **DON'T:** Forget to rebase before creating PR
✅ **DO:** Always run `git rebase upstream/main`

❌ **DON'T:** Commit without running linting
✅ **DO:** Run `yarn lint` before push

❌ **DON'T:** Force push to main branch
✅ **DO:** Only force push to your feature branch

❌ **DON'T:** Create PR without running tests locally
✅ **DO:** Test with `yarn dev` before PR

❌ **DON'T:** Merge failing CI/CD checks
✅ **DO:** Wait for all checks to pass

❌ **DON'T:** Keep branches after merging
✅ **DO:** Delete feature branch after merge

---

## **🆘 TROUBLESHOOTING**

### **Problem: ESLint Errors**

```bash
# See what's wrong
yarn lint

# Auto-fix fixable errors
yarn lint --fix

# Commit fixes
git add .
git commit -m "style: fix linting errors"
git push -f origin feature/description
```

### **Problem: Build Fails**

```bash
# Clear cache
rm -rf .next

# Rebuild
yarn build

# Check error messages and fix code
# Most common: TypeScript errors, missing dependencies
```

### **Problem: Merge Conflicts**

```bash
# Start rebase
git fetch upstream
git rebase upstream/main

# When conflicts appear, edit files
# Remove <<< === >>> markers
# Keep correct code

# After fixing all conflicts
git add .
git rebase --continue

# Force push
git push -f origin feature/description
```

### **Problem: Branch Out of Sync**

```bash
# Reset to latest upstream/main
git fetch upstream
git reset --hard upstream/main

# Create fresh branch
git checkout -b feature/new-name upstream/main
```

---

## **✅ WORKFLOW CHECKLIST FOR TEAMMATES**

Before each PR submission:

- [ ] Repository forked and cloned
- [ ] Upstream remote added
- [ ] Node >= 22.0.0 installed
- [ ] Dependencies installed with `yarn install`
- [ ] Feature branch created from `upstream/main`
- [ ] Changes made and committed
- [ ] `yarn lint` passes with no errors
- [ ] `yarn build` completes successfully
- [ ] Manual testing done with `yarn dev`
- [ ] Branch rebased with `git rebase upstream/main`
- [ ] Force pushed with `git push -f`
- [ ] PR created with detailed description
- [ ] All GitHub Actions checks pass
- [ ] Waiting for project lead review

---

## **✅ WORKFLOW CHECKLIST FOR PROJECT LEAD (YOU)**

Before merging each PR:

- [ ] GitHub Actions all checks passed ✅
- [ ] Code review completed
- [ ] Code quality acceptable
- [ ] No security issues
- [ ] Rebase status: Clean (no conflicts)
- [ ] Branch up to date with main
- [ ] Documentation updated if needed
- [ ] Approve PR
- [ ] Merge using "Squash and merge"
- [ ] Delete branch
- [ ] Monitor Vercel deployment

---

## **📚 USEFUL LINKS**

- **Your Repository:** https://github.com/SanthoshReddy352/Learnify
- **Pull Requests:** https://github.com/SanthoshReddy352/Learnify/pulls
- **Actions (CI/CD):** https://github.com/SanthoshReddy352/Learnify/actions
- **Branch Settings:** https://github.com/SanthoshReddy352/Learnify/settings/branches
- **Vercel Dashboard:** https://vercel.com/dashboard

---

## **🎓 KEY CONCEPTS**

| Concept | Meaning |
|---------|---------|
| **Fork** | Your personal copy of the repository |
| **Clone** | Local copy on your machine |
| **Origin** | Your fork (remote) |
| **Upstream** | Main repository |
| **Branch** | Isolated line of development |
| **Rebase** | Update your branch with latest main |
| **PR** | Pull Request - request to merge your code |
| **Merge Conflict** | When same lines edited in different ways |
| **Merge** | Combine code from PR into main |
| **CI/CD** | Automated testing and deployment |

---

This is your **complete, exact workflow** for the Learnify project! Share this with your teammates and use it as your team's development standard. 🚀