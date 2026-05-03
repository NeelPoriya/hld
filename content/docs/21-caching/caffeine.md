---
title: "Caffeine"
description: "Caffeine is the high-performance Java in-process cache — Window TinyLFU eviction, asynchronous loading, the recommended replacement for Guava Cache and the engine inside Spring Cache, Hibernate 2L, and many JVM apps."
---

> Category: In-Process Cache (JVM) · Written in: Java · License: Apache 2.0

## TL;DR
Caffeine is the de-facto **in-process Java cache** — a near-replacement for Guava Cache with **higher hit ratios** (Window TinyLFU eviction beats LRU/LFU), **lock-free reads**, **async loading**, and **statistics**. It's the cache engine inside Spring Cache, Hibernate 2nd-level cache, Quarkus, and countless Java services. Reach for Caffeine whenever a Java/Kotlin/Scala service needs a **local, hot, per-process cache** that's faster than crossing the network to Redis — typically for memoizing expensive computations, decoded objects, or DB-row hot sets.

## What problem does it solve?
- **Network round-trips to Redis are slow** — a local cache is 1000x faster (~50 ns vs ~50 µs).
- **GC pressure from per-call allocations** — caching avoids re-creating expensive objects.
- **Cold paths in DB / RPC** — memoize results so the second N calls are free.
- **Hit-rate quality** — LRU evicts hot items prematurely; Window TinyLFU keeps frequency + recency, beating LRU/LFU/Clock in most benchmarks.

## When to use
- **Hot-loop caching** in Java services — DB row caches, decoded protobuf, parsed config.
- **Memoization** of pure functions with stable inputs.
- **Spring `@Cacheable`** — Caffeine is the recommended cache provider.
- **Hibernate 2L cache** — JPA entities cached in process.
- **In front of Redis** as L1; Redis as L2 — best of both: fast local + shared coherent.

## When NOT to use
- **Multi-process coherence required** — local cache means each pod has its own copy; use Redis if you need a single source of truth.
- **Off-JVM languages** — Caffeine is JVM-only; equivalents: Ristretto (Go), DiskLruCache (Android), Cache2k (JVM alt).
- **Persistence required** — Caffeine is RAM-only; use Redis / RocksDB.
- **Huge heaps** — large caches inflate GC pause times; consider off-heap (Apache Ignite, OHC) or external (Redis).

## Data Model
- **`Cache<K, V>`** — synchronous get/put; manual loading.
- **`LoadingCache<K, V>`** — synchronous loader provided at construction; `get` either returns or computes.
- **`AsyncCache<K, V>`** / **`AsyncLoadingCache<K, V>`** — `CompletableFuture<V>` based; non-blocking loaders.
- **Eviction policies:** size-based, time-based (expireAfterWrite, expireAfterAccess, expireAfter custom), reference-based (weak/soft).
- **Listeners:** removal listener, eviction listener, async writers.

```java
import com.github.benmanes.caffeine.cache.*;
import java.time.Duration;

LoadingCache<Long, User> users = Caffeine.newBuilder()
    .maximumSize(100_000)
    .expireAfterWrite(Duration.ofMinutes(10))
    .refreshAfterWrite(Duration.ofMinutes(5))   // async refresh half-way through TTL
    .recordStats()
    .removalListener((Long key, User u, RemovalCause cause) ->
        log.debug("evicted {} ({})", key, cause))
    .build(userId -> userRepository.findById(userId));   // sync loader

User u = users.get(42L);     // either cached or loaded
users.invalidate(42L);
CacheStats stats = users.stats();   // hit rate, miss count, eviction count, load times

// Async variant for non-blocking loaders
AsyncLoadingCache<Long, User> asyncUsers = Caffeine.newBuilder()
    .maximumSize(100_000)
    .expireAfterWrite(Duration.ofMinutes(10))
    .buildAsync(userId -> CompletableFuture.supplyAsync(() ->
        userRepository.findById(userId)));
```

## Architecture
- **Window TinyLFU eviction** — admission filter (Bloom-filter-based frequency sketch) gates entries; main cache uses LRU; small "window" cache absorbs new arrivals.
- **Lock-free reads** — concurrent `get` doesn't block.
- **Buffer-based writes** — write events (puts/hits/etc.) are batched in lock-free queues, drained by a single thread.
- **Auto-tuning** — sizing of admission window adapts to workload (W-TinyLFU + hill-climbing).

## Eviction
- **maximumSize(N)** — bounded by entry count.
- **maximumWeight(W) + weigher** — bounded by computed weight (e.g., bytes).
- **expireAfterWrite / expireAfterAccess** — fixed TTL.
- **expireAfter(Expiry)** — variable per-entry TTL.
- **softValues / weakKeys / weakValues** — JVM-driven eviction under memory pressure (use cautiously — unpredictable).

## Trade-offs

| Strength | Weakness |
|---|---|
| Best-in-class hit ratio (W-TinyLFU > LRU/LFU) | JVM-only; no cross-process coherence |
| Lock-free reads, batched writes — minimal contention | Large caches inflate GC pause time |
| Sync + async + loading variants | Per-pod copies — consistency drift across replicas |
| Drop-in for Guava with better numbers | Soft/weak refs are unpredictable; avoid for SLO-critical caches |
| Spring + Hibernate + Quarkus first-class | Stats off by default; remember to `.recordStats()` |
| Mature, stable, very widely deployed | Requires thoughtful invalidation design — local-only invalidation |

## Common HLD Patterns
- **L1 + L2 cache:** Caffeine in process (L1, fast) + Redis (L2, shared); on miss go to Redis, then origin.
- **Refresh-ahead:** `refreshAfterWrite` triggers async reload before expiry; users always see warm data.
- **Per-tenant caches:** map `tenantId → Cache<K,V>`; bound total memory with weighers.
- **Bloom-filtered loaders:** combine with a Bloom filter to skip definite misses (reduce DB lookups for missing keys).
- **Cache stampede protection:** Caffeine's loader collapses concurrent loads of the same key into a single computation.
- **Spring Boot integration:** `spring.cache.type=caffeine` with `spring.cache.caffeine.spec=maximumSize=100_000,expireAfterWrite=10m`.

## Common Pitfalls / Gotchas
- **Forgetting `recordStats()`** — no visibility into hit rate; always enable in prod.
- **Using soft/weak references** for SLO-critical caches — eviction is GC-driven and unpredictable.
- **Local-only invalidation** — when a row changes in DB, other pods don't know; use TTL or pub/sub invalidation.
- **Coalescing async loaders** — under load, all waiters share the same `CompletableFuture`; don't rely on per-caller side effects.
- **Heap pressure** — a 10 GB cache in heap inflates G1 / ZGC pause; off-heap (OHC, Chronicle) for very large.
- **Ignoring `weigher`** — using `maximumSize` with widely varying entry sizes leads to unpredictable memory.
- **Loader exceptions cached?** — by default no; failures aren't cached (see `bulkLoad` semantics for nuances).
- **Refresh vs expire** — refresh keeps stale value during reload, then swaps in; expire forces a synchronous re-load.

## Interview Cheat Sheet
- **Tagline:** High-performance JVM in-process cache with Window TinyLFU eviction; Guava replacement with better hit rates.
- **Best at:** L1 caching of hot DB rows / decoded objects in Java services, memoization, refresh-ahead, integrated Spring/Hibernate caches.
- **Worst at:** cross-process coherence (use Redis), persistence, very large heaps, non-JVM apps.
- **Scale:** millions of entries per JVM; hit ratio typically 20-30% better than LRU at the same size.
- **Distributes how:** doesn't — local to a JVM; pair with Redis for shared layer; replicate via app-level pub/sub.
- **Consistency / state:** local only; eventual across replicas via TTL or pub/sub invalidation.
- **Killer alternative:** Guava Cache (older), Ehcache (more features, heavier), Hazelcast (distributed), Redis (shared remote), Cache2k.

## Further Reading
- Official docs: <https://github.com/ben-manes/caffeine/wiki>
- Window TinyLFU paper: <https://dl.acm.org/doi/10.1145/3149371>
- Spring Cache integration: <https://docs.spring.io/spring-boot/docs/current/reference/html/io.html#io.caching.provider.caffeine>
- Performance comparisons: <https://github.com/ben-manes/caffeine/wiki/Benchmarks>
