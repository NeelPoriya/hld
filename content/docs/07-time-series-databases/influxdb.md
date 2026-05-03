---
title: "InfluxDB"
description: "InfluxDB is the most popular purpose-built time-series database. Optimized for high-cardinality, append-mostly workloads — IoT telemetry, application metrics, financial ticks. SQL-like query language (Flux / InfluxQL / SQL in v3)."
---

> Category: Time-Series Database (TSDB) · Written in: Go (v1/v2) / Rust (v3) · License: MIT (open source) / Commercial (Cloud)

## TL;DR
InfluxDB is a **purpose-built time-series database** designed for the workload that traditional SQL databases handle poorly: massive append-mostly streams of timestamped data points (sensor readings, app metrics, financial ticks). It stores data in a custom columnar format optimized for **high write throughput and high compression on time-series shapes**, with a query language tuned for time-bucket aggregations like "average CPU per host per minute over the last day." InfluxDB v1 used InfluxQL (SQL-ish), v2 introduced **Flux** (functional pipeline language), and **v3 (IOx, Apache Arrow + Parquet + DataFusion)** brings real SQL back. Reach for it when you have millions of data points per second flowing in and dashboards / alerts reading them out.

## What problem does it solve?
Time-series data has a unique shape:
- **Writes are append-only** (no updates, rare deletes — mostly age-out).
- **Reads are range-scans by time** with aggregations.
- **Cardinality is high** (one series per host × per metric × per tag combo).
- **Recent data is hot, old data is cold** (perfect for tiered storage).

A general-purpose RDBMS handles this OK at small scale and falls over hard at scale: B-tree indexes blow up, partition pruning is awkward, compression isn't tuned for monotonically-increasing timestamps. InfluxDB is built from the ground up for this shape.

## When to use
- **IoT telemetry** — sensor data, smart-home, industrial monitoring.
- **DevOps / observability** — application & infrastructure metrics (host CPU, request latency, queue depth).
- **Financial market data** — tick storage, time-bucket OHLC computations.
- **Real-time analytics on event streams** — when you need second-resolution data and dashboards.
- **Custom monitoring** alongside (or instead of) Prometheus when you need long retention or higher cardinality than Prometheus can handle.

## When NOT to use
- **Heavy joins or relational queries** — TSDB is not a SQL replacement.
- **General-purpose OLTP** — use PostgreSQL.
- **Large complex analytics** (multi-table joins, big aggregations across non-time dimensions) — use ClickHouse / BigQuery / Snowflake.
- **Tiny scale** — for a hobby project tracking a dozen metrics, plain Postgres + a `time` column works fine.
- **Push-only Prometheus replacement on Kubernetes** — Prometheus is more idiomatic; InfluxDB shines when you need long retention and bigger cardinality.

## Data Model
- **Database / Bucket** — top-level container with a retention policy.
- **Measurement** — like a table, e.g. `cpu`, `temperature`.
- **Tags** — indexed key-value pairs (used to filter and group).
- **Fields** — the actual numeric or string values (not indexed for filtering, just stored).
- **Timestamp** — every point is associated with a single time.

Line protocol example:
```
cpu,host=web1,region=us-east cpu_usage=42.5,load1=0.74 1714723200000000000
```
Translation: in measurement `cpu`, with tags `host=web1` and `region=us-east`, the fields `cpu_usage` is 42.5 and `load1` is 0.74, at this nanosecond timestamp.

A **series** is the unique combination of `measurement + tag set`. The number of unique series is your **cardinality** — the most important sizing variable.

Query examples:

InfluxQL (v1/v2 compatibility):
```sql
SELECT mean("cpu_usage") FROM "cpu"
WHERE "region"='us-east' AND time > now() - 1h
GROUP BY "host", time(1m);
```

Flux (v2):
```text
from(bucket:"telemetry")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement == "cpu" and r.region == "us-east")
  |> aggregateWindow(every: 1m, fn: mean)
  |> yield()
```

SQL (v3):
```sql
SELECT host, time_bucket('1 minute', time) AS minute, AVG(cpu_usage)
FROM cpu
WHERE region = 'us-east' AND time > NOW() - INTERVAL '1 hour'
GROUP BY host, minute
ORDER BY minute;
```

## Architecture & Internals
- **TSI (Time Series Index)** — keeps the mapping `series-key → series-id` in a memory-mapped file.
- **TSM (Time-Structured Merge tree)** — InfluxDB's columnar storage engine. Writes go to a **WAL → in-memory cache → TSM file**, which gets compacted and compressed.
- **Compaction** merges multiple TSM files, recomputes encodings, and applies retention policies.
- **Compression:** RLE on timestamps (often near-zero overhead), Gorilla-style XOR for floats, dictionary for strings — typical 5–20× compression.

**InfluxDB v3 (IOx):**
- Storage: **Parquet on object storage (S3, GCS)**.
- Query engine: **Apache DataFusion** (SQL).
- Decoupled compute and storage, columnar end-to-end. This is a major architectural shift; v3 is closer in design to Snowflake/ClickHouse than to its own v1/v2 ancestors.

## Consistency Model
- **Per-write atomic** — a single line-protocol point is atomic.
- **Eventually consistent for replication** in clustered/Cloud variants.
- **No multi-point transactions** in the SQL sense — but single ingestion batches are atomic.
- Writes are write-once; updates "overwrite" by writing a newer point with the same timestamp+series, with last-write-wins semantics.

## Replication
- **OSS InfluxDB** is single-node — replication and HA require InfluxDB Enterprise or InfluxDB Cloud.
- **Enterprise/Cloud** uses a cluster of meta + data nodes; configurable replication factor per database.
- Backups are essential — built-in `influxd backup`/`restore` handles snapshots; v3 is naturally backed up via S3.

## Partitioning / Sharding
- **Shard groups** by time window — e.g., one shard per day. New writes go to the active shard; older shards become read-only.
- Within a shard, data is partitioned by the **series** (measurement + tag set).
- **High cardinality is the killer**: each unique series creates index entries in TSI. With millions of series, RAM usage explodes.
- **Hot-cardinality pitfall:** putting a high-cardinality value as a **tag** (e.g. `userId`, `requestId`, `traceId`) blows up cardinality. Such values belong in **fields**, not tags — fields are not indexed for filtering, but they don't add to cardinality.

## Scale of a Single Instance
- A solid OSS node can handle **hundreds of thousands of writes/sec** and **tens of millions of unique series** before cardinality becomes painful.
- **Disk:** time-series compresses 5–20×, so 1 TB of raw data → 50–200 GB on disk.
- **RAM:** budget enough to hold the TSI in memory; cardinality drives this directly.
- **When to scale out:** when single-node cardinality > ~10M, or sustained write throughput > 500k points/sec. Use Enterprise/Cloud, or move to v3 + object storage which decouples capacity from a single node.

## Performance Characteristics
- **Writes:** 100k+ points/sec/node typical, 1M+/sec on a beefy node.
- **Range queries on small time windows:** sub-100ms.
- **Wide-range aggregations** (a year of data, group by week): seconds — depends heavily on whether you have **continuous queries / downsampling** materializing aggregates.
- **Bottlenecks:** cardinality (TSI in RAM), compaction (CPU + IO), high-cardinality `GROUP BY` queries.

## Trade-offs

| Strength | Weakness |
|---|---|
| Tuned column engine + compression for time-series | High cardinality (millions of unique series) is painful in v1/v2 |
| Pull / push, line protocol, broad client support | Three query languages over time (InfluxQL → Flux → SQL) — historical fragmentation |
| Continuous queries downsample old data automatically | Single-node OSS — HA needs Enterprise/Cloud |
| Built-in dashboards (Chronograf / Cloud UI) | Dashboards weaker than Grafana — most people use Grafana anyway |
| v3 (IOx) gives columnar + S3 + DataFusion (SQL) | v3 is a big rewrite — version compatibility considerations |
| Strong fit with Telegraf for collection | Smaller community than Prometheus in K8s observability |

## Common HLD Patterns
- **DevOps observability:** apps → Telegraf or StatsD agents → InfluxDB → Grafana dashboards + Kapacitor / Flux tasks for alerting.
- **IoT pipeline:** devices → MQTT broker → Telegraf → InfluxDB → Grafana / custom UI.
- **Financial ticks:** market feed → Kafka → consumer that writes to InfluxDB → trading dashboards.
- **Long-retention metrics layer in front of Prometheus:** Prometheus for short-term, remote-write to InfluxDB for years of retention.

## Common Pitfalls / Gotchas
- **High-cardinality tag explosion** is the single biggest production trap. Don't put unbounded values (user IDs, request IDs) as tags. Mantra: tags are for grouping/filtering, fields are for values.
- **No deletes by predicate at scale** in v1/v2 — drop entire shards/buckets via retention policy, not row-by-row.
- **Cardinality estimation:** use `SHOW SERIES CARDINALITY` regularly to track growth.
- **Confusing tags vs fields** at schema design — fields aren't indexed for filtering.
- **Mixing measurement schemas** — adding/removing tags between writes leads to fragmented series.
- **Forgetting to set retention** — disk fills up silently.
- **InfluxDB v1 vs v2 vs v3** — different APIs, different query languages, careful with compatibility.

## Interview Cheat Sheet
- **Tagline:** Purpose-built time-series DB optimized for append-mostly, time-bucketed reads.
- **Best at:** IoT, app metrics, financial ticks, dense time-series workloads.
- **Worst at:** general OLTP, high-cardinality tags, complex non-time joins.
- **Scale of one node:** 100k+ points/sec, tens of millions of series; cardinality is the limit.
- **Shard by:** time (shard groups) automatically; within shards, by series (measurement + tags).
- **Consistency:** per-point atomic, eventually-consistent in clustered Enterprise/Cloud.
- **Replicates how:** OSS = none; Enterprise/Cloud = configurable replication factor; v3 leans on S3/object-store durability.
- **Killer alternative:** TimescaleDB (Postgres-based), Prometheus (pull-model metrics), QuestDB / VictoriaMetrics, ClickHouse for analytics-flavored TSDB.

## Further Reading
- Official docs: <https://docs.influxdata.com/>
- Schema design / cardinality: <https://docs.influxdata.com/influxdb/v2/write-data/best-practices/schema-design/>
- TSM storage engine paper: <https://www.influxdata.com/blog/new-storage-engine-time-structured-merge-tree/>
- InfluxDB IOx (v3) deep dive: <https://www.influxdata.com/blog/influxdb-3-0-system-architecture/>
