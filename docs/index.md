# HLD Cheat Sheet

A revision-friendly knowledge base of the technologies that come up most often in **High Level Design (HLD) / System Design interviews**.

Each technology is documented in a consistent format so you can quickly compare options and recall trade-offs under interview pressure.

!!! tip "How to use this site"
    - Use the **navigation tabs above** or **search (top right)** to jump to any technology.
    - Skim the **TL;DR** + **Interview Cheat Sheet** sections of any page for a fast refresh.
    - The night before an interview, re-read the **Cheat Sheet** at the bottom of each page.

---

## Per-Page Structure

Every technology page follows the same template:

1. **TL;DR** — one-paragraph summary
2. **What problem does it solve?**
3. **When to use / When NOT to use**
4. **Data model** (with examples)
5. **Architecture & internals**
6. **Consistency model**
7. **Replication**
8. **Partitioning / Sharding** (incl. hot-shard pitfalls)
9. **Scale of a single instance** (when do you have to scale out?)
10. **Performance characteristics**
11. **Trade-offs**
12. **Common HLD patterns**
13. **Common pitfalls / gotchas**
14. **Interview cheat sheet** (1-line answers)

---

## Quick "Which Tech for Which Problem?" Cheat Sheet

| Problem | Default Pick | Why |
|---|---|---|
| Transactional store, complex queries, joins | PostgreSQL | ACID + mature SQL |
| Cache hot data, sessions, leaderboards | Redis | Sub-ms latency, rich data structures |
| Massive write-heavy time-series / events | Cassandra / ScyllaDB | Linear write scalability, no single master |
| Internet-scale key-value with predictable latency | DynamoDB | Fully managed, single-digit ms |
| Full-text search, log search, analytics on text | ElasticSearch | Inverted index, aggregations |
| Async messaging between services, event log | Kafka | Durable log, high throughput |
| Real-time fraud/alerts on streams | Flink | True event-at-a-time, exactly-once |
| Petabyte-scale batch ETL | Spark on HDFS/S3 | In-memory, mature ecosystem |
| BI / analytics on huge datasets | Snowflake | Separation of storage & compute |
| Distributed coordination / leader election | Zookeeper / etcd | Consensus primitives ready |
| Global SQL with strong consistency | Spanner / CockroachDB | Distributed ACID at scale |
| Document-shaped data with flexible schema | MongoDB | Native JSON document model |

---

## Reading Order Recommendation (for first-time prep)

1. **PostgreSQL** — baseline you'll be compared against.
2. **Redis** — caching is everywhere.
3. **Kafka** — event-driven systems are everywhere.
4. **Cassandra** + **DynamoDB** — write-scale NoSQL.
5. **ElasticSearch** — search subsystems.
6. **Spark** + **Hadoop** — batch fundamentals.
7. **Flink** — streaming fundamentals.
8. **Snowflake** — analytical/warehouse story.
9. **Zookeeper / etcd** — coordination primitives.
10. **Spanner / CockroachDB** — global SQL.
11. **MongoDB** — document modelling.

---

## Categories Covered

Use the **navigation tabs at the top** to explore:

- **Relational (SQL)** — PostgreSQL, MySQL, Aurora, Spanner, CockroachDB
- **Key-Value** — Redis, DynamoDB, Memcached, etcd
- **Wide-Column** — Cassandra, HBase, Bigtable, ScyllaDB
- **Document** — MongoDB
- **Search** — ElasticSearch
- **Streaming & Queues** — Kafka
- **Stream Processing** — Flink
- **Batch & Big Data** — Hadoop, Spark
- **Data Warehousing** — Snowflake
- **Coordination** — Zookeeper

More technologies are being added — check the [GitHub repo](https://github.com/NeelPoriya/hld) for the latest.

---

??? abstract "About this site"
    Built with [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) and deployed automatically to GitHub Pages on every push to `main`.

    Source: [github.com/NeelPoriya/hld](https://github.com/NeelPoriya/hld)
