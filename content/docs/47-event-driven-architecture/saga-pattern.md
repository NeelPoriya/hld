---
title: "Saga Pattern"
description: "Long-running distributed transactions across multiple services without 2-phase commit — sequence of local transactions, each compensated by an undo step. Choreography vs orchestration; Temporal / AWS Step Functions / Camunda implementations."
---

> Topic: Key Concept · Category: Event-Driven Architecture · Difficulty: Intermediate

## TL;DR
A **saga** is a sequence of **local transactions** spanning multiple services, where each step has a **compensating action** that undoes its effect. If step 5 of 7 fails, you don't roll back atomically — you run the **compensations** for steps 1–4 in reverse order. Sagas replace **two-phase commit (2PC)** in microservice / distributed systems, where 2PC's blocking behavior is unacceptable. Two flavors: **choreography** (services emit / consume events; no central coordinator) and **orchestration** (a saga coordinator drives the steps explicitly). Used everywhere distributed transactions exist: **booking systems** (flight + hotel + car), **payment + order workflows**, **e-commerce checkout**, **multi-service onboarding**, **bank transfers across systems**. Implemented via **Temporal**, **AWS Step Functions**, **Camunda**, **Netflix Conductor**, or hand-rolled with Kafka + state machines.

## What problem does it solve?
- **Cross-service atomicity** — service A succeeds, service B fails; how do you undo A?
- **No 2PC option** — 2PC blocks; not feasible across microservices / cloud APIs.
- **Long-running flows** — workflows that span minutes, hours, or days don't fit in a DB transaction.
- **Failure recovery** — what if your service crashes mid-saga? Need durable state + retry.
- **External APIs** — you can't roll back a Stripe charge or a Twilio SMS; you compensate with a refund / cancellation message.

## How it works

```text
Saga: place order
─────────────────
Step 1: Reserve inventory       ← compensate: ReleaseInventory
Step 2: Charge card             ← compensate: RefundCharge
Step 3: Book courier            ← compensate: CancelCourier
Step 4: Send confirmation email ← compensate: SendCancelEmail (best-effort)
Step 5: Update loyalty points   ← compensate: ReverseLoyalty

If step 3 fails:
  → run compensations 2 then 1 (in reverse).
  → step 4 + 5 weren't run; nothing to compensate.
```

### Choreography (event-based)
- No central coordinator.
- Each service listens for events, does its work, emits its own events.
- Order Service emits `OrderPlaced` → Inventory Service handles + emits `InventoryReserved` → Payment Service handles + emits `PaymentSucceeded` / `PaymentFailed` → if failed, Inventory listens and emits compensation, etc.
- ✅ Decoupled; no SPOF.
- ❌ Hard to reason about; no clear "what step are we on?"; cyclic event soup at scale.

### Orchestration (state-machine)
- A central **saga orchestrator** owns the workflow state.
- Calls each service in sequence; on failure, calls compensations in reverse.
- ✅ Explicit; observable; easy to debug.
- ❌ Centralized component; needs durable state; coupling around the orchestrator.

## When to use it (real-world examples)
- **E-commerce checkout** — reserve inventory → charge → ship → notify; compensations on each.
- **Travel booking** — flight + hotel + car as a single user-facing transaction with compensations.
- **Bank transfer between systems** (interbank, ACH) — debit → credit → reconcile; reverse on failure.
- **Order fulfillment** (Amazon, Shopify) — multi-warehouse + shipping orchestrated as sagas.
- **Multi-service signup** — create account → provision DB → set up billing → send welcome email.
- **Payment flows** (Stripe, Adyen) — auth → capture → settle; refund as compensation.
- **SaaS provisioning** — Okta + Stripe + internal billing + welcome emails; compensate on failure.
- **Insurance claims** — multi-step approval flow with rollback on rejection.
- **Ride-hailing dispatch** — match rider + driver + payment hold + ETA; compensate on cancel.
- **Healthcare workflow** — patient registration + insurance check + lab order + billing.
- **CI/CD pipelines** — multi-stage deploy with rollback; arguably a saga.

## When NOT to use it
- **Single-service / single-DB transaction** — use a regular DB transaction.
- **Truly atomic semantics required** — sagas are eventually consistent; an observer can see partial state mid-saga.
- **Compensations don't exist or are expensive** — can't "uncharge" a customer if money already left for an external account.
- **Tight latency budget** — saga steps are sequential; each network call adds latency.
- **Tiny systems** — the framework overhead isn't worth it.
- **Read-only flows** — sagas are about mutations.

## Things to consider / Trade-offs
- **Compensations must exist and be idempotent.** Every step must have a defined undo; both step + compensation must be safely retryable.
- **Compensations are not always perfect rollbacks** — sending an email can be compensated only by sending a cancellation email; the recipient still saw the first one.
- **State persistence** — orchestrator must persist saga state durably; survive crashes mid-flow.
- **Choreography vs orchestration** — small / simple flows: choreography. Complex / observable / debuggable flows: orchestration.
- **Eventual consistency** — observers see partial state mid-saga; design UI / queries to handle "in-progress" status.
- **Timeouts + deadlines** — every step needs a timeout; long-running steps need explicit deadlines.
- **Idempotency on every step** — retries are inevitable; see [Idempotency](/docs/44-delivery-semantics/idempotency).
- **Failure semantics** — semantically: at-least-once execution + compensation. Not "exactly-once" — at most "at-most-once-effect" via idempotency.
- **Saga visibility** — operators must see "what step is each saga on?"; an observable orchestrator is the killer feature of Temporal / Step Functions.
- **Dead letters / human intervention** — when compensation fails, you need a human in the loop.
- **Versioning sagas in flight** — flow is changed while sagas run; either freeze old flow or migrate carefully.
- **Distributed locks / pessimistic resources** — booking inventory may need a soft reservation with TTL.

## Common pitfalls
- **Not idempotent steps** — retries cause double-charge / double-ship.
- **Forgetting a compensation** — partial state stuck forever.
- **Compensation that fails** — must escalate to ops / dead-letter / manual.
- **Choreography spaghetti** — events crisscross 8 services; nobody knows the flow. Document with sequence diagrams or migrate to orchestration.
- **No persistence on orchestrator** — process crash → saga lost.
- **Treating saga as 2PC** — observers can see mid-saga state; design UI accordingly.
- **Compensations not in reverse order** — race conditions / orphaned resources.
- **Ignoring partial successes** — "I refunded but the email already went out."
- **Long-running sagas without checkpoints** — replay from start every retry is expensive.
- **Synchronous saga steps holding open user requests** — push to background workflow engine instead.
- **No backpressure** — saga storm during failure can hammer compensating services.
- **Cross-saga deadlocks** — two sagas reserving overlapping resources; design to avoid.

## Interview Cheat Sheet
- **One-liner:** sequence of local transactions across services, each with a compensating undo. No 2PC; eventual consistency.
- **Two flavors:** choreography (events) vs orchestration (central coordinator).
- **Compensations:** must exist, be idempotent, can be imperfect (cancellation email instead of un-send).
- **Orchestrator state must be durable** — Temporal, AWS Step Functions, Camunda, Conductor.
- **Use:** distributed transactions, multi-service workflows, long-running business processes.
- **Avoid:** single-service work (DB transaction), strict atomicity, no-compensation operations.
- **Real systems:** Temporal (durable workflow as code), AWS Step Functions, Camunda, Netflix Conductor, Uber Cadence (Temporal predecessor), hand-rolled with Kafka + state machine in DB.

## Related concepts
- [Idempotency](/docs/44-delivery-semantics/idempotency) — every step + compensation must be idempotent.
- [Event Sourcing](/docs/47-event-driven-architecture/event-sourcing) — saga state is naturally event-sourced.
- [CQRS](/docs/47-event-driven-architecture/cqrs) — saga emits events feeding read models.
- [Delivery Guarantees](/docs/44-delivery-semantics/delivery-guarantees) — sagas are at-least-once.
- Concrete: [Temporal](/docs/14-workflow-orchestration-and-coordination/temporal), AWS Step Functions, Camunda, [Kafka](/docs/09-message-queues-and-streaming/kafka).
