# Audit Report Template

Output this structure verbatim, filled in. Omit sections marked *(omit if empty)*. No triple-backtick fences — they break table and bold rendering.

Severity key: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🔵 INFO

---

## 🔍 `{{BRANCH}}` audit · {{DATE}}

`{{DIFF_BASE}}` · {{parallel|sequential}} · PR {{#N|—}}

✅ **Ran:** {{skill, skill, …}}
⏭️ **Skipped:** {{skill (reason), … | —}}
❌ **Failed:** {{skill (error), … | —}}

---

## ⚔️ Conflicts *(omit if empty)*

| File:Line | {{Skill A}} | {{Skill B}} |
|---|---|---|
| `path/file.ts:42` | Do X | Do Y |

---

## 🔎 Findings *(omit if empty)*

| ID | | File:Line | Issue | Skills | Action |
|---|---|---|---|---|---|
| A1 | 🔴 | `path/file.ts:10` | Short description | security-review | Fix it |
| A2 | 🟠 | `src/user.ts:55` | Short description | code-review | Fix it |

*Sorted: 🔴 → 🟠 → 🟡 → 🔵*

---

## 📊 Stats

🔴 **{{N}}** · 🟠 **{{N}}** · 🟡 **{{N}}** · 🔵 **{{N}}** · Total **{{N}}**

| Skill | 🔴 | 🟠 | 🟡 | 🔵 |
|---|---|---|---|---|
| security-review | N | N | N | N |
| code-review | N | N | N | N |
| laravel-best-practices | N | N | N | N |
| pr-review-toolkit | N | N | N | N |

*Omit skill rows not in this run.*
