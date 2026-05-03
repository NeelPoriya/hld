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

### 21. Caching
- [Varnish](content/docs/21-caching/varnish.md)
- [Caffeine](content/docs/21-caching/caffeine.md)

### 22. Service Mesh
- [Istio](content/docs/22-service-mesh/istio.md)
- [Linkerd](content/docs/22-service-mesh/linkerd.md)

### 23. Secrets & Identity
- [HashiCorp Vault](content/docs/23-secrets-and-identity/vault.md)
- [Keycloak](content/docs/23-secrets-and-identity/keycloak.md)

### 24. Infrastructure as Code
- [Terraform](content/docs/24-iac/terraform.md)
- [Pulumi](content/docs/24-iac/pulumi.md)

### 25. CI/CD
- [GitHub Actions](content/docs/25-cicd/github-actions.md)
- [Argo CD](content/docs/25-cicd/argocd.md)

### 26. Serverless & FaaS
- [AWS Lambda](content/docs/26-serverless-and-faas/aws-lambda.md)
- [Cloudflare Workers](content/docs/26-serverless-and-faas/cloudflare-workers.md)

### 27. CDC & Data Integration
- [Debezium](content/docs/27-cdc-and-data-integration/debezium.md)
- [Airbyte](content/docs/27-cdc-and-data-integration/airbyte.md)

### 28. WebSockets & Realtime
- [Socket.IO](content/docs/28-websockets-and-realtime/socket-io.md)
- [Centrifugo](content/docs/28-websockets-and-realtime/centrifugo.md)

### 29. GraphQL
- [Apollo GraphQL](content/docs/29-graphql/apollo.md)
- [Hasura](content/docs/29-graphql/hasura.md)

### 30. Feature Flags & Experimentation
- [LaunchDarkly](content/docs/30-feature-flags-and-experimentation/launchdarkly.md)
- [Unleash](content/docs/30-feature-flags-and-experimentation/unleash.md)

### 31. AI / ML Serving
- [vLLM](content/docs/31-ai-ml-serving/vllm.md)
- [BentoML](content/docs/31-ai-ml-serving/bentoml.md)

### 32. Auth-as-a-Service
- [Auth0](content/docs/32-auth-as-a-service/auth0.md)
- [Okta](content/docs/32-auth-as-a-service/okta.md)

### 33. Notifications & Communications
- [Twilio](content/docs/33-notifications/twilio.md)
- [SendGrid](content/docs/33-notifications/sendgrid.md)

### 34. DNS & Service Discovery
- [Route 53](content/docs/34-dns-and-service-discovery/route53.md)
- [Consul](content/docs/34-dns-and-service-discovery/consul.md)

### 35. Search-as-a-Service
- [Algolia](content/docs/35-search-as-a-service/algolia.md)
- [Typesense](content/docs/35-search-as-a-service/typesense.md)

### 36. Payments & Billing
- [Stripe](content/docs/36-payments-and-billing/stripe.md)
- [Paddle](content/docs/36-payments-and-billing/paddle.md)

### 37. Container Registries
- [Harbor](content/docs/37-container-registries/harbor.md)
- [Amazon ECR](content/docs/37-container-registries/ecr.md)

### 38. Video & Streaming Media
- [Mux](content/docs/38-video-and-streaming-media/mux.md)
- [Cloudflare Stream](content/docs/38-video-and-streaming-media/cloudflare-stream.md)

### 39. Backend-as-a-Service
- [Supabase](content/docs/39-backend-as-a-service/supabase.md)
- [Firebase](content/docs/39-backend-as-a-service/firebase.md)

### 40. Job Queues & Background Workers
- [Sidekiq](content/docs/40-job-queues/sidekiq.md)
- [BullMQ](content/docs/40-job-queues/bullmq.md)

### 41-45. *(more technology categories coming soon — serverless databases, embedded / local-first DBs, low-code / iPaaS, file sync, real-time collab)*

---

## Key Concepts (the patterns themselves)

Beyond the technologies, every HLD interview tests the *patterns* underneath. Each concept page covers **what problem it solves**, **where to use it (with real-world examples)**, **where NOT to use it**, and **what to consider**.

### Caching Patterns
- [Caching Strategies](content/docs/41-caching/caching-strategies.md) — cache-aside, read-through, write-through, write-back, refresh-ahead; stampede protection.
- [Consistent Hashing](content/docs/41-caching/consistent-hashing.md) — distribute keys with bounded remap on resize.

### Data Distribution
- [Sharding & Partitioning](content/docs/42-data-distribution/sharding-and-partitioning.md) — range / hash / directory; choosing the partition key; hot-shard pitfalls.
- [Replication Strategies](content/docs/42-data-distribution/replication-strategies.md) — single / multi-leader / leaderless; sync vs async; quorums.

### Time & Ordering
- [Clock Skew & NTP](content/docs/43-time-and-ordering/clock-skew-and-ntp.md) — why wall clocks lie, NTP / PTP / TrueTime, leap seconds.
- [Logical Clocks](content/docs/43-time-and-ordering/logical-clocks.md) — Lamport, vector, version vector, Hybrid Logical Clock (HLC).

### Delivery Semantics
- [Delivery Guarantees](content/docs/44-delivery-semantics/delivery-guarantees.md) — at-most / at-least / exactly-once; the two-generals problem.
- [Idempotency](content/docs/44-delivery-semantics/idempotency.md) — idempotency keys, dedup tables, transactional outbox.

### Resilience Patterns
- [Circuit Breaker](content/docs/45-resilience-patterns/circuit-breaker.md) — Closed / Open / Half-Open; Hystrix / Resilience4j / Envoy outlier detection.
- [Retry & Backoff](content/docs/45-resilience-patterns/retry-and-backoff.md) — exponential backoff, jitter, retry budgets, deadline propagation, hedged requests.
- [Backpressure](content/docs/45-resilience-patterns/backpressure.md) — bounded queues, Reactive Streams, load shedding, adaptive concurrency limits.
- [Rate Limiting](content/docs/45-resilience-patterns/rate-limiting.md) — token bucket, leaky bucket, fixed / sliding window; distributed limiters.

### Fan-out Patterns
- [Fan-out on Write](content/docs/46-fanout-patterns/fan-out-on-write.md) — push: pre-build per-recipient timelines.
- [Fan-out on Read](content/docs/46-fanout-patterns/fan-out-on-read.md) — pull: aggregate at read time.
- [Hybrid Fan-out](content/docs/46-fanout-patterns/hybrid-fanout.md) — what real social-media production uses.

### Event-Driven Architecture
- [Event Sourcing](content/docs/47-event-driven-architecture/event-sourcing.md) — store every state change as an immutable event.
- [CQRS](content/docs/47-event-driven-architecture/cqrs.md) — separate read and write models.
- [Saga Pattern](content/docs/47-event-driven-architecture/saga-pattern.md) — long-running distributed transactions with compensations.

### Storage Internals
- [Write-Ahead Log (WAL)](content/docs/48-storage-internals/write-ahead-log.md) — the substrate of durable databases.
- [LSM Trees vs B-Trees](content/docs/48-storage-internals/lsm-vs-btree.md) — the two dominant storage engine designs.

### Probabilistic Data Structures
- [Bloom Filter](content/docs/49-probabilistic-data-structures/bloom-filter.md) — set membership in tiny memory.
- [HyperLogLog & Count-Min Sketch](content/docs/49-probabilistic-data-structures/hyperloglog-and-count-min.md) — cardinality + frequency estimation in fixed memory.

### Network & Traffic Routing
- [Forward Proxy vs Reverse Proxy vs LB vs API Gateway](content/docs/50-network-traffic-routing/proxy-vs-reverse-proxy-vs-lb-vs-gateway.md) — the four-quadrant comparison.
- [Load Balancing Algorithms](content/docs/50-network-traffic-routing/load-balancing-algorithms.md) — round-robin, least-connections, P2C, hash, weighted, geographic.
- [L4 vs L7 Load Balancing](content/docs/50-network-traffic-routing/l4-vs-l7-load-balancing.md) — TCP-level vs HTTP-aware; when to stack them.

### Consistency & CAP
- [CAP Theorem & PACELC](content/docs/51-consistency-and-cap/cap-theorem-and-pacelc.md) — the foundational impossibility.
- [Consistency Models](content/docs/51-consistency-and-cap/consistency-models.md) — linearizable, sequential, causal, eventual, snapshot.
- [ACID vs BASE](content/docs/51-consistency-and-cap/acid-vs-base.md) — RDBMS contract vs NoSQL trade.

### Consensus & Coordination
- [Paxos & Raft](content/docs/52-consensus-and-coordination/paxos-and-raft.md) — the algorithms behind etcd, Spanner, ZooKeeper.
- [Two-Phase Commit (2PC) & 3PC](content/docs/52-consensus-and-coordination/two-phase-commit.md) — distributed atomic commit + why it blocks.
- [Leader Election](content/docs/52-consensus-and-coordination/leader-election.md) — consensus-based + lease-based + fencing tokens.
- [Distributed Locks](content/docs/52-consensus-and-coordination/distributed-locks.md) — Redlock pitfalls, etcd / ZooKeeper recipes, fencing.

### Transactions & Concurrency Control
- [Isolation Levels](content/docs/53-transactions-and-concurrency/isolation-levels.md) — RC, RR, SI, Serializable + the anomalies.
- [MVCC vs Locking](content/docs/53-transactions-and-concurrency/mvcc-and-locking.md) — how Postgres / Oracle / InnoDB enforce isolation.
- [Optimistic vs Pessimistic Concurrency](content/docs/53-transactions-and-concurrency/optimistic-vs-pessimistic.md) — version columns, ETag, FOR UPDATE.

### API Design Patterns
- [REST vs GraphQL vs gRPC vs WebSocket vs SSE](content/docs/54-api-design-patterns/rest-vs-graphql-vs-grpc.md) — the five API styles.
- [Pagination Strategies](content/docs/54-api-design-patterns/pagination-strategies.md) — offset / cursor / keyset.
- [API Versioning](content/docs/54-api-design-patterns/api-versioning.md) — URL / header / date-based.

### Security & Auth
- [Authentication: OAuth2, OIDC, SAML, JWT](content/docs/55-security-and-auth/authentication-oauth-oidc-saml-jwt.md) — how users prove who they are.
- [RBAC vs ABAC vs ReBAC](content/docs/55-security-and-auth/rbac-vs-abac.md) — three authorization models.
- [Encryption: At Rest, In Transit, E2E](content/docs/55-security-and-auth/encryption-and-key-management.md) — KMS / HSM / envelope encryption.

### Network Protocols & Real-time
- [TCP vs UDP, HTTP/1.1 / 2 / 3 (QUIC)](content/docs/56-network-protocols-and-realtime/tcp-vs-udp-and-http-versions.md) — transport + application protocol evolution.
- [WebSocket vs SSE vs Long Polling vs WebRTC](content/docs/56-network-protocols-and-realtime/websocket-sse-long-polling.md) — server push and bidirectional channels.
- [TLS Handshake & mTLS](content/docs/56-network-protocols-and-realtime/tls-and-mtls.md) — encryption + service-to-service auth.
- [DNS, Anycast & GeoDNS](content/docs/56-network-protocols-and-realtime/dns-and-anycast.md) — hostname → IP, with global routing.

### Observability & SRE
- [SLI / SLO / SLA & Error Budgets](content/docs/57-observability-and-sre/sli-slo-sla-error-budgets.md) — Google SRE vocabulary.
- [Metrics, Logs & Traces](content/docs/57-observability-and-sre/metrics-logs-traces.md) — the three observability pillars.

### Deployment & Release
- [Deployment Strategies](content/docs/58-deployment-and-release/deployment-strategies.md) — rolling, blue-green, canary, shadow, feature flag, A/B.
- [Strangler Fig & Legacy Migration](content/docs/58-deployment-and-release/strangler-fig-and-migration.md) — incremental replacement.

### Failure Detection & DR
- [Heartbeats & Health Checks](content/docs/59-failure-detection-and-dr/heartbeats-and-health-checks.md) — gossip, phi-accrual, K8s probes.
- [Disaster Recovery: RPO, RTO, Multi-Region](content/docs/59-failure-detection-and-dr/disaster-recovery.md) — backup → pilot light → warm standby → active-active.

### Microservices Patterns
- [Sidecar, Ambassador & Bulkhead](content/docs/60-microservices-patterns/sidecar-and-bulkhead.md) — cloud-native operational patterns.
- [Microservices Anti-Patterns](content/docs/60-microservices-patterns/anti-patterns.md) — distributed monolith, chatty services, shared DB.

### Stream Processing
- [Windowing & Watermarks](content/docs/61-stream-processing/windowing-and-watermarks.md) — tumbling / hopping / session, event time vs processing time.

### Data Modeling & Serialization
- [Database Indexing Strategies](content/docs/62-data-modeling-and-serialization/indexing-strategies.md) — B-tree, hash, GIN, GiST, BRIN, covering, partial.
- [Schema Evolution & Serialization Formats](content/docs/62-data-modeling-and-serialization/schema-evolution-and-serialization.md) — JSON / Protobuf / Avro / MessagePack.

### Geo & Spatial
- [Geohashing, S2, H3 & Spatial Indexing](content/docs/63-geo-and-spatial/geohashing-s2-h3.md) — for location-based services.

### Multi-tenancy Patterns
- [Silo, Pool, Hybrid Models](content/docs/64-multi-tenancy-patterns/silo-pool-hybrid.md) — SaaS isolation strategies.

### Outbox & Transactional Messaging
- [Outbox Pattern](content/docs/65-outbox-and-transactional-messaging/outbox-pattern.md) — solving the dual-write problem.

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
| Programmable HTTP cache in front of origin | Varnish | VCL state machine; microcache + ESI |
| In-process JVM cache (memoize hot rows) | Caffeine | W-TinyLFU eviction beats LRU |
| Service mesh on Kubernetes | Istio / Linkerd | mTLS + traffic / auth / observability policy |
| Centralized secrets + dynamic creds | Vault | Identity-aware encryption-as-a-service |
| Self-hosted SSO / OIDC IdP | Keycloak | Open-source Auth0 alternative |
| Multi-cloud Infrastructure as Code | Terraform / Pulumi | Declarative HCL or real-language IaC |
| CI for build/test/release | GitHub Actions | Native to GitHub; YAML workflows |
| GitOps continuous delivery on Kubernetes | ArgoCD | Reconciles cluster to Git |
| Event-driven serverless functions | AWS Lambda | Pay-per-ms; auto-scales; 15-min cap |
| Sub-ms cold start at the edge | Cloudflare Workers | V8 isolates in 300+ POPs; KV / DO / R2 / D1 |
| Database CDC into Kafka | Debezium | WAL/binlog/oplog → event stream; outbox pattern |
| ELT from 350+ SaaS / DB sources | Airbyte | OSS Fivetran alternative; YAML CDK |
| Realtime in Node.js stacks | Socket.IO | Rooms + acks + Redis adapter |
| Massive WebSocket fan-out | Centrifugo | Polyglot clients; channels + history + recovery |
| Federated GraphQL gateway | Apollo Federation + Router | Subgraph-per-team supergraph |
| Instant GraphQL on Postgres | Hasura | Auto-CRUD + row-level auth + subscriptions |
| Managed feature flags + A/B | LaunchDarkly | Local SDK eval; SSE updates |
| OSS feature-flag platform | Unleash | Self-hosted; polling SDKs + Edge proxy |
| Self-host LLM at production throughput | vLLM | PagedAttention + continuous batching |
| Framework-agnostic ML serving | BentoML | Bento package + adaptive batching |
| Drop-in OIDC / OAuth2 / SAML for any app | Auth0 | Universal Login + Actions + Organizations |
| Enterprise workforce SSO + lifecycle mgmt | Okta | SAML + SCIM + adaptive MFA |
| Programmable SMS / voice / WhatsApp / Verify | Twilio | Global carrier fabric behind REST API |
| Transactional email at scale | SendGrid | Dynamic Templates + Event Webhook |
| AWS-native multi-region DNS routing | Route 53 | Anycast + latency / geo / failover policies |
| Service discovery + KV + mesh on VMs | Consul | Raft cluster + agent gossip + Connect (Envoy) |
| Hosted search with InstantSearch UI | Algolia | Faceted search; DSN; A/B + Recommend |
| Open-source typo-tolerant search engine | Typesense | Single-binary C++; vector + lexical |
| Global card payments + subscriptions | Stripe | PaymentIntents + idempotency + signed webhooks |
| Merchant of Record for SaaS (tax / VAT / GST) | Paddle | Paddle is legal seller; ~5% take + dunning |
| Self-hosted OCI registry with scanning + signing | Harbor | Trivy + Cosign + RBAC + replication |
| AWS-managed Docker registry | ECR | IAM auth + scanning + lifecycle + pull-through cache |
| API-first VOD + live + DRM + analytics | Mux | Per-title encoding + Mux Player + Mux Data |
| Per-minute-priced video on Cloudflare edge | Cloudflare Stream | LL-HLS + WebRTC + Workers integration |
| OSS Firebase alternative on Postgres | Supabase | RLS + Realtime + Auth + Storage + Edge Functions |
| Mobile-first BaaS (NoSQL + Auth + FCM) | Firebase | Firestore + Security Rules + Cloud Functions |
| Ruby background jobs on Redis | Sidekiq | Multi-threaded; retries + scheduled + cron + UI |
| Node / TypeScript background jobs on Redis | BullMQ | Streams-backed; Flows + rate limiter + Bull Board |

---

## Generate a printable PDF (for offline / commute prep)

A curated subset of the docs (~20 essential technologies + all 60 key concepts) can be exported as a single, beautifully-typeset LaTeX file you compile in [Overleaf](https://www.overleaf.com).

```bash
npm run build:pdf
# Produces dist/pdf/interview-prep.tex (~1 MB).
```

Then:

1. Open Overleaf → **New Project → Upload Project**.
2. Upload `dist/pdf/interview-prep.tex`.
3. **Menu → Settings → Compiler: XeLaTeX**.
4. Click **Recompile**. The first build takes ~1-2 minutes; subsequent ones are fast.

**Customising what's included:** edit [`scripts/pdf-config.json`](scripts/pdf-config.json) and re-run `npm run build:pdf`. Every doc starts on a fresh page; chapters and parts get their own dividers.

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
