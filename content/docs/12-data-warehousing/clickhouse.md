---
title: "ClickHouse"
description: "ClickHouse is the fastest open-source columnar OLAP database. Sub-second analytics on billions of rows, vectorized execution, used heavily for product analytics, observability, and real-time dashboards."
---

> Category: Columnar OLAP Database · Written in: C++ · License: Apache 2.0

## TL;DR
ClickHouse is the **fastest open-source columnar OLAP database** — built originally at Yandex for web analytics, now powering product analytics, observability, and real-time dashboards across Cloudflare, GitLab, Uber, eBay, and more. It's a **vectorized, columnar, MPP engine** with extreme insert throughput (millions of rows/sec/node) and sub-second query latency on billions of rows. Reach for ClickHouse when you need **interactive analytics latency at scale** — user-facing analytics dashboards, log/metric exploration, real-time aggregations on streaming data. Reach for **Snowflake / BigQuery / Redshift** if you want a fully-managed warehouse for traditional BI; reach for **Druid / Pinot** for very high-concurrency real-time OLAP with low latency.

## What problem does it solve?
You have analytics workloads that warehouses choke on:
- **Sub-second user-facing dashboards** with billions of rows.
- **Log / event search** at TB scale that Elasticsearch can't keep up with.
- **Real-time aggregations** on streaming data with seconds-of-latency.
- **Observability metrics** with high cardinality.

Traditional warehouses (Snowflake, BigQuery, Redshift) are built for batch-style BI: queries return in seconds-to-minutes and concurrency is moderate. ClickHouse is tuned for **interactive query latency** with high concurrency on huge data — it sacrifices some warehouse niceties (DML, transactions) to get there.

## When to use
- **User-facing analytics** — your customers see dashboards backed by a real DB, not pre-aggregated batch jobs.
- **Log / metric / observability** — replacing Elasticsearch for log analytics often gives 10× cost reduction.
- **Real-time data pipelines** with Kafka → ClickHouse for streaming aggregations.
- **Product analytics** — Mixpanel / Amplitude-style funnels, cohorts, retention.
- **Time-series at scale** — though specialized TSDBs may still win for write throughput per node.
- **Self-hosted or via ClickHouse Cloud** if you want managed.

## When NOT to use
- **OLTP / transactional workloads** — ClickHouse has weak DML (no point updates, eventual consistency on replicated tables).
- **Heavy joins on huge tables** — joins are weaker than warehouses; design with denormalization or pre-joined tables.
- **Strong consistency for distributed writes** — eventually consistent across replicas.
- **Tiny scale** — for under a million rows you don't need ClickHouse.
- **Very high concurrency simple lookups** — Druid / Pinot may be better for thousands of concurrent low-latency queries.

## Data Model
- **Table engines** are the killer concept — each table picks an engine that defines storage, replication, and merge behavior.
- **MergeTree** family is canonical:
  - `MergeTree` — append-only with background compaction.
  - `ReplacingMergeTree` — deduplicates by sort key (eventually).
  - `AggregatingMergeTree` — pre-aggregates rows during merge.
  - `SummingMergeTree`, `CollapsingMergeTree`, `VersionedCollapsingMergeTree` — variants.
- **ReplicatedMergeTree** — adds ZooKeeper/ClickHouse Keeper coordination for replication.
- **Distributed** engine — virtual table that fans out to shards.

```sql
CREATE TABLE events
(
    user_id UInt64,
    event_name LowCardinality(String),
    event_time DateTime,
    payload String CODEC(ZSTD(3))
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (event_name, user_id, event_time);
```

```sql
SELECT
    toStartOfHour(event_time) AS hour,
    event_name,
    count() AS n,
    uniqExact(user_id) AS unique_users
FROM events
WHERE event_time > now() - INTERVAL 1 DAY
GROUP BY hour, event_name
ORDER BY hour, n DESC;
```

## Architecture & Internals
- **Vectorized columnar engine** — operations work on batches of column values (SIMD-friendly).
- **Columnar storage** — data sorted by `ORDER BY` clause, stored per-column with compression (ZSTD, LZ4, T64, Gorilla, etc.).
- **Sparse primary index** — index entries every N rows (8192 default), pointing to data granules. Skip-index style.
- **MergeTree compaction** — small inserts pile up as **parts**; background merges combine them into larger parts (LSM-style).
- **Distributed cluster:** multiple shards × replicas; clients connect to any node and use `Distributed` table engine to query the whole cluster.
- **Coordination:** ZooKeeper or ClickHouse Keeper (Raft, the modern recommended option).

## Consistency Model
- **Replicated tables** are **eventually consistent** — a write to one replica replicates async to others.
- **`SELECT` from a replica may not see latest writes** unless you use `SELECT ... SETTINGS select_sequential_consistency=1`.
- **No multi-statement transactions** — single-statement atomicity is the model.
- **Write idempotency** via insert deduplication tokens.

## Replication
- **ReplicatedMergeTree** uses ZooKeeper / ClickHouse Keeper to coordinate replication across replicas in the same shard.
- Async replication; read from any replica.
- **Cross-region replication** is typically handled by app-layer or separate logical replication; ClickHouse doesn't have native multi-region active-active.

## Partitioning / Sharding
- **Partitioning** (`PARTITION BY`) — typically by month or day; affects retention and merging, NOT query distribution.
- **Sharding** = splitting data across nodes manually via the `Distributed` table engine; you choose a sharding key (hash of column).
- **Replicas** within a shard.

**Hot-shard pitfall:** picking the wrong shard key (e.g. monotonically increasing IDs hashed by a poor function) creates skew. Use a high-cardinality, well-distributed shard key (`cityHash64(user_id)` is a common choice).

## Scale of a Single Node
- **Inserts:** millions of rows/sec per node with batched inserts.
- **Storage:** tens of TB on a single node with compression.
- **Compression ratios** of 5–20× are typical (timestamps, low-cardinality columns).
- **When to scale out:** at multi-TB / multi-billion-row tables and queries that need parallelism beyond one node, shard.

## Performance Characteristics
- **Query latency:** sub-second on billions of rows for typical aggregations.
- **Insert throughput:** 1–10M rows/sec per node with bulk inserts.
- **Bulk inserts >> tiny inserts** — many small inserts create part explosion (`Too many parts` error) and merge backlog.
- **Bottlenecks:** disk I/O for cold queries, ZooKeeper / Keeper for replication coordination, memory for large GROUP BY.

## Trade-offs

| Strength | Weakness |
|---|---|
| Sub-second OLAP latency on huge tables | Joins are weaker than warehouses; denormalize |
| Insert throughput in millions/sec/node | No real DML — UPDATE/DELETE are async mutations |
| Vectorized execution + SIMD = blazing fast | Eventual consistency on replicated tables |
| Many specialized table engines | Sharding/replication is your responsibility (or use Cloud) |
| Cheaper than warehouses at huge scale | Multi-region active-active not native |
| Native streaming integrations (Kafka, RabbitMQ engines) | ClickHouse Keeper is newer; ZK still common |

## Common HLD Patterns
- **Real-time analytics:** Kafka → ClickHouse Kafka engine → MaterializedView → MergeTree → fast dashboards.
- **Log / observability:** Vector / Fluent Bit → ClickHouse → Grafana — replaces Elasticsearch at lower cost.
- **Product analytics:** events ingested into wide event table; pre-aggregated rollup tables via `MaterializedView` for dashboards.
- **High-cardinality time-series:** observability-style data with many label dimensions; `LowCardinality` strings + ZSTD compression.
- **CDC pipeline:** Postgres → Debezium → Kafka → ClickHouse; design with `ReplacingMergeTree` for upserts.

## Common Pitfalls / Gotchas
- **Tiny inserts → part explosion** — batch your inserts to thousands–millions of rows; use **async inserts** or buffer engines.
- **Wrong ORDER BY** kills query performance — match your typical filter columns.
- **Joins** — large joins materialize into RAM; design star-schema with small dimension tables, or pre-join.
- **DELETE / UPDATE** are async mutations — they re-write whole parts; expensive and slow.
- **Eventual consistency** trips up code expecting strong reads.
- **ZooKeeper bottleneck** at high replica count; migrate to ClickHouse Keeper (Raft).
- **Cardinality bombs** in `String` columns — use `LowCardinality(String)` for repeated values.
- **Memory explosions** on `GROUP BY` of high-cardinality columns; tune `max_memory_usage`.

## Interview Cheat Sheet
- **Tagline:** Open-source columnar OLAP DB with sub-second latency on billions of rows; vectorized + MPP.
- **Best at:** real-time analytics, observability, product analytics, user-facing dashboards.
- **Worst at:** OLTP, heavy joins, strong-consistency replication.
- **Scale:** millions of inserts/sec/node; sub-second queries on billions of rows; multi-shard for petabyte scale.
- **Shard by:** sharding key in `Distributed` table; replicas per shard with ReplicatedMergeTree.
- **Consistency:** eventual on replicas; per-statement atomic; insert dedup tokens.
- **Replicates how:** ReplicatedMergeTree + ZooKeeper / ClickHouse Keeper for coordination.
- **Killer alternative:** Snowflake / BigQuery / Redshift (managed warehouses), Druid / Pinot (low-latency OLAP), TimescaleDB / InfluxDB (TSDB), Elasticsearch (logs).

## Further Reading
- Official docs: <https://clickhouse.com/docs>
- MergeTree engine family: <https://clickhouse.com/docs/en/engines/table-engines/mergetree-family>
- Performance tips: <https://clickhouse.com/docs/en/operations/tips>
- ClickHouse Keeper: <https://clickhouse.com/docs/en/guides/sre/keeper/clickhouse-keeper>
