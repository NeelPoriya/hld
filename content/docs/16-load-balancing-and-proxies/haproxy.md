---
title: "HAProxy"
description: "HAProxy is the high-performance L4/L7 load balancer of choice when raw throughput, low latency, and rock-solid TCP balancing matter — used by GitHub, Stack Overflow, Reddit, and Instagram."
---

> Category: Load Balancer / Reverse Proxy · Written in: C · License: GPL v2

## TL;DR
HAProxy (High Availability Proxy) is a battle-tested **L4 (TCP) and L7 (HTTP)** load balancer with one of the best raw-performance profiles in the industry. It pioneered many advanced load-balancing features (consistent hashing, ACL-based routing, stick tables, sophisticated health checks). Reach for HAProxy when you need a **rock-solid LB with deep observability and rich health checking** — especially for **TCP-level balancing** (databases, MQTT, gRPC over h2c) where NGINX OSS is weaker, and you want pure OSS without paywalls for active health checks.

## What problem does it solve?
- **High-throughput L4/L7 load balancing** with sub-millisecond overhead.
- **Active health checks** — first-class in OSS HAProxy (paywalled in NGINX OSS).
- **TCP / non-HTTP protocol balancing** — MySQL, Postgres, Redis, MQTT, custom binary protocols.
- **Sticky sessions** via stick tables (cookie / IP / header / arbitrary key).
- **Connection draining** — slow shutdown of upstream nodes for zero-downtime deploys.
- **Detailed real-time stats** + Prometheus exporter.

## When to use
- **TCP load balancing** (databases, brokers, custom protocols).
- **L7 with rich routing** by header / path / SNI / cookie.
- **High-RPS edge** where you want max throughput, low latency, low CPU per request.
- **Active health checks** + automatic failover are critical.
- **Multi-tier failover** (blue-green, primary/secondary upstream pools).
- **You want full feature set without paid tier** (HAProxy Enterprise has extras but core is OSS).

## When NOT to use
- **Static-file serving + dynamic mix** — NGINX is more natural.
- **Service mesh / xDS** — Envoy is built for it.
- **Heavy gRPC / Web sockets at scale with mTLS** — Envoy has stronger story.
- **Ad-hoc HTTP API gateway** with auth/transforms — Kong / Envoy give more out-of-the-box.

## Architecture
- **Single multi-threaded process** (or single-threaded per process pre-2.0) using `epoll` / `kqueue`.
- **Threads share state** via lock-free / lock-minimized data structures.
- **Stick tables** — shared in-memory key/value with optional replication (peers).
- **Frontends** define listeners; **backends** define upstream pools; **ACLs** route between them.
- **Runtime API** (`/var/run/haproxy.sock`) for live updates without reload.

```text
# /etc/haproxy/haproxy.cfg
global
    maxconn 200000
    log /dev/log local0
    nbthread 8

defaults
    mode http
    timeout connect 5s
    timeout client  30s
    timeout server  30s
    option httplog
    option dontlognull

frontend fe_https
    bind *:443 ssl crt /etc/haproxy/certs/fullchain.pem alpn h2,http/1.1
    bind *:80
    http-request redirect scheme https unless { ssl_fc }

    acl is_api  path_beg /api/
    acl is_auth path_beg /auth/

    use_backend be_auth if is_auth
    use_backend be_api  if is_api
    default_backend     be_web

backend be_api
    balance leastconn
    option httpchk GET /healthz
    http-check expect status 200
    server api1 10.0.1.10:8080 check inter 2s rise 2 fall 3
    server api2 10.0.1.11:8080 check
    server api3 10.0.1.12:8080 check

backend be_db_tcp
    mode tcp
    balance roundrobin
    option tcp-check
    server db1 10.0.2.10:5432 check
    server db2 10.0.2.11:5432 check backup   # warm standby
```

## Load Balancing Algorithms
- `roundrobin`, `static-rr`
- `leastconn` — fewest active connections
- `first` — first server with capacity
- `source` — sticky by source IP
- `uri`, `url_param`, `hdr(<name>)` — hash-based
- **Consistent hashing** via `hash-type consistent` — minimizes redistribution on server add/remove.

## Health Checks
- **Active TCP** check — connect, optionally banner-match.
- **Active HTTP** check — `option httpchk` with status / body checks.
- **L7 protocol checks** — MySQL, Postgres, Redis, SMTP, LDAP, SSL, custom.
- **Agent checks** — upstream agent reports load → HAProxy adjusts weight.
- Configurable inter (interval), rise (consecutive successes), fall (consecutive failures).

## Stick Tables & Sessions
- In-memory tables keyed by IP / cookie / header / arbitrary expression.
- Track rates (`http_req_rate(10s)`), counts, server affinity, custom counters.
- **Peers protocol** — replicate stick tables across HAProxy instances for HA + shared state.
- Used for: sticky sessions, rate limiting, abuse detection, dedup, feature flags.

## Trade-offs

| Strength | Weakness |
|---|---|
| Best-in-class L4 + L7 in single tool | Config syntax is dense; learning curve |
| Active health checks in OSS | No native API gateway / auth plugin ecosystem |
| Stick tables enable rich rate-limiting / stickiness | Less natural for static file serving than NGINX |
| Excellent observability (stats, Prom, logs) | gRPC / HTTP/3 are newer additions; Envoy ahead on h2/h3 polish |
| Reload-less runtime API for live config | No xDS-style dynamic config feed |
| Stable: 20+ years, no surprises | Multi-thread but historically multi-process; thread-safety quirks in old configs |

## Common HLD Patterns
- **DB load balancer:** HAProxy in front of Postgres/MySQL primary + replicas; route writes to primary, reads to replicas; auto-failover via `check`.
- **Active-passive primary:** primary backend + `backup` server for hot standby.
- **Per-tenant rate limiting:** stick table keyed by tenant header; deny over rate.
- **TLS termination + h2c upstream:** terminate HTTPS at HAProxy, speak h2c to upstreams.
- **Blue-green deployment:** ACL on cookie / header switches between blue and green backends; flip default with one config change.
- **TCP MQTT / Redis fanout:** L4 mode; SNI routing for multi-tenant.

## Common Pitfalls / Gotchas
- **`maxconn` tuning** — global vs per-frontend vs per-backend; mismatched values silently cap throughput.
- **TCP keepalive** — without `option tcpka`, idle long-lived connections may die behind NAT.
- **Cookie injection vs IP stickiness** — IP stickiness breaks behind shared NATs / mobile carriers; prefer cookie or stick-table on session ID.
- **TLS handshake CPU cost** — TLS-heavy edge needs enough cores or session tickets.
- **`option redispatch`** — ensure failed requests retry on a healthy server.
- **Reload vs runtime API** — full reload starts a new process briefly; for true zero-downtime in heavy traffic prefer runtime updates (Data Plane API or socket commands).
- **Stick table sizing** — too small evicts entries; too large wastes RAM.
- **Logging cost** — synchronous syslog can become a bottleneck; use UDP or buffer to a sidecar.

## Interview Cheat Sheet
- **Tagline:** Battle-tested high-throughput L4/L7 load balancer with stick tables, active health checks, and elite observability.
- **Best at:** TCP/L4 balancing of any protocol, advanced L7 routing + sticky sessions, DB / broker fronting, rate limiting at edge.
- **Worst at:** static file + dynamic web mix (NGINX), service mesh / xDS (Envoy), API gateway feature ecosystem (Kong / Envoy).
- **Scale:** millions of concurrent connections per box; sub-millisecond per-request overhead.
- **Distributes how:** multi-threaded single process; stick tables shared via peers; runtime API for live config updates.
- **Consistency / state:** stateless data plane; stick tables for session affinity / counters; peers replicate state across instances.
- **Killer alternative:** NGINX (web + LB combined), Envoy (mesh + xDS), AWS ALB / NLB (managed).

## Further Reading
- Official docs: <https://docs.haproxy.org/>
- Configuration manual: <https://docs.haproxy.org/2.9/configuration.html>
- Stick tables guide: <https://www.haproxy.com/blog/introduction-to-haproxy-stick-tables>
- Data Plane API: <https://www.haproxy.com/documentation/dataplaneapi/>
