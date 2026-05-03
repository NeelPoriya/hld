# Memcached

> Category: In-Memory Key-Value Cache · Written in: C · License: BSD

## TL;DR
Memcached is a **dead-simple, multi-threaded, in-memory key-value cache**. No persistence, no replication, no data structures — just `get`/`set` of bytes with a TTL. It's been the **default LAMP-era cache** since 2003. Today most teams pick Redis instead, but Memcached still wins on **simplicity, multi-threaded raw throughput, and predictable memory behavior** for pure cache use cases.

## What problem does it solve?
You have a hot database. You want to cache the results of expensive queries / API calls. You don't need rich data types, persistence, pub/sub, or replication — just **fast `get(key) → bytes`**.

## When to use
- Pure caching of pre-computed values (HTML fragments, API responses, DB query results).
- Sticking-plaster in front of a slow DB until you redesign.
- Simple session cache (when you don't need persistence).
- Workloads where Redis would be overkill — and where you want the simplest possible operational profile.

## When NOT to use
- You need **persistence** (Memcached is RAM-only; restart = empty cache).
- You need **rich data structures** (sorted sets, lists, streams) — use Redis.
- You need **replication / HA** — Memcached has none built in.
- You need **pub/sub, queues, locks** — use Redis or a real broker.
- You need **values larger than 1 MB** by default (configurable, but not the design point).

## Data Model
- Strict key-value. **Key** ≤ 250 bytes, **value** ≤ 1 MB (default).
- TTL per key (0 = never expire, otherwise absolute or relative seconds).
- That's it. No types, no schemas, no structures.

```
set    user:42 0 3600 128\r\n<128 bytes of data>\r\n   # set with 1h TTL
get    user:42
add    foo 0 60 3\r\nbar
incr   counter 1
delete user:42
```

(Modern clients use the binary or **meta** protocol — same semantics.)

## Architecture & Internals
- **Multi-threaded** — uses all CPU cores efficiently for pure GET/SET. (Contrast with Redis, single-threaded per shard.)
- **Slab allocator** — memory is divided into **slabs** of fixed-size chunks (e.g. 64 B, 128 B, 256 B…). New items go into the smallest slab that fits. Avoids fragmentation but can waste space ("slab calcification").
- **LRU eviction** when memory fills (each slab has its own LRU).
- **No persistence** — restart loses everything.
- **No replication** between nodes — clustering is purely client-side.

## Consistency Model
- Single-node Memcached: each command is atomic.
- **CAS** (Check-And-Set) tokens for optimistic concurrency.
- Multi-node Memcached: **eventually consistent** by way of consistent hashing — clients route keys to specific nodes; if a node dies, those keys are simply gone.

## Replication
None natively. The cache being "wrong" or empty is acceptable in the Memcached worldview — your DB is the truth. Some cloud variants (AWS ElastiCache for Memcached) auto-discover nodes but still don't replicate data.

## Partitioning / Sharding
- Done **client-side** with **consistent hashing**.
- Adding/removing nodes invalidates only a small fraction of keys (the ones that re-hash).
- All popular Memcached clients (e.g. Mc, libmemcached, spymemcached) support consistent hashing.

### Hot-key issues
- A celebrity key can saturate one node's CPU. Mitigations:
  - Replicate the hot value across a few keys (`hot:0..N`, randomly pick).
  - Cache hot values in app-level local cache (e.g. Caffeine in Java) layered above Memcached.

## Scale of a Single Instance
| Dimension | Comfortable | Stretch | Notes |
|---|---|---|---|
| RAM | 1–64 GB | hundreds of GB | bigger than Redis-per-shard because multi-threaded |
| Ops/sec | hundreds of K | 1M+ on big boxes | scales nearly linearly with cores |
| Item size | up to 1 MB | configurable up to ~128 MB | not designed for big blobs |
| Connections | thousands | tens of thousands | very lightweight |
| Latency | sub-ms | < 100 µs LAN | extremely consistent |

**When to scale out:** add more Memcached nodes; consistent hashing redistributes keys with minimal disruption.

## Performance Characteristics
- Sub-millisecond GET/SET, very predictable.
- Throughput scales with cores — fundamentally why Memcached can outpace single-threaded Redis on the same hardware for raw cache loads.
- Bottlenecks: NIC throughput, slab calcification, hot keys.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Multi-threaded; high per-node throughput | No persistence, no replication |
| Simple, predictable, easy to operate | Only strings, no rich data structures |
| Excellent slab allocator for cache workloads | Slab calcification can waste memory |
| Tiny memory overhead per key | No pub/sub, no queues, no scripting |
| Battle-tested at hyperscale (Facebook) | Cluster awareness is client-side only |

## Common HLD Patterns
- **DB + Memcached cache-aside** — same recipe as Redis.
- **Tiered cache**: app-local cache → Memcached → DB.
- **Session store** behind a stateless web tier (when persistence isn't required).
- **Render cache** — cache rendered HTML fragments.
- **mcrouter** (Facebook) — proxy in front of Memcached pools for routing, replication, sharding policies. The pattern that scaled Facebook's cache to TBs.

## Common Pitfalls / Gotchas
- **Cache stampede / dog-pile** when a hot key expires — same problem as Redis; same fixes (probabilistic early refresh, single-flight lock).
- **Slab calcification** — once memory is allocated to a slab class, it's hard to reuse for other sizes. Restart helps; modern Memcached has automatic re-slabbing.
- **Treating it as a database** — never. Cache only.
- **Trusting it after restart** — empty. Plan for cache warming.
- **Big values** (> 1 MB) — split into chunks or store in S3/Redis instead.
- **Multi-key ops** require multi-`get`, which fans out across nodes — fine, just be aware of the tail latency.

## Interview Cheat Sheet
- **Tagline:** "The simplest possible distributed cache: multi-threaded, in-memory, no frills."
- **Best at:** pure key-value caching at high QPS.
- **Worst at:** anything beyond simple strings; persistence; replication.
- **Scale of one node:** tens of GB RAM, hundreds of K ops/sec, sub-ms latency.
- **Shard by:** client-side consistent hashing across nodes.
- **Consistency:** atomic per command; CAS for optimistic CC; cluster is best-effort.
- **Replicates how:** doesn't (use mcrouter for cross-pool replication if needed).
- **Killer alternatives:** Redis (richer, single-threaded), Valkey, KeyDB, in-process caches (Caffeine, Guava) for app-local layer.

## Further Reading
- Memcached wiki: https://github.com/memcached/memcached/wiki
- "Scaling Memcache at Facebook" (NSDI 2013): https://www.usenix.org/system/files/conference/nsdi13/nsdi13-final170_update.pdf
- mcrouter: https://github.com/facebook/mcrouter
