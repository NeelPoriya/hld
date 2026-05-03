---
title: "Apache Zookeeper"
description: "Zookeeper is a strongly-consistent coordination service for distributed systems — it provides the building blocks for leader election, configuration, naming, locks, and membership. You don't store user data in it; you..."
---

> Category: Distributed Coordination / Consensus Service · Written in: Java · License: Apache 2.0

## TL;DR
Zookeeper is a **strongly-consistent coordination service** for distributed systems — it provides the building blocks for **leader election, configuration, naming, locks, and membership**. You don't store user data in it; you store the **decisions** that distributed systems need to agree on. It powers (or used to power) Kafka, HBase, Hadoop, Solr, Flink, and many more. New systems often pick **etcd** or **Consul** for the same job, but the *concepts* are the same and Zookeeper still appears in the field constantly.

## What problem does it solve?
Distributed systems must agree on basic facts: "who is the leader?", "what is the current config version?", "is node X alive?". Solving this from scratch is hard (Paxos, Raft, etc.). Zookeeper solves it once, reliably, and exposes a small filesystem-like API that other systems can use as a primitive. Think of it as a **tiny, replicated, strongly-consistent KV store with watches** — a foundation other distributed systems are built on.

## When to use
- **Leader election** — pick one node from a group to perform a singleton role (master, scheduler, controller).
- **Service discovery / membership** — track which nodes in a cluster are alive.
- **Distributed configuration** — push config changes to many services with watch-based notifications.
- **Distributed locks / barriers / queues** — coordinate access to shared resources.
- **Cluster metadata storage** — small data (KB to a few MB), strongly-consistent.
- **Dependency of other systems** you're operating: Kafka (legacy mode), HBase, Solr, NiFi, Druid, Storm, etc.

## When NOT to use
- **General-purpose KV / database** — Zookeeper is not for user data. Total cluster data should stay small (typically << 1 GB).
- **Hot data path** — every write goes through consensus → not built for thousands of writes/sec from app code.
- **Greenfield projects today** — most teams pick **etcd** (Kubernetes' choice, simpler, faster) or **Consul** (service discovery + health + KV in one).
- **Browser-facing apps / latency-sensitive request paths** — wrong tier.

## Data Model
Zookeeper exposes a **hierarchical filesystem-like namespace** of **znodes**:

```
/
├── services/
│   ├── billing/
│   │   ├── leader        (ephemeral)
│   │   └── members/
│   │       ├── instance-001  (ephemeral)
│   │       └── instance-002  (ephemeral)
│   └── orders/
│       └── ...
└── config/
    └── feature-flags        (persistent)
```

Each znode stores:
- A small payload (default 1 MB max, recommended << 1 MB).
- Metadata (`czxid`, `mzxid`, version, ACL, etc.).

Znode types:
- **Persistent** — survive client disconnect.
- **Ephemeral** — auto-deleted when the creating session ends. (This is how membership / leader election work.)
- **Sequential** — name auto-suffixed with monotonic counter (`/lock/lock-0000000001`). Combined with ephemeral → **ephemeral sequential**, the basis for **fair locks** and **leader election**.

### Watches
Clients can set a **watch** on a znode. When it changes, Zookeeper sends a **one-shot** notification. This is how downstream systems react to membership / config changes without polling.

## Architecture & Internals
- **Ensemble** of nodes — typically **3, 5, or 7** servers (always odd to avoid split-brain ties).
- **Roles:**
  - **Leader** — handles all writes and orders them.
  - **Followers** — serve reads, replicate writes from the leader, vote on consensus.
  - **Observers** (optional) — replicate state for read scaling without participating in voting.
- **Consensus protocol: ZAB (Zookeeper Atomic Broadcast)** — similar to Multi-Paxos / Raft. Writes need a **majority quorum** to commit.
- Storage: **transaction log** (every write fsynced) + periodic **snapshots**. Replays log on restart.

```
Client write ──► Follower ──► Leader ──► broadcast proposal
                                  │
                                  └─► quorum of acks ──► commit ──► apply ──► reply
```

### Why odd numbers?
Quorum = `floor(N/2) + 1`.
- 3 nodes → quorum 2 → tolerates 1 failure.
- 5 nodes → quorum 3 → tolerates 2 failures.
- 7 nodes → quorum 4 → tolerates 3 failures.
- 4 nodes also tolerates 1 failure but costs more — odd numbers are more efficient.

## Consistency Model
Zookeeper offers **strong consistency** with these guarantees:
- **Sequential consistency** — updates from a client are applied in order.
- **Atomicity** — updates either succeed or fail; no partial state.
- **Single system image** — clients see the same view regardless of which server they connect to.
- **Linearizable writes** — every write is ordered globally by the leader.
- **Reads are *not* strictly linearizable by default** — followers may serve slightly stale state. Use `sync()` before a read for linearizable reads.
- **Reliability / durability** — once acked, a write survives quorum crashes.

CAP positioning: **CP** — under partition, the minority side stops accepting writes (and reads, depending on config) to preserve consistency.

## Replication
- Writes go through ZAB to all servers; majority quorum required.
- Reads can be served by **any** follower (fast, possibly slightly stale).
- **Observers** replicate state but don't vote — useful for scaling read throughput in geo-distributed setups without slowing the write path.
- **Cross-DC**: deploy a 5-node ensemble with 2 in DC-A, 2 in DC-B, 1 in DC-C as a tiebreaker. Or use observers in remote DCs.

## Partitioning / Sharding
Zookeeper **does not partition data**. The whole namespace lives on every server in the ensemble.

This is why total data must stay small (<< 1 GB). For large state, build **sharded layers on top** (each shard with its own coordination znodes) or use a different system.

### Common pitfalls related to "scaling" Zookeeper
- Pushing too many znodes / watches → cluster slows.
- Per-watch firestorms (config update triggers 50K clients → reconnection storm).
- Using ZK as a queue with millions of items → wrong tool, blows up.

## Scale of a Single Instance
> Zookeeper is intentionally small. The whole point is *correctness*, not throughput.

| Dimension | Healthy | Stretch | Notes |
|---|---|---|---|
| Ensemble size | 3 / 5 / 7 | 9 (rare) | larger = slower writes (more acks) |
| Total data | < 100 MB | a few GB | data is in-memory across cluster |
| Znodes | 100K–1M | tens of millions with care | each watch & znode adds memory |
| Writes/sec | ~10K | ~50K with fast disks & small writes | ZAB latency dominates |
| Reads/sec | ~50K–100K per follower | linear w/ observers | reads are local-memory |
| Watch storms | thousands of watches per znode is fine | millions risks reconnection cascades | design watches carefully |
| Disk | fast SSD for txn log fsync | — | this is the write bottleneck |

**Why you don't add more nodes for write scale:**
Every write must be acked by a **majority**. A 7-node ensemble has *more* round-trips per write than a 3-node ensemble. Adding nodes improves **fault tolerance**, not write throughput.

## Performance Characteristics
- **Latency:** writes a few ms within a DC; cross-DC ensembles add network RTT.
- **Throughput:** thousands to tens of thousands of writes/sec; reads scale higher.
- **Bottlenecks:** transaction log fsync (disk), GC pauses (JVM), watch fan-out.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Strong consistency, well-understood (ZAB) | Not for big data — small state only |
| Mature, used everywhere in the JVM ecosystem | Operationally finicky (JVM, GC, ensemble sizing) |
| Rich primitives via znode types + watches | New systems prefer etcd/Consul |
| Sequential & ephemeral znodes power locks/leader election | Watch model is one-shot — easy to miss events |
| Observers scale reads | All data on every node — vertical scale only |

## Common HLD Patterns
- **Leader election** (the canonical recipe):
  - Each candidate creates an **ephemeral sequential** znode under `/election`, e.g. `/election/n_0000000007`.
  - The smallest sequence number is the leader.
  - Each node watches the next-smaller node; when that znode disappears, the watcher checks if it's now the smallest.
  - This is "leader election with herd-effect avoidance".
- **Distributed lock**:
  - Same recipe as leader election; the lock holder is the smallest seq.
  - Releases by deleting its znode (or via session expiry).
- **Service discovery / membership**:
  - Each instance creates an ephemeral znode under `/services/<service>/`.
  - Clients list the directory to discover live instances; watch for changes.
- **Distributed configuration**:
  - Config stored at `/config/<name>`; clients set watch; on update, reload.
- **Coordination of cluster state in OG Kafka**:
  - Brokers register ephemeral nodes; controller is elected via ZK; topic/partition metadata in ZK.
  - Modern Kafka **KRaft** mode embeds Raft to remove ZK as a dependency.

## Common Pitfalls / Gotchas
- **Watches are one-shot.** After firing, you must re-set the watch. Race conditions if you do reads before re-setting.
- **Session expiry vs disconnect.** A short network blip ≠ session loss; design clients to handle reconnection.
- **Ephemeral znodes disappear on session loss** — your "leader" can vanish mid-operation; use **fencing tokens**.
- **Storing too much data** (tens of MB znodes) hammers the cluster.
- **Big watch fan-outs** — putting 50K clients on one config znode → on update, all 50K reconnect/refresh and stampede.
- **Using ZK as a job queue** with frequent create/delete → high churn, log pressure, terrible latencies.
- **Even-numbered ensembles** (4, 6) — tolerate the same number of failures as 3 / 5 with worse availability characteristics. Always odd.
- **Wide-area ensembles without observers** → write latency dominated by cross-DC RTT.

## Interview Cheat Sheet
- **Tagline:** "Tiny strongly-consistent coordination service powering leader election, locks, config, and discovery."
- **Best at:** small-data coordination problems in distributed systems.
- **Worst at:** application data, high-throughput writes, large datasets.
- **Scale of one ensemble:** 3 / 5 / 7 nodes, < 1 GB data, ~10K writes/sec, ~100K reads/sec; observers scale reads.
- **Shard by:** N/A — no sharding; whole state is replicated everywhere. Build sharded layers on top.
- **Consistency:** sequentially consistent, linearizable writes; reads slightly stale by default (use `sync()`); ZAB protocol; majority quorum.
- **Replicates how:** ZAB broadcast from leader to followers; observers replicate without voting.
- **Killer alternatives:** **etcd** (Raft, simpler, Kubernetes' default), **Consul** (Raft + service discovery + health), **Apache Bookkeeper** (similar log primitives), **KRaft** (Kafka's built-in replacement for ZK).

## Further Reading
- Official docs: https://zookeeper.apache.org/doc/current/
- Original paper: https://www.usenix.org/event/atc10/tech/full_papers/Hunt.pdf
- "ZooKeeper recipes": https://zookeeper.apache.org/doc/current/recipes.html
- *ZooKeeper: Distributed Process Coordination* — Junqueira & Reed (book by the original authors).
- Comparison with etcd / Consul: https://etcd.io/docs/v3.5/learning/why/