---
title: "Write-Ahead Log (WAL)"
description: "The append-only log that makes durable databases possible — write changes to the log first, apply to the actual data later. Crash recovery, replication, and event sourcing all rest on WAL."
---

> Topic: Key Concept · Category: Storage Internals · Difficulty: Foundational

## TL;DR
A **Write-Ahead Log (WAL)** is the cornerstone of durable databases: **before** modifying any data page, write the change to an **append-only log** that's `fsync`'d to disk. After a crash, recovery replays the log to restore committed transactions. The log is sequential → fast writes; data files can be updated lazily. **Almost every durable database uses a WAL** under different names: PostgreSQL `WAL`, MySQL InnoDB `redo log`, MongoDB `oplog`, SQLite `WAL mode`, RocksDB / LevelDB / Cassandra commit log, Kafka log (the entire data model is a WAL exposed as a service), Raft log, etcd / ZooKeeper transaction log. WAL is also the substrate of **single-leader replication**, **point-in-time recovery (PITR)**, **CDC** (Debezium tails MySQL binlog / Postgres WAL), and **event sourcing**.

## What problem does it solve?
- **Durability under crash** — `D` of ACID. Without WAL, a crash mid-write loses the change.
- **Atomicity** — a transaction's writes are atomically committed by appending one commit record to the log; recovery applies-or-rolls-back as a unit.
- **Performance** — appending to a sequential log on disk is **far** faster than writing random data pages. The actual data pages can be lazily flushed (and batched).
- **Replication** — followers consume the leader's WAL to stay in sync; the WAL IS the replication stream.
- **Backup / PITR** — base snapshot + WAL since snapshot = restore to any point in time.
- **CDC** — downstream consumers tail the WAL to replicate changes elsewhere.

## How it works

```text
Without WAL (dangerous):
  WRITE row → flush page to disk → ack client
                              │
                              └─ crash here = corrupted page

With WAL:
  WRITE row → append change to WAL → fsync WAL → ack client
                                              │
                                              └─ data page may not be flushed yet,
                                                 but WAL is durable.
                                                 Recovery replays WAL → applies change.
```

1. **Begin transaction.** WAL records `BEGIN`.
2. **Write data changes** to in-memory pages. Append `INSERT/UPDATE/DELETE` records to WAL.
3. **Commit.** Append `COMMIT` to WAL → `fsync` → ack the client.
4. **Background:** dirty pages flushed to data files (checkpointing).
5. **Crash.** On restart, **redo** WAL from last checkpoint up to last committed transaction; **undo** uncommitted partial transactions.

### ARIES recovery protocol (the textbook)
Most relational DBs (Postgres, InnoDB, DB2, SQL Server) use **ARIES**:
- **Analysis** — find dirty pages and active transactions at crash.
- **Redo** — replay all logged changes from oldest dirty page LSN, even uncommitted ones.
- **Undo** — for transactions that didn't commit, walk back via undo log records (CLRs).

### LSM-style commit log
RocksDB / LevelDB / Cassandra: writes go to **memtable** (in-memory) + **commit log** (append-only on disk). On flush, memtable becomes an SSTable; commit log can be discarded.

## When you encounter it (real-world examples)
- **PostgreSQL WAL** — written to `pg_wal/`; tools like `pg_basebackup` + WAL shipping for replication / PITR.
- **MySQL InnoDB redo log** + **binlog** — redo for crash recovery, binlog for replication.
- **MongoDB oplog** — capped collection of operations; replicas tail it.
- **SQLite WAL mode** — `PRAGMA journal_mode=WAL` enables concurrent reads + a single writer.
- **RocksDB / LevelDB** — append-only write-ahead log + memtables + SSTables.
- **Cassandra / ScyllaDB** — commit log + memtable + SSTables.
- **Kafka** — partitioned log IS a WAL exposed as a streaming service. Consumers' `committed offset` is the WAL replay pointer.
- **Raft / Paxos** — consensus log is a replicated WAL.
- **etcd / ZooKeeper** — transaction log is a WAL.
- **Filesystems** — ext4 / XFS / NTFS use journals (WAL for the filesystem).
- **CDC** — [Debezium](/docs/27-cdc-and-data-integration/debezium) tails Postgres WAL / MySQL binlog / MongoDB oplog.
- **Event sourcing** — the event store IS a WAL applied at the application layer.

## When NOT to use a WAL (or relax it)
- **Strict ephemeral / no durability needed** — Memcached doesn't WAL; data lost on restart by design.
- **Read-mostly cache** — WAL adds write cost.
- **Append-only filesystems** — already provide WAL semantics implicitly.
- **Tradeoff: relaxed durability for speed** — `synchronous_commit = off` (Postgres) batches WAL flushes; faster but you can lose recently-committed transactions on crash. Used in non-critical workloads.
- **Memtable-only configurations** — Redis with `appendfsync no` or no AOF; trades durability for throughput.

## Things to consider / Trade-offs
- **`fsync` is expensive** — every commit waits for the disk; group commits batch many transactions into one fsync.
- **Group commit** — Postgres / InnoDB / Kafka batch fsyncs; throughput up dramatically with sub-ms latency cost.
- **Disk throughput is the WAL bottleneck** — sequential writes are fast (1+ GB/s on NVMe), but WAL on a slow disk == DB throughput limit. Separate WAL device for high-throughput DBs.
- **Checkpointing** — periodically flush dirty pages so WAL can be truncated; balance between checkpoint I/O and recovery time.
- **WAL size** — too small + frequent checkpoints = checkpoint storms. Too large + infrequent checkpoints = long recovery on crash.
- **WAL retention** — for replication / PITR / CDC, must retain enough history; balance disk vs replication lag tolerance.
- **Synchronous vs async commit** — sync = durable on commit; async = "we'll get to fsync soon" → can lose recent commits on crash.
- **WAL on shared disk in clusters** — fsync semantics differ; verify storage layer guarantees.
- **WAL compression** — Postgres `wal_compression`; reduces WAL volume at small CPU cost.
- **Logical vs physical WAL** — physical (Postgres default) records page-level changes; logical records logical operations (used for CDC, logical replication).
- **Replication lag** — measured in WAL position (LSN); monitor with `pg_stat_replication`.
- **Crash safety vs corruption** — WAL doesn't help if the disk lies about fsync (cheap consumer SSDs without power-loss protection have lost data on power outages).

## Common pitfalls
- **`fsync` on a lying disk** — consumer SSD acks before durable. Use enterprise SSDs with PLP.
- **Disabling fsync for performance** — fast until the first crash, then data loss.
- **No checkpointing** — recovery time is the entire WAL; can take hours.
- **Single shared disk for WAL + data** — IO contention; recommend separate device.
- **WAL not monitored** — disk fills up, DB stops accepting writes (Postgres halts on WAL disk full).
- **CDC consumer falls behind** — replication slot retains all WAL forever; disk fills.
- **WAL retention too short for PITR window** — backup gap.
- **Forgetting to back up WAL with base** — base snapshot alone doesn't restore to "now."
- **Replicas reading from WAL faster than primary writes** — falls back to base copy; design carefully.
- **Logical decoding plugin missing** — CDC tools fail silently.

## Interview Cheat Sheet
- **One-liner:** durable databases write changes to an append-only log + fsync **before** updating data files; recovery replays the log.
- **Why it's fast:** sequential append > random page write.
- **Used everywhere:** Postgres WAL, MySQL redo + binlog, MongoDB oplog, RocksDB / Cassandra commit log, SQLite WAL mode, Kafka log, Raft log.
- **Pair with:** checkpointing (truncate WAL), group commit (batch fsyncs), replication (consume the WAL).
- **Trade-offs:** sync vs async commit (durability vs throughput); WAL retention vs disk space; checkpoint frequency vs recovery time.
- **CDC** = tail the WAL.
- **Event sourcing** = WAL at the application layer.
- **Killer phrase:** "the WAL is the database" — many systems treat the data files as a derived projection of the WAL.

## Related concepts
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — built on top of WAL streaming.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — application-layer WAL.
- [CQRS](/docs/47-event-driven-architecture/cqrs) — read models projected from the WAL.
- [LSM Trees vs B-Trees](/docs/48-storage-internals/lsm-vs-btree) — both rely on WAL for durability.
- Concrete: [PostgreSQL](/docs/01-relational-databases/postgresql), [Kafka](/docs/09-message-queues-and-streaming/kafka), [Cassandra](/docs/03-wide-column-stores/cassandra), [MongoDB](/docs/04-document-stores/mongodb), [Debezium](/docs/27-cdc-and-data-integration/debezium).
