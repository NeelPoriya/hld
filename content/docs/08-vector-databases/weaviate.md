---
title: "Weaviate"
description: "Weaviate is an open-source vector database with a built-in object model, GraphQL API, and pluggable vectorization modules that auto-embed your data using OpenAI, Cohere, HuggingFace, etc."
---

> Category: Open-Source Vector + Object Database · Written in: Go · License: BSD-3-Clause

## TL;DR
Weaviate is an **open-source vector database** that feels more like a **search engine + object store** than a raw ANN index. It stores objects (with structured properties) and their vector embeddings together, exposes a **GraphQL** and **REST/gRPC** API, and supports **pluggable vectorizer modules** that automatically embed your data using OpenAI / Cohere / HuggingFace / Ollama / built-in transformers — so you don't have to embed in your app code. Reach for Weaviate when you want **structured + vector + hybrid search in one engine**, with strong out-of-the-box developer ergonomics. The trade-off vs Milvus is a smaller ANN feature surface (HNSW only, plus binary quantization) but much nicer day-to-day developer experience.

## What problem does it solve?
You're building a feature that needs **semantic search over structured data with rich filters**:
- "Find products similar to this one, but only in the 'shoes' category, under $100, in stock in EU warehouses."
- "Search company knowledge base for relevant articles for this question, filtered to documents the user has access to."
- "Recommend support tickets similar to this one, restricted to the same product line."

Pure vector DBs (Pinecone, Milvus) handle the vector half; the object/property half is awkward. Weaviate co-locates them: every object has both vector and structured fields, and you can filter or hybrid-rank in one query.

## When to use
- **Hybrid search** combining BM25 (keyword) + vector similarity in one query.
- **Multi-tenant SaaS** — Weaviate has first-class tenants (one shard per tenant).
- **Auto-vectorization** — let Weaviate call OpenAI/Cohere/etc. for you and store embeddings transparently.
- **Strong type/schema system** — class-based schemas like an ORM; great for API-driven apps.
- **GraphQL-first developers** — the query language is GraphQL natively.
- **Modular / pluggable** — vectorizer modules, reranker modules, generative modules (RAG built in via `generate` modules).

## When NOT to use
- **Extreme scale beyond a few billion vectors** — Milvus has more aggressive distributed architecture and more index types (DiskANN, GPU, etc.).
- **Tiny scale** — pgvector or Chroma is simpler.
- **You can't run Go services / Kubernetes** — Weaviate Cloud (WCS) is the managed escape hatch.
- **You need every ANN algorithm** — Weaviate is HNSW-centric (with PQ, BQ, SQ for memory savings); not as buffet-style as Milvus.

## Data Model
- **Class** (now also called **Collection**) — like a SQL table; has properties (typed) and a vector configuration.
- **Object** — instance of a class with property values + a vector (auto-generated or user-supplied).
- **Tenants** — true per-tenant data isolation: each tenant is its own shard with its own HNSW index.
- **Cross-references** — properties can be references to other classes (graph-like).

```python
import weaviate

client = weaviate.connect_to_local()

client.collections.create(
    name="Article",
    properties=[
        {"name": "title", "data_type": "text"},
        {"name": "body",  "data_type": "text"},
        {"name": "lang",  "data_type": "text"},
    ],
    vectorizer_config=weaviate.classes.config.Configure.Vectorizer.text2vec_openai()
)

articles = client.collections.get("Article")
articles.data.insert({
    "title": "Hybrid search explained",
    "body": "Hybrid search combines BM25 and dense vector similarity ...",
    "lang": "en"
})

# Hybrid query (BM25 + vector)
res = articles.query.hybrid(
    query="how does hybrid search work",
    alpha=0.7,  # 1.0 = pure vector, 0.0 = pure BM25
    limit=5,
    filters=weaviate.classes.query.Filter.by_property("lang").equal("en")
)
```

## Architecture & Internals
- A single Go binary (per node), typically deployed as a **Kubernetes StatefulSet** in production.
- **HNSW** is the default ANN index, with **Product Quantization (PQ)**, **Binary Quantization (BQ)**, and **Scalar Quantization (SQ)** for memory savings.
- **Inverted index** for keyword (BM25) search and structured filters — same engine handles both vector and keyword.
- **Vectorizer modules** call out to embedding APIs (OpenAI, Cohere, HuggingFace, Voyage, Ollama, etc.) at write and query time.
- **Generative modules** (`generative-openai`, `generative-cohere`, …) make a RAG step part of the query: retrieve top-K and pipe through an LLM for an answer, all server-side.
- **Storage:** LSM-style on disk (RoaringBitmaps for filters) + HNSW graph; data and indexes persisted to local disk.

## Consistency Model
- **Eventually consistent** for replicated setups.
- Per-object writes are atomic; Weaviate exposes tunable **read/write consistency levels** for replicated clusters: ONE, QUORUM, ALL — similar to Cassandra's tunable consistency.
- No multi-object transactions.

## Replication
- **Replication factor** is configurable per class; data is replicated across nodes for HA.
- Replication uses **Raft** (for cluster metadata) and replication on the data plane with tunable read/write consistency.
- Cross-region replication is not built in; multi-DC is a deployment choice.
- **Backups** to S3 / GCS / Azure Blob built in.

## Partitioning / Sharding
- **Sharding** is per class. You configure the number of shards; objects are routed by hash of the id (or by tenant if multi-tenant).
- **Multi-tenancy:** the canonical approach for SaaS — each tenant gets its own shard with its own HNSW graph and its own data isolation. Hundreds of thousands of tenants per cluster are supported via lazy/active loading.
- **Hot-tenant pitfall:** if one tenant has 100M vectors and others have 10K, balance is uneven. You can pin large tenants to dedicated nodes.

## Scale of a Cluster
- **Hundreds of millions to a few billion** vectors with HNSW + quantization.
- **Hundreds of thousands of multi-tenant shards** per cluster (lazy loaded).
- **QPS:** scales horizontally with replicas; latencies in the 5–50ms range typical.
- **RAM is the main cost**: HNSW lives in memory. Use BQ/PQ/SQ to compress.

## Performance Characteristics
- **HNSW with default settings** gives ~95–99% recall at single-digit ms latency on millions of vectors per shard.
- **Hybrid (BM25 + vector)** adds slight latency overhead but typically improves search quality significantly.
- **Auto-vectorization** introduces network latency to the embedding service (OpenAI/Cohere) at write time — batch your inserts.
- **Bottlenecks:** memory for HNSW; throughput of external embedding APIs for write-heavy workloads.

## Trade-offs

| Strength | Weakness |
|---|---|
| Built-in vectorizer modules — no client-side embedding code | Adds dependency on external embedding API |
| Hybrid (BM25 + vector) in one engine | Not the fastest pure-vector engine at extreme scale |
| GraphQL API, strong schema model | Steeper learning curve if you're not used to GraphQL |
| First-class multi-tenancy (shard-per-tenant) | Cross-tenant search needs extra plumbing |
| Generative modules embed RAG into the query | Vendor-specific to which LLMs you choose |
| OSS BSD-3 + managed Weaviate Cloud option | Smaller community than Pinecone or Milvus |

## Common HLD Patterns
- **Multi-tenant RAG SaaS:** one tenant per shard; each tenant's docs auto-vectorized via OpenAI module; queries use hybrid + tenant filter.
- **E-commerce semantic search:** product collection with `text2vec-openai` vectorizer; hybrid query combining BM25 (catalog text) + vector (semantic match) + filters (price/category/inventory).
- **Knowledge-base RAG with `generative-*`:** one query end-to-end retrieves + summarizes via the LLM, no separate orchestration code.
- **Hybrid keyword + vector:** Weaviate alone replaces Elasticsearch + a separate vector DB.
- **Recommendation:** "more like this" using `nearObject` querying — Weaviate computes similarity by an existing object's vector.

## Common Pitfalls / Gotchas
- **Vectorizer mismatch:** if you change the vectorizer module after data is loaded, you need to re-vectorize. Old vectors are tied to the old model.
- **Embedding API rate limits / costs** — auto-vectorization is convenient but can blow up cost/latency budgets if not batched.
- **Schema rigidity** — adding/removing properties is fine, but switching property types requires rebuilds.
- **HNSW memory** — at 768 dims × float32 × 100M vectors ≈ 300 GB before quantization. Use BQ/PQ for big collections.
- **Multi-tenant explosion** — millions of tiny tenants are supported but cluster ops get heavy; monitor hot-shard distribution.
- **Replication consistency level** — defaults are usually fine; understand QUORUM vs ONE before tuning.
- **GraphQL learning curve** — for teams new to GraphQL; the REST/gRPC API is also available.

## Interview Cheat Sheet
- **Tagline:** OSS vector + object DB with hybrid search, GraphQL, and pluggable vectorizer modules.
- **Best at:** hybrid search, multi-tenant SaaS, auto-vectorization, RAG with generative modules.
- **Worst at:** extreme scale beyond a few billion vectors; pure ANN-research workloads.
- **Scale:** hundreds of millions of vectors per cluster; hundreds of thousands of tenants.
- **Shard by:** id hash, or one shard per tenant in multi-tenant mode.
- **Consistency:** tunable (ONE / QUORUM / ALL); Raft for cluster metadata.
- **Replicates how:** configurable replication factor per class; data replicated across nodes.
- **Killer alternative:** Pinecone (managed), Milvus (more index types, bigger scale), Qdrant (Rust, sleek API), pgvector (Postgres extension), Elasticsearch/OpenSearch (for keyword-first hybrid).

## Further Reading
- Official docs: <https://weaviate.io/developers/weaviate>
- Hybrid search guide: <https://weaviate.io/developers/weaviate/search/hybrid>
- Multi-tenancy: <https://weaviate.io/developers/weaviate/manage-data/multi-tenancy>
- Modules (vectorizer/generative/reranker): <https://weaviate.io/developers/weaviate/model-providers>
