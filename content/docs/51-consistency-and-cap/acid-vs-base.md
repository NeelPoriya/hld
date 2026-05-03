---
title: "ACID vs BASE"
description: "The two design philosophies for data systems — ACID (RDBMS-style: strict, transactional) vs BASE (NoSQL-style: optimistic, eventually-consistent). Where each shines and how modern DBs blur the line."
---

> Topic: Key Concept · Category: Consistency Models · Difficulty: Foundational

## TL;DR
**ACID** (Atomicity, Consistency, Isolation, Durability) is the **RDBMS contract** popularized by classic relational databases — every transaction is all-or-nothing, doesn't see partial state, and survives crash. Strong guarantees, performance cost, hard to scale horizontally.

**BASE** (Basically Available, Soft state, Eventual consistency) is the **NoSQL response** to ACID's scale ceiling — accept weaker guarantees in exchange for partition tolerance, low latency, and horizontal write scalability.

The split is **less stark today**. Modern systems offer **both** (Spanner / CockroachDB / FoundationDB give ACID over a distributed cluster; DynamoDB now has transactions; Cassandra has lightweight transactions). Use ACID where you need it (financial / inventory / authentication) and BASE where eventual is fine (social feeds / analytics / search).

## What problem does each solve?

### ACID
- **Atomicity:** all-or-nothing. Bank transfer debit + credit either both happen or neither.
- **Consistency** (note: this is *integrity-constraint consistency*, NOT distributed-system consistency): transactions move the DB from one valid state to another (no broken referential integrity, etc.).
- **Isolation:** concurrent transactions don't see each other's mid-state (configurable; see [Isolation Levels](/docs/53-transactions-and-concurrency/isolation-levels)).
- **Durability:** committed transactions survive crashes (via [Write-Ahead Log](/docs/48-storage-internals/write-ahead-log)).

### BASE
- **Basically Available:** the system always responds, even with stale or partial data.
- **Soft state:** data may change without input over time (replicas converge).
- **Eventually consistent:** given enough time + no new writes, replicas converge.

ACID solves *correctness*; BASE solves *availability and scale at the cost of moving correctness into the application*.

## How they're achieved

### ACID
- **WAL** for atomicity + durability.
- **MVCC + locks** for isolation.
- **Checkpoint + recovery** for crash safety.
- **Single-leader** typically, or distributed-Paxos / Raft for cluster ACID (Spanner, CockroachDB).

### BASE
- **Multi-leader / leaderless replication** (Cassandra, DynamoDB, Riak).
- **Tunable quorums** (`R + W > N` for stronger reads).
- **Conflict resolution:** Last-Write-Wins (LWW), vector clocks, CRDTs, app logic.
- **Eventual consistency** between replicas; reads from any node.
- **Optimistic concurrency** rather than locking.

## When to use each (real-world examples)

### ACID
- **Financial ledgers / payments** (Postgres, MySQL, Spanner, CockroachDB) — money math is non-negotiable.
- **Authentication / authorization** — race conditions on session creation cause real exploits.
- **Inventory / booking** — double-book a hotel room and someone's vacation is ruined.
- **Order management** — multi-row updates (order + line items + inventory).
- **Configuration / governance** — IAM rules, RBAC.
- **Compliance-critical systems** — healthcare, regulated industries.
- **Multi-row business invariants** — "total ≤ credit limit," "FK integrity."

### BASE
- **Social media feeds / posts / likes** (Cassandra, DynamoDB) — eventual is fine.
- **Massive-scale logging / metrics** (Cassandra, ScyllaDB, ClickHouse) — replication lag of seconds is fine.
- **Distributed caches** (Redis, Memcached) — TTL-bounded staleness.
- **Search indexes** (ElasticSearch) — eventual is the design.
- **DNS** — TTL-bounded eventual.
- **Recommendation systems / personalization** — staleness is acceptable.
- **CDN edge state** — eventual by definition.
- **IoT / time-series ingest** — write-heavy, ordering matters per-device only.
- **Multi-region active-active for collab** (CRDTs) — Yjs, Automerge.

## When NOT to use each
- **ACID for billion-write/sec time-series:** vertical scale ceiling; use BASE + sketches.
- **ACID for read-heavy global apps with cross-region writes:** linearizable cross-region commits add 100ms+ per write.
- **BASE for billing / payments:** silent data loss is unacceptable.
- **BASE for booking / inventory:** double-bookings, oversells.
- **BASE for authentication:** race conditions on session creation = security holes.
- **Anywhere the application can't handle conflicts:** if you don't have a conflict-resolution strategy, BASE is dangerous.

## Things to consider / Trade-offs
- **ACID is not slow per se;** RDBMSs do millions of TPS. The cost shows up at distributed-cluster scale + cross-region.
- **BASE doesn't mean inconsistent forever;** convergence is usually seconds, often sub-second, in well-tuned systems.
- **The dial is per-table or per-query** in modern DBs:
  - DynamoDB: transactions (ACID) + eventually-consistent reads (BASE) coexist in one table.
  - Cassandra: lightweight transactions + LOCAL_QUORUM + ALL.
  - MongoDB: multi-document transactions since 4.0.
  - Spanner / Cockroach: ACID over distributed Paxos.
- **Application complexity** — ACID DB ≈ DB does the work; BASE DB ≈ app handles conflicts, retries, idempotency, dedup.
- **Conflict resolution strategies** in BASE: LWW (clocks lie!), version vectors, CRDTs, application merge.
- **"AP" alone tells you nothing** about *which* anomaly is allowed and *what* you do about it.
- **ACID + horizontal scale** = expensive (Spanner uses GPS + atomic clocks; Cockroach uses HLC + commit-wait).
- **BASE + correctness** is achievable but takes app-side work (idempotency, sagas, version-stamping).

## Where modern systems blur the line
- **Spanner / CockroachDB / TiDB / YugabyteDB** — distributed SQL; ACID with horizontal scale (paying latency).
- **DynamoDB transactions** — `TransactWriteItems` gives ACID across up to 100 items in one region.
- **Cassandra LWT (Light-Weight Transactions)** — Paxos-based compare-and-set on a single row.
- **MongoDB transactions** — multi-document ACID since 4.0; sharded since 4.2.
- **Postgres logical replication** — eventual cross-cluster.
- **FaunaDB** — globally distributed ACID.
- **Hybrid HTAP databases** — ACID OLTP path + columnar OLAP path on same data.

## Common pitfalls
- **Equating ACID with "slow" and BASE with "fast"** — both can be either depending on workload + scale.
- **Treating "C" of ACID and "C" of CAP as the same.** They're not. ACID-C = integrity constraints; CAP-C = linearizability.
- **Picking BASE for cost / scale and discovering you needed ACID for one critical operation.** Use ACID-where-needed pattern.
- **Trusting eventual consistency without a conflict-resolution policy** — silent data loss / reordering.
- **Long-running ACID transactions blocking everyone** — keep transactions short; use optimistic / saga patterns for long flows.
- **Believing "NoSQL = no ACID."** Many NoSQL systems now offer ACID at the document or partition level.
- **Using LWW for conflict resolution with skewed clocks** — see [Clock Skew](/docs/43-time-and-ordering/clock-skew-and-ntp).
- **Cross-shard ACID assumptions** — most "ACID" databases lose ACID across shards / regions unless they're explicitly distributed-SQL.

## Interview Cheat Sheet
- **ACID:** strict transactional contract — atomic, consistent (integrity), isolated, durable. Used by RDBMSs + modern distributed SQL (Spanner, Cockroach).
- **BASE:** weaker guarantees in exchange for partition tolerance + horizontal scale. Eventual consistency + soft state.
- **Use ACID for:** money, inventory, auth, multi-row invariants.
- **Use BASE for:** feeds, logs, caches, search, telemetry, CDN.
- **Modern systems blur:** DynamoDB transactions, Cassandra LWT, Mongo transactions, Spanner.
- **Pick per use case**, not per database.
- **Eventual without conflict resolution = silent data loss.**
- **CAP-C ≠ ACID-C.** Different "C"s.

## Related concepts
- [CAP Theorem & PACELC](/docs/51-consistency-and-cap/cap-theorem-and-pacelc) — the binary framing.
- [Consistency Models](/docs/51-consistency-and-cap/consistency-models) — the spectrum between linearizable + eventual.
- [Isolation Levels](/docs/53-transactions-and-concurrency/isolation-levels) — the "I" of ACID in detail.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — cross-service "ACID-without-2PC."
- [Idempotency](/docs/44-delivery-semantics/idempotency) — survival kit for BASE systems.
