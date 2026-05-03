---
title: "Varnish Cache"
description: "Varnish is the high-performance HTTP reverse-proxy cache — VCL-programmable, RAM-resident, the classic accelerator in front of news sites, e-commerce, APIs, and CMS-driven traffic."
---

> Category: HTTP Caching / Reverse Proxy · Written in: C · License: 2-clause BSD

## TL;DR
Varnish Cache is a **purpose-built HTTP reverse-proxy cache** designed to sit between clients and origin web servers and serve cacheable responses straight from RAM in microseconds. Its killer feature is **VCL (Varnish Configuration Language)** — a domain-specific language that turns the request/response pipeline into a programmable state machine. Reach for Varnish when you want serious caching of dynamic HTTP content (news, e-commerce product pages, CMS, APIs) on a single fleet of boxes — far more programmable than NGINX's HTTP cache, more lightweight than a full CDN.

## What problem does it solve?
- **Origin overload** — a single Varnish box can serve hundreds of thousands of req/s of cacheable content from RAM, freeing origins to do real work.
- **Microsecond cache hits** — VCL + workspace allocator + sendfile/splice for near-zero overhead.
- **Programmable cache logic** — normalize cache keys, strip cookies, rewrite URLs, do A/B routing, ESI compose, geo-route — all in VCL.
- **Stale-while-revalidate / grace mode** — keep serving slightly-stale content during origin failures.
- **Edge for non-CDN edges** — when full CDN isn't an option (on-prem, regulated, behind VPN), Varnish is the local equivalent.

## When to use
- **Read-heavy HTTP workloads** with cacheable responses (CMS, news, product catalogs, RSS, public APIs).
- **Origin protection** in front of slow / expensive origins.
- **Custom cache logic** that NGINX OSS can't express cleanly.
- **Self-hosted edge tier** (no Cloudflare/CloudFront).
- **ESI (Edge Side Includes)** to compose a page from cached fragments + a tiny dynamic per-user piece.

## When NOT to use
- **Mostly-uncacheable APIs** with per-user state — caching gives little benefit; an API gateway or service mesh fits better.
- **TLS-terminating edge** as a first-class — Varnish OSS doesn't do TLS; pair with hitch / NGINX / HAProxy in front (Varnish Enterprise has TLS).
- **Massive globally distributed traffic** — use a real CDN (CloudFront / Cloudflare / Fastly) instead of self-hosted Varnish at the edge.
- **WebSocket / streaming** workloads — pass-through, no caching benefit.

## Data Model & Cache
- **Hash key** — Varnish hashes URL + Host (default) into a cache lookup; VCL can change the key.
- **Object** — cached HTTP response with TTL + grace + keep windows.
- **Storage backends** — `malloc` (RAM), `file` (mmap'd file), `persistent` (deprecated), MSE (Massive Storage Engine, Enterprise).
- **States in the FSM** — `vcl_recv` → `vcl_hash` → `vcl_hit`/`vcl_miss` → `vcl_backend_*` → `vcl_deliver` → `vcl_log`.

```text
# /etc/varnish/default.vcl
vcl 4.1;

backend origin {
    .host = "app.internal";
    .port = "8080";
    .probe = {
        .url = "/healthz";
        .interval = 5s;
        .timeout = 2s;
        .window = 5; .threshold = 3;
    }
}

sub vcl_recv {
    # Don't cache POST / PUT / DELETE
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }

    # Strip tracking cookies; keep session cookie only when needed
    if (req.url ~ "^/(static|images|css|js)/") {
        unset req.http.Cookie;
    }

    # Bypass cache for logged-in users
    if (req.http.Cookie ~ "session=") {
        return (pass);
    }
}

sub vcl_backend_response {
    # Default 5 min cache; honor origin Cache-Control if shorter
    set beresp.ttl = 5m;
    set beresp.grace = 24h;          # serve stale up to 24h if origin is dead
    set beresp.keep  = 7d;           # keep for conditional revalidation
}

sub vcl_deliver {
    set resp.http.X-Cache = obj.hits > 0 ? "HIT" : "MISS";
}
```

## Architecture
- **Single multi-threaded worker process** (`varnishd`) pinned to CPUs; each worker handles many connections.
- **Workspace allocator** — per-request memory arena; near-zero malloc cost.
- **VCL → C → shared object** — VCL is compiled to C, then to a `.so` loaded into varnishd; fast.
- **Shared memory log (VSL)** — Varnish writes structured logs to shared memory; `varnishlog`, `varnishncsa`, `varnishstat` read it.
- **VMODs** — Varnish modules add functionality (digest, header, std, edgestash, …).

## Cache Behaviors
- **TTL / grace / keep** — three windows.
  - TTL = fresh; serve from cache.
  - Grace = stale-while-revalidate; serve stale while async fetching.
  - Keep = conditional GET window (`If-Modified-Since`, `ETag`).
- **Hit-for-pass / hit-for-miss** — explicit no-cache markers without re-fetching.
- **Banning** — pattern-based invalidation across the cache (`varnishadm ban "req.url ~ ^/products/"`).
- **PURGE** — single-key invalidation method.
- **Stale-on-error** — keep serving during origin outages.

## Trade-offs

| Strength | Weakness |
|---|---|
| Microsecond cache hits, programmable via VCL | OSS Varnish doesn't terminate TLS — pair with hitch/HAProxy |
| Grace mode + keep window for resilience | VCL is a learned skill; no auth/transform plugins like Kong |
| ESI for per-user dynamic edges | Single-machine cache (no clustering OSS); use replication/load balancer for scale |
| Powerful banning/purge invalidation | Persistent cache is RAM-first; restarts lose hot cache (file backing helps) |
| Shared-memory logs decouple log writers | Limited HTTP/2 OSS support; HTTP/3 not native |
| Used by NYT, Wikimedia, BBC, Etsy | Some advanced features (MSE, TLS, dashboarding) are Enterprise |

## Common HLD Patterns
- **CMS / news front-end:** TLS terminator (hitch / NGINX) → Varnish → app servers; >95% hit rate possible.
- **Microcaching:** 1-5 second TTL on dynamic API responses to absorb traffic spikes.
- **ESI composition:** cache the page shell + per-block fragments; a `<esi:include src="/header"/>` tag is fetched and assembled at edge.
- **Origin shield:** Varnish in front of a CDN's origin to deduplicate misses across PoPs.
- **Banning on event:** when a product is updated, app issues `BAN req.url ~ /products/123`; clears all variants without restart.
- **A/B routing in VCL:** hash on cookie, choose between blue/green backends.

## Common Pitfalls / Gotchas
- **Cookies kill caching** — most CMS pages set cookies; strip them (or normalize) before `vcl_hash` or you'll have ~0% hit rate.
- **Vary header explosion** — `Vary: User-Agent` creates a cached object per UA; collapse to a few classes.
- **TLS in OSS** — must be terminated upstream (hitch, NGINX) and re-encrypted to backend separately.
- **Grace+keep semantics** — if `grace` is shorter than your origin fetch time, you'll serve errors during outage.
- **VCL reload** — uses VCL versioning; old VCL keeps active connections; new takes over for new requests.
- **Persistent storage gotchas** — `file` backend uses OS page cache; cold starts are slow.
- **Ban list growth** — banned-but-not-yet-cleared objects use memory; tune `ban_lurker_sleep` to prune.
- **OOM** — single-tenant box; size `malloc` storage well under available RAM, leaving room for workspace.

## Interview Cheat Sheet
- **Tagline:** Programmable HTTP reverse-proxy cache; VCL turns the request pipeline into a state machine; microsecond hits.
- **Best at:** read-heavy HTTP caching of dynamic content (CMS, news, e-commerce), microcaching, ESI composition, custom cache logic.
- **Worst at:** TLS termination (OSS), uncacheable APIs, multi-machine cache clustering, full-CDN globally distributed delivery.
- **Scale:** 100k+ req/s per box from RAM; bandwidth-bound at multi-Gbps NICs.
- **Distributes how:** single-process multi-threaded; horizontal scale via load balancer + multiple Varnish boxes.
- **Consistency / state:** TTL-based; grace + keep + ban for invalidation; banning is global per box.
- **Killer alternative:** NGINX cache (simpler, less programmable), Squid (older), Cloudflare / CloudFront / Fastly (hosted CDNs), Apache Traffic Server.

## Further Reading
- Official docs: <https://varnish-cache.org/docs/>
- VCL reference: <https://varnish-cache.org/docs/trunk/users-guide/vcl.html>
- Best practices: <https://varnish-cache.org/docs/trunk/users-guide/index.html>
- Wikimedia Varnish architecture: <https://wikitech.wikimedia.org/wiki/Caching_overview>
