---
title: "Forward Proxy vs Reverse Proxy vs Load Balancer vs API Gateway"
description: "The four most-confused pieces of network plumbing in system design interviews — what they actually are, where each sits, what they each do, when they overlap, and the diagrams to draw on the whiteboard."
---

> Topic: Key Concept · Category: Network & Traffic Routing · Difficulty: Foundational

## TL;DR
These four terms get muddled constantly:
- **Forward proxy** — sits in front of **clients**; clients explicitly send their traffic through it; the destination server doesn't know who the original client is. Used for **outbound filtering, anonymity, corporate egress, ad-blockers**.
- **Reverse proxy** — sits in front of **servers**; clients think they're talking to one server; the proxy chooses the actual backend. Used for **TLS termination, caching, compression, WAF, hiding internals**.
- **Load balancer** — a **specialized reverse proxy** whose primary job is **distributing traffic across many backend instances** (round-robin, least-connections, hash, etc.). Almost every reverse proxy can also load-balance; load balancers are usually L4 (TCP) or L7 (HTTP).
- **API gateway** — a **reverse proxy + load balancer + auth + rate limiting + transformation + observability** dedicated to API traffic. Adds **per-route policy** (auth, quotas, schema validation) and **API-aware features** (gRPC, GraphQL, REST routing, request/response transformation).

In practice they overlap — modern tools like **NGINX, Envoy, HAProxy, Traefik** can play any of these roles depending on configuration. The conceptual distinction is **who they're serving** (clients vs servers), **what they decide** (single forward vs distribute across many), and **how much policy they apply** (raw forwarding vs full API governance).

## The four-quadrant picture

```text
                   FORWARD                                REVERSE
            ┌──────────────────────┐            ┌────────────────────────┐
SIMPLE      │   Forward Proxy      │            │   Reverse Proxy       │
FORWARD     │   (Squid, corporate  │            │   (NGINX, Apache)     │
            │    proxy, Tor exit)  │            │   - TLS termination   │
            │   - hides client     │            │   - cache              │
            │   - filters egress   │            │   - compression        │
            │   - anonymity        │            │   - hide internals     │
            └──────────────────────┘            └────────────────────────┘

                                                ┌────────────────────────┐
DISTRIBUTE                  (rare /             │   Load Balancer       │
ACROSS MANY                  egress             │   (HAProxy, ELB / NLB,│
                             load balancing)    │    NGINX upstream)    │
                                                │   L4: TCP, fast, opaque│
                                                │   L7: HTTP-aware,      │
                                                │       header routing   │
                                                └────────────────────────┘

                                                ┌────────────────────────┐
WITH FULL                                       │   API Gateway          │
POLICY                                          │   (Kong, AWS API GW,   │
                                                │    Apigee, Tyk)        │
                                                │   - auth (JWT, OAuth)  │
                                                │   - rate limit         │
                                                │   - schema validation  │
                                                │   - REST/GraphQL/gRPC  │
                                                │   - per-route policy   │
                                                │   - dev portal         │
                                                └────────────────────────┘
```

## Detailed comparison

| Aspect | Forward Proxy | Reverse Proxy | Load Balancer | API Gateway |
|---|---|---|---|---|
| **Sits in front of** | Clients | Servers | Servers | API services |
| **Who knows about it** | Clients (configured explicitly) | Nobody (transparent to clients) | Nobody (transparent) | Sometimes — clients may use the gateway URL |
| **Clients see destination?** | Yes (they pick) | No (gateway picks) | No | No |
| **Server sees client?** | No (sees proxy IP unless `X-Forwarded-For`) | Sees only proxy unless headers passed | Same | Same |
| **Primary job** | Outbound filtering / anonymity | Hide servers + add cross-cutting features | Distribute load | API-aware routing + policy |
| **Layer (OSI)** | Usually L7 (HTTP) | L4 / L7 | L4 (NLB) or L7 (ALB) | L7 (HTTP / gRPC / WebSocket) |
| **Stateful?** | Mostly stateless | Mostly stateless (unless caching) | L4: per-conn; L7: per-request | Per-request, with auth state cached |
| **Caches?** | Sometimes (corporate cache) | Yes (Varnish, NGINX) | Rarely | Sometimes |
| **TLS termination?** | Sometimes (MITM cert) | Yes (most common) | L4: passthrough / L7: terminate | Yes |
| **Auth?** | Maybe basic / NTLM | Optional | Rarely | Yes — JWT, OAuth, mTLS |
| **Rate limiting?** | Yes (per-user policy) | Optional | Optional | Yes — first-class feature |
| **Request transformation?** | Rarely | Sometimes | Rarely | Yes — headers, body, REST↔gRPC |
| **Per-route policy?** | No | Per-host / location | Per-listener | Per-route, per-method |
| **Health checking?** | No | Yes (active / passive) | Yes (core feature) | Yes |
| **Service discovery?** | Static | Static or DNS | Static or dynamic (consul, ECS) | Dynamic (often Kubernetes-native) |
| **Typical examples** | Squid, Tor, corporate egress, residential proxies, mitmproxy | NGINX (`proxy_pass`), Apache `mod_proxy`, Caddy, HAProxy | HAProxy, AWS ALB / NLB / GCLB, F5, NGINX `upstream`, Envoy | Kong, AWS API Gateway, Apigee, Tyk, Krakend, Envoy + Istio |

## Forward Proxy

**Where it sits:** between client and the wider internet. The client explicitly configures it.

```text
   Client (browser)  ──HTTP CONNECT──►  Forward Proxy  ──►  any.com
   knows it's using a proxy.            (Squid, mitmproxy)    server doesn't know
                                                              the original client's IP.
```

**Why use one:**
- **Corporate egress** — block social media, log all traffic, scan for malware (ZScaler, Squid).
- **Bypass geo-blocks / censorship** — Tor, VPNs, residential proxies for scraping.
- **Cache common downloads** — apt-cacher-ng for package mirrors.
- **Audit / inspect outbound** — DLP (data loss prevention).
- **Anonymity** — hide client IP from destination.
- **Mobile / IoT egress** — central exit point with policy.

**Reach for:** Squid (oldest), Tinyproxy, mitmproxy (debugging), 3proxy, Privoxy.

## Reverse Proxy

**Where it sits:** between clients and your servers. Clients only see the proxy.

```text
   Internet  ──►  Reverse Proxy  ──►  app1, app2, app3
                  (NGINX, Apache)     (your services)
                  - TLS termination
                  - compression
                  - cache static
                  - hide topology
```

**Why use one:**
- **Hide your topology** — clients see one URL; backend can be 50 services across 5 clusters.
- **TLS termination** — terminate HTTPS once at the proxy; backends speak plaintext HTTP internally.
- **Compression / caching** — gzip, Brotli, page cache for static assets.
- **Header rewriting** — strip / add headers, set `X-Forwarded-For`.
- **Single entry point for security** — WAF, rate limiting, DDoS scrubbing.
- **Path-based routing** — `/api → backend-api`, `/admin → backend-admin`, `/static → CDN`.
- **HTTP/2 + gRPC translation** — terminate HTTP/2 at proxy, talk HTTP/1.1 to legacy backends.

**Reach for:** NGINX, Apache `mod_proxy`, Caddy, HAProxy, Traefik, Envoy, Microsoft IIS.

## Load Balancer

**Where it sits:** in front of multiple backend replicas. Almost always a **specialized reverse proxy**.

```text
   Internet  ──►  Load Balancer  ──►  app-replica-1
                  (HAProxy, ALB)   ──►  app-replica-2
                  - round-robin    ──►  app-replica-3
                  - health checks
                  - sticky sessions
```

**L4 (transport) vs L7 (application):**
- **L4 (TCP / UDP)** — opaque; routes by source IP / port; doesn't peek into the payload. Lower latency. Used for raw TCP / UDP / TLS-passthrough. Examples: AWS NLB, HAProxy in TCP mode, Google Network LB, F5 BIG-IP.
- **L7 (HTTP / gRPC)** — parses HTTP; can route by path / host / header / cookie. Higher latency + cost; way more flexible. Examples: AWS ALB, NGINX, HAProxy in HTTP mode, Envoy, Google Cloud LB, Cloudflare LB.

**Algorithms:**
- **Round-robin** — simplest; doesn't account for backend load.
- **Least-connections** — pick the backend with fewest active connections.
- **Least-response-time** — combine load + latency.
- **Hash-based** (consistent hash) — stick `(client IP, session)` to the same backend; useful for caches / sticky sessions.
- **Weighted** — assign capacity weights for heterogeneous backends (canary deploys).
- **Random** — surprisingly effective with two-choice ("power of two random choices").
- **Geographic / latency-based** — global LBs route to nearest region (Cloudflare, GCLB, AWS Route 53 latency-based).

**Why use one:**
- **Distribute load** — primary job.
- **High availability** — failover when a backend dies (health checks).
- **Zero-downtime deploys** — drain a backend, deploy, re-add.
- **Autoscaling integration** — register / deregister replicas dynamically.
- **Geographic distribution** — global LBs route to nearest region.
- **Session affinity / sticky sessions** — for stateful backends.

**Reach for:** AWS ELB / ALB / NLB, Google Cloud LB, Cloudflare LB, HAProxy, NGINX, Envoy, Traefik, F5 BIG-IP (enterprise).

## API Gateway

**Where it sits:** in front of API microservices; **L7 reverse proxy + load balancer + auth + policy**.

```text
   Mobile / web client  ──►  API Gateway  ──►  user-service
                              (Kong, Apigee)  ──►  order-service
                              - JWT auth      ──►  product-service
                              - rate limit    ──►  payment-service
                              - quota
                              - schema validate
                              - REST / gRPC / GraphQL routing
                              - dev portal
                              - billing per request
```

**What an API gateway adds beyond a load balancer:**
- **Authentication / authorization** — JWT, OAuth, API key, mTLS, basic.
- **Rate limiting + quotas** — per-key, per-tier, per-route.
- **Request / response transformation** — REST ↔ gRPC, header injection, body rewriting, schema validation.
- **API composition** — single client request fans out to multiple backends + aggregates.
- **API versioning** — route `/v1/*` to old service, `/v2/*` to new.
- **Per-route policy** — different rate limits / auth on each endpoint.
- **Developer portal** — Swagger / OpenAPI docs, API key issuance, sandbox.
- **API analytics + monetization** — per-key billing, usage metrics, throttling tiers.
- **API-aware protocols** — first-class GraphQL, gRPC-web, WebSocket support.
- **Plugin ecosystem** — Kong's plugin model, Envoy filters, Apigee policies.

**Reach for:** Kong, AWS API Gateway, Apigee, Tyk, KrakenD, Gravitee, Mulesoft, Azure API Management, Envoy + Istio (in service-mesh deployments).

## When the lines blur

These boundaries are **conceptual**; the same software product often plays multiple roles:
- **NGINX** can be all four with different configs.
- **Envoy** is a reverse proxy + L7 LB; with Istio it's a sidecar service mesh; standalone it's an API gateway.
- **HAProxy** is a load balancer + reverse proxy.
- **AWS ALB** is a load balancer that does routing rules → almost an API gateway.
- **Cloudflare** is a CDN + reverse proxy + WAF + LB + API Shield (gateway features).
- **Traefik** is reverse proxy + LB + API GW with K8s-native configuration.
- **Service mesh sidecars** (Istio, Linkerd) put a tiny reverse proxy + LB next to every pod.

The **right way** to think: ask "**what conceptual role does this fill in the architecture?**" not "what's the box called?"

## Common pitfalls
- **Confusing forward vs reverse** — interviewers love this. Forward = client-side; reverse = server-side.
- **"We need an API gateway"** when a reverse proxy + a few NGINX rules would do — over-engineered.
- **L4 LB for HTTP-aware routing** — you can't route by URL path; need L7.
- **API gateway as a single point of failure** — must be HA + multi-AZ.
- **Putting business logic in the gateway** — drift; couple business logic to infra. Prefer gateway for cross-cutting concerns only.
- **Multiple gateways stacked** — gateway in front of gateway in front of LB → latency + complexity.
- **Forgetting to forward client IP** — `X-Forwarded-For` / `X-Real-IP`; otherwise backend logs / rate limits use proxy IP.
- **WebSocket / gRPC behavior** through proxies — needs explicit support; HTTP/1.1 proxies break HTTP/2.
- **TLS termination but no internal TLS** — encrypted at the edge, plaintext internally; OK in trusted networks, bad in zero-trust.
- **Sticky sessions on stateless backends** — defeats horizontal scale.
- **Caching at LB level** without proper cache keys / vary headers — serving wrong responses across users.

## Interview Cheat Sheet
- **Forward proxy:** sits in front of clients (corporate egress, Tor); clients know it.
- **Reverse proxy:** sits in front of servers (NGINX TLS termination); clients don't know.
- **Load balancer:** specialized reverse proxy that distributes load across N replicas (L4 = TCP, L7 = HTTP).
- **API gateway:** reverse proxy + LB + auth + rate limit + transformation + per-route policy for API traffic.
- **Real software is usually multiple of these** depending on configuration (NGINX, Envoy, HAProxy, Traefik).
- **L4 vs L7:** L4 is fast + opaque; L7 is HTTP-aware + flexible.
- **Algorithms:** round-robin, least-connections, hash (sticky), weighted, geographic.
- **Pair with:** [Caching](/docs/41-caching/caching-strategies) (CDN / reverse-proxy cache), [Rate Limiting](/docs/45-resilience-patterns/rate-limiting), [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker).
- **Key gotchas:** WebSocket / gRPC support, X-Forwarded-For, sticky sessions, mTLS, auth at gateway vs per-service.

## Related concepts
- [Rate Limiting](/docs/45-resilience-patterns/rate-limiting) — usually enforced at gateway / LB.
- [Circuit Breaker](/docs/45-resilience-patterns/circuit-breaker) — Envoy / Istio outlier detection.
- [Caching Strategies](/docs/41-caching/caching-strategies) — reverse-proxy cache layer.
- [Consistent Hashing](/docs/41-caching/consistent-hashing) — used for hash-based LB / cache routing.
- Concrete: [NGINX](/docs/16-load-balancing-and-proxies/nginx), [HAProxy](/docs/16-load-balancing-and-proxies/haproxy), [Envoy](/docs/16-load-balancing-and-proxies/envoy), [Kong](/docs/18-api-gateways/kong), [AWS API Gateway](/docs/18-api-gateways/aws-api-gateway), [CloudFront](/docs/17-cdn-and-edge/cloudfront), [Cloudflare](/docs/17-cdn-and-edge/cloudflare).
