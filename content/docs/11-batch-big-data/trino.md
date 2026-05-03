---
title: "Trino (and Presto)"
description: "Trino is a distributed SQL query engine for federated analytics — query Hive, S3, MySQL, Postgres, Kafka, MongoDB, Elasticsearch, and dozens of others with a single SQL interface, fast."
---

> Category: Federated Distributed SQL Query Engine · Written in: Java · License: Apache 2.0

## TL;DR
Trino (formerly **PrestoSQL**, forked from Facebook's Presto) is a **distributed SQL query engine** that lets you run **interactive queries across many data sources from one SQL endpoint**. Unlike a warehouse, Trino doesn't store data; it has dozens of **connectors** (Hive, Iceberg, Delta, Postgres, MySQL, Cassandra, Kafka, MongoDB, Elasticsearch, S3, Redshift, Snowflake, BigQuery, …) and pushes computation down to each. Reach for Trino as the **SQL gateway for your data lake** and as a **federated query engine** when you need to join Postgres + S3 + Kafka in one query. **Presto** still exists as a separate fork (PrestoDB, maintained by Facebook); **Trino** is the more actively-developed community version most teams pick today.

## What problem does it solve?
You have data in a dozen places — a Postgres source-of-truth, S3 / HDFS data lake, a Kafka stream, an Elasticsearch index, a Redshift / Snowflake warehouse — and your analysts want to:
- Query the data lake with fast SQL (sub-minute on TBs).
- Join data from different systems without ETL'ing everything into one place.
- Use one tool, one SQL dialect.

Building one ETL into a single warehouse is expensive and slow. Trino federates the query layer: leave data where it is, query it with one SQL.

## When to use
- **SQL gateway for the data lake** — Hive / Iceberg / Delta tables on S3 / HDFS / GCS, queried interactively.
- **Federated joins** — Postgres ↔ S3 ↔ Kafka ↔ Elasticsearch in one query.
- **Lakehouse architectures** — Trino + Iceberg / Delta is the modern OSS lakehouse.
- **Self-service ad-hoc analytics** for analysts.
- **BI tools** (Tableau, Superset, Looker) connected via JDBC.
- **You want OSS + cloud-portable** — Trino runs anywhere; Starburst / Athena / EMR are managed flavors.

## When NOT to use
- **OLTP** — Trino is read-mostly; some connectors support `INSERT`, but it's not for transactions.
- **Sub-second dashboards at high concurrency** — Trino is interactive (seconds), not sub-second OLAP. Use ClickHouse / Druid / Pinot.
- **Long-running batch** — for hour-long ETL, use Spark.
- **You don't already have a data lake** — Trino shines as a query layer on top of one.
- **Tiny single-machine analysis** — DuckDB is much simpler.

## Data Model
- Trino is **schema-less**; the schema lives in the connector (e.g. Hive Metastore, Iceberg catalog, Postgres `information_schema`).
- **Catalog → Schema → Table** addressing — `hive.web.events`, `postgres.public.users`, `iceberg.lake.orders`.
- **Federated joins** look like ordinary JOINs across catalogs.

```sql
-- Lake (Iceberg / Hive on S3) joined to Postgres OLTP source
SELECT u.email, o.order_id, o.amount
FROM postgres.public.users u
JOIN iceberg.lake.orders  o ON o.user_id = u.id
WHERE o.order_date > current_date - 7;
```

```sql
-- Iceberg + time travel
SELECT *
FROM iceberg.lake.orders FOR VERSION AS OF 1234567890;
```

## Architecture & Internals
- **Coordinator** — parses SQL, plans the query, schedules splits to workers.
- **Workers** — fetch data from sources, execute operators in memory, exchange data over network.
- **Connectors** — pluggable readers/writers that expose external systems as SQL tables (Hive, Iceberg, Delta, JDBC, Kafka, Cassandra, …).
- **Discovery service** — workers register with the coordinator.
- **Query plan** is a DAG of stages, each stage is many tasks running on workers.
- **In-memory execution** — Trino doesn't use disk for shuffle by default; large queries can fall over without spill-to-disk enabled.

```
analyst → JDBC → [Trino Coordinator] → splits → [Worker × N]
                                                  ↓
                                    connectors → S3 / Hive / Postgres / Kafka / ES / …
```

## Consistency Model
- **Read-your-write** depends on the underlying source — Trino doesn't add consistency guarantees.
- **No native transactions across sources** — federated joins are best-effort, eventually consistent across systems.
- **Iceberg / Delta** connectors expose ACID semantics of those table formats — snapshot isolation, time travel.

## Replication
- Trino itself doesn't store data; replication is the source's responsibility.
- **High availability**: multiple coordinators / fault-tolerant execution mode (Trino can checkpoint stages so failed workers don't kill the whole query).
- **Multi-region** — typical pattern is a Trino cluster per region; federation across them is possible but rare.

## Partitioning / Sharding
- **Splits** — Trino splits a table scan into parallel chunks; partitioning of the source (Hive partitions, Iceberg partition specs, Kafka partitions) drives parallelism.
- **Connector-driven** — Trino doesn't shard data; it asks each connector to expose splits.
- **Worker scaling** — add workers for more parallelism; queries fan out wider.

**Hot-source pitfall:** federating to a Postgres source can hammer the OLTP DB; use predicate pushdown and limit fan-out, or copy hot data to the lake.

## Scale
- **Hundreds of TB scanned** in a single query (with fault-tolerant execution).
- **Hundreds of workers** in large clusters; thousands at hyperscalers.
- **Query concurrency** — depends on workload; tens to hundreds of concurrent interactive queries with proper resource groups.

## Performance Characteristics
- **Latency:** seconds-to-minutes for typical lake queries; sub-second on small slices.
- **In-memory execution** is fast but has memory limits; spill-to-disk is opt-in.
- **Cost-based optimizer** uses table stats (collected via `ANALYZE`) for join ordering, broadcast vs partition.
- **Bottlenecks:** memory for shuffle joins, network bandwidth between workers, slow source connectors (a slow Postgres source bottlenecks the whole query).

## Trade-offs

| Strength | Weakness |
|---|---|
| One SQL across many sources (federation) | Source-of-truth perf is your problem |
| OSS, cloud-portable, vibrant community | Memory-bound (without spill) for huge joins |
| Iceberg / Delta / Hive on S3 = modern lakehouse | Not a storage layer — keep ETL/governance elsewhere |
| Seconds-latency interactive queries | Not sub-second OLAP at high QPS |
| Connector ecosystem (40+ connectors) | Connector quality varies |
| Fault-tolerant execution mode for long queries | Coordinators can be a SPOF without HA setup |

## Common HLD Patterns
- **SQL gateway for the data lake:** Iceberg tables on S3 + Trino + BI tools.
- **Federated join:** product DB (Postgres) + event lake (S3) + experiment metadata (Kafka via connector); single SQL across all.
- **Lakehouse architecture:** Spark for ETL + Iceberg / Delta for storage + Trino for interactive queries.
- **Self-service analytics platform:** Trino + Superset / Metabase / Hex + IAM-mapped resource groups.
- **Batch + ad-hoc split:** Spark for nightly ETL, Trino for ad-hoc queries against the same Iceberg tables.

## Common Pitfalls / Gotchas
- **Memory blow-ups** — joins materialize hash tables in worker memory; enable spill or use partition-style joins.
- **Slow source connector** dominates query time — push down predicates, materialize hot data into the lake.
- **Cross-region federated queries** are slow; pin Trino near the data.
- **No statistics** on Hive / Iceberg tables → bad plans. Run `ANALYZE TABLE ...`.
- **Coordinator SPOF** — run multiple coordinators behind a load balancer, or use Starburst's enterprise HA.
- **JDBC pushdown limits** — not all SQL features are pushed down to JDBC sources; check for explicit pushdown.
- **Confusing Trino vs PrestoDB vs Athena** — they share roots but diverged; the dialect, performance, and features differ.

## Interview Cheat Sheet
- **Tagline:** Distributed SQL query engine for federated analytics — query S3, Postgres, Kafka, etc. from one SQL.
- **Best at:** lakehouse SQL on S3 + Iceberg/Delta, federated joins, BI on the lake.
- **Worst at:** OLTP, sub-second OLAP at high QPS, long-running batch ETL.
- **Scale:** hundreds of TB per query with FTE, hundreds of workers, dozens of connectors.
- **Shard by:** source-driven splits (Hive partitions, Iceberg partitioning, Kafka partitions).
- **Consistency:** depends on connector; ACID via Iceberg / Delta; eventual across federated joins.
- **Replicates how:** doesn't — relies on source replication.
- **Killer alternative:** Spark SQL (heavier, Spark-based), AWS Athena (managed Trino on S3), Starburst (enterprise Trino), Snowflake / BigQuery (storage + compute), Druid / ClickHouse (low-latency OLAP).

## Further Reading
- Trino docs: <https://trino.io/docs/current/>
- Connectors: <https://trino.io/docs/current/connector.html>
- Trino vs Presto history: <https://trino.io/blog/2020/12/27/announcing-trino.html>
- Iceberg + Trino lakehouse: <https://www.starburst.io/blog/iceberg-trino-modern-data-lakehouse/>
