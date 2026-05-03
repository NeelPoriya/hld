---
title: "Bloom Filter"
description: "A space-efficient probabilistic 'is this element possibly in the set?' filter — no false negatives, tunable false positive rate. Used everywhere from RocksDB to CDN caches to Bitcoin SPV."
---

> Topic: Key Concept · Category: Probabilistic Data Structures · Difficulty: Foundational

## TL;DR
A **Bloom filter** is a tiny, fixed-size bit array combined with `k` independent hash functions, answering one question: **"Is this element possibly in the set, or definitely not?"** It can produce **false positives** ("yes, maybe in") but **never false negatives** ("definitely not in" is reliable). With ~10 bits per element, you get a ~1% false-positive rate — far smaller than storing the actual set. Used everywhere you can save expensive lookups by filtering out things you definitely don't need to check: **LSM-tree storage engines** (RocksDB, Cassandra), **CDN cache penetration protection**, **databases avoiding disk reads**, **Bitcoin SPV nodes**, **distributed cache** front-doors, **password breach checks** (HIBP API), **web crawlers** (have I seen this URL?).

## What problem does it solve?
- **Avoid expensive lookups.** "Don't go to disk / network / DB unless the key might exist."
- **Save space.** Storing the actual set may take MB-GB; the Bloom filter takes KB.
- **Cache penetration defense.** Attacker spams nonexistent keys; Bloom filter says "definitely not in cache" → return 404 fast without hitting DB.
- **LSM-tree read amplification.** Without Bloom filters, every miss reads many SSTables; with one, most misses skip disk.
- **Distributed deduplication** — "have I seen this event before?" with bounded memory.

## How it works

```text
Bit array of size m, k hash functions:

  array (m=16):  0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0

  Insert "alice":
     h1("alice") = 3   → set bit 3
     h2("alice") = 8   → set bit 8
     h3("alice") = 13  → set bit 13

  array:         0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0

  Insert "bob":
     h1("bob") = 8     → already set
     h2("bob") = 11    → set
     h3("bob") = 14    → set

  array:         0 0 0 1 0 0 0 0 1 0 0 1 0 1 1 0

  Test "carol":
     h1=3 (set), h2=11 (set), h3=2 (NOT set) → DEFINITELY NOT in set.

  Test "alice":
     all 3 bits set → POSSIBLY in set (could be false positive).
```

### Sizing
- `m` bits, `n` elements, `k` hash functions.
- Optimal `k = (m / n) * ln(2)`.
- False-positive rate ≈ `(1 - e^(-kn/m))^k`.
- Rule of thumb: **~10 bits per element ⇒ ~1% FPR; ~14 bits ⇒ ~0.1%**; ~20 bits ⇒ ~0.001%.

### Variants
- **Counting Bloom filter** — replace bits with small counters; supports deletion.
- **Cuckoo filter** — supports deletion + better space efficiency at low FPR.
- **Scalable Bloom filter** — grows dynamically as elements are added.
- **Partitioned Bloom filter** — split bit array into k partitions; one bit per hash.
- **Quotient filter** — cache-friendly alternative.
- **Compressed Bloom filter** — for transmission (e.g., Bitcoin SPV).

## When to use it (real-world examples)
- **LSM-tree engines** ([RocksDB](/docs/02-key-value-stores/redis), Cassandra, LevelDB, HBase) — every SSTable has a Bloom filter; reads check filter first to skip irrelevant SSTables.
- **CDN cache penetration** — "is this URL even valid?" before querying origin.
- **Database query planners** — Postgres BRIN-like indexes use Bloom-style sketches.
- **Bitcoin SPV (Simplified Payment Verification)** — Bloom filter sent to full nodes to filter relevant transactions.
- **HIBP (haveibeenpwned)** — reduce server lookups by checking if password might be breached.
- **Web crawlers** — "have I crawled this URL?" with bounded memory.
- **Akamai / Cloudflare cache lookups** — Bloom filter in front of cache.
- **Distributed deduplication** — Kafka Streams / Flink event dedup buffers.
- **Email / spam filters** — "is this URL/email likely spam?"
- **Recommendation systems** — "have we shown this item to this user?"
- **Distributed databases** — Cassandra's `bloom_filter_fp_chance` per table.
- **Service mesh telemetry** — high-cardinality span filtering.
- **Genomics / k-mer matching** — DNA sequence presence checks.

## When NOT to use it
- **Need deletions** with traditional Bloom filter — use **counting Bloom filter** or **cuckoo filter** instead.
- **Need exact answers** — Bloom filter has false positives. Pair with the actual store for a confirmation.
- **Tiny sets** — direct lookup is faster than Bloom filter overhead.
- **Highly skewed access patterns to small subset** — direct cache may serve hits without filter overhead.
- **Adversarial inputs targeting the FP rate** — attacker can find inputs that hash to set bits → use cuckoo / cryptographic hashes.
- **Need to enumerate / list elements** — Bloom filter doesn't support this.

## Things to consider / Trade-offs
- **False-positive rate is configurable** — pick based on the cost of a false positive (extra DB read = cheap; extra HTTP call = expensive).
- **Cannot delete** — once a bit is set, you don't know which element set it. Use counting / cuckoo for delete support.
- **Hash function choice** — usually two independent hashes (e.g., MurmurHash3, xxHash) combined to simulate `k` hashes (`h_i(x) = h1(x) + i * h2(x)`).
- **Cardinality estimation** — Bloom filter's bit-set ratio implicitly tells you the cardinality.
- **Filter sizing in production** — pick m + k for expected n + target FPR; oversize a bit since misestimating n raises FPR.
- **Persistent vs in-memory** — many systems serialize Bloom filters to disk (alongside SSTables).
- **Distributed Bloom filters** — share via gossip; small enough to broadcast.
- **FPR drift over time** — as set grows beyond designed n, FPR rises sharply; rebuild or use scalable variant.
- **Combine with cache** — Bloom filter as L0 → cache as L1 → DB as L2.
- **Memory budget** — 10 bits / element × 100M elements = 125 MB. Pretty tiny.

## Common pitfalls
- **Confusing "possibly in" with "in"** — every hit must be verified with the actual store unless false positives are acceptable.
- **Adding more elements than designed** — FPR explodes. Plan capacity.
- **Reusing the filter across versions / shards** without re-creating — different hash seeds produce wrong filters.
- **Forgetting deletions** — naive Bloom filter has no delete; recreate periodically or use counting variant.
- **Single hash + multiple seeds** — when poorly chosen seeds produce correlated hashes; use proven hash functions.
- **Hash function with poor distribution** — uneven bit setting; FPR worse than predicted.
- **Filter not in hot path** — built but never actually consulted before disk; defeats purpose.
- **Deserialization on every query** — cache the in-memory representation.
- **Overly aggressive FPR target** — bigger filters use more RAM; trade-off vs hit ratio.

## Interview Cheat Sheet
- **One-liner:** small bit array + k hashes; "definitely not" or "possibly yes"; no false negatives, tunable false positives.
- **Sizing:** ~10 bits per element ⇒ ~1% FPR; tune via `m / n` ratio.
- **Used to:** skip expensive lookups (disk, network, DB) when item likely doesn't exist.
- **Used by:** RocksDB / Cassandra / LevelDB SSTables, CDN cache penetration defense, Bitcoin SPV, web crawlers, HIBP API, distributed dedup.
- **No deletions** — use counting Bloom filter or cuckoo filter if needed.
- **Companion structures:** HyperLogLog (cardinality), Count-Min Sketch (frequency), MinHash (similarity).
- **Always verify positives** — Bloom filter is a filter, not a confirmation.

## Related concepts
- [Caching Strategies](/docs/41-caching/caching-strategies) — Bloom filter as cache-penetration defense.
- [LSM Trees](/docs/48-storage-internals/lsm-vs-btree) — Bloom filter is critical for LSM read perf.
- [Consistent Hashing](/docs/41-caching/consistent-hashing) — peer probabilistic structure for sharding.
- Concrete: [Cassandra](/docs/03-wide-column-stores/cassandra), [HBase](/docs/03-wide-column-stores/hbase), [RocksDB / LevelDB] (under almost every distributed KV), Bitcoin SPV BIP 37.
