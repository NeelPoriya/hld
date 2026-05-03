---
title: "Temporal"
description: "Temporal is a durable execution platform for application-level workflows — write business logic as plain code, get retries, timers, signals, and crash-resilience for free."
---

> Category: Durable Execution / Application Workflow Engine · Written in: Go (server) · License: MIT (server) · Multi-language SDKs (Go, Java, TypeScript, Python, .NET, PHP, Ruby)

## TL;DR
Temporal is a **durable execution platform** for **application-level workflows** — born at Uber as Cadence, now widely used (Stripe, Snap, Coinbase, HashiCorp, Datadog). You write your business logic as **plain code in your favorite language**, and Temporal **persists every step's result** so the workflow survives crashes, restarts, and machine failures. **No state machines, no callbacks, no event sourcing boilerplate** — just code. Reach for Temporal when you have **long-running, multi-step business processes** (order fulfillment, payment flows, infrastructure provisioning, agentic AI workflows). Reach for **Airflow** for batch ETL; reach for **Step Functions** for AWS-native managed alternative; reach for **Cadence** as the original Uber fork.

## What problem does it solve?
You have a multi-step business process:
- "Charge the card → reserve inventory → create shipment → notify customer → if any step fails, refund and revert."
- "Provision a customer's environment: create AWS account → set up VPC → deploy services → seed data → enable user — must survive process crashes."
- "Multi-day approval workflow with timers, escalations, manual intervention."
- "Agentic AI: call LLM → call external API → call LLM again — long-running, non-deterministic, must be resumable."

Building this **safely** with retries, timers, idempotency, and crash-resilience is hard. Common bad solutions: cron + Postgres polling, Kafka + state-machine code, AWS Step Functions JSON. Temporal lets you **just write the function** in normal code; Temporal records every step to its own database so the workflow can resume from where it left off after any failure.

## When to use
- **Long-running business workflows** — minutes to days to months.
- **Sagas / orchestration patterns** — multi-step process with compensating actions on failure.
- **Reliable timers and signals** — "wait 7 days then send reminder unless customer has paid."
- **Polyglot environments** — Go workflow calling Python activity calling Java service.
- **Agentic AI** — LLM-driven workflows with retries, branching, human-in-the-loop.
- **Replacing brittle hand-rolled state machines** in service code.

## When NOT to use
- **Pure batch ETL** — Airflow / Dagster are better suited.
- **High-throughput stream processing** — Flink / Kafka Streams.
- **Sub-millisecond synchronous request handling** — Temporal adds tens of ms per workflow step.
- **Trivial single-step jobs** — overkill; just call the function.
- **You don't want to run another service** — managed Temporal Cloud is the escape hatch.

## Data Model
Three core abstractions:
- **Workflow** — your business logic, written as a function. **Must be deterministic** (no random IDs, no `time.now()` directly — use Temporal's APIs).
- **Activity** — non-deterministic side effects (DB writes, HTTP calls, etc.). Idempotent ideally.
- **Task Queue** — workers poll task queues to pick up workflow / activity tasks.

```typescript
// Workflow (deterministic — no side effects directly)
import { proxyActivities } from '@temporalio/workflow';
import * as activities from './activities';

const { chargeCard, reserveInventory, sendNotification, refund } =
    proxyActivities<typeof activities>({ startToCloseTimeout: '30s' });

export async function orderWorkflow(order: Order): Promise<void> {
    try {
        const charge = await chargeCard(order.cardId, order.amount);
        const reservation = await reserveInventory(order.items);
        await sendNotification(order.userId, 'order_placed');
    } catch (err) {
        // Compensating actions
        await refund(order.cardId, order.amount);
        throw err;
    }
}

// Activity (real side effects, retried by Temporal automatically)
export async function chargeCard(cardId: string, amount: number) {
    return await stripe.charges.create({ source: cardId, amount });
}
```

## Architecture & Internals
- **Temporal Server** — a cluster of stateless services (frontend, history, matching, worker) backed by a database.
- **Persistence**: **Cassandra** or **PostgreSQL / MySQL**, with Elasticsearch for advanced visibility queries.
- **History**: every workflow step is recorded as an event in the workflow's history (started, activity scheduled, activity completed, timer fired, …). The workflow's state is **fully reconstructible** from this history.
- **Workers** — your code, in your language, polling task queues. The Temporal SDK replays the workflow's history to rebuild state, then resumes execution from where it stopped.
- **Sticky cache** — recent workflow state cached on workers to avoid full replay.

```
client → Temporal frontend → matching → task queue → worker (your code)
                                ↓
                          history svc → DB (Cassandra / Postgres)
```

## Consistency Model
- **Strong durability** — every workflow event is committed to the DB before being acknowledged.
- **Exactly-once semantics** for workflow execution; activities are at-least-once (design idempotent activities).
- **Determinism requirement** — workflows must produce the same decisions when replayed against the same history. Non-determinism (random, time.now, mutex) breaks replay.
- **Versioning** — when you change workflow code, use `workflow.GetVersion()` (Go) / `patched()` (TS) to safely evolve old in-flight workflows.

## Replication
- **Within cluster:** persistence layer (Cassandra / Postgres) replicates per its own model.
- **Cross-region**: Temporal supports **multi-cluster replication** (formerly XDC) for active-passive or active-active.
- **Temporal Cloud** offers managed multi-region.

## Partitioning / Sharding
- **History service** is sharded by workflow ID hash; each shard is owned by one history host.
- **Task queues** are partitioned via matching service; high-throughput task queues scale by partitioning.
- **Workers** scale horizontally; pollers are stateless.

**Hot-workflow pitfall:** a workflow with millions of events in history slows down replay. Solution: **Continue-As-New** — start a fresh workflow with the current state when history grows too large.

## Scale
- **Millions of concurrent workflows** in a single cluster.
- **Tens of thousands of activities/sec** per cluster with proper sizing.
- **Horizontal scale** via persistence sharding + history shard count + matching partitions.

## Performance Characteristics
- **Workflow start:** ~10–50ms.
- **Activity round-trip:** tens of ms (worker polling + execution + history commit).
- **Bottlenecks:** persistence DB throughput (Cassandra cluster sizing), worker count, history shard contention for hot workflows.
- **Replay overhead** is small with sticky cache; cold replay can be costly for very long histories.

## Trade-offs

| Strength | Weakness |
|---|---|
| Write workflows as plain code, in any language | Workflows must be deterministic — easy to violate |
| Built-in retries, timers, signals, crash-resilience | Operational complexity (server + DB + ES) |
| True durable execution — survives crashes | Steep learning curve (replay, determinism, versioning) |
| Polyglot SDKs (Go, Java, TS, Python, .NET, PHP, Ruby) | Not for batch ETL or streaming |
| Strong consistency model | Schema migrations on the DB are non-trivial |
| Managed (Temporal Cloud) or self-hosted | Adds latency vs direct service calls |

## Common HLD Patterns
- **Saga / order fulfillment:** orchestrate charge → inventory → ship → notify with compensating actions.
- **Customer onboarding:** multi-step provisioning with timers, retries, manual approvals via signals.
- **Subscription / billing engine:** monthly cycle = monthly workflow with timers + signals for upgrades/cancellations.
- **Infrastructure provisioning:** Terraform-like apply orchestrated as Temporal workflow with retries, partial failure recovery.
- **Agentic AI:** LLM workflow loop with tool calls, retries on transient failures, human-in-the-loop via signals.
- **Replacing AWS Step Functions** for vendor neutrality and code-first ergonomics.

## Common Pitfalls / Gotchas
- **Non-determinism in workflow code** — `Math.random()`, `Date.now()`, file I/O, network calls — all banned in workflow body. Use `workflow.now()`, side-effect APIs, or move to activities.
- **Workflow versioning** — changing workflow code without using versioning APIs breaks replay for in-flight workflows.
- **Long histories** — workflows with millions of events get slow; use Continue-As-New.
- **Activity timeouts** — must set `startToCloseTimeout` and ideally `heartbeatTimeout` for long activities.
- **Idempotency in activities** — Temporal retries; design your downstream calls accordingly.
- **DB sizing** — under-sized Cassandra is the #1 production pain.
- **Confusing Cadence vs Temporal** — Temporal is the more actively-developed fork; Uber still maintains Cadence.
- **Workers are part of the SLA** — if no worker polls a task queue, workflows just wait; monitor poller health.

## Interview Cheat Sheet
- **Tagline:** Durable execution platform for application workflows — write code, get crash-resilience, retries, timers for free.
- **Best at:** long-running business workflows, sagas, orchestration with timers/signals, polyglot environments, agentic AI.
- **Worst at:** batch ETL, streaming, sub-ms latency, trivial single-step jobs.
- **Scale:** millions of concurrent workflows; sharded history + matching layers.
- **Shard by:** workflow ID hash → history shards; task queue partitions.
- **Consistency:** strong durability of every event; activities at-least-once; workflow determinism enforced.
- **Replicates how:** persistence layer (Cassandra/Postgres) + multi-cluster replication for cross-region.
- **Killer alternative:** Cadence (Uber fork), AWS Step Functions, Azure Durable Functions, Restate (newer durable functions), Inngest / Trigger.dev (lighter), Airflow (batch only).

## Further Reading
- Official docs: <https://docs.temporal.io/>
- Workflow vs Activity: <https://docs.temporal.io/workflows>
- Versioning: <https://docs.temporal.io/dev-guide/typescript/versioning>
- Architecture deep dive: <https://docs.temporal.io/temporal-service>
- Temporal vs Step Functions: <https://temporal.io/blog/temporal-vs-step-functions>
