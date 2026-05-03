---
title: "Backpressure"
description: "How to keep a fast producer from overwhelming a slow consumer — Reactive Streams, bounded queues, load shedding, drop-tail vs drop-head, TCP-style flow control, adaptive concurrency limits, and the Netflix concurrency-limits library."
---

> Topic: Key Concept · Category: Resilience · Difficulty: Foundational

## TL;DR
**Backpressure** is the mechanism by which a slow consumer signals to a fast producer **"I can't keep up — slow down or I'll drop."** Without backpressure, an unbounded queue grows until memory exhausts, latencies skyrocket, and the system collapses. Common implementations: **bounded buffers** (block / drop / fail-fast when full), **TCP-style flow-control credits** (Reactive Streams `request(n)`, gRPC HTTP/2 windows), **load shedding** (return 503/429 when overloaded), **rate limiting** (cap incoming traffic), **adaptive concurrency limits** (Netflix's TCP-Vegas-style RPC concurrency control). The choice between **block, drop oldest, drop newest, drop random, fail upstream** is application-specific.

## What problem does it solve?
- **Unbounded queues are bombs.** A producer 2× faster than the consumer fills RAM in minutes; OOM kills the service.
- **Latency cliff.** A queue of 100K messages doesn't process faster — it just adds 100K × per-message-time of wait.
- **Cascading failure.** Without backpressure, a slow consumer drags down its upstream by holding open connections / threads.
- **Fairness.** No backpressure → loud-noisy-neighbor problem; one tenant fills the queue, others starve.
- **Predictable degradation.** With backpressure, you fail fast and gracefully under overload instead of falling over.

## How it works (the mechanisms)

### 1. Bounded queue with policy
The simplest. Queue with `maxSize`. When full, choose:
- **Block** — producer waits; pushes pressure upstream (TCP-like).
- **Drop newest** — newest message is dropped (used in monitoring; old data still useful).
- **Drop oldest** — oldest is evicted (used in real-time data; freshness matters more).
- **Fail-fast / 503** — return error to caller; caller decides (retry, fall back, give up).

```go
// Go bounded channel
queue := make(chan Job, 1000)

// Producer (drop-newest policy)
select {
case queue <- job:
default:
    metrics.dropped.Inc()
}

// Producer (block policy)
queue <- job   // blocks if full

// Producer (timeout-fail policy)
select {
case queue <- job:
case <-time.After(50 * time.Millisecond):
    return ErrBusy
}
```

### 2. Reactive Streams (pull-based)
The consumer **requests N** items at a time. Producer never sends more than requested.
- **Java:** `Flux.subscribe(s -> s.request(n))` (Project Reactor, RxJava).
- **JavaScript:** Web Streams API (`ReadableStream` with backpressure).
- **Akka Streams:** demand signals upstream.
- **gRPC streaming:** HTTP/2 flow-control windows.

### 3. Adaptive concurrency limits
Treat RPC concurrency like TCP — measure latency; if latency rises, reduce concurrency. **Netflix's `concurrency-limits` library** uses Vegas / Gradient algorithms.

```text
limit = min(limit, current_in_flight)
if latency > target:    limit -= 1   (or *= alpha < 1)
if latency < target:    limit += 1   (or *= alpha > 1)
```

### 4. Load shedding
Server detects overload (queue depth, p99 latency, CPU) and **drops** incoming work fast — return 503/429 immediately. Consumers get backpressure signal.

### 5. TCP flow control / HTTP/2 / gRPC
Built into the protocols. Receiver advertises window size; sender can't send more bytes / frames than the window allows. Free backpressure.

### 6. Rate limiting (cousin pattern)
Cap incoming work to a fixed rate (req/sec). See [Rate Limiting](/docs/45-resilience-patterns/rate-limiting).

## When to use it (real-world examples)
- **Kafka consumers** — `max.poll.records`, `fetch.max.bytes`; consumer can pause partitions; `consumer.pause()` for explicit backpressure.
- **Sidekiq / BullMQ workers** — fixed worker pool size + queue size cap; new jobs block / fail when overloaded.
- **gRPC streaming** — HTTP/2 flow control automatic.
- **Reactive Streams** — Project Reactor / RxJava / Akka Streams; `Flux<T>` request semantics.
- **Web Streams API** — `ReadableStream` controller `desiredSize`.
- **Netflix services** — `concurrency-limits` adaptive RPC concurrency.
- **Envoy / Istio** — `circuit_breakers` config: `max_pending_requests`, `max_requests`, `max_connections`.
- **AWS Kinesis** — `ProvisionedThroughputExceededException` when consumer too slow → producer backs off.
- **Database connection pools** — bounded; new connections block / queue / fail.
- **Stream processors** (Flink, Kafka Streams, Spark Streaming) — built-in backpressure: slow operator slows down source.
- **Logstash / Vector / Fluentd** — bounded buffers with disk-spillover.
- **CDN ingest** — Cloudflare Stream pushes "bandwidth full" to RTMP broadcaster.
- **Cron jobs / scheduled batch** — skip run if previous still running (backpressure on schedule).

## When NOT to use it (or where it hurts)
- **All operations must succeed** — backpressure means dropping or blocking; design for queueing instead (Kafka durable log + at-least-once consumer).
- **Latency-insensitive batch** with abundant resources — let the queue grow; no need to shed.
- **Tiny systems** that never reach load limits — overhead isn't justified.
- **You can scale horizontally** automatically and quickly — sometimes adding workers is faster than backpressure tuning. (But you still need a guard for the autoscale lag window.)

## Things to consider / Trade-offs
- **Drop policy is product decision.** Real-time stock ticker → drop oldest. Order events → never drop, block / fail.
- **Backpressure must propagate.** If service A pressures B, but B doesn't pressure C, C overwhelms B and the chain collapses.
- **Visibility is critical** — emit `queue_depth`, `dropped_total`, `wait_time_ms`, `concurrency_limit`. Backpressure invisible = mystery latency.
- **Block-the-producer creates upstream load** — fine for in-process; dangerous across services without flow control.
- **Async vs sync** — async (queue) systems naturally backpressure via queue depth; sync (RPC) need explicit shedding.
- **Bounded vs unbounded queue** — always bounded in production. "Unbounded" usually means "OOM in production."
- **Memory-bound vs disk-bound queues** — Kafka / Vector spill to disk; in-memory queues OOM.
- **Coordination overhead** — distributed adaptive limits need consensus or per-node decisions; per-node usually sufficient.
- **Tuning** — too aggressive shedding hurts users on transient spikes; too loose lets queues build up.
- **Pair with autoscaling** — backpressure handles burst; autoscaling handles sustained load.
- **Latency / throughput trade** — short queue = low latency, low throughput; long queue = high latency, high throughput.

## Common pitfalls
- **Unbounded queue** — every "we'll just buffer it" turns into an outage.
- **Backpressure that doesn't propagate** — service A applies it, service B (downstream) doesn't; A's input is throttled but B is fine, so capacity is wasted.
- **Drop without metric** — silent data loss is the worst kind.
- **Block forever** — no timeout = thread / goroutine pin-up.
- **Static concurrency limits** — fixed `pool_size = 50` doesn't adapt to dependency speed; adaptive limits handle this.
- **Memory queue + disk-fast consumer** — RAM fills before disk catches up; use disk-backed queue (Vector, Logstash).
- **Trying to "fix" overload by increasing queue size** — moves the problem; doesn't solve it.
- **Round-robin LB without shedding** — overloaded replica still receives traffic.
- **Mixing fail-fast and unbounded retry** — caller fails fast at server, then retries instantly → cycle.

## Interview Cheat Sheet
- **Definition:** consumer signals to producer "slow down" so queues don't blow up.
- **Mechanisms:** bounded queue (block / drop / fail), Reactive Streams credits, TCP windows, load shedding, adaptive concurrency limits, rate limiting.
- **Drop policy:** product decision (newest vs oldest vs fail vs block).
- **Pair with:** rate limiting, circuit breaker, autoscaling, observability.
- **Always bound queues.** Always emit queue depth + drop metrics.
- **Adaptive concurrency limits** (Netflix `concurrency-limits`) > fixed pool sizes for fluctuating downstream perf.
- **End-to-end** — backpressure must propagate the whole chain.

## Related concepts
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — preventive backpressure at ingress.
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — stop calling a failing dependency.
- [Retry & Backoff](/docs/45-resilience-patterns/retry-and-backoff) — slowing down retries during overload.
- Concrete: Kafka consumer, gRPC streaming, Reactive Streams (Reactor / RxJava / Akka), Envoy circuit breakers, Netflix adaptive limits.
