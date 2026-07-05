# Pitch — Reference

## Findings Contracts (Phase 2)

Both research agents return structured data, not prose. Their output formats are defined in
their own agent files and summarised here so the synthesis step knows what to expect.

### `mella:pitch-scout` returns

- **Project** — one-line summary (language/framework, purpose, size)
- **Strengths / Gaps / Pain Points / Conventions** — max 8 entries each, ranked, every
  entry carrying `file:line` evidence (gaps may cite `absent: <where it would live>`)

### `mella:pitch-researcher` returns

- **Competitors** — 3–5 entries: name, one-line positioning, primary URL fetched
- **Feature Matrix** — capabilities × (ours + competitors), cells `has`/`lacks`/`partial`/
  `unknown`; competitor cells backed by fetched material only
- **Positioning Observations** — max 8, each with a source URL

**Synthesis discipline:** a claim without `file:line` or a source URL is not evidence and
must not seed a pitch. `unknown` matrix cells are non-evidence, never `lacks`.

## Analysis Mindset (for synthesis)

Think like a senior engineer and product thinker combined. Look for:

- **Leverage points** — small changes that unlock disproportionate value
- **Missing abstractions** — patterns that repeat but aren't captured
- **Capability gaps** — verified via the feature matrix, not assumed
- **DX wins** — better errors, smarter defaults, less boilerplate
- **Integration opportunities** — natural connections to other tools/services
- **Underexploited strengths** — things the project does well but doesn't lean into

## PITCHES.md Template (Phase 4)

Written to the target project's repo root. Structure:

```markdown
# PITCHES.md — [project name]

[One-paragraph preamble: when the session ran, how many pitches shown/accepted.
This file is a handover document; implementation happens separately.]

## Suggested Implementation Order

1. **Pitch N — [name]** ([why first: foundation, dependency, quick win])
...

## Pitch N: [Name]

### The Problem
[As pitched]

### The Solution
[As pitched, expanded with anything from M deep-dives]

### Affected Files
- `path/to/file.ext` — [what changes; sourced from scout evidence]

### Acceptance Criteria
- [Verifiable statement of done]

### Tradeoffs / Notes
- [Risks, open questions, M deep-dive material]

## Declined Ideas

- **[Name]** — declined: [reason, if given]
(one line each; "None." if all were accepted)

## Ledger

| # | Pitch | Verdict | Date |
|---|-------|---------|------|
| 1 | [name] | Banked / Declined: [reason] / Implemented | YYYY-MM-DD |
```

### Merge rules when PITCHES.md already exists

- **Brief sections** (implementation order, pitch briefs, declined ideas) — replaced by the
  new run's output. Carry forward any prior banked-but-unimplemented briefs the user
  re-banked as *still on the table*.
- **Ledger** — append-only. Never rewrite or delete existing rows; add one row per pitch
  shown this run. Update a prior row's verdict only from `Banked` to `Implemented` when the
  work has verifiably shipped.
