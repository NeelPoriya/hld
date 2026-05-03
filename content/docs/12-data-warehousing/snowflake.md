---
title: "Snowflake"
description: "Snowflake is a fully-managed cloud data warehouse whose defining trick is separating storage from compute. Storage lives once on cheap object storage (S3 / ADLS / GCS); many independent virtual warehouses (compute clu..."
---

> Category: Cloud Data Warehouse / Analytics Platform · Cloud: AWS, Azure, GCP · License: Proprietary (managed SaaS)

## TL;DR
Snowflake is a **fully-managed cloud data warehouse** whose defining trick is **separating storage from compute**. Storage lives once on cheap object storage (S3 / ADLS / GCS); many independent **virtual warehouses** (compute clusters) read it concurrently and elastically. You pay for compute by the second and storage by the GB. It's the default modern analytics warehouse for SQL-on-everything workloads.

## What problem does it solve?
Old warehouses (Teradata, Vertica, on-prem Redshift original architecture) coupled storage with compute on a fixed cluster. Adding a query for a new team meant re-sizing the whole thing. Snowflake (2014) said: store data once on cloud blob storage, spin up as many compute clusters as you need, each sized appropriately, all reading the same data with **zero copy**. No more cluster contention. No more "can we afford a sandbox warehouse?".

## When to use
- **BI / analytics / dashboards** at any scale (Tableau, Looker, PowerBI, Metabase).
- **Ad-hoc SQL exploration** by analysts / data scientists.
- **ETL/ELT central warehouse** — land everything in Snowflake, transform with **dbt**.
- **Data sharing** between business units, customers, partners (Snowflake's secure data sharing is a marquee feature).
- **Bursty / unpredictable** analytical workloads (auto-suspend warehouses save money).
- **Multi-cloud strategy** — Snowflake runs identically on AWS / Azure / GCP.

## When NOT to use
- **OLTP / transactional** workloads — Snowflake is OLAP only; latency is seconds, not ms.
- **High-frequency point lookups / row-level updates** — possible but expensive vs a real KV store.
- **Sub-second dashboards on tiny queries** — warm cache helps, but ClickHouse/Druid/Pinot are cheaper for that.
- **Heavy unstructured ML training** — possible with Snowpark, but Spark/Databricks is more flexible.
- **Cost-sensitive teams with steady-state heavy compute** — Databricks/BigQuery/Redshift can be cheaper at sustained throughput depending on workload.

## Data Model
- **Database** → **Schema** → **Table / View / Materialized View / Stream / Task**.
- Tables are **columnar** (proprietary "FDN" format = columnar with micro-partitions).
- Standard SQL — joins, CTEs, window functions, JSON, semi-structured types, geospatial, vectors.
- **VARIANT** type — store JSON / Avro / Parquet / ORC as semi-structured data and query with dot notation.

```sql
CREATE TABLE events (
    event_id    STRING,
    user_id     STRING,
    event_time  TIMESTAMP_TZ,
    payload     VARIANT  -- arbitrary JSON
);

SELECT user_id, COUNT(*)
FROM events
WHERE event_time >= CURRENT_DATE - 7
  AND payload:type::STRING = 'purchase'
GROUP BY user_id;
```

### Micro-partitions (Snowflake's storage unit)
- Tables are auto-divided into **micro-partitions** of 50–500 MB compressed (~16 MB columnar groups).
- Each micro-partition stores **min/max + distinct values** per column → automatic **pruning** at query time.
- No traditional indexes — pruning + columnar reads + clustering replace them.

## Architecture & Internals
Three architectural layers:

1. **Storage layer** — data sits on cloud blob storage (S3 / ADLS / GCS) in Snowflake's columnar format. Encrypted, replicated by the cloud provider.
2. **Compute layer** — independent **virtual warehouses** (clusters of MPP compute nodes). You can spin up many; each is sized **XS / S / M / L / XL / 2XL …** (each step ≈ 2× nodes).
3. **Cloud Services layer** — query parser, optimizer, metadata, security, transactions. Multi-tenant, shared, managed by Snowflake.

```
┌─────────────────────────────────────────────────┐
│ Cloud Services (auth, metadata, optimizer, txn) │
└─────────────────────────────────────────────────┘
        ▲                ▲                 ▲
        │                │                 │
   ┌────┴───┐        ┌───┴────┐        ┌───┴────┐
   │ WH "A" │        │ WH "B" │        │ WH "C" │   ← virtual warehouses (compute)
   │ (M)    │        │ (XL)   │        │ (S)    │
   └────────┘        └────────┘        └────────┘
        │                │                 │
        └────────────────┴─────────────────┘
                         ▼
              ┌──────────────────────┐
              │ Object storage (S3)  │   ← single shared storage
              └──────────────────────┘
```

### Result cache
Snowflake aggressively caches:
- **Result cache** (24h) — identical query against unchanged data → instant.
- **Warehouse cache** — recently-read micro-partitions stay on local SSD of warehouse nodes.
- **Metadata cache** — table stats / pruning info.

## Consistency Model
- **ACID** transactions on tables.
- **Time travel** — query a table as it was at any timestamp within the retention window (default 1 day, up to 90 days on Enterprise).
- **Fail-safe** — additional 7 days after time-travel for disaster recovery.
- **Multi-statement transactions** supported.
- Strong consistency within a region; cross-region reads are via replication features.

## Replication
- **Cloud storage handles replication** at the bytes level (S3 = 11 9s durability across AZs).
- **Database / account replication** — replicate databases (or whole accounts) across regions / clouds for DR. Refresh interval configurable (minutes).
- **Failover groups** for orchestrated cross-region failover.
- **Secure Data Sharing** — share *live* tables with other Snowflake accounts without copying (consumers query via their own warehouse).

## Partitioning / Sharding
You don't shard Snowflake manually. The system shards storage automatically into **micro-partitions** and distributes compute work across virtual warehouse nodes.

### Clustering keys (the closest thing to a partition key)
For very large tables, you can declare a **clustering key** so Snowflake co-locates rows with similar values in the same micro-partitions:

```sql
CREATE TABLE events_clustered CLUSTER BY (event_date, customer_id) AS
SELECT * FROM events;
```

- Improves pruning for queries filtering / ordering on these columns.
- Snowflake **automatic re-clustering** keeps it in shape.
- **Don't** cluster every table — it costs money. Use only on large tables (TB+) with frequent selective queries on those columns.

### "Hot data" patterns to know
- For huge fact tables, cluster by `(date_column, high_cardinality_id)` so daily queries prune to recent micro-partitions and lookups find the customer's blocks fast.
- Avoid clustering on **monotonically increasing** columns alone — works but doesn't help much; pair with another column.
- For wide multi-tenant tables, clustering by `tenant_id` first, then `event_time`, lets per-tenant queries prune dramatically.

### Per-warehouse parallelism
- Within a single warehouse, queries are split across nodes.
- Across warehouses, you isolate workloads — e.g. a "BI" warehouse, a "data science" warehouse, an "ETL" warehouse — none contend.

## Scale of a Single Instance
There's **no single instance** in Snowflake — the platform itself is multi-tenant, and within an account, you have many warehouses. The relevant numbers:

| Dimension | Comfortable | Stretch | Notes |
|---|---|---|---|
| Table size | TBs–PBs | PBs | columnar + pruning makes large tables OK |
| Warehouse size | XS (1 node) → 6XL (512 nodes) | — | costs scale linearly with size |
| Concurrent queries per WH | ~8 by default | scale-out clusters: 1–10 | separate WHs = better isolation |
| Data scanned per query | GBs–TBs | PBs (with pruning) | result cache makes repeats free |
| Query latency | sub-second on cached small queries; minutes on big scans | hours possible | not real-time |
| Storage durability | 11 9s (cloud blob) | — | inherited from S3/ADLS/GCS |

**Multi-cluster warehouses** (Enterprise+) — auto-scale out to N clusters when concurrent queries pile up; auto-scale back when idle.

**When to scale out vs up:**
- More **concurrent users** running similar small queries → scale **out** (multi-cluster).
- One big query is slow → scale **up** (bigger warehouse).
- Mixed workloads stepping on each other → split into separate warehouses (different cost centers, too).

## Performance Characteristics
- **Latency:** sub-second for cached small queries; seconds-to-minutes for big aggregations; not for ms-level use cases.
- **Throughput:** scales linearly with warehouse size (each step is ~2× the price and ~2× the speed for big scans).
- **Bottlenecks:** heavy data scans without pruning, exploding cross joins, very wide rows in `SELECT *`, big sort/group-by spills.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Truly elastic compute, instant isolation | Proprietary; lock-in (less than vendors of yore, more than open formats like Iceberg) |
| One copy of data, many compute clusters | Cost can balloon — auto-suspend & RBAC matter |
| Excellent SQL, great optimizer | OLAP only; not for OLTP / real-time serving |
| Multi-cloud (AWS/Azure/GCP) | Compute pricing per-second can hide costs in long-running ETL |
| Time travel + zero-copy clones for safe testing | Not the cheapest at sustained heavy compute |
| Secure Data Sharing across accounts | Some advanced features locked to higher editions |
| Strong governance & masking | Vendor-managed — your scaling levers are limited |

## Common HLD Patterns
- **Modern data stack:**
  ```
  Source DBs → Fivetran / Stitch / Airbyte → Snowflake (raw) → dbt transforms → Snowflake (analytics) → BI tools
  ```
- **Streaming → Snowflake** via Snowpipe / Snowpipe Streaming / Kafka Connector for near-real-time loading.
- **Lakehouse pattern with Iceberg Tables** — Snowflake reads/writes open Iceberg tables on S3, retaining vendor-neutral storage.
- **Multi-tenant SaaS analytics** — separate Snowflake accounts per customer + Secure Data Sharing for embedded analytics.
- **Zero-copy cloning** for dev/test environments — clone a 10 TB table in seconds at no storage cost.
- **CDC sink:** Debezium → Kafka → Snowflake via Snowpipe Streaming for near-real-time replicas.

## Common Pitfalls / Gotchas
- **Forgetting auto-suspend** on warehouses → pays for idle compute.
- **One giant warehouse** for everything → noisy-neighbor problems among workloads.
- **`SELECT *`** on wide columnar tables → reads everything; pick columns.
- **Lots of tiny files** to ingest via Snowpipe → metadata overhead. Batch ingestion or use Snowpipe Streaming.
- **Cross-database joins** with mismatched cluster keys → unnecessary scans.
- **VARIANT abuse** — querying deeply nested JSON repeatedly is slow; flatten in transforms.
- **Time Travel + heavy DML** explodes storage costs (every change kept). Tune retention.
- **Micro-partition fragmentation** after lots of small DML → cluster maintenance / `ALTER TABLE … RECLUSTER`.
- **Cost surprises** from a single bad query at 6XL — set warehouse limits, monitor, use resource monitors.

## Interview Cheat Sheet
- **Tagline:** "Cloud-native data warehouse with separated storage & compute and elastic virtual warehouses."
- **Best at:** SQL analytics, BI, ad-hoc exploration, multi-team isolation, cross-cloud, data sharing.
- **Worst at:** OLTP, low-latency serving, ms-level dashboards, cost-sensitive sustained heavy compute.
- **Scale of one warehouse:** XS (1 node) to 6XL (512 nodes); scales out via multi-cluster; storage = blob storage, effectively unlimited.
- **Shard by:** automatic micro-partitions; optional **clustering key** (e.g. `(date, customer_id)`) for huge tables.
- **Consistency:** ACID; time travel up to 90 days; cross-region replication available.
- **Replicates how:** storage replicated by cloud provider; database/account replication for cross-region DR; secure data sharing for live read replicas.
- **Killer alternatives:** Google BigQuery, Amazon Redshift (esp. RA3 with separated storage), Databricks SQL on Delta Lake, ClickHouse / Druid / Pinot (real-time OLAP), Trino on Iceberg/Hudi (open lakehouse).

## Further Reading
- Official docs: https://docs.snowflake.com/
- "The Snowflake Elastic Data Warehouse" SIGMOD paper: https://event.cwi.nl/lsde/papers/p215-dageville-snowflake.pdf
- *Snowflake: The Definitive Guide* — O'Reilly.
- dbt + Snowflake patterns: https://docs.getdbt.com/