---
title: "Kong"
description: "Kong is the open-source API gateway built on NGINX/OpenResty — pluggable architecture, declarative config, GitOps-friendly, with a Kubernetes Ingress Controller and Konnect SaaS control plane."
---

> Category: API Gateway · Written in: Lua (on top of NGINX / OpenResty) · License: Apache 2.0 (Gateway OSS)

## TL;DR
Kong is one of the most popular open-source API gateways. It runs as **NGINX + OpenResty + a Lua plugin runtime**, fronting your APIs with a pluggable pipeline of **authentication** (key-auth, JWT, OAuth2, OIDC), **rate limiting**, **transformations**, **observability**, and **traffic management**. Reach for Kong when you want a production-grade API gateway you can self-host, with declarative config, a healthy plugin ecosystem, and a Kubernetes-native ingress story.

## What problem does it solve?
Microservices need a **single entry point** for cross-cutting concerns:
- **Authentication / authorization** without re-implementing in every service.
- **Rate limiting / quotas** per consumer / API key / IP.
- **Request / response transformations** (header / body / protocol).
- **Routing & versioning** — `/v1/*` → users-v1; `/v2/*` → users-v2.
- **Observability** — uniform logs / metrics / traces.
- **Resilience** — retries, circuit breaking, health checks.
- **Developer portal** — discoverable API catalog with docs and self-service.

Kong centralizes these into one declarative configuration and a uniform runtime.

## When to use
- **Public + internal APIs** — central gateway for auth, rate limiting, observability.
- **Kubernetes** — KIC (Kong Ingress Controller) maps `Ingress` / `KongPlugin` CRDs to live config.
- **Multi-region API surface** with per-region clusters fed from a shared control plane.
- **Plugin-driven customization** — write Lua / Go / WASM plugins for special logic.
- **API monetization / developer portal** — when you want a packaged solution.

## When NOT to use
- **Tiny single service** — NGINX or built-in framework auth is enough.
- **Heavy mesh / east-west traffic** — Envoy / Istio fit better; Kong Mesh exists but the OSS sidecar story is less mature than Envoy/Istio.
- **You need bleeding-edge HTTP/3 / gRPC features** — Envoy is ahead.
- **You're committed to a managed cloud-native gateway** (AWS API Gateway, Apigee, Azure APIM) and don't need self-hosting.

## Architecture
- **Data plane** — NGINX + OpenResty (Lua) workers running plugins on each request.
- **Control plane** — REST/Admin API + DB (Postgres) or **DB-less** (declarative YAML reconciled).
- **Hybrid mode** — control plane in HQ; data plane nodes pull config; resilient to control-plane outages.
- **Plugins** — Lua, Go, JavaScript, or WASM; ordered execution per request.
- **Konnect** — Kong's SaaS control plane / observability / dev portal (commercial).

```yaml
# Declarative DB-less config (deck or YAML reconcile)
_format_version: "3.0"
services:
- name: users-service
  url: http://users.internal:8080
  routes:
  - name: users-v1
    paths: [/v1/users]
    methods: [GET, POST]
    strip_path: true
  plugins:
  - name: rate-limiting
    config: { minute: 1000, policy: redis, redis_host: redis.internal }
  - name: jwt
  - name: prometheus
  - name: correlation-id
    config: { header_name: X-Request-Id }

consumers:
- username: web-app
  jwt_secrets:
  - key: web-app-key
    algorithm: HS256
    secret: ${{ env.WEB_APP_SECRET }}
```

## Plugin Categories
- **Authentication:** key-auth, JWT, OAuth2, OIDC, basic-auth, mTLS, LDAP.
- **Security:** ACL, IP restriction, bot detection, CORS, request size limit.
- **Traffic control:** rate-limit, request-termination, request-size, response-rate-limiting.
- **Transformations:** request/response transformer, JQ, Lua-based custom.
- **Logging / observability:** Prometheus, OpenTelemetry, Datadog, file/UDP/TCP/HTTP log.
- **Serverless:** AWS Lambda invocation, Azure Functions, OpenWhisk.

## Trade-offs

| Strength | Weakness |
|---|---|
| Mature OSS API gateway with rich plugin set | Built on NGINX/OpenResty; complex config debugging |
| Declarative + GitOps friendly via decK | Some advanced features paywalled to Konnect Enterprise |
| Kubernetes Ingress Controller + CRDs | Lua plugin authoring has a learning curve |
| Hybrid control / data plane works across regions | Heavier than minimalist gateways for tiny use cases |
| Postgres or DB-less mode | Performance below raw Envoy / NGINX for similar workloads |
| Active community, large plugin marketplace | Plugin compatibility across Kong versions can break |

## Common HLD Patterns
- **API edge:** Kong terminates TLS → JWT auth → rate-limit per consumer → forwards to internal services.
- **Per-consumer quotas:** Redis-backed rate-limit plugin shares counters across Kong cluster nodes.
- **Multi-region active-active:** hybrid mode — control plane in one region, data plane fleets per region read-only-pulled.
- **Versioned API:** path-based or header-based routes split traffic between v1 and v2; canary plugins shift gradually.
- **Serverless aggregation:** Kong fronts AWS Lambda functions as if they were HTTP services; transforms in/out.
- **Dev portal + monetization:** publish APIs with quotas, provision keys, charge per call.

## Common Pitfalls / Gotchas
- **Plugin ordering** — execution order matters (auth before rate-limit before transformation); read priorities.
- **Postgres bottleneck** — Kong < 3.x heavy on Postgres; for huge data planes use Redis cache or hybrid DB-less.
- **Hot-reload semantics** — config sync from control plane has a few-second delay; don't depend on instant.
- **Lua memory leaks** — buggy custom plugins can leak; sandbox / monitor closely.
- **Rate-limit policy choice** — `local` is fast but per-node; `redis` or `cluster` for accurate global counts.
- **TLS / SNI gotchas** — multiple certs, wildcard handling needs careful certificate management.
- **Upgrades** — major version migrations require config schema migrations; test in staging.
- **OSS vs Enterprise gaps** — many advanced features (advanced auth, RBAC, GUI, dev portal full) are paid.

## Interview Cheat Sheet
- **Tagline:** OSS API gateway built on NGINX + OpenResty with rich plugin pipeline; first-class Kubernetes ingress.
- **Best at:** centralized API auth/rate-limit/observability, Kubernetes ingress, plugin-driven customization, hybrid multi-region data planes.
- **Worst at:** heavy mesh / east-west, bleeding-edge protocol support (Envoy ahead), tiny single-service stacks.
- **Scale:** thousands of services, hundreds of thousands of routes per cluster; data plane scales horizontally.
- **Distributes how:** stateless data plane nodes; Postgres or DB-less control plane; Redis/cluster for shared counters.
- **Consistency / state:** stateless gateway; rate-limit / consumer counters in Postgres or Redis; eventual config sync.
- **Killer alternative:** Envoy + Gloo / Contour / Emissary, Tyk, AWS API Gateway, Azure API Management, Apigee, Traefik.

## Further Reading
- Official docs: <https://docs.konghq.com/gateway/latest/>
- Kong Ingress Controller: <https://docs.konghq.com/kubernetes-ingress-controller/latest/>
- Plugin hub: <https://docs.konghq.com/hub/>
- Hybrid mode: <https://docs.konghq.com/gateway/latest/production/deployment-topologies/hybrid-mode/>
