---
title: "Google Bigtable"
description: "Bigtable is Google's foundational wide-column NoSQL database — the system that inspired HBase, Cassandra, and DynamoDB. The managed cloud version on GCP gives you single-digit-ms latency at petabyte scale with automat..."
---

> Category: Managed Wide-Column NoSQL · Cloud: GCP · License: Proprietary (managed)

## TL;DR
Bigtable is **Google's foundational wide-column NoSQL database** — the system that inspired HBase, Cassandra, and DynamoDB. The managed cloud version on GCP gives you **single-digit-ms latency at petabyte scale** with **automatic sharding, replication, and zero ops**. It's the go-to choice on GCP for IoT, time-series, ad-tech, financial tick data, and personalization at scale.

## What problem does it solve?
You need:
- Hundreds of thousands of QPS,
- Millisecond reads/writes,
- Petabytes of storage,
- Auto-sharding, no manual ops,

…on workloads where the access pattern is "lookup by a row key" or "scan a row-key range". Bigtable is that database, fully managed.

## When to use
- **Time-series / IoT / financial tick** data ingestion.
- **Ad-tech**: user profiles, segments, frequency caps at huge QPS.
- **Personalization / ML feature serving** at low latency.
- **Graph adjacency lists** (used internally by Google for the web graph).
- Workloads with **predictable row-key access patterns**.

## When NOT to use
- Off-GCP — vendor lock-in (HBase API exists but managed Bigtable runs only on GCP).
- Ad-hoc SQL / joins — use BigQuery (often paired).
- Small workloads — minimum cluster size is non-trivial; Firestore/Spanner often cheaper for OLTP.
- Strong-consistency multi-row transactions — Bigtable is row-atomic only.

## Data Model
Same as HBase / the Bigtable paper:
- **Tables** of rows.
- **Row key** (lexicographically sorted).
- **Column families** (declared up-front, few).
- **Columns** within families (dynamic, sparse).
- **Cell values** versioned by timestamp; multiple versions kept (configurable garbage collection).

```
row key                 | cf:profile (family)         | cf:events (family)
"user#42#2026-05-03"    | name="Alice", country="US"  | event@t1=login, event@t2=click
"user#42#2026-05-04"    | (empty — sparse OK)         | event@t3=purchase
```

### Row-key design = whole game
- Reads/writes for one row are atomic.
- Range scans on consecutive rows are fast (one tablet).
- Therefore: design row keys so common queries are *single rows* or *contiguous ranges*.

## Architecture & Internals
- Data divided into **tablets** (Bigtable's term for shards / regions) by row-key range.
- Tablets are owned by **tablet servers**.
- Storage on **Colossus** (Google's distributed file system; the GFS successor).
- **SSTables** (sorted string tables) — immutable, LSM-style.
- Memtable in RAM + commit log on Colossus.
- Bigtable's compute (tablet servers) and storage (Colossus) are **separated**: tablet movements are essentially metadata operations because no data is copied.

```
Client ──► Tablet server (owns tablet) ──► commit log (Colossus)
                                          memtable (RAM)
                                          ─► flush → SSTable (Colossus)
```

## Consistency Model
- **Strong consistency for single-row** reads/writes (atomic).
- No multi-row transactions.
- **Replication consistency**:
  - **Single-cluster instance** — strong.
  - **Replicated instance** (multiple clusters): eventually consistent across clusters by default; **single-cluster routing** for read-your-writes; the new **App Profiles** + **eventual** vs **strong** routing options control this.

## Replication
- Bigtable **instances** can have **multiple clusters** in different regions/zones for HA + geo-distribution.
- Replication is **async**, eventually consistent.
- **Routing policies** (App Profiles): single-cluster (strong), multi-cluster (high-availability), and per-app preferences.
- A **failover** redirects traffic to another cluster — typically near-instant.

## Partitioning / Sharding
**Automatic.** Bigtable splits/merges tablets dynamically based on size and load. You design row keys; Bigtable does the rest.

### Row key design rules
- **No monotonically increasing prefixes** (timestamps, auto-increment IDs at the front) → hot tablet on the latest range.
- **Reverse timestamps** so newest is "smallest": `key = "user#42#" + (MAX_LONG - now)`.
- **Salting / sharding prefix** for write-heavy time series: `(shard_0..N, timestamp)` — accept fan-out reads in exchange for write distribution.
- Use **separator characters** to keep field structure readable (`#`, `:`).

### Field-promotion pattern
When you need multiple access patterns: promote different fields into the row key in different tables (denormalize, like Cassandra's "table per query").

## Scale of a Single Instance
| Dimension | Per node | Cluster | Notes |
|---|---|---|---|
| Storage | up to ~5 TB SSD or ~16 TB HDD per node | unlimited (PBs) | storage is on Colossus, separated |
| Throughput | ~10K reads + 10K writes per node @ ms latency | hundreds of K+ across cluster | scales linearly with nodes |
| Latency | single-digit ms | — | very predictable |
| Tablets per node | hundreds | tens of thousands cluster-wide | auto-managed |
| Cluster nodes | min 1, scale to N | hundreds | add/remove dynamically |

**Scaling story:** change node count via API/console; Bigtable rebalances tablets in minutes (no data movement, just metadata pointers).

## Performance Characteristics
- ms-level reads/writes.
- Predictable performance at scale — Google's "p99 obsession" shows.
- Bottlenecks: hot tablets from bad row keys, very large row sizes, frequent garbage collection of versioned cells.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Fully managed, ms latency at PB scale | GCP-only |
| Storage decoupled from compute (Colossus) | No SQL / joins / multi-row txn |
| Auto-sharding, scales by changing node count | Hot-tablet from bad row keys is a real risk |
| HBase API compatibility (migrations possible) | Cost ramps quickly past min cluster size |
| Multi-cluster replication for HA | Async cross-cluster replication |

## Common HLD Patterns
- **IoT / time-series ingestion** with `(deviceId, reverse_ts)` row keys + sharding prefix.
- **Ad serving / personalization**: per-user row holding profile + recent events.
- **Feature store** for ML: features keyed by entity id, low-latency lookup.
- **Bigtable + BigQuery** federation — operational store + analytics.
- **Graph adjacency**: row key = `node_id`, columns = neighbor IDs (used by Google's web graph).

## Common Pitfalls / Gotchas
- **Monotonic row keys** → hot tablet → throttling. Always salt / reverse.
- **Tall tables** (lots of rows, few columns) vs **wide tables** (few rows, many columns) — Bigtable likes both, but unbounded *wide* rows hurt — keep rows under ~100 MB.
- **Unbounded GC versions** — set GC policies per family (e.g. keep last N versions or last N days).
- **Cross-row transactions** — not supported. Restructure or use Spanner.
- **Treating it like a relational DB** with joins — won't end well.

## Interview Cheat Sheet
- **Tagline:** "Google's wide-column NoSQL — Bigtable-paper-original, fully managed, ms latency at PB scale."
- **Best at:** time-series / IoT / ad-tech / personalization at huge QPS on GCP.
- **Worst at:** SQL, multi-row transactions, off-GCP.
- **Scale of one node:** ~5 TB SSD; cluster scales linearly; storage on Colossus is effectively unlimited.
- **Shard by:** row-key range (auto-tablet splitting); design keys to avoid hot tablets (salt / reverse).
- **Consistency:** row-atomic strong; multi-cluster replication async.
- **Replicates how:** managed multi-cluster instances with App Profile routing.
- **Killer alternatives:** HBase (open-source sibling), Cassandra / ScyllaDB, DynamoDB, Spanner (for SQL + ACID).

## Further Reading
- Bigtable paper (2006): https://research.google/pubs/pub27898/
- Bigtable docs: https://cloud.google.com/bigtable/docs
- Schema design guide: https://cloud.google.com/bigtable/docs/schema-design