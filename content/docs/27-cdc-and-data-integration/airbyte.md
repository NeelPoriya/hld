---
title: "Airbyte"
description: "Airbyte is the open-source ELT platform for moving data from any source to any destination — 350+ connectors, declarative YAML CDK, and Kubernetes-native runner."
---

> Category: CDC & Data Integration · Written in: Java + Python connectors + TypeScript UI · License: Elastic License 2.0 (ELv2) + MIT for connectors

## TL;DR
Airbyte is the **open-source ELT (Extract-Load-Transform) platform** competing with Fivetran and Stitch. You install Airbyte (Docker / Helm / cloud), pick a **source connector** (Postgres, Stripe, Salesforce, Google Ads, Shopify, …), pick a **destination connector** (Snowflake, BigQuery, Redshift, Postgres, S3 / Iceberg), set a sync schedule + sync mode (full refresh, incremental append, deduped CDC), and Airbyte does the rest. The differentiator vs Debezium is **scope**: Debezium is laser-focused on database CDC streaming through Kafka; Airbyte is **batch ELT** for ~350+ heterogeneous sources (databases AND SaaS APIs AND files), pushing into warehouses. Reach for Airbyte when you want **batch ingestion from tons of sources** without writing connectors yourself.

## What problem does it solve?
- **SaaS data is locked in vendor-specific APIs** — Stripe, Salesforce, Shopify, Google Ads each have their own REST quirks; writing 50 connectors is a full-time job.
- **OSS alternative to Fivetran** — Fivetran is excellent but expensive; Airbyte is OSS + cloud option.
- **Connector economy** — open-source connectors maintained by community + Airbyte.
- **CDC + API ingestion in one tool** — one platform for warehouse loading.
- **Self-hosted control** — sensitive data stays on your infra.

## When to use
- **Loading 5+ SaaS sources into a warehouse** for BI / analytics.
- **Postgres/MySQL → warehouse** ingestion (incremental + CDC).
- **dbt + warehouse** stacks where you need raw data delivered first.
- **Self-hosted requirement** — air-gapped / regulated industries.
- **Quickly bootstrapping** a "modern data stack."

## When NOT to use
- **Sub-second event streaming** — Airbyte is batch / micro-batch (5-min minimum); use Debezium + Kafka.
- **Reverse ETL** (warehouse → SaaS) — use Hightouch / Census.
- **Tiny needs** — one Postgres → S3 sync may be simpler with `pg_dump` cron.
- **Highly-custom transformations during load** — use dbt downstream; Airbyte is mostly EL.
- **Single connector that's missing or broken** — connector quality varies; check before depending.

## Data Model / Concepts
- **Source** — connector + config (e.g., Postgres host/db/user, Stripe API key).
- **Destination** — connector + config (e.g., Snowflake warehouse + schema).
- **Connection** — (Source + Destination) + streams (tables) selected + sync mode + schedule.
- **Stream** — a logical table within a source (e.g., `customers`, `orders`).
- **Sync modes:**
  - **Full refresh — overwrite** — replace destination each sync.
  - **Full refresh — append** — append all rows each sync.
  - **Incremental — append** — only new rows (cursor field).
  - **Incremental — deduped + history (CDC)** — Postgres/MySQL/Mongo CDC; merges into destination preserving history.
- **Connector Development Kit (CDK)** — Python library for building source connectors; Low-code YAML CDK for REST APIs.

```yaml
# YAML CDK source connector for a REST API
type: DeclarativeSource
spec:
  documentation_url: https://docs.example.com/api
  connection_specification:
    type: object
    required: [api_key]
    properties:
      api_key: { type: string, airbyte_secret: true }

streams:
  - type: DeclarativeStream
    name: orders
    primary_key: id
    schema_loader:
      type: JsonFileSchemaLoader
      file_path: ./schemas/orders.json
    retriever:
      type: SimpleRetriever
      requester:
        url_base: "https://api.example.com/v1"
        path: "/orders"
        http_method: GET
        authenticator:
          type: BearerAuthenticator
          api_token: "{{ config.api_key }}"
      paginator:
        type: DefaultPaginator
        page_token_option: { type: RequestOption, inject_into: request_parameter, field_name: cursor }
        pagination_strategy:
          type: CursorPagination
          cursor_value: "{{ response.next_cursor }}"
      record_selector:
        extractor: { field_path: ["data"] }
```

## Architecture
- **Server** — orchestrates connections; REST API + UI.
- **Worker** — runs connector containers per sync; isolates each job.
- **Scheduler / Temporal** — schedules + retries syncs (uses Temporal under the hood).
- **Connectors** — Docker images implementing the Airbyte Protocol (`spec`, `check`, `discover`, `read`, `write`).
- **Database** — Postgres for Airbyte metadata.
- **Storage** — local FS / S3 / GCS for state + logs.
- **Airbyte Protocol** — JSON messages over stdout: `RECORD`, `STATE`, `LOG`, `TRACE`, `CONTROL`.

## Trade-offs

| Strength | Weakness |
|---|---|
| 350+ connectors out of the box | Connector quality varies (community vs official) |
| Open-source + cloud option | Operational overhead vs Fivetran |
| Self-hosted on K8s | Requires Postgres + Temporal + workers — non-trivial |
| Declarative low-code CDK for REST APIs | Heavy schema changes can break syncs |
| dbt integration | Batch / micro-batch only — not streaming |
| Active community + commercial support | Some sources rate-limit aggressively |
| Helm chart + Terraform provider | License (ELv2) is OSS-ish but not OSI |
| Schema discovery + auto-replication | Resource hungry for many concurrent syncs |

## Common HLD Patterns
- **Modern data stack:** Airbyte (EL) → Snowflake / BigQuery → dbt (T) → BI (Looker / Metabase).
- **CDC pipeline (DB):** Postgres → Airbyte (incremental deduped CDC) → Snowflake.
- **SaaS pipeline:** Stripe / Shopify / Salesforce → Airbyte → S3 (raw) → BigQuery (curated) → dbt models.
- **Mirror to data lake:** Airbyte → S3/Iceberg in Parquet for cheap storage; query via Trino/Spark/Athena.
- **Operational data store hydration:** SaaS sources → warehouse → reverse-ETL (Hightouch/Census) back into SaaS.
- **Custom connectors:** YAML/Low-code CDK for company-internal REST APIs; ship as private connector image.

## Common Pitfalls / Gotchas
- **Schema drift** — added/removed columns can fail syncs; configure auto-propagation cautiously.
- **API rate limits** — long syncs trip Stripe / Salesforce / Shopify limits; tune sync frequency.
- **Postgres replication slot bloat** (CDC mode) — same gotcha as Debezium.
- **Connector versioning** — older versions deprecated; pin or upgrade carefully.
- **Big initial syncs** — full refreshes of huge tables can take hours and saturate destination.
- **Cursor field choice** — must be monotonic + indexed; else incremental misses rows.
- **State management** — Airbyte stores per-connection state (cursors); deleting connection wipes state.
- **Worker resource exhaustion** — each connector is a Docker container; concurrency × memory adds up.
- **Cost shape** vs Fivetran — Airbyte's MAR (monthly active rows) pricing on Cloud differs; do the math.
- **Custom transformations** — discouraged at load; do them in dbt.

## Interview Cheat Sheet
- **Tagline:** Open-source ELT — 350+ connectors from any source to any warehouse / lake; declarative CDK; K8s-native.
- **Best at:** loading SaaS + DB sources into warehouse, modern data stack ingestion, self-hosted alternative to Fivetran.
- **Worst at:** sub-second streaming, reverse-ETL, complex in-flight transformation.
- **Scale:** thousands of streams; throughput limited by source API + destination ingest; can run many concurrent syncs.
- **Distributes how:** worker pool runs connector containers; Temporal orchestrates retries and scheduling.
- **Consistency / state:** per-connection state (cursors / CDC offsets) durably stored; deduped CDC mode merges history.
- **Killer alternative:** Fivetran (managed), Stitch (managed), Meltano (Singer-based OSS), Estuary Flow (streaming-first), Hevo, custom Python scripts.

## Further Reading
- Official docs: <https://docs.airbyte.com/>
- Connector catalog: <https://docs.airbyte.com/integrations/>
- YAML / Low-code CDK: <https://docs.airbyte.com/connector-development/config-based/low-code-cdk-overview>
- Comparison vs Fivetran: <https://airbyte.com/etl-tools-comparison/airbyte-vs-fivetran>
