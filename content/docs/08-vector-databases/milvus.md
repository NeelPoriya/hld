---
title: "Milvus"
description: "Milvus is the most popular open-source, distributed vector database. Cloud-native, supports multiple ANN indexes (HNSW, IVF, DiskANN, GPU), and scales to billions of vectors."
---

> Category: Open-Source Distributed Vector Database · Written in: Go (control plane) / C++ (search engine) · License: Apache 2.0 · LF AI & Data Foundation Graduated Project

## TL;DR
Milvus is the **most-deployed open-source vector database**. It's cloud-native and distributed by design — control plane in Go, query engine in C++, storage in object storage (S3 / MinIO / GCS), metadata in etcd, and a Pulsar/Kafka-backed log for replication. It supports **many ANN index types** (HNSW, IVF_FLAT, IVF_PQ, DiskANN, GPU indices via NVIDIA RAFT), giving you knobs that managed offerings hide. Reach for Milvus when you need **self-hosted, billion-scale vector search** and you're comfortable running a real distributed system. For a fully-managed flavor, **Zilliz Cloud** is the official hosted Milvus.

## What problem does it solve?
Vector similarity search at production scale needs:
- **Hundreds of millions to billions** of vectors (RAG over massive corpora, web-scale recommendation).
- **Tunable index types** for the storage / latency / recall trade-offs you need.
- **Self-hosting / data sovereignty** — keep data on your own infra.
- **Distributed query + storage** — scale compute and storage independently.

Milvus is the leading open-source answer. Pinecone abstracts the engine; Milvus exposes it. You pick HNSW (low latency, high RAM), IVF (smaller RAM, slightly slower), DiskANN (huge scale on disk), or GPU indexes (extreme throughput) per collection.

## When to use
- **Self-hosted vector search** at significant scale (10M+ vectors).
- **Cost-sensitive** large-scale workloads where managed services get expensive.
- **You need control of the ANN index type** — different collections may want different trade-offs.
- **Hybrid search** — dense vectors + sparse vectors + scalar filters.
- **Multimodal search** — image embeddings + text embeddings + audio embeddings in one place.
- **You want OSS but production-grade** — Apache 2.0, CNCF-sandbox / LF AI graduated.

## When NOT to use
- **Tiny scale** — for under a million vectors, **pgvector** or **Chroma** is much simpler.
- **You don't want to operate a distributed system** — Milvus has many components (etcd, message broker, object store, multiple node types). Consider Zilliz Cloud for managed.
- **Single-node simplicity needed** — there is **Milvus Standalone** mode (a single-binary version with embedded RocksMQ), but it's not what Milvus is best at.
- **Strong relational + vector hybrid** — Postgres + pgvector or Weaviate may fit better.

## Data Model
- **Collection** — like a table; has a schema with primary-key field, one or more vector fields, and scalar fields (filterable metadata).
- **Partition** — a logical sub-division of a collection; useful for tenant isolation or time-based partitions.
- **Index** — defined per vector field, with a chosen type (HNSW / IVF_FLAT / IVF_PQ / DISKANN / GPU_*) and metric (L2 / IP / COSINE).
- **Schema-first** — you define fields and indices upfront.

```python
from pymilvus import MilvusClient, DataType

client = MilvusClient(uri="http://localhost:19530")

schema = client.create_schema()
schema.add_field("id", DataType.INT64, is_primary=True)
schema.add_field("embedding", DataType.FLOAT_VECTOR, dim=768)
schema.add_field("category", DataType.VARCHAR, max_length=64)

client.create_collection(collection_name="docs", schema=schema)
client.create_index(
    collection_name="docs",
    index_params=[{"field_name": "embedding", "index_type": "HNSW",
                   "metric_type": "COSINE", "params": {"M": 16, "efConstruction": 200}}]
)
```

Search:
```python
client.search(
    collection_name="docs",
    data=[query_vector],
    limit=5,
    filter='category == "support"',
    output_fields=["id", "category"]
)
```

## Architecture & Internals
Milvus separates **compute and storage** with multiple node types:

- **Coordinators** — root, data, query, index coordinators (control plane, in Go).
- **Workers** — data nodes, query nodes, index nodes (data plane).
- **Proxy** — frontend that routes client requests.
- **etcd** — stores metadata (schemas, indexes, segment locations).
- **Object storage** — S3 / MinIO / GCS holds segment data and indexes (durable storage).
- **Message queue** — Pulsar (or Kafka, or RocksMQ in Standalone) is the WAL / log backbone for replication and incremental updates.

Writes flow: proxy → message queue → data nodes (build segments) → object storage. Index nodes build ANN indexes from sealed segments. Query nodes load segments + indexes and answer search requests.

This decoupling is what lets Milvus scale storage and query independently — and why it's not "just a binary" to deploy.

## Consistency Model
- **Tunable consistency level**: `Strong`, `Bounded` (default), `Session`, `Eventually`.
  - **Strong** — read sees all writes acknowledged before the read.
  - **Bounded** (default) — read may miss the most recent writes, bounded by a staleness window.
  - **Eventually** — fastest reads, may miss recent writes.
- **Per-row atomic upserts**, no multi-row transactions.

## Replication
- The **message queue (Pulsar/Kafka)** is the source of truth for the write path; it's durably replicated by the broker.
- **Segments on object storage** are durably replicated by S3 / MinIO clustering / GCS.
- **Query nodes can be replicated** — the same segment can be loaded on multiple query nodes for HA + throughput.
- **Cross-region** replication is not built-in; you'd run multiple clusters and replicate via app-layer or message-bus tooling.

## Partitioning / Sharding
- **Sharding by vector id** — collections are split into shards on insert; each shard's writes flow through its own message-queue channel.
- **Partitions** — user-defined logical buckets within a collection (often per-tenant or time-bucketed).
- **Segments** — internal physical chunks built up from inserts and sealed at size/time thresholds.

**Hot-shard pitfall:** if your `id` distribution is skewed (e.g. monotonically increasing IDs hashed onto few shards), you can hot-spot. Default hashing is fine in most cases; just don't override it carelessly. Tenant-per-partition + global tenant filtering is a clean pattern.

## Scale of a Cluster
- **Billions of vectors** demonstrated in production at companies like Shopify, Walmart, Uber.
- **Hundreds of QPS** per query node; scales linearly by adding query nodes.
- **GPU index** (RAFT-based) gives 10–50× throughput on supported hardware.
- **DiskANN** lets you scale to billions of vectors with a small RAM footprint by keeping the graph on NVMe.

## Performance Characteristics
- **HNSW (in-memory):** ~1–5ms per query at 95–99% recall on millions of vectors.
- **IVF_PQ (compressed):** higher latency (5–20ms) but ~10× less RAM.
- **DiskANN:** 10–50ms p99 on billions of vectors with NVMe SSDs.
- **GPU indices:** thousands of QPS per GPU.
- **Bottlenecks:** message queue throughput at very high write rates; query node memory at billions of vectors with HNSW.

## Trade-offs

| Strength | Weakness |
|---|---|
| OSS Apache 2.0, no vendor lock-in | Many components to operate (etcd, Pulsar, MinIO, multiple node types) |
| Many index types (HNSW, IVF, DiskANN, GPU) — tuneable | More expert knowledge needed than managed services |
| Scales to billions of vectors | Cross-region HA is your problem |
| Hybrid (dense + sparse + scalar) search | Schema-first; not as flexible as Weaviate's modular approach |
| Strong ecosystem (Attu UI, LangChain integration) | Smaller community than the database giants |
| Zilliz Cloud for managed option | Steeper learning curve than Pinecone or Chroma |

## Common HLD Patterns
- **RAG over massive corpus** — chunk → embed → bulk insert into Milvus → query with metadata filter for tenant + access control.
- **Multimodal search** — separate collections for text / image / audio embeddings, joined at the application layer.
- **Recommendation at web scale** — user embeddings vs item embeddings in Milvus; rerank top-K with business rules in app code.
- **Cost-tiered storage** — recent partitions on HNSW (in RAM); older on DiskANN (on disk) — same collection, different segments.
- **Hybrid retrieval** — Milvus for dense vectors + Elasticsearch/OpenSearch for keyword + reranker model on top.

## Common Pitfalls / Gotchas
- **Index loading** — sealed segments must be `loaded` into query node RAM before serving; forgetting this gives empty/slow results.
- **Choosing wrong index type** — HNSW eats RAM; IVF_PQ trades recall for compression; DiskANN needs NVMe; pick deliberately.
- **Misconfigured `efSearch` (HNSW) or `nprobe` (IVF)** — too low → poor recall; too high → slow queries.
- **Schema changes** — limited; plan for collection re-creation when changing major fields.
- **Object store + queue ops** — durability of your message queue (Pulsar/Kafka) and object storage is now part of your DB SLA.
- **Time travel / TTL** — no native row TTL; bake age into a metadata field and prune via partitions.
- **Standalone mode for prod** — fine for small workloads; use the cluster mode for serious scale.

## Interview Cheat Sheet
- **Tagline:** Open-source, distributed, cloud-native vector DB scaling to billions of vectors.
- **Best at:** self-hosted billion-scale vector search; tunable ANN index types; hybrid retrieval.
- **Worst at:** zero-ops simplicity, tiny-scale projects, single-binary feel.
- **Scale:** billions of vectors, hundreds of QPS per query node.
- **Shard by:** vector id hash (auto); partitions for tenants/time buckets.
- **Consistency:** tunable — Strong / Bounded / Session / Eventually.
- **Replicates how:** message queue + object storage + replicated query nodes.
- **Killer alternative:** Pinecone (managed), Weaviate (modular OSS), Qdrant (Rust OSS), pgvector (Postgres extension), Vespa (search + ML at scale).

## Further Reading
- Official docs: <https://milvus.io/docs>
- Architecture deep dive: <https://milvus.io/docs/architecture_overview.md>
- Index types compared: <https://milvus.io/docs/index.md>
- Zilliz Cloud (managed Milvus): <https://zilliz.com/cloud>
