---
title: "Delta Lake"
description: "Delta Lake is Databricks' open table format on top of Parquet — adds ACID, time travel, and streaming reads/writes; conceptually similar to Iceberg with deeper Spark/Databricks integration."
---

> Category: Open Table Format / Lakehouse · Written in: Scala / Java · License: Apache 2.0

## TL;DR
Delta Lake is an **open table format** developed by Databricks that brings ACID, time travel, schema evolution, and streaming MERGE to Parquet files on cloud object storage. It's the **default table format on Databricks** but works in OSS Spark, Trino, Flink, Presto, and (via UniForm) is interoperable with Iceberg. Reach for Delta when you're on Databricks or Spark-heavy and want a battle-tested ACID lake table; reach for Iceberg when you want a more vendor-neutral spec with broader multi-engine support.

## What problem does it solve?
Same problem as Iceberg and Hudi: **plain Parquet files in S3 are not a database**. Delta solves:
- **No atomicity** between concurrent writers.
- **No schema evolution** safety.
- **No time travel** — once you overwrite, the old version is gone.
- **Streaming + batch unification** — same table can be a streaming source and sink.

Delta encodes table state in a **transaction log** (`_delta_log/`) of JSON commit files plus periodic Parquet checkpoints. Each commit is a single atomic `PUT-If-Absent` of a numbered JSON file.

## When to use
- **Databricks-centric** — Delta is the native, best-supported format.
- **Spark-heavy stack** — APIs and optimizations are deepest in Spark.
- **Streaming + batch on same table** — Delta's `readStream` / `writeStream` is first-class.
- **Need MERGE / UPSERT** — Delta's `MERGE INTO` is mature.
- **Time travel + audit** — `VERSION AS OF` and `TIMESTAMP AS OF`.
- **Change Data Feed (CDF)** — emit a stream of inserts/updates/deletes from a table.

## When NOT to use
- **Multi-engine, multi-vendor lake** — Iceberg has wider, more uniform engine support.
- **OLTP / sub-second OLAP** — wrong tool; use a database or ClickHouse.
- **Tiny tables** — overhead isn't justified.
- **You hate Databricks lock-in concerns** — although OSS, the most active development is Databricks-driven.

## Data Model
- **Delta table** = directory of Parquet data files + a `_delta_log/` directory of JSON commits.
- **Transaction log entries** describe `add`, `remove`, `metaData`, `protocol`, `commitInfo` actions.
- **Checkpoint files** — every N commits, a Parquet checkpoint of the full state speeds up reads.
- **Schema** stored in `metaData` action; column changes generate new commits.

```sql
-- Create + insert
CREATE TABLE events (
    event_id   BIGINT,
    user_id    BIGINT,
    event_time TIMESTAMP
)
USING DELTA
LOCATION 's3://bucket/lake/events/';

-- MERGE / UPSERT
MERGE INTO events AS t
USING new_events AS s
  ON t.event_id = s.event_id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;

-- Time travel
SELECT * FROM events VERSION AS OF 42;
SELECT * FROM events TIMESTAMP AS OF '2026-04-01';

-- Optimize: compact small files + Z-order clustering
OPTIMIZE events ZORDER BY (user_id);
```

## Architecture & Internals
- **Transaction log** — `_delta_log/00000000000000000000.json`, `...001.json`, etc. Each commit is one JSON.
- **Atomicity** — log writes use `PutIfAbsent` semantics on storage (S3 conditional write since 2024, otherwise via DynamoDB log store on AWS).
- **Checkpoints** — every 10 commits (configurable), a Parquet checkpoint snapshots full state; avoids replaying the entire log.
- **Liquid clustering** (newer) — replaces partitioning with adaptive clustering on chosen columns.
- **Z-Ordering** — multidimensional locality; helps multi-column predicates.
- **Deletion vectors** — row-level deletes don't rewrite full files; mark-and-sweep instead.

## Consistency Model
- **Serializable** isolation for writes (default).
- **Optimistic concurrency** with conflict detection on `add`/`remove` actions.
- **Snapshot isolation** for readers — readers attach to a specific log version.
- **Single-table transactions only** (no multi-table ACID).

## Replication
- **Storage-layer replication** — S3 cross-region, HDFS replication factor.
- **Delta Sharing** — open protocol for sharing Delta tables across orgs without copying data.
- **CDF streams** can replicate change events to other systems.

## Partitioning / Sharding
- **Hive-style partitioning** by columns (e.g., `PARTITIONED BY (event_date)`).
- **Liquid clustering** (newer) — recommended over partitioning for most cases; auto-balances data.
- **Z-Order** — multidimensional locality for predicate pushdown.

**Hot-partition pitfall:** partition by raw timestamp → today's partition is hot, old partitions are cold. Use date partitioning + clustering on user_id to spread writes.

## Scale
- Powers **exabyte-scale** Databricks lakehouses.
- **Trillions of rows**, billions of files supported.
- Concurrent writers limited mainly by storage `PutIfAbsent` throughput and conflict rate.

## Performance Characteristics
- **Data skipping** via per-file min/max stats.
- **Z-Order / liquid clustering** for multi-dimensional pruning.
- **Photon** (Databricks vectorized C++ engine) reads Delta extremely fast.
- **Bottlenecks:** small files (run `OPTIMIZE`), too-frequent commits, long log without checkpoints, Z-Order on too many columns.

## Trade-offs

| Strength | Weakness |
|---|---|
| ACID + time travel + streaming on Parquet | Most polished on Databricks; OSS Spark is good but not best-in-class |
| MERGE / CDF / Z-Order are mature | Iceberg has broader vendor-neutral engine support |
| Liquid clustering removes partition tuning | UniForm interop with Iceberg is newer |
| Deletion vectors avoid file rewrites | Single-table transactions only |
| Excellent streaming integration | Operational ownership of compaction, vacuum, log management |
| Open protocol via Delta Sharing | Some features land on Databricks first, OSS later |

## Common HLD Patterns
- **Lakehouse on Databricks:** ingest with Auto Loader → bronze (raw) Delta → silver (cleaned) Delta → gold (aggregated) Delta → BI tools.
- **Streaming pipelines:** Kafka → Spark Structured Streaming → Delta with checkpointing for exactly-once.
- **CDC sink:** Debezium → Kafka → MERGE INTO Delta with CDF flowing to downstream systems.
- **GDPR deletes:** `DELETE FROM events WHERE user_id = ?`; deletion vectors mark rows; `VACUUM` cleans up after retention.
- **Time-travel debugging:** roll back accidental bad writes via `RESTORE TABLE events TO VERSION AS OF 41`.

## Common Pitfalls / Gotchas
- **Don't VACUUM with retention < 7 days in production** — concurrent readers / time travel break.
- **Small files** — streaming with `trigger=available` creates lots of small commits; run `OPTIMIZE` regularly.
- **S3 PutIfAbsent prerequisites** — need recent S3 region behavior or DynamoDB log store; pick correct LogStore.
- **Schema enforcement** — by default, Delta rejects schema mismatches; turn on `mergeSchema` carefully.
- **Long log without checkpoints** — slows reads; ensure checkpoints are firing.
- **Delta vs Iceberg** — pick one per table; mixing via UniForm is possible but adds complexity.

## Interview Cheat Sheet
- **Tagline:** ACID + time travel on Parquet via a JSON transaction log; the default lakehouse format on Databricks.
- **Best at:** Spark/Databricks workflows, streaming + batch on the same table, MERGE/CDF, time travel.
- **Worst at:** vendor-neutral multi-engine lakes (Iceberg is better), OLTP, sub-second OLAP.
- **Scale:** EB-class on Databricks, trillions of rows, billions of files.
- **Shard by:** Hive partitions or liquid clustering; Z-Order for multidimensional locality.
- **Consistency:** serializable, optimistic concurrency on log; snapshot isolation for readers.
- **Replicates how:** storage-layer (S3 CRR / HDFS); Delta Sharing for cross-org reads.
- **Killer alternative:** Apache Iceberg (more vendor-neutral), Apache Hudi (record-level streaming).

## Further Reading
- Official: <https://docs.delta.io/latest/index.html>
- Protocol spec: <https://github.com/delta-io/delta/blob/master/PROTOCOL.md>
- Delta Sharing: <https://delta.io/sharing/>
- Lakehouse paper: <https://www.databricks.com/research/lakehouse-a-new-generation-of-open-platforms-that-unify-data-warehousing-and-advanced-analytics>
