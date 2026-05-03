---
title: "BullMQ"
description: "BullMQ is the de-facto Node.js / TypeScript job queue — Redis Streams-backed, async/await-native, with retries / scheduled / repeatable / rate-limited / parent-child flows, Sandboxed Workers, and Bull Board UI."
---

> Category: Job Queues & Background Workers · Written in: TypeScript · License: MIT

## TL;DR
BullMQ is **Sidekiq for Node.js**: a Redis-backed background-job library, but built around **Redis Streams** (newer + more reliable than the original `bull`'s lists), with first-class **async / await**, **TypeScript types**, **scheduled jobs**, **repeatable / cron jobs**, **rate limiting**, **per-queue concurrency**, **flows** (parent-child fan-in / fan-out), **sandboxed workers** (run jobs in a separate Node process for isolation), **priority queues**, **dead-letter queues**, and a web UI via **Bull Board** or **Taskforce.sh** (commercial). Reach for BullMQ when **your stack is Node / TypeScript and you need reliable background processing — emails, webhooks, data sync, video processing, ML pipelines** — without operating Kafka or RabbitMQ.

## What problem does it solve?
- **Don't block the event loop with slow work** — push to a queue.
- **Retries with backoff** — transient errors should not fail jobs forever.
- **Scheduled / cron jobs** — built-in repeatable + delayed jobs.
- **Throughput** — many workers, configurable concurrency per worker.
- **Pipeline orchestration** — flows (parent-child) for multi-stage jobs.
- **Visibility** — Bull Board shows queues / jobs / failures.
- **Rate limiting** — protect downstream APIs.

## When to use
- **Node.js / TypeScript apps** with background work.
- **You already run Redis 5+** (Streams require Redis 5+).
- **Cron / scheduled / repeatable** jobs.
- **Rate-limited integrations** (e.g., Twilio, Stripe).
- **Multi-stage pipelines** (Flows) — parent fans out to children, completes when all children finish.
- **Email / webhook / image / video processing** with retries.
- **Want a UI** for live job inspection (Bull Board).

## When NOT to use
- **Non-Node stack** — Sidekiq (Ruby), Celery (Python), etc.
- **Strict ordering across all jobs** — use Kafka.
- **Long-running, stateful workflows** — use Temporal.
- **No Redis available** — consider PostgreSQL-backed alternatives like `pg-boss` or `graphile-worker`.
- **Cross-language event bus** — RabbitMQ / Kafka are language-neutral.
- **Multi-region with strict consistency** — Redis is single-leader; design carefully.

## Core Concepts
- **Queue** — named queue backed by Redis Streams + auxiliary data structures.
- **Worker** — long-running Node process that pulls jobs from the queue and runs them.
- **Job** — JSON payload + metadata; identified by a JobId.
- **Job options** — `attempts`, `backoff`, `delay`, `priority`, `removeOnComplete`, `removeOnFail`, `lifo`, `jobId` (idempotency).
- **Repeatable job** — recurring (cron / every) job; managed by a separate "repeat" key.
- **Flow** — parent job with child jobs; parent runs after all children complete.
- **FlowProducer** — API to enqueue parent + children atomically.
- **Sandboxed Worker** — workers run jobs in a separate Node process (`processFile` path) for isolation.
- **Rate limiter** — `limiter: { max, duration }` per queue or per group key.
- **Dead-letter** — failed jobs (after attempts exhausted) stay in `failed` set for inspection.
- **QueueEvents** — event-stream from Redis (separate connection) — listen to `completed`, `failed`, `progress`.
- **Bull Board** — Express middleware that mounts a UI at `/admin/queues`.

```typescript
// queues.ts — define queue + connection
import { Queue } from "bullmq";
const connection = { host: "redis.internal", port: 6379, password: process.env.REDIS_PASSWORD };

export const emailQueue = new Queue("emails", { connection });
export const webhookQueue = new Queue("webhooks", { connection });
```

```typescript
// producer: enqueue jobs
import { emailQueue } from "./queues";

await emailQueue.add(
  "welcome",
  { userId: 42 },
  {
    attempts: 5,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
    jobId: `welcome:${42}`               // idempotency
  }
);

// Delayed
await emailQueue.add("reminder", { userId: 42 }, { delay: 60 * 60 * 1000 });

// Repeatable (cron)
await emailQueue.add(
  "daily-digest",
  {},
  { repeat: { pattern: "0 9 * * *", tz: "America/New_York" } }
);
```

```typescript
// worker.ts — long-running process
import { Worker, Job } from "bullmq";

const worker = new Worker(
  "emails",
  async (job: Job) => {
    const { userId } = job.data;
    await job.updateProgress(10);
    const user = await db.users.findById(userId);
    await ses.sendEmail({
      Destination: { ToAddresses: [user.email] },
      Message: { Subject: { Data: "Welcome!" }, Body: { Text: { Data: "..." } } },
      Source: "noreply@acme.com"
    });
    await job.updateProgress(100);
    return { sent: true };
  },
  {
    connection,
    concurrency: 20,
    limiter: { max: 100, duration: 1000 }    // 100 jobs/sec
  }
);

worker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed`, err);
});
```

```typescript
// Flow: parent waits for children
import { FlowProducer } from "bullmq";

const flow = new FlowProducer({ connection });

await flow.add({
  name: "render-report",
  queueName: "reports",
  data: { reportId: "rpt_42" },
  children: [
    { name: "fetch-orders",   queueName: "fetch", data: { reportId: "rpt_42", source: "stripe" } },
    { name: "fetch-refunds",  queueName: "fetch", data: { reportId: "rpt_42", source: "stripe" } },
    { name: "fetch-shipping", queueName: "fetch", data: { reportId: "rpt_42", source: "shopify" } }
  ]
});
// parent renders only after all 3 children complete (or fails if any child fails)
```

```typescript
// Bull Board UI
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import express from "express";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(emailQueue), new BullMQAdapter(webhookQueue)],
  serverAdapter
});

const app = express();
app.use("/admin/queues", basicAuth({ users: { admin: process.env.ADMIN_PASS } }), serverAdapter.getRouter());
```

## Architecture
- **Queue producer** — adds jobs to Redis Stream + waiting list.
- **Worker(s)** — `BLPOP`-style fetch with Redis Streams `XREADGROUP` for at-least-once delivery + ack.
- **Active set** — currently-processing jobs; if worker crashes, stalled-job watchdog moves them back.
- **Delayed set** — sorted set keyed on timestamp; promoted to waiting when due.
- **Repeat key** — repeatable job metadata; producer creates next occurrence on completion.
- **QueueEvents** — separate connection consuming `__keyspace*` events for global event stream.
- **Sandboxed workers** — child Node process per job (heavier, but isolated).

## Trade-offs

| Strength | Weakness |
|---|---|
| TypeScript-first, async/await native | Single-leader Redis = scale ceiling |
| Redis Streams = at-least-once + recovery | Streams require Redis 5+ |
| Flows for fan-in / fan-out pipelines | Memory pressure if you don't trim removeOn* |
| Rate limiter per queue / group | Stalled-job watchdog adds latency tail |
| Repeatable cron + delayed | Cluster-mode Redis support has caveats (use single instance or sentinel) |
| Bull Board UI is solid | Job args must be JSON-serializable |
| Sandboxed workers for isolation | Migration from old `bull` requires care |
| MIT license | Less ecosystem polish than Sidekiq |

## Common HLD Patterns
- **Email / SMS / push notifications** — enqueue → retry on transient failures → dead-letter → UI inspection.
- **Webhook delivery** — per-tenant rate limiter group keys; exponential backoff; max attempts before disable.
- **Image / video processing** — high-concurrency worker on GPU box; Flow chains [extract → transcode → upload → emit-webhook].
- **Stripe / 3rd-party API calls** — rate-limiter prevents 429s; idempotency key per job.
- **Periodic data sync** — repeatable job every 5min pulls from external source; batches results.
- **Multi-step ETL** — Flow with N parallel children fanning into a parent that aggregates.
- **Retry strategies** — `backoff: { type: 'exponential', delay: 5000 }` or custom function.
- **Idempotent jobs** — set `jobId: 'unique:<hash>'`; duplicate adds are deduped.
- **Job priorities** — critical / default / low queues with different worker counts.
- **Graceful shutdown** — `SIGTERM` → `worker.close()` → finish in-flight jobs.

## Common Pitfalls / Gotchas
- **At-least-once delivery** — every job must be idempotent; use `jobId` + DB upsert pattern.
- **`removeOnComplete` / `removeOnFail` not set** — Redis fills with old jobs; tune retention.
- **Scheduled job storms** — many delayed jobs ready simultaneously can spike worker load.
- **Stalled jobs** — workers heartbeat; missed heartbeat → job re-queued; tune `stalledInterval`.
- **Rate limiter groups** — rate limit by `groupKey: 'tenant:42'`; otherwise it's queue-wide.
- **Sandbox processes** — heavier; use only for jobs needing isolation (e.g., headless Chrome).
- **QueueEvents requires separate connection** — Redis subscribe connection.
- **Repeatable job duplicates** — recreating a repeat with different opts can leave stale schedules; clear via `removeRepeatable`.
- **Flow failures** — failing one child fails the parent; design idempotently.
- **Memory growth** — TS / Node leaks; rolling restart workers via Kubernetes / pm2.
- **Redis Cluster** — BullMQ uses Lua scripts that touch multiple keys; works on cluster only with hash-tag-aware key naming.
- **Bull Board exposed publicly** — protect with auth.

## Interview Cheat Sheet
- **Tagline:** TypeScript-first Node job queue on Redis Streams — retries / scheduled / repeatable / rate-limited / Flows; Bull Board UI; MIT.
- **Best at:** Node / TS background work, retries with backoff, multi-stage pipelines (Flows), rate-limited integrations.
- **Worst at:** non-Node stacks, strict-ordering, long-running stateful workflows (Temporal), multi-region high-availability.
- **Scale:** tens of thousands of jobs / sec on a beefy Redis + many workers.
- **Distributes how:** Redis (Streams + sorted sets) as central queue; multiple workers pull jobs.
- **Consistency / state:** at-least-once; idempotency via `jobId`; Streams + ack ensures delivery on crash.
- **Killer alternative:** Sidekiq (Ruby), Celery (Python), Resque (Ruby), Faktory (language-neutral), `pg-boss` / `graphile-worker` (Postgres-backed Node), Hangfire (.NET), Quartz (Java), Temporal (durable workflows), AWS SQS + Lambda.

## Further Reading
- Official docs: <https://docs.bullmq.io/>
- Flows: <https://docs.bullmq.io/guide/flows>
- Repeatable jobs: <https://docs.bullmq.io/guide/jobs/repeatable>
- Bull Board: <https://github.com/felixmosh/bull-board>
- Migrating from Bull: <https://docs.bullmq.io/bull/quick-guide#migrating-from-bull-3.x-to-bullmq>
