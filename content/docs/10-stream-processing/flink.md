---
title: "Apache Flink"
description: "Flink is a true streaming engine that processes events one at a time with stateful, exactly-once semantics and event-time correctness. It's the production choice when you need real-time analytics, fraud detection, or ..."
---

> Category: Distributed Stream Processing Engine · Written in: Java + Scala · License: Apache 2.0

## TL;DR
Flink is a **true streaming engine** that processes events **one at a time** with **stateful, exactly-once** semantics and **event-time** correctness. It's the production choice when you need real-time analytics, fraud detection, or alerting on a firehose of events with low latency and strong correctness — not micro-batches like Spark Streaming. If your interview question says "real-time" + "windows" + "joins on streams", Flink is the textbook answer.

## What problem does it solve?
You have an unbounded stream (clicks, payments, sensor readings) and you need to:
- Compute aggregations / joins / patterns **continuously**.
- Get answers **in milliseconds-to-seconds**, not minutes.
- Handle **late-arriving events** correctly.
- Recover from failures **without losing or double-counting**.

Older tools either dropped events on failure (Storm), batched into mini-batches that hurt latency (Spark Streaming), or only worked at small scale (single-node tools). Flink solved this with checkpointed distributed state and event-time semantics inspired by Google's Dataflow paper.

## When to use
- **Real-time fraud / anomaly detection** — score events in milliseconds.
- **Real-time ETL** — clean, enrich, route streams to downstream stores.
- **Stream-stream joins** (e.g. clicks ⨝ impressions within 30 minutes).
- **Sessionization / windowing** — "events grouped by user inactivity gap of 30 minutes".
- **Continuous metrics / dashboards** — counts/aggregations updated live.
- **Complex Event Processing (CEP)** — pattern matching on streams ("login from US then login from RU within 1 minute").
- **Stateful streaming applications** — large amounts of keyed state with millisecond access.

## When NOT to use
- **Pure batch ETL** — Spark/Hive/Trino are more mature for batch SQL.
- **Simple stateless transformations** at modest scale — Kafka Streams / Kafka Connect is lighter weight.
- **One-off ad-hoc queries** — use a SQL warehouse (Snowflake/BigQuery) over a stored copy.
- **Tiny throughput** — operationally heavy for kilobytes/sec workloads.
- **Pure micro-batch is fine** — if minute-level latency is acceptable, Spark Structured Streaming is simpler in many shops.

## Data Model
Flink processes **DataStreams** (unbounded) and **DataSets** (bounded — now unified under DataStream API). Records flow through a **DAG of operators**.

You write jobs in:
- **DataStream API** (Java / Scala) — low-level, flexible.
- **Table API / Flink SQL** — declarative, popular for analytics.

```java
// Pseudo-Flink: count clicks per user per 1-minute tumbling window
DataStream<Click> clicks = env.addSource(new KafkaSource(...));

clicks
  .keyBy(click -> click.userId)
  .window(TumblingEventTimeWindows.of(Time.minutes(1)))
  .aggregate(new CountAggregator())
  .addSink(new ElasticSearchSink(...));
```

### Key concepts
- **Event time** — the timestamp embedded in the event (when it actually happened).
- **Processing time** — when Flink sees the event.
- **Watermark** — Flink's running estimate of "I've seen all events with event time ≤ T". Drives when a window can fire.
- **Window** types:
  - **Tumbling** (fixed, non-overlapping: 1-min buckets).
  - **Sliding** (fixed size, slides every X seconds).
  - **Session** (gap-based: close a session when no events for N minutes).
  - **Global** (manual triggers).
- **Keyed state** — per-key state (`ValueState`, `ListState`, `MapState`) accessible inside operators.
- **Operator state** — per-task state (e.g. Kafka source offsets).

## Architecture & Internals
- **JobManager** (master) — schedules tasks, coordinates checkpoints, handles failures.
- **TaskManagers** (workers) — run user code in **task slots**. Each slot is a parallel instance of an operator.
- A **job** compiles into a **JobGraph** → split into parallel **subtasks** running across TaskManagers.
- **State backend** — where keyed state lives:
  - **HashMap** state backend — in-memory (heap); fast, limited by heap.
  - **RocksDB** state backend — on-disk LSM (default for large state); supports incremental checkpoints.
- **Checkpointing** — periodically snapshot all operator state to durable storage (HDFS / S3). Built on the **Chandy-Lamport** algorithm.
- **Savepoints** — manually triggered, versioned snapshots; used for upgrades and migrations.

```
Sources ──► Operator A ──► Operator B (keyed) ──► Sink
              │              │ state in RocksDB
              └──────────────┴──► async checkpoint to S3 every N seconds
```

## Consistency Model
Flink supports three guarantees, in order of strength:
- **At-most-once** — possible loss; rarely chosen.
- **At-least-once** — never loses; may duplicate.
- **Exactly-once** (default with checkpointing) — within Flink, every event affects state once.

**End-to-end exactly-once** requires **transactional sinks**:
- Kafka transactional producer (two-phase commit).
- Idempotent writes (e.g. upsert by primary key).
- Sinks that support 2PC (JDBC, file sinks with rename, etc.).

**How exactly-once works (the gist):** Flink injects markers ("checkpoint barriers") into the stream. When a barrier reaches an operator, it snapshots its state. When all operators ack, the checkpoint is complete. On failure, Flink rolls back to the last successful checkpoint and replays from sources.

## Replication
Flink itself isn't a storage system — it's a stateful processor.
- **State** is checkpointed to durable storage (S3 / HDFS / GCS) → that's your replication.
- **Job recovery**: on TaskManager failure, JobManager restarts subtasks and restores state from the last checkpoint.
- **HA JobManager** — standbys via ZooKeeper or Kubernetes leader election; automatic failover.
- **Cross-region DR** is via **savepoints + reprocessing** from a replicated source (e.g. mirrored Kafka).

## Partitioning / Sharding
Streaming parallelism is the equivalent of sharding.

- **Parallelism** = number of parallel subtasks per operator.
- **`keyBy(key)`** partitions the stream by key (`hash(key) mod parallelism`) so that all events with the same key go to the same subtask. Same idea as Kafka partitioning, applied to operator state.
- Keyed state is sharded across subtasks the same way.
- **Rescaling** parallelism requires a savepoint → restore at new parallelism (Flink redistributes state automatically).

### Hot-key pitfalls
- A celebrity user_id getting 50% of events → one subtask is overloaded.
- Mitigation: **two-phase aggregation**:
  1. Partition by `(user_id, random_salt_0..N)` → many partial sums.
  2. Re-key by `user_id` → final sum from N partial sums.
- Or: pre-aggregate hot keys at the source / use approximate algorithms.

### Late events / watermarks
A misconfigured watermark causes **dropped events** or **stuck windows**:
- Too aggressive (small allowed lateness) → drops late events silently.
- Too conservative (huge lateness) → windows never fire on time.

Tune per source's actual latency distribution.

## Scale of a Single Instance
> Flink scales **out** by adding TaskManagers (or task slots). One TaskManager hosts many slots.

| Dimension | Per TaskManager | Cluster scale | Notes |
|---|---|---|---|
| Throughput | ~50K–500K events/sec/slot | millions of events/sec | depends on op complexity |
| State per slot | up to **TBs** with RocksDB | tens of TBs cluster-wide | RocksDB on local SSD |
| Parallelism | dozens of slots per TM | thousands across cluster | tune slots ≈ cores |
| Latency | sub-100 ms typical | event-time correctness, ms processing | low-latency mode under 10 ms achievable |
| Checkpoint duration | seconds to minutes | depends on state size | use **incremental** checkpoints with RocksDB |

**When to scale out:**
- CPU on TaskManagers saturates.
- Backpressure builds up (downstream slower than upstream).
- Checkpoints take longer than the checkpoint interval.
- State doesn't fit on local disk anymore.

**Vertical limits to know:**
- RocksDB state backend can hold huge state, but **checkpoint and recovery time grows with state size** — keep it manageable.
- Heap state is RAM-bounded (~tens of GB before GC pain).

## Performance Characteristics
- **Latency:** typically tens to low hundreds of ms; sub-10 ms achievable with careful tuning.
- **Throughput:** millions of events/sec across a cluster; per-slot dominated by event size + serialization.
- **Bottlenecks:**
  - Serialization (use Avro / Protobuf / POJO + Kryo carefully).
  - State access (RocksDB seeks).
  - Network shuffles after `keyBy`.
  - Checkpoint pressure if intervals are too short.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| True per-event streaming, low latency | Steeper learning curve than Spark |
| Exactly-once with transactional sinks | Operationally heavy (cluster, state backend, checkpoints) |
| Rich event-time semantics & windowing | Smaller community vs Spark |
| Stateful w/ TB-scale RocksDB state | Tooling/SQL maturity slightly behind Spark |
| Flink SQL + CEP + ML libs | End-to-end exactly-once needs careful sink choice |
| Battle-tested at hyperscale (Alibaba, Uber, Netflix) | Watermark misconfig is a footgun |

## Common HLD Patterns
- **Real-time fraud detection:**
  ```
  Kafka (transactions) → Flink (windowed aggregates + ML scoring) → Kafka (alerts) → Notification service
  ```
- **Stream enrichment:**
  ```
  Kafka (events) → Flink (keyBy + lookup against reference data via state or async I/O) → Kafka (enriched) → Sink
  ```
- **Sessionization:** group events by user with session windows (gap = 30 min) → write each session to a warehouse.
- **Stream-stream join:** ad clicks ⨝ ad impressions within 30 min → attributed conversions.
- **Continuous ETL** to a lake/warehouse: Kafka → Flink (CDC + transforms) → Iceberg / Delta / Hudi.
- **Real-time materialized views:** maintain aggregates queryable from a key-value store.

## Common Pitfalls / Gotchas
- **Bad watermark strategy** → silent data loss or stuck windows.
- **Hot keys** under `keyBy` → one slot saturates while others idle.
- **Unbounded state growth** — forgot to set state TTL on per-key state. Always plan eviction.
- **Checkpoint storms** — too-frequent checkpoints + slow remote state store → backpressure cascade.
- **Operator chain breakage** — `disableChaining()` accidentally adds shuffles and kills throughput.
- **Network buffer misconfig** — leads to backpressure on slow sinks; instrument it.
- **Mixing event-time and processing-time** semantics inconsistently → confusing results.
- **Using non-idempotent sinks** but expecting end-to-end exactly-once → duplicates appear.
- **Ignoring backpressure metrics** until lag is huge.

## Interview Cheat Sheet
- **Tagline:** "True streaming engine with exactly-once stateful event-time processing."
- **Best at:** real-time analytics, stream joins, complex event processing, low-latency stateful streaming.
- **Worst at:** simple batch jobs, tiny workloads, ad-hoc SQL.
- **Scale per slot:** tens of K to hundreds of K events/sec; TB-scale state via RocksDB; sub-100 ms latency typical.
- **Shard by:** `keyBy(key)` partitions stream + state by hash; rebalance via savepoint + new parallelism.
- **Consistency:** exactly-once *within* Flink via Chandy-Lamport checkpoints; end-to-end requires transactional/idempotent sinks.
- **Replicates how:** state checkpointed to durable storage (S3/HDFS); recovery replays from last checkpoint + source replay (Kafka offsets).
- **Killer alternatives:** Spark Structured Streaming (micro-batch), Kafka Streams (lightweight library), Apache Beam (portable API targeting Flink/Spark/Dataflow), Materialize / RisingWave (streaming SQL DBs).

## Further Reading
- Official docs: https://flink.apache.org/
- *Stream Processing with Apache Flink* — Hueske & Kalavri.
- Google's Dataflow paper (the conceptual foundation): https://research.google/pubs/pub43864/
- Flink Forward conference talks (YouTube).
- Tyler Akidau's "Streaming 101 / 102" essays — gold for event-time semantics.