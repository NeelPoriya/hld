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
- [Couchbase](content/docs/04-document-stores/couchbase.md)

### 5. NoSQL — Graph Databases
- [Neo4j](content/docs/05-graph-databases/neo4j.md)
- [Amazon Neptune](content/docs/05-graph-databases/neptune.md)

### 6. Search & Indexing
- [ElasticSearch](content/docs/06-search-and-indexing/elasticsearch.md)
- [Apache Solr](content/docs/06-search-and-indexing/solr.md)
- [OpenSearch](content/docs/06-search-and-indexing/opensearch.md)

### 7. Time-Series Databases
- [InfluxDB](content/docs/07-time-series-databases/influxdb.md)
- [TimescaleDB](content/docs/07-time-series-databases/timescaledb.md)
- [Prometheus](content/docs/07-time-series-databases/prometheus.md)

### 8. Vector Databases (AI / ML)
- [Pinecone](content/docs/08-vector-databases/pinecone.md)
- [Milvus](content/docs/08-vector-databases/milvus.md)
- [Weaviate](content/docs/08-vector-databases/weaviate.md)

### 9. Message Queues & Streaming Platforms
- [Apache Kafka](content/docs/09-message-queues-and-streaming/kafka.md)
- [RabbitMQ](content/docs/09-message-queues-and-streaming/rabbitmq.md)
- [Apache Pulsar](content/docs/09-message-queues-and-streaming/pulsar.md)
- [Amazon SQS](content/docs/09-message-queues-and-streaming/sqs.md)
- [Amazon Kinesis](content/docs/09-message-queues-and-streaming/kinesis.md)

### 10. Stream / Real-Time Processing
- [Apache Flink](content/docs/10-stream-processing/flink.md)
- [Kafka Streams](content/docs/10-stream-processing/kafka-streams.md)
- [Spark Structured Streaming](content/docs/10-stream-processing/spark-streaming.md)

### 11. Batch / Big Data Processing
- [Apache Hadoop](content/docs/11-batch-big-data/hadoop.md)
- [Apache Spark](content/docs/11-batch-big-data/spark.md)
- [Apache Hive](content/docs/11-batch-big-data/hive.md)
- [Trino (and Presto)](content/docs/11-batch-big-data/trino.md)

### 12. Data Warehousing & OLAP
- [Snowflake](content/docs/12-data-warehousing/snowflake.md)
- [Amazon Redshift](content/docs/12-data-warehousing/redshift.md)
- [Google BigQuery](content/docs/12-data-warehousing/bigquery.md)
- [ClickHouse](content/docs/12-data-warehousing/clickhouse.md)
- [Apache Druid](content/docs/12-data-warehousing/druid.md)

### 13. Data Lake & Lakehouse
- [Apache Iceberg](content/docs/13-data-lake-and-lakehouse/iceberg.md)
- [Delta Lake](content/docs/13-data-lake-and-lakehouse/delta-lake.md)
- [Apache Hudi](content/docs/13-data-lake-and-lakehouse/hudi.md)

### 14. Workflow Orchestration & Coordination
- [Apache Zookeeper](content/docs/14-workflow-orchestration-and-coordination/zookeeper.md)
- [Apache Airflow](content/docs/14-workflow-orchestration-and-coordination/airflow.md)
- [Temporal](content/docs/14-workflow-orchestration-and-coordination/temporal.md)

### 15. Object Storage
- [Amazon S3](content/docs/15-object-storage/s3.md)
- [Google Cloud Storage](content/docs/15-object-storage/gcs.md)
- [MinIO](content/docs/15-object-storage/minio.md)

### 16. Load Balancing & Proxies
- [NGINX](content/docs/16-load-balancing-and-proxies/nginx.md)
- [HAProxy](content/docs/16-load-balancing-and-proxies/haproxy.md)
- [Envoy](content/docs/16-load-balancing-and-proxies/envoy.md)

### 17. CDN & Edge
- [Amazon CloudFront](content/docs/17-cdn-and-edge/cloudfront.md)
- [Cloudflare](content/docs/17-cdn-and-edge/cloudflare.md)

### 18. API Gateways
- [Kong](content/docs/18-api-gateways/kong.md)
- [AWS API Gateway](content/docs/18-api-gateways/aws-api-gateway.md)

### 19. Container Orchestration
- [Kubernetes](content/docs/19-container-orchestration/kubernetes.md)

### 20. Observability
- [Grafana](content/docs/20-observability/grafana.md)
- [OpenTelemetry](content/docs/20-observability/opentelemetry.md)
- [Jaeger](content/docs/20-observability/jaeger.md)

### 21-30. *(more categories coming soon — caching layer, secrets/config, service mesh, app-layer)*

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
| Highly connected / relationship-heavy data | Neo4j | Native graph storage + Cypher traversals |
| App / infra metrics on Kubernetes | Prometheus | Pull-based scraping, PromQL, K8s-native |
| Mixed time-series + relational workload | TimescaleDB | Postgres + auto-partitioning + compression |
| RAG / semantic search over embeddings | Pinecone / Milvus / Weaviate | Vector similarity at scale |
| Sub-second OLAP / real-time analytics | ClickHouse / Druid | Columnar engines tuned for low-latency aggregations |
| Federated SQL across data lakes & DBs | Trino / Presto | Many connectors, one SQL gateway |
| Long-running business workflows | Temporal | Durable execution as plain code |
| Scheduled batch ETL pipelines | Airflow | Python DAGs + huge operator ecosystem |
| Open table format on data lake | Iceberg / Delta / Hudi | ACID + time-travel + schema evolution on S3/HDFS |
| Cheap durable cloud object storage | S3 / GCS / MinIO | HTTP-addressable, 11-9s durability, lake substrate |
| Reverse proxy / TLS / static + L7 LB | NGINX | Default front door for app servers |
| Service mesh / dynamic xDS L7 | Envoy | gRPC + mTLS + xDS for Istio-style meshes |
| TCP / L4 + L7 with active health checks | HAProxy | Best-in-class throughput + stick tables |
| Global CDN + DDoS + edge compute | CloudFront / Cloudflare | Cache near user; programmable edge |
| Centralized API auth / rate limit / routing | Kong / AWS API Gateway | API gateway responsibilities in one tier |
| Container orchestration at scale | Kubernetes | Declarative reconciling control plane |
| Dashboards across metrics + logs + traces | Grafana | One pane of glass over Prometheus + Loki + Tempo |
| Vendor-neutral instrumentation | OpenTelemetry | SDKs + Collector + OTLP for traces / metrics / logs |
| Self-hosted distributed tracing | Jaeger | OSS span store + UI; OTLP-native |

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
