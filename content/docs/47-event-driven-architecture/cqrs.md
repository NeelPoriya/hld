---
title: "CQRS (Command Query Responsibility Segregation)"
description: "Separate the write model (commands that mutate state) from the read model (queries that return shapes optimized for views). Often paired with Event Sourcing — but doesn't require it."
---

> Topic: Key Concept · Category: Event-Driven Architecture · Difficulty: Intermediate

## TL;DR
**CQRS** splits a system into **two models**: the **command (write) side** processes state-changing operations against a normalized, transaction-oriented store; the **query (read) side** serves data from one or more **read models / projections** shaped for specific views (de-normalized, pre-joined, indexed for the UI). Read models are kept in sync via events / CDC, often **eventually consistent**. CQRS lets each side scale independently and use different technologies (Postgres for writes, ElasticSearch / Redis for reads). It's commonly paired with [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) but **doesn't require it** — you can have CQRS over plain CRUD via CDC. Most "high-scale read-heavy" systems are CQRS in practice, even if they don't call it that.

## What problem does it solve?
- **Different shapes for read vs write.** Writes need normalized + constrained data; reads want denormalized + pre-aggregated + searchable views.
- **Scale asymmetry.** Reads are typically 100×–1000× more frequent than writes. CQRS lets reads scale independently (replicas, caches, search indexes).
- **Multiple specialized read stores** — same data in Postgres for transactions, ElasticSearch for search, Redis for hot lookups, ClickHouse for analytics.
- **Complex domains** — write model encodes domain rules; read model is "dumb" and just feeds the UI.
- **Performance** — pre-computed projections beat ad-hoc joins.

## How it works

```text
                     ┌────────────────────┐
   client            │   COMMAND SIDE     │
   ───────write────► │  (validate +       │
                     │   mutate +         │
                     │   emit event)      │
                     └─────────┬──────────┘
                               │ events
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
          ┌─────────┐    ┌──────────┐    ┌──────────┐
          │ Postgres│    │ ElasticS.│    │ Redis    │
          │ (orders)│    │ (search) │    │ (counts) │
          └────┬────┘    └────┬─────┘    └────┬─────┘
               │              │                │
   client      ▼              ▼                ▼
   ──read──►   ────────── QUERY SIDE ───────────
              (project pre-shaped to UI)
```

1. **Commands** (`PlaceOrder`, `UpdateAddress`) hit the write side; validation + persistence + **event emission**.
2. **Events** propagate via Kafka / outbox / CDC to **projections**.
3. **Read models** are denormalized stores shaped for specific UIs.
4. Reads hit the read store directly; writes go to the command service.

## When to use it (real-world examples)
- **E-commerce** — order write model in Postgres + product catalog read model in ElasticSearch + inventory cache in Redis.
- **Twitter / Instagram timelines** — write model is `posts` table; read model is per-user pre-built timeline (CQRS + [fan-out on write](/docs/46-fanout-patterns/fan-out-on-write)).
- **Banking** — write side = ledger (Postgres / event store); read side = customer-facing balance + statement views.
- **Analytics dashboards** — operational DB + materialized projections to ClickHouse / BigQuery.
- **Microservices** — each service has its own read model of others' data, kept in sync via events.
- **Headless CMS** — content authored in CMS, projected to ElasticSearch / CDN-cached JSON for delivery.
- **Search** — primary store + ElasticSearch index updated via CDC.
- **Reporting / BI** — operational DB + warehouse projections (Snowflake, BigQuery).
- **Real-time leaderboards** — writes to game DB; Redis sorted-set projection.
- **GraphQL gateways** — Apollo with separate read/write resolvers; per-field caching of read models.
- **Customer 360 views** — joining data from many services into a single denormalized read model.

## When NOT to use it
- **Simple CRUD app** — overhead isn't worth it.
- **Strong consistency required on reads** — CQRS is typically eventually consistent.
- **Tight latency budgets on read-after-write** — projection lag may be unacceptable; route specific reads to write side.
- **Tiny team / single service** — operating two models doubles ops.
- **Mostly-write workloads** — CQRS optimizes for read scale; pure write doesn't benefit.
- **You haven't yet identified the read shapes** — building speculative projections wastes effort.

## Things to consider / Trade-offs
- **Eventual consistency.** The biggest UX gotcha. After a write, the read model lags by ms-to-seconds. Mitigations:
  - **Read your writes** — route the immediate post-write read to the write side.
  - **Optimistic UI** — show the change locally before the server confirms.
  - **Versioned read** — client tracks the last-write version + waits / polls for projection to catch up.
- **Projection failures** — projection consumer crashes; read model goes stale. Monitor lag.
- **Replay** — rebuilding a projection from scratch must be feasible; that's why pairing with [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) or Kafka log retention is common.
- **Dual writes are a trap** — never write to both DB and Kafka in app code (they can diverge). Use **outbox pattern** ([Debezium](/docs/27-cdc-and-data-integration/debezium)) or write to event log first.
- **Schema evolution** — projections must handle new event versions; pair with versioned events.
- **Cost of multiple stores** — Postgres + ES + Redis + ClickHouse = 4 systems to operate.
- **Per-projection ownership** — assign each projection an owner; otherwise nobody fixes the lag alerts.
- **Idempotent projections** — must handle event replay; key on event ID.
- **Cross-cutting concerns** — auth / multi-tenancy must be present in both models.
- **You can adopt CQRS gradually** — start with a single read replica + materialized view; expand as needed.

## CQRS without Event Sourcing
- Write side = normal DB (Postgres / MySQL).
- Reads use **materialized views**, **read replicas**, **CDC-fed search indexes**, **per-page caches**.
- Pattern is the same; events come from CDC instead of a domain event log.
- Most production systems use this lighter CQRS form.

## Common pitfalls
- **Forcing CQRS into a system that doesn't need it** — premature complexity.
- **Synchronous projection update** — defeats the point; projections should be async.
- **Dual writes from app code** — DB + Kafka diverge silently; always use outbox or CDC.
- **No projection lag monitoring** — read model gets stale; users see weird state.
- **No replay path** — projection corrupts; can't rebuild without a full event log.
- **Over-projecting** — building 10 read models for theoretical use cases.
- **Stale read after write surprising users** — design read-after-write or be explicit about staleness.
- **Tight coupling between command + query teams** — forces synchronized deploys; defeat of separation.
- **Ignoring schema evolution** — events change, projection breaks silently.

## Interview Cheat Sheet
- **One-liner:** separate write model (commands, normalized, transactional) from read models (projections, denormalized, view-shaped); kept in sync via events / CDC.
- **Eventually consistent on reads** — design UX accordingly.
- **Doesn't require Event Sourcing** — CDC + materialized views is "CQRS lite."
- **Pair with:** [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing), [outbox pattern](/docs/27-cdc-and-data-integration/debezium), [Idempotency](/docs/44-delivery-semantics/idempotency).
- **Why:** different shapes / scale / tech for reads vs writes.
- **When to use:** read-heavy, multi-shape views, search, analytics, high-scale social feeds.
- **When NOT:** simple CRUD, strict read-after-write consistency, tiny systems.

## Related concepts
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — frequent partner.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — cross-service transactions.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — read replicas are CQRS-lite.
- [Caching Strategies](/docs/41-caching/caching-strategies) — Redis / Memcached are read-side projections.
- Concrete: [Debezium](/docs/27-cdc-and-data-integration/debezium), [Kafka](/docs/09-message-queues-and-streaming/kafka), [ElasticSearch](/docs/06-search-and-indexing/elasticsearch), Materialize, Axon, Marten.
