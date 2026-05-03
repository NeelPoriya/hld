---
title: "Idempotency"
description: "The single most important property in distributed systems — making operations safe to retry. Idempotency keys, idempotent HTTP methods, idempotent consumers, idempotent receivers, and the patterns to actually implement them."
---

> Topic: Key Concept · Category: Delivery Semantics · Difficulty: Foundational

## TL;DR
An operation is **idempotent** if performing it once produces the same result as performing it N times. **Idempotency is the single most useful property in distributed systems** — it lets you retry safely under any failure (network blip, timeout, broker redelivery, deploy mid-request) without corrupting state. **At-least-once delivery + idempotent consumer ≡ exactly-once-effect.** The classic mechanism is an **idempotency key** — a client-generated unique ID stored server-side; if the same key shows up again, the server returns the cached result instead of repeating the side effect. Stripe's `Idempotency-Key` header is the industry's reference implementation.

## What problem does it solve?
- **Networks fail mid-request** — was the charge made or not? Retry safely if you don't know.
- **At-least-once delivery duplicates messages** — consumer must dedupe.
- **Producer retries** after timeout — should not double-create.
- **Exactly-once is impossible at the network layer** but achievable when the operation itself is idempotent.
- **Disaster recovery / replay** — replaying an event log shouldn't double-apply effects.

## How it works (the patterns)

### 1. Idempotency keys (the canonical pattern)
Client generates a UUID per logical request; sends it as `Idempotency-Key` header. Server stores `(key → response)`. If the same key arrives, return the stored response without re-executing.

```http
POST /charges HTTP/1.1
Host: api.stripe.com
Idempotency-Key: 7f3a2b1e-9c5d-4e8b-9f1d-3a8c4e6b1d2f
Content-Type: application/json

{ "amount": 4999, "currency": "usd", "customer": "cus_123" }
```

Server:
```python
def create_charge(idempotency_key, payload):
    cached = idempotency_store.get(idempotency_key)
    if cached: return cached.response                 # short-circuit

    # Atomic: claim the key BEFORE doing work
    if not idempotency_store.claim(idempotency_key, ttl=24h):
        return idempotency_store.get(idempotency_key).response  # someone else got there

    try:
        result = stripe.charge_card(payload)
        idempotency_store.set(idempotency_key, result)
        return result
    except Exception as e:
        idempotency_store.delete(idempotency_key)     # allow retry
        raise
```

### 2. Idempotent HTTP methods (REST design)
- **GET, HEAD, PUT, DELETE** — idempotent by spec.
- **POST** — not idempotent by default; add `Idempotency-Key`.
- **PATCH** — not idempotent in general (depends on operation; `replace` is, `increment` is not).

### 3. Idempotent message consumers (queue side)
Track processed message IDs in a dedup table:

```python
def handle(message):
    if dedup_table.exists(message.id): return         # already processed
    with db.transaction():
        process(message)
        dedup_table.insert(message.id, ttl=14d)
        ack(message)
```

### 4. Natural idempotency
Some operations are idempotent by design — no key needed:
- `SET key = value` (vs `INCREMENT`).
- `UPDATE users SET email = X WHERE id = Y` (state-based update).
- File upload to a content-addressed store (`hash → bytes`).
- "User has consented to TOS as of date X" — flag, not counter.

### 5. Idempotent commit / transactional outbox
Writing the **side effect** and the **dedup record** in a single DB transaction:

```sql
BEGIN;
INSERT INTO orders   (...) VALUES (...);
INSERT INTO outbox   (event_id, payload) VALUES (...);
INSERT INTO dedup    (idempotency_key, response_id) VALUES (...);
COMMIT;
```

The outbox publisher reads `outbox` and emits to Kafka — at-least-once with idempotency baked in.

## When to use it (real-world examples)
- **Stripe / Adyen / Braintree** — `Idempotency-Key` on every mutating call.
- **Shopify Admin API** — `Idempotency-Key` on order create / mutate.
- **AWS S3 PutObject** — naturally idempotent (same key + same content = same object).
- **Kafka idempotent producer** (`enable.idempotence=true`) — broker dedupes producer retries.
- **Sidekiq / BullMQ jobs** — `jobId` parameter; duplicates are no-ops.
- **Webhook receivers** — Stripe, GitHub, Shopify all send `event.id`; consumer dedupes.
- **Mobile SDKs** retrying network requests — `client_request_id` generated on the device.
- **Database upserts** (`INSERT ... ON CONFLICT DO UPDATE`) — naturally idempotent.
- **Terraform / Pulumi / Kubernetes** — declarative IaC is idempotent by design (`apply` produces the same end state).
- **DNS updates / cert provisioning** — `cert-manager` reconciles to desired state.
- **CDC consumers** — Debezium → Kafka → upsert into target by primary key (idempotent).

## When NOT to use it (or when it's hard)
- **Pure side-effect actions with no natural state** — sending an email twice will email twice; you need idempotency-key + outbox.
- **External APIs without idempotency support** — wrap with your own dedup + retry logic.
- **Counters / increments** — not idempotent; use a unique event log + sum, OR atomic check-and-set with version.
- **Stateful workflows** — long-running flows; use saga + idempotent step IDs, not single-request idempotency.
- **Real-time bidding / latency-sensitive** — dedup overhead may dominate; risk-budget the duplicate.

## Things to consider / Trade-offs
- **Idempotency key TTL** — Stripe holds keys 24 hours; balance memory cost vs replay window.
- **Storage** — Redis with TTL for hot keys + Postgres for durable dedup; or single PG table with index.
- **Race condition on first request** — two retries arrive simultaneously. Use **claim-before-execute** pattern (atomic insert; on conflict, wait or return existing).
- **Errors during execution** — return error AND release the key so client can retry; OR cache the error response (for terminal errors only).
- **Key generation responsibility** — client generates (UUIDv4 / ULID); server only enforces uniqueness.
- **Different request bodies, same key** — should error (Stripe returns 400). Catches client bugs.
- **End-to-end idempotency** crosses services — propagate the key OR generate per-hop keys deterministically from upstream context.
- **Hash-based natural keys** — `hash(payload)` works only if payload uniqueness implies operation uniqueness.
- **Dedup table size** — at high QPS, can balloon; partition + TTL.
- **Test by faking failures** — chaos-engineer mid-request crashes; verify no duplicates.
- **Cleanup vs replay window** — too short and a slow client retry double-applies; too long and storage bloats.

## Implementation recipes

### Recipe A: HTTP API with `Idempotency-Key`
```sql
CREATE TABLE idempotency_keys (
  key            text PRIMARY KEY,
  request_hash   text NOT NULL,
  response_body  jsonb,
  status_code    int,
  created_at     timestamptz DEFAULT now(),
  expires_at     timestamptz NOT NULL
);
CREATE INDEX ON idempotency_keys (expires_at);
```

### Recipe B: Queue consumer dedup
```sql
CREATE TABLE processed_events (
  event_id      text PRIMARY KEY,
  consumer      text NOT NULL,
  processed_at  timestamptz DEFAULT now()
);
```

### Recipe C: Transactional outbox
```sql
-- Emit + dedup in one transaction
BEGIN;
  INSERT INTO orders (id, ...) VALUES ($1, ...);
  INSERT INTO outbox (event_id, type, payload) VALUES ($1, 'OrderCreated', ...);
COMMIT;
```

## Common pitfalls
- **Retrying without an idempotency key** — every retry is a new operation.
- **Storing the key AFTER side effect** — race window between effect and dedup record; retry can re-fire.
- **Using request payload hash as key** — same operation with different payloads (e.g., timestamp inside) bypasses dedup.
- **Idempotency key shared across users** — collision.
- **Dedup TTL shorter than retry window** — late retry slips through.
- **Caching error responses** as idempotent — transient errors should be retryable.
- **Per-server in-memory dedup** — load balancer routes retry to different server; misses dedup.
- **Forgetting concurrent claims** — two replicas of the consumer race; both think they're first.
- **Relying on ORM auto-retry** — without idempotency keys, ORMs can silently double-write.

## Interview Cheat Sheet
- **Definition:** `f(x) == f(f(x))`.
- **Why it matters:** lets you retry safely; turns at-least-once into exactly-once-effect.
- **Mechanism:** client-generated idempotency key; server stores key → response; replay returns cached response.
- **Stripe-style:** `Idempotency-Key` header; 24h TTL; same body required; cached response on replay.
- **Queue consumer:** dedup table on event_id; insert before or in-transaction with side effect.
- **Natural idempotency:** PUT, SET, declarative state, content-addressed storage, upserts.
- **NOT idempotent by default:** POST, INCREMENT, append, send-email — wrap them.
- **End-to-end:** propagate idempotency keys across hops or use transactional outbox.

## Related concepts
- [Delivery Guarantees](/docs/44-delivery-semantics/delivery-guarantees) — companion concept; idempotency makes at-least-once safe.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — saga steps must be idempotent.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — replay relies on idempotent projections.
- [Retry & Backoff](/docs/45-resilience-patterns/retry-and-backoff) — retries are only safe with idempotency.
- Concrete: Stripe API design, AWS SQS message dedup, Kafka idempotent producer, Sidekiq job IDs, BullMQ jobId.
