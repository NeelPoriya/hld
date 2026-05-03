# High Level Design — Key Technologies Cheat Sheet

A revision-friendly knowledge base of the technologies that come up most often in High Level Design (HLD) / System Design interviews.

Each technology is documented in a consistent format so you can quickly compare options and recall trade-offs under interview pressure.

> **How to use this repo**
> - Skim the README to find the right tool for a problem.
> - Open the per-tech file for depth: data model, scale of a single instance, partitioning, replication, consistency, trade-offs, and HLD patterns.
> - Re-read the **Interview Cheat Sheet** section at the bottom of each file the night before an interview.

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
- [PostgreSQL](01-relational-databases/postgresql.md)
- [MySQL](01-relational-databases/mysql.md)
- [Amazon Aurora](01-relational-databases/aurora.md)
- [Google Cloud Spanner](01-relational-databases/spanner.md)
- [CockroachDB](01-relational-databases/cockroachdb.md)

### 2. NoSQL — Key-Value Stores
- [Redis](02-key-value-stores/redis.md)
- [Amazon DynamoDB](02-key-value-stores/dynamodb.md)
- [Memcached](02-key-value-stores/memcached.md)
- [etcd](02-key-value-stores/etcd.md)

### 3. NoSQL — Wide-Column Stores
- [Apache Cassandra](03-wide-column-stores/cassandra.md)
- [Apache HBase](03-wide-column-stores/hbase.md)
- [Google Bigtable](03-wide-column-stores/bigtable.md)
- [ScyllaDB](03-wide-column-stores/scylladb.md)

### 4. NoSQL — Document Stores
- [MongoDB](04-document-stores/mongodb.md)
- Couchbase *(coming soon)*

### 5. NoSQL — Graph Databases
- Neo4j *(coming soon)*
- Amazon Neptune *(coming soon)*

### 6. Search & Indexing
- [ElasticSearch](06-search-and-indexing/elasticsearch.md)
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
- [Apache Kafka](09-message-queues-and-streaming/kafka.md)
- RabbitMQ *(coming soon)*
- Apache Pulsar *(coming soon)*
- Amazon SQS / SNS *(coming soon)*
- Amazon Kinesis *(coming soon)*

### 10. Stream / Real-Time Processing
- [Apache Flink](10-stream-processing/flink.md)
- Kafka Streams *(coming soon)*
- Spark Streaming *(coming soon)*

### 11. Batch / Big Data Processing
- [Apache Hadoop](11-batch-big-data/hadoop.md)
- [Apache Spark](11-batch-big-data/spark.md)
- Apache Hive *(coming soon)*
- Presto / Trino *(coming soon)*

### 12. Data Warehousing & OLAP
- [Snowflake](12-data-warehousing/snowflake.md)
- Amazon Redshift *(coming soon)*
- Google BigQuery *(coming soon)*
- ClickHouse *(coming soon)*
- Apache Druid *(coming soon)*

### 13. Data Lake & Lakehouse
- Apache Iceberg *(coming soon)*
- Delta Lake *(coming soon)*
- Apache Hudi *(coming soon)*

### 14. Workflow Orchestration & Coordination
- [Apache Zookeeper](14-workflow-orchestration-and-coordination/zookeeper.md)
- Apache Airflow *(coming soon)*
- Temporal *(coming soon)*

### 15. Caching & CDN
- Redis (cache mode) — see [Redis](02-key-value-stores/redis.md)
- Memcached *(coming soon)*
- Cloudflare / CloudFront / Akamai *(coming soon)*

### 16. Load Balancers & Reverse Proxies
- NGINX *(coming soon)*
- HAProxy *(coming soon)*
- Envoy *(coming soon)*

### 17. API Gateways
- Kong *(coming soon)*
- Amazon API Gateway *(coming soon)*

### 18. Service Mesh
- Istio *(coming soon)*
- Linkerd *(coming soon)*

### 19. Service Discovery & Config
- Consul *(coming soon)*
- etcd *(coming soon)*

### 20. Containers & Orchestration
- Kubernetes *(coming soon)*
- Docker *(coming soon)*

### 21. Object / Blob Storage
- Amazon S3 *(coming soon)*
- MinIO *(coming soon)*

### 22. Distributed File Systems
- HDFS — see [Hadoop](11-batch-big-data/hadoop.md)

### 23-25. Observability (Metrics, Logs, Traces)
- Prometheus / Grafana *(coming soon)*
- ELK Stack *(coming soon)*
- Jaeger / OpenTelemetry *(coming soon)*

### 26. CI/CD
- *(coming soon)*

### 27. Auth
- *(coming soon)*

### 28. Real-Time Communication
- WebSockets / WebRTC / MQTT *(coming soon)*

### 29. RPC / Communication Protocols
- gRPC / GraphQL / REST *(coming soon)*

### 30. Feature Flags
- *(coming soon)*

---

## Quick "Which Tech for Which Problem?" Cheat Sheet

| Problem | Default Pick | Why |
|---|---|---|
| Transactional store, complex queries, joins | PostgreSQL | ACID + mature SQL |
| Cache hot data, sessions, leaderboards | Redis | Sub-ms latency, rich data structures |
| Massive write-heavy time-series / events | Cassandra | Linear write scalability, no single master |
| Internet-scale key-value with predictable latency | DynamoDB | Fully managed, single-digit ms |
| Full-text search, log search, analytics on text | ElasticSearch | Inverted index, aggregations |
| Async messaging between services, event log | Kafka | Durable log, high throughput |
| Real-time fraud/alerts on streams | Flink | True event-at-a-time, exactly-once |
| Petabyte-scale batch ETL | Spark on HDFS/S3 | In-memory, mature ecosystem |
| BI / analytics on huge datasets | Snowflake | Separation of storage & compute |
| Distributed coordination / leader election | Zookeeper | ZAB consensus, primitives ready |

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
9. **Zookeeper** — coordination primitives.
