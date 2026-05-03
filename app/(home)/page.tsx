import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { ReadingPath } from '@/components/reading-path';
import { ProgressPill } from '@/components/progress-pill';

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path d="M12 .5C5.73.5.66 5.57.66 11.84c0 5.01 3.25 9.27 7.76 10.77.57.1.78-.25.78-.55v-2.06c-3.16.69-3.83-1.34-3.83-1.34-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.52-.29-5.18-1.26-5.18-5.6 0-1.24.45-2.25 1.18-3.04-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.15 1.16.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.18-1.47 3.14-1.16 3.14-1.16.62 1.57.23 2.73.11 3.02.74.79 1.18 1.8 1.18 3.04 0 4.35-2.66 5.31-5.19 5.59.41.36.78 1.05.78 2.13v3.16c0 .31.21.66.79.55 4.5-1.5 7.75-5.76 7.75-10.77C23.34 5.57 18.27.5 12 .5z" />
  </svg>
);

const categories = [
  { name: 'Relational (SQL)', techs: 'PostgreSQL, MySQL, Aurora, Spanner, CockroachDB', href: '/docs/01-relational-databases/postgresql' },
  { name: 'Key-Value', techs: 'Redis, DynamoDB, Memcached, etcd', href: '/docs/02-key-value-stores/redis' },
  { name: 'Wide-Column', techs: 'Cassandra, HBase, Bigtable, ScyllaDB', href: '/docs/03-wide-column-stores/cassandra' },
  { name: 'Document', techs: 'MongoDB, Couchbase', href: '/docs/04-document-stores/mongodb' },
  { name: 'Graph Databases', techs: 'Neo4j, Neptune', href: '/docs/05-graph-databases/neo4j' },
  { name: 'Search & Indexing', techs: 'ElasticSearch, Solr, OpenSearch', href: '/docs/06-search-and-indexing/elasticsearch' },
  { name: 'Time-Series', techs: 'InfluxDB, TimescaleDB, Prometheus', href: '/docs/07-time-series-databases/prometheus' },
  { name: 'Vector Databases', techs: 'Pinecone, Milvus, Weaviate', href: '/docs/08-vector-databases/pinecone' },
  { name: 'Streaming & Queues', techs: 'Kafka, RabbitMQ, Pulsar, SQS, Kinesis', href: '/docs/09-message-queues-and-streaming/kafka' },
  { name: 'Stream Processing', techs: 'Flink, Kafka Streams, Spark Streaming', href: '/docs/10-stream-processing/flink' },
  { name: 'Batch & Big Data', techs: 'Hadoop, Spark, Hive, Trino', href: '/docs/11-batch-big-data/spark' },
  { name: 'Data Warehousing', techs: 'Snowflake, Redshift, BigQuery, ClickHouse, Druid', href: '/docs/12-data-warehousing/snowflake' },
  { name: 'Data Lake & Lakehouse', techs: 'Iceberg, Delta Lake, Hudi', href: '/docs/13-data-lake-and-lakehouse/iceberg' },
  { name: 'Coordination & Orchestration', techs: 'Zookeeper, Airflow, Temporal', href: '/docs/14-workflow-orchestration-and-coordination/zookeeper' },
  { name: 'Object Storage', techs: 'S3, GCS, MinIO', href: '/docs/15-object-storage/s3' },
  { name: 'Load Balancing & Proxies', techs: 'NGINX, HAProxy, Envoy', href: '/docs/16-load-balancing-and-proxies/nginx' },
  { name: 'CDN & Edge', techs: 'CloudFront, Cloudflare', href: '/docs/17-cdn-and-edge/cloudfront' },
  { name: 'API Gateways', techs: 'Kong, AWS API Gateway', href: '/docs/18-api-gateways/kong' },
  { name: 'Container Orchestration', techs: 'Kubernetes', href: '/docs/19-container-orchestration/kubernetes' },
  { name: 'Observability', techs: 'Grafana, OpenTelemetry, Jaeger', href: '/docs/20-observability/grafana' },
];

export default function HomePage() {
  return (
    <main className="container mx-auto flex flex-col gap-16 px-4 py-16 lg:py-24">
      {/* Hero */}
      <section className="flex flex-col items-center text-center gap-6">
        <span className="rounded-full border border-fd-border bg-fd-card px-4 py-1.5 text-xs font-medium text-fd-muted-foreground">
          A System Design Interview Cheat Sheet
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-6xl">
          Master the technologies that show up in every <span className="bg-gradient-to-r from-fd-primary to-fd-foreground bg-clip-text text-transparent">HLD interview</span>.
        </h1>
        <p className="max-w-2xl text-lg text-fd-muted-foreground md:text-xl">
          61 technologies, one consistent template. TL;DR, data model, consistency, replication, sharding, trade-offs, and interview-ready cheat sheets — all in one place.
        </p>
        <ProgressPill />
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground transition hover:opacity-90"
          >
            <BookOpen className="size-4" />
            Read the docs
            <ArrowRight className="size-4" />
          </Link>
          <a
            href="https://github.com/NeelPoriya/hld"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card px-5 py-2.5 text-sm font-medium transition hover:bg-fd-accent"
          >
            <GithubIcon className="size-4" />
            Star on GitHub
          </a>
        </div>
      </section>

      {/* Recommended Reading Path */}
      <ReadingPath />

      {/* Categories */}
      <section className="flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Browse by Category</h2>
            <p className="mt-1 text-sm text-fd-muted-foreground">Pick the layer you&rsquo;re studying — every page follows the same 14-section template.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Link
              key={c.name}
              href={c.href}
              className="group flex flex-col gap-1 rounded-lg border border-fd-border bg-fd-card p-5 transition hover:border-fd-primary/40 hover:bg-fd-accent"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{c.name}</h3>
                <ArrowRight className="size-4 text-fd-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </div>
              <p className="text-sm text-fd-muted-foreground">{c.techs}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Why this site */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-fd-border bg-fd-card p-6">
          <h3 className="font-semibold">📖 Consistent format</h3>
          <p className="mt-2 text-sm text-fd-muted-foreground">
            Every page answers the same 14 questions in the same order, so you can skim, compare, and remember.
          </p>
        </div>
        <div className="rounded-lg border border-fd-border bg-fd-card p-6">
          <h3 className="font-semibold">⚡ Interview-ready</h3>
          <p className="mt-2 text-sm text-fd-muted-foreground">
            Each page ends with a one-line cheat sheet — perfect for the night before an on-site.
          </p>
        </div>
        <div className="rounded-lg border border-fd-border bg-fd-card p-6">
          <h3 className="font-semibold">🔧 Real numbers</h3>
          <p className="mt-2 text-sm text-fd-muted-foreground">
            Single-instance scale limits, when to shard, hot-shard pitfalls, common HLD patterns.
          </p>
        </div>
      </section>
    </main>
  );
}
