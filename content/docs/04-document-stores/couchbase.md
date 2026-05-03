---
title: "Couchbase"
description: "Couchbase is a distributed document database with a built-in memory-first cache, SQL-style query language (N1QL), and native cross-datacenter replication. Reach for it when you want MongoDB-style flexibility plus Memcached-style speed in one engine."
---

> Category: Document NoSQL Database · Written in: C / C++ / Erlang · License: Business Source License (BSL) → Apache 2.0 after 4 years

## TL;DR
Couchbase is a **memory-first distributed document database** that fuses three things into one product: a key-value cache (it grew out of Memcached), a JSON document store (think MongoDB), and a SQL-like query engine called **N1QL**. It scales horizontally with automatic sharding, replicates synchronously inside a cluster and asynchronously across regions (XDCR), and is most loved for **predictable sub-ms latencies on hot data** combined with rich queries. You reach for it when you want MongoDB's flexibility but absolutely cannot tolerate the latency spikes of going to disk on every read.

## What problem does it solve?
You've got a high-traffic app where:
- Most reads hit a small "hot" working set (user profiles, sessions, product details).
- Some queries need filters / joins / ad-hoc lookups, not just key-based GETs.
- You also want a globally-distributed setup with active-active in multiple regions.

**Before Couchbase:** you bolt together Memcached + MongoDB + Redis + custom replication. Three systems, three failure modes, three on-call playbooks.
**With Couchbase:** one product does cache + document store + cross-region replication.

## When to use
- **High-throughput caching with persistence** — e.g. user sessions, gaming leaderboards, ad targeting. You want Memcached speed but you don't want to lose data on restart.
- **Mobile / edge sync** — Couchbase Mobile + Couchbase Lite is the killer feature: a SQLite-shaped DB on the phone that syncs back to the server.
- **Multi-region active-active** — banks, airlines, retail with sites in 3+ regions.
- **JSON-shaped data with ad-hoc queries** — anywhere you'd consider MongoDB but want stricter SLAs.
- **Caching layer in front of a slow system of record** that occasionally needs to be queried by something other than the primary key.

## When NOT to use
- **You need rock-solid ACID across many documents** — use PostgreSQL or Spanner.
- **Tiny apps** — operationally heavy, you'll be paying for nodes you don't need.
- **You don't have JSON documents** — if your data is purely tabular, a SQL DB is simpler.
- **OSS-purist environments** — Couchbase Server is BSL-licensed (eventually Apache, but with a delay). For purely-OSS use **Cassandra** or **MongoDB**.
- **Heavy analytics / OLAP** — possible via the Analytics service, but Snowflake / ClickHouse are stronger.

## Data Model
- **Bucket** — top-level container (like a database). Contains documents.
- **Scope** — namespace inside a bucket (think schema).
- **Collection** — table-like grouping inside a scope.
- **Document** — a JSON object with a unique key (string).

Example document under key `user::42` in `app._default.users`:
```json
{
  "id": 42,
  "name": "Alice",
  "email": "alice@example.com",
  "createdAt": "2026-04-01T10:00:00Z",
  "preferences": { "theme": "dark", "lang": "en" }
}
```

You can fetch by key in <1ms, **or** run N1QL:
```sql
SELECT name, email
FROM `app`.`_default`.`users`
WHERE preferences.theme = "dark"
ORDER BY createdAt DESC
LIMIT 50;
```

## Architecture & Internals
A Couchbase cluster is a set of identical nodes — every node can run any combination of these **services**:
- **Data Service (KV)** — in-memory + disk store. The fastest path; pure hash-map lookup.
- **Index Service** — Global Secondary Indexes (GSI) for N1QL.
- **Query Service** — parses + executes N1QL.
- **Search (FTS)** — Bleve-based full-text search.
- **Eventing** — JavaScript triggers on document mutations.
- **Analytics** — column-store for OLAP (separate engine).

Storage engine: **Couchstore** (B+ tree on disk, append-only) or newer **Magma** (LSM-tree, better for huge datasets per node).

Critical concept: **vBuckets** (1024 of them) are logical shards. The cluster map says "vBucket 17 lives on node 3, replica on node 5." When you add nodes, vBuckets are rebalanced automatically.

Data flow on a write:
1. Client SDK hashes the key → vBucket → routes to the master node.
2. Master writes to RAM → acks (async-to-disk by default).
3. Replication queue ships changes to replica nodes.
4. Disk writer flushes to disk in the background.

## Consistency Model
- **Single-document operations are atomic** with CAS (compare-and-swap).
- **Read-your-own-write** is the default within a session.
- **Cross-document transactions** exist (since 6.5, ACID-style with optimistic locking) but are slower — use sparingly.
- **N1QL queries** are eventually consistent against indexes by default; you can request `request_plus` consistency to wait until indexes catch up to your latest write.

CAP-wise: AP-leaning by default (favor availability). Tunable to CP for transactions.

## Replication
**Inside a cluster** (intra-cluster):
- 1, 2, or 3 replicas per vBucket.
- Async by default; can request synchronous (`Durability.MAJORITY`, `MAJORITY_AND_PERSIST_TO_ACTIVE`, etc.) since 6.5.
- Failover is automatic — if a node dies, replicas become active.

**Across clusters** (XDCR — Cross-Datacenter Replication):
- Async, conflict-resolved by latest-timestamp (or custom).
- Active-active: every cluster accepts writes; mutations replicate to every other cluster.
- The killer feature: simple to configure, runs continuously, supports filters and transformations.

Failover RPO: typically a few seconds with async replication. Use synchronous durability to drop to ~zero.

## Partitioning / Sharding
- Automatic. You don't pick a shard key — Couchbase hashes the document key (CRC) into one of **1024 vBuckets**.
- vBuckets are evenly distributed across nodes.
- Adding a node triggers a **rebalance**: roughly 1/N of vBuckets move to the new node.

**Hot-key risk:** because the hash is deterministic on the key, if 90% of traffic hits one key (e.g. `global_counter`), you get a hot vBucket on a single node. Spread it manually:
```
counter:0  counter:1  ...  counter:99
```
and aggregate at read time.

## Scale of a Single Instance
- One node typically handles **30–100k ops/sec** for KV, **~hundreds of GB to a few TB** of data with Magma engine.
- Working set should fit in RAM for sub-ms latencies — sizing rule: budget **enough RAM to hold metadata for 100% of documents + the resident value subset you want hot**.
- Practical clusters: **3–50 nodes**. Above that you usually multi-region with XDCR rather than ever-growing single clusters.
- 1 billion documents in one bucket is normal; hundreds of billions are doable across nodes.

When do you have to scale out? When working-set RAM > 80% of node RAM, or when CPU is pegged on the data service. Adding a node + rebalance is an online operation.

## Performance Characteristics
- **KV GET/SET (in-RAM):** 200µs–1ms per op.
- **N1QL with proper index:** 1–10ms.
- **N1QL without an index → full scan:** seconds, with massive load on the cluster. Always check `EXPLAIN`.
- **XDCR replication lag:** typically <1s within the same continent, a few seconds cross-continent.
- Bottlenecks: working-set falling out of RAM (latency cliff), index build time on large datasets, and N1QL plans choosing the wrong index.

## Trade-offs

| Strength | Weakness |
|---|---|
| Memory-first → predictable µs–ms latency for hot data | Memory hungry; sizing is tricky and expensive |
| Single product replaces cache + DB + replication | Operational complexity (multi-service architecture) |
| N1QL gives SQL ergonomics on JSON | Query optimizer less mature than PostgreSQL's |
| XDCR is best-in-class for active-active | BSL license — not pure OSS |
| Mobile/Edge sync is unique in this space | Smaller community than MongoDB; fewer hosted options |
| Auto-rebalance, no manual sharding | Adding/removing nodes still triggers data movement (background but real) |

## Common HLD Patterns
- **Session store for a global app** — Couchbase as the single shared session DB across all regions, XDCR keeping them in sync.
- **Mobile app + cloud sync** — Couchbase Lite on the phone, Sync Gateway in the middle, Couchbase Server as the system of record.
- **Caching layer with optional secondary access** — primary lookups by key are sub-ms, occasional N1QL queries don't require a separate analytical DB.
- **Real-time leaderboards / counters** — atomic increments via the KV API, persistence built-in.

## Common Pitfalls / Gotchas
- **Working set > RAM = latency cliff.** Performance falls off a cliff when the resident ratio drops below ~95%.
- **N1QL without a covering index** = O(N) scan. Run `EXPLAIN` and add a GSI.
- **Misconfigured XDCR conflict resolution** can silently drop writes — by default it's last-write-wins on timestamp, which isn't always what you want.
- **Single bucket for everything** — buckets have ops budgets and replication overhead; split by domain.
- **Forgetting `Durability` on writes** — default is `none`, meaning a node crash can lose the write before replication. Use `MAJORITY` for anything important.
- **Magma vs Couchstore**: pick Magma for >1TB-per-node datasets; Couchstore is fine for in-memory-friendly working sets.

## Interview Cheat Sheet
- **Tagline:** Memcached-fast KV + MongoDB-style JSON + cross-region replication, all in one cluster.
- **Best at:** sub-ms reads on JSON documents with optional ad-hoc queries; multi-region active-active.
- **Worst at:** strict ACID across many documents; pure analytics; small apps where ops cost > value.
- **Scale of one node:** ~30–100k ops/sec, hundreds of GB to a few TB with Magma.
- **Shard by:** automatic — CRC hash of the document key into 1024 vBuckets.
- **Consistency:** tunable; default async durability, can be majority-quorum synchronous.
- **Replicates how:** intra-cluster vBucket replicas (async or sync), XDCR async between clusters.
- **Killer alternative:** MongoDB (simpler, more popular, no built-in cache); Redis (pure cache); DynamoDB (managed, no ops).

## Further Reading
- Official docs: <https://docs.couchbase.com/>
- N1QL language reference: <https://docs.couchbase.com/server/current/n1ql/n1ql-language-reference/>
- "Couchbase Architecture" white paper: <https://www.couchbase.com/resources/why-nosql>
- Magma storage engine deep-dive: <https://www.couchbase.com/blog/magma-couchbase-7-1/>
