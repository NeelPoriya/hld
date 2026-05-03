---
title: "Kafka Streams"
description: "Kafka Streams is a Java library that turns any JVM service into a stateful stream processor over Kafka topics. No cluster, no scheduler — just a library you embed."
---

> Category: Stream Processing Library · Written in: Java · License: Apache 2.0 (part of Apache Kafka)

## TL;DR
Kafka Streams is a **client library** (not a server, not a cluster) that turns any JVM application into a **stateful stream processor** over Kafka topics. You write a topology — `KStream → filter → join → aggregate → KTable → output topic` — and Kafka Streams handles **partitioning, scaling, state stores (RocksDB), exactly-once semantics, and recovery**. Reach for Kafka Streams when you're already on Kafka and want to write stream-processing **microservices** (deployed as plain JVM apps in Kubernetes / ECS) without running Flink or Spark Streaming clusters. Reach for **Flink** if you need cross-system sources, complex windowing, or non-JVM languages; reach for **ksqlDB** if you want SQL on top of Kafka Streams.

## What problem does it solve?
You have data flowing through Kafka and you want to **process it on the fly**:
- Enrich events with reference data ("join orders with users").
- Compute rolling aggregates ("requests per minute per endpoint").
- Detect patterns ("user did A then B within 5 minutes").
- Materialize a topic into a queryable view (compacted topic → RocksDB → REST API).

Spinning up Flink or Spark Streaming for this is **operationally heavy**. Kafka Streams says: just deploy your JVM app like any other service. Scaling = run more instances. State = local RocksDB + Kafka changelog backup. No cluster, no coordinator, no scheduler.

## When to use
- **Kafka-native stream processing** — your data is already in Kafka and stays there.
- **Microservice-style processors** — one app per use case, deployed in Kubernetes.
- **Stateful operations** — joins, aggregations, windowed counts with embedded RocksDB.
- **Exactly-once semantics** end-to-end (read → process → write within Kafka).
- **JVM team** — Java, Scala, Kotlin all work; built-in Avro / JSON / Protobuf serdes.
- **Interactive queries** — query state stores from the same JVM (e.g. expose REST endpoints over rolling aggregates).

## When NOT to use
- **Non-JVM language** — Kafka Streams is JVM-only. (For Python: Faust, or use Flink Python API.)
- **Complex multi-source joins** (Kafka + Postgres + S3) — Flink handles this better.
- **Sub-second latency at huge scale** — Flink's pipelined model can beat Kafka Streams under heavy state.
- **You don't use Kafka** — Kafka Streams reads/writes only Kafka.
- **Heavy windowed analytics with sessionization at huge scale** — Flink has more sophisticated windowing.

## Data Model
Two core abstractions:
- **KStream** — an unbounded stream of records (each record is independent; semantically a log).
- **KTable** — an unbounded **changelog** view; each key has a "current value" (semantically a database table built from the stream).

```java
StreamsBuilder builder = new StreamsBuilder();

// Stream of orders
KStream<String, Order> orders = builder.stream("orders");

// Table of users (compacted topic)
KTable<String, User> users = builder.table("users");

// Stream-table join
KStream<String, EnrichedOrder> enriched = orders
    .selectKey((k, v) -> v.userId)
    .join(users, (order, user) -> new EnrichedOrder(order, user));

enriched.to("enriched-orders");

// Windowed aggregation
KTable<Windowed<String>, Long> ordersPerMinute = orders
    .groupByKey()
    .windowedBy(TimeWindows.of(Duration.ofMinutes(1)))
    .count();

KafkaStreams app = new KafkaStreams(builder.build(), props);
app.start();
```

## Architecture & Internals
- **Topology** — a DAG of source → processors → sinks.
- **Stream threads** — each instance has N stream threads; each thread processes a subset of partitions.
- **Tasks** — a task is `(subtopology × partition assignment)`. Tasks are assigned to threads.
- **State stores** — local RocksDB instances for KTables / windowed aggregates.
- **Changelog topics** — every state store is **continuously backed up to a compacted Kafka topic**. On restart, RocksDB is rebuilt by replaying the changelog. This is how Kafka Streams achieves fault tolerance without any cluster.
- **Standby replicas** — optional warm copies of state on other instances for faster failover.

```
input topic → consumer → processor → state store ←→ changelog topic
                                       ↓
                                   output topic
```

## Consistency Model
- **At-least-once** by default.
- **Exactly-once semantics (EOS) v2** — when enabled (`processing.guarantee=exactly_once_v2`), Kafka Streams uses Kafka transactions to atomically commit input offsets, output records, and state updates.
- EOS works because it's all within Kafka — input topic, output topic, and state changelog are all Kafka topics, so a single transaction spans them.

## Replication
- **State replication** is via the changelog topic — a Kafka compacted topic, replicated according to broker configuration.
- **Standby replicas** keep warm RocksDB copies on other instances for fast failover.
- **Cross-region** = run another Kafka Streams app in another region reading a mirrored topic.

## Partitioning / Sharding
- **Partitioning is Kafka's responsibility** — each task processes a subset of input topic partitions.
- **Repartitioning** happens automatically when you change keys (`selectKey`, `groupBy`); Kafka Streams writes to an internal repartition topic.
- **Co-partitioning** — for joins, both inputs must have the same number of partitions and same key (Kafka Streams will help if not).

**Hot-key pitfall:** all events for a single hot key go to a single partition → single task → single thread. Same Kafka problem. Mitigate with finer keys or per-key sharding.

## Scale
- **Horizontal scale** — run more instances; tasks rebalance via Kafka's group rebalance protocol.
- **Cooperative incremental rebalancing** (recent versions) avoids stop-the-world rebalances.
- **State size** — bounded by local disk per instance × number of instances.
- **Throughput** — typically 10k–100k records/sec per partition per instance, depending on topology complexity.

## Performance Characteristics
- **Latency:** typically tens to hundreds of ms end-to-end (limited by commit interval).
- **Throughput:** scales with partitions and instances.
- **State store** RocksDB performance is critical; tune block cache, compaction.
- **Bottlenecks:** changelog write throughput for write-heavy state, slow processor logic, hot keys.

## Trade-offs

| Strength | Weakness |
|---|---|
| Library, not a cluster — deploy as plain JVM service | JVM-only |
| State + EOS + recovery handled transparently | Kafka-only sources / sinks |
| RocksDB state stores with changelog backup | Less rich windowing than Flink |
| Co-partitioning makes joins efficient | Hot-key skew kills throughput |
| Interactive queries from the same JVM | Complex topologies become hard to reason about |
| EOS v2 = exactly-once end-to-end within Kafka | EOS adds latency vs at-least-once |

## Common HLD Patterns
- **Enrichment pipeline:** raw events stream → join with KTable of reference data → enriched events topic.
- **Real-time aggregation:** events → groupByKey → windowed count → output topic / interactive REST API.
- **CQRS materialized views:** event stream → KTable → RocksDB → expose query API.
- **Anomaly detection:** stream of metrics → process with embedded ML model → alert topic.
- **Dual-write avoidance via outbox pattern:** Postgres outbox → Debezium → Kafka topic → Kafka Streams transforms / fans out.

## Common Pitfalls / Gotchas
- **Hot keys** crush a single task; design key cardinality carefully.
- **Repartition topics blow up** if you key-change a high-volume stream — they're hidden internal topics that consume disk.
- **State store growth** — bounded by your retention policy; without `cleanup.policy=compact`, changelog topics grow forever.
- **Long rebalances** with non-cooperative protocol; upgrade to incremental cooperative rebalance.
- **Operations confusion** — "is it a server?" No, just a library. But it has a heavy state lifecycle.
- **EOS v2 + custom processors** — make sure your processor doesn't have side effects outside Kafka (those won't be transactional).
- **Reset application** — when you change topology, you may need `kafka-streams-application-reset.sh` to clean state.

## Interview Cheat Sheet
- **Tagline:** JVM library that turns any service into a Kafka-native stateful stream processor; no cluster needed.
- **Best at:** Kafka-only pipelines, microservice-style processors, stateful joins/aggregations with EOS.
- **Worst at:** non-JVM, multi-source pipelines, complex windowing at huge scale.
- **Scale:** horizontal — add instances; tasks rebalance via consumer group protocol.
- **Shard by:** Kafka topic partitions; tasks = (subtopology × partition).
- **Consistency:** at-least-once or exactly-once-v2 (Kafka transactions).
- **Replicates how:** state changelog topics (compacted) replicated by Kafka brokers; standby replicas for fast failover.
- **Killer alternative:** Apache Flink (more flexible, multi-source), Spark Structured Streaming, ksqlDB (SQL on top of Kafka Streams), Faust (Python), Pulsar Functions.

## Further Reading
- Official docs: <https://kafka.apache.org/documentation/streams/>
- Architecture: <https://kafka.apache.org/documentation/streams/architecture>
- Exactly-once semantics: <https://www.confluent.io/blog/exactly-once-semantics-are-possible-heres-how-apache-kafka-does-it/>
- KStream vs KTable: <https://docs.confluent.io/platform/current/streams/concepts.html>
