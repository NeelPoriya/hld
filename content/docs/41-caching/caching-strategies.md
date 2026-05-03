---
title: "Caching Strategies"
description: "How and where to put a cache — cache-aside, read-through, write-through, write-back, refresh-ahead — plus invalidation, TTLs, stampede protection, and the cache hierarchies that show up in every system design."
---

> Topic: Key Concept · Category: Caching · Difficulty: Foundational

## TL;DR
A cache is a **fast, lossy copy** of data sitting closer to the consumer than the system of record. The interesting questions are not "should I cache?" but **what to cache, where, for how long, and how to keep it correct enough**. This page covers the **five canonical caching patterns** (cache-aside, read-through, write-through, write-back, refresh-ahead), **TTL + invalidation strategies**, the **cache stampede / thundering-herd problem**, and the **multi-tier cache hierarchies** (browser → CDN → reverse-proxy → app-local → distributed → DB-buffer-pool) that real systems use.

## What problem does it solve?
- **Latency** — RAM is ~100,000× faster than spinning disk; a cache hit returns in microseconds vs milliseconds.
- **Throughput / scale** — offload the database. A cache layer lets one DB serve 100× the traffic.
- **Cost** — cheaper to add a cache than shard a database.
- **Resilience** — a cache can survive a brief origin outage if it's already warm.
- **Network locality** — a CDN edge cache near the user beats any datacenter call.

## How it works (the 5 patterns)

### 1. Cache-aside (lazy loading)
App reads cache → on miss reads DB → writes back to cache. App writes DB directly (cache may be invalidated). **Most common pattern; what Redis is normally used for.**

```python
def get_user(user_id):
    user = redis.get(f"user:{user_id}")
    if user: return json.loads(user)
    user = db.query("SELECT * FROM users WHERE id=%s", user_id)
    redis.setex(f"user:{user_id}", 300, json.dumps(user))   # 5min TTL
    return user

def update_user(user_id, fields):
    db.execute("UPDATE users SET ... WHERE id=%s", user_id)
    redis.delete(f"user:{user_id}")                          # invalidate
```

### 2. Read-through
Cache itself fetches from DB on miss (app only talks to cache). Common in **Caffeine / Guava** local caches with `LoadingCache`, or in **CDN** "origin pull". App is simpler but cache becomes critical.

### 3. Write-through
Every write goes to both cache and DB synchronously. Cache is always fresh; writes are slower. Used in **MongoDB Atlas Cache for Cloud Storage**, some L2 CPU caches.

### 4. Write-back (write-behind)
Write hits cache only; cache asynchronously flushes to DB. **Fastest writes, weakest durability.** Used in **CPU caches**, **Redis with `appendfsync everysec`**, **filesystem page cache**.

### 5. Refresh-ahead
Cache proactively re-fetches before TTL expires when an entry is "hot". Hides cold-cache latency. Used in **CDN cache prefetching**, **Caffeine `refreshAfterWrite`**.

## When to use it (real-world examples)
- **Product / catalog reads** (Amazon, Shopify, Etsy) — read-heavy, change-rarely; cache-aside with 1–5min TTL.
- **User session / auth tokens** (most SaaS) — Redis cache-aside, TTL = session length.
- **Hot social feeds** (Twitter, Instagram) — pre-computed cached feeds (fan-out on write).
- **Configuration / feature flags** (LaunchDarkly, Unleash) — local in-process cache + SSE invalidation.
- **CDN edge** (Cloudflare, CloudFront) — read-through HTTP cache near users.
- **Rate-limiter counters** (every public API) — Redis with sub-ms increment.
- **Database query result cache** (PostgreSQL `pg_buffercache`, MySQL InnoDB buffer pool) — built-in DB-level page cache.
- **Computed / derived values** (leaderboards, analytics tiles) — cache-aside with longer TTL + manual invalidation.
- **Geo-IP / DNS lookups** — TTL-bounded read-through.
- **Static assets** — CDN + browser cache headers.

## When NOT to use it
- **Strongly consistent reads required** (banking ledger, "is this seat booked?") — cache may serve stale data.
- **Write-heavy / hot-key workloads** — cache hit ratio collapses; you're just adding a network hop.
- **Tiny dataset** that fits in DB RAM anyway — DB buffer pool is already a cache.
- **Per-user unique data with no reuse** — every read is a miss.
- **Very large objects with cost-per-byte storage** — cache eviction will thrash.

## Things to consider / Trade-offs
- **TTL strategy** — too short = useless, too long = stale. Pick from data freshness SLA.
- **Invalidation** — Phil Karlton: *"There are only two hard things in CS: cache invalidation and naming things."* Either invalidate on every write (cache-aside delete pattern) or accept TTL-bounded staleness.
- **Eviction policy** — LRU, LFU, ARC, W-TinyLFU (Caffeine's algorithm — beats LRU significantly for hot-key workloads).
- **Cache stampede / thundering herd** — when a hot key expires, 1000 concurrent requests all miss and hammer DB. Solutions: **single-flight / singleflight pattern** (only one request fetches; others wait), **probabilistic early refresh** (refresh slightly before TTL based on RNG), **stale-while-revalidate** (serve stale + refresh in background).
- **Negative caching** — cache "not found" results too, or attackers spam non-existent keys to bypass cache.
- **Cache penetration** — attacker queries non-existent IDs forcing every request to hit DB; mitigate with Bloom filter or short-TTL negative cache.
- **Cache avalanche** — many keys expire at once. Add jitter to TTLs (`ttl = base + random(0, jitter)`).
- **Hot key** — single key gets millions of QPS; can saturate one Redis shard. Mitigate with **client-side replication** (replicate hot key to N shards and pick randomly), **request coalescing**, or **local L1 cache** in front.
- **Consistency on write** — write-through is safer than cache-aside (no race); cache-aside-then-delete is safer than cache-aside-then-update (avoid stale-write race).
- **Cache size** — total RAM × replicas; cost trade-off vs hit ratio.

## Multi-tier cache hierarchy

A real production system has **6+ levels of cache**:
1. **Browser cache** (`Cache-Control: max-age`)
2. **CDN edge cache** (CloudFront, Cloudflare)
3. **Reverse-proxy cache** (Varnish, NGINX `proxy_cache`)
4. **App-local in-process cache** (Caffeine, in-memory map)
5. **Distributed cache** (Redis, Memcached)
6. **DB buffer pool** (Postgres `shared_buffers`, MySQL InnoDB buffer pool)
7. **OS page cache** (filesystem-level)

Each layer absorbs its share of QPS; only what's left hits the database.

## Common pitfalls
- **Caching mutable user data without per-user invalidation** — User A sees User B's profile.
- **No TTL** — cache fills with cold data forever.
- **Caching the request, not the response** — different headers for the same URL produce different responses; vary by relevant headers only.
- **Using the cache as a database** — Redis is durable but not designed as primary store; expect data loss on misconfigured persistence.
- **Stale cache on deploy** — schema change + old-shape cached data → app errors. Version your cache keys (`user:v3:42`).
- **Forgetting the singleflight pattern** — your DB will eventually fall over on a popular cold key.

## Interview Cheat Sheet
- **5 patterns:** cache-aside (lazy), read-through, write-through, write-back, refresh-ahead.
- **Default pick for app-level cache:** cache-aside with TTL + delete-on-write.
- **Sub-ms reads:** Redis or Memcached with `O(1)` keys.
- **Stampede protection:** singleflight + probabilistic refresh + stale-while-revalidate.
- **Invalidation:** TTL is your friend; explicit invalidate on critical writes.
- **CDN tier:** static assets + immutable URLs; HTTP `Cache-Control` headers.
- **Hot key:** local L1 + replicate hot key across shards.
- **Eviction:** W-TinyLFU > LRU > LFU for most real workloads.

## Related concepts
- [Consistent Hashing](/docs/41-caching/consistent-hashing) — how to shard a cache cluster without massive remap on resize.
- [Bloom Filter](/docs/49-probabilistic-data-structures/bloom-filter) — used to avoid cache penetration.
- [Redis](/docs/02-key-value-stores/redis), [Memcached](/docs/02-key-value-stores/memcached), [Caffeine](/docs/21-caching/caffeine), [Varnish](/docs/21-caching/varnish) — concrete tools.
