---
title: "Two-Phase Commit (2PC) & Three-Phase Commit (3PC)"
description: "The classical distributed-transaction protocols — 2PC's prepare/commit phases, why it blocks on coordinator failure, why 3PC supposedly fixes that (and why it actually doesn't), and what real systems use instead (sagas + Spanner-style consensus)."
---

> Topic: Key Concept · Category: Consensus & Coordination · Difficulty: Intermediate

## TL;DR
**Two-Phase Commit (2PC)** is the textbook protocol for committing a transaction across multiple participants atomically. **Phase 1 (Prepare):** coordinator asks every participant "can you commit?"; participants vote `YES` (and durably promise to commit) or `NO`. **Phase 2 (Commit/Abort):** coordinator decides — `YES` from everyone → commit; any `NO` → abort — and tells participants. **It guarantees atomicity but is blocking:** if the coordinator crashes between phases, participants are stuck in **prepared** state — locks held, can't roll forward or back without intervention.

**Three-Phase Commit (3PC)** adds a "pre-commit" phase to break the blocking, but is **rarely used** because it relies on synchronous timing assumptions that don't hold in real networks. It also doesn't survive partitions.

In practice, modern distributed systems **avoid 2PC** by either:
- Running consensus ([Paxos / Raft](/docs/52-consensus-and-coordination/paxos-and-raft)) per partition + 2PC across partitions (Spanner, CockroachDB).
- Replacing cross-service transactions with **[sagas](/docs/47-event-driven-architecture/saga-pattern)** + idempotent compensations.
- Using **[transactional outbox](/docs/65-outbox-and-transactional-messaging/outbox-pattern)** for event-driven workflows.

## What problem does it solve?
- **Atomic commit across multiple databases / services** — either all participants commit, or none.
- **Distributed transactions** in heterogeneous systems (XA-compliant DBs + JMS + ERP).
- **Original solution to "transfer $100 between two databases"** before sagas / event-driven options were popular.

## How they work

### 2PC

```text
Phase 1: PREPARE
  Coordinator → Participant A: PREPARE
  Coordinator → Participant B: PREPARE
  Coordinator → Participant C: PREPARE

  A: write to log "prepared", reply YES (or NO if any check fails)
  B: write to log "prepared", reply YES
  C: write to log "prepared", reply YES

Phase 2: COMMIT (or ABORT)
  All YES?  → Coordinator writes COMMIT to log; sends COMMIT to all.
  Any NO?   → Coordinator writes ABORT to log; sends ABORT to all.

  Participants commit (or rollback) and ACK.
```

**Key property:** once a participant says "prepared", it has **promised to be able to commit** if asked, and must wait for the coordinator's decision. Locks stay held; rows are unavailable to other transactions.

### 3PC
- Adds a **PRE-COMMIT** phase between PREPARE and COMMIT.
- Idea: if coordinator crashes after PRE-COMMIT (but before COMMIT), participants can use timeouts to *infer* what would have happened.
- Requires synchronous network assumption; fails under real-world network conditions.

## When to use it (real-world examples)
- **XA-distributed transactions** between RDBMS + message queue (legacy enterprise systems with Oracle / DB2 / WebSphere MQ).
- **Cross-shard ACID transactions in distributed SQL** — Spanner, CockroachDB, TiDB use **2PC over Paxos / Raft groups**, where each "participant" is a Raft group itself, dramatically reducing the blocking risk (no single coordinator; commit decision replicated).
- **Single-coordinator OLTP systems** with multiple resources (rare; usually replaced with sagas).
- **Microsoft DTC** — Windows distributed transaction coordinator (legacy enterprise).
- **JTA in Java / EJB** — distributed transactions with multiple JDBC sources + JMS.

## When NOT to use it
- **Microservices** — coordinator becomes a SPOF + adds latency + ties services together. Use [sagas](/docs/47-event-driven-architecture/saga-pattern) or outbox.
- **Cross-region transactions** — every commit pays max(network RTT) twice.
- **High-throughput services** — 2PC's locks block others; throughput suffers.
- **Heterogeneous systems where some don't support XA** — REST APIs, third-party services like Stripe.
- **You can use idempotency + compensating actions** — saga is simpler, more available, and more debuggable.
- **Anything that calls non-transactional APIs** — sending emails, debiting Stripe; you can't "prepare" them.

## Things to consider / Trade-offs

### 2PC
- **Blocking on coordinator failure.** If coordinator crashes after participants prepare, participants hold locks until coordinator recovers (or operator intervenes).
- **Coordinator durability** — must persist state to survive crashes; needs its own [WAL](/docs/48-storage-internals/write-ahead-log) + recovery.
- **Recovery protocol** — on coordinator restart, asks each participant the status, rebuilds state.
- **Heuristic resolution** — operator can manually commit / abort prepared transactions; risks divergence ("heuristic mixed").
- **Latency** — two round-trips minimum; participants slowest determines commit time.
- **Throughput** — locks held during prepare phase serialize concurrent transactions.
- **Cross-shard distributed SQL** uses 2PC but each "participant" is a Raft group (so no single point of failure; the commit decision is itself replicated). This is what makes Spanner / CockroachDB tolerable.
- **2PC + Paxos = Spanner;** 2PC alone is not enough for high availability.

### 3PC
- **Synchronous network assumption** — fails under real internet conditions.
- **Doesn't tolerate partitions** — protocol can violate atomicity.
- **Rarely seen in production.**

## Common pitfalls
- **Ignoring coordinator durability.** Without persistent log, a crashed coordinator forgets the decision.
- **No recovery / timeout protocol** — participants hold locks forever after a failed coordinator.
- **Heuristic outcomes diverging** — manual commits on one side, abort on another → silent inconsistency.
- **Trying to 2PC over RPC to a third-party API** — Stripe / Twilio / Okta don't support PREPARE; use sagas.
- **2PC over many participants (>5)** — every additional participant raises commit latency + abort probability.
- **Non-idempotent commits** — recovery may double-apply; participants must be idempotent on retry.
- **Treating 2PC as scalable** — single coordinator is a bottleneck; use 2PC over Paxos / Raft for real scale.
- **Confusing 2PC with Paxos / Raft** — different problems. 2PC is "atomic across participants"; consensus is "agreement on a single value with majority."

## Interview Cheat Sheet
- **2PC = atomic commit across participants in two phases (Prepare / Commit-or-Abort).**
- **Blocking on coordinator failure** is the fundamental flaw — participants stuck in prepared state.
- **3PC** adds pre-commit but assumes synchronous networks; rarely deployed.
- **Modern distributed SQL** (Spanner, Cockroach, TiDB) does **2PC where each participant is itself a Paxos / Raft group** — eliminates single-coordinator blocking.
- **For microservices** use **[sagas](/docs/47-event-driven-architecture/saga-pattern) + idempotency + outbox**, not 2PC.
- **2PC is right for:** single-region, XA-aware databases + queues, legacy enterprise.
- **2PC is wrong for:** cross-region, third-party APIs, anything that needs availability under partition.
- **Killer phrase:** "Sagas are 2PC made eventually consistent — you trade ACID atomicity for availability."

## Related concepts
- [Paxos & Raft](/docs/52-consensus-and-coordination/paxos-and-raft) — different problem (consensus on a single value).
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — modern replacement.
- [Transactional Outbox](/docs/65-outbox-and-transactional-messaging/outbox-pattern) — for event-driven workflows.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — required for safe retry.
- Concrete: [Spanner](/docs/01-relational-databases/spanner), [CockroachDB](/docs/01-relational-databases/cockroachdb), classical XA / DTC / JTA.
