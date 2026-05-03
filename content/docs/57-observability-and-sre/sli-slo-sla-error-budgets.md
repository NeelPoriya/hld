---
title: "SLI, SLO, SLA & Error Budgets"
description: "The Google SRE vocabulary every senior engineer must speak — Service Level Indicator (the metric), Objective (the target), Agreement (the contract). Error budgets turn reliability into a quantifiable trade against feature velocity."
---

> Topic: Key Concept · Category: Observability & SRE · Difficulty: Foundational

## TL;DR
- **SLI (Service Level Indicator)** — a **measured** metric of service health. "p99 latency under 200ms" or "successful HTTP responses / total HTTP responses."
- **SLO (Service Level Objective)** — a **target** for that metric. "99.9% of requests succeed in a rolling 28-day window."
- **SLA (Service Level Agreement)** — a **contract** with consequences (refunds, credits) if SLO breached.
- **Error budget** — `1 - SLO`. With 99.9% SLO, you have **0.1% × time = 43.2 minutes of "allowed downtime" per month**. Spend it however you want — failed deploys, planned maintenance, code bugs.

The Google SRE framing: **"Reliability is a feature; error budget makes it negotiable against velocity."** When you blow the budget, freeze risky changes; when you have budget left, ship faster.

## What problem does it solve?
- **Operational arguments are subjective** — "the site is slow" vs "we agreed 99.9% < 200ms p99."
- **Reliability vs velocity trade** is invisible without quantifying it. Error budgets make it explicit.
- **Customer-facing reliability promises** need a definition you can measure.
- **Internal alerting** — alert when SLO is at risk, not on every blip.
- **Investment decisions** — "we're at 99.91%, do we invest in HA?" vs "we're at 99.0%, this is a fire."

## How they relate

```text
   Real user experience  ─►  SLI (measured)  ─►  SLO (target)  ─►  SLA (contract)
                                  │                   │                  │
                                 What            What we           What we
                                we measure       promise           legally owe
                                                ourselves          customers
```

Typical:
- **SLI:** "Successful API requests / Total API requests" (success ratio).
- **SLO:** "99.9% over 28 days."
- **SLA:** "99.5% per month or 10% credit." (looser than SLO; gives ops room.)

## How to define them

### Pick SLIs that match user pain
Categories from Google's "Four Golden Signals":
- **Latency** — how long requests take. (p50, p95, p99, p99.9.)
- **Errors** — fraction failing.
- **Traffic** — RPS / QPS.
- **Saturation** — how full the service is (CPU, memory, queue).

For HTTP services, common SLIs:
- **Availability:** `(2xx + 3xx + 4xx-not-our-fault) / total`. *(careful: 4xx is often the user's fault, so include in numerator.)*
- **Latency:** `requests with response time < threshold / total`.
- **Throughput:** `request rate / planned capacity`.

For pipelines / jobs:
- **Freshness:** "data is at most 5 min old."
- **Correctness:** "0 missing rows."
- **Coverage:** "% of expected partitions present."

### Pick SLOs that match business stakes
- Internal dev tools: 99% may be plenty.
- User-facing core flows: 99.9% (3 nines) typical.
- Critical infrastructure: 99.99% (4 nines) — expensive.
- Bank tier 1 ledger: 99.999% (5 nines) — extreme cost.

### Set SLAs LOOSER than SLOs
The SLA is a **legal commitment** with refunds; the SLO is your **internal target**. Aim for the SLO; if you exceed it slightly, you still meet SLA. Common pattern:
- SLO: 99.95%.
- SLA: 99.9%.
- Error budget: ~21 min/month (off SLO).
- SLA breach budget: ~43 min/month.

## Error budget math

| SLO | Allowed downtime / month | Allowed / week | Allowed / day |
|---|---|---|---|
| 99.0% | 7h 18m | 1h 41m | 14m 24s |
| 99.5% | 3h 39m | 50m | 7m 12s |
| 99.9% | 43m 49s | 10m 4s | 1m 26s |
| 99.95% | 21m 54s | 5m 2s | 43s |
| 99.99% | 4m 22s | 1m | 8.6s |
| 99.999% | 26.3s | 6s | 0.86s |

**5 nines is brutal.** 26 seconds per month of allowable downtime.

## When to use it (real-world examples)
- **Public APIs** — Stripe / Twilio publish SLAs; SLOs internally tighter.
- **Customer-facing core flows** — login, checkout, search.
- **Internal platform services** — CI / CD, deploy systems with internal SLOs.
- **Cloud providers** — AWS / GCP / Azure SLAs on every service.
- **B2B SaaS** — uptime SLAs are part of enterprise contracts.
- **Streaming / data pipelines** — freshness SLOs ("data lag < 5 min").

## When NOT to use it
- **Internal hackathon / prototype** — overhead isn't worth it.
- **Trivially small system** — manual eyeballing suffices.
- **Alerting on every metric** without defined SLO — paging fatigue.
- **Pre-launch products** — too volatile to set targets.
- **"100%" SLOs** — physically impossible; 5 nines costs millions.

## Things to consider / Trade-offs

### Picking SLIs
- **From the user's perspective.** Internal CPU isn't an SLI; user-perceived latency is.
- **Customer-facing** > **infra-internal.** Don't SLO on machine-level signals.
- **Bucketize properly.** "p99 latency < 200ms" is a single number; users see distributions.
- **Per-endpoint** — homepage and checkout have different acceptable latencies.
- **Per-tenant** — enterprise customer wants their own SLOs.

### Setting SLOs
- **Aspirational vs achievable.** 99.99% sounds great until you realize what it costs.
- **Match user expectations.** Most users don't notice 99.9% vs 99.95%.
- **Window matters.** 28-day rolling vs calendar month vs 7-day.
- **Cost grows non-linearly with each 9.**

### Error budget management
- **Burn rate alerting** — alert when burning N× faster than budget allows. "If we keep this rate, we'll exhaust budget in 2 hours."
- **Error budget freeze** — when budget is exhausted, freeze risky launches.
- **Error budget incentive** — gives engineering team room to ship; ops team room to fix.
- **Budget should regenerate** — rolling 28-day windows; bad week recovers.

### SLA vs SLO
- SLA = customer contract.
- SLO = internal target.
- Always SLO < (more strict than) SLA.
- Public SLAs vary: AWS S3 = 99.9%, AWS RDS Multi-AZ = 99.95%, GCP Compute = 99.99%.

### Don't confuse with...
- **Mean Time Between Failures (MTBF)** — not the same; SLO is fraction; MTBF is interval.
- **Mean Time To Recovery (MTTR)** — operational metric, not SLO.
- **Six Sigma quality** — borrowed but not identical.

### Reporting & dashboards
- Long-window SLO compliance.
- Burn rate alerts (multi-window: 1h, 6h, 24h, 3d).
- Rolling error budget remaining.
- Per-endpoint / per-tenant breakdowns.
- Customer-facing status pages (SLA-relevant).

## Common pitfalls
- **Internal-only SLIs** — measuring CPU instead of user-perceived latency.
- **Over-monitoring** — every metric is alertable; nobody acts.
- **No SLO** — alerts fire constantly; team ignores them.
- **100% target** — unreachable; sets up failure; wastes engineering effort.
- **Single SLI** — average latency hides p99 catastrophes.
- **Ignoring traffic distribution** — read SLO is fine, but write SLO is broken.
- **No customer mapping** — SLO violations don't map to customer impact.
- **Budget exhausted but team ships anyway** — defeats the purpose.
- **No multi-window burn rate alerts** — slow burns invisible until budget gone.
- **Yearly SLO without rolling windows** — January outage gets "averaged" away.
- **SLA = SLO** — no margin for honest mistakes.
- **No incident learning loop** — every breach should improve the system.
- **Defining SLI from logs without proper sampling** — inaccurate.
- **Mixing "good" and "bad" 4xx in availability** — users-error vs server-error.

## Interview Cheat Sheet
- **SLI** = measured signal. **SLO** = target. **SLA** = customer contract.
- **Error budget = 1 - SLO** = how much you can fail without breaking your promise.
- **99.9% / month = 43m budget**; 99.99% = 4m22s.
- **Pick SLIs that match user experience**, not internal infra.
- **Set SLOs less aggressive than SLA** — give yourself margin.
- **Burn-rate alerts**, not per-failure pages.
- **Each "9" costs 10x more.** Don't promise 99.999% unless you can pay for it.
- **Google SRE Book / "Implementing SLOs"** is the canon — read it.
- **Killer phrase:** "Reliability is a feature with an error budget — when budget is healthy, we ship; when exhausted, we freeze and stabilize."

## Related concepts
- [Failure Detection & DR](/docs/59-failure-detection-and-dr/heartbeats-and-health-checks) — what you're measuring.
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — defense for error budgets.
- [Deployment Strategies](/docs/58-deployment-and-release/deployment-strategies) — canary protects budget.
- Concrete: [Grafana](/docs/20-observability/grafana), [OpenTelemetry](/docs/20-observability/opentelemetry), [Jaeger](/docs/20-observability/jaeger), [Prometheus](/docs/07-time-series-databases/prometheus).
