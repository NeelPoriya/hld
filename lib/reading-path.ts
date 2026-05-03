/**
 * The "Recommended Reading Path" — a curated tour through the docs that builds
 * up understanding from foundations to advanced topics. Used by:
 *  - the homepage hero (visual timeline + progress)
 *  - the docs landing page (suggested next step)
 *  - the localStorage progress tracker (read/unread state)
 *
 * Each step has a stable `slug` (the URL path under `/docs/`) which doubles
 * as the localStorage key. Keep slugs in sync with `content/docs/` paths.
 */

export type ReadingStep = {
  slug: string;
  title: string;
  category: string;
  why: string;
  href: string;
};

export const readingPath: ReadingStep[] = [
  {
    slug: '01-relational-databases/postgresql',
    title: 'PostgreSQL',
    category: 'Relational',
    why: 'Baseline you will be compared against in every system design interview.',
    href: '/docs/01-relational-databases/postgresql',
  },
  {
    slug: '02-key-value-stores/redis',
    title: 'Redis',
    category: 'Key-Value',
    why: 'Caching shows up in 9 out of 10 designs. Sub-ms reads are non-negotiable.',
    href: '/docs/02-key-value-stores/redis',
  },
  {
    slug: '09-message-queues-and-streaming/kafka',
    title: 'Kafka',
    category: 'Streaming',
    why: 'Event-driven architectures dominate modern designs. Kafka is the backbone.',
    href: '/docs/09-message-queues-and-streaming/kafka',
  },
  {
    slug: '03-wide-column-stores/cassandra',
    title: 'Cassandra',
    category: 'Wide-Column',
    why: 'Write-scale NoSQL fundamentals — partitioning, gossip, tombstones.',
    href: '/docs/03-wide-column-stores/cassandra',
  },
  {
    slug: '02-key-value-stores/dynamodb',
    title: 'DynamoDB',
    category: 'Key-Value',
    why: 'Predictable single-digit-ms KV at internet scale — interview classic.',
    href: '/docs/02-key-value-stores/dynamodb',
  },
  {
    slug: '06-search-and-indexing/elasticsearch',
    title: 'ElasticSearch',
    category: 'Search',
    why: 'Inverted indexes, log search, autocomplete — search subsystems explained.',
    href: '/docs/06-search-and-indexing/elasticsearch',
  },
  {
    slug: '11-batch-big-data/spark',
    title: 'Spark',
    category: 'Big Data',
    why: 'In-memory batch ETL — the de-facto big-data engine.',
    href: '/docs/11-batch-big-data/spark',
  },
  {
    slug: '11-batch-big-data/hadoop',
    title: 'Hadoop',
    category: 'Big Data',
    why: 'HDFS + MapReduce roots — needed to talk about batch fundamentals.',
    href: '/docs/11-batch-big-data/hadoop',
  },
  {
    slug: '10-stream-processing/flink',
    title: 'Flink',
    category: 'Streaming',
    why: 'True event-at-a-time processing with exactly-once — modern real-time.',
    href: '/docs/10-stream-processing/flink',
  },
  {
    slug: '12-data-warehousing/snowflake',
    title: 'Snowflake',
    category: 'Warehouse',
    why: 'Storage/compute separation — the BI / analytical story interviewers expect.',
    href: '/docs/12-data-warehousing/snowflake',
  },
  {
    slug: '14-workflow-orchestration-and-coordination/zookeeper',
    title: 'Zookeeper',
    category: 'Coordination',
    why: 'Distributed primitives — leader election, locks, config — appear everywhere.',
    href: '/docs/14-workflow-orchestration-and-coordination/zookeeper',
  },
  {
    slug: '02-key-value-stores/etcd',
    title: 'etcd',
    category: 'Coordination',
    why: 'Modern Raft-based KV (Kubernetes etcd) — compare/contrast with Zookeeper.',
    href: '/docs/02-key-value-stores/etcd',
  },
  {
    slug: '01-relational-databases/spanner',
    title: 'Spanner',
    category: 'Relational',
    why: 'Globally-distributed strong consistency — the TrueTime story.',
    href: '/docs/01-relational-databases/spanner',
  },
  {
    slug: '01-relational-databases/cockroachdb',
    title: 'CockroachDB',
    category: 'Relational',
    why: 'Open-source Spanner-style distributed SQL — pragmatic global database.',
    href: '/docs/01-relational-databases/cockroachdb',
  },
  {
    slug: '04-document-stores/mongodb',
    title: 'MongoDB',
    category: 'Document',
    why: 'Flexible JSON documents and the canonical "schema-on-read" story.',
    href: '/docs/04-document-stores/mongodb',
  },
  {
    slug: '05-graph-databases/neo4j',
    title: 'Neo4j',
    category: 'Graph',
    why: 'Native graph storage + Cypher — the canonical graph DB you should know.',
    href: '/docs/05-graph-databases/neo4j',
  },
  {
    slug: '07-time-series-databases/prometheus',
    title: 'Prometheus',
    category: 'Time-Series',
    why: 'The de-facto K8s monitoring stack — pull model, PromQL, label cardinality.',
    href: '/docs/07-time-series-databases/prometheus',
  },
  {
    slug: '08-vector-databases/pinecone',
    title: 'Pinecone',
    category: 'Vector',
    why: 'Managed vector DB powering RAG / semantic search in modern AI systems.',
    href: '/docs/08-vector-databases/pinecone',
  },
];

/**
 * Every doc that exists in the site. Used for total progress count.
 * Order doesn't matter here.
 */
export const allDocSlugs: string[] = [
  '01-relational-databases/postgresql',
  '01-relational-databases/mysql',
  '01-relational-databases/aurora',
  '01-relational-databases/spanner',
  '01-relational-databases/cockroachdb',
  '02-key-value-stores/redis',
  '02-key-value-stores/dynamodb',
  '02-key-value-stores/memcached',
  '02-key-value-stores/etcd',
  '03-wide-column-stores/cassandra',
  '03-wide-column-stores/hbase',
  '03-wide-column-stores/bigtable',
  '03-wide-column-stores/scylladb',
  '04-document-stores/mongodb',
  '04-document-stores/couchbase',
  '05-graph-databases/neo4j',
  '05-graph-databases/neptune',
  '06-search-and-indexing/elasticsearch',
  '06-search-and-indexing/solr',
  '06-search-and-indexing/opensearch',
  '07-time-series-databases/influxdb',
  '07-time-series-databases/timescaledb',
  '07-time-series-databases/prometheus',
  '08-vector-databases/pinecone',
  '08-vector-databases/milvus',
  '08-vector-databases/weaviate',
  '09-message-queues-and-streaming/kafka',
  '09-message-queues-and-streaming/rabbitmq',
  '09-message-queues-and-streaming/pulsar',
  '09-message-queues-and-streaming/sqs',
  '09-message-queues-and-streaming/kinesis',
  '10-stream-processing/flink',
  '10-stream-processing/kafka-streams',
  '10-stream-processing/spark-streaming',
  '11-batch-big-data/hadoop',
  '11-batch-big-data/spark',
  '11-batch-big-data/hive',
  '11-batch-big-data/trino',
  '12-data-warehousing/snowflake',
  '12-data-warehousing/redshift',
  '12-data-warehousing/bigquery',
  '12-data-warehousing/clickhouse',
  '12-data-warehousing/druid',
  '13-data-lake-and-lakehouse/iceberg',
  '13-data-lake-and-lakehouse/delta-lake',
  '13-data-lake-and-lakehouse/hudi',
  '14-workflow-orchestration-and-coordination/zookeeper',
  '14-workflow-orchestration-and-coordination/airflow',
  '14-workflow-orchestration-and-coordination/temporal',
  '15-object-storage/s3',
  '15-object-storage/gcs',
  '15-object-storage/minio',
  '16-load-balancing-and-proxies/nginx',
  '16-load-balancing-and-proxies/haproxy',
  '16-load-balancing-and-proxies/envoy',
  '17-cdn-and-edge/cloudfront',
  '17-cdn-and-edge/cloudflare',
  '18-api-gateways/kong',
  '18-api-gateways/aws-api-gateway',
  '19-container-orchestration/kubernetes',
  '20-observability/grafana',
  '20-observability/opentelemetry',
  '20-observability/jaeger',
  '21-caching/varnish',
  '21-caching/caffeine',
  '22-service-mesh/istio',
  '22-service-mesh/linkerd',
  '23-secrets-and-identity/vault',
  '23-secrets-and-identity/keycloak',
  '24-iac/terraform',
  '24-iac/pulumi',
  '25-cicd/github-actions',
  '25-cicd/argocd',
];

/**
 * Convert a Fumadocs page URL (e.g. "/docs/01-relational-databases/postgresql")
 * to the localStorage slug ("01-relational-databases/postgresql").
 */
export function pageUrlToSlug(url: string): string {
  return url.replace(/^\/docs\/?/, '').replace(/\/$/, '');
}
