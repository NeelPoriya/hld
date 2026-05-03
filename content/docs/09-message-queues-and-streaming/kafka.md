---
title: "Apache Kafka"
description: "Kafka is a distributed, durable, append-only commit log that can be read by many consumers, at their own pace, with replay. It became the backbone of event-driven architectures — connecting microservices, powering rea..."
---

> Category: Distributed Event Streaming Platform / Durable Log · Written in: Java + Scala · License: Apache 2.0

## TL;DR
Kafka is a **distributed, durable, append-only commit log** that can be read by many consumers, at their own pace, with replay. It became the **backbone of event-driven architectures** — connecting microservices, powering real-time analytics, and acting as the central nervous system for data flowing between systems. If two services need to talk asynchronously at scale, Kafka is the default answer.

## What problem does it solve?
Imagine N producer services and M consumer services. Without Kafka, you wire N×M point-to-point integrations, each with its own retry / buffering / DLQ logic. With Kafka:
- Producers append events to **topics** (named logs).
- Consumers read at their own pace, can **rewind**, can **replay**.
- Kafka durably stores events for days/weeks, decoupling producers from consumers in time.

Originally built at LinkedIn (2011) to handle 1+ trillion messages/day.

## When to use
- **Async messaging between microservices** (event-driven architectures).
- **Real-time data pipelines / ETL** — ingest from many sources, fan out to many sinks.
- **Stream processing** input (Flink, Spark Streaming, Kafka Streams).
- **Change Data Capture (CDC)** — Debezium reads DB WAL, publishes row changes to Kafka.
- **Log aggregation / observability ingestion.**
- **Event sourcing** — store every state change as an immutable event.
- **Audit trails / compliance** — append-only, durable, replayable.
- **Telemetry / metrics ingestion** at scale.

## When NOT to use
- **Tiny scale / low message rate** — Kafka is operationally heavy. Use SQS / RabbitMQ if you have a few thousand messages/day.
- **Per-message routing / complex topologies** — RabbitMQ's exchange/binding model is more flexible.
- **Strict per-message ack with redelivery semantics** — possible in Kafka but RabbitMQ feels more natural here.
- **Request/reply RPC** — Kafka is *one-way*; use gRPC/HTTP for synchronous calls.
- **Long-term archival** as your only store — supported (with tiered storage), but a data lake (S3) is usually cheaper.

## Data Model
- **Cluster** of **brokers** (servers).
- **Topic** = a named, partitioned, append-only log of records.
- **Partition** = one ordered, immutable sequence of records, stored on one broker (the leader) + replicated.
- **Record** = `(key, value, headers, timestamp)`. Both key and value are byte arrays (often Avro / Protobuf / JSON).
- **Offset** = the record's position within a partition (monotonically increasing). Consumers track their read position by offset.

```
Topic: orders
  Partition 0: [r0, r1, r2, r3, r4, ...]  ← offsets 0..4
  Partition 1: [r0, r1, r2, ...]
  Partition 2: [r0, r1, r2, r3, ...]
```

**Producers** decide which partition a record goes to:
- **Key-based** (default): `hash(key) mod num_partitions` → all events with the same key land on the same partition (and stay in order).
- **Round-robin / sticky**: when no key is set, distribute evenly.
- **Custom partitioner**: write your own.

**Consumers** belong to a **consumer group**:
- Each partition is consumed by **exactly one consumer in a group**.
- Different groups read independently and at their own pace.
- Adding consumers (up to `num_partitions`) parallelizes reads.

```
Topic 'orders' (3 partitions)
   ├── Group "billing"   ── consumer-A reads P0, P1, P2 (or split across multiple consumers)
   └── Group "analytics" ── consumer-B reads independently from start
```

## Architecture & Internals
- **Brokers** form a cluster. Each broker hosts many partitions.
- **Controller** (one elected broker) handles partition leadership and metadata. Originally backed by **ZooKeeper**; modern Kafka uses **KRaft** (Kafka Raft) to embed metadata internally — no more ZooKeeper.
- Each partition has:
  - A **leader** (handles reads + writes).
  - One or more **followers** (replicate the leader).
  - An **in-sync replica (ISR)** set — replicas caught up with the leader.
- Records are stored as **segment files** on disk. Old segments are deleted by **retention** (time- or size-based) or compacted (key-based, latest value wins).
- Reads/writes are mostly **sequential disk I/O** + **page cache** + **zero-copy** networking → makes Kafka cheap and fast despite being on disk.

```
Producer ─► Leader of P0 ─► fsync ─► replicate to followers ─► ack
                              │
                              └─► all caught-up replicas form ISR
```

## Consistency Model
Kafka exposes knobs; the right answer depends on tolerance for loss vs latency.

### Producer side
- **`acks=0`** — fire-and-forget; can lose data.
- **`acks=1`** — leader fsync acks; data lost if leader dies before replication.
- **`acks=all`** (a.k.a. `-1`) — wait for all in-sync replicas. Combined with `min.insync.replicas >= 2` and `replication.factor >= 3`, you get strong durability.
- **Idempotent producer** (`enable.idempotence=true`) — exactly-once *append* (no duplicates from producer retries).
- **Transactions** — atomically write to multiple partitions/topics + advance consumer offsets → the basis for **exactly-once processing** with Kafka Streams / Flink.

### Consumer side
- Offsets are committed back to Kafka (`__consumer_offsets` topic).
- **At-least-once** (default) — process, then commit; possible duplicates on crash.
- **At-most-once** — commit before processing; possible loss.
- **Exactly-once** — combine consumer-transactional-producer pattern OR use Flink/Kafka Streams which handle it.

### Ordering
- **Strict order is per partition only.** No global order across a topic.
- All events with the same key go to the same partition → ordered for that key.

CAP positioning: **CP** for the durable log when configured with `acks=all` + `min.insync.replicas`; trades availability for consistency on partition events.

## Replication
- Each partition has **replication factor (RF)** copies (typical: **3**).
- Leader handles reads/writes; followers fetch from the leader.
- **ISR (In-Sync Replicas)** = replicas not lagging beyond `replica.lag.time.max.ms`.
- On leader failure, controller elects a new leader from ISR (loss-free if `min.insync.replicas` honored).
- **Unclean leader election** (`unclean.leader.election.enable=false` is default and recommended) — never elect an out-of-sync replica, preventing silent data loss.
- **MirrorMaker 2** / **Confluent Replicator** — replicate topics across clusters / regions for DR or geo-distribution.

## Partitioning / Sharding
Partitioning **is** the unit of parallelism in Kafka.

### Picking the number of partitions
- **More partitions → more parallelism** (more consumers can read in parallel).
- **More partitions → more overhead** (file handles, memory, controller load, longer leader-election times).
- Rule of thumb: start with **partition_count = max(throughput / per-partition throughput, expected consumer parallelism)**.
- A modern broker handles thousands of partitions; a cluster routinely runs hundreds of thousands.
- **Adding partitions later is allowed but breaks key→partition mapping** for existing data → consumers may see out-of-order events for a key during the transition. Plan ahead.

### Picking the partition key
- The key controls **co-location and order** for related events.
- For an order-processing system: `order_id` as key → all events for one order are ordered.
- For a per-user feed: `user_id` as key.

### Hot-partition pitfalls
- A single celebrity key (one viral product, one giant tenant) → one partition gets 80% of writes → that broker becomes a bottleneck.
- Mitigations:
  - Sub-shard the hot key (`user_id#shard_0..N`, choose shard randomly per event) at the cost of losing ordering for that key.
  - Add headers / metadata so downstream can rejoin.
- Symptom: lopsided per-partition lag.

## Scale of a Single Instance
> Kafka brokers are surprisingly capable. Scale is more about **partitions and topics** than nodes.

| Dimension | Healthy per broker | Stretch | Notes |
|---|---|---|---|
| Throughput | 100K–1M messages/sec/broker | multi-million with batching, compression | depends heavily on message size |
| Bytes/sec | hundreds of MB/sec | GB/sec on big NICs | limited by NIC + disk seq write |
| Partitions per broker | a few thousand | up to ~10K with KRaft | lots = controller pressure |
| Total partitions per cluster | 100K+ | 1M+ at hyperscale | KRaft scales further than ZK |
| Storage per broker | tens of TB on cheap HDD/SSD | hundreds of TB with tiered storage | retention drives this |
| Producer/consumer count | tens of thousands | — | use stickiness to reduce rebalance noise |

**When to scale out:**
- Per-broker disk fills up faster than retention cleans (add brokers + rebalance).
- Network on a broker saturates.
- Single-partition throughput maxes (~10s of MB/sec) — split key space, increase partitions.
- Controller / metadata load: move to **KRaft** mode if you're still on ZooKeeper.

**Tiered storage** (modern Kafka feature) — old segments offloaded to S3 / object storage; brokers hold only recent data. Storage scales independently of broker count.

## Performance Characteristics
- **Producer latency:** ms to tens of ms with `acks=all`. Sub-ms with `acks=1`.
- **End-to-end latency:** typically tens of ms; can be tuned to single-digit ms for low-latency setups.
- **Throughput:** dominated by sequential I/O + zero-copy + batching. Compression (snappy / lz4 / zstd) often improves throughput because network is the bottleneck.
- **Bottlenecks:**
  - Disk write bandwidth (use SSDs for low-latency, JBOD HDD arrays still common for cheap throughput).
  - Network (use 10/25/40 GbE).
  - GC pauses on huge heaps (keep heap modest).
  - Topic / partition count overhead under ZooKeeper (mitigated by KRaft).

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Massive throughput, durable, replayable log | Operationally heavy (until you accept managed offerings) |
| Decouples producers and consumers in time | Eventually consistent across regions (mirror lag) |
| Strong ecosystem (Connect, Streams, Schema Registry) | Per-message ack / DLQ is DIY (vs RabbitMQ) |
| Exactly-once with idempotent + transactional APIs | Adding partitions reshuffles key→partition |
| Tiered storage decouples compute & storage | Latency is good, not great — not a low-latency RPC bus |
| Cross-region replication via MirrorMaker | Requires careful capacity planning to avoid hot partitions |

## Common HLD Patterns
- **Event-driven microservices.** Service A emits "OrderCreated"; Services B, C, D consume independently.
- **CDC pipeline:** `Postgres → Debezium → Kafka → ElasticSearch + Snowflake + downstream services`.
- **Stream processing:**
  ```
  Kafka → Flink / Kafka Streams → Kafka (enriched topic) → ElasticSearch / DB
  ```
- **Outbox pattern** to atomically commit DB write + emit event:
  - App writes business row + outbox row in one DB transaction.
  - CDC publishes outbox rows to Kafka.
- **Log compaction** — Kafka keeps the *latest* value per key (instead of time-based retention). Used as a durable changelog of state.
- **Saga / event-driven workflow** orchestration via Kafka topics.
- **Real-time analytics** — ingest, process with Flink, sink to OLAP (Druid, ClickHouse, Pinot).

## Common Pitfalls / Gotchas
- **Choosing too few partitions** at the start; later you regret it. Choose a generous count up front.
- **Choosing a bad key** that creates one mega-partition.
- **Consumer rebalances** stalling traffic — use **cooperative rebalancing** (`CooperativeStickyAssignor`).
- **Lag misunderstanding** — high lag isn't bad if throughput is healthy; alert on **lag growth rate**, not absolute lag.
- **`auto.offset.reset` = latest** in disaster recovery → you skip everything. Prefer explicit replay strategies.
- **Treating Kafka as a database** — fine for streams, but for arbitrary point lookups, use a real DB (or Kafka + materialized views via Streams).
- **Ignoring schema management** — Avro / Protobuf with **Schema Registry** prevents downstream breakage.
- **Dropping ZooKeeper entirely** but not migrating to KRaft properly — mixed-mode clusters get tricky.
- **Forgetting tiered storage** when keeping months of data — your local disks fill up, brokers crash.

## Interview Cheat Sheet
- **Tagline:** "Distributed durable append-only log; the spine of event-driven systems."
- **Best at:** high-throughput async pipelines, decoupling services, replayable event logs, streaming inputs.
- **Worst at:** request/reply RPC, complex per-message routing, low-volume / simple queues.
- **Scale of one broker:** ~100K–1M msgs/sec; thousands of partitions; tens of TB on disk (more with tiered storage).
- **Shard by:** topic partitions; partition assigned via `hash(key) mod partitions`. Pick keys that spread evenly.
- **Consistency:** tunable via `acks` + `min.insync.replicas`; ordering only within a partition; idempotent + transactional producers enable exactly-once.
- **Replicates how:** RF copies per partition; leader→followers via fetch; ISR-based failover; cross-region via MirrorMaker.
- **Killer alternatives:** Apache Pulsar (storage/compute separated), AWS Kinesis (managed, AWS-only), Google Pub/Sub, Redpanda (C++ Kafka-compatible, no JVM, no ZK), RabbitMQ (different model — broker-managed queues).

## Further Reading
- Official docs: https://kafka.apache.org/documentation/
- *Kafka: The Definitive Guide* (2nd ed.) — Shapira, Palino, Sivaram, Petty.
- Confluent blog (lots of architecture deep-dives): https://www.confluent.io/blog/
- "Apache Kafka and the Rise of the Streaming Database" — Jay Kreps essays.
- KRaft (no-ZooKeeper) overview: https://developer.confluent.io/learn/kraft/