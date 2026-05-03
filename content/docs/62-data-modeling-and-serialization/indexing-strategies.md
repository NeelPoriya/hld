---
title: "Database Indexing Strategies"
description: "B-tree, hash, GIN, GiST, BRIN, covering, partial, expression — the index types in modern databases. Which to use for what query, what each costs at write time, and the unsung hero of every fast database."
---

> Topic: Key Concept · Category: Data Modeling & Serialization · Difficulty: Intermediate

## TL;DR
**Indexes are pre-computed lookup structures that trade write cost for read speed.** Modern databases offer several types beyond the default B-tree:
- **B-tree (B+-tree)** — default; great for equality + range + sort. 99% of indexes.
- **Hash** — equality only; faster than B-tree for `=`; can't do range or sort.
- **GIN (Generalized Inverted Index)** — full-text search, JSONB, arrays.
- **GiST (Generalized Search Tree)** — geometric / spatial / fuzzy search.
- **BRIN (Block Range Index)** — huge tables with naturally-correlated columns (timestamps, sequence IDs); tiny + fast.
- **Covering index** — includes non-key columns; query satisfied entirely from index.
- **Partial index** — only rows matching a predicate (`WHERE deleted_at IS NULL`).
- **Expression index** — indexes a function (`LOWER(email)`).

The deeper truth: **every index slows down writes** (insert, update, delete must update each index). Use indexes deliberately; profile before adding; drop unused.

## What problem do indexes solve?
- **Find one row in a million** — without index, full table scan; with index, log(N) lookups.
- **Range queries** — `WHERE created > X AND created < Y`.
- **Sorting** — pre-sorted index avoids sort step.
- **JOIN performance** — indexed FK column.
- **GROUP BY / aggregation** — partly indexable.
- **Uniqueness enforcement** — unique index + constraint.

## Index types in detail

### B-tree (B+ tree)
- **Default for almost everything.**
- Sorted; supports equality + range + ORDER BY + LIKE prefix.
- Logarithmic lookup time.
- Used by: Postgres, MySQL InnoDB, Oracle, SQL Server, MongoDB, SQLite.

```sql
CREATE INDEX idx_users_email ON users (email);
-- supports: WHERE email = ?, WHERE email LIKE 'a%', ORDER BY email
```

### Hash
- Equality lookups only.
- O(1) expected.
- Postgres has hash indexes (now WAL-logged + crash-safe since v10).
- MySQL InnoDB has adaptive hash (built automatically over B-tree).

```sql
CREATE INDEX idx_users_email_hash ON users USING hash (email);
-- only: WHERE email = ?
```

### GIN (Generalized Inverted Index)
- Maps each "element" (word, JSONB key, array value) → list of row IDs.
- **Full-text search** in Postgres.
- **JSONB** field queries (`@>`, `?`, `?|`).
- **Array** containment.

```sql
CREATE INDEX idx_doc_search ON documents USING gin (to_tsvector('english', body));
-- WHERE body @@ to_tsquery('search & terms')

CREATE INDEX idx_orders_meta ON orders USING gin (metadata);  -- jsonb
-- WHERE metadata @> '{"priority": "high"}'

CREATE INDEX idx_post_tags ON posts USING gin (tags);          -- text[]
-- WHERE tags @> ARRAY['postgres']
```

### GiST (Generalized Search Tree)
- Geometric / spatial / nearest-neighbor / fuzzy.
- PostGIS uses GiST extensively.
- Custom operator classes per data type.

```sql
CREATE INDEX idx_locations_geom ON locations USING gist (geom);
-- WHERE ST_DWithin(geom, ST_MakePoint(-73.9, 40.7), 1000)

CREATE INDEX idx_users_name_trgm ON users USING gist (name gist_trgm_ops);
-- WHERE name % 'jonh'  -- fuzzy similarity
```

### BRIN (Block Range Index)
- Stores per-page-range summary (min, max, count).
- **Very small** — 0.1% of table size.
- **Only useful when column is correlated with physical order** — timestamp on append-only log table.
- Lossy; fast scans of huge tables.

```sql
CREATE INDEX idx_logs_ts_brin ON logs USING brin (ts);
-- 1TB table → 100MB index; queries on ts range fast.
```

### Covering index (INCLUDE)
- Index includes extra non-key columns; query satisfied without table lookup.

```sql
CREATE INDEX idx_users_email_inc ON users (email) INCLUDE (full_name, status);
-- SELECT email, full_name, status FROM users WHERE email = ?
-- Index-only scan (Postgres); no heap fetch.
```

### Partial index
- Only indexes rows matching predicate.
- Smaller; faster.

```sql
CREATE INDEX idx_orders_open ON orders (created_at) WHERE status = 'open';
-- Used when query has matching predicate: WHERE status = 'open' ORDER BY created_at
```

### Expression / functional index
- Index a transformed value.

```sql
CREATE INDEX idx_users_lower_email ON users (LOWER(email));
-- WHERE LOWER(email) = LOWER(?)

CREATE INDEX idx_orders_year ON orders (DATE_TRUNC('year', created_at));
-- WHERE DATE_TRUNC('year', created_at) = '2024-01-01'
```

### Composite (multi-column)
- Index on multiple columns; order matters.

```sql
CREATE INDEX idx_orders_user_date ON orders (user_id, created_at);
-- Supports: WHERE user_id = ? AND created_at > ?
-- Supports: WHERE user_id = ? ORDER BY created_at
-- Does NOT support: WHERE created_at > ? alone (left-prefix rule)
```

### Unique index
- Enforces uniqueness + speeds equality lookup.

```sql
CREATE UNIQUE INDEX idx_users_email_unique ON users (email);
-- + insert with duplicate email → constraint violation
```

## When to use each (real-world examples)

### B-tree
- **PK / FK columns.**
- **Frequently filtered / sorted columns.**
- **Default unless specific reason.**

### Hash
- **Pure equality lookups on hot keys.**
- **Postgres v10+** has WAL-logged hash; safe to use.
- **Rarely worth it over B-tree** in practice.

### GIN
- **Full-text search** (`tsvector`).
- **JSONB queries** at scale.
- **Array containment** searches (tag systems).

### GiST
- **Geographic queries** with PostGIS — most common use.
- **Range types** (`tstzrange` overlap).
- **Fuzzy matching** with pg_trgm.

### BRIN
- **Huge time-series / append-only tables.**
- **Logs, metrics, audit trails** — naturally sorted by insertion time.
- **Tiny index, scan-friendly queries.**

### Covering
- **Hot read paths** — avoid heap fetch.
- **Reports** that select few specific columns.

### Partial
- **Soft-deleted rows** — index only `WHERE deleted_at IS NULL`.
- **Status-filtered queries** — `WHERE status = 'active'`.
- **Time-filtered** — `WHERE created_at > '2024-01-01'`.

### Expression
- **Case-insensitive search** — `LOWER(email)`.
- **Computed values** — `EXTRACT(YEAR FROM ts)`.
- **Hashed lookups** — `MD5(token)`.

### Composite
- **Multi-condition WHERE / ORDER BY** with consistent prefix.
- **Foreign key + sort** combos: `(tenant_id, created_at DESC)`.

## Things to consider / Trade-offs

### Write cost
- **Every index updates on every INSERT / UPDATE / DELETE** to a covered column.
- **Hot tables with 10 indexes** → write throughput ÷ ~5-10.
- **Bulk loads** — DROP indexes, load, re-CREATE; faster than maintaining.

### Storage
- **B-tree** — 5-30% of table size typical.
- **GIN** can be larger than data for JSONB.
- **BRIN** — < 1% of table; tiny.

### Selectivity
- **Index helps when query returns < ~10% of rows** — beyond that, sequential scan is faster.
- **Indexes on low-cardinality columns** (e.g., `gender`, `status`) often unused; partial index instead.

### Order in composite index
- **Left-most prefix rule** — `(a, b, c)` supports queries on `a`, `(a, b)`, `(a, b, c)`; NOT on `b` or `(b, c)`.
- **Order by selectivity** for equality columns; sort columns last.
- **(equality_cols, range_col, sort_col)** is a common shape.

### MVCC bloat
- Indexes also bloat under [MVCC](/docs/53-transactions-and-concurrency/mvcc-and-locking) — old versions accumulate.
- `REINDEX` periodically; `pg_repack` for online.

### Index-only scan (Postgres)
- Requires:
  - All requested columns in the index (covering).
  - Visibility map up-to-date (autovacuum).
- 10-100x speedup vs heap fetch.

### Multicolumn vs separate indexes
- **One composite (`a`, `b`)** — best when both filtered together.
- **Two separate indexes** — Postgres can bitmap-AND them; flexible but slower.

### Specialized
- **PostgreSQL hypertables** (TimescaleDB) — implicit time-based partitioning.
- **Cassandra clustering keys** — physical sort within partition.
- **MongoDB compound indexes** — same left-prefix rule.

### Maintenance
- **Unused indexes** waste space + slow writes; drop them.
- **`pg_stat_user_indexes`** → identify low-use indexes.
- **CREATE INDEX CONCURRENTLY** — avoid table lock.

## Common pitfalls
- **Indexing every column "just in case"** — write throughput collapse.
- **Wrong column order in composite** — index unused.
- **Functional vs raw column mismatch** — `WHERE LOWER(email) = ?` won't use index on `email`.
- **Implicit casts disabling index** — `WHERE varchar_col = 42` may scan.
- **OR clauses across columns** without union of indexes — full scan.
- **Skewed data** — index on `gender` with 99% same value; useless.
- **Forgetting partial index predicate match** — query without matching `WHERE` won't use it.
- **Not reindexing** after schema migration / heavy updates → bloated index.
- **Lock during CREATE INDEX** without `CONCURRENTLY` — production stall.
- **GIN on rarely-queried JSONB** — large overhead.
- **BRIN on uncorrelated column** — useless.
- **Adaptive hash in MySQL** — sometimes makes things slower; check `innodb_adaptive_hash_index`.
- **Unique index on a column with frequent UPDATE** — every update writes the index.
- **Treating index as a substitute for query rewriting** — better SQL beats index sometimes.
- **No `EXPLAIN`** — flying blind.

## Interview Cheat Sheet
- **Default = B-tree.** Almost always.
- **GIN** for JSONB, full-text, arrays.
- **GiST** for geometric / spatial / fuzzy.
- **BRIN** for huge correlated tables (timestamps).
- **Hash** rarely worth over B-tree.
- **Composite indexes:** left-prefix rule.
- **Partial / expression** for selective use cases.
- **Covering / INCLUDE** for index-only scans.
- **Every index slows writes** — measure before adding.
- **Drop unused indexes.**
- **EXPLAIN ANALYZE** every slow query.
- **Killer phrase:** "Indexes trade write cost for read speed; default to B-tree, use GIN for JSONB / full-text, BRIN for huge timestamps, and partial / expression / covering for hot-path optimization."

## Related concepts
- [LSM vs B-Tree](/docs/48-storage-internals/lsm-vs-btree) — index storage engine comparison.
- [MVCC vs Locking](/docs/53-transactions-and-concurrency/mvcc-and-locking) — affects index bloat.
- [Sharding & Partitioning](/docs/42-data-distribution/sharding-and-partitioning) — partition keys often dictate primary index.
- [Schema Evolution](/docs/62-data-modeling-and-serialization/schema-evolution-and-serialization) — adding indexes during migrations.
- Concrete: [PostgreSQL](/docs/01-relational-databases/postgresql), [MySQL](/docs/01-relational-databases/mysql), [MongoDB](/docs/04-document-stores/mongodb), [ElasticSearch](/docs/06-search-and-indexing/elasticsearch).
