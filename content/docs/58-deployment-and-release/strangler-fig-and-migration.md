---
title: "Strangler Fig & Legacy Migration Patterns"
description: "How to replace a giant legacy system without a 'big bang' rewrite — strangler fig (incrementally re-route traffic), branch by abstraction, parallel run, and the human side of multi-year migrations."
---

> Topic: Key Concept · Category: Deployment & Release · Difficulty: Intermediate

## TL;DR
The **Strangler Fig pattern** (Martin Fowler, 2004; named after a tropical tree that grows around a host until the host dies) is the **canonical strategy for replacing a legacy system without a big-bang rewrite**:

1. **Put a façade / proxy in front** of the legacy system.
2. **For each new feature or migrated module**, route traffic to the new system instead.
3. **Over months/years**, the new system handles more; the legacy handles less.
4. **Eventually**, the legacy is decommissioned.

Companion patterns:
- **Branch by abstraction** — refactor at the code level by introducing an abstraction layer; switch implementations behind it.
- **Parallel run / dark launch** — run both old + new for the same request; compare outputs; cut over when confident.
- **Decoupling via events** — emit events from legacy via [CDC](/docs/27-cdc-and-data-integration/debezium); new system consumes.
- **Bidirectional sync** during migration — both systems are read/written for a while.

The interview-critical insight: **big-bang rewrites fail spectacularly**. Strangler is **slow, boring, expensive, and works**.

## What problem does it solve?
- **Replacing a system that's too big to rewrite at once.**
- **Reducing risk** — small migrations are reversible.
- **Maintaining business continuity** — feature work doesn't stop during migration.
- **Avoiding the "second-system effect"** (Brooks) — the rewrite turns into its own giant project.
- **Allowing the org to learn** the new domain while old still runs.

## How it works (the playbook)

```text
   Phase 0: legacy alone.
   ┌─────────┐
   │  Users  │ ──► Legacy Monolith (does everything)
   └─────────┘

   Phase 1: introduce façade. Routes everything to legacy.
   ┌─────────┐    ┌────────┐
   │  Users  │ ──►│ Façade │──► Legacy Monolith
   └─────────┘    └────────┘

   Phase 2: extract first feature. Route /payments to new service.
   ┌─────────┐    ┌────────┐──► /payments → New Payments Service
   │  Users  │ ──►│ Façade │
   └─────────┘    └────────┘──► everything else → Legacy

   Phase 3: extract more features over time.
   ┌─────────┐    ┌────────┐──► /payments → New Payments
   │  Users  │ ──►│ Façade │──► /orders   → New Orders
   └─────────┘    └────────┘──► /catalog  → New Catalog
                                ──► /admin    → Legacy (last bit)

   Phase 4: legacy is gone. Façade can disappear or stay as gateway.
```

### Concrete steps
1. **Pick the seam.** What's a self-contained subdomain you can extract? (Payments, search, notifications, auth, reporting often first.)
2. **Build the façade** at the network layer: API gateway, reverse proxy, or library.
3. **Build the new module** alongside; deploy independently.
4. **Migrate read traffic first** (lower risk); then write.
5. **Sync data** — legacy DB ↔ new DB via [CDC](/docs/27-cdc-and-data-integration/debezium) / dual writes / batch.
6. **Validate parity** — shadow / parallel run; diff outputs.
7. **Cut over** — small % → 100% via [canary](/docs/58-deployment-and-release/deployment-strategies).
8. **Remove legacy code path** — kill dead code.
9. **Decommission** when last seam is gone.

## When to use it (real-world examples)
- **Monolith → microservices.** Almost every "we replaced the monolith" public talk follows this pattern (Netflix, Etsy, Airbnb, Twitter, GitHub, Slack).
- **Legacy mainframe → cloud.** Airlines, banks, insurance.
- **Replacing a DB engine** — gradual migration via dual-write + CDC.
- **Replatforming front-end** — new pages on new framework, old pages on old.
- **Splitting one team's domain** out of a shared codebase.
- **Replacing third-party SaaS** with in-house solution.
- **Migrating from REST → GraphQL or v1 → v2 API** with façade.

## When NOT to use it
- **Greenfield project** — there's nothing to strangle.
- **Tiny system** — full rewrite is cheaper.
- **Quick patch** — temporary band-aid, not architecture-scale change.
- **No team capacity for years-long migration** — strangler is slow.
- **Legacy and new are radically different paradigms** — sometimes a "new system + import data" is cleaner.

## Things to consider / Trade-offs

### The good
- **Continuously deliverable** — every step is shippable.
- **Risk-bounded** — each migration is small.
- **Reversible** — failed migration → roll back the façade rule.
- **Learning** — team understands new system before betting everything.
- **Business value continuous** — no multi-month code freeze.

### The hard
- **Two systems forever** during migration. Operational complexity 2x.
- **Data sync** is the hardest piece. Dual writes are racy; CDC has lag.
- **Cross-cutting concerns** (auth, observability, billing) must work in both.
- **Org-level commitment** — multi-year. Leadership churn kills migrations.
- **Migration becomes "the project that never finishes"** — last 20% takes 80% of the time.
- **Tech-debt accumulator** — façade itself becomes legacy.
- **Cost** — running two systems in parallel is expensive.

### Practical patterns
- **API gateway as façade** — Kong, Envoy, NGINX, or custom routing service.
- **CDC for data parity** — Debezium reads from legacy DB; new system consumes.
- **Dual writes** — legacy + new written simultaneously; eventual reconciliation.
- **Read-only migration first** — read from new, still write to legacy; lower risk.
- **Anti-corruption layer (ACL)** — translate legacy domain model to new model in the façade.
- **Pact testing / consumer contract testing** — verify new module honors old contract.
- **Shadow / parallel run** — for several weeks before cutover.
- **Tracking migration progress** — % of traffic on new system per route.
- **Define "done"** — when can legacy be decommissioned? Have a written exit plan.

### People side
- **Communicate widely** — every team affected must know.
- **Documentation** of both old + new during migration.
- **Don't promise dates** confidently for the last 20%.
- **Team morale** — long migrations are draining; celebrate increments.
- **Don't add features to legacy** during migration; pin scope.

## Common pitfalls
- **Big-bang temptation** — "let's just write it from scratch."
- **No façade** — direct migration of routes one-by-one without a single chokepoint = chaos.
- **Last-mile abandonment** — 80% migrated, last 20% never finishes; legacy lives forever.
- **Data sync bugs** — dual writes drift; nobody notices until reports break.
- **Anti-corruption layer too thin** — legacy concepts leak into new system.
- **Fragile migration cron jobs** — break silently.
- **No rollback plan** — once routed to new system, can't easily go back.
- **Schema migration done before code migration** — old code breaks.
- **Façade becomes the new legacy** — bloated routing logic; needs its own strangle.
- **Migration as a side project** — without dedicated team, slips forever.
- **Legacy still actively developed** — moving target.
- **Underestimating CDC complexity** — schema changes, lag, replay.
- **Tech debt declared "we'll fix in v2"** — never gets fixed.
- **Premature decommissioning** — "we think nothing reads it" → outage when something obscure breaks.

## Interview Cheat Sheet
- **Strangler Fig** = incremental replacement; façade routes to new modules; legacy shrinks over time; coined by Fowler.
- **Steps:** façade → extract module by module → data sync (CDC / dual write) → cut over → decommission.
- **Companion patterns:** branch by abstraction, parallel run / shadow, dual write, ACL.
- **Read-only first**, then write; small % canary cutover.
- **CDC (Debezium)** is the modern way to keep data in sync.
- **Multi-year migrations** — plan for 80% to take 80% of the time; leadership commitment essential.
- **The opposite is "big bang rewrite"** — known to fail (Joel Spolsky's "Things You Should Never Do").
- **Killer phrase:** "Strangler fig — a façade routes traffic to new services as you extract them; the legacy slowly dies as more functionality moves over."

## Related concepts
- [CDC & Data Integration](/docs/27-cdc-and-data-integration/debezium) — keeps data in sync during migration.
- [Microservices Patterns](/docs/60-microservices-patterns/sidecar-and-bulkhead) — where the new modules live.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — distributed transactions in the new world.
- [Deployment Strategies](/docs/58-deployment-and-release/deployment-strategies) — canary cutover for migration.
- [Outbox Pattern](/docs/65-outbox-and-transactional-messaging/outbox-pattern) — for emitting events from legacy.
