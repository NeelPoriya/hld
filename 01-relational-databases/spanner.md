# Google Cloud Spanner

> Category: Globally Distributed Relational Database (NewSQL) · Cloud: GCP · License: Proprietary (managed)

## TL;DR
Spanner is **Google's globally distributed, strongly-consistent, horizontally scalable SQL database**. It famously claims **"externally consistent transactions across continents"** thanks to **TrueTime** (atomic clocks + GPS in every Google datacenter). It's the rare system that gives you **SQL + ACID + horizontal scale + global reach**, breaking the old "you must give up consistency to scale" trade-off.

## What problem does it solve?
For decades, the conventional wisdom was: pick **two of three** (consistency, availability, scale). Spanner showed you can have all three, at the cost of building atomic clocks into every datacenter and accepting a small wait time on commit. It powers Google's own Ads (F1) and Photos systems.

## When to use
- **Mission-critical OLTP** that must scale beyond a single Postgres/MySQL — and you're on GCP.
- **Global apps** that need **strong consistency across regions** (banking, ad-tech, gaming inventory).
- Workloads needing **transparent sharding** without a proxy.
- **5 9s availability** SLA (Spanner offers 99.999%).

## When NOT to use
- Off-GCP — vendor lock-in (though wire-compatible Postgres dialect helps).
- Tiny workloads — Spanner has minimum cost (multiple "nodes" / "Processing Units").
- Pure analytics — use BigQuery (often paired with Spanner via federation).
- Latency-sensitive use cases that can't accept the **commit wait** (~7 ms typical).
- Cost-sensitive — Spanner is significantly more expensive than vanilla CloudSQL.

## Data Model
- Standard SQL (Spanner's GoogleSQL dialect, plus a **PostgreSQL dialect** since 2022).
- Relational tables with **PRIMARY KEY** mandatory.
- **Interleaved tables** — physically co-locate child rows with parents (e.g. `Orders` interleaved in `Users` → all of a user's orders sit next to the user). Massively speeds up parent-child joins.

```sql
CREATE TABLE Users (
  user_id   INT64 NOT NULL,
  email     STRING(MAX),
) PRIMARY KEY (user_id);

CREATE TABLE Orders (
  user_id   INT64 NOT NULL,
  order_id  INT64 NOT NULL,
  total     FLOAT64,
) PRIMARY KEY (user_id, order_id),
  INTERLEAVE IN PARENT Users ON DELETE CASCADE;
```

## Architecture & Internals
- Data is split into **splits** (Spanner's term for partitions/shards) by **primary key range**.
- Each split is a **Paxos group** with replicas across zones / regions.
- **TrueTime API** — exposes time as an interval `[earliest, latest]` (typically a few ms wide); Spanner waits out the uncertainty on commit so it knows its commit timestamp is *definitely* in the past for any later reader.
- **External consistency** = transactions appear to commit in a global, real-time order matching wall-clock time.

```
Client ──► Front-end ──► Paxos leader of split ──► replicas (zones/regions)
                                │
                                └─► writes use TrueTime; commit waits a few ms
```

## Consistency Model
- **External consistency** (a.k.a. linearizability + real-time order) — strongest possible.
- **Strong reads** by default; **stale reads** opt-in (`max_staleness`) for cheaper reads.
- **ACID** transactions across rows, tables, and **across regions**.
- **Read-only transactions** are lock-free (use a snapshot timestamp).

## Replication
- **Multi-region configs**: e.g. `nam3` (3 US regions). Each split's Paxos group is spread across regions; majority quorum required to commit.
- **Optional read-only replicas** in additional regions for low-latency reads.
- All replicas are kept consistent through Paxos.
- Writes need a quorum across regions → write latency = cross-region RTT (~50–100 ms for global configs). This is the main "cost" of Spanner.

## Partitioning / Sharding
**Automatic.** You write SQL; Spanner picks split boundaries by load and size, and rebalances automatically.

### What you control
- The **primary key** (and interleave parent key) effectively determines the *physical layout*.
- Bad PKs cause hot splits.

### Hot-split pitfalls (the Spanner-specific gotcha)
- **Sequential PKs** (e.g. `auto_increment`, `now()`) → all writes go to the last split → **hot tail**.
- **Solution**: hash-prefix or use **bit-reversed sequences**:
  - `PRIMARY KEY (REVERSE(user_id))` or store `hash(user_id)` as the leading column.
- For time-series: bucket by `(shard_id, timestamp)` where `shard_id = hash(other_field) mod N`.

## Scale of a Single Instance
> Spanner is sized in **Processing Units (PUs)** or **nodes** (1 node = 1000 PUs). Each PU = a slice of compute.

| Dimension | Capacity | Notes |
|---|---|---|
| Storage / node | ~10 TB | scales linearly by adding nodes |
| Throughput / node | ~10K writes/sec, 30K+ reads/sec | rough; depends on workload |
| Cluster size | tens of TB to PB | Google's internal Spanner is bigger |
| Splits | thousands per node | auto-managed |
| Latency | ~5–10 ms regional commits, ~100 ms global commits | TrueTime wait + cross-region RTT |
| Availability | 99.999% (multi-region) | best-in-class |

**Scaling pattern:** add nodes → Spanner rebalances splits transparently. No manual sharding ever.

## Performance Characteristics
- Reads: a few ms regional, tens of ms global.
- Writes: dominated by Paxos quorum + TrueTime commit wait. Single-region: ~10 ms; global: ~50–100 ms.
- Bottlenecks: hot splits from bad PKs, very wide transactions, "cross-split" transactions (still supported, just slower).

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| ACID + horizontal scale + global SQL | GCP lock-in; very expensive |
| External consistency (strongest) | Higher write latency than single-region DBs |
| Auto-sharding, no manual ops | Steeper learning curve (interleaving, hot splits) |
| 99.999% availability | Minimum cost is non-trivial |
| Postgres dialect available | Smaller ecosystem than Postgres/MySQL |

## Common HLD Patterns
- **Global SaaS control plane** with strong consistency.
- **Ad-tech budget tracking** (Google's original use case in F1).
- **Inventory & ledger** for global e-commerce / gaming.
- **Spanner + BigQuery** (federation) — OLTP in Spanner, analytics in BigQuery.
- **Spanner + Pub/Sub + Dataflow** — change streams power downstream pipelines.

## Common Pitfalls / Gotchas
- **Sequential PKs** → hot tail split. Always hash or reverse.
- **Massive single transactions** — keep transactions < 100 MB and < a few seconds.
- **Cross-region writes** if you don't need them — pick a regional config first, multi-region only when global strong consistency is required.
- **Interleaving wrongly** — child tables with no parent affinity should NOT be interleaved.
- **Reading at strong by default** when stale would do — cheaper to use bounded staleness for read replicas.

## Interview Cheat Sheet
- **Tagline:** "Globally distributed, externally consistent SQL — TrueTime + Paxos."
- **Best at:** global OLTP needing strong consistency + horizontal scale + 5 9s.
- **Worst at:** budget-sensitive, non-GCP, low-latency single-region apps with tiny data.
- **Scale of one node:** ~10 TB, ~10K writes/sec; cluster scales to PB.
- **Shard by:** primary key range; hash/reverse sequential PKs to avoid hot tail; interleave child rows.
- **Consistency:** external consistency / linearizability via TrueTime + Paxos.
- **Replicates how:** Paxos groups per split; multi-region configs with quorum across regions.
- **Killer alternatives:** CockroachDB (open-source clone of the idea), YugabyteDB, AWS Aurora Limitless, TiDB, FoundationDB.

## Further Reading
- Spanner OSDI 2012 paper: https://research.google/pubs/pub39966/
- Spanner SQL paper: https://research.google/pubs/pub46103/
- Spanner docs: https://cloud.google.com/spanner/docs
- "Life of a Spanner Read/Write" Google Cloud blog series.
