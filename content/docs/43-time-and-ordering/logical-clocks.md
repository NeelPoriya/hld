---
title: "Logical Clocks (Lamport, Vector, HLC)"
description: "How to order events across machines without trusting wall-clocks — Lamport timestamps, vector clocks, version vectors, and Hybrid Logical Clocks (HLC) used in Cassandra, CockroachDB, MongoDB, and YugabyteDB."
---

> Topic: Key Concept · Category: Time & Ordering · Difficulty: Foundational

## TL;DR
Wall clocks lie. **Logical clocks** assign monotonically increasing counters to events so that **causality** (event A → event B) can be detected without depending on physical time. **Lamport timestamps** give a total order consistent with causality (if A → B then `L(A) < L(B)`) but can't tell concurrent events apart. **Vector clocks** (or **version vectors**) detect concurrent events explicitly — at the cost of size O(N) per event. **Hybrid Logical Clocks (HLC)** combine wall-clock time with a logical counter to get "almost wall-clock-shaped" timestamps that **never go backwards** even with clock skew, used by **CockroachDB, YugabyteDB, MongoDB, FoundationDB**.

## What problem does it solve?
- **Causally ordering events across machines** without synchronized wall clocks.
- **Detecting concurrent updates** in multi-leader / leaderless systems for conflict resolution.
- **Building consistent snapshots** across distributed databases.
- **Read consistency** — read at "logical time T" guarantees you see all events causally before T.
- **Replacing wall-clock-based LWW** (which is unsafe under clock skew) with skew-resistant ordering.

## How they work

### Lamport Timestamp (1978)
Each process keeps a counter `L`. On an event, `L = L + 1`. On send, attach `L`. On receive `L'`, set `L = max(L, L') + 1`.

**Property:** If `A → B` then `L(A) < L(B)`. (The reverse is NOT true — `L(A) < L(B)` does not imply causality.)

```text
  P1: 1 -- 2 -- 3 -- 4 (sends to P2)
                       \
  P2:           1 -- 5 (recv: max(2, 4)+1 = 5) -- 6
```

### Vector Clock (Mattern, Fidge ~1988)
Each process has a vector `V[1..N]`. On an event, `V[me] += 1`. On send, attach `V`. On receive `V'`, `V = element-wise-max(V, V'); V[me] += 1`.

**Property:** `V(A) < V(B)` iff `A → B`. Can detect **concurrent** events: neither `V(A) ≤ V(B)` nor `V(B) ≤ V(A)` ⇒ A and B are concurrent.

```text
  P1: V=[1,0,0]  →  V=[2,0,0]  →  send  →  V=[3,0,0]
                                \
  P2:                  V=[0,1,0]  recv  V=[3,1,0]  →  V=[3,2,0]
```

### Version Vector (special case used in databases)
Like vector clock but per data object — Riak, Voldemort, DynamoDB, CouchDB use these for sibling detection.

### Hybrid Logical Clock (HLC) (Kulkarni et al., 2014)
Combines physical time `pt` with a logical counter `l`:
- On local event: `l = max(l, now()); c = (l == old_l) ? c + 1 : 0`
- On receive `(l', c')`: `l = max(l, l', now()); c = adjust as above`
- Result: timestamps look like wall-clock time but never go backwards across nodes.

Used by **CockroachDB, YugabyteDB, MongoDB (since 3.6), FoundationDB**.

## When to use them (real-world examples)
- **Lamport timestamps:**
  - **Distributed mutex** (Lamport's bakery algorithm).
  - **Total event order in distributed logs** (Kafka uses offsets — a per-partition Lamport-like counter).
  - **Event-sourced systems** with monotonic event IDs.
- **Vector / version clocks:**
  - **Riak / Voldemort / DynamoDB** — sibling detection on concurrent writes; client picks a winner or merges.
  - **CouchDB / PouchDB** — replication with conflict resolution.
  - **Git** — commit DAG is essentially a vector clock per branch.
  - **Collaborative editing (CRDTs)** — Yjs, Automerge use version vectors / vector clocks under the hood.
  - **DynamoDB internally** between replicas (transparent to user).
- **HLC:**
  - **CockroachDB / YugabyteDB** — distributed transactions with HLC timestamps; commit-wait if skew exceeds bound.
  - **MongoDB cluster time** — every command tagged with HLC; causal consistency sessions use it.
  - **FoundationDB** — global transaction ordering.
  - **Cassandra LWW with HLC retrofit** — proposed to fix LWW pitfalls.

## When NOT to use them
- **Single-node systems** — wall-clock or autoincrement is enough.
- **Need real wall-clock time** — Lamport / vector clocks are NOT real time.
- **Need total order without causality** (load balancing, sharding key) — use a hash, not a clock.
- **Latency-sensitive client paths** with no inherent need for ordering — overhead may not pay off.
- **Vector clocks at huge N** — vector size grows with the number of writers; OK for tens, painful for thousands.

## Things to consider / Trade-offs
- **Lamport gives total order but loses concurrency info** — fine if you don't need to detect conflicts.
- **Vector clocks detect concurrency but grow with writers** — Riak users hit "sibling explosion" if many actors write quickly.
- **Version vector pruning** — drop entries from departed actors carefully; over-aggressive pruning loses causality.
- **HLC bounded by clock skew** — if `now()` drifts > 64-bit counter wraparound, HLC degenerates. Cap divergence.
- **Causal consistency vs strong consistency** — logical clocks give causal (A causes B → all observers agree); they DON'T give linearizability.
- **Storage overhead** — Lamport: 8 bytes / event. Vector: 8N bytes / event.
- **Wire overhead** — every message must carry the clock; bandwidth concern at scale.
- **Snapshot reads** — pick a "safe" timestamp (`min(node clocks)`) for cross-node reads — see Spanner / CRDB closed timestamps.
- **Operational complexity** — operators don't intuitively understand vector clocks; debugging tooling matters.

## Common pitfalls
- **Confusing Lamport totality with causality** — `L(A) < L(B)` does NOT mean A caused B.
- **Treating HLC as wall-clock** — it's *approximately* wall-clock; don't use for billing / regulatory timestamps.
- **Vector clock size explosion** — every actor that writes adds a slot; long-lived clusters bloat.
- **Implementing your own** — getting `max + 1` right under concurrency is subtle; use a library / proven implementation.
- **Forgetting to advance on receive** — if you don't `max(local, remote)`, ordering breaks.
- **Pruning too aggressively** — losing entries causes false "concurrent" verdicts.
- **Mixing logical and physical timestamps** without HLC — comparisons go wrong.
- **Storing logical timestamps as user-visible time** — they're not human-readable.

## Interview Cheat Sheet
- **Lamport:** total order consistent with causality; can't detect concurrent events.
- **Vector clock:** detects causality + concurrency; size grows with N writers.
- **Version vector:** vector clock applied to data objects (Riak / Dynamo siblings).
- **HLC:** wall-clock-shaped + skew-resistant + monotonic; used by CockroachDB, YugabyteDB, MongoDB.
- **Spanner's TrueTime** is a different beast — uses GPS + atomic to bound skew, then waits.
- **CRDTs use version vectors** under the hood for conflict-free merge.
- **Default for "order events without trusting clock"**: Lamport for total order, vector for conflict detection, HLC if you also want approximate wall-time.

## Related concepts
- [Clock Skew & NTP](/docs/43-time-and-ordering/clock-skew-and-ntp) — why we need logical clocks at all.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — multi-leader systems use vector clocks for conflicts.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — events ordered by logical time.
- Concrete systems: [Cassandra](/docs/03-wide-column-stores/cassandra), [CockroachDB](/docs/01-relational-databases/cockroachdb), [Spanner](/docs/01-relational-databases/spanner) (TrueTime), [MongoDB](/docs/04-document-stores/mongodb), [Kafka](/docs/09-message-queues-and-streaming/kafka) (per-partition offsets).
