---
title: "MySQL"
description: "MySQL is the most-deployed open-source RDBMS in the world — the \"M\" in LAMP. It's slightly less feature-rich than PostgreSQL but historically had a reputation for being simpler, lighter, and easier to operate. Most in..."
---

> Category: Relational Database (RDBMS) · Written in: C/C++ · License: GPLv2 (community), commercial (Oracle)

## TL;DR
MySQL is the **most-deployed open-source RDBMS** in the world — the "M" in **LAMP**. It's slightly less feature-rich than PostgreSQL but historically had a reputation for being **simpler, lighter, and easier to operate**. Most internet giants (Facebook, Twitter, Uber, Shopify, YouTube) ran or still run massive MySQL fleets. The dominant storage engine is **InnoDB** (B-Tree, ACID, MVCC).

## What problem does it solve?
Same as Postgres — relational, ACID, joins, indexes — but the design philosophy historically leaned toward **easy replication, simple deployment, and strong tooling around horizontal scaling** (sharding proxies like Vitess). It became the default DB at internet companies because it was "good enough" and operationally well-understood at scale.

## When to use
- Same use cases as Postgres: OLTP, SaaS apps, e-commerce, content management.
- When your **ecosystem is already MySQL** (WordPress, MediaWiki, most LAMP shops).
- When you want **Vitess** (Kubernetes-native sharded MySQL — what powers YouTube, Slack, GitHub).
- Cloud-managed: **AWS RDS for MySQL**, **Aurora MySQL**, **Google Cloud SQL**, **Azure Database for MySQL**.

## When NOT to use
- You need rich SQL (window function nuances, advanced indexing like GIN/GiST/BRIN, native JSON ergonomics, geo) → **PostgreSQL** is more capable.
- You need horizontal SQL scale-out without third-party tools → use **Vitess on MySQL**, **Aurora**, **Spanner**, or **CockroachDB**.
- Petabyte analytics → use a warehouse.

## Data Model
Same relational model as Postgres. Two main storage engines:
- **InnoDB** (default since 5.5) — ACID, MVCC, B-Tree, row-level locks. **The only choice for serious workloads.**
- **MyISAM** (legacy) — no transactions, table-level locks. Avoid.

```sql
CREATE TABLE users (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email       VARCHAR(255) UNIQUE NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
```

## Architecture & Internals
- **One process, many threads** (vs Postgres's process-per-connection).
- **InnoDB**: clustered B-Tree on the **primary key** — table data is the leaf of the PK B-Tree. Secondary indexes store PK as the pointer.
- **Redo log** (write-ahead log) for durability + crash recovery.
- **Undo log** for MVCC and rollback.
- **Buffer pool** caches pages (typically 70–80% of RAM).

```
Client ──► Connection thread ──► Parser/Optimizer ──► Storage engine (InnoDB)
                                                       │
                                                       ├─► Buffer pool
                                                       ├─► Redo log
                                                       └─► Data files
```

### "Clustered index" gotcha (vs Postgres "heap")
Because InnoDB stores rows inside the PK B-Tree:
- **Sequential PK** (auto-increment) → inserts append at the end → fast.
- **UUIDv4 PK** → random insertion order → page splits → fragmentation, IO amplification. Use **UUIDv7 / ULID** or sequential keys.
- Secondary index lookups do two B-Tree traversals (secondary → PK → data row).

## Consistency Model
- **ACID** with InnoDB.
- Default isolation level: **REPEATABLE READ** (different from Postgres's default, "Read Committed").
- MySQL's REPEATABLE READ uses **gap locks** to prevent phantoms — this can surprise developers coming from Postgres.
- Other levels: READ UNCOMMITTED, READ COMMITTED, SERIALIZABLE.

## Replication
MySQL replication is its **superpower** — extremely well-understood and battle-tested.

- **Asynchronous binlog replication** (default) — primary writes to **binary log**; replicas pull and replay.
- **Semi-synchronous** — primary waits for at least one replica to receive the binlog before commit.
- **Group Replication** (MySQL 8) — Paxos-based multi-primary or single-primary replication; basis for **InnoDB Cluster**.
- **GTIDs** (Global Transaction IDs) make replication topology changes safe and automatic.
- **Row-based vs statement-based** binlog formats — row-based is the modern default (deterministic, safe).

### Replication topologies
- Primary + read replicas (most common).
- Multi-primary with conflict detection (Group Replication).
- Cross-region async for DR.

## Partitioning / Sharding
- **Native partitioning** — RANGE / LIST / HASH / KEY partitions on a single server (similar to Postgres partitioning).
- **No native cross-server sharding.** Solutions:
  - **Vitess** (the gold standard) — Kubernetes-native sharded MySQL with online resharding, originally from YouTube.
  - **ProxySQL** — connection pooling + simple sharding.
  - Application-level sharding (DIY, painful at scale).

### Shard key advice
- Same rules as Postgres: high cardinality, even traffic, matches common queries.
- **Vitess** uses **VIndexes** (vindexes) to map keys → shards, with online resharding so you can split shards live.

## Scale of a Single Instance
| Dimension | Comfortable | Stretch | Notes |
|---|---|---|---|
| Dataset | ~1–5 TB | up to ~10 TB | InnoDB hot working set should fit in RAM |
| Rows / table | hundreds of millions to a few billion | with partitioning | secondary index lookups are the bottleneck |
| Connections | hundreds | thousands w/ ProxySQL | thread-per-connection is lighter than Postgres but still pool |
| Writes/sec | 10K | ~50K with batched inserts | binlog fsync dominates |
| Reads/sec | tens of thousands | 100K+ with replicas + cache | replicas scale reads |

**When to shard:**
- Single-server write throughput maxes (often the binlog fsync or the single-writer bottleneck).
- Working set blows past RAM and IOPS bottoms out.
- Ops pain: backups take days, schema changes lock too long.

Before sharding: try **read replicas + Redis cache + table partitioning + bigger instance + online schema-change tools** (gh-ost, pt-online-schema-change).

## Performance Characteristics
- Sub-ms point lookups when buffer-pool cached.
- Primary-key range scans extremely fast (clustered index, sequential).
- Secondary index lookups slightly slower than Postgres (extra B-Tree traversal to PK).
- Bottlenecks: redo log fsync, replication lag, large transactions, lock contention.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Battle-tested at hyperscale (FB, Uber, GitHub) | Less feature-rich SQL than Postgres |
| Excellent replication & ecosystem | DDL historically blocking — needs gh-ost/pt-osc |
| Vitess gives Kubernetes-native sharding | Defaults can surprise (REPEATABLE READ + gap locks) |
| Lightweight thread model | JSON / GIS / extensibility weaker than Postgres |
| Tons of managed offerings | No real native horizontal scale-out OOTB |

## Common HLD Patterns
- **Primary + replicas** behind a proxy (ProxySQL).
- **Vitess on Kubernetes** for sharded MySQL at scale.
- **Aurora MySQL** for managed cloud — separated storage / compute (see [Aurora](aurora.md)).
- **CDC**: MySQL binlog → Debezium → Kafka → downstream sinks (ElasticSearch, warehouse).
- **MySQL + Redis** cache, exactly like Postgres.

## Common Pitfalls / Gotchas
- **UUIDv4 PKs** kill InnoDB performance — use sequential IDs.
- **`SELECT ... FOR UPDATE` with bad indexes** locks too many gaps → deadlocks.
- **Long-running transactions** bloat undo log.
- **DDL on a hot table** without gh-ost = downtime.
- **Replication lag** spikes on large transactions or row-format binlog of mass updates.
- **`utf8`** is *not* full UTF-8 in old MySQL — use `utf8mb4`.
- **`auto_increment` on the cluster** with multi-primary replication → ID conflicts; use `auto_increment_increment`.

## Interview Cheat Sheet
- **Tagline:** "Most-deployed OSS RDBMS; great replication; sharded with Vitess at hyperscale."
- **Best at:** OLTP, web apps, Vitess-sharded fleets.
- **Worst at:** rich SQL features, native horizontal scale, JSON-heavy workloads.
- **Scale of one node:** ~1–5 TB, ~10K writes/sec; replicas scale reads.
- **Shard by:** Vitess VIndexes (online resharding) or app-level by `user_id` hash.
- **Consistency:** ACID, default REPEATABLE READ with gap locks; semi-sync / Group Replication available.
- **Replicates how:** binlog → replica replay; semi-sync; Group Replication (Paxos-based).
- **Killer alternatives:** PostgreSQL, MariaDB (community fork), Percona Server (perf-tuned MySQL fork), Aurora MySQL, PlanetScale (managed Vitess).

## Further Reading
- Official docs: https://dev.mysql.com/doc/
- *High Performance MySQL* — Schwartz, Zaitsev, Tkachenko.
- Vitess docs: https://vitess.io/docs/
- gh-ost (online schema change): https://github.com/github/gh-ost