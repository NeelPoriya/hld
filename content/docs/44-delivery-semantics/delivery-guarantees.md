---
title: "Delivery Guarantees: At-Most-Once, At-Least-Once, Exactly-Once"
description: "What 'exactly-once delivery' really means in distributed systems — and why most systems should aim for at-least-once + idempotency instead. Covers Kafka EOS, RabbitMQ acks, SQS FIFO, and the two-generals problem."
---

> Topic: Key Concept · Category: Delivery Semantics · Difficulty: Foundational

## TL;DR
Three delivery semantics describe how reliably a producer's message reaches a consumer:
- **At-most-once** — fire and forget. Message may be lost; never duplicated. (UDP, fire-and-forget metrics, "best effort" notifications.)
- **At-least-once** — retried until ACKed. Message will arrive; may be duplicated. (Most queues by default: SQS, RabbitMQ, NATS, Kafka without EOS.)
- **Exactly-once** — message arrives and is processed once. **Impossible at the network layer** (two-generals problem); achievable at the **application layer** by combining at-least-once delivery with **idempotent processing** or **transactional consume-process-produce** (Kafka EOS, transactional outbox).

The right answer for 99% of systems is: **at-least-once delivery + idempotent consumers**. "Exactly-once" as a marketing claim usually means "we guarantee idempotent commit if you stay within our system."

## What problem does it solve?
- **Networks fail** — packets get dropped, ACKs get lost, brokers crash.
- **Producers can't tell** if "I never got an ACK" means "consumer didn't get it" or "consumer got it but the ACK was lost."
- **Without choosing a guarantee** you'll get the worst of both — silent loss AND duplicates.
- **Business correctness** — a duplicate order charge is bad; a missed payment notification is bad. Different problems need different guarantees.

## How they work

### At-most-once
Producer sends, doesn't wait for ACK. Or consumer ACKs *before* processing.
- ✅ Fast; no duplicates.
- ❌ Lost messages on any failure.
- **Examples:** UDP metrics (StatsD), fire-and-forget logging, periodic-state push.

### At-least-once (the default)
Producer retries until ACK. Consumer ACKs *after* processing.
- ✅ No loss.
- ❌ Duplicates on failed ACK; consumer sees same message multiple times.
- **Required:** consumer must be **idempotent** (see [Idempotency](/docs/44-delivery-semantics/idempotency)).
- **Examples:** Kafka producer with `acks=all` + retries; RabbitMQ with `manual ack`; AWS SQS standard; NATS JetStream; Stripe webhooks.

### Exactly-once
Two flavors:
- **At the broker level** — broker dedupes producer retries (Kafka idempotent producer with `enable.idempotence=true`); transactional consume-process-produce loops (Kafka EOS).
- **At the consumer level** — consumer processes idempotently with a deduplication key (Stripe `Idempotency-Key`, exactly-once outbox).

**The deep truth:** the "two-generals problem" proves you can't have exactly-once on an unreliable network without an external coordination service. What you CAN have is "exactly-once *processing*" — the message can be delivered N times, but the side effect happens once.

```text
                              Producer crash
                                    |
Producer ----send X----> Broker ----v----> Consumer
        <---ACK lost----              ----ACK--->
        retry: send X---->            (already processed
                                      → dedupe via idempotency key)
```

## When to use each (real-world examples)

### At-most-once
- **Real-time telemetry** (metrics, logs that don't need to be 100% complete).
- **Sensor / IoT readings** when next reading replaces previous.
- **Online game state updates** — old packets are useless.
- **Click-tracking analytics** — losing 0.01% is acceptable.
- **DNS query responses** (UDP).
- **Heartbeats / keep-alives.**

### At-least-once + idempotent consumer (DEFAULT)
- **Order processing** (Stripe, Shopify) — webhook handlers must be idempotent.
- **Email / SMS sending** with idempotency key.
- **Database CDC** (Debezium → Kafka → consumers) — at-least-once + downstream upsert.
- **Job queues** (Sidekiq, BullMQ, Celery) — every job must be idempotent.
- **Notification fanout** (push notifications, mobile alerts).
- **Microservice events** (event-driven architecture).

### Exactly-once (where the platform supports it)
- **Kafka stream processing** — `read_committed` consumer + transactional producer (`isolation.level=read_committed`).
- **Flink exactly-once** — checkpointed state + 2PC sink.
- **Stripe payment intents** — `Idempotency-Key` makes charge creation effectively exactly-once.
- **AWS SQS FIFO + MessageDeduplicationId** — dedupes within a 5-minute window.
- **Bank ledger entries** — must never double-credit; achieved via idempotent commits + DB transactions.

## When NOT to use them

### Don't use at-most-once if:
- **Loss is unacceptable** (payments, audit logs, user-facing state changes).
- **You can't replay the source** later.

### Don't use exactly-once if:
- **Cost / complexity isn't justified** — Kafka EOS adds latency and operational complexity.
- **You can make consumers idempotent** — much simpler to reason about.
- **Cross-system** — Kafka's EOS only works inside Kafka; the moment you write to an external DB / API, you need idempotency anyway.

## Things to consider / Trade-offs

- **At-least-once is simpler than exactly-once** — most teams should pick this and design idempotent consumers.
- **Idempotency is the real solution.** "At-least-once + idempotent" ≡ "exactly-once" from the user's perspective.
- **Dedup window** — exact-once at broker level usually has a finite dedup window (Kafka: idempotent producer dedupes within a session; transactional producer dedupes across).
- **Producer retries on timeout** — must be safe (idempotent send) or you'll write duplicates that bypass downstream dedup.
- **Consumer commit ordering** — commit ACK *after* persisting the side effect. Commit before = lost messages; commit after = at-least-once.
- **End-to-end exactly-once** crosses systems → needs idempotent commits everywhere AND/OR transactional outbox pattern.
- **Latency cost** — exactly-once with 2PC adds round trips.
- **Replay cost** — at-least-once consumers must handle replay-from-N-days-ago without breaking.
- **Ordering vs delivery** — separate concerns. Ordered + at-least-once is common (Kafka per partition); ordered + exactly-once is rare.

## Common pitfalls
- **Treating "exactly-once" as a magic checkbox** — read what the broker actually guarantees.
- **Committing offset before processing** — turns at-least-once into at-most-once silently.
- **Producer retries without idempotent producer flag** — duplicates that bypass dedup.
- **Long-running consumer + lease expiry** — broker thinks consumer crashed, redelivers; original consumer also commits → duplicate effects.
- **Using HTTP retry without idempotency keys** — double charges, double signups, double emails.
- **Thinking "FIFO + exactly-once"** is universal — SQS FIFO is per-message-group; throughput is much lower than standard.
- **Fire-and-forget UDP for "important" data** — usually wrong.
- **Idempotency assumed but not implemented** — the consumer increments a counter without checking dedup key.

## Choosing for your system

```text
| Loss acceptable? | Duplication acceptable? | Pick                |
|------------------|-------------------------|---------------------|
| Yes              | Yes                     | At-most-once (UDP)  |
| No               | Yes (with care)         | At-least-once + idempotent |
| No               | No                      | Exactly-once OR     |
|                  |                         | at-least-once + strict idempotency keys |
```

## Interview Cheat Sheet
- **Three semantics:** at-most-once (loss OK), at-least-once (dups OK; idempotent consumer), exactly-once (broker EOS or app idempotency).
- **The "two-generals problem"** proves true exactly-once over unreliable networks is impossible.
- **Default in industry:** at-least-once + idempotent processing.
- **Kafka EOS** = idempotent producer + transactional consume-process-produce, only within Kafka.
- **SQS FIFO** = exactly-once dedup within 5min window + per-group ordering, lower throughput.
- **Stripe / Shopify webhooks** = at-least-once; consumer dedupes via event ID.
- **End-to-end exactly-once** requires idempotent commits in every downstream sink (or transactional outbox).

## Related concepts
- [Idempotency](/docs/44-delivery-semantics/idempotency) — the actual solution to duplication.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — long-running transactions; relies on idempotent steps.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — replay-able event log; needs idempotent projections.
- Concrete systems: [Kafka](/docs/09-message-queues-and-streaming/kafka), [RabbitMQ](/docs/09-message-queues-and-streaming/rabbitmq), [SQS](/docs/09-message-queues-and-streaming/sqs), [Pulsar](/docs/09-message-queues-and-streaming/pulsar), [Sidekiq](/docs/40-job-queues/sidekiq), [BullMQ](/docs/40-job-queues/bullmq).
