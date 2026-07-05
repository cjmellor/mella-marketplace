# PITCHES.md — `pitch` skill

Dossier from a `/pitch`-on-`/pitch` session: pitching improvements to the `pitch` skill itself
(`plugins/mella/skills/pitch/`). All five pitches shown were accepted. Nothing was declined.

This file doubles as the pitch **ledger** for this skill — see [Ledger](#ledger) at the bottom.
Implementation is intentionally out of scope here; hand this file to whichever model does the
building.

## Suggested Implementation Order

1. **Pitch 1 — The Tiered Fleet** (foundation; everything else assumes the two sub-agents exist)
2. **Pitch 5 — Findings, Not Escapes** (defines what the sub-agents from #1 must return)
3. **Pitch 3 — Actually Read the Competition** (upgrades the researcher agent from #1)
4. **Pitch 2 — The Handover Dossier** (this file's own format — dogfood it going forward)
5. **Pitch 4 — Pitch Ledger** (depends on #2's file existing)

Plus one housekeeping fix, unrelated to any single pitch: `SKILL.md` line 22 reads
`` Parse `` for an optional count `` — the `$ARGUMENTS` placeholder has been stripped from the
prose. Restore it while touching this file for Pitch 1.

---

## Pitch 1: The Tiered Fleet

### The Problem
`SKILL.md` runs codebase analysis, ecosystem research, and idea synthesis in a single model, and
frontmatter line 10 (`model: opus`) actively pins that model — even when the user invokes `/pitch`
from a more capable model. Cheap, mechanical work (grepping a repo, reading competitor docs) burns
the same expensive tokens as the one step that actually needs frontier-level judgment: deciding
what to pitch.

### The Solution
Add two custom agent definitions to the plugin:

- `plugins/mella/agents/pitch-scout.md` — codebase analysis. `model: haiku` (or `sonnet` if haiku
  proves too shallow in testing). Read-only tools (`Read Grep Glob`). System prompt built from the
  current `REFERENCE.md` "What to Analyse" checklist.
- `plugins/mella/agents/pitch-researcher.md` — ecosystem/competitor research. `model: sonnet`.
  Tools: `WebSearch WebFetch`. (See Pitch 3 for what it returns.)

Rewrite `SKILL.md` Phase 2 to spawn both agents in parallel via the `Agent` tool and wait for their
structured findings — the orchestrating model does no analysis of its own in this phase. Remove
`model: opus` from `SKILL.md`'s frontmatter (and `effort: high`, which should apply to synthesis,
not agent dispatch) so the skill inherits whatever model the user invoked `/pitch` from.

**Implementation note:** in this codebase's convention, agent definitions (see
`pr-review-toolkit`'s `agents/*.md`) carry `name` / `description` / `model` / `color` in
frontmatter — there's no standard `effort:` field at the agent-definition level. If per-agent
reasoning effort is wanted, pass it via the `Agent` tool's `model`/effort call-site options when
`SKILL.md` invokes them, not via new frontmatter on the agent files.

### Affected Files
- `plugins/mella/skills/pitch/SKILL.md` — frontmatter (remove `model: opus`), Phase 2 rewrite
- `plugins/mella/skills/pitch/REFERENCE.md` — "What to Analyse" section becomes the scout's brief
- `plugins/mella/agents/pitch-scout.md` — new
- `plugins/mella/agents/pitch-researcher.md` — new
- `plugins/mella/.claude-plugin/plugin.json` — no change expected (agents are auto-discovered from
  the plugin's `agents/` directory the same way `pr-review-toolkit` does it — verify during
  implementation)

### Acceptance Criteria
- Invoking `/pitch` from any model no longer downgrades to Opus for synthesis.
- Phase 2 completes via two parallel `Agent` calls; the orchestrating model's own tool calls in
  Phase 2 are limited to dispatching those agents and reading their results.
- `pitch-scout` and `pitch-researcher` exist as standalone agent definitions other skills could
  reuse.

### Tradeoffs / Notes
- Haiku may under-perform on architecturally subtle codebases; keep `sonnet` as an easy escape
  hatch (a one-line change to the agent's frontmatter) rather than hardcoding haiku as gospel.
- This pitch has no user-visible behavior change on its own beyond cost/model routing — its value
  is realized once Pitch 5 constrains what the agents hand back.

---

## Pitch 5: Findings, Not Essays

### The Problem
Once Pitch 1's two sub-agents exist, they'll return free-form prose by default — meandering
reports of inconsistent shape. The synthesis model then spends its attention parsing essays
instead of deciding, which undermines the entire point of offloading research to cheaper agents.

### The Solution
Define a findings contract in `REFERENCE.md` that both agents must return exactly:

- **Scout** (`pitch-scout`): four categories — `strengths / gaps / pain-points / conventions` —
  each entry one claim plus `file:line` evidence, capped at 8 entries per category (forced
  ranking, no padding).
- **Researcher** (`pitch-researcher`): the feature matrix from Pitch 3, plus a capped list
  (e.g. 8) of positioning observations, each with a source URL.

Each agent's prompt ends with an explicit instruction that its final message is data for another
model, not a report for a human — no preamble, no summary paragraph, just the structured findings.
`SKILL.md`'s synthesis step is then constrained: pitch only from claims that carry `file:line` or
a competitor citation; a finding without one doesn't exist for pitching purposes.

### Affected Files
- `plugins/mella/skills/pitch/REFERENCE.md` — add the findings-contract section
- `plugins/mella/agents/pitch-scout.md` — output-format instructions
- `plugins/mella/agents/pitch-researcher.md` — output-format instructions
- `plugins/mella/skills/pitch/SKILL.md` — Phase 2/3 note: synthesis only draws from evidenced
  claims

### Acceptance Criteria
- Both agents' final messages parse as the defined structure (spot-check across a few runs on
  different project types).
- Every pitch shown in Phase 3 references at least one `file:line` or competitor citation
  traceable to a Phase 2 finding.

### Tradeoffs / Notes
- Hard caps (8 per category) risk dropping a genuinely important finding on a large codebase.
  Acceptable tradeoff for now; revisit the cap size if pitches feel thin on big repos.

---

## Pitch 3: Actually Read the Competition

### The Problem
The current skill's ecosystem step is a `WebSearch` for competitor positioning — it never opens a
competitor's README, docs, or changelog. "Cross-referencing with competitors' offerings" was the
user's mental model of the skill, not what it does; today's gap analysis is built on marketing
copy, not verified feature comparison.

### The Solution
Upgrade `pitch-researcher` (from Pitch 1) into two stages: first `WebSearch` to identify 3–5
closest competitors, then `WebFetch` their GitHub READMEs, docs sites, and changelogs (public
surface only — no repo cloning). Return a feature matrix: rows are capabilities, columns are each
competitor plus the user's own project (the "own project" column filled from the scout's
findings), cells are `has` / `lacks` / `partial`. Synthesis then pitches from verified gaps
("competitor X has feature Y, you have neither") instead of inferred ones.

### Affected Files
- `plugins/mella/agents/pitch-researcher.md` — two-stage research procedure, `WebFetch` added to
  its tool list
- `plugins/mella/skills/pitch/REFERENCE.md` — document the feature-matrix format (ties into
  Pitch 5's findings contract)

### Acceptance Criteria
- Researcher output includes a feature matrix with at least 3 competitors and citations
  (URLs) for each `has`/`lacks` cell.
- At least one pitch per run cites the matrix directly (e.g. "X has this, you don't").

### Tradeoffs / Notes
- Depends on competitors having public docs/READMEs; for closed-source or thin-marketing-site
  competitors, the matrix will have more `unknown` cells than `has`/`lacks` — synthesis should
  treat `unknown` as non-evidence, not as `lacks`.

---

## Pitch 2: The Handover Dossier

### The Problem
Phase 4 of `SKILL.md` currently ends with a vague "offer to write a structured plan" — no defined
format, no file, no contract. Accepted pitches evaporate into conversation history once the
session ends, with nothing to hand to a different model or a fresh session for implementation.

### The Solution
Replace Phase 4 with a concrete deliverable: when the user signals pitching is done, write
`PITCHES.md` at the repo root (this file is the reference example of that output). One section per
accepted pitch, upgraded from the pitch format into an implementation brief — problem, solution,
affected files (sourced from the scout's `file:line` findings), acceptance criteria, and any
tradeoffs surfaced during **M** deep-dives. Declined ideas get a one-line "considered and
rejected, because…" note so future runs (see Pitch 4) don't re-surface them blind. The file closes
with a suggested implementation order derived from the scorecards (foundation/dependency pitches
first, as done above).

### Affected Files
- `plugins/mella/skills/pitch/SKILL.md` — Phase 4 rewrite; add `Write` to `allowed-tools`
  (currently `Read Grep Glob Agent WebSearch`)
- `plugins/mella/skills/pitch/REFERENCE.md` — add a `PITCHES.md` template section

### Acceptance Criteria
- Ending a `/pitch` session produces a `PITCHES.md` at repo root with one implementation-brief
  section per accepted pitch.
- Declined pitches appear as one-line appendix entries, not full sections.
- The file includes a suggested implementation order.

### Tradeoffs / Notes
- If `PITCHES.md` already exists (a prior run's dossier not yet implemented), the skill should
  append/merge rather than overwrite — this is where Pitch 4's ledger section and this file's
  content need to coexist without clobbering each other. Worth an explicit merge rule when
  implementing.

---

## Pitch 4: Pitch Ledger

### The Problem
Phase 1 asks the user "any previously rejected ideas?" — an admission that the skill has no
memory. Run `/pitch` twice on the same project and it may re-pitch something declined last month,
because every run starts from zero.

### The Solution
Keep a ledger **inside `PITCHES.md`** — no separate `.pitch/` folder (per explicit user
preference: they didn't want an extra root-level directory). One line per pitch ever shown: name,
one-sentence gist, verdict (banked / declined / implemented), date. At the start of Phase 2, read
the ledger (if `PITCHES.md` exists) and pass it into synthesis with two rules:

1. Never re-pitch a declined idea unless the codebase has materially changed in a way that
   invalidates the original rejection reason — and if it has, say so explicitly ("you declined
   this in May because X; X is no longer true").
2. Check whether previously banked ideas ever shipped; a banked-but-unimplemented pitch is a
   legitimate re-pitch, flagged "still on the table."

### Affected Files
- `plugins/mella/skills/pitch/SKILL.md` — Phase 1/2: read existing `PITCHES.md` ledger section if
  present; Phase 4: append to it rather than overwrite
- `plugins/mella/skills/pitch/REFERENCE.md` — document the ledger line format and the
  expired-rejection re-pitch rule

### Acceptance Criteria
- A second `/pitch` run on a project with an existing `PITCHES.md` does not re-show a declined
  idea unless it explicitly flags the rejection reason as expired.
- Every pitch ever shown (across all runs) has exactly one ledger line in `PITCHES.md`.

### Tradeoffs / Notes
- Merge logic with Pitch 2's dossier-writing needs to be defined together (both touch
  `PITCHES.md`'s end state) — see the note under Pitch 2.

---

## Declined Ideas

None. All five pitches shown this session were accepted.

## Ledger

| # | Pitch | Verdict | Date |
|---|-------|---------|------|
| 1 | The Tiered Fleet | Banked | 2026-07-05 |
| 2 | The Handover Dossier | Banked | 2026-07-05 |
| 3 | Actually Read the Competition | Banked | 2026-07-05 |
| 4 | Pitch Ledger (in-file, no `.pitch/` folder) | Banked | 2026-07-05 |
| 5 | Findings, Not Essays | Banked | 2026-07-05 |
