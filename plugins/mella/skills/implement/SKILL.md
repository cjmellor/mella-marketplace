---
name: implement
description: >
  TDD-driven implementation. Use when ready to start building — either from scratch
  or picking up after planning.
  Triggers on: "implement", "start building", "let's build", "ready to implement",
  "begin implementation", "start coding", "build this feature".
  Step 1 auto-detects GStack planning artifacts (from /office-hours,
  /plan-eng-review, /plan-ceo-review, /plan-design-review) and uses them if
  present; otherwise elicits the test queue interactively. Either way, drives a
  strict Red→Green TDD loop.
---

# Implement

You are about to build. Do not re-plan. Do not re-discuss scope that's already settled.
First check whether planning artifacts exist, then orient, then build.

## Step 1: Check for GStack Planning Artifacts

Before anything else, find out whether this work was planned with GStack. Resolve
the project slug and branch, then look for artifacts:

```bash
setopt +o nomatch 2>/dev/null || true
SLUG=$(~/.claude/skills/gstack/browse/bin/remote-slug 2>/dev/null || basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null | tr '/' '-' || echo 'no-branch')
echo "SLUG: $SLUG  BRANCH: $BRANCH"

TEST_PLAN=$(ls -t ~/.gstack/projects/$SLUG/*-$BRANCH-eng-review-test-plan-*.md 2>/dev/null | head -1)
DESIGN=$(ls -t ~/.gstack/projects/$SLUG/*-$BRANCH-design-*.md 2>/dev/null | head -1)
[ -z "$DESIGN" ] && DESIGN=$(ls -t ~/.gstack/projects/$SLUG/*-design-*.md 2>/dev/null | head -1)
CEO_PLAN=$(ls -t ~/.gstack/projects/$SLUG/ceo-plans/*.md 2>/dev/null | head -1)
DESIGNS_DIR=$(ls -d ~/.gstack/projects/$SLUG/designs 2>/dev/null | head -1)

if [ -n "$TEST_PLAN" ] || [ -n "$DESIGN" ] || [ -n "$CEO_PLAN" ] || [ -n "$DESIGNS_DIR" ]; then
  echo "MODE: gstack"
  [ -n "$TEST_PLAN" ]   && echo "TEST_PLAN: $TEST_PLAN"
  [ -n "$DESIGN" ]      && echo "DESIGN: $DESIGN"
  [ -n "$CEO_PLAN" ]    && echo "CEO_PLAN: $CEO_PLAN"
  [ -n "$DESIGNS_DIR" ] && echo "DESIGNS_DIR: $DESIGNS_DIR"
else
  echo "MODE: standalone"
fi
```

**If `MODE: gstack`** → follow Step 1a.
**If `MODE: standalone`** → follow Step 1b.

### Step 1a: Orient from GStack Artifacts

Read each artifact that exists. Extract:
- **From TEST_PLAN**: Critical Paths, Key Interactions, Edge Cases → this is your ordered test queue
- **From DESIGN**: Constraints and Premises → hard guardrails; do not build what was ruled out
- **From CEO_PLAN**: Accepted scope → reject scope creep against this
- **From DESIGNS_DIR**: Approved mockup paths → read the finalized HTML/PNG for any UI work

If `MODE: gstack` but `TEST_PLAN` is missing specifically, tell the user: "Found
some GStack artifacts but no eng review test plan. Run `/plan-eng-review` first,
or switch to standalone mode and describe the test queue directly."

### Step 1b: Elicit the Plan Directly

No planning artifacts — that's fine. Ask the user for just enough to build a test
queue. Keep the prompt tight; don't redo planning:

```
Standalone mode — no GStack artifacts found. To build a TDD queue, tell me:

  1. Critical Paths — the 1–3 end-to-end flows that prove the feature works.
  2. Key Interactions — important sub-behaviors, one per bullet.
  3. Edge Cases — errors, empty states, boundary inputs.
  4. Constraints (optional) — anything explicitly out of scope or ruled out.

Paste a doc, write bullets, or describe it in prose and I'll structure it.
```

When you have the answer, restate it back as an ordered queue (tracer → loop →
edge) and get one-word confirmation before moving on. Treat the user's stated
constraints as the equivalent of a design doc's Premises for the guardrails
section at the end of this skill.

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

Whether the source was a GStack TEST_PLAN or direct user elicitation, order tests as:
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

### The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
```

Wrote code before the test? Delete it. Don't keep it as "reference." Don't "adapt"
it while writing tests. Don't look at it. Implement fresh from the test.

**Violating the letter of the rules is violating the spirit of the rules.** "Tests
after achieve the same goals" is false: tests-after answer *what does this do?*;
tests-first answer *what should this do?*

For each test in the queue, run the full cycle below.

### RED — Write Failing Test

- Write one test verifying one behavior
- Use the **public interface only** — no testing internals, no mocking internal collaborators
- Clear behavioral name ("rejects empty email", not "test1" or "email works")
- No "and" in the name — if there's an "and," split it into two tests

### Verify RED — Watch It Fail (MANDATORY)

Run it and confirm, in this order:

1. **Test fails** (not errors from a typo or missing import)
2. **Failure message matches what you expected** — the assertion you wrote, not an unrelated crash
3. **Fails because the behavior is missing**, not because the test is broken

Show the failing output. Then reason about it in one line before moving on.

**Why this step is non-negotiable:** if you didn't watch the test fail, you don't
know it tests the right thing. A test that passes immediately proves nothing — it
may be testing existing behavior, the wrong path, or a mock. A test that errors
(typo, import, setup) isn't RED either; it's broken. Fix it until it fails for the
right reason, then proceed.

### GREEN — Minimum Code

- Write the **minimum code** to make the current test pass — nothing more
- Do not anticipate the next test in the queue
- Do not add options, config knobs, or "while I'm here" improvements

### Verify GREEN — Pristine Pass (MANDATORY)

Run the test and confirm all three:

1. **The target test passes**
2. **All other tests still pass** — run the full suite, not just the file
3. **Output is pristine** — no warnings, no stderr noise, no deprecation spam, no
   unexpected logs from your new code

If another test broke, fix it now — don't defer. If the output is noisy, quiet it
before moving on; noise hides the next regression.

### Rules

- One test at a time. Never write two tests before implementing.
- Only enough code to pass the current test. Do not anticipate the next one.
- If a test reveals the design needs adjustment, stop and flag it — do not silently change scope.
- Never go GREEN by deleting or weakening the test.
- Do not refactor between RED and GREEN — only after GREEN.

### Common Rationalizations — STOP if you catch yourself thinking these

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code still breaks. The test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Already manually tested it" | Ad-hoc ≠ systematic. No record, can't re-run, forgets cases under pressure. |
| "Keep the code as reference, write tests first" | You'll adapt it. That's testing-after in disguise. Delete means delete. |
| "Deleting X hours is wasteful" | Sunk cost. Keeping unverified code is technical debt, not progress. |
| "TDD is dogmatic, I'm being pragmatic" | Pragmatic = faster overall. Skipped TDD = debug in prod = slower. |
| "This is different because…" | It isn't. |
| "Test is hard to write" | Listen to the test. **Hard to test = hard to use.** That's design feedback, not a reason to skip. |

All of these mean: stop, delete whatever code exists, start with RED.

### When Stuck

| Problem | Response |
|---------|----------|
| Don't know how to test it | Write the wished-for API first (the call you'd want to make), then the assertion. Work backward to a test. |
| Test is too complicated | The design is too complicated. Simplify the interface, not the test. |
| Must mock everything | Code is too coupled. Introduce dependency injection at the seam. |
| Test setup is huge | Extract helpers. If it's still huge, the design needs to change. |

## Step 5: Refactor

After 3–5 passing tests, pause and look for:
- Duplication worth extracting
- Complexity that can be hidden behind a simpler interface
- Anything the new code reveals about existing code that should change

Run the full test suite after each refactor step. Never refactor while RED.

## Step 6: Bug Fixes During Implementation

If you hit a bug outside the plan (in existing code, in a dependency you just
touched, anywhere):

1. Write a failing test that reproduces the bug
2. Verify it fails for the right reason
3. Fix the code
4. Verify GREEN

The test proves the fix works and prevents the bug from returning. **Never fix a
bug without a test**, even a "tiny one-line fix." The test is the only proof the
fix addresses the actual bug rather than a symptom.

## Step 7: Verification Checklist

Before declaring the implementation complete, confirm every box:

- [ ] Every new function/behavior has a test
- [ ] Each test was watched failing before implementing (RED verified)
- [ ] Each RED failed for the right reason (missing behavior, not typo)
- [ ] GREEN came from minimum code, not anticipated features
- [ ] Full test suite passes — not just the files you touched
- [ ] Output is pristine — no warnings, no stderr noise, no stray logs
- [ ] Tests use the public interface and real code (mocks only at true external boundaries)
- [ ] No production code exists that wasn't driven by a failing test
- [ ] Every item from the test queue (Critical Paths, Key Interactions, Edge Cases) is covered

If you can't check every box, you skipped TDD. Go back and fix it — don't paper
over it in the PR description.

## Scope & Design Guardrails

Guardrails come from whichever source Step 1 produced:

- **GStack mode**: the **Premises** and **Constraints** of the design doc, plus
  the accepted scope in the CEO plan, plus any approved mockup in the designs dir.
- **Standalone mode**: the constraints the user stated during Step 1b elicitation.

Either way, these are decisions already made. Do not write tests for behavior
that was explicitly ruled out. If you hit a constraint conflict mid-implementation,
stop and flag it:

> "The current test requires X, but the guardrails rule out X (source: <design doc Premise N> / <your stated constraint>). Confirm before proceeding."

Similarly, if a test you're about to write reveals the guardrails themselves are
wrong, stop and flag it rather than silently reshaping scope. Listen to the test:
if it's telling you the interface is awkward, that's design feedback worth
surfacing before you code around it.
