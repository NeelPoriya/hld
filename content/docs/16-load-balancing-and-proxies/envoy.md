---
title: "Envoy"
description: "Envoy is the modern L7 proxy / service mesh data plane — dynamic xDS config, first-class gRPC/HTTP2/HTTP3, the engine inside Istio, AWS App Mesh, Google Cloud Service Mesh, and many API gateways."
---

> Category: Load Balancer / Service Mesh Proxy · Written in: C++ · License: Apache 2.0

## TL;DR
Envoy is a high-performance L7 proxy designed at Lyft for microservices. It's the **data plane** behind most modern service meshes (Istio, Consul Connect, AWS App Mesh, Google Cloud Service Mesh) and many API gateways (Contour, Emissary, Gloo). Distinguishing features: **xDS dynamic configuration API** (so a control plane can push config without reload), **first-class HTTP/2 / gRPC / HTTP/3**, **rich observability** (stats / tracing / access logs by default), and **pluggable filter chains** for everything from auth to traffic shadowing. Reach for Envoy when building a service mesh, when you need dynamic API-driven config, or when gRPC / mTLS / advanced traffic management matter.

## What problem does it solve?
- **Microservice traffic** is heavy on east-west calls, gRPC, mTLS, retries, circuit breaking — NGINX/HAProxy weren't built for this dialect first.
- **Static config reloads** don't scale to thousands of services / pods churning every minute — Envoy's xDS streams config from a control plane.
- **Observability gaps** — traditional proxies emit basic logs; Envoy emits dimensional Prometheus metrics + distributed tracing context out of the box.
- **Protocol gymnastics** — Envoy upgrades / downgrades between HTTP/1.1, HTTP/2, HTTP/3, gRPC, gRPC-Web seamlessly.
- **Resilience patterns** — circuit breakers, outlier detection, retry policies, timeouts, rate limiting, ext_authz — all first-class filters.

## When to use
- **Service mesh** (Istio, Consul Connect, App Mesh, Linkerd-with-Envoy variants).
- **API gateway** with rich routing, transforms, auth, mTLS (Contour, Emissary, Gloo, Tyk-on-Envoy).
- **Edge proxy** terminating mTLS / OAuth / JWT and forwarding to internal services.
- **gRPC-heavy** environments — gRPC streaming, gRPC-Web bridging, transcoding gRPC ↔ HTTP/JSON.
- **You need dynamic config** updated by a control plane (xDS).
- **Multi-cluster traffic** with sophisticated routing, mirroring, fault injection.

## When NOT to use
- **Tiny static sites** — overkill; NGINX is simpler.
- **One-off TCP load balancer** — HAProxy is leaner.
- **Team without ops bandwidth** for control-plane software — running Istio + Envoy is non-trivial.
- **Memory budget is tight** — Envoy uses more RAM per instance than NGINX/HAProxy.

## Architecture
- **Listeners** — bind to ports; configure filter chains.
- **Filter chains** — ordered chains of network filters (TCP) and HTTP filters (L7).
- **Clusters** — upstream service definitions (endpoints, load-balancing policy, health checks).
- **Routes** — match request → cluster mapping with rich predicates.
- **xDS APIs** — Listener Discovery (LDS), Route Discovery (RDS), Cluster Discovery (CDS), Endpoint Discovery (EDS), Secret Discovery (SDS); streamed from a control plane (Istio Pilot, Gloo, custom).
- **Threading** — one main thread + N worker threads; lock-free hot path.

```yaml
# Static bootstrap (real deployments use xDS for dynamic updates)
static_resources:
  listeners:
  - address: { socket_address: { address: 0.0.0.0, port_value: 443 } }
    filter_chains:
    - filters:
      - name: envoy.filters.network.http_connection_manager
        typed_config:
          "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
          stat_prefix: ingress_http
          codec_type: AUTO
          route_config:
            name: api_routes
            virtual_hosts:
            - name: api_vhost
              domains: ["api.example.com"]
              routes:
              - match: { prefix: "/v1/users" }
                route:
                  cluster: users_service
                  timeout: 5s
                  retry_policy:
                    retry_on: 5xx,reset,connect-failure
                    num_retries: 3
                    per_try_timeout: 1s
          http_filters:
          - name: envoy.filters.http.jwt_authn
          - name: envoy.filters.http.ext_authz
          - name: envoy.filters.http.router

  clusters:
  - name: users_service
    type: STRICT_DNS
    connect_timeout: 1s
    lb_policy: LEAST_REQUEST
    health_checks:
    - timeout: 1s
      interval: 5s
      http_health_check: { path: "/healthz" }
    load_assignment:
      cluster_name: users_service
      endpoints:
      - lb_endpoints:
        - endpoint: { address: { socket_address: { address: users.svc, port_value: 8080 } } }
```

## Load Balancing Policies
- ROUND_ROBIN, LEAST_REQUEST (with N power-of-two-choices), RANDOM
- RING_HASH, MAGLEV — consistent hashing variants
- ORIGINAL_DST — preserve client-chosen destination (used by mesh sidecars)
- CLUSTER_PROVIDED — let load balancer plugin decide

## Resilience Filters
- **Circuit breaker** — limits on connections / pending requests / retries / requests-per-conn.
- **Outlier detection** — eject upstream endpoints that misbehave (consecutive 5xx, slow, etc.).
- **Retries** with backoff, jitter, retriable status codes.
- **Timeouts** — per route + per-try.
- **Fault injection** — inject delays / aborts for chaos testing.
- **Rate limiting** — local + global (gRPC service).

## Observability
- **Stats** — every filter / cluster / listener emits Prometheus-compatible counters / histograms.
- **Access logs** — gRPC streaming or file, customizable formats.
- **Tracing** — OpenTelemetry / Zipkin / Jaeger / Datadog auto-propagated.
- **Admin endpoint** — `/stats`, `/clusters`, `/config_dump`, `/listeners`.

## Trade-offs

| Strength | Weakness |
|---|---|
| First-class HTTP/2, gRPC, HTTP/3, mTLS | Higher memory + CPU floor than NGINX/HAProxy |
| xDS dynamic API — config without reload | Steep config + ops learning curve |
| Rich filter ecosystem (auth, RBAC, JWT, ext_authz) | Often used inside a control plane (Istio); using Envoy raw is non-trivial |
| Dimensional Prometheus stats out of the box | Static config files are verbose YAML/JSON |
| Designed for service mesh from day one | Operational tooling (kubectl, istioctl) often required |
| Battle-tested at Lyft, Stripe, Square, Google | Some advanced features are control-plane-specific |

## Common HLD Patterns
- **Sidecar mesh:** Envoy sidecar in every pod intercepts traffic; control plane (Istio Pilot) pushes routing/policy via xDS.
- **API gateway:** edge Envoy terminates TLS / JWT / OAuth → routes to internal services; works with Contour / Emissary / Gloo control planes.
- **gRPC ↔ JSON transcoding:** Envoy filter exposes gRPC services to REST clients.
- **Traffic shifting / canary:** weight-based routing across `v1` and `v2` clusters; tune by manipulating route weights.
- **Mirror / shadow traffic:** copy production requests to a staging cluster for testing without affecting users.
- **Outlier-driven failover:** hot-eject misbehaving upstream replicas based on consecutive 5xx; great for partial failures.

## Common Pitfalls / Gotchas
- **Config dump is huge** — dump via `/config_dump`; learn to read it for debugging.
- **xDS naming conventions** — listeners, routes, clusters reference each other by name; mistakes silently 404.
- **HTTP/2 max-concurrent-streams** — too low chokes throughput; too high allows DoS.
- **Retry storms** — retries + circuit breaker without backoff/budget can amplify upstream pressure during partial failure.
- **Connection draining** — graceful drain depends on `drain_timeout` and clients honoring `Connection: close`.
- **Ext_authz call cost** — every request hitting an external auth service is a hot path; cache decisions where safe.
- **Stats cardinality explosion** — high-cardinality labels (per-customer / per-path) blow up Prometheus.
- **Memory ceiling per worker** — large filter chains × many endpoints × many TLS sessions add up; size pods accordingly.

## Interview Cheat Sheet
- **Tagline:** Modern C++ L7 proxy + data plane for service meshes; dynamic xDS config, first-class gRPC/HTTP2/HTTP3, rich filters.
- **Best at:** service mesh sidecars, API gateways, gRPC environments, dynamic-config / control-plane scenarios, deep observability needs.
- **Worst at:** simple static-file edge proxy (NGINX), bare-metal TCP LB at extreme RPS (HAProxy), low-resource environments.
- **Scale:** Lyft / Google / Stripe scale; thousands of pods × millions of RPS in production meshes.
- **Distributes how:** main thread + worker threads with shared listeners; lock-free hot path; xDS streaming from control plane.
- **Consistency / state:** stateless data plane; control plane reconciles desired state to all data planes.
- **Killer alternative:** NGINX (simpler edge), HAProxy (TCP-heavy), Linkerd (Rust mesh, simpler), AWS App Mesh / Istio (managed control plane).

## Further Reading
- Official docs: <https://www.envoyproxy.io/docs/envoy/latest/>
- xDS API overview: <https://www.envoyproxy.io/docs/envoy/latest/api-docs/xds_protocol>
- Architecture overview: <https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/intro/intro>
- Istio (most common control plane): <https://istio.io/latest/docs/>
