---
title: "Google BigQuery"
description: "BigQuery is GCP's fully-serverless, multi-tenant cloud data warehouse. Petabyte-scale SQL with no clusters to manage — you just submit queries and pay per byte scanned."
---

> Category: Cloud Data Warehouse (Serverless) · Provider: Google Cloud · License: Proprietary (managed service)

## TL;DR
BigQuery is **GCP's fully-serverless cloud data warehouse**. There are **no clusters, no nodes, no provisioning** — you create datasets and tables, submit SQL, and BigQuery transparently parallelizes work across thousands of slots over Google's **Dremel** engine and **Colossus** distributed storage. Pricing is **per byte scanned** (or flat-rate slot reservations). Reach for BigQuery when you want **zero-ops petabyte-scale analytics**, native ML (BigQuery ML), streaming inserts, and tight integration with Looker, Dataflow, Pub/Sub, GCS. Reach for **Snowflake** if you want per-warehouse elasticity with workload isolation, **Redshift** if you're an AWS shop, **ClickHouse** if you need sub-second OLAP.

## What problem does it solve?
You have analytical questions over huge data and don't want to operate any infrastructure:
- "Aggregate 50 TB of log data by hour for the last year."
- "Run ML training over the warehouse without exporting data."
- "Stream events from Pub/Sub into a queryable warehouse with seconds-of-latency."

Most warehouses (Redshift, Snowflake, on-prem) require you to think about **clusters, nodes, scaling, concurrency tuning**. BigQuery removes all of that — you just write SQL.

## When to use
- **GCP-native shop** doing BI / analytics at TB–PB scale.
- **Bursty, unpredictable analytical workloads** — pay only for what you scan.
- **Real-time analytics** — streaming inserts (Storage Write API, Pub/Sub direct integration).
- **Native ML** — BigQuery ML lets you train models with `CREATE MODEL` SQL.
- **Federated queries** — query GCS, Cloud SQL, Bigtable, Spanner external tables.
- **Shared / multi-tenant** — fine-grained IAM, row-level + column-level security.
- **Geospatial** — `GEOGRAPHY` type with native ST_* functions.

## When NOT to use
- **OLTP** — append-mostly, batch-and-streaming-inserts; not for transactional reads/writes.
- **Sub-second concurrent dashboards** at extreme QPS — caching helps, but Druid / ClickHouse / BI Engine are faster for that workload.
- **Multi-cloud / portable workloads** — vendor lock-in.
- **Cost-unpredictable scan-heavy workloads** — without partition / cluster pruning, costs explode (each query bills the bytes scanned).
- **You need per-row updates at OLTP speed** — DML works but is not optimized for high-frequency point updates.

## Data Model
- **Project → Dataset → Table** hierarchy; datasets live in regions.
- **Columnar storage in Capacitor format**, on Colossus distributed file system.
- **Partitioning** — by `DATE`/`TIMESTAMP`/`DATETIME` column, ingestion time, or integer range.
- **Clustering** — physically co-locates rows by columns (up to 4) for I/O pruning.
- **Materialized views** — incrementally maintained aggregates.

```sql
CREATE TABLE analytics.events (
    user_id  STRING,
    event_name STRING,
    event_time TIMESTAMP,
    payload  JSON
)
PARTITION BY DATE(event_time)
CLUSTER BY user_id, event_name;
```

```sql
SELECT user_id, COUNT(*) AS sessions
FROM analytics.events
WHERE event_time BETWEEN '2026-01-01' AND '2026-01-31'   -- partition prune
  AND event_name = 'session_start'                       -- cluster prune
GROUP BY user_id
ORDER BY sessions DESC
LIMIT 100;
```

## Architecture & Internals
- **Dremel** — distributed query engine using a **tree architecture** (root → mixers → leaves). Queries fan out, leaves scan storage, mixers aggregate, root returns results.
- **Slots** — units of compute. On-demand pricing maps slots dynamically; flat-rate / Editions reservations buy guaranteed slot capacity.
- **Colossus** — Google's distributed file system, the storage layer.
- **Borg + Jupiter** — Borg orchestrates compute; Jupiter is the petabit-class network connecting compute to storage.
- **Storage and compute are fully separated** — that's the foundation of the serverless model.

## Consistency Model
- **ACID** with snapshot isolation per query.
- **Bulk-load and streaming-insert** are both first-class.
- **DML** (UPDATE / DELETE / MERGE) is supported but quotas apply (~20k DML/day per table on standard tier).
- **Time travel** — query data as of any point within the last 7 days (configurable).

## Replication
- **Multi-region datasets** (`US`, `EU`) replicate across multiple regions for durability and availability.
- **Single-region datasets** are durably stored within that region (multi-zone replicated).
- **Cross-region copy** for DR via dataset copy or scheduled queries.
- BigQuery Omni allows querying data in AWS S3 / Azure Blob (cross-cloud) without moving it.

## Partitioning / Sharding
- **Partitioning** by date or integer range — partition pruning is the #1 cost-saver.
- **Clustering** — up to 4 columns; rows physically reordered within partitions.
- **No user-controlled sharding** — Dremel handles parallelism transparently.

**Hot-partition pitfall:** writing all data to a single partition (e.g. all rows with `event_time = today`) creates write hot spots in legacy streaming inserts; modern Storage Write API handles this better.

## Scale
- **Petabytes** per table, no hard cap.
- **Thousands of concurrent queries** with reservation slots.
- **Streaming inserts:** ~100k rows/sec per project (legacy) or unlimited via Storage Write API.
- **Multi-region replication** is automatic for `US` / `EU` regions.

## Performance Characteristics
- **Cold queries** scanning TBs: tens of seconds.
- **With partition + cluster pruning + cache:** sub-second.
- **BI Engine** caches hot data in-memory for sub-second dashboard latency.
- **Bottlenecks:** byte-scan billing — bad partitioning blows up cost; per-project DML quotas; slot contention without reservations.

## Trade-offs

| Strength | Weakness |
|---|---|
| Truly serverless — zero ops | Vendor lock-in to GCP |
| Pay-per-byte (or flat-rate) — predictable model | Cost explodes if you forget partition pruning |
| Native ML with BigQuery ML, streaming, geo, JSON | DML quotas — not for OLTP-style workloads |
| Petabyte-scale with sub-second BI Engine cache | Concurrency tuning via reservations is its own thing |
| Multi-region replication, federated queries (GCS, Spanner) | Time travel limited to 7 days (without snapshots) |
| Tight Looker / Dataflow / Pub/Sub integration | Less flexible than Snowflake's per-warehouse compute isolation |

## Common HLD Patterns
- **Lakehouse on GCS + BigQuery:** raw data → GCS (Parquet/ORC) → BigQuery external tables; hot subsets loaded into native tables.
- **Streaming analytics:** Pub/Sub → Dataflow → BigQuery (streaming insert) → Looker dashboards.
- **CDC pipeline:** Cloud SQL / Spanner → Datastream → BigQuery → analytics.
- **ML in-warehouse:** `CREATE MODEL` for regression / classification / time-series forecasting; `ML.PREDICT` to score.
- **Federation:** join warehouse data with Spanner / Cloud SQL via `EXTERNAL_QUERY`; or query GCS Parquet via external tables.
- **Reverse ETL:** scheduled queries → Cloud Functions → product DB / 3rd-party SaaS.

## Common Pitfalls / Gotchas
- **Querying without partition filter on a partitioned table** → full table scan → expensive surprise. Enforce with `require_partition_filter = TRUE`.
- **`SELECT *` on wide tables** — bills you for every column scanned. Always project explicitly.
- **DML quotas** on high-frequency UPDATE/DELETE — switch to MERGE patterns or stream-then-merge.
- **Streaming inserts vs Storage Write API** — Storage Write is faster, cheaper, supports exactly-once.
- **Materialized views** can save cost, but only when query patterns match; check `_MV_` planning hints.
- **BigQuery Standard SQL vs Legacy SQL** — always Standard SQL today.
- **Cost runaway** without an organization-level quota or reservation cap.

## Interview Cheat Sheet
- **Tagline:** Fully serverless, multi-tenant petabyte-scale data warehouse on GCP — Dremel + Colossus.
- **Best at:** GCP-native analytics, ML-in-warehouse, bursty workloads, real-time streaming inserts.
- **Worst at:** OLTP, multi-cloud portability, predictable-cost dashboards without reservations.
- **Scale:** petabytes per table, thousands of concurrent queries with reservations.
- **Shard by:** partitioning (date/int) + clustering (4 cols); Dremel parallelism is transparent.
- **Consistency:** ACID, snapshot isolation; 7-day time travel.
- **Replicates how:** multi-region datasets auto-replicate; cross-region copy for DR.
- **Killer alternative:** Snowflake (multi-cloud, per-warehouse compute), Redshift (AWS-native), ClickHouse / Druid (sub-second OLAP), Databricks SQL (lakehouse).

## Further Reading
- Official docs: <https://cloud.google.com/bigquery/docs>
- Dremel paper: <https://research.google/pubs/dremel-interactive-analysis-of-web-scale-datasets/>
- Best practices: <https://cloud.google.com/bigquery/docs/best-practices-performance-overview>
- BigQuery ML: <https://cloud.google.com/bigquery/docs/bqml-introduction>
