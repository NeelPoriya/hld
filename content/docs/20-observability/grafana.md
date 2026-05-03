---
title: "Grafana"
description: "Grafana is the dashboarding and visualization layer for observability — connects to Prometheus, Loki, Tempo, InfluxDB, Elasticsearch, BigQuery, and 100+ data sources for unified metrics, logs, and traces."
---

> Category: Observability / Visualization · Written in: Go + TypeScript · License: AGPL v3

## TL;DR
Grafana is the **dashboarding and visualization** standard for observability. It doesn't store data itself — instead it queries **100+ data sources** (Prometheus, Loki, Tempo, InfluxDB, Elasticsearch, BigQuery, MySQL, CloudWatch, Datadog, etc.) and renders panels, graphs, heatmaps, alerts, and SLO views. Together with **Loki** (logs), **Tempo** (traces), **Mimir** (Prometheus-compatible metrics), and **Pyroscope** (profiles), Grafana Labs provides a complete LGTM observability stack. Reach for Grafana whenever you need a unified pane of glass over heterogeneous data sources.

## What problem does it solve?
- **Heterogeneous data sources** — metrics in Prometheus, logs in Loki, traces in Tempo, business data in Postgres; engineers want one tool to see them all together.
- **Dashboards as code** — version-controlled JSON dashboards or Grafonnet/Jsonnet definitions.
- **Alerting** — unified alert rules across data sources with multi-dimensional labels.
- **SLO tracking** — burn rate dashboards, error budgets, multi-window alerts.
- **Correlation** — click a metric spike → drill into traces → find the slow service → jump to the matching log line.

## When to use
- **Any observability stack** — Grafana is the default visualization layer for Prometheus / OpenTelemetry-flavored telemetry.
- **Multi-source dashboards** — pull metrics + logs + business data into one view.
- **Alerts with rich routing** — Slack, PagerDuty, Opsgenie, email, webhook.
- **SLO platforms** — Grafana SLO + multi-window multi-burn-rate alerts.
- **Public dashboards / status pages** — share read-only views with stakeholders.

## When NOT to use
- **You need a TSDB / log store** — Grafana doesn't store data; pair with Prometheus / Loki / Mimir / Tempo etc.
- **Highly interactive BI on huge datasets** — consider Looker / Metabase / Superset; Grafana is primarily ops-focused.
- **You want fully managed APM with auto-instrumentation** — Datadog / New Relic / Honeycomb may fit better. Grafana Cloud offers managed LGTM.

## The LGTM Stack
- **L**oki — log aggregation (cheap, label-indexed, full-text on demand).
- **G**rafana — visualization + alerting + correlation.
- **T**empo — distributed tracing backend (object-storage based, cheap).
- **M**imir — Prometheus-compatible metrics at scale.
- **(Pyroscope)** — continuous profiling.

## Architecture
- **Grafana server** — Go HTTP server; renders dashboards in browser; queries data sources via plugins.
- **Plugins** — data source plugins (Prometheus, Loki, Postgres, …), panel plugins, app plugins.
- **Provisioning** — dashboards / data sources / alerts as YAML / JSON in version control.
- **Alerting** — unified alerting (since Grafana 9): alert rules → contact points → notification policies.
- **Auth** — built-in users, OAuth (GitHub, Google, Azure AD), LDAP, SAML, JWT.

```yaml
# Provisioning: data source as code
apiVersion: 1
datasources:
- name: Prometheus
  type: prometheus
  access: proxy
  url: http://prometheus:9090
  isDefault: true
- name: Loki
  type: loki
  access: proxy
  url: http://loki:3100
- name: Tempo
  type: tempo
  access: proxy
  url: http://tempo:3200
  jsonData:
    tracesToLogsV2:
      datasourceUid: loki_uid
      filterByTraceID: true
```

```text
# Example PromQL panel: p95 latency by service
histogram_quantile(0.95,
  sum by (le, service) (rate(http_request_duration_seconds_bucket[5m]))
)
```

## Trade-offs

| Strength | Weakness |
|---|---|
| 100+ data sources; one pane for everything | No storage of its own — operational dependency on TSDB / log store |
| Dashboards-as-code (Jsonnet, Grafonnet, K8s operators) | Dashboard JSON sprawl gets messy without conventions |
| Unified alerting across data sources | Alerting model has a learning curve (rules / contact points / policies) |
| Excellent correlation: metric → trace → log | Heavy dashboards can hammer data sources at scale |
| Active OSS community; rich plugin ecosystem | AGPL — commercial license needed if embedding into a product |
| Grafana Cloud offers managed LGTM | Self-hosted at scale requires HA setup (DB + ssh / file storage) |

## Common HLD Patterns
- **RED/USE dashboards:** Rate / Errors / Duration (per service); Utilization / Saturation / Errors (per resource).
- **SLO + burn-rate alerts:** multi-window multi-burn-rate (5m × 14.4 + 1h × 6) for fast and slow burns.
- **Metric → trace → log workflow:** click a latency spike → trace exemplar → trace view → click span → matching logs in Loki via trace ID.
- **Public status page:** read-only dashboard exposed via Grafana viewer role; shows uptime / incident timeline.
- **Service catalog dashboards:** per-service standardized dashboard generated from a template + service registry.
- **Cost / business overlay:** pull AWS cost / DAU / revenue from BigQuery into the same dashboard as latency to show business impact of regressions.

## Common Pitfalls / Gotchas
- **High-cardinality labels** in Prometheus / Loki blow up storage; design label sets carefully (`request_id` is a footgun).
- **Heavy dashboards** with many panels each running expensive queries → data source overload. Use template variables wisely; cache via Recording Rules.
- **Time range gotchas** — relative ranges (`now-24h`) shift on every refresh; absolute ranges for incident reports.
- **Alert flapping** — without proper `for:` duration and pending state handling, noise drowns signal.
- **No data vs error vs OK** — distinguish in alert rules; `no_data` should usually page on critical SLOs.
- **Permissioning sprawl** — RBAC on dashboards / folders gets tangled at scale; standardize folder structure.
- **Plugin updates** can break dashboards; pin plugin versions in production.
- **Anonymous access** misconfig → public exposure of internal dashboards; default disabled, but check.

## Interview Cheat Sheet
- **Tagline:** Multi-source dashboarding and alerting layer for observability; the visualization standard.
- **Best at:** unified metric+log+trace view, dashboards-as-code, SLO / burn-rate alerts, correlation across data sources.
- **Worst at:** being a TSDB itself (it isn't), interactive BI on huge tables, fully-managed APM (use Datadog / Honeycomb).
- **Scale:** thousands of dashboards / tens of thousands of users in single deployments at large enterprises.
- **Distributes how:** stateless server pods backing on a Postgres/MySQL config DB + object storage for plugins; HA via standard load-balanced replicas.
- **Consistency / state:** ephemeral query results; dashboards / alerts persisted in DB; alerting state in DB or remote (Mimir Alertmanager).
- **Killer alternative:** Kibana (Elastic Stack), Datadog (managed APM), New Relic, Honeycomb, Superset (BI), Looker (BI).

## Further Reading
- Official docs: <https://grafana.com/docs/grafana/latest/>
- LGTM stack overview: <https://grafana.com/oss/>
- Unified alerting: <https://grafana.com/docs/grafana/latest/alerting/>
- SRE / SLO docs: <https://grafana.com/docs/grafana-cloud/alerting-and-irm/slo/>
