---
title: "Sharding & Partitioning"
description: "How to split a dataset across N machines so one machine never holds it all — range, hash, directory, geographic; choosing the partition key; rebalancing; the hot-shard / hot-key problem; and when NOT to shard."
---

> Topic: Key Concept · Category: Data Distribution · Difficulty: Foundational

## TL;DR
**Sharding (or partitioning)** means splitting a dataset horizontally so each machine holds a subset of rows / keys / documents. It's the answer to **"my single database can no longer hold all the data or serve all the QPS."** Three classic strategies: **range partitioning** (keys sorted; ranges per shard — supports range scans, prone to hot ranges), **hash partitioning** (hash key → shard — even distribution, no range scans), **directory / lookup-based** (a service maps key → shard — flexible, adds a hop). **Geographic / tenant-based** partitioning is a real-world variant. The hard parts are **picking the partition key**, **rebalancing on growth**, **avoiding hot shards / hot keys**, and **handling cross-shard joins / transactions**.

## What problem does it solve?
- **Storage exceeds one machine** — a 100 TB dataset cannot live on one node.
- **QPS exceeds one machine** — even with replication, *writes* go to a single leader; sharding splits the write workload.
- **Tenant isolation** — per-tenant shard limits blast radius.
- **Geographic locality** — EU users on EU shards (data residency + latency).
- **Smaller indexes** — query plans are faster on smaller per-shard indexes.

## How it works (the strategies)

### 1. Range partitioning
Each shard owns a contiguous key range. Sorted; supports range scans. Used by **HBase, Bigtable, Spanner, MongoDB ranged shards, ScyllaDB token ranges**.
- ✅ Range scans are efficient.
- ❌ **Hot range** — sequential keys (timestamps, autoincrement IDs) all land on the latest shard.

### 2. Hash partitioning
`shard = hash(key) mod N` or via [consistent hashing](/docs/41-caching/consistent-hashing). Used by **DynamoDB, Cassandra (default), Riak, Memcached, sharded Redis**.
- ✅ Even distribution by default.
- ❌ No range scans (`SELECT … WHERE created > X` must hit every shard).

### 3. Directory / lookup-based
A coordinator service maps key → shard (e.g., Vitess `keyspace_id`, custom resharder). Used by **Vitess, YouTube's MySQL fleet, Slack, Notion**.
- ✅ Flexible — can rebalance individual keys.
- ❌ The directory is itself a SPOF; needs HA + caching.

### 4. Geographic / tenant
Shard by `region` or `tenant_id`. Used by **multi-tenant SaaS (Salesforce, Workday)**, **GDPR-compliant EU/US splits**.
- ✅ Strong locality + tenant isolation.
- ❌ Imbalance — one giant tenant skews the load.

## Choosing the partition key (the hard part)
- **High cardinality** so keys spread evenly.
- **Low skew** — no value should dominate (avoid `country_code` if 80% of users are US).
- **Co-locates queries** — if you always query by `user_id`, partition by `user_id` so most queries hit one shard.
- **Avoids cross-shard transactions** — group entities that change together (DynamoDB's "single-table design").
- **Stable** — partition key shouldn't change; updates would mean physically moving the row.

Common partition keys:
| Workload | Good partition key |
|---|---|
| User-centric SaaS | `user_id` or `tenant_id` |
| Multi-tenant B2B | `tenant_id` (composite with PK as sort key) |
| Time-series logs / metrics | `(metric, time-bucket)` — never just `time` |
| Social posts | `user_id` or `(user_id, post_id)` |
| Order ledger | `customer_id` |
| IoT devices | `device_id` |

## When to use it (real-world examples)
- **Twitter / Instagram / TikTok** — tweets / posts sharded by `user_id`.
- **WhatsApp** — chats sharded by `chat_id`.
- **Discord** — messages sharded by `(channel_id, time-bucket)` for time-aware queries.
- **YouTube / Vitess** — MySQL sharded by `keyspace_id` derived from `video_id`.
- **DynamoDB** — every table is partitioned by `partition_key`; AWS handles physical sharding.
- **Cassandra / ScyllaDB** — partitioned by `partition_key` (token ring).
- **Stripe** — sharded by `customer_id` for live ledger; analytical replicas separately.
- **Slack** — workspaces sharded by `team_id`.
- **Multi-region SaaS** — region-based sharding for GDPR / data residency.
- **Time-series databases** (InfluxDB, TimescaleDB) — auto-shard by `(metric, time)`.

## When NOT to use it
- **Single machine fits the workload** — sharding adds operational pain; vertical scale or replication first.
- **Heavy cross-shard joins / transactions** — sharding makes them painful or impossible. Consider **denormalization + a single source of truth + CDC** instead.
- **OLAP-heavy workload** — use a columnar warehouse (Snowflake, BigQuery, ClickHouse), not a sharded OLTP DB.
- **Low write QPS** — replication alone may suffice.
- **You haven't picked the partition key yet** — premature sharding is the root of pain.

## Things to consider / Trade-offs
- **Hot shard / hot key** — a single popular key (Beyoncé's tweet) can saturate one shard. Mitigations: **request coalescing**, **L1 cache in front**, **shard-the-hot-key** (write to multiple synthetic keys; aggregate on read), **broadcasting** (replicate hot key to many shards).
- **Resharding** — going from N → 2N shards is a multi-week project at scale. Pre-shard generously (e.g., 1024 logical shards mapped to fewer physical machines; rebalance by moving virtual shards).
- **Cross-shard transactions** — typically avoided. If unavoidable, use 2PC / Paxos / Spanner / saga.
- **Cross-shard queries** — scatter-gather hits every shard; latency = max of shard latencies.
- **Secondary indexes** — local (per-shard, fast write, slow lookup) vs global (synchronous to all shards, fast lookup, slow write).
- **Backup + restore** — must shard-aware; partial restore of one shard is tricky.
- **Schema migration** — must run on every shard; easy to drift.
- **Connection count** — if every app server connects to every shard, total connections explode (use a pooler like PgBouncer / Vitess vtgate).
- **Pre-sharding** — design for many more logical shards than physical machines; map many → 1 today, split later.

## Common pitfalls
- **Choosing autoincrement ID as partition key** with range partitioning — all writes hit the last shard.
- **Re-sharding under load** — without careful migration, double-writes, or shadow reads, you'll lose data.
- **Sharding before profiling** — most "we need sharding" systems are actually fixable with a better schema, indexes, or a read replica.
- **Forgetting the hot key problem** — even hash-partitioning can't help one popular key.
- **Treating each shard as independent** without observability → blind to one shard being overloaded.
- **Schema drift between shards** — drives debugging nightmares; enforce migrations centrally.
- **Cross-shard pagination** — naive `OFFSET / LIMIT` requires fetching `OFFSET + LIMIT` from every shard.

## Interview Cheat Sheet
- **Three strategies:** range, hash, directory.
- **Hash by default** unless you need range scans.
- **Pick the partition key first** — high cardinality, low skew, co-locates queries.
- **Pre-shard** — always have many more logical shards than physical machines.
- **Hot key:** L1 cache + shard-the-hot-key + request coalescing.
- **Cross-shard transactions:** avoid by design; if unavoidable, 2PC / saga.
- **Real systems:** DynamoDB (hash), Cassandra (hash + token ring), Spanner (range), Vitess (directory), HBase (range).

## Related concepts
- [Consistent Hashing](/docs/41-caching/consistent-hashing) — the math behind hash partitioning.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — orthogonal to sharding; usually combined.
- [Saga Pattern](/docs/47-event-driven-architecture/saga-pattern) — distributed transactions across shards / services.
- Concrete systems: [DynamoDB](/docs/02-key-value-stores/dynamodb), [Cassandra](/docs/03-wide-column-stores/cassandra), [Spanner](/docs/01-relational-databases/spanner), [CockroachDB](/docs/01-relational-databases/cockroachdb).
