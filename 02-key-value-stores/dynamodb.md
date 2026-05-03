# Amazon DynamoDB

> Category: Managed NoSQL Key-Value / Wide-Column · Cloud: AWS · License: Proprietary (managed service)

## TL;DR
DynamoDB is **AWS's fully-managed NoSQL database** designed for **predictable single-digit millisecond latency at any scale**. You hand AWS your access pattern; they handle sharding, replication, failover, and capacity. It's the go-to NoSQL store on AWS for high-throughput, simple-access workloads — shopping carts, user profiles, IoT, gaming.

## What problem does it solve?
You want a key-value/document store that:
- Doesn't require you to run servers, plan capacity, or manage replicas.
- Scales **horizontally** to millions of ops/sec without a redesign.
- Has predictable latency under load (no slow query surprises like SQL).

DynamoDB is the production-grade descendant of the **Dynamo paper (2007)** that pioneered consistent hashing + leaderless replication ideas, polished into a managed product.

## When to use
- Workloads with **known access patterns** (you know exactly the keys you'll query by).
- High-throughput, low-latency apps: shopping carts, ad-serving, user profiles, gaming sessions, leaderboards (with care), IoT telemetry.
- "Internet-scale" apps that may go from 1 RPS to 1M RPS overnight (Black Friday, viral launch).
- Serverless stacks (Lambda + API Gateway + DynamoDB is a common combo).
- Multi-region active-active with **Global Tables**.

## When NOT to use
- **Ad-hoc queries / analytics / joins** — DynamoDB is *not* a SQL database. Use Athena/Snowflake/Redshift on data exported via DynamoDB Streams or S3.
- **Unknown access patterns** during design phase — you must pre-design indexes for every query shape.
- **Large items** (> 400 KB per item) — store the body in S3, keep the pointer in DynamoDB.
- **Complex transactions across many entities** — supported but limited (max 100 items in a transaction).
- **Cost-sensitive heavy-read workloads** — at huge scale, RDS or self-managed Cassandra can be cheaper if you have the ops talent.

## Data Model
DynamoDB stores **items** (rows) in **tables**. An item is a JSON-like map of attributes.

Every table has a **primary key**, which is one of:
- **Partition key only** (a.k.a. "hash key") — must be unique. Example: `user_id`.
- **Composite key**: **Partition key + Sort key** (a.k.a. "range key"). Items with the same partition key are stored together, sorted by the sort key.

```
Table: Orders
PK = customer_id (Partition key)
SK = order_id    (Sort key, e.g. ULID for time-sortable)

{ customer_id: "C123", order_id: "01HXYZ...", total: 4999, status: "paid" }
{ customer_id: "C123", order_id: "01HXY0...", total: 1200, status: "shipped" }
```

**Query** (efficient): "give me all orders for customer `C123`, latest first" → one partition, sorted by SK.
**Scan** (avoid): scans the whole table.

### Single-Table Design (idiomatic DynamoDB)
Rather than one table per entity (relational thinking), advanced DynamoDB users store **multiple entity types** in **one table** with carefully constructed PK/SK strings:

```
PK              SK              attributes
USER#123        PROFILE         name, email
USER#123        ORDER#01HXYZ    total, status
ORDER#01HXYZ    ITEM#sku-7      qty, price
```

This lets a single `Query` fetch a user *and* their orders in one round trip. It's powerful but unforgiving — bad PK/SK design is hard to fix.

### Indexes
- **Local Secondary Index (LSI)** — same PK as base table, different SK. Created at table creation, max 5.
- **Global Secondary Index (GSI)** — completely different PK + SK, eventually consistent, can be added/removed anytime. Max 20.

## Architecture & Internals
- Underneath: items are split across **partitions** (~10 GB and ~3,000 RCU / 1,000 WCU each).
- Each partition is replicated **3 times** across AZs in a region using a Paxos-like protocol for the leader.
- **Consistent hashing** of the partition key decides which partition.
- Storage on SSD; uses **B-Tree-like** structures internally.
- Heavily abstracted — you don't see partitions, you just see capacity.

```
Client → DDB Frontend (request router) → Storage node (leader of partition)
                                          ├── Replica AZ-2
                                          └── Replica AZ-3
```

## Consistency Model
- **Eventually consistent reads** (default) — cheaper, lower latency, may return slightly stale data (typically < 1 second behind).
- **Strongly consistent reads** — opt-in with a flag, costs 2× RCU, slightly higher latency, no GSI support.
- **ACID transactions** via `TransactWriteItems` / `TransactGetItems` — up to 100 items, costs 2× capacity. Cross-table is allowed.
- **Conditional writes** (`ConditionExpression`) — optimistic concurrency control: "write only if version = 7".

CAP positioning: regional table = **CP-leaning with strong reads** / **AP with eventual reads**. Global Tables = AP (last-writer-wins).

## Replication
- **Within a region:** synchronous 3× replication across AZs is automatic. Always on.
- **Across regions: Global Tables** — multi-region, **active-active**. All replicas are writeable.
  - Conflict resolution: **last-writer-wins** (per attribute) using timestamps.
  - Replication lag: typically < 1 second between regions.
  - Beware: Global Tables make strong consistency impossible across regions.
- **DynamoDB Streams** — change-data-capture log of all writes (24-hour retention). Powers triggers (Lambda) and downstream pipelines (search index, analytics).

## Partitioning / Sharding
This is the heart of DynamoDB and **the #1 thing you must know in interviews**.

### How partitioning works
- Each table is split into invisible **partitions**.
- Partition for an item = `hash(partition_key) → partition`.
- Each partition has a soft cap of **3,000 RCU** (read capacity units) and **1,000 WCU** (write capacity units), and ~10 GB.
- Capacity is distributed evenly across all partitions (since 2018, with **adaptive capacity** rebalancing hot partitions automatically — but it has limits).

### Choosing a partition key (the most important decision)
A great PK has:
- **High cardinality** — millions of distinct values.
- **Even access** — no key gets more traffic than the others.

### Hot partition (the classic interview gotcha)
If too many requests target the same PK, that partition saturates and you get **throttling** (`ProvisionedThroughputExceededException`), even if your *table-level* capacity is fine.

**Bad PKs and fixes:**

| Bad PK | Why it's bad | Fix |
|---|---|---|
| `status` (`pending`, `paid`, `shipped`) | only ~5 values, tiny cardinality | use `customer_id` and put status in SK or GSI |
| `today_date` for event logs | every write today hits one partition | prefix with a random shard: `2026-05-03#<0..9>` (a.k.a. **write sharding**) |
| `country` | "US" is 50% of traffic | composite: `country#user_id` |
| `tenant_id` for SaaS | giant tenants dominate | hash-prefix big tenants across N synthetic shards |

### Read-side hot key (e.g. viral celebrity profile)
- Cache in front (DAX or app cache).
- Pre-aggregate counters (don't read+write a single hot item per event; use sharded counters and sum).

## Scale of a Single Instance
DynamoDB has **no single instance** — that's the whole point. Capacity is essentially limitless **per table**, but you must design within partition limits.

| Limit | Value | Why it matters |
|---|---|---|
| Item size | **400 KB** | put big blobs in S3, store the URL |
| Partition throughput | **3,000 RCU / 1,000 WCU** | hot partition cliff |
| Partition size | ~10 GB | exceeding splits the partition |
| Transaction items | 100 items, 4 MB | watch for `TransactionCanceledException` |
| Query result | 1 MB per page | paginate with `LastEvaluatedKey` |
| GSIs per table | 20 | each is a separate write amplifier |
| LSIs per table | 5 | only at table creation |
| Tables per region per account | 2,500 (soft) | rarely a problem |

**Capacity modes:**
- **Provisioned** — you set RCU/WCU; cheaper at steady-state; throttles on spikes (combine with auto-scaling).
- **On-Demand** — pay-per-request; great for spiky/unknown workloads; ~7× more expensive per request than Provisioned at steady-state.

> **RCU/WCU rules of thumb:**
> - 1 RCU = 1 strongly-consistent read of a 4 KB item per second (or 2 eventually-consistent).
> - 1 WCU = 1 write of a 1 KB item per second.
> - Transactions cost 2×.

## Performance Characteristics
- **Latency:** single-digit ms reads/writes; with **DAX** (in-memory cache), microseconds for reads.
- **Throughput:** unbounded with proper PK design — Amazon Prime Day is run on DynamoDB.
- **Bottlenecks:** hot partitions, large items, oversized transactions, cold-start auto-scaling lag.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Fully managed; no ops | Vendor lock-in (AWS-only) |
| Horizontal scale by default | Query model is rigid; need to plan PK/SK |
| Predictable latency at any scale | No SQL, no joins, no ad-hoc queries |
| Multi-region active-active (Global Tables) | Can be expensive at very high read scale |
| Streams enable rich event-driven designs | 400 KB item cap; transactions limited to 100 items |
| ACID transactions available | LWW conflict resolution can lose data in Global Tables |

## Common HLD Patterns
- **DynamoDB + S3** for blobs: metadata in DDB, files in S3.
- **DynamoDB + ElasticSearch** for search: stream change events from DDB Streams to ES via Lambda.
- **DynamoDB + DAX** for read-heavy workloads needing microsecond reads.
- **DynamoDB + Lambda** event-driven: stream triggers Lambda for fan-out.
- **Single-table design** for entity-rich domains (orders, users, products together).
- **Sharded counters** for hot increments — write to `counter#1..N`, sum on read.
- **Time-bucketed tables** for TTL'd data (per-day tables) when you want clean drops.
- **Global Tables** for multi-region active-active reads with regional writes.

## Common Pitfalls / Gotchas
- Using `Scan` in production. **Always Query**, never Scan, except for offline jobs.
- Designing schema before listing **every access pattern** you'll need.
- Hot partitions caused by `created_at` or sequential IDs as PK.
- Forgetting that **GSI writes also consume WCU** on the GSI — every base write fans out.
- Hitting the **400 KB item limit** with growing arrays/maps.
- Strong consistency on a **GSI** — not supported.
- Assuming **Global Tables** are strongly consistent across regions — they're not.
- Underestimating cost: on-demand × billions of requests × multiple GSIs adds up fast.

## Interview Cheat Sheet
- **Tagline:** "AWS's fully-managed NoSQL with single-digit-ms latency at any scale, if you design the keys right."
- **Best at:** known-access-pattern, high-throughput KV/document workloads on AWS.
- **Worst at:** ad-hoc queries, analytics, joins, large items.
- **Scale of one partition:** 3K RCU / 1K WCU / 10 GB — hot partition is the failure mode.
- **Shard by:** partition key (high cardinality, even access). Use write-sharding to avoid hot keys.
- **Consistency:** eventual by default; strong reads opt-in; ACID transactions up to 100 items.
- **Replicates how:** 3× synchronous within region; Global Tables = async LWW across regions.
- **Killer alternatives:** Cassandra/ScyllaDB (self-managed, multi-cloud), Cosmos DB (Azure equivalent), MongoDB Atlas, Bigtable (GCP).

## Further Reading
- Official docs: https://docs.aws.amazon.com/dynamodb/
- *The DynamoDB Book* — Alex DeBrie (gold standard for single-table design).
- AWS re:Invent talks: "Amazon DynamoDB Deep Dive" (search by year).
- Original Dynamo paper (2007): https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf
