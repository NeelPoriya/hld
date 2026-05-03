---
title: "Redis"
description: "Redis is an in-memory data structure server that's wildly fast (sub-millisecond) because everything it does happens in RAM. It's the default tool for caching, session stores, rate limiters, leaderboards, pub/sub, and ..."
---

> Category: In-Memory Key-Value Store / Cache · Written in: C · License: RSALv2 / SSPL (recently changed from BSD); fork [Valkey](https://valkey.io/) is BSD.

## TL;DR
Redis is an **in-memory data structure server** that's wildly fast (sub-millisecond) because everything it does happens in RAM. It's the default tool for caching, session stores, rate limiters, leaderboards, pub/sub, and any feature that needs *very low latency* over correctness across years of data.

## What problem does it solve?
Disk-bound databases (Postgres, MySQL) are too slow for hot reads at scale. Redis sits **in front of** your real database and serves cached answers in microseconds. It also gives you specialized data structures (sorted sets, HyperLogLog, streams, bitmaps) that would be painful to implement on top of SQL.

## When to use
- **Caching** — the #1 use case. Cache product pages, query results, rendered HTML.
- **Session storage** — login sessions for web apps.
- **Rate limiting** — token bucket / sliding window with `INCR` + `EXPIRE`.
- **Leaderboards / rankings** — sorted sets give `O(log N)` rank operations.
- **Real-time counters** — page views, likes, online users.
- **Distributed locks** — with the **Redlock** algorithm (use carefully).
- **Pub/Sub & Streams** — lightweight messaging when you don't need Kafka.
- **Queues** — `LPUSH` / `BRPOP` for simple work queues.
- **Geo lookups** — `GEOADD`, `GEORADIUS` for "nearby drivers".
- **Feature flags / config** — fast global lookups.

## When NOT to use
- **Primary durable store of record** — RAM is expensive and the durability story is weaker than disk DBs. Use Postgres/Cassandra/etc. as truth, Redis as a cache.
- **Datasets much larger than RAM** — once you spill to disk, you've lost the point of Redis. Use a proper DB.
- **Complex queries / joins / ad-hoc analytics** — Redis is key-based access only.
- **Strong-consistency, multi-node transactions** — Redis Cluster is AP-leaning; cross-slot transactions are limited.
- **Replacement for Kafka** — Redis Streams are great at small/medium scale; Kafka beats it for durable, multi-consumer-group, terabyte-scale event logs.

## Data Model
Redis is a **key → value** store, but the values are **rich data structures**:

| Type | Example use | Key commands |
|---|---|---|
| **String** | `cache:user:42 = "{json}"` | `GET`, `SET`, `INCR` |
| **Hash** (field→value map) | user profile fields | `HSET`, `HGET`, `HGETALL` |
| **List** (linked list) | work queue | `LPUSH`, `BRPOP`, `LRANGE` |
| **Set** (unordered, unique) | tags, online user set | `SADD`, `SISMEMBER`, `SINTER` |
| **Sorted Set (ZSet)** | leaderboard | `ZADD`, `ZRANGE`, `ZRANK` |
| **Bitmap** | daily active users | `SETBIT`, `BITCOUNT` |
| **HyperLogLog** | unique visitors | `PFADD`, `PFCOUNT` |
| **Stream** | append-only log | `XADD`, `XREAD`, `XGROUP` |
| **Geo** | locations on a map | `GEOADD`, `GEOSEARCH` |
| **JSON** (module) | structured docs | `JSON.SET`, `JSON.GET` |

**Concrete example — leaderboard:**
```
ZADD game:leaderboard 1500 "alice"
ZADD game:leaderboard 1700 "bob"
ZREVRANGE game:leaderboard 0 9 WITHSCORES   # top 10
ZRANK game:leaderboard "alice"               # rank lookup
```
Each command is `O(log N)`. You will not implement leaderboards in SQL once you've used this.

## Architecture & Internals
- **Single-threaded event loop** for command execution. Sounds scary but it's fast because everything is in RAM and there's no lock contention.
- **I/O threads** (since Redis 6) parallelize network reads/writes only — execution stays serial.
- **Persistence** (optional but recommended):
  - **RDB snapshots** — periodic point-in-time dumps to disk. Compact, fast restart, but you can lose minutes of data.
  - **AOF (Append-Only File)** — log every write. Configurable fsync (`always`, `everysec` — default, `no`). Bigger files, slower restarts, less data loss.
  - **Hybrid** (default modern config) — RDB snapshot + AOF tail.
- **Eviction policies** when memory is full: `noeviction` (errors), `allkeys-lru`, `volatile-lru`, `allkeys-lfu`, `volatile-ttl`, etc.
- **Replication** is asynchronous primary→replica.

```
Client ──► Single-threaded event loop ──► In-memory data structures
                │                                │
                └── async replication ────► Replicas
                          │
                          └── periodic RDB / AOF ─► Disk
```

## Consistency Model
- **Single key, single command** is atomic (single-threaded execution).
- **MULTI/EXEC** transactions = batched commands run atomically, but **no rollback** if one logically fails.
- **Lua scripts** — the proper way to do multi-step atomic logic ("check-and-set" patterns).
- **AP**, not CP, in Redis Cluster. During a primary failure, recently-acked writes can be lost (async replication).
- **Read-your-writes** is not guaranteed when you read from a replica.

**Plain-English consistency takeaway:** Redis says "I am very fast and I will lose a few seconds of writes if a node dies." That's a trade you accept for cache use cases.

## Replication
- **Primary → Replica(s)**, asynchronous by default.
- Replicas can serve reads (configure `replica-read-only`).
- **Replication backlog** lets a replica reconnect after a brief disconnect without a full resync.
- **Sentinel** (older HA): monitors primaries, promotes a replica on failure.
- **Redis Cluster** (sharding + HA): each shard has primary + N replicas; cluster auto-fails-over.
- **WAIT command** — synchronously wait for N replicas to ack a write (best-effort durability boost).

## Partitioning / Sharding
Redis supports horizontal sharding via **Redis Cluster**:

- The keyspace is split into **16384 hash slots**.
- A key's slot = `CRC16(key) mod 16384`.
- Each slot is owned by one primary; cluster knows the slot→node map.
- Adding/removing nodes = moving slots (online resharding supported).

### Hash tags — controlling which keys live together
By default, related keys may scatter across shards. Use `{...}` to force co-location:
```
SET user:{42}:profile  ...
SET user:{42}:cart     ...
```
Both keys hash on `42` and live on the same shard, so multi-key ops (`MGET`, transactions, Lua) work.

### Hot-shard pitfalls
- **One celebrity key** ("`product:viral_item`" getting 90% of traffic) → that primary maxes its CPU. Cure: replicate the hot value across multiple keys (`product:viral_item:1..N`, pick randomly), or pre-warm a local cache on app servers.
- **Big key** (a hash with 50M fields, a list with 100M items) → blocks the single thread on iteration / deletion. Cure: shard the big key into `mybigset:0..99` shards; use `UNLINK` (lazy delete) instead of `DEL`.

## Scale of a Single Instance
> RAM is the dominant constraint. Redis is single-threaded per node — CPU per shard matters too.

| Dimension | Comfortable | Stretch | Scale-out trigger |
|---|---|---|---|
| Dataset size | up to **~25 GB** per shard | up to ~100 GB | when working set > RAM, or fork/persistence pauses hurt |
| Ops/sec | ~**100K**/sec/shard | ~1M/sec with pipelining | once one shard saturates a CPU core |
| P99 latency | < 1 ms | 1–5 ms | > 5 ms = something's wrong |
| Connections | 10K+ (use a pool) | — | use a connection pool/proxy |

**Why ~25 GB per shard is a sweet spot:**
- RDB save / AOF rewrite **forks the process**; copy-on-write means the fork's memory pressure can spike. Smaller shards = faster forks.
- Failover replication on a fresh replica needs to ship the entire dataset over the network.
- A 25 GB shard re-syncs in seconds–minutes; a 200 GB shard is painful.

**When to add shards (Redis Cluster) vs vertical scale:**
- If RAM is tight → bigger box first (cheap, simple).
- If single-thread CPU is saturated → must shard, no other escape.
- If write fan-out / replication lag is bad → shard.

## Performance Characteristics
- **Latency:** sub-millisecond for in-RAM commands on the same VPC.
- **Throughput:** ~100K simple ops/sec/core; pipelining (`MULTI` of many cmds without waiting for replies) pushes well past 1M/sec.
- **Bottlenecks:**
  - Network round-trip (the actual command is faster than the RTT). Use **pipelining**.
  - Single-thread CPU on hot shards.
  - Big-O traps: `KEYS *` is **O(N)** over the whole DB → never run in production. Use `SCAN`.
  - `O(N)` commands on huge data structures stall the event loop.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Sub-ms latency, very high throughput | RAM is expensive, dataset must mostly fit |
| Rich data structures save you code | Single-threaded per shard = hot keys hurt |
| Mature ecosystem, tons of clients | Async replication = possible data loss on failover |
| Cluster mode for horizontal scale | Multi-key ops require hash tags |
| Simple mental model | Persistence is good, not Postgres-good |
| Many use cases (cache, queue, lock, pubsub) | License changes (Redis 7.4+) — consider Valkey/KeyDB if that matters |

## Common HLD Patterns
- **Cache-aside (lazy loading):**
  ```
  read: cache GET; if miss → DB SELECT → cache SET TTL
  write: DB UPDATE → cache DEL (or SET)
  ```
- **Write-through cache:** writes hit cache + DB synchronously.
- **Read-through cache:** cache layer fetches from DB on miss transparently (e.g. AWS DAX).
- **Session store** behind a stateless web tier (sticky sessions go away).
- **Distributed rate limiter:**
  ```
  INCR ratelimit:user:42:60s
  EXPIRE ratelimit:user:42:60s 60
  if value > 100 → reject
  ```
- **Leaderboard / trending list** with sorted sets.
- **Geo-search service** (find drivers within 2 km) with `GEOSEARCH`.
- **Pub/Sub** for fan-out notifications inside one DC (fire-and-forget).
- **Streams + consumer groups** when you need durability + replay (Kafka-lite).
- **Lock pattern:** `SET lock:resource <token> NX PX 30000` (set-if-not-exists with TTL).

### Cache problems to know by name
- **Thundering herd / dog-piling**: cache expires, 1000 requests hit DB simultaneously. Cure: per-key lock, `SET NX` to elect one rebuilder, or **stale-while-revalidate**.
- **Cache stampede on cold start**: pre-warm critical keys before flipping traffic.
- **Cache penetration**: queries for non-existent keys hammer the DB. Cure: cache the *negative* result (`null` with short TTL) or use a **Bloom filter**.
- **Cache avalanche**: many keys expire at once. Cure: jitter TTLs (`TTL = base + random()`).

## Common Pitfalls / Gotchas
- Running `KEYS *`, `FLUSHALL`, or `DEBUG SLEEP` in production. Don't. Use `SCAN`, target keys, never block the event loop.
- Treating Redis like a database of record without backups + AOF.
- Storing **giant values** (10 MB JSON blobs) — fragments memory, blocks event loop on access.
- **Hot keys** in a cluster — measured by `redis-cli --hotkeys` or proxy stats.
- Forgetting **TTLs** on cache entries → memory bloat.
- Using `EXPIRE` without `NX` so resetting it accidentally extends life forever.
- Multi-key ops across slots in cluster mode without hash tags → `CROSSSLOT` errors.
- Using Redis pub/sub as durable messaging — it's **fire-and-forget**; if no subscriber is connected, the message is gone. Use Streams instead.

## Interview Cheat Sheet
- **Tagline:** "Sub-millisecond in-memory data structure server; the default cache."
- **Best at:** caching, sessions, leaderboards, counters, rate limits, ephemeral hot data.
- **Worst at:** durable system of record, datasets larger than RAM, complex queries.
- **Scale of one node:** ~25 GB and ~100K ops/sec is comfortable; one core per shard.
- **Shard by:** Redis Cluster's CRC16 hash slot; co-locate with `{hash tags}`.
- **Consistency:** AP, async replication, possible loss of last writes on failover; commands are atomic per key.
- **Replicates how:** primary → replica(s) async; cluster has built-in HA & resharding.
- **Killer alternatives:** Memcached (simpler cache), Valkey (BSD fork after license change), KeyDB (multi-threaded fork), DynamoDB DAX (managed cache for DDB).

## Further Reading
- Official docs: https://redis.io/docs/
- "Redis Best Practices" — https://redis.io/docs/manual/patterns/
- *Redis in Action* — Josiah L. Carlson.
- Martin Kleppmann's critique of Redlock: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html