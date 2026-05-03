---
title: "Apache Hive"
description: "Apache Hive is the original SQL-on-Hadoop engine — turns SQL into MapReduce/Tez/Spark jobs over HDFS and S3 data lakes. Still the de-facto metadata layer (Hive Metastore) for the entire big-data ecosystem."
---

> Category: SQL-on-Hadoop / Data Warehouse · Written in: Java · License: Apache 2.0

## TL;DR
Apache Hive is the **original SQL-on-Hadoop engine** — born at Facebook to let analysts query HDFS without writing MapReduce by hand. It compiles **HiveQL (SQL-like)** into MapReduce / Tez / Spark jobs that scan files in HDFS, S3, GCS, ADLS, etc. Hive's biggest legacy isn't the execution engine itself but the **Hive Metastore (HMS)** — the metadata catalog that virtually every other big-data tool (Spark, Presto, Trino, Impala, Flink, Druid) reads from. Today, you mostly **don't use Hive's runtime** for new workloads — you use Trino/Spark/Snowflake — but you almost certainly still **point them at the Hive Metastore**.

## What problem does it solve?
Pre-Hive: querying terabytes in HDFS meant writing Java MapReduce jobs. That's a massive barrier for analysts. Hive's contribution:
- **SQL on top of HDFS / object storage** — HiveQL feels like SQL.
- **Schema on read** — define a table over existing files (CSV, JSON, Parquet, ORC); no copying needed.
- **Metadata catalog (HMS)** — the canonical catalog of tables, partitions, file formats; shared across the ecosystem.
- **UDFs / UDAFs** — extend SQL with custom code in Java, Python, etc.

Even when the **execution engine** has been replaced by Trino, Spark, etc., the **Hive Metastore** is still the canonical catalog.

## When to use
- **Legacy Hadoop / HDFS shops** with batch ETL pipelines already in Hive.
- **Long-running batch jobs** measured in hours over PB-scale data.
- **You need the Hive Metastore** as a catalog for downstream tools.
- **You're using S3 / HDFS / Azure Blob as a data lake** — Hive tables are often the catalog layer.
- **Cost-sensitive batch workloads** that don't need warehouse-grade interactivity.

## When NOT to use
- **Interactive queries** — Hive on Tez is OK; for fast ad-hoc, use Trino / Spark / ClickHouse / Snowflake / BigQuery.
- **Real-time / streaming** — Hive is batch only.
- **OLTP** — never.
- **You don't have a Hadoop story** — managed warehouses are simpler today.
- **New greenfield projects** — most teams now skip Hive runtime entirely and use Spark + HMS, or Iceberg / Delta on Trino.

## Data Model
- **Database (schema)** — namespace.
- **Table** — a schema applied to files in a directory (HDFS or S3). Two flavors:
  - **Managed table** — Hive owns the data; `DROP TABLE` deletes files.
  - **External table** — Hive only owns the schema; `DROP TABLE` leaves files alone (the standard for data lakes).
- **Partitioning** — directory-based partitioning (e.g. `s3://bucket/events/dt=2026-04-01/region=us`). Partition pruning is the #1 perf trick.
- **Bucketing** — hash partitioning into a fixed number of files for join optimization.
- **File formats:** Parquet (columnar, common), ORC (columnar, native to Hive), Avro (row), JSON, CSV.

```sql
CREATE EXTERNAL TABLE events (
    user_id   BIGINT,
    event     STRING,
    payload   STRING
)
PARTITIONED BY (dt STRING, region STRING)
STORED AS PARQUET
LOCATION 's3://my-data-lake/events/';

ALTER TABLE events ADD PARTITION (dt='2026-04-01', region='us')
LOCATION 's3://my-data-lake/events/dt=2026-04-01/region=us';
```

```sql
SELECT region, COUNT(*) AS n
FROM events
WHERE dt BETWEEN '2026-04-01' AND '2026-04-30'
  AND region IN ('us', 'eu')
GROUP BY region;
```

## Architecture & Internals
- **HiveServer2** — accepts JDBC/ODBC/Thrift connections; compiles HiveQL.
- **Hive Metastore (HMS)** — backed by a relational DB (MySQL / Postgres / Derby); holds all metadata.
- **Execution engine** — pluggable: MapReduce (deprecated), **Tez** (DAG, modern Hive default), or **Spark** (Hive-on-Spark).
- **Storage** — HDFS, S3, GCS, ADLS, etc., via the Hadoop file system abstraction.
- **LLAP (Live Long and Process)** — daemons that cache hot data and execute queries in long-running JVMs for faster interactive performance.

```
client → HiveServer2 → compile (Calcite) → Tez DAG → YARN containers
                              ↓
                      Hive Metastore ←→ MySQL/Postgres
```

## Consistency Model
- **Eventually consistent** between writers and readers; reads see the file listing at query start.
- **ACID tables** (transactional tables, ORC + bucketed) added later; multi-statement transactions, INSERT/UPDATE/DELETE/MERGE supported on managed ACID tables.
- **External tables** are append-mostly; updates/deletes via partition rewrites.
- **Modern alternatives**: **Iceberg / Delta / Hudi** layered over Hive Metastore add transactional semantics to the lake.

## Replication
- Hive itself doesn't replicate — replication is the file system's job (HDFS replication factor; S3 multi-AZ).
- **Hive replication tools** exist (`HiveCopy`, vendor tools like Cloudera Replication Manager) for copying tables/partitions cross-cluster.
- **HMS replication** is via DB-level replication of the underlying RDBMS.

## Partitioning / Sharding
- **Directory-level partitions** — pick low-to-medium-cardinality partition keys (date, region) so each partition is hundreds of MB to many GB.
- **Bucketing** within partitions for sort-merge bucket joins.
- **Avoid over-partitioning** — millions of tiny partitions destroy the metastore and trigger long planning times.

**Hot-partition pitfall:** monotonic write paths (always writing today's date) make today's partition the hot one. That's usually fine because reads are usually time-bounded.

## Scale
- **Petabytes** in HDFS / S3 are normal.
- **Hundreds of thousands of partitions** are workable; millions become painful.
- **Query latency** ranges from minutes to hours depending on engine (MR slow → Tez faster → LLAP interactive).
- **HMS** scales by being a regular RDBMS; sharding the metastore is an org-level concern.

## Performance Characteristics
- **Hive on MapReduce:** slow (legacy).
- **Hive on Tez:** much faster, DAG-based, generally the default.
- **Hive LLAP:** sub-second to seconds for many BI queries with caching.
- **Bottlenecks:** small files (millions of 1MB files = planner death), too many partitions, missing predicate pushdown, file format choice (use Parquet/ORC, not CSV).

## Trade-offs

| Strength | Weakness |
|---|---|
| Standard SQL over HDFS / S3 / object store | Slow vs modern engines (Trino, Spark SQL, Snowflake) |
| Hive Metastore is the de-facto catalog | Many tools have moved away from Hive runtime |
| External tables make data lake schemas explicit | Schema-on-read pitfalls (silent type coercion, malformed files) |
| ACID tables (managed, ORC) for updates | ACID is bucketed-only and clunky vs Iceberg/Delta |
| Pluggable engines (MR/Tez/Spark) | Operational complexity (HiveServer2 + HMS + YARN + …) |
| Mature ecosystem (UDFs, partitions, file formats) | Best replaced for new workloads |

## Common HLD Patterns
- **Data lake catalog:** HMS as the table-of-truth; Spark, Trino, Flink, Druid, Snowflake all read schemas from HMS.
- **Batch ETL:** Hive jobs scheduled by Airflow / Oozie to roll up event data into daily/hourly aggregates in another partitioned Hive table.
- **Lakehouse migration:** still using HMS, but layering Iceberg / Delta tables over the same metastore for ACID + time travel.
- **Hybrid query:** ingest raw → S3/Parquet → external Hive table → Trino / Spark for interactive; Hive for nightly batch ETL.
- **Federated:** Trino / Presto over HMS to query multiple data sources via the catalog.

## Common Pitfalls / Gotchas
- **Small files problem** — millions of tiny files = HMS overload + planning latency. Compact regularly.
- **Over-partitioning** — every dimension as a partition key explodes metastore size; partition only by columns used in nearly every WHERE clause.
- **Schema evolution surprises** — adding a column at the end is usually safe; reordering, type changes are not.
- **Default DB Derby** — single-user; always use MySQL/Postgres for HMS in production.
- **CSV / JSON in production** — use Parquet/ORC; columnar formats are 10× faster.
- **Hive ACID gotchas** — bucketed-only, slow updates, requires compaction; Iceberg / Delta / Hudi solve this better today.
- **Statistics matter** — run `ANALYZE TABLE ... COMPUTE STATISTICS` for better plans.

## Interview Cheat Sheet
- **Tagline:** Original SQL-on-Hadoop engine; today mostly relevant as the Hive Metastore catalog.
- **Best at:** legacy batch ETL on HDFS/S3, schema catalog for data lakes.
- **Worst at:** interactive queries, real-time, OLTP, new greenfield projects.
- **Scale:** petabytes; hundreds of thousands of partitions before HMS pain.
- **Shard by:** directory partitions (date, region); bucketing for joins.
- **Consistency:** schema-on-read; ACID on managed bucketed ORC tables.
- **Replicates how:** at the file system layer (HDFS replication / S3); Hive replication tools for cross-cluster.
- **Killer alternative:** Trino / Presto / Spark SQL (over HMS), Iceberg / Delta / Hudi (modern lakehouse), Snowflake / BigQuery / Redshift (managed warehouses).

## Further Reading
- Official docs: <https://hive.apache.org/>
- Hive Metastore: <https://cwiki.apache.org/confluence/display/Hive/AdminManual+Metastore+Administration>
- File formats compared: <https://www.databricks.com/blog/2017/05/31/top-5-reasons-for-choosing-s3-over-hdfs.html>
- Iceberg vs Hive ACID: <https://iceberg.apache.org/docs/latest/migrating-from-hive/>
