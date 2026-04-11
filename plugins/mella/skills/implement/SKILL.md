---
name: implement
description: >
  TDD-driven implementation that picks up where GStack planning left off.
  Use when ready to start building after plans have been approved — after running
  /office-hours, /plan-eng-review, /plan-ceo-review, or /plan-design-review.
  Triggers on: "implement", "start building", "let's build", "ready to implement",
  "begin implementation", "start coding".
  Reads GStack plan artifacts for the current branch, detects the stack, then drives
  a strict Red→Green TDD loop using the eng review test plan as the test queue.
---

# Implement

You are picking up where planning left off. Do not re-plan. Do not re-discuss scope.
Read the artifacts, orient, then build.

## Step 1: Orient from the Plan

Run this to resolve the project slug and branch:

```bash
setopt +o nomatch 2>/dev/null || true
SLUG=$(~/.claude/skills/gstack/browse/bin/remote-slug 2>/dev/null || basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-' || echo 'no-branch')
echo "SLUG: $SLUG  BRANCH: $BRANCH"
```

Then find all available plan artifacts for this branch:

```bash
setopt +o nomatch 2>/dev/null || true

# Primary: eng review test plan (your test queue)
TEST_PLAN=$(ls -t ~/.gstack/projects/$SLUG/*-$BRANCH-eng-review-test-plan-*.md 2>/dev/null | head -1)
[ -n "$TEST_PLAN" ] && echo "TEST_PLAN: $TEST_PLAN" || echo "TEST_PLAN: none"

# Design doc (constraints, approved approach, premises)
DESIGN=$(ls -t ~/.gstack/projects/$SLUG/*-$BRANCH-design-*.md 2>/dev/null | head -1)
[ -z "$DESIGN" ] && DESIGN=$(ls -t ~/.gstack/projects/$SLUG/*-design-*.md 2>/dev/null | head -1)
[ -n "$DESIGN" ] && echo "DESIGN: $DESIGN" || echo "DESIGN: none"

# CEO plan (scope guardrails — what was accepted/rejected)
CEO_PLAN=$(ls -t ~/.gstack/projects/$SLUG/ceo-plans/*.md 2>/dev/null | head -1)
[ -n "$CEO_PLAN" ] && echo "CEO_PLAN: $CEO_PLAN" || echo "CEO_PLAN: none"

# Design mockups (for UI work)
ls ~/.gstack/projects/$SLUG/designs/ 2>/dev/null && echo "DESIGNS_DIR: ~/.gstack/projects/$SLUG/designs/" || echo "DESIGNS_DIR: none"
```

Read each artifact that exists. Extract:
- **From TEST_PLAN**: Critical Paths, Key Interactions, Edge Cases → this is your ordered test queue
- **From DESIGN**: Constraints and Premises → hard guardrails; do not build what was ruled out
- **From CEO_PLAN**: Accepted scope → reject scope creep against this
- **From DESIGNS_DIR**: Approved mockup paths → read the finalized HTML/PNG for any UI work

If no TEST_PLAN exists, tell the user: "No eng review test plan found for this branch. Run `/plan-eng-review` first, or describe what to build and I'll derive the test queue."

## Step 2: Detect Stack

```bash
[ -f Package.swift ]   && echo "STACK: swift"
[ -f composer.json ]   && echo "STACK: php/laravel"
[ -f package.json ]    && echo "STACK: node" && cat package.json | grep -E '"vitest|jest|mocha"' | head -3
[ -f Cargo.toml ]      && echo "STACK: rust"
[ -f go.mod ]          && echo "STACK: go"
[ -f pyproject.toml ] || [ -f setup.py ] && echo "STACK: python"
```

Determine the test runner and the command to run a single test. If ambiguous, check
`package.json` scripts or existing test files for the pattern in use.

Common mappings:
- Swift → `swift test` or `xcodebuild test`
- PHP/Laravel → `./vendor/bin/pest` or `php artisan test`
- Node (Vitest) → `npx vitest run <file>`
- Node (Jest) → `npx jest <file>`
- Rust → `cargo test <test_name>`
- Go → `go test ./...`

## Step 3: Build the Test Queue

From the TEST_PLAN, order tests as:
1. **Critical Paths first** — tracer bullets, end-to-end proof the path works
2. **Key Interactions** — incremental behavior verification
3. **Edge Cases last** — only after core behavior is proven

Present the queue to the user before starting:
```
Test queue (N tests):
  [tracer] End-to-end purchase: Settings → pack select → Polar → success → balance updated
  [loop]   Guest visits /pricing → sees pack tiers → CTA links to /auth
  [loop]   Logged-in user → CTA links to /checkout/{pack}
  ...
  [edge]   Invalid pack key → 404
  ...

Starting with tracer bullet. Proceed?
```

## Step 4: Red→Green Loop

For each test in the queue:

### RED
- Write one test verifying one behavior
- Use the **public interface only** — no testing internals, no mocking internal collaborators
- Run it: confirm it fails for the right reason (a missing behavior, not a syntax error)
- Show the failing output

### GREEN
- Write the **minimum code** to make it pass — nothing more
- Run the test: confirm it passes
- Show the passing output

### NEXT
- Move to the next item in the queue
- Do not refactor between RED and GREEN — only after GREEN

### Rules
- One test at a time. Never write two tests before implementing.
- Only enough code to pass the current test. Do not anticipate the next one.
- If a test reveals the design needs adjustment, stop and flag it — do not silently change scope.
- Never go GREEN by deleting or weakening the test.

## Step 5: Refactor

After 3–5 passing tests, pause and look for:
- Duplication worth extracting
- Complexity that can be hidden behind a simpler interface
- Anything the new code reveals about existing code that should change

Run the full test suite after each refactor step. Never refactor while RED.

## Guardrails from the Design Doc

Before writing any test, check the **Premises** and **Constraints** sections of the
design doc. These are decisions already made. Do not write tests for behavior that
was explicitly ruled out.

If you hit a constraint conflict mid-implementation, stop and flag it:
> "The current test requires X, but the design doc ruled out X (Premise N). Confirm before proceeding."
