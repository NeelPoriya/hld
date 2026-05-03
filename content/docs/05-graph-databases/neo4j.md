---
title: "Neo4j"
description: "Neo4j is the most popular native graph database: stores nodes and relationships as first-class citizens, queried with the Cypher language. Reach for it when relationships ARE the data — fraud rings, recommendations, knowledge graphs, social networks."
---

> Category: Graph Database (Property Graph) · Written in: Java · License: GPLv3 (Community Edition) / Commercial (Enterprise)

## TL;DR
Neo4j is a **native graph database** built around the property graph model: data is **nodes** (entities) connected by **relationships** (edges), each with key-value properties. You query it with **Cypher**, a SQL-like language designed for traversals. It shines on questions where the answer requires walking many hops of relationships ("friends of friends who bought X" / "all accounts within 4 hops of this fraudulent one"), which would be a nightmare of N joins in SQL. Reach for it when **the structure of the connections is itself the most valuable signal** in your data.

## What problem does it solve?
You have data where the **relationships are as important as the entities** — and you keep writing SQL with 6-table joins that take 30 seconds and timeout under load.

Examples where graphs win:
- "Find all customers within 3 hops of a known fraudster."
- "Recommend products bought by people who bought what you bought."
- "Show all people, projects and skills involved in this org chart."
- "What's the shortest path between author A and author B in DBLP?"

In SQL, every "hop" is a JOIN. In a graph DB, hops are **O(1) pointer traversals** because edges are stored as direct references between nodes — no joining indexes, no scanning rows.

## When to use
- **Fraud detection / AML** — find rings, mules, suspicious paths through accounts.
- **Recommendations** — collaborative filtering, "people also bought," knowledge-graph-driven recs.
- **Knowledge graphs** — Wikipedia-style entity webs, semantic search backbones.
- **Social networks** — followers, friend-of-friend, influence scoring.
- **Network / IT topology** — "what other servers depend on this Kubernetes pod?"
- **Master Data Management (MDM)** — connecting people, products, places across systems.
- Any domain where you naturally draw arrows on a whiteboard.

## When NOT to use
- **Tabular, mostly-flat data** with simple lookups — PostgreSQL is faster, cheaper, and has more talent available.
- **Massive write throughput** (>50k writes/sec sustained on a single instance) — graph DBs were optimized for traversals, not bulk inserts.
- **Aggregations and analytics over billions of rows** — use ClickHouse, BigQuery, or Spark.
- **Time-series telemetry** — use InfluxDB / TimescaleDB.
- **Just because you have a "user" and a "post"** — that's not a graph problem unless you traverse it.

## Data Model
- **Node** — an entity. Has a label (or several) and properties.
- **Relationship** — a typed, directed edge between two nodes. Also has properties.
- **Property** — a key-value pair on either a node or a relationship.

Example:
```
(:Person {name:"Alice"})-[:FOLLOWS {since:2024}]->(:Person {name:"Bob"})
(:Person {name:"Alice"})-[:LIVES_IN]->(:City {name:"Bangalore"})
```

Cypher query — "find Bob's friends who live in the same city as Alice":
```cypher
MATCH (alice:Person {name:"Alice"})-[:LIVES_IN]->(city)
MATCH (bob:Person {name:"Bob"})-[:FOLLOWS]->(friend)-[:LIVES_IN]->(city)
RETURN friend.name;
```

A SQL version of this would need 3 joins and an explicit grouping. The Cypher MATCH reads like a sentence.

## Architecture & Internals
- **Native pointer-based storage** — every relationship record stores fixed-size pointers to its two end-node records and to the "next" / "previous" relationship records in linked lists. Walking a relationship is O(1), not a B-tree lookup.
- **Page cache** — primary working set lives in RAM, on top of the OS page cache. Performance correlates strongly with how much of the graph fits in RAM.
- **Indexes** — optional, used to find your **starting node**. After that, traversals are pointer-following.
- **Storage layout** — separate fixed-record-size files: `nodes.db`, `relationships.db`, `propertyStore.db`, `labels.db`. Fixed-size means O(1) record offset = `id * recordSize`.
- **Query engine** — Cypher → AST → logical plan → physical plan with traversal operators (`Expand(All)`, `Filter`, `NodeIndexSeek`).
- **Transactions** — fully ACID, write-ahead log (WAL).

## Consistency Model
- **ACID** — full transactions, including multi-node atomic commits in cluster mode.
- Default isolation: **read committed**.
- **Causal cluster** (Enterprise): provides causal consistency to clients via **bookmarks** — "I want to read at least everything I've already written."

CAP-wise: Neo4j Enterprise causal cluster is CP (it stops accepting writes if a quorum is lost).

## Replication
- **Single instance** (Community Edition, default): no replication. Backup-and-restore is your DR story.
- **Causal Cluster** (Enterprise):
  - 1 leader + N followers using a **Raft consensus group** for the **core** members.
  - Optional **read replicas** that pull asynchronously from the cluster — used to scale reads.
  - Writes go to the leader, replicate synchronously to a quorum of cores.
  - Failover is automatic.

Failover RPO is essentially zero (data committed at quorum is safe). RTO depends on Raft re-election (seconds).

## Partitioning / Sharding
This is graph DBs' weakest point. Hard problem: a graph by definition has edges across any two arbitrary nodes — **a good shard cut would minimize cross-shard edges**, which is NP-hard.

Neo4j's approach (since 4.0): **Fabric**.
- Manually shard by domain — e.g. `customers`, `products`, `transactions` each in their own DB.
- Cross-shard queries are explicitly **federated** via Cypher `USE` clauses or proxies.
- For most use cases, you **don't shard** Neo4j. Instead you scale up (bigger machine) and out for reads via replicas.

**Hot-shard / "supernode" pitfall:** a node with millions of relationships (e.g. a celebrity user with 50M followers) can blow up traversal cost. Strategies:
- Add an intermediate `Group` node so each celebrity has 1000 groups of 50K followers each.
- Use relationship-type-specific indexes since Neo4j 4.3.

## Scale of a Single Instance
- **Storage:** Neo4j routinely handles **billions of nodes and relationships** on a single machine if you have enough RAM.
- **Working set:** keep at least the topology + index pages in RAM. Practical sweet spot: hundreds of millions of nodes / hundreds of millions of relationships per instance.
- **Read throughput:** 1k–10k traversal queries/sec depending on hop count and complexity.
- **Write throughput:** 5k–20k writes/sec on a single instance; bulk loaders (`neo4j-admin import`) can do millions/sec offline.
- **When to scale out:** when working set spills out of RAM and traversals start hitting disk → latency cliff. Up to that point, a bigger box (RAM-rich) is the right answer.

## Performance Characteristics
- **Find-and-traverse from a known starting node:** sub-ms to a few ms — independent of total graph size, dependent on **path length × branching factor**.
- **Query without a starting index:** as bad as scanning all nodes — always pin your starting point with an index.
- **Pure write throughput:** modest by NoSQL standards (graph integrity has a cost).
- Bottlenecks: page cache miss rate (huge cliff), supernodes, very deep variable-length paths (`*1..15`).

## Trade-offs

| Strength | Weakness |
|---|---|
| Native graph storage → traversals are O(1) per hop | Writes are slower than KV / wide-column DBs |
| Cypher is intuitive for graph problems | New language for the team to learn |
| Mature ACID transactions on a graph | Sharding story is weak (Fabric is manual) |
| Excellent visual tooling (Neo4j Browser, Bloom) | Memory-hungry; sized for working set in RAM |
| Strong ecosystem (graph data science library, integrations) | License gotcha — Community is GPLv3, Enterprise is paid |
| Causal cluster gives HA + read scaling | Harder to do massive horizontal scale than Cassandra/Dynamo |

## Common HLD Patterns
- **Fraud rings detection** — Kafka → Spark/Flink stream processor → write entities + relationships into Neo4j → background "ring detection" Cypher job → alerts.
- **Recommendation engine** — periodic ETL from PostgreSQL into Neo4j → online traversal queries serve personalized recs in <50ms.
- **Identity resolution / MDM** — multiple source systems write into Neo4j; matching rules find duplicates as connected components.
- **Knowledge graph for search** — entities + relations from Wikipedia / domain corpus → Neo4j powers semantic disambiguation in front of ElasticSearch.

## Common Pitfalls / Gotchas
- **No starting index** → query plans devolve to full node scan. Always have an index on the property you start `MATCH` from.
- **Variable-length paths** (`-[*1..10]->`) without a length cap will explode on supernodes.
- **Forgetting that the page cache is everything** — under-provisioning RAM is the #1 cause of "Neo4j is slow."
- **Misusing it as your primary OLTP store** — for tabular workloads, you'll regret choosing a graph DB.
- **License confusion** — Community Edition is GPLv3 (open source but with copyleft); Enterprise (clustering, more security) is commercial.
- **GraphQL ≠ Graph DB** — GraphQL is a query language for HTTP APIs. Neo4j is a graph **database**. Different layers.

## Interview Cheat Sheet
- **Tagline:** Native property-graph DB where relationships are first-class, queried with Cypher.
- **Best at:** multi-hop relationship queries — fraud rings, recommendations, knowledge graphs.
- **Worst at:** flat tabular data, massive write throughput, sharding-heavy workloads.
- **Scale of one node:** billions of nodes/edges if working set fits in RAM; ~10k QPS reads, ~10k writes/sec.
- **Shard by:** generally don't — scale up + read replicas. Use Fabric for manual domain shards.
- **Consistency:** ACID, read-committed, causal-consistency in cluster mode.
- **Replicates how:** Raft-based core cluster + async read replicas (Enterprise).
- **Killer alternative:** Amazon Neptune (managed, multi-model), TigerGraph (fast at scale), JanusGraph (open-source, Cassandra-backed).

## Further Reading
- Official docs: <https://neo4j.com/docs/>
- Cypher language: <https://neo4j.com/docs/cypher-manual/>
- "Graph Databases" book by Robinson, Webber, Eifrem (free PDF from Neo4j)
- Native graph storage explained: <https://neo4j.com/developer/graph-database/>
