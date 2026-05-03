---
title: "Distributed Locks"
description: "How to make 'only one process does X at a time' work across machines — Redlock and its critics, ZooKeeper / etcd lease-based locks, fencing tokens, and the dirty secret that distributed locks can't be made safe with timeouts alone."
---

> Topic: Key Concept · Category: Consensus & Coordination · Difficulty: Intermediate

## TL;DR
A **distributed lock** lets multiple processes coordinate so that only one does X at a time across a cluster. The naive answer ("`SET key value NX EX 30` in Redis") is **not safe** under realistic failure modes — clock skew, GC pauses, and network delays can cause **two processes to think they hold the same lock simultaneously**. The robust answer is **a lease-based lock backed by a consensus system (etcd / ZooKeeper / Consul)** plus a **fencing token** (monotonically increasing epoch number) checked by the protected resource. **Without fencing tokens, no distributed lock is safe.** Redis Redlock is the most widely-known algorithm; Martin Kleppmann's 2016 critique showed it's unsafe in the real world. Use it carefully or use a consensus-backed primitive.

## What problem does it solve?
- **"Only one process at a time" across machines** — singleton cron, leader job, write to a single resource.
- **Mutual exclusion in distributed coordination** — a leader's actions, a single shard owner.
- **Throttling expensive operations** — only one cluster member runs a billing reconciliation at a time.
- **Critical-section serialization** across services.

## How they're built (the practical patterns)

### 1. Consensus-backed lease (the right answer)
- Coordinator: **etcd, ZooKeeper, Consul, FoundationDB**.
- Acquire: `Put(key, owner_id, lease=30s, condition=ifNotExists)`.
- Hold: renew lease before expiry.
- Lose: lease expires → another acquirer wins.
- Safety: the coordinator runs Raft / ZAB → no split-brain on coordinator side.
- **Fencing token**: each acquisition gets a monotonically-increasing version / revision number; resource validates token on every operation.

### 2. Redis-based lock (`SET NX EX`)
- `SET resource_X owner_id EX 30 NX` — atomic acquire.
- `DEL` (or Lua compare-and-delete) to release.
- **Single Redis** is a SPOF; lose Redis = lose all locks.
- **Multiple Redis (Redlock)**: acquire majority of N independent Redis nodes within a time bound; if so, hold.
- **Fundamental issue:** even if acquired correctly, a long GC pause or clock skew can cause the holder to believe they still own the lock after the lease expired. Without fencing, two writers race.

### 3. ZooKeeper recipe (ephemeral sequential znodes)
- Each candidate creates `/locks/lock-<seq>` (ephemeral, sequential).
- The candidate with the lowest sequence number holds the lock.
- Others watch the next-lower znode.
- On leader crash, ephemeral znode is deleted automatically; next candidate is notified.
- Safe under partitions because ZooKeeper itself runs ZAB consensus.

### 4. Database-backed locks (`SELECT ... FOR UPDATE`, advisory locks)
- Postgres: `SELECT pg_advisory_lock(123)`.
- MySQL: `SELECT GET_LOCK('name', timeout)`.
- Held until session ends. Simple; bound to DB connection lifetime.
- Suitable for single-DB workloads; doesn't survive DB failover unless lock state is replicated.

## Fencing tokens (non-negotiable)

```text
Without fencing:
  Process A: acquired lock, token N1; long GC pause...
  Process A's lease expires; Process B acquires.
  Process A wakes up; thinks it still has lock; writes to resource.
  Process B also writes. Conflict! Lost data.

With fencing:
  Process A acquired with token = 33.
  Process B acquired (after A's expiry) with token = 34.
  Process A's late write arrives at storage with token = 33.
  Storage rejects: "I've already seen token 34; rejecting older."
```

The fencing token is generated *by the lock service*, given to the holder, and **validated by the protected resource** (DB, cache, message queue) on every operation. Without it, no lock service — Redis, etcd, ZooKeeper — can guarantee mutual exclusion across all failure modes.

## When to use it (real-world examples)
- **Singleton scheduled job** — only one cron node runs the daily report.
- **Leader job** — paired with [leader election](/docs/52-consensus-and-coordination/leader-election).
- **Sharded resource ownership** — only one node owns a partition / tenant at a time.
- **Critical-section serialization** — billing reconciliation, write to a shared cache file.
- **Resource provisioning** — only one process creates the new tenant database.
- **Migration coordination** — only one node runs schema migration.
- **Idempotency token issuance** — only one node generates a unique sequence.
- **Lock manager for short-lived critical sections** — Redis with fencing token (carefully).
- **Long-lived ownership leases** — etcd / ZooKeeper for hours-long ownership.
- **Kubernetes leader-elected controllers** — built-in `leader-election` library uses leases.

## When NOT to use it
- **As a substitute for proper transactional design** — if your DB has transactions, use them.
- **For high-throughput contended sections** — distributed locks become the bottleneck.
- **When the lease holder can't be safely killed** — long-running computations whose abort would corrupt state need stronger primitives (sagas, transactions, idempotency).
- **For correctness when downstream doesn't validate fencing tokens** — the lock is a hint, not a guarantee.
- **For idempotent operations** — you don't need a lock; just retry safely.
- **Tiny systems** — file lock / DB lock is simpler.
- **Strictly-once execution required** — locks alone don't give you that; combine with idempotency.

## Things to consider / Trade-offs
- **Lease duration trade-off** — too short = renewal storms + flapping; too long = slow failover. 10-60s is typical.
- **Renewal failure handling** — renewals can fail; the holder must stop work IMMEDIATELY when it can't renew.
- **GC pauses + lease expiry** — JVM full GC can pause 30s+; lock holder thinks it's working but lease expired. Set lease to multi-x of worst-case pause.
- **Clock skew** — Redis `EX` is local clock; cross-node skew breaks assumptions. Etcd / ZooKeeper use lease ticks; safer.
- **Network partitions** — coordinator lives in majority side; minority can't acquire / renew → eventually loses lock automatically.
- **Recovery on coordinator failure** — etcd / ZooKeeper survive; Redis without persistence + replication may lose lock state.
- **Avoid Redis for safety-critical mutual exclusion** unless paired with fencing tokens enforced everywhere.
- **Use the simplest primitive that works** — DB advisory lock for single-DB workloads is often plenty.
- **Lease vs perpetual** — most locks are leases (auto-released on holder failure); rare to use perpetual locks.
- **Avoid blocking on lock acquisition forever** — always set timeouts.
- **Reentrancy** — most distributed locks are NOT reentrant; the same holder must not try to re-acquire.

## Common pitfalls
- **Redis lock without fencing token** — Kleppmann's classic warning; safe only if downstream is idempotent OR validates token.
- **Releasing a lock you don't own** — process times out on renewal, another process acquires, then original process releases → unlocks the new owner. Use Lua compare-and-delete.
- **Long GC pause** — holder thinks it has the lock; doesn't. Always re-validate before each operation if pauses are possible.
- **Network blip** during release → next acquirer might overlap. Fencing tokens are the defense.
- **Lock-free deadlock** — process A holds lock 1, wants 2; process B holds 2, wants 1. Same as in-process deadlock; order locks consistently.
- **Lease shorter than operation** — operation runs longer than lease, lease expires mid-work, another process acquires. Renew aggressively or split into smaller operations.
- **Trusting `SET NX EX`** in production for safety-critical work without fencing tokens. Don't.
- **Coordinator outages**: when etcd / ZooKeeper cluster is gone, locks are unrecoverable until restored. Plan for it.
- **Releasing on retry without checking ownership** — racy; store and check owner ID.
- **Logging "lock acquired" without timestamp / token** — can't debug split-brain.

## Interview Cheat Sheet
- **Distributed lock = mutual exclusion across machines.** Three patterns: consensus-backed lease (etcd / ZK / Consul), Redis SET NX EX, DB advisory.
- **Fencing tokens are mandatory** — without them, no distributed lock is safe.
- **Redis Redlock** is widely used but unsafe under realistic failures (Kleppmann's analysis).
- **etcd / ZooKeeper** are the safe defaults — they run Raft / ZAB themselves.
- **Lease duration:** 10-60s typical; tune for failover SLA + GC pauses.
- **Always set timeouts** on acquire; never block forever.
- **Use the simplest primitive that works** — Postgres advisory lock for single-DB.
- **Killer phrase:** "Locks are hints; correctness comes from idempotent / fenced writes at the resource."

## Related concepts
- [Leader Election](/docs/52-consensus-and-coordination/leader-election) — sister problem.
- [Paxos & Raft](/docs/52-consensus-and-coordination/paxos-and-raft) — the safe foundation.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — the right defense against split-brain races.
- [Clock Skew & NTP](/docs/43-time-and-ordering/clock-skew-and-ntp) — why naive timeouts break.
- Concrete: [etcd](/docs/02-key-value-stores/etcd), [ZooKeeper](/docs/14-workflow-orchestration-and-coordination/zookeeper), [Consul](/docs/34-dns-and-service-discovery/consul), [Redis](/docs/02-key-value-stores/redis), Postgres advisory locks.
