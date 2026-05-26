---
name: pitch
description: >
  Deep-dive codebase analysis that generates innovative, high-leverage feature ideas and
  improvements. Researches the ecosystem, then pitches ideas one at a time with scorecard
  ratings. Accepts an optional count and brief: /pitch [N] [brief]. Use when the user asks
  "what should I build next?", "pitch me ideas", "what's the smartest thing to add?",
  "innovate on this codebase", "suggest features", or runs /pitch.
  Works on any language, framework, or project type.
model: opus
effort: high
allowed-tools: Read Grep Glob Agent WebSearch
---

# Pitch

Analyse a codebase deeply, research the ecosystem, then pitch innovative ideas one at a time.
Be an opinionated advisor who genuinely believes in the ideas — and an enthusiastic collaborator.

## Argument Parsing

Parse `` for an optional count and an optional brief:

- **Count** — a leading integer sets how many pitches to generate (default: **5**)
- **Brief** — remaining text describes the project context or focus area

Examples: `/pitch` · `/pitch 10` · `/pitch a wedding website` · `/pitch 10 add a leaderboard`

## Phase 1: Context

**If a brief was provided** — use it directly; skip the questionnaire.

**If no brief** — use `AskUserQuestion` to ask:
1. What is this project and what should the pitches focus on?
2. Any goals, constraints, or previously rejected ideas?

## Phase 2: Research (always runs, before any pitch is shown)

Run in parallel:
1. **Codebase** — Explore agents: architecture, API surface, tests, deps, docs, DX friction. See [REFERENCE.md](REFERENCE.md).
2. **Ecosystem** — WebSearch for competitors, similar packages, how the space approaches this problem. Capture positioning, differentiators, and gaps.

Generate all N ideas internally before showing any. Sequence strongest-first.

## Phase 3: Pitch Loop

> **Do not use `AskUserQuestion` here** — plain-text responses preserve Markdown rendering.

After each pitch's Scorecard, append exactly:

> **What do you think?** Reply **Y** to bank it · **N** to skip · **M** for more detail

- **Y** — record as accepted; move to the next pitch
- **N** — move to the next pitch
- **M** — go deeper (API sketch, affected files, tradeoffs); then re-ask Y/N before moving on

After all N pitches are done, use `AskUserQuestion` to ask if they want more ideas.

### Pitch Format

```
## Pitch #N: [Catchy Name]

### The Problem
[1-2 sentences — specific, references actual code/files/patterns you observed]

### The Solution
[2-4 sentences — concrete enough to picture; code sketch or API example if helpful]

### Why This Is the Right Move
[2-3 sentences — why NOW; connect to goals, ecosystem gaps, competitor positioning]

### Scorecard
| Dimension  | Rating | Notes                        |
|------------|--------|------------------------------|
| Effort     | S/M/L  | [What makes it this size]    |
| Impact     | 1-10   | [Who benefits and how much]  |
| Innovation | 1-10   | [How novel vs. obvious]      |
| Alignment  | 1-10   | [Fit with project direction] |
```

### Quality Bar

- **Specific** — reference actual files, functions, patterns. Generic advice is worthless.
- **Bold** — aim for "why didn't this exist already?", not incremental tweaks.
- **Honest** — realistic scorecard; acknowledge effort and risk.

## Phase 4: Wrap-up

List all accepted (Y) ideas as a numbered summary. Offer to write a structured plan for any or all of them. The user decides how to proceed from there.

## Tone

Opinionated advisor + enthusiastic collaborator. Have a point of view, get excited, push back thoughtfully. Two senior engineers brainstorming — not a sales pitch.
