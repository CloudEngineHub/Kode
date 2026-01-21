---
name: doc-coauthoring
description: A structured workflow for co-authoring high-signal docs (PRD, RFC, design docs, proposals, decision records). Use when the user needs to turn messy context into a readable artifact with clear goals, tradeoffs, and next steps. Emphasizes context capture, outline-first drafting, and context-free reader testing to catch blind spots.
license: Complete terms in LICENSE.txt
---

# Doc Co-Authoring

Turn partial context into a clear document by following a staged workflow. Keep the user in control of decisions, and optimize for a doc that works for readers who do **not** share the author’s context.

## Triggers

Use this workflow when the user asks to:

- write or refine documentation, proposals, RFCs, PRDs, decision docs, specs
- “summarize our discussion into a doc”
- “make this readable for others” / “share with the team”
- create a template or standard for recurring documents

If the user explicitly wants freeform writing, keep the workflow lightweight (ask fewer questions; draft faster).

---

## The Workflow (3 stages)

### Stage 1 — Context Capture (close the gap)

Goal: collect the minimum context required to write a doc that is correct, scoped, and actionable.

Ask for:

1. **Doc type + goal**: what is this document for, and what decision/action should it unlock?
2. **Audience**: who will read it, and what do they already know?
3. **Constraints**: deadlines, non-goals, dependencies, security/compliance, platform limits.
4. **Current state**: what exists today? what’s broken? what’s missing?
5. **Options considered**: at least 1–2 alternatives and why they may/ may not work.
6. **Success criteria**: how we know it worked (metrics, user outcomes, acceptance tests).
7. **Open questions**: unknowns that block writing certain sections.

Output of Stage 1:

- a short “context snapshot”
- a list of open questions (ranked by importance)
- a proposed doc outline (1 screen)

### Stage 2 — Outline-First Drafting (iterate by section)

Goal: draft a document in layers without losing coherence.

Rules:

- **Outline before prose**. Do not write full paragraphs until the outline is agreed.
- **One section at a time**. Draft → review → revise, then move on.
- **Maintain a decision log** (small bullet list) so changes are explicit.
- **Keep unknowns visible**: unresolved items stay in an “Open Questions / Risks” section, not hidden.

Recommended iteration loop per section:

1. Write a 3–7 bullet “section intent” (what this section must answer).
2. Draft the section (short, concrete).
3. Ask the user for a quick pass: “What’s wrong / missing / too detailed?”
4. Revise and update the decision log.

### Stage 3 — Reader Testing (catch blind spots)

Goal: validate readability and completeness for a reader without the author’s context.

Method:

- Prepare a **clean-context review prompt**: “You are a reviewer with no prior context. Read this doc and identify: missing context, unclear terms, ambiguous decisions, hidden assumptions, and where you’d ask questions.”
- If sub-agents are available, run the review in a fresh agent session. Otherwise, run the review yourself by explicitly pretending you have _no access_ to prior conversation.

Output of Stage 3:

- a short list of fixes (highest leverage first)
- revised doc with clarified assumptions, terms, and decisions

---

## Default Section Templates

Load `references/templates.md` and pick the closest template:

- Decision record (ADR-lite)
- Product requirements (PRD-lite)
- Technical design / RFC
- Proposal / pitch

## Quality Bar (what to optimize for)

The doc should make it easy for a reader to answer:

- What problem are we solving, for whom, and why now?
- What are we proposing, and what are we not doing?
- What options did we consider, and what tradeoffs drive the choice?
- What are the risks, unknowns, and mitigations?
- What are the next steps and owners?
