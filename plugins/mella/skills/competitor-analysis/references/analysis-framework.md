# Analysis Framework

## Per-competitor data checklist

Collect the following for each competitor. Mark gaps explicitly ("not listed", "behind login", etc.) rather than omitting.

### Identity
- Company name & website URL
- ICP (inferred from hero copy, case study logos, pricing tiers, "built for X" language)
- Funding/stage (if visible — often on About or press pages)
- Homepage screenshot path (from `/browse --screenshot`)

### Copywriting & Positioning
- Hero headline — **exact quote**
- Subheadline / value prop — **exact quote**
- Primary CTA button text — **exact quote**
- Tone of voice (e.g. "casual and witty", "enterprise-formal", "developer-technical", "warm and human")
- Key differentiators they claim (what they say sets them apart)

### Pricing
- Free tier or free trial? (yes/no + details: days, card required, seats included)
- Pricing model (per seat, usage-based, flat rate, tiered usage)
- For each paid tier: name, monthly price, annual discount %, key limits/quotas, top 3–5 included highlights
- Enterprise / custom tier available? (yes/no)
- Pricing transparency (public / partial / hidden behind sales)

### Features & Integrations
- Top 5–8 notable features (from their own marketing, not assumed)
- Key integrations they advertise
- Features they emphasize most in hero/features pages

### Design Score (1–10)

| Criterion | Max pts | What to assess |
|---|---|---|
| Visual polish | 3 | Whitespace, typography, color harmony, consistency |
| Clarity | 3 | Navigation, info hierarchy, finding key info in <30s |
| Modernity | 2 | Design language feels current vs dated |
| Onboarding UX | 2 | How clear is the path from homepage → signup/trial |

### Review site intelligence

After visiting their site, search for real user sentiment:

```
site:g2.com "[Competitor Name]" reviews
site:capterra.com "[Competitor Name]"
site:reddit.com "[Competitor Name]" problems OR complaints OR "switching from"
site:news.ycombinator.com "[Competitor Name]"
```

Capture:
- **Top praised themes** (what users consistently love)
- **Top complaint themes** (what users consistently hate — these are your attack surfaces)
- **Common switching reasons** (why people leave — and where they go)
- G2/Capterra star rating if visible

Review intelligence often reveals weaknesses that never appear in marketing copy. Prioritize this over design speculation for the weaknesses field.

### Strengths & Weaknesses

Draw from *both* their own marketing **and** review site intelligence:

- 3–5 strengths (things they genuinely do well)
- 3–5 weaknesses (gaps, recurring complaints, things they don't address) — cite source where useful: "(G2 reviews)" or "(Reddit)"

### Battlecard
- **Their pitch**: 1-sentence self-description (from their own copy)
- **Your counter**: 1-sentence why you're a better fit for shared prospects
- **You win when**: The scenario/context/buyer type where you clearly win
- **They win when**: Honest scenario where they'd genuinely be chosen over you

---

## Gap Analysis (product-level, after all competitors)

**You have, they don't**: Capabilities unique to this product. Potential differentiation strengths — lean into these in positioning.

**They have, you don't**: Features that most/all competitors offer. May be table-stakes gaps worth addressing or deprioritizing based on ICP fit.

**Differentiation angles**: 2–3 concrete positioning angles or messaging strategies derived from the gaps. Be specific.

---

## Markdown Report Structure

Use this structure for the Markdown output:

```
# Competitor Analysis: [Product Name]
*Analyzed: [YYYY-MM-DD] · [N] competitors · [depth/breadth] analysis*

## Executive Summary
[2–3 paragraphs: overall market landscape, where this product sits, key themes across competitors, top 2–3 strategic takeaways]

## Competitor Overview
| Competitor | ICP | Price Range | Design | Free Tier? |
|---|---|---|---|---|
| Name | ... | $X–$Y/mo | 7/10 | ✓ 14-day |

---

## [Competitor Name]
**[Their tagline]** · [website URL]

### Overview
[2–3 sentences: what they do, ICP, notable market position]

### Copywriting & Positioning
> "[Hero headline exact quote]"
> "[Subheadline exact quote]"
**CTA:** "[exact CTA text]"
**Tone:** [description]
**Key claims:** [what they say differentiates them]

### Pricing
[Tier table + model description + free tier details]

### Features
[Top features list + integrations]

### Design: [X]/10
[Notes on what's strong/weak]

### User Sentiment
**Praised:** [top themes from G2/reviews]
**Complained about:** [top complaint themes + sources]
**Common switching reasons:** [why people leave]

### Strengths
- ...

### Weaknesses
- ... (G2) / ... (Reddit)

### Battlecard
| | |
|---|---|
| Their pitch | ... |
| Your counter | ... |
| You win when | ... |
| They win when | ... |

---
[Repeat for each competitor]

## Gap Analysis

### You Have, They Don't
- ...

### They Have, You Don't
- ...

### Recommended Differentiation Angles
1. ...
2. ...
3. ...

## Feature Matrix
[Full feature × competitor table with ✓ / ✗ / ~ (partial)]
```

---

## `.claude/competitor-data.yaml` Format

Always save this file after completing analysis. It is the single source of truth for competitive context in this project.

```yaml
analyzedAt: "YYYY-MM-DD"
product:
  name: "Your Product"
  tagline: "Your tagline"
  description: "2–3 sentence description"
  icp: "Who you target"
  pricing:
    tiers:
      - name: "Free"
        price: "$0/mo"
        highlights: ["Feature A", "Feature B"]
      - name: "Pro"
        price: "$29/mo"
        highlights: ["Everything in Free", "Feature C"]
  strengths: ["Strength 1", "Strength 2"]
  uniqueFeatures: ["Only you have this 1", "Only you have this 2"]

competitors:
  - name: "Competitor A"
    url: "https://example.com"
    icp: "Who they target"
    screenshotPath: ".claude/screenshots/competitor-a.png"
    heroHeadline: "Their exact hero headline"
    valueProp: "Their subheadline (exact)"
    cta: "Their CTA text"
    toneOfVoice: "casual and friendly"
    designScore: 7
    designNotes: "Clean but dated navigation..."
    reviewRating: "4.3/5 on G2 (450 reviews)"
    reviewPraised: ["Great onboarding", "Responsive support"]
    reviewComplaints: ["Slow reporting", "Pricing unclear"]
    switchingReasons: ["Lack of X feature", "Price increases"]
    pricing:
      hasFree: true
      freeDetails: "14-day trial, no card"
      model: "per seat"
      hasEnterprise: true
      tiers:
        - name: "Starter"
          price: "$19/mo"
          annualDiscount: "20% off"
          limits: ["5 users", "10GB"]
          highlights: ["Feature A", "Feature B"]
    features:
      notable: ["Feature X", "Feature Y"]
      integrations: ["Slack", "GitHub"]
      emphasized: ["Their main marketing hook"]
    strengths: ["Strong brand", "Generous free tier"]
    weaknesses: ["No mobile app (G2)", "Slow support (Reddit)"]
    battlecard:
      theirPitch: "One sentence their self-description"
      yourCounter: "One sentence your counter"
      youWinWhen: "When buyer needs X"
      theyWinWhen: "When buyer needs Y"

featureMatrix:
  features: ["Feature 1", "Feature 2", "Feature 3"]
  coverage:
    "Your Product": [true, true, false]
    "Competitor A": [true, false, true]

gapAnalysis:
  youHaveTheyDont:
    - "Unique capability 1"
    - "Unique capability 2"
  theyHaveYouDont:
    - "Gap 1 (Competitor A, B)"
    - "Gap 2 (Competitor C)"
  differentiationAngles:
    - "Angle 1: ..."
    - "Angle 2: ..."

summary: "Executive summary paragraph."
```

---

## Design Score Reference

| Score | Description |
|---|---|
| 9–10 | Exceptional — Stripe / Linear / Vercel tier polish |
| 7–8 | Strong — clearly invested, modern, few rough edges |
| 5–6 | Adequate — functional but dated or inconsistent |
| 3–4 | Weak — cluttered, confusing, or visually dated |
| 1–2 | Poor — hard to use, damages trust |
