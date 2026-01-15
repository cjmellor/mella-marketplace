---
name: commit
description: Create git commits with optional intelligent grouping, push, and PR creation
argument-hint: "[group] [pr] [push [branch]]"
allowed-tools: [Bash, Read, Grep, Glob, AskUserQuestion]
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "[ -f vendor/bin/pint ] && vendor/bin/pint --dirty || true"
          once: true
---

# Commit Command

Create git commits with optional intelligent grouping of changes.

## Usage

- `/mella:commit` - Standard commit (like /commit-commands:commit)
- `/mella:commit group` - Analyze and group changes into logical commits
- `/mella:commit pr` - Commit and use existing PR (or ask to create one)
- `/mella:commit push` - Commit and push to current branch
- `/mella:commit push origin/feature-branch` - Commit and push to specific branch
- `/mella:commit group pr push` - Combine all options

## Instructions for Claude

When this command is executed, follow these steps based on the arguments:

### Argument Parsing

Check `$ARGUMENTS` for the following flags:
- `group` - Enable intelligent grouping of commits
- `pr` - Handle pull request (check if exists, or ask to create)
- `push` - Push commits after creating them (optionally to a specific branch)

Parse the branch name for `push` by extracting any argument that comes after the word "push" in `$ARGUMENTS`.

### Standard Mode (no arguments)

If no arguments provided, execute the standard commit workflow:

1. Run `git status` to see all untracked files
2. Run `git diff` to see staged and unstaged changes
3. Run `git log -5 --oneline` to understand commit message style
4. Analyze the changes and draft a concise commit message
5. Stage relevant files with `git add`
6. Create the commit
7. Run `git status` after commit to verify

### Grouped Mode (group flag)

If `group` argument is provided, execute the intelligent grouping workflow:

1. **Analyze all changes:**
   - Run `git status` to see all files (staged and unstaged)
   - Run `git diff HEAD` to see all changes from HEAD
   - For each changed file, examine its contents and changes using Read tool

2. **Categorize and group files:**
   - Examine the nature of each file and its changes
   - Group files into logical categories, such as:
     - Dependency files (package.json, composer.json, package-lock.json, etc.)
     - Build/config files (webpack.config.js, tsconfig.json, .env.example, etc.)
     - Source code files (organized by feature/module)
     - Test files
     - Documentation files
     - Database migrations
   - Consider the semantic meaning of changes, not just file types
   - Files that are related by feature or purpose should be grouped together
   - Aim for 2-5 logical groups (fewer is better than too many)

3. **For each group, create a separate commit:**
   - Stage only the files in that group using `git add <files>`
   - Analyze the changes in those specific files
   - Generate a descriptive commit message following commit conventions:
     - Use imperative mood ("Add feature" not "Added feature")
     - Be specific about what changed and why
     - Examples: "Update dependencies", "Add authentication middleware", "Fix user validation bug"
   - Create the commit
   - Verify the commit was created successfully

4. **After all groups are committed:**
   - Run `git log --oneline -n <number>` to show all commits created
   - Run `git status` to verify all changes were committed
   - Summarize what was done for the user

### Pull Request Mode (pr flag)

If `pr` argument is provided:

1. **Check current branch:**
   - Run `git rev-parse --abbrev-ref HEAD` to get the current branch name

2. **Check if PR exists:**
   - Run `gh pr view --json number,title,url` for the current branch
   - If the command succeeds and returns a PR, use that PR (display the PR URL and title)

3. **If no PR exists:**
   - Use `AskUserQuestion` to ask the user: "No PR found for this branch. Do you want to create one?"
   - If user says yes, create a PR after commits are made (see PR creation steps below)
   - If user says no, skip PR creation

4. **PR Creation (if requested):**
   - After all commits are created and pushed, run `gh pr create --fill` to create the PR
   - Display the created PR URL to the user

### Push Mode (push flag)

If `push` argument is provided:

1. **Determine target branch:**
   - Check if a branch name was specified after "push" in `$ARGUMENTS`
   - If a branch is specified, push to that branch: `git push origin HEAD:<specified-branch>`
   - If no branch is specified, push to the current branch: `git push`

2. **Push after commits:**
   - Wait until all commits are created (standard or grouped mode)
   - Then execute the push operation
   - Verify push succeeded with appropriate error handling

3. **Handle push errors:**
   - If push fails (e.g., remote branch doesn't exist), explain the error clearly
   - Suggest fixes if appropriate (e.g., use `git push -u origin <branch>` for new branches)

### Important Notes

- **Respect staged changes**: If files are already staged, keep them staged and include them in appropriate groups
- **Stage unstaged files**: Before committing, ensure all files to be committed are staged
- **Commit message format**: Always follow conventional commit style
- **Git safety**: Never use `--amend`, `--force`, or other destructive operations
- **Error handling**: If a commit fails, explain the error and don't continue with remaining groups
- **Argument combinations**: `group`, `pr`, and `push` can be used together in any combination

### Example Grouping Scenario

Given these changes:
- `package.json` (added new dependency)
- `composer.json` (updated PHP packages)
- `src/Controllers/UserController.php` (added authentication)
- `src/Middleware/AuthMiddleware.php` (new file)
- `tests/AuthTest.php` (new tests)

Group them as:
1. **Group 1**: `package.json`, `composer.json` -> "Update dependencies"
2. **Group 2**: `src/Controllers/UserController.php`, `src/Middleware/AuthMiddleware.php` -> "Add authentication middleware"
3. **Group 3**: `tests/AuthTest.php` -> "Add authentication tests"

## Tips

- Use `group` when you have mixed changes that would benefit from separate commits
- Use `pr` to automatically handle PR creation after committing
- Use `push` to push commits immediately after creating them
- Combine flags for complete workflows: `/mella:commit group pr push`
- Standard mode is faster for single-purpose changes
- Grouped mode creates cleaner git history for complex feature work
- Each group should represent a logical, atomic change
