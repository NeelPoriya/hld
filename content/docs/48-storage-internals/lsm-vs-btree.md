---
title: "LSM Trees vs B-Trees"
description: "The two dominant storage engine designs — B-Trees (Postgres, MySQL InnoDB, MongoDB WiredTiger) optimize for reads + in-place updates; LSM Trees (RocksDB, Cassandra, ScyllaDB, LevelDB, Bigtable) optimize for write throughput by buffering and merging."
---

> Topic: Key Concept · Category: Storage Internals · Difficulty: Foundational

## TL;DR
Database storage engines fall into two camps:
- **B-Tree (B+ Tree) engines** — keep keys sorted on disk in pages; lookups walk a tree (~3-5 disk seeks); updates modify pages in place. Optimize for **balanced reads + writes** with **stable read latency**. Used by **Postgres, MySQL InnoDB, MongoDB WiredTiger, SQL Server, Oracle, BoltDB**.
- **LSM Tree (Log-Structured Merge) engines** — buffer writes in memory (memtable) + write-ahead log; periodically flush to immutable on-disk **SSTables**; **compaction** merges SSTables in the background. Optimize for **write throughput** at the cost of **read amplification** + **background compaction overhead**. Used by **RocksDB, LevelDB, Cassandra, ScyllaDB, HBase, Bigtable, ClickHouse, InfluxDB, BadgerDB**.

The deep trade-off: **B-trees** trade space for predictable reads; **LSM** trades read complexity for huge write throughput. Pick LSM when writes dominate; B-tree when read latency matters most.

## What problem does each solve?

### B-Tree
- **Random updates in place** — find the leaf, modify, done.
- **Predictable read latency** — log_B(N) page reads; balanced.
- **Range scans** — leaves are linked; scan is sequential.

### LSM Tree
- **Write throughput >> disk random IOPS** — sequential append + later merge is way faster than random in-place writes.
- **Compression-friendly** — SSTables are immutable; high compression ratios.
- **Easier replication** — append-only log is naturally streamable.
- **Fast scans of recent data** — recent writes are in memtable / top SSTables.

## How they work

### B+ Tree
```text
                       [50, 100]
                      /    |    \
              [25]      [75]      [120, 150]
             /    \    /    \    /    |    \
           leaves with sorted (key, value) pairs
           leaves linked left-to-right for range scans
```

- All real data is in the **leaf level**.
- Internal nodes hold separator keys.
- Operations: lookup = log_B(N) page reads; update = read leaf + modify + write back.
- **WAL** ensures durability of in-place updates.

### LSM Tree
```text
   in-memory (RAM):
   ┌─────────────────┐         ┌──────────────┐
   │   memtable     │  flush   │  WAL (commit │
   │  (sorted map)  │  ───────►│   log on disk)│
   └────────┬────────┘         └──────────────┘
            │ when full → flush to disk as SSTable
            ▼
   on-disk (sorted, immutable):
   Level 0:  [SSTable0a]  [SSTable0b]  ← written from memtable; may overlap
   Level 1:  [SSTable1a]      [SSTable1b]   ← compacted, non-overlapping
   Level 2:  [SSTable2a]                              [SSTable2b]
   Level N:  ...                                                ← largest, oldest

   Read = check memtable → bloom filter → SSTable in each level
   Compaction = merge overlapping SSTables; drop deleted keys.
```

- Writes: append to memtable + WAL; ack immediately.
- Memtable full → flush to disk as a new SSTable.
- **Compaction** merges + sorts SSTables; resolves overwrites + tombstones.
- Reads: check memtable → cache → consult SSTables (filtered by Bloom filters).

## Core comparison

| Dimension | B-Tree | LSM Tree |
|---|---|---|
| **Write path** | Random page IO; in-place update | Sequential append (memtable + WAL) |
| **Write throughput** | Bounded by random IOPS | Bounded by sequential bandwidth (10–100× higher) |
| **Read path** | log_B(N) tree walk → 1 leaf | Memtable + L0..LN SSTable lookups (bounded by Bloom filters) |
| **Read latency** | Predictable | Variable; tail latency from compaction |
| **Range scan** | Linked leaves; very efficient | Multiple SSTables to merge; fine but slower |
| **Space amplification** | Page splits leave fragmentation; B-trees use ~50–80% of pages | Compaction temporarily inflates space (~2×); steady-state lower than B-tree |
| **Write amplification** | Low (1×) | High (10–30× from compaction) |
| **Read amplification** | 1 leaf read | Multiple SSTables read; mitigated by Bloom filters + block cache |
| **Compression** | Per-page; modest ratios | Per-SSTable; very high ratios |
| **Concurrency** | Page locks / latches | Lock-free for writes (memtable); compaction is background |
| **Deletes** | In-place delete + space reclaim | Tombstones; space reclaimed at compaction |
| **Crash recovery** | Replay WAL | Replay WAL into memtable |
| **Tail latency** | Stable | Spikes during compaction (mitigated by tiered / leveled compaction strategies) |

## When to use which (real-world examples)

### Pick B-Tree
- **Postgres, MySQL InnoDB** — general-purpose RDBMS with mixed workload; SQL with stable read latency.
- **MongoDB (WiredTiger default)** — document DB with rich query plans.
- **SQL Server, Oracle, DB2** — enterprise OLTP.
- **BoltDB / etcd Bolt store** — embedded KV; reads dominate.
- **OLTP** — bank ledger, e-commerce orders, anything where point lookups + updates dominate.
- **Heavy range scans** with predictable latency — leaves are linked.
- **Read-heavy systems** where p99 read latency matters more than write throughput.

### Pick LSM Tree
- **Cassandra, ScyllaDB, HBase, Bigtable** — wide-column write-heavy workloads.
- **RocksDB / LevelDB** — embedded KV under everything from MyRocks (MySQL on RocksDB) to TiKV to Kafka Streams state stores.
- **InfluxDB, ClickHouse** — time-series / analytics; massive write throughput.
- **Apache Druid, Pinot** — real-time analytics.
- **YugabyteDB, CockroachDB (Pebble), TiDB (TiKV → RocksDB)** — distributed SQL on LSM.
- **DynamoDB internals** — LSM under the hood.
- **MongoDB with WiredTiger LSM mode** — write-heavy collections.
- **Write-heavy ingestion pipelines** — IoT, logs, metrics, events.
- **Cold-data archives with high compression** — LSM compresses better.

## Things to consider / Trade-offs
- **Compaction strategy** — leveled (predictable; lower space amp; higher write amp) vs tiered (lower write amp; higher space amp; spikier reads). Cassandra defaults to leveled for read-heavy CFs.
- **Bloom filters** — essential in LSM; small RAM cost saves random IO on misses.
- **Block cache** — both B-tree (Postgres `shared_buffers`) and LSM (RocksDB block cache) use block-level caches.
- **Write amplification** — LSM compaction rewrites data multiple times. Modern SSDs absorb this fine; older HDDs struggled.
- **Tail latency** — LSM compaction can spike p99; mitigations: rate-limit compaction, prioritize foreground work.
- **Tombstones** — LSM deletes leave markers; until compaction, range scans walk over deleted keys (slow if deletes dominate).
- **Snapshot isolation / MVCC** — most engines (both kinds) layer MVCC on top with version chains or per-key version stamps.
- **Index structure** — both engines often use B-tree for secondary indexes regardless of primary engine.
- **Mixing strategies** — some systems (Wikipedia, ClickHouse) use both depending on the table.
- **Tunables** — RocksDB has hundreds of options; B-tree engines have fewer but page size + fillfactor matter.

## Common pitfalls
- **Choosing LSM for read-latency-sensitive OLTP** — compaction tail can hurt p99.
- **Choosing B-tree for write-heavy time-series** — random IOPS bottleneck.
- **LSM with too many SSTables (compaction backlog)** — read amplification grows; latency degrades.
- **Bloom filter false-positive rate too high** — wasted disk reads.
- **Compaction starvation** — under heavy writes, compaction can fall behind permanently; eventually read perf collapses. Cap write rate or scale.
- **Tombstone storms** — bulk delete in Cassandra without `gc_grace_seconds` tuning leaves graveyards.
- **Misusing in-place updates in B-tree under write contention** — page-level locks become hot.
- **Storage size estimation off** — B-tree fragmentation gives worse ratio than naïve calculation; LSM has compaction-window inflation.
- **Migrating between engines without backups** — different on-disk formats; export + reimport.

## Interview Cheat Sheet
- **B-Tree:** balanced; reads are log_B(N); writes update in place; predictable latency; Postgres / InnoDB / WiredTiger / SQL Server.
- **LSM Tree:** writes append to memtable + WAL → flush as immutable SSTable → compact in background; massive write throughput; RocksDB / Cassandra / Bigtable / LevelDB.
- **B-tree wins on:** read latency, mixed workloads, range scans, OLTP.
- **LSM wins on:** write throughput, compression, write-heavy ingestion, distributed KV stores.
- **Both use:** [Write-Ahead Log](/docs/48-storage-internals/write-ahead-log) for durability; block caches; secondary B-tree indexes.
- **Big-name LSM users:** Cassandra, RocksDB (MyRocks, TiKV, CockroachDB Pebble, Kafka Streams), HBase, Bigtable, InfluxDB.
- **Big-name B-tree users:** Postgres, MySQL InnoDB, MongoDB WiredTiger, SQL Server, Oracle.

## Related concepts
- [Write-Ahead Log](/docs/48-storage-internals/write-ahead-log) — substrate for both.
- [Caching Strategies](/docs/41-caching/caching-strategies) — block / page caches in both engines.
- [Bloom Filters](/docs/49-probabilistic-data-structures/bloom-filter) — critical to LSM read path.
- Concrete: [PostgreSQL](/docs/01-relational-databases/postgresql), [MySQL](/docs/01-relational-databases/mysql), [Cassandra](/docs/03-wide-column-stores/cassandra), [HBase](/docs/03-wide-column-stores/hbase), [Bigtable](/docs/03-wide-column-stores/bigtable), [ClickHouse](/docs/12-data-warehousing/clickhouse), [MongoDB](/docs/04-document-stores/mongodb).
