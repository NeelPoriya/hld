---
title: "OpenTelemetry"
description: "OpenTelemetry (OTel) is the open-source, vendor-neutral observability standard for traces, metrics, and logs — SDKs, the Collector, and the OTLP wire protocol; the convergent standard adopted by every major APM vendor."
---

> Category: Observability / Telemetry · Written in: Multi-language SDKs + Go Collector · License: Apache 2.0

## TL;DR
OpenTelemetry (OTel) is the **CNCF observability standard** — a unified specification for **traces, metrics, and logs** with language SDKs in 11+ languages, **auto-instrumentation libraries**, the **OTel Collector** (transport / processing / fan-out), and the **OTLP wire protocol** (OTel Protocol over gRPC / HTTP). It's the merger of OpenTracing and OpenCensus, now embraced by every major APM vendor (Datadog, New Relic, Dynatrace, Honeycomb, Grafana Tempo, AWS X-Ray, Google Cloud Trace). Reach for OTel as the **default instrumentation layer** for any new system — vendor lock-in becomes a routing decision, not a code rewrite.

## What problem does it solve?
Pre-OTel, every APM vendor had its own SDK. Switching vendors meant rewriting instrumentation. OTel solves this by:
- **Single SDK per language** for traces / metrics / logs.
- **Auto-instrumentation** for popular frameworks (HTTP servers, gRPC, DB clients, queue clients, …).
- **OTLP** wire protocol every backend speaks.
- **OTel Collector** receives, processes (sample / filter / enrich), and exports to multiple backends.
- **Semantic conventions** — standardized attribute names (`http.method`, `db.system`, `messaging.system`) so dashboards work across services and vendors.

## When to use
- **Any new service** — start instrumented with OTel; you'll thank yourself later.
- **Multi-vendor / vendor-neutral observability** — keep optionality.
- **Polyglot stacks** — same conventions across Java / Go / Python / Node / Rust / etc.
- **Migrating** from Datadog / New Relic / Jaeger / Zipkin — OTel speaks them all via Collector exporters.
- **Distributed tracing** — W3C Trace Context propagation is built in.

## When NOT to use
- **Dead-simple single binary** — `print()` may be enough.
- **Hard latency budget** — instrumentation overhead exists; sample appropriately.
- **Vendor-specific deep features** — e.g., Datadog APM has features not exposed via OTel; use vendor SDK if you need them, mix with OTel for the rest.

## The Three Pillars (Signals)
| Signal | What it captures | Cardinality | Cost |
|---|---|---|---|
| Traces | Causally linked spans across services for a request | High (per-request) | High; sample aggressively |
| Metrics | Numeric time series (counters, histograms, gauges) | Bounded by label cardinality | Lowest; pre-aggregated |
| Logs | Structured discrete events | Variable | Mid-to-high depending on volume |

## Components
- **API** — language-specific interfaces (`tracer.start_span`, `meter.create_counter`, `logger.emit`).
- **SDK** — implementation; configurable processors / exporters / samplers.
- **Auto-instrumentation** — bytecode (Java agent, .NET profiler) or library wrappers (Express, Flask, Django, Gin, gRPC).
- **OTel Collector** — Go binary with **receivers** (OTLP, Prometheus scrape, Jaeger, Zipkin, host metrics) → **processors** (batch, attribute, tail-based sampling, filter) → **exporters** (OTLP, Prometheus remote-write, Tempo, Loki, Datadog, X-Ray, …).
- **Semantic conventions** — standardized attribute names + units across languages / runtimes.
- **OTLP** — protobuf-based wire format over gRPC / HTTP.

```python
# Python — OTel SDK setup with OTLP exporter
from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

resource = Resource.create({"service.name": "checkout", "service.version": "1.4.2"})
provider = TracerProvider(resource=resource)
provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://otel-collector:4317"))
)
trace.set_tracer_provider(provider)

tracer = trace.get_tracer("checkout")
with tracer.start_as_current_span("place_order") as span:
    span.set_attribute("user.id", user_id)
    span.set_attribute("order.value", amount)
    # ... business logic
```

```yaml
# OTel Collector config
receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
processors:
  batch: {}
  tail_sampling:
    decision_wait: 10s
    policies:
    - { name: errors,    type: status_code, status_code: { status_codes: [ERROR] } }
    - { name: slow,      type: latency,    latency: { threshold_ms: 1000 } }
    - { name: sample-1pct, type: probabilistic, probabilistic: { sampling_percentage: 1 } }
exporters:
  otlphttp/tempo:
    endpoint: http://tempo:4318
  prometheusremotewrite/mimir:
    endpoint: http://mimir/api/v1/push
  loki:
    endpoint: http://loki:3100/loki/api/v1/push
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [tail_sampling, batch], exporters: [otlphttp/tempo] }
    metrics: { receivers: [otlp], processors: [batch], exporters: [prometheusremotewrite/mimir] }
    logs:    { receivers: [otlp], processors: [batch], exporters: [loki] }
```

## Sampling Strategies
- **Head sampling** — decide at root span creation (random %, parent-based).
- **Tail sampling** — Collector buffers full traces and samples based on properties (errors, latency, attributes).
- **Adaptive sampling** — keep low-volume operations; sample high-volume ones.
- **Always-on for errors / slow paths** + 1% baseline is a common pattern.

## Trade-offs

| Strength | Weakness |
|---|---|
| Vendor-neutral; multi-backend exports | Specs / SDKs evolve; some signals (logs) matured later |
| Auto-instrumentation reduces manual work | Auto-instrumentation can produce noisy spans; tune carefully |
| OTel Collector consolidates data plane | Tail sampling needs memory + per-trace buffering |
| Semantic conventions enable cross-team consistency | Following conventions is on you — easy to drift |
| First-class W3C Trace Context | Some metric / log SDKs trail traces in maturity by language |
| Backed by major vendors + CNCF | Performance overhead exists — measure |

## Common HLD Patterns
- **OTel SDK in services → Collector sidecar/daemonset → backends:** standard pipeline. Collector buffers / batches / samples / exports to Tempo / Mimir / Loki / Datadog / X-Ray.
- **Trace → Log correlation:** inject `trace_id` into log lines; Grafana Tempo + Loki "traces to logs" works automatically.
- **Tail sampling for cost:** keep all error / slow traces; sample 1% of fast/successful ones.
- **Multi-region telemetry:** Collector per region forwards via OTLP to a central aggregator with regional fallback.
- **Hybrid auto + manual:** auto-instrument frameworks, manually instrument critical business operations with custom spans.

## Common Pitfalls / Gotchas
- **High-cardinality attributes** (`user_id`, `request_id` on metrics) → metric backend cardinality explosion.
- **Always-sample-100%** in production trace pipelines = expensive backends. Tail-sample.
- **Span context propagation gaps** — async / queue boundaries lose context unless you propagate manually.
- **`OTEL_*` env var precedence** — programmatic config can be overridden; understand precedence.
- **Collector backpressure** — slow exporter blocks receivers; size queues + retries deliberately.
- **Library version skew** — auto-instrumentation libraries can lag the SDK; pin versions.
- **Unbounded span / log payloads** — limit attribute lengths.
- **Mixing metric exporters** with different aggregation temporality (cumulative vs delta) confuses backends.

## Interview Cheat Sheet
- **Tagline:** CNCF vendor-neutral observability standard for traces, metrics, and logs; SDKs + Collector + OTLP wire protocol.
- **Best at:** vendor-neutral instrumentation, polyglot stacks, distributed tracing with W3C context, fan-out via Collector to multiple backends.
- **Worst at:** vendor-specific deep features (use vendor SDK alongside), zero-overhead workloads.
- **Scale:** powers observability at Microsoft, Google, AWS, Datadog customers, and most CNCF-aligned orgs.
- **Distributes how:** SDKs in services → Collector tier → backends; tail sampling at the Collector for cost control.
- **Consistency / state:** mostly stateless pipeline; tail sampling holds traces in memory for the decision window.
- **Killer alternative:** vendor-specific SDKs (Datadog, New Relic, Honeycomb), Jaeger client (legacy), Zipkin (legacy), Prometheus client libs (metrics-only).

## Further Reading
- Official docs: <https://opentelemetry.io/docs/>
- Specification: <https://opentelemetry.io/docs/specs/>
- OTel Collector: <https://opentelemetry.io/docs/collector/>
- Semantic conventions: <https://opentelemetry.io/docs/specs/semconv/>
