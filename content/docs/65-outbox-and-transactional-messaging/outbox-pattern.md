---
title: "Outbox Pattern & Transactional Messaging"
description: "How to atomically commit a database write AND emit an event without losing or duplicating either — the dual-write problem, transactional outbox, and the inbox pattern for downstream idempotency."
---

> Topic: Key Concept · Category: Outbox & Transactional Messaging · Difficulty: Intermediate

## TL;DR
The **dual-write problem**: when you need to "do X in the database AND publish an event," writing to two systems atomically is impossible — the network can drop either; one can succeed while the other fails. Naive solutions silently lose events or double-emit them.

The **outbox pattern** solves this:
1. In ONE database transaction, write the **state change** AND a row to an **`outbox` table**.
2. A separate **publisher** process reads new outbox rows and publishes them to the message broker.
3. Mark / delete the outbox row after publish.

The companion **inbox pattern** sits at the consumer:
1. Receive event.
2. Check inbox table (deduplication by event_id).
3. If new → apply + insert to inbox in same transaction.

Together they give you **at-least-once delivery + idempotent consumption = exactly-once-effect** without distributed transactions.

## What problem does it solve?

### The dual-write problem
```python
# DON'T DO THIS
def place_order(order):
    db.insert(order)              # ← what if this succeeds...
    kafka.send(OrderPlaced(order))  # ← but this fails?
    # We've inserted the order but never told downstream services.
    
# Or:
def place_order(order):
    kafka.send(OrderPlaced(order))  # ← succeeds
    db.insert(order)                # ← fails
    # Downstream thinks order exists, but it doesn't.
```

Without a coordinated commit, **state and event diverge silently**. This is the root cause of bugs like "we shipped the wrong product" / "customer charged but no order" / "duplicate emails sent."

### Why not 2PC?
[Two-phase commit](/docs/52-consensus-and-coordination/two-phase-commit) over DB + Kafka is technically possible (XA), but:
- Kafka doesn't support XA.
- 2PC blocks on coordinator failure.
- Latency cost.
- Operational complexity.

The outbox pattern gives you the same atomicity guarantee using **only the database's built-in transactions**.

## How the outbox works

```text
   Application
        │
        │ BEGIN TRANSACTION
        │   INSERT order  → orders table
        │   INSERT event  → outbox table  { id, type, payload, created_at }
        │ COMMIT
        │
        │   (atomic: both rows or neither)
        │
   ┌────▼─────────────────────────────────┐
   │   Outbox Publisher (separate process)│
   │   - Polls outbox for unsent rows     │
   │   - or tails CDC stream from outbox  │
   │   - Publishes to Kafka / SNS / etc.  │
   │   - Marks row published / deletes it │
   └────┬─────────────────────────────────┘
        │
        ▼
   Kafka / SNS / RabbitMQ
        │
        ▼
   Downstream consumers
```

### Two implementations

**1. Polling outbox**
- Publisher SELECTs `WHERE published = false ORDER BY id LIMIT N`.
- Sends to broker.
- Marks `published = true` (or DELETE).
- Simple; can lag behind writes.

**2. CDC-based outbox (preferred)**
- Database CDC tool ([Debezium](/docs/27-cdc-and-data-integration/debezium)) tails the WAL / binlog.
- Configures Debezium's "outbox event router" to map outbox rows → broker.
- Lower latency; broker order = WAL order.
- Used by: Stripe, Shopify, many event-driven SaaS.

### Schema example
```sql
CREATE TABLE outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type  text NOT NULL,     -- 'Order'
  aggregate_id    text NOT NULL,     -- 'order_42'
  type            text NOT NULL,     -- 'OrderPlaced'
  payload         jsonb NOT NULL,
  created_at      timestamptz DEFAULT now(),
  published_at    timestamptz       -- nullable; null = unsent
);

CREATE INDEX ON outbox (published_at) WHERE published_at IS NULL;
-- Partial index: only unsent rows, fast scan.
```

## How the inbox works

At the consumer:

```python
def handle(event):
    with db.transaction():
        if db.exists("SELECT 1 FROM inbox WHERE event_id = %s", event.id):
            return  # already processed; no-op
        
        # Apply business logic
        apply_order_placed(event)
        
        # Record in inbox
        db.insert("INSERT INTO inbox (event_id, processed_at) VALUES (%s, now())", event.id)
        
        # Both apply + inbox in same transaction
```

**Inbox + outbox + at-least-once Kafka = effectively-once processing.**

## When to use it (real-world examples)
- **Order placed → notify shipping, billing, analytics** atomically.
- **User signed up → emit `UserRegistered` for welcome email + analytics + onboarding.**
- **Stripe / Shopify** — internal services use outbox extensively.
- **CQRS + Event Sourcing** — outbox is how events get from write model to projection.
- **Microservices migration** ([strangler fig](/docs/58-deployment-and-release/strangler-fig-and-migration)) — emit events from legacy via outbox.
- **Audit logs** — every state change written to audit + outbox simultaneously.
- **Cross-service workflows** — outbox + saga pattern.

## When NOT to use it
- **Single-service / single-database** — you don't have dual-write problem.
- **Fire-and-forget metrics** — eventual consistency or loss is fine.
- **Read-only queries** — no state change to coordinate.
- **You can use [transactions across both stores]** — rare; XA + RDBMS only.

## Things to consider / Trade-offs

### Polling vs CDC
- **Polling:** simple; works without specialized tooling. **Latency = poll interval.**
- **CDC (Debezium):** lower latency, better ordering. **Operational complexity.**
- **At-Postgres scale**, CDC + Debezium is the production-grade answer.

### Outbox table cleanup
- **Tombstoning:** mark `published_at` and let GC remove old rows. Bloat-prone.
- **DELETE on publish:** cleaner; requires the publisher to be sole writer.
- **Partition / TTL** — auto-prune old rows.

### Ordering
- **Per-aggregate ordering** is usually preserved (FIFO from outbox).
- **Cross-aggregate ordering** isn't guaranteed.
- **Kafka partition by `aggregate_id`** preserves per-key order downstream.

### Schema in payload
- **Snapshot the data at the moment** — don't rely on the row to still exist when consumer reads.
- **Versioned event schema** + [schema registry](/docs/62-data-modeling-and-serialization/schema-evolution-and-serialization).

### Idempotency
- **Consumer must dedup** — outbox guarantees at-least-once, not exactly-once.
- **Inbox table or upsert pattern.**
- **`event.id` is the dedup key.**

### Transactionality
- **Same transaction** as the business write — non-negotiable.
- **Separate connection / transaction** = same dual-write problem.
- **Don't transact across services** — this is the whole point.

### Monitoring
- **Outbox lag** — how many unsent rows? Alert if growing.
- **Publish errors** — broker outage, bad payload.
- **Consumer lag** — separate concern.

### Debezium specifics
- **Outbox Event Router SMT** maps outbox rows to Kafka topics.
- **Logical replication slot** retains WAL until consumed; can fill disk.
- **Replication lag** = publish lag.

## Common pitfalls
- **Dual write directly to DB + Kafka without outbox** — silent data loss.
- **Outbox row in different transaction** than business state — same problem as dual write.
- **Forgetting consumer dedup** — at-least-once delivery causes duplicate processing.
- **Cleanup not implemented** — outbox grows unbounded.
- **Replication slot not consumed** (Debezium) — WAL fills, DB stops accepting writes.
- **Outbox + race conditions** in polling — multiple publishers picking same row; use `SELECT ... FOR UPDATE SKIP LOCKED`.
- **Schema mismatch** — payload schema changes; old events fail downstream.
- **Cross-aggregate ordering assumed** — outbox preserves intra-aggregate order only.
- **Inbox table size unbounded** — TTL old entries.
- **Consumer doesn't use idempotency key** despite outbox at-least-once.
- **Outbox + sync-write to broker** — every business write blocks on broker; latency increases.
- **Treating outbox as a queue** — it's a buffer; consume FIFO + delete promptly.
- **Long transactions** holding outbox row + business row → contention.
- **Side effects in publisher** (sending email) — make publisher idempotent or move side effect to consumer.

## Interview Cheat Sheet
- **Dual-write problem:** can't atomically commit to DB + broker.
- **Outbox pattern:** state change + outbox row in ONE transaction; separate publisher emits to broker.
- **Inbox pattern:** consumer dedups via inbox table.
- **Together → effectively-once** without 2PC.
- **CDC (Debezium) outbox** = production-grade implementation.
- **Polling outbox** is simpler but laggier.
- **Per-aggregate ordering preserved**; cross-aggregate is not.
- **Watch for:** outbox bloat, replication slot lag, consumer dedup discipline.
- **Pair with:** [Idempotency](/docs/44-delivery-semantics/idempotency), [CQRS](/docs/47-event-driven-architecture/cqrs), [Saga](/docs/47-event-driven-architecture/saga-pattern).
- **Killer phrase:** "Outbox lets you transactionally commit a state change AND an event to emit, using only the database's transactions — at-least-once delivery + idempotent consumer = effectively exactly-once without 2PC."

## Related concepts
- [Idempotency](/docs/44-delivery-semantics/idempotency) — required at consumer.
- [Delivery Guarantees](/docs/44-delivery-semantics/delivery-guarantees) — outbox is at-least-once.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — outbox is the natural exit pipe.
- [CQRS](/docs/47-event-driven-architecture/cqrs) — outbox feeds projections.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — saga steps emit via outbox.
- Concrete: [Debezium](/docs/27-cdc-and-data-integration/debezium), [Kafka](/docs/09-message-queues-and-streaming/kafka), [PostgreSQL](/docs/01-relational-databases/postgresql).
