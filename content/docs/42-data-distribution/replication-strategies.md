---
title: "Replication Strategies"
description: "Single-leader, multi-leader, leaderless; synchronous vs asynchronous; quorums; read-your-writes / monotonic / consistent prefix reads — how distributed systems make multiple copies of data without obviously breaking."
---

> Topic: Key Concept · Category: Data Distribution · Difficulty: Foundational

## TL;DR
**Replication** is keeping multiple copies of the same data on multiple machines. It buys **durability** (a node dying loses no data), **availability** (failover), **read scale** (many replicas serve reads), and sometimes **geographic locality** (replicas near users). The three architectures are **single-leader (master-replica)**, **multi-leader**, and **leaderless (Dynamo-style)**. The orthogonal axis is **sync vs async**: sync replication blocks the write until at least N replicas ACK; async returns immediately and replicates in the background. Quorums (`R + W > N`) give you tunable consistency on top of leaderless replication. The interesting subtleties are **read-your-writes**, **monotonic reads**, **consistent prefix reads**, **replication lag**, **conflict resolution**, and **failover correctness**.

## What problem does it solve?
- **Durability** — if one node's disk dies, data survives.
- **High availability** — promote a replica when the leader fails.
- **Read scale** — N replicas can serve N× the read QPS (writes still go through one leader unless multi-leader).
- **Geographic latency** — local-region replicas serve nearby users in single-digit ms.
- **Disaster recovery** — async cross-region replica is your last-ditch backup.

## How it works (the architectures)

### 1. Single-leader (primary-replica)
All writes go to one **leader**; leader streams the change log (WAL / binlog / oplog) to **followers**. Reads can go to leader (strong) or followers (eventually consistent). Used by **PostgreSQL streaming replication, MySQL, MongoDB replica sets, SQL Server, Oracle Data Guard, Redis (replicas), etcd / Zookeeper / Raft**.
- ✅ Simple; strong consistency on the leader.
- ❌ Single write point; failover is hard to get right.

### 2. Multi-leader (active-active)
Multiple nodes accept writes; replicate to each other. Used by **CockroachDB / Spanner (each tablet's Raft group has one leader, but per-tablet leadership is distributed), Cassandra (multi-region active-active), Postgres BDR, MySQL Group Replication, CouchDB, multi-master DynamoDB Global Tables**.
- ✅ Local writes everywhere → low latency for global users.
- ❌ Conflicts need resolution (LWW, CRDTs, application logic).

### 3. Leaderless (Dynamo-style)
Any node accepts writes; client writes to **W replicas**, reads from **R replicas**, with `R + W > N` for strong reads. Used by **Cassandra, ScyllaDB, DynamoDB internally, Riak, Voldemort**.
- ✅ Very high availability; no failover (any node can serve).
- ❌ Conflicts on concurrent writes; needs vector clocks / LWW / CRDT.

## Sync vs async replication

| Aspect | Synchronous | Asynchronous |
|---|---|---|
| Write latency | Slower (waits for ACKs) | Fast (returns immediately) |
| Durability on leader crash | No data loss (data on N replicas) | May lose recent writes |
| Availability on replica failure | Write blocks | Write succeeds; replica catches up later |
| Used by | Two-phase commit; Raft / Paxos commits; bank ledgers | Read replicas; geographic DR; most NoSQL |

**Hybrid: semi-sync** (one replica ACKs; rest are async) — MySQL semi-sync, Postgres `synchronous_commit = on` with one synchronous standby. Best balance for most systems.

## Quorum reads / writes (leaderless)
- N = total replicas (typically 3 or 5)
- W = number that must ACK a write
- R = number consulted on a read
- **`R + W > N` → strong consistency** (read sees latest write)
- Common: `N=3, W=2, R=2` (one replica can be down; reads still strong).
- Trade quorum for availability: `W=1` is fast but allows stale reads; `W=N` blocks on any failure.

## Replica consistency guarantees
- **Read-your-writes** — after I write X, I read X back (not stale). Achieved by routing my reads to the leader for a short window after my write.
- **Monotonic reads** — I never see "data go backwards in time." Pin a user to the same replica or use causal tokens.
- **Consistent prefix reads** — observers see writes in the order they were committed. Hard with multi-leader; trivial with single-leader.

## When to use it (real-world examples)
- **Single-leader sync replica** — banking / financial ledger (Postgres + sync standby).
- **Single-leader async replica** — read-heavy SaaS (Postgres primary + async read replicas in the same region).
- **Multi-leader cross-region** — Google Docs, Notion, multi-region SaaS where users in EU + US write locally.
- **Leaderless** — Cassandra for write-heavy time-series; DynamoDB internally.
- **Geo-replication / DR** — async cross-region replica for disaster recovery (RPO ~ seconds-to-minutes).
- **Read replicas for analytics** — drain OLTP load by sending BI queries to a replica or an OLAP warehouse.
- **Cache replication** — Redis primary + replicas for read scale + failover.
- **Distributed consensus** (etcd, ZooKeeper, Consul) — Raft-based replicated state machine.
- **Multi-master DynamoDB Global Tables** — write anywhere; LWW conflict resolution.
- **CRDT-based collaboration** (Yjs, Automerge) — multi-leader with mathematically conflict-free merges.

## When NOT to use it
- **Single-node fits and you're okay with downtime** — replication adds ops cost.
- **You can't tolerate failover risk** without testing — replication can mask correctness bugs (split-brain).
- **Strong consistency required + want multi-region writes** — physics says you'll pay latency. Spanner-class systems (TrueTime / HLC + 2PC) help; otherwise pick a region.
- **Multi-leader without conflict strategy** — you'll silently corrupt data.

## Things to consider / Trade-offs
- **Replication lag** — async replicas lag the leader by ms-to-seconds; reads can be stale. SLA the lag.
- **Failover** — must be automated (with care) and idempotent. Manual failover is slow; automated failover risks split-brain.
- **Split-brain** — partition causes both halves to elect leaders. Mitigations: **fencing** (STONITH), **quorum-based leader election** (Raft / Paxos), **cluster manager** (Patroni, Orchestrator).
- **Conflict resolution (multi-leader / leaderless)**:
  - **Last-Write-Wins (LWW)** — needs synchronized clocks; data loss possible.
  - **Vector clocks** — preserves all conflicting versions; client merges.
  - **CRDTs** — math-guaranteed convergence (counters, sets, maps).
  - **Application semantics** — domain-specific merge logic.
- **Replica promotion** — replica must catch up to the latest log position before serving as leader.
- **Read consistency** — does your app expect read-your-writes? Route writes + immediate reads to leader.
- **Cross-region latency** — synchronous cross-region replication adds 50–150ms to every write.
- **Replica count** — 3 minimum (tolerate 1 failure); 5 for higher tiers.
- **Backup ≠ replica** — replica corrupts → backup saves you. Always have point-in-time backups.

## Common pitfalls
- **Stale reads from replica** — user updates profile, refresh page, sees old data. Solve with read-your-writes routing.
- **Split-brain** — both old leader and new leader accept writes during partition; merge later corrupts.
- **Long replication lag** undetected — replica drifts hours behind, then promotes after leader failure with massive data loss.
- **Async replication treated as durable** — leader crash before async replication = data loss.
- **Replica reads for transactional logic** ("is the seat booked?") — race condition on stale read.
- **No quorum for leader election** — using simple heartbeat causes split-brain on partition.
- **Multi-region write latency surprise** — choosing strong consistency means every write pays cross-region RTT.

## Interview Cheat Sheet
- **Three architectures:** single-leader, multi-leader, leaderless.
- **Sync vs async:** durability vs latency.
- **Quorum:** `R + W > N` ⇒ strong reads.
- **Default pick:** single-leader with sync standby in same region + async standby in another region.
- **Multi-region writes:** Spanner / CockroachDB (Paxos / Raft per range) or accept eventual consistency.
- **Conflict resolution:** LWW, vector clocks, CRDTs, app logic.
- **Read consistency:** read-your-writes via leader-routing-after-write; monotonic via session affinity.
- **Failover:** automated quorum-based; fence the old leader.

## Related concepts
- [Sharding & Partitioning](/docs/42-data-distribution/sharding-and-partitioning) — orthogonal; combined for scale-out.
- [Logical Clocks](/docs/43-time-and-ordering/logical-clocks) — order events without synchronized clocks.
- [Write-Ahead Log](/docs/48-storage-internals/write-ahead-log) — the substrate of single-leader replication.
- Concrete systems: [PostgreSQL](/docs/01-relational-databases/postgresql), [Spanner](/docs/01-relational-databases/spanner), [CockroachDB](/docs/01-relational-databases/cockroachdb), [Cassandra](/docs/03-wide-column-stores/cassandra), [DynamoDB](/docs/02-key-value-stores/dynamodb).
