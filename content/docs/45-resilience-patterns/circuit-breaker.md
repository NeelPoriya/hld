---
title: "Circuit Breaker"
description: "The pattern that stops a failing downstream service from taking your whole system down — Closed / Open / Half-Open states, the Hystrix model, modern implementations in Resilience4j, Polly, gRPC, Envoy, Istio."
---

> Topic: Key Concept · Category: Resilience · Difficulty: Foundational

## TL;DR
A **circuit breaker** wraps a call to a remote service and tracks recent failures. After failures cross a threshold, the breaker **opens** — subsequent calls fail fast (no network round-trip) for a cooldown window. After cooldown, it transitions to **half-open** and lets a single trial request through; on success it **closes** back to normal; on failure it re-opens. The pattern prevents:
- **Cascading failures** — a slow dependency dragging down all upstream services.
- **Thread / connection exhaustion** — every request stuck on a 30s timeout pins resources.
- **Wasted retries** against a service that's clearly down.

Originally popularized by **Netflix Hystrix** (now in maintenance); modern implementations: **Resilience4j** (Java), **Polly** (.NET), **gobreaker** (Go), **Envoy / Istio** outlier detection, **gRPC** retry+circuit-breaker policies, AWS SDK, Spring Cloud Circuit Breaker.

## What problem does it solve?
- **Cascading failures.** When service B is down and service A doesn't notice, every A request piles up waiting on B; A's threads / event loop saturate; A goes down too. The breaker short-circuits A → B.
- **Slow dependency = worse than fast failure.** A 30s hung call holds a thread; better to fail in 1ms with a fallback.
- **Hammering a recovering service** — flooding a service that's mid-recovery with retries can re-tip it over.
- **Honest backpressure to upstream callers** — telling them fast that "this dependency is down" is more useful than "your request is timing out."

## How it works (the state machine)

```text
        failures > threshold within window
   ┌───────────────────────────────────────┐
   │                                       v
   │                                  ┌─────────┐
   │                                  │  Open   │  (fail fast,
   │                                  │         │   no calls)
   │                                  └────┬────┘
   │                                       │
   │                              cooldown elapsed
   │                                       │
   │                                       v
   │                                ┌────────────┐
   │  trial request fails          │ Half-Open  │
   │ ◄──────────────────────────────┤            │
   │                                └─────┬──────┘
   │                                      │ trial succeeds
   │                                      v
   ┌──────────┐                       ┌────────┐
   │  Closed  │  ◄────────────────────┤ Closed │
   └──────────┘                       └────────┘
```

- **Closed (normal):** calls flow; failures counted in a sliding window.
- **Open (tripped):** calls fail immediately with `CircuitBreakerOpenException`; emit metric / fallback runs.
- **Half-open (probing):** allow N trial calls. If all succeed → Close. Any failure → Open + reset cooldown.

### Trip conditions
- **Count-based:** "5 failures in last 10 calls."
- **Time-based:** "≥50% failure rate in last 30s, with at least 20 calls."
- **Latency-based:** "p95 latency > 500ms over last 60s" — slow calls are also failures.

## When to use it (real-world examples)
- **Calls to flaky third-party APIs** — Stripe, Twilio, Google Maps, internal "shaky" service.
- **Microservice-to-microservice calls** — Netflix's original use case; preventing one service from killing the cascade.
- **Database connection pools** — when DB is unhealthy, fail-fast app calls instead of waiting on connection timeouts.
- **External integrations with SLAs** — fail-fast preserves the SLA on the rest of your traffic.
- **Service mesh** — Istio / Linkerd / Envoy do "outlier detection" — auto-eject unhealthy upstream pods (a form of CB).
- **gRPC clients** — pluggable circuit breakers; AWS SDK has built-in.
- **Mobile apps calling backends** — fail fast in offline mode; show cached data.
- **Bulk import pipelines** — when target API rate-limits, breaker opens to back off.
- **Search query backends** — fall back to cache or simpler heuristic when ML model is down.
- **Recommendation systems** — fall back to popular-items when personalization is down.

## When NOT to use it
- **Calls within the same process** — function calls don't fail like network calls.
- **Operations that must always succeed eventually** — payments, billing reconciliation; queue + idempotent retry instead.
- **Single-call scripts / batch jobs without volume** — overhead isn't justified.
- **You don't have a fallback** — opening the breaker just shifts the failure to "no response at all"; design fallback first.
- **High-throughput, single-request-cost-low calls** — breaker overhead may dominate.

## Things to consider / Trade-offs
- **Fallback strategy** — what does the breaker return when open? Options: cached value, default value, simpler heuristic, error to user. Failure to design a fallback means "open" is just "everything fails fast" — only marginally better than "everything times out."
- **Per-host vs per-service** — break per upstream pod (Envoy outlier detection) or per logical service?
- **Sliding window:** count-based vs time-based.
- **Bulkheading** — separate thread pools / connection pools per dependency so one pool exhaustion doesn't block others.
- **Hedging + CB** — Envoy lets you both retry on slow + circuit-break on too-slow.
- **Granularity** — break per `(service, endpoint, region)` not just per service.
- **Library choice** — Resilience4j (modern, lightweight), Polly (.NET), gobreaker (Go), Hystrix (deprecated).
- **Observability** — emit `circuit_open_total{service}` to alerting; nothing worse than a silently-tripped breaker.
- **Coordination across replicas** — local breakers diverge; global state (in Redis) coordinates but adds latency. Usually not worth it.
- **Thresholds** — too tight (e.g., 1 failure trips) → breaker flaps; too loose → never opens. Start with 50% failure rate over 20+ requests.
- **Cooldown window** — too short (1s) doesn't let downstream recover; too long (60s) keeps fallback active longer than needed. 5–30s is typical.

## Common pitfalls
- **Breaker without fallback** — opens, returns "circuit open" error to users; same UX as a timeout.
- **Single global breaker for all endpoints** — one slow endpoint trips the breaker for healthy ones.
- **Treating slow calls as success** — define latency-based failure too.
- **Re-tripping the breaker on every recovery attempt** — only one trial request in half-open state.
- **Breaker on idempotent retries only** — non-idempotent operations need extra care; circuit-break before retrying mutating calls.
- **Forgetting to test the open path** — your fallback code is only exercised under failure; chaos-test it.
- **Per-replica breakers without alerting** — one replica's breaker is open; load balancer happily routes around but you don't notice the partial degradation.
- **Stale config** — breaker thresholds live in code but the dependency's SLA changed; tune over time.

## Interview Cheat Sheet
- **Three states:** Closed (normal), Open (fail-fast), Half-Open (probing).
- **Trip on:** failure rate, count, or latency over a sliding window.
- **Cooldown:** 5–30s typical; let downstream recover.
- **Half-open:** allow 1+ probe; success → Close, failure → Open.
- **Pair with:** **fallback** (cached / default / degraded), **bulkhead** (separate pools), **timeout** (always — no retry without timeout), **retry with backoff** (only for idempotent ops).
- **Where:** Hystrix (legacy), Resilience4j, Polly, gobreaker, Envoy outlier detection, gRPC, AWS SDK, Istio / Linkerd.
- **Killer alternative / refinement:** load shedding + adaptive concurrency limits (TCP-style flow control for RPCs).

## Related concepts
- [Retry & Backoff](/docs/45-resilience-patterns/retry-and-backoff) — companion; CB is "stop retrying entirely."
- [Backpressure](/docs/45-resilience-patterns/backpressure) — pushing failure information upstream.
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — prevents *you* from overwhelming downstream.
- Concrete tools: Resilience4j, Polly, Hystrix, Envoy, Istio, Linkerd, gRPC, AWS SDK.
