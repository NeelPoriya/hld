---
title: "Sidekiq"
description: "Sidekiq is the de-facto Ruby background-job framework — Redis-backed, multi-threaded workers, retries with exponential backoff, scheduled / cron jobs, dead-job inspection, and Pro / Enterprise tiers for batches, encryption, and rate limiting."
---

> Category: Job Queues & Background Workers · Written in: Ruby · License: LGPLv3 (OSS) + commercial (Pro / Enterprise)

## TL;DR
Sidekiq is **THE background-job library for Ruby on Rails** (and any Ruby app). It enqueues jobs into **Redis lists / sorted sets**, runs them in **multi-threaded workers** (one OS process, many threads — far more memory-efficient than Resque's per-process model), and ships **retries with exponential backoff**, **scheduled jobs**, **cron-style recurring jobs** (via `sidekiq-cron`), **dead set inspection**, **per-queue concurrency / weight**, and a polished **web UI**. Paid tiers add **batches** (parent job that completes when N children finish), **encryption** (encrypt sensitive args at rest), **rate limiting**, and **expiring jobs**. For Rails apps, **`ActiveJob` + Sidekiq adapter** is the standard pattern. Reach for Sidekiq when **your stack is Rails / Ruby and you need reliable, performant background processing without operating Kafka / RabbitMQ**.

## What problem does it solve?
- **Don't do slow work in the request cycle** — push to a queue.
- **Reliability** — retries, dead-letter, idempotency primitives.
- **Throughput** — multi-threaded workers utilize a single process efficiently.
- **Scheduled / recurring work** — cron + scheduled timestamps.
- **Visibility** — Web UI for queues, retries, scheduled, dead jobs.
- **Rails integration** — `ActiveJob.perform_later` just works.

## When to use
- **Rails / Ruby apps** with background work (emails, exports, third-party API calls, image processing).
- **You already run Redis** — no new infra.
- **Bursty workloads** — Sidekiq scales horizontally with worker processes.
- **Need scheduled / cron jobs** — `sidekiq-cron` covers it.
- **Visibility into queues** required — UI is the killer feature.
- **Want batches / fan-in patterns** (Pro tier).

## When NOT to use
- **Non-Ruby stack** — use BullMQ (Node), Celery (Python), Resque (Ruby), Que (Ruby + Postgres), Quartz (Java).
- **Strict ordering required** across all jobs — use Kafka.
- **Long-running workflows** with state machines — use Temporal / Step Functions.
- **You don't already have Redis** — running it just for Sidekiq adds ops.
- **Cross-language event bus** — RabbitMQ / Kafka are language-neutral.
- **Massive fanout (M:N)** with strict delivery semantics — use Kafka.

## Core Concepts
- **Job** — a Ruby class with `perform(args)` method; typically inherits from `ApplicationJob` (ActiveJob) or `include Sidekiq::Job`.
- **Queue** — Redis list `queue:default`, `queue:critical`, etc.; weighted in worker config.
- **Sidekiq Worker** — one process running N threads (default 5; tune by I/O vs CPU).
- **Retry** — failed jobs go to `retry` sorted set with exponential backoff (default 25 attempts over ~21 days).
- **Dead set** — jobs that exhausted retries; manually inspect / retry / delete via UI.
- **Scheduled set** — jobs with `perform_in(10.minutes)` / `perform_at(time)`.
- **Cron jobs** — `sidekiq-cron` reads a YAML / DB schedule and enqueues jobs.
- **Middleware** — chain of code wrapping every `perform` (logging, instrumentation, idempotency, rate-limiting).
- **Sidekiq Pro** — batches, super-fetch, encryption, expiring jobs, statsd metrics.
- **Sidekiq Enterprise** — rate limiters, periodic jobs (built-in), unique jobs, leader election, multi-tenancy.
- **Reliability** (Pro) — `super_fetch` survives worker crashes (default fetch loses jobs in flight on crash).
- **Web UI** — mounted at `/sidekiq` in Rails; shows queues, scheduled, retries, dead, busy threads.

```ruby
# config/initializers/sidekiq.rb
Sidekiq.configure_server do |config|
  config.redis = { url: ENV.fetch("REDIS_URL"), size: 12 }
  config.concurrency = ENV.fetch("SIDEKIQ_CONCURRENCY", 10).to_i
  config.queues = %w[critical default low]   # weighted by order
end

Sidekiq.configure_client do |config|
  config.redis = { url: ENV.fetch("REDIS_URL"), size: 5 }
end
```

```ruby
# app/jobs/welcome_email_job.rb
class WelcomeEmailJob < ApplicationJob
  queue_as :default
  retry_on Net::OpenTimeout, wait: :exponentially_longer, attempts: 5
  discard_on ActiveJob::DeserializationError    # don't retry impossible jobs

  def perform(user_id)
    user = User.find(user_id)
    UserMailer.welcome(user).deliver_now        # or _later via SMTP queue
  end
end

# Enqueue
WelcomeEmailJob.perform_later(user.id)
WelcomeEmailJob.set(wait: 1.hour).perform_later(user.id)
WelcomeEmailJob.set(wait_until: tomorrow_9am).perform_later(user.id)
```

```ruby
# Direct Sidekiq job (no ActiveJob)
class ImageProcessJob
  include Sidekiq::Job
  sidekiq_options queue: :images, retry: 3, dead: false

  def perform(asset_id)
    asset = Asset.find(asset_id)
    Variants::Generate.call(asset)
  end
end
```

```yaml
# config/sidekiq.yml — worker config
:concurrency: 10
:queues:
  - [critical, 6]
  - [default, 3]
  - [low, 1]

:scheduler:
  :schedule:
    refresh_marketplace:
      cron: "0 */6 * * *"
      class: RefreshMarketplaceJob
```

```ruby
# Sidekiq Pro: batch fan-in
batch = Sidekiq::Batch.new
batch.description = "Export orders for tenant"
batch.on(:complete, OrderExportComplete, "tenant_id" => tid)
batch.jobs do
  Order.where(tenant_id: tid).find_each do |o|
    OrderExportRowJob.perform_async(o.id, tid)
  end
end
```

## Architecture
- **Worker process** — Ruby + Sidekiq + your app code; pulls jobs from Redis; runs N threads.
- **Redis** — stores queues (lists), retry / scheduled / dead (sorted sets by score=timestamp), and rich job metadata.
- **Web UI** — Rack app mounted in Rails; reads same Redis.
- **Heartbeat** — workers heartbeat into Redis; UI shows live processes.
- **Fetch strategy** — default `BasicFetch` (BLPOP), `SuperFetch` in Pro (RPOPLPUSH for at-most-once + recovery).
- **Middleware chains** — client (enqueue) + server (perform); used for instrumentation, encryption, idempotency.
- **MVCC of jobs** — each job has a unique JID; UID for idempotency / tracking.

## Trade-offs

| Strength | Weakness |
|---|---|
| Multi-threaded — efficient memory use | Ruby GVL limits CPU-bound parallelism within a process |
| Polished Web UI | OSS lacks rate limiting / batches (paid tier) |
| Retries + dead set built-in | Default fetch loses in-flight jobs on crash (use SuperFetch) |
| Huge ecosystem (sidekiq-cron, sidekiq-statsd, etc.) | Redis as queue = at-least-once, not exactly-once |
| Rails / ActiveJob integration | Pro / Enterprise are paid (commercial license) |
| Strong middleware extension model | LGPLv3 license has implications for some companies |
| Battle-tested over a decade | Job args must be JSON-serializable |
| Web UI has authentication hooks | Memory growth in long-running workers (use restarts) |

## Common HLD Patterns
- **Email / SMS sending** — enqueue on user action; retry on transient SMTP failures; dead-letter for inspection.
- **Webhook delivery** — enqueue → HTTP POST → on 5xx retry with backoff → on 4xx mark dead.
- **Batch export** — `Sidekiq::Batch` (Pro) — N row-export children → on `:complete` callback compose final file → upload to S3 → notify user.
- **Scheduled cleanup** — `sidekiq-cron` + `daily_cleanup` job at 3am.
- **Image / video processing** — separate `images` queue with high concurrency on GPU-equipped workers.
- **Idempotent retries** — middleware checks Redis SET `processed:<jid>` before perform.
- **Throttling 3rd-party APIs** — Enterprise rate-limiter; or middleware around `Stripe::Charge.create`.
- **Multi-tenant isolation** — separate queue per tenant or use `apartment` gem.

## Common Pitfalls / Gotchas
- **At-least-once delivery** — every job must be idempotent; use unique idempotency keys.
- **Job arguments must be small + serializable** — pass IDs, not ActiveRecord objects (or use Global ID).
- **Long-running jobs** block a thread; break into smaller jobs.
- **Memory growth** — Ruby workers leak memory; rolling restarts with `sidekiq-killswitch` / `sidekiq-cron` job that calls `Process.kill('TERM', $$)`.
- **Stuck jobs on crash** — without `super_fetch`, in-flight jobs vanish; set retries appropriately.
- **Default fetch + SIGTERM** — Sidekiq waits up to `timeout` for jobs to finish; tune for graceful deploys.
- **Redis OOM** — large dead set or scheduled set; monitor + cap retention.
- **Concurrency vs DB pool size** — `pool` in `database.yml` ≥ Sidekiq concurrency to avoid `ActiveRecord::ConnectionTimeoutError`.
- **Slow `perform_async`** — ActiveJob's wrapper has overhead; for hot paths use `Sidekiq::Job.perform_async` directly.
- **`retry: false`** disables retries; use intentionally.
- **Job class rename** — old serialized jobs can fail to deserialize; `discard_on ActiveJob::DeserializationError` or maintain aliases.
- **Web UI exposed publicly** — protect with auth (Devise / HTTP basic).

## Interview Cheat Sheet
- **Tagline:** Ruby background-job framework on Redis — multi-threaded workers, retries / dead set / scheduled / cron, ActiveJob integration, Pro batches, web UI.
- **Best at:** Rails / Ruby background work, scheduled jobs, retry semantics, throughput per process.
- **Worst at:** non-Ruby stacks, exactly-once / strict ordering, long-running workflows (use Temporal).
- **Scale:** thousands of jobs/sec/process; horizontal scale by adding workers; Redis shards if needed.
- **Distributes how:** Redis as the central queue; multiple worker processes pull jobs; UI reads same Redis.
- **Consistency / state:** at-least-once delivery; jobs survive across worker restarts in Redis; SuperFetch for crash safety.
- **Killer alternative:** BullMQ (Node), Celery (Python), Resque (Ruby; older), Good Job / Que (Postgres-backed Ruby), Faktory (language-neutral by Sidekiq's author), Hangfire (.NET), Quartz (Java), Temporal (durable workflows), AWS SQS + Lambda.

## Further Reading
- Official site: <https://sidekiq.org/>
- Wiki: <https://github.com/sidekiq/sidekiq/wiki>
- Best practices: <https://github.com/sidekiq/sidekiq/wiki/Best-Practices>
- ActiveJob Sidekiq adapter: <https://api.rubyonrails.org/classes/ActiveJob/QueueAdapters/SidekiqAdapter.html>
