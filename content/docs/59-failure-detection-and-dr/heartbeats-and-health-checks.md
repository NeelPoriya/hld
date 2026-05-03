---
title: "Heartbeats & Health Checks"
description: "How distributed systems decide who's alive — heartbeats, gossip protocols, phi-accrual failure detector, and Kubernetes-style liveness vs readiness vs startup probes."
---

> Topic: Key Concept · Category: Failure Detection & DR · Difficulty: Foundational

## TL;DR
**Failure detection** in distributed systems is the problem of "is node X still alive?" There's no perfect answer — networks lie, GCs pause, partitions split halves. Practical approaches:
- **Heartbeats** — periodic ping; missed beats → marked dead. Used by ZooKeeper, etcd, Cassandra, Kafka, almost everything.
- **Gossip protocols** — nodes randomly exchange membership info; failures detected probabilistically. Used by Cassandra, Consul, Memberlist, Serf, Akka Cluster.
- **Phi-accrual failure detector** — outputs a *suspicion level* rather than alive/dead binary; adapts to network conditions. Used by Cassandra, Akka.
- **Health check probes** (Kubernetes-style) — orchestrator polls each pod with **liveness** ("are you running?"), **readiness** ("can you serve?"), **startup** ("are you done initializing?") probes.

The interview-critical insight: **liveness vs readiness vs startup are different questions** with different consequences (restart vs route around vs delay routing). Conflating them is the most common Kubernetes deployment mistake.

## What problem does each solve?

### Heartbeats
- **"Is the leader still alive?"** for failover.
- **"Is this replica still in the cluster?"** for membership.
- **"Did this worker crash?"** for job redistribution.

### Gossip
- **Decentralized membership** — no single coordinator to ask.
- **Scales to hundreds of nodes** — each gossips with a few neighbors.
- **Eventually-consistent membership view.**

### Phi-accrual
- **Avoids hard alive/dead threshold** — gives a continuous "suspicion" value.
- **Adapts to network conditions** — slow network has higher tolerance.
- **Reduces false positives** in flaky networks.

### Kubernetes probes
- **Liveness:** "is the process responsive?" → restart pod if no.
- **Readiness:** "is the pod ready to serve?" → exclude from LB if no.
- **Startup:** "is initialization done?" → grace period for slow boots.

## How they work

### Heartbeat (basic)

```text
Leader               Followers
  │   ────heartbeat───►   │
  │   ────heartbeat───►   │
  │   X (leader crashes)  │
  │                       │   No heartbeat for 5s →
  │                       │   trigger leader election
```

### Gossip (SWIM-like)

```text
Every interval, node A randomly picks a peer:
   A ──ping──► B
        ←pong──

If no pong:
   A ──ping_req(B)──► C, D, E
        if any of C, D, E can reach B → B is alive (network split, A→B is broken)
        if none can reach → B is suspected → marked dead after grace period

Every gossip exchange piggybacks updates: "I just learned B is dead."
   →  membership state spreads exponentially fast.
```

### Phi-accrual

Inter-arrival time of heartbeats is monitored as a distribution. **φ (phi) value** represents how anomalous it is to have not received a heartbeat lately:

```text
   φ(t) = -log10(P(timeSinceLastHeartbeat > t | history))

   φ low (< 1) = pretty sure node is alive.
   φ high (> 8) = almost certainly dead.
   App threshold (e.g., 5) → "treat as suspect."
```

Used by Cassandra to decide when a peer is down.

### Kubernetes probes

```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  initialDelaySeconds: 60
  periodSeconds: 10
  failureThreshold: 3        # 3 misses → restart

readinessProbe:
  httpGet: { path: /ready, port: 8080 }
  periodSeconds: 5
  failureThreshold: 1        # 1 miss → take out of service

startupProbe:
  httpGet: { path: /startup, port: 8080 }
  periodSeconds: 5
  failureThreshold: 60       # up to 5 min for slow start
```

- **Liveness fail** → kubelet kills + restarts pod.
- **Readiness fail** → endpoint removed from `Service`; pod still running.
- **Startup fail** → pod killed; no liveness/readiness checks until startup succeeds.

## When to use each (real-world examples)

### Heartbeats
- **Leader-follower DB** — followers heartbeat to leader; leader heartbeats to followers.
- **Job queue workers** — heartbeat to coordinator; if missed, job re-assigned.
- **Sidekiq / BullMQ workers** — heartbeat to coordinator/queue.
- **Kafka consumers** — heartbeat to broker; missed → partition rebalance.
- **etcd / ZooKeeper / Consul** — Raft / ZAB heartbeats.

### Gossip
- **Cassandra cluster membership.**
- **Consul WAN/LAN gossip.**
- **HashiCorp Serf / Memberlist library.**
- **Akka Cluster.**
- **Ethereum / Bitcoin** peer discovery.

### Phi-accrual
- **Cassandra failure detection** between peers.
- **Akka Cluster** member detection.
- **Adaptive systems** with variable network conditions.

### Kubernetes probes
- **Every Kubernetes deployment** — almost mandatory.
- **Service mesh sidecars** also poll.
- **Cloud platforms** (ECS, Cloud Run, AKS, EKS, GKE).

## Things to consider / Trade-offs

### Heartbeats
- **Interval / timeout trade.** Faster detection = more spurious failures from GC pauses, network jitter. Typical: 1-5s heartbeats, 10-30s timeout.
- **Hard threshold problem** — if missed N in a row, mark dead. Works but binary.
- **Network spike** during normal load → false-dead alarms.
- **Asymmetric partitions** — A heartbeats reach B but not vice versa.

### Gossip
- **Eventually consistent** membership — node may see stale "alive" state briefly.
- **Random fanout** balances bandwidth + propagation speed.
- **Anti-entropy** — periodic full sync to fix gossip drift.
- **No SPOF** — but a partition causes both sides to think the other is gone.
- **Complexity** — gossip protocols are easy to get subtly wrong; use a proven library.

### Phi-accrual
- **Self-tuning** — adapts to actual network behavior.
- **Threshold tuning** — φ ≥ 8 is strong "dead"; 3-5 is "suspect."
- **Slow to react** in a fast-changing environment.

### Kubernetes probes
- **Liveness misuse is the #1 production bug.** A liveness probe that depends on DB / external service → DB blip kills all your pods → cascading failure.
- **Liveness should check ONLY the process itself** — "am I deadlocked?" not "is my DB up?"
- **Readiness can check dependencies** — "DB unreachable, don't route traffic to me."
- **Startup probe** — for slow-boot apps (JVM warm-up, large model load); separate from liveness.
- **Probe timeouts** — must be > expected response time; too tight = false fail.
- **Dependency on liveness for slow GC** — JVM with stop-the-world GC can fail liveness; tune.

### General
- **GC pauses** can cause 30s+ pauses in JVM apps; tune thresholds.
- **Slow disks** make health checks slow; don't disqualify yet-functional apps.
- **Cascading failures from probes** — if all pods fail readiness simultaneously, no one can serve.
- **Health check endpoints must not require auth** — unless internal LB.
- **Don't health-check downstream dependencies** in liveness — encourages cascading.
- **Avoid false-positive thrashing** — count consecutive failures; allow recovery time.
- **Separate health endpoint** from real traffic — `/healthz`, `/livez`, `/readyz`.

## Common pitfalls
- **Liveness probe checks DB connection** — DB down → all replicas restart → can't recover.
- **Readiness probe with no actual readiness signal** — returns 200 always; pods marked "ready" but not actually serving.
- **Probe timeout > probe interval** — overlapping probes; race conditions.
- **No initial delay** for slow-start apps — liveness fails before startup.
- **`failureThreshold: 1` on liveness** — single GC pause kills pod.
- **Gossip protocol homegrown** — distributed systems bugs.
- **Heartbeat interval too low** — network noise + storm.
- **Heartbeat interval too high** — slow detection during real failures.
- **Static phi threshold** — same threshold across networks of different qualities.
- **No graceful shutdown** — process killed mid-request when liveness fails.
- **Health checks consuming all DB connections** — no pool capacity for real work.
- **Probes that return 200 but log internal failure** — invisible to orchestrator.
- **Heartbeat from one place only** — symmetric verification missing.

## Interview Cheat Sheet
- **Heartbeats:** periodic ping; timeout → dead. Universal.
- **Gossip:** decentralized membership via random pairwise exchanges (SWIM, Memberlist, Serf).
- **Phi-accrual:** suspicion as continuous signal; adaptive to network; Cassandra / Akka use it.
- **Kubernetes probes:**
  - **Liveness:** "process alive?" → restart on fail.
  - **Readiness:** "ready to serve?" → take out of LB on fail.
  - **Startup:** "boot done?" → grace period.
- **Don't put dependencies in liveness** — root cause of many cascading-failure incidents.
- **Tune thresholds** for GC pauses + network jitter.
- **Always have separate health endpoint.**
- **Killer phrase:** "Liveness restarts; readiness routes around; startup waits — and liveness must NEVER depend on a downstream service or you'll cascade-fail your whole fleet on a DB blip."

## Related concepts
- [SLI / SLO / SLA](/docs/57-observability-and-sre/sli-slo-sla-error-budgets) — what health checks compose into.
- [Leader Election](/docs/52-consensus-and-coordination/leader-election) — depends on failure detection.
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — companion failure response.
- [Disaster Recovery](/docs/59-failure-detection-and-dr/disaster-recovery) — large-scale failure response.
- Concrete: [Kubernetes](/docs/19-container-orchestration/kubernetes), [Cassandra](/docs/03-wide-column-stores/cassandra), [etcd](/docs/02-key-value-stores/etcd), [Consul](/docs/34-dns-and-service-discovery/consul).
