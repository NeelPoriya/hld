---
title: "Amazon SQS"
description: "Amazon SQS is a fully-managed message queue from AWS. Two flavors — Standard (high throughput, at-least-once, best-effort order) and FIFO (exactly-once, strict order). Zero ops, infinite scale."
---

> Category: Managed Message Queue · Provider: AWS · License: Proprietary (managed service)

## TL;DR
Amazon SQS (Simple Queue Service) is **AWS's managed message queue** — the cloud answer to "I just need a reliable queue and I don't want to run a broker." Two flavors: **Standard queues** (effectively unlimited throughput, at-least-once, best-effort ordering) and **FIFO queues** (exactly-once processing, strict ordering, capped throughput). It pairs naturally with Lambda, ECS, and other AWS compute. Reach for SQS when you want **zero-ops asynchronous decoupling** between AWS services. Reach for Kafka / Kinesis when you need a replayable log; reach for SNS when you need pub/sub fanout to many subscribers.

## What problem does it solve?
You have AWS-hosted services that need to decouple producers from consumers:
- API receives a request, queues a job, returns 202; worker fleet processes async.
- Spike absorption — burst of requests buffered until backend catches up.
- Service-to-service communication without tight coupling.
- Reliable delivery with retries + dead-letter for poison messages.

You don't want to run RabbitMQ or Kafka, manage HA, scale brokers, or page on-call when ZooKeeper dies. SQS makes that operational concern disappear.

## When to use
- **Async decoupling** between AWS services (typical: API → SQS → Lambda / ECS / EC2 workers).
- **Spike absorption** — buffer in front of a slower backend.
- **Fanout via SNS → SQS** — SNS topic with multiple SQS queue subscribers (each subscriber gets its own copy).
- **Cross-service event delivery** with at-least-once semantics.
- **You already live in AWS** — IAM-based auth, SDKs everywhere, tight Lambda integration.

## When NOT to use
- **Replayable event log** — SQS deletes messages after ack; not a log. Use Kinesis or Kafka.
- **Stream processing** — no offsets, no replay; SQS isn't the right primitive.
- **Strict-order, high-throughput streaming** — FIFO is ordered but capped at ~3000 msgs/sec per group.
- **Cross-cloud / portable** — vendor lock-in to AWS.
- **You need rich routing logic** — SQS is dumb queues; routing belongs in SNS or your code.

## Data Model
- **Queue** — a named queue with attributes (visibility timeout, retention period, DLQ).
- **Message** — body (up to 256 KB; larger with S3 + Extended Client Library), with optional attributes.
- **Message group ID** (FIFO only) — messages with the same group ID are strictly ordered.
- **Deduplication ID** (FIFO only) — token used to deduplicate within a 5-minute window.

```python
import boto3
sqs = boto3.client('sqs')

# Send
sqs.send_message(
    QueueUrl='https://sqs.us-east-1.amazonaws.com/.../OrdersQueue',
    MessageBody='{"orderId": 123, "amount": 49.99}'
)

# Receive (long-poll)
resp = sqs.receive_message(
    QueueUrl='...', MaxNumberOfMessages=10, WaitTimeSeconds=20
)
for msg in resp.get('Messages', []):
    process(msg['Body'])
    sqs.delete_message(QueueUrl='...', ReceiptHandle=msg['ReceiptHandle'])
```

**Visibility timeout** — when a consumer receives a message, it becomes invisible to other consumers for the visibility timeout. The consumer must `DeleteMessage` before the timeout, else the message reappears and gets redelivered.

## Architecture & Internals
- **Multi-AZ replicated** by default — SQS stores messages durably across multiple AZs in a region.
- **Standard queues** use distributed hash-based storage; massive horizontal scale; messages can be delivered out of order or more than once.
- **FIFO queues** are partitioned by `MessageGroupId`; each group has strict ordering and exactly-once processing.
- AWS handles all infra — no servers, no clusters, no scaling decisions.

## Consistency Model
- **Standard queues** — **at-least-once delivery**, best-effort ordering. Duplicates and reorders are possible (rare but possible).
- **FIFO queues** — **exactly-once processing** within the dedup window (5 minutes), strict per-group order.
- **Visibility timeout** is the at-least-once retry mechanism; if a consumer crashes before deleting, the message reappears.

## Replication
- **Within a region** — SQS replicates to multiple AZs automatically. No user action.
- **Cross-region** — not built-in. Use cross-region SNS fanout, EventBridge, or app-layer replication.
- **Durability** is AWS's problem; advertised as "very high" (no specific SLA on durability beyond region availability).

## Partitioning / Sharding
- **Standard queues** scale horizontally — there is no per-queue throughput limit advertised; AWS auto-shards behind the scenes.
- **FIFO queues** are partitioned by `MessageGroupId` (hash). Each group is one logical shard.
- **High-throughput FIFO** (newer feature) supports up to 30,000 msgs/sec per queue with per-group throughput; classic FIFO is ~3,000 msgs/sec per queue.

**Hot-group pitfall:** in FIFO, if all messages share one MessageGroupId, you cap at ~3k/sec for that group. Spread across many groups for parallelism.

## Scale
- **Standard queues:** effectively unlimited throughput. Customers do millions of msgs/sec.
- **FIFO classic:** 300 msgs/sec per API; 3,000 msgs/sec per queue with batching.
- **FIFO high-throughput mode:** 30,000+ msgs/sec per queue.
- **Retention:** 1 minute to 14 days (default 4 days).
- **Message size:** 256 KB max body; larger via S3 + Extended Client.

## Performance Characteristics
- **Latency:** typically tens of ms for send/receive in same region.
- **Throughput:** Standard scales horizontally automatically; FIFO has documented per-queue / per-group limits.
- **Long polling** (`WaitTimeSeconds`) reduces empty receives and cost.
- **Bottlenecks:** API request rate per IAM principal (auto-throttled by AWS), per-message body size.

## Trade-offs

| Strength | Weakness |
|---|---|
| Fully managed — zero ops | AWS-only; vendor lock-in |
| Effectively unlimited Standard throughput | No replay (not a log) |
| Pay-per-request — cheap at low volume | Per-request cost adds up at very high volume |
| Tight integration (Lambda triggers, IAM, SNS, EventBridge) | FIFO has throughput caps |
| Multi-AZ durable by default | Cross-region replication is your problem |
| 14-day max retention | Not for long-term event log storage |

## Common HLD Patterns
- **API → SQS → Lambda / worker fleet:** classic async decoupling.
- **Fanout: SNS → SQS:** publish to SNS topic, multiple SQS queues subscribe → each consumer group gets its own queue.
- **Dead-letter queue (DLQ):** messages that fail processing N times are routed to a DLQ for manual inspection / replay.
- **Job retry with exponential back-off:** consumer's visibility timeout + redrive policy.
- **Cross-account event delivery:** queue ACL allows SendMessage from another AWS account; producer uses cross-account assume-role.
- **Smoothing burst traffic:** API directly enqueues; backend processes at sustainable rate.

## Common Pitfalls / Gotchas
- **Visibility timeout too short** → messages get re-delivered while still being processed (duplicates, double work).
- **Forgetting to handle duplicates** in Standard queues — design idempotent consumers.
- **FIFO MessageGroupId all-the-same** → no parallelism.
- **Long polling not enabled** (`WaitTimeSeconds = 0`) → wastes API calls and costs more.
- **Hidden cost of empty receives** — at high QPS with short polling.
- **DLQ misconfiguration** — wrong `maxReceiveCount` floods DLQ or buries failures forever.
- **Message size > 256KB** — use S3 extended client or split.
- **Cross-region disaster recovery is your responsibility** — SQS is regional only.

## Interview Cheat Sheet
- **Tagline:** Fully-managed AWS queue — Standard (unlimited, at-least-once) or FIFO (ordered, exactly-once).
- **Best at:** AWS-native async decoupling, spike absorption, Lambda triggers.
- **Worst at:** event log replay, multi-region, vendor-portable workloads.
- **Scale:** Standard ~unlimited; FIFO 3k–30k msgs/sec per queue.
- **Shard by:** internal (Standard) or MessageGroupId (FIFO).
- **Consistency:** Standard at-least-once + best-effort order; FIFO exactly-once + strict order.
- **Replicates how:** multi-AZ within a region, automatic.
- **Killer alternative:** Kinesis (streaming/replay), SNS (pub/sub fanout), EventBridge (event router), MSK (managed Kafka), RabbitMQ on EC2.

## Further Reading
- Developer guide: <https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html>
- Standard vs FIFO: <https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-queue-types.html>
- Best practices: <https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-best-practices.html>
