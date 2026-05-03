---
title: "Apache Druid"
description: "Apache Druid is a real-time OLAP database for sub-second analytics on streaming and historical data — popular for clickstreams, observability, network telemetry, and operational dashboards."
---

> Category: Real-Time OLAP Database · Written in: Java · License: Apache 2.0

## TL;DR
Apache Druid is a **real-time OLAP database** purpose-built for **sub-second slice-and-dice queries** on **streaming + historical data simultaneously**. Born at Metamarkets to power ad-tech analytics, now used at Netflix, Confluent, Airbnb, Lyft, Walmart. Druid combines **columnar storage**, **bitmap inverted indexes**, **time-partitioned segments**, and a **lambda-style architecture** that ingests streams and batches into the same query view. Reach for Druid when you need **operational dashboards** with thousands of concurrent users, low latency, and freshness measured in seconds. Reach for **ClickHouse** for raw query speed at lower op cost; reach for **BigQuery / Snowflake** for batch-style BI on petabytes; reach for **Pinot** as Druid's closest cousin.

## What problem does it solve?
You need analytics that are:
- **Real-time** — events ingested seconds ago show up in dashboards.
- **Fast** — sub-second query latency at 100s–1000s QPS.
- **Slice-and-dice** — group by any dimension, filter on any column, time-bucketed.
- **Multi-tenant** — many concurrent users on the same data.
- **Mixed batch + streaming** — historical backfill + live feed in one queryable surface.

Warehouses are too slow / not real-time. ClickHouse is fast but lower concurrency. Elasticsearch isn't tuned for OLAP. Druid is the canonical answer for "operational analytics dashboards at scale."

## When to use
- **User-facing operational analytics** — dashboards inside SaaS products.
- **Clickstream / event analytics** with high QPS and low latency.
- **Network / security telemetry** with billions of rows/day and dashboards over them.
- **Observability** — metrics aggregations across many dimensions.
- **Real-time + historical queries combined** — Druid handles both natively.

## When NOT to use
- **Warehouse-style ad-hoc SQL** with complex joins — Druid joins are limited (lookup tables for dimensions, broadcast joins are recent).
- **OLTP / point updates** — Druid is append-mostly; updates require segment rewrites.
- **You don't need real-time freshness** — ClickHouse / BigQuery / Snowflake are simpler.
- **You hate Java distributed systems** — Druid has many node types (broker, coordinator, overlord, historical, middle-manager). Imply Lake / Imply Cloud help.
- **Tiny scale** — overkill for under 10s of GB.

## Data Model
- **Dataset / Datasource** — equivalent to a table.
- **Time-partitioned**: every datasource has a `__time` column; data segments are bucketed by time intervals (hour / day).
- **Dimensions** (filterable, groupable): typically strings, integers; bitmap-indexed.
- **Metrics** (aggregatable): typically numbers; pre-aggregated by ingestion spec via "rollup."
- **Rollup** — at ingestion, rows with the same dimension tuple are pre-aggregated (sum, count, hyperloglog), drastically reducing storage and accelerating queries.

```json
{
  "type": "kafka",
  "spec": {
    "dataSchema": {
      "dataSource": "events",
      "timestampSpec": {"column": "ts", "format": "iso"},
      "dimensionsSpec": {"dimensions": ["user_id", "event_name", "country"]},
      "metricsSpec": [
        {"type": "count", "name": "count"},
        {"type": "longSum", "name": "amount", "fieldName": "amount"},
        {"type": "hyperUnique", "name": "unique_users", "fieldName": "user_id"}
      ],
      "granularitySpec": {"queryGranularity": "minute", "rollup": true}
    },
    "ioConfig": {"topic": "events", ...},
    "tuningConfig": {"type": "kafka"}
  }
}
```

```sql
SELECT
  TIME_FLOOR(__time, 'PT1H') AS hour,
  country,
  SUM(count) AS events,
  SUM(amount) AS revenue,
  APPROX_COUNT_DISTINCT(user_id) AS users
FROM events
WHERE __time > CURRENT_TIMESTAMP - INTERVAL '1' DAY
GROUP BY 1, 2
ORDER BY 1 DESC
LIMIT 100;
```

## Architecture & Internals
Druid splits responsibilities across multiple node types:
- **Broker** — receives queries, fans out to historicals and middle-managers, merges results.
- **Coordinator** — manages segment assignment to historicals (load balancing, replication).
- **Overlord** — manages indexing tasks (ingest jobs).
- **Historical** — serves immutable segments from local SSD.
- **MiddleManager / Indexer** — runs streaming ingestion tasks; serves freshly-indexed in-memory segments until handed off.
- **Deep storage** — S3 / HDFS / GCS holds the durable copy of all segments.
- **Metadata DB** — MySQL / PostgreSQL stores segment catalog, task state.
- **ZooKeeper** — coordination across nodes.

```
ingest → MiddleManager (real-time segments) → handoff → Historical (immutable)
                  ↓                                          ↓
              [deep storage S3 / HDFS] ← coordinator manages →
broker ←──── queries fan out to MiddleManagers + Historicals ────────────
```

## Consistency Model
- **Eventually consistent** — recent ingested data is visible after a small delay.
- **Atomic segment handoff** — segments are immutable once published; no partial visibility.
- **No transactions** — append-mostly with periodic compaction / re-indexing for updates.

## Replication
- **Segment replication** — each segment is replicated across multiple historical nodes (configurable replication factor).
- **Deep storage** is the source of truth — even if all historicals lose a segment, it can be re-loaded from deep storage.
- **Cross-region** is not built-in — typically run separate clusters with shared deep storage or app-layer replication.

## Partitioning / Sharding
- **Primary partitioning is by time** — each segment covers a time interval.
- **Secondary partitioning** — within a time interval, you can hash- or range-partition by a dimension to spread load.
- **Compaction** — background re-indexing combines small segments into bigger ones for query efficiency.

**Hot-time-segment pitfall:** very-recent data is hot (always queried for "last hour" dashboards); cold (older) data is rarely scanned. Druid handles this naturally via tiered historicals (hot tier on SSDs, cold tier on cheaper disks).

## Scale of a Cluster
- **Trillions of events** demonstrated in production.
- **Hundreds of TB** with deep storage on S3.
- **Sub-second p99 latency** on millions of rows scanned per query.
- **Thousands of concurrent QPS** with broker/historical scale-out.
- **Insert throughput:** millions of events/sec via Kafka indexing.

## Performance Characteristics
- **Query latency p99:** sub-second to few seconds for OLAP aggregations.
- **Ingest latency** (event → queryable): seconds (with rollup), sub-second possible without rollup.
- **Bottlenecks:** broker fan-out time at high QPS, historical disk I/O on cold queries, segment count (too many small segments slows planning).
- **Approximate functions** (`APPROX_COUNT_DISTINCT` via HyperLogLog, `APPROX_QUANTILE` via DataSketches) make impossible queries cheap.

## Trade-offs

| Strength | Weakness |
|---|---|
| Real-time + historical in one query | Many node types — operational complexity |
| Sub-second OLAP at high concurrency | Joins are limited (lookups + broadcast only) |
| Rollup massively reduces storage and speeds queries | Choosing rollup granularity is irreversible (need re-ingest) |
| Time-partitioned + bitmap indexes = great pruning | DML / updates expensive (segment rewrite) |
| Battle-tested at extreme scale (Netflix, Walmart) | Steeper learning curve than ClickHouse |
| Approximate sketches for cardinality, quantiles | Smaller community than warehouses |

## Common HLD Patterns
- **Operational dashboards inside a SaaS product:** Kafka → Druid (with rollup) → product UI dashboards (sub-second).
- **Network / security telemetry:** flows / events → Druid → SOC dashboards.
- **Clickstream analytics:** SDK → Kafka → Druid → product analytics UI.
- **A/B test analysis:** events with experiment ID dimension → Druid → real-time experiment dashboards.
- **Lambda architecture:** historical batch reprocessing into deep storage + real-time stream → unified Druid query view.

## Common Pitfalls / Gotchas
- **Wrong rollup granularity** — too coarse loses information; too fine kills compression. Pick deliberately and align to query patterns.
- **High-cardinality dimensions** as group-by columns — quickly blow up segment size.
- **Tiny segments** — too many small segments hurt planning. Compact.
- **Joins** — design with star schema + lookups; don't try to join two huge fact tables.
- **Streaming ingestion lag** — monitor `kafka_supervisor` lag; under-provisioned middle managers cause backups.
- **Deep storage cost** — multiple copies (deep + replicas on historicals) at petabyte scale add up.
- **Coordinator + Overlord HA** — must run multiple instances in production for HA.

## Interview Cheat Sheet
- **Tagline:** Real-time OLAP DB for sub-second analytics on streaming + historical data — time-partitioned, columnar, bitmap-indexed.
- **Best at:** operational dashboards, clickstream, observability, real-time analytics with high concurrency.
- **Worst at:** OLTP, big joins, batch BI, simple-ops deployments.
- **Scale:** trillions of events, hundreds of TB, sub-second at thousands of QPS.
- **Shard by:** primary by time; secondary by dimension hash within each time bucket.
- **Consistency:** eventually consistent; atomic segment handoff; immutable segments.
- **Replicates how:** segment replicas across historicals; deep storage as source of truth.
- **Killer alternative:** Apache Pinot (closest cousin, slightly different design), ClickHouse (simpler, faster single-node), Elasticsearch (search-flavored), BigQuery / Snowflake (batch warehouses).

## Further Reading
- Official docs: <https://druid.apache.org/docs/latest/design/>
- Architecture deep dive: <https://druid.apache.org/docs/latest/design/architecture>
- Rollup explained: <https://druid.apache.org/docs/latest/ingestion/rollup>
- Druid vs Pinot vs ClickHouse: <https://imply.io/blog/druid-vs-clickhouse-vs-pinot/>
