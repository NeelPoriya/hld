---
title: "Retry & Exponential Backoff"
description: "How to retry safely — exponential backoff, jitter, retry budgets, hedged requests, deadline propagation, and the difference between transient and terminal errors. The 'thundering herd of retries' is real and you can cause your own outage."
---

> Topic: Key Concept · Category: Resilience · Difficulty: Foundational

## TL;DR
Networks fail. Most failures are transient. **Retrying** is the most common fix — but naive retries cause **retry storms** that turn a brief downstream blip into a permanent outage. Modern retries use **exponential backoff** (`delay = base * 2^attempt`), **jitter** (random fuzz to spread retries across time), **retry budgets / token buckets** (cap total retry rate), **deadline propagation** (don't retry past the user's timeout), and **hedged requests** (send a second request after p95 instead of waiting for a slow first response). Retries are **only safe for idempotent operations** — see [Idempotency](/docs/44-delivery-semantics/idempotency).

## What problem does it solve?
- **Transient failures dominate** — most distributed-system errors are recoverable with retry: lost packets, brief CPU stalls, leader elections.
- **Latency outliers** — a single slow call can hold up a whole dependency chain.
- **Service mesh / load balancer failovers** — retry on a different replica when the first is unhealthy.
- **Reduces user-visible errors** — done well, retries make a flaky system feel reliable.

## How it works (the algorithms)

### 1. Naive retry (DON'T)
```python
for _ in range(5):
    try: return call(); except: continue
```
A storm of retries hits a recovering service simultaneously and re-tips it.

### 2. Exponential backoff
```python
def call_with_backoff(fn, max_attempts=5, base=0.1):
    for attempt in range(max_attempts):
        try: return fn()
        except RetryableError:
            time.sleep(base * (2 ** attempt))    # 0.1, 0.2, 0.4, 0.8, 1.6
    raise
```
Better — but if many clients fail simultaneously, they ALL retry at exactly `base*2^attempt` → still a storm.

### 3. Exponential backoff + jitter (the right answer)
**Full jitter** (AWS Architecture Blog, "Exponential Backoff and Jitter"):
```python
delay = random.uniform(0, base * 2 ** attempt)
```
**Decorrelated jitter** (often best):
```python
delay = min(cap, random.uniform(base, prev_delay * 3))
```
Spreads retries uniformly across time → no thundering herd.

### 4. Retry budget / token bucket
Cap total retries to e.g. 10% of normal request rate. Once budget exhausted, fail-fast. Prevents retry-induced amplification (every retry is "extra load" on the dependency).

```python
class RetryBudget:
    def __init__(self, ratio=0.1):
        self.tokens = 0
    def can_retry(self):
        return self.tokens > 0
    def on_request(self):
        self.tokens += self.ratio    # earn budget on success
    def on_retry(self):
        self.tokens -= 1             # spend budget
```

### 5. Hedged requests
Used by Google's BigTable, Spanner. Send a second request after `p95` of the first; use whichever returns first. Reduces tail latency dramatically; costs ~5% extra QPS.

### 6. Deadline propagation
The original caller has a deadline (e.g., 1 second from user). Pass that deadline into every downstream call. When deadline expires, **stop retrying.** Prevents amplifying load on already-failed requests.

```python
def call(deadline):
    while time.time() < deadline:
        try: return rpc(deadline=deadline - time.time())
        except: time.sleep(jittered_backoff())
    raise DeadlineExceeded
```

## When to retry (and what to retry on)

| Error type | Retry? |
|---|---|
| Network connect / read / write timeout | ✅ Yes (transient) |
| HTTP 502 / 503 / 504 | ✅ Yes (transient) |
| HTTP 429 (rate limited) | ✅ Yes, after `Retry-After` |
| HTTP 408 (request timeout) | ✅ Yes (idempotent ops only) |
| TCP RST | ✅ Yes |
| HTTP 400 / 401 / 403 / 404 / 422 | ❌ No (terminal) |
| HTTP 409 (conflict) | ❌ Usually no (depends) |
| Application-level "invalid input" | ❌ No |
| DNS resolution failure | ✅ Yes (transient) |
| TLS handshake error | ✅ Yes |
| Out-of-memory / disk full | ❌ No |

## When to use it (real-world examples)
- **All RPC clients** — gRPC, OkHttp, AWS SDK, Stripe SDK retry transient errors.
- **HTTP clients in apps** — Axios `axios-retry`, requests `Retry`, Go `retryablehttp`.
- **Service mesh** — Envoy / Istio retry policy: `retries: 3, retryOn: 5xx,reset`.
- **Background jobs** — Sidekiq / BullMQ / Celery use exponential backoff (Sidekiq's default: `((retry_count ** 4) + 15)` seconds).
- **Webhook delivery** — Stripe / GitHub / Shopify retry up to 3 days with backoff.
- **Database connection retries** — most ORMs retry on connection drop.
- **Kubernetes** — `restartPolicy: Always` with backoff for crashing pods.
- **CI / CD** — flaky test rerun (controversial); flaky deploy step retry.
- **Mobile apps** — offline → online transition retries pending requests.
- **Hedged requests** — Google's tail-latency control; Spanner read RPCs.

## When NOT to retry
- **Non-idempotent operations** without an idempotency key — see [Idempotency](/docs/44-delivery-semantics/idempotency).
- **Long-tail errors** — 401, 404, 422 — retrying won't help.
- **The error is ours** — bug in client code; retrying won't fix code.
- **At maximum retry budget** — fail fast to protect downstream.
- **The user has already gone away** — past deadline.
- **Synchronous user-facing path with strict latency budget** — 1 retry MAX; rely on hedging instead.
- **You're the upstream of a hot path that's overwhelmed** — retrying makes it worse; back off entirely (circuit breaker).

## Things to consider / Trade-offs
- **Retry × downstream latency × concurrency = load amplification.** A 3× retry policy on a 50%-failure-rate downstream creates 4× load and prevents recovery.
- **Always pair retry with timeout** — no retry without a fixed deadline.
- **Always pair retry with circuit breaker** — once breaker opens, stop retrying.
- **Always pair retry with idempotency** — for mutating operations.
- **Cap max attempts** — usually 3–5 for sync, more for async.
- **Cap max delay** — exponential blows up; cap at 30s–60s.
- **Add jitter** — full jitter or decorrelated jitter; never deterministic.
- **Differentiate transient vs terminal errors** — never retry 4xx (except 408 / 429).
- **Honor `Retry-After`** — the server is telling you when to come back.
- **Exponential vs linear** — exponential when retries amplify load; linear if retries are cheap.
- **Async vs sync** — for sync user requests, fewer / faster retries; for async (background jobs), more / longer.
- **Per-attempt deadline vs total deadline** — both matter. Don't let attempt 5 take forever.
- **Server side fast-fail** — if you're being overloaded, return 429 / 503 fast so clients back off.

## Common pitfalls
- **Retry storms** — the canonical outage. Naive retries on a brief downstream blip create permanent overload.
- **Retrying non-idempotent POSTs** — duplicate orders / charges / emails.
- **No jitter** — synchronized retries from many clients defeat the purpose.
- **No max attempts** — retries run forever; resource leak.
- **Per-call deadline ignored** — caller waits 30s for a request the user gave up on at 1s.
- **Retrying terminal errors** — 401 / 422 / 404 — wastes resources, no chance of success.
- **Retry inside retry** — service mesh retries 3× while client retries 3× = 9× load.
- **Catching all exceptions** — including programming errors, OOM, etc.; retry only specific transient errors.
- **Forgetting to cap delay** — `2^10 = 17 minutes`; user has long since left.
- **Not coordinating with circuit breaker** — retry while breaker is open is wasted work.

## Interview Cheat Sheet
- **Algorithm:** exponential backoff with **full jitter** or **decorrelated jitter**.
- **Recipe:** `delay = random(0, min(cap, base * 2^attempt))`.
- **Pair with:** timeout, circuit breaker, idempotency, deadline propagation, retry budget.
- **Max attempts:** 3–5 sync, more for async / background jobs.
- **Retry on:** network errors, 5xx, 408, 429 (with Retry-After).
- **Don't retry on:** 4xx (except 408/429), terminal errors, OOM, programming bugs.
- **Hedged requests** for tail-latency reduction (Google / Spanner).
- **Real implementations:** Sidekiq exponential, AWS SDK adaptive, Envoy `retry_policy`, gRPC retry policy, OkHttp interceptors.

## Related concepts
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — stop retrying entirely when downstream is dead.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — required for safe retries on mutations.
- [Backpressure](/docs/45-resilience-patterns/backpressure) — when to slow down upstream callers.
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — applied alongside retry on the server side.
- Reading: AWS Architecture Blog, *Exponential Backoff and Jitter* (Marc Brooker, 2015).
