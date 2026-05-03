---
title: "Jaeger"
description: "Jaeger is the CNCF-graduated open-source distributed tracing backend — collects spans, stores them in Cassandra / Elasticsearch / OpenSearch / Kafka, and renders waterfall + dependency views."
---

> Category: Observability / Distributed Tracing · Written in: Go · License: Apache 2.0

## TL;DR
Jaeger is a CNCF-graduated **distributed tracing backend** originally built at Uber. It accepts spans (via Jaeger or **OTLP** protocol), stores them in **Cassandra**, **Elasticsearch / OpenSearch**, **Kafka + storage**, or **gRPC plugins**, and provides a UI for waterfall views, service maps, and trace search. Reach for Jaeger as a self-hosted tracing backend when you want OSS without paying a SaaS APM, especially in Kubernetes / CNCF-flavored stacks. With OTel SDKs upstream, Jaeger is increasingly used **as just the storage + UI** while the **OTel Collector** handles ingestion / sampling.

## What problem does it solve?
- **Visualize end-to-end latency** of a request across many services.
- **Find the slow span** — DB call? RPC? Lock contention? Span attributes pinpoint it.
- **Service dependency maps** — auto-generated from observed traffic.
- **Compare traces** — diff a slow trace vs a fast one.
- **Root cause analysis** — see error spans + their context across services.

## When to use
- **Self-hosted tracing** in Kubernetes / on-prem.
- **OTel-instrumented services** that need a backend; Jaeger speaks OTLP.
- **Cost-sensitive** orgs that don't want SaaS APM.
- **Specific compliance** (data residency) requiring on-prem traces.
- **Already on Cassandra / Elasticsearch** — natural storage backend reuse.

## When NOT to use
- **Want a managed APM** with auto-instrumentation across the board — Datadog / Honeycomb / New Relic / Lightstep.
- **Cost-sensitive at high scale** — Cassandra / ES storage isn't cheap; consider object-storage backends like Tempo.
- **Logs + metrics + traces unified** — Grafana Tempo + LGTM stack is a tighter integration.
- **You don't yet have OTel** — start with OTel SDK and pick a backend later.

## Architecture
- **Agent** *(deprecated, OTel Collector replacing)* — local UDP proxy on each host receiving spans and forwarding to collectors.
- **Collector** — receives spans (Jaeger Thrift, gRPC, OTLP), validates, and writes to storage; supports adaptive sampling instructions back to clients.
- **Query service** — read API + UI; translates user search to storage queries.
- **Ingester** *(Kafka deployments)* — reads from Kafka and writes to storage.
- **Storage** — pluggable: Cassandra, Elasticsearch / OpenSearch, ClickHouse (via plugin), in-memory (dev), Kafka + ingester.

```yaml
# All-in-one Jaeger (dev / demo) on Kubernetes
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata: { name: simplest }
---
# Production Jaeger with Elasticsearch storage
apiVersion: jaegertracing.io/v1
kind: Jaeger
metadata: { name: prod }
spec:
  strategy: production
  collector:
    replicas: 4
    options:
      collector:
        otlp: { enabled: true }
  storage:
    type: elasticsearch
    options:
      es:
        server-urls: http://elasticsearch:9200
        num-shards: 5
        num-replicas: 1
  ingress:
    enabled: true
```

## Storage Options

| Backend | When to use | Trade-offs |
|---|---|---|
| Cassandra | Petabyte-scale, write-heavy, predictable hot set | Operationally heavy; query flexibility limited |
| Elasticsearch / OpenSearch | Rich search needs | Higher cost; cluster ops non-trivial |
| Kafka + ingester | Decouple producers from storage; smooth bursts | Adds Kafka to ops |
| ClickHouse (plugin) | Modern columnar, cheap, fast | Plugin maturity / community-supported |
| In-memory | Dev / demo | Don't use in prod |

## Sampling
- **Probabilistic** at SDK — fixed % per service.
- **Rate-limited** — at most N traces / second per operation.
- **Adaptive** — collector returns suggested rates per operation based on observed throughput; SDKs respect.
- **Tail sampling** — done in the **OTel Collector** before traces hit Jaeger; keep errors / slow / interesting traces.

## Trade-offs

| Strength | Weakness |
|---|---|
| OSS, CNCF graduated, mature | Storage backends are heavy (Cassandra / ES) |
| Pluggable storage; OTLP-native | Logs / metrics not in scope (use companion tools) |
| Adaptive sampling built into the protocol | Smaller ecosystem than Datadog / Honeycomb / Lightstep |
| Service dependency map auto-generated | UI is functional, less polished than commercial APMs |
| Works great with OTel | Operating Jaeger + storage at scale is a real ops investment |
| Active community + Kubernetes Operator | Limited tail-sampling features (rely on OTel Collector) |

## Common HLD Patterns
- **OTel SDK → OTel Collector (tail sample) → Jaeger:** the modern shape; Jaeger becomes the storage + UI.
- **Multi-region:** regional Jaeger cluster per region; cross-region queries via federated UI or replicated storage.
- **Adaptive sampling at scale:** keep 100% errors + slow traces, 1% of healthy fast traces; tail-sample at Collector.
- **Trace ↔ log correlation:** inject `trace_id` in log records; click Jaeger trace → jump to logs filter `trace_id=<X>`.
- **Service maps for incident response:** dependency graph reveals upstream/downstream blast radius.

## Common Pitfalls / Gotchas
- **Storage cost explosion** — high-volume traces overwhelm ES/Cassandra; tail-sample aggressively.
- **Cardinality** — span attributes with unbounded values (request IDs, user IDs in tag values) bloat indexes.
- **Sampling gaps** — head sampling drops traces uniformly; you miss errors. Use parent-based + tail sampling.
- **Index bloat** in Elasticsearch — tune mappings, ILM rollover policies, replica counts.
- **UI query timeouts** on large data sets — bound time ranges + indexed attributes.
- **Agent deprecation** — Jaeger agent is deprecated in favor of OTel Collector; new deployments should skip agent.
- **Operator lifecycle** — Jaeger Operator manages CRDs; upgrades have migration steps.
- **Backwards-compat** — Jaeger Thrift protocol still supported, but new code should use OTLP.

## Interview Cheat Sheet
- **Tagline:** CNCF-graduated OSS distributed tracing backend; OTLP-native; pluggable storage; the self-hosted alternative to commercial APM tracing.
- **Best at:** self-hosted distributed tracing in Kubernetes/CNCF stacks; OTel-flavored deployments; data-residency-restricted environments.
- **Worst at:** unified metrics + logs + traces (use Grafana LGTM), zero-ops managed APM (Datadog / Honeycomb / New Relic).
- **Scale:** Uber-scale verified; PB of traces with Cassandra; ES backends scale to billions of spans / day.
- **Distributes how:** stateless Collector + Query tiers; storage scales horizontally (Cassandra ring / ES cluster).
- **Consistency / state:** spans written eventually durable to storage; query reads from storage; sampling counters in clients.
- **Killer alternative:** Grafana Tempo (object-storage cheap), Zipkin (older OSS), Datadog APM, Honeycomb, AWS X-Ray, Lightstep.

## Further Reading
- Official docs: <https://www.jaegertracing.io/docs/latest/>
- Architecture: <https://www.jaegertracing.io/docs/latest/architecture/>
- Adaptive sampling: <https://www.jaegertracing.io/docs/latest/sampling/>
- Jaeger Operator: <https://www.jaegertracing.io/docs/latest/operator/>
