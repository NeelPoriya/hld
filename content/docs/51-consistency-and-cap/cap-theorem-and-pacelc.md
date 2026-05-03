---
title: "CAP Theorem & PACELC"
description: "The single most-quoted (and most-misunderstood) theorem in distributed systems. CAP says you can have 2 of {Consistency, Availability, Partition tolerance} during a partition. PACELC adds: even when there's no partition, you trade Latency for Consistency."
---

> Topic: Key Concept · Category: Consistency Models · Difficulty: Foundational

## TL;DR
**CAP theorem** (Brewer, 2000; proved by Gilbert & Lynch, 2002): in any distributed system experiencing a **network partition**, you must choose between **Consistency** and **Availability** — you cannot have both. **Partition tolerance is not optional** in real systems; partitions happen. So the real choice is **CP** (refuse some requests during a partition to stay consistent) vs **AP** (accept all requests, possibly diverge, reconcile later).

**PACELC** (Abadi, 2010) extends this to the no-partition case: **if Partitioned, choose A or C; Else, choose Latency or Consistency.** Real-world systems are described as **PA/EL** (DynamoDB, Cassandra), **PC/EC** (Spanner, HBase, etcd), or hybrids. The reflexive "we picked AP because we want availability" is not a real design choice — every modern DB lets you tune per-query.

The theorem is **less useful than it sounds** in design discussions. What you really need to articulate is **the consistency model** you're picking (linearizable / sequential / causal / read-committed / eventual) — see [Consistency Models](/docs/51-consistency-and-cap/consistency-models).

## What problem does it solve?
- **Frames the impossibility:** you can't have a perfectly available + perfectly consistent + partition-tolerant system. Stop pretending you can.
- **Forces a design choice:** during a partition, do you reject writes (CP) or accept them and reconcile (AP)?
- **Names the latency trade-off:** even without partitions, stronger consistency = more round-trips = more latency.
- **Provides shared vocabulary:** "Cassandra is AP/EL, Spanner is CP/EC" is shorthand every engineer should recognize.

## How it works

```text
   Network partition splits 5 nodes into {A, B} and {C, D, E}:

       A  ─── B                  C ─── D ─── E
              ╳   <-- partition -->
              
   Write hits A: do you...
     (a) Refuse, because we can't reach C/D/E to ensure consistency. → CP
     (b) Accept, replicate later, risk divergence with C/D/E.        → AP
```

**Definitions (slightly simplified from the formal version):**
- **C — Consistency (specifically *linearizability*):** every read sees the most recent write or an error. Formally: as if there's a single copy.
- **A — Availability:** every non-failing node responds successfully (with possibly stale data).
- **P — Partition tolerance:** the system continues operating when the network drops messages.

**CAP says:** during a partition, pick A or C. (You don't get to skip P; partitions are real.)

### PACELC

```text
                 ┌─ Partition? ─┐
                 │              │
          ─── YES ──            ── NO ───
              │                      │
        Pick A or C            Pick L or C
        (Availability vs       (Latency vs
         Consistency)           Consistency)
```

| System | PA / PC | EL / EC | Notes |
|---|---|---|---|
| **DynamoDB (default)** | PA | EL | Eventually consistent reads cheap + low-latency |
| **DynamoDB (strong)** | PC | EC | "ConsistentRead = true" — slower, partition aborts |
| **Cassandra (default)** | PA | EL | LWW with vector clocks; tunable `R + W > N` |
| **Spanner** | PC | EC | TrueTime + Paxos; commit-wait adds latency |
| **CockroachDB** | PC | EC | Raft per range; HLC; same trade |
| **MongoDB (default)** | PC | EC | Replica-set primary refuses writes during partition |
| **MongoDB (read pref=secondary)** | PA | EL | Reads from secondary may be stale |
| **etcd / ZooKeeper / Consul** | PC | EC | Raft / ZAB; minority partition refuses writes |
| **Kafka** | PC | EC | Min-ISR; under-replicated partitions reject writes |
| **Riak** | PA | EL | Sloppy quorums; eventual consistency |
| **Couchbase** | PA | EL | Default; tunable per-bucket |

## When to invoke it (real-world examples)
- **Designing on a whiteboard:** "I'll model this as AP because the user can tolerate a few seconds of staleness, but the inventory check must be CP because we can't oversell."
- **Comparing databases:** "DynamoDB is PA/EL — that's why default reads are eventually consistent and cheap. Spanner is PC/EC — that's why commits wait out clock uncertainty."
- **Explaining outage post-mortems:** "We chose AP and during the inter-region partition we got conflicting writes that needed manual reconciliation."
- **Per-operation choice in modern DBs:** DynamoDB, Cassandra, MongoDB, Couchbase let you flip CP / AP per query — `ConsistentRead`, consistency level, write concern, etc.

## When NOT to lean on CAP
- **As your only design tool.** CAP is binary; real consistency models are a spectrum (linearizable, sequential, causal, snapshot, read-committed, eventual). Use those instead in actual design.
- **For single-node systems.** No distribution, no CAP.
- **For analytics / OLAP.** "Eventually consistent within hours" is fine; CAP isn't relevant.
- **As an argument-stopper.** "I picked AP" doesn't tell a reader much; *which* AP? With what conflict resolution?

## Things to consider / Trade-offs
- **The theorem is about** *linearizability* + *total availability*; weaker consistency models can sometimes give you "more" of both.
- **CAP is about a single network partition;** real partitions vary in duration, scope, and asymmetry.
- **Most outages are not partitions** — they're slow nodes, queue overflows, schema bugs. CAP doesn't help.
- **AP doesn't mean "no consistency."** It usually means *eventual* consistency — picking a conflict resolution (LWW, vector clocks, CRDTs) and replicating.
- **CP doesn't mean "infinite latency."** It means a partitioned minority can't make progress; the majority keeps serving.
- **Per-region vs global:** within a region, partitions are rare; cross-region they're routine. Many systems are "CP locally, AP globally" or use CRDT-based geo-replication.
- **Choose the consistency model, not the CAP letter.** Spanner gives you linearizability with PC/EC. Cassandra at `QUORUM/QUORUM` gives you "session-consistency" with PA/EL. DynamoDB strong reads give linearizable reads from one region, with PC/EC trade.
- **Latency is the dominant trade in PACELC's "EL"** — every round-trip costs ms on LAN, tens-to-hundreds of ms cross-region. Strong consistency means more rounds.
- **Quorums and CAP:** a quorum write (`W = N/2 + 1`) means a partitioned minority can't commit → looks CP. Tunable quorums (`R + W > N`) let you slide along the AP-CP axis per query.

## Common pitfalls
- **"We picked AP because we need 99.99% uptime."** AP doesn't directly buy you 9s; it lets the system serve during a partition, but normal-day uptime depends mostly on operations, not CAP.
- **"We picked CP, so reads are always strong."** Only if you read from the leader/majority; replica reads are usually stale even in CP systems.
- **Confusing "Available" (CAP) with "uptime."** CAP-A is about a non-failing node still answering; nodes can still crash, queues fill, etc.
- **Treating the CAP letters as stable system properties.** Modern DBs let you change them per-query.
- **Using CAP to dismiss a tool.** "MongoDB is CP, so it's slow" is wrong on multiple levels.
- **Forgetting eventual consistency requires conflict resolution.** AP without a conflict strategy = silent data loss.
- **"Partition tolerance" misread as "tolerates data center failure."** It's about network message loss; data-center loss is broader.
- **Believing CAP is about "during normal operation."** It's specifically about partitions.

## Interview Cheat Sheet
- **CAP:** during a partition, pick C (refuse some) or A (accept + diverge). P is non-negotiable.
- **PACELC:** even with no partition, pick L (latency) or C (consistency).
- **Real systems:** DynamoDB / Cassandra = PA/EL; Spanner / etcd = PC/EC; MongoDB tunable; Riak / Couchbase = PA/EL.
- **CP minority during partition** = unavailable; majority continues.
- **AP during partition** = all nodes respond; reconcile divergence later.
- **Most modern DBs are *tunable*** — choose per-query (DynamoDB ConsistentRead, Cassandra CL, MongoDB write concern).
- **Don't argue CAP letters; argue consistency models** (linearizable / causal / eventual / snapshot).

## Related concepts
- [Consistency Models](/docs/51-consistency-and-cap/consistency-models) — the actual spectrum.
- [ACID vs BASE](/docs/51-consistency-and-cap/acid-vs-base) — DB-side framing.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — implementation choices behind CAP.
- [Consensus (Paxos / Raft)](/docs/52-consensus-and-coordination/paxos-and-raft) — building blocks of CP systems.
- Concrete: [Spanner](/docs/01-relational-databases/spanner), [DynamoDB](/docs/02-key-value-stores/dynamodb), [Cassandra](/docs/03-wide-column-stores/cassandra), [etcd](/docs/02-key-value-stores/etcd).
