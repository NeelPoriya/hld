# High Level Design — Key Technologies Cheat Sheet

A revision-friendly knowledge base of the technologies that come up most often in **High Level Design (HLD) / System Design interviews**.

🌐 **Live site:** **<https://neelporiya.github.io/hld/>** _(rich nav, instant search, dark mode, GitHub-style)_

Each technology is documented in a consistent format so you can quickly compare options and recall trade-offs under interview pressure.

---

## Per-File Structure

Every technology page follows the [TEMPLATE](TEMPLATE.md):

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

## Index by Category

All docs live under [content/docs/](content/docs/).

### 1. Relational Databases (RDBMS / SQL)
- [PostgreSQL](content/docs/01-relational-databases/postgresql.md)
- [MySQL](content/docs/01-relational-databases/mysql.md)
- [Amazon Aurora](content/docs/01-relational-databases/aurora.md)
- [Google Cloud Spanner](content/docs/01-relational-databases/spanner.md)
- [CockroachDB](content/docs/01-relational-databases/cockroachdb.md)

### 2. NoSQL — Key-Value Stores
- [Redis](content/docs/02-key-value-stores/redis.md)
- [Amazon DynamoDB](content/docs/02-key-value-stores/dynamodb.md)
- [Memcached](content/docs/02-key-value-stores/memcached.md)
- [etcd](content/docs/02-key-value-stores/etcd.md)

### 3. NoSQL — Wide-Column Stores
- [Apache Cassandra](content/docs/03-wide-column-stores/cassandra.md)
- [Apache HBase](content/docs/03-wide-column-stores/hbase.md)
- [Google Bigtable](content/docs/03-wide-column-stores/bigtable.md)
- [ScyllaDB](content/docs/03-wide-column-stores/scylladb.md)

### 4. NoSQL — Document Stores
- [MongoDB](content/docs/04-document-stores/mongodb.md)
- Couchbase *(coming soon)*

### 5. NoSQL — Graph Databases
- Neo4j *(coming soon)*
- Amazon Neptune *(coming soon)*

### 6. Search & Indexing
- [ElasticSearch](content/docs/06-search-and-indexing/elasticsearch.md)
- Apache Solr *(coming soon)*
- OpenSearch *(coming soon)*

### 7. Time-Series Databases — *coming soon*
### 8. Vector Databases (AI/ML) — *coming soon*

### 9. Message Queues & Streaming Platforms
- [Apache Kafka](content/docs/09-message-queues-and-streaming/kafka.md)
- RabbitMQ, Pulsar, SQS/SNS, Kinesis *(coming soon)*

### 10. Stream / Real-Time Processing
- [Apache Flink](content/docs/10-stream-processing/flink.md)
- Kafka Streams, Spark Streaming *(coming soon)*

### 11. Batch / Big Data Processing
- [Apache Hadoop](content/docs/11-batch-big-data/hadoop.md)
- [Apache Spark](content/docs/11-batch-big-data/spark.md)
- Hive, Presto / Trino *(coming soon)*

### 12. Data Warehousing & OLAP
- [Snowflake](content/docs/12-data-warehousing/snowflake.md)
- Redshift, BigQuery, ClickHouse, Druid *(coming soon)*

### 13. Data Lake & Lakehouse — *coming soon*

### 14. Workflow Orchestration & Coordination
- [Apache Zookeeper](content/docs/14-workflow-orchestration-and-coordination/zookeeper.md)
- Airflow, Temporal *(coming soon)*

### 15-30. *(more categories coming soon — caching, infra, observability, app-layer)*

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

## Local Development

The site is a [Fumadocs](https://fumadocs.dev) + [Next.js 16](https://nextjs.org) static export, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

```powershell
# install deps (one-time)
npm install

# live preview at http://localhost:3000
npm run dev

# static build to ./out/
npm run build
```

### Project structure

```
content/docs/        ← markdown source (the docs themselves)
app/                 ← Next.js app router pages (home, /docs route)
components/          ← shared MDX/React components
lib/                 ← Fumadocs source/loader config
scripts/             ← migration / maintenance scripts
.github/workflows/   ← GitHub Actions deployment
```
