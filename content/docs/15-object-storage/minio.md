---
title: "MinIO"
description: "MinIO is the open-source S3-compatible object store you run yourself — single binary, Kubernetes-native, used for on-prem lakes, air-gapped clusters, edge, and S3-compatible dev/test."
---

> Category: Object Storage · Written in: Go · License: AGPL v3 (commercial license available)

## TL;DR
MinIO is an **open-source object store with a fully S3-compatible API** that you can run anywhere — on bare metal, on-prem, in Kubernetes, in air-gapped data centers, on a developer's laptop. Single Go binary, no external dependencies. The de-facto choice when you want **S3 semantics off-AWS** — for hybrid lakes, regulated environments that can't use public cloud, edge sites, and local dev/test that mocks S3.

## What problem does it solve?
- **You can't use AWS S3** but your toolchain (Spark, Iceberg, Presto, Argo, etc.) speaks S3.
- **On-prem data lakes** for compliance, sovereignty, latency, or cost reasons.
- **Air-gapped clusters** (defense, finance, scientific HPC).
- **Edge / IoT** — process data locally, sync to cloud later.
- **Dev/test** — spin up an S3 mock locally without AWS credentials.
- **Multi-cloud / hybrid** — same API across AWS, GCP, on-prem.

## When to use
- **On-prem object storage** for big-data workloads.
- **Hybrid cloud** — same S3 API across all environments.
- **Kubernetes-native** stateful storage with the MinIO Operator + DirectPV.
- **Air-gapped / regulated** — sovereign data, government, healthcare.
- **Local dev/test** — `docker run minio/minio` for S3-compatible local store.
- **Edge** — small footprint, deploy at branch sites.

## When NOT to use
- **You're already on AWS** and have no constraint forcing self-host — S3 is cheaper to operate.
- **AGPL is a problem** — MinIO server is AGPL; commercial license required for embedding/SaaS use.
- **You want managed-only ops** — running MinIO at scale is non-trivial; consider Cloudian, Pure FlashBlade, NetApp StorageGRID, or cloud object stores.
- **Submillisecond key-value workloads** — wrong tool.
- **Sub-petabyte single-node simplicity is fine** — you may not need MinIO complexity yet.

## Data Model
- **Bucket** + **object**, same as S3.
- **Erasure coding** (Reed-Solomon) across drives for durability.
- **Versioning + Object Lock + Lifecycle** — S3-compatible.
- **IAM** — bucket / user / group policies, STS, OIDC, LDAP integration.
- **Server-Side Encryption** — SSE-S3, SSE-KMS, SSE-C with KES (Key Encryption Service).

```bash
# Start a single-node MinIO with 4 disks (erasure-coded)
minio server /mnt/data{1...4} --console-address :9001

# Use mc (MinIO client, S3 CLI alternative)
mc alias set local http://localhost:9000 admin secret
mc mb local/lake
mc cp big.parquet local/lake/data/

# Or use any S3 SDK
aws --endpoint-url http://localhost:9000 s3 cp big.parquet s3://lake/data/
```

## Architecture & Internals
- **Distributed mode** — N nodes × M drives form an erasure-coded set; data + parity stripes spread across drives.
- **Erasure code** — defaults to ~50% parity (e.g., EC:4 on 8 drives → tolerates 4 drive failures).
- **Server pool / decommissioning** — add new server pools for capacity expansion; rebalance via decommission of old pool.
- **No metadata server** — metadata stored alongside data on disks; gossip-based cluster state.
- **Bitrot protection** via per-shard checksums.

## Consistency Model
- **Strong read-after-write consistency** for new objects and overwrites.
- **List-after-write consistency** within a single deployment.
- **Single-object atomicity** — no multi-object transactions.

## Replication
- **Site replication** — synchronously replicate buckets, IAM, configs across multiple MinIO deployments.
- **Bucket replication** — async per-bucket replication with versioning + delete markers.
- **Active-active** topologies for global lakes.

## Partitioning / Sharding
- **Erasure sets** — objects are striped across drives in a set; multiple sets in a deployment.
- **No prefix throttling like S3** — MinIO scales linearly with hardware; bottleneck is disk + network not metadata service.
- **Hot-disk pitfall:** EC stripe distribution is hash-based; uneven object sizes can create skewed disk utilization.

## Scale
- **PB-class clusters** publicly documented (multi-PB single deployments at telcos, banks, scientific orgs).
- **Per-node throughput** scales with NIC + NVMe; clusters with 100+ Gbps aggregate read are common.
- **Object count** — billions per cluster.

## Performance Characteristics
- **Throughput** — saturates NICs on NVMe-backed clusters; benchmarks show 100s of GB/s on large clusters.
- **Latency** — ms-range for small objects; depends on disk + network.
- **Bottlenecks:** disk IOPS / NIC saturation, cluster size for parallelism, slow disks dragging down erasure sets.

## Trade-offs

| Strength | Weakness |
|---|---|
| Single Go binary, runs anywhere | AGPL — commercial licensing for SaaS embedding |
| 100% S3-compatible API | You operate it (capacity planning, hardware, networking) |
| Excellent on Kubernetes (Operator + DirectPV) | No global metadata service → no global namespace; manage with site replication |
| Erasure-coded durability | Performance tuning is hardware-dependent |
| Strong consistency from day one | Smaller managed ecosystem than AWS |
| Used by Bloomberg, ING, Equinix, NASA | Setting up multi-site replication needs care |

## Common HLD Patterns
- **On-prem lakehouse:** MinIO + Iceberg/Delta + Trino/Spark for fully self-hosted analytics.
- **Hybrid CDC:** OLTP → Debezium → Kafka → Spark → MinIO bronze/silver/gold tables.
- **Kubernetes object storage:** MinIO Operator on the same cluster running apps; durable backups for stateful sets.
- **Edge ingestion:** MinIO at branch sites collects local data, async-replicates to central cluster.
- **Local dev / test:** Compose-up MinIO; tests run against same S3 SDK they use in prod.

## Common Pitfalls / Gotchas
- **AGPL licensing** — read carefully; if your product is SaaS using MinIO server, you may need a commercial license.
- **Erasure set sizing** — once chosen, can't change without decommissioning a pool.
- **Single-drive vs multi-drive** — single-drive deployments have no redundancy; always run multi-drive in prod.
- **Drive heterogeneity** — slow drives drag down EC sets; keep drives uniform per pool.
- **Network is critical** — saturated NICs are the most common bottleneck at scale.
- **Versioning + Object Lock** — required for compliance use cases; design lifecycle carefully or storage grows unbounded.
- **Console vs API auth** — Console uses different session model; SSO setup non-trivial.
- **Site replication conflicts** — last-writer-wins; design app for it.

## Interview Cheat Sheet
- **Tagline:** S3-compatible OSS object store; single binary; runs anywhere; the on-prem / hybrid / edge S3.
- **Best at:** on-prem lakes, regulated / air-gapped, hybrid clouds, Kubernetes-native object storage, dev/test.
- **Worst at:** if you can use S3 / GCS / Azure Blob managed, those are simpler; AGPL friction for SaaS embedding.
- **Scale:** multi-PB single deployments; billions of objects.
- **Shard by:** erasure sets distributed across drives in a server pool.
- **Consistency:** strong read-after-write and list-after-write.
- **Replicates how:** site replication (synchronous), bucket replication (async), within-pool erasure coding.
- **Killer alternative:** Ceph RGW, Cloudian, Pure FlashBlade, NetApp StorageGRID, AWS S3 (if cloud is OK).

## Further Reading
- Official docs: <https://min.io/docs/minio/linux/index.html>
- Erasure coding: <https://min.io/docs/minio/linux/operations/concepts/erasure-coding.html>
- Site replication: <https://min.io/docs/minio/linux/operations/install-deploy-manage/multi-site-replication.html>
- MinIO Operator (K8s): <https://min.io/docs/minio/kubernetes/upstream/index.html>
