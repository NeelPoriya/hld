---
title: "Load Balancing Algorithms"
description: "How a load balancer actually picks a backend — round-robin, least-connections, least-response-time, hash-based, weighted, power-of-two-choices, EWMA, latency-based GLB, and the consistent-hashing variants used in real systems."
---

> Topic: Key Concept · Category: Network & Traffic Routing · Difficulty: Foundational

## TL;DR
A load balancer's value is the algorithm it uses to choose a backend. Trade-offs:
- **Round-robin** — simple, oblivious to backend load. Default in many LBs.
- **Random** — surprisingly competitive; no shared state needed.
- **Least connections** — picks backend with fewest active connections; great for long-lived connections (WebSockets, gRPC).
- **Least response time / EWMA** — picks backend with lowest recent latency; adaptive.
- **Power of two random choices (P2C)** — pick 2 random backends, send to the less-loaded one. **Near-optimal balance with almost zero state.** Used by **Netflix, Envoy, Twitter Finagle**.
- **Hash-based / consistent hashing** — same key always goes to the same backend (sticky sessions, cache locality).
- **Weighted variants** — handle heterogeneous backends and gradual rollouts.
- **Latency-based / geographic** — route users to the nearest healthy region (Cloudflare, Route 53, GCLB).

In practice: **L4 LBs** use simpler algorithms (round-robin, least-connections, hash); **L7 LBs** can use anything because they parse the request.

## What problem does it solve?
- **Distribute traffic evenly** across N backends.
- **Avoid hot replicas** under skewed load.
- **Adapt to heterogeneous backends** (different CPU / capacity).
- **Handle slow / overloaded backends gracefully** without scheduling more work to them.
- **Provide locality** — same user / cache key on the same backend (cache hits).
- **Failover** — exclude unhealthy backends.

## Algorithms in depth

### 1. Round-robin
- Cycle through backends in order.
- ✅ Simple; no state per request.
- ❌ Oblivious to actual load; one slow backend gets the same share.

### 2. Random
- Pick uniformly at random.
- ✅ No shared state; trivially distributed.
- ❌ Variance — short-term imbalance.

### 3. Least connections
- Pick backend with the fewest currently-open connections.
- ✅ Great for **long-lived connections** (WebSocket, HTTP/2, gRPC streaming).
- ❌ Requires per-LB-instance counter; LBs in a cluster see only their own connections (unless coordinated).

### 4. Least response time (EWMA)
- Track exponentially-weighted moving average of recent response times per backend.
- Pick the one with the lowest EWMA.
- ✅ Adapts to backend speed differences.
- ❌ Slow to react to sudden change; requires per-backend state.

### 5. Power of two random choices (P2C, "join-the-shorter-queue-of-two")
- Pick **two random** backends; send to the **less-loaded** of the two.
- Theoretical result: P2C balances **as well as picking the global minimum** with vastly less coordination.
- ✅ Almost no state; near-optimal balance under heavy load.
- ❌ Slightly worse than perfect "least-connections" with full coordination, but far simpler.
- **Used by:** Envoy (default `LEAST_REQUEST`), Netflix Ribbon, Twitter Finagle, Zuul, NGINX (with `random` directive + `two least_conn`).

### 6. Hash-based / consistent hashing
- `backend = hash(key) → ring → next clockwise`.
- Same key always routes to the same backend (cache locality, sticky sessions).
- See [Consistent Hashing](/docs/41-caching/consistent-hashing) for details.
- ✅ Locality + stable mapping under add/remove.
- ❌ Hot key still goes to one backend; doesn't account for load.

### 7. IP hash
- Hash by client IP. Cheap + sticky for client without cookies.
- ❌ NAT (corporate / mobile) collapses many users to one backend; doesn't survive client IP changes.

### 8. Weighted (any of the above + weights)
- Assign capacity weights — backend with weight 2 gets 2× the traffic.
- Used for **heterogeneous backends** or **canary / gradual rollouts** ("send 5% to v2").
- Most LBs support weighted variants of round-robin / least-connections / random.

### 9. Latency-based / geographic / global LB
- For multi-region: route to the **nearest healthy region** (RTT-based, geo-IP-based).
- AWS Route 53 latency-based routing, AWS Global Accelerator, GCP GLB, Cloudflare LB, Akamai.
- ✅ Sub-100ms latency for global users.
- ❌ Cross-region failover complexity; data-residency interactions.

### 10. Resource-aware (CPU / memory)
- Backends report load (CPU, memory, queue depth) to LB; LB factors into decision.
- ✅ Most accurate.
- ❌ Highest coordination cost; mostly used in service meshes / advanced LBs (Envoy with metrics-aware routing).

## When to use which (real-world examples)
- **Stateless HTTP requests, similar work per request:** **round-robin** or **P2C**.
- **WebSocket / gRPC streaming / long-lived connections:** **least connections**.
- **Cache servers / sticky session:** **consistent hash** by user/session ID.
- **Heterogeneous backends or canary:** **weighted** round-robin.
- **High-scale, no state coordination available:** **P2C**.
- **Multi-region / global users:** **latency-based** + **geographic**.
- **Adaptive to slow backends:** **EWMA / least-response-time**.

### Production examples
- **NGINX** — `round-robin` (default), `least_conn`, `ip_hash`, `hash $key`, `random two least_conn` (P2C).
- **HAProxy** — `roundrobin`, `leastconn`, `static-rr`, `source` (IP hash), `random` (P2C with `random(2)`).
- **Envoy** — `ROUND_ROBIN`, `LEAST_REQUEST` (P2C by default), `RANDOM`, `RING_HASH`, `MAGLEV`.
- **AWS ALB / NLB** — round-robin / least-outstanding (ALB) / flow hash (NLB).
- **AWS Route 53** — geographic, latency-based, weighted, failover.
- **Cloudflare LB** — round-robin, geo-steered, dynamic-steered.
- **Kubernetes Service** — IPVS modes: round-robin (default), least-conn, source-hash, destination-hash.
- **Twitter Finagle / Netflix Ribbon** — P2C + EWMA (latency-aware P2C).
- **Cassandra coordinators** — hash-based by partition key (clients pick the right replica).
- **Redis Cluster** — hash slots (16384 slots), client-side routing.

## Things to consider / Trade-offs
- **State coordination cost** — algorithms that require shared state across LB replicas don't scale; P2C / random are stateless and scale linearly.
- **Long-lived connections + round-robin = imbalance** — once a connection lives, it stays; load drifts. Use least-connections.
- **Health checks are the most important "algorithm"** — no algorithm helps if you send traffic to dead backends. Active (probes) + passive (consecutive failures).
- **Slow start** — newly-added backends shouldn't get full traffic immediately; ramp up.
- **Outlier detection** — Envoy's "eject backend if N consecutive failures"; sometimes more important than the routing algorithm.
- **Sticky sessions** — necessary for stateful backends but defeats horizontal scaling; prefer stateless + shared state in Redis.
- **L4 vs L7 algorithm capability** — L4 is mostly tuple-hash; L7 can route on path/header.
- **Hot key under hash-based LB** — single user dominates one backend; layer in P2C as fallback.
- **Algorithm interaction with autoscaling** — newly-launched backends need to absorb load smoothly; least-conn + slow-start is best.
- **Connection draining on deploy** — LB must stop sending new traffic but allow existing connections to finish.
- **Affinity for cache locality** — consistent hash + small "fallback to least-conn" chain.
- **Connections vs requests** — least-connections counts active TCP/HTTP-2 connections; in HTTP/1.1 a single connection serves serial requests; under HTTP/2 a single connection multiplexes many requests. Algorithms must account for protocol.

## Common pitfalls
- **Round-robin on long-lived connections** — load drifts; some replicas saturate.
- **Hash-by-IP under corporate NAT** — one IP becomes a hot backend.
- **No health checking** — sending requests to dead backends; user-visible 5xx.
- **Health check too aggressive** — flapping backends thrash.
- **Health check too loose** — slow backend keeps receiving traffic.
- **Sticky sessions when not needed** — limits horizontal scale.
- **Geographic routing without DR** — failed region traps users in error loop.
- **Stale connection pool** — client keeps reusing connections to a now-removed backend.
- **L7 LB without HTTP/2 support** for gRPC backends — protocol mismatch causes connection storms.
- **Different LB algorithm in dev vs prod** — surprising prod-only behavior.
- **Treating LB algorithm as "the magic"** — most prod issues are bad health checks, slow starts, draining bugs, NOT the algorithm.

## Interview Cheat Sheet
- **Default pick:** P2C (Envoy) or least-connections; round-robin if backends are uniform.
- **WebSocket / gRPC streaming:** least-connections.
- **Cache locality / sticky:** consistent hashing on session/user ID.
- **Heterogeneous backends or canary:** weighted variants.
- **Multi-region:** latency-based / geographic at global LB tier.
- **P2C** = pick 2 random, send to less-loaded — near-optimal with almost no state.
- **Pair with:** active + passive health checks, slow-start, outlier detection, connection draining.
- **L4 vs L7:** L4 fast + opaque (TCP); L7 flexible + parses HTTP.

## Related concepts
- [Forward Proxy vs Reverse Proxy vs LB vs API Gateway](/docs/50-network-traffic-routing/proxy-vs-reverse-proxy-vs-lb-vs-gateway) — the conceptual map.
- [Consistent Hashing](/docs/41-caching/consistent-hashing) — sticky / cache-locality routing.
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — works with LB outlier detection.
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — often enforced at LB.
- Concrete: [NGINX](/docs/16-load-balancing-and-proxies/nginx), [HAProxy](/docs/16-load-balancing-and-proxies/haproxy), [Envoy](/docs/16-load-balancing-and-proxies/envoy), AWS ELB / ALB / NLB, Google Cloud LB, Cloudflare LB.
