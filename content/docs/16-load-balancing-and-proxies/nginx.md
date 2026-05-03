---
title: "NGINX"
description: "NGINX is the ubiquitous open-source web server, reverse proxy, and L7 load balancer — event-driven, low memory, the default front door for huge fractions of the internet."
---

> Category: Load Balancer / Reverse Proxy / Web Server · Written in: C · License: 2-clause BSD

## TL;DR
NGINX is a high-performance, event-driven HTTP server, reverse proxy, and L7 load balancer. It's the front door for a huge percentage of the internet — used as a web server, API gateway, TLS terminator, static-file server, caching proxy, and software load balancer. Reach for NGINX as the **default reverse proxy** in front of application servers (Node, Python, Java, Go); it has lower configurability ceiling than Envoy but is simpler, lighter, and operationally well-understood.

## What problem does it solve?
- **Apache's process-per-connection model** doesn't scale to tens of thousands of concurrent connections; NGINX uses an event loop (epoll/kqueue) instead — handles 10k+ connections per worker on commodity hardware.
- **TLS termination + HTTP/2 + HTTP/3** at the edge offloads complex protocol handling from app servers.
- **Fan-out to many upstreams** with health checks, weighted load balancing, hash-based session stickiness.
- **Caching of upstream responses** (built-in HTTP cache).
- **Rate limiting**, **request shaping**, **header rewrites**, **redirects**.
- **Static file serving** at near-disk-speed throughput.

## When to use
- **Reverse proxy** in front of Node / Python / Java / Go services.
- **TLS termination** + ACME / Let's Encrypt.
- **Static-asset serving** (combined with app dynamic routes).
- **L7 load balancing** across an upstream pool.
- **API gateway-lite** — basic routing, auth, rate limiting; for richer features use Kong / Envoy.
- **Ingress controller in Kubernetes** (`ingress-nginx`).

## When NOT to use
- **Layer 4 / TCP-only** at very high RPS — HAProxy is often more efficient at L4.
- **Service mesh** with mTLS / fine-grained traffic policy — Envoy / Istio fit better.
- **Dynamic, API-driven config at scale** — Envoy's xDS API beats NGINX reload semantics.
- **Heavy WebSocket / gRPC streaming** at scale — works, but Envoy has a stronger story.
- **You need plugins beyond the OSS module set** — many features (active health checks, JWT auth, dynamic upstreams) are NGINX Plus paid features (or use OpenResty / Lua).

## Architecture
- **Master process** + N **worker processes** (one per CPU typically).
- **Event-driven** workers using `epoll` (Linux) / `kqueue` (BSD).
- **Non-blocking** I/O throughout.
- **Shared memory** zones for shared state (rate limiters, upstreams, caches).
- **Modules** — compiled in (HTTP, stream, mail, third-party).
- **Reload** is graceful — old workers finish in-flight requests, new workers take new connections.

```nginx
# /etc/nginx/conf.d/api.conf
upstream api_backend {
    least_conn;
    server app1.internal:8080 max_fails=3 fail_timeout=10s;
    server app2.internal:8080;
    server app3.internal:8080;
    keepalive 64;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Rate limit zone
    limit_req_zone $binary_remote_addr zone=api_rl:10m rate=100r/s;

    location /api/ {
        limit_req zone=api_rl burst=200 nodelay;
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }

    location /static/ {
        root /var/www;
        expires 1d;
        add_header Cache-Control "public";
    }
}
```

## Load Balancing Algorithms
- **round-robin** (default)
- **least_conn** — to upstream with fewest active connections
- **ip_hash** — sticky by client IP
- **hash $variable consistent** — consistent hashing on any variable (URL, header)
- **random two-choice** — pick two random upstreams, choose the less loaded

## Health Checks
- **Passive** in OSS — failed requests count toward `max_fails`; upstream marked down for `fail_timeout`.
- **Active health checks** are **NGINX Plus** (paid) only — for OSS, use a sidecar (consul-template, custom controller) or upstream health from a service registry.

## Caching
- **HTTP cache** stores responses on disk + indexes in shared memory.
- **proxy_cache_lock** prevents thundering herd to upstream on cache miss.
- **stale-while-revalidate** via `proxy_cache_use_stale`.
- Microcaching (1-5 second TTL) on dynamic API responses can absorb huge traffic spikes cheaply.

## Trade-offs

| Strength | Weakness |
|---|---|
| Battle-tested, ubiquitous, fast | Active health checks + dynamic upstreams paywalled (NGINX Plus) |
| Low memory footprint per connection | Config reload semantics — graceful but file-based |
| Excellent static + caching + TLS combined | Less rich gRPC / mTLS story than Envoy |
| Simple config syntax for common cases | Lua/OpenResty needed for complex programmability |
| HTTP/2 + HTTP/3 (QUIC) supported | Limited observability hooks compared to Envoy |
| Massive ecosystem + tooling | No xDS-style dynamic API |

## Common HLD Patterns
- **Edge proxy:** TLS terminate → rate-limit → forward to upstream pool.
- **Static + dynamic split:** `/static/` served from disk; `/api/` proxied to backend.
- **Cache layer:** microcache 1-second TTL on `GET /products/...` → drops upstream RPS by 100x.
- **Blue-green / canary:** weighted upstreams; shift traffic by adjusting weights and reloading.
- **Kubernetes ingress:** `ingress-nginx` controller maps `Ingress` resources → NGINX config → routes to Services.
- **Geo-routing:** GeoIP module routes by client country / region.

## Common Pitfalls / Gotchas
- **Worker process count** — default `auto` matches CPU; can mistune in containers if cgroup limits aren't visible.
- **`proxy_buffering`** — large response buffering can OOM; tune `proxy_buffers` carefully.
- **`keepalive` to upstream** — must set `proxy_http_version 1.1` and clear `Connection` header to actually reuse upstream connections.
- **`X-Forwarded-For` trust** — trust proxy headers only from known proxies; `real_ip_module` and `set_real_ip_from`.
- **Config reload races** — old + new workers run during reload; long-running connections delay full cutover.
- **TLS session tickets** — without rotation, forward secrecy is weakened.
- **Slow loris / large bodies** — set `client_body_timeout` and `client_max_body_size` deliberately.
- **Rate-limit shared zone size** — too small zones evict counters under attack; size for your QPS.

## Interview Cheat Sheet
- **Tagline:** Event-driven C web server / reverse proxy / L7 load balancer; the default front door of the internet.
- **Best at:** reverse proxying app servers, TLS termination, static-file serving, caching, simple L7 LB + rate limiting.
- **Worst at:** dynamic-API config (xDS), service-mesh-style fine-grained policy, advanced active health checks (paid).
- **Scale:** tens of thousands of connections per worker on commodity hardware; bandwidth-bound at multi-Gbps.
- **Distributes how:** worker processes × CPUs; shared-memory zones for state; reload is graceful.
- **Consistency / state:** stateless data plane; session stickiness via ip_hash or consistent hash.
- **Killer alternative:** HAProxy (better at L4 / extreme TCP), Envoy (dynamic API, mesh), Caddy (auto-HTTPS).

## Further Reading
- Official docs: <https://nginx.org/en/docs/>
- Configuration cookbook: <https://docs.nginx.com/nginx/admin-guide/>
- ingress-nginx (K8s): <https://kubernetes.github.io/ingress-nginx/>
- OpenResty (NGINX + Lua): <https://openresty.org/>
