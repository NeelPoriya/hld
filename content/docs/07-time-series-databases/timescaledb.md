---
title: "TimescaleDB"
description: "TimescaleDB is a time-series database built as a PostgreSQL extension. You get the full SQL/Postgres ecosystem (joins, JSON, geo, ACID) plus automatic time-partitioning, columnar compression, and continuous aggregates."
---

> Category: Time-Series Database (TSDB) on top of PostgreSQL · Written in: C · License: Apache 2.0 (community) / Timescale License (TSL — for some Enterprise features) / Commercial Cloud

## TL;DR
TimescaleDB is a **PostgreSQL extension** that turns Postgres into a first-class time-series database. Tables become **hypertables**, which are automatically partitioned by time (and optionally another dimension) into many small chunks under the hood. You query them with **plain SQL** — including joins to your relational tables, JSON fields, geo data, full-text search, and anything else Postgres offers. Reach for TimescaleDB when your time-series data needs to live next to your transactional data, or when your team already knows Postgres and doesn't want to learn a new query language.

## What problem does it solve?
You have a PostgreSQL stack and a growing pile of time-series data — metrics, events, sensor readings, financial ticks. You want:
- Time-series performance (ingest rates, range queries, compression, retention).
- The full PostgreSQL ecosystem — joins, transactions, JSONB, PostGIS, replication, BI tool support.
- One operational stack, not "Postgres + a separate TSDB."

Plain Postgres degrades on time-series at scale: B-tree indexes on timestamp columns become massive; deleting old data is expensive; aggregations over years of data are slow without materialized views. TimescaleDB solves this without leaving Postgres.

## When to use
- **Mixed workload** — transactional + time-series in the same DB. Joins between time-series and reference tables become trivial.
- **Existing Postgres team / stack** — zero new mental model, just `CREATE EXTENSION timescaledb`.
- **IoT, app metrics, financial data** at the small-to-medium scale (TB-class on a single node, more with multi-node).
- **You need the Postgres ecosystem features** — PostGIS for geo time-series, JSONB for flexible payloads, foreign data wrappers, logical replication.
- **BI / analytics on time-series** — any tool that talks Postgres (Tableau, Metabase, Grafana, dbt, Python `psycopg`) just works.

## When NOT to use
- **Massive single-tenant scale** (millions of writes per second sustained, 100s of TB) — InfluxDB / VictoriaMetrics / ClickHouse are tuned harder for this.
- **Pure Kubernetes observability use cases** — Prometheus is more idiomatic.
- **You don't need joins or relational features** — pure-TSDB might be simpler.
- **Your team has zero Postgres expertise** — adoption curve includes learning Postgres operational best practices.

## Data Model
- A **hypertable** is a Postgres table you've decorated with `create_hypertable('temperature','time')`. To users, it looks like a normal table.
- Under the hood, the hypertable is partitioned into **chunks** — a chunk is itself a table holding rows for a specific time range (and optionally a space dimension).
- You can `INSERT`, `SELECT`, `UPDATE`, `DELETE` like any Postgres table; the planner routes rows to the right chunk.

```sql
CREATE TABLE conditions (
  time        TIMESTAMPTZ NOT NULL,
  device_id   TEXT NOT NULL,
  temperature DOUBLE PRECISION,
  humidity    DOUBLE PRECISION
);

SELECT create_hypertable('conditions', 'time', chunk_time_interval => INTERVAL '1 day');
```

A typical query:
```sql
SELECT time_bucket('1 minute', time) AS minute,
       device_id,
       AVG(temperature) AS avg_temp
FROM conditions
WHERE time > NOW() - INTERVAL '1 hour'
GROUP BY minute, device_id
ORDER BY minute;
```

`time_bucket()` is the killer convenience — like `date_trunc()` but with arbitrary intervals (e.g. `5 minutes`, `90 seconds`).

## Architecture & Internals
- A standard **PostgreSQL** instance + the `timescaledb` extension.
- **Hypertables → chunks** auto-partitioned by `chunk_time_interval` (default 1 week).
- **Chunk exclusion**: when a query has a `time` predicate, the planner skips chunks outside the range — basically free partition pruning.
- **Compression** — convert old chunks to a column-store-like representation. Floats use Gorilla XOR encoding, integers use delta-of-delta, strings use dictionary. Typical 10–20× compression. Compressed chunks are read-only by default.
- **Continuous Aggregates** — materialized views that automatically refresh as new data arrives. Pre-compute `1m`/`5m`/`1h` rollups so dashboards don't scan raw data.
- **Retention policies** — schedule chunk drops past a threshold (`drop_chunks` automated as a job).
- **Multi-node Timescale** (Enterprise / Cloud) — a coordinator + N data nodes shard hypertables across the cluster.

## Consistency Model
- **Full ACID** — same as Postgres. Multi-row, multi-table, multi-index transactions all work.
- **Read-your-writes**, serializable isolation available.
- This is one of the biggest differentiators vs InfluxDB / Prometheus, both of which are non-transactional.

## Replication
- Standard **Postgres streaming replication** (sync or async, hot standby for reads) — TimescaleDB hypertables replicate seamlessly.
- **Logical replication** also works, including for replicating into a non-TimescaleDB Postgres.
- **Multi-node** Timescale (Enterprise/Cloud) replicates across data nodes for HA + scale-out.
- DR via standard Postgres tooling: `pg_basebackup`, WAL-E / WAL-G to S3, point-in-time recovery.

Failover RPO ≈ 0 with synchronous replication; RTO depends on your failover orchestration (Patroni, repmgr, RDS, Timescale Cloud).

## Partitioning / Sharding
- **Time partitioning is automatic** — pick `chunk_time_interval` to fit your scale. Smaller intervals = more chunks = more planning overhead but smaller individual chunks.
- **Optional space partitioning** — split each time chunk further by hash of a column (e.g. `device_id`) for parallel ingest scale on a single node.
- **Multi-node Timescale** distributes chunks across data nodes by hash of the partition key.

**Hot-chunk pitfall:** with very fine `chunk_time_interval` plus very high write rate, you get many small chunks per minute. Plan to have at most a few hundred to a few thousand chunks per hypertable in OSS. The Continuous Aggregates + retention combo keeps this bounded.

## Scale of a Single Instance
- A modern Postgres + Timescale node (32–64 vCPU, 256+ GB RAM, NVMe) can comfortably handle:
  - **100k–1M rows/sec** ingest with batch inserts.
  - **Tens of TB** of compressed time-series data.
  - **Tens of thousands of chunks** with proper config.
- For dashboards backed by Continuous Aggregates: sub-100ms.
- **When to scale out:** beyond a single beefy node, use multi-node Timescale (Enterprise/Cloud) or split by tenant. Most users never need this.

## Performance Characteristics
- **Ingest:** 100k–1M rows/sec on a single node with batched COPY/inserts.
- **Range queries:** chunk exclusion makes "last 24h on this device" trivially fast — pruned at planning time.
- **Aggregations:** with Continuous Aggregates pre-computing rollups, dashboard queries are sub-second on TBs of data.
- **Compression:** old chunks 10–20× smaller; queries on compressed chunks ~5–10× faster than on uncompressed.
- **Bottlenecks:** WAL throughput on heavy write spikes (use Postgres tuning + SSD), planner overhead with too many chunks (keep chunks ≥ 100MB).

## Trade-offs

| Strength | Weakness |
|---|---|
| It's PostgreSQL — full SQL, joins, JSON, transactions | Tied to Postgres limits (no per-row updates on compressed chunks by default; addressed by recent versions) |
| One stack — TS + relational data side-by-side | Less optimized than purpose-built TSDBs for extreme write scale |
| Continuous aggregates make dashboards fast | Setting them up is your responsibility; not magic |
| Compression makes long retention affordable | Compressed chunks have limitations (e.g. some operations require decompression) |
| Standard Postgres tooling (replication, backup, BI) | Multi-node version requires Enterprise/Cloud license for some features |
| Excellent fit with Grafana | Bigger memory footprint than Prometheus / InfluxDB at same data volume |

## Common HLD Patterns
- **App metrics + business data:** transactional tables (orders, users) + hypertables (events, telemetry) in the same DB → joins for dashboards like "revenue per region per minute."
- **IoT platform:** devices → message broker → ingest service → TimescaleDB hypertable; PostGIS for location queries; continuous aggregates power dashboards.
- **Financial back-office:** trades + ticks together; daily P&L queries that join positions to time-series prices.
- **Long-retention metrics:** apps → Prometheus (short-term) → remote-write to TimescaleDB (long-term, years).

## Common Pitfalls / Gotchas
- **Chunk size sweet spot:** chunks should be ≥ ~100MB and small enough to fit hot ones in shared_buffers. Default `1 day` is fine for moderate volume; tune for heavier ingest.
- **Too many chunks → planner slowdown** — keep chunks per hypertable in the low thousands. Use longer `chunk_time_interval` if needed.
- **Forgetting to enable compression** for old chunks → disk fills up.
- **Updating compressed chunks** requires decompression unless you use the newer "row-by-row update" features — design for append-mostly workloads.
- **Continuous aggregate refresh policies** — set them up; otherwise the materialized view stays stale.
- **JSONB with random keys** in time-series payloads bloats indexes; use typed columns where possible.
- **License confusion:** OSS edition is Apache 2.0 for the core; some Enterprise features (multi-node, advanced compression) are TSL.

## Interview Cheat Sheet
- **Tagline:** PostgreSQL extension that turns Postgres into a first-class time-series DB — full SQL + auto-partitioning + columnar compression.
- **Best at:** mixed transactional + time-series workloads; teams who already know Postgres.
- **Worst at:** extreme single-tenant scale beyond a few TB/sec; pure-K8s metrics where Prometheus is idiomatic.
- **Scale of one node:** 100k–1M rows/sec ingest, tens of TB compressed.
- **Shard by:** time (auto-chunked); optionally space (hash on a column) for parallelism.
- **Consistency:** ACID — full Postgres semantics.
- **Replicates how:** Postgres streaming/logical replication; multi-node Timescale for distributed clusters.
- **Killer alternative:** InfluxDB (purpose-built TSDB), Prometheus (K8s metrics), ClickHouse / VictoriaMetrics (extreme scale), DuckDB / SQLite (single-machine analytics).

## Further Reading
- Official docs: <https://docs.timescale.com/>
- Hypertables explained: <https://docs.timescale.com/use-timescale/latest/hypertables/>
- Continuous aggregates: <https://docs.timescale.com/use-timescale/latest/continuous-aggregates/>
- Compression deep-dive: <https://www.timescale.com/blog/time-series-compression-algorithms-explained/>
