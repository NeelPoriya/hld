---
title: "Consistent Hashing"
description: "Distribute keys across N shards so that adding or removing a shard remaps only ~1/N of keys instead of nearly all of them — the bedrock algorithm of every distributed cache, key-value store, load balancer, and CDN."
---

> Topic: Key Concept · Category: Caching / Sharding · Difficulty: Foundational

## TL;DR
**Naive sharding** uses `node = hash(key) mod N`. Add or remove a node → almost every key gets remapped → catastrophic. **Consistent hashing** maps both keys and nodes onto a **virtual ring** (typically 0 to 2³² − 1); each key is owned by the **next node clockwise** on the ring. Adding or removing a node only remaps the keys between that node and its predecessor — about **1/N of keys**. With **virtual nodes (vnodes)** (each physical node owns many ring positions), load is smooth even with few nodes. Used by **Memcached client libraries**, **Cassandra**, **DynamoDB**, **Riak**, **CDN tier hashing**, **HAProxy**, and most distributed caches.

## What problem does it solve?
- **Resharding pain.** With `hash(key) mod N`, going from 4 → 5 nodes remaps ~80% of keys. Caches go cold; databases churn.
- **Skewed load.** Plain hashing without vnodes can give one node 2× another node's data.
- **Bounded disruption.** A node failure should only affect its own keys, not the whole cluster.
- **Decentralized routing.** Every client can compute the owning node locally — no master / coordinator required.

## How it works

```text
Ring (0 to 2^32 - 1):

       (hash space)
            0
            |
            *--- Node A
       /         \
   keys           Node B
       \         /
            Node C
```

1. Pick a hash function (e.g., MurmurHash3, xxHash) with output range `[0, 2³²)`.
2. For each node, hash some identifier (`hash(node_id)`) → place on the ring.
3. For each key, hash → place on the ring. Walk clockwise → first node is the owner.

### Virtual nodes (vnodes)
- Without vnodes, 3 physical nodes give 3 ring positions and very uneven loads.
- With **100–256 vnodes per physical node**, each physical node owns hundreds of small arcs. Load distribution becomes smooth and rebalancing on join/leave is fine-grained.
- Cassandra defaults to **256 tokens per node**; DynamoDB partitions are similar.

### Variants
- **Jump consistent hash** (Google, 2014): no ring; fixed-size bucket function `jump_hash(key, num_buckets)`. Faster, but only works when nodes are numbered 0..N-1 and you only add nodes at the end.
- **Rendezvous (Highest Random Weight) hashing**: for each key, compute `hash(key, node_i)` for every node; pick the node with the highest score. No ring; perfect balance; cost is O(N) per lookup.
- **Maglev hashing** (Google's load balancer): table-based; combines speed of mod-hashing with consistency on remap.

## When to use it (real-world examples)
- **Memcached client libraries** (Ketama, libmemcached) — clients pick the right server with no coordination.
- **Cassandra / ScyllaDB / DynamoDB / Riak** — partition the keyspace across nodes; vnodes for balance.
- **Distributed Redis / Redis Cluster** — Redis Cluster uses **hash slots** (16384 slots, modulo) — a coarser but related idea.
- **CDNs** — Cloudflare's tiered cache uses consistent hashing across edge nodes so a given URL hits the same upstream.
- **Layer-7 load balancers** with sticky sessions — `hash($cookie_session)` keyed routing in NGINX / HAProxy / Envoy.
- **Distributed object stores** (Ceph CRUSH map is a relative; Swift uses ring hashing).
- **Service discovery + sharding** — assign incoming jobs to consumers (Kafka consumer-group rebalance is a related problem).
- **Distributed rate limiters** — pick the same node for a given user_id consistently.

## When NOT to use it
- **Trivial single-node caches** — overkill; just use a single Redis.
- **Workloads with extreme hot keys** — even with vnodes, one key still goes to one node. Use **request coalescing** or **shard-the-hot-key** patterns.
- **You need range queries** — consistent hashing is range-blind. Use range / directory-based partitioning instead (HBase, Spanner).
- **Replicated read-only data** — replication, not sharding, is the right answer.
- **Tiny number of nodes (1–2)** — distribution irregularity dominates; use simple modulo.

## Things to consider / Trade-offs
- **Vnodes count** — too few (e.g., 16) gives uneven load; too many (10K+) wastes memory in routing tables. 100–256 is typical.
- **Replication on the ring** — to replicate a key 3×, store on the next 3 distinct physical nodes clockwise (Cassandra's pattern).
- **Bounded loads** — even with vnodes, statistical variance can give one node 1.3× the load. **Bounded-load consistent hashing** (Mirrokni et al., 2016) caps this.
- **Hot key amplification** — vnodes don't help one specific key; pair with replication or local L1.
- **Choice of hash function** — MurmurHash3 / xxHash beat MD5 / SHA-1 in speed; cryptographic strength is not needed.
- **Membership changes** — gossip (Cassandra, Memberlist) or coordination service (Zookeeper / etcd) propagates ring updates.
- **Range scan support** — order-preserving partitioners (used in early HBase) re-introduce hot ranges; hash partitioners avoid this but lose ordered scan.
- **Replica failover** — when a node leaves, its keys are re-served by the next node clockwise; that node may suddenly absorb 1/N of cluster traffic.

## Common pitfalls
- **Forgetting vnodes** — gives "stripe" distribution where some nodes are 2–3× hotter.
- **Using `mod` instead of consistent hashing** in a Memcached client — every cache resize blows away the cache.
- **Mixing different hash functions** in client and server — keys land in the wrong place.
- **Treating Redis Cluster's hash slots as consistent hashing** — they're a fixed 16384 slot space; resharding requires explicit slot migration.
- **Not pinning vnode count** in deployment — different versions of clients computing different rings → split-brain routing.
- **Hash collisions in routing** — astronomically rare with 32+ bit hashes, but use SHA-1+ if collision-resistant routing is required.

## Interview Cheat Sheet
- **One-liner:** map keys + nodes onto a ring; key → first node clockwise; only ~1/N of keys move when nodes join/leave.
- **Why vnodes:** smooth load with few physical nodes.
- **Replication:** store on next K distinct physical nodes clockwise.
- **Used by:** Cassandra, DynamoDB, Memcached clients (Ketama), Riak, Maglev, NGINX `hash` directive, every modern distributed cache.
- **Variants to know:** jump hash (Google), rendezvous hashing (HRW), Maglev hashing.
- **Common mistake:** using plain `hash(key) % N` and asking why caches melt on a resize.

## Related concepts
- [Sharding & Partitioning](/docs/42-data-distribution/sharding-and-partitioning) — broader landscape.
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — pair with hashing for HA.
- [Caching Strategies](/docs/41-caching/caching-strategies) — where consistent hashing actually pays off.
- Concrete systems: [Cassandra](/docs/03-wide-column-stores/cassandra), [DynamoDB](/docs/02-key-value-stores/dynamodb), [Redis](/docs/02-key-value-stores/redis), [Memcached](/docs/02-key-value-stores/memcached).
