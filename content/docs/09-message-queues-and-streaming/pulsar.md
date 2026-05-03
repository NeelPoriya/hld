---
title: "Apache Pulsar"
description: "Apache Pulsar is a unified messaging + streaming platform with a tiered storage architecture (BookKeeper for hot, S3 for cold), native multi-tenancy, and geo-replication built in."
---

> Category: Messaging + Streaming Platform · Written in: Java · License: Apache 2.0

## TL;DR
Apache Pulsar is **Kafka's main rival** as a distributed messaging + streaming platform — but with a fundamentally different architecture. Pulsar **separates compute from storage**: brokers are stateless, **Apache BookKeeper** stores the log durably, and old segments offload to **tiered storage (S3 / GCS)**. It also unifies **queue and stream semantics** in one system (a topic can be consumed in shared/key-shared/exclusive/failover mode), has **native multi-tenancy**, and **geo-replication** out of the box. Reach for Pulsar when you need Kafka-like throughput **plus** infinite retention via cheap object storage, multi-tenant isolation, and built-in cross-region replication. The trade-off vs Kafka is a **more complex deployment** (Pulsar = brokers + BookKeeper + ZooKeeper) and a smaller ecosystem.

## What problem does it solve?
Kafka's tightly-coupled storage-on-broker design has known pain points:
- **Adding a broker = rebalancing partitions**, a heavy operation.
- **Long retention** is expensive — every byte sits on broker disks.
- **Multi-tenancy** is bolted on (per-broker quotas, ACLs, but isolation is weak).
- **Geo-replication** (MirrorMaker / Confluent Replicator) is bolt-on too.

Pulsar redesigns these:
- **Stateless brokers** scale independently of storage; no rebalance dance.
- **Tiered storage** offloads old segments to S3/GCS — practically infinite cheap retention.
- **Tenants → namespaces → topics** with first-class quotas, auth, and policy.
- **Geo-replication** is a built-in topic property.

## When to use
- **High-throughput streaming** with **long retention** (months / years) → tiered storage shines.
- **Multi-tenant SaaS** running event infrastructure for many internal teams or external customers.
- **Active-active cross-region replication** built-in.
- **Mixed workloads** — some topics consumed as streams, others as work queues (shared/key-shared subscriptions).
- **You want stateless brokers** that scale and recover faster than Kafka.

## When NOT to use
- **Kafka ecosystem critical** — Kafka Connect, KSQL, Schema Registry have richer ecosystems (though Pulsar has its own equivalents).
- **You hate operational complexity** — Pulsar = brokers + BookKeeper bookies + ZooKeeper (or RocksDB metadata store in newer versions). It's more components than Kafka.
- **Tiny scale** — for low traffic, Kafka or RabbitMQ is simpler.
- **Existing org uses Kafka** — switching costs are real; consider Confluent Cloud or Redpanda first.

## Data Model
- **Tenant → Namespace → Topic** hierarchy.
- **Persistent vs Non-Persistent** topics — persistent writes go to BookKeeper; non-persistent are in-memory.
- **Partitioned topics** — like Kafka, partitions for parallelism.
- **Subscription modes** (per consumer group):
  - **Exclusive** — one consumer per subscription.
  - **Shared** — round-robin across consumers (queue semantics).
  - **Key_Shared** — same key always to same consumer (Kafka-like ordering).
  - **Failover** — active/standby consumers.

```java
PulsarClient client = PulsarClient.builder()
    .serviceUrl("pulsar://broker:6650").build();

// Producer
Producer<String> producer = client.newProducer(Schema.STRING)
    .topic("public/default/orders").create();
producer.send("order-123");

// Consumer (Key_Shared = like Kafka consumer group)
Consumer<String> consumer = client.newConsumer(Schema.STRING)
    .topic("public/default/orders")
    .subscriptionName("billing")
    .subscriptionType(SubscriptionType.Key_Shared)
    .subscribe();
```

## Architecture & Internals
- **Brokers** are **stateless** — they handle producer/consumer connections, route to BookKeeper, manage subscriptions.
- **BookKeeper bookies** store the actual log data in segments (ledgers).
- **ZooKeeper** (or alternative metadata store) stores topic metadata, namespace policies, and BookKeeper coordination.
- **Tiered storage** — once a ledger is sealed, brokers can offload it to S3 / GCS / Azure Blob; reads transparently fetch from cold storage.
- **Pulsar Functions** — lightweight serverless functions that consume + produce → Pulsar's stream-processing answer to Kafka Streams.

```
producer → [stateless broker] → [BookKeeper] → [tiered offload to S3]
                                                      ↑
consumer ← [stateless broker] ←──────────────────────/
```

## Consistency Model
- **Strong consistency for writes** — a publish ack means the message is durable on a quorum of bookies.
- **Per-message ack** for shared subscriptions; **cumulative ack** for exclusive.
- **Exactly-once semantics** via deduplication + transactions (since Pulsar 2.7).
- **Order guarantees:** per-partition (Exclusive/Failover); per-key within Key_Shared.

## Replication
- **Within a cluster**: BookKeeper replicates ledger entries across `Qw` bookies, requires `Qa` acks before considering a write durable. Configurable.
- **Cross-cluster**: **geo-replication** is a built-in namespace/topic policy. Configure replication clusters → Pulsar replicates messages between them asynchronously (or synchronously via specific config).
- **Active-active** is supported — both clusters can take writes; conflicts resolved by replication metadata.

## Partitioning / Sharding
- **Partitioned topics** — like Kafka, configurable partition count.
- **Routing modes:** `RoundRobinPartition`, `SinglePartition`, `CustomPartition`.
- **Bundles** — namespaces are split into bundles (hash ranges); each bundle is owned by one broker. Rebalancing a bundle is cheap because brokers are stateless.

**Hot-key pitfall:** Key_Shared subscription routes by key hash → if one key is super hot, one consumer becomes the bottleneck. Same as Kafka. Solution: composite keys, or accept the skew.

## Scale of a Pulsar Cluster
- **Millions of topics** per cluster (much higher than Kafka, thanks to lightweight subscription model).
- **Hundreds of MB/s — multi-GB/s** per broker.
- **Practically unlimited retention** with tiered storage.
- **Zero-downtime broker scaling** because brokers are stateless.

## Performance Characteristics
- **Latency:** sub-10ms p99 for typical persistent publishes.
- **Throughput:** 100k–1M msgs/sec per broker.
- **Tiered reads** add latency — first read of cold offloaded data hits S3 (hundreds of ms); cached locally after.
- **Bottlenecks:** BookKeeper write quorum (disk I/O), broker CPU for high subscription counts.

## Trade-offs

| Strength | Weakness |
|---|---|
| Stateless brokers — easy to scale & recover | More moving parts (broker + bookie + ZK) than Kafka |
| Tiered storage to S3 — cheap infinite retention | Smaller community / ecosystem than Kafka |
| Multi-subscription modes (queue + stream in one) | Concept count is higher (tenants, namespaces, bundles, ledgers) |
| Native multi-tenancy with quotas/ACLs | Operational learning curve steeper |
| Built-in geo-replication | Some Kafka tooling has no Pulsar equivalent |
| Pulsar Functions for lightweight stream processing | Functions are less mature than Kafka Streams / Flink |

## Common HLD Patterns
- **Multi-tenant event platform:** internal teams get a tenant; isolation, quotas, retention policies per namespace.
- **Long-retention event log:** tier old data to S3 for replay / audit / analytics; recent data on hot SSD bookies.
- **Active-active multi-region:** geo-replicated namespace; producers in any region; consumers see eventually-consistent merged log.
- **Queue + stream side-by-side:** same topic; one consumer group uses Shared (work queue), another uses Key_Shared (ordered stream).
- **Pulsar + Flink:** Flink reads from Pulsar like Kafka; Pulsar handles infinite retention + multi-tenancy.

## Common Pitfalls / Gotchas
- **Don't underestimate ZK / metadata store** — it's a single point of operational pain.
- **BookKeeper sizing** — under-provision bookies and you'll cap broker write throughput.
- **Tiered offload triggers** — configure `managedLedgerOffloadThresholdInBytes`; otherwise hot disks fill up.
- **Subscription modes confusion** — picking Shared when you needed Key_Shared (or vice-versa) breaks ordering or load.
- **Multi-broker upgrades** — version compatibility matters across broker, bookie, client.
- **Geo-replication isn't sync by default** — RPO is non-zero across regions.
- **Pulsar Functions ≠ Flink** — for serious stream processing, still pair with Flink.

## Interview Cheat Sheet
- **Tagline:** Unified messaging + streaming with stateless brokers, BookKeeper storage, tiered S3, native multi-tenancy and geo-replication.
- **Best at:** long retention via S3, multi-tenant event platform, active-active geo-replication.
- **Worst at:** ecosystem maturity vs Kafka, operational simplicity.
- **Scale of one cluster:** millions of topics, multi-GB/s, infinite retention via tiered storage.
- **Shard by:** partitions + bundles (hash-of-namespace).
- **Consistency:** strong (BookKeeper quorum); exactly-once via dedup + transactions.
- **Replicates how:** BookKeeper quorum within cluster; native async geo-replication across clusters.
- **Killer alternative:** Kafka (bigger ecosystem), Confluent Cloud (managed Kafka), Redpanda (Kafka-compatible, single-binary), Kinesis (managed).

## Further Reading
- Official docs: <https://pulsar.apache.org/docs/>
- Architecture overview: <https://pulsar.apache.org/docs/concepts-architecture-overview/>
- Tiered storage: <https://pulsar.apache.org/docs/tiered-storage-overview/>
- Pulsar vs Kafka: <https://streamnative.io/blog/comparison-pulsar-and-kafka>
