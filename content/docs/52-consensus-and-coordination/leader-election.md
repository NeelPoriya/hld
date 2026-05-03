---
title: "Leader Election"
description: "How a cluster picks a single 'leader' node — bully algorithm, ring algorithm, Raft / Paxos elections, ZooKeeper / etcd ephemeral-node patterns. Where it's used (DB primaries, cron schedulers, sharded coordinators) and the split-brain trap."
---

> Topic: Key Concept · Category: Consensus & Coordination · Difficulty: Foundational

## TL;DR
Many distributed systems need **exactly one node** doing a coordinator job — primary database write target, cron scheduler, shard coordinator, dispatcher. **Leader election** is how the cluster picks (and re-picks) that single node when nodes join, leave, or fail. The two practical answers are: **(1) consensus-based** (Raft / Paxos / ZAB elections — used by etcd, Consul, ZooKeeper, MongoDB, distributed SQL); **(2) lease-based via a coordinator service** (use etcd / ZooKeeper / Redis with a TTL'd ephemeral key; whoever holds it is leader). Naive heartbeat-based elections are easy to write and **always wrong** — they get **split-brain** (two leaders) under network partitions. Always pair the elected leader with a **fencing token** so a stale leader can't corrupt state after losing the election.

## What problem does it solve?
- **Single source of truth for writes** — DB primaries, leader-followers, distributed locks.
- **Single instance for non-idempotent work** — cron, dispatcher, billing reconciliation.
- **Coordination boundary** — only the leader assigns shards / IDs / ranges.
- **Failover automation** — when leader dies, a new one is elected automatically.

## How it works (the practical patterns)

### 1. Consensus-based election (Raft / Paxos / ZAB)
- Nodes run a consensus protocol; majority of voters elects a leader for a "term" / "epoch."
- Leader's identity is replicated as part of the consensus log.
- New leader cannot be elected without majority quorum.
- Used by: **etcd, Consul, ZooKeeper (ZAB), MongoDB (Raft-like), Spanner, CockroachDB, MongoDB replica sets, Kafka KRaft**.
- Properties: **safe** (no split-brain), **available** while majority is alive, **bounded election time** (sub-second to few seconds).

### 2. Lease-based election via a coordinator (etcd / ZooKeeper / Consul / Redis)
- All candidates try to acquire a **TTL'd lock** in a shared coordinator.
- Whoever wins becomes leader; renews the lease periodically.
- If the leader fails to renew (crash / network partition), lease expires → another candidate acquires.
- ZooKeeper's classic recipe: every candidate creates an **ephemeral sequential znode**; lowest-numbered child is leader; deleted node fires watch on the next.
- etcd / Consul: `lease + transactional put-if-absent` on a known key.
- Redis: `SET leader_key node_id EX 10 NX` + periodic `EXPIRE` refresh; **vulnerable** to clock skew + Redlock issues without fencing.
- Used by: **Kubernetes leader-elected controllers, distributed cron schedulers, single-writer batch jobs, sharded job coordinators**.

### 3. Bully algorithm (textbook; rarely seen in production)
- Each node has an ID. On leader failure, any node with higher ID can "take over" by messaging lower-ID nodes.
- Doesn't tolerate partitions; mostly historical.

### 4. Ring algorithm (textbook; rarely seen in production)
- Nodes arranged in a logical ring; election message circulates picking max ID.
- Same partition problems as bully.

### Fencing tokens (critical companion pattern)
Every leader election should issue a **monotonically-increasing fencing token** (epoch / term / generation). Downstream services accept writes only from leaders whose token is `>=` last seen. This prevents a stale-but-not-yet-aware ex-leader from corrupting state.

```text
Leader 1 elected   →  fencing token = 7
Leader 1 partitioned but still thinks it's leader
Leader 2 elected   →  fencing token = 8
Leader 1 sends write with token 7 → backend rejects (expects ≥ 8)
Leader 2 sends write with token 8 → accepted.
```

## When to use it (real-world examples)
- **Database primaries** — Postgres + Patroni, MongoDB replica sets, MySQL Group Replication, Redis Sentinel.
- **Distributed cron / scheduler** — only one node runs the daily report (Sidekiq Enterprise, Quartz HA, Kubernetes CronJobs with single-replica deployment + leader lease).
- **Kubernetes controllers** — `controller-runtime`'s `LeaderElectionConfig` ensures only one replica reconciles.
- **Sharded coordinators** — one node decides which shard each tenant is on.
- **Service discovery primaries** — Consul, etcd elect a leader to serialize membership writes.
- **Distributed locks** with leader-lease semantics.
- **Replicated message brokers** — Kafka controller, Pulsar broker leader.
- **Workflow engines** — Temporal / Cadence persist a leader for matching service.
- **Single-writer for global counters / sequences** — Twitter Snowflake, Discord ID generation.
- **Backup / replication coordination** — only one node initiates the backup.
- **Sharded ML model training** — parameter-server coordinator.

## When NOT to use it
- **Stateless workloads** — load balancer + N replicas; no leader needed.
- **Embarrassingly parallel jobs** — partition work, every worker handles its slice.
- **Scaling reads** — replicas, not leader election.
- **You can make the operation idempotent + concurrent** — multiple instances doing the same idempotent work is fine.
- **Tiny / dev systems** — manual designation works.

## Things to consider / Trade-offs
- **Consensus vs lease.** Consensus (Raft / Paxos) is correct under partitions; lease via Redis without fencing tokens is **not safe**. Lease via etcd / ZooKeeper / Consul *is* safe because they themselves run Raft / ZAB.
- **Election speed.** Faster elections = faster failover but more spurious elections under network jitter. Tune lease / heartbeat intervals (5-30s typical).
- **Cluster size.** Odd numbers (3, 5, 7) for consensus; even numbers waste a vote.
- **Quorum loss = no leader.** If majority of voters die, cluster goes read-only or fully unavailable until quorum restored.
- **Fencing tokens** (a.k.a. epoch numbers) are non-negotiable for safety. Every elected leader gets a monotonically increasing token; downstream services reject lower tokens.
- **Pre-vote / "pre-flight"** optimization avoids unnecessary term increments on flapping networks.
- **Leader pinning for performance** — clients pin to the current leader for low-latency writes; on failover, clients learn the new leader.
- **Lease duration trade-off** — longer = less coordinator load + slower failover; shorter = faster failover + more lease churn.
- **Don't elect for trivial coordination** — sometimes a deterministic mapping (`hash(key) % N`) gives the same effect with no election.
- **Monitoring** — alert on "leader changes" exceeding normal rate (flapping) and on "no leader" durations.
- **Avoid client-led elections** — clients voting on the leader is racy; use server-side coordination.
- **Cross-region** — leader must be in the region with majority voters; otherwise minority partition can't elect.

## Common pitfalls
- **Naive heartbeat election** — node A doesn't hear from leader B → declares itself leader → B is fine, network is partitioned → split-brain. Use consensus or lease + fencing.
- **Redis SET NX EX without fencing token** — Martin Kleppmann's classic Redlock critique: clock skew + GC pauses cause two leaders simultaneously.
- **Ignoring fencing tokens** — old leader writes to DB after losing election, corrupting state.
- **Single-region elections under multi-region partition** — leader stuck in dead region; restore manually.
- **Lease too short** — flapping during normal GC pauses; cluster spends time electing instead of working.
- **Lease too long** — failover takes minutes; service outage.
- **Stale leader stamp on writes** — backend doesn't validate token; updates from old leader corrupt state.
- **Election storms during partition** — every node thinks others are dead and tries to elect. Pre-vote + randomized timeouts mitigate.
- **No protection during election** — service unavailable until new leader elected; design for failover SLA.
- **Confusing leader election with consensus.** Election = pick one. Consensus = agree on a sequence of values. Elections often *use* consensus.

## Interview Cheat Sheet
- **Two practical patterns:** consensus-based (Raft / Paxos / ZAB) or lease-based via a consensus-backed coordinator (etcd / ZooKeeper / Consul).
- **Always pair with fencing token.** Without it, split-brain corrupts state silently.
- **Naive heartbeat** elections are unsafe. Don't.
- **Cluster sizes:** 3 / 5 / 7 voters; majority for quorum.
- **Failover time:** sub-second to seconds; trade vs flapping.
- **Use cases:** DB primaries, cron, sharded coordinators, Kubernetes controllers.
- **Lease via Redis** without fencing has known unsafety (Kleppmann).
- **Skip elections** when deterministic hashing solves the same problem.

## Related concepts
- [Paxos & Raft](/docs/52-consensus-and-coordination/paxos-and-raft) — the algorithms.
- [Distributed Locks](/docs/52-consensus-and-coordination/distributed-locks) — sister pattern.
- [Two-Phase Commit](/docs/52-consensus-and-coordination/two-phase-commit) — orthogonal problem.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — leader-follower built on top.
- Concrete: [etcd](/docs/02-key-value-stores/etcd), [ZooKeeper](/docs/14-workflow-orchestration-and-coordination/zookeeper), [Consul](/docs/34-dns-and-service-discovery/consul), [PostgreSQL](/docs/01-relational-databases/postgresql) + Patroni.
