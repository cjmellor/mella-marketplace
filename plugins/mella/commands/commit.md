---
description: Create git commits with optional intelligent grouping
argument-hint: "[--group]"
allowed-tools: [Bash, Read, Grep, Glob]
---

# Commit Command

Create git commits with optional intelligent grouping of changes.

## Usage

- `/mella:commit` - Standard commit (like /commit-commands:commit)
- `/mella:commit --group` - Analyze and group changes into logical commits

## Instructions for Claude

When this command is executed, follow these steps based on the arguments:

### Standard Mode (no arguments)

If no arguments provided, execute the standard commit workflow:

1. Run `git status` to see all untracked files
2. Run `git diff` to see staged and unstaged changes
3. Run `git log -5 --oneline` to understand commit message style
4. Analyze the changes and draft a concise commit message
5. Stage relevant files with `git add`
6. Create the commit with the message ending with:
   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
   ```
7. Run `git status` after commit to verify

### Grouped Mode (--group flag)

If `--group` argument is provided, execute the intelligent grouping workflow:

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
   - Create the commit with message ending with Claude Code attribution
   - Verify the commit was created successfully

4. **After all groups are committed:**
   - Run `git log --oneline -n <number>` to show all commits created
   - Run `git status` to verify all changes were committed
   - Summarize what was done for the user

### Important Notes

- **Respect staged changes**: If files are already staged, keep them staged and include them in appropriate groups
- **Stage unstaged files**: Before committing, ensure all files to be committed are staged
- **Commit message format**: Always follow conventional commit style and include Claude Code attribution
- **Git safety**: Never use `--amend`, `--force`, or other destructive operations
- **Error handling**: If a commit fails, explain the error and don't continue with remaining groups

### Example Grouping Scenario

Given these changes:
- `package.json` (added new dependency)
- `composer.json` (updated PHP packages)
- `src/Controllers/UserController.php` (added authentication)
- `src/Middleware/AuthMiddleware.php` (new file)
- `tests/AuthTest.php` (new tests)

Group them as:
1. **Group 1**: `package.json`, `composer.json` → "Update dependencies"
2. **Group 2**: `src/Controllers/UserController.php`, `src/Middleware/AuthMiddleware.php` → "Add authentication middleware"
3. **Group 3**: `tests/AuthTest.php` → "Add authentication tests"

## Tips

- Use `--group` when you have mixed changes that would benefit from separate commits
- Standard mode is faster for single-purpose changes
- Grouped mode creates cleaner git history for complex feature work
- Each group should represent a logical, atomic change
