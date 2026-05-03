---
title: "Consistency Models"
description: "The real spectrum of distributed-system consistency — strict / linearizable / sequential / causal / read-your-writes / monotonic / consistent-prefix / eventual. What each guarantees, where each is sufficient, and the trade-off costs."
---

> Topic: Key Concept · Category: Consistency Models · Difficulty: Intermediate

## TL;DR
"Consistency" is not a single thing. There's a **rich spectrum** between **linearizable** (the strongest, what CAP's "C" means) and **eventual** (the weakest, "data converges if you wait"). Stronger models cost more **latency** + **availability** under partitions; weaker models put more **complexity** into the application. Real systems pick a level (or let you tune per-query). Knowing the lattice — and where to place your design — is more useful in interviews than waving the CAP letters around.

The lattice (strongest at top):

```text
            Strict (instantaneous)            ← unrealizable; clocks lie
                  │
            Linearizable                      ← Spanner, etcd, Zookeeper
                  │
            Sequential                        ← total order, but not real-time
                  │
            Causal                             ← respects "happened-before"
                  │
            Session: read-your-writes,        ← per-client guarantees
                     monotonic-reads,
                     monotonic-writes,
                     write-follows-reads
                  │
            Consistent-prefix                  ← no "future before past"
                  │
            Eventual                           ← Cassandra default, DNS, Riak
```

## What problem does each solve?

- **Linearizable** — "the system looks like a single, strongly-consistent register." You never see stale data; every operation sees all prior committed operations. Ledgers / locks / counters.
- **Sequential** — same total order across all observers, but ordering can diverge from real-time. Acceptable for many UI flows.
- **Causal** — if A happened-before B, every observer sees A before B. Concurrent operations can be reordered. Ideal for collaborative apps, social comments / replies.
- **Read-your-writes** — after I write X, I read X back, even if other clients see something else. The "I just updated my profile" scenario.
- **Monotonic reads** — I never see "data go backwards in time" on subsequent reads.
- **Monotonic writes** — my writes are applied in the order I issued them.
- **Write-follows-reads** — if I read v1 then write v2, others won't see v2 before v1.
- **Consistent-prefix** — observers never see "the conclusion before the preamble" — events appear in some valid order.
- **Eventual** — given no new updates, all replicas converge eventually. No timing guarantee.

## How they relate

```text
   Linearizable ⟹ Sequential ⟹ Causal ⟹ {Read-your-writes, Monotonic, ... }
                                          ⟹ Eventual

   Stronger to the left. If you have linearizable, you "get" all the weaker ones for free.
```

**Most useful single insight:** *causal* + *session guarantees* (read-your-writes, monotonic) cover ~90% of UX expectations at much lower cost than full linearizability.

## Definitions in detail

### Linearizable (Strong Consistency)
- Every operation appears to take effect **atomically at some point between when it was invoked and when it returned**.
- Globally observable real-time order.
- Implementation cost: distributed consensus (Paxos / Raft), commit-wait (Spanner), majority quorum.
- Examples: **etcd, ZooKeeper, Spanner, FoundationDB, single-leader DBs reading from leader**.

### Sequential
- All operations appear in **some total order** consistent with each client's program order.
- Doesn't have to match real-time order.
- Now mostly historical; rarely targeted directly.

### Causal
- If event A causally precedes B (same client, or B reads value written by A), every observer sees A before B.
- **Concurrent** events (no causal link) can be observed in any order.
- Implementations: vector clocks, version vectors, MongoDB causal-consistency sessions, COPS, Cure DB.

### Session Guarantees (Terry et al., Bayou)
- **Read-your-writes (RYW):** within one session, my reads see my prior writes.
- **Monotonic reads:** my next read returns same-or-newer data than my last read.
- **Monotonic writes:** my writes are applied in order.
- **Write-follows-reads:** writes I make after reading X happen after X for others too.
- Implementations: route reads to leader after recent write; sticky sessions; client tracks "last-seen version" tokens.

### Consistent-prefix
- Readers see an in-order **prefix** of the global write history. Skipping is allowed; reordering is not.
- Used by Azure Cosmos DB as a tunable level.

### Eventual
- "If updates stop, all replicas converge."
- Allows arbitrary divergence, anomalies, and lost updates *during* a window.
- Examples: **DNS, Cassandra default, Riak, Memcached replication**.

## When to use which (real-world examples)

| Use case | Suggested level |
|---|---|
| Bank ledger / payments | **Linearizable** (Spanner, single-leader Postgres + sync standby) |
| Distributed lock / leader election | **Linearizable** (etcd, Zookeeper) |
| Inventory "is the seat available?" | **Linearizable** for the decision, eventual for read-only browsing |
| User profile edit + own-device read | **Read-your-writes** (route to leader briefly) |
| Newsfeed / timeline | **Causal** + **monotonic reads** |
| Comment threads, chat | **Causal** so reply never appears before parent |
| Shopping cart | **Read-your-writes** (write to my cart shows up immediately) |
| Like / view / share counts | **Eventual** (probably with [Count-Min Sketch](/docs/49-probabilistic-data-structures/hyperloglog-and-count-min)) |
| DNS records | **Eventual** |
| Configuration distribution | **Eventual** with version stamping |
| Search index | **Eventual** (CDC / projections) |
| Distributed cache (Redis cluster) | **Eventual** between replicas |
| Multi-region writes (chat / collab) | **Causal** with CRDTs |
| Game state / turn-based | **Linearizable** turns; **causal** chat |
| Fraud / anti-double-spend | **Linearizable** |
| Audit log / event store | **Sequential** within a partition; **causal** across |

## When NOT to over-tighten
- **Read-only catalog browsing** doesn't need linearizable; eventual is fine.
- **Analytics / dashboards** are usually fine with seconds-to-minutes lag.
- **CDN-cached content** is eventual by nature; tighten only what truly matters.
- **Counters / metrics** prefer eventual + sketches; linearizable counters are a hot-key bottleneck.

## Things to consider / Trade-offs
- **Latency** scales with consistency strength: every round-trip-to-quorum is a millisecond on LAN, 50-150ms cross-region.
- **Availability under partition:** stronger models force minority-side rejection; weaker accept and reconcile.
- **Anomalies allowed:** stronger model = fewer anomalies app must handle (lost updates, stale reads, write-skew, phantom reads).
- **Choice is per-query in modern DBs:** DynamoDB / Cassandra / MongoDB / Cosmos DB let you choose per operation.
- **Causal needs version tracking** — vector clocks / dependency tokens / HLC.
- **Session-consistency is cheap to bolt on** — sticky session + leader-pinning after recent write.
- **CRDTs let you have "AP + causal + automatic-merge"** for specific data types (counters, sets, maps, sequences).
- **Snapshot isolation** (DB transactions) is orthogonal — see [Isolation Levels](/docs/53-transactions-and-concurrency/isolation-levels).
- **Real-world systems are mixed:** linearizable index lookups + eventual full-text search + causal user feed.
- **Documentation lies sometimes.** "Strong consistency" in vendor docs may mean snapshot isolation, not linearizability. Verify.

## Common pitfalls
- **Calling a system "strongly consistent" without specifying linearizable vs sequential vs serializable** — all three terms get conflated.
- **Treating causal + session = linearizable.** Concurrent operations can still differ across observers.
- **Eventual without conflict resolution** = silent data loss.
- **Routing one user's reads to different replicas** in an "eventual" system → user sees their own writes disappear (no monotonic-reads).
- **Overprovisioning consistency** — paying linearizable latency for browsing a product catalog.
- **Underprovisioning** — using eventual for inventory → overselling.
- **Treating "consistency" the same as "isolation."** Consistency = order across replicas; isolation = order across concurrent transactions on one DB. Both matter.
- **Assuming a single dial.** Reads and writes can have different consistency.
- **Trusting LWW with skewed clocks.** Causes silent write loss (see [Clock Skew](/docs/43-time-and-ordering/clock-skew-and-ntp)).

## Interview Cheat Sheet
- **Linearizable** = single-register illusion; strongest; etcd / Spanner / Zookeeper / leader reads.
- **Sequential** = total order, may not match real-time.
- **Causal** = "happened-before" preserved; concurrent operations can be reordered.
- **Session guarantees** = read-your-writes, monotonic reads, monotonic writes, write-follows-reads — usually cheap to retrofit.
- **Consistent-prefix** = no "future before past."
- **Eventual** = converges if updates stop; needs conflict resolution.
- **Pick per use case, not per system.** Modern DBs are tunable.
- **Causal + session = ~90% of UX needs at much lower cost than linearizable.**
- **Anomalies cost moves to the app** as you weaken consistency.

## Related concepts
- [CAP Theorem & PACELC](/docs/51-consistency-and-cap/cap-theorem-and-pacelc) — the binary framing.
- [ACID vs BASE](/docs/51-consistency-and-cap/acid-vs-base) — RDBMS framing.
- [Logical Clocks](/docs/43-time-and-ordering/logical-clocks) — causal-consistency primitives.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — implementation.
- [Isolation Levels](/docs/53-transactions-and-concurrency/isolation-levels) — orthogonal: per-transaction guarantees.
- Concrete: [Spanner](/docs/01-relational-databases/spanner), [etcd](/docs/02-key-value-stores/etcd), [Cassandra](/docs/03-wide-column-stores/cassandra), [MongoDB](/docs/04-document-stores/mongodb), [DynamoDB](/docs/02-key-value-stores/dynamodb).
