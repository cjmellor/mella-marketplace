---
name: competitor-analysis
description: Deep competitive intelligence for any product. Reads the current project's code and documentation to understand what the product does, then searches the web for competitors and visits each competitor's site live to research pricing, features, copywriting, design, and positioning. Use when the user asks for competitor research, competitive landscape, market analysis, "who are our competitors", or wants to compare their product against alternatives. Produces either a structured Markdown report or an interactive self-contained HTML dashboard. Persists findings to .claude/competitor-data.yaml for use by other skills.
argument-hint: "[deep|wide] [md|html]"
context: fork
allowed-tools: [Read, Write, Glob, Grep, WebSearch, WebFetch, Skill, AskUserQuestion]
---

# Competitor Analysis

## Workflow

### Step 1 — Identify the product

**First, check for existing context:**
- If `.claude/product-marketing-context.md` exists, read it — skip Step 2's product questions entirely and only ask about scope.
- If `.claude/competitor-data.yaml` exists, read it — this is a previous run. Note what's changed since and offer a **delta update** rather than a full re-analysis.

Otherwise, read project files in this order (stop when you have sufficient context):
1. `README.md` at project root
2. Any `docs/` folder — look for `index.md`, `overview.md`, or similar
3. `package.json`, `pyproject.toml`, `Cargo.toml` — name, description, keywords fields
4. Core source files to infer the domain and feature set

Synthesize a 2–3 sentence product description: what it does, who it's for, the core problem it solves.

### Step 2 — Confirm scope with the user

Ask:
- **Depth vs breadth**: 3–5 deep (thorough analysis per competitor) or 10+ wide (market mapping, lighter coverage)?
- **Any known competitors** to include?
- **Any to exclude**?

### Step 3 — Find competitors

Search using multiple angles:
- `"[product category] software alternatives"`
- `"best [product category] tools [current year]"`
- `"[product category] competitors comparison"`
- `site:g2.com "[product category]"` or `site:capterra.com "[product category]"`
- `"[product category] vs"` — often surfaces review/comparison pages

Build a candidate list, then narrow to the top N by relevance and market presence.

### Step 4 — Research each competitor

For each competitor, run two research tracks in parallel:

**Track A — Their own site** (headless, no visible browser):
```
/browse https://competitor.com
/browse https://competitor.com/pricing
/browse https://competitor.com/features
```
Capture: hero headline (exact), subheadline, CTA, tone of voice, pricing tiers, notable features, integrations, ICP signals from case studies or "built for X" pages.

**Track B — What real users say:**
```
WebSearch: site:g2.com "[Competitor Name]" reviews
WebSearch: site:capterra.com "[Competitor Name]"
WebSearch: site:reddit.com "[Competitor Name]" OR "[Competitor Name]" complaints problems
WebSearch: site:news.ycombinator.com "[Competitor Name]"
```
Mine for recurring complaints, praised strengths, and switching reasons. These signals are more honest than marketing copy. See `references/analysis-framework.md` for what to capture.

**Track C — Screenshot** (for the HTML report):
```
/browse --screenshot https://competitor.com
```
Save the screenshot path for use in the HTML dashboard's design section.

**If a pricing page is behind a login:** note "pricing not publicly listed" and use G2/Capterra user-reported pricing. Note the source.

### Step 5 — Choose output format

After research, ask:
> "Analysis complete. How would you like the report?
> 1. **Markdown** — structured `.md` file saved to the project root
> 2. **HTML dashboard** — beautiful interactive website saved as `competitor-analysis.html`"

### Step 6 — Generate output

**Markdown:** Use the report structure in `references/analysis-framework.md`.

**HTML dashboard:** Copy `assets/report-template.html` to the project root as `competitor-analysis.html`. Fill in **only** the `DATA` JSON object at the top of the `<script>` block. Do not modify the rendering code below it. The template self-renders from the data.

### Step 7 — Persist data to `.claude/`

After generating any output, always save `.claude/competitor-data.yaml` using the format in `references/analysis-framework.md`. This file:
- Feeds `marketing-skills:competitor-alternatives` when writing SEO/comparison pages
- Enables delta comparison on future re-runs (what changed since last analysis?)
- Serves as a single source of truth for all competitive context in the project

## Tips

- Capture **exact quotes** for hero headlines and CTAs — wording is the whole point of the copy analysis.
- Design scores (1–10) consider: visual polish, information clarity, modernity, and apparent onboarding quality. See scoring rubric in the analysis framework.
- For gap analysis, think bidirectionally: what does this product uniquely offer, and what are competitors doing that this product doesn't yet?
- If the user wants a PDF of the HTML report, tell them to use browser print → Save as PDF.
- Reddit/HN complaints are often more valuable than G2 — users vent honestly there.
