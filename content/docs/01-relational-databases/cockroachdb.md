---
title: "CockroachDB"
description: "CockroachDB (\"CRDB\") is the open-source answer to Google Spanner: a distributed, PostgreSQL-wire-compatible SQL database that scales horizontally, replicates strongly, and survives node/zone/region failures. Without a..."
---

> Category: Distributed SQL Database (NewSQL) · Written in: Go · License: CockroachDB Community License (BSL → Apache after time delay) + Enterprise

## TL;DR
CockroachDB ("CRDB") is **the open-source answer to Google Spanner**: a distributed, **PostgreSQL-wire-compatible** SQL database that scales horizontally, replicates strongly, and survives node/zone/region failures. Without atomic clocks, it uses **HLC (Hybrid Logical Clocks)** to provide serializable transactions across a cluster on commodity hardware or any cloud.

## What problem does it solve?
Same as Spanner — "I want SQL + ACID + horizontal scale + multi-region" — but **without GCP lock-in** and **without atomic clocks**. CRDB runs anywhere (any cloud, on-prem) and gives a familiar Postgres developer experience.

## When to use
- **Global / multi-region OLTP** where strong consistency matters and a single Postgres won't fit.
- Workloads that have outgrown a vertically-scaled Postgres.
- Multi-cloud or hybrid setups (anywhere Spanner won't run).
- **Survive AZ / region outages** with zero data loss.
- **Postgres-compatible** apps that need horizontal scale without rewriting.

## When NOT to use
- **Tiny scale** — CRDB has more overhead than single-node Postgres; not worth it under ~1 TB.
- **Latency-sensitive** writes where consensus round-trips matter.
- **Heavy analytics** — use Snowflake/BigQuery for OLAP.
- **Postgres-only feature parity** required (extensions like pgvector, PostGIS — limited or absent).
- Cost-sensitive (license is BSL with a 3-year delay; enterprise features cost).

## Data Model
- Standard SQL with **PostgreSQL wire protocol** — most Postgres drivers / ORMs work unchanged.
- Tables, indexes, foreign keys, JSON, arrays, etc.
- **Distributed primary key** — physical layout is determined by PK.

```sql
CREATE TABLE orders (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL,
  total     DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON orders (user_id, created_at DESC);
```

### Multi-region table types (a CRDB superpower)
- **REGIONAL BY ROW** — each row belongs to a region (low-latency local reads/writes per row).
- **REGIONAL BY TABLE** — entire table pinned to one region (low-latency for that region only).
- **GLOBAL** — read-mostly tables replicated everywhere; writes are slower but reads are fast everywhere.

This lets you co-locate user data in their home region while still allowing global queries.

## Architecture & Internals
- A **range** is a 64–512 MB chunk of contiguous keyspace (similar to Spanner splits).
- Each range has **3 (default) or 5** replicas managed by **Raft**.
- **Gateway nodes** parse SQL and route to the right ranges.
- **Distributed SQL execution** — query planner pushes work close to data.
- Storage engine: **Pebble** (Go LSM, RocksDB-compatible).

```
Client ──► Gateway node ──► Raft leader of range ──► replicas
                                  │
                                  └─► HLC timestamps + serializable txn protocol
```

## Consistency Model
- **Serializable isolation by default** (the strongest SQL standard isolation; stronger than Postgres's default Read Committed).
- **Strong consistency** within a cluster — every read sees the latest committed value.
- Uses **HLC (Hybrid Logical Clocks)** + **uncertainty intervals** to get serializability without atomic clocks. Reads might wait briefly to ensure they see all writes that could have happened "before" them.
- **Externally consistent within a region**; multi-region setups have small uncertainty windows.

CAP positioning: **CP** — under partition, the minority side stops accepting writes for affected ranges; the majority side keeps going.

## Replication
- Each range = a **Raft group**. Replicas placed across nodes / AZs / regions per the table's locality settings.
- Default RF = 3; configurable to 5 or 7.
- **Survival goals**: zone failure, region failure — set per database.
- **Lease holders** serve reads to avoid Raft round-trips for every read.

## Partitioning / Sharding
**Automatic** range-based sharding. The cluster splits and rebalances ranges as data grows.

### Hot-range pitfalls (CRDB's version of the hot-shard story)
- **Sequential PKs** (auto-incrementing IDs, `now()`) → last range gets all writes → **hot range**.
- **Solutions:**
  - Use **UUIDs** as PKs (random) — recommended default.
  - **Hash-sharded indexes**: `CREATE INDEX ... USING HASH WITH (bucket_count = 8)` — physically splits the index into N hash buckets.
  - For time-series: prefix with `(shard_id, timestamp)`.
- Multi-region: pick the right table locality (REGIONAL BY ROW vs GLOBAL).

## Scale of a Single Instance
| Dimension | Per node | Cluster | Notes |
|---|---|---|---|
| Storage | a few TB | tens of TB to PB | scales linearly with nodes |
| Throughput | thousands of writes/sec | tens of thousands+ across cluster | latency bound by Raft quorum |
| Cluster size | 3–N (any odd, ≥3 for HA) | 100s of nodes possible | Raft pressure grows |
| Latency | ms regional, tens of ms multi-region | — | Raft commit + HLC uncertainty |
| Availability | 99.99% (single region multi-AZ) — 99.999% (multi-region) | — | depends on survival goal |

**Scaling story:** add nodes → ranges rebalance automatically. CRDB explicitly aims for a "no manual sharding" experience.

## Performance Characteristics
- Single-row writes: a few ms within a region.
- Cross-region writes: tens to ~100 ms (depends on quorum span).
- Reads from lease-holder are local-fast; non-leader follower reads available with bounded staleness for low latency.
- Bottlenecks: hot ranges, expensive cross-range JOINs, GC pause (rare in Go but real), Raft commit latency.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Postgres-compatible + horizontal scale | Higher latency than single-node Postgres |
| Strong consistency, serializable default | Operationally more complex than vanilla Postgres |
| Multi-region with rich locality controls | License changed to BSL (cooling-off Apache) |
| Survives node/zone/region failures | Not full Postgres feature parity (no PostGIS, etc.) |
| No manual sharding ever | Cost (Enterprise features for many production needs) |

## Common HLD Patterns
- **Global SaaS** with **REGIONAL BY ROW** to keep user data near the user.
- **Multi-cloud HA** — span clusters across AWS + GCP for vendor independence.
- **Replacement for sharded MySQL fleets** with significantly less operational pain.
- **CDC**: changefeeds → Kafka → analytics.
- **Operational store + Snowflake** for analytics.

## Common Pitfalls / Gotchas
- **Sequential PKs** → hot range. Use UUIDs or hash-sharded indexes.
- **Big transactions** that span many ranges → high commit latency.
- **`SELECT *`** with no `LIMIT` on a giant table — distributed scan.
- **Multi-region writes** without thinking about locality → every write is global → 100 ms+ latency.
- **Forgetting follower reads** for stale-OK queries → unnecessary leader hops.
- **Treating CRDB like Postgres for extensions** — many aren't supported.

## Interview Cheat Sheet
- **Tagline:** "Open-source Spanner: distributed Postgres-compatible SQL with serializable transactions."
- **Best at:** multi-region OLTP, horizontally-scalable SQL on any cloud.
- **Worst at:** sub-ms single-row latency, full Postgres extension support, tiny workloads.
- **Scale of one node:** a few TB; cluster scales to PB; throughput scales linearly with nodes (within Raft limits).
- **Shard by:** auto range-based; hash-sharded indexes / UUID PKs to avoid hot ranges; locality types in multi-region.
- **Consistency:** serializable by default; HLC + uncertainty intervals; CP under partition.
- **Replicates how:** Raft per range; RF=3 or 5; survival goals = zone or region.
- **Killer alternatives:** Spanner (managed, atomic clocks), YugabyteDB (sister NewSQL, also Postgres-compatible), TiDB (MySQL-compatible NewSQL), Aurora Limitless, FoundationDB.

## Further Reading
- Docs: https://www.cockroachlabs.com/docs/
- "Living Without Atomic Clocks" — https://www.cockroachlabs.com/blog/living-without-atomic-clocks/
- CRDB design: https://www.cockroachlabs.com/blog/the-cockroachdb-architecture-document/