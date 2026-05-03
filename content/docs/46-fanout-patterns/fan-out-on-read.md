---
title: "Fan-out on Read"
description: "Pull-style feed delivery: store posts once, query the union of followed authors at read time. Best when followers >> readers — solves the celebrity problem but at higher read cost."
---

> Topic: Key Concept · Category: Fan-out Patterns · Difficulty: Foundational

## TL;DR
**Fan-out on read** (a.k.a. **pull fan-out**) is the inverse of fan-out-on-write: posts are stored **once** in the producer's outbox; at read time, a viewer's feed is computed by **querying the posts of everyone they follow** and merging the results. Writes are **O(1)** (just append to author's outbox), reads are **O(F × posts)** where F = followed authors. It's the right choice when **fan-out is huge** (Beyoncé has 200M followers; pre-pushing to every follower would crush the system) or when **the recipient set is unstable / very large**. The downside is read latency and read amplification, mitigated with caching, ranking shortcuts, and hybrid strategies.

## What problem does it solve?
- **Celebrity problem.** Fan-out-on-write to 200M followers is impractical. Fan-out-on-read computes only what's actually read.
- **Inactive recipients waste work.** Why fan out to 199M who'll never open the app today?
- **Storage** — one copy per author, not N copies per follower.
- **Volatile ranking / personalization** — if you re-rank at read time anyway, pre-baking is wasted.
- **Edits / deletions** — single source of truth; no reconciliation across N caches.

## How it works

```text
User A posts tweet T:        ┌──> append to outbox:A (T)
                             └─── done (no fan-out)

Reader F opens timeline:
  follows(F) = [A, B, C, …, X]    (let's say 200 authors)
  for each author in follows(F):
      fetch latest N from outbox:author
  merge → sort → cache (briefly) → return top N
```

1. Author posts → write to **author's outbox** (their own timeline).
2. Reader requests feed → fetch the followed authors' outboxes, merge.
3. Cache the merged result for a short TTL (e.g., 60s) so re-renders are O(1).

## When to use it (real-world examples)
- **Celebrity feeds.** Twitter uses fan-out-on-read for accounts with very large follower counts (where fan-out-on-write would be O(200M)).
- **News aggregators (RSS readers, Hacker News, Reddit-style).** A reader's "front page" is computed from many sources.
- **Search-style feeds.** Algorithmic feeds (TikTok For You, Twitter For You) are essentially fan-out-on-read with ML re-ranking at the merge step.
- **Email "search across all senders"** — query mailboxes by sender; aggregate.
- **GitHub activity feeds** — fetch from followed users / orgs.
- **Stock tickers / market feeds** — pull latest per-symbol.
- **Weather aggregators** — pull from per-station sources.
- **Multi-tenant logging dashboards** — pull from per-tenant logs at read time.
- **CDN "pull origin" caches** — origin pulls from upstream when a request comes in.
- **Federated systems (ActivityPub / Mastodon servers)** — each server queries upstream for unfetched posts.

## When NOT to use it
- **Read >>> write** with normal fanout — fan-out-on-write is way faster on the read side.
- **Tight read SLA** (p99 < 50ms) on heavy followers — pull merge with 200 authors at read time blows the budget.
- **Highly active reader cohort** — every read pays the merge cost; if 100M users open the feed every minute, that's 100M × F merges.
- **Stable / pre-rankable feeds** — pre-baking would work fine.
- **Tiny systems** — overkill.

## Things to consider / Trade-offs
- **Read amplification.** With F follows, naive read = F queries. Mitigations:
  - **Per-author timelines + bulk multi-get.**
  - **Cache the merged result** for a short TTL.
  - **Fan-out-on-read only for celebrities; fan-out-on-write for normals (= [hybrid](/docs/46-fanout-patterns/hybrid-fanout)).**
  - **Index by `(follower_set_signature, time-window)`** — niche.
- **Latency budget.** Each per-author fetch is a few ms; 200 authors × 5ms = 1s. Use:
  - **Parallelism** — issue all queries concurrently; bound by max_concurrency.
  - **Top-N pruning** — get only top 10 per author, then merge to top 50.
  - **Recency filter** — only fetch posts from last 24h.
- **Result cache** — short TTL on the merged feed page; refresh on user pull-to-refresh.
- **Sort + dedup** — naive merge can produce duplicates if a post is shared.
- **Personalization** — re-rank at read time using ML model + user signals.
- **Followee-set explosion** — huge follow lists (>10K) are expensive to merge; cap or paginate.
- **Pagination** — scrolling deeper pages requires merge over a wider time window; expensive.
- **Cross-shard merge** — if outboxes are sharded, merge crosses shards.
- **Database load** — every reader pulls from every author's outbox; can become the bottleneck.
- **Cold-start** — new follow → first read is uncached and slow.
- **Caching the negative** — "no posts in last 24h from author X" should be cached too.

## Common pitfalls
- **Naive synchronous loop** — 200 sequential queries → 1+ seconds; always parallelize.
- **No pagination cap** — user scrolls to "page 50" → merge across hundreds of thousands of posts.
- **Forgetting to dedupe** — same post via retweet shows up twice.
- **Merge without sort** — order of items unstable across reads.
- **Treating all authors equally in cache TTL** — celebrity authors update faster than dormant ones.
- **Crashing when one source is slow** — bound per-source timeout; show partial results.
- **Authentication / permission checks at merge time** — if you forget, leaked posts.
- **Stampede on cache miss** — many readers refresh at the same moment; use [singleflight](/docs/41-caching/caching-strategies).

## Interview Cheat Sheet
- **One-liner:** at read time, query everyone you follow + merge + rank; no pre-built timeline.
- **Trade-off:** O(1) write, O(F) read; storage = 1× per post.
- **Best for:** celebrity authors, volatile ranking, large/unstable recipient sets.
- **Bad for:** read-dominant workloads on normal-follower authors.
- **Real-world:** Twitter (for celebs), TikTok For You (with ML), Hacker News, RSS aggregators, GitHub activity, ActivityPub / Mastodon.
- **Mitigations:** parallel multi-get, top-N per author, merged-page cache (short TTL), recency filter, ML re-rank.
- **Hybrid** with fan-out-on-write is what real social-media production looks like.

## Related concepts
- [Fan-out on Write](/docs/46-fanout-patterns/fan-out-on-write) — the opposite strategy.
- [Hybrid Fan-out](/docs/46-fanout-patterns/hybrid-fanout) — combine both.
- [Caching Strategies](/docs/41-caching/caching-strategies) — short-TTL merge cache; singleflight for stampede.
- Concrete: Twitter timeline architecture (mixed), Reddit / HN front-page algorithms, ActivityPub / Mastodon, RSS aggregators.
