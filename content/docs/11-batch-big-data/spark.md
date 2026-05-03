---
title: "Apache Spark"
description: "Spark is a unified distributed compute engine that runs orders of magnitude faster than MapReduce by keeping intermediate data in memory and using a smarter execution model (DAG of stages). One framework covers SQL, b..."
---

> Category: Distributed Compute Engine (Batch + Streaming + ML + SQL) · Written in: Scala (runs on JVM); APIs in Scala/Java/Python/R · License: Apache 2.0

## TL;DR
Spark is a **unified distributed compute engine** that runs orders of magnitude faster than MapReduce by keeping intermediate data **in memory** and using a smarter execution model (DAG of stages). One framework covers SQL, batch ETL, micro-batch streaming, ML (MLlib), and graph (GraphX). It's **the default big-data compute engine** of the last decade and the workhorse of cloud analytics platforms (Databricks, AWS EMR, GCP Dataproc, Synapse).

## What problem does it solve?
MapReduce was correct but **slow**: every stage wrote intermediate output to HDFS, paying for disk + network + 3× replication on data nobody else would read. Spark keeps intermediates in **RAM** when possible, and represents jobs as a **DAG** so the engine can pipeline operators and only shuffle when truly needed. Result: 10–100× speedup on iterative workloads (ML, graph) and 2–10× on pure ETL.

## When to use
- **Large-scale batch ETL** on TB–PB datasets (Spark on EMR/Databricks/Dataproc).
- **SQL analytics** on a data lake (Spark SQL on Parquet/ORC/Delta/Iceberg).
- **ML training/inference at scale** (Spark MLlib, or Pandas/PyTorch via Spark Connect).
- **Streaming with minute-ish latency** (**Structured Streaming** — micro-batch model).
- **Ad-hoc data science / exploration** in notebooks (Databricks, Zeppelin, Jupyter + PySpark).
- **Lakehouse workloads** (Spark + Delta Lake / Iceberg / Hudi).

## When NOT to use
- **Sub-second latency** real-time apps → use Flink (true streaming) or a serving layer.
- **Tiny data** (< few hundred GB) → Pandas / DuckDB / Postgres are simpler & faster on one node.
- **Online transactional** workloads → Spark is OLAP, not OLTP.
- **Low-latency point lookups** → use a KV store / DB.
- **Lots of small jobs** — Spark's job startup overhead (seconds to tens of seconds) is bad for "many small queries"; use Trino/Presto for interactive SQL.

## Data Model
Three APIs from low to high level:

1. **RDD (Resilient Distributed Dataset)** — original API. A typed, partitioned, lazily-evaluated collection. Powerful but verbose; rarely used directly today.
2. **DataFrame** — a distributed table with named columns (Spark SQL). Heavily optimized via the **Catalyst** optimizer + **Tungsten** execution engine. Same API in Scala/Python/Java/R.
3. **Dataset** — typed DataFrame (Scala/Java only).

```python
# PySpark example
df = spark.read.parquet("s3://lake/orders/")
result = (df
  .filter(df.country == "US")
  .groupBy("user_id")
  .agg(F.sum("amount").alias("total_spend"))
  .where(F.col("total_spend") > 1000))

result.write.parquet("s3://lake/top_spenders/")
```

Internally, Spark plans this as a DAG of stages, fuses operators where possible, picks join strategies, and runs across the cluster.

## Architecture & Internals
- **Driver** — your program. Builds the DAG, schedules stages, owns the SparkContext.
- **Cluster Manager** — YARN, Kubernetes, Mesos (deprecated), or **Standalone**.
- **Executors** — JVM processes on workers running tasks; each holds cache + shuffle data.
- A **job** is split into **stages** at shuffle boundaries; each stage runs **tasks** (one per partition) in parallel.

```
Driver ──► Cluster Manager ──► Executors (JVMs)
   │                                │
   └── DAG of stages ──► tasks ────►│ run on partitions, exchange data via shuffle
```

### Catalyst + Tungsten (the secret sauce)
- **Catalyst** — rule-based + cost-based query optimizer. Reorders joins, pushes down filters, prunes columns.
- **Tungsten** — code generation + off-heap memory + cache-friendly layouts. Makes Spark approach hand-tuned C performance for many ops.
- **Adaptive Query Execution (AQE)** — runtime re-optimization (e.g. switch to broadcast join if the build side turned out small, coalesce small post-shuffle partitions).

### Storage & shuffle
- Spark doesn't have its own storage; it reads from S3/HDFS/Delta/Iceberg/JDBC/Kafka/etc.
- **Shuffle** = data exchange between stages (group-bys, joins). Disk + network heavy. The bottleneck of most jobs.

## Consistency Model
- Spark itself is a compute engine — consistency depends on the **sink** and **table format**.
- **Delta Lake / Iceberg / Hudi** add ACID transactions on top of object storage:
  - Atomic appends/overwrites.
  - Schema evolution.
  - Time travel (read old versions).
- Plain Parquet on S3 has the classic "partial output on failure" hazard — use a transactional table format for production.

## Replication
- Spark doesn't store data persistently — replication lives in the storage layer (HDFS / S3 / Delta).
- **Cached RDDs/DataFrames** (`.persist()`) can be replicated across executors (`MEMORY_AND_DISK_2`).
- **Driver HA** via cluster manager (e.g. YARN cluster mode restarts the driver on failure).
- **Fault tolerance**: tasks are deterministic and idempotent; on executor failure, the driver re-runs failed tasks. RDD lineage allows recomputation from source.

## Partitioning / Sharding
**Partitioning is fundamental** in Spark — it's how parallelism happens.

- A DataFrame is split into **partitions**; each partition becomes one **task**.
- For files: typically one partition per ~128 MB block.
- After a shuffle, you control partition count via `spark.sql.shuffle.partitions` (default 200; tune to your data).

### Partition strategies
- **Hash partitioning** — default for joins / `groupBy`; partition = `hash(key) mod N`.
- **Range partitioning** — sort-friendly; used by `orderBy` + `repartitionByRange`.
- **Round-robin** — equal-size partitions, no key affinity.
- **Custom partitioner** — for advanced cases.

### Skew (the #1 Spark performance killer)
A "celebrity key" gets 80% of the data → one task takes 1 hour while others finish in seconds. Symptoms: long-running stages with one straggler task.

**Mitigations:**
- **Salting**: split hot keys with a random suffix (`user_id#0..N`) and aggregate in two passes.
- **Skew join hints** (`/*+ SKEW(...) */`) tell Catalyst to split skewed partitions.
- **AQE skew handling** (Spark 3+) auto-splits skewed partitions in shuffle joins.
- **Broadcast small side** of the join (under ~10 MB by default) to avoid shuffle altogether.

### Bucketing & Z-ordering
- **Bucketing** (Hive-style): pre-partition tables by a key on disk so subsequent joins skip shuffle.
- **Z-order** (Delta Lake): co-locate related data in files for fast pruning on multiple columns.

## Scale of a Single Instance
> A "single instance" of Spark doesn't really make sense — it's the cluster that matters. But per-executor sizing is a frequent interview tangent.

| Dimension | Healthy per executor | Stretch | Notes |
|---|---|---|---|
| Executor memory | 4–32 GB heap | up to 64 GB | larger = more GC pain |
| Executor cores | 4–8 | up to 16 | too many threads share GC |
| Total cluster cores | 100s–1000s | 10K+ at FAANG | scales linearly with data |
| Cluster RAM | TBs | hundreds of TBs | for caching working set |
| Job size | TBs scanned, output GBs | PB scans on big clusters | shuffle is the cap |

**Common executor sizing rule:** ~5 cores per executor, ~`(node_memory − overhead) / executors_per_node` GB heap. Avoid one giant executor per node — GC suffers.

**When to scale out:**
- Stage runtimes are dominated by shuffle wait → add executors / network capacity.
- Spilling to disk frequently → more memory.
- Long stragglers from skew → salt hot keys, enable AQE, use skew hints.

## Performance Characteristics
- **Latency:** seconds to hours depending on job size; not interactive (use Trino for that).
- **Throughput:** scales near-linearly with cluster size for embarrassingly-parallel jobs; shuffle-heavy jobs scale sub-linearly.
- **Bottlenecks:** shuffle disk + network, GC pauses on big heaps, skew, small-file overhead.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Unified API: SQL, batch, streaming, ML, graph | Not true streaming — micro-batch (~100 ms minimum) |
| 10–100× faster than MapReduce | Heavy job-startup cost; bad for many small queries |
| Mature, huge community, tooling | Memory/GC tuning is a real skill |
| Excellent SQL optimizer (Catalyst + AQE) | Skew is everyone's eternal problem |
| Pluggable storage (S3/HDFS/Delta/Iceberg/JDBC/Kafka) | Compute-only — relies on table format for ACID |
| Python (PySpark) is first-class | PySpark UDFs slow without Arrow / vectorization |

## Common HLD Patterns
- **Data lake / lakehouse ETL:**
  ```
  Sources → Kafka / Kinesis / S3 → Spark (Bronze→Silver→Gold) → Delta/Iceberg → BI / ML
  ```
- **Spark + Kafka micro-batch streaming:** Structured Streaming reads Kafka, transforms, sinks to Delta/Iceberg/JDBC.
- **Spark on Kubernetes** — modern way to run; per-job clusters, no Hadoop.
- **CDC ingestion**: Debezium → Kafka → Spark Structured Streaming → Delta tables.
- **ML training pipelines**: feature engineering with Spark, model training with Spark MLlib or distributed PyTorch.
- **Graph workloads**: GraphFrames / GraphX (less common; Neo4j wins for small graph queries, Spark wins for big batch graph algorithms).

## Common Pitfalls / Gotchas
- **Skew** — biggest cause of slow Spark jobs. Detect via Spark UI's stage view (one task much longer than others).
- **Small-file problem** — too many small files in S3/HDFS → driver overhead & slow listing. Compact via OPTIMIZE (Delta) or scheduled coalesce jobs.
- **`collect()` on big DataFrames** — pulls everything to the driver, OOMs the driver. Use `take`/`limit` or write to storage.
- **PySpark UDFs (row-at-a-time)** — slow because of JVM↔Python serialization. Use **Pandas UDFs** (Arrow-based) or built-in functions.
- **Wrong shuffle partitions** — default 200 is rarely right; tune per workload (or rely on AQE).
- **Caching everything** — caching has cost; only cache what's reused multiple times.
- **Driver memory** too small — large broadcasts / `collect()` / planning of huge DAGs need driver headroom.
- **Treating Spark as a database** — it's a compute engine; persistent state belongs in a table format (Delta/Iceberg/Hudi) or a real DB.

## Common HLD interview-style numbers
- 1 TB scan + simple aggregation on a moderate cluster → minutes.
- Joining a 10 TB fact with a 10 GB dimension via broadcast join → much faster than shuffle join.
- Re-partition into ~`(input_size_GB) / 128 MB ≈ N` tasks for balanced parallelism.

## Interview Cheat Sheet
- **Tagline:** "Unified distributed compute engine; the workhorse of modern data platforms."
- **Best at:** large-scale batch ETL, SQL on data lakes, ML at scale, micro-batch streaming.
- **Worst at:** sub-second streaming, interactive SQL on tiny queries, OLTP, real-time serving.
- **Scale of one executor:** ~5 cores, ~16–32 GB heap; cluster = 100s of executors easily.
- **Shard by:** partitions (hash / range / round-robin / custom); shuffle is the parallelism backbone; tune `spark.sql.shuffle.partitions`.
- **Consistency:** depends on sink — use Delta/Iceberg/Hudi for ACID on object storage; AQE re-optimizes plans at runtime.
- **Replicates how:** N/A — relies on storage layer; cached datasets can be replicated for fault tolerance; tasks recomputed via lineage on failure.
- **Killer alternatives:** Flink (true streaming), Trino/Presto (interactive SQL), Snowflake/BigQuery (managed warehouses), Dask / Ray (Python-native distributed compute), DuckDB (single-node analytics on small data).

## Further Reading
- Official docs: https://spark.apache.org/docs/latest/
- *Spark: The Definitive Guide* — Bill Chambers & Matei Zaharia.
- *Learning Spark* (2nd ed., O'Reilly) — covers Structured Streaming, Delta Lake.
- Original Spark paper (RDDs): https://www.usenix.org/system/files/conference/nsdi12/nsdi12-final138.pdf
- Databricks engineering blog: https://www.databricks.com/blog