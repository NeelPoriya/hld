---
title: "Apache Hudi"
description: "Apache Hudi is the streaming-first open table format with record-level upserts, incremental pulls, and indexed writes — built at Uber for low-latency CDC into the data lake."
---

> Category: Open Table Format / Lakehouse · Written in: Java · License: Apache 2.0

## TL;DR
Apache Hudi (Hadoop Upserts Deletes Incrementals) is the **third major open table format** alongside Iceberg and Delta Lake. Born at Uber to solve **near-real-time upserts and incremental pulls** on the data lake — Iceberg/Delta added these later, but Hudi was streaming-first from day one. Reach for Hudi when your primary use case is **CDC ingestion with low latency and frequent record-level updates** to a lake (e.g., mirroring an OLTP database into the lake every minute).

## What problem does it solve?
The original lake pattern was append-only Parquet, which breaks for:
- **Upserts** — record-level updates without rewriting whole partitions.
- **Late-arriving data** — yesterday's events arrive today; we want them in yesterday's partition.
- **Incremental consumption** — downstream wants "give me everything that changed since timestamp X" cheaply.
- **CDC mirrors** — keep a lake table in sync with an OLTP database.

Hudi adds **indexes**, **two storage layouts** (CoW and MoR), and **incremental queries** to solve these.

## When to use
- **CDC into the lake** — Debezium → Kafka → Hudi → analytical lake table.
- **Frequent record-level upserts** — natural primary key, lots of updates.
- **Incremental pulls** — downstream pipelines want "what changed since last run".
- **Streaming with low ingestion latency** (minute-scale) but lake economics.
- **Late-arriving events** that must update old partitions.

## When NOT to use
- **Pure append-only / immutable events** — simpler with Iceberg or Delta.
- **OLTP** — wrong tool.
- **Sub-second OLAP** — wrong tool; ClickHouse / Druid.
- **You're standardized on Databricks** — Delta Lake is the obvious choice there.
- **Multi-vendor lakehouse** — Iceberg has wider engine adoption.

## Data Model
- **Hudi table** with a primary key (record key) and optional precombine field for conflict resolution.
- **Partition path** — Hive-style.
- **Two table types:**
  - **Copy-on-Write (CoW)** — every update rewrites the affected Parquet file. Reads are fast, writes amplify.
  - **Merge-on-Read (MoR)** — writes append delta logs (Avro); reads merge base + log on the fly. Writes are fast, reads do work.
- **Indexes** — Bloom, simple, HBase, bucket, record-level — speed up upsert-key → file lookup.

```sql
-- Spark: write Hudi table
df.write.format("hudi")
  .option("hoodie.table.name", "users")
  .option("hoodie.datasource.write.recordkey.field", "user_id")
  .option("hoodie.datasource.write.precombine.field", "updated_at")
  .option("hoodie.datasource.write.partitionpath.field", "country")
  .option("hoodie.table.type", "MERGE_ON_READ")
  .mode("append")
  .save("s3://bucket/lake/users/")

-- Incremental query: rows changed since last commit
spark.read.format("hudi")
  .option("hoodie.datasource.query.type", "incremental")
  .option("hoodie.datasource.read.begin.instanttime", "20260403000000")
  .load("s3://bucket/lake/users/")
```

## Architecture & Internals
- **Timeline** — `.hoodie/` directory with chronological commit / clean / compaction / rollback files.
- **Commits** — atomic per-table; each writes new base files (CoW) or log files (MoR) plus a timeline action.
- **Compaction** — MoR runs scheduled or inline compaction merging log files into base files.
- **Cleaner** — removes old file slices beyond retention to reclaim storage.
- **Indexes** — record-key → file-id mapping; Bloom (default) is in-file; record-level (newer) is a metadata-table index.
- **Metadata table** — Hudi-internal MoR table caching file listings to skip S3 LIST.

## Consistency Model
- **Serializable per-table** via timeline / optimistic concurrency control.
- **Snapshot isolation** for queries — readers see one consistent timeline instant.
- **Multi-writer support** with OCC and lock providers (Zookeeper, HiveMetastore, DynamoDB, FS-based).

## Replication
- **Storage-layer replication** (S3 CRR, HDFS replication factor).
- **DeltaStreamer** — Hudi's built-in ingestion utility; can mirror Kafka / S3 / DFS sources.
- **HoodieStreamer Multi-Writer** — multiple writers with locking.

## Partitioning / Sharding
- **Hive-style partition path** by columns.
- **Bucket index** — hash-bucket records into N buckets per partition; great for stable upsert keys at scale.

**Hot-partition pitfall:** if your partition key is monotonic (event date), upserts may concentrate on today's partition; the bucket index keeps writes parallel within the partition.

## Scale
- Uber, Robinhood, Bytedance, Walmart, Disney+ run **petabyte-scale** Hudi lakes with thousands of tables.
- Trillions of rows, sub-minute end-to-end latency demonstrated.

## Performance Characteristics
- **Upsert latency** scales with index lookup + file rewrite cost (CoW) or log append (MoR).
- **MoR reads** pay merge cost — ensure compaction is keeping up.
- **Bloom index** is fine for moderate update rates; record-level metadata table is faster for hot keys.
- **Bottlenecks:** index lookup time at scale, compaction lag (MoR), small log files, listing S3 (mitigated by metadata table).

## Trade-offs

| Strength | Weakness |
|---|---|
| Streaming-first; record-level upserts native | Operationally more knobs than Iceberg/Delta |
| Incremental queries built in | MoR adds compaction tuning burden |
| Two table types (CoW vs MoR) for read/write trade-off | Smaller engine ecosystem than Iceberg |
| Built-in DeltaStreamer / Kafka ingest | Documentation density less than Delta on Databricks |
| Bucket index, multiple index strategies | Multi-writer requires lock provider setup |
| Late-arriving record support | Time-travel less mature than Iceberg/Delta |

## Common HLD Patterns
- **CDC into the lake:** MySQL/Postgres → Debezium → Kafka → DeltaStreamer → MoR Hudi table → daily batch pipelines.
- **Incremental ETL:** downstream Spark job reads only commits since last checkpoint via incremental query → 100x cheaper than full table scans.
- **Slowly Changing Dimensions:** upsert-by-key keeps SCD Type 1; Type 2 implemented via custom payload class.
- **GDPR deletes:** Hudi `DELETE` issues record-level delete; cleaner physically removes after retention.
- **Streaming + batch read paths:** real-time consumers query MoR snapshot; analytics jobs read read-optimized view (compacted base files only).

## Common Pitfalls / Gotchas
- **Wrong table type** — pick CoW for read-heavy with infrequent updates, MoR for write-heavy / streaming.
- **Compaction lag (MoR)** — log files pile up, reads get slow; tune `hoodie.compact.inline.max.delta.commits`.
- **Index choice** — Bloom default is fine for small tables but slow at PB scale; bucket or record-level for hot tables.
- **Concurrent writers without lock provider** → corruption; configure ZK / DDB lock provider.
- **Cleaner aggression** — over-aggressive cleaner deletes file slices still needed by long-running queries.
- **Schema evolution** — supported but more constrained than Iceberg's stable column IDs.
- **Small files** — clustering / file-sizing settings need tuning for streaming workloads.

## Interview Cheat Sheet
- **Tagline:** Streaming-first open table format with record-level upserts, indexes, and incremental queries — built at Uber for CDC into the lake.
- **Best at:** CDC mirroring, frequent upserts, late-arriving data, incremental downstream consumption.
- **Worst at:** pure append-only events (Iceberg simpler), Databricks-centric stacks (Delta wins), OLTP, sub-second OLAP.
- **Scale:** PB-class, trillions of rows, sub-minute ingest latency.
- **Shard by:** Hive partitions + bucket index for stable hash-bucketing.
- **Consistency:** serializable per-table, OCC with lock provider for multi-writer.
- **Replicates how:** storage-layer; DeltaStreamer for source replication.
- **Killer alternative:** Apache Iceberg (broader engines, simpler ops), Delta Lake (Databricks-native), Hive ACID (legacy).

## Further Reading
- Official: <https://hudi.apache.org/docs/overview>
- Concepts: <https://hudi.apache.org/docs/concepts>
- DeltaStreamer / HoodieStreamer: <https://hudi.apache.org/docs/hoodie_streaming_ingestion>
- Uber's origin blog: <https://www.uber.com/blog/hoodie/>
