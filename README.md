# High Level Design — Key Technologies Cheat Sheet

A revision-friendly knowledge base of the technologies that come up most often in **High Level Design (HLD) / System Design interviews**.

📖 **Read the docs site:** **<https://neelporiya.github.io/hld/>** _(rich nav, instant search, dark mode)_

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

### 1. Relational Databases (RDBMS / SQL)
- [PostgreSQL](docs/01-relational-databases/postgresql.md)
- [MySQL](docs/01-relational-databases/mysql.md)
- [Amazon Aurora](docs/01-relational-databases/aurora.md)
- [Google Cloud Spanner](docs/01-relational-databases/spanner.md)
- [CockroachDB](docs/01-relational-databases/cockroachdb.md)

### 2. NoSQL — Key-Value Stores
- [Redis](docs/02-key-value-stores/redis.md)
- [Amazon DynamoDB](docs/02-key-value-stores/dynamodb.md)
- [Memcached](docs/02-key-value-stores/memcached.md)
- [etcd](docs/02-key-value-stores/etcd.md)

### 3. NoSQL — Wide-Column Stores
- [Apache Cassandra](docs/03-wide-column-stores/cassandra.md)
- [Apache HBase](docs/03-wide-column-stores/hbase.md)
- [Google Bigtable](docs/03-wide-column-stores/bigtable.md)
- [ScyllaDB](docs/03-wide-column-stores/scylladb.md)

### 4. NoSQL — Document Stores
- [MongoDB](docs/04-document-stores/mongodb.md)
- Couchbase *(coming soon)*

### 5. NoSQL — Graph Databases
- Neo4j *(coming soon)*
- Amazon Neptune *(coming soon)*

### 6. Search & Indexing
- [ElasticSearch](docs/06-search-and-indexing/elasticsearch.md)
- Apache Solr *(coming soon)*
- OpenSearch *(coming soon)*

### 7. Time-Series Databases
- InfluxDB *(coming soon)*
- TimescaleDB *(coming soon)*
- Prometheus *(coming soon)*

### 8. Vector Databases (AI/ML)
- Pinecone *(coming soon)*
- Milvus *(coming soon)*
- Weaviate *(coming soon)*

### 9. Message Queues & Streaming Platforms
- [Apache Kafka](docs/09-message-queues-and-streaming/kafka.md)
- RabbitMQ *(coming soon)*
- Apache Pulsar *(coming soon)*
- Amazon SQS / SNS *(coming soon)*
- Amazon Kinesis *(coming soon)*

### 10. Stream / Real-Time Processing
- [Apache Flink](docs/10-stream-processing/flink.md)
- Kafka Streams *(coming soon)*
- Spark Streaming *(coming soon)*

### 11. Batch / Big Data Processing
- [Apache Hadoop](docs/11-batch-big-data/hadoop.md)
- [Apache Spark](docs/11-batch-big-data/spark.md)
- Apache Hive *(coming soon)*
- Presto / Trino *(coming soon)*

### 12. Data Warehousing & OLAP
- [Snowflake](docs/12-data-warehousing/snowflake.md)
- Amazon Redshift *(coming soon)*
- Google BigQuery *(coming soon)*
- ClickHouse *(coming soon)*
- Apache Druid *(coming soon)*

### 13. Data Lake & Lakehouse
- Apache Iceberg *(coming soon)*
- Delta Lake *(coming soon)*
- Apache Hudi *(coming soon)*

### 14. Workflow Orchestration & Coordination
- [Apache Zookeeper](docs/14-workflow-orchestration-and-coordination/zookeeper.md)
- Apache Airflow *(coming soon)*
- Temporal *(coming soon)*

### 15. Caching & CDN
- Redis (cache mode) — see [Redis](docs/02-key-value-stores/redis.md)
- Memcached — see [Memcached](docs/02-key-value-stores/memcached.md)
- Cloudflare / CloudFront / Akamai *(coming soon)*

### 16-22. Infrastructure (load balancers, proxies, gateways, service mesh, K8s, storage)
- *(coming soon)*

### 23-25. Observability (Metrics, Logs, Traces)
- Prometheus / Grafana *(coming soon)*
- ELK Stack *(coming soon)*
- Jaeger / OpenTelemetry *(coming soon)*

### 26-30. Application-layer (CI/CD, Auth, Realtime, RPC, Feature flags)
- *(coming soon)*

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

This site is built with [MkDocs](https://www.mkdocs.org/) + [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) and deployed automatically to GitHub Pages on every push to `main`.

```powershell
# install dependencies (one-time)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# live preview at http://127.0.0.1:8000
mkdocs serve

# static build to ./site/
mkdocs build --strict
```
