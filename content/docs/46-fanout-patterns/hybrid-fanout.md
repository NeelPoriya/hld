---
title: "Hybrid Fan-out"
description: "What real production social media uses — fan-out-on-write for normal authors, fan-out-on-read for celebrities, dynamically chosen by follower count. The Twitter / Instagram timeline architecture."
---

> Topic: Key Concept · Category: Fan-out Patterns · Difficulty: Foundational

## TL;DR
**Hybrid fan-out** combines [fan-out on write](/docs/46-fanout-patterns/fan-out-on-write) and [fan-out on read](/docs/46-fanout-patterns/fan-out-on-read) so each gets used where it's cheap. Most authors have moderate follower counts → fan-out-on-write to pre-build timelines (fast reads, cheap writes). A small number of **celebrity / mega-authors** have enormous follower counts → fan-out-on-write would be catastrophic, so their posts are pulled at read time. The reader's timeline is **(pre-built timeline) ∪ (fresh posts from followed celebrities)**, merged + ranked. This is how **Twitter, Instagram, Facebook, LinkedIn, TikTok** actually deliver feeds at scale.

## What problem does it solve?
- **Pure fan-out-on-write breaks for celebrities.** 200M followers × 1 post = 200M writes — impractical.
- **Pure fan-out-on-read is too slow** for normal accounts that most users actually follow.
- **Combining gets the best of both:** fast reads for the 99% case + bounded write cost for the 1% celebrity case.

## How it works

```text
Author X posts:
   if follower_count(X) < THRESHOLD (say 100K):
      → fan-out-on-write: push to each follower's timeline cache
   else (X is a celebrity):
      → only append to outbox:X (no per-recipient writes)

Reader R opens timeline:
   timeline_cache:R                                  (fan-out-on-write portion)
   ∪
   { recent posts from celebrities R follows }       (fan-out-on-read portion)
   →  merge + sort by ranker → return top N
```

1. **Decision at write time:** based on `author.follower_count`, choose write or read fan-out.
2. **Pre-built timeline cache** holds posts from non-celebrity follows.
3. **Read time merger** pulls recent celebrity outboxes and merges with the cache.
4. **Ranker** (chronological, ML, hybrid) decides final order.

## When to use it (real-world examples)
- **Twitter** — the canonical example. Twitter Engineering blog described "Earlybird" + "Timeline Service" mixing strategies.
- **Instagram feed** — push to most followers; pull for high-fanout accounts and ranking-driven personalization.
- **Facebook News Feed** — historically hybrid; modern ML-ranked feed essentially merges multiple sources.
- **LinkedIn feed** — fan-out-on-write for normal connections + fan-out-on-read for high-influence sources.
- **TikTok For You** — beyond classic hybrid; an ML model fan-outs-on-read by candidate generation.
- **Slack / Discord** — channel messages are fan-out-on-write per recipient unread state, while channel browsing pulls from channel outbox.
- **Pinterest home feed** — combines pre-baked + on-demand sources.
- **Streaming platforms (Twitch / YouTube subscriptions)** — pre-deliver channel updates to most subs; high-fanout creators pulled.
- **Email digest** — daily digest is essentially "fan-out-on-read at digest time" combined with realtime pushes.
- **Internal feed dashboards** in big SaaS — "what's happening across teams" hybridizes per-team push and ad-hoc pull.

## When NOT to use it
- **Small system or uniform follower distribution** — pick one strategy and live with it; hybrid adds complexity.
- **No clear bimodal distribution** — if all authors have ~similar follower counts, pure write or pure read is simpler.
- **Tight team / limited ops budget** — hybrid is two systems instead of one.
- **Append-only feeds without personalization** — simpler architectures suffice.

## Things to consider / Trade-offs
- **Threshold choice.** Where is the cutoff? Fixed (e.g., 100K) or adaptive (cost-per-fanout)? Twitter's threshold has shifted over time as infra cost / capacity changed.
- **Multiple thresholds** — some systems classify authors into 3 buckets (normal, popular, celebrity) with different strategies.
- **Edge cases:**
  - Author crosses threshold → mid-flight migration of their fan-out behavior.
  - Reader follows many celebrities → read-time merge cost spikes.
  - Bot / spammer accounts at high follower count → use threshold differently (e.g., gated on activity).
- **Cache layout.** Per-recipient timeline cache for write-fanned posts + per-author outbox for read-fanned posts.
- **Merge complexity.** At read time, fetch from N+1 sources (1 timeline cache + N celeb outboxes); parallelize.
- **Backfill on follow** — when reader follows celebrity X, no past data in their cache; pull on first read.
- **Unfollow** — for write-fanned posts already pushed, lazy filter at read time (drop posts from unfollowed authors).
- **Edits / deletes** — push deletes for write-fanned (or filter at read); celebs are easier (single source).
- **Ranking / personalization** is independent of fan-out strategy; usually applied at the merge step.
- **Pagination** — scrolling deep pages requires both extending cache + extending celebrity pull window.
- **Author tier change** — when author count crosses threshold, freeze fan-out, reclassify, resume; many real systems do "soft cutoff" with overlap.
- **Cost / observability** — separately track fan-out write cost (per-author tier) and read merge cost (per-reader follow profile).

## Common pitfalls
- **Single threshold, no gradient** — cliff effects at exactly 100K followers.
- **Forgetting to handle threshold-crossing authors** — they accumulate orphan timelines.
- **Read merge ignoring rate limits** — bursty celeb posting + many readers = origin overload.
- **Not caching the merge result** — every page-open re-merges.
- **Different ranking for the two halves** — pre-baked is chronological but celeb pull is ML-ranked → inconsistent UX. Re-rank both together at merge.
- **Cache eviction during merge** — partial timeline + missing celeb posts = inconsistent feed; re-hydrate.
- **Backfill not bounded** — newly-followed celeb dumps year of posts into reader's view.
- **Cross-region reads** — celeb outbox in another region adds latency; replicate.
- **Fanning out to inactive followers** — wastes the entire benefit; filter on activity.

## Interview Cheat Sheet
- **One-liner:** small authors push (fan-out-on-write); celebrities pull (fan-out-on-read); merged at read time.
- **Cutoff:** based on follower count (and sometimes posting cadence / cost).
- **Reader's feed:** `timeline_cache ∪ recent_celebrity_outboxes` → ranker → top N.
- **Real systems:** Twitter, Instagram, LinkedIn, Facebook, TikTok (with ML beyond classic hybrid).
- **Trade-off:** more complex than pure write or pure read, but only practical option at scale.
- **Edge cases:** threshold crossings, follow / unfollow, edits / deletes, ranking consistency.
- **Pair with:** [Caching](/docs/41-caching/caching-strategies) for the merged result, ML / rule-based ranker for ordering.

## Related concepts
- [Fan-out on Write](/docs/46-fanout-patterns/fan-out-on-write) — first half of the strategy.
- [Fan-out on Read](/docs/46-fanout-patterns/fan-out-on-read) — second half.
- [Caching Strategies](/docs/41-caching/caching-strategies) — short-TTL cache on merge.
- [Sharding](/docs/42-data-distribution/sharding-and-partitioning) — outboxes typically sharded by author.
- Reading: Twitter's "Timelines at Scale" blog post; Instagram engineering on feed delivery.
