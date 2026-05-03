---
title: "etcd"
description: "etcd is a distributed, strongly-consistent key-value store that uses the Raft consensus algorithm. It's the modern, simpler successor to Zookeeper for coordination, configuration, and service-discovery use cases — and..."
---

> Category: Distributed Coordination / Consensus KV Store · Written in: Go · License: Apache 2.0

## TL;DR
etcd is a **distributed, strongly-consistent key-value store** that uses the **Raft** consensus algorithm. It's the modern, simpler successor to Zookeeper for **coordination, configuration, and service-discovery** use cases — and it's the **brain of Kubernetes** (every K8s object lives in etcd). Like ZK, you don't store user data here; you store the small, critical metadata your distributed system must agree on.

## What problem does it solve?
Same as Zookeeper: leader election, config, locks, membership — but with a **simpler API (HTTP/gRPC), a cleaner protocol (Raft is more understandable than ZAB), and a flatter KV model** (no hierarchical znodes). It's the default coordination service in cloud-native systems.

## When to use
- **Kubernetes' state store** (you don't choose; K8s requires it).
- **Service discovery** (combined with a registration agent).
- **Distributed locks / leader election** for control-plane services.
- **Configuration store** that needs strong consistency + watch.
- Small-data coordination problems (< a few GB total).

## When NOT to use
- General-purpose KV / database (it's not for user data).
- High-throughput hot path (writes go through Raft consensus).
- Large datasets — etcd is small-state by design (recommended ≤ 8 GB).

## Data Model
- **Flat KV** — keys are strings (often `/`-delimited like paths, but no real hierarchy).
- Values are bytes.
- Range queries by key prefix (`get --prefix /services/billing/`).
- Per-key **revisions** (monotonically increasing) — full version history retained until **compaction**.
- **Leases** — keys bound to a TTL lease; deleted when the lease expires (the etcd equivalent of Zookeeper's "ephemeral nodes").

```
PUT  /services/billing/instance-001 = "10.0.0.42:8080" --lease=<lease-id>
GET  /services/billing/ --prefix
WATCH /config/feature-flags
```

## Architecture & Internals
- **Cluster** of an odd number of members (3, 5, 7).
- **Raft** — one leader handles all writes; followers replicate; majority quorum required.
- Storage: **boltdb** / **bbolt** (B+Tree on disk) + **WAL** for durability.
- gRPC API; HTTP/JSON gateway as well.
- **Linearizable reads by default** (go through Raft); serializable reads available for cheaper, slightly stale data.

```
Client ──► etcd member ──► (forwards if not leader) ──► Leader
                                                         │
                                                         └─► Raft replicate ──► quorum ──► commit
```

## Consistency Model
- **Strong consistency** — linearizable reads and writes by default.
- **Serializable reads** opt-in for lower latency (may be slightly stale).
- **MVCC** — every write creates a new revision; old revisions kept until compacted.
- **Transactions** — multi-key compare-and-swap (`txn`) with conditions.

CAP positioning: **CP** — minority partition halts.

## Replication
- Each member has a full copy.
- Writes need majority quorum.
- Followers serve reads (linearizable forward to leader; serializable local).
- **Learners** — non-voting members for read scale-out / safe membership joining.

## Partitioning / Sharding
**No partitioning.** Whole keyspace replicated to every member. This is why total data must stay small.

## Scale of a Single Instance
| Dimension | Recommended | Hard limit | Notes |
|---|---|---|---|
| Cluster size | 3 / 5 / 7 | up to 9 | larger = slower writes |
| Total data | < 2 GB | hard limit ~8 GB (default `--quota-backend-bytes`) | enlarge cautiously |
| Keys | hundreds of K to a few M | tens of M with care | each key has overhead |
| Writes/sec | ~10K | ~30K with fast NVMe | dominated by fsync |
| Reads/sec | tens of K | ~100K serializable | linearizable reads slower |
| Latency | a few ms within DC | tens of ms cross-region | Raft commit |

**When you "outgrow" etcd:** that usually means you're misusing it. Either the data shouldn't be there (move it to a real DB) or you need many separate etcd clusters (each owning its own scope).

**Compaction is critical.** Without periodic compaction of old revisions, etcd's bbolt file grows until you hit the quota → cluster goes read-only. Configure auto-compaction.

## Performance Characteristics
- Latency: a few ms regional; tens of ms cross-region.
- Throughput: tens of K writes/sec on fast NVMe; reads scale with members.
- Bottlenecks: WAL fsync (use NVMe), large transactions, large value sizes (keep < 1 MB), cross-region Raft RTT.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Simple HTTP/gRPC API, flat KV | Small data only |
| Strong consistency via Raft | All-data-on-every-node — no horizontal data scaling |
| Watches, leases, MVCC built in | Compaction misconfig causes outages |
| Used by Kubernetes — extremely battle-tested | Defragmentation periodically required |
| Smaller operational surface than Zookeeper | Cross-region setups need careful design |

## Common HLD Patterns
- **Kubernetes control plane** (you don't pick — etcd is the state store).
- **Leader election** in cloud-native services (e.g. via the Go `concurrency` package).
- **Service registry** — instances put a key with a lease; consumers watch the prefix.
- **Distributed config** with watches — push config changes globally in milliseconds.
- **Distributed locks**:
  ```go
  s, _ := concurrency.NewSession(client)
  m := concurrency.NewMutex(s, "/locks/jobX")
  m.Lock(ctx); defer m.Unlock(ctx)
  ```

## Common Pitfalls / Gotchas
- **Forgetting compaction** → quota exhausted → cluster read-only.
- **Storing too much data** (logs, large blobs) — etcd is metadata, not storage.
- **Slow disks** — etcd is fsync-heavy; spinning disks are unacceptable.
- **Cross-region clusters** without latency budget → write latency = inter-region RTT.
- **Defrag** required periodically after compactions to reclaim file space.
- **Auth + TLS** off in dev "for convenience" → never ship that way. etcd holds your cluster's secrets.

## Interview Cheat Sheet
- **Tagline:** "Strongly-consistent KV via Raft; the brain of Kubernetes; the modern Zookeeper."
- **Best at:** small-data coordination, service discovery, K8s state, config + watches.
- **Worst at:** application data, large datasets, high write throughput.
- **Scale of one cluster:** 3/5/7 members, ~2 GB data, ~10K writes/sec, ms latency.
- **Shard by:** N/A — full replication; partition by *deploying multiple etcd clusters* per scope.
- **Consistency:** linearizable by default; MVCC; transactional CAS; CP under partition.
- **Replicates how:** Raft; majority quorum; learners for non-voting replication.
- **Killer alternatives:** Zookeeper (older sibling), Consul (Raft + service discovery + health), HashiCorp Nomad's internal store, FoundationDB (much more powerful but heavier).

## Further Reading
- Docs: https://etcd.io/docs/
- Raft paper: https://raft.github.io/raft.pdf
- "etcd vs Consul vs ZooKeeper": https://etcd.io/docs/v3.5/learning/why/
- Kubernetes' use of etcd: https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/