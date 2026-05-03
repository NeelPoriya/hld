---
title: "MVCC vs Locking"
description: "The two strategies databases use to give you isolation — Multi-Version Concurrency Control (multiple row versions, no read locks) vs Two-Phase Locking (read + write locks). What Postgres / MySQL / Oracle do, why MVCC won OLTP, and the cost of the version chain."
---

> Topic: Key Concept · Category: Transactions & Concurrency Control · Difficulty: Intermediate

## TL;DR
A database needs to enforce isolation between concurrent transactions. The two strategies:
- **Two-Phase Locking (2PL)** — readers acquire **shared (read) locks**, writers acquire **exclusive (write) locks**, locks held until commit. Simple, deterministic; **readers block writers and vice versa**.
- **Multi-Version Concurrency Control (MVCC)** — every row has multiple versions; **readers see a snapshot**, writers create a new version. Readers and writers don't block each other. Cost: storage for version chain, garbage collection (Postgres `VACUUM`, Oracle undo, MySQL purge thread).

**MVCC won OLTP**: PostgreSQL, Oracle, MySQL InnoDB, SQL Server (snapshot mode), CockroachDB, Spanner, MongoDB, FoundationDB all use MVCC. Pure 2PL is rare today (DB2 mainframes, some old-school systems, in-memory DBs like H-Store).

The interview takeaway: **MVCC means readers don't block, but the version chain has costs (storage bloat, GC pressure, long-running transactions can pin old versions).**

## What problem does each solve?

### 2PL
- **Strict isolation** with a simple model — locks define order.
- **Easy to reason about** for serializable correctness.
- **Predictable performance** in low-contention workloads.

### MVCC
- **High read concurrency** without blocking — readers always see a consistent snapshot.
- **Long-running read queries** don't block writes (e.g., reporting / analytics on a live OLTP DB).
- **Snapshot reads** for "what did the data look like 10 minutes ago?"
- **Time-travel queries** (Postgres `AS OF SYSTEM TIME`, Spanner stale reads).

## How they work

### 2PL

```text
Phase 1 (Growing):  acquire locks as needed (S for read, X for write)
Phase 2 (Shrinking): release locks (typically all at commit)

Lock compatibility:
            Read (S)   Write (X)
Read (S)    OK         WAIT
Write (X)   WAIT       WAIT
```

- **Strict 2PL** = release all locks at commit/abort (most common variant).
- **Deadlock detection** required; DB picks a victim and aborts one transaction.
- **Granularity:** row, page, table, predicate (gap locks for phantom prevention).

### MVCC

Every row carries metadata:
- `xmin` = transaction ID that created this version.
- `xmax` = transaction ID that deleted/superseded this version (or ∞).
- A reader at snapshot `S` sees a row version where `xmin ≤ S` and (`xmax > S` OR `xmax = NULL`).

```text
Row id=42, value="alice":
   v1: xmin=10, xmax=20, value="alice"        ← deleted/superseded by tx 20
   v2: xmin=20, xmax=30, value="alicia"       ← deleted/superseded by tx 30
   v3: xmin=30, xmax=∞,  value="alex"         ← live version

Reader at snapshot 25 sees v2 ("alicia").
Reader at snapshot 35 sees v3 ("alex").
Writer creating tx 40 will:
  - Mark v3.xmax = 40
  - Insert v4 with xmin=40
```

**Garbage collection** removes versions older than the oldest active snapshot (Postgres `VACUUM`, MySQL InnoDB purge, Oracle undo retention).

## Comparison

| Dimension | 2PL | MVCC |
|---|---|---|
| **Reads block writes?** | Yes (S vs X conflict) | No (readers see snapshot) |
| **Writes block reads?** | Yes | No |
| **Writes block writes?** | Yes | Yes (always) |
| **Read consistency** | Read latest committed (with locks held) | Snapshot |
| **Write conflict** | Lock wait → eventually deadlock detection | Detected at commit; abort one |
| **Storage** | Single version per row | Multiple versions; needs GC |
| **Long reads with writes** | Reader holds locks → blocks writers | Reader uses snapshot; no impact |
| **Implementation complexity** | Simpler | More complex (snapshots, GC, version metadata) |
| **Deadlocks** | Common | Possible at write-write only |
| **Suitability for analytics on OLTP** | Bad (locks block writers) | Excellent (snapshot reads) |
| **Used by** | DB2, old MySQL, in-memory DBs | Postgres, Oracle, InnoDB, SQL Server snapshot, Cockroach, Spanner, Mongo |

## Implementations

### PostgreSQL MVCC
- Versions stored in **heap pages**; old versions become "dead tuples."
- `VACUUM` reclaims space; **autovacuum** runs in background.
- Long-running transactions block VACUUM → "table bloat" → degraded performance.
- Snapshot at transaction (or statement, depending on isolation level) start.

### MySQL InnoDB
- "Undo log" stores old versions; rollback segment.
- `purge_thread` removes superseded versions.
- Read view captured at transaction start (in RR mode).

### Oracle
- "Undo" tablespace with rollback segments.
- `UNDO_RETENTION` parameter; old snapshots invalid after retention window.
- Famous "ORA-01555 snapshot too old" error when undo is reclaimed before query finishes.

### SQL Server snapshot isolation
- Versions stored in `tempdb`.
- Tradeoff: tempdb size + latency.

### CockroachDB / Spanner
- MVCC with HLC / TrueTime timestamps; no centralized GC; per-range cleanup.
- "Closed timestamps" mark "no more writes earlier than T" → cleanup safe.

## When each shines (real-world examples)

### MVCC
- **OLTP with simultaneous analytics** — Postgres replica + reporting query without blocking.
- **Long-running reports** — won't block writers.
- **Time-travel** — Spanner / Cockroach `AS OF SYSTEM TIME 'now() - 10s'`.
- **High-concurrency reads** — almost all modern web apps.
- **Distributed databases** — MVCC simplifies cross-node consistency.

### 2PL
- **Pure OLTP with predictable, short transactions** — bank-ledger systems on DB2.
- **In-memory databases** where the version chain is expensive — H-Store, VoltDB.
- **Strict workload control** where locking semantics are non-negotiable.

## Things to consider / Trade-offs
- **MVCC bloat** — long-running transactions pin old versions; table size grows; queries slow. Monitor `pg_stat_user_tables` (`n_dead_tup`).
- **VACUUM tuning** — autovacuum lag can hurt; tune `autovacuum_vacuum_scale_factor`, run `VACUUM FULL` rarely (it locks table).
- **Index versions** — Postgres has bloated indexes from MVCC too; HOT updates partially mitigate.
- **Write-write conflicts under MVCC** — first-committer-wins or first-updater-wins; transactions retry on serialization failure.
- **2PL deadlocks** — DB picks a victim and aborts; app must retry.
- **Read-only transactions** under MVCC are essentially free (no locks; snapshot read).
- **Global / distributed snapshots** under MVCC require synchronized timestamps (TrueTime / HLC).
- **Application's job** — handle serialization-failure errors gracefully (retry); MVCC + serializable means more aborts under contention.
- **Snapshot age limits** — Oracle's undo retention; Postgres replica conflict; Spanner's GC window.
- **Locking still happens in MVCC** — for write-write conflicts and explicit `SELECT ... FOR UPDATE`.

## Common pitfalls
- **Long-running transactions** in Postgres/MySQL → bloat. Keep transactions short.
- **`SELECT ... FOR UPDATE` overuse** turning MVCC into 2PL — defeats the purpose.
- **Trusting MVCC = no contention** — write-write conflicts still happen.
- **Forgetting to retry on serialization failure** at SSI level.
- **Manual version-column-based concurrency** while DB has MVCC — duplicate work.
- **VACUUM disabled or lagging** — silent performance death.
- **Cross-region MVCC without HLC** — clock skew breaks snapshots.
- **Killing a hung query without aborting the transaction** — MVCC version chain still pinned.
- **Confusing isolation level with MVCC** — orthogonal: isolation says what anomalies allowed; MVCC vs 2PL is how it's enforced.

## Interview Cheat Sheet
- **2PL:** read locks + write locks held until commit. Readers block writers. Simple. Old.
- **MVCC:** every row has multiple versions; readers see snapshots; readers don't block writers. Modern default.
- **MVCC users:** Postgres, Oracle, MySQL InnoDB, SQL Server (snapshot), Cockroach, Spanner, Mongo, FoundationDB.
- **MVCC cost:** version chain storage + GC (`VACUUM` / undo / purge).
- **Long-running transactions** under MVCC = bloat. Keep them short.
- **Write-write conflicts** still need locks even under MVCC; first-committer-wins.
- **Killer phrase:** "MVCC means readers don't block, but you pay in storage + GC pressure."

## Related concepts
- [Isolation Levels](/docs/53-transactions-and-concurrency/isolation-levels) — what guarantees are provided.
- [Optimistic vs Pessimistic Concurrency](/docs/53-transactions-and-concurrency/optimistic-vs-pessimistic) — app-level patterns.
- [Write-Ahead Log](/docs/48-storage-internals/write-ahead-log) — both 2PL and MVCC need WAL for durability.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — MVCC simplifies replicas.
- Concrete: [PostgreSQL](/docs/01-relational-databases/postgresql), [MySQL](/docs/01-relational-databases/mysql), [Oracle], [CockroachDB](/docs/01-relational-databases/cockroachdb), [Spanner](/docs/01-relational-databases/spanner).
