# Apache Hadoop

> Category: Distributed Storage + Batch Processing Framework · Written in: Java · License: Apache 2.0

## TL;DR
Hadoop is the **OG big-data ecosystem**: a distributed file system (**HDFS**), a job scheduler (**YARN**), and a batch programming model (**MapReduce**). It made it cheap to store and crunch petabytes on commodity hardware. While modern stacks have moved to S3 + Spark + Snowflake/Iceberg, Hadoop is **still everywhere on-prem** and is a foundational topic for HLD interviews — and HDFS concepts (block-based, replicated, large-file-optimized) live on in every modern data lake design.

## What problem does it solve?
Pre-2006: storing and processing terabytes of data required expensive specialized servers (Teradata, mainframes). Hadoop, inspired by Google's GFS + MapReduce papers, said:
- Use **commodity machines** with local disks.
- Replicate data **3 times** so disk failures don't matter.
- Move **compute to the data** instead of data to compute (data locality).
- Provide a simple programming model: **map** (transform), **shuffle** (group), **reduce** (aggregate).

## When to use
- **On-prem petabyte-scale storage** that you control (banks, telcos, gov).
- **Batch ETL** on huge datasets (logs, clickstreams, ad data).
- **Data lake** — cheap, schema-on-read storage of raw + processed data.
- Workloads tied to the **Hadoop ecosystem** (Hive, HBase, Spark on YARN).
- Compliance-heavy environments where cloud isn't allowed.

## When NOT to use
- **Cloud-native greenfield** — use S3 + Spark / Snowflake / Athena. Cheaper, less ops.
- **Real-time / low-latency** — Hadoop is batch-first; latency is minutes to hours.
- **Small datasets** — terabytes or less are fine on a single big Postgres or a small Spark cluster.
- **Interactive queries** without Hive/Impala/Trino on top — raw MapReduce is *not* interactive.
- **Random access reads/writes** — HDFS is optimized for big sequential reads.

## Components — The Hadoop "stack"
Hadoop isn't one thing; it's three core services + an ecosystem.

### 1. HDFS — Hadoop Distributed File System
The storage layer.
- Files are split into **blocks** (default **128 MB**, configurable).
- Each block is replicated **3×** across nodes (configurable). Default placement: 1 local rack, 2 on a remote rack (rack awareness).
- **NameNode** (master): holds filesystem metadata (file → blocks → locations) **in memory**. Single point of complexity.
- **Standby NameNode** + **JournalNodes** (Quorum Journal Manager) provide HA.
- **DataNodes** (workers): store the actual blocks; report heartbeats to NameNode.
- Files are **append-only / write-once-read-many** (no random writes; you can append).

```
File: events.log (1 GB)
  Block 0 (128 MB): replicated on Nodes [A, B, C]
  Block 1 (128 MB): replicated on Nodes [B, D, E]
  Block 2 (128 MB): replicated on Nodes [A, F, C]
  ...
```

### 2. YARN — Yet Another Resource Negotiator
The cluster resource manager.
- **ResourceManager** (master) — global resource scheduler.
- **NodeManager** (per worker) — manages **containers** (CPU + memory bundles).
- **ApplicationMaster** — per-job coordinator, requests containers.
- Schedulers: **Capacity Scheduler**, **Fair Scheduler** — share the cluster across teams/queues.

### 3. MapReduce — the original compute model
- **Map** — read input splits, emit `(key, value)` pairs.
- **Shuffle & sort** — group by key across nodes (the expensive step).
- **Reduce** — aggregate per key, write output.

Most teams now run **Spark on YARN** instead of MapReduce — same storage, much faster compute.

## Data Model
HDFS has **no schema** — it's a filesystem. Files are bytes. Schema-on-read tools sit on top:
- **Hive** — SQL-like queries over HDFS files (CSV, ORC, Parquet, Avro).
- **HBase** — wide-column NoSQL on top of HDFS.
- **Parquet / ORC** — columnar formats; the modern default for analytics.

## Architecture & Internals
```
                     ┌──────────────┐
                     │  NameNode    │  metadata in RAM
                     │  + Standby   │  edits to JournalNodes
                     └──────┬───────┘
                            │ block locations
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
   DataNode A          DataNode B           DataNode C
   blocks: 0, 2        blocks: 0, 1         blocks: 0, 2

   ┌──────────────┐
   │ ResourceMgr  │  ← YARN, schedules containers on NodeManagers
   └──────────────┘
```

Read path: client asks NameNode for block locations → reads blocks directly from DataNodes.
Write path: client streams data through a pipeline of DataNodes (replication chain).

## Consistency Model
- HDFS is **strong consistency for filesystem metadata** (NameNode is authoritative).
- Files are **write-once / append-only** — no random updates → consistency is simple.
- Reads after a successful close are immediately consistent.

CAP positioning: **CP** — if NameNode is down (and standby hasn't kicked in), the cluster blocks. HA setup uses ZooKeeper / Quorum JournalNodes.

## Replication
- Block replication factor (default **3**).
- Rack-aware placement: 1 replica on local rack, 2 on a different rack — survives a whole-rack failure.
- DataNode failure is detected via heartbeat timeouts; NameNode triggers re-replication of under-replicated blocks.
- For disaster recovery: **HDFS DistCp** to copy data to another cluster / S3.

## Partitioning / Sharding
- HDFS itself shards by **block** — every file is split.
- Block placement is automatic; clients don't choose which DataNode.
- For tables on top (Hive / HBase), you partition data to enable **partition pruning**:
  - **Hive partitioned tables** by `(date, region)` → directory structure: `/data/sales/date=2026-05-01/region=us/...`. Queries with `WHERE date = '2026-05-01'` skip irrelevant directories.
  - **HBase** partitions by row key; bad row keys cause **region hotspots** (same shard pattern as Cassandra/DynamoDB).

### Hot data pitfalls
- **Skewed partitions** — `WHERE country='US'` reads one mega-partition while others sit idle.
- **Small-file problem** — HDFS hates millions of tiny files because each file is metadata in NameNode RAM. Combine into bigger files (compaction, ORC/Parquet rollups).
- **NameNode RAM ceiling** — practically limits cluster file count (~hundreds of millions of files; tune heap accordingly).

## Scale of a Single Instance
> Hadoop is designed to scale to thousands of nodes. The bottlenecks are usually NameNode memory and metadata throughput.

| Dimension | Healthy / per | Stretch | Why |
|---|---|---|---|
| Cluster size | 100s–1000s of DataNodes | 4500+ at Yahoo, Facebook | NameNode metadata limits |
| Storage per node | 24–96 TB (12 disks × 2–8 TB) | hundreds of TB | use HDDs for cheap throughput |
| Files in HDFS | ~hundreds of millions | a billion with big NameNode heap | each file/block ≈ 150 bytes in NN RAM |
| Block size | 128 MB default | 256 MB / 512 MB on big clusters | bigger = less metadata, fewer mappers |
| Throughput | GB/sec aggregate read | tens of GB/sec | dominated by disk + network |
| MapReduce job size | 1000s of mappers/reducers | tens of thousands | shuffle is the bottleneck |

**When to scale out:**
- DataNode disks fill → add nodes.
- NameNode RAM fills → use **HDFS Federation** (multiple namespaces, one cluster).
- Cluster network saturates → bigger NICs / more racks.
- Job runtime becomes unacceptable → switch from MapReduce to Spark.

**Vertical limits:**
- A single NameNode JVM heap ~100 GB practical → caps file count.
- One NameNode is the metadata bottleneck — Federation or **Ozone** (object store sibling) addresses this.

## Performance Characteristics
- **Read latency:** seconds (HDFS is for big sequential I/O, not point lookups).
- **Throughput:** very high aggregate read/write (terabytes/hour easily).
- **MapReduce job latency:** minutes to hours; Spark on YARN is 10–100× faster for many workloads.
- **Bottlenecks:** NameNode RPC, shuffle network I/O, slow stragglers.

## Trade-offs
| Strengths | Weaknesses |
|---|---|
| Cheap petabyte-scale storage on commodity HW | Operationally heavy (Hadoop sysadmin is a career) |
| Mature, battle-tested ecosystem | Cloud has largely won — S3 + Spark / lakehouse is simpler |
| Strong batch story for huge data | Not real-time, not interactive without Hive/Trino |
| Open-source, no vendor lock-in | Small-file problem |
| Rack-aware replication, locality | NameNode is a metadata bottleneck |

## Common HLD Patterns
- **Data lake on HDFS:**
  ```
  Sources → Kafka / Flume / Sqoop → HDFS (raw zone) → Spark / Hive ETL → HDFS (curated zone, Parquet) → BI tools
  ```
- **Hive on HDFS** for SQL analytics over Parquet/ORC tables.
- **HBase on HDFS** for low-latency random access to wide rows on top of the same storage.
- **Spark on YARN** running over HDFS — reuses existing storage, runs faster than MapReduce.
- **Lambda architecture** (historical): batch layer in Hadoop + speed layer in Storm/Spark Streaming + serving layer.
- **Cloud equivalents** to know:
  - HDFS ≈ **S3** / GCS / ABFS.
  - YARN ≈ **EMR / Dataproc / Kubernetes**.
  - MapReduce ≈ **Spark / Hive on Tez**.

## Common Pitfalls / Gotchas
- **Small-file problem** — millions of small files crush the NameNode. Compact to fewer big files.
- **Default block size** of 128 MB; many tiny blocks mean inefficient mappers.
- **NameNode SPOF** if HA isn't set up.
- **Skew** in MapReduce reduce keys → one reducer takes 90% of the work. Use combiners + skew handling.
- **Replication amplification** — 3× storage cost is real; use **erasure coding** in HDFS 3 for cold data (1.5× storage with similar fault tolerance).
- **Underestimating cluster ops costs** — operating a Hadoop cluster requires expertise (Kerberos, Ranger, upgrades).
- **Dropping in cloud and being shocked** — running a self-managed Hadoop cluster on EC2 is rarely cheaper than EMR/S3.

## Interview Cheat Sheet
- **Tagline:** "Distributed file system + resource manager + batch compute for petabyte-scale on commodity hardware."
- **Best at:** big-data batch ETL, data lakes, on-prem petabyte storage.
- **Worst at:** real-time queries, small files, random updates.
- **Scale of one cluster:** thousands of nodes, 100s of PB; NameNode RAM caps file count (~hundreds of millions).
- **Shard by:** HDFS auto-shards by 128 MB blocks; tables on top partition by date/region for pruning.
- **Consistency:** strong, but write-once + append-only; HA via standby NameNode + JournalNodes.
- **Replicates how:** 3× block replication with rack-aware placement; erasure coding for cold data.
- **Killer alternatives:** Amazon S3 + Spark/Athena, Google Cloud Storage + Dataproc/BigQuery, Azure Data Lake, MinIO/Ceph (S3-compatible), Apache Ozone (object-store sibling of HDFS).

## Further Reading
- Official docs: https://hadoop.apache.org/docs/stable/
- *Hadoop: The Definitive Guide* — Tom White (a classic).
- GFS paper: https://research.google/pubs/pub51/
- MapReduce paper: https://research.google/pubs/pub62/
- HDFS architecture: https://hadoop.apache.org/docs/stable/hadoop-project-dist/hadoop-hdfs/HdfsDesign.html
