# ADR-001: AI Prioritization Layer

**Date**: 2026-04-14
**Status**: Accepted

## Context

The Prospect Tracker has two complementary but static sorters: `calcScore()` ranks records by enrichment quality (rating, reviews, email/phone presence, chain flag), and `autoAssignDay()` picks a density anchor and fills a day from concentric radii. Together they are good at "who has signal" and "how to sweep them geographically," but neither reads behavioral context. Free-text notes on canvass stops (`notesLog`), last-contact timestamps, and overdue "come back later" follow-ups all sit unused when the next day is planned. Result: obvious follow-ups get missed and qualitative field intelligence never reshapes priority.

## Decision

Add an AI layer as an additive pre-filter that feeds the existing geo planner. The AI does not mutate scores, priorities, or `autoAssignDay`. It proposes a candidate set; geo still decides route shape.

Three architectural commitments:

1. **Hosted proxy, not client-side key.** A new standalone Vercel project (`prospect-tracker-api`) exposes `POST /api/rank`. The Anthropic key lives only in that project's env. The Capacitor APK and GitHub Pages build call the proxy. No key is ever baked into a client bundle.
2. **Two output modes, ship both.** Mode `rank` returns a ranked shortlist + one-line reasons (Haiku 4.5, fast). Mode `brief` returns a narrative daily briefing + highlights (Sonnet 4.6, extended thinking). The user evaluates side-by-side and we converge on the preferred mode after real-field use.
3. **Derive signals at call-time; do not migrate the schema.** The signals a smart ranker needs — `lastContact`, `touchCount`, `daysSinceContact`, `overdue`, `recentNotes` — already live on `prospect.canvass_stops`. A pure `deriveSignals(record, stops)` function joins them per call. No new columns on Record. No second source of truth.

## Consequences

**Positive**
- Scoring and routing remain pure and tested — no regression risk.
- Key rotation is a 30-second `vercel env` operation; APKs in the field need no rebuild when the key changes.
- Prompt caching on the system block (domain glossary + rules + JSON schema) amortizes the stable prefix and keeps per-call cost low for repeat sessions.
- Adding new signals later (e.g., conversion frequency) requires only touching `signalDerivation.js`.

**Negative**
- New deployment surface (second Vercel project) adds ops footprint.
- Mobile latency on Sonnet `brief` calls can hit 5–10s; mitigated with a spinner and later streaming.
- Proxy is a single choke point — if it's down, the AI feature is down (but the geo planner still works standalone).

**Mitigations**
- Proxy is stateless and tiny; redeploy is seconds.
- Rate limit at the edge (10 req/min per IP) to contain accidental spam.
- Origin allowlist validates `capacitor://localhost` and the GH Pages domain only.

## Alternatives Considered

- **Direct client-to-Anthropic from the APK.** Rejected: any key baked into an APK is extractable. Acceptable only for strictly personal builds, and this app is multi-device (APK + GH Pages).
- **Piggyback on Demo Builder's Vercel deployment.** Rejected: couples two apps' AI budget, logs, and blast radius. Demo Builder already owns a long-running HTTP chain; adding a second app muddies debugging.
- **Persist AI-relevant fields on the Record schema (`lc`, `cf`, `fd`).** Rejected for v1: drift risk, requires a migration, and the canvass-stop side already holds the ground truth. Revisit if v2 needs AI scores that survive a full rescore.
- **Auto-trigger AI on every `autoAssignDay()` call.** Rejected: burns tokens on every click, and mobile latency hurts the interactive feel of the Planner. Manual button is cheaper and keeps the user in control of spend.

## References

- Plan: `/Users/nomad/.claude/plans/velvety-giggling-giraffe.md`
- Suite standards: `/Users/nomad/Projects/STANDARDS.md`
- Prompt caching reference: `docs/prompt-caching.md`
- Scoring (unchanged): `app/src/data/scoring.js`
- Geo routing (unchanged): `app/src/data/weekPlanner.js`
