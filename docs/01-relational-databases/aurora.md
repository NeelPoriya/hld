# Amazon Aurora

> Category: Cloud-Native Relational Database (Postgres / MySQL compatible) · Cloud: AWS · License: Proprietary (managed)

## TL;DR
Aurora is **AWS's reimplementation of MySQL/PostgreSQL** with a custom **distributed storage layer** that replicates 6 ways across 3 AZs and only requires **4-out-of-6 writes** for durability. The compute (database engine) and storage are decoupled, giving you fast failovers, instant read replicas, point-in-time restore, and 5×–3× the throughput of vanilla MySQL/Postgres. It's the default managed RDBMS choice on AWS for serious workloads.

## What problem does it solve?
Traditional MySQL/Postgres replication suffers from:
- **Slow failover** (replica must catch up + promote).
- **Read replicas lag** because they replay the full WAL.
- **Backups take forever** at TB-scale.
- **Disk IO is the bottleneck** at high write rates.

Aurora rewrites just the storage layer — the database engine offloads only **redo log records** to a distributed storage fleet that materializes pages on the fly. Replicas read the same shared storage instead of replaying WAL.

## When to use
- AWS shops needing a **managed, highly-available SQL DB**.
- High-throughput OLTP that vanilla RDS struggles with.
- Workloads up to **128 TiB** that need fast failover and many low-lag replicas.
- **Aurora Serverless v2** for unpredictable workloads (auto-scales compute by ACUs).
- **Aurora Global Database** for cross-region DR with sub-second replication.

## When NOT to use
- Outside AWS — vendor lock-in is total.
- Workloads where **vanilla Postgres on RDS is enough and cheaper**.
- True horizontal write scale → use Spanner / CockroachDB / Vitess.
- OLAP analytics → use Redshift / Snowflake.
- Workloads that need cutting-edge Postgres features within days of upstream — Aurora lags.

## Data Model
Same as MySQL or Postgres, depending on which Aurora flavor you pick:
- **Aurora MySQL** — wire-compatible with MySQL 5.7 / 8.0.
- **Aurora PostgreSQL** — wire-compatible with Postgres.

Your app code, ORM, drivers, and SQL are unchanged. Aurora is a drop-in replacement.

## Architecture & Internals
The defining innovation: **the log is the database.**

```
   App
    │
    ▼
┌────────────┐         ┌────────────────────────────────┐
│ Writer DB  │── redo ─► Distributed Storage Fleet      │
│ instance   │  log    │  (6 copies, 3 AZs, 4-of-6 quorum)│
└────────────┘         │   each shard = 10 GB           │
        ▲              └────────────────────────────────┘
        │ readers read pages directly from storage
   ┌────┴─────────┐
   │ Reader DB(s) │  (up to 15 replicas, all share storage)
   └──────────────┘
```

- The **writer instance** ships only redo log records to the storage fleet (no full pages).
- The **storage fleet** applies log records to pages locally on each storage node.
- **Read replicas** read the same shared storage — no WAL replay, near-zero lag (typically < 100 ms).
- **Failover**: a replica becomes writer in ~30 seconds without recovering from log because storage is shared.

Storage is split into **10 GB segments**, each replicated 6 ways. Writes need **4 of 6** acks (write quorum), reads need **3 of 6** (read quorum) → 4 + 3 > 6 → strong consistency.

## Consistency Model
- **ACID**, like the underlying engine.
- Within a region: **strongly consistent** writes, near-zero replica lag.
- **Aurora Global Database**: cross-region replication is async (~1 second), eventually consistent across regions.
- **Aurora Multi-Master / Aurora Limitless** (newer) — multi-writer or sharded writers.

## Replication
- **Within region**: 6× storage replication across 3 AZs. Up to **15 reader instances** sharing one storage volume.
- **Global Database**: replicate the storage volume to up to 5 secondary regions; lag typically < 1 second; cross-region failover available.
- **Backups**: continuous backup to S3 (no performance impact on the DB), point-in-time restore to any second within retention.

## Partitioning / Sharding
- **Vertical scaling** by default — pick a bigger instance class.
- **Aurora Limitless Database** (Postgres) — newer feature: native sharded Postgres on Aurora, with a query router and consistent transactions across shards.
- For pre-Limitless: use Vitess (MySQL) or Citus (Postgres on RDS not Aurora) or shard at the application level.

### Choosing a shard key — same rules apply
The 10 GB storage segments are sharded internally by Aurora — you don't see them. Your concern is the **logical shard key** if you go Limitless or shard yourself.

## Scale of a Single Instance
| Dimension | Limit / sweet spot | Notes |
|---|---|---|
| Storage | up to **128 TiB** per cluster | auto-grows in 10 GB chunks; pay only for used |
| Instance size | up to **db.r7g.16xlarge** (~half a TB RAM) and beyond | scale up before scaling out |
| Read replicas | up to **15** | all share storage, near-zero lag |
| Writes/sec | several × vanilla MySQL/Postgres on same hardware | log-shipping > full WAL |
| Failover time | ~30 seconds typical | shared storage, no log replay |
| Aurora Serverless v2 | auto-scales 0.5 → 128 ACUs | 1 ACU ≈ 2 GB RAM |

**Rule of thumb:** Aurora handles ~**3× more write throughput** and ~**5× more read throughput** than equivalent RDS on the same instance, because it isn't bottlenecked by writing full pages and full WAL.

## Performance Characteristics
- Failover < 1 minute (often ~30 sec).
- Read replica lag < 100 ms (often < 20 ms).
- Backups don't hit the DB — taken from storage fleet.
- Bottlenecks: writer instance CPU, network bandwidth between writer and storage, hot row contention.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Storage decoupled → faster failover, instant replicas | AWS lock-in |
| 6× replication, 11 9s durability | Lags vanilla Postgres/MySQL on cutting-edge features |
| Up to 15 readers, near-zero lag | Costs more than RDS |
| Auto-scaling storage to 128 TiB | Multi-region writes need Limitless / Multi-Master |
| Aurora Serverless v2 for spiky workloads | Cold-start of small ACU configs has latency |

## Common HLD Patterns
- **Default OLTP store on AWS** — Aurora Postgres + Lambda + API Gateway.
- **Aurora + ElastiCache (Redis)** + ElasticSearch — classic stack.
- **Aurora Global Database** for active-passive multi-region.
- **CDC**: Aurora → Debezium → Kafka → analytics pipeline.
- **Aurora + RDS Proxy** to manage connection storms (Lambda use cases).

## Common Pitfalls / Gotchas
- Treating Aurora as Postgres with all extensions — some are unsupported (notably some replication-changing ones).
- Using Aurora Global Database expecting strong consistency across regions — it's async.
- Using a tiny writer with many heavy readers — readers don't help write throughput.
- Believing failover is "instant" — it's seconds, not zero.
- Connection storms with Lambda → use **RDS Proxy**.
- Cost surprises with high I/O workloads — Aurora storage charges per IO (older pricing) or upgrade to **Aurora I/O Optimized**.

## Interview Cheat Sheet
- **Tagline:** "MySQL/Postgres-compatible engine on a custom 6-way replicated distributed storage layer."
- **Best at:** managed AWS OLTP, fast failover, many low-lag replicas.
- **Worst at:** non-AWS, multi-region writes (without Limitless/Multi-Master), cutting-edge upstream features.
- **Scale of one cluster:** up to 128 TiB, 15 readers, 1 writer (or sharded with Limitless).
- **Shard by:** vertical scale first; Aurora Limitless for native sharding; Vitess/Citus otherwise.
- **Consistency:** ACID; strong within region; async to other regions via Global DB.
- **Replicates how:** redo log to storage fleet, 6 copies, 4-of-6 write quorum, 3-of-6 read quorum.
- **Killer alternatives:** RDS for Postgres/MySQL, Spanner / CockroachDB (horizontal SQL), AlloyDB (Google), Azure Database for PG hyperscale (Citus).

## Further Reading
- Aurora SIGMOD 2017 paper: https://www.allthingsdistributed.com/files/p1041-verbitski.pdf
- Aurora docs: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/
- "Aurora Internals" re:Invent talks (search by year).
