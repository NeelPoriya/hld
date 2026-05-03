---
title: "HyperLogLog & Count-Min Sketch"
description: "Two more probabilistic data structures every HLD interview covers — HyperLogLog estimates cardinality (unique count) in 12KB, Count-Min Sketch estimates per-key frequency in fixed memory. Used for analytics, top-K, and rate limiting."
---

> Topic: Key Concept · Category: Probabilistic Data Structures · Difficulty: Foundational

## TL;DR
Two more probabilistic data structures every HLD interview asks about:
- **HyperLogLog (HLL)** — estimates the **cardinality** of a multiset (`COUNT DISTINCT`) using **only ~12 KB** for billions of distinct elements, with ~0.81% standard error. Used by **Redis `PFCOUNT`, BigQuery `APPROX_COUNT_DISTINCT`, Presto `approx_distinct`, Druid, ClickHouse `uniq`, Snowflake, Cloudflare analytics**.
- **Count-Min Sketch (CMS)** — estimates the **frequency** of each element ("how many times have I seen X?") in fixed memory, with one-sided error (overestimates only). Used for **top-K queries, rate limiting, heavy-hitter detection, network monitoring (NetFlow), Cassandra read repairs**.

Both trade exactness for tiny memory and constant-time updates — perfect for streaming / unbounded data.

## What problem do they solve?

### HyperLogLog
- **Counting distinct elements at scale.** "How many unique visitors today?" Naive set requires N × bytes; HLL needs 12 KB regardless of N.
- **Mergeable estimates** — daily sketches can be merged into weekly / monthly without re-scanning raw data.
- **Streaming cardinality** — single pass over the data; no sort.

### Count-Min Sketch
- **Per-key frequency in bounded memory** — track "how many times did I see key X?" without a hash map sized to N.
- **Heavy hitter detection** — find the top-K most frequent keys.
- **Rate limiting at scale** — track per-IP request counts in fixed memory across millions of IPs.
- **Network monitoring** — DDoS detection on Tbps streams.

## How they work

### HyperLogLog
1. Hash each element to a bit string.
2. Count **leading zeros** in the hash; longer leading-zero runs are rarer.
3. Maintain `2^p` "buckets" indexed by the first `p` bits of the hash.
4. Each bucket stores the maximum leading-zero count seen.
5. **Cardinality estimate** = `α * m^2 / sum(2^-bucket[i])`.

Roughly: "the more rare patterns I see, the more elements there must be."

```text
Hash 1010001100... → bucket = 10, leading zeros after p = 2 → bucket[10] = max(bucket[10], 2)
Hash 0001011100... → bucket = 00, leading zeros after p = 3 → bucket[00] = max(bucket[00], 3)

# 16K buckets × 6 bits each = ~12 KB → estimates billions with ~1% error.
```

### Count-Min Sketch
1. 2D array `count[d][w]` of small counters; `d` rows, `w` columns.
2. `d` independent hash functions, each → column index in `[0, w)`.
3. **Increment** `key`: for each row `i`, `count[i][h_i(key)] += 1`.
4. **Query** `key`: return `min(count[i][h_i(key)] for i in 0..d)`.

Min over rows because collisions only inflate counts → overestimate, never underestimate.

```text
counters initialized to 0. d=4 rows, w=2048 cols.

INC "alice":
  row 0, col h0("alice")=42  → count[0][42] += 1
  row 1, col h1("alice")=915 → count[1][915] += 1
  row 2, col h2("alice")=1700→ count[2][1700] += 1
  row 3, col h3("alice")=33  → count[3][33] += 1

QUERY "alice":
  return min(count[0][42], count[1][915], count[2][1700], count[3][33])
```

## When to use them (real-world examples)

### HyperLogLog
- **Redis HyperLogLog** (`PFADD`, `PFCOUNT`) — unique-visitor counting.
- **Google BigQuery `APPROX_COUNT_DISTINCT`** — petabyte-scale cardinality.
- **Presto / Trino `approx_distinct`** — federated queries across data lakes.
- **ClickHouse `uniq` / `uniqCombined`** — real-time analytics.
- **Druid HyperUnique** — sub-second OLAP cardinality.
- **Snowflake `APPROX_COUNT_DISTINCT`** — analytical workloads.
- **Cloudflare analytics dashboards** — uniques per zone.
- **Mobile / web analytics** — distinct devices / users / IPs over time windows.
- **A/B testing platforms** — unique experiment-cohort sizes.
- **Netflix / Instagram engagement metrics** — unique viewers / engagers.
- **Network monitoring** — distinct source IPs in a stream.

### Count-Min Sketch
- **Top-K queries** — combined with min-heap to track most frequent items.
- **Heavy hitter detection** — find the top-1% of users / IPs / URLs in a stream.
- **Rate limiting** — per-IP request counts in fixed memory across millions of IPs.
- **DDoS detection** — flag IPs with > threshold requests/sec.
- **Approximate join key estimation** — query optimizer estimates join cardinality.
- **Cassandra read repair statistics** — track per-key read-repair rates.
- **NetFlow / sFlow analysis** — packet-level counts at line rate.
- **Recommendation systems** — track item view counts at scale.
- **Database query optimizers** — frequency estimation for join planning.
- **Cardinality bounds for ML feature engineering.**

## When NOT to use them
- **You need exact counts** — billing / payments / regulatory; use a real DB or `COUNT(DISTINCT)`.
- **Tiny cardinalities** — direct hash set is faster + exact.
- **Need to enumerate elements** — neither structure stores the actual elements.
- **Adversarial inputs** — attacker forces hash collisions to inflate CMS estimates.
- **Highly skewed CMS workloads** — heavy hitters dominate; CMS has bounded relative error but skewed errors land on rare items.
- **Need per-key minimum frequency or deletions** — CMS overestimates, not under; deletion turns it into "Count-Min-Mean" sketches.

## Things to consider / Trade-offs

### HyperLogLog
- **Standard error ≈ 1.04 / sqrt(m)** — `m=16384` ⇒ ~0.81%; `m=65536` ⇒ ~0.4%.
- **Mergeable** — `HLL(A ∪ B) = bucket-wise-max(HLL(A), HLL(B))`. Daily ⇒ weekly without re-scanning.
- **Hash function quality matters** — uniform distribution required.
- **Sparse representation** for low cardinalities saves space (Redis uses dense + sparse).
- **HLL++** (Google variant) better at low and very high cardinalities.

### Count-Min Sketch
- **Error bound** — overestimate by at most `epsilon * total_count` with probability `1 - delta`.
- **Sizing:** `w = ceil(e / ε)`, `d = ceil(ln(1/δ))`. Common: `ε=0.001, δ=0.001` → `w≈2718, d≈7`.
- **Conservative update** — only increment the smallest counter (tighter error).
- **Pair with min-heap** for top-K (Misra-Gries variant).
- **No false negatives in "appears" queries** — count ≥ true count.
- **Memory ∝ 1/ε** — tighter accuracy = much more memory.
- **Mergeable** — element-wise sum of two sketches.

## Common pitfalls
- **Treating estimates as exact** — they're not.
- **Wrong sizing** — too few buckets / hash rows → unusable error.
- **Reusing one CMS for many keys + asking for relative ratios** — error compounds.
- **Bad hash functions** — correlated hashes break independence assumption.
- **Adversarial inputs** without keyed hashing — attacker forges collisions.
- **Counting events through a CMS that has no time decay** — counts grow forever; use sliding-window variants.
- **Comparing HLLs from different parameter values** — incompatible.
- **HLL very low cardinality bias** — use sparse representation or LinearCounting fallback.
- **CMS with skewed distributions** — heavy hitters cause global error inflation.

## Interview Cheat Sheet
- **HLL:** estimates cardinality; ~12 KB for billions of elements; ~1% error; mergeable across windows; Redis `PF*`, BigQuery `APPROX_COUNT_DISTINCT`, ClickHouse `uniq`, Druid HyperUnique.
- **CMS:** estimates per-key frequency; fixed memory; one-sided error (overestimate only); top-K via min-heap; rate limiting + DDoS detection + heavy hitters.
- **Both:** streaming, mergeable, single-pass, no element enumeration.
- **Sizing:** HLL by sqrt(buckets); CMS by `(ε, δ)`.
- **Always pair with downstream verification** if exactness matters.
- **Hash function is critical** — MurmurHash3 / xxHash typical.
- **Cousin structures:** [Bloom Filter](/docs/49-probabilistic-data-structures/bloom-filter), MinHash (similarity), t-digest (quantiles), reservoir sampling.

## Related concepts
- [Bloom Filter](/docs/49-probabilistic-data-structures/bloom-filter) — set membership; sister structure.
- [Caching Strategies](/docs/41-caching/caching-strategies) — top-K via CMS for cache-aware eviction.
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — CMS-backed per-IP counters.
- Concrete: [Redis](/docs/02-key-value-stores/redis) HyperLogLog, [BigQuery](/docs/12-data-warehousing/bigquery), [ClickHouse](/docs/12-data-warehousing/clickhouse), [Druid](/docs/12-data-warehousing/druid), [Snowflake](/docs/12-data-warehousing/snowflake).
