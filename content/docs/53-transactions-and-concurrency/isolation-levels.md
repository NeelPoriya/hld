---
title: "Database Isolation Levels"
description: "What 'I' in ACID actually means — Read Uncommitted, Read Committed, Repeatable Read, Snapshot Isolation, Serializable. The anomalies each prevents (dirty read, non-repeatable read, phantom, write-skew, lost update) and which level your database actually defaults to."
---

> Topic: Key Concept · Category: Transactions & Concurrency Control · Difficulty: Intermediate

## TL;DR
**Isolation level** specifies how visible concurrent transactions are to each other. SQL standard defines four levels — **Read Uncommitted**, **Read Committed**, **Repeatable Read**, **Serializable** — by which **anomalies** (dirty read, non-repeatable read, phantom read) they prevent. Real databases add a fifth: **Snapshot Isolation (SI)**, which feels like serializable for most workloads but allows **write-skew** anomalies. The actual defaults vary: **Postgres = Read Committed**, **MySQL InnoDB = Repeatable Read** (but with snapshot semantics), **Oracle = Read Committed**, **SQL Server = Read Committed**, **CockroachDB / Spanner = Serializable**.

The interview-critical insight: **higher isolation = more correctness, more contention, more aborts**. The most-misunderstood anomaly is **write-skew** — even SI doesn't prevent it; you need true serializable.

## What problem does it solve?
- **Concurrency anomalies** when multiple transactions touch the same data.
- **Bug class:** "the code looks right but two concurrent runs corrupt data" (lost updates, write-skew).
- **Cost-correctness trade:** higher isolation = more correctness + more locks / more conflict detections + more aborts. You pick a level that matches your workload's tolerance for anomalies.

## The anomalies (in order of severity)

| Anomaly | What happens | Prevented by |
|---|---|---|
| **Dirty read** | Read uncommitted data; later transaction rolls back | Read Committed |
| **Non-repeatable read** | Same query twice returns different rows (because another tx committed between) | Repeatable Read |
| **Phantom read** | Same range query twice returns different sets (insert / delete by another tx) | Serializable (or RR with predicate locks) |
| **Lost update** | Two tx read same row, both write; one's write is silently overwritten | Snapshot Isolation (with retry on conflict) or stronger |
| **Write-skew** | Two tx read overlapping data, write disjoint rows that violate a multi-row invariant | Serializable only |
| **Read-only anomaly** | Read-only tx sees inconsistent snapshot under SI in rare cases | Serializable |

### Concrete anomaly examples

**Dirty read:**
```sql
T1:  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
T2:  SELECT balance FROM accounts WHERE id = 1;     -- reads -100 mid-tx
T1:  ROLLBACK;
                                                    -- T2 saw value that never officially existed
```

**Non-repeatable read:**
```sql
T1:  SELECT balance FROM accounts WHERE id = 1;     -- 100
T2:  UPDATE accounts SET balance = 50 WHERE id = 1; COMMIT;
T1:  SELECT balance FROM accounts WHERE id = 1;     -- 50 — different from first read!
```

**Phantom:**
```sql
T1:  SELECT COUNT(*) FROM orders WHERE day = '2026-01-01';     -- 5
T2:  INSERT INTO orders (day, ...) VALUES ('2026-01-01', ...); COMMIT;
T1:  SELECT COUNT(*) FROM orders WHERE day = '2026-01-01';     -- 6 — phantom!
```

**Lost update (classic):**
```sql
T1:  SELECT balance FROM accounts WHERE id = 1;     -- 100
T2:  SELECT balance FROM accounts WHERE id = 1;     -- 100
T1:  UPDATE accounts SET balance = 100 + 50 WHERE id = 1;     -- 150
T2:  UPDATE accounts SET balance = 100 + 30 WHERE id = 1;     -- 130 — T1's +50 lost!
```

**Write-skew (the SI killer):**
```sql
-- Invariant: at least one doctor on call.
T1:  SELECT count FROM doctors_on_call;              -- 2
T1:  UPDATE doctors_on_call SET on_call = false WHERE doc_id = 'A';
T2:  SELECT count FROM doctors_on_call;              -- 2 (still, snapshot)
T2:  UPDATE doctors_on_call SET on_call = false WHERE doc_id = 'B';
T1:  COMMIT;  T2:  COMMIT;     -- Both succeed under SI; invariant violated!
```

## The levels

### Read Uncommitted (RU)
- Allows **dirty reads**.
- Almost never correct; rarely supported (Postgres treats it as Read Committed).

### Read Committed (RC) — Postgres / Oracle / SQL Server default
- Each statement sees only **committed** data.
- Allows non-repeatable, phantom, lost update, write-skew.
- Cheap; concurrent throughput high.

### Repeatable Read (RR) — MySQL InnoDB default; SQL standard's name
- Each transaction sees a **snapshot** taken at first read.
- Prevents dirty + non-repeatable.
- SQL standard says it allows phantoms; MySQL InnoDB's "RR" actually uses gap locks → no phantoms (closer to SI).
- Naming hell: "Repeatable Read" means different things in different DBs.

### Snapshot Isolation (SI)
- Each transaction works against a **consistent snapshot at start**.
- Prevents dirty + non-repeatable + phantoms + lost updates (with first-committer-wins or first-updater-wins).
- **Allows write-skew + read-only anomalies.**
- Implementation: **MVCC (Multi-Version Concurrency Control)** — every row has multiple versions; readers see the version valid as of their snapshot.
- Postgres "Repeatable Read" mode is actually SI. Oracle "Serializable" is SI. SQL Server "Snapshot" is SI.

### Serializable (SER)
- Outcome equivalent to **some serial order** of transactions.
- Prevents all anomalies.
- Implementations:
  - **Strict 2PL (two-phase locking)** — read locks + write locks; held until commit. (Old MySQL.)
  - **Serializable Snapshot Isolation (SSI)** — Postgres's `SERIALIZABLE` mode; tracks read-write dependencies; aborts conflicting transactions. (Cahill, Röhm, Fekete 2008.)
  - **Optimistic + retry on conflict** — CockroachDB, FoundationDB.
- Cost: more contention + more aborts (your code must retry).

## What real databases do

| Database | Default | Available levels |
|---|---|---|
| **PostgreSQL** | Read Committed | RC, Repeatable Read (= SI), Serializable (= SSI) |
| **MySQL InnoDB** | Repeatable Read (≈ SI with gap locks) | RU, RC, RR, Serializable |
| **Oracle** | Read Committed | RC, Serializable (= SI) |
| **SQL Server** | Read Committed (locking) | RC, Snapshot, Serializable |
| **MongoDB** | "Snapshot read" since 4.0 | snapshot, local, majority |
| **CockroachDB** | Serializable | only Serializable |
| **Spanner** | Strict serializable | only strict serializable |
| **TiDB** | Snapshot Isolation | SI, Serializable (optional) |
| **DynamoDB** | n/a (single-item is "atomic"; transactions provide SI) | TransactWriteItems = SI |

The naming chaos:
- "Serializable" in Oracle = SI; in Postgres = SSI; in Spanner = strict serializable.
- "Repeatable Read" in MySQL InnoDB ≠ SQL-standard RR; it's roughly SI.

## When to use which (real-world examples)
- **Read Committed:** general-purpose web apps, most OLTP workloads. Postgres / Oracle / SQL Server default. Anomalies handled in app via re-reads or `SELECT ... FOR UPDATE`.
- **Repeatable Read / SI:** reports / aggregations needing consistent snapshot; long-running transactions; e-commerce checkout.
- **Serializable / SSI:** financial systems, audit, anti-double-spend, anything with multi-row invariants (write-skew matters). CockroachDB / Spanner's default.
- **Read Uncommitted:** essentially never. Sometimes for monitoring / sampling on huge tables.

## When NOT to use it
- **Serializable for high-throughput OLTP** without thinking — you'll see abort storms; consider RC + explicit locking instead.
- **Snapshot Isolation for write-skew-prone code** — won't catch invariant violations across rows.
- **Read Uncommitted ever, for correctness-critical reads.**
- **Trusting "Serializable" name across DBs** — verify what your DB actually means.

## Things to consider / Trade-offs
- **Higher level = more correctness + more aborts.** Your application must handle abort + retry.
- **MVCC** is the dominant implementation for SI / RR / SSI; readers don't block writers and vice versa.
- **Phantom prevention** in RR varies — InnoDB uses gap locks; Postgres SSI uses dependency tracking; Spanner uses interval locks.
- **Locking-based serializable** (old MySQL) is simple but causes lots of blocking.
- **SSI** (Postgres) is "optimistic": runs at SI speed; only aborts on detected serialization conflict. Aborts can be high under contention.
- **Long-running transactions** are anti-patterns; they hold locks / snapshots and starve others.
- **`SELECT ... FOR UPDATE`** is your friend at RC for explicit row-level locking.
- **Optimistic concurrency** (version columns) is often a better alternative to higher isolation.
- **Distributed isolation** is an order of magnitude harder; Spanner / Cockroach pay for it with TrueTime / HLC + commit-wait.

## Common pitfalls
- **"My RR works at MySQL but breaks at Postgres"** — they're different things.
- **Trusting "Serializable" without testing** — Oracle's serializable is actually SI; allows write-skew.
- **Lost updates** at RC because of read-modify-write race. Fix: `UPDATE ... SET balance = balance + ?` (let the DB do the math) or `SELECT ... FOR UPDATE`.
- **Write-skew** under SI on multi-row invariants. Fix: serializable, or materialize the conflict (e.g., insert a "constraint row").
- **Long transactions** holding snapshots → bloat, vacuum lag (Postgres), undo growth (Oracle).
- **Forgetting to retry serialization-failure errors** — SSI / serializable systems abort on conflict; you must retry.
- **Overusing `FOR UPDATE`** → deadlocks; consistent lock order helps.
- **Mixing isolation levels in one logical operation** — surprising behaviors.
- **Ignoring deadlock errors** — most DBs auto-detect and abort one tx; your app must retry.

## Interview Cheat Sheet
- **Standard levels (SQL):** Read Uncommitted, Read Committed, Repeatable Read, Serializable.
- **Anomalies:** dirty read, non-repeatable read, phantom, lost update, write-skew, read-only anomaly.
- **Snapshot Isolation (SI)** is widespread; prevents most anomalies BUT not write-skew.
- **True serializable** = SI + dependency-tracking (SSI) or strict 2PL.
- **Default levels** vary: PG / Oracle / SQL Server = RC; MySQL InnoDB = RR; CockroachDB / Spanner = Serializable.
- **Higher isolation = more aborts**; your app must retry.
- **Killer interview phrase:** "Snapshot Isolation prevents lost updates but not write-skew; for invariants across rows, you need true serializable (Postgres SSI / Spanner / CockroachDB)."

## Related concepts
- [ACID vs BASE](/docs/51-consistency-and-cap/acid-vs-base) — ACID's "I" is exactly this.
- [MVCC vs Locking](/docs/53-transactions-and-concurrency/mvcc-and-locking) — implementation strategies.
- [Optimistic vs Pessimistic Concurrency](/docs/53-transactions-and-concurrency/optimistic-vs-pessimistic) — application-level patterns.
- [Consistency Models](/docs/51-consistency-and-cap/consistency-models) — orthogonal: across replicas vs across transactions.
- Concrete: [PostgreSQL](/docs/01-relational-databases/postgresql), [MySQL](/docs/01-relational-databases/mysql), [CockroachDB](/docs/01-relational-databases/cockroachdb), [Spanner](/docs/01-relational-databases/spanner).
