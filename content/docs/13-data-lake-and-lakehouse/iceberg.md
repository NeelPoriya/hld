---
title: "Apache Iceberg"
description: "Apache Iceberg is the modern open table format for huge analytical data lakes — adds ACID, schema evolution, time travel, and partition evolution to Parquet/ORC files on S3/HDFS."
---

> Category: Open Table Format / Lakehouse · Written in: Java · License: Apache 2.0

## TL;DR
Apache Iceberg is an **open table format** that turns a pile of Parquet (or ORC / Avro) files in S3/HDFS/GCS into a real, **transactional table**. Born at Netflix to fix Hive's pain points (atomic commits, partition evolution, slow file listing), now adopted by Snowflake, BigQuery, Databricks, AWS Athena, Trino, Spark, Flink, and ClickHouse. Reach for Iceberg when you want a **lakehouse architecture** — keep data in cheap object storage in open formats, and let multiple engines (Trino, Spark, Snowflake, Flink) read/write it transactionally without locking in to one vendor.

## What problem does it solve?
**Hive tables** were the original way to expose lake data as SQL tables — but they have serious problems:
- **No ACID** — concurrent writers stomp on each other.
- **Slow file listing** — directory scans on S3 with millions of files are painful.
- **Painful schema evolution** — column rename / type change is risky.
- **Partition evolution is impossible** — once you partition by day, you can't switch to hour without rewriting everything.

Iceberg fixes all of that with **metadata files that explicitly track which files belong to a table snapshot**. No directory listing. Atomic commits via metadata-pointer swaps. Schema and partition spec evolution as cheap metadata operations.

## When to use
- **Lakehouse architecture** — store data in open formats on S3/GCS, query from many engines.
- **Multi-engine read/write** — Trino, Spark, Flink, Snowflake all reading the same tables.
- **Frequent schema changes** — add/rename/drop columns safely.
- **Partition evolution needed** — start partitioning by day, switch to hour later without rewriting.
- **Time travel / audit** — query the table as it looked yesterday or at a specific snapshot.
- **You want vendor neutrality** — open spec, Apache Software Foundation governance.

## When NOT to use
- **OLTP** — Iceberg is for analytics, not transactional workloads.
- **Sub-second OLAP** — query latency depends on engine; ClickHouse / Druid are tuned harder.
- **Tiny scale** — for under a TB, plain Parquet or a managed warehouse is simpler.
- **You're all-in on Delta Lake or Hudi** — they overlap; pick one to avoid churn.
- **Streaming-first writes with sub-second freshness** — possible but Hudi's record-level merge is more idiomatic.

## Data Model
- **Table** — defined by a chain of **metadata files** (`metadata.json`) pointing to **manifest lists** → **manifests** → **data files**.
- **Snapshot** — a specific point-in-time version of the table; commits create new snapshots.
- **Schema** — columns with stable IDs (so renames work without rewriting data).
- **Partition spec** — how data files are partitioned; evolves over time without rewriting old data.
- **Sort order** — clustering hint for writers / readers.

```sql
-- Spark / Trino DDL (catalog-dependent)
CREATE TABLE lake.events (
    event_id   BIGINT,
    user_id    BIGINT,
    event_time TIMESTAMP,
    payload    STRING
)
USING iceberg
PARTITIONED BY (days(event_time));

-- Schema evolution: rename column without rewriting files
ALTER TABLE lake.events RENAME COLUMN payload TO event_payload;

-- Partition evolution: switch to hourly partitioning
ALTER TABLE lake.events SET PARTITION SPEC (hours(event_time));

-- Time travel
SELECT * FROM lake.events FOR VERSION AS OF 1234567890;
SELECT * FROM lake.events FOR TIMESTAMP AS OF '2026-04-01 00:00:00';
```

## Architecture & Internals
- **No "Iceberg server"** — Iceberg is a **specification + libraries**. Engines (Spark/Trino/Flink) embed the library to read/write.
- **Metadata layout** (in object storage):
  ```
  s3://bucket/db/events/
    metadata/
      v1.metadata.json   (table state at v1)
      v2.metadata.json   (table state at v2)
      snap-xxx.avro      (manifest list per snapshot)
      manifest-xxx.avro  (file lists for partitions)
    data/
      part-001.parquet
      part-002.parquet
  ```
- **Catalog** — points "current metadata pointer" at a specific `metadata.json`. Implementations: Hive Metastore, Glue, REST catalog (Tabular, Lakekeeper), Nessie, JDBC, Hadoop catalog.
- **Atomic commits** = catalog atomically updates the pointer from `vN` to `vN+1`. Concurrent writers use optimistic concurrency control.

## Consistency Model
- **Serializable isolation** for commits.
- **Optimistic concurrency** — writers prepare new metadata; commit succeeds if the catalog pointer hasn't moved; otherwise retry.
- **Snapshot isolation** for readers — a query reads a single snapshot, never sees partial writes.
- **Per-table** transactions — multi-table transactions are not native (some catalogs add this).

## Replication
- **Iceberg itself doesn't replicate** — replication is the storage layer's job (S3 cross-region replication, HDFS replication factor).
- **Metadata replicates with the data** — `metadata.json` files live in the same bucket.
- **Cross-region active-active** is uncommon; typically one writer, multiple read replicas in other regions.

## Partitioning / Sharding
- **Partition spec** — defines partitioning function (`days(ts)`, `bucket(16, user_id)`, `truncate(8, name)`).
- **Hidden partitioning** — readers don't write `WHERE date_partition = ...` themselves; Iceberg derives partition pruning from `WHERE event_time >= ...`.
- **Partition evolution** — change the spec; old data keeps old partitions, new data gets new partitions; queries handle both transparently.

**Hot-partition pitfall:** monotonic timestamps without a bucketing function → all writes go to the latest partition → file list grows without bound. Add `bucket(N, user_id)` as a secondary partition for parallelism.

## Scale
- **Petabytes** of data, **trillions** of rows demonstrated at Netflix, Apple, LinkedIn.
- **Millions of files** without the Hive metastore pain because Iceberg never lists directories.
- **Hundreds of concurrent writers** with optimistic concurrency.
- **Snapshot count** can grow large; expire snapshots periodically to keep metadata light.

## Performance Characteristics
- **Planning is metadata-driven** — much faster than Hive on huge tables (no S3 LIST calls).
- **Predicate pushdown** via partition pruning + file-level statistics in manifests (min/max/null counts per column).
- **Bottlenecks:** writing many small files (compact regularly); slow catalog (HMS sometimes); commit conflicts under heavy concurrent writes.

## Trade-offs

| Strength | Weakness |
|---|---|
| ACID + snapshot isolation on cheap object storage | Multi-engine support is uneven (some engines lag the spec) |
| Hidden partitioning + partition evolution | Pick the right catalog — fragmented ecosystem |
| Schema evolution via stable column IDs | Small-files problem still requires compaction jobs |
| Time travel + rollback | Streaming row-level changes require tooling (Flink + Iceberg) |
| Vendor-neutral, open spec | Slower than warehouse-native formats for some workloads |
| Used by Snowflake, BigQuery, Databricks, AWS, Trino | Operational ownership (catalog + maintenance jobs) is yours |

## Common HLD Patterns
- **Open lakehouse:** Spark / Flink writes Iceberg tables on S3; Trino / Snowflake / BigQuery / Athena read them; one source of truth.
- **CDC into the lake:** Debezium → Kafka → Spark Structured Streaming `MERGE INTO` Iceberg.
- **Multi-engine analytics:** Spark for batch ETL, Trino for ad-hoc, Snowflake for BI — all reading the same Iceberg tables.
- **Streaming + batch reconciliation:** Flink writes near-real-time to Iceberg; nightly Spark job compacts + repartitions.
- **GDPR / right-to-erasure:** Iceberg `DELETE FROM table WHERE user_id = ?` writes positional/eq delete files; periodic compaction physically removes the rows.

## Common Pitfalls / Gotchas
- **Small files** — streaming writers create many tiny files; run regular compaction (`OPTIMIZE` / `rewrite_data_files`).
- **Snapshot accumulation** — every commit creates a snapshot; expire old snapshots to keep metadata fast.
- **Catalog choice matters** — Hive metastore, Glue, REST, Nessie, JDBC each have ops trade-offs.
- **Concurrent writer conflicts** — optimistic concurrency means some commits retry; design idempotent writers.
- **Partition spec mistakes** — over-partitioning (high cardinality) creates too many tiny partitions.
- **Query engine version skew** — engine A on Iceberg 1.4 vs engine B on Iceberg 1.5 may misbehave; align versions.
- **V1 vs V2 spec** — V2 supports row-level deletes (delete files); plan for V2.

## Interview Cheat Sheet
- **Tagline:** Open table format that turns a folder of Parquet files into an ACID, time-travelable, multi-engine SQL table.
- **Best at:** lakehouse architecture, multi-engine reads/writes, schema + partition evolution, time travel.
- **Worst at:** OLTP, sub-second OLAP, tiny tables.
- **Scale:** PB-class, trillions of rows, millions of files, hundreds of concurrent writers.
- **Shard by:** partition spec (transforms over columns); hidden partitioning derived from query predicates.
- **Consistency:** serializable per-table commits via catalog atomic pointer swap; snapshot isolation for readers.
- **Replicates how:** doesn't — relies on S3/HDFS for durability and replication.
- **Killer alternative:** Delta Lake (Databricks-flavored, similar features), Apache Hudi (record-level upserts, streaming-first), Hive ACID (legacy).

## Further Reading
- Official docs: <https://iceberg.apache.org/docs/latest/>
- Spec: <https://iceberg.apache.org/spec/>
- Iceberg vs Delta vs Hudi: <https://www.dremio.com/blog/comparison-of-data-lake-table-formats-iceberg-hudi-and-delta-lake/>
- Netflix Iceberg origin: <https://netflixtechblog.com/iceberg-a-modern-table-format-for-big-data-2c2a48bd5050>
