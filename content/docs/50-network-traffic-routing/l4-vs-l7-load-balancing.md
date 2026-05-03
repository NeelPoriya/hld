---
title: "L4 vs L7 Load Balancing"
description: "The single most important decision when picking a load balancer — does it parse the request (L7) or just forward the TCP/UDP flow (L4)? What you gain, what you lose, what each costs."
---

> Topic: Key Concept · Category: Network & Traffic Routing · Difficulty: Foundational

## TL;DR
Load balancers operate at one of two OSI layers:
- **L4 (Transport)** — operates on **TCP / UDP**; sees only IP + port. **Doesn't open the payload.** Fast, low-latency, line-rate; can't make decisions based on URL, headers, cookies. Examples: **AWS NLB, GCP Network LB, F5 BIG-IP (L4 mode), HAProxy in `mode tcp`, IPVS, AWS Global Accelerator**.
- **L7 (Application)** — operates on **HTTP / HTTP/2 / gRPC / WebSocket / TLS-with-SNI**. **Parses the request.** Can route by URL path, host, header, cookie, method, JWT claim. Adds latency + CPU but is vastly more powerful. Examples: **AWS ALB, NGINX, HAProxy in `mode http`, Envoy, Traefik, Cloudflare LB, GCP HTTP(S) LB**.

Modern systems usually use **both** — L4 at the edge for raw TCP / TLS-passthrough + L7 internally for HTTP-aware routing.

## What problem does each solve?

### L4
- **Raw TCP / UDP** that's not HTTP (databases, MQTT, custom protocols).
- **TLS passthrough** — terminate TLS at the backend (e.g., for end-to-end encryption / mutual TLS).
- **Maximum throughput** — no parsing overhead.
- **Anycast IPs / static IPs** — most cloud "global" / "static IP" LBs are L4 (NLB, Global Accelerator).
- **Stateful protocols** that need persistent flows (gRPC streaming, WebSockets at the edge).

### L7
- **Path / host / header routing** — `/api → service-a`, `/static → CDN`.
- **TLS termination** — decrypt at LB; backends speak plaintext.
- **Compression / caching / WAF** — needs to read the payload.
- **Header rewriting** — `X-Forwarded-For`, `X-Request-ID`.
- **API-aware features** — JWT auth, rate limiting per endpoint, gRPC method-level routing.
- **Request mirroring / shadowing** — copy traffic to a staging service.
- **Canary / blue-green** routing rules.

## How they work

```text
L4 (TCP):
  Client          L4 LB              Backend
  ─────TCP SYN─────►──TCP SYN──────►
  ────TCP+TLS──────►─TCP+TLS───────►   (LB doesn't decrypt)
  ◄────data────────◄────data───────
  
  LB sees: src_ip:src_port → dst_ip:dst_port
  Decision: based on (src_ip, src_port, dst_ip, dst_port) — "5-tuple flow hash"

L7 (HTTP):
  Client          L7 LB              Backend
  ─────TLS handshake────►            
                   ◄──── certificate
  ─────HTTP request────►              (LB decrypts + parses)
                   ─── parse: GET /api/users, Host: x.com, Auth: Bearer xyz ───►
                   route based on path → backend pool
                   ─────HTTP request────► backend (re-encrypt or plain)
                   ◄────HTTP response────
  ◄───HTTP response────
  
  LB sees: full HTTP — path, headers, cookies, body
```

## Comparison

| Aspect | L4 | L7 |
|---|---|---|
| **Parses payload?** | No | Yes |
| **Routes by** | 5-tuple (src/dst IP/port) | path, host, header, cookie, method, JWT |
| **Latency overhead** | Microseconds (line-rate) | ~ms per request |
| **Throughput** | Tens of Gbps per node | Lower (CPU-bound on TLS + parse) |
| **TLS** | Passthrough | Termination (or re-encrypt) |
| **Sticky session** | By 5-tuple hash | By cookie / header / hash |
| **Health checks** | TCP / ICMP | HTTP `/health` with response code |
| **WAF / rate limit** | No | Yes |
| **Caching** | No | Yes |
| **Compression** | No | Yes |
| **Header rewriting** | No | Yes |
| **gRPC routing** | At-connection only | Per-method / per-path |
| **WebSocket** | Native (TCP) | Yes; needs explicit support |
| **Static IP / anycast** | Yes (most cloud L4 LBs) | Sometimes |
| **Cross-region failover** | Yes | Yes |
| **Per-route policy** | No | Yes |
| **Cost** | Cheap | More expensive |
| **Observability** | Connection-level metrics | Request-level metrics |

## When to use which (real-world examples)

### Pick L4
- **Database load balancing** — Postgres, MySQL, MongoDB connections (PgBouncer, ProxySQL fronted by NLB).
- **MQTT / AMQP / Kafka brokers** — non-HTTP protocols.
- **TLS passthrough requirements** — end-to-end TLS, mutual TLS where backend handles cert.
- **Global anycast IP** — AWS Global Accelerator, GCP TCP/UDP LB.
- **Game servers / VoIP / WebRTC TURN** — UDP traffic.
- **Service mesh data plane** in some configurations.
- **Maximum throughput / lowest latency** for high-rate stateless traffic.
- **Custom binary protocols** — anything not HTTP.
- **Edge ingress to L7 internal LBs** — L4 at edge for static IP + DDoS, then L7 internally.

### Pick L7
- **HTTP / HTTPS APIs** — anything user-facing on the web.
- **gRPC** — needs HTTP/2 awareness for proper load balancing across streams.
- **WebSockets** for HTTP-aware features (rate limiting, auth at LB).
- **Path-based microservice routing** — `/api → A`, `/admin → B`.
- **TLS termination at edge** — terminate once, plaintext or re-encrypt internally.
- **WAF / bot defense / API security** — need payload visibility.
- **Caching, compression, content rewriting**.
- **Canary deploys / blue-green** with header-based routing.
- **Multi-tenant SaaS** — host-based routing (`tenant1.app.com`, `tenant2.app.com`).

### Production examples
- **Netflix** — NLB at edge, Zuul (L7) internally, Envoy as service mesh.
- **AWS reference architecture** — Route 53 → NLB (static IP / DDoS) → ALB (L7 routing) → ECS/EKS.
- **Cloudflare** — global anycast L4 + L7 reverse-proxy with WAF + rules.
- **Google Cloud** — GCP HTTPS LB is L7; GCP TCP/UDP LB is L4.
- **Kubernetes** — `Service` (L4 via kube-proxy) + `Ingress` (L7 via NGINX / Traefik / Envoy).
- **Service mesh** — Envoy sidecars do L7 internally; sometimes L4 between sidecars.

## Things to consider / Trade-offs
- **TLS termination location:**
  - **At L7 LB (edge)** — easiest; keys live at edge.
  - **TLS passthrough via L4** — backend terminates; needs cert mgmt at backend.
  - **TLS re-encryption** — L7 terminates + re-encrypts to backend; mTLS internally.
- **L4 + L7 stacked** — common pattern: L4 for static IP + DDoS at edge → L7 for routing.
- **gRPC and HTTP/2** — L4 LB sees one connection per client → unbalanced because all gRPC requests share that connection. Use L7 (Envoy / ALB) for per-request balancing.
- **Long-lived connections** at L4 → load drifts; rebalance by closing connections periodically.
- **Connection vs request balancing** — L4 = connection; L7 = request.
- **Health checks** — L4 only knows "TCP port open"; L7 can check HTTP 200 on `/health`.
- **DDoS** — L4 mitigates volumetric (SYN floods); L7 mitigates application-layer (slowloris, request floods).
- **WebSocket through L7** — must support upgrade; some old L7 LBs break.
- **HTTP/3 (QUIC over UDP)** — L4 forwards UDP; L7 needs explicit HTTP/3 support.
- **Cost** — L7 LBs typically priced per-request + per-LCU; L4 priced per-flow / per-Mbps.
- **Latency budget** — L7 adds 1-5ms typical; usually negligible vs network RTT.
- **Connection limits** — L4 supports millions of concurrent connections more easily.

## Common pitfalls
- **gRPC behind L4 LB** — first connection sticks to one backend; all subsequent gRPC requests go there → imbalanced. Use L7.
- **TLS passthrough but expecting WAF / header rewriting** — impossible; you can't read encrypted bytes.
- **Health check on L4 = "port open"** — backend port open but app crashed; LB happily sends traffic. Use L7 health checks.
- **L7 LB without HTTP/2 support** for modern backends — falls back to HTTP/1.1, hurts perf.
- **Sticky session at L7 by cookie** — works for browsers; mobile clients without cookie support break.
- **Static IP requirement met with L7 only** — many L7 LBs don't have stable IPs; pair with L4 in front.
- **Forgetting `X-Forwarded-For`** — backend logs LB IP, not client IP.
- **`X-Forwarded-For` trusted blindly** — clients can spoof; only trust if behind your own LB chain.
- **Connection draining missing** — deploy kicks active connections.
- **Different algorithm interaction** — L7 path-based routing + L4 hash routing can produce surprising stickiness.

## Interview Cheat Sheet
- **L4:** TCP / UDP only; 5-tuple routing; no payload visibility; fast; static IP / anycast / DDoS; non-HTTP protocols.
- **L7:** HTTP / HTTP/2 / gRPC / WebSocket; parses request; path / host / header / cookie / JWT routing; TLS termination; WAF; caching.
- **L4 fast + opaque, L7 flexible + smart.**
- **Stack them:** L4 at edge for static IP + DDoS → L7 internally for routing.
- **gRPC + HTTP/2 → use L7** for per-request balancing.
- **TLS termination:** L7 at edge is the default; L4 passthrough for end-to-end / mTLS.
- **Real systems:** AWS NLB (L4) + ALB (L7); GCP TCP/UDP LB + HTTPS LB; Envoy (both); Cloudflare (both).
- **Kubernetes:** Service is L4; Ingress is L7.

## Related concepts
- [Forward Proxy vs Reverse Proxy vs LB vs API Gateway](/docs/50-network-traffic-routing/proxy-vs-reverse-proxy-vs-lb-vs-gateway) — broader map.
- [Load Balancing Algorithms](/docs/50-network-traffic-routing/load-balancing-algorithms) — what each layer can do.
- Concrete: [NGINX](/docs/16-load-balancing-and-proxies/nginx), [HAProxy](/docs/16-load-balancing-and-proxies/haproxy), [Envoy](/docs/16-load-balancing-and-proxies/envoy), AWS ALB / NLB, GCP LBs, Cloudflare LB, Kubernetes Service / Ingress.
