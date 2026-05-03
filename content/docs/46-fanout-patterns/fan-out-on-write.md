---
title: "Fan-out on Write"
description: "Push-style feed delivery: precompute personalized timelines at write time and cache them per-recipient. Best when read >> write — the canonical Twitter / Instagram timeline pattern."
---

> Topic: Key Concept · Category: Fan-out Patterns · Difficulty: Foundational

## TL;DR
**Fan-out on write** (a.k.a. **push fan-out**) is a feed-delivery strategy: when a producer creates content (tweet, post, message), the system **immediately writes a copy of that content (or a pointer to it) into every consumer's personalized feed/inbox**. Reads are then **O(1)** — fetch the recipient's pre-built timeline. The cost moves to write time, which is fine when **reads >> writes** (typical social-feed ratios are 100:1 to 1000:1). Used for **Twitter timelines**, **Instagram feeds**, **Facebook News Feed (historically)**, **LinkedIn feed**, **WhatsApp/Slack message delivery**, **chat inbox**, **Discord channel cache**.

## What problem does it solve?
- **Read latency.** Fetching a feed shouldn't require querying every person you follow at read time.
- **Read amplification.** A user with 1000 follows shouldn't issue 1000 queries on every page-open.
- **Hot DB on read** — fan-out-on-read can melt the DB on big-account followers.
- **Personalization at scale** — pre-rank / pre-deduplicate at write time when CPU is cheap and asynchronous.

## How it works

```text
User A posts tweet T:

      Producer             Fanout worker              Per-recipient cache
        │                       │                            │
        ├──> Tweet store ───────┤                            │
        │   (T persisted)       │                            │
        │                       ├──> get followers(A)        │
        │                       │       (10K users)          │
        │                       │                            │
        │                       ├──> for each follower F:    │
        │                       │       LPUSH timeline:F  T  ├─> Redis / Memcached
        │                       │       (truncate to 800)    │
        │                       │                            │

Reader F:
        │   GET /timeline       │                            │
        │   ◄─────── O(1) read ─┘                            │
                                                             │
                                                          (LRANGE)
```

1. **Tweet** is written to a durable store (tweets table, sorted by `tweet_id`).
2. A **fan-out worker** (often async, via Kafka / RabbitMQ) reads each follower of the author.
3. For each follower, **insert tweet_id (or denormalized record) into their pre-computed timeline cache** (Redis list / sorted set).
4. **Read path:** user F opens timeline → fetch top N from `timeline:F` → done. No expensive aggregation.

## When to use it (real-world examples)
- **Twitter** — for users with **few followers** (the vast majority); pre-fans-out tweets to followers' Redis timelines.
- **Instagram feed** — push-based for most users.
- **WhatsApp / Signal / Telegram** message delivery — sender's message is fanned out to each recipient's inbox.
- **Slack / Discord channel messages** — written to per-channel + per-recipient unread-state.
- **Email inbox** — emails delivered to each recipient's mailbox at send time (the original fan-out-on-write).
- **Notification systems** (push notifications) — write to per-device queue.
- **Order events to multiple downstream services** — order created → fan out to inventory, shipping, billing, analytics.
- **Chat group "unread count"** — incremented per recipient at write.
- **LinkedIn feed for low-fanout users.**
- **YouTube subscription notifications** — pre-pushed to subscribers.
- **Ride-hailing dispatch** — ride request fanned out to nearby drivers' inboxes.

## When NOT to use it
- **Celebrity / mega-account followers** — Beyoncé tweet × 200M followers = 200M writes. **The "fan-out-on-write" approach explodes for high-fanout authors.** Twitter solves this with [hybrid fan-out](/docs/46-fanout-patterns/hybrid-fanout).
- **Inactive users dominate** — fan out to 200M followers but 1M actually open the app today → 199M wasted writes.
- **Volatile preferences** — if "what to show" is computed at read time (ML personalization, dynamic ranking), pre-baking is wrong.
- **Heavy edits / deletes** — every edit needs to fan out a correction; complicated.
- **Storage is expensive** — N copies of every post in N timelines balloons storage.
- **Write rate >> read rate** — you're optimizing the wrong side; use [fan-out on read](/docs/46-fanout-patterns/fan-out-on-read) instead.

## Things to consider / Trade-offs
- **Write amplification = N (followers).** A 10K-follower author = 10K writes per post.
- **Truncate timelines** — Redis cache holds last 800 items; older items hydrated from DB on demand.
- **Async fan-out** — never do it synchronously in the post request; queue + worker.
- **Per-recipient deduplication** — fan-out should not double-write retried posts (idempotency on `(post_id, recipient_id)`).
- **Eventual consistency** — recipient sees the post seconds after author posts. Usually fine.
- **Backpressure** — bursty fan-out (an author with 10K followers tweets 10× in a minute) → worker queue spike.
- **Storage** — N timelines × M items each = N×M total entries; design TTL / pagination.
- **Privacy / blocking** — must filter at fan-out (`is_blocked(author, recipient)`) or at read-time.
- **Re-rank on read** — pre-built timeline can be re-ranked at read time (chronological → ML-ranked), keeping fan-out simple but read smarter.
- **Cache miss path** — if timeline cache is cold or evicted, must reconstruct via fan-out-on-read fallback.
- **Cross-region** — fan-out across regions is expensive; usually region-local with cross-region replication of the source content.
- **Combine with hybrid fan-out** for heavy-tailed follower distributions.

## Common pitfalls
- **Synchronous fan-out in the post request** — tweet takes 30s for high-follower users.
- **Forgetting to bound timeline size** — Redis grows unboundedly.
- **Counting fan-out cost** as zero — bursty senders blow up worker queues.
- **Treating all users equally** — fan-out to inactive accounts wastes work; gate on "user opened app in last 30 days."
- **Not filtering blocked / muted** at fan-out time — recipient sees blocked content.
- **Single Redis = SPOF** — replicate; failover.
- **Edit / delete of source post** — every recipient timeline still has the old copy unless you fan-out the edit too.
- **Replay storms during backfill** — be careful with bulk re-fan-out.

## Interview Cheat Sheet
- **One-liner:** at write time, push the post into every recipient's pre-built timeline cache; read is O(1).
- **Trade-off:** fast reads, expensive writes; storage = N copies.
- **Best for:** read >>> write, normal-fanout authors (≤ ~10K followers).
- **Bad for:** celebrities (giant fanout), inactive recipients, volatile ranking.
- **Real-world:** Twitter (for non-celebs), Instagram, WhatsApp, Slack, Discord, push notifications, email inbox.
- **Implementation:** async fanout worker reads followers + LPUSH/ZADD into Redis timeline; truncate at N.
- **Hybrid** with fan-out-on-read for celebrity authors.

## Related concepts
- [Fan-out on Read](/docs/46-fanout-patterns/fan-out-on-read) — the opposite strategy; pull at read time.
- [Hybrid Fan-out](/docs/46-fanout-patterns/hybrid-fanout) — combine both based on author's follower count.
- [Caching Strategies](/docs/41-caching/caching-strategies) — timelines are caches.
- Concrete: Twitter Engineering posts on timeline fan-out, Discord's per-channel cache, Redis-backed timelines.
