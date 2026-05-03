---
title: "Amazon Kinesis"
description: "Amazon Kinesis is AWS's managed streaming platform — real-time event log with shards, replay, and tight Lambda / Firehose integration. Think 'managed Kafka, AWS-native.'"
---

> Category: Managed Streaming Platform · Provider: AWS · License: Proprietary (managed service)

## TL;DR
Amazon Kinesis is AWS's **managed streaming + ingestion** family. The flagship is **Kinesis Data Streams (KDS)** — a Kafka-shaped distributed log, partitioned by **shards**, with replay, ordered per-shard semantics, and built-in integration with Lambda, Firehose, and Analytics. Three siblings round it out: **Firehose** (no-code delivery to S3 / Redshift / OpenSearch), **Data Analytics** (managed Flink), and **Video Streams** (real-time video). Reach for KDS when you need **AWS-native streaming with zero ops**, single-region, AWS data plane, and Kafka-like replay. Reach for MSK / Confluent if you need full Kafka compatibility, advanced ecosystem, or non-AWS portability.

## What problem does it solve?
You need to ingest and process **real-time event streams** — IoT telemetry, click streams, log data, change streams — with:
- Durable, replayable storage.
- Multiple consumers reading the same data.
- Ordered processing per partition.
- Sub-second latency.
- Zero operational burden.

Self-hosting Kafka means servers, ZooKeeper, ACLs, scaling. Kinesis abstracts all of that as a managed AWS service.

## When to use
- **Real-time ingestion in AWS** — clickstreams, IoT, app metrics, server logs.
- **Replayable log** with multiple independent consumers.
- **Lambda-driven event processing** — Lambda triggers natively from Kinesis shards.
- **Firehose delivery to S3 / Redshift / OpenSearch** with no glue code.
- **Real-time analytics** with Kinesis Data Analytics (managed Flink).
- **Cross-account streaming** with IAM-based access.

## When NOT to use
- **Multi-cloud / portable** — vendor lock-in.
- **You need full Kafka API** — use MSK or Confluent.
- **Long retention beyond 365 days** — Kinesis caps at 365 days; archive to S3 via Firehose.
- **Sub-millisecond latency** — Kinesis is sub-second but not microsecond.
- **Massive scale beyond per-shard limits** — at extreme scale, Kafka clusters may be cheaper.

## Data Model
- **Stream** — top-level log container with N shards.
- **Shard** — unit of capacity; ordered append-only log; ingestion 1 MB/sec or 1,000 records/sec; egress 2 MB/sec.
- **Record** — `{ partitionKey, sequenceNumber, data (≤1 MB) }`.
- **Partition key** is hashed → assigned to a shard. Same key = same shard = ordered.
- **Consumer (classic)** — polls shards, tracked via app-side checkpoints (DynamoDB if using KCL).
- **Enhanced fan-out (EFO)** — push-based per-consumer dedicated 2 MB/sec/shard throughput.

```python
import boto3
client = boto3.client('kinesis')

client.put_record(
    StreamName='clickstream',
    Data=b'{"userId":"u-42","event":"page_view","ts":1714723200}',
    PartitionKey='u-42'  # users with same id go to the same shard → ordered
)
```

Two capacity modes:
- **Provisioned** — you pick shard count; pay per shard-hour.
- **On-Demand** — AWS auto-scales shard capacity (within doubling limits per 24h); pay per-byte.

## Architecture & Internals
- AWS-managed shard servers replicate data across 3 AZs.
- Records persist for **24 hours by default**, configurable up to **365 days**.
- **Producers**: put_record / put_records APIs; KPL (Kinesis Producer Library) batches automatically.
- **Consumers**: classic polling (KCL — Kinesis Client Library — handles checkpointing in DynamoDB) or EFO push.
- **Lambda**: managed pollers invoke your function in batches per shard.

## Consistency Model
- **At-least-once delivery** within a stream.
- **Per-shard ordering** — records with the same partition key arrive in order.
- **No cross-shard ordering** — different keys → different shards → no global order.
- **Idempotency is the consumer's responsibility**; design idempotent processing.

## Replication
- **Within region:** multi-AZ replicated automatically (3 AZs).
- **Cross-region:** not built-in. Patterns:
  - Lambda consumer that re-publishes to a Kinesis stream in another region.
  - **Cross-region replication via MSK / EventBridge / custom replicator**.
- **No active-active** like Pulsar's geo-replication.

## Partitioning / Sharding
- **Sharding by partitionKey hash** — choose keys carefully so traffic spreads evenly.
- **Resharding** = `SplitShard` / `MergeShards` operations to change capacity. Provisioned mode requires you to do this manually; On-Demand handles it.
- **Hot-shard pitfall:** if one partition key gets disproportionate traffic, that shard maxes out at 1 MB/sec ingest. Solution: composite keys (`userId#randomSuffix`) when strict ordering isn't required, or accept the skew.

## Scale
- **Per shard:** 1 MB/sec or 1,000 records/sec write; 2 MB/sec read (or 2 MB/sec/consumer with EFO).
- **Streams scale linearly with shards** — thousands of shards is normal at scale.
- **On-Demand mode** auto-doubles up to 200 MB/sec; further increases require AWS support.
- **Retention:** 24h default, up to 365 days.

## Performance Characteristics
- **Producer latency:** ~tens of ms for `PutRecord`; hundreds of µs with KPL aggregation.
- **End-to-end latency** (producer → consumer): typically sub-second.
- **EFO** halves consumer latency vs polling.
- **Bottlenecks:** per-shard ingress / egress limits; resharding cost; cross-region replication is bolt-on.

## Trade-offs

| Strength | Weakness |
|---|---|
| Fully managed AWS service — no ops | AWS-only |
| Lambda + Firehose + Analytics integration | Per-shard limits force resharding for scale |
| Replayable log with up to 365-day retention | No native cross-region replication |
| On-Demand mode auto-scales | Less mature ecosystem than Kafka |
| Multi-AZ replicated by default | Not Kafka API compatible — KCL/KPL or AWS SDK |
| Cheap at moderate scale | At very high scale, MSK or self-managed Kafka may be cheaper |

## Common HLD Patterns
- **Click-stream pipeline:** SDK → Kinesis → Lambda enrichment → Firehose → S3 → Athena / Redshift.
- **Real-time analytics:** Kinesis → Kinesis Data Analytics (Flink SQL) → DynamoDB / OpenSearch dashboards.
- **IoT telemetry:** devices → Kinesis (or IoT Core → Kinesis) → multiple consumers (real-time alerting, archive, ML).
- **Change-data capture:** DynamoDB Streams or DMS → Kinesis → downstream consumers.
- **Fanout to multiple workloads:** one stream + multiple EFO consumers (one for hot path, one for batch ETL).

## Common Pitfalls / Gotchas
- **Hot partition key** → throttled shard. Spread keys; monitor `IncomingBytes`/`WriteProvisionedThroughputExceeded`.
- **Polling vs EFO** — polling shares 2 MB/sec/shard across all consumers; EFO gives each its own 2 MB/sec.
- **KCL on DynamoDB** — KCL stores checkpoint state in DynamoDB; the table needs enough provisioned capacity or you bottleneck there.
- **Resharding is not free** — splits/merges produce parent shards in `CLOSED` state for retention period; consumers need to drain.
- **Lambda batch size + retries** — if the function fails, the entire batch retries; design idempotent handlers and use bisect-on-error.
- **Record size limit** (1 MB) — large payloads → S3 + reference.
- **Cost at high QPS** — per-shard hour + put-payload-unit charges add up; benchmark carefully.

## Interview Cheat Sheet
- **Tagline:** AWS-managed Kafka-shaped streaming platform — shards, replay, native AWS integrations.
- **Best at:** AWS-native real-time pipelines, Lambda-triggered processing, Firehose ingestion to S3/Redshift.
- **Worst at:** non-AWS portability, full Kafka compatibility, multi-region active-active.
- **Scale:** 1 MB/sec or 1k records/sec per shard; thousands of shards; 365-day retention.
- **Shard by:** partition key hash; resharding via Split/Merge or On-Demand mode.
- **Consistency:** at-least-once, per-shard ordering.
- **Replicates how:** multi-AZ within region; cross-region is BYO.
- **Killer alternative:** MSK (managed Kafka), Kafka self-hosted, Pulsar, EventBridge (event router), SQS (queue, not stream).

## Further Reading
- Developer guide: <https://docs.aws.amazon.com/streams/latest/dev/introduction.html>
- KCL & KPL: <https://docs.aws.amazon.com/streams/latest/dev/developing-consumers-with-kcl.html>
- Kinesis vs SQS vs MSK: <https://aws.amazon.com/messaging/>
- Best practices: <https://docs.aws.amazon.com/streams/latest/dev/kinesis-record-processor-scaling.html>
