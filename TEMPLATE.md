# Per-Technology Documentation Template

Every file in this repo follows the structure below. Use it for any new technology you add.

---

# `<Technology Name>`

> Category: `<e.g. Wide-Column NoSQL>` · Written in: `<language>` · License: `<OSS / Proprietary>`

## TL;DR
One short paragraph: what is it, who uses it, when do you reach for it. Aim for 3–4 sentences.

## What problem does it solve?
Describe the pain point the technology was built for. Include a 1-line "before vs after" if helpful.

## When to use
- Bullet list of concrete scenarios.
- Use **examples** (e.g. "user session store for a 10M MAU app").

## When NOT to use
- Anti-patterns and known weaknesses.
- Always include a "use X instead" suggestion.

## Data Model
- How data is structured (rows, documents, columns, key-value, graph, etc.).
- Show a small concrete example.
- Mention what's mandatory vs optional (e.g. partition key required).

## Architecture & Internals
- Key components and how they fit together.
- Mention disk layout / storage engine when relevant (B-tree vs LSM-tree, inverted index, log-structured, etc.).
- Diagram-friendly bullets ("clients → coordinator → replicas").

## Consistency Model
- ACID? BASE? Tunable?
- Where it lands on the CAP triangle, in plain English.
- Default isolation level and what anomalies are possible.

## Replication
- How copies are kept in sync (sync vs async, leader-based vs leaderless, quorum).
- Failover behavior and data loss window.

## Partitioning / Sharding
- How data is split across nodes.
- What the **shard key** is and what makes a good one.
- What goes wrong with a bad key (hot shards, scan-everywhere queries).

## Scale of a Single Instance
- Rough numbers for **one node**: dataset size, ops/sec, connections.
- "When do I have to shard?" rule-of-thumb thresholds.
- Vertical scaling ceiling vs horizontal scaling story.

## Performance Characteristics
- Read vs write latency.
- Throughput numbers (orders of magnitude, not exact).
- Where bottlenecks usually appear (CPU, network, disk IOPS, GC pause, etc.).

## Trade-offs
| Strength | Weakness |
|---|---|
| ... | ... |

## Common HLD Patterns
- Where this tech typically appears in a system diagram.
- Combinations: "X is usually paired with Y for Z reason."

## Common Pitfalls / Gotchas
- Real-world traps interviewers love to probe.

## Interview Cheat Sheet
- **Tagline:** one-sentence pitch.
- **Best at:** ...
- **Worst at:** ...
- **Scale of one node:** ...
- **Shard by:** ...
- **Consistency:** ...
- **Replicates how:** ...
- **Killer alternative:** ...

## Further Reading
- Official docs link.
- Notable blog posts / papers.
