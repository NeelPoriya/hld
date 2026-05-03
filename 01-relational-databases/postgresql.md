# PostgreSQL

> Category: Relational Database (RDBMS) · Written in: C · License: PostgreSQL License (permissive OSS)

## TL;DR
PostgreSQL ("Postgres") is a battle-tested **open-source relational database** known for correctness, rich SQL features, and extensibility. It's the *default safe choice* for a transactional system that needs ACID guarantees, joins, and a flexible query language. You reach for it whenever you want a "boring, reliable" SQL database that won't surprise you.

## What problem does it solve?
You have data with **relationships** (users have orders, orders have items) and you need:
- Strong consistency (a payment must not be lost or double-counted).
- Flexible queries you didn't know in advance.
- Ad-hoc joins, filters, aggregations.

Before SQL: every team rolled their own file formats and lost data. PostgreSQL gives you a mature engine with **MVCC** (Multi-Version Concurrency Control) so readers don't block writers, plus a query planner smart enough to optimize most queries automatically.

## When to use
- **Transactional / OLTP** apps: e-commerce orders, banking ledgers, SaaS multi-tenant data.
- Workloads under ~**10 TB** that fit on a single beefy server (or a primary + replicas).
- When you need **JOINs** across multiple entities.
- When schema is meaningful and you want the database to enforce it.
- Geo data (PostGIS), JSON columns, full-text search — all built in.
- Analytical queries on moderate-size data (use `EXPLAIN ANALYZE`).

## When NOT to use
- **Internet-scale write throughput** (millions of writes/sec) → use Cassandra / DynamoDB.
- **Petabyte analytics / BI** workloads → use Snowflake / BigQuery / Redshift.
- **Pure cache / sub-ms key lookups** → use Redis.
- **Full-text search at scale with ranking/typo tolerance** → use ElasticSearch (Postgres FTS is OK for moderate scale).
- **Time-series at firehose scale** → use TimescaleDB (a Postgres extension!) or InfluxDB.

## Data Model
**Relational**: data lives in **tables** with **columns of fixed types**, linked by **foreign keys**.

```sql
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id),
    total_cents BIGINT NOT NULL,
    status      TEXT CHECK (status IN ('pending','paid','shipped'))
);
```

Bonus: Postgres also has rich types most people forget about:
- `JSONB` (binary JSON, indexable) — semi-structured data without a separate document store.
- Arrays, ranges, UUIDs, IP types, geometry (with PostGIS), full-text `tsvector`.
- User-defined types and functions in PL/pgSQL, Python, etc.

## Architecture & Internals
Single-process-per-connection model (a `postmaster` spawns one OS process per client). Key pieces:

1. **Storage engine** — heap files of fixed-size pages (default **8 KB**). Tables and indexes are just files on disk.
2. **Indexes** — B-Tree (default), Hash, GIN (great for JSONB / arrays / FTS), GiST (geo / range), BRIN (huge sorted tables), SP-GiST.
3. **WAL (Write-Ahead Log)** — every change is appended to WAL *before* being applied to the data files. This is what makes crash recovery and replication possible.
4. **MVCC** — instead of locking rows, each row has versions tagged with transaction IDs. Readers see a snapshot; writers create new versions. **Old versions accumulate** → `VACUUM` cleans them.
5. **Query planner** — cost-based optimizer that chooses scan/join/sort algorithms.
6. **Buffer pool** — `shared_buffers` (typically 25% of RAM) caches hot pages.

```
Client ──► Backend process ──► Buffer pool ──► WAL (fsync'd) ──► Data files (lazy)
                                              │
                                              └─► Streamed to replicas
```

## Consistency Model
- **ACID** (the gold standard):
  - **A**tomic: all-or-nothing transactions.
  - **C**onsistent: constraints enforced.
  - **I**solated: configurable isolation levels.
  - **D**urable: WAL fsynced to disk.
- Default isolation: **Read Committed**. Available levels:
  - Read Committed (default) → no dirty reads, but non-repeatable reads possible.
  - Repeatable Read → snapshot isolation.
  - Serializable → as if all transactions ran one at a time (uses SSI — Serializable Snapshot Isolation).
- CAP: a single Postgres primary is **CP** — if it's down, you can't write.

**Plain-English example:** Imagine two people booking the last seat on a flight. With Serializable, exactly one will succeed; the other gets a "serialization failure" they can retry. No double-bookings.

## Replication
Postgres is a **single-leader (primary) system** by default.

- **Streaming Replication** — primary streams WAL records to read-replicas in near-real time.
- Modes:
  - **Asynchronous** (default) — fast, but you can lose the last few transactions on primary failure.
  - **Synchronous** — primary waits for replica ack before commit. Safer, slower, and stalls if a sync replica is down.
- **Logical Replication** — replicates row-level changes (not full WAL). Lets you replicate **specific tables** or do cross-version upgrades.
- **Failover** is **not automatic** in vanilla Postgres. Tools: Patroni, repmgr, AWS RDS, pg_auto_failover.

**Read replicas** scale **read** traffic; they do not help with write throughput.

## Partitioning / Sharding
Postgres has **table partitioning** (within one server) and you must do **sharding** manually across servers.

### Table partitioning (built-in, single server)
Split a huge logical table into many physical sub-tables by:
- **Range** (e.g. `created_at` by month) — most common for time-series.
- **List** (e.g. `region IN ('US','EU')`).
- **Hash** (evenly distribute).

Benefit: queries pruning on the partition key skip irrelevant partitions; bulk delete = drop a partition (instant).

### Sharding (across servers)
Postgres has **no built-in sharding**. Options:
- **Citus** (extension) — turns Postgres into a distributed cluster (now Microsoft Azure CosmosDB for Postgres).
- **Application-level sharding** — your code decides "users 0–999 go to shard A, 1000–1999 to shard B".
- **Vitess-for-Postgres**-style proxies — emerging.

### Choosing a shard key (HLD interview gold)
A good shard key:
- Has **high cardinality** (lots of distinct values).
- Has **even access distribution** (no celebrity / hot rows).
- Matches your **most common query filter** so queries hit one shard.

**Bad shard keys & why:**
- `country_code` → "US" gets 50% of traffic = **hot shard**.
- `created_at` → all new writes hit today's shard = **hot shard on writes**.
- `tenant_id` for SaaS → fine if tenants are similar in size; deadly if one tenant is 100x bigger ("noisy neighbor"). Mitigation: **split big tenants across multiple shards**.

**Good shard keys:**
- `user_id` (hashed) for a user-centric app — most queries are "give me X for user 123".

## Scale of a Single Instance
> Rules of thumb. Real numbers depend heavily on hardware, schema, and access pattern.

| Dimension | Comfortable | Stretch (with care) | When to scale out |
|---|---|---|---|
| Dataset size on disk | ~1–2 TB | up to ~10 TB | > 10 TB |
| Rows per table | ~100M – 1B | a few billion (with partitioning) | tens of billions |
| Connections | a few hundred | 1–2K with **PgBouncer** | use a connection pooler before this hurts |
| Writes/sec | a few thousand | ~10K–50K (with batching, fast disks) | > 50K writes/sec sustained |
| Reads/sec | tens of thousands | 100K+ with replicas + cache | when replicas can't keep up |

**When to shard?**
- Working set no longer fits in RAM and IOPS becomes the bottleneck.
- Single-node write throughput is exhausted.
- Backup / restore time becomes operationally painful (> several hours).
- Vacuum / index maintenance windows hurt latency SLOs.

**Before sharding, try in this order:**
1. Add an index / fix a query.
2. Add read replicas + cache (Redis) in front.
3. Vertical scale (bigger box / faster NVMe).
4. Table partitioning by date.
5. Move cold data to object storage.
6. *Then* shard.

## Performance Characteristics
- Index lookup latency: sub-millisecond when buffer-cache hit, a few ms on cold disk.
- Sequential scan of 100M rows on NVMe: tens of seconds.
- Bottlenecks usually:
  - **Disk IOPS** for OLTP write-heavy workloads.
  - **WAL fsync latency** — put WAL on fast disk.
  - **Connection overhead** — always front it with PgBouncer at scale.
  - **VACUUM** falling behind → bloat, slow queries.
  - **Lock contention** on hot rows.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Mature, correct, ACID | Single primary = write bottleneck |
| Rich SQL, joins, window functions | Sharding is a DIY exercise |
| Extensible (PostGIS, TimescaleDB, pgvector, Citus) | MVCC bloat → must tune VACUUM |
| Strong type system + JSONB | Connection-per-process model — needs PgBouncer |
| Excellent ecosystem & tooling | Failover not automatic OOTB |

## Common HLD Patterns
- **Source-of-truth OLTP store.** Other systems (search index, cache, analytics warehouse) are *derived* from Postgres via CDC (Debezium → Kafka).
- **Postgres + Redis cache** — Redis stores hot reads; Postgres is the durable source.
- **Postgres + ElasticSearch** — Postgres owns the writes; CDC pipelines push to ES for search.
- **Postgres + Kafka (CDC)** — emit row changes as events to power downstream services.
- **Postgres for metadata, S3 for blobs** — never put 50 MB images in a row; store in S3, keep the URL in Postgres.
- **Read-replica fan-out** for read-heavy products with stale-OK queries (analytics dashboards, recommendations).

## Common Pitfalls / Gotchas
- **`SELECT *` everywhere** in code → wide rows + cache pressure.
- **Long-running transactions** block VACUUM and bloat tables.
- **No connection pooler** → you exhaust `max_connections` at modest scale.
- **`ORDER BY ... LIMIT` with offset 100000** → use **keyset pagination** (`WHERE id > last_seen_id`).
- **Using `SERIAL`/`BIGSERIAL` as a shard key** → hot insert page on the latest values.
- **Forgetting `EXPLAIN ANALYZE`** before declaring a query "slow database".
- **Storing JSONB and querying it like a document DB** is fine — until you need 5 indexes on nested fields. Then re-normalize.
- **Failover surprises**: async replicas can be **behind**. Don't read your own writes from a replica without thinking.

## Interview Cheat Sheet
- **Tagline:** "The default ACID SQL database; safe and boring in the best way."
- **Best at:** transactional workloads, complex queries, joins, mixed workloads up to ~10 TB.
- **Worst at:** internet-scale write throughput; petabyte analytics; full-text search at Google scale.
- **Scale of one node:** ~1–10 TB, ~100M–few B rows, tens of K reads/sec, low tens of K writes/sec.
- **Shard by:** application-level (e.g. by `user_id` hash) or via Citus. No native sharding.
- **Consistency:** ACID, MVCC, default Read Committed; Serializable available.
- **Replicates how:** WAL streaming (sync or async) to read replicas; failover via external tooling.
- **Killer alternatives:** MySQL (similar), Aurora (managed + decoupled storage), CockroachDB / Spanner (horizontal SQL), Cassandra/DynamoDB (give up SQL for write scale).

## Further Reading
- Official docs: https://www.postgresql.org/docs/
- "Use The Index, Luke" — https://use-the-index-luke.com/
- *Designing Data-Intensive Applications* — Martin Kleppmann (chapters on storage engines, replication, partitioning).
- Citus internals: https://docs.citusdata.com/
