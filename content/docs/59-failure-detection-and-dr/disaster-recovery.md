---
title: "Disaster Recovery: RPO, RTO, Multi-Region Patterns"
description: "How systems survive datacenter / region loss — RPO (data loss tolerance), RTO (downtime tolerance), and the four multi-region patterns: backup/restore, pilot light, warm standby, multi-site active-active. Cost vs recovery time."
---

> Topic: Key Concept · Category: Failure Detection & DR · Difficulty: Intermediate

## TL;DR
Disaster recovery (DR) plans for **catastrophic regional / datacenter failures**. Two core metrics:
- **RPO (Recovery Point Objective)** — how much data can you afford to lose? "Last 5 min of writes" = RPO 5min. Driven by replication strategy.
- **RTO (Recovery Time Objective)** — how long can you be down? "Back up in 1 hour" = RTO 1h. Driven by failover mechanism.

Four canonical patterns, ordered by cost + recovery speed:
- **Backup / restore** — restore from periodic backups. Cheapest. RPO/RTO of hours.
- **Pilot light** — minimal infra always running in DR region; scale up on disaster. RPO/RTO of minutes-to-hours.
- **Warm standby** — full infra running but at reduced scale; route traffic on disaster. RPO/RTO of minutes.
- **Multi-site active-active** — full infra running in multiple regions; users always served by all. RPO ~0; RTO ~0 (with caveats).

The deeper truth: **DR plans are tested or they don't exist.** Most "DR strategies" never run failover until disaster strikes — and discover they don't work.

## What problem does it solve?
- **Region / datacenter loss** — fire, flood, power, ISP outage, AWS us-east-1 going down (notoriously, every few years).
- **Data center evacuation** — physical destruction, regulatory forcing.
- **Compliance** — many regulators require documented DR.
- **Customer SLAs** — uptime promises require DR.
- **Catastrophic data corruption** — ransomware, schema migration gone wrong (DR with point-in-time recovery).

## How RPO + RTO work

```text
   Last good backup            Disaster strikes      Recovery complete
            │                         │                         │
   ─────────┼─────────────────────────┼─────────────────────────┼────►
            ◄────── RPO ──────────────►◄────── RTO ──────────────►
            "lost data window"           "downtime window"

   RPO = data loss tolerance (driven by replication interval)
   RTO = downtime tolerance (driven by failover mechanism)
```

| RPO | Implementation |
|---|---|
| Hours | Daily snapshot |
| Minutes | Periodic snapshot + WAL shipping |
| Seconds | Streaming replication |
| ~0 | Synchronous replication (with latency cost) |

| RTO | Implementation |
|---|---|
| Hours | Backup/restore from cold |
| Minutes | Warm standby ready to scale |
| Seconds | Active-passive with auto-failover |
| ~0 | Active-active with traffic-routing |

## The four patterns

### 1. Backup / restore
- Periodic snapshots → off-region storage (S3 cross-region, GCS multi-region, Azure GRS).
- On disaster: spin up fresh region; restore.
- **RPO:** snapshot interval (hours).
- **RTO:** time to provision + restore (hours).
- **Cost:** low — only storage.
- **Use:** non-critical apps, internal tools.

### 2. Pilot light
- DR region has the **smallest footprint** that's "ready to scale" — DB replicas, but no app servers (or 1 small one).
- On disaster: DNS flip + autoscale up.
- **RPO:** seconds-to-minutes (replication).
- **RTO:** 10-60 min (autoscale + warmup).
- **Cost:** moderate — DB replication + minimal compute.
- **Use:** business-critical apps with budget constraints.

### 3. Warm standby
- DR region has **scaled-down full infra** running.
- On disaster: route traffic + scale up.
- **RPO:** seconds.
- **RTO:** minutes.
- **Cost:** higher — DB + persistent compute always on.
- **Use:** core business systems.

### 4. Multi-site active-active
- All regions take live traffic.
- On disaster: stop routing to dead region; others absorb load.
- **RPO:** ~0 (multi-region replication).
- **RTO:** ~0 (other regions already live).
- **Cost:** highest — full infra in every region; cross-region replication overhead.
- **Use:** mission-critical (banks, FAANG-scale apps).

## When to use each (real-world examples)

### Backup / restore
- **Internal admin tools.**
- **Dev / test environments.**
- **Cost-sensitive non-revenue-critical workloads.**
- **Periodic batch reports.**

### Pilot light
- **B2B SaaS with daytime-only usage** — overnight outage tolerable.
- **Internal services.**
- **Apps with budgets that don't justify warm standby.**

### Warm standby
- **Mid-tier B2B SaaS with global users** — couple-of-minute recovery acceptable.
- **E-commerce with off-peak failover capacity.**
- **Mission-critical systems where RTO ~ minutes is OK.**

### Multi-site active-active
- **Banks, payments** — Stripe, PayPal, fintech.
- **Real-time consumer apps** — Twitter, Instagram, TikTok, Spotify.
- **Critical infrastructure** — DNS providers, CDNs.
- **Trading platforms.**
- **Any service where minutes of downtime = millions in losses.**

## Things to consider / Trade-offs

### Replication strategy drives RPO
- **Async replication** — RPO ≈ replication lag (seconds-minutes).
- **Sync replication** — RPO = 0, but write latency = max(local, remote).
- **Geo-replication for storage** — S3 cross-region replication (CRR), Azure GRS, GCP multi-region buckets.

### Failover mechanism drives RTO
- **Manual** — operator clicks button. Hours.
- **Semi-automatic** — automation runs, but human approval. Minutes.
- **Automatic** — DNS / LB auto-fails over. Seconds-to-minutes.
- **Active-active** — no "failover" event; traffic naturally redistributes.

### DR testing
- **Untested DR plans don't work.** Period.
- **Game day exercises** — quarterly / annual; intentionally fail a region.
- **Chaos engineering** — Netflix Chaos Monkey, AWS Fault Injection Service.
- **Validate runbooks** — every runbook must work end-to-end.

### Cost
- **Active-active** doubles or triples your infra cost.
- **Cross-region data transfer** is expensive (~$0.02/GB on AWS).
- **Sync replication latency** can hurt UX more than the DR gain.

### Data consistency in active-active
- **Multi-leader writes** require conflict resolution (LWW, CRDT, app logic).
- **Linearizable cross-region writes** = expensive (Spanner / TrueTime / Paxos cross-region).
- **Region-affinity** — pin user's writes to one region; failover on disaster.

### DNS as failover mechanism
- **TTL = your RTO floor.** TTL=60s = 60s RTO at best.
- **Health-check-driven DNS** — Route 53 / GCP Cloud DNS / Cloudflare.
- **Cached DNS at clients** ignores TTL changes; can extend RTO.

### Anycast for failover
- **BGP withdrawal** — announce IP from one region only when others fail.
- **Faster than DNS** — minutes, not TTL-bounded.

### Edge / global LB
- **Cloudflare / AWS Global Accelerator** — anycast IP routes to healthy region.
- **Active-active simplified.**

### Special: ransomware DR
- **Air-gapped backups** — disconnected from prod network.
- **Immutable backups** — S3 Object Lock, write-once.
- **Frequent restores tested** — backup is useless without proven restore.

## Common pitfalls
- **DR plan never tested** — finds out it doesn't work during disaster.
- **Backups not restorable** — corruption silently for months.
- **Single-region replication** — DR region is the same region.
- **Cross-region replication lag undetected** — RPO is much worse than thought.
- **Failover process requires services that are down** — circular dependency.
- **Runbook out of date** — points to deprecated tools.
- **DNS TTL too long** — RTO 1h instead of 5min.
- **Active-active with single-leader DB** — no actual fault tolerance.
- **Cross-region cost forgotten** — bills triple after enabling.
- **Conflict resolution undefined** in active-active multi-leader.
- **Backup encryption keys lost** — backups are encrypted bricks.
- **Permissions / IAM not replicated to DR** — failover fails because deploy role missing.
- **Stateful services with no replication** — instant data loss.
- **Trusting cloud-provider DR claims** without testing — even AWS regions fail.
- **Don't forget DNS / TLS / monitoring infrastructure DR.**

## Interview Cheat Sheet
- **RPO** = data loss; **RTO** = downtime.
- **Four patterns**, increasing cost and recovery speed:
  1. Backup / restore.
  2. Pilot light.
  3. Warm standby.
  4. Multi-site active-active.
- **Active-active** for tier-1 systems; everything else picks based on cost vs RTO/RPO.
- **DR plans must be tested** — game days, chaos engineering.
- **DNS TTL is your failover SLA floor.**
- **Cross-region replication is the expensive part.**
- **Don't forget secrets / IAM / DNS / monitoring** in DR plan.
- **Multi-leader active-active** needs conflict resolution.
- **AWS multi-region**: S3 CRR, RDS read replicas, Aurora Global, DynamoDB Global Tables, Route 53 health-checks.
- **Killer phrase:** "DR is a function of RPO and RTO, both of which are determined by your replication strategy and failover mechanism — and the only valid DR plan is the one you've tested."

## Related concepts
- [Replication Strategies](/docs/42-data-distribution/replication-strategies) — drives RPO.
- [DNS, Anycast & GeoDNS](/docs/56-network-protocols-and-realtime/dns-and-anycast) — failover routing.
- [Heartbeats & Health Checks](/docs/59-failure-detection-and-dr/heartbeats-and-health-checks) — failure detection.
- [SLI/SLO/SLA](/docs/57-observability-and-sre/sli-slo-sla-error-budgets) — DR drives SLA.
- Concrete: [Route 53](/docs/34-dns-and-service-discovery/route53), [Spanner](/docs/01-relational-databases/spanner), [Aurora](/docs/01-relational-databases/aurora), [DynamoDB](/docs/02-key-value-stores/dynamodb).
