---
title: "Rate Limiting"
description: "How to cap request rates — token bucket, leaky bucket, fixed window, sliding window, sliding-window log; per-IP / per-user / per-tenant; distributed rate limiting in Redis; tradeoffs of each algorithm."
---

> Topic: Key Concept · Category: Resilience · Difficulty: Foundational

## TL;DR
**Rate limiting** restricts the rate at which a client can perform an action (e.g., 100 requests / minute). Used for **abuse prevention**, **fairness**, **cost control**, **DDoS defense**, **API tier enforcement**, **protecting downstream**. The four canonical algorithms are **token bucket** (allows bursts up to bucket size), **leaky bucket** (smooths bursts to constant rate), **fixed window** (count in current minute; cheap; jagged at boundaries), and **sliding window** (smooths boundary issues; more state). Distributed rate limiting commonly runs in **Redis** (with Lua scripts for atomicity); cloud APIs often layer it at the CDN / API gateway. Rate limits are exposed to clients via `X-RateLimit-Limit / -Remaining / -Reset` headers + HTTP **429 Too Many Requests** + `Retry-After`.

## What problem does it solve?
- **Abuse / DDoS** — single IP or token making a million requests / minute.
- **Cost control** — pay-per-call APIs (OpenAI, Stripe) limit your spend.
- **Fairness across tenants** — one big customer can't starve others.
- **Protecting downstream** — your DB / API / third-party can only handle X req/s.
- **Tiered pricing** — free tier 100/min, pro tier 10K/min.
- **Compliance / quota** (e.g., Twilio messaging law-mandated rate caps).

## How it works (the algorithms)

### 1. Token bucket
- Bucket holds up to `B` tokens; refilled at rate `R` per second.
- Each request consumes 1 token; if bucket empty → reject.
- **Allows bursts up to B; long-term rate ≤ R.**

```python
class TokenBucket:
    def __init__(self, rate, burst):
        self.rate = rate          # tokens / sec
        self.burst = burst
        self.tokens = burst
        self.last = time.time()

    def allow(self):
        now = time.time()
        self.tokens = min(self.burst, self.tokens + (now - self.last) * self.rate)
        self.last = now
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
```

Used by **Stripe API, AWS API Gateway, NGINX `limit_req`, Cloudflare WAF, Envoy local rate limit**.

### 2. Leaky bucket
- Requests drip out at constant rate `R`; if bucket fills → reject.
- **Smooths bursts to constant output rate** (no bursts allowed).
- Like token bucket but viewed as outflow constraint instead of inflow allowance.

Used by **traffic shaping, audio / video buffer flow control**.

### 3. Fixed window counter
- For each window (e.g., minute), count requests; reject when count ≥ limit.
- **Simple + cheap** but jagged at boundaries: a client can do `2×limit` in 1 second by hitting the end of one window + start of next.

```python
key = f"rate:{user_id}:{minute_now()}"
count = redis.incr(key)
if count == 1: redis.expire(key, 60)
if count > limit: raise RateLimited
```

### 4. Sliding window log
- Store timestamps of each request in a sorted set; count those in last 60s.
- **Accurate but stores every request.**

```python
key = f"rate:{user_id}"
now = time.time()
redis.zadd(key, {str(uuid4()): now})
redis.zremrangebyscore(key, 0, now - 60)
if redis.zcard(key) > limit: raise RateLimited
```

### 5. Sliding window counter (the practical sweet spot)
- Two counters: previous window count + current window count.
- Estimated rate = `current + (previous * (1 - elapsed_in_current_window / window_size))`.
- Smooth at boundaries; cheap memory.

Used by **Cloudflare**, **Envoy global rate limit**, many production systems.

## When to use it (real-world examples)
- **Public REST APIs** — Stripe (1000 req/sec/account), GitHub (5000/hour authenticated), Twitter (varies), GraphQL APIs.
- **CDN / edge** — Cloudflare Rate Limiting Rules, AWS WAF rate-based rules, Fastly.
- **Login / auth endpoints** — prevent brute force (e.g., 5 failed logins / IP / 15 min).
- **Email / SMS sending** — Twilio queues + caps; SendGrid daily limit.
- **OpenAI / Anthropic / Bedrock APIs** — token-bucket per-key.
- **Internal microservice quotas** — fairness across teams.
- **Webhook delivery** — outgoing rate cap to prevent overwhelming receiver.
- **Mobile push** (FCM, APNs) — provider-imposed limits + your local backpressure.
- **Background jobs** — BullMQ / Sidekiq Enterprise limit jobs/sec per queue or group.
- **Search engines / scrapers** — `robots.txt` + crawl-delay + per-host concurrent limits.
- **Multi-tenant SaaS** — per-tenant rate caps tied to plan.
- **Voting / signup / coupon redemption** — abuse prevention.

## When NOT to use it
- **Internal-only deployments** with trusted callers — adds latency, not value (unless protecting a fragile downstream).
- **You don't actually have a downstream constraint** — limits frustrate users without protecting anything.
- **You're solving the wrong problem** — sometimes you need backpressure, not rate limiting (rate limit = cap; backpressure = adaptive).
- **One-shot scripts / batch jobs** with predictable load.

## Things to consider / Trade-offs
- **Granularity** — global, per-IP, per-user, per-API-key, per-tenant, per-endpoint, per-(IP, endpoint). Choose based on what you're defending.
- **Algorithm choice:**
  - Bursty allowed: **token bucket**.
  - Smooth output: **leaky bucket**.
  - Cheap, slightly inaccurate: **fixed window**.
  - Accurate + cheap: **sliding window counter**.
  - Most accurate: **sliding window log** (expensive).
- **Distributed counters** — Redis with Lua atomic script (most common); or specialized (Envoy global RL, AWS WAF).
- **Per-IP vs per-user** — IP shared (NAT / mobile carriers); user requires auth; combine: IP for unauth + user for auth.
- **Headers** — return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.
- **HTTP status** — 429 Too Many Requests (preferred) or 503 (overload).
- **Soft vs hard** — soft = log-and-allow; hard = reject. Mix for canary / monitoring.
- **Bursts vs sustained** — token bucket gives burst; leaky bucket forbids burst.
- **Local vs central** — local rate limits per-replica are fast but inaccurate; central in Redis is accurate but adds latency.
- **Hierarchy** — apply at multiple layers (CDN → API gateway → service → DB) for defense in depth.
- **Bypass for trusted clients** — internal traffic / admin tokens.
- **Plan-based** — rate as a function of subscription tier.
- **Cost** — each rate-limit check is overhead; batch / sample where possible.
- **Failure mode** — what happens when Redis is down? Fail-open (allow all) or fail-closed (reject all)? Usually fail-open for availability.

## Distributed rate limiting (with Redis Lua)
```lua
-- Atomic token bucket script
local key   = KEYS[1]
local rate  = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local now   = tonumber(ARGV[3])

local data = redis.call("HMGET", key, "tokens", "last")
local tokens = tonumber(data[1]) or burst
local last   = tonumber(data[2]) or now

tokens = math.min(burst, tokens + (now - last) * rate)
local allowed = tokens >= 1
if allowed then tokens = tokens - 1 end

redis.call("HMSET", key, "tokens", tokens, "last", now)
redis.call("EXPIRE", key, 60)
return allowed and 1 or 0
```

## Common pitfalls
- **Per-IP rate limit on shared-NAT users** — blocks innocent users on corporate / mobile networks.
- **Fixed window boundary spikes** — client sends 2× limit in 1 second by hitting the boundary; use sliding window.
- **Counter race conditions** — `GET` + `IF` + `SET` instead of atomic `INCR` / Lua → off by N.
- **No `Retry-After`** — client guesses; usually retries too soon → spirals.
- **Leaky shared limiter** — separate replicas with separate counters; allows N× the limit (use central counter or accept loose enforcement).
- **Limit too tight** — frustrates legitimate users.
- **Limit too loose** — doesn't protect anything.
- **Forgetting login endpoints** — credential stuffing attacks.
- **Same key for unauth + auth** — switching users on same IP shouldn't reset the limit.
- **Hard rate limit on health checks / admin** — accidentally locks out monitoring.
- **Rate limit that fails closed when Redis is down** — outage in Redis = whole API down.

## Interview Cheat Sheet
- **Four algorithms:** token bucket (bursts), leaky bucket (smoothed), fixed window (cheap), sliding window (accurate).
- **Default:** token bucket per `(user_id OR ip, endpoint)`, sliding-window-counter accuracy if needed.
- **Implementation:** Redis with atomic Lua script.
- **Layers:** CDN (DDoS) → API gateway (per-IP, per-key) → service (per-tenant) → DB (connection cap).
- **Headers:** `X-RateLimit-*`, `Retry-After`, **HTTP 429**.
- **Pair with:** circuit breaker (downstream protection), backpressure (queue depth), retry budgets.
- **Real systems:** Stripe (token bucket), Cloudflare Rate Limiting (sliding window), GitHub (fixed-hour), AWS WAF, NGINX `limit_req` (leaky bucket), Envoy global RL, OpenAI tokens-per-minute.

## Related concepts
- [Backpressure](/docs/45-resilience-patterns/backpressure) — adaptive cousin; cap by capacity, not fixed rate.
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — protects callers; rate limiting protects callees.
- [Retry & Backoff](/docs/45-resilience-patterns/retry-and-backoff) — clients retry after 429 with backoff.
- Concrete: Stripe / GitHub APIs, Cloudflare Rate Limiting, AWS WAF, NGINX `limit_req`, Envoy local + global rate limit, Redis-cell module, `gubernator`, `redis-rate-limiter`.
