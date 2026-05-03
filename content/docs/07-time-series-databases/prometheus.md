---
title: "Prometheus"
description: "Prometheus is the de-facto open-source monitoring system for Kubernetes and cloud-native apps. Pull-based metrics, multidimensional data model, PromQL query language, and built-in alerting."
---

> Category: Monitoring System / Time-Series Database (Metrics) · Written in: Go · License: Apache 2.0 · CNCF Graduated Project

## TL;DR
Prometheus is a **pull-based monitoring system + time-series database** purpose-built for cloud-native observability. It scrapes metrics from instrumented services on a regular interval (typically every 15–30s), stores them in its own efficient TSDB, and lets you query/alert on them with **PromQL**. It's the **default metrics layer** for Kubernetes (the Kubernetes control plane exposes Prometheus metrics natively) and the most-deployed monitoring system in the cloud-native world. Reach for it when you want a battle-tested, self-hostable metrics stack that just works with K8s, paired with Grafana for dashboards and Alertmanager for routing pages.

## What problem does it solve?
You're running a fleet of services and need to answer:
- "Which pod is using 95% of its CPU right now?"
- "Has request latency p99 spiked in the last 10 minutes?"
- "Page me when error rate > 1% for 5 minutes."

Prometheus is the standard answer in cloud-native infra:
- **Pull model** — Prometheus scrapes targets it discovers (no agents pushing into a server). This makes service discovery + metrics very Kubernetes-native.
- **Multidimensional model** — every metric carries labels (`pod`, `namespace`, `instance`, `method`, `status`); slice and dice with PromQL.
- **All-in-one** — one binary, no external DB, no Kafka, no ZooKeeper. Just runs.
- **Alerting built in** — alert rules live next to the queries, fire to Alertmanager which dedupes/routes/escalates.

## When to use
- **Kubernetes monitoring** — the de-facto choice; comes with kube-prometheus / kube-state-metrics out of the box.
- **Microservice / cloud-native apps** with Prometheus client libraries (every major language has one).
- **Infrastructure metrics** — node-exporter, blackbox-exporter, cadvisor, etc. Prometheus has hundreds of exporters.
- **Short-to-medium retention** (hours to weeks). For longer-term metric storage, layer Thanos / Cortex / VictoriaMetrics / InfluxDB on top.
- **Self-hosted observability** with no SaaS dependency.

## When NOT to use
- **Logs** — Prometheus is for **metrics only**. Use Loki, OpenSearch, or DataDog for logs.
- **Traces** — use Jaeger / Tempo / Zipkin for distributed tracing.
- **Long-term raw retention** — Prometheus stores raw samples on local disk; a single instance is best at weeks-to-months. For years of retention, use **Thanos / Cortex / Mimir** (clustered Prometheus-compatible systems) or remote-write to InfluxDB / TimescaleDB.
- **Push-only** workloads where targets are short-lived (batch jobs) — use the **Pushgateway** or Mimir / VictoriaMetrics push endpoints.
- **Massive cardinality** — extremely high label cardinality (e.g. one label = `requestId`) blows up memory.

## Data Model
A **time series** is uniquely identified by a metric name + a set of labels:
```
http_requests_total{method="GET", route="/users", status="200", instance="api-pod-3"}
```

Each series is a stream of `(timestamp, float64)` samples.

Four **metric types** (semantic conventions, not enforced):
- **Counter** — monotonically increasing (e.g. `http_requests_total`). Use `rate()` to query.
- **Gauge** — point-in-time value (e.g. `cpu_usage`).
- **Histogram** — bucketed distribution (e.g. `http_request_duration_seconds_bucket{le="0.1"}`).
- **Summary** — pre-computed quantiles on the client.

Sample PromQL queries:
```text
# 5-minute request rate per route
sum by (route) (rate(http_requests_total[5m]))

# p99 latency
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))

# Pods using > 80% of their CPU limit
(sum by (pod) (rate(container_cpu_usage_seconds_total[5m]))
 / on(pod) (kube_pod_container_resource_limits{resource="cpu"})) > 0.8
```

## Architecture & Internals
- A single **Prometheus server** binary that does scraping, storage, queries, and alerting.
- **Service Discovery** integrates with Kubernetes, Consul, EC2, file_sd, DNS, etc. — discovers what targets to scrape.
- **Storage:** custom TSDB based on chunks of compressed samples on disk (Gorilla-style XOR encoding). Each block is 2 hours of data; old blocks are compacted into bigger blocks.
- **Compaction:** background process merges 2h blocks into bigger blocks (up to ~10% of retention) for query speed.
- **Alertmanager** is a **separate** binary that receives alert notifications, deduplicates, groups, and routes (PagerDuty, Slack, email).
- **Remote read/write** API for shipping data into long-term storage systems (Thanos, Cortex, Mimir, InfluxDB, TimescaleDB).

```
[targets] ──pull──▶ [Prometheus] ──remote_write──▶ [Thanos / Mimir / TimescaleDB]
                          │
                          ├──▶ [Grafana] (dashboards)
                          └──▶ [Alertmanager] ──▶ [PagerDuty / Slack]
```

## Consistency Model
- **Single-writer, single-DB per Prometheus instance.** No cluster.
- **Eventually consistent** — scrape intervals mean there's a built-in lag of one scrape interval for any sample.
- **High-availability** is achieved by running **two identical Prometheus servers** scraping the same targets independently. Grafana / Alertmanager can use either; deduplication is in Alertmanager (alert grouping) or the remote-write target (Thanos/Mimir dedupe).

## Replication
- **Per-instance: none.** A single Prometheus has no built-in clustering.
- **Highly-available pair:** two Prometheus servers scrape the same targets. They're each the source of truth for their own data — Prometheus does not replicate between them.
- **Long-term + global view:** ship data via remote_write to **Thanos / Cortex / Mimir / VictoriaMetrics** clusters that handle distributed storage, deduplication, downsampling.

## Partitioning / Sharding
A single Prometheus is **vertically scaled** (give it more CPU/RAM). When that's not enough:
- **Functional sharding** — run multiple Prometheus servers, each scraping a subset of targets (e.g. one per region, one per team). Federation aggregates a small subset of metrics from each.
- **Hash-based sharding** — Mimir / Cortex shard time series by a hash of labels across many ingester nodes.

**Hot-cardinality pitfall:** the #1 production trap. Adding a high-cardinality label (`userId`, `requestId`, `traceId`, `path` with raw URL params) creates millions of unique series → memory blows up → OOM. Mantra: keep the cardinality of (metric_name, all label values) under ~10M total per instance.

## Scale of a Single Instance
- **Practical sweet spot:** 1M–10M active series, 100k–1M samples/sec ingestion, 15–30 days of retention, on a 16–32 GB RAM node with NVMe.
- **Hard ceilings:** active series count is limited by RAM (~5KB per active series; 4M series ≈ 20 GB RAM). Disk usage roughly = `samples × 1.3 bytes` (after compression).
- **When to scale out:** when single-instance RAM is the bottleneck, switch to Thanos / Mimir / Cortex. Or split scraping into multiple Prometheus servers by team/region.

## Performance Characteristics
- **Scrape interval:** 15–60s typical. Tighter intervals = better resolution but more cardinality and resource use.
- **Query latency:** sub-100ms for typical 1h–24h range queries; slower for full-retention scans across many series.
- **Ingest:** 100k–1M samples/sec on a beefy single instance.
- **Bottlenecks:** active series count (RAM), expensive queries (subquery + high-cardinality `sum by`), too-frequent compactions.

## Trade-offs

| Strength | Weakness |
|---|---|
| Pull model fits Kubernetes service discovery perfectly | Pull model awkward for short-lived batch jobs (Pushgateway is a workaround) |
| Powerful PromQL, multidimensional labels | Cardinality is your enemy at scale |
| Single binary — easy to run | No native clustering or replication |
| Huge ecosystem (exporters, libraries, dashboards) | Local-disk only — long-term retention needs Thanos/Mimir |
| CNCF graduated, vendor-neutral, free | Logs and traces are out of scope |
| Alertmanager handles dedup / routing | Alert rule management is config-file based, not super polished |

## Common HLD Patterns
- **Standard K8s observability stack:**
  - Prometheus scrapes pods/nodes/services.
  - Grafana renders dashboards from Prometheus data.
  - Alertmanager fires alerts.
  - Loki / OpenSearch handles logs.
  - Tempo / Jaeger handles traces.
- **HA pair + global view:** two Prometheus servers per cluster scrape the same targets; both `remote_write` to a central Thanos/Mimir for long-term storage and a single global query view.
- **Multi-cluster federation:** each cluster has its own Prometheus; a global Prometheus federates a small slice of summary metrics for cross-cluster dashboards.
- **SLO / error-budget tracking:** rate(errors) / rate(total) → recording rules → Alertmanager fires when burn rate exceeds threshold.

## Common Pitfalls / Gotchas
- **High-cardinality labels.** Don't put unique IDs as labels. Common offenders: user IDs, request IDs, raw paths with query strings, container IDs.
- **Wrong metric type.** `rate()` only works on counters; gauges need `delta()` / `deriv()`. Histogram quantiles need bucketed metrics.
- **Disk fills up silently** if retention is too long for your cardinality.
- **Scrape timeouts** on slow exporters cause data gaps.
- **No backfill** — if Prometheus is down, those samples are gone (unless you have the HA pair).
- **One Prometheus per environment vs federation** — a single global Prometheus across regions is a bad idea; sharding boundaries matter.
- **Remote write tuning** — high-cardinality + remote write can saturate the network and queue; tune `queue_config`.

## Interview Cheat Sheet
- **Tagline:** Pull-based metrics + alerting + time-series DB; the de-facto cloud-native monitoring system.
- **Best at:** Kubernetes / microservices metrics, alerting, sub-minute resolution.
- **Worst at:** logs, traces, very long retention, extreme cardinality.
- **Scale of one instance:** ~1M–10M active series, weeks of retention. Beyond that → Thanos/Mimir/Cortex.
- **Shard by:** functional split (per cluster / region / team); hash-shard via Mimir/Cortex for global scale.
- **Consistency:** local single-writer; HA via redundant scrapers; long-term via remote-write.
- **Replicates how:** doesn't, by itself. HA = two servers scraping the same targets; LT = remote_write.
- **Killer alternative:** VictoriaMetrics (compatible, more efficient), Mimir / Cortex (clustered Prometheus), DataDog / New Relic (SaaS), InfluxDB (different model).

## Further Reading
- Official docs: <https://prometheus.io/docs/>
- PromQL reference: <https://prometheus.io/docs/prometheus/latest/querying/basics/>
- "Prometheus: Up & Running" book (O'Reilly)
- Cortex / Mimir for clustered Prometheus: <https://grafana.com/oss/mimir/>
- Thanos: <https://thanos.io/>
