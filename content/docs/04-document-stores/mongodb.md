---
title: "MongoDB"
description: "MongoDB is the most popular document database: stores JSON-like documents (BSON) in collections, with flexible schemas, rich query language, and built-in horizontal sharding + replica sets. It's the default pick when ..."
---

> Category: Document NoSQL Database · Written in: C++ · License: SSPL (since 2018; not OSI-approved); Atlas managed service most popular

## TL;DR
MongoDB is the **most popular document database**: stores **JSON-like documents (BSON)** in **collections**, with flexible schemas, rich query language, and built-in **horizontal sharding + replica sets**. It's the default pick when your data is naturally hierarchical (user with embedded preferences, product with embedded reviews) and you want SQL-ish ergonomics without the rigidity of tables.

## What problem does it solve?
Relational schemas force you to break a "user with addresses and preferences" into 3 tables and stitch them back with joins. Mongo says: store it as one document. You read/write the whole thing in one operation, you query nested fields directly, and you avoid the schema-migration ceremony of relational DBs. For many app domains, this maps cleanly to how developers think about data.

## When to use
- **Content / catalog / CMS** — products, articles, profiles with varied attributes.
- **Mobile / web app backends** with evolving schemas (no DBA bottleneck).
- **Real-time personalization** — feature documents per user.
- **IoT / event ingestion** with rich payloads.
- **Geospatial** (Mongo has solid 2dsphere geo support).
- **Time-series collections** (Mongo 5+ has a dedicated time-series engine).

## When NOT to use
- **Heavy multi-document ACID across many entities** — supported but slower; relational DBs do this better.
- **Complex multi-table joins / heavy analytics** — use a SQL DB or warehouse.
- **Tiny scale where Postgres JSONB would do** — Postgres covers many "document store" needs without adding a new system.
- **Strong-consistency requirements with internet-scale write throughput** — Cassandra/Spanner cover those edges better.

## Data Model
- **Database** → **Collection** → **Document** (JSON-like).
- Documents are **BSON** (Binary JSON) — supports types like ObjectId, Date, Decimal128, Binary.

```json
// Collection: users
{
  "_id": ObjectId("64..."),
  "email": "alice@example.com",
  "addresses": [
    { "type": "home", "city": "Berlin", "zip": "10115" },
    { "type": "work", "city": "Berlin" }
  ],
  "preferences": { "newsletter": true, "theme": "dark" },
  "tags": ["beta", "premium"]
}
```

### Schema flexibility
- No fixed schema — documents in a collection can differ.
- **Schema validation** (since 3.6) — JSON-Schema-style validators per collection enforce structure when you want it.
- **Atlas Schema Suggestions** / Compass help spot schema drift.

### Embedding vs referencing — the modeling decision
- **Embed** when data is accessed together and 1:few (`addresses` inside `user`).
- **Reference** (store an `ObjectId` and join with `$lookup`) when data is large or many-to-many.
- Mongo can `$lookup` (left-outer-join), but it's not as fast as native joins in SQL — model to avoid heavy lookups.

## Architecture & Internals
- **Storage engine: WiredTiger** (B-Tree on disk; document-level concurrency control).
- **Replica set** = 1 primary + N secondaries (typically 2). Asynchronous oplog replication.
- **Sharded cluster** = many replica sets ("shards") + a router (**mongos**) + a config server replica set.
- Indexes: B-Tree, compound, multikey (for arrays), text, geo, hashed, partial, TTL, wildcard.

```
Client ──► mongos (router) ──► shard 1 (replica set: primary + secondaries)
                            ──► shard 2 (replica set)
                            ──► shard N
                            
Config servers (replica set) — store the cluster metadata
```

## Consistency Model
- **Per-document atomic** writes by default.
- **Multi-document ACID transactions** since 4.0 (replica sets) and 4.2 (sharded clusters). Use sparingly — they're slower and have stricter limits.
- **Read concerns**: `local`, `available`, `majority`, `linearizable`, `snapshot`.
- **Write concerns**: `w: 1`, `w: majority`, `w: <N>`, `w: "tag"` — control how durable a write must be before ack.
- **Read preference**: primary, primaryPreferred, secondary, secondaryPreferred, nearest — controls which member serves reads.

## Replication
- **Replica set** with one primary at a time.
- **Oplog** (operation log) on the primary; secondaries pull and apply.
- **Automatic failover** when primary becomes unreachable: a new primary is elected (Raft-like protocol).
- **Hidden / delayed / arbiter** members for special roles.
- Cross-region: deploy a replica set with members in multiple regions; reads from `nearest`.

## Partitioning / Sharding
**Built-in sharding** via the **mongos** router.

### Shard key (the most consequential decision)
- Rule: high cardinality, low frequency (no value dominates), monotonically NON-increasing, matches common queries.
- Types:
  - **Hashed shard key** — `{ user_id: "hashed" }` distributes evenly; bad for range queries on that field.
  - **Ranged shard key** — `{ created_at: 1 }` great for range queries, terrible if monotonically increasing (hot shard on latest range).
  - **Compound shard key** — `{ region: 1, user_id: "hashed" }` for tenant isolation + spread.

### Hot-shard pitfalls
- **Monotonic ranged key** (`_id` ObjectId, timestamp) → hot shard on the most recent range.
- **Low-cardinality key** (`status`, `country`) → only N shards used at all.
- **Power tenant** → that shard is overloaded.

### Modern Mongo features that help
- **Resharding** (since 5.0) — change the shard key online without downtime.
- **Zoned sharding** — pin certain key ranges to certain shards (geo-residency, tiering).
- **Chunk size** auto-managed; jumbo chunks signal a bad key choice.

## Scale of a Single Instance
| Dimension | Per node (replica) | Sharded cluster | Notes |
|---|---|---|---|
| Data | a few TB | tens of TB+ | working set should fit RAM ideally |
| Document size | up to **16 MB** | — | huge docs go to GridFS or S3 |
| Writes/sec | thousands to tens of K | scales with shards | replica primary handles writes |
| Reads/sec | tens of K with secondaries | scales with shards + replicas | careful with read preferences |
| Index count | dozens | — | each index has cost; avoid excess |
| Connections | thousands w/ pooling | — | use Atlas/MongoDB drivers' pooling |

**When to scale out:**
- Working set blows past RAM, IOPS becomes the bottleneck.
- Single-replica-set write throughput maxed.
- Backup time for a single shard becomes painful.
- Vertical scaling exhausted.

## Performance Characteristics
- ms-level reads/writes when working set in cache.
- B-Tree on WiredTiger has Postgres-like profile: secondary index lookups + heap fetch.
- Bottlenecks: working set vs RAM, replication lag, hot shard, $lookup-heavy queries.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Flexible schema; document-shaped data | License changed to SSPL — not OSI-approved |
| Built-in sharding + replica sets | Multi-doc transactions slower than relational |
| Rich query / aggregation pipeline | Joins via $lookup are slower than native SQL joins |
| Online resharding (5.0+) | Bad shard keys are common pitfalls |
| Strong managed offering (Atlas) | Working set vs RAM matters more than people expect |
| Geo + time-series + text + vector built-in | Some teams over-embed, then can't query effectively |

## Common HLD Patterns
- **Document-per-aggregate** — the entire user / order / product is one document.
- **CDC**: Mongo change streams → Kafka → search index / warehouse.
- **Mongo + ElasticSearch** when you need full-text beyond what `$text` covers.
- **Atlas Search / Vector Search** — full-text + vector built into Atlas (managed).
- **Time-series collections** for IoT / observability with auto-bucketing.
- **Multi-region**: regional Atlas clusters or zoned sharding for data residency.

## Common Pitfalls / Gotchas
- **Bad shard keys** — biggest source of pain. Plan ahead; use resharding if needed.
- **Unbounded array growth** in embedded docs — the document hits 16 MB and writes start failing.
- **Reading from secondaries** without understanding lag → stale reads in unexpected places.
- **Indexes on every field** → slow writes + RAM bloat. Index purposefully.
- **`$where` / JavaScript queries** — slow; avoid.
- **Treating Mongo as a SQL DB** with heavy `$lookup` — performance suffers; remodel to embed or denormalize.
- **Long-running transactions** holding locks → use sparingly.
- **Default write concern** `w: 1` is fine for many cases but doesn't survive primary failure mid-write — use `w: majority` for important writes.

## Interview Cheat Sheet
- **Tagline:** "Document NoSQL — flexible JSON-shaped storage with built-in sharding and replica sets."
- **Best at:** evolving schemas, hierarchical data, content / catalog / mobile backends.
- **Worst at:** heavy multi-table joins, internet-scale strong-consistency writes.
- **Scale of one replica set:** few TB, 10K writes/sec; sharded cluster scales horizontally.
- **Shard by:** hashed or ranged shard key; compound keys for tenant isolation; resharding now online.
- **Consistency:** per-doc atomic; multi-doc ACID since 4.0; configurable read/write concerns.
- **Replicates how:** primary + secondaries via oplog; automatic failover; cross-region via geo-distributed replica set members.
- **Killer alternatives:** Postgres JSONB (smaller scale), Couchbase, DynamoDB (managed), Cassandra (write-scale), Firebase Firestore.

## Further Reading
- Docs: https://www.mongodb.com/docs/
- *MongoDB: The Definitive Guide* — Bradshaw, Brazil, Chodorow.
- MongoDB University free courses: https://learn.mongodb.com/
- Schema design patterns: https://www.mongodb.com/blog/post/building-with-patterns-a-summary