---
title: "Microservices Anti-Patterns"
description: "The traps that turn microservices into a worse-than-monolith mess — distributed monolith, chatty services, shared database, ground-up rewrite. Why 'microservices' is not always the answer."
---

> Topic: Key Concept · Category: Microservices Patterns · Difficulty: Foundational

## TL;DR
Microservices solve real problems (independent deploys, team autonomy, polyglot tech). They also create real ones — and the failure modes are predictable. Common anti-patterns:
- **Distributed monolith** — services that must be deployed together; "we got the worst of both worlds."
- **Chatty services** — every operation requires N service calls; latency and failure modes explode.
- **Shared database** — multiple services share schema; you've coupled them more tightly than the monolith.
- **Big-bang microservices** — split everything at once; chaos.
- **Same-team services** — every team owns 20 services they barely use.
- **Wrong service boundaries** — split by tech layer (API / DB / UI) rather than business domain.
- **No platform team** — every team reinvents observability, CI, deploy.

The deeper truth: **microservices are an organizational solution disguised as an architectural one**. If your team doesn't need autonomy or independent scaling, you probably want a modular monolith.

## What problem (microservices) actually solve

- **Independent deploys** — team A ships without coordinating with team B.
- **Team autonomy** — different teams own different services.
- **Independent scaling** — scale checkout 10x without scaling reporting.
- **Tech polyglot** — Go for high-throughput, Python for ML, Node for real-time.
- **Fault isolation** — recommendation service down ≠ checkout down.

What microservices DON'T solve:
- **Bad architecture in a monolith** stays bad after splitting.
- **Bad team boundaries** become *worse* when networked.
- **Slow developers** become slower with distributed-systems debugging.
- **Lack of observability** — silently broken in monolith, loudly broken across services.

## Anti-patterns in detail

### 1. Distributed monolith
Services that must be deployed in lockstep, share libraries that change together, or fail in cascading ways.

**Symptoms:**
- "Service A v1.2.0 requires Service B v1.5.0 — deploy together."
- Schema migrations require coordinating 5 services.
- One team's bug brings down 8 other services.

**Cure:**
- **Versioned APIs** with backward compatibility.
- **Independent data stores.**
- **Saga pattern** for cross-service transactions.
- **Or:** consolidate back into a modular monolith.

### 2. Chatty services
Doing what was a single in-memory call as N network calls.

**Symptoms:**
- "Show user dashboard" → 12 service calls.
- p95 latency = sum of all downstream p95s.
- Cascade failures common.

**Cure:**
- **API composition** at gateway / BFF.
- **GraphQL** with [DataLoader](/docs/54-api-design-patterns/rest-vs-graphql-vs-grpc) for batch.
- **Event-driven projections** — read models pre-built.
- **Re-evaluate boundaries** — these services may be too granular.

### 3. Shared database
Multiple services read/write the same DB tables.

**Symptoms:**
- Schema migrations need cross-team coordination.
- Service A's bad query DOSes Service B.
- Domain logic scattered across services.

**Cure:**
- **Database-per-service** — each service owns its data.
- **Synchronize via events** ([CDC / outbox](/docs/65-outbox-and-transactional-messaging/outbox-pattern)).
- **API access** to other services' data, not direct DB access.

### 4. Big-bang microservices
"Let's split the monolith into 30 services in one quarter."

**Symptoms:**
- Massive coordination overhead.
- Half-extracted services with leaky boundaries.
- Team morale crater.

**Cure:**
- **Strangler fig** ([incremental extraction](/docs/58-deployment-and-release/strangler-fig-and-migration)).
- **Extract one well-bounded service at a time.**
- **Modular monolith first** (clean module boundaries inside one app).

### 5. Same-team services
"Our team owns 20 services."

**Symptoms:**
- 20 deploys for any meaningful feature.
- Half the services aren't actively used; nobody remembers what they do.
- 20 service-specific runbooks.

**Cure:**
- **Re-merge** services owned by the same team unless there's a real reason to split.
- **One service per bounded context owned by one team.**
- **Avoid splitting on tech layers** — UI/API/DB are not separate services.

### 6. Wrong service boundaries
Splitting by tech layer (API service, DB service, UI service) instead of by domain (orders, payments, inventory).

**Symptoms:**
- Every feature requires changes to all three "layer services."
- High inter-service traffic.

**Cure:**
- **Domain-driven design** — one service per bounded context.
- **Vertically slice** — service contains its own UI / API / data logic.

### 7. No platform team
Every product team builds their own CI, observability, deploy, secrets mgmt.

**Symptoms:**
- 10 different ways to run a service in prod.
- Nobody trusts anyone's runbooks.
- Catastrophic incidents because no shared standards.

**Cure:**
- **Internal Developer Platform (IDP)** — Backstage, internal Heroku-like.
- **Shared CI templates, observability libraries, deployment patterns.**
- **Golden paths** — paved roads with optional escape hatches.

### 8. RPC instead of events
Synchronous chains of RPC calls when async events would do.

**Symptoms:**
- Slow downstream takes down upstream.
- Tightly coupled services.
- High failure-rate during deploys.

**Cure:**
- **Event-driven architecture** for non-blocking.
- **Synchronous only when user is waiting.**
- **CQRS** for read paths.

### 9. Forgetting org maturity
"We need microservices because Netflix has them."

**Symptoms:**
- 5 engineers running 30 services with no observability platform.
- Constant production incidents.
- Slow shipping.

**Cure:**
- **Modular monolith first** — extract services as you grow.
- **Microservices when**: 50+ engineers, dedicated platform team, mature CI/CD, observability stack.

## Things to consider / Trade-offs

### When microservices DO pay off
- **Multiple teams** with different release cadences.
- **Different scaling needs** per service.
- **Polyglot needs** justified.
- **Mature ops culture** — observability, CD, on-call.
- **Existing monolith** with clear domain boundaries to extract.

### When they don't
- **Small team** (< 20 engineers).
- **Single-product startup** still iterating.
- **Tight latency budgets** that don't tolerate network calls.
- **Limited ops capacity.**
- **Strong consistency requirements** across multiple data stores.

### Modular monolith — the underrated option
- Single deployable.
- Strict module boundaries enforced at compile time (Java packages, Go modules, Rust crates).
- One database with separate schemas per module.
- Same observability / security / deploys.
- **Shopify, Basecamp, GitHub** all run modular monoliths at huge scale.

### Operational maturity required
- **Observability** ([metrics, logs, traces](/docs/57-observability-and-sre/metrics-logs-traces)) baseline.
- **CI/CD** pipelines per service.
- **Service mesh** for security / observability without per-team work.
- **Internal platform** (Backstage / Compass / IDP).
- **Runbooks per service.**
- **On-call rotations.**
- **Postmortem culture.**

## Common pitfalls
- **Splitting too early** — pre-product-market-fit; pay distributed-systems tax for no benefit.
- **No platform team** — every service team reinvents observability.
- **Synchronous chains** for what could be async.
- **Cross-service transactions via 2PC** — almost always wrong; use [sagas](/docs/47-event-driven-architecture/saga-pattern).
- **Cross-service pagination** — naive scatter-gather is slow.
- **Service ownership churn** — team disbanded; service abandoned.
- **No service catalog** — nobody knows what runs where.
- **Library-as-microservice** — splitting a shared library into a service for "decoupling."
- **Single point of failure** — auth service that every other service calls synchronously.
- **No versioning discipline** — breaking changes deployed without notice.
- **Over-investing in cross-team protocols** — Protobuf governance becomes its own bureaucracy.
- **Unbounded in-flight retries** — retry storms in microservice chain.
- **No bulkhead** — slow service drowns calling services.
- **Confusing "we use Kubernetes" with "we have microservices."**

## Interview Cheat Sheet
- **Microservices solve:** independent deploys, team autonomy, polyglot tech, independent scaling, fault isolation.
- **They DON'T solve:** bad architecture, bad teams, lack of observability.
- **Common anti-patterns:** distributed monolith, chatty, shared DB, big-bang, wrong boundaries, no platform team.
- **Modular monolith first** — extract services as the org grows.
- **Database-per-service.**
- **Async events > sync RPC chains.**
- **Sagas for cross-service transactions** — never 2PC.
- **Killer phrase:** "Microservices are an organizational solution disguised as architecture — they pay off only when you have team autonomy needs and the operational maturity to run them."

## Related concepts
- [Sidecar / Bulkhead](/docs/60-microservices-patterns/sidecar-and-bulkhead) — operational patterns.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — cross-service transactions.
- [CQRS](/docs/47-event-driven-architecture/cqrs) — read-write separation.
- [Strangler Fig](/docs/58-deployment-and-release/strangler-fig-and-migration) — incremental extraction.
- [API Versioning](/docs/54-api-design-patterns/api-versioning) — independent deploys without breaking.
