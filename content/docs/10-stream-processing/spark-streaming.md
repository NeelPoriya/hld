---
title: "Spark Structured Streaming"
description: "Spark Structured Streaming is the streaming API on top of Apache Spark — micro-batch (and continuous) processing with the same DataFrame / SQL API as batch jobs."
---

> Category: Stream Processing (Micro-Batch & Continuous) · Written in: Scala (JVM) · License: Apache 2.0

## TL;DR
Spark Structured Streaming is the **streaming engine built into Apache Spark** — same DataFrame / SQL API as batch, just running incrementally as new data arrives. Default execution is **micro-batch** (every N seconds, run a tiny Spark job over the new data); newer **continuous mode** does true event-by-event processing for sub-second latency. Reach for Structured Streaming when your team **already runs Spark for batch** and you want to add streaming with **the same code, same tooling (Databricks, EMR, Glue, Synapse), same skills**. Reach for **Flink** if you need true sub-100ms streaming with rich windowing; reach for **Kafka Streams** if you're Kafka-only and want a library, not a cluster.

## What problem does it solve?
You're already running Spark for nightly ETL. You now want:
- Real-time aggregations on Kafka events.
- Streaming ETL into a Delta / Iceberg lake.
- Streaming joins between events and reference tables.
- Watermarked windowed aggregations on event-time data.

Without Structured Streaming, you'd run another stack (Flink, Kafka Streams). With it, **batch and streaming code are nearly identical** — same DataFrames, same SQL, same Catalyst optimizer.

## When to use
- **Spark / Databricks shops** doing batch + streaming on the same platform.
- **Streaming ETL into a lakehouse** (Delta Lake / Iceberg / Hudi).
- **Latency tolerance of seconds-to-minutes** — micro-batch shines here.
- **Mixed batch + streaming** code reuse — same DataFrame transformations.
- **Wide source/sink ecosystem** — Kafka, Kinesis, Files, Delta, JDBC, …

## When NOT to use
- **Sub-second latency at huge scale** — Flink's pipelined model wins.
- **Complex event processing (CEP)** with intricate patterns — Flink CEP / Kafka Streams more idiomatic.
- **Tiny scale** — overkill if you don't already run Spark.
- **Non-JVM streaming** — PySpark works for streaming but JVM features are richer.
- **Per-event side effects with strict ordering** — micro-batch model can be unintuitive.

## Data Model
- **Input is an unbounded DataFrame** — conceptually, an ever-growing table.
- **Trigger** controls how often the engine runs:
  - **ProcessingTime** (default) — every N seconds.
  - **Once** — run one batch and exit (useful for nightly).
  - **AvailableNow** — process all data currently available, then exit.
  - **Continuous** — true event-at-a-time (lower latency, fewer features).
- **Output mode**:
  - **Append** — new rows only (streaming insert).
  - **Update** — changed rows only.
  - **Complete** — full result table (only for aggregations).

```python
from pyspark.sql.functions import window, col, count

events = (spark.readStream
    .format("kafka")
    .option("kafka.bootstrap.servers", "broker:9092")
    .option("subscribe", "events")
    .load())

parsed = (events
    .selectExpr("CAST(value AS STRING) as json")
    .selectExpr("from_json(json, 'user_id STRING, action STRING, ts TIMESTAMP') as e")
    .select("e.*"))

# Windowed aggregation with watermark on event time
agg = (parsed
    .withWatermark("ts", "10 minutes")
    .groupBy(window("ts", "1 minute"), "action")
    .agg(count("*").alias("n")))

(agg.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", "s3://my-bucket/_checkpoints/agg")
    .toTable("analytics.events_agg"))
```

## Architecture & Internals
- **Driver** plans the query as a logical → physical streaming plan via Catalyst.
- **Each trigger** the driver schedules a Spark job that:
  1. Discovers new data (e.g. new Kafka offsets, new files).
  2. Runs an incremental DataFrame computation over the new data.
  3. Writes output via the sink.
  4. **Checkpoints state + offsets** to a checkpoint location (S3 / HDFS).
- **State store** for stateful operations (aggregations, joins) — RocksDB-backed (recent versions), or in-memory.
- **Continuous mode** runs long-lived tasks per partition for low-latency event-by-event processing.

## Consistency Model
- **Exactly-once semantics** end-to-end **if the sink supports idempotent or transactional writes** (files with checkpoints, Delta, Kafka with idempotent producer).
- **Checkpointing** stores offsets + state at the end of each batch.
- On restart, replays from the last committed offsets — no duplicates with idempotent sinks.

## Replication
- Spark itself doesn't replicate data; replication is the source/sink/storage system's job.
- **Driver HA** in cluster managers (YARN cluster mode, Databricks job cluster) restarts the driver on failure.
- **Cross-region streaming** — typically run independent Spark apps per region with mirrored Kafka topics.

## Partitioning / Sharding
- **Source-driven partitioning** — Kafka partitions, Kinesis shards, file folders.
- **Repartitioning / shuffles** for groupBy, join.
- **State store partitioning** matches the shuffle key for stateful ops.

**Hot-key pitfall:** same as any Spark job — skew in groupBy keys → straggler tasks → batch latency spike. Detect via Spark UI; mitigate with salting + 2-stage aggregation.

## Scale
- **Hundreds of GB/sec** of throughput at very large clusters.
- **State stores** can hold tens of GB per partition, more with RocksDB.
- **Watermarking** controls how much state stays in memory — late-data tolerance vs state size trade-off.

## Performance Characteristics
- **Micro-batch latency:** seconds — typical trigger 1s–60s. Sub-second possible with continuous mode but with feature limits.
- **Throughput:** scales with cluster size; millions of events/sec on big clusters.
- **Bottlenecks:** state store growth, shuffle overhead per micro-batch, slow sinks blocking commit.

## Trade-offs

| Strength | Weakness |
|---|---|
| Same code as batch — DataFrame / SQL | Micro-batch latency floor (~seconds) |
| Tight Delta / Iceberg / Spark ecosystem | Continuous mode has fewer features |
| Catalyst optimizer + Tungsten execution | Heavy compared to Kafka Streams (cluster vs library) |
| Watermarks + windowing for event-time | Stateful ops require careful state management |
| Wide connector ecosystem | Driver as SPOF (without HA) |
| Strong support in Databricks / EMR / Synapse | Less idiomatic for complex CEP than Flink |

## Common HLD Patterns
- **Streaming ETL into lakehouse:** Kafka → Spark → Delta Lake / Iceberg → BI tools (Trino / Spark SQL).
- **Real-time enrichment:** stream of events + slowly-changing dimension table broadcast → enriched output.
- **Windowed aggregation:** events with watermark → 1-minute windows → write to Delta / Kafka.
- **Change-data-capture pipeline:** Debezium → Kafka → Spark Structured Streaming → upsert into Delta `MERGE INTO`.
- **Lambda → Kappa migration:** unify batch + streaming on the same Spark + Delta stack.

## Common Pitfalls / Gotchas
- **Forgetting watermark** on stateful operations → state grows forever.
- **Tiny micro-batches** → too much overhead; tune trigger to balance latency vs throughput.
- **Checkpoint location must be reliable** — S3 / HDFS, not local disk.
- **Source schema evolution** — restart with new schema, may need to delete state.
- **Output mode confusion** — `Complete` mode rewrites the whole result table; only OK for small aggregations.
- **Driver memory leaks** with long-running streams; restart periodically.
- **State store size** — RocksDB state can blow up disk; monitor and tune retention.
- **Slow sink → backpressure** — late-arriving sink slows micro-batch progress; tune `maxOffsetsPerTrigger`.

## Interview Cheat Sheet
- **Tagline:** Spark's streaming engine — micro-batch (default) and continuous mode using DataFrame / SQL API.
- **Best at:** Spark / Databricks shops doing batch + streaming with shared code; lakehouse ETL.
- **Worst at:** sub-second latency, complex CEP, simple Kafka-only microservices.
- **Scale:** hundreds of GB/sec on big clusters; tens of GB state per partition.
- **Shard by:** source partitions; shuffle key for stateful ops.
- **Consistency:** exactly-once with checkpointing + idempotent/transactional sink.
- **Replicates how:** Spark doesn't; relies on storage and source replication.
- **Killer alternative:** Flink (true streaming, lower latency), Kafka Streams (library on Kafka), Beam (portable runners), Materialize (incremental SQL DB).

## Further Reading
- Official docs: <https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html>
- Watermarks & windowing: <https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html#handling-late-data-and-watermarking>
- Delta Live Tables (Databricks): <https://docs.databricks.com/en/delta-live-tables/index.html>
- Spark Structured Streaming vs Flink: <https://www.databricks.com/blog/2018/03/20/low-latency-continuous-processing-mode-in-structured-streaming-in-apache-spark-2-3-0.html>
