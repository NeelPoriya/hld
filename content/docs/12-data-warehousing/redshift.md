---
title: "Amazon Redshift"
description: "Amazon Redshift is AWS's managed cloud data warehouse — columnar, MPP, with Redshift Spectrum for S3-data-lake federation and Serverless mode for zero-management."
---

> Category: Cloud Data Warehouse · Provider: AWS · License: Proprietary (managed service)

## TL;DR
Amazon Redshift is **AWS's managed cloud data warehouse** — a **columnar MPP (massively parallel processing)** engine forked originally from PostgreSQL. You define clusters of compute nodes; data is **distributed and sorted** across them; queries fan out, scan in parallel, and return aggregated results. Modern Redshift adds **RA3 nodes** (separating compute from S3-backed managed storage), **Spectrum** (query S3 data without loading it), and **Serverless** (zero-management). Reach for Redshift when you're an **AWS shop doing BI / analytics** at TB–PB scale and want native integration with S3, Glue, Lambda, IAM. Reach for **Snowflake / BigQuery** if you want even more elasticity, or for **ClickHouse / Druid** for sub-second OLAP.

## What problem does it solve?
You have lots of analytical questions over big data:
- "Total sales by product category by week, last 12 months."
- "Funnel conversion rates by traffic source, last quarter."
- "Cohort retention by signup month."

OLTP databases (Postgres, MySQL) crumble under these — they're optimized for row-oriented, transaction-style reads. **Redshift is columnar + MPP**: it scans only the columns you need, distributes work across nodes, and aggregates in parallel — turning hours into seconds.

## When to use
- **AWS-native analytics / BI** — your data is in S3, RDS, DynamoDB, and you use IAM / Glue / QuickSight.
- **TB–PB-scale data warehousing** with concurrent BI users.
- **Federation over S3** — Redshift Spectrum lets you query Parquet/ORC in S3 without loading.
- **Predictable workloads** with provisioned clusters, or **bursty / unknown** with Serverless.
- **You want PostgreSQL-flavor SQL** — most Postgres tooling and dialect just works.

## When NOT to use
- **OLTP** — row inserts/updates are slow; Redshift is built for analytics.
- **Sub-second dashboard queries** at huge concurrency — ClickHouse / Druid are tuned harder.
- **Vendor-portable / multi-cloud** — Snowflake or open formats (Iceberg, Delta) are better.
- **You need extreme elasticity** with virtual warehouses → Snowflake's per-warehouse model is more flexible.
- **Real-time event ingestion + query** — Druid / Pinot / ClickHouse are better here.

## Data Model
- **Database → Schema → Table** — standard relational schema.
- **Columnar storage** — each column stored separately for I/O efficiency on aggregations.
- **Distribution style** per table: `KEY` (hash by column), `EVEN` (round-robin), `ALL` (replicated to every node), `AUTO` (Redshift decides).
- **Sort key** — physically orders data on disk; cardinal for query pruning. Compound or interleaved.

```sql
CREATE TABLE events (
    user_id    BIGINT,
    event_name VARCHAR(50),
    event_time TIMESTAMP,
    payload    SUPER  -- semi-structured JSON
)
DISTSTYLE KEY
DISTKEY (user_id)
SORTKEY (event_time);
```

**Redshift Spectrum** lets you query external tables backed by S3:
```sql
CREATE EXTERNAL TABLE spectrum.s3_events (...)
STORED AS PARQUET
LOCATION 's3://my-bucket/events/';

SELECT date_trunc('day', event_time), COUNT(*)
FROM spectrum.s3_events
WHERE event_time > current_date - 7
GROUP BY 1;
```

## Architecture & Internals
- **Leader node** parses queries, generates parallel execution plans, returns results.
- **Compute nodes** execute fragments in parallel; each compute node has slices that scan distributed table portions.
- **RA3 nodes** — managed S3-backed storage; compute nodes cache hot blocks locally; storage and compute scale independently.
- **DC2 nodes** (older) — compute + local SSD storage tightly coupled.
- **Serverless** — abstracts the cluster entirely; AWS provisions compute (Redshift Processing Units, RPUs) on demand.
- **Workload Management (WLM)** — query queues with concurrency, priority, and timeout settings; auto-WLM uses ML.

## Consistency Model
- **ACID** at the cluster level — Redshift uses MVCC; each transaction sees a consistent snapshot.
- **Bulk-load model** — `COPY` from S3 is the canonical ingestion path; row-by-row INSERT works but is slow.
- **Eventually consistent** between Spectrum and recently-written data depending on S3 consistency (now strongly consistent in S3).

## Replication
- **Within cluster:** data is replicated across compute nodes in the same AZ for fault tolerance (one slice replica per other node).
- **Cross-AZ / cross-region:** snapshots to S3 (incremental, automated daily); restore in another region.
- **Cross-region snapshot copy** for DR.
- **No native multi-region active-active** — Snowflake/BigQuery do this better.

## Partitioning / Sharding
- **Distribution key** controls how rows split across compute nodes — choose to co-locate joinable data.
- **Sort key** controls disk ordering — accelerates `WHERE` filters and range scans.
- **EVEN / ALL** for tables that don't fit the KEY pattern.

**Hot-key pitfall:** if your DISTKEY skews (one value dominates), one node holds all the rows — that node becomes the bottleneck. Use `EVEN` distribution or pick a high-cardinality KEY.

## Scale
- **Provisioned cluster:** up to 128 compute nodes; PB-scale storage with RA3.
- **Serverless:** RPUs auto-scale up and down; capped by your account limits.
- **Concurrency:** WLM allows ~50 concurrent queries; **Concurrency Scaling** auto-spawns transient clusters for read overflow.
- **Spectrum:** can scan exabytes in S3 with bigger Spectrum fleet.

## Performance Characteristics
- **Scan throughput:** GB/sec per node; aggregations and joins parallelized.
- **Query latency:** seconds for typical BI queries on TBs of data; sub-second with materialized views and result caching.
- **`COPY` throughput:** millions of rows/sec from S3 with parallel files.
- **Bottlenecks:** skewed distribution, missing sort keys, vacuum/analyze maintenance, leader node CPU on metadata-heavy queries.

## Trade-offs

| Strength | Weakness |
|---|---|
| Tight AWS integration (S3, IAM, Glue, QuickSight, Lambda) | AWS-only |
| RA3 = compute/storage separation, Serverless = zero ops | Concept overhead — DC2 vs RA3 vs Serverless |
| PostgreSQL-flavored SQL, broad tool compatibility | Per-row updates are slow; not OLTP |
| Spectrum federates S3 data lakes | Cross-region active-active not native |
| Automated snapshots, encryption, audit logging | Concurrency lower than Snowflake's per-warehouse model |
| Materialized views accelerate dashboards | Vacuum / analyze maintenance windows |

## Common HLD Patterns
- **Lake + warehouse:** raw events land in S3 (Parquet), Glue catalogs them, Redshift Spectrum queries directly, hot subsets are loaded into Redshift internal tables for fast BI.
- **CDC pipeline:** RDS / DynamoDB Streams → DMS / Kinesis → S3 → COPY into Redshift → BI dashboards.
- **Federated query:** Redshift queries RDS / Aurora directly via federated query; combines OLTP source-of-truth with warehouse aggregates.
- **Reverse ETL:** Redshift → Lambda / dbt → product DB / SaaS for personalization.
- **Dashboards:** QuickSight / Tableau / Looker connecting via JDBC; result cache + materialized views for low latency.

## Common Pitfalls / Gotchas
- **Wrong DISTKEY** → data skew → hot node → query slowdowns; use `STL_DIST` views to detect skew.
- **No SORTKEY on time-series tables** → range scans degrade to full scans.
- **Tiny files in S3 for Spectrum** → planner overhead; coalesce to ~128MB Parquet files.
- **Forgetting `VACUUM` / `ANALYZE`** → bloat + stale stats; auto-vacuum helps but doesn't replace planning.
- **Concurrency limits** — without Concurrency Scaling, BI dashboards can queue up.
- **Loading via INSERT row-by-row** — always use `COPY` from S3 / EMR.
- **Choosing DC2 over RA3** today is rarely correct unless you have specific tiny-cluster latency needs.

## Interview Cheat Sheet
- **Tagline:** AWS-managed columnar MPP data warehouse with PostgreSQL-flavor SQL and S3 federation via Spectrum.
- **Best at:** AWS-native BI / analytics on TB–PB; lake-house-style queries on S3.
- **Worst at:** OLTP, sub-second concurrent dashboards at huge scale, multi-cloud.
- **Scale:** 128 nodes, PB-class with RA3, Serverless RPUs.
- **Shard by:** distribution key (KEY/EVEN/ALL/AUTO); sort key for query pruning.
- **Consistency:** ACID + MVCC.
- **Replicates how:** intra-cluster slice replicas; snapshots for cross-AZ/region DR.
- **Killer alternative:** Snowflake (multi-cloud, per-warehouse elasticity), BigQuery (fully serverless), ClickHouse (sub-second OLAP), Databricks SQL (lakehouse).

## Further Reading
- Developer guide: <https://docs.aws.amazon.com/redshift/latest/dg/welcome.html>
- RA3 architecture: <https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-clusters.html>
- Best practices for designing tables: <https://docs.aws.amazon.com/redshift/latest/dg/c_designing-tables-best-practices.html>
- Spectrum guide: <https://docs.aws.amazon.com/redshift/latest/dg/c-using-spectrum.html>
