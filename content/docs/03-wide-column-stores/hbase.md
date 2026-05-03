---
title: "Apache HBase"
description: "HBase is the open-source clone of Google Bigtable, sitting on top of HDFS. It's a wide-column, sorted-by-row-key, strongly-consistent NoSQL store designed for random read/write access on top of a Hadoop data lake. It'..."
---

> Category: Wide-Column NoSQL on HDFS · Written in: Java · License: Apache 2.0

## TL;DR
HBase is the **open-source clone of Google Bigtable**, sitting on top of **HDFS**. It's a **wide-column, sorted-by-row-key**, strongly-consistent NoSQL store designed for **random read/write access on top of a Hadoop data lake**. It's the right pick when you've already invested in HDFS and need low-latency random access to billions of rows alongside Hive/Spark batch workloads.

## What problem does it solve?
HDFS is great for big sequential scans but lousy for random access. HBase fills that gap: it gives **single-row CRUD with millisecond latency** while reusing HDFS as durable storage. Bigtable did this internally at Google; HBase brought the architecture to open source.

## When to use
- **Hadoop-centric** stacks needing low-latency random access (real-time messaging history, recommendations, user profile lookup over big-data lake).
- **Time-series / sensor data** at huge scale (with care to avoid hot regions).
- **Auditing / append-heavy** workloads with frequent point lookups.
- Workloads with **strict strong consistency** (HBase is CP, unlike Cassandra's tunable consistency).

## When NOT to use
- Greenfield outside Hadoop — Cassandra / DynamoDB / ScyllaDB / Bigtable are usually easier.
- Ad-hoc queries / joins / SQL — HBase is key-based; Phoenix layer adds limited SQL.
- Small data — operational overhead is high.
- Strict low-latency multi-DC active-active — HBase is single-master per region; cross-DC replication is async.

## Data Model
- **Tables** of rows, sparse and wide.
- Each row has a **row key** (lexicographic sort).
- Columns grouped into **column families** (declared at table creation; few, stable).
- Columns within a family are dynamic — you can have millions of columns per row.
- Each cell is **versioned** by timestamp (multiple versions retained, configurable).

```
Row key      | cf:user                       | cf:metrics
-------------|-------------------------------|---------------------------
2026:user42  | first=Alice, last=Doe         | logins@t1=5, logins@t2=7
2026:user43  | first=Bob                     | logins@t1=12
```

### Row key design — the entire game
- Rows stored in **sorted order** by key.
- Range scans on the row key are extremely efficient.
- All your access patterns must funnel through the row key.

## Architecture & Internals
- **HMaster** — coordinates metadata and region assignments.
- **RegionServers** — workers that host regions (key ranges).
- **Regions** — contiguous row-key ranges; one region = one RegionServer at a time.
- **HFiles** — immutable sorted files on HDFS (LSM tree storage).
- **WAL** on HDFS for durability.
- **MemStore** — in-memory write buffer per region; flushed to HFiles.
- **Compaction** merges HFiles (minor + major).
- **Zookeeper** — coordinates HMaster, RegionServer membership.

```
Client ──► RegionServer (owns region) ──► WAL on HDFS
                                  │       MemStore (RAM)
                                  └─► flush → HFile (HDFS)
```

## Consistency Model
- **Strong row-level consistency** — each row has a single owner (the RegionServer hosting that region).
- Atomic single-row operations; CAS via `checkAndPut`.
- **No multi-row ACID transactions** (Phoenix adds limited transactions on top).
- CAP: **CP** — region unavailable until reassigned after RegionServer death.

## Replication
- Storage durability via HDFS (3× block replication).
- **Cross-cluster replication** — async, eventually consistent. Used for DR or analytics replicas.

## Partitioning / Sharding
- **Auto-splitting**: when a region exceeds a size threshold (default ~10 GB), HBase splits it.
- One region = one RegionServer at a time → row-key locality enables fast range scans.
- **Pre-splitting** at table creation is recommended to avoid the "single hot region" problem at the start.

### Hot-region pitfalls (the classic HBase footgun)
- **Sequential row keys** (`timestamp`, `auto-increment`) → all writes go to one region (the latest one) → **hot region**, dead cluster.
- **Solutions** ("salting" / key reversal):
  - **Hash prefix**: `(hash(natural_key)_short, natural_key)` — distributes evenly but breaks scan-by-natural-key (unless you accept reading from N pre-split regions).
  - **Reversed key**: store `reverse("123456")` so consecutive logical IDs land in distant regions.
  - **Bucket prefix**: `(bucket_0..N, natural_key)` — prefix random bucket, write to one of N regions.

### Region count tuning
- Aim for **dozens to a few hundred regions per RegionServer**.
- Too many regions → RegionServer overhead + GC pain.
- Too few → not enough parallelism.

## Scale of a Single Instance
| Dimension | Per node (RegionServer) | Cluster | Notes |
|---|---|---|---|
| Storage | tens of TB | PBs | sits on HDFS |
| Regions | ~100–500 | tens of thousands | tune carefully |
| Writes/sec | ~10K–50K | hundreds of K+ | LSM-friendly |
| Reads/sec | thousands to tens of K | scales with cluster | reads are heavier than writes |
| Row size | KB to MB | up to ~100 MB | not designed for huge cells |
| GC heap | ~30 GB max | — | avoid bigger heaps; G1GC + tuning required |

**Scaling story:** add RegionServers; HMaster reassigns/splits regions. Storage grows separately on HDFS.

## Performance Characteristics
- Random read latency: a few ms (with cache hits) to tens of ms (cold).
- Random write latency: a few ms; LSM write path is fast.
- Range scan: very fast for consecutive row keys on one region.
- Bottlenecks: GC pauses, region hotspots, compaction stalls, HDFS NameNode pressure for tiny regions.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Strong consistency, MVCC versioning | Operationally heavy (ZK + HDFS + HMaster + RegionServers) |
| Low-latency random access on HDFS data lake | Single-master per region — failover means brief unavailability |
| Mature, used at FB / Yahoo for messaging | Smaller community than Cassandra/HBase alternatives |
| LSM is great for write-heavy workloads | Cross-DC replication is async and fragile |
| Pluggable Phoenix SQL layer | Region hotspot is a constant design concern |

## Common HLD Patterns
- **Time-series at scale** with salted keys: `(bucket, sensor_id, reverse_ts)`.
- **Messaging history / event store** — Facebook Messenger ran on HBase for years.
- **Hadoop ecosystem combo**:
  ```
  Spark / Hive batch on HDFS  ←→  HBase random access  →  online services
  ```
- **OpenTSDB on HBase** — historical time-series database.
- **CDC**: HBase replication → another HBase / Kafka / analytics.

## Common Pitfalls / Gotchas
- **Sequential row keys** → hot region. Always salt or reverse.
- **Too many column families** (recommended: 1–3) — each adds I/O.
- **GC tuning is mandatory** at scale.
- **Major compactions** without throttling crush latency.
- **Ignoring pre-splitting** new tables — first writes pile on one region.
- **Reading from a slow scanner** in clients without batching → tens of K of small RPCs.

## Interview Cheat Sheet
- **Tagline:** "Open-source Bigtable on HDFS — strongly-consistent wide-column NoSQL with low-latency random access."
- **Best at:** Hadoop ecosystems, billion-row random-access stores, time-series with salting.
- **Worst at:** ad-hoc SQL, multi-DC active-active, small workloads.
- **Scale of one node:** tens of TB, 10K–50K writes/sec, hundreds of regions.
- **Shard by:** row-key range; pre-split + salt to avoid hot regions.
- **Consistency:** strong row-level, CP, no multi-row transactions natively.
- **Replicates how:** HDFS 3× block replication for storage; async cross-cluster replication for DR.
- **Killer alternatives:** Bigtable (managed sibling), Cassandra/ScyllaDB (leaderless wide-column), DynamoDB (managed), Phoenix (SQL on HBase).

## Further Reading
- Docs: https://hbase.apache.org/book.html
- Bigtable paper: https://research.google/pubs/pub27898/
- *HBase: The Definitive Guide* — Lars George.