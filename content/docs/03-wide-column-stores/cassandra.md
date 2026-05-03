---
title: "Apache Cassandra"
description: "Cassandra is a distributed, leaderless, write-optimized NoSQL database built for massive write throughput, linear scalability, and no single point of failure. Instagram, Netflix, Apple, and Discord run their highest-v..."
---

> Category: Wide-Column NoSQL (distributed, leaderless) · Written in: Java · License: Apache 2.0

## TL;DR
Cassandra is a **distributed, leaderless, write-optimized NoSQL database** built for **massive write throughput, linear scalability, and no single point of failure**. Instagram, Netflix, Apple, and Discord run their highest-volume tables on it. You pick Cassandra when you need to write hundreds of thousands of events per second across many data centers and survive any single node going down.

## What problem does it solve?
A single PostgreSQL primary has a write ceiling. Once you need:
- millions of writes/sec,
- multi-region active-active,
- no maintenance windows,

…you need a database that's **horizontally scalable from day one** and where **every node is equal** (no leader to fail over). Cassandra (inspired by the Dynamo paper + Bigtable's column model) is the canonical answer.

## When to use
- **Write-heavy** workloads: time-series, sensor / IoT data, audit logs, message histories, fraud events.
- **Massive scale**: terabytes to petabytes, hundreds of nodes.
- **Multi-DC / multi-region active-active** with tunable consistency.
- **High availability is non-negotiable** — must survive node + DC outages.
- Workloads where you can model queries up front (Cassandra is **query-first**, not data-first).

## When NOT to use
- **Ad-hoc queries / analytics / joins** — Cassandra has no joins, limited indexes; query patterns must be designed in advance.
- **Strong global consistency** — possible but expensive (`QUORUM` everywhere); if you need it, consider Spanner / CockroachDB.
- **Read-modify-write hot paths** — Cassandra's read path is more expensive than its write path; lightweight transactions (LWT) use Paxos and are slow.
- **Small datasets** — operationally heavy; Postgres is simpler under ~1 TB.
- **Frequent updates / deletes on the same row** — creates **tombstones** and degrades read performance.

## Data Model
Cassandra is a **wide-column store**: rows in a table can have many columns, and rows are grouped by **partition key** and sorted by **clustering keys**.

You write CQL (Cassandra Query Language) which *looks* like SQL but is much more restrictive.

```sql
CREATE TABLE messages (
    chat_id      uuid,
    sent_at      timestamp,
    message_id   timeuuid,
    sender       text,
    body         text,
    PRIMARY KEY ((chat_id), sent_at, message_id)
) WITH CLUSTERING ORDER BY (sent_at DESC, message_id DESC);
```

- `(chat_id)` is the **partition key** — decides which node owns this row.
- `sent_at, message_id` are **clustering columns** — define on-disk sort order *within* the partition.
- Reading "last 50 messages of chat X" → **one partition, sorted, sequential read** — extremely fast.

### Query-first modeling
You design a **table per query**:
- "Get latest 50 messages of a chat" → table partitioned by `chat_id`.
- "Get messages by user" → a different table partitioned by `user_id`.

Yes, you **denormalize and duplicate**. Storage is cheap; reads must be fast.

## Architecture & Internals
- **Peer-to-peer cluster** — every node is equal. No leader, no master.
- A **token ring**: the cluster's hash space (`Murmur3Partitioner`, 64-bit) is divided among nodes (typically using **virtual nodes** / vnodes — 256 by default per node — for even distribution).
- A row's owner = `hash(partition_key) → token → node`.
- **Storage engine: LSM Tree.** Writes go to:
  1. **Commit log** (append-only on disk, durability).
  2. **Memtable** (in-memory sorted structure).
  3. Flush to immutable **SSTables** on disk.
  - Background **compaction** merges SSTables; deletes leave **tombstones** that linger until compaction.
- Reads merge data from memtable + SSTables + tombstones (use **Bloom filters** to skip irrelevant SSTables).

```
Write path:  client → coordinator → replicas (async) → commit log + memtable
Read path:   client → coordinator → replicas → merge memtable + SSTables → return
```

Any node can be the **coordinator** for a request and forwards to the right replicas using the token ring.

## Consistency Model
Cassandra is famous for **tunable consistency** — you choose per query.

Common consistency levels:
- `ONE` — one replica acks; fastest, weakest.
- `QUORUM` — majority of replicas (`RF/2 + 1`); balanced.
- `LOCAL_QUORUM` — quorum within the local DC (avoids cross-region latency).
- `ALL` — every replica; strongest, fragile (one slow replica = high latency / failure).
- `EACH_QUORUM` — quorum in every DC (used for cross-DC strong consistency).

**Strong consistency formula:** `R + W > RF` (Read + Write replica counts > Replication Factor).
- E.g. RF=3, write at QUORUM (2), read at QUORUM (2) → 2+2 > 3 → strongly consistent.

CAP positioning: **AP by default**, CP when you tune. Always **eventually consistent** under partitions if you choose lower levels.

**Hinted handoff**: if a replica is down during a write, the coordinator stores a "hint" and replays it later.
**Read repair / anti-entropy**: background processes converge replicas.
**Lightweight transactions (LWT)**: Paxos-based compare-and-set (`IF NOT EXISTS`). Slow — avoid in hot paths.

## Replication
- **Replication Factor (RF)** is set per **keyspace** (database). Typical: RF=3.
- The **partitioner** maps the partition key to a token; the next RF nodes clockwise on the ring own that data.
- **Multi-DC replication** with `NetworkTopologyStrategy`: e.g. `{ DC_US: 3, DC_EU: 3 }`. Writes go to the local DC fast and asynchronously to remote DC.
- No primary; **every replica is writeable**, conflicts resolved by **last-write-wins** (cell-level timestamps).

## Partitioning / Sharding
Built-in. The token ring handles partitioning, so you don't run Cassandra "and then shard it" — sharding is the default.

### Picking the partition key (this is the interview talking-point)
A good partition key:
1. **Distributes data evenly** across nodes (high cardinality, no hotspots).
2. **Bounds partition size** (target < 100 MB, < 100K rows; max ~2 GB before things get dangerous).
3. **Matches the query** — every query should specify the full partition key.

**Wide-row pitfall (the classic Cassandra trap):**
A naive schema like `PRIMARY KEY ((sensor_id), reading_time)` for a sensor sending 10 readings/sec for years → that partition grows unbounded, eventually crippling reads & repairs.

**Fix: bucket the partition key.**
```sql
PRIMARY KEY ((sensor_id, day), reading_time)   -- daily buckets
PRIMARY KEY ((sensor_id, year_month), reading_time)  -- monthly buckets
```
You trade off: now reading "last week" requires 7 partitions instead of 1. Pick a bucket size that matches your typical query window.

**Hot-partition examples:**
- `(country)` — "US" gets 50% traffic.
- `(today_date)` — every write today on one partition.
- Celebrity user IDs — manually shard with composite keys (`(user_id, shard_0..9)` and write to a random shard).

## Scale of a Single Instance
> Cassandra is *designed* to scale horizontally; a single node is just one tile in a big mosaic.

| Dimension | Healthy per node | Stretch | Notes |
|---|---|---|---|
| Data per node | **1–2 TB** | up to 5 TB | repairs / streaming get painful past this |
| Writes/sec/node | ~10K–50K | 100K+ on big hardware | LSM writes are cheap |
| Reads/sec/node | ~5K–20K | depends heavily on cache hit + SSD IOPS | reads are more work than writes |
| Partition size | < 100 MB / < 100K rows | 1 GB tolerable | 10 GB partition = pain |
| Cluster size | 10s–100s of nodes routine | 1000+ at FAANG | Apple ran 75k+ Cassandra nodes |

**When a node hits its data ceiling:**
- Add a node — Cassandra rebalances tokens automatically.
- That's the entire elasticity story. There's no "shard by hand"; the ring takes care of it.

**Why not just one giant node?**
- Replication / repair costs scale with data per node.
- Bootstrap of a new node streams ~TB; bigger nodes = longer outages-of-one-replica.
- Compaction throughput per disk caps practical density.

## Performance Characteristics
- **Writes:** very cheap — append to commit log + memtable, no read-before-write. Sub-ms within a DC at `LOCAL_ONE` / `LOCAL_QUORUM`.
- **Reads:** more work — must check memtable + multiple SSTables + tombstones. Bloom filters and partition cache help.
- **Compaction** is the long-running background cost; if it falls behind, reads slow down (more SSTables to merge).
- **Tombstones** are the silent killer: too many → reads scan past them and slow down or fail.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Linear horizontal scalability | Query model is restrictive (must know partition key) |
| No single point of failure | Tombstones / wide rows degrade reads |
| Multi-DC active-active built-in | Operationally complex (JVM, GC, repairs, compaction) |
| Tunable consistency | LWT (compare-and-set) is slow |
| Excellent write throughput | Joins / ad-hoc queries are absent |
| Mature, used at hyperscale | Disk usage high (denormalization + LSM amplification) |

## Common HLD Patterns
- **Time-series at scale**: IoT readings, metrics, logs, audit trails — partition by `(entity, time_bucket)`.
- **Messaging / activity feeds**: chat history, notifications, event histories.
- **Recommendations / user features** for ML serving — fast key lookups, huge volume.
- **Multi-region writes** with `LOCAL_QUORUM` for low-latency writes per region.
- **CDC pipelines** with Cassandra → Kafka → ElasticSearch / Spark for analytics.
- **Materialized views** to maintain a second access pattern (use cautiously; native MVs have known issues — many shops still hand-roll them with multiple tables).

## Common Pitfalls / Gotchas
- **Designing data-first**, then trying to query → you'll be stuck. **Design queries first.**
- Choosing a partition key with **low cardinality or hot spots** — kills the cluster.
- **Unbounded partitions** that grow forever — bucket by time.
- Heavy use of `IN (...)` across many partitions — coordinator fans out, slow.
- Using `ALLOW FILTERING` in production. It scans everything; treat it as a flashing red light.
- Frequent deletes/overwrites → tombstone explosion. Use **TTLs** for ephemeral data.
- Counting with `COUNT(*)` on a partition — fine for small partitions, deadly otherwise.
- Forgetting **repair schedules** — without periodic anti-entropy repair, replicas drift.
- Treating Cassandra like a queue (heavy delete pattern) — use a real queue/log instead.

## Interview Cheat Sheet
- **Tagline:** "Leaderless wide-column DB with linear write scalability and tunable consistency."
- **Best at:** massive write throughput, multi-DC HA, time-series / event-style data.
- **Worst at:** ad-hoc queries, joins, frequent updates, strong global consistency.
- **Scale of one node:** 1–2 TB, ~10K–50K writes/sec, partitions kept under ~100 MB.
- **Shard by:** partition key in the schema (the partitioner does the rest); use bucketing to bound partition size.
- **Consistency:** tunable (`ONE`/`QUORUM`/`ALL`/`LOCAL_QUORUM`/`EACH_QUORUM`); strong if `R + W > RF`.
- **Replicates how:** RF replicas on the token ring; per-DC config; LWW conflict resolution; hinted handoff + read repair.
- **Killer alternatives:** ScyllaDB (C++ rewrite, 10× faster per node), DynamoDB (managed Dynamo), HBase, Bigtable.

## Further Reading
- Official docs: https://cassandra.apache.org/doc/
- Datastax Academy (free Cassandra courses): https://www.datastax.com/dev
- Original Dynamo paper (the "leaderless replication" foundation): https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf
- Bigtable paper (the "wide-column" foundation): https://research.google/pubs/pub27898/