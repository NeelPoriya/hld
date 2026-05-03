---
title: "ElasticSearch"
description: "ElasticSearch is a distributed search engine built on Lucene, optimized for full-text search, log analytics, and real-time aggregations. If users type into a search box, or you need to slice millions of log lines by a..."
---

> Category: Distributed Search & Analytics Engine · Built on: Apache Lucene · Written in: Java · License: Elastic License 2.0 / SSPL (post-2021); fork [OpenSearch](https://opensearch.org/) is Apache 2.0

## TL;DR
ElasticSearch is a **distributed search engine** built on Lucene, optimized for **full-text search, log analytics, and real-time aggregations**. If users type into a search box, or you need to slice millions of log lines by any field, ElasticSearch is the default. Think Google-style search-as-you-type plus a flexible analytics engine.

## What problem does it solve?
A relational database can do `LIKE '%query%'` — but it's `O(N)`, doesn't rank by relevance, can't handle typos, can't tokenize languages, and falls over on large text fields. ElasticSearch builds **inverted indexes** so a phrase search across billions of documents takes milliseconds, with relevance scoring (BM25), aggregations, and faceting baked in.

## When to use
- **Full-text search** in apps (e-commerce product search, doc search, Slack-style message search).
- **Log analytics / observability** (the "E" in **ELK / Elastic Stack**).
- **APM / metrics / SIEM** (security event analysis).
- **Geo search** (find restaurants within 2 km, ranked by relevance).
- **Real-time aggregations / dashboards** over event data.
- **Autocomplete / suggesters / typo-tolerant search.**

## When NOT to use
- **System of record** — ES has had data-loss episodes historically; treat it as a **derived index**, not the source of truth.
- **Strong-consistency transactional workloads** — no ACID, no joins, eventually consistent.
- **Frequent point updates to the same doc** — every "update" is *delete + reindex*; expensive at high write rates.
- **Tiny datasets** — operationally heavy for < 100 GB.
- **Pure key-value access** — Redis/DynamoDB are cheaper and faster.
- **Heavy joins / SQL analytics** — use Snowflake/BigQuery/ClickHouse.

## Data Model
- **Index** ≈ "table". Holds **documents**.
- **Document** ≈ "row" — a JSON object.
- **Field** ≈ "column" — typed (text, keyword, integer, date, geo_point, etc.).
- **Mapping** ≈ "schema" — defines field types and analyzers. Can be auto-detected (dynamic mapping) or explicit.

```json
PUT products/_doc/1
{
  "name": "Bose QC45 Wireless Headphones",
  "description": "Active noise-cancelling over-ear headphones...",
  "price": 329.0,
  "tags": ["audio", "headphones", "wireless"],
  "rating": 4.6,
  "in_stock": true,
  "created_at": "2026-04-01T10:00:00Z"
}
```

### `text` vs `keyword` (the field-type gotcha)
- `text` → analyzed (tokenized, lowercased) — used for full-text search.
- `keyword` → stored verbatim — used for exact match, filters, sorting, aggregations.
- It's idiomatic to index a string as **both**: `name` for search, `name.keyword` for sort/filter.

### The inverted index (why ES is fast)
For each token, ES stores a sorted list of doc IDs that contain it.
```
"headphones" → [1, 14, 87, 412, ...]
"wireless"   → [1, 87, 199, ...]
```
A search for "wireless headphones" intersects two postings lists. This is `O(small)`, not `O(N)`.

## Architecture & Internals
- **Cluster** of **nodes**. Roles: master, data, ingest, coordinating, ML, etc.
- An **index** is split into **primary shards** + **replica shards**.
  - Each shard is a **full Lucene index**.
- **Lucene segments** are immutable files; new docs become new segments. Periodic **merges** combine segments (similar to compaction in LSM).
- A **refresh** (default every 1s) makes new docs searchable but doesn't fsync. A **flush** fsyncs the **translog** (write-ahead log) for durability.
- **Coordinating node** parses the request, routes to relevant shards (search = scatter/gather), merges results.

```
Search request
    │
    ▼
Coordinating node ──► shard 0 (primary or replica)
                  └─► shard 1
                  └─► shard 2
                  └─► ...
                  ◄── merge top-K from each shard, return
```

## Consistency Model
- **Near-real-time** (NRT): writes are visible after the next refresh (default 1 s).
- **Eventual consistency** across replicas; primary acks to client based on `wait_for_active_shards`.
- **Per-document operations** are atomic (versioned via internal `_seq_no` + `_primary_term`). Optimistic concurrency control with `if_seq_no` / `if_primary_term`.
- **No multi-document transactions / no joins.**
- CAP positioning: **AP** under partitions; you can lose recent writes if you misconfigure replication acks.

## Replication
- Each primary shard has 0 or more **replica shards**.
- Writes go to the primary, then replicate to replicas.
- Replicas serve reads (load distribution) and provide HA.
- **Replication factor** = 1 + number_of_replicas (e.g. 1 primary + 1 replica = 2 copies).
- For a multi-AZ HA cluster: 1 primary + 1 replica is the typical minimum.

## Partitioning / Sharding
**Sharding is mandatory** in ES — every index has a shard count chosen at creation time.

- A doc's shard = `hash(routing or _id) mod number_of_primary_shards`.
- **Number of primary shards is fixed at index creation.** Changing it requires a reindex.
- **Replica count** can be adjusted any time.

### Sizing rules (the crucial interview knowledge)
- Aim for **shards of 10–50 GB** (logs / time-series can go to 50 GB; search-heavy workloads stay smaller).
- Keep **shard count per node** modest — recommend < ~20 shards per GB of JVM heap.
- **Too many small shards** (over-sharding) is the #1 cluster killer — heavy cluster-state, slow searches, GC pressure.
- **Too few large shards** → can't scale horizontally; rebuilds are slow.

### Custom routing
By default, docs spread across all shards by `_id` hash. You can route docs by a custom field (e.g. `customer_id`) so all docs for one customer land on one shard → faster queries (they hit only one shard). Risk: hot shards if one customer is huge.

### Time-based indexes (logs / observability)
For log/event data, create **rolling indexes** (e.g. one index per day or per N GB) and use **Index Lifecycle Management (ILM)** to:
- **Hot tier**: small, fast SSD, accepting writes.
- **Warm tier**: read-only, fewer shards (force-merged).
- **Cold tier**: searchable snapshots on cheap storage.
- **Delete** after retention.

This is how you keep years of logs without the cluster melting.

### Hot-shard pitfalls
- Routing by a low-cardinality field (e.g. `country` with most traffic = "US").
- Using a single huge index for all tenants when one tenant dwarfs the rest.
- Time-based index where today's index gets all writes — fine if you size it right; pair with **rollover** so it doesn't grow forever.

## Scale of a Single Instance
> Cluster guidance from operators of large ES deployments. Numbers depend on document size, query complexity, and tier (hot/warm/cold).

| Dimension | Comfortable per node | Stretch | Why |
|---|---|---|---|
| JVM heap | **~30 GB** (don't go past 32 GB!) | — | crosses compressed-oops boundary; use rest of RAM for OS file cache |
| Total RAM | 64 GB sweet spot | 128+ GB | file cache is what makes searches fast |
| Data per node | ~1–2 TB on hot tier | up to 10+ TB on cold/searchable-snapshot tier | larger = slower recovery |
| Shards per node | a few hundred max | — | each shard has overhead |
| Indexing throughput | ~10K–50K docs/sec/node | 100K with bulk + tuning | bulk API is essential |
| Query latency | tens of ms typical | — | depends on aggregations |

**When to scale out:**
- Indexing throughput pegs CPU on writes.
- Search latency rises because shards are too big or too many.
- File-system cache hit rate drops.
- Cluster state grows large (too many indices/shards).

**Why heap stays at ~30 GB:**
Above 32 GB, the JVM disables **compressed object pointers**, doubling pointer size and wasting heap. Run more nodes instead of giant heaps.

## Performance Characteristics
- **Search latency:** tens of ms for typical queries on properly-sized shards.
- **Aggregations** can be expensive — cardinality, percentiles, terms with high cardinality.
- **Indexing throughput:** loves bulk requests (`_bulk` API, batches of 5–15 MB).
- **Hot bottleneck:** segment merges, refresh interval too aggressive, GC pauses.
- **File system cache** matters more than you think — keep the working set in OS cache.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Sub-second full-text search at scale | Not a system of record — eventual consistency, can lose data |
| Powerful aggregations & analytics | Updates are expensive (delete + reindex) |
| Mature ecosystem (Kibana, Logstash, Beats) | Operationally complex (JVM tuning, ILM, sharding) |
| Geo, ML, autocomplete, vector search built-in | License tension (ELv2/SSPL vs OpenSearch) |
| Horizontal scaling via sharding | Reindexing to change shard count is painful |
| Excellent for logs/observability | Can be expensive at scale (RAM-hungry) |

## Common HLD Patterns
- **OLTP DB + ElasticSearch (search index):**
  - Postgres/DynamoDB owns truth.
  - CDC (Debezium → Kafka) streams changes to ES.
  - Search queries go to ES; writes go to OLTP.
- **ELK / Elastic Stack** for logs:
  ```
  Apps → Filebeat / Fluent Bit → Logstash / Kafka → ElasticSearch → Kibana
  ```
- **Search-as-you-type / autocomplete** with edge n-gram analyzers or `completion` suggester.
- **E-commerce product search** with multi-field analyzers, synonyms, faceted filters, geo, sort by price/relevance.
- **SIEM / security analytics** — store events, alert via Watcher, visualize in Kibana.
- **Vector search** (since 8.x) — k-NN search alongside lexical search ("hybrid search").

## Common Pitfalls / Gotchas
- **Over-sharding** (1000s of small shards) → cluster grinds. Fewer, bigger shards.
- **Wrong shard count** at index creation; cannot change without reindex. Use **rollover** + **ILM** instead of guessing.
- **Mapping explosion** — dynamic mapping creates a field per unique key. Disable dynamic mapping for user-supplied JSON.
- **Treating ES as the database** and being surprised by data loss. Always have a **replayable source** (Kafka, Postgres, S3).
- **Heavy aggregations on `text` fields** — use `keyword` subfields.
- **Updates in tight loops** on the same doc → segment churn.
- **Ignoring the translog** — set `index.translog.durability: request` only if you really need per-request fsync.
- **Searches without filters** scan everything; always pre-filter (filter context is cached, query context isn't).

## Interview Cheat Sheet
- **Tagline:** "Distributed Lucene-based search & analytics engine; the search box and the log dashboard."
- **Best at:** full-text search, log analytics, real-time aggregations, geo search, autocomplete.
- **Worst at:** transactional workloads, system-of-record, frequent updates, joins.
- **Scale of one node:** ~30 GB JVM heap (hard ceiling), ~1–2 TB data on hot tier; shards 10–50 GB.
- **Shard by:** primary shard count fixed at index creation; route by `_id` (default) or custom routing key; use rollover for time-series.
- **Consistency:** near-real-time (1 s refresh), eventual across replicas; per-doc optimistic concurrency.
- **Replicates how:** primary shard → replica shards within cluster; cross-cluster replication for DR.
- **Killer alternatives:** OpenSearch (Apache 2.0 fork), Apache Solr (older Lucene-based), Algolia (managed search SaaS), Typesense, Vespa, ClickHouse (for analytics-heavy use cases).

## Further Reading
- Official docs: https://www.elastic.co/guide/index.html
- "Elasticsearch: The Definitive Guide" (older but classic): https://www.elastic.co/guide/en/elasticsearch/guide/current/index.html
- "Designing Data-Intensive Applications" — Lucene / inverted index chapter.
- Elastic blog on sharding: https://www.elastic.co/blog/how-many-shards-should-i-have-in-my-elasticsearch-cluster