---
title: "Event Sourcing"
description: "Persist every state change as an immutable event in an append-only log, and derive current state by replaying events. The full audit history is the source of truth — used by financial ledgers, e-commerce order timelines, Git, and every blockchain."
---

> Topic: Key Concept · Category: Event-Driven Architecture · Difficulty: Intermediate

## TL;DR
**Event sourcing** flips the usual database mental model. Instead of storing the **current state** (`balance = $100`), you store **every event that led to it** (`Deposited $50`, `Deposited $50`, `Withdrew $0`). Current state is computed by **replaying events**. Benefits: full **audit trail by default**, **time travel** (state at any past moment), **easy to add new read models** (re-project events into a new view), natural fit for **CQRS** + **event-driven architectures**. Costs: more complex queries (must derive state), schema evolution requires **upcasting** old events, replay can be slow without **snapshots**. Used by **bank ledgers, Git, blockchains, e-commerce order pipelines, audit systems, EventStore / Marten / Axon**.

## What problem does it solve?
- **Lossy state.** Traditional CRUD overwrites; you lose history. ES preserves every change.
- **Audit / compliance** — financial / healthcare / regulatory systems need every action traceable.
- **Debugging.** Reproduce a bug by replaying production events on a dev box.
- **New views over time** — add a new read model later by replaying the event log into it.
- **Reactive integrations** — events naturally trigger downstream systems.
- **Temporal queries** — "what did the cart look like 5 minutes ago?"

## How it works

```text
Traditional CRUD:                  Event Sourcing:
─────────────────                  ───────────────
account_id | balance               event_id | type            | payload
123        | $100   ← overwritten  e1       | AccountOpened   | {id:123, owner:A}
                                   e2       | Deposited       | {amt: 50}
                                   e3       | Deposited       | {amt: 50}
                                   e4       | Withdrawn       | {amt: 0}

current_state = fold(events)       balance(123) = sum(deposits) - sum(withdrawals)
```

1. **Command** arrives ("Withdraw $20 from account 123").
2. **Aggregate** validates against current state (loaded by replaying past events).
3. On success, append a new **event** to the log (`MoneyWithdrawn`).
4. **Projections** asynchronously read the log and materialize **read models** (current balance, transaction list, monthly summary).
5. **Snapshots** periodically save aggregate state to avoid replaying from event 0 every time.

## When to use it (real-world examples)
- **Banking / financial ledgers** — every transaction is an event; the ledger is the source of truth.
- **E-commerce order pipelines** — `OrderPlaced → PaymentAuthorized → ItemReserved → Shipped → Delivered`.
- **Git** — every commit is an event; HEAD is the fold of all commits.
- **Blockchains** — every block is an event; chain state is the deterministic replay.
- **Healthcare records** — append-only, regulatory.
- **CRM / sales pipelines** — `LeadCreated → ContactedAt → MovedToOpportunity → Closed-Won`.
- **IoT device state** — sensor events as the log; current device state is derived.
- **Workflow engines** — Temporal stores every signal / activity / timer as an event log.
- **Customer support timelines** — Zendesk-style "history of a ticket."
- **Multiplayer games** — server-authoritative event log replicated to clients.
- **Audit logs / SIEM** — every security event recorded; downstream SIEM is just a projection.
- **Stripe internal ledger** — every charge / refund / dispute is an event.

## When NOT to use it
- **Simple CRUD apps** — overhead isn't worth it.
- **Heavy ad-hoc reporting** — replaying events for arbitrary queries is slow; you'd build read models for everything anyway.
- **High-frequency tiny mutations** without business meaning — event log balloons (every "user typed a character" is not an event).
- **Tight team / no event modeling expertise** — picking event boundaries is a design skill.
- **Strong cross-aggregate transactions required** — ES + microservices means each aggregate is its own consistency boundary; cross-aggregate atomicity needs sagas.
- **Storage cost a problem** — events accumulate forever (or via configurable retention).

## Things to consider / Trade-offs
- **Event boundaries** — pick the right level. `MoneyDeposited` is good; `BalanceFieldUpdated` is meaningless.
- **Schema evolution / upcasting** — old events with old shapes still exist; need code to "upcast" them to current shape on replay.
- **Snapshots** — every N events, persist aggregate state; replay starts from the snapshot.
- **Idempotent projections** — projections must handle replay safely; use [Idempotency](/docs/44-delivery-semantics/idempotency).
- **Eventual consistency on reads** — projection lag means read models are slightly stale.
- **Storage** — append-only log; cheap per event but accumulates. Some systems retain forever; others archive cold events.
- **Replay cost** — full rebuild from event 0 is slow; snapshots + parallel projection.
- **Versioning** — schema migrations harder; events are immutable. Use upcasting or new event types.
- **PII / GDPR right-to-be-forgotten** — events are immutable! Use **crypto-shredding** (encrypt PII per-user; delete the key to erase) or store PII separately.
- **Cross-aggregate consistency** — use [Saga](/docs/47-event-driven-architecture/saga-pattern) pattern.
- **Tooling** — EventStore DB, Axon Framework (Java), Marten (.NET), commit log on Kafka with explicit aggregates.
- **Auditability for free** — but only if you preserve enough context (who, when, why) in the event payload.
- **Snapshots become source of bugs** — wrong snapshot = wrong state until next replay.

## Common pitfalls
- **Mutating events** — never. They're immutable. Add a new event to correct.
- **Treating events as DTOs / API contracts** — they're internal domain history; serialize carefully.
- **Forgetting projections must be idempotent** — replay double-applies side effects.
- **Replays kicking off external API calls** — projections should write read models, NOT trigger emails / webhooks again.
- **Snapshots out of date with code** — schema changed, snapshot is now wrong; invalidate or version snapshots.
- **No upcasting** — new code can't read old events; rebuild fails.
- **PII forever** — GDPR violations; design for crypto-shredding from day one.
- **Too fine-grained events** — `OrderTaxFieldUpdated` instead of `OrderUpdated`; log explodes.
- **Too coarse** — `OrderChanged { full payload }` loses the "why" (intent).
- **No event versioning** — `OrderPlaced` v1 and v2 with different fields share name → ambiguous.

## Interview Cheat Sheet
- **One-liner:** persist every state change as an event; current state = fold(events).
- **Benefits:** audit trail, time travel, new read models, debugging via replay, natural event-driven integration.
- **Costs:** complex queries (need projections), schema evolution (upcasting), storage growth, eventual consistency on reads.
- **Pair with:** [CQRS](/docs/47-event-driven-architecture/cqrs) for read/write separation, [Saga](/docs/47-event-driven-architecture/saga-pattern) for cross-aggregate transactions, snapshots for performance.
- **Real systems:** Git, blockchains, bank ledgers, EventStore DB, Axon, Marten, Temporal workflow logs, Stripe ledger.
- **Killer alternative:** plain CRUD + audit table; or CDC ([Debezium](/docs/27-cdc-and-data-integration/debezium)) emitting events from a normal DB.

## Related concepts
- [CQRS](/docs/47-event-driven-architecture/cqrs) — typically paired with ES.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — cross-aggregate transactions.
- [Write-Ahead Log](/docs/48-storage-internals/write-ahead-log) — same idea at the DB level.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — projections must be idempotent.
- Concrete: Kafka as event log, EventStore DB, Axon, Marten, Temporal, Git internals.
