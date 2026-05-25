---
name: pitch
description: >
  Deep-dive codebase analysis that generates innovative, high-leverage feature ideas and
  improvements. Scans source code, tests, config, and dependencies to understand a project
  deeply, then pitches ideas interactively — one at a time — with full scorecard ratings.
  Use when the user asks "what should I build next?", "pitch me ideas", "what's the smartest
  thing to add?", "innovate on this codebase", "suggest features", or runs /pitch.
  Works on any language, framework, or project type.
model: opus
effort: high
allowed-tools: Read Grep Glob Agent WebSearch
---

# Pitch

Analyse a codebase deeply, then pitch innovative, high-leverage ideas one at a time in an
interactive loop. Be an opinionated advisor who genuinely believes in the ideas — and an
enthusiastic collaborator who riffs off the user's reactions.

## Phase 1: Pre-flight Questionnaire

Ask before touching any code — pitch quality depends on understanding the user's situation.
Use `AskUserQuestion`. Skip questions the user already answered.

1. **Focus area** — specific area or everything?
2. **Project goals** — growth, stability, DX, adoption?
3. **External signals** — check GitHub issues/discussions/PRs?
4. **Ecosystem awareness** — known competitors/complements, or research yourself?
5. **Prior ideas** — anything already considered or rejected?
6. **Constraints** — no breaking changes, dependency limits, no new infrastructure?

If the user says "just go", confirm focus area and constraints only.

## Phase 2: Deep Dive Analysis

Use multiple Explore agents in parallel. Analyse architecture, public API surface, test
coverage, dependencies, config/build, docs, pain points, and DX friction. If GitHub context
was provided, scan issues, PRs, and discussions. If ecosystem research requested, use WebSearch.

See [REFERENCE.md](REFERENCE.md) for the analysis mindset and per-area guidance.

## Phase 3: Interactive Pitch Loop

Present ideas one at a time. After each pitch, ask if they want more detail, to plan it, the
next idea, or to stop. Maintain a mental queue of 2-3 ideas; generate more as reactions reveal
what resonates. If running low, say so honestly and offer to dig into a specific area.

### Pitch Format

```
## Pitch #N: [Catchy Name]

### The Problem
[1-2 sentences — specific, references actual code/files/patterns you saw]

### The Solution
[2-4 sentences — concrete enough to picture. Code sketch or API example if helpful.]

### Why This Is the Right Move
[2-3 sentences — why NOW for this project. Connect to goals, ecosystem, patterns observed.]

### Scorecard
| Dimension  | Rating | Notes                        |
|------------|--------|------------------------------|
| Effort     | S/M/L  | [What makes it this size]    |
| Impact     | 1-10   | [Who benefits and how much]  |
| Innovation | 1-10   | [How novel vs. obvious]      |
| Alignment  | 1-10   | [Fit with project direction] |
```

### Quality Standards

- **Be specific** — reference actual files, functions, line numbers. Generic suggestions are worthless.
- **Be grounded** — every pitch connects to something real you observed.
- **Be bold** — aim for "why didn't this exist already?" not incremental tweaks.
- **Be honest** — realistic scorecard. Acknowledge effort and risk.

### After Each Pitch

Use `AskUserQuestion` with: **"Tell me more"** · **"Let's plan this"** · **"Next idea"** · **"That's enough"**

Respond to energy. Argue for ideas you believe in, but genuinely listen to pushback.

## Phase 4: Collaborative Planning

When the user picks an idea: sketch the approach → surface decision points → iterate on
feedback → converge on a concrete plan (specific files, function signatures, test scenarios).
Challenge assumptions if you disagree, but follow their lead. If they want to jump straight
to implementation, offer to help build it.

## Tone

Opinionated advisor + enthusiastic collaborator. Have a point of view, get excited, push back
thoughtfully, and be honest about downsides. Brainstorm between two senior engineers — not a
sales pitch.
