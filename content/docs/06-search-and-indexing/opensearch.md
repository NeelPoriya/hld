---
title: "OpenSearch"
description: "OpenSearch is the AWS-backed open-source fork of ElasticSearch (Apache 2.0). Almost identical APIs and capabilities, with a strong AWS-managed offering and an OpenSearch Dashboards UI."
---

> Category: Search Engine + Analytics · Written in: Java · License: Apache 2.0 (forked from ElasticSearch 7.10)

## TL;DR
OpenSearch is the **community-driven, Apache-2.0 fork of ElasticSearch** that AWS launched in 2021 after Elastic switched the ES license to SSPL. It includes the search engine itself (forked from ElasticSearch 7.10) and **OpenSearch Dashboards** (forked from Kibana). For most workloads — full-text search, log analytics, observability, dashboards — OpenSearch is **functionally interchangeable with ElasticSearch**: same query DSL, same REST APIs, same ingestion patterns. You reach for it when you want ElasticSearch's capabilities under a clean Apache 2.0 license, especially on AWS where OpenSearch Service is a first-class managed offering.

## What problem does it solve?
After Elastic relicensed ES under SSPL (2021), every cloud / SaaS company offering managed ES had a problem: SSPL is not OSI-approved, and offering an SSPL-licensed product as a service triggers SSPL's copyleft. AWS forked the last Apache-2.0 version of ElasticSearch and Kibana → that fork is OpenSearch. Today it's a Linux Foundation project (independent of AWS) with a broad community.

So the problem it solves is:
- **License risk** — you want true open source, no SSPL gotchas.
- **AWS-native search** — first-class managed service (Amazon OpenSearch Service), tight IAM integration, VPC, KMS.
- **Drop-in for existing ES users** — APIs are nearly identical for ES 7.x users.

## When to use
- **Logs / observability stack on AWS** — a fully-OSS ELK/EFK alternative with managed deployment and tight CloudWatch integration.
- **Full-text search on AWS** — same use cases as ElasticSearch, but you want the managed AWS service.
- **Multi-tenant SaaS** — Apache 2.0 license lets you embed OpenSearch into your own product without SSPL headaches.
- **Vector search + hybrid lexical-semantic search** — OpenSearch has solid vector engine support (Faiss / Lucene HNSW / NMSLIB).
- **Migrating off ElasticSearch 7.10** — most APIs and queries port directly.

## When NOT to use
- **You need ElasticSearch's newest features** (e.g. ES 8.x ESQL, latest ML jobs) — OpenSearch lags ES on some new features.
- **You need ELSER / Elastic's proprietary semantic search models** — those are ES-only.
- **Tiny apps that just want a database with text search** — Postgres FTS is plenty for a few million rows.
- **You're locked into Kibana plugins or dashboards** that haven't been ported to OpenSearch Dashboards.

## Data Model
Identical to ElasticSearch:
- **Index** — a collection of documents with a mapping (schema).
- **Document** — JSON, has an `_id`, lives in an index.
- **Mapping** — typed field definitions (text, keyword, number, date, geo, dense_vector, etc.).

```json
PUT /products/_doc/1
{
  "name": "Mechanical Keyboard",
  "price": 129.99,
  "tags": ["mechanical", "rgb"],
  "embedding": [0.12, -0.04, 0.98, ...]
}
```

Search:
```json
POST /products/_search
{
  "query": {
    "bool": {
      "must":   [{ "match": { "name": "keyboard" } }],
      "filter": [{ "range": { "price": { "lte": 200 } } }]
    }
  },
  "aggs": { "by_tag": { "terms": { "field": "tags.keyword" } } }
}
```

## Architecture & Internals
Same as ElasticSearch:
- **Cluster** of nodes (master, data, coordinating, ingest roles).
- **Cluster manager** node (renamed from "master" in OpenSearch) coordinates cluster state.
- **Indices** are split into **primary shards** + **replica shards**.
- **Storage:** Lucene segments — immutable, periodically merged.
- **Refresh interval** (default 1s) makes new docs searchable; **flush** persists translog to disk.
- **Plugins:** SQL plugin, Anomaly Detection, Security (formerly Open Distro), Index State Management, **k-NN plugin** for vectors.

## Consistency Model
- **Per-document operations are atomic** (CAS via `_version` / `if_seq_no`).
- **Eventually-consistent search:** new docs visible after refresh (~1s default).
- **No multi-document transactions.**
- Default isolation: read-after-write within the primary shard if you target the doc by ID.

CAP-wise: AP-leaning during cluster manager re-election; CP for cluster state changes.

## Replication
- Per index: configurable number of **replicas** (default 1).
- Writes go to the primary shard, then synchronously to replicas.
- Failover: if a primary dies, a replica is promoted automatically.
- **Cross-cluster replication (CCR)** plugin: ships data to a follower cluster (typically in another region) for DR / read scaling.
- **Snapshot/Restore** to S3 / Azure Blob / GCS — first-class.

Failover RPO ≈ 0 once the primary acks (writes are committed only after replicas ack); RTO depends on cluster manager election (a few seconds).

## Partitioning / Sharding
- You choose **number_of_shards** at index creation; **cannot** change without a reindex.
- Default routing: hash of `_id` modulo number of shards.
- Custom routing key (`?routing=customerId`) co-locates a tenant's docs on one shard — faster queries for that tenant, but **hot-shard risk** if one tenant dominates traffic.
- **Time-based indices** for logs: rotate daily/weekly/monthly (`logs-2026-05-03`); use **Index State Management** to roll over and delete.

## Scale of a Single Instance
- Per shard sweet spot: **10–50 GB**, soft-cap 50 GB. Above that, query latency rises and recovery is slow.
- A **node** can typically host 20–25 shards per GB of heap. A standard 32 GB heap node thus holds ~600 shards comfortably.
- A **cluster** comfortably scales to 100+ data nodes, 10 PB+ data, 100s of billions of documents (logs/observability scale).
- **When to shard:** as soon as a single shard would exceed ~50 GB or query latency suffers; for time-series/logs, shard by time + customer.

## Performance Characteristics
- Sub-100ms search latency for typical queries.
- Bulk ingest: **100k–500k docs/sec** per cluster (depends on doc size, refresh interval, and shard layout).
- k-NN queries: 10s of ms for HNSW indexes up to a few million vectors per shard; degrades with high recall + large datasets.
- Bottlenecks: heavy aggregations on high-cardinality fields, JVM GC pauses (G1 / ZGC), and disk IOPS on HDD-backed nodes (use SSD/NVMe).

## Trade-offs

| Strength | Weakness |
|---|---|
| Pure Apache 2.0 license forever | Trails ElasticSearch in feature velocity |
| First-class AWS managed service | Some ES 8.x APIs aren't available |
| Bundles security, alerting, anomaly detection at no cost | Dashboards / plugin ecosystem smaller than Kibana's |
| Same query DSL as ES — easy migration from ES 7.x | Compatibility with ES clients depends on version |
| Strong vector search (k-NN with Faiss/HNSW/NMSLIB) | Behind purpose-built vector DBs (Milvus, Pinecone) at extreme scale |
| Big community, Linux Foundation governance | Two competing ecosystems can be confusing for newcomers |

## Common HLD Patterns
- **AWS-native log pipeline:** ECS/EKS/Lambda → CloudWatch → Firehose → OpenSearch → OpenSearch Dashboards.
- **Multi-tenant search SaaS:** OpenSearch behind the API, one index per tenant or routing-key partitioning, k-NN for semantic search.
- **Hybrid search:** lexical (BM25) + dense vectors combined via `script_score` or `knn` query — RAG/AI features inside an existing search system.
- **DR strategy:** primary cluster in `us-east-1`, CCR follower in `us-west-2`, snapshots to S3 with cross-region replication.

## Common Pitfalls / Gotchas
- **Mapping explosions** — letting docs auto-create fields can lead to thousands of mapped fields, which kills cluster manager performance. Use `index.mapping.total_fields.limit` and explicit mappings.
- **Too many shards** — 10k+ small shards on one node is a recipe for slow startup and OOMs. Aim for shards of 10–50 GB.
- **Forgetting to refresh disable on bulk loads** — set `refresh_interval=-1` during initial loads, then re-enable.
- **Mixed ES + OpenSearch clients** — clients written for ES 8.x may not work; use the OpenSearch official clients.
- **Updating mappings doesn't rewrite existing docs.** You usually need a reindex.
- **High-cardinality `terms` aggregation** is a memory hazard — consider `composite` aggregation for pagination.
- **Vector recall vs latency trade-off** — HNSW parameters (`m`, `ef_construction`, `ef_search`) need tuning per workload.

## Interview Cheat Sheet
- **Tagline:** AWS-led, Apache-2.0 fork of ElasticSearch + Kibana — same APIs, same Lucene, no license drama.
- **Best at:** logs/observability on AWS, full-text + vector search, multi-tenant SaaS embedding.
- **Worst at:** brand-new ES 8.x features, embedded use cases (just use Lucene), extreme-scale pure vector search.
- **Scale of one cluster:** 100s of nodes, PBs of data, billions of docs; per-shard 10–50 GB.
- **Shard by:** hash of `_id` by default; custom routing key for tenant co-location (watch for hot shards).
- **Consistency:** eventually consistent (refresh interval), atomic per-doc.
- **Replicates how:** primary + N replicas (sync); CCR for cross-cluster; snapshots for DR.
- **Killer alternative:** ElasticSearch (newer features, ELSER models), Solr (institutional choice), Milvus / Pinecone (pure vector).

## Further Reading
- Official docs: <https://opensearch.org/docs/>
- AWS managed service: <https://aws.amazon.com/opensearch-service/>
- ES vs OpenSearch comparison: <https://opensearch.org/faq/>
- k-NN plugin guide: <https://opensearch.org/docs/latest/search-plugins/knn/>
