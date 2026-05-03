---
title: "Typesense"
description: "Typesense is the open-source, self-hostable answer to Algolia — typo-tolerant search in a single Go/C++ binary, vector + lexical hybrid, instant InstantSearch-compatible, runs on a Raft cluster."
---

> Category: Search-as-a-Service · Written in: C++ (engine) + Go (cluster manager) · License: GPL v3 (server) + Apache 2.0 (clients)

## TL;DR
Typesense is the **open-source spiritual clone of Algolia**: same product-grade UX (typo-tolerance, prefix, faceting, ranking by business attributes, geo, vector hybrid) packaged as a **single binary** you can self-host or run on **Typesense Cloud**. It's purpose-built for **low-latency search-as-you-type** (not for logs or general document storage), and ships with **InstantSearch-compatible** adapters so the same React widgets that work with Algolia work with Typesense. Cluster mode uses **Raft** for replication; the engine indexes in memory + disk for sub-50ms p95. Reach for Typesense when you want **Algolia's UX without the cost or vendor lock-in**, when you need **on-prem search**, or when you want **vector + lexical hybrid** (semantic search) without running a heavy vector DB.

## What problem does it solve?
- **Algolia is great but expensive / closed** — Typesense is OSS + self-hostable.
- **ElasticSearch is overkill + slower for product search** — heavy ops, not optimized for typo-tolerance UX.
- **Self-hosted lexical + vector** — Typesense supports `dense` vector fields with hybrid ranking.
- **Single-binary deploy** — easy to run; no Lucene / JVM / heavy ops.
- **InstantSearch adapter** — drop-in client compatibility means migrating UI from Algolia is mostly config.

## When to use
- **E-commerce / marketplace / docs** product search; typo-tolerant.
- **Self-hosted requirement** — on-prem / air-gapped / regulated.
- **Cost-sensitive vs Algolia.**
- **Hybrid lexical + vector** semantic search without separate vector DB.
- **Multi-tenant SaaS** where per-tenant API key + scoped search is needed.
- **Embedded in your product** — single binary, easy to ship.

## When NOT to use
- **Logs / observability** — use OpenSearch / ElasticSearch / Loki.
- **Massive document size + complex queries** — ElasticSearch is more flexible.
- **You want a fully-managed glossy UI for non-engineers tuning relevance** — Algolia's dashboard is unmatched.
- **OLAP / analytics on text data** — wrong tool.
- **Petabyte-scale primary index** — Typesense scales but ES / Vespa are tested at higher.

## Core Concepts
- **Collection** — schema-defined set of documents (similar to Algolia index / SQL table).
- **Field** — typed: `string`, `int32`, `int64`, `float`, `bool`, `geopoint`, `string[]`, `int32[]`, `object`, `object[]`, `auto`. Some can be `facet: true`, `index: true`, `sort: true`.
- **Document** — JSON record; `id` is unique key.
- **Search Parameters** — `q`, `query_by`, `filter_by`, `facet_by`, `sort_by`, `per_page`, `page`, `infix`, `pre_segmented_query`, `vector_query`.
- **Ranking** — text match → custom ranking (configurable via `sort_by`).
- **Synonyms** — explicit per-collection.
- **Curation (Overrides)** — per-query rules: pin docs, hide, replace, redirect.
- **Multi-search** — batch many queries in one request.
- **API Keys** — admin (full), search-only, or scoped (with filter / collection allowlist) — server signs scoped keys for clients.
- **Vector field** — `float[]`, `num_dim`, `vec_dist: cosine|ip|l2`; supports `vector_query: <field>([0.1, …], k:10, alpha: 0.5)` for hybrid.
- **Cluster** — 1, 3, or 5 node Raft; reads served from any node, writes go through leader.

```bash
# Single-node dev
docker run -p 8108:8108 -v $PWD/data:/data \
  typesense/typesense:0.27.1 \
  --data-dir /data --api-key=xyz --enable-cors
```

```javascript
// Create a collection schema
import Typesense from "typesense";
const client = new Typesense.Client({
  nodes: [{ host: "search.acme.com", port: 443, protocol: "https" }],
  apiKey: "ADMIN_KEY"
});

await client.collections().create({
  name: "products",
  fields: [
    { name: "title", type: "string" },
    { name: "brand", type: "string", facet: true },
    { name: "categories", type: "string[]", facet: true },
    { name: "price", type: "int32", facet: true, sort: true },
    { name: "popularity", type: "int32", sort: true },
    { name: "in_stock", type: "bool", facet: true },
    { name: "embedding", type: "float[]", num_dim: 384 }
  ],
  default_sorting_field: "popularity"
});

// Bulk import documents (NDJSON)
const docs = products.map(p => JSON.stringify(p)).join("\n");
await fetch("https://search.acme.com/collections/products/documents/import?action=upsert", {
  method: "POST",
  headers: { "X-TYPESENSE-API-KEY": "ADMIN_KEY", "Content-Type": "text/plain" },
  body: docs
});
```

```javascript
// Hybrid search: lexical + vector with InstantSearch adapter
import { searchClient } from "typesense-instantsearch-adapter";

const adapter = new searchClient({
  server: { nodes: [{ host: "search.acme.com", port: 443, protocol: "https" }],
            apiKey: "SEARCH_ONLY_KEY" },
  additionalSearchParameters: {
    query_by: "title,brand,categories",
    sort_by: "_text_match:desc,popularity:desc",
    facet_by: "brand,categories,in_stock,price",
    per_page: 24
  }
});

// Hybrid lexical + semantic
await client.collections("products").documents().search({
  q: "noise cancelling headphones",
  query_by: "title,brand,categories",
  vector_query: "embedding:([0.12, -0.08, ...], k:50, alpha: 0.4)",  // 0=lex only, 1=vec only
  filter_by: "in_stock:true && price:<200",
  facet_by: "brand,categories",
  per_page: 24
});
```

```javascript
// Server signs a scoped search-only key for a multi-tenant frontend
const scopedKey = client.keys().generateScopedSearchKey(
  SEARCH_ONLY_KEY,
  { filter_by: `tenant_id:${tenantId}`, expires_at: Date.now()/1000 + 3600 }
);
// Send `scopedKey` to the frontend; clients can only see their tenant's docs.
```

## Architecture
- **Single C++ engine** indexing in memory; data persisted to disk + WAL.
- **Cluster** — 3 or 5 nodes; Raft replicates writes; reads can be served by any node.
- **HTTP / JSON API** + REST conventions; gRPC not exposed.
- **Memory-resident indices** — Typesense aims to keep working set in RAM for sub-50ms p95.
- **InstantSearch adapter** — translates InstantSearch-style queries into Typesense API calls.
- **Snapshot + WAL** — persistence + replication; raft snapshot for recovery.
- **Embeddings (built-in)** — Typesense can call OpenAI / GCP / OSS embedding models for `embed_with` fields, computing vectors at index time.

## Trade-offs

| Strength | Weakness |
|---|---|
| OSS, self-hostable single binary | GPL v3 server license — read implications |
| Sub-50ms search-as-you-type | RAM-bound; large indexes need beefy nodes |
| Hybrid lexical + vector | Smaller community than ES |
| InstantSearch-compatible client | Less polish in tuning UI than Algolia |
| Schema-aware (typed fields) | Schema changes require collection re-create or alias swap |
| Multi-tenant scoped keys | Cluster ops still your responsibility |
| Built-in embeddings provider integration | Snapshot-based replication has recovery time |
| Typesense Cloud option | Smaller analytics surface vs Algolia |

## Common HLD Patterns
- **E-commerce product search** — collection per language; faceted UI via InstantSearch.
- **Hybrid semantic search** — `embedding` field on each doc; query embeds with same model; `alpha` tunes lexical vs vector blend.
- **Multi-tenant SaaS** — single collection + `tenant_id` field + scoped API keys per tenant.
- **Atomic re-index** — index `products_v2`, validate, then alias swap (Typesense supports collection aliases).
- **Curation rules** — pin promotional product for query "headphones"; hide deprecated SKU.
- **Multi-search** — single round trip combines featured query + main query + suggestions.
- **Edge cache** — search-only key + CDN cache short-TTL responses.
- **Migration from Algolia** — InstantSearch adapter means UI stays; rewrite ingestion + API calls.

## Common Pitfalls / Gotchas
- **All-RAM indexes** — large catalogs need significant RAM; benchmark.
- **Schema rigidity** — adding/removing fields requires care; alias swaps are the standard pattern.
- **`auto` field type** — convenient for prototyping, dangerous for prod (no type guarantees).
- **Cluster sizing** — Raft requires odd numbers; 3-node minimum for HA.
- **Reads at any node** but writes go to leader; write-heavy workloads constrained by leader throughput.
- **Search-only key leakage** — even read-only keys can scrape your index; use scoped + IP / time limits.
- **Embedding drift** — switching embedding model requires re-embedding all documents.
- **Hybrid `alpha` tuning** — extremes hurt; A/B test.
- **Curation overuse** — too many overrides creates fragile relevance; prefer fixing data + ranking.
- **Snapshot on huge data** — restore can take a while; plan failover.
- **Bulk import errors** — partial successes; check returned NDJSON for per-doc status.

## Interview Cheat Sheet
- **Tagline:** OSS Algolia-style search engine — single binary, typo-tolerant + faceted + hybrid lexical/vector; InstantSearch-compatible; Raft cluster.
- **Best at:** e-commerce / docs / app search self-hosted, hybrid semantic search, cost-sensitive teams, on-prem / regulated.
- **Worst at:** logs / observability, OLAP, petabyte-scale, polished marketing-tunable UI (Algolia wins).
- **Scale:** millions of records easily; tens of millions with sufficient RAM; 3 / 5-node Raft cluster.
- **Distributes how:** Raft for write replication; reads from any node; scale-up RAM more than scale-out.
- **Consistency / state:** Raft strongly-consistent on writes; reads can be slightly stale on followers (configurable).
- **Killer alternative:** Algolia (managed, premium), Meilisearch (similar OSS), OpenSearch / ElasticSearch (more flexible, heavier), Vespa (massive scale), Sonic (lightweight), Quickwit (log-search-focused), pgvector + Postgres (DB-native).

## Further Reading
- Official docs: <https://typesense.org/docs/>
- Vector / hybrid search: <https://typesense.org/docs/0.27.1/api/vector-search.html>
- InstantSearch adapter: <https://github.com/typesense/typesense-instantsearch-adapter>
- Cluster: <https://typesense.org/docs/guide/high-availability.html>
