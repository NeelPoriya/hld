---
title: "Apache Solr"
description: "Apache Solr is the original Lucene-based enterprise search platform. Mature, battle-tested, deeply customizable — the choice for institutions running on-prem search at scale (libraries, e-commerce, government)."
---

> Category: Search Engine · Written in: Java · License: Apache 2.0

## TL;DR
Solr is a **distributed, open-source search platform** built on top of Apache Lucene — the same indexing library that powers ElasticSearch. It started in 2004 (older than ElasticSearch by ~6 years) and is the **search engine of choice for institutions** that want a fully-OSS, deeply-tunable search server they can run on-prem. Think large e-commerce sites, library catalogs, government open-data portals, Wikipedia-style content. **SolrCloud** is the distributed mode that runs on top of ZooKeeper. You reach for Solr when you want ElasticSearch-class search but value its longer history, schema-first approach, and absence of any commercial-license drift.

## What problem does it solve?
Same problem space as ElasticSearch: full-text search, faceted navigation, autocomplete, geo search, ranking. The differentiators are organizational and philosophical:
- **You want a 100% Apache 2.0 license forever.** ElasticSearch went through a license change (Elastic License → SSPL → AGPL) that scared a lot of orgs. Solr never has.
- **You want a schema-first, predictable system.** Solr forces you to declare a schema; ElasticSearch lets you do dynamic-mapping magic that bites you later.
- **You're already running ZooKeeper.** SolrCloud uses ZK as its coordinator — comfortable territory if you also run Kafka or HBase.
- **Library / academic / government systems.** Solr has been the de-facto search behind library catalogs, scholarly indexes, and gov-data portals for 15+ years.

## When to use
- **Faceted search** (e-commerce filters, catalog browsing) — Solr's facet engine is mature and well-understood.
- **Self-hosted, no-vendor-lock-in search** — pure Apache 2.0, runs anywhere.
- **Schema-first projects** where stable, validated documents matter more than schema-on-read flexibility.
- **Large existing investment in Solr/Lucene tuning** — synonyms, stemmers, tokenizers, analyzers all carry forward.
- **Public sector / academic / library** systems where Solr is a known, trusted quantity.

## When NOT to use
- **You want a managed cloud service** — Elastic Cloud / OpenSearch Service / AWS OpenSearch are far easier. Solr's cloud story (e.g. Bitnami / vendor-managed) is much smaller.
- **Logs / observability** — ElasticSearch + Kibana (or OpenSearch + OpenSearch Dashboards) own this niche.
- **Analytics dashboards** — Kibana > Solr's built-in admin UI.
- **You don't already run ZooKeeper.** SolrCloud requires it (Solr 9 introduced ZK-less mode but it's still less mature).
- **Vector search at scale** — Solr 9.x has dense-vector support (Lucene HNSW), but ElasticSearch / OpenSearch / Milvus are more featureful here.

## Data Model
- **Core / Collection** — the equivalent of a database / table. A collection is a logical search index, made up of one or more shards.
- **Document** — a JSON-like record (also XML / CSV) with a unique `id` field plus user-defined fields.
- **Field** — typed (text, int, date, geo, etc.) and configured via a `schema.xml` (classic) or **managed schema** (modern).

Example document:
```json
{
  "id": "book-9781234",
  "title": "Designing Data-Intensive Applications",
  "author": ["Martin Kleppmann"],
  "isbn": "9781449373320",
  "publish_year": 2017,
  "tags": ["distributed-systems", "databases"],
  "summary": "The classic guide to..."
}
```

Solr query (HTTP GET):
```
GET /solr/books/select?q=title:designing&fq=publish_year:[2015 TO *]&facet=true&facet.field=tags&rows=20
```
Translation: search for `designing` in `title`, restrict to year ≥ 2015, return up to 20 results, give me facet counts on `tags`.

## Architecture & Internals
- Built on **Apache Lucene** — the same inverted-index library underneath ElasticSearch. So at the lowest level, write/read paths are very similar.
- **SolrCloud mode:**
  - Many Solr nodes form a cluster.
  - **ZooKeeper** holds cluster state (live nodes, shard assignments, configuration).
  - A **collection** is split into **shards**; each shard has **replicas** (NRT, TLOG, or PULL types).
  - **Overseer** is the leader Solr node responsible for managing collection-level operations.
- **Storage engine (Lucene):** segments — immutable indexed file groups. Periodic merges combine segments to keep search fast and reclaim deletes.
- **Soft commits** make documents searchable in milliseconds without flushing to disk; **hard commits** persist segments durably.

## Consistency Model
- **Per-document atomicity** — a single document insert/update is atomic.
- **Eventually-consistent search** — once committed, your write is visible after the next soft commit (typically 1s).
- **No multi-document transactions.**
- **Replica consistency:**
  - **NRT replicas** (default): each replica indexes independently from the leader's transaction log → near-real-time, eventually consistent.
  - **TLOG replicas:** replicate the tlog, replay only on leader change.
  - **PULL replicas:** pull merged segments from the leader, no indexing on the replica.

CAP-wise: SolrCloud is CP (writes can fail if quorum lost) for its core operations, AP-leaning for replica reads.

## Replication
- Inside a shard: 1 leader + N replicas. Leader handles writes, replicates to followers (NRT — index in parallel; TLOG — replicate log; PULL — pull final segments).
- Leader election handled by ZooKeeper.
- Cross-cluster replication: **CDCR** (Cross-Data-Center Replication) ships changes to a remote cluster — async, eventually consistent.
- Backup-and-restore: built-in snapshot mechanism, can ship to S3/HDFS.

Failover RPO depends on commit interval — typically a few seconds.

## Partitioning / Sharding
- A collection is split into **shards** at creation time. You choose the number; can use **implicit** (manual key → shard mapping) or **compositeId** (hash routing) routers.
- Shard count is fixed at create unless you do **shard splitting** (online, but heavy).
- **Hot-shard pitfall:** with `compositeId` routing on a low-cardinality key (e.g. `tenantId`), one tenant can dominate one shard. Use a higher-cardinality key or hash a composite (`tenantId!documentId`).

## Scale of a Single Instance
- A single Solr node can typically index and search **tens to hundreds of millions of documents** — depends heavily on document size and field count.
- **Disk:** index size is usually 1.2–3× the raw data size (depends on stored fields and analyzers).
- **RAM:** budget enough for the OS page cache to hold hot segments + Java heap (usually 16–31 GB heap, rest as page cache).
- **Throughput:** thousands of QPS for moderately complex queries; bulk indexing rates of tens of thousands of docs/sec.
- **When to shard:** when single-node disk hits ~70%, or query latency degrades because too many segments. Practical sweet spot per node: ~50–100 GB of index.

## Performance Characteristics
- **Search latency:** single-digit ms for simple term queries; 10–100ms for complex faceted queries; sub-second for huge result sets.
- **Indexing:** soft-commit at 1s gives near-real-time search; hard-commit at 15–60s keeps disk usage healthy.
- **Bottlenecks:** segment merging (CPU + IO), JVM GC pauses (mitigate with G1GC / smaller heaps), too many distinct fields, too-frequent commits.

## Trade-offs

| Strength | Weakness |
|---|---|
| Pure Apache 2.0, no license drift | Smaller managed-cloud ecosystem than ElasticSearch |
| Schema-first → predictable, validated documents | Schema setup is upfront work |
| Long history → mature features (faceting, MoreLikeThis, spellcheck) | UI tooling (Solr Admin) feels dated next to Kibana |
| Strong faceted-search reputation | Vector / embedding support younger than ElasticSearch |
| Runs on the same Lucene library as ES → similar relevance quality | SolrCloud requires ZooKeeper (extra component) |
| Excellent for library / catalog / government search | Less of a "logs and APM" story |

## Common HLD Patterns
- **E-commerce product search** — Solr behind the catalog UI; rich facets (price, brand, rating); typo-tolerance via spellcheck/EdgeNGrams.
- **Library / scholarly catalog** — MARC records ingested into Solr; SearchWorks / VuFind / Blacklight as the open-source UIs.
- **Enterprise content search** — file shares + DBs ETL'd into Solr; query API behind the corporate search bar.
- **Government open data** — data portals (e.g. data.gov platforms) often use Solr for cross-dataset search.

## Common Pitfalls / Gotchas
- **Picking the wrong shard count up front.** Splitting later is possible but expensive; over-shard once and you carry that overhead forever.
- **Too-frequent hard commits** kill performance — let `autoCommit` happen on its schedule (15–60s).
- **Default `*:*` deletes** in Solr Admin's documents tab can wipe your index. Restrict access.
- **JVM heap > 32 GB** is wasteful (compressed oops boundary). Larger machines = bigger OS page cache, not bigger heap.
- **Multivalue field sort traps** — sorting on a multi-valued field requires special handling; many teams discover this in production.
- **ZooKeeper jepsen-style outages** — protect ZK with proper quorum (3 or 5 nodes), don't run it on the same disks as Solr.
- **Schema mismatch between environments** — managed schema is great, but accidentally letting auto-fields create themselves in dev breaks reproducibility.

## Interview Cheat Sheet
- **Tagline:** Apache 2.0, Lucene-based, schema-first search platform — the original distributed search server.
- **Best at:** faceted search, e-commerce product search, library/catalog/government search, on-prem deployments.
- **Worst at:** logs/APM (ElasticSearch wins), vector search at scale (Milvus wins), managed-cloud convenience.
- **Scale of one node:** tens to hundreds of millions of docs; ~50–100 GB index per node ideal.
- **Shard by:** hash of document key (compositeId), or manual (implicit) routing — chosen at collection creation.
- **Consistency:** eventually-consistent search after commit; per-doc atomic.
- **Replicates how:** SolrCloud — leader + N replicas per shard, ZooKeeper coordinates.
- **Killer alternative:** ElasticSearch (more momentum), OpenSearch (AWS fork of ES), Lucene-direct for embedded use.

## Further Reading
- Official docs: <https://solr.apache.org/guide/>
- SolrCloud architecture: <https://solr.apache.org/guide/solr/latest/deployment-guide/solrcloud-mode.html>
- "Solr in Action" (Manning, classic intro)
- Schema design guide: <https://solr.apache.org/guide/solr/latest/indexing-guide/schema-elements.html>
