---
title: "RabbitMQ"
description: "RabbitMQ is the canonical open-source message broker — flexible routing, multi-protocol (AMQP, MQTT, STOMP), and battle-tested for task queues and inter-service messaging."
---

> Category: Message Broker / Task Queue · Written in: Erlang · License: Mozilla Public License 2.0

## TL;DR
RabbitMQ is a **traditional message broker** (not a log) optimized for **flexible routing of small messages between services**. Producers publish to **exchanges**, which route messages to **queues** based on bindings; consumers pull from queues and ack/nack. It's the default choice for **task queues, RPC patterns, and inter-service messaging where routing logic matters more than throughput**. Reach for RabbitMQ when you need rich routing semantics (topic, headers, fanout), per-message acks, and reasonable scale (10k–100k msgs/sec). Reach for Kafka instead when you need a durable, replayable log with millions of msgs/sec.

## What problem does it solve?
You have multiple services that need to communicate asynchronously, often with **complex routing**:
- Send "order-created" to billing, inventory, and analytics — but only billing for paid orders.
- Distribute background jobs across a pool of workers (image processing, email sending).
- Implement RPC patterns where requests are queued and replies come back asynchronously.
- Buffer bursts of traffic so backend services don't get overwhelmed.

RabbitMQ excels here because of its **flexible routing model**: producers don't talk to queues directly; they talk to exchanges, which can fan out, topic-route, or header-match into many queues.

## When to use
- **Task / job queues** — Celery, Sidekiq-equivalents, background processing.
- **RPC over messaging** — request/reply with `reply_to` queues.
- **Microservice messaging** with rich routing (topic exchanges, headers).
- **Multi-protocol shops** — apps that speak AMQP, MQTT, STOMP, or WebSockets via plugins.
- **Per-message acks needed** — at-least-once guarantees, dead-letter queues for poison messages.
- **Moderate throughput** — up to 100k msgs/sec per node is comfortable.

## When NOT to use
- **Massive event streaming** — Kafka is built for that (millions msgs/sec, replayable log).
- **Stream processing replay** — RabbitMQ deletes messages after ack; not a log.
- **Strict ordering across millions of messages** — single-consumer-per-queue is ordered, but scaling consumers breaks order.
- **Cross-region geo-replication** — Federation/Shovel work but lack Kafka-grade native multi-DC tooling.
- **Pure pub-sub with thousands of subscribers reading the same data** — Kafka's topic-as-log is more efficient.

## Data Model
Four core concepts:
- **Producer** publishes a message with a **routing key** to an **exchange**.
- **Exchange** types decide routing:
  - **Direct** — route to queues bound by exact routing key match.
  - **Topic** — route by routing-key pattern (`order.*.created`, `payment.#`).
  - **Fanout** — broadcast to all bound queues.
  - **Headers** — route by message headers, not routing key.
- **Queue** stores messages until a consumer acks them.
- **Consumer** subscribes to a queue, processes messages, acks (or nacks for redelivery).

```
producer → [exchange] ─ binding ─→ [queue] → consumer
                       └ binding ─→ [queue] → consumer
```

Example (Python `pika`):
```python
channel.exchange_declare(exchange='orders', exchange_type='topic')
channel.queue_declare(queue='billing')
channel.queue_bind(exchange='orders', queue='billing', routing_key='order.*.paid')

channel.basic_publish(
    exchange='orders',
    routing_key='order.usa.paid',
    body='{"orderId": 123, ...}',
    properties=pika.BasicProperties(delivery_mode=2)  # persistent
)
```

## Architecture & Internals
- A **RabbitMQ cluster** is a set of nodes that share metadata (vhosts, exchanges, queues, bindings) via **Erlang's distribution layer**.
- **Classic queues** (legacy) — single-node, optionally mirrored to other nodes.
- **Quorum queues** (modern, Raft-based) — replicated, durable, recommended default since RabbitMQ 3.8.
- **Streams** (RabbitMQ 3.9+) — log-based, Kafka-like queue for high-throughput append-only workloads. A different paradigm bolted onto the same broker.
- **Plugins** add MQTT, STOMP, WebSocket, federation, shovel, management UI.

## Consistency Model
- **Per-message ack/nack** — consumer must ack before broker considers it delivered.
- **Quorum queues** use Raft → strong consistency for queue contents.
- **Classic mirrored queues** (deprecated) had eventual consistency between mirrors.
- **Publisher confirms** give producers an ack from the broker that the message was durably accepted.
- **Transactions** exist (AMQP `tx.*`) but are slow; publisher confirms are the modern standard.

## Replication
- **Quorum queues** replicate via Raft across an odd number of nodes (3 or 5). Tolerates `(N-1)/2` failures.
- **Streams** replicate similarly.
- **Federation plugin** — loose, async replication across clusters/regions (each cluster has its own queue, federation forwards messages).
- **Shovel plugin** — point-to-point message moving between brokers.

## Partitioning / Sharding
- A queue lives on **one cluster** (with replicas across nodes for HA), but **a single queue is not partitioned across nodes** in classic/quorum mode.
- For horizontal scale, use **multiple queues** with consistent-hash exchange or sharding plugin.
- **Streams** can be partitioned (super-streams) for Kafka-like horizontal scale.

**Hot-queue pitfall:** a single hot queue is bound to a single Raft leader; you can't scale that one queue past the leader's throughput. Solution: shard producers across many queues, or use streams.

## Scale of a Single Node
- **10k–100k msgs/sec** per node typical; up to 1M for streams or with persistence disabled.
- **Memory** drives capacity for in-memory queues; classic queues spill to disk under memory pressure (with latency cliff).
- **Per-queue throughput** typically 1k–20k msgs/sec for quorum queues.
- **When to scale out:** when single-node throughput is the limit, shard with consistent hash exchange or move to streams; for huge volumes consider Kafka.

## Performance Characteristics
- **Latency:** sub-ms for in-memory transient messages; few ms for persistent quorum queues.
- **Throughput:** 10k–100k msgs/sec per node persistent; higher transient.
- **Memory pressure:** the broker pages messages to disk when memory > threshold; this can cause throughput cliffs.
- **Bottlenecks:** disk I/O (persistent durable messages), Erlang scheduler under heavy connection counts, queue leader CPU.

## Trade-offs

| Strength | Weakness |
|---|---|
| Rich routing (topic, fanout, headers, direct) | Not a replayable log — once acked, message is gone |
| Per-message acks + dead-letter queues | Throughput ceiling vs Kafka |
| Multi-protocol (AMQP, MQTT, STOMP, WebSocket) | Erlang ops are unfamiliar to many teams |
| Quorum queues = strong consistency via Raft | Single queue = single leader (no per-queue partitioning in classic) |
| Mature, battle-tested, huge ecosystem | Cross-region replication via federation/shovel feels bolted on |
| Streams give Kafka-like option in same broker | Two paradigms (queues vs streams) increases mental load |

## Common HLD Patterns
- **Task queue:** API → publish to exchange → workers consume from queue → process → ack. Add a DLQ for poison messages.
- **RPC over messaging:** producer publishes with `reply_to` queue + `correlation_id`; service responds to that queue.
- **Pub/sub fanout:** fanout exchange → many queues → many independent consumers.
- **Topic routing:** events tagged with hierarchical routing keys (`order.us.created`, `order.eu.cancelled`); subscribers bind to patterns.
- **Buffer / load levelling:** RabbitMQ in front of a slow downstream service to absorb traffic spikes.

## Common Pitfalls / Gotchas
- **Memory paging cliff** — broker pages to disk under memory pressure; tune `vm_memory_high_watermark` and design queues to drain.
- **Unacked-message buildup** — a stuck consumer holds messages "in flight" forever; set `consumer_timeout` and prefetch.
- **Wrong exchange type** — using direct when you need topic, etc. — costly to refactor later.
- **Classic mirrored queues are deprecated** — migrate to quorum queues.
- **Persistent vs transient** — persistent + `delivery_mode=2` only matters if the queue is durable AND publisher confirms are enabled.
- **One queue per consumer-group anti-pattern** — don't model Kafka semantics on RabbitMQ; use streams or Kafka instead.
- **Big messages** (> 1MB) — RabbitMQ doesn't love them; offload payload to S3, send pointer.
- **Federation lag** — federation is async; not a replacement for native replication.

## Interview Cheat Sheet
- **Tagline:** Open-source AMQP message broker — flexible routing, per-message acks, multi-protocol.
- **Best at:** task queues, RPC, microservice messaging with rich routing.
- **Worst at:** millions msgs/sec, replayable streams, geo-replication.
- **Scale of one node:** 10k–100k msgs/sec persistent; per-queue throughput is the bottleneck.
- **Shard by:** multiple queues + consistent-hash exchange; or use streams.
- **Consistency:** strong via Raft (quorum queues); per-message acks.
- **Replicates how:** Raft-based quorum queues across cluster nodes; federation/shovel for cross-cluster.
- **Killer alternative:** Kafka (log + replay), Pulsar (queue + log unified), SQS (managed), NATS (lightweight).

## Further Reading
- Official docs: <https://www.rabbitmq.com/docs>
- Quorum queues: <https://www.rabbitmq.com/docs/quorum-queues>
- Streams overview: <https://www.rabbitmq.com/docs/streams>
- AMQP 0-9-1 model: <https://www.rabbitmq.com/tutorials/amqp-concepts>
