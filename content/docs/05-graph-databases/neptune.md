---
title: "Amazon Neptune"
description: "Amazon Neptune is AWS's fully-managed graph database. Speaks both property graph (Gremlin/openCypher) and RDF (SPARQL), making it the default graph DB on AWS when you don't want to operate Neo4j yourself."
---

> Category: Graph Database (Property Graph + RDF) · Provider: AWS · License: Proprietary (managed service)

## TL;DR
Neptune is **Amazon's fully-managed graph database**. It's the AWS answer to "I want graph-shaped queries without running my own Neo4j cluster." It's unique among graph DBs in supporting **two graph models**: a property graph (queried with **Gremlin** or **openCypher**) and **RDF** (queried with **SPARQL**). It's built on the same Aurora-style cloud-native storage layer — separating compute from storage, replicating data 6 ways across 3 AZs — so durability and availability are AWS-level out of the box. You reach for it when you need graph queries, you're already on AWS, and **operational simplicity matters more than peak performance**.

## What problem does it solve?
Same problem domain as Neo4j (relationship-heavy data: fraud, recommendations, knowledge graphs, identity), with two AWS-flavored extras:
- **You don't want to run a cluster.** No JVM tuning, no patching, no Raft babysitting.
- **You want both property-graph and RDF support** in one engine — useful when integrating semantic-web data (DBpedia, Wikidata, life-sciences ontologies) with operational graph data.

## When to use
- **You're on AWS** and need a graph DB without the operational overhead of self-hosted Neo4j.
- **Multi-model graph needs** — your team is split between developers (who like Gremlin/Cypher) and data scientists / semantic-web folks (who use SPARQL on RDF).
- **High availability and durability are non-negotiable** — Neptune storage is 6-way replicated across 3 AZs by default.
- **Read-heavy workloads** — you can attach up to **15 read replicas** to scale out queries.
- Use cases: identity graphs, fraud detection, recommendations, knowledge graphs, life-sciences ontologies.

## When NOT to use
- **You're not on AWS** — there's no on-prem or other-cloud version.
- **You need huge write throughput** — Neptune writes go through a single primary; if you're hammering writes, look at TigerGraph or sharded systems.
- **You want a hybrid OLTP+graph in one DB** — Neptune is graph-only.
- **You need the latest Cypher features** — Neptune supports openCypher but lags Neo4j in feature parity.
- **Graph is a small part of your workload** — you'll pay for a managed service you barely use.

## Data Model
Neptune supports **two parallel models in the same cluster** (but not the same instance):
1. **Property Graph** — nodes & edges with properties (like Neo4j).
2. **RDF Triples** — Subject-Predicate-Object triples (W3C standard).

Property graph example (Gremlin):
```groovy
g.addV('Person').property('name','Alice').as('a')
 .addV('Person').property('name','Bob').as('b')
 .addE('FOLLOWS').from('a').to('b')
```

RDF triple example (SPARQL):
```turtle
<alice> <follows> <bob> .
<alice> <livesIn> <bangalore> .
```

Querying — find Alice's followers (Gremlin):
```groovy
g.V().has('Person','name','Alice').in('FOLLOWS').values('name')
```

Querying — same in SPARQL:
```sparql
SELECT ?follower WHERE {
  ?follower :follows <alice> .
}
```

## Architecture & Internals
- **Compute / storage separation** — same architecture as Aurora.
  - Compute: 1 primary writer + up to 15 read replicas, each its own EC2-sized instance class.
  - Storage: a distributed, log-structured layer that auto-grows from 10 GB up to **128 TB**, replicated 6 times across 3 AZs.
- **No traditional WAL on the compute layer** — writes go straight to the storage cluster as redo log records; durability is guaranteed by 4-of-6 quorum.
- **Multi-language SDK** — Gremlin (TinkerPop), openCypher, SPARQL all hit the same engine.
- **Bulk Loader** — for ingesting large CSV/RDF files from S3 (much faster than line-by-line writes).

## Consistency Model
- **ACID** within a single transaction.
- **Eventually-consistent reads** are the default on read replicas (with low replica lag, typically <100ms).
- **Read-after-write** consistency available against the primary endpoint.
- Default isolation: read-committed.

## Replication
- **Inside a region:** primary writer + up to **15 read replicas**, all sharing the same distributed storage layer (so replicas don't ship data — they just read different log positions). Replica lag is usually 10–100ms.
- **Across regions:** **Neptune Global Database** — replicate to up to 5 secondary regions with sub-second cross-region replication lag.
- Failover: AWS handles primary failover automatically; promotion of a replica typically takes 30–60 seconds.

## Partitioning / Sharding
**Neptune does not shard.** Entire graph lives on the writer node's storage cluster (up to 128 TB). The thinking: most graph workloads aren't bottlenecked on storage but on traversal compute, and the storage layer scales transparently.

Practical implication: **a single Neptune cluster is your graph universe**. If you have 10x more graph data than 128 TB, you have to manually partition into multiple clusters — and cross-cluster traversals aren't supported natively.

**Hot-key / supernode** is still the same problem as Neo4j. Mitigation is identical: either model-around it (intermediate nodes), or accept that traversing a node with 50M edges will be slow.

## Scale of a Single Instance
- **Storage:** auto-scales 10 GB → 128 TB.
- **Compute:** instance classes from `db.t3.medium` to `db.r6g.16xlarge`. The biggest box has 64 vCPU and 512 GB RAM.
- **Reads:** 1 primary + 15 replicas = 16 nodes serving reads. Each large instance can sustain thousands of traversal queries per second.
- **Writes:** funneled through the single primary — typical ceiling **10–50k writes/sec** depending on graph density.
- **When to scale up:** add bigger instance class. **Scale out:** add read replicas. **Cross-region:** Global Database.

## Performance Characteristics
- **Cold cache vs warm cache** is the dominant factor — like Neo4j, RAM-resident graph traversal is fast (single-digit ms); disk-bound traversal is slow.
- **Cross-region read latency** in Global Database: ~1 second replica lag, then query returns at local instance speed.
- **Bulk Loader from S3:** millions of records/sec for cold-start loads.
- Bottlenecks: writer node CPU + storage write quorum, supernodes, naïve queries without a starting index.

## Trade-offs

| Strength | Weakness |
|---|---|
| Fully managed — zero ops, automatic patching | Locked to AWS |
| Three query languages (Gremlin / Cypher / SPARQL) | None of the three is best-in-class — Neo4j is better for Cypher, GraphDB for SPARQL |
| 6-way replicated storage = extreme durability | More expensive than self-hosted Neo4j Community |
| Up to 15 read replicas for scale-out reads | Single writer — write throughput ceiling |
| Global Database for cross-region replication | No multi-master — can't write actively in two regions |
| Auto-scaling storage to 128 TB | Hard ceiling at 128 TB; sharding is manual |
| ML integration (Neptune ML for node classification) | Smaller community than Neo4j |

## Common HLD Patterns
- **Fraud detection on AWS** — DynamoDB / RDS captures transactions → Lambda or Glue → Neptune as the graph layer → Amazon SageMaker / Neptune ML for scoring.
- **Identity resolution** — multiple source systems → Glue ETL → Neptune; entity-matching queries find duplicates.
- **Knowledge graph backing semantic search** — RDF data from Wikidata / domain ontologies + property graph operational data → Neptune → OpenSearch fronts user queries.
- **Recommendations** — user-item interactions in Neptune; nightly ML job computes embeddings; serving layer hits Neptune via openCypher for "items connected to items you bought."

## Common Pitfalls / Gotchas
- **You can't switch between property graph and RDF on the same instance** — you choose at cluster creation. Plan up front.
- **Bulk Loader is the only fast way to load big data.** Inserting one Gremlin record at a time is ~100×–1000× slower. For initial loads, dump to S3 and use the loader.
- **Gremlin / Cypher feature parity with Neo4j is not 100%.** Some Cypher features Neo4j supports (e.g. `CALL` procedures) aren't available.
- **No native cross-region active-active.** Global Database is **read-only** in secondary regions.
- **Supernodes still hurt.** Neptune doesn't magically solve the Neo4j supernode problem.
- **Cost.** Read replicas are full-priced instances; 16-node clusters get expensive fast.
- **Network egress** for big result sets — graph queries can return millions of edges; budget for that.

## Interview Cheat Sheet
- **Tagline:** AWS's fully-managed graph DB; speaks Gremlin, openCypher, and SPARQL on Aurora-style storage.
- **Best at:** AWS-native deployments where ops simplicity > peak performance; multi-model graph needs.
- **Worst at:** non-AWS, very write-heavy graphs, latest Cypher features.
- **Scale of one cluster:** up to 128 TB; 1 writer + 15 read replicas; up to 5 cross-region replica clusters.
- **Shard by:** doesn't shard within a cluster; for >128 TB, manually split into multiple clusters.
- **Consistency:** ACID; eventual on replicas (low ms lag); read-after-write on primary.
- **Replicates how:** 6-way distributed storage in-region; async replication for cross-region Global Database.
- **Killer alternative:** Neo4j (better Cypher, better tooling, runs anywhere); TigerGraph (massive scale); JanusGraph (open, Cassandra-backed).

## Further Reading
- Official docs: <https://docs.aws.amazon.com/neptune/>
- Choosing a query language: <https://docs.aws.amazon.com/neptune/latest/userguide/intro-query-languages.html>
- Bulk loader: <https://docs.aws.amazon.com/neptune/latest/userguide/bulk-load.html>
- Neptune ML overview: <https://docs.aws.amazon.com/neptune/latest/userguide/machine-learning.html>
