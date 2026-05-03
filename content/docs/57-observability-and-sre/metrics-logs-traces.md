---
title: "Metrics, Logs & Traces (Three Pillars)"
description: "The three observability data types — metrics (time-series of numbers), logs (text events), traces (causal request paths). What each is good for, where they overlap, and the OpenTelemetry-driven future of unified pipelines."
---

> Topic: Key Concept · Category: Observability & SRE · Difficulty: Foundational

## TL;DR
Three data shapes for observing systems:
- **Metrics** — numerical time series (`http_requests_total`, `cpu_seconds_total`). **Cheap, queryable, dashboardable.** Best for SLO calculations + alerting. Limited cardinality; can't drill into individual events.
- **Logs** — discrete text events (`{"ts":"...", "level":"error", "user_id": 42, "msg":"..."}`). **High cardinality + free-form**, hard to aggregate at scale, expensive to store. Best for forensics + debugging.
- **Traces** — causal record of one request's path through services (`span(api) → span(auth) → span(db)`). Show **where time was spent + which service was the bottleneck**. Best for latency debugging in microservices.

Modern systems use **all three**, ideally **correlated** by IDs (trace_id in logs, exemplars in metrics) so you can pivot between them. **OpenTelemetry** is the emerging vendor-neutral standard for instrumentation across all three.

## What problem does each solve?

### Metrics
- **SLO computation** — "99.9% of requests succeeded."
- **Alerting** — burn rate / threshold-based.
- **Capacity planning** — historical trends.
- **High-volume aggregation** — counts, latencies, rates.
- **Cheap long retention** — years of data possible.

### Logs
- **Forensics** — what exactly happened during incident X?
- **Audit trail** — security / compliance.
- **Debugging** — print-style "here's what happened."
- **High-cardinality data** — per-user, per-tenant, per-request_id.
- **Free-form** — no schema upfront.

### Traces
- **Distributed system debugging** — which service is the bottleneck?
- **Latency breakdown** — span-level timing.
- **Request flow visualization.**
- **Service dependency mapping.**
- **Tail latency analysis.**

## How they work

### Metrics
- **Time-series database** — Prometheus (pull), InfluxDB / TimescaleDB (push), Datadog, NewRelic.
- **Cardinality** = unique combination of metric name + labels. `http_requests_total{method=GET, status=200, route=/api/users}` — bound this; high cardinality blows up storage.
- **Counter** (monotonic), **gauge** (point-in-time), **histogram** (distribution buckets), **summary** (quantiles).
- **PromQL / MetricsQL / Flux** — query languages for slicing.
- **Pull vs push** — Prometheus scrapes endpoints; StatsD-style pushes to collector.
- **Retention** — raw at high resolution for days; downsampled for years.

### Logs
- **Structured logs** — JSON / protobuf with fields, not free-form strings.
- **Log levels** — DEBUG, INFO, WARN, ERROR, FATAL.
- **Pipelines** — app → Fluentd / Vector / Logstash → ElasticSearch / Loki / Splunk / Datadog Logs / CloudWatch Logs.
- **Sampling** — at high volume; head sampling (drop at source) or tail (keep "interesting" ones).
- **Indexed vs unindexed** — Loki indexes only labels; ElasticSearch indexes full text.
- **Retention** — typically days-to-weeks (expensive at scale).

### Traces
- **Span** = unit of work; has start, end, name, attributes.
- **Trace** = root span + all child spans across services.
- **Trace ID** propagated via HTTP headers (`traceparent`, W3C Trace Context).
- **Sampling**:
  - **Head-based** — decide at request start (1% / dynamic).
  - **Tail-based** — buffer all spans; decide at end (e.g., keep all traces > 500ms).
- **OpenTelemetry / Jaeger / Tempo / Honeycomb / Lightstep / X-Ray.**

## Comparison

| Aspect | Metrics | Logs | Traces |
|---|---|---|---|
| **Shape** | Numerical time series | Text events | Causal span tree |
| **Cardinality** | Low (bounded labels) | High (per-event) | High (per-trace) |
| **Cost / event** | Tiny (aggregated) | Medium-high | Medium-high |
| **Best for** | Alerting, SLO, dashboards | Forensics, audit, debugging | Latency breakdown, service-graph |
| **Query** | PromQL etc. | Search / filter (Lucene, LogQL) | Trace UI (waterfall) |
| **Long retention** | Years (cheap) | Weeks (expensive) | Days (sample heavily) |
| **Used by** | Prometheus, Datadog, NewRelic | Splunk, ELK, Loki | Jaeger, Tempo, Honeycomb |

## How they correlate

```text
   Metric: http_request_duration_seconds_bucket{...}  → exemplar: trace_id=abc123
                                                                       │
                                                                       ▼
   Click trace_id → see full distributed trace in Jaeger / Tempo
                                                                       │
                                                                       ▼
   Click span → see related logs (filtered by trace_id) in Loki / ELK
```

This three-way pivot is the **goal of modern observability** — each pillar enriches the others.

## When to use each (real-world examples)

### Metrics
- **All production services** — basic Golden Signals (latency, traffic, errors, saturation).
- **SLO dashboards** — Grafana over Prometheus.
- **Alerting rules** — burn rate, threshold.
- **Capacity planning.**
- **Business KPIs** — sign-ups / sec, $ / hour.

### Logs
- **Authentication / audit events** — every login attempt.
- **Security events** — failed access, privilege escalation.
- **Exception / error stacks.**
- **Per-request debugging** during incidents.
- **Compliance** (SOX, HIPAA, PCI).
- **Anomaly investigation.**

### Traces
- **Microservice debugging** — "checkout took 3s; where?"
- **Tail latency analysis** — p99 outliers.
- **Service dependency graph.**
- **A/B testing performance.**
- **Distributed transaction analysis.**

## Things to consider / Trade-offs

### Metrics
- **Cardinality explosion** — one user_id label per metric blows up storage. Bound to ~thousands of unique label combos.
- **Resolution / retention trade** — 15s resolution for 30d; 5min for 1yr.
- **Pull (Prometheus) vs push (StatsD/OpenTelemetry)** — pull is reliable + simple; push needs collector.
- **Aggregation** — quantiles are not aggregable across instances; histograms are.
- **Naming convention** — `_seconds`, `_bytes`, `_total` (counter), `_info` (labels-only).
- **Recording rules** — pre-compute expensive queries.

### Logs
- **Volume vs cost** — TB / day common at scale; sampling required.
- **Structured > unstructured** — JSON is queryable; text is grep-only.
- **Async logging** — never block request on log write.
- **Sensitive data redaction** — emails, tokens, PII; mask at source.
- **Trace ID injection** — every log line in a request should carry trace_id.
- **Log levels** discipline — DEBUG in dev, INFO + ERROR in prod, ERROR + FATAL alerted.
- **Centralization** — local logs are useless after the pod is gone.
- **High-cardinality vs sampling** — keep ERROR; sample INFO.

### Traces
- **Sampling is mandatory at scale** — 1-10% head sampling is typical.
- **Tail sampling** keeps interesting traces (slow / errored).
- **Context propagation** — `traceparent` header through every hop, including async.
- **Span attributes** — service, operation, duration, error, custom (user_id?).
- **Cardinality of span attributes** — be careful; same as metrics.
- **Cost** — full traces are expensive; sample.
- **OTel auto-instrumentation** — Java, Python, Node.js have great auto-coverage.
- **Async / queue boundaries** lose trace context unless propagated explicitly.

### General
- **OpenTelemetry** is the unified standard — instrument once, export to many backends.
- **Vendor neutrality** — OTLP protocol; switch backend without re-instrumenting.
- **PII / GDPR** — every pillar can leak; mask sensitive fields at source.
- **Cost discipline** — observability bills can rival compute. Sample, drop, alert.

## Common pitfalls
- **Logging at INFO in tight loops** — log volume explodes.
- **High-cardinality label** in Prometheus (`user_id`) — TSDB OOM.
- **No trace context in logs** — can't correlate.
- **Trace sampling missing the slow ones** — always sample errors + slow.
- **No service.name attribute** — can't group spans.
- **Metrics on "events" instead of counters / histograms** — wrong shape.
- **Logs without timestamps** (or with wrong tz) — useless.
- **Stack trace per log line in tight loop** — multi-MB / sec.
- **No alerting on observability infra** — you can't tell when monitoring is broken.
- **Vendor lock-in** without OTel — re-instrumenting to switch is expensive.
- **Average latency dashboards** — hide p99 catastrophes; use histograms / quantiles.
- **No baseline** — comparing today vs yesterday matters.
- **No retention policy** — cost spirals.
- **No SLO-aligned alerts** — alerts fire on noise, not user pain.
- **Mixing dev / staging / prod metrics** — namespace by environment.

## Interview Cheat Sheet
- **Three pillars:** metrics (time-series), logs (events), traces (causal request paths).
- **Pivot via shared IDs** — trace_id in logs, exemplars in metrics.
- **Metrics:** cheap aggregation; SLO + alerting; bound cardinality.
- **Logs:** forensics + audit; structured JSON; sample at scale.
- **Traces:** distributed latency; sampled (1-10% head + tail-based on slow / error).
- **OpenTelemetry** = vendor-neutral instrumentation standard.
- **Golden Signals:** latency, traffic, errors, saturation.
- **RED for services:** Rate, Errors, Duration. **USE for resources:** Utilization, Saturation, Errors.
- **Killer phrase:** "Three pillars correlated by trace_id — metrics tell you something is wrong, traces tell you which service, logs tell you why."

## Related concepts
- [SLI / SLO / SLA](/docs/57-observability-and-sre/sli-slo-sla-error-budgets) — what to measure and why.
- [Failure Detection](/docs/59-failure-detection-and-dr/heartbeats-and-health-checks) — companion: liveness / readiness.
- [Idempotency](/docs/44-delivery-semantics/idempotency) — observability proves it's working.
- Concrete: [Grafana](/docs/20-observability/grafana), [OpenTelemetry](/docs/20-observability/opentelemetry), [Jaeger](/docs/20-observability/jaeger), [Prometheus](/docs/07-time-series-databases/prometheus).
