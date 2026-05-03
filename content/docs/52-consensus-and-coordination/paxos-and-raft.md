---
title: "Paxos & Raft"
description: "The two consensus algorithms that underpin every modern distributed coordinator — Paxos (the foundational, infamously hard one) and Raft (the same job, designed to be understandable). What they actually do, where they're used, and what to memorize for interviews."
---

> Topic: Key Concept · Category: Consensus & Coordination · Difficulty: Intermediate

## TL;DR
**Consensus** is the problem of getting `2F+1` machines to agree on a sequence of values **even if `F` of them fail**. Both **Paxos** (Lamport, 1989/1998) and **Raft** (Ongaro & Ousterhout, 2014) solve it; both pick a **leader**, replicate a **log of operations** to a **majority**, and apply entries in order on every replica's state machine. **Raft is a re-presentation of Paxos** — same guarantees, organized as **leader election + log replication + safety** in a way humans can actually implement.

You'll never implement either yourself; you'll use libraries that do (`etcd-raft`, `hashicorp/raft`, `Apache Ratis`, `Atomix`). What matters in an HLD interview is being able to say **"this distributed lock / leader election / strongly-consistent KV / replicated config store is Raft / Paxos under the hood, tolerating `F` failures with `2F+1` nodes, with linearizable reads from the leader."**

## What problem does it solve?
- **Single source of truth** in a cluster of failure-prone nodes.
- **Linearizable reads / writes** across replicas.
- **Leader election** that's correct under partitions (no split-brain).
- **Replicated state machine** — every node applies the same operations in the same order.
- **Cluster membership management** (adding / removing nodes).
- **Foundation of distributed locks, configuration, service discovery, distributed transactions, distributed databases**.

## How they work

### Raft (the version humans implement)

Raft splits consensus into three sub-problems:

**1. Leader election**
- Every node starts as **follower**.
- If no leader heartbeat for an election timeout (randomized 150-300ms), become **candidate**, increment term, vote for self, request votes.
- Candidate with majority of votes becomes **leader**; sends heartbeats.
- One leader per term; randomized timeout breaks split votes.

**2. Log replication**
- Clients send commands to leader.
- Leader appends to its log, sends `AppendEntries` to followers.
- Once a **majority** has the entry, leader **commits** it; sends commit index in next heartbeat; followers apply.

**3. Safety**
- Leader's log is the source of truth.
- New leader cannot be elected unless its log is at least as up-to-date as a majority.
- Term numbers prevent old leaders from "coming back from the dead" and overwriting committed state.

```text
   Client       Leader        Follower 1    Follower 2
     │            │                │             │
     ├──CMD───────►              │             │
     │            ├─AppendEntries→             │
     │            ├─AppendEntries──────────────►
     │            ◄────ACK────────              │
     │            ◄────ACK────────────────────  │
     │  (majority OK → commit)                  │
     │            ├──Heartbeat (commitIndex)───►
     │            ├──Heartbeat (commitIndex)──────────►
     │  ◄──OK─────                               │
```

### Paxos (Multi-Paxos in practice)
- Two phases per round:
  - **Phase 1 (Prepare):** proposer picks a proposal number, asks acceptors "will you accept ≥ N?" Acceptors reply "yes, here's the highest value I've seen."
  - **Phase 2 (Accept):** proposer chooses a value (highest seen, or its own if none), asks acceptors to accept. Majority ACK = chosen.
- **Multi-Paxos** elects a stable leader to skip Phase 1 on subsequent rounds, getting the same throughput as Raft.
- Less prescribed structure → many variants (Cheap Paxos, Fast Paxos, Generalized Paxos, EPaxos).

### Both require:
- **2F+1 nodes** to tolerate F failures.
- **Persistent log + state** survives reboots.
- **Quorum reads / writes** (majority).
- **Linearizable** semantics on committed entries.

## Where they live in real systems

| System | Algorithm | Purpose |
|---|---|---|
| **etcd** | Raft | Kubernetes control plane KV store |
| **Consul** | Raft (per DC) | Service discovery + KV + locks |
| **CockroachDB** | Raft (per range) | Distributed SQL |
| **TiDB / TiKV** | Raft (per region) | Distributed SQL |
| **YugabyteDB** | Raft (per tablet) | Distributed SQL |
| **MongoDB replica set** | Raft-like | Replica election + oplog |
| **Hazelcast / Atomix** | Raft | Distributed locks + KV |
| **HashiCorp Nomad / Vault** | Raft | Cluster state |
| **ZooKeeper** | ZAB (Paxos cousin) | Distributed coordination |
| **Apache Cassandra (LWT)** | Paxos | Lightweight transactions |
| **Google Spanner** | Multi-Paxos (per directory) | Globally-distributed SQL |
| **Google Chubby** | Multi-Paxos | Lock service (inspiration for Zookeeper) |
| **FoundationDB** | Paxos-based commit | Distributed KV |
| **CRDB Resolved Timestamps** | Raft + lease | Closed timestamps for follower reads |
| **Kafka KRaft** | Raft | Replaces ZooKeeper as Kafka metadata layer |

## When to use it (real-world examples)
- **Distributed configuration store** (etcd, Consul, ZooKeeper) — strongly consistent reads + writes, leader election.
- **Distributed lock** ("only one process is the cron leader").
- **Distributed databases** (Spanner, CockroachDB, TiDB) — per-range Raft groups.
- **Service discovery** with strong consistency (Consul service catalog).
- **Cluster metadata** (Kafka KRaft, Kubernetes API server backed by etcd).
- **Replicated state machines** — anything where "every replica applies the same ops in the same order" matters.
- **Single-shard ACID** in distributed databases.
- **Membership / failover state** (which node is the leader?).

## When NOT to use it
- **High-throughput data path** — Paxos / Raft is for *coordination*, not bulk data. Run consensus on metadata; replicate data with simpler streaming.
- **Single-DC where strong consistency is overkill** — async replication is cheaper.
- **You want availability under minority partition** — minority side stalls (CP behavior).
- **Cross-region writes with low latency** — consensus + cross-region RTT = 100s of ms per write.
- **You need >7-9 voting members** — quorum size grows with N; throughput drops.
- **You can solve with a single-leader DB + sync standby** — much simpler.

## Things to consider / Trade-offs

### General
- **Quorum size:** majority of voters. 3 nodes → 2-of-3, tolerates 1 failure. 5 nodes → 3-of-5, tolerates 2.
- **Even-numbered clusters** are an anti-pattern — same fault tolerance as N-1 with higher latency.
- **Leader bottleneck** — all writes go through leader; single-leader throughput cap.
- **Cross-region latency** — every commit is one majority round-trip; 50-150ms cross-region.
- **Lease-based reads** for performance — leader holds a "lease" valid for X ms; reads served locally without round-trip.
- **Closed timestamps / follower reads** (CockroachDB, Spanner) — followers serve stale-but-bounded reads.
- **Log compaction** — log can't grow forever; periodic snapshot + truncate.
- **Membership changes** are subtle; both algorithms have a defined "joint consensus" / "single change at a time" protocol.
- **Network partitions** isolate the minority; only majority side can commit.

### Raft-specific
- **Randomized election timeout** prevents split votes.
- **Pre-vote** optimization avoids term inflation when partition heals.
- **Read index** lets leader serve linearizable reads without writing.
- **Joint consensus** for safe membership changes.

### Paxos-specific
- **Multi-Paxos with stable leader** = same shape as Raft.
- **Generalized Paxos** allows commutative ops to commit in parallel.
- **EPaxos** removes the leader; supports multi-leader with conflict tracking.
- **Fast Paxos** does 1 RTT but only when there's no contention.

## Common pitfalls
- **Even-number clusters** — adds a node without adding fault tolerance; use 3, 5, or 7.
- **Misconfiguring quorum sizes** during membership change → split-brain. Use joint consensus / one-at-a-time protocol.
- **Long network partition** — minority side accumulates client requests (timing out); plan for the failure mode.
- **Disk full** on leader → log can't append → cluster halts.
- **Slow disks** make Raft / Paxos slow — fsync latency is the floor.
- **Stale reads from leader after partition** — leader thinks it's leader but isn't; mitigated by **lease + check** (`ReadIndex`) or losing leadership cleanly.
- **Cross-region 5-node cluster with 1+1+3 split** — losing the 3-node DC kills the cluster; place voters carefully.
- **Treating Paxos / Raft as a database** — it's a coordination primitive; don't store user data there directly.
- **Single-pace deploys breaking quorum** — restart only one node at a time.
- **Using Raft for analytics-scale data replication** — wrong tool; use Kafka / streaming replication.

## Interview Cheat Sheet
- **Consensus = N nodes agree on an ordered log of operations, tolerating < N/2 failures.**
- **Raft and Paxos are equivalent;** Raft is easier to implement, Paxos has more variants.
- **2F+1 nodes tolerate F failures.** 3 → 1; 5 → 2; 7 → 3.
- **Phases:** Raft = leader election + log replication + safety; Multi-Paxos = stable leader + accept rounds.
- **Used by:** etcd, Consul, ZooKeeper (ZAB), Spanner, CockroachDB, TiDB, MongoDB, Kafka KRaft, FoundationDB, Vault.
- **Stable leader = throughput;** majority write quorum = correctness.
- **Reads:** linearizable from leader (with lease / read-index); follower reads are bounded-stale.
- **Don't use it for bulk data;** use it for metadata / coordination.
- **Cross-region cost = majority RTT per write.**

## Related concepts
- [CAP Theorem](/docs/51-consistency-and-cap/cap-theorem-and-pacelc) — Paxos / Raft are CP.
- [Two-Phase Commit](/docs/52-consensus-and-coordination/two-phase-commit) — different problem (cross-system atomicity).
- [Leader Election](/docs/52-consensus-and-coordination/leader-election) — application of consensus.
- [Distributed Locks](/docs/52-consensus-and-coordination/distributed-locks) — built on consensus.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — Raft is one form.
- Concrete: [etcd](/docs/02-key-value-stores/etcd), [ZooKeeper](/docs/14-workflow-orchestration-and-coordination/zookeeper), [Spanner](/docs/01-relational-databases/spanner), [CockroachDB](/docs/01-relational-databases/cockroachdb), [Consul](/docs/34-dns-and-service-discovery/consul).
