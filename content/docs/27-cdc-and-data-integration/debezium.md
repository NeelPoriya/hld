---
title: "Debezium"
description: "Debezium is the open-source Change Data Capture platform — turns the WAL/binlog/oplog of databases into Kafka topics, enabling event-driven architectures and zero-downtime migrations."
---

> Category: CDC & Data Integration · Written in: Java · License: Apache 2.0

## TL;DR
Debezium is the **canonical open-source Change Data Capture (CDC) framework**. It tails the transaction log of source databases (Postgres logical replication, MySQL binlog, MongoDB oplog, Oracle LogMiner, SQL Server CDC, Cassandra, …) and emits row-level **insert / update / delete events** as Kafka messages — typically through Kafka Connect. The result: every change in your OLTP database becomes an event stream that feeds search indexes, caches, data lakes, microservice projections, audit logs, and zero-downtime migrations. Reach for Debezium when you need **event-driven derivations from existing OLTP** without dual-writes (the bug-prone pattern of writing to DB + queue from app code).

## What problem does it solve?
- **Dual writes are buggy** — writing to DB and queue from app code has no atomicity; one can fail.
- **Polling for changes is slow + lossy** — `WHERE updated_at > ?` misses deletes, has lag.
- **Outbox pattern needs CDC** — atomic write to DB + outbox table; CDC ships outbox to downstream.
- **Zero-downtime migration** — replicate from old DB to new while keeping both alive (Postgres → Spanner, MySQL → Aurora, on-prem → cloud).
- **Search index sync** — DB → Debezium → Kafka → ElasticSearch.
- **Microservice event sourcing** — every order_status change becomes an event.

## When to use
- **Event-driven architectures** anchored on existing OLTP.
- **Search index / cache hydration** — keep ElasticSearch / Redis fresh via DB events.
- **Data warehouse loading** — DB → Debezium → Kafka → Snowflake / BigQuery / Iceberg.
- **Audit logs / compliance** — every change captured with timestamp + user.
- **Zero-downtime migrations** — replicate between heterogeneous databases.
- **Service decomposition** — extract a microservice and replay history via CDC.

## When NOT to use
- **Tiny / single-service systems** — overkill; just write events from app code.
- **No Kafka / Pulsar** — Debezium Server / Embedded variants exist but most teams pair with Kafka Connect.
- **Heavy schema evolution chaos** — Avro + Schema Registry helps but governance is required.
- **Sub-ms event latency required** — Debezium typical latency is sub-second to a few seconds.
- **Cross-region high availability** with strict ordering — multi-source CDC topology requires care.

## Data Model
- **Connector** — Kafka Connect connector (e.g., `io.debezium.connector.postgresql.PostgresConnector`).
- **Source** — DB (Postgres) + replication slot / publication.
- **Topic per table** — `serverName.schemaName.tableName` is the default.
- **Event envelope:** `{ before, after, source, op, ts_ms }` — `op` is `c` (create) / `u` (update) / `d` (delete) / `r` (read snapshot).
- **Schema** — Debezium emits Avro / JSON / Protobuf with a schema; Schema Registry handles versions.
- **Snapshot + streaming** — connector first snapshots existing rows (`r` events), then switches to log streaming.

```json
// Sample Debezium event (Postgres customers table)
{
  "before": { "id": 42, "email": "old@acme.com", "tier": "free" },
  "after":  { "id": 42, "email": "new@acme.com", "tier": "pro" },
  "source": {
    "version": "2.7.0", "connector": "postgresql",
    "name": "inventory", "ts_ms": 1726234567000,
    "snapshot": "false", "db": "shop", "schema": "public",
    "table": "customers", "txId": 9012345, "lsn": 23456789
  },
  "op": "u", "ts_ms": 1726234567500
}
```

```json
// Postgres connector config (Kafka Connect REST)
{
  "name": "shop-pg-cdc",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "tasks.max": "1",
    "database.hostname": "shop-db.internal",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${file:/secrets/debezium.pwd}",
    "database.dbname": "shop",
    "topic.prefix": "shop",
    "plugin.name": "pgoutput",
    "publication.autocreate.mode": "filtered",
    "table.include.list": "public.customers,public.orders,public.outbox",
    "snapshot.mode": "initial",
    "key.converter": "io.confluent.connect.avro.AvroConverter",
    "value.converter": "io.confluent.connect.avro.AvroConverter"
  }
}
```

## Architecture
- **Kafka Connect cluster** runs Debezium connectors; each connector spawns tasks.
- **Source DB** — Debezium uses native log mechanisms:
  - Postgres: logical replication via `pgoutput` (Postgres 10+).
  - MySQL: binlog (row-based).
  - MongoDB: oplog / change streams.
  - Oracle: LogMiner / XStream.
  - SQL Server: CDC tables.
- **Replication slot** in Postgres / binlog position in MySQL — the connector remembers offset.
- **Snapshot** — initial bulk copy of existing rows (so consumers don't need historical data elsewhere).
- **Schema Registry** — Avro / Protobuf / JSON Schema.
- **Sink connectors** — Kafka Connect sinks into ElasticSearch, S3, Snowflake, JDBC.

## Trade-offs

| Strength | Weakness |
|---|---|
| Lossless, low-latency CDC for many DBs | Operational overhead — Kafka Connect cluster + Schema Registry |
| Snapshot + streaming hand-off | Snapshots can take hours on huge tables |
| Standard event envelope | Schema evolution requires discipline |
| Solves dual-write problem (with outbox) | Doesn't replace need for app event design |
| Mature; CNCF-incubation; Red Hat-led | Single connector / task = single point of failure (per source) |
| Works for migrations + projections + search | Postgres logical replication has caveats (slot bloat, no DDL) |
| Embedded mode for small / library use | Avro + Schema Registry adds another moving part |

## Common HLD Patterns
- **Outbox pattern:** app writes `orders` + `outbox` rows in same transaction; Debezium ships `outbox` events to downstream; consumers ignore raw `orders` topic.
- **Search index sync:** Debezium → Kafka → Elastic sink connector → ElasticSearch.
- **Cache invalidation:** Debezium → Kafka → small Lambda / consumer that DELETEs cache keys.
- **DWH ingestion:** Debezium → Kafka → S3 sink (Iceberg / Parquet) → Snowflake / BigQuery loader.
- **Zero-downtime DB migration:** Debezium replicates Postgres → Spanner; dual reads validate; cutover writes; tear down old.
- **Event sourcing for read models:** materialize denormalized read models (customer-summary, order-history) consuming CDC.
- **GDPR / right-to-erasure** — capture deletes as tombstone events; downstream stores honor.

## Common Pitfalls / Gotchas
- **Postgres replication slot bloat** — if no consumer, WAL piles up and disk fills; monitor `pg_replication_slots.confirmed_flush_lsn`.
- **DDL changes** — Postgres logical replication doesn't replicate DDL; Debezium signals schema change events; consumers must adapt.
- **Schema evolution** — adding a column = forward-compatible; renaming = breaks consumers.
- **Tombstones for deletes** — Debezium can emit tombstone (null value) for compacted topics; understand log compaction semantics.
- **Initial snapshot blocks** — long snapshots can hold replication slot open and bloat WAL; use incremental snapshots.
- **Topic explosion** — 1 topic per table * many tables = many topics; consider routing SMTs to consolidate.
- **Operational complexity** — Kafka + Connect + Schema Registry + monitoring is a real platform.
- **Ordering** — single-task per connector = ordered per table; multi-task only by partition key.
- **Replica vs primary source** — capturing from a replica adds extra lag.
- **Long transactions** stall the slot; vacuuming + slot timeouts matter.

## Interview Cheat Sheet
- **Tagline:** Open-source CDC; tails DB logs (Postgres WAL, MySQL binlog, Mongo oplog) → Kafka topics; foundation for outbox / event sourcing / search sync / migrations.
- **Best at:** event-driven architectures on existing OLTP, zero-downtime migrations, search index hydration, audit logs.
- **Worst at:** tiny single-service systems, sub-ms latency, no-Kafka environments.
- **Scale:** one connector per source DB; throughput scales with Kafka Connect workers; typical 10k–100k events/s per connector.
- **Distributes how:** Kafka Connect tasks; partitioning across topics by primary key.
- **Consistency / state:** at-least-once delivery; ordering preserved per primary key; offset stored in Connect.
- **Killer alternative:** Maxwell / Canal (MySQL only), AWS DMS (managed migration), Striim, Fivetran (managed CDC), Estuary Flow, Confluent CDC connectors, native logical replication.

## Further Reading
- Official docs: <https://debezium.io/documentation/>
- Outbox pattern: <https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/>
- Postgres connector: <https://debezium.io/documentation/reference/stable/connectors/postgresql.html>
- Incremental snapshots: <https://debezium.io/blog/2021/10/07/incremental-snapshots/>
