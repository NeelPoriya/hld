---
title: "ScyllaDB"
description: "ScyllaDB is a drop-in replacement for Apache Cassandra, rewritten from scratch in C++ using a shard-per-core, shared-nothing architecture (Seastar framework). The result: 5–10× higher throughput per node and lower, mo..."
---

> Category: Wide-Column NoSQL (Cassandra-compatible) · Written in: C++ · License: Source Available (ScyllaDB) / AGPL (open-source flavor archived in 2024)

## TL;DR
ScyllaDB is a **drop-in replacement for Apache Cassandra**, rewritten from scratch in **C++** using a **shard-per-core, shared-nothing architecture (Seastar framework)**. The result: **5–10× higher throughput per node** and **lower, more predictable tail latencies** than Cassandra on the same hardware — with the same data model and CQL queries. If your problem says "Cassandra but please don't make me run 100 nodes," ScyllaDB is the answer.

## What problem does it solve?
Cassandra is excellent on paper but suffers operationally:
- JVM GC pauses cause latency spikes.
- It can't fully utilize big modern servers (lots of cores, fast NVMe, big NICs).
- You end up running many small nodes to hit your SLO.

ScyllaDB rebuilt the engine in C++ with **per-core sharding**, **DPDK-style polling, futures/promises async I/O, and direct disk control** — squeezing out the JVM overhead and saturating modern hardware.

## When to use
- Same use cases as Cassandra: write-heavy time-series, event histories, IoT, fraud, messaging, recommendations.
- When **per-node performance matters** — you want **fewer, bigger nodes**.
- When **predictable p99/p999 latency** is critical (no GC).
- Migrating from Cassandra to reduce TCO.
- Workloads on **bare metal or big cloud instances** (Scylla loves big cores + NVMe).

## When NOT to use
- Same as Cassandra non-fits: ad-hoc queries, joins, tiny scale.
- If you absolutely need a fully open-source license — Scylla's open-source flavor was archived in early 2024; the "Community Edition" is now **source-available** (BSL-style). Cassandra remains Apache 2.0.
- If you need bleeding-edge Cassandra features — Scylla tracks but lags slightly.

## Data Model
**Cassandra-compatible CQL.** Same as the [Cassandra doc](cassandra.md): partition keys, clustering keys, wide rows, denormalized table-per-query.

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

If you know Cassandra, you know Scylla's data model.

## Architecture & Internals
- **Seastar framework** — async, futures-based, no shared-state between cores.
- **Shard-per-core** — each CPU core owns a slice of the data and runs its own event loop. **No locks, no thread switching.**
- **Direct I/O on NVMe** with custom scheduler (no kernel page cache hot-path).
- **No JVM** → no GC pauses → consistent tail latency.
- LSM tree (SSTables + memtable + commit log), like Cassandra, but more efficient.
- **Workload prioritization / scheduling** — Scylla can co-schedule compactions, reads, and writes per CPU core to keep latency stable.

```
Per-node:
   ┌──── Core 0 ──── Core 1 ──── Core 2 ──── ... (each owns a shard)
   │      │           │           │
   │   memtable   memtable   memtable
   │   commit log commit log commit log
   │   SSTables   SSTables   SSTables
   └─ NVMe disks (direct I/O)
```

## Consistency Model
Same tunable consistency as Cassandra:
- `ONE`, `QUORUM`, `LOCAL_QUORUM`, `ALL`, `EACH_QUORUM`.
- AP by default, CP if tuned.
- LWT via Paxos (slow, avoid in hot path).

Scylla recently added **strongly consistent tables (Raft-based)** for metadata/schema operations, with row-level Raft tables emerging — narrowing the historic CP gap with Cassandra.

## Replication
Same as Cassandra: token ring, RF per keyspace, cross-DC via `NetworkTopologyStrategy`, hinted handoff, anti-entropy repair.

## Partitioning / Sharding
- **Token ring** like Cassandra at the cluster level.
- **Per-core sharding within a node** — the partition key not only routes to a node but to a **specific core** on that node.
- **Smart drivers** (Scylla shard-aware drivers) route directly to the owning core, skipping intra-node forwarding.

### Hot-partition rules — same as Cassandra
- Partition keys: high cardinality, even traffic, bounded size (< 100 MB / 100K rows ideal).
- Bucket time-series partitions by day/hour to bound size.
- Avoid celebrity-partition designs; use composite keys with a salt for hot tenants.

## Scale of a Single Instance
> Scylla's headline pitch is "fewer, bigger nodes than Cassandra."

| Dimension | Healthy per node | Stretch | Notes |
|---|---|---|---|
| Data per node | ~5–10 TB | 50–100 TB on bare metal | 5–10× Cassandra typical |
| Cores | 16–96+ (uses every core) | up to 192 cores | shard-per-core is the secret |
| Writes/sec | hundreds of K to 1M+ | multi-million on big bare metal | dramatically higher than Cassandra |
| Reads/sec | hundreds of K | million+ on big nodes | similar gap |
| p99 latency | sub-ms typical | — | no GC = stable |
| Cluster size | 3 (HA min) – tens of nodes | hundreds at hyperscale | smaller than equivalent Cassandra cluster |

**Comparison rule of thumb (per Scylla benchmarks):** **3 Scylla nodes ≈ 30 Cassandra nodes** for the same workload, because Scylla saturates each node's hardware fully.

## Performance Characteristics
- Sub-ms p99 reads/writes on healthy nodes.
- Linear scaling across cores within a node, then across nodes.
- Bottlenecks: NVMe IOPS, NIC bandwidth, network RTT. CPU rarely the limit.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| 5–10× per-node throughput vs Cassandra | Source-available (not pure Apache OSS anymore) |
| No GC, predictable p99 | Smaller community than Cassandra |
| Cassandra wire/CQL compatibility — easy migration | Some Cassandra features lag |
| Shard-per-core scales with hardware | Operationally non-trivial (less common know-how) |
| Built-in autotuning + workload prioritization | DynamoDB API only on Scylla Cloud / Alternator |

## Common HLD Patterns
- **Drop-in Cassandra replacement** to cut node count by 5–10×.
- Same patterns as [Cassandra](cassandra.md): time-series, messaging, feeds, IoT.
- **Scylla Alternator** — DynamoDB API on Scylla, used to migrate off DynamoDB without rewriting client code.
- **CDC**: Scylla → Kafka → analytics.

## Common Pitfalls / Gotchas
- Same Cassandra footguns: bad partition keys, wide rows, tombstones, `ALLOW FILTERING`, frequent overwrites.
- **Scaling reads with replicas** — Scylla still needs proper key design; "just add nodes" doesn't fix hot partitions.
- **Driver choice matters** — use **shard-aware drivers** to get the per-core routing benefit.
- **NUMA tuning**, IRQ pinning, and NVMe tuning are part of getting headline performance numbers.
- License changes (BSL-style) — review carefully if you're an OSS-only shop.

## Interview Cheat Sheet
- **Tagline:** "C++ rewrite of Cassandra with shard-per-core architecture; 5–10× per-node throughput, same data model."
- **Best at:** Cassandra-style workloads where per-node performance and predictable p99 matter.
- **Worst at:** ad-hoc SQL/joins, tiny workloads, pure-OSS-required environments.
- **Scale of one node:** 5–10 TB data; hundreds of K to 1M+ ops/sec; sub-ms p99.
- **Shard by:** token ring (cluster) + per-core shard (within node); same partition-key rules as Cassandra.
- **Consistency:** tunable; Raft-based strongly-consistent tables emerging.
- **Replicates how:** RF replicas on token ring; cross-DC via NetworkTopologyStrategy.
- **Killer alternatives:** Cassandra (the original), DynamoDB / Bigtable (managed), HBase (HDFS-backed), Aerospike (specialized).

## Further Reading
- Docs: https://www.scylladb.com/learn/
- Seastar framework: https://seastar.io/
- "Scylla vs Cassandra" benchmarks: https://www.scylladb.com/product/benchmarks/